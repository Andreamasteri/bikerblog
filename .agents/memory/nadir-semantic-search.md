---
name: Nadir semantic-search service
description: Agent-neutral semantic-search tool (search_manual) backed by a standalone Ollama-embedding service on TC.
---

# Nadir semantic-search

Nadir is a standalone service on TC (same standalone-not-in-monorepo pattern as
`deploy/horus-analysis/`) that indexes a text manual + recent Bowie
conversations + public comments and answers natural-language queries via
`all-minilm` embeddings + file-based cosine similarity (no vector DB). Horus and
Bowie reach it through the shared `search_manual` tool in `lib/horus/src/tools.ts`.

**Gate is env-presence only, no live capability check.** Unlike `sonar_scan`
(which pings `/capabilities` because `SONARQUBE_TOKEN` lives only on TC and can
vary independently), `search_manual` appears purely when `NADIR_URL` +
`NADIR_GATE_TOKEN` are both set on Replit. There is no TC-side sub-config that
can differ, so a capability endpoint would be pointless overhead.

**Why route data through `/_internal/nadir-export` instead of giving Nadir the
DB URL:** keeps the sharp trust boundary — Nadir has no DB access, only a
read-only export gated by the internal bearer token (INBOX_TOKEN, or
SESSION_SECRET-derived HMAC). Nadir never writes to the api-server or DB.

**Agent-neutrality is a hard requirement:** a future 3rd agent ("Quebracho")
must get search by merely receiving the tool list — never hardcode Horus/Bowie
into the tool or the service. The service literally doesn't know which agent is
calling.

**`all-minilm` must stay visible** in logs/health/README (log prefix
`[Nadir/all-minilm]`, `/health` returns `embedModel`). This was an explicit task
requirement, not incidental.

**Reindex success ≠ search reachability — check both separately.** A
successful `/reindex` (pipeline step 7.5) says nothing about whether `/search`
is still up hours later; Nadir can die in between and `search_manual` will
just hand agents a silent "friendly error" string with no operator signal.
The pipeline has a second, later step that calls `/search` directly with a
throwaway query and — unlike the reindex step, which is tolerant/no-alert —
routes a failure into `criticalWarnings` so `sendPipelineAlert` actually
fires. Reuse this "two independent checks, different alert policy" shape for
any other service with a build/write phase and a separate serve/read phase.
