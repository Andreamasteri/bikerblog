/**
 * Stato dell'allarme "ripristino lineup dopo il coder fallito/in timeout"
 * (Task #222, Fase 2d power). Stesso pattern file-based degli altri alert
 * (VRAM — Fase 2b — e supervisione semantica — Fase 2f): teniamo lo stato su
 * file e lo esponiamo come frammento di system prompt da allegare SEMPRE a
 * qualunque agente in chat, così l'admin viene avvisato spontaneamente quando
 * il rollback della lineup residente non è andato a buon fine entro il timeout.
 *
 * Perché un canale a parte e non un throw: il ciclo del coder sfratta gli
 * agenti residenti; se il loro ripristino non completa entro 60s (default) NON
 * deve essere un fallimento silenzioso — la lineup potrebbe restare parzialmente
 * assente. L'endpoint che orchestra il coder logga l'evento (req.log.error) e
 * scrive qui lo stato; la chat lo fa emergere all'admin.
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
// lib/horus/src -> lib/horus -> lib -> root -> inbox
const CODER_ALERT_FILE = resolve(__dirname, "..", "..", "..", "inbox", "coder-alert-state.json");

export interface CoderAlertState {
  active: boolean;
  /** Modelli della lineup il cui ripristino è fallito. */
  restoreFailures?: string[];
  /** True se il ripristino ha superato il timeout configurato (default 60s). */
  restoreTimedOut?: boolean;
  since?: string;
  lastUpdated?: string;
  resolvedAt?: string;
}

/** Legge lo stato dell'allarme coder (inattivo se il file non esiste ancora). */
export function loadCoderAlertState(): CoderAlertState {
  if (!existsSync(CODER_ALERT_FILE)) return { active: false };
  try {
    const parsed = JSON.parse(readFileSync(CODER_ALERT_FILE, "utf-8")) as CoderAlertState;
    return parsed && typeof parsed.active === "boolean" ? parsed : { active: false };
  } catch {
    return { active: false };
  }
}

/** Scrive lo stato dell'allarme coder (usato dall'endpoint che orchestra il coder). */
export function writeCoderAlertState(state: CoderAlertState): void {
  mkdirSync(dirname(CODER_ALERT_FILE), { recursive: true });
  writeFileSync(CODER_ALERT_FILE, JSON.stringify(state, null, 2), "utf-8");
}

/** Azzera l'allarme coder (ripristino andato a buon fine in un ciclo successivo). */
export function clearCoderAlertState(): void {
  writeCoderAlertState({ active: false, resolvedAt: new Date().toISOString() });
}

/**
 * Se l'allarme è attivo, restituisce il testo da allegare come messaggio di
 * sistema per QUALSIASI agente in chat; stringa vuota se non c'è nulla da
 * segnalare. Pensato per emergere spontaneamente all'admin.
 */
export function loadActiveCoderAlertPrompt(): string {
  const state = loadCoderAlertState();
  if (!state.active) return "";
  const since = state.since ? new Date(state.since).toLocaleString("it-IT") : "poco fa";
  const failed =
    state.restoreFailures && state.restoreFailures.length > 0
      ? `modelli non ripristinati: ${state.restoreFailures.join(", ")}`
      : "lineup residente da verificare";
  const timeout = state.restoreTimedOut ? " (timeout di ripristino superato)" : "";
  return (
    `ATTENZIONE — dopo un ciclo del coder pesante il ripristino della lineup residente su TC ` +
    `non è andato a buon fine dalle ${since}${timeout}: ${failed}. Segnalalo proattivamente ` +
    "all'admin in questo turno, in una frase breve, anche se non te lo chiede — potrebbe servire " +
    "un warmup manuale dei modelli. Non ripeterlo a ogni messaggio successivo se lo hai già detto."
  );
}
