---
name: Semantic supervision (Quebracho cross-check)
description: How the nightly semantic quality round works — cross-check judge, sampling source, batching, and alert fan-out design.
---

## Shape of the feature

- Nightly pipeline step samples recent `llm_traces` rows (`agent in ('Horus','Bowie')`, last 24h, small limit) and has Quebracho (the lightweight economy judge) cross-check them for relevance/tool-use/hallucination/tone.
- **Never self-evaluation**: Quebracho never judges its own traces, and a model never judges itself — cross-check only.
- **One batched judge call per round, not one per trace** — economy constraint: bundle the whole sample into a single prompt asking for a single JSON verdict object, rather than N separate inferences.
- Judge output ids are validated against the actual sampled rows before being treated as real; a hallucinated id from the judge is silently dropped rather than surfaced as a phantom anomaly.
- Alert fan-out is reused, not reinvented: real content anomalies push into the pipeline's existing `criticalWarnings`/notification fan-out AND write a small state file that a shared helper turns into a system-prompt fragment injected into every agent's chat — the exact same two-channel pattern as the VRAM alert (see `vram-monitor-tc.md`).
- **Operational failure of the round itself (Quebracho unreachable, unparsable JSON) is a quiet warn, not an alert** — distinguishing "the judge couldn't run" from "the judge found a real problem" matters, or infra flakiness would generate false content-quality alarms.

**Why:** cross-check + escalate-to-human is the whole point (never auto-correct); keeping it a single batched call keeps it a true "economy" nightly job rather than a per-conversation cost; distinguishing infra failure from real anomaly avoids alert fatigue from transient Quebracho hiccups.

**How to apply:** any future addition to this round (new criteria, new sampled agents, a judge for Quebracho itself) should keep the single-batched-call shape and the infra-failure-vs-anomaly distinction — don't regress to per-row calls or let a timeout masquerade as a content anomaly.
