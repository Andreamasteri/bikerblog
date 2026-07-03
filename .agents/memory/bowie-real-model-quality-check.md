---
name: Bowie real-model (llama3.2:3b) quality check
description: Live qualitative results from testing Bowie's actual smaller Ollama model, not just its wiring — coherence, tool use, turn-taking, and latency.
---

Confirmed live (2026-07-03) via `/api/horus/bowie-chat` and `/api/horus/bowie-conversation` against the real `llama3.2:3b` model (not a Horus-shared model):

- **Coherence and tool use are fine.** Direct-chat answers stayed on-topic, used `web_search` correctly when a factual question needed it, and text was grammatically solid Italian.
- **Turn-taking holds up.** In a Horus→Bowie exchange, Bowie's reply genuinely engaged with Horus's specific claim (mild counter-opinion, not just a paraphrase/restate) — the turn-taking system prompt (see `horus-convo-opening-turn.md`) works fine with the weaker model too.
- **Latency is the real risk, not quality.** A single short Bowie reply took ~90–120s end-to-end on the CPU-hosted tunnel, and a tool-using reply took closer to 2 minutes. This is comparable to Horus's own CPU latency (the nightly pipeline already logs occasional 524 gateway timeouts on Horus diary generation), so it isn't Bowie-specific, but it means an 8-turn (default) Horus↔Bowie conversation can realistically run many minutes.

**Why:** the task assumed weaker generation quality might require prompt/turn-length tuning; live testing showed generation *quality* is not the bottleneck — round-trip time on shared CPU Ollama hardware is. Tuning the system prompt would not address that.

**How to apply:** if a future task reports "Bowie conversations feel stuck/broken," check latency (heartbeat/ping cadence, total turns × ~90-120s) before assuming a prompt or model-quality regression — the model itself produces fine answers, it's just slow to produce them.
