---
name: Horus shared lib + web chat
description: Why Horus client/tool logic was extracted into a composite lib, and how the web chat's password gate + streaming work.
---

## Shared client/tools live in `@workspace/horus`, not in `scripts`

`scripts` (CLI) and `artifacts/api-server` (web) cannot import from each other directly — workspace convention requires shared code to live in `lib/*`. The Horus Ollama client (`horusChatRaw`/`horusChat`, NDJSON streaming, persistent memory file I/O) and the tool implementations (`web_search`, `github_read`, `remember_note`) were moved into a new composite lib, `@workspace/horus`, consumed by both the `horus:chat` CLI script and the api-server's web chat route.

**Why:** without this, the web chat would have needed a duplicate/forked copy of the client+tools, which would drift from the CLI version over time (different tool definitions, different memory file, etc.).

**How to apply:** any future Horus-touching feature (CLI or web) should import from `@workspace/horus`, not reimplement client/tool logic locally. If new tools are added, add them once in `lib/horus/src/tools.ts` so both surfaces get them automatically.

## Web chat auth is a simple shared-secret header, not session-based auth

The `/api/horus/chat` route checks a single header (`X-Horus-Password`) against the `HORUS_CHAT_PASSWORD` secret — no user accounts, no session cookie. The frontend stores the password in `sessionStorage` after a one-time unlock screen and resends it on every request.

**Why:** this is a single-operator internal tool (the project owner chatting with their own assistant), not a multi-user feature — a full auth system would be over-engineering for the actual threat model (keep the free-tier LLM + tool-calling surface, including private repo reads and web search, off the open internet).

**How to apply:** if this ever needs multi-user support or stronger security, replace the shared-secret header with real auth (e.g. Replit Auth) rather than bolting more logic onto the password-in-sessionStorage pattern.

## Web chat streams via SSE, mirroring the CLI's NDJSON tool loop

The route re-implements the same tool-loop shape as `horus-chat.ts` (up to 5 iterations: call model with tools → if `tool_calls`, execute and push `role:"tool"` messages → repeat; else stream tokens as the final answer) but emits Server-Sent Events (`token`, `tool_call`, `tool_result`, `done`, `error`) instead of writing to stdout. A 15s heartbeat comment keeps the connection alive through any intermediate proxy/timeout during slow tool calls or model generation.

**Why:** the underlying Ollama call can take minutes on CPU; SSE lets the frontend show live token-by-line streaming and tool-call badges instead of a blank spinner, while the heartbeat avoids idle-connection drops distinct from the already-handled Cloudflare Tunnel streaming requirement inside `horusChatRaw` itself.

**How to apply:** if you need to test this endpoint outside the browser, `curl -N` with `-H "X-Horus-Password: $HORUS_CHAT_PASSWORD"` against `/api/horus/chat` and read the raw `event:`/`data:` lines — don't expect a normal JSON response.
