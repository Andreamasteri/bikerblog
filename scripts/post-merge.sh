#!/bin/bash
set -e
pnpm install --frozen-lockfile
pnpm --filter db push

# ── Pipeline status catch-up ─────────────────────────────────────────────────
# Print overnight pipeline results so the agent sees them immediately after
# every merge without having to run pipeline:status manually.
# Exit code is intentionally swallowed (|| true): post-merge must not fail
# just because the pipeline had a hard failure — the agent reads the output.
echo ""
echo "══ Overnight pipeline report ══════════════════════════════════════════"
pnpm --filter @workspace/scripts run pipeline:status || true
echo "════════════════════════════════════════════════════════════════════════"
