---
name: Gateway-timeout friendly errors
description: How the shared Ollama client distinguishes a gateway/tunnel timeout (raw HTML error page) from a real Ollama error, and rewrites it to a friendly message.
---

`lib/horus/src/client.ts`'s shared `chatRaw` (used by both Horus and Bowie) detects a non-OK response whose status is a typical gateway-timeout code (502/503/504/524) AND whose body looks like an HTML error page (starts with `<!doctype`/`<html`). In that case it throws a short Italian message explaining the tunnel/gateway timed out and suggesting a smaller/more specific retry, instead of embedding the raw HTML in the `Error`.

**Why:** the Cloudflare Tunnel in front of the user's Ollama server returns an HTML 524 page when a generation runs long enough to be killed at the edge. Before this, that raw HTML was thrown straight into the chat's error message and rendered verbatim in the chat bubble (web chat and CLI both just print `err.message`).

**How to apply:** any other failure (auth errors, real Ollama error text, non-gateway-timeout statuses, or a non-HTML body) must keep surfacing its real message unchanged — the rewrite only fires on the HTML-body + gateway-status combination, never as a blanket catch-all.
