---
name: Missing-tool sentinel escalation
description: How direct chat recovers when contextual tool selection guessed wrong and the model needed a tool that wasn't attached.
---

Contextual tool selection (see `horus-contextual-tools-resident.md`) attaches
only intent-matched tools to keep prefill under the tunnel timeout. That's a
guess, and guesses are sometimes wrong — the model may need a tool that
wasn't attached for an unexpectedly-phrased request.

The fix: the system prompt instructs the model to reply with an exact
sentinel token (nothing else) when it lacks a needed tool. The handler
buffers only the *start* of the streamed reply (bounded, ~64 chars) to check
for the sentinel without adding latency to normal replies. If detected, the
whole turn is silently discarded (never shown to the user) and retried
exactly once with the full capability-gated tool set. No sentinel ever
reaches the SSE stream.

**Why:** without this, an unlucky tool-selection guess just produces a wrong
or unhelpful answer with no recovery path, and the user has to manually
rephrase.

**How to apply:** this is a single bounded retry, not a loop — the escalated
attempt disables sentinel detection, so if the model emits the sentinel again
it's just shown as literal text (accepted rare edge case). Reuse this
buffer-prefix-then-flush pattern for any future "detect an internal signal
without leaking it to the stream" need.
