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

// ── 2. Query BikerLink DB (opzionale) ────────────────────────────────────────

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
    console.log(`[bikerlink-activity] DB: nessun dato (endpoint disabilitato o giornata vuota)`);
  }
} else {
  console.log(`[bikerlink-activity] BIKERLINK_DATABASE_URL non impostato — solo chat`);
}

const hasOta = otas.length > 0;
const hasRestarts = restarts.length >= 3;

// Serve almeno una fonte dati
if (!hasChatData && !hasOta && !hasRestarts) {
  console.log(`[bikerlink-activity] ${date} — nessun dato disponibile, skip`);
  process.exit(0);
}

// ── 3. Costruisci il file di note ─────────────────────────────────────────────

const lines: string[] = [
  `# Note sviluppatore — ${date} (auto-generate da BikerLink)`,
  "",
];

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

const content = lines.join("\n");
writeFileSync(notesPath, content, "utf8");
console.log(
  `[bikerlink-activity] ${date} — note scritte: ${chatContents.length} chat, ${otas.length} OTA, ${restarts.length} restart → ${notesPath}`
);
