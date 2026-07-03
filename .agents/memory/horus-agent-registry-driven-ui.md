---
name: Agent-registry-driven health gate
description: How Horus/Bowie health checks and conversation config are derived from one server-side agent list instead of hand-copied endpoint arrays.
---

The server holds a single ordered list of agent definitions (id, display name, health/chat paths, config for the observed conversation). Health routes, direct-chat routes, the conversation's turn-taking registry, and a `GET .../agents` endpoint are all generated from that one list.

Frontend tests that mock `fetch` for this chat page must also stub the agent-registry endpoint (in addition to the per-agent health endpoints) or the UI stays stuck behind the "unreachable" gate.

**Why:** before this, health-check endpoints and "X is unreachable" copy were hardcoded per-agent in the frontend. Adding/removing an agent meant updating N places by hand, and they silently drifted (e.g. a message updated in one spot but not the other).

**How to apply:** the frontend fetches the agent list from the server instead of hardcoding endpoints, then feeds the returned health-check paths into the existing generic health-polling hook. Any UI that needs "is agent X reachable" text should derive it from the fetched registry, not a hardcoded per-agent string. When the registry fetch itself fails, fall back to a generic "unreachable" state (with the fetch's own error message) rather than leaving the UI stuck in an infinite "checking" state.

Related but separate gotcha hit while verifying this: `pnpm --filter <pkg> run typecheck` can show stale errors referencing types/columns that were already removed, if composite lib `.tsbuildinfo` output is stale. Run `pnpm run typecheck:libs` (root) first before trusting new typecheck errors that look unrelated to your diff.
