#!/usr/bin/env tsx
/**
 * read-last-run — pretty-prints inbox/pipeline-last-run.json to stdout.
 *
 * Use at the start of each session to catch up on overnight pipeline activity.
 *
 * Exit codes:
 *   0 — report exists and overall=pass or overall=warn (pipeline ran with warnings but no hard failure)
 *   1 — report exists and overall=fail (hard pipeline failure), or file is missing/corrupt
 *
 * Usage:
 *   pnpm --filter @workspace/scripts run pipeline:status
 */
import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { dirname } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const projectRoot = resolve(here, "..", "..");
const reportPath = resolve(projectRoot, "inbox", "pipeline-last-run.json");

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

if (!existsSync(reportPath)) {
  console.log("No pipeline report found at inbox/pipeline-last-run.json");
  console.log("The pipeline has not run yet, or the report file was not written.");
  process.exit(1);
}

const raw = readFileSync(reportPath, "utf-8");
let report: PipelineReport;
try {
  report = JSON.parse(raw) as PipelineReport;
} catch {
  console.error("Failed to parse pipeline-last-run.json — file may be corrupt.");
  process.exit(1);
}

const statusIcon: Record<string, string> = {
  ok:      "✓",
  warn:    "⚠",
  skipped: "–",
  failed:  "✗",
};

const overallIcon =
  report.overall === "pass" ? "✓" :
  report.overall === "warn" ? "⚠" : "✗";

console.log("━".repeat(60));
console.log(`Pipeline run: ${report.date}  (${report.run_at})`);
console.log(`Overall: ${overallIcon} ${report.overall.toUpperCase()}  — ${(report.duration_ms / 1000).toFixed(1)}s total`);
console.log("━".repeat(60));

for (const step of report.steps) {
  const icon = statusIcon[step.status] ?? "?";
  const dur = `${(step.duration_ms / 1000).toFixed(1)}s`;
  const extras: string[] = [];
  if (step.posts_published !== undefined) extras.push(`posts_published=${step.posts_published}`);
  if (step.translations_done !== undefined) extras.push(`translated=${step.translations_done}`);
  if (step.audio_generated !== undefined) extras.push(`audio=${step.audio_generated}`);
  const extraStr = extras.length ? `  [${extras.join(", ")}]` : "";
  console.log(`  ${icon} Step ${step.step}: ${step.name} (${dur})${extraStr}`);
  for (const err of step.errors) {
    console.log(`      ✗ ERROR: ${err}`);
  }
  for (const warn of step.warnings) {
    console.log(`      ⚠ WARN:  ${warn}`);
  }
}

console.log("━".repeat(60));
const t = report.totals;
console.log(`Totals: posts=${t.posts_published}  translated=${t.translations_done}  audio=${t.audio_generated}  errors=${t.errors}  warnings=${t.warnings}`);
console.log("━".repeat(60));

// Exit non-zero only on hard failure — warn is informational, not a failure
if (report.overall === "fail") {
  process.exit(1);
}
