---
name: Horus/Bowie chat "network error" despite server 200 → reply cache + retry
description: When the mobile client shows a network error but the server logged HTTP 200 for the chat, the cause is mobile network suspension, not the Cloudflare tunnel; recovery is a best-effort server reply cache + one-click client retry.
---

# "Network error" on a reply the server actually generated

**Symptom:** `/horus` (and Bowie) direct chat shows the friendly "connection" error
on mobile even though production logs show `POST /api/horus/chat` completed with
**HTTP 200** (sometimes after 80s+). This is a DIFFERENT failure from the
repeated 524/tunnel-budget episodes (see `horus-tool-timeout-token-budget.md`
and `horus-contextual-tools-resident.md`): the tunnel did NOT time out — the
server held the connection the whole time and logged 200.

**Mechanism:** during the long silent prefill the mobile browser/OS suspends the
network (screen lock / tab backgrounded). The server keeps writing to a
half-open socket (TCP keepalive hasn't expired), so it emits `done` and logs
200 — but that byte never reaches the browser, whose `reader.read()` throws a
TypeError. The generated answer is lost even though it existed.

**Recovery chosen (not a prevention):** the answer already existed, so make it
recoverable instead of trying to keep the socket alive.
- **Server:** best-effort in-memory reply cache in `createDirectChatHandler`,
  keyed on `sha256(agentName \0 message \0 JSON.stringify(priorHistory))`, TTL
  ~10min, ~50 entries LRU-ish. Cache the completed reply **before** the
  `abortController.signal.aborted` check (cache matters most exactly when the
  client already vanished). On entry, a cache hit emits `done` + `end`
  immediately, skipping generation.
- **Client:** on the network-drop catch branch only (NOT server `error` SSE, NOT
  abort/401/503), show a one-click "Riprova" that re-sends the identical
  message + prior history → server cache hit returns the already-generated reply
  instantly, no ~80s regeneration.

**Why keyed on prior history (computed BEFORE adding the user msg):** the retry
must produce the exact same cache key as the original request, so the client
stores `{outgoing, history}` where `history` is the message list *before*
appending the new user turn.

**Autoscale caveat:** cache is per-instance/best-effort. If the retry lands on a
cold/other instance it simply regenerates (same as before) — acceptable
degradation, not a correctness bug.

## Test gotchas hit while adding this
- **Module-scoped caches leak across `node:test` tests in the same file.** All
  the horus SSE/tool tests use identical inputs (`agentName "TestAgent"`,
  `"ciao"`, `history: []`), so test 2 would hit test 1's cached reply and skip
  generation (no tokens, no abort → false failures / ECONNRESET from the early
  `res.end()`). Fix: export a test-only `__clearDirectReplyCacheForTests()` and
  clear it per test. For `mock.module` files (dynamic `await import("./horus.js")`
  inside `startTestServer`), clear there — do NOT add a top-level static import
  of horus.js or it loads before the mocks are set.
- **Bare test servers have no `req.log`.** The cache-hit path logs via
  `req.log.info`; a test `express()` app without a logger middleware throws
  `Cannot read properties of undefined (reading 'info')` → the response never
  sends `done` → client sees ECONNRESET. Add the same no-op `req.log` middleware
  the gateway-timeout test already uses. Production has `req.log` via pino-http,
  so keep the log call unguarded (consistent with the file's `req.log.warn/error`).
