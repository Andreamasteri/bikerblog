#!/usr/bin/env tsx
/**
 * coder-escalate — inoltra un problema al coder pesante on-demand (Task #222).
 *
 * Quebracho (il loop leggero di supervisione su Replit) NON risolve da solo i
 * problemi di codice: quando ne incontra uno che richiede un modello coder
 * potente, lo ESCALA qui. Questo script è il ponte: chiama l'endpoint interno
 * `POST /api/_internal/coder/analyze`, che a sua volta orchestra lo slot heavy
 * di Ares (stesso modello devstral) con eviction GATED sull'attività di chat.
 *
 * Invariante (coerente con "Ares propone, l'admin decide"): il coder PROPONE
 * un'analisi/soluzione, non applica nulla. Questo script si limita a inoltrare
 * il problema e a riportare l'esito.
 *
 * Gate: se una chat è attiva (o l'affluenza è troppo recente) e questa non è
 * una richiesta admin, l'endpoint risponde 409 "gated" — non è un errore, è il
 * comportamento voluto: il coder non interrompe mai una sessione in corso.
 *
 * Richiede:
 *   SESSION_SECRET (o INBOX_TOKEN) — per autenticarsi all'API server interno
 *
 * Usage:
 *   pnpm --filter @workspace/scripts run coder:escalate -- "descrizione del problema"
 *   pnpm --filter @workspace/scripts run coder:escalate -- --admin "problema urgente"
 *   echo "problema multiriga" | pnpm --filter @workspace/scripts run coder:escalate
 */

import { createHmac } from "crypto";

const API_BASE = process.env["API_BASE_URL"] ?? "http://localhost:8080";
const ANALYZE_ENDPOINT = `${API_BASE}/api/_internal/coder/analyze`;

function getInternalToken(): string {
  if (process.env["INBOX_TOKEN"]) return process.env["INBOX_TOKEN"];
  if (process.env["SESSION_SECRET"]) {
    return createHmac("sha256", process.env["SESSION_SECRET"])
      .update("internal-api-token-v1")
      .digest("hex");
  }
  throw new Error(
    "SESSION_SECRET (o INBOX_TOKEN) non impostato — impossibile autenticarsi all'API server"
  );
}

interface AnalyzePayload {
  ok?: boolean;
  gated?: boolean;
  proposal?: string;
  error?: string;
}

export interface EscalateResult {
  /** true = il coder ha prodotto una proposta; false = gated, errore o fallimento. */
  ok: boolean;
  /** true = rifiutato dal gate anti-interruzione (chat attiva / affluenza recente). */
  gated: boolean;
  /** HTTP status della risposta dell'endpoint interno. */
  status: number;
  /** Proposta/analisi del coder, se disponibile. */
  proposal?: string;
  /** Messaggio d'errore o motivo del gate, se presente. */
  error?: string;
}

/**
 * Inoltra `problem` al coder pesante via l'endpoint interno.
 *
 * @param problem  descrizione testuale del problema da analizzare
 * @param opts.adminTrigger  se true, salta il gate di idle (resta comunque
 *   bloccato da una chat ATTIVA — quella non si scavalca mai)
 */
export async function escalateToCoder(
  problem: string,
  opts: { adminTrigger?: boolean } = {}
): Promise<EscalateResult> {
  const trimmed = problem.trim();
  if (trimmed.length === 0) {
    return { ok: false, gated: false, status: 0, error: "problema vuoto" };
  }

  const res = await fetch(ANALYZE_ENDPOINT, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${getInternalToken()}`,
    },
    body: JSON.stringify({ problem: trimmed, adminTrigger: opts.adminTrigger === true }),
  });

  // 409 con { gated: true } è il rifiuto del gate (chat attiva/affluenza):
  // atteso e distinto da un vero fallimento.
  let payload: AnalyzePayload | null = null;
  try {
    payload = (await res.json()) as AnalyzePayload;
  } catch {
    // Risposta non-JSON (es. HTML di un gateway): la trattiamo come errore grezzo.
    payload = null;
  }

  if (res.ok) {
    return {
      ok: true,
      gated: false,
      status: res.status,
      proposal: payload?.proposal,
    };
  }

  const gated = res.status === 409 && payload?.gated === true;
  return {
    ok: false,
    gated,
    status: res.status,
    error: payload?.error ?? `HTTP ${res.status}`,
  };
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const adminTrigger = args.includes("--admin");
  const positional = args.filter((a) => a !== "--admin");

  let problem = positional.join(" ").trim();
  // Fallback: leggi da stdin se non è stato passato un argomento (utile per
  // pipe di problemi multiriga da altri script).
  if (problem.length === 0 && !process.stdin.isTTY) {
    const chunks: Buffer[] = [];
    for await (const chunk of process.stdin) {
      chunks.push(Buffer.from(chunk));
    }
    problem = Buffer.concat(chunks).toString("utf-8").trim();
  }

  if (problem.length === 0) {
    console.error(
      'Uso: coder:escalate -- "descrizione del problema"  (oppure passala da stdin)'
    );
    process.exitCode = 2;
    return;
  }

  const result = await escalateToCoder(problem, { adminTrigger });

  if (result.gated) {
    console.log(
      `⏸️  Coder in coda (gated): ${result.error ?? "chat attiva o affluenza recente"}. Riprova quando la chat è libera.`
    );
    process.exitCode = 0;
    return;
  }

  if (!result.ok) {
    console.error(`❌ Escalation fallita (HTTP ${result.status}): ${result.error ?? "errore sconosciuto"}`);
    process.exitCode = 1;
    return;
  }

  console.log("✅ Proposta del coder:\n");
  console.log(result.proposal ?? "(nessuna proposta testuale restituita)");
}

// Guardia CLI: eseguire main() solo quando lo script è invocato direttamente,
// non quando escalateToCoder è importata da altri moduli/test.
if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((err) => {
    console.error(err instanceof Error ? err.message : String(err));
    process.exitCode = 1;
  });
}
