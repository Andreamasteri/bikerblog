---
name: Horus↔Bowie conversation turn attribution + resume
description: How mid-conversation agent dropouts are attributed and retried without losing the transcript in the observed Horus/Bowie turn-taking chat.
---

The observed Horus↔Bowie conversation (`POST /horus/bowie-conversation`) is a multi-turn loop that alternates agents by parity (even index = Horus, odd = Bowie). A dropout mid-loop (tunnel drop, Ollama restart) needs to say *which* agent failed and let the user continue instead of restarting.

- The server tracks the currently-active agent in a loop-scoped variable (not derived from the transcript) so the `catch` block can attribute the error even though the failing turn never got appended to the transcript.
- The `error` SSE event carries both `agent` and the `transcript` array of turns completed so far. The transcript is the source of truth for resuming — the client doesn't need to reconstruct it from partial UI state.
- Resume works by accepting an optional `resumeTranscript` in the POST body; the turn-index loop starts at `transcript.length` instead of `0`, and `totalTurns` is bumped to at least `transcript.length + 1` so a resume always attempts the next turn even if the original `maxTurns` was already reached.

**Why:** without agent attribution, a stall looked identical whether Horus or Bowie dropped, and there was no way to keep the discussion going after one hiccup — the whole conversation had to restart from the topic, discarding turns the user already watched.

**How to apply:** any future turn-taking or multi-agent surface built on this pattern (more agents, more turns) should keep "index parity decides agent" + "transcript is the resume payload" rather than inventing per-agent state machines — it composes cleanly with N agents by changing `i % N`.

**Client-side gotcha:** for the fallback path where the SSE stream dies with no server `error` event (silent transport failure, e.g. a tunnel drop), don't read React state (e.g. `activeAgent`) inside the `catch` of the async stream-reading loop to attribute the failure — that state is captured at closure-creation time and is stale by the time the catch runs. Keep a `useRef` mirror updated on every `turn_start`/`turn_end` and read that instead.

**Testability gotcha:** the route was originally a single inline handler calling `horusChatRaw`/`bowieChatRaw`/`isBowieConfigured`/`saveBowieConversation` directly, with no dependency injection — unlike the sibling `createDirectChatHandler`. It had to be refactored into `createBowieConversationHandler(deps)` (same DI shape) before the error-attribution and resume behavior above could be regression-tested without mocking `@workspace/horus` or hitting the DB. See `artifacts/api-server/src/routes/horus.bowie-conversation.test.ts`.

**Test harness gotcha:** a bare `express()` test server (no `pino-http`) crashes with `Cannot read properties of undefined (reading 'error')` the instant a handler's catch block calls `req.log.error(...)` — add `app.use(pinoHttp({ enabled: false }))` to any SSE regression test server that intentionally exercises an error path.
