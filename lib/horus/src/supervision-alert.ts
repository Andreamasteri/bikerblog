/**
 * Stato dell'alert di supervisione semantica (Fase 2f economy, Task #199).
 *
 * La ronda notturna (`scripts/src/semantic-supervision.ts`) campiona via
 * query SQL un piccolo numero di turni recenti di Horus/Bowie da `llm_traces`
 * (Task #200) e li fa valutare a Quebracho (giudice leggero, mai un modello
 * pesante). Qui teniamo solo lo stato risultante su file — stesso pattern
 * file-based già usato per l'alert VRAM (Task #194, vedi `vram-alert.ts`) —
 * e lo esponiamo come frammento di system prompt da allegare a qualunque
 * agente stia chattando quando l'alert è attivo, così l'anomalia raggiunge
 * l'utente (escalation all'umano) senza che il sistema si "autocorregga" da
 * solo. Si auto-risolve alla prima ronda notturna successiva senza anomalie.
 *
 * Nota di sicurezza: qui restano solo motivazioni brevi generate dal giudice
 * più l'id della traccia, mai il dump della conversazione originale —
 * coerente con gli estratti minimi già presenti in `llm_traces`.
 */

import { existsSync, mkdirSync, readFileSync, unlinkSync, writeFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
// lib/horus/src -> lib/horus -> lib -> root -> inbox
const SUPERVISION_ALERT_FILE = resolve(
  __dirname,
  "..",
  "..",
  "..",
  "inbox",
  "supervision-alert-state.json"
);

export interface SupervisionAnomalyRecord {
  traceId: number;
  agent: string;
  reason: string;
}

export interface SupervisionAlertState {
  active: boolean;
  since?: string;
  lastUpdated?: string;
  sampledCount?: number;
  anomalies?: SupervisionAnomalyRecord[];
}

/** Legge lo stato dell'alert di supervisione (inattivo se il file non esiste). */
export function loadSupervisionAlertState(): SupervisionAlertState {
  if (!existsSync(SUPERVISION_ALERT_FILE)) return { active: false };
  try {
    const parsed = JSON.parse(readFileSync(SUPERVISION_ALERT_FILE, "utf-8")) as SupervisionAlertState;
    return parsed && typeof parsed.active === "boolean" ? parsed : { active: false };
  } catch {
    return { active: false };
  }
}

/** Scrive lo stato dell'alert (usato dalla pipeline notturna quando trova anomalie). */
export function writeSupervisionAlertState(state: SupervisionAlertState): void {
  mkdirSync(dirname(SUPERVISION_ALERT_FILE), { recursive: true });
  writeFileSync(SUPERVISION_ALERT_FILE, JSON.stringify(state, null, 2), "utf-8");
}

/** Risolve l'alert (nessuna anomalia nell'ultima ronda) — idempotente. */
export function clearSupervisionAlertState(): void {
  if (!existsSync(SUPERVISION_ALERT_FILE)) return;
  try {
    unlinkSync(SUPERVISION_ALERT_FILE);
  } catch {
    /* ignore */
  }
}

/**
 * Se l'alert è attivo, restituisce il testo da allegare come messaggio di
 * sistema per QUALSIASI agente (Horus/Bowie/Quebracho); stringa vuota se non
 * c'è nulla da segnalare. Stesso schema spontaneo dell'alert VRAM: da
 * allegare sempre, non solo se l'utente chiede esplicitamente della
 * supervisione.
 */
export function loadActiveSupervisionAlertPrompt(): string {
  const state = loadSupervisionAlertState();
  if (!state.active || !state.anomalies || state.anomalies.length === 0) return "";
  const since = state.since ? new Date(state.since).toLocaleString("it-IT") : "poco fa";
  const summary = state.anomalies
    .slice(0, 3)
    .map((a) => `${a.agent}: ${a.reason}`)
    .join("; ");
  return (
    `ATTENZIONE — la ronda notturna di supervisione semantica (cross-check di Quebracho) del ${since} ha segnalato ` +
    `${state.anomalies.length} risposta/e fuori norma tra le conversazioni recenti di Horus/Bowie (${summary}). ` +
    "Segnalalo proattivamente all'utente in questo turno, in una frase breve, anche se non te lo chiede esplicitamente " +
    "— non serve conferma, e non ripeterlo ad ogni messaggio successivo se lo hai già detto in questa conversazione."
  );
}
