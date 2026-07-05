---
name: Quebracho real Ollama provider — VRAM verification
description: How Quebracho (granite4:tiny-h) was activated as a real VRAM-resident agent alongside Horus/Bowie on TC's 8GB card, and what the concurrent-load test showed.
---

## Setup

`QUEBRACHO_OLLAMA_MODEL=granite4:tiny-h` is the only env var needed to activate Quebracho — the provider code (`quebrachoClient` in `lib/horus/src/client.ts`) already existed from a prior session, following the exact Bowie pattern (dedicated env vars with fallback to shared Horus tunnel/CF Access vars). Pull with `ollama pull granite4:tiny-h` on TC (~4.2GB download, resolves to a 4.5GB resident footprint).

## VRAM reality on TC's 8GB card

- Horus (`bikerlink:latest`) alone needs ~8.6GB and already requires partial CPU/GPU split even solo — it's the only agent with `evictOthersBeforeRun: true` (see `vram-arbiter-horus-eviction.md`).
- Bowie (`llama3.2:3b`, ~3.1GB resident) + Quebracho (`granite4:tiny-h`, ~4.5GB resident) coexist fine together WITHOUT eviction — confirmed via real concurrent chat requests, ~7.1GB/8.2GB used, only ~1.1GB free margin. Tight but works.
- A true 3-way concurrent request (Horus + Bowie + Quebracho at once) also returned 200 for all three, but only because Horus's eviction serializes: Bowie/Quebracho got evicted when Horus's turn ran, then Horus itself ended up in a 16%/84% CPU/GPU split. No crash, no OOM — just serialized reloads, not genuine 3-model VRAM residency.

## Fallback-to-CPU already exists, no new code needed

The "soglia operativa oltre cui torna al fallback CPU/RAM invece di OOM/crash" requirement (Task #192 step 6) is already satisfied by Ollama's own behavior: when VRAM is tight it automatically splits layers across CPU/GPU (observed 13-16% CPU offload in the tests above) rather than crashing. Combined with the existing `evictOthersBeforeRun` arbiter (Horus-only), this is sufficient — no additional application-level VRAM threshold logic was added.

**How to apply:** don't add a bespoke VRAM-guard for Quebracho; the existing eviction-for-Horus-only pattern + Ollama's native CPU offload already cover the "never OOM" requirement. If a 4th heavy resident model is ever added, re-verify the Bowie+Quebracho-style coexistence margin (~1.1GB free today) before assuming it fits.
