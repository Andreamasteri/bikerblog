---
name: Contextual tool selection + always-resident models
description: Why chat attaches only intent-matched tools and why Ollama keep_alive is -1 everywhere
---

# Contextual tool selection + always-resident models

## Only the intent-matched tools are attached per turn
`getHorusTools(message?)` applies a lightweight keyword heuristic
(`selectRelevantTools`) to attach ONLY the minimal subset of tools relevant to
the user's message; a conversational message ("Ciao") attaches ZERO tools.

**Why:** on the CPU "TC" server, attaching the full tool block (verbose JSON
schemas, ~2500-3000 tokens) makes the silent prefill exceed the Cloudflare
Tunnel's ~100s first-byte ceiling → HTTP 524, even for a trivial greeting.
Fewer tokens in the prompt = fast first byte.

**How to apply:**
- Keep selection a SINGLE lightweight pass over the message (no extra model
  round-trip to "decide" tools — that would reintroduce the prefill/timeout).
- Capability gating stays ABOVE contextual selection: a tool whose TC/Nadir
  service isn't configured is never attached even if the message asks for it.
- `getHorusTools()` with NO message returns the full capability-gated set
  (historic behavior). Tests that `mock.module` `getHorusTools` return fake
  tools ignoring the arg, so adding the optional `message` param kept them
  passing — the handler passes `message`, the mock ignores it.
- The sonar `/capabilities` live ping is only paid when `sonar_scan` actually
  survives contextual selection, so a simple message triggers no network call.
- The direct-chat system prompt already tells the model to explicitly say when a
  needed tool isn't in the available list (instead of a generic disclaimer) —
  this matters more now that tools aren't always all present.

## Models stay resident in RAM (keep_alive: -1) — user policy
The shared Ollama client default `keepAlive` is `-1` (all chat agents:
Horus/Bowie/Quebracho), and Nadir's embedding call sends `keep_alive: -1`.

**Why:** explicit user request — the model must stay loaded and only unload via
a manual action on the TC server. Otherwise Ollama unloads after ~5 min idle and
every message/reindex pays the disk-reload cost.

**How to apply:** do NOT reintroduce a timed keep_alive default and do NOT add an
app-level "unload on demand" endpoint (anti-feature-creep) — unload is manual on
TC. A per-call `keepAlive` override remains available.
