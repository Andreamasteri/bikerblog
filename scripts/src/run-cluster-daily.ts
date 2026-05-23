#!/usr/bin/env tsx
/**
 * run-cluster-daily — entry point per il cron giornaliero delle 23:30.
 *
 * 1. Genera inbox/clusters-merged-by-day.md
 *    (cluster:tasks --state MERGED --by day)
 * 2. Pubblica i cluster nuovi come post del blog
 *    (publish-from-clusters)
 *
 * Usage:
 *   pnpm --filter @workspace/scripts run cluster:daily
 *
 * Richiede DATABASE_URL.
 */
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { pool } from "@workspace/db";
import { publishFromClusters } from "./publish-from-clusters.js";

const here = dirname(fileURLToPath(import.meta.url));
const scriptsCwd = resolve(here, "..");

console.log("[cluster-daily] avvio —", new Date().toISOString());

console.log("[cluster-daily] step 1: generazione cluster");
const clusterResult = spawnSync(
  "tsx",
  [
    "src/cluster-tasks.ts",
    "--state",
    "MERGED",
    "--by",
    "day",
  ],
  { cwd: scriptsCwd, stdio: "inherit" }
);

if (clusterResult.status !== 0) {
  console.error(
    "[cluster-daily] cluster-tasks fallito con codice",
    clusterResult.status
  );
  process.exit(clusterResult.status ?? 1);
}

console.log("[cluster-daily] step 2: pubblicazione post");
try {
  await publishFromClusters();
} finally {
  await pool.end();
}

console.log("[cluster-daily] completato —", new Date().toISOString());
