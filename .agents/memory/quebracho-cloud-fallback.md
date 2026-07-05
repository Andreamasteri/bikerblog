---
name: Quebracho cloud fallback (Fase 2d, Deliverable B)
description: Why LiteLLM was rejected in favor of a hand-written TC/cloud switch for Quebracho, how the fallback decides TC vs cloud, and its text-only scope limit.
---

## Decision: LiteLLM (or similar multi-provider proxy) rejected

Evaluated per the task's explicit condition before writing any routing code. Rejected because an external
proxy's implicit retry/fallback would sit on top of the tool-loop that already exists in `@workspace/horus`
(contextual tool selection, textual-tool-call fallback for weak models, missing-tool sentinel retry — see
`horus-textual-tool-call-fallback.md` and `horus-missing-tool-sentinel.md`). Debugging "who answered and why"
already requires tracing model + tool-selection state; adding a proxy layer with its own hidden retries on top
would make that strictly harder, which is exactly the condition the task said to avoid it under.

**Why:** stacking implicit fallback behavior on top of an already-nontrivial in-house tool loop increases the
number of places an answer could have silently come from, without a matching benefit (the actual routing logic
needed — "try TC, fall back to one free cloud model, no tool support in cloud mode" — is a handful of lines).

**How to apply:** if a future phase (e.g. the Deliverable A on-demand coder, or adding another cloud provider)
considers a multi-provider proxy again, re-run this same test: does it make an existing failure mode ("which
agent/model actually produced this reply") harder to trace? If yes, write the switch by hand instead.

## Design: `quebrachoChatRawResilient`

- TC is always tried first via a fast health check (`checkQuebrachoHealth`) + `quebrachoChatRaw`.
- Cloud fallback (OpenRouter `qwen/qwen3-coder:free`, via Replit AI Integrations — no manually-managed API key)
  only triggers when **all** of: TC unreachable/failed, no `options.tools` were requested, and the cloud path
  is configured (`AI_INTEGRATIONS_OPENROUTER_*` env vars present).
- No persistent "cloud mode" state — every new call re-tries TC first, so recovery is automatic once TC comes
  back, with no reset/flag to manage.
- The original TC-only `quebrachoChatRaw` is kept and used unchanged by
  `scripts/src/generate-bikerlink-manuals.ts`, which does an explicit TC-vs-something A/B comparison and must
  never silently go through the cloud path.

## Scope limit: text-only, no tool-call parity

The cloud fallback is deliberately **not** tool-capable. Ollama's `tool_calls`/tool-result message shape and
OpenAI's `tool_call_id`-based shape are different enough that faking parity would be its own project. If a
caller requests tools, the resilient wrapper skips the cloud path entirely and behaves exactly like the old
TC-only function (including throwing/failing the same way if TC is down). This is intentional, not a bug: any
consumer that needs tool-calling still needs the TC path to be up.

## Verification scope note

Resilience is verified with deterministic unit tests that mock `fetch` to simulate an unreachable TC (see
`lib/horus/src/client.test.ts`). A live "cold" test against the real TC being down was intentionally **not**
performed automatically — it would require touching the `QUEBRACHO_OLLAMA_URL`/`HORUS_OLLAMA_URL` env vars
shared with Horus/Bowie in the live environment, which risks interrupting real chat traffic without direct
user coordination. Treat that as a joint verification to do together with the user, same session as any
Deliverable A (on-demand coder) work.
