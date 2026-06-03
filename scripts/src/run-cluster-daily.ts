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
 *    Verifica esplicitamente che il post diaristico odierno sia tradotto.
 * 6. Genera audio TTS per i post senza audio (nuovi o riscritti)
 *    (podcast:generate — processa solo i post con audio_url IS NULL)
 * 7. Self-check produzione (verifica + riparazione automatica)
 *
 * Dopo ogni run scrive:
 *   inbox/pipeline-last-run.json         — report strutturato dell'ultima run
 *   inbox/pipeline-history/YYYY-MM-DD.json — archivio storico (ultimi 30)
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
import {
  writeFileSync,
  readFileSync,
  mkdirSync,
  readdirSync,
  unlinkSync,
  existsSync,
} from "node:fs";
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

/** Returns yesterday's date as YYYY-MM-DD in the Europe/Rome timezone. */
function yesterdayRome(): string {
  const d = new Date(Date.now() - 24 * 60 * 60 * 1000);
  return new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Rome" }).format(d);
}

/** Returns the current hour (0-23) in the Europe/Rome timezone. */
function currentHourRome(): number {
  return parseInt(
    new Intl.DateTimeFormat("en-US", {
      timeZone: "Europe/Rome",
      hour: "numeric",
      hour12: false,
    }).format(new Date()),
    10
  );
}

// ── Pipeline Report ───────────────────────────────────────────────────────────

interface StepReport {
  step: number;
  name: string;
  /** ok=completed successfully, warn=completed with warnings, skipped=intentionally not run (missing optional env), failed=hard failure */
  status: "ok" | "warn" | "skipped" | "failed";
  duration_ms: number;
  posts_published?: number;
  audio_generated?: number;
  translations_done?: number;
  errors: string[];
  warnings: string[];
}

interface PipelineReportData {
  date: string;
  run_at: string;
  /** pass=all actionable steps ok, warn=at least one warn, fail=at least one hard failure. Skipped optional steps do not affect this. */
  overall: "pass" | "fail" | "warn";
  duration_ms: number;
  steps: StepReport[];
  totals: {
    posts_published: number;
    audio_generated: number;
    translations_done: number;
    errors: number;
    warnings: number;
  };
}

class PipelineReport {
  private steps: StepReport[] = [];
  private runAt: string;
  private date: string;
  private startTime: number;

  constructor(date: string) {
    this.date = date;
    this.runAt = new Date().toISOString();
    this.startTime = Date.now();
  }

  addStep(result: StepReport): void {
    this.steps.push(result);
  }

  private computeOverall(): "pass" | "fail" | "warn" {
    // Skipped steps (optional env missing) are neutral — they do not affect overall.
    const actionable = this.steps.filter((s) => s.status !== "skipped");
    if (actionable.some((s) => s.status === "failed")) return "fail";
    if (actionable.some((s) => s.status === "warn")) return "warn";
    return "pass";
  }

  write(): void {
    const totalMs = Date.now() - this.startTime;
    const totals = {
      posts_published: this.steps.reduce((s, r) => s + (r.posts_published ?? 0), 0),
      audio_generated: this.steps.reduce((s, r) => s + (r.audio_generated ?? 0), 0),
      translations_done: this.steps.reduce((s, r) => s + (r.translations_done ?? 0), 0),
      errors: this.steps.reduce((s, r) => s + r.errors.length, 0),
      warnings: this.steps.reduce((s, r) => s + r.warnings.length, 0),
    };

    const data: PipelineReportData = {
      date: this.date,
      run_at: this.runAt,
      overall: this.computeOverall(),
      duration_ms: totalMs,
      steps: this.steps,
      totals,
    };

    const inboxDir = resolve(projectRoot, "inbox");
    const historyDir = resolve(inboxDir, "pipeline-history");
    mkdirSync(historyDir, { recursive: true });

    const json = JSON.stringify(data, null, 2);
    writeFileSync(resolve(inboxDir, "pipeline-last-run.json"), json, "utf-8");
    writeFileSync(resolve(historyDir, `${this.date}.json`), json, "utf-8");

    this.pruneHistory(historyDir, 30);

    console.log(
      `[cluster-daily] report scritto — overall=${data.overall} ` +
      `posts=${totals.posts_published} translated=${totals.translations_done} ` +
      `audio=${totals.audio_generated} errors=${totals.errors} warnings=${totals.warnings}`
    );
  }

