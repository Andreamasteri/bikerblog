---
name: Horus abort/cancel pattern
description: How mid-run cancellation (Stop button / Ctrl+C) is wired across the Horus web chat, CLI, and shared tool executor.
---

Cancellation is threaded as a plain `AbortSignal`, not a custom "stop" flag, from each caller down through the shared `@workspace/horus` tool executor to the underlying analysis-service fetch.

- The web chat route creates one `AbortController` per request, tied to `req.on("close")` — this fires both for an explicit client abort (Stop button cancels the fetch) and for tab-close/navigation, so no separate cleanup path is needed.
- The CLI tracks the active request's `AbortController` at module scope and aborts it from a `SIGINT` handler; when idle, `SIGINT` falls back to the normal readline-close exit. This lets Ctrl+C mean "cancel the current turn" while busy and "quit" while idle, without two different key bindings.
- Long analysis-service calls (architect, typecheck, lint, search, git-log) combine the caller's signal with the existing internal timeout via `AbortSignal.any([callerSignal, timeoutSignal])`, so both cancellation and timeout use the same code path.
- On abort, the tool executor catches the abort and returns a friendly "interrotto dall'utente" string instead of throwing — this keeps the chat loop (CLI and web) from crashing and lets the UI show a clean partial result rather than an error state. The outer LLM call (`horusChatRaw`) still throws on abort; callers distinguish the two by checking `signal.aborted` in the catch block.

**Why:** architect/analysis calls can run for minutes on the user's own hardware (TC) over a Cloudflare Tunnel; without a real cancel path, users had no way to stop a runaway call short of killing the process.

**How to apply:** any new Horus surface that adds tool calling (e.g. if the Horus↔Bowie conversation endpoint ever gets tools) should accept/create an `AbortSignal` the same way and pass it into `executeHorusTool(name, args, signal)` rather than inventing a new cancellation mechanism.
