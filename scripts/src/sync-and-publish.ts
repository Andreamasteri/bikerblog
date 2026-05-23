#!/usr/bin/env tsx
/**
 * sync-and-publish — sync forzato + pubblicazione immediata.
 *
 * Uso manuale quando vuoi aggiornare il blog senza aspettare il cron:
 *   pnpm --filter @workspace/scripts run sync
 *
 * Sequenza:
 *   1. inbox:fetch         — scarica la chat da BikerLink (soft-fail)
 *   2. fetch:archived-tasks --local  — ricarica i task dall'export locale
 *   3. cluster:tasks       — raggruppa i task MERGED per giornata
 *   4. publish-from-clusters — pubblica i cluster nuovi nel blog
 *
 * Variabili opzionali (stesse del daily-pipeline):
 *   INBOX_URL    — endpoint chat-export BikerLink
 *   INBOX_TOKEN  — token Bearer
 *   INBOX_SOURCE — nome sorgente (default: bikerlink)
 */
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { pool } from "@workspace/db";
import { publishFromClusters } from "./publish-from-clusters.js";

const here = dirname(fileURLToPath(import.meta.url));
const scriptsCwd = resolve(here, "..");

function step(label: string, args: string[], soft = false): boolean {
  console.log(`\n[sync] ▶ ${label}`);
  const result = spawnSync("tsx", args, { cwd: scriptsCwd, stdio: "inherit" });
  if (result.status !== 0) {
    if (soft) {
      console.warn(`[sync] ⚠ ${label} fallito (ignorato) — codice ${result.status}`);
      return false;
    }
    console.error(`[sync] ✗ ${label} fallito con codice ${result.status}`);
    process.exit(result.status ?? 1);
  }
  console.log(`[sync] ✓ ${label} completato`);
  return true;
}

console.log(`[sync] avvio — ${new Date().toLocaleString("it-IT", { timeZone: "Europe/Rome" })}`);

const inboxUrl = process.env.INBOX_URL;
const inboxToken = process.env.INBOX_TOKEN;
const inboxSource = process.env.INBOX_SOURCE ?? "bikerlink";

if (inboxUrl) {
  const tokenArgs = inboxToken ? ["--token", inboxToken] : [];
  step(
    "inbox:fetch (da URL)",
    ["src/inbox-fetch.ts", "--source", inboxSource, "--url", inboxUrl, ...tokenArgs],
    true
  );
} else {
  console.log("[sync] ℹ INBOX_URL non impostata — skip fetch chat");
}

step(
  "fetch:archived-tasks (locale)",
  ["src/fetch-archived-tasks.ts", "--local"],
  true
);

step(
  "cluster:tasks (MERGED per giornata)",
  ["src/cluster-tasks.ts", "--state", "MERGED", "--by", "day"]
);

console.log("\n[sync] ▶ publish-from-clusters");
try {
  await publishFromClusters();
  console.log("[sync] ✓ pubblicazione completata");
} finally {
  await pool.end();
}

console.log(`\n[sync] ✅ fatto — ${new Date().toLocaleString("it-IT", { timeZone: "Europe/Rome" })}`);
