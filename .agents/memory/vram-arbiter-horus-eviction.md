---
name: VRAM arbiter — evict others before Horus runs
description: Why direct Horus chat hung forever with no tokens/errors, and the fix (best-effort model eviction via Ollama /api/ps + /api/generate keep_alive:0) before generating.
---

## The bug

Direct chat to Horus (`bikerlink:latest`) hung indefinitely (no token, no error, client timeout) while Bowie (`llama3.2:3b`) on the same TC tunnel replied in <1s. Root cause was NOT in the Express/SSE/client code — confirmed by SSH'ing directly onto TC and calling `localhost:11434/api/chat` for `bikerlink:latest` with no tunnel involved: it still never completed (80s+, HTTP 000).

TC's GPU is only 8GB. Bowie's model sits resident "Forever" (`keep_alive:-1`, ~3.1GB, 100% GPU — this is by explicit user policy, see `horus-contextual-tools-resident.md`). `bikerlink:latest` needs ~8.6GB (GPU+CPU mixed) to run at all reasonably. With Bowie already resident, there isn't enough free VRAM for bikerlink to load properly, and Ollama's CPU-fallback path for the remainder is so slow it never finishes within any sane timeout. With the GPU fully free, bikerlink loads and responds in ~11s.

## The fix

`OllamaAgentConfig.evictOthersBeforeRun` (only set `true` for Horus): before `chatRaw`'s main request, best-effort GET `/api/ps`, and for every OTHER resident model, POST `/api/generate` with `keep_alive:0` to unload it. Timeout-boxed (8s) and swallows all errors — if eviction fails/times out, the normal chat request still proceeds (and will fail with its own clear timeout if there truly wasn't room).

**Why only Horus evicts, not Bowie/Quebracho:** Bowie and Quebracho are small and coexist with each other fine; only Horus's much larger model needs the whole card. Making every agent evict every other agent before every turn would add ~8-11s of reload latency to EVERY turn of the Horus↔Bowie/Quebracho group conversation feature, not just when Horus participates.

**Known residual trade-off:** the group conversation (and alternating direct-chat usage) still pays a reload penalty whenever a turn switches to/from Horus — that's an inherent 8GB-VRAM-card limitation, not something software can fully hide unless bikerlink:latest is requantized to a smaller footprint (out of scope). Worth remembering if Quebracho's real-model turn (Task #192 step 6+) also needs to coexist with Horus.

**How to apply:** any new large/GPU-hungry Ollama agent added to this project should default `evictOthersBeforeRun: true`; small/light agents should not, to avoid needless mutual eviction churn.
