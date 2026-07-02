---
name: SSE chat abort regression test pattern
description: How to test that an SSE endpoint aborts only on real client disconnect, not on request-body-read completion.
---

The bug this guards against: listening on `req.on("close")` (IncomingMessage)
instead of `res.on("close")` (ServerResponse) to detect client disconnects.
`req` emits `close` almost immediately after the body is fully read (e.g. by
`express.json()`) — long before the client actually disconnects — silently
aborting the whole SSE response before the first byte goes out.

This can't be caught with mocked `req`/`res` objects; the timing difference
is a real Node HTTP behavior. The regression test must spin up an actual
`http.createServer` + `express` app on an ephemeral port and make a real HTTP
request.

**How to apply:** for any new SSE/streaming endpoint that wires up abort via
socket-close detection, add a `node:test` case (no extra framework needed —
Node's built-in test runner works fine with `tsx`) that: (1) asserts at least
one real stream event arrives, and asserts the abort signal is NOT aborted at
that point, and (2) separately confirms a real client disconnect (`req.destroy()`)
still triggers the abort. See `artifacts/api-server/src/routes/horus.sse.test.ts`
for the reference implementation.