  private pruneHistory(historyDir: string, maxFiles: number): void {
    if (!existsSync(historyDir)) return;
    const files = readdirSync(historyDir)
      .filter((f) => f.endsWith(".json"))
      .sort()
      .reverse();
    for (const f of files.slice(maxFiles)) {
      try {
        unlinkSync(resolve(historyDir, f));
      } catch {
        /* ignore */
      }
    }
  }
}

// ── DB helpers for counting metrics ──────────────────────────────────────────

async function countPostsWithoutEn(): Promise<number> {
  const { db: d, postsTable: pt } = await import("@workspace/db");
  const { isNull, sql, or } = await import("drizzle-orm");
  const rows = await d
    .select({ count: sql<number>`count(*)` })
    .from(pt)
    .where(or(isNull(pt.bodyEn), sql`trim(${pt.bodyEn}) = ''`));
  return Number(rows[0]?.count ?? 0);
}

async function countPostsWithoutAudio(): Promise<number> {
  const { db: d, postsTable: pt } = await import("@workspace/db");
  const { isNull, sql } = await import("drizzle-orm");
  const rows = await d
    .select({ count: sql<number>`count(*)` })
    .from(pt)
    .where(isNull(pt.audioUrl));
  return Number(rows[0]?.count ?? 0);
}

async function countPosts(): Promise<number> {
  const { db: d, postsTable: pt } = await import("@workspace/db");
  const { sql } = await import("drizzle-orm");
  const rows = await d.select({ count: sql<number>`count(*)` }).from(pt);
  return Number(rows[0]?.count ?? 0);
}

/** Returns true if a diary post for the given date exists in the DB. */
async function diaryPostExists(date: string): Promise<boolean> {
  const { db: d, postsTable: pt } = await import("@workspace/db");
  const { eq } = await import("drizzle-orm");
  const rows = await d
    .select({ id: pt.id })
    .from(pt)
    .where(eq(pt.slug, `diary-${date}`))
    .limit(1);
  return rows.length > 0;
}

/** Returns bodyEn for today's diary post (slug diary-YYYY-MM-DD), or null if not found/untranslated. */
async function getDiaryPostBodyEn(date: string): Promise<string | null | undefined> {
  const { db: d, postsTable: pt } = await import("@workspace/db");
  const { eq } = await import("drizzle-orm");
  const slug = `diary-${date}`;
  const rows = await d
    .select({ bodyEn: pt.bodyEn })
    .from(pt)
    .where(eq(pt.slug, slug))
    .limit(1);
  if (rows.length === 0) return undefined; // post doesn't exist
  return rows[0]?.bodyEn; // null = not yet translated
}

// ── Main ──────────────────────────────────────────────────────────────────────

const today = todayRome();
const report = new PipelineReport(today);

/**
 * Tracks whether any step recorded a hard failure.
 * Steps 2 and 4 previously called process.exit() immediately on failure,
 * which prevented step 7 from running and surfacing additional gaps.
 * Now they set this flag instead so the full pipeline (including self-check)
 * always completes, and we exit non-zero at the very end if needed.
 */
let pipelineHardFailed = false;

console.log("[cluster-daily] avvio —", new Date().toISOString());

// ── Step 1: aggiorna inbox chat (opzionale) ───────────────────────────────────

