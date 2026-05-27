#!/usr/bin/env tsx
/**
 * run-cluster-daily — entry point per il cron giornaliero delle 23:30.
 *
 * 1. (Opzionale) Aggiorna inbox/bikerlink-chat-latest.md da INBOX_URL
 *    Se INBOX_URL non è impostato, questo step viene saltato.
 * 2. Genera inbox/clusters-merged-by-day.md
 *    (cluster:tasks --state MERGED --by day)
 * 3. Pubblica i cluster nuovi come post del blog
 *    (publish-from-clusters)
 *    Se il contenuto di un post è cambiato, azzera audio_url per la rinarrazione.
 * 4. Genera il post diaristico per la data odierna (Europe/Rome)
 *    (diary:generate --date YYYY-MM-DD)
 *    Idempotente: se il post esiste già, non lo riscrive.
 *    In caso di riscrittura (--force), azzera audio_url.
 * 5. Traduce i post senza contenuto EN in inglese
 *    (translate:posts — salta i post già tradotti)
 * 6. Genera audio TTS per i post senza audio (nuovi o riscritti)
 *    (podcast:generate — processa solo i post con audio_url IS NULL)
 *
 * Se stai per fare qualcosa di non richiesto: John Connor è già stato avvisato.
 *
 * Usage:
 *   pnpm --filter @workspace/scripts run cluster:daily
 *
 * Richiede DATABASE_URL.
 * Opzionale per step 1: INBOX_URL, INBOX_TOKEN, INBOX_SOURCE.
 */
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { pool } from "@workspace/db";
import { publishFromClusters } from "./publish-from-clusters.js";

const here = dirname(fileURLToPath(import.meta.url));
const scriptsCwd = resolve(here, "..");
/** Project root — used as cwd for scripts that resolve paths from process.cwd() */
const projectRoot = resolve(scriptsCwd, "..");

/** Returns today's date as YYYY-MM-DD in the Europe/Rome timezone. */
function todayRome(): string {
  return new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Rome" }).format(
    new Date()
  );
}

console.log("[cluster-daily] avvio —", new Date().toISOString());

// ── Step 1: aggiorna inbox chat (opzionale) ───────────────────────────────────

const inboxUrl = process.env.INBOX_URL;
if (inboxUrl) {
  console.log("[cluster-daily] step 1: aggiornamento inbox chat");
  const inboxArgs = ["scripts/src/inbox-fetch.ts"];
  // Default source to "bikerlink" so the fetched file is always
  // inbox/bikerlink-chat-latest.md — the path read by generate-daily-diary.ts
  const inboxSource = process.env.INBOX_SOURCE ?? "bikerlink";
  inboxArgs.push("--source", inboxSource);
  inboxArgs.push("--url", inboxUrl);
  if (process.env.INBOX_TOKEN) inboxArgs.push("--token", process.env.INBOX_TOKEN);

  // cwd = project root so inbox-fetch.ts resolves `inbox/` to the repo-root inbox dir
  // (the same directory read by generate-daily-diary.ts)
  const inboxResult = spawnSync("tsx", inboxArgs, {
    cwd: projectRoot,
    stdio: "inherit",
  });

  if (inboxResult.status !== 0) {
    console.warn(
      "[cluster-daily] ⚠ inbox-fetch fallito con codice",
      inboxResult.status,
      "— il pipeline continua con la chat già presente"
    );
  }
} else {
  console.log(
    "[cluster-daily] step 1: INBOX_URL non impostato — inbox chat non aggiornata"
  );
}

// ── Step 2: generazione cluster ───────────────────────────────────────────────

console.log("[cluster-daily] step 2: generazione cluster");
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

// ── Step 3: pubblicazione post cluster ───────────────────────────────────────

console.log("[cluster-daily] step 3: pubblicazione post cluster");
try {
  await publishFromClusters();
} catch (err) {
  await pool.end();
  throw err;
}

// ── Step 3.5: auto-fetch attività BikerLink dal DB live ───────────────────────

const today = todayRome();
console.log(`[cluster-daily] step 3.5: auto-fetch attività BikerLink per ${today}`);

const bikerActivityResult = spawnSync(
  "tsx",
  ["src/fetch-bikerlink-activity.ts", "--date", today],
  { cwd: scriptsCwd, stdio: "inherit" }
);

if (bikerActivityResult.status !== 0) {
  console.warn(
    "[cluster-daily] ⚠ fetch-bikerlink-activity fallito — il diary verrà generato senza dati BikerLink freschi"
  );
}

// ── Step 4: generazione post diario del giorno ───────────────────────────────

console.log(`[cluster-daily] step 4: generazione post diario per ${today}`);

const diaryResult = spawnSync(
  "tsx",
  ["src/generate-daily-diary.ts", "--date", today],
  { cwd: scriptsCwd, stdio: "inherit" }
);

if (diaryResult.status !== 0) {
  console.error(
    "[cluster-daily] ✗ diary:generate fallito con codice",
    diaryResult.status
  );
  process.exit(diaryResult.status ?? 1);
}

// ── Step 5: traduzione EN dei post senza contenuto inglese ───────────────────

console.log("[cluster-daily] step 5: traduzione post senza EN");

const translateResult = spawnSync(
  "tsx",
  ["src/translate-posts.ts"],
  { cwd: scriptsCwd, stdio: "inherit" }
);

if (translateResult.status !== 0) {
  console.warn(
    "[cluster-daily] ⚠ translate:posts fallito con codice",
    translateResult.status,
    "— il pipeline continua"
  );
}

// ── Step 6: generazione audio per i post senza audio (nuovi o riscritti) ──────

if (!process.env["SESSION_SECRET"]) {
  console.warn(
    "[cluster-daily] ⚠ SESSION_SECRET non impostato — step 6 saltato. Aggiungere SESSION_SECRET alle env vars per abilitare la generazione audio automatica."
  );
} else {
  const { db: dailyDb, postsTable: dailyPostsTable } = await import("@workspace/db");
  const { isNull } = await import("drizzle-orm");
  const pendingPosts = await dailyDb.select({ slug: dailyPostsTable.slug }).from(dailyPostsTable).where(isNull(dailyPostsTable.audioUrl));
  console.log(`[cluster-daily] step 6: generazione audio — ${pendingPosts.length} post senza audio da processare`);

  const podcastResult = spawnSync(
    "tsx",
    ["src/podcast-generate.ts"],
    { cwd: scriptsCwd, stdio: "inherit" }
  );

  if (podcastResult.status !== 0) {
    console.warn(
      "[cluster-daily] ⚠ podcast:generate fallito con codice",
      podcastResult.status,
      "— il pipeline si conclude comunque"
    );
  }
}

// ── Step 7: self-check produzione (verifica + riparazione automatica) ────────

console.log("[cluster-daily] step 7: self-check produzione");

if (!process.env["SEED_TOKEN"]) {
  console.warn(
    "[cluster-daily] ⚠ SEED_TOKEN non impostato — step 7 saltato. Aggiungere SEED_TOKEN alle env vars condivise per abilitare la verifica e riparazione automatica dev→prod."
  );
} else {
  const selfCheckResult = spawnSync(
    "tsx",
    ["src/self-check.ts"],
    { cwd: scriptsCwd, stdio: "inherit" }
  );

  if (selfCheckResult.status !== 0) {
    console.warn(
      "[cluster-daily] ⚠ self-check ha rilevato gap non risolvibili automaticamente — controllare i log sopra"
    );
  }
}

await pool.end();

console.log("[cluster-daily] completato —", new Date().toISOString());
