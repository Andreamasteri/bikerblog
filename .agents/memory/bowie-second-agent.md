---
name: Bowie second agent
description: How Bowie (a second Ollama agent on the same TC tunnel as Horus) is configured, and the pattern used to generalize the Ollama client for multiple agents.
---

Bowie is a lighter Ollama model on the same ThinkCentre ("TC") as Horus, reached over the same Cloudflare tunnel + Access Service Token by default.

`lib/horus/src/client.ts` exposes `createOllamaAgentClient(config)` — a parametric client (url, CF Access creds, model name, keep-alive, streaming, memory-attachment toggle) used to build both the Horus client and the Bowie client without duplicating the streaming/tool-calling logic.

Env vars for Bowie: `BOWIE_OLLAMA_MODEL` (required to enable it) with `BOWIE_OLLAMA_URL` / `BOWIE_CF_ACCESS_CLIENT_ID` / `BOWIE_CF_ACCESS_CLIENT_SECRET` optional — they fall back to Horus's `HORUS_OLLAMA_URL` / `CF_ACCESS_CLIENT_ID` / `CF_ACCESS_CLIENT_SECRET` when unset, since both agents share the same tunnel unless told otherwise.

**Why:** the user's actual secret name preference was `BOWIE_OLLAMA_MODEL`, not `BOWIE_MODEL` — matches the naming style of `HORUS_OLLAMA_URL`. Bowie intentionally does NOT get Horus's persistent memory file attached (`useHorusMemoryByDefault: false`) — it's a distinct agent, not an alter ego.

**How to apply:** if a third Ollama agent is ever added, follow the same pattern: one `createOllamaAgentClient()` call with a required `<AGENT>_OLLAMA_MODEL` env var and optional URL/CF-creds overrides that fall back to Horus's.
