/**
 * Tracing strutturato del tool-loop condiviso (Task #200, prep per la ronda
 * notturna di supervisione semantica — Fase 2f / #199).
 *
 * Ogni chiamata "di alto livello" del tool-loop (un turno completo di chat
 * diretta con Horus/Bowie/Quebracho, oppure un turno della conversazione
 * osservabile a più agenti) produce UNA riga in `llm_traces` con uno schema
 * fisso: agente, superficie, id conversazione/turno, tool usati, latenza,
 * esito, ed estratti minimi di input/output. Non è un dump completo del
 * payload — solo estratti troncati — per restare coerenti con la nota di
 * sicurezza già presente in #199 (nessun dato sensibile nelle tracce).
 *
 * Best-effort: un fallimento nello scrivere la traccia non deve MAI far
 * fallire il turno di chat reale che la genera. Chi chiama `recordLlmTrace`
 * non deve fare `await` bloccante sul risultato in un percorso critico per
 * la latenza percepita dall'utente — la funzione stessa ingoia i propri
 * errori e logga solo un warning.
 */

import { llmTracesTable } from "@workspace/db/schema";

/** Estratto massimo di input/output/errore persistito in una traccia — mai
 * l'intero payload, solo quanto basta per un campionamento a colpo d'occhio. */
const MAX_TRACE_EXCERPT_CHARS = 500;

export type LlmTraceSurface = "direct_chat" | "agent_conversation";
export type LlmTraceOutcome = "success" | "error";

export interface LlmTraceInput {
  agent: string;
  surface: LlmTraceSurface;
  conversationId?: string | number | null;
  turnNumber?: number | null;
  toolsUsed?: string[];
  latencyMs: number;
  outcome: LlmTraceOutcome;
  errorMessage?: string | null;
  input: string;
  output?: string | null;
}

/** Tronca un testo a `MAX_TRACE_EXCERPT_CHARS`, senza lanciare su input vuoti/undefined. */
export function traceExcerpt(text: string | null | undefined): string | undefined {
  if (!text) return undefined;
  const trimmed = text.trim();
  if (!trimmed) return undefined;
  return trimmed.length > MAX_TRACE_EXCERPT_CHARS
    ? `${trimmed.slice(0, MAX_TRACE_EXCERPT_CHARS)}…`
    : trimmed;
}

// Iniettabile per i test (evita di toccare il DB reale); in produzione resta
// il `db` reale di `@workspace/db`, caricato in modo lazy (dynamic import)
// così questo modulo non fa fallire l'import di `@workspace/horus` in
// contesti (es. test) dove `DATABASE_URL` non è impostata — `@workspace/db`
// lancia un errore già al modulo-load se manca.
let dbModulePromise: Promise<typeof import("@workspace/db")> | null = null;
function loadDb(): Promise<typeof import("@workspace/db")> {
  if (!dbModulePromise) {
    dbModulePromise = import("@workspace/db");
  }
  return dbModulePromise;
}

/**
 * Registra una traccia di UNA chiamata del tool-loop. Non lancia mai: un
 * fallimento di scrittura (es. DB non disponibile) viene solo loggato, senza
 * impattare la chat/conversazione che l'ha generata — il tracing è
 * osservabilità, non deve introdurre un nuovo punto di fallimento per la
 * feature principale.
 */
export async function recordLlmTrace(entry: LlmTraceInput): Promise<void> {
  try {
    const { db } = await loadDb();
    await db.insert(llmTracesTable).values({
      agent: entry.agent,
      surface: entry.surface,
      conversationId: entry.conversationId === undefined || entry.conversationId === null
        ? null
        : String(entry.conversationId),
      turnNumber: entry.turnNumber ?? null,
      toolsUsed: entry.toolsUsed ?? [],
      latencyMs: Math.max(0, Math.round(entry.latencyMs)),
      outcome: entry.outcome,
      errorMessage: traceExcerpt(entry.errorMessage) ?? null,
      inputExcerpt: traceExcerpt(entry.input) ?? "",
      outputExcerpt: traceExcerpt(entry.output) ?? null,
    });
  } catch (err) {
    // eslint-disable-next-line no-console -- best-effort tracing, nessun logger di route disponibile qui
    console.warn("[llm-tracing] impossibile salvare la traccia:", err instanceof Error ? err.message : err);
  }
}
