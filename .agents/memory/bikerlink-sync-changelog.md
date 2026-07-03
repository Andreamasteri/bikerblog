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

## Simple-Italian rewording is additive + cached
**Rule:** each auto entry keeps the original technical commit text and adds a
separate "_In parole semplici:_" line in plain Italian (via `horusChat`). The
Italian is never a replacement for the technical text — it is a sub-bullet under
it. The rewordings are cached in `inbox/changelog-italian-cache.json` keyed by a
stable key (`c:<shortHash>` for commit-backed entries, `external-#NNN` for
external-only tasks); Horus is called only for keys missing from the cache.

**Why:** the user explicitly asked to *add* simple Italian without deleting the
English/technical commit text ("aggiungi ma non eliminare"). AI output is
non-deterministic, which would break the byte-identical idempotency guarantee, so
the cache pins each entry's Italian once generated. If Horus is unconfigured or
fails, `rewordToSimpleItalian` returns null and the entry shows technical text
only — the pipeline never blocks and no entry goes missing.

**How to apply:** the pure render (`buildAutoSection`) takes an optional
`italianByKey` map; the impure `main()` loads the cache, calls
`ensureItalianForEntries` (fills only missing keys), saves the cache (skipped on
`--dry-run`), then renders. Tests stay deterministic by passing an explicit map.

## Idempotency + testing
Pure functions (`buildEntries`, `buildAutoSection`, `replaceAutoSection`, `humanize`,
`extractTaskNumber`) are exported and `main()` is guarded by an `import.meta.url`
check so the fixture test (`update-sync-changelog.test.ts`, `pnpm --filter
@workspace/scripts run test`) can import them without running the script. Re-running
with the same commits/tasks must produce byte-identical output — the test asserts this.
