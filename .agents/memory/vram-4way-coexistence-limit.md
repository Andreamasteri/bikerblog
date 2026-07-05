---
name: VRAM 4-way coexistence limit (TC 8GB GPU)
description: Empirical measurement showing Horus+Bowie+Quebracho+Nadir cannot all stay resident "Forever" together on TC's 8GB GPU with the Fase 2c economy lineup — informs the naming/lineup decision and the fate of evictOthersBeforeRun.
---

## Finding (measured 2026-07-05, Ollama 0.30.11, TC GPU = 8192MB total)

Candidate economy lineup footprints when resident (from `ollama ps`, includes KV-cache/context overhead, not just file size):

- `qwen3:4b` (Horus candidate): 3.9GB, 100% GPU
- `qwen3:1.7b` (Bowie candidate): 2.2GB, 100% GPU
- `granite4:tiny-h` (Quebracho, already Q4_K_M, 6.9B params): 4.5GB, 100% GPU
- `all-minilm` (Nadir embeddings): ~20-45MB, negligible

Sum ≈ 10.6GB > 8.19GB available. Confirmed empirically: loading all three conversational models + Nadir sequentially works up to 3 resident (qwen3:1.7b + granite4:tiny-h + all-minilm = 6.7GB, ~1.5GB free) — but loading the 4th (qwen3:4b) causes Ollama to auto-evict ALL of the other three to make room, leaving only qwen3:4b resident. There is no combination of these four exact models that fits together simultaneously "Forever".

**Tool-calling smoke test (Step 0) passed for all three**: qwen3:4b, qwen3:1.7b, and granite4:tiny-h all correctly emit native `tool_calls` (not printed as text) on a simple weather-tool prompt, on Ollama 0.30.11. No template/JSON-serialization bug observed at this version. granite4:tiny-h's response has no `thinking` field (terser); Qwen3 models include a `thinking` field alongside the tool call, which the app must keep treating as backend-only reasoning (not shown as the reply).

## Implication for Fase 2c "Done looks like" (4-way full residency)

The task's original success criterion ("Horus, Bowie, Quebracho e Nadir coesistono residenti in VRAM senza eviction reciproca") is infeasible as literally written with this exact model lineup on this GPU — not a code bug, a hardware capacity fact. Resolving requires either: shrinking one of the three conversational models further (quality trade-off), accepting on-demand swap-in/out for at least one agent (already how Ollama behaves by default via LRU-style eviction), or moving one agent off TC.

**How to apply:** before declaring Fase 2c "done", re-check this budget against whatever final model sizes get chosen, and get the trade-off decision documented explicitly (which agent doesn't get permanent residency) rather than silently declaring success against an infeasible bar.

## Related: apparent "hang" during model swap was probably a tunnel/SSH artifact, not an Ollama bug

While bikerlink:latest was resident (8.6GB), attempting to load qwen3:4b via both a backgrounded curl and `ollama run` appeared to hang indefinitely with zero GPU utilization and no corresponding request in `journalctl -u ollama`. But when checked later (after unrelated activity), the swap had actually completed successfully in the background. Likely cause: the `cloudflared access ssh` ProxyCommand connection itself has an idle-connection ceiling similar to the documented ~100s Cloudflare Tunnel HTTP idle-close (see `horus-integration.md`), unrelated to Ollama. **Reliable pattern**: call `ollama stop <model>` explicitly and poll `ollama ps`/`nvidia-smi` until VRAM is confirmed freed before loading the next model, rather than relying on implicit swap-on-demand within a single time-boxed SSH call.
