import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { nadirWarnStreak, type StepStatus } from "./nadir-warn-streak.js";

/** Writes a minimal pipeline-history report with step 7.5 at the given status. */
function writeReport(dir: string, date: string, nadirStatus: StepStatus | null): void {
  const steps: Array<{ step: number; status: StepStatus }> = [
    { step: 1, status: "ok" },
  ];
  if (nadirStatus !== null) steps.push({ step: 7.5, status: nadirStatus });
  writeFileSync(
    resolve(dir, `${date}.json`),
    JSON.stringify({ date, steps }),
    "utf-8"
  );
}

function makeHistoryDir(): string {
  const base = mkdtempSync(resolve(tmpdir(), "nadir-streak-"));
  const dir = resolve(base, "pipeline-history");
  mkdirSync(dir, { recursive: true });
  return dir;
}

test("current run not in warn → streak 0", () => {
  const dir = makeHistoryDir();
  writeReport(dir, "2026-07-01", "warn");
  writeReport(dir, "2026-07-02", "warn");
  assert.equal(nadirWarnStreak("ok", "2026-07-03", dir), 0);
  assert.equal(nadirWarnStreak("skipped", "2026-07-03", dir), 0);
  rmSync(dir, { recursive: true, force: true });
});

test("single warn night → streak 1 (no alert)", () => {
  const dir = makeHistoryDir();
  writeReport(dir, "2026-07-01", "ok");
  writeReport(dir, "2026-07-02", "ok");
  assert.equal(nadirWarnStreak("warn", "2026-07-03", dir), 1);
  rmSync(dir, { recursive: true, force: true });
});

test("three consecutive warns (2 history + current) → streak 3", () => {
  const dir = makeHistoryDir();
  writeReport(dir, "2026-07-01", "warn");
  writeReport(dir, "2026-07-02", "warn");
  assert.equal(nadirWarnStreak("warn", "2026-07-03", dir), 3);
  rmSync(dir, { recursive: true, force: true });
});

test("an ok run breaks the streak", () => {
  const dir = makeHistoryDir();
  writeReport(dir, "2026-06-30", "warn");
  writeReport(dir, "2026-07-01", "ok"); // successful reindex resets staleness
  writeReport(dir, "2026-07-02", "warn");
  assert.equal(nadirWarnStreak("warn", "2026-07-03", dir), 2);
  rmSync(dir, { recursive: true, force: true });
});

test("a skipped run breaks the streak", () => {
  const dir = makeHistoryDir();
  writeReport(dir, "2026-07-01", "warn");
  writeReport(dir, "2026-07-02", "skipped");
  assert.equal(nadirWarnStreak("warn", "2026-07-03", dir), 1);
  rmSync(dir, { recursive: true, force: true });
});

test("a missing step 7.5 breaks the streak", () => {
  const dir = makeHistoryDir();
  writeReport(dir, "2026-07-01", "warn");
  writeReport(dir, "2026-07-02", null); // no step 7.5 recorded
  assert.equal(nadirWarnStreak("warn", "2026-07-03", dir), 1);
  rmSync(dir, { recursive: true, force: true });
});

test("current date report on disk is not double-counted", () => {
  const dir = makeHistoryDir();
  writeReport(dir, "2026-07-01", "warn");
  writeReport(dir, "2026-07-02", "warn");
  writeReport(dir, "2026-07-03", "warn"); // stale re-run report for today
  // current in-memory warn + 2 prior = 3, the on-disk 07-03 must be ignored
  assert.equal(nadirWarnStreak("warn", "2026-07-03", dir), 3);
  rmSync(dir, { recursive: true, force: true });
});

test("unreadable report breaks the streak conservatively", () => {
  const dir = makeHistoryDir();
  writeReport(dir, "2026-07-01", "warn");
  writeFileSync(resolve(dir, "2026-07-02.json"), "{ not valid json", "utf-8");
  assert.equal(nadirWarnStreak("warn", "2026-07-03", dir), 1);
  rmSync(dir, { recursive: true, force: true });
});

test("missing history dir → streak 1", () => {
  assert.equal(
    nadirWarnStreak("warn", "2026-07-03", resolve(tmpdir(), "does-not-exist-nadir")),
    1
  );
});