{
  const stepStart = Date.now();
  const inboxUrl = process.env.INBOX_URL;

  if (!inboxUrl) {
    console.log(
      "[cluster-daily] step 1: INBOX_URL non impostato — inbox chat non aggiornata"
    );
    // Status "skipped" — optional env not set, not a warning
    report.addStep({
      step: 1,
      name: "inbox chat update",
      status: "skipped",
      duration_ms: Date.now() - stepStart,
      errors: [],
      warnings: [],
    });
  } else {
    console.log("[cluster-daily] step 1: aggiornamento inbox chat");
    const inboxArgs = ["scripts/src/inbox-fetch.ts"];
    const inboxSource = process.env.INBOX_SOURCE ?? "bikerlink";
    inboxArgs.push("--source", inboxSource);
    inboxArgs.push("--url", inboxUrl);
    if (process.env.INBOX_TOKEN) inboxArgs.push("--token", process.env.INBOX_TOKEN);

    const inboxResult = spawnSync("tsx", inboxArgs, {
      cwd: projectRoot,
      stdio: "inherit",
    });

    const warnings: string[] = [];
    if (inboxResult.status !== 0) {
      warnings.push(`inbox-fetch exited with code ${inboxResult.status}`);
      console.warn(
        "[cluster-daily] ⚠ inbox-fetch fallito con codice",
        inboxResult.status,
        "— il pipeline continua con la chat già presente"
      );
    }
    report.addStep({
      step: 1,
      name: "inbox chat update",
      status: inboxResult.status === 0 ? "ok" : "warn",
      duration_ms: Date.now() - stepStart,
      errors: [],
      warnings,
    });
  }
}

// ── Step 2: generazione cluster ───────────────────────────────────────────────

{
  const stepStart = Date.now();
  console.log("[cluster-daily] step 2: generazione cluster");
  const clusterResult = spawnSync(
    "tsx",
    ["src/cluster-tasks.ts", "--state", "MERGED", "--by", "day"],
    { cwd: scriptsCwd, stdio: "inherit" }
  );

  if (clusterResult.status !== 0) {
    const errMsg = `cluster-tasks exited with code ${clusterResult.status}`;
    console.error("[cluster-daily]", errMsg, "— pipeline continua per permettere al self-check di rilevare gap");
    pipelineHardFailed = true;
    report.addStep({
      step: 2,
      name: "cluster generation",
      status: "failed",
      duration_ms: Date.now() - stepStart,
      errors: [errMsg],
      warnings: [],
    });
  } else {
    report.addStep({
      step: 2,
      name: "cluster generation",
      status: "ok",
      duration_ms: Date.now() - stepStart,
      errors: [],
      warnings: [],
    });
  }
}

// ── Step 3: pubblicazione post cluster ───────────────────────────────────────

{
  const stepStart = Date.now();
  console.log("[cluster-daily] step 3: pubblicazione post cluster");
  const postsBefore = await countPosts();

  try {
    await publishFromClusters();
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : String(err);
    console.error("[cluster-daily] ✗ publishFromClusters fallito:", errMsg);
    report.addStep({
      step: 3,
      name: "cluster posts publish",
      status: "failed",
      duration_ms: Date.now() - stepStart,
      errors: [errMsg],
      warnings: [],
    });
    report.write();
    await pool.end();
    throw err;
  }

  const postsAfter = await countPosts();
  report.addStep({
    step: 3,
    name: "cluster posts publish",
    status: "ok",
    duration_ms: Date.now() - stepStart,
    posts_published: Math.max(0, postsAfter - postsBefore),
    errors: [],
    warnings: [],
  });
}

// ── Step 3.5: auto-fetch attività BikerLink dal DB live ───────────────────────

