---
name: AI Hub shared file directory on TC
description: Cross-agent shared file tools (save_file/read_file/list_files) backed by a self-hosted Express service on TC (the "AI Hub"), plus the sandbox/deploy quirks hit while wiring them up.
---

## What it is

The **AI Hub** (formerly "horus-hub", renamed in Task #193) is a small Express service running on the user's own TC (thinkcentre) box, exposed via the existing Cloudflare Tunnel at `https://hub.biker-link.net`. It serves a shared directory (`sharedRoot`, e.g. `/home/andrea/agent-shared`) that any AI agent (Horus, Bowie, future Ares/Nadir/Quebracho) can read/write through gated HTTP endpoints (`/files/read`, `/files/write`, `/files/list`), auth'd with a single shared `HUB_GATE_TOKEN` (same pattern as the existing Nadir/analysis services). On TC it now lives in `~/ai-hub/` under pm2 process `ai-hub` (the old `~/horus-hub/` dir is left in place as a backup). The service's own source lives in a GitHub repo (`Andreamasteri/ai`) — separate from bikerblog/bikerlink — so its commit history doubles as a restore-point log, with secrets excluded.

On the Replit side, `lib/horus/src/tools.ts` mirrors the existing `callNadirService`/`isNadirConfigured` pattern: `isHubConfigured()` gates on the hub URL + `HUB_GATE_TOKEN` both being present, and `save_file`/`read_file`/`list_files` are added to `getHorusTools()`'s candidate set and to the contextual keyword selector alongside a dispatcher case in `executeHorusTool`.

## Env var name: `AI_HUB_URL` (canonical), `HORUS_HUB_URL` (transitional fallback)

The hub base URL is read via `hubBaseUrl()` = `process.env.AI_HUB_URL ?? process.env.HORUS_HUB_URL`. Canonical name is **`AI_HUB_URL`**; the old `HORUS_HUB_URL` is kept only as a no-downtime fallback so the deploy keeps working before/after the secret is renamed in both dev and prod.

**Why:** the rename had to be no-downtime — the deployed api-server must not lose its hub connectivity during the transition. **How to apply:** once `AI_HUB_URL` is set (same value) in dev + prod and verified, remove the `?? HORUS_HUB_URL` fallback in `hubBaseUrl()` and the paired var in `tools.test.ts`, then delete the old secret. Until then, do not delete `HORUS_HUB_URL`.

## Sandbox quirks hit while building this (reusable lessons)

- **`git commit`/`git push` are blocked by the Replit sandbox for ANY target repo**, not just this workspace's own git. To version a file into an external GitHub repo from the agent sandbox, use the GitHub REST Contents API (PUT to `/repos/{owner}/{repo}/contents/{path}`) instead. `git clone`/`pull`/`stash` on the *destination* machine (TC, via SSH) are fine — the restriction is specific to `git commit`/`push` invoked from the Replit sandbox itself.
- **pm2 does not auto-load `.env`** — Node doesn't either, by default. A service managed by pm2 needs an explicit `require("dotenv").config()` in its own entrypoint; adding a new var to `.env` on TC requires both the code change (if not already loading dotenv) and `pm2 restart <name> --update-env`. Note dotenv reads `.env` from the process cwd, so a pm2 app's cwd must be its own dir.
- **The Replit sandbox's bash/node DNS resolver can fail to resolve real Cloudflare-Tunnel-backed hostnames (e.g. `hub.biker-link.net`) even when the tunnel is fully up and verified working** — `curl --resolve <host>:443:<ip>` (or hitting it through the running api-server workflow, which has its own network path) is the reliable way to test connectivity from the agent side. A bare `fetch failed`/`curl` exit 000 from bash for one of these TC-tunneled hosts is not proof the service is down; verify with the resolve workaround before concluding otherwise. This is the same family of issue as the already-documented Horus env-var instability in bash sessions — treat bash-session network results for TC-tunnel hosts as unreliable, and trust workflow-process results instead.
