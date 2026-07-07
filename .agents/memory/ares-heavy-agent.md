---
name: Ares heavy on-demand agent
description: How the 4th (non-resident) agent Ares evicts the economy lineup, analyzes one backlog item, and restores — plus the propose-only invariant and where the pieces live.
---

# Ares — agente heavy on-demand (POWER mode)

Ares is the 4th agent and, unlike the economy lineup (Horus/Bowie/Quebracho/Nadir),
it is **NOT** resident in VRAM. It loads only on an admin trigger, runs a heavy
model (`devstral` 24B), analyzes ONE supervision-backlog item, then unloads and
restores the lineup.

## Invariant (project boundary)
**"Ares propone, l'admin decide."** Ares only diagnoses and PROPOSES (typically
two resolution paths per problem). It never applies changes, never installs
anything, never runs state-changing commands. If a new tool/dependency would
help, it proposes it in prose — it does not try to use/install it. This mirrors
the same no-autocorrection boundary as the supervision backlog and the threat
model.

**Why:** the whole multi-agent design keeps code-change authority with the human
+ the Replit agent; the Ollama agents are read-only advisors. Breaking this would
turn an advisor into an unreviewed actor on the user's live blog.

## Orchestration shape (the risky part)
One cycle in `runAresAnalysis(backlogId)`:
1. single-cycle lock (in-process timestamp + TTL) — rejects concurrent triggers
   so the GPU isn't double-evicted;
2. snapshot residents via `GET /api/ps` (self-configuring — restores exactly what
   was there, no hardcoded lineup);
3. evict each snapshot model (`POST /api/generate {keep_alive:0}`);
4. analyze (bounded tool loop, read-only tools = full `getHorusTools()` set);
5. unload Ares;
6. **restore the lineup in a `finally`** — always attempted, even if analysis
   throws (warmup `{keep_alive:-1}`, embeddings fallback for all-minilm/Nadir);
7. health/restore-failure surfaced to the caller; the admin endpoint logs it.

**Why the finally matters:** an eviction that fails mid-analysis must not leave
the blog's resident agents unloaded. The restore + lock-release live in `finally`
so a thrown analysis still puts the lineup back and frees the lock.

**Why `/api/ps` snapshot instead of a hardcoded lineup:** the resident set can
change (economy tuning, Nadir on/off); snapshotting reality means restore fidelity
without editing code each time the lineup changes.

## Two modes share one GPU cycle
The lock/snapshot/evict/finally-restore/health orchestration is a generic helper
`runAresGpuCycle<T>(work, {signal, preflight})`. Two modes ride it:
- `runAresAnalysis(backlogId)` — reviews a supervision-backlog item, persists to DB.
- `runAresTaskReview(taskContent)` — reviews a task PLAN (scope/risks/missing
  steps/contradictions), **no DB persistence**, review-oriented system prompt.

**Why the split:** the risky part (evicting the resident lineup and guaranteeing
restore) must be identical for every future Ares mode; only the `preflight` (load
inputs, before touching the GPU) and `work` (the tool loop) differ. `preflight`
runs BEFORE any eviction, so a bad input can never leave the lineup unloaded.
Conflict detection uses the exported `ARES_BUSY_MESSAGE` constant (exact match),
not a substring, so callers/endpoints signal 409 deterministically.

## Access / security
Trigger + list are **admin-only** (`/_internal/*`, bearer derived from
`SESSION_SECRET`/`INBOX_TOKEN`). Ares is deliberately NOT a public chat tool and
NOT an anonymous route: it's a heavy op that evicts the resident agents (threat
model: Elevation of Privilege / DoS). Endpoints:
`POST /_internal/ares/analyze/:id`, and the backlog admin routes
`GET /_internal/supervision-backlog`, `POST /_internal/supervision-backlog/:id/status`.

## Enabling
Env-gated like Bowie/Quebracho: set `ARES_OLLAMA_MODEL` (e.g. `devstral:24b`) to
enable; `ARES_OLLAMA_URL`/`ARES_CF_ACCESS_CLIENT_ID`/`ARES_CF_ACCESS_CLIENT_SECRET`
optional (default to Horus's tunnel/creds). Until set, `isAresConfigured()` is
false and the trigger returns 503 — code is ready, enabling is a later env action.

## Testing note
`ares.ts` has module-level state (the lock) and a client bound at module load, so
unit tests must **cache-bust the import** (`import("./ares.js?t=N")`) per test to
get a fresh module bound to that test's mocks — otherwise the first test's fake
client/lock leaks into the rest. Network primitives read `global.fetch`
dynamically, so overriding `global.fetch` is enough to intercept /api/ps and
/api/generate without touching the real TC.