{
  const stepStart = Date.now();
  console.log(`[cluster-daily] step 3.5: auto-fetch attività BikerLink per ${today}`);

  // Cancella le note auto-generate di oggi prima di riscriverle, così ogni
  // sera partono dai dati freschi del giorno (le note manuali NON vengono
  // toccate — fetch-bikerlink-activity le sovrascrive solo se auto-generate).
  const todayNotesPath = resolve(projectRoot, "inbox", `diary-notes-${today}.md`);
  try {
    if (existsSync(todayNotesPath)) {
      const existing = readFileSync(todayNotesPath, "utf8");
      if (existing.includes("(auto-generate da BikerLink)")) {
        unlinkSync(todayNotesPath);
        console.log(`[cluster-daily] step 3.5: rimosso diary-notes-${today}.md auto-generato (verrà riscritto)`);
      }
    }
  } catch { /* ignore */ }

  const bikerActivityResult = spawnSync(
    "tsx",
    ["src/fetch-bikerlink-activity.ts", "--date", today],
    { cwd: scriptsCwd, stdio: "inherit" }
  );

  const warnings: string[] = [];
  if (bikerActivityResult.status !== 0) {
    warnings.push(
      `fetch-bikerlink-activity exited with code ${bikerActivityResult.status}`
    );
    console.warn(
      "[cluster-daily] ⚠ fetch-bikerlink-activity fallito — il diary verrà generato senza dati BikerLink freschi"
    );
  }
  report.addStep({
    step: 3.5,
    name: "BikerLink activity fetch",
    status: bikerActivityResult.status === 0 ? "ok" : "warn",
    duration_ms: Date.now() - stepStart,
    errors: [],
    warnings,
  });
}

// ── Step 3.75: catch-up giorno precedente (pipeline partita dopo mezzanotte) ──
// Se la pipeline gira tra le 00:00 e le 01:59 ora italiana, il task scheduler
// ha sforato mezzanotte. In quel caso il "giorno corrente" è già il giorno
// successivo rispetto alla notte programmata: verifichiamo che il diario
// di ieri esista e, se manca, lo generiamo subito.

{
  const stepStart = Date.now();
  const hour = currentHourRome();
  const yesterday = yesterdayRome();
  const CATCHUP_WINDOW_END = 2; // ore 00:00–01:59 Roma

  if (hour < CATCHUP_WINDOW_END) {
    console.log(
      `[cluster-daily] step 3.75: pipeline partita dopo mezzanotte (ora Roma: ${hour}:xx) — ` +
      `verifico diary-${yesterday}`
    );

    const exists = await diaryPostExists(yesterday);

    if (exists) {
      console.log(`[cluster-daily] step 3.75: diary-${yesterday} già presente — nessun catch-up necessario`);
      report.addStep({
        step: 3.75,
        name: "previous-day diary catch-up",
        status: "skipped",
        duration_ms: Date.now() - stepStart,
        errors: [],
        warnings: [],
      });
    } else {
      console.log(`[cluster-daily] step 3.75: diary-${yesterday} MANCANTE — avvio catch-up`);

      const catchupWarnings: string[] = [];
      const catchupErrors: string[] = [];

      // 3.75a — fetch attività BikerLink per ieri
      const yesterdayNotesPath = resolve(projectRoot, "inbox", `diary-notes-${yesterday}.md`);
      try {
        if (existsSync(yesterdayNotesPath)) {
          const existing = readFileSync(yesterdayNotesPath, "utf8");
          if (existing.includes("(auto-generate da BikerLink)")) {
            unlinkSync(yesterdayNotesPath);
          }
        }
      } catch { /* ignore */ }

      const activityResult = spawnSync(
        "tsx",
        ["src/fetch-bikerlink-activity.ts", "--date", yesterday],
        { cwd: scriptsCwd, stdio: "inherit" }
      );
      if (activityResult.status !== 0) {
        catchupWarnings.push(`fetch-bikerlink-activity per ${yesterday} exited with code ${activityResult.status}`);
      }

      // 3.75b — genera il diario di ieri (senza --force: è nuovo, non va sovrascritto)
      const postsBefore375 = await countPosts();
      const diaryResult375 = spawnSync(
        "tsx",
        ["src/generate-daily-diary.ts", "--date", yesterday],
        { cwd: scriptsCwd, stdio: "inherit" }
      );

      if (diaryResult375.status !== 0) {
        const errMsg = `diary:generate per ${yesterday} exited with code ${diaryResult375.status}`;
        catchupErrors.push(errMsg);
        console.error("[cluster-daily] ✗ step 3.75:", errMsg);
      } else {
        const postsAfter375 = await countPosts();
        if (postsAfter375 > postsBefore375) {
          console.log(`[cluster-daily] step 3.75: ✓ diary-${yesterday} creato (catch-up completato)`);
        } else {
          console.log(`[cluster-daily] step 3.75: diary-${yesterday} già esistente dopo generazione (idempotente)`);
        }
      }

      report.addStep({
        step: 3.75,
        name: "previous-day diary catch-up",
        status: catchupErrors.length > 0 ? "failed" : catchupWarnings.length > 0 ? "warn" : "ok",
        duration_ms: Date.now() - stepStart,
        posts_published: catchupErrors.length === 0 ? 1 : 0,
        errors: catchupErrors,
        warnings: catchupWarnings,
      });
    }
  }
  // Se non siamo nella finestra di catch-up, lo step non viene registrato nel report
  // (pipeline nel suo orario normale — nessun rumore aggiuntivo).
}

