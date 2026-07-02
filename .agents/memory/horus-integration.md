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

## Bash tool kills interactive CLIs waiting on a slow response, misreading it as "waiting on user input"

Piping input non-interactively into a `readline`-based interactive CLI (e.g. `printf 'msg\n/exit\n' | tsx chat.ts`) does not reliably work for testing: once the script is waiting on a slow upstream response (like a CPU-hosted Ollama call), the bash tool's "waiting on user input" heuristic can trigger and terminate the shell, even though the process was actually just blocked on network I/O, not stdin.

**Why:** the heuristic can't distinguish "idle process blocked on stdin" from "readline interface open, but currently awaiting an async response" — both look like a hung foreground process.

**How to apply:** don't try to smoke-test slow interactive CLIs (chat REPLs, etc.) via piped bash input. Trust code review + typecheck + the already-validated underlying client function (e.g. `horusChat()` proven via the real pipeline run) instead, or ask the user to try the interactive command themselves in their own terminal.
