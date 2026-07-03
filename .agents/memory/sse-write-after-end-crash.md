---
name: SSE write-after-end can crash the whole process
description: Why an unguarded res.write inside a setInterval on an SSE route took down every chat agent at once, not just the one being used.
---

Symptom: user reported "network error" on Horus **and** Bowie chat at the same time, right after
the direct-chat tool-calling loop was added. Both tabs failing simultaneously was the key clue —
a per-request bug (bad tool args, a bad model response, etc.) would only break the request that
triggered it, not every agent's chat at once.

**Root cause:** the SSE handlers write periodic data from `setInterval` callbacks (a heartbeat
`: ping` every 15s, and — once tool-calling was added — a tool-progress event every 4s while a
tool runs). If the client had already disconnected (tab closed, navigation, abort), `res.write`
throws `ERR_STREAM_WRITE_AFTER_END`. Because that throw happens inside a raw `setInterval`
callback with no try/catch, and this codebase has **no process-level `uncaughtException` handler**,
the exception crashes the entire Node process — not just the one request. Every in-flight and
future request (any agent) fails until the platform restarts the process, which reads as a
generic "network error" across the whole chat feature.

**Fix pattern:** any `res.write` reachable from a timer callback (not just the main request
handler body) must check `res.writableEnded || res.destroyed` before writing, and wrap the write
in try/catch as a second layer of defense (a race can still happen between the check and the
write). This applies per-write, not per-request — guarding only the main handler's writes but not
the heartbeat/progress timers is not sufficient.

**How to apply:** whenever adding a new periodic write on any SSE/streaming route (progress
pings, keep-alives, incremental status), route it through a guarded write helper rather than
calling `res.write` directly from the timer.
