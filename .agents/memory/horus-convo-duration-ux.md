---
name: Horus↔Bowie conversation duration UX
description: Decisions around keeping the observable Horus↔Bowie conversation from feeling stuck/too long, given real per-turn latency.
---

Given latency is the real bottleneck for Bowie/Horus turns (~90-120s/turn on
the shared CPU Ollama tunnel, see `bowie-real-model-quality-check.md`), don't
try to fix pacing by tuning the model/prompt — it won't help and risks
regressing the turn-taking behavior that was already verified live.

The fix that actually helps is making the wait legible + a bit shorter:
- Server sends `turnNumber`/`totalTurns`/`estimatedSecondsPerTurn` on every
  `turn_start` SSE event so the client can show real progress/ETA instead of
  guessing or just spinning.
- Default turn count was lowered from 8 to 6 to cut worst-case runtime.

**Why:** an 8-turn conversation at ~100s/turn is 12-16 minutes of a user
watching a live stream with no sense of when it ends — that reads as "broken",
not "slow but working."

**How to apply:** any future change to `DEFAULT_MAX_TURNS` or per-turn latency
assumptions in `artifacts/api-server/src/routes/horus.ts` should keep the
frontend's pre-start hint constant in sync (see the follow-up task about
deriving it from a single source of truth instead of a duplicated constant).