// ── Step 4: generazione post diario del giorno ───────────────────────────────
// Tracks whether a new diary post was created so step 5 can verify it gets translated.

let diaryPostCreatedThisRun = false;

{
  const stepStart = Date.now();
  console.log(`[cluster-daily] step 4: generazione post diario per ${today}`);
  const postsBefore = await countPosts();

  const diaryResult = spawnSync(
    "tsx",
    ["src/generate-daily-diary.ts", "--date", today, "--force"],
    { cwd: scriptsCwd, stdio: "inherit" }
  );

  if (diaryResult.status !== 0) {
    const errMsg = `diary:generate exited with code ${diaryResult.status}`;
    console.error("[cluster-daily] ✗", errMsg, "— pipeline continua per permettere al self-check di rilevare gap");
    pipelineHardFailed = true;
    report.addStep({
      step: 4,
      name: "diary post generation",
      status: "failed",
      duration_ms: Date.now() - stepStart,
      errors: [errMsg],
      warnings: [],
    });
    // Skip the rest of this block — postsAfter would be inaccurate
  } else {

  const postsAfter = await countPosts();
  const newPostsCount = Math.max(0, postsAfter - postsBefore);
  // Con --force il post viene sempre riscritto, anche se esisteva già.
  // diaryPostCreatedThisRun = true garantisce che step 5 verifichi la traduzione.
  diaryPostCreatedThisRun = true;

  if (newPostsCount > 0) {
    console.log(`[cluster-daily] step 4: nuovo post diaristico creato (diary-${today})`);
  } else {
    console.log(`[cluster-daily] step 4: post diaristico aggiornato con --force (diary-${today})`);
  }

  // Controllo sparsità — due segnali complementari:
  // 1. DETERMINISTICO: note sorgente con sezione "Limiti" (fonti mancanti a priori)
  // 2. PROBABILISTICO:  excerpt/content del post generato contiene pattern da dati scarsi
  const step4Warnings: string[] = [];
  const SPARSE_PATTERNS_STEP4 = [
    "dati di sviluppo non sono stati acquisiti",
    "per questo giorno i dati non ci sono",
    "nessun dato disponibile",
    "lacuna nella documentazione",
  ];
  try {
    // Segnale 1: note sorgente
    const notesFilePath = resolve(projectRoot, "inbox", `diary-notes-${today}.md`);
    if (existsSync(notesFilePath)) {
      const notesContent = readFileSync(notesFilePath, "utf8");
      if (notesContent.includes("## Limiti di questo report")) {
        const msg = `diary-${today}: fonti incomplete segnalate nelle note ("Limiti" presente) — potrebbe richiedere revisione`;
        step4Warnings.push(msg);
        console.warn(`[cluster-daily] ⚠ DIARY-SPARSE (fonti): ${msg}`);
      }
    } else {
      const msg = `diary-${today}: generato senza note di contesto (nessuna fonte disponibile)`;
      step4Warnings.push(msg);
      console.warn(`[cluster-daily] ⚠ DIARY-SPARSE (no note): ${msg}`);
    }

    // Segnale 2: pattern nel contenuto generato (excerpt + content)
    const { db: d2, postsTable: pt2 } = await import("@workspace/db");
    const { eq: eq2 } = await import("drizzle-orm");
    const rows2 = await d2
      .select({ excerpt: pt2.excerpt, content: pt2.content })
      .from(pt2)
      .where(eq2(pt2.slug, `diary-${today}`))
      .limit(1);
    const postText = ((rows2[0]?.excerpt ?? "") + " " + (rows2[0]?.content ?? "")).toLowerCase();
    const matched = SPARSE_PATTERNS_STEP4.find((p) => postText.includes(p));
    if (matched) {
      const msg = `diary-${today}: testo generato sembra da dati insufficienti (pattern: "${matched}") — richiede revisione`;
      // Evita duplicati: aggiungi solo se non è già stato segnalato da segnale 1
      if (step4Warnings.length === 0) step4Warnings.push(msg);
      else step4Warnings[0] = step4Warnings[0] + `; pattern nel testo: "${matched}"`;
      console.warn(`[cluster-daily] ⚠ DIARY-SPARSE (testo): ${msg}`);
    }
  } catch {
    // non bloccante
  }

  report.addStep({
    step: 4,
    name: "diary post generation",
    status: step4Warnings.length > 0 ? "warn" : "ok",
    duration_ms: Date.now() - stepStart,
    posts_published: newPostsCount,
    errors: [],
    warnings: step4Warnings,
  });

  } // end else (diaryResult.status === 0)
}

