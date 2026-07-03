---
name: Bowie second agent
description: How Bowie (a second Ollama agent on the same TC tunnel as Horus) is configured, and the pattern used to generalize the Ollama client for multiple agents.
---

Bowie is a lighter Ollama model on the same ThinkCentre ("TC") as Horus, reached over the same Cloudflare tunnel + Access Service Token by default.

`lib/horus/src/client.ts` exposes `createOllamaAgentClient(config)` — a parametric client (url, CF Access creds, model name, keep-alive, streaming, memory-attachment toggle) used to build both the Horus client and the Bowie client without duplicating the streaming/tool-calling logic.

Env vars for Bowie: `BOWIE_OLLAMA_MODEL` (required to enable it) with `BOWIE_OLLAMA_URL` / `BOWIE_CF_ACCESS_CLIENT_ID` / `BOWIE_CF_ACCESS_CLIENT_SECRET` optional — they fall back to Horus's `HORUS_OLLAMA_URL` / `CF_ACCESS_CLIENT_ID` / `CF_ACCESS_CLIENT_SECRET` when unset, since both agents share the same tunnel unless told otherwise.

**Why:** the user's actual secret name preference was `BOWIE_OLLAMA_MODEL`, not `BOWIE_MODEL` — matches the naming style of `HORUS_OLLAMA_URL`. Bowie intentionally does NOT get Horus's persistent memory file attached (`useHorusMemoryByDefault: false`) — it's a distinct agent, not an alter ego.

**How to apply:** if a third Ollama agent is ever added, follow the same pattern: one `createOllamaAgentClient()` call with a required `<AGENT>_OLLAMA_MODEL` env var and optional URL/CF-creds overrides that fall back to Horus's.

**Confirmed topology (2026-07-03):** in this environment no `BOWIE_OLLAMA_URL`/`BOWIE_CF_ACCESS_*` are set, so Bowie really does share Horus's tunnel/URL/CF creds — same-endpoint topology, not a dedicated tunnel, verified via `printenv` + the running api-server's own health checks (`/horus/health`, `/horus/bowie-health` both return a `model` field now). `checkHealth()` and the health routes surface the real configured model string end-to-end (startup log, health JSON, chat UI header) instead of silently implying a shared model.

**Gotcha:** when asking a user to (re)supply a secret like `BOWIE_OLLAMA_MODEL` via `requestEnvVar`, the userMessage must state the exact literal value expected — otherwise the user may paste the *key name* as the value (happened once: `BOWIE_OLLAMA_MODEL="BOWIE_OLLAMA_MODEL"`). Always verify the new value took effect via a live health/log check after restart, don't assume the round-trip succeeded.

**Confirmed: a third agent (Quebracho) was added following exactly this pattern** — same `createOllamaAgentClient()` shape, `QUEBRACHO_OLLAMA_MODEL` required with URL/CF-creds falling back to Horus's. The N-agent turn-taking loop in the conversation handler needed zero changes (it was already generic by index-mod-N); only the registry entry, a matching `/horus/<agent>-health` route, and the startup config-log line needed updating. Existing tests written for the 2-agent case that use the *default* production registry (not an overridden `buildAgentRegistry`) will break when a new default agent is added — they implicitly assumed exactly 2 agents in their turn/resume-turn counting and had to be updated to the N-agent rotation.
