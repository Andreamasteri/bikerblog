---
name: Browser network-error messages leak raw into chat
description: Why the chat showed a raw English "network error" and why friendlyChatErrorMessage must treat every TypeError as a network interruption.
---

A fetch/SSE-stream interruption in the browser always surfaces as a `TypeError`, but the message text varies by browser AND by *when* it fails, and none of them are user-appropriate:

- Chrome, initial connection fails: `Failed to fetch`
- Chrome, response **body stream interrupted mid-read** (`reader.read()` reject): `network error`  ← the one that leaked
- Firefox: `NetworkError when attempting to fetch resource.`
- Safari: `Load failed`

**Why it leaked:** `friendlyChatErrorMessage` used to only map TypeErrors whose message matched `/fetch/i`. Chrome's mid-stream `network error` and Safari's `Load failed` don't contain "fetch", so they fell through to `return err.message` and the raw English string rendered in the chat bubble. This is the client-side symptom of the same tunnel timeout the server-side tasks fixed *prevention* for — the long 2nd (tool-using) message drops the SSE stream, and the reader reject shows raw.

**How to apply:** in a fetch+SSE chat context every `TypeError` is effectively a network/timeout interruption, not a programming bug worth showing — map them all to the Italian connection message. Also defensively match non-TypeError Errors whose message contains raw network phrases (`terminated`, `other side closed`, `fetch failed`, etc.), since a mid-stream tunnel drop can arrive as a plain `Error` too. Regression coverage: `artifacts/bikerblog/src/lib/friendly-error.test.ts`.