// ── Step 5: traduzione EN dei post senza contenuto inglese ───────────────────
// If a new diary post was created in step 4, explicitly verify it gets translated.

{
  const stepStart = Date.now();
  console.log("[cluster-daily] step 5: traduzione post senza EN");
  const untranslatedBefore = await countPostsWithoutEn();

  const translateResult = spawnSync(
    "tsx",
    ["src/translate-posts.ts"],
    { cwd: scriptsCwd, stdio: "inherit" }
  );

  const warnings: string[] = [];
  const errors: string[] = [];

  if (translateResult.status !== 0) {
    const msg = `translate:posts exited with code ${translateResult.status}`;
    warnings.push(msg);
    console.warn("[cluster-daily] ⚠", msg, "— il pipeline continua");
  }

  const untranslatedAfter = await countPostsWithoutEn();
  const translationsDone = Math.max(0, untranslatedBefore - untranslatedAfter);

  // Zero-output anomaly: work existed but nothing was translated
  if (untranslatedBefore > 0 && translationsDone === 0 && translateResult.status === 0) {
    const msg = `Expected to translate ${untranslatedBefore} post(s) but none were translated`;
    warnings.push(msg);
    console.warn("[cluster-daily] ⚠", msg);
  }

  // Diary guard: if a new diary post was created this run, verify it got translated
  if (diaryPostCreatedThisRun) {
    const diaryBodyEn = await getDiaryPostBodyEn(today);
    if (diaryBodyEn === null || (typeof diaryBodyEn === "string" && diaryBodyEn.trim().length === 0)) {
      const msg = `diary-${today} was created this run but body_en is still null/empty after translation step`;
      warnings.push(msg);
      console.warn("[cluster-daily] ⚠", msg);
    } else if (diaryBodyEn !== undefined) {
      console.log(`[cluster-daily] step 5: diary-${today} confermato tradotto`);
    }
  }

  report.addStep({
    step: 5,
    name: "EN translation",
    status: warnings.length > 0 || errors.length > 0 ? "warn" : "ok",
    duration_ms: Date.now() - stepStart,
    translations_done: translationsDone,
    errors,
    warnings,
  });
}

// ── Step 6: generazione audio per i post senza audio (nuovi o riscritti) ──────

