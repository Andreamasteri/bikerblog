---
name: Bounded history tables
description: Pattern for persisting AI/chat history "without bloating the DB" — cap row count instead of trimming content.
---

When a feature asks to "remember" past sessions/transcripts but explicitly worries about DB weight, the simplest durable approach is:

- Store the full transcript as a single `jsonb` array column per session row (not one row per message) — keeps the schema simple and avoids join overhead for something that's always read as a whole.
- After each insert, delete rows beyond the N most recent (ordered by `createdAt`), rather than trying to cap content size per row. A fixed row-count cap (e.g. 50) is easy to reason about and keeps growth bounded regardless of how verbose individual transcripts get.
- For list views, don't fetch the full jsonb blob — compute a summary (e.g. turn count) in SQL with `jsonb_array_length(column)` so the list endpoint stays cheap even as transcripts grow.

**Why:** avoids the two failure modes people hit with "just save everything": unbounded table growth, and list views that get slow because they pull full JSON blobs just to show a preview.

**How to apply:** any feature that persists AI conversation/session history for later browsing (not per-message querying) — reach for this pattern before reaching for a more complex schema or a manual pruning cron job.
