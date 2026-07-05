---
name: BikerLink local clone on TC — daily refresh
description: Which local clone of the bikerlink repo on TC actually backs Horus's git_log/search_code tools, how it self-heals, and how the daily cron refresh was added.
---

## Two unrelated `bikerlink` git clones exist on TC — don't confuse them

- `~/bikerlink` on TC is the **live deployment working copy** (runs the docker-compose services, nginx, valhalla, etc.). It already has its own `bikerlink-update.timer`/`.service` (systemd, every 5 min, `git pull --ff-only`) tracked inside the repo itself under `infra/self-host/`. As of 2026-07-05 this one is stuck failing every run (diverged branches: 1 unpushed local infra commit + uncommitted docker-compose/nginx edits) — that's a separate, live-deployment concern, out of scope for anything touching the *analysis* clone; don't "fix" it by force-resetting without understanding the in-progress infra changes first.
- `~/horus-analysis/repos/bikerlink` (and sibling `bikerblog`) is the clone actually used by Horus/Bowie's code-analysis tools (`git_log`, `search_code`, `typecheck_repo`, `lint_repo`) via `ensureRepo()` in `~/horus-analysis/server.js`. This is a separate, purpose-built clone with a shallow depth-1 history — this is the one relevant to any "keep the analysis clone fresh" work.

**Why:** the two look interchangeable by name but serve completely different purposes (live infra vs. read-only code analysis); confusing them risks corrupting live deployment config or building automation nobody actually consumes.

## `ensureRepo()` already self-refreshes on every tool call

`ensureRepo()` in `horus-analysis/server.js` does clone-once, then `fetch --depth 1` + `reset --hard origin/<default-branch>` on every subsequent invocation — so it's always current whenever a tool is actually called. This means an on-demand call is already fresh; a scheduled job's only added value is keeping a repo warm (first-use latency) or fresh even during quiet periods with zero chat activity.

## Daily refresh added via user crontab, not systemd

TC's `andrea` user has no passwordless sudo (`sudo -n true` fails), so any systemd timer/service install requires the user's own manual root action. Since the existing `bikerlink-update.timer` (unrelated, live-deploy clone) was already installed as root beforehand, don't assume sudo is available in a fresh session — check first. Used a **user-level crontab entry** instead (`crontab -e`, no sudo needed) running `~/horus-analysis/refresh-bikerlink-clone.sh` daily (03:17), logging to `~/horus-analysis/bikerlink-clone-refresh.log` (same 500-line-rotation pattern as the existing deploy-clone script) — mirrors the existing sibling script's log format so both are equally readable.

**How to apply:** before reaching for a systemd unit on TC, check `sudo -n true`; if it needs a password, use crontab instead — it covers the same "scheduled job, no manual trigger" requirement without needing root.
