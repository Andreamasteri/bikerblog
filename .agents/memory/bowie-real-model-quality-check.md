---
name: Bowie real-model (llama3.2:3b) quality check
description: Live qualitative results from testing Bowie's actual smaller Ollama model, not just its wiring — coherence, tool use, turn-taking, and latency.
---

Confirmed live (2026-07-03) via `/api/horus/bowie-chat` and `/api/horus/bowie-conversation` against the real `llama3.2:3b` model (not a Horus-shared model):

- **Coherence and tool use are fine.** Direct-chat answers stayed on-topic, used `web_search` correctly when a factual question needed it, and text was grammatically solid Italian.
- **Turn-taking holds up.** In a Horus→Bowie exchange, Bowie's reply genuinely engaged with Horus's specific claim (mild counter-opinion, not just a paraphrase/restate) — the turn-taking system prompt (see `horus-convo-opening-turn.md`) works fine with the weaker model too.
- **Latency was the real risk, not quality (CPU era, resolved 2026-07-04).** On CPU-hosted Ollama, a single short Bowie reply took ~90–120s end-to-end, and a tool-using reply took closer to 2 minutes — comparable to Horus's own CPU latency (occasional 524s on diary generation). An 8-turn Horus↔Bowie conversation could run many minutes.

**Why:** the task assumed weaker generation quality might require prompt/turn-length tuning; live testing showed generation *quality* was never the bottleneck — round-trip time on shared CPU Ollama hardware was. Tuning the system prompt would not have addressed that.

**Resolved (2026-07-04):** TC got a GTX 1070 (8GB VRAM) with NVIDIA driver 580.159.03 + CUDA 13.0 installed and a reboot. Ollama now auto-detects and uses the GPU (confirmed via `nvidia-smi` showing ~96% GPU util / ~3GB VRAM used during a real generation call), and both Horus and Bowie are now dramatically faster in practice ("è diventato una scheggia" — user-confirmed on Bowie). The old CPU-latency numbers above no longer apply.

**How to apply:** if a future task reports Bowie/Horus conversations feeling slow again, first check `nvidia-smi` on TC (`ollama.service` status, GPU util during a live call) to confirm the GPU path is still active before assuming a regression back to CPU-bound behavior (e.g. driver issue after a kernel update, OOM on the 8GB VRAM forcing CPU fallback, or the systemd service not picking up the GPU after a reboot).
