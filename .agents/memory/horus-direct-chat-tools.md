---
name: Direct chat tool-calling and reply-length coupling
description: Why the web direct chat (Horus/Bowie/Quebracho) now runs a tool-calling loop and why reply-length caps are conditional on tool usage.
---

The web direct chat (`/horus` page, all three agent tabs) originally sent exactly one Ollama
call per user message with no tools — a deliberate latency tradeoff for CPU hardware. The user
does not use the CLI (`horus:chat`), so any capability that requires tools (e.g. "read BikerLink's
GitHub and write a manual") had to work from the web chat, not just the terminal.

**Change:** the direct chat SSE handler (`createDirectChatHandler` in
`artifacts/api-server/src/routes/horus.ts`) now runs the same tool-calling loop as the CLI —
`getHorusTools()` / `executeHorusTool()` from `@workspace/horus`, up to a fixed iteration cap —
and emits `tool_call` / `tool_progress` / `tool_result` SSE events. The frontend
(`agent-chat-panel.tsx`) already had UI support for these events (tool badges) before this change;
only the server side was missing.

**Reply-length coupling (the non-obvious part):** the short reply cap (~400 chars / 220 tokens,
kept for quick chat latency) only applies to the *first* model call in a turn, before any tool has
run. Once a tool call happens, the cap switches to a much larger limit for the rest of that turn.

**Why:** without this, a tool-augmented answer (e.g. a generated manual) would still get truncated
to a few sentences immediately after the tool succeeded, defeating the reason the tool was called.
Coupling the cap to "was a tool used this turn" keeps ordinary quick chat fast while letting
genuinely tool-driven, long-form answers actually complete.

**How to apply:** if a future direct-chat feature needs its own reply-length behavior, check
`usedTools` in that handler rather than hardcoding a single global reply cap. The observed
Horus↔Bowie/Quebracho conversation route intentionally still has no tools at all (unrelated scope,
tuned separately for pacing — see `horus-convo-duration-ux.md`).
