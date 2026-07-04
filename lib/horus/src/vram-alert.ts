/**
 * Stato dell'allarme di congestione VRAM su TC (Task #194). Il campionatore
 * VRAM gira su TC (deploy/horus-hub/server.js, fuori da questo repo) e chiama
 * `POST /_internal/vram-alert` sull'api-server quando la soglia configurabile
 * viene superata/rientra, gated dallo stesso `HUB_GATE_TOKEN` già condiviso
 * per gli altri tool dell'hub (nessun nuovo secret). Qui teniamo solo lo
 * stato risultante su file (stesso pattern file-based di horus-memory.md), e
 * lo esponiamo come frammento di system prompt da allegare SEMPRE — anche per
 * Bowie e Quebracho, che non allegano la memoria persistente di Horus per
 * default — perché l'obiettivo è che l'avviso raggiunga chiunque stia
 * chattando in quel momento, non solo chi usa Horus.
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
// lib/horus/src -> lib/horus -> lib -> root -> inbox
const VRAM_ALERT_FILE = resolve(__dirname, "..", "..", "..", "inbox", "vram-alert-state.json");

export interface VramAlertState {
  active: boolean;
  usedMiB?: number;
  totalMiB?: number;
  pct?: number;
  thresholdPct?: number;
  since?: string;
  lastUpdated?: string;
  resolvedAt?: string;
}

/** Legge lo stato dell'allarme VRAM (inattivo se il file non esiste ancora). */
export function loadVramAlertState(): VramAlertState {
  if (!existsSync(VRAM_ALERT_FILE)) return { active: false };
  try {
    const parsed = JSON.parse(readFileSync(VRAM_ALERT_FILE, "utf-8")) as VramAlertState;
    return parsed && typeof parsed.active === "boolean" ? parsed : { active: false };
  } catch {
    return { active: false };
  }
}

/** Scrive lo stato dell'allarme VRAM (usato dall'endpoint interno che riceve i webhook da TC). */
export function writeVramAlertState(state: VramAlertState): void {
  mkdirSync(dirname(VRAM_ALERT_FILE), { recursive: true });
  writeFileSync(VRAM_ALERT_FILE, JSON.stringify(state, null, 2), "utf-8");
}

/**
 * Se l'allarme è attivo, restituisce il testo da allegare come messaggio di
 * sistema per QUALSIASI agente (Horus/Bowie/Quebracho); stringa vuota se non
 * c'è nulla da segnalare. Da allegare sempre, non solo se l'utente chiede
 * esplicitamente della VRAM — è pensato per emergere spontaneamente in chat,
 * il canale scelto per raggiungere anche da mobile (vedi Task #194).
 */
export function loadActiveVramAlertPrompt(): string {
  const state = loadVramAlertState();
  if (!state.active) return "";
  const pct = state.pct !== undefined ? `${state.pct.toFixed(0)}%` : "sconosciuta";
  const used = state.usedMiB !== undefined && state.totalMiB !== undefined
    ? `${state.usedMiB}MiB/${state.totalMiB}MiB`
    : "dati non disponibili";
  const since = state.since ? new Date(state.since).toLocaleString("it-IT") : "poco fa";
  return (
    `ATTENZIONE — allarme VRAM attivo su TC dalle ${since}: uso corrente ${used} (${pct}), sopra la soglia ` +
    `configurata (${state.thresholdPct ?? "?"}%). Segnalalo proattivamente all'utente in questo turno, in una ` +
    "frase breve, anche se non te lo chiede esplicitamente — non serve conferma, e non ripeterlo ad ogni " +
    "messaggio successivo se lo hai già detto in questa conversazione."
  );
}
