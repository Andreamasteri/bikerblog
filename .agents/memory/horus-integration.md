---
name: Horus (Ollama) integration lessons
description: Non-obvious constraints when calling a self-hosted Ollama model over a Cloudflare Tunnel for content generation, and env/process limitations of the agent's bash session.
---

## Cloudflare Tunnel requires streaming for long generations

Cloudflare Tunnel closes a request after ~100s of no data on the wire, returning a 524. A full diary post or translation on CPU-hosted Ollama can take 300s+ to generate, so a plain `stream: false` chat call reliably fails on anything non-trivial.

**Why:** the 524 isn't from Ollama or the app — it's the tunnel itself timing out on silence, independent of any HTTP client timeout setting.

**How to apply:** any client calling an Ollama-style `/api/chat` endpoint through a Cloudflare Tunnel must use `stream: true` and incrementally consume the NDJSON chunks (concatenating `message.content` across lines) so bytes keep flowing and the tunnel stays alive. Non-streaming works fine for short prompts/responses but should not be relied on for generation tasks with unpredictable length.

## Agent bash session cannot reliably read newly-added secrets, and cannot host background/long-running processes

After adding a new secret, the interactive bash tool session's env can fluctuate — the var may show as present in one call and absent in the next, unpredictably. Actual workflows (restarted via the workflow tool) reliably have correct, current env.

Additionally, detached/backgrounded processes (setsid+nohup+disown) do not survive between bash tool calls — they get killed. Confirmed by a sleep-90 test that died within 5s of a follow-up call.

**Why:** the bash tool sandbox appears to tear down/reset backgrounded work and does not guarantee env-var propagation the way a persistent workflow process does.

**How to apply:** for (a) verifying a newly-added secret/env var, or (b) any long-running/slow external call (e.g. a slow self-hosted LLM), don't rely on the bash tool directly — add a temporary route/script invoked through an actual running workflow (or trigger the real pipeline workflow) and check results via logs, then remove the temporary scaffolding once verified.

## Ollama tool-calling works over the tunnel, but function-call reliability is model-dependent

`bikerlink:latest` supports native Ollama function calling (`tools` in `/api/chat`, `message.tool_calls` in the response), even combined with `stream: true` — the tool_calls arrive fully formed in an early chunk, they don't need incremental merging. This unlocks tool-loop architectures (web search, external reads, memory writes) for any locally-hosted Ollama chat, not just this project.

**Why it matters:** the weaker/smaller a model is, the less reliable it is at actually invoking a tool vs. just narrating in plain text that it "did" something (e.g. it will say "I saved that to memory" without emitting a real `remember_note` tool_call). Don't trust tool-calling alone for actions that must always happen.

**How to apply:** for any action that must be reliable regardless of the model's tool-calling discipline (e.g. auto-saving memory), add a small deterministic fallback pass — a separate lightweight classification prompt after the turn that decides yes/no and performs the write directly — rather than depending solely on the model choosing to call the tool.

## Keyless web search options are limited for self-hosted chat scripts

DuckDuckGo's `/html/` scrape endpoint returns an anti-bot challenge page (HTTP 202) when hit programmatically — not usable. The `api.duckduckgo.com` Instant Answer JSON endpoint is a real keyless option, but only surfaces encyclopedic/Wikipedia-style abstracts, not general web search or live news.

**Why it matters:** Replit's own external-API search connectors (Brave/Exa/Firecrawl passthrough billing) are only callable from the agent's `code_execution` sandbox — they are not reachable from a standalone Node script that runs independently of the agent (e.g. a CLI the user runs directly).

**How to apply:** for real general-purpose web search from a standalone script/service (not the agent itself), either accept the Instant-Answer API's narrower coverage or get the user to provision a dedicated search API key (Brave Search API, Tavily, etc.) as a secret.

## Bash tool kills interactive CLIs waiting on a slow response, misreading it as "waiting on user input"

Piping input non-interactively into a `readline`-based interactive CLI (e.g. `printf 'msg\n/exit\n' | tsx chat.ts`) does not reliably work for testing: once the script is waiting on a slow upstream response (like a CPU-hosted Ollama call), the bash tool's "waiting on user input" heuristic can trigger and terminate the shell, even though the process was actually just blocked on network I/O, not stdin.

**Why:** the heuristic can't distinguish "idle process blocked on stdin" from "readline interface open, but currently awaiting an async response" — both look like a hung foreground process.

**How to apply:** don't try to smoke-test slow interactive CLIs (chat REPLs, etc.) via piped bash input. Trust code review + typecheck + the already-validated underlying client function (e.g. `horusChat()` proven via the real pipeline run) instead, or ask the user to try the interactive command themselves in their own terminal.
