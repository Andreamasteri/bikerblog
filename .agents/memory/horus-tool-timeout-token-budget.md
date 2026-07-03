---
name: Tool-mode token budget vs Cloudflare Tunnel timeout
description: Why direct-chat replies that use tools were failing with HTTP 524 after the first message, and how the reply token budget relates to the tunnel's ~100s idle cutoff.
---

`createDirectChatHandler` in `artifacts/api-server/src/routes/horus.ts` runs an agentic tool-call loop: each iteration is a *separate* HTTP request to Ollama (`chatRaw`) over the user's Cloudflare Tunnel. Once the model uses a tool, the reply token budget jumps from the small default (`MAX_REPLY_TOKENS`) to a much larger "with tools" budget (`MAX_REPLY_TOKENS_WITH_TOOLS`).

**Incident:** production logs (`fetch_deployment_logs`) showed direct-chat/bowie-chat calls succeeding in ~10s for simple replies, then failing with real `HTTP 524` (Cloudflare Tunnel closed the connection) or `TypeError: terminated: other side closed`, consistently around 100–130s — right when a tool-triggering follow-up pushed a single Ollama call into a long CPU-bound generation. This looked like "chat freezes after the first message" but was really: bigger token budget → longer generation → single request outlives the tunnel's idle timeout, even with `stream:true` (streaming only helps once bytes are actively flowing; it doesn't help if the model is silently thinking/prefilling or grinding through a large token budget on slow CPU hardware).

**Why:** the tunnel is a home Cloudflare Tunnel to consumer CPU hardware, not a real timeout bug in this app's SSE/abort code (which was independently verified as correct, tests pass). `MAX_TOOL_ITERATIONS` also multiplies worst-case exposure since each iteration is its own at-risk request.

**How to apply:** when tuning Horus/Bowie response quality vs. reliability, remember the with-tools token budget and iteration count directly trade off against this tunnel's real-world ceiling (empirically ~100–130s per single Ollama call). Keep `MAX_REPLY_TOKENS_WITH_TOOLS` and `MAX_TOOL_ITERATIONS` conservative on this hardware; don't just raise them for quality without checking production logs for 524s afterward. If failures resume, check `fetch_deployment_logs` for `HTTP 524` / `terminated: other side closed` before assuming a code regression.