{
  const stepStart = Date.now();

  if (!process.env["SESSION_SECRET"]) {
    console.warn(
      "[cluster-daily] ⚠ SESSION_SECRET non impostato — step 6 saltato."
    );
    // Status "skipped" — optional env not set, not a warning
    report.addStep({
      step: 6,
      name: "audio generation",
      status: "skipped",
      duration_ms: Date.now() - stepStart,
      audio_generated: 0,
      errors: [],
      warnings: [],
    });
  } else {
    const pendingBefore = await countPostsWithoutAudio();
    console.log(
      `[cluster-daily] step 6: generazione audio — ${pendingBefore} post senza audio da processare`
    );

    const podcastResult = spawnSync(
      "tsx",
      ["src/podcast-generate.ts"],
      { cwd: scriptsCwd, stdio: "inherit" }
    );

    const warnings: string[] = [];

    if (podcastResult.status !== 0) {
      const msg = `podcast:generate exited with code ${podcastResult.status}`;
      warnings.push(msg);
      console.warn("[cluster-daily] ⚠", msg, "— il pipeline si conclude comunque");
    }

    const pendingAfter = await countPostsWithoutAudio();
    const audioGenerated = Math.max(0, pendingBefore - pendingAfter);

    // Zero-output anomaly: work existed but no audio was generated
    if (pendingBefore > 0 && audioGenerated === 0 && podcastResult.status === 0) {
      const msg = `Expected to generate audio for ${pendingBefore} post(s) but none were processed`;
      warnings.push(msg);
      console.warn("[cluster-daily] ⚠", msg);
    }

    report.addStep({
      step: 6,
      name: "audio generation",
      status: warnings.length > 0 ? "warn" : "ok",
      duration_ms: Date.now() - stepStart,
      audio_generated: audioGenerated,
      errors: [],
      warnings,
    });
  }
}

// ── Step 7: self-check produzione (verifica + riparazione automatica) ────────

{
  const stepStart = Date.now();
  console.log("[cluster-daily] step 7: self-check produzione");

  if (!process.env["SEED_TOKEN"]) {
    console.warn(
      "[cluster-daily] ⚠ SEED_TOKEN non impostato — step 7 saltato."
    );
    // Status "skipped" — optional env not set, not a warning
    report.addStep({
      step: 7,
      name: "production self-check",
      status: "skipped",
      duration_ms: Date.now() - stepStart,
      errors: [],
      warnings: [],
    });
  } else {
    const selfCheckResult = spawnSync(
      "tsx",
      ["src/self-check.ts"],
      { cwd: scriptsCwd, stdio: "inherit" }
    );

    const warnings: string[] = [];
    // exit 0 = tutto ok
    // exit 1 = hard failure (gap non risolvibili)
    // exit 2 = soft warning (DIARY-SPARSE: post generato da dati insufficienti)
    if (selfCheckResult.status === 1) {
      warnings.push("self-check: gap non risolvibili in produzione (hard failure)");
      console.warn("[cluster-daily] ⚠ self-check ha rilevato gap non risolvibili automaticamente");
    } else if (selfCheckResult.status === 2) {
      warnings.push("self-check: DIARY-SPARSE — post diaristico generato da dati insufficienti, richiede revisione manuale");
      console.warn("[cluster-daily] ⚠ self-check: DIARY-SPARSE rilevato in produzione");
    }

    report.addStep({
      step: 7,
      name: "production self-check",
      status: selfCheckResult.status === 0 ? "ok" : "warn",
      duration_ms: Date.now() - stepStart,
      errors: [],
      warnings,
    });
  }
}

// ── Scrivi il report e termina ────────────────────────────────────────────────

report.write();
await pool.end();

console.log("[cluster-daily] completato —", new Date().toISOString());

// Exit non-zero if any step had a hard failure so cron schedulers and
// monitoring tools see the pipeline didn't fully succeed.
if (pipelineHardFailed) {
  process.exit(1);
}
