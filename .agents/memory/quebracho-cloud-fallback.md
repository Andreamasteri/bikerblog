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

**Gotcha — `!options.tools` vs empty array:** the real chat route always passes a `tools` array (possibly
`[]` when no tool matched the message), never `undefined`. A gate written as `!options.tools` treats `[]` as
truthy and disables the cloud fallback for essentially every real conversational message, silently defeating
Deliverable B in production while every unit test (which called the function without `options.tools` at all)
still passed. The gate must check `!options.tools || options.tools.length === 0`. Any future "no tools
requested" check on this codebase should assume callers pass `[]`, not omit the field.

## Scope limit: text-only, no tool-call parity

The cloud fallback is deliberately **not** tool-capable. Ollama's `tool_calls`/tool-result message shape and
OpenAI's `tool_call_id`-based shape are different enough that faking parity would be its own project. If a
caller requests tools, the resilient wrapper skips the cloud path entirely and behaves exactly like the old
TC-only function (including throwing/failing the same way if TC is down). This is intentional, not a bug: any
consumer that needs tool-calling still needs the TC path to be up.

## Verification scope note

Resilience is verified with deterministic unit tests that mock `fetch` to simulate an unreachable TC (see
`lib/horus/src/client.test.ts`).

## Live cold test result

The joint live "cold" test was performed. Isolation trick: point **only** Quebracho at a dead endpoint via
its dedicated `QUEBRACHO_OLLAMA_URL` (Horus/Bowie stay on `HORUS_OLLAMA_URL`/`BOWIE_OLLAMA_URL`), so the live
chat is never touched — no need to take the real TC offline or change the shared var.

Outcome:
- **Routing, isolation, auto-recovery: correct.** TC down → wrapper takes the cloud path; next call with the
  real URL → answers from TC again with no manual reset; Horus/Bowie chat unaffected throughout.
- **The cloud answer itself failed:** `qwen/qwen3-coder:free` returned a **persistent** `429 Provider returned
  error` (stable across several retries over ~40s), i.e. the free tier was throttled, so when TC is down the
  fallback produced *no answer at all*.

**Why it matters:** the mocked unit tests can't catch this — they simulate a *successful* cloud response. An
OpenRouter `:free` model is not a reliable last resort (free models share an account-wide daily cap), so the
fallback can be unavailable exactly when it's needed.

**How to apply:** if fallback reliability matters, don't depend on a single `:free` model — either use a
paid/low-cost OpenRouter model as the true last resort, or try a short chain of `:free` models in order.
This is a product/cost decision, not a silent code change — confirm with the user before implementing.
