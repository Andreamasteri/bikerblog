#!/bin/bash
set -e
pnpm install --frozen-lockfile
pnpm --filter db push

# ── BikerLink sync changelog (real-time) ─────────────────────────────────────
# Regenerate docs/bikerlink-sync-changelog.md right after every merge instead
# of only overnight, so the changelog handed to BikerLink never falls behind.
# Runs detached (setsid + nohup + disown) because it calls Horus over the
# Cloudflare tunnel to reword new entries, which can take minutes — far longer
# than this script's own timeout budget. Failure here must never fail the
# merge itself. flock serializes overlapping runs when several tasks merge in
# quick succession, so a burst of merges doesn't cause concurrent writers to
# race on the same changelog/cache files (a queued run still picks up
# everything merged in the meantime, so nothing is lost).
(
  setsid nohup flock /tmp/changelog-sync.lock \
    pnpm --filter @workspace/scripts run changelog:sync \
    > /tmp/changelog-sync-post-merge.log 2>&1 < /dev/null &
  disown
) || true

# ── Pipeline status catch-up ─────────────────────────────────────────────────
# Print overnight pipeline results so the agent sees them immediately after
# every merge without having to run pipeline:status manually.
# Exit code is intentionally swallowed (|| true): post-merge must not fail
# just because the pipeline had a hard failure — the agent reads the output.
echo ""
echo "══ Overnight pipeline report ══════════════════════════════════════════"
pnpm --filter @workspace/scripts run pipeline:status || true
echo "════════════════════════════════════════════════════════════════════════"

# ── Highlighted banner on failure/warning ────────────────────────────────────
# Printed last (after everything else) so a fail/warn is impossible to miss
# without scrolling. Silent when overall=pass.
pnpm --filter @workspace/scripts run pipeline:status -- --banner || true
