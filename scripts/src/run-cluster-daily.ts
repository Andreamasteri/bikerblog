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
 * 7.5. Reindicizzazione semantica Nadir (POST /reindex) — mantiene l'indice
 *    allineato ai contenuti pubblicati; silenzioso in caso di successo,
 *    saltato se non configurato, warn non fatale se irraggiungibile.
 * 9. Connettività Horus/Bowie sul tunnel Cloudflare reale contro PROD_URL
 *    (riusa horus-sse-smoke.ts — Task #104); silenzioso se non configurato,
 *    un fallimento reale finisce nella notifica di fallimento pipeline.
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
import { sendPipelineAlert } from "./notify.js";

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

/** Returns the last N days before today (excluding today) as YYYY-MM-DD, oldest first. */
function lastNDatesRome(n: number): string[] {
  const fmt = new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Rome" });
  const dates: string[] = [];
  for (let i = n; i >= 1; i--) {
    const d = new Date(Date.now() - i * 24 * 60 * 60 * 1000);
    dates.push(fmt.format(d));
  }
  return dates;
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

  write(): PipelineReportData {
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

    return data;
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

// ── Nadir semantic reindex helper ────────────────────────────────────────────

interface NadirReindexResult {
  status: "ok" | "skipped" | "warn";
  detail: string;
}

/**
 * Chiama POST /reindex su Nadir per ricostruire l'indice semantico dai
 * contenuti pubblicati. Tollerante come gli altri step opzionali: se
 * NADIR_URL/NADIR_GATE_TOKEN non sono configurati lo step è "skipped"; se
 * Nadir è irraggiungibile o risponde con errore è "warn" (non blocca la
 * pipeline, non genera alert). Il servizio scrive heartbeat di spazi bianchi
 * durante il lavoro (ignorati da JSON.parse), quindi res.json() gestisce
 * comunque il body finale anche per reindicizzazioni lunghe.
 */
async function reindexNadir(): Promise<NadirReindexResult> {
  const baseUrl = process.env["NADIR_URL"];
  const gateToken = process.env["NADIR_GATE_TOKEN"];
  if (!baseUrl || !gateToken) {
    return { status: "skipped", detail: "NADIR_URL/NADIR_GATE_TOKEN non configurati" };
  }

  // 5 min: l'embedding di tutti i documenti può essere lento; il tunnel resta
  // vivo grazie agli heartbeat scritti da Nadir durante il lavoro.
  const REINDEX_TIMEOUT_MS = 5 * 60 * 1000;
  try {
    const res = await fetch(`${baseUrl.replace(/\/$/, "")}/reindex`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Nadir-Gate-Token": gateToken,
      },
      body: "{}",
      signal: AbortSignal.timeout(REINDEX_TIMEOUT_MS),
    });
    const data = (await res.json().catch(() => ({}))) as {
      result?: { indexed?: number };
      error?: string;
    };
    if (!res.ok || data.error) {
      return {
        status: "warn",
        detail: `Nadir /reindex ha risposto con errore (HTTP ${res.status}): ${data.error ?? "errore sconosciuto"}`,
      };
    }
    const indexed = data.result?.indexed ?? 0;
    return { status: "ok", detail: `indice ricostruito — ${indexed} documenti` };
  } catch (err) {
    return {
      status: "warn",
      detail: `Nadir /reindex irraggiungibile: ${err instanceof Error ? err.message : String(err)}`,
    };
  }
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

/**
 * Operational failures that only surface as a "warn" step status (so they
 * don't flip overall to "fail" and don't stop the pipeline) but still
 * represent a real broken run — e.g. translate/podcast scripts exiting
 * non-zero, or self-check reporting an unresolved production gap. These
 * must still trigger the failure notification even when posts/audio were
 * produced elsewhere in the same run.
 */
const criticalWarnings: string[] = [];

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
  let clusterAuditFlagged: string[] = [];

  try {
    const result = await publishFromClusters();
    clusterAuditFlagged = result.flagged;
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : String(err);
    console.error(
      "[cluster-daily] ✗ publishFromClusters fallito:", errMsg,
      "— pipeline continua per permettere al self-check di rilevare gap e inviare la notifica di fallimento"
    );
    pipelineHardFailed = true;
    report.addStep({
      step: 3,
      name: "cluster posts publish",
      status: "failed",
      duration_ms: Date.now() - stepStart,
      errors: [errMsg],
      warnings: [],
    });
  }

  const postsAfter = await countPosts();
  const step3Warnings = clusterAuditFlagged.map(
    (slug) => `AUDIT: ${slug} contiene termini vietati — messo in stato draft`
  );
  if (step3Warnings.length > 0) {
    criticalWarnings.push(`step 3 (cluster posts publish): ${step3Warnings.join("; ")}`);
  }
  report.addStep({
    step: 3,
    name: "cluster posts publish",
    status: step3Warnings.length > 0 ? "warn" : "ok",
    duration_ms: Date.now() - stepStart,
    posts_published: Math.max(0, postsAfter - postsBefore),
    errors: [],
    warnings: step3Warnings,
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

// ── Step 3.8: catch-up multi-giorno ──────────────────────────────────────────
// Controlla gli ultimi 7 giorni (escluso oggi) e genera i diari mancanti.
// Copre il caso in cui il cron del deployment salti più notti di fila
// (es. deployment offline, container bloccato). Idempotente: salta i giorni
// che hanno già il post. Si attiva sempre, indipendentemente dall'orario.

{
  const stepStart = Date.now();
  const LOOKBACK_DAYS = 7;
  const pastDates = lastNDatesRome(LOOKBACK_DAYS);

  // Verifica quali date mancano nel DB
  const missingDates: string[] = [];
  for (const d of pastDates) {
    const exists = await diaryPostExists(d);
    if (!exists) missingDates.push(d);
  }

  if (missingDates.length === 0) {
    // Nessun gap — step silenzioso (non registrato nel report)
  } else {
    console.log(
      `[cluster-daily] step 3.8: ${missingDates.length} diari mancanti negli ultimi ${LOOKBACK_DAYS} giorni — avvio catch-up: ${missingDates.join(", ")}`
    );

    const catchupWarnings: string[] = [];
    const catchupErrors: string[] = [];
    let catchupCreated = 0;

    for (const d of missingDates) {
      console.log(`[cluster-daily] step 3.8: recupero diary-${d}`);

      // 3.8a — fetch attività BikerLink per il giorno mancante
      const notesPath = resolve(projectRoot, "inbox", `diary-notes-${d}.md`);
      try {
        if (existsSync(notesPath)) {
          const existing = readFileSync(notesPath, "utf8");
          if (existing.includes("(auto-generate da BikerLink)")) {
            unlinkSync(notesPath);
          }
        }
      } catch { /* ignore */ }

      const actRes = spawnSync(
        "tsx",
        ["src/fetch-bikerlink-activity.ts", "--date", d],
        { cwd: scriptsCwd, stdio: "inherit" }
      );
      if (actRes.status !== 0) {
        catchupWarnings.push(`fetch-bikerlink-activity per ${d} exited with code ${actRes.status}`);
      }

      // 3.8b — genera il post del giorno mancante
      const postsBefore = await countPosts();
      const diaryRes = spawnSync(
        "tsx",
        ["src/generate-daily-diary.ts", "--date", d],
        { cwd: scriptsCwd, stdio: "inherit" }
      );

      if (diaryRes.status !== 0) {
        catchupErrors.push(`diary:generate per ${d} exited with code ${diaryRes.status}`);
        console.error(`[cluster-daily] ✗ step 3.8: diary-${d} fallito`);
      } else {
        const postsAfter = await countPosts();
        if (postsAfter > postsBefore) {
          catchupCreated++;
          console.log(`[cluster-daily] step 3.8: ✓ diary-${d} creato`);
        }
      }
    }

    report.addStep({
      step: 3.8,
      name: "multi-day diary catch-up",
      status: catchupErrors.length > 0 ? "failed" : catchupWarnings.length > 0 ? "warn" : "ok",
      duration_ms: Date.now() - stepStart,
      posts_published: catchupCreated,
      errors: catchupErrors,
      warnings: catchupWarnings,
    });

    console.log(
      `[cluster-daily] step 3.8: completato — creati: ${catchupCreated}/${missingDates.length}, errori: ${catchupErrors.length}`
    );
  }
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
    criticalWarnings.push(`step 5 (EN translation): ${msg}`);
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
      criticalWarnings.push(`step 6 (audio generation): ${msg}`);
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
      const msg = "self-check: gap non risolvibili in produzione (hard failure)";
      warnings.push(msg);
      criticalWarnings.push(`step 7 (production self-check): ${msg}`);
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

// ── Step 7.5: reindicizzazione semantica Nadir ───────────────────────────────
// Dopo che i contenuti sono stati pubblicati/aggiornati e sincronizzati in
// produzione (step 3–7), ricostruisce l'indice di Nadir (POST /reindex) così la
// ricerca semantica resta allineata al blog senza bisogno di un trigger manuale.
// Silenzioso in caso di successo; saltato se Nadir non è configurato; warn non
// fatale se irraggiungibile (stessa tolleranza di inbox/changelog: non genera
// alert e non fa fallire la pipeline).

{
  const stepStart = Date.now();
  console.log("[cluster-daily] step 7.5: reindicizzazione semantica Nadir");

  const nadir = await reindexNadir();

  if (nadir.status === "skipped") {
    console.log(`[cluster-daily] step 7.5: SKIP — ${nadir.detail}`);
  } else if (nadir.status === "warn") {
    console.warn(
      `[cluster-daily] ⚠ step 7.5: ${nadir.detail} — il resto della pipeline non è compromesso`
    );
  } else {
    console.log(`[cluster-daily] step 7.5: ${nadir.detail}`);
  }

  report.addStep({
    step: 7.5,
    name: "Nadir semantic reindex",
    status: nadir.status,
    duration_ms: Date.now() - stepStart,
    errors: [],
    warnings: nadir.status === "warn" ? [nadir.detail] : [],
  });
}

// ── Step 8: riepilogo audit contenuti ────────────────────────────────────────
// Segnala tutti i post attualmente in stato "draft" (bloccati dall'audit
// automatico dei termini vietati) così restano visibili nel report anche se
// sono stati creati da uno step lanciato come sottoprocesso (diary:generate).

{
  const stepStart = Date.now();
  const { db: d3, postsTable: pt3 } = await import("@workspace/db");
  const { eq: eq3 } = await import("drizzle-orm");
  const draftRows = await d3
    .select({ slug: pt3.slug })
    .from(pt3)
    .where(eq3(pt3.status, "draft"));

  if (draftRows.length > 0) {
    const draftSlugs = draftRows.map((r) => r.slug);
    console.warn(
      `[cluster-daily] step 8: ⚠ ${draftSlugs.length} post in stato draft (bloccati dall'audit contenuti): ${draftSlugs.join(", ")}`
    );
    criticalWarnings.push(
      `step 8 (content audit summary): ${draftSlugs.length} post in draft (${draftSlugs.join(", ")})`
    );
    report.addStep({
      step: 8,
      name: "content audit summary",
      status: "warn",
      duration_ms: Date.now() - stepStart,
      errors: [],
      warnings: draftSlugs.map((slug) => `${slug} è in draft — richiede revisione manuale prima della pubblicazione`),
    });
  }
}

// ── Step 9: connettività Horus/Bowie (tunnel Cloudflare reale) ───────────────
// Riusa la stessa logica di `horus:sse-smoke` (Task #104) ma la chiama contro
// PROD_URL invece che localhost: questo processo cron gira separato dal
// workflow dell'api-server, quindi l'unico modo di verificare il tunnel reale
// è colpire il dominio pubblico, come fa già il self-check per seed-posts.
// Silenzioso se HORUS_CHAT_PASSWORD/HORUS_OLLAMA_URL non sono configurati
// (nessun Horus in questo ambiente); un fallimento reale finisce nei
// criticalWarnings così la notifica di fallimento pipeline scatta comunque.

{
  const stepStart = Date.now();
  console.log("[cluster-daily] step 9: connettività Horus/Bowie (tunnel reale)");

  const { runHorusSseSmoke } = await import("./horus-sse-smoke.js");
  const prodUrl = process.env["PROD_URL"] ?? "https://bikerlink-blog.replit.app";
  const outcome = await runHorusSseSmoke({ apiBaseUrl: prodUrl });

  if (outcome.skipped) {
    console.log(`[cluster-daily] step 9: SKIP — ${outcome.skipReason}`);
    report.addStep({
      step: 9,
      name: "Horus/Bowie connectivity check",
      status: "skipped",
      duration_ms: Date.now() - stepStart,
      errors: [],
      warnings: [],
    });
  } else {
    const failed = outcome.results.filter((r) => !r.ok);
    const warnings = failed.map((r) => `${r.name}: ${r.detail}`);

    for (const r of outcome.results) {
      console.log(`[cluster-daily] step 9: ${r.ok ? "OK  " : "FAIL"} ${r.name} — ${r.detail}`);
    }

    if (warnings.length > 0) {
      const msg = `${failed.length}/${outcome.results.length} endpoint Horus/Bowie senza eventi reali entro il timeout`;
      criticalWarnings.push(`step 9 (Horus/Bowie connectivity): ${msg} — ${warnings.join("; ")}`);
      console.warn("[cluster-daily] ⚠", msg);
    }

    report.addStep({
      step: 9,
      name: "Horus/Bowie connectivity check",
      status: warnings.length > 0 ? "warn" : "ok",
      duration_ms: Date.now() - stepStart,
      errors: [],
      warnings,
    });
  }
}

// ── Step 10: aggiorna il changelog di sincronizzazione BikerLink ─────────────
// Rigenera la sezione automatica di docs/bikerlink-sync-changelog.md dai commit
// git successivi al backfill iniziale. Deterministico e idempotente: se non ci
// sono commit nuovi, il file resta invariato. Non blocca mai la pipeline.

{
  const stepStart = Date.now();
  console.log("[cluster-daily] step 10: aggiornamento changelog sincronizzazione BikerLink");

  const changelogResult = spawnSync("tsx", ["src/update-sync-changelog.ts"], {
    cwd: scriptsCwd,
    stdio: "inherit",
  });

  const warnings: string[] = [];
  if (changelogResult.status !== 0) {
    warnings.push(`update-sync-changelog exited with code ${changelogResult.status}`);
    console.warn(
      "[cluster-daily] ⚠ update-sync-changelog fallito — il changelog non è stato aggiornato, il resto della pipeline non è compromesso"
    );
  }
  report.addStep({
    step: 10,
    name: "BikerLink sync changelog update",
    status: changelogResult.status === 0 ? "ok" : "warn",
    duration_ms: Date.now() - stepStart,
    errors: [],
    warnings,
  });
}

// ── Scrivi il report ─────────────────────────────────────────────────────────

const reportData = report.write();

// ── Notifica in caso di fallimento o pipeline inaspettatamente silenziosa ────
// Silent-on-success: nessuna notifica se overall === "pass" e qualcosa è stato
// effettivamente prodotto (o gli step erano legittimamente skippati/vuoti).

{
  const failedSteps = reportData.steps
    .filter((s) => s.status === "failed")
    .map((s) => s.name);

  // "Pipeline silenziosa": nessun post pubblicato E nessun audio generato,
  // pur avendo eseguito almeno uno step non skippato (altrimenti sarebbe
  // solo un giorno senza nulla da fare, non un'anomalia).
  const ranAnyActionableStep = reportData.steps.some((s) => s.status !== "skipped");
  const silentRun =
    ranAnyActionableStep &&
    reportData.totals.posts_published === 0 &&
    reportData.totals.audio_generated === 0;

  const shouldAlert =
    reportData.overall === "fail" || silentRun || criticalWarnings.length > 0;

  if (shouldAlert) {
    const reasons: string[] = [];
    if (reportData.overall === "fail") reasons.push("FALLITA");
    if (silentRun) reasons.push("SILENZIOSA (0 post pubblicati, 0 audio generati)");
    if (criticalWarnings.length > 0) {
      reasons.push(`STEP CRITICI IN WARNING (${criticalWarnings.length})`);
    }
    const reason = reasons.join(" + ");

    console.log(`[cluster-daily] anomalia rilevata (${reason}) — invio notifica`);

    const allErrors = reportData.steps.flatMap((s) => s.errors);
    const allWarnings = [...reportData.steps.flatMap((s) => s.warnings), ...criticalWarnings];
    const failedOrCriticalSteps = Array.from(
      new Set([...failedSteps, ...criticalWarnings.map((c) => c.split(":")[0]?.trim() ?? c)])
    );

    try {
      await sendPipelineAlert({
        date: reportData.date,
        reason,
        failedSteps: failedOrCriticalSteps,
        postsPublished: reportData.totals.posts_published,
        audioGenerated: reportData.totals.audio_generated,
        translationsDone: reportData.totals.translations_done,
        errors: allErrors,
        warnings: allWarnings,
      });
    } catch (err) {
      // La notifica non deve mai far fallire la pipeline.
      console.error(
        "[cluster-daily] invio notifica fallito:",
        err instanceof Error ? err.message : String(err)
      );
    }
  }
}

await pool.end();

console.log("[cluster-daily] completato —", new Date().toISOString());

// Exit non-zero if any step had a hard failure so cron schedulers and
// monitoring tools see the pipeline didn't fully succeed.
if (pipelineHardFailed) {
  process.exit(1);
}
