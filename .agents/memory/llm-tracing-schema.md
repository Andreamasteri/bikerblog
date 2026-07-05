---
name: LLM tool-loop tracing schema
description: Fixed-schema `llm_traces` DB table recording every tool-loop call (Horus/Bowie/Quebracho), queryable for the future nightly semantic-supervision task.
---

## What

Every "full turn" of the shared LLM tool-loop (direct chat, and each agent's turn
in the multi-agent observed conversation) writes exactly one row to the
`llm_traces` table (`lib/db/src/schema/llm-traces.ts`) via
`recordLlmTrace()` in `@workspace/horus` (`lib/horus/src/tracing.ts`).

Columns: `agent`, `surface` (`"direct_chat" | "agent_conversation"`),
`conversationId` (nullable), `turnNumber` (nullable), `toolsUsed` (text array),
`latencyMs`, `outcome` (`"success" | "error"`), `errorMessage`, `inputExcerpt`,
`outputExcerpt`, `createdAt`. Excerpts are truncated to ~500 chars — never a
full payload dump (matches the "no sensitive data" / Information Disclosure
requirement in `threat_model.md`).

## Why this shape

- **One row per turn, not per model call.** A turn can involve several
  tool-loop iterations (and, for direct chat, an escalated retry with a
  broadened tool set — Task #179). Tracing at the iteration level would make
  `llm_traces` hard to sample meaningfully for #199 (Fase 2f nightly semantic
  supervision), which wants "recent conversations/output", not internal
  retries. `toolsUsed` accumulates all tool names across the whole turn.
- **Best-effort, never throws.** `recordLlmTrace` swallows all its own errors
  (`console.warn` fallback — no `req.log` available inside a shared lib with
  no request context). A tracing failure must never break the actual chat
  turn that produced it; this mirrors the existing `maybeAutoRemember`
  best-effort pattern in `scripts/src/horus-chat.ts`.
- **No new always-on service (ECONOMY mode constraint).** Tracing is just an
  insert into the existing Postgres DB from the same process that already
  handles the chat request — no separate collector/queue/service.
- **`@workspace/db` is now a real dependency of `@workspace/horus`** (it had
  zero deps before). To avoid `@workspace/db`'s module-load-time
  `DATABASE_URL` requirement breaking `@workspace/horus` imports in contexts
  without a DB (e.g. some tests), the db module is loaded lazily via
  `dynamic import()` inside `recordLlmTrace`, not as a static top-level import.

## How it's wired

- `artifacts/api-server/src/routes/horus.ts`: `runChatTurn` now returns
  `toolNames: string[]` in addition to `usedTools`; `createDirectChatHandler`
  traces once per turn (success / empty-reply / client-aborted / thrown-error,
  each as its own `outcome`). `createBowieConversationHandler` traces once per
  per-agent turn inside the alternation loop, plus once on the failing turn in
  its catch block.
- `scripts/src/horus-chat.ts` (CLI): same one-trace-per-turn shape, `agent:
  "Horus"` hardcoded (the CLI only talks to Horus).
- Migrations here are hand-written (`drizzle-kit generate` is broken in this
  repo — see the `db-migrations-vs-push` memory); `0006_add_llm_traces.sql` +
  its `meta/0006_snapshot.json` + `_journal.json` entry were added by hand
  alongside the `push`-applied dev DB change.

## For future tracing consumers (e.g. #199)

Query `llm_traces` directly (e.g. `ORDER BY created_at DESC LIMIT N`, or
filter by `agent`/`surface`/`outcome`) instead of parsing
`horus_bowie_conversations.transcript` or raw logs. This table intentionally
does NOT judge content quality — that's the nightly supervision task's job,
not this one.
