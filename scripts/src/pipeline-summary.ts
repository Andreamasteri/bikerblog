#!/usr/bin/env tsx
/**
 * pipeline-summary — reads the last N daily pipeline reports from
 * inbox/pipeline-history/ and prints a trend table.
 *
 * Usage:
 *   pnpm --filter @workspace/scripts run pipeline:summary
 *   pnpm --filter @workspace/scripts run pipeline:summary -- --days 14
 *
 * Exit codes:
 *   0 — table printed successfully (even if some days have failures)
 *   1 — no history files found at all
 */
import { readdirSync, readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { dirname } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const projectRoot = resolve(here, "..", "..");
const historyDir = resolve(projectRoot, "inbox", "pipeline-history");

interface StepReport {
  step: number;
  name: string;
  status: "ok" | "warn" | "skipped" | "failed";
  duration_ms: number;
  posts_published?: number;
  audio_generated?: number;
  translations_done?: number;
  errors: string[];
  warnings: string[];
}

interface PipelineReport {
  date: string;
  run_at: string;
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

// ── CLI args ──────────────────────────────────────────────────────────────────

const args = process.argv.slice(2);
let days = 7;
for (let i = 0; i < args.length; i++) {
  if ((args[i] === "--days" || args[i] === "-n") && args[i + 1]) {
    const parsed = parseInt(args[i + 1], 10);
    if (!isNaN(parsed) && parsed > 0) days = parsed;
    i++;
  }
}

// ── Load history files ────────────────────────────────────────────────────────

if (!existsSync(historyDir)) {
  console.log("No pipeline history directory found at inbox/pipeline-history/");
  console.log("The nightly pipeline has not run yet, or history was not saved.");
  process.exit(1);
}

const allFiles = readdirSync(historyDir)
  .filter((f) => f.endsWith(".json"))
  .sort() // ISO-date filenames sort lexicographically
  .slice(-days);

if (allFiles.length === 0) {
  console.log("No pipeline history files found in inbox/pipeline-history/");
  process.exit(1);
}

const reports: PipelineReport[] = [];
for (const file of allFiles) {
  try {
    const raw = readFileSync(resolve(historyDir, file), "utf-8");
    reports.push(JSON.parse(raw) as PipelineReport);
  } catch {
    console.warn(`⚠  Could not parse ${file} — skipping`);
  }
}

if (reports.length === 0) {
  console.log("All history files failed to parse.");
  process.exit(1);
}

// ── Trend table ───────────────────────────────────────────────────────────────

const overallIcon: Record<string, string> = {
  pass: "✓",
  warn: "⚠",
  fail: "✗",
};

// Column widths
const COL = {
  date:    10,
  overall:  7,
  posts:    8,
  trans:   11,
  audio:    7,
  errors:   8,
  flags:   20,
};

function pad(s: string | number, w: number): string {
  return String(s).padEnd(w);
}

function center(s: string, w: number): string {
  const total = Math.max(0, w - s.length);
  const left = Math.floor(total / 2);
  return " ".repeat(left) + s + " ".repeat(total - left);
}

const divider = "─".repeat(
  COL.date + COL.overall + COL.posts + COL.trans + COL.audio + COL.errors + COL.flags + 6
);

console.log();
console.log(`Pipeline weekly summary — last ${reports.length} day(s) from ${historyDir}`);
console.log(divider);
console.log(
  pad("Date", COL.date) + " " +
  pad("Overall", COL.overall) + " " +
  pad("Posts", COL.posts) + " " +
  pad("Translated", COL.trans) + " " +
  pad("Audio", COL.audio) + " " +
  pad("Errors", COL.errors) + " " +
  "Flags"
);
console.log(divider);

let weekPosts = 0;
let weekTrans = 0;
let weekAudio = 0;
let weekErrors = 0;
let failDays = 0;
let zeroPosts = 0;

for (const r of reports) {
  const icon = overallIcon[r.overall] ?? "?";
  const t = r.totals;
  const flags: string[] = [];

  if (r.overall === "fail") {
    flags.push("FAIL");
    failDays++;
  }
  if (t.posts_published === 0) {
    // Zero posts is only flagged when the pipeline didn't skip explicitly
    const skippedAll = r.steps.every((s) => s.status === "skipped");
    if (!skippedAll) {
      flags.push("zero-posts");
      zeroPosts++;
    }
  }
  if (t.translations_done === 0 && t.posts_published > 0) {
    flags.push("no-translations");
  }
  if (t.audio_generated === 0 && t.posts_published > 0) {
    flags.push("no-audio");
  }
  if (t.errors > 0) {
    flags.push(`${t.errors}-err`);
  }

  weekPosts  += t.posts_published;
  weekTrans  += t.translations_done;
  weekAudio  += t.audio_generated;
  weekErrors += t.errors;

  const flagStr = flags.join(" ") || "—";
  const overallStr = `${icon} ${r.overall.toUpperCase()}`;

  console.log(
    pad(r.date, COL.date) + " " +
    pad(overallStr, COL.overall) + " " +
    pad(t.posts_published, COL.posts) + " " +
    pad(t.translations_done, COL.trans) + " " +
    pad(t.audio_generated, COL.audio) + " " +
    pad(t.errors, COL.errors) + " " +
    flagStr
  );
}

console.log(divider);

// Totals row
console.log(
  pad("TOTALS", COL.date) + " " +
  pad("", COL.overall) + " " +
  pad(weekPosts, COL.posts) + " " +
  pad(weekTrans, COL.trans) + " " +
  pad(weekAudio, COL.audio) + " " +
  pad(weekErrors, COL.errors)
);
console.log(divider);

// ── Trend summary ─────────────────────────────────────────────────────────────

console.log();
console.log("Trend summary:");

if (failDays > 0) {
  console.log(`  ✗ ${failDays} day(s) with overall=FAIL`);
} else {
  console.log(`  ✓ No hard failures`);
}

if (zeroPosts > 0) {
  console.log(`  ⚠ ${zeroPosts} day(s) with zero posts published`);
} else {
  console.log(`  ✓ Posts published every day`);
}

const avgPosts = (weekPosts / reports.length).toFixed(1);
const avgTrans = (weekTrans / reports.length).toFixed(1);
const avgAudio = (weekAudio / reports.length).toFixed(1);

console.log(`  ~ Avg per day: posts=${avgPosts}  translated=${avgTrans}  audio=${avgAudio}`);

if (weekErrors > 0) {
  console.log(`  ⚠ ${weekErrors} total error(s) across the period`);
} else {
  console.log(`  ✓ No errors logged`);
}

console.log();
