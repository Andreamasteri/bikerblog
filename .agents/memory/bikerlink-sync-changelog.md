---
name: BikerLink sync changelog automation
description: Why the auto changelog derives task completions from git commits, not a live task API, and how it stays idempotent.
---

# BikerLink sync changelog automation

`docs/bikerlink-sync-changelog.md` has a hand-written intro + "Backfill iniziale",
then an auto-managed block between `<!-- AUTO-CHANGELOG:START/END -->` regenerated
by `changelog:sync` (`scripts/src/update-sync-changelog.ts`, step 10 of `cluster:daily`).

## Task completions come from git commits, not a task API
**Rule:** at cron runtime the changelog treats **git commits** as the source of
completed-task events. It extracts `Task #NNN` (leading `Task #NNN:` or trailing
`(Task #NNN)`/`(task-NNN)`), dedupes by task number (newest commit wins = the
merge), and renders a per-day "Task completati" sub-list; non-task commits go under
"Altre modifiche". An **optional** `inbox/completed-tasks.json` (same `ArchivedTask[]`
shape as `cluster-tasks.ts`) is folded in for tasks not covered by a commit.

**Why:** `listProjectTasks`/`getProjectTask` (the platform task source) only exist in
the code_execution sandbox — they are NOT callable from a standalone tsx script in the
nightly deployment cron. Git is the only task-completion signal actually available at
run time, and every merged task lands as a `Task #NNN` commit. Do not try to make the
cron script call project-task callbacks; it will not have them.

**How to apply:** any future "include completed tasks" ask for a cron/script surface
should parse commits (or a static JSON snapshot), not assume the project-tasks API is
reachable. Bowie/Nadir tasks are guaranteed to appear either way: with a `Task #NNN`
tag they land in "Task completati", otherwise still in "Altre modifiche".

## Idempotency + testing
Pure functions (`buildEntries`, `buildAutoSection`, `replaceAutoSection`, `humanize`,
`extractTaskNumber`) are exported and `main()` is guarded by an `import.meta.url`
check so the fixture test (`update-sync-changelog.test.ts`, `pnpm --filter
@workspace/scripts run test`) can import them without running the script. Re-running
with the same commits/tasks must produce byte-identical output — the test asserts this.
