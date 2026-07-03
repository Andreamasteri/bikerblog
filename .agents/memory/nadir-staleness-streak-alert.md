---
name: Nadir reindex staleness alert (consecutive-warn streak)
description: How a tolerant "warn" pipeline step escalates to a real alert after N nights, using history reports as the only state.
---

# Escalating a tolerant "warn" step to a real alert

Some nightly-pipeline steps (Nadir reindex step 7.5, and by the same tolerance
inbox/changelog) are deliberately non-fatal: a single transient outage stays a
silent "warn" and does NOT fire `sendPipelineAlert`. The gap that pattern leaves:
if the dependency stays down for many nights, the thing it maintains (the Nadir
search index) goes stale and nobody is told.

**Rule:** a step that is tolerant to a single failure should still escalate to a
real alert after a *streak* of consecutive failures.

**How to apply (the shape used here):**
- Count the consecutive-warn streak by reading the already-written run reports in
  `inbox/pipeline-history/*.json` (`scripts/src/nadir-warn-streak.ts`). No new DB
  table, no extra state file — the history reports ARE the state, so it stays
  idempotent across re-runs.
- The current run's report is written only at the very end of the pipeline, so
  pass the current status in memory and skip the current date's file in history
  (a same-day re-run must not double-count).
- The streak breaks on the first prior report whose step is NOT "warn"
  (ok/skipped/failed/missing/unreadable). A successful reindex resets staleness;
  a skipped step means the dependency isn't configured so there's nothing to
  alert about; an unreadable report breaks conservatively.
- When `streak >= threshold` (3 here), push a message into the existing
  `criticalWarnings` array — that's the channel `run-cluster-daily.ts` already
  uses to force `sendPipelineAlert` even when the run otherwise "passed".

**Why:** reuse the existing alert plumbing (`criticalWarnings` → `sendPipelineAlert`)
instead of inventing a parallel notification path, and derive streak state from
artifacts that already exist rather than adding persistence.
