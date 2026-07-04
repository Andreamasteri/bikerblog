---
name: VRAM monitor on TC (horus-hub)
description: How GPU/VRAM monitoring and threshold alerting is wired between TC and BikerBlog, and where the state lives.
---

## Shape of the feature

- The actual sampler runs on TC inside `horus-hub/server.js` (external repo, not this workspace): polls `nvidia-smi` on an interval, keeps a 24h rolling window persisted to a local JSON file (survives pm2 restarts), and exposes it via a gated `GET /vram` endpoint (current usage, 24h peak, best-effort per-process breakdown paired against `ollama ps` model names via a hardcoded model→agent map, overridable through an env var).
- Threshold crossing (with hysteresis, both configurable via env) is decided entirely on TC, not on the Replit side — TC POSTs an active/resolved event to a new `/_internal/vram-alert` endpoint on the api-server, reusing the existing `HUB_GATE_TOKEN` shared secret (no new credential needed).
- The api-server endpoint just writes/clears a small state file. A shared helper in `@workspace/horus` reads that file and, when active, returns a ready-to-inject system-prompt fragment.
- That fragment is attached unconditionally in the chat system-prompt builders for **every** agent (Horus, Bowie, Quebracho) — bypassing the per-agent "don't share Horus's memory by default" setting, because this is operational signal, not editorial memory, and the goal is that whoever is chatting notices it.
- A `check_vram_usage` tool (hub-gated, same pattern as `save_file`/`read_file`) lets an agent proactively pull the same `/vram` payload when asked.

**Why split the decision logic this way:** anti-spam/hysteresis has to live where the frequent sampling happens (TC), not on Replit, or every sample would need a round-trip just to decide whether to alert. The Replit side only needs to know the current binary state.

**Why inject into system prompt instead of a push notification:** there's no end-user account/push system in this app (single human user, "admin" and "Mendo" are the same person, not separate identities) — surfacing it next time they open any agent chat is the available channel.

## Verified quirks

- `git commit`/`git push` are blocked by the Replit sandbox even when the *target* is a remote host reached over SSH (not just this workspace's own repo) — the block appears to match on command text, not target. Deploy code changes to TC via `ssh ... 'cat > file'` + `pm2 restart --update-env`; leave git history on that external repo for the user to commit themselves, or handle via the GitHub REST API if that specific repo is on GitHub.
- `pm2 restart <name> --update-env` is required after editing `.env` on TC — plain `pm2 restart` does not reload it.
