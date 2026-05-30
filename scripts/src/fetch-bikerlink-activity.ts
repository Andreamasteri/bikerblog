#!/usr/bin/env tsx
/**
 * fetch-bikerlink-activity — recupera automaticamente l'attività di sviluppo
 * di BikerLink per una data specifica e scrive diary-notes-YYYY-MM-DD.md.
 *
 * Fonti dati (in ordine di priorità):
 *   1. inbox/bikerlink-chat-YYYY-MM-DD*.md — report attività utenti del giorno
 *      (nuovi utenti, messaggi, match/proposte)
 *   2. BIKERLINK_DATABASE_URL — OTA releases e server restarts
 *      (opzionale: se il DB è irraggiungibile, si usa solo la chat)
 *
 * Non sovrascrive se il file di note esiste già (le note manuali hanno priorità).
 *
 * Usage:
 *   tsx src/fetch-bikerlink-activity.ts --date 2026-05-29
 *   (se --date è omesso, usa oggi in Europe/Rome)
 */
import { spawnSync } from "node:child_process";
import { existsSync, writeFileSync, readdirSync, readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..", "..");
const INBOX = resolve(ROOT, "inbox");

function todayRome(): string {
  return new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Rome" }).format(new Date());
}

const args = process.argv.slice(2);
const dateArg = args.includes("--date") ? args[args.indexOf("--date") + 1] : null;
const date = dateArg ?? todayRome();

const notesPath = resolve(INBOX, `diary-notes-${date}.md`);
if (existsSync(notesPath)) {
  console.log(`[bikerlink-activity] ${date} — note già esistenti, skip`);
  process.exit(0);
}

// ── 1. Leggi file chat del giorno dall'inbox ──────────────────────────────────

function loadChatFiles(targetDate: string): string[] {
  try {
    const files = readdirSync(INBOX)
      .filter((f) => f.startsWith(`bikerlink-chat-${targetDate}`) && f.endsWith(".md"))
      .sort();
    return files.map((f) => readFileSync(resolve(INBOX, f), "utf8").trim());
  } catch {
    return [];
  }
}

const chatContents = loadChatFiles(date);
const hasChatData = chatContents.length > 0;

// Tracker fonti mancanti — popola man mano, usato per la sezione Limiti
const missingSourceLabels: string[] = [];

if (!hasChatData) {
  missingSourceLabels.push(
    `File chat del giorno (inbox/bikerlink-chat-${date}*.md): non trovati`
  );
} else {
  console.log(`[bikerlink-activity] chat: ${chatContents.length} file trovati`);
}

// ── 2. Query BikerLink DB (opzionale, sempre tentata se URL disponibile) ──────

interface OtaRelease {
  message: string;
  published_at: string;
}

interface ServerRestart {
  reason: string;
  started_at: string;
}

function psqlJson<T>(url: string, query: string): T[] {
  const result = spawnSync(
    "psql",
    [url, "-At", "-c", `SELECT json_agg(row_to_json(t)) FROM (${query}) t`],
    { encoding: "utf8", timeout: 8000 }
  );
  if (result.status !== 0 || !result.stdout.trim()) return [];
  try {
    const parsed = JSON.parse(result.stdout.trim());
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

const BIKERLINK_URL = process.env["BIKERLINK_DATABASE_URL"];
let otas: OtaRelease[] = [];
let restarts: ServerRestart[] = [];

if (BIKERLINK_URL) {
  otas = psqlJson<OtaRelease>(
    BIKERLINK_URL,
    `SELECT DISTINCT ON (message) message, published_at
     FROM ota_releases
     WHERE published_at::date = '${date}'
     ORDER BY message, published_at`
  );
  restarts = psqlJson<ServerRestart>(
    BIKERLINK_URL,
    `SELECT reason, started_at
     FROM server_restarts
     WHERE started_at::date = '${date}'
     ORDER BY started_at`
  );
  if (otas.length > 0 || restarts.length > 0) {
    console.log(`[bikerlink-activity] DB: ${otas.length} OTA, ${restarts.length} restart`);
  } else {
    // Endpoint disabilitato o giornata senza attività — entrambi restituiscono []
    console.log(`[bikerlink-activity] DB: nessun dato (endpoint disabilitato o giornata vuota)`);
    missingSourceLabels.push(
      "DB BikerLink (OTA + server restart): connessione fallita o nessun dato per questa data"
    );
  }
} else {
  console.log(`[bikerlink-activity] BIKERLINK_DATABASE_URL non impostato — solo chat`);
  missingSourceLabels.push(
    "DB BikerLink (OTA + server restart): BIKERLINK_DATABASE_URL non impostato"
  );
}

const hasOta = otas.length > 0;
const hasRestarts = restarts.length >= 3;
const hasAnyData = hasChatData || hasOta || hasRestarts;

// Non ci fermiamo quando tutte le fonti sono vuote: scriviamo comunque le note
// con SOLO la sezione "Limiti", così il generatore sa esplicitamente cosa manca
// e può dire "non ho dati" invece di inventare un contesto plausibile.

// ── 3. Costruisci il file di note ─────────────────────────────────────────────

const lines: string[] = [
  `# Note sviluppatore — ${date} (auto-generate da BikerLink)`,
  "",
];

if (!hasAnyData) {
  lines.push(`## Nessun dato disponibile`);
  lines.push("");
  lines.push(`Nessuna delle fonti configurate ha restituito dati per questa data.`);
  lines.push(`Il post diaristico deve riconoscere esplicitamente questa assenza`);
  lines.push(`invece di inventare un contesto di sviluppo non documentato.`);
  lines.push("");
}

// Sezione attività utenti dalla chat
if (hasChatData) {
  lines.push(`## Attività utenti del giorno`);
  lines.push("");
  for (const content of chatContents) {
    lines.push(content);
    lines.push("");
  }
}

// Sezione restart server dal DB
if (hasRestarts) {
  lines.push(`## Server restart: ${restarts.length} in questa giornata`);
  const first = restarts[0].started_at.slice(11, 16);
  const last  = restarts[restarts.length - 1].started_at.slice(11, 16);
  lines.push(`Dal ${first} al ${last} UTC.`);
  lines.push("");
}

// Sezione OTA dal DB
if (hasOta) {
  lines.push(`## OTA release del giorno (${otas.length} release distinte)`);
  lines.push("");
  for (const ota of otas) {
    const time = ota.published_at.slice(11, 16);
    lines.push(`**${time} UTC** — ${ota.message}`);
    lines.push("");
  }
}

// ── 4. Sezione "Limiti" — documenta sempre cosa mancava ──────────────────────
// Fondamentale: dice al generatore esattamente cosa NON SA, così Claude
// dichiara l'incertezza invece di inventare spiegazioni per colmare i vuoti.

if (missingSourceLabels.length > 0) {
  lines.push(`## Limiti di questo report`);
  lines.push("");
  lines.push(
    `Le seguenti fonti non erano disponibili al momento della generazione.`
  );
  lines.push(
    `Il generatore del post DEVE dichiarare esplicitamente queste lacune`
  );
  lines.push(
    `invece di speculare o inventare informazioni per colmarle.`
  );
  lines.push("");
  for (const label of missingSourceLabels) {
    lines.push(`- ${label}`);
  }
  lines.push("");
}

const content = lines.join("\n");
writeFileSync(notesPath, content, "utf8");
console.log(
  `[bikerlink-activity] ${date} — note scritte: ${chatContents.length} chat, ${otas.length} OTA, ${restarts.length} restart, ${missingSourceLabels.length} fonti mancanti → ${notesPath}`
);
