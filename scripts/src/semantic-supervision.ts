/**
 * semantic-supervision — Fase 2f (economy) / Task #199: ronda notturna
 * cross-check di Quebracho sulle conversazioni recenti di Horus/Bowie.
 *
 * Niente auto-valutazione: Quebracho (giudice leggero, mai un modello
 * pesante — modalità ECONOMY) valuta un piccolo campione di turni recenti di
 * Horus/Bowie, mai i propri. Il campione arriva con UNA query SQL sulla
 * tabella `llm_traces` (Task #200) — nessun parsing di cronologia grezza,
 * nessuna dipendenza da Fase 2b/#193 per questo step. Un solo turno di
 * inferenza a Quebracho per l'intero campione (batch), non uno per traccia,
 * per restare un job leggero.
 *
 * Alert SOLO su anomalia: chi chiama questo modulo decide come instradare
 * `anomalies` (fan-out notifiche pipeline + iniezione system prompt — vedi
 * `run-cluster-daily.ts` step 11). Nessuna autocorrezione qui: il modulo
 * segnala e basta.
 */

import { and, desc, gt, inArray } from "drizzle-orm";
import { llmTracesTable, type LlmTraceRow } from "@workspace/db";
import {
  extractJson,
  isQuebrachoConfigured,
  quebrachoChatRawResilient,
  type HorusMessage,
} from "@workspace/horus";

/** Finestra temporale del campione: solo turni delle ultime N ore. */
const SAMPLE_WINDOW_HOURS = 24;
/** Dimensione massima del campione — ronda leggera, non un audit esaustivo. */
const SAMPLE_SIZE = 8;

export type SupervisionStatus = "skipped" | "ok" | "warn";

export interface SupervisionAnomaly {
  traceId: number;
  agent: string;
  reason: string;
}

export interface SupervisionResult {
  status: SupervisionStatus;
  /** Messaggio sintetico per i log/report della pipeline. */
  detail: string;
  sampledCount: number;
  /** Non vuoto solo quando status === "warn" per anomalie di contenuto reali
   * (non per un guasto operativo della ronda stessa, es. Quebracho irraggiungibile). */
  anomalies: SupervisionAnomaly[];
}

const JUDGE_SYSTEM_PROMPT =
  "Sei un supervisore leggero che controlla a campione le risposte di altri due assistenti AI " +
  "(Horus e Bowie) di un blog di moto (BikerBlog). Per ciascun elemento della lista valuta SOLO " +
  "questi criteri semplici: (1) pertinenza — la risposta è in tema con l'input? (2) uso dei tool — " +
  "se sono stati usati tool, avevano senso per quella richiesta? se NON sono stati usati, mancavano " +
  "quando sarebbero serviti? (3) invenzioni evidenti — la risposta afferma come fatti cose " +
  "palesemente inventate o contraddittorie? (4) tono — è appropriato (non offensivo, non fuori " +
  "contesto)? Segnala un elemento come anomalia SOLO se c'è un problema chiaro secondo questi " +
  "criteri, non per differenze di stile, lunghezza o brevità. Rispondi SOLO con un oggetto JSON, " +
  "nessun testo fuori dal JSON, in questo formato esatto: " +
  '{"anomalies": [{"id": <id intero della traccia>, "reason": "<motivo breve in italiano>"}]}. ' +
  'Se non trovi nessuna anomalia, rispondi {"anomalies": []}.';

/** Campiona via query SQL i turni recenti di Horus/Bowie da `llm_traces` (mai Quebracho stesso). */
export async function sampleRecentTraces(): Promise<LlmTraceRow[]> {
  const { db } = await import("@workspace/db");
  const since = new Date(Date.now() - SAMPLE_WINDOW_HOURS * 60 * 60 * 1000);
  return db
    .select()
    .from(llmTracesTable)
    .where(and(inArray(llmTracesTable.agent, ["Horus", "Bowie"]), gt(llmTracesTable.createdAt, since)))
    .orderBy(desc(llmTracesTable.createdAt))
    .limit(SAMPLE_SIZE);
}

function buildJudgePrompt(rows: LlmTraceRow[]): string {
  const items = rows.map((r) => {
    const tools = r.toolsUsed.length > 0 ? r.toolsUsed.join(", ") : "nessuno";
    const output = r.outcome === "error" ? `[ERRORE: ${r.errorMessage ?? "sconosciuto"}]` : r.outputExcerpt ?? "(vuoto)";
    return `- id=${r.id} agente=${r.agent} tool_usati=${tools} esito=${r.outcome}\n  input: ${r.inputExcerpt}\n  output: ${output}`;
  });
  return `Valuta questi ${rows.length} turni recenti:\n\n${items.join("\n\n")}`;
}

interface JudgeResponse {
  anomalies?: Array<{ id?: unknown; reason?: unknown }>;
}

export async function runSemanticSupervision(): Promise<SupervisionResult> {
  if (!isQuebrachoConfigured()) {
    return {
      status: "skipped",
      detail: "Quebracho non configurato — supervisione semantica saltata",
      sampledCount: 0,
      anomalies: [],
    };
  }

  const rows = await sampleRecentTraces();
  if (rows.length === 0) {
    return {
      status: "ok",
      detail: "nessuna conversazione recente di Horus/Bowie da valutare",
      sampledCount: 0,
      anomalies: [],
    };
  }

  const messages: HorusMessage[] = [
    { role: "system", content: JUDGE_SYSTEM_PROMPT },
    { role: "user", content: buildJudgePrompt(rows) },
  ];

  let raw: string;
  try {
    const result = await quebrachoChatRawResilient(messages, {});
    raw = result.content;
  } catch (err) {
    // Guasto operativo della ronda (Quebracho irraggiungibile/timeout), non
    // un'anomalia di contenuto: resta un warn "silenzioso" (nessun alert
    // fan-out, nessuna iniezione nel system prompt) — stessa tolleranza già
    // usata per i guasti transitori di Nadir.
    return {
      status: "warn",
      detail: `Quebracho non raggiungibile per il cross-check: ${err instanceof Error ? err.message : String(err)}`,
      sampledCount: rows.length,
      anomalies: [],
    };
  }

  let parsed: JudgeResponse;
  try {
    parsed = JSON.parse(extractJson(raw)) as JudgeResponse;
  } catch (err) {
    return {
      status: "warn",
      detail: `verdetto di Quebracho non interpretabile come JSON: ${err instanceof Error ? err.message : String(err)}`,
      sampledCount: rows.length,
      anomalies: [],
    };
  }

  const rawAnomalies = Array.isArray(parsed.anomalies) ? parsed.anomalies : [];
  const anomalies: SupervisionAnomaly[] = [];
  for (const a of rawAnomalies) {
    const id = typeof a.id === "number" ? a.id : Number(a.id);
    const trace = rows.find((r) => r.id === id);
    // Un id inventato dal modello non deve produrre un'anomalia fantasma su
    // un turno inesistente: si scarta silenziosamente.
    if (!trace) continue;
    anomalies.push({
      traceId: trace.id,
      agent: trace.agent,
      reason: typeof a.reason === "string" && a.reason.trim() ? a.reason.trim() : "motivo non specificato",
    });
  }

  if (anomalies.length === 0) {
    return {
      status: "ok",
      detail: `${rows.length} turni valutati, nessuna anomalia`,
      sampledCount: rows.length,
      anomalies: [],
    };
  }

  return {
    status: "warn",
    detail: `${anomalies.length}/${rows.length} turni segnalati come anomali dal cross-check di Quebracho`,
    sampledCount: rows.length,
    anomalies,
  };
}
