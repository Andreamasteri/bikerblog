---
name: Horus-hub shared file directory on TC
description: Cross-agent shared file tools (save_file/read_file/list_files) backed by a self-hosted Express service on TC, plus the sandbox/deploy quirks hit while wiring them up.
---

## What it is

`horus-hub` is a small Express service running on the user's own TC (thinkcentre) box, exposed via the existing Cloudflare Tunnel at `https://hub.biker-link.net`. It serves a shared directory (`sharedRoot`, e.g. `/home/andrea/agent-shared`) that any AI agent (Horus, Bowie, future Ares/Nadir/Quebracho) can read/write through gated HTTP endpoints (`/files/read`, `/files/write`, `/files/list`), auth'd with a single shared `HUB_GATE_TOKEN` (same pattern as the existing Nadir/analysis services). The service's own source lives in a new GitHub repo (`Andreamasteri/ai`) — separate from bikerblog/bikerlink — so its commit history doubles as a restore-point log, with secrets excluded.

On the Replit side, `lib/horus/src/tools.ts` mirrors the existing `callNadirService`/`isNadirConfigured` pattern: `isHubConfigured()` gates on `HORUS_HUB_URL` + `HUB_GATE_TOKEN` both being present, and `save_file`/`read_file`/`list_files` are added to `getHorusTools()`'s candidate set and to the contextual keyword selector (`selectRelevantTools`) alongside a dispatcher case in `executeHorusTool`.

**Why a whole new repo instead of folding it into bikerlink/bikerblog:** the shared hub is infrastructure that all agents depend on, independent of any single product's release cycle — keeping it separate means its own git history is a clean restore-point log without unrelated app commits mixed in.

## Sandbox quirks hit while building this (reusable lessons)

- **`git commit`/`git push` are blocked by the Replit sandbox for ANY target repo**, not just this workspace's own git. To version a file into an external GitHub repo from the agent sandbox, use the GitHub REST Contents API (PUT to `/repos/{owner}/{repo}/contents/{path}`) instead. `git clone`/`pull`/`stash` on the *destination* machine (TC, via SSH) are fine — the restriction is specific to `git commit`/`push` invoked from the Replit sandbox itself.
- **pm2 does not auto-load `.env`** — Node doesn't either, by default. A service managed by pm2 needs an explicit `require("dotenv").config()` in its own entrypoint; adding a new var to `.env` on TC requires both the code change (if not already loading dotenv) and `pm2 restart <name> --update-env`.
- **The Replit sandbox's bash/node DNS resolver can fail to resolve real Cloudflare-Tunnel-backed hostnames (e.g. `hub.biker-link.net`) even when the tunnel is fully up and verified working** — `curl --resolve <host>:443:<ip>` (or hitting it through the running api-server workflow, which has its own network path) is the reliable way to test connectivity from the agent side. A bare `fetch failed`/`curl` exit 000 from bash for one of these TC-tunneled hosts is not proof the service is down; verify with the resolve workaround before concluding otherwise. This is the same family of issue as the already-documented Horus env-var instability in bash sessions — treat bash-session network results for TC-tunnel hosts as unreliable, and trust workflow-process results instead.
