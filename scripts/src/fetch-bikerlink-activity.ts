#!/usr/bin/env tsx
/**
 * fetch-bikerlink-activity — recupera automaticamente l'attività di sviluppo
 * di BikerLink per una data specifica e scrive diary-notes-YYYY-MM-DD.md.
 *
 * Fonti dati (BIKERLINK_DATABASE_URL):
 *   - ota_releases: release OTA pubblicate nella data
 *   - server_restarts: restart del server (proxy dell'intensità di sviluppo)
 *
 * Non sovrascrive se il file di note esiste già (le note manuali hanno priorità).
 * Non fa nulla se BIKERLINK_DATABASE_URL non è impostato.
 *
 * Usage:
 *   tsx src/fetch-bikerlink-activity.ts --date 2026-05-26
 *   (se --date è omesso, usa oggi in Europe/Rome)
 *
 * Richiede: BIKERLINK_DATABASE_URL
 */
import { spawnSync } from "node:child_process";
import { existsSync, writeFileSync } from "node:fs";
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

const BIKERLINK_URL = process.env["BIKERLINK_DATABASE_URL"];
if (!BIKERLINK_URL) {
  console.log("[bikerlink-activity] BIKERLINK_DATABASE_URL non impostato — skip");
  process.exit(0);
}

const notesPath = resolve(INBOX, `diary-notes-${date}.md`);
if (existsSync(notesPath)) {
  console.log(`[bikerlink-activity] ${date} — note già esistenti, skip`);
  process.exit(0);
}

interface OtaRelease {
  message: string;
  published_at: string;
  approved_at: string;
}

interface ServerRestart {
  reason: string;
  started_at: string;
}

function psqlJson<T>(url: string, query: string): T[] {
  const result = spawnSync(
    "psql",
    [url, "-At", "-c", `SELECT json_agg(row_to_json(t)) FROM (${query}) t`],
    { encoding: "utf8" }
  );
  if (result.status !== 0 || !result.stdout.trim()) return [];
  try {
    const parsed = JSON.parse(result.stdout.trim());
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

const otas = psqlJson<OtaRelease>(
  BIKERLINK_URL,
  `SELECT DISTINCT ON (message) message, published_at, approved_at
   FROM ota_releases
   WHERE published_at::date = '${date}'
   ORDER BY message, published_at`
);

const restarts = psqlJson<ServerRestart>(
  BIKERLINK_URL,
  `SELECT reason, started_at
   FROM server_restarts
   WHERE started_at::date = '${date}'
   ORDER BY started_at`
);

const hasOta = otas.length > 0;
const hasRestarts = restarts.length >= 3;

if (!hasOta && !hasRestarts) {
  console.log(`[bikerlink-activity] ${date} — nessuna attività significativa, skip`);
  process.exit(0);
}

const lines: string[] = [
  `# Note sviluppatore — ${date} (auto-generate da BikerLink DB)`,
  "",
];

if (hasRestarts) {
  lines.push(`## Server restart: ${restarts.length} in questa giornata`);
  if (restarts.length > 0) {
    const first = restarts[0].started_at.slice(11, 16);
    const last  = restarts[restarts.length - 1].started_at.slice(11, 16);
    lines.push(`Dal ${first} al ${last} UTC.`);
  }
  lines.push("");
}

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
console.log(`[bikerlink-activity] ${date} — scritte ${otas.length} OTA + ${restarts.length} restart → ${notesPath}`);
