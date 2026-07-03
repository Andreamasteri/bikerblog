---
name: Group conversation panel filters to configured agents only
description: How the Horus/Bowie/Quebracho simultaneous-conversation panel avoids breaking when a defined agent isn't configured yet
---

The multi-agent conversation panel (`GET /horus/bowie-conversation` + the "conversation" mode in `horus-chat.tsx`) is built from a *registry* of agent definitions, not a hardcoded pair/trio. The registry is filtered to `isConfigured()` on both sides:

- Server: `buildConvoAgentRegistry` in `artifacts/api-server/src/routes/horus.ts` filters `AGENT_DEFINITIONS` to configured agents before building the turn-rotation; the old behavior aborted the *entire* conversation if any one defined agent (e.g. Quebracho) wasn't configured.
- Client: `GET /horus/agents` includes an `isConfigured` flag per agent; `horus-chat.tsx` derives `convoParticipants`/`convoParticipantNames` from that flag and builds all panel copy (header, button label, placeholder, empty states) dynamically instead of hardcoding names.

**Why:** the system is designed to support N agents (Horus, Bowie, Quebracho, and future ones) but agents get configured incrementally. Without this filter, defining a new agent before it's fully configured breaks the *existing* working agents' group chat too.

**How to apply:** when adding a new agent definition, it will automatically join the group conversation and its UI copy once `isConfigured()` returns true — no code changes needed elsewhere. If you ever need a minimum-participants guard, use `agents.length < 2` against the *already-filtered* registry, not a raw "is every defined agent configured" check.
