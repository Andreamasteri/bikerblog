---
name: Horus tool architecture
description: Overview of the tool set available to Horus/Bowie chat (github_read multi-repo, read_blog, web_search, capability-gated code-analysis tools) and how new tools get added.
---

## Base tools always available

`horus:chat` (CLI) and the web chat both use `bikerlink:latest`'s native Ollama function calling with a shared tool set defined in `@workspace/horus` (`lib/horus/src/tools.ts`), executed script-side (never on the Ollama server itself):

- `web_search` — cascading backend (SearXNG → Serper.dev → DuckDuckGo Instant Answer). See `.agents/memory/horus-integration.md` for the auth/reliability lessons behind this design.
- `github_read` — read-only file/folder access to one of several repos (`bikerlink`, `bikerblog`, `bikerweb`), chosen by the model via a `repo` parameter.
- `remember_note` — appends to `inbox/horus-memory.md` (backed up by a deterministic post-turn classifier, `maybeAutoRemember`, since models can "narrate" a tool call without actually emitting one — see `.agents/memory/horus-integration.md`).
- `read_blog` — read-only access to BikerBlog's own *published content* (list/filter by tag/category/search, detail by slug, featured, popular) via the existing public `/posts*` endpoints. Distinct from `github_read`, which reads source code. Used so Horus can study existing style/topics before proposing new post ideas in conversation — never creates/modifies/publishes anything itself.

## Multi-repo github_read config pattern

Each repo in the `GITHUB_REPOS` map declares an ordered list of candidate env vars for its token (most specific first, falling back to the shared `GITHUB_TOKEN_BIKERBLOG` fine-grained PAT). If no token resolves, that repo falls back to anonymous GitHub API reads (lower rate limit, same behavior otherwise).

**Why:** lets a more specific token be dropped in later for any one repo (e.g. a dedicated `GITHUB_TOKEN_BIKERLINK`) without any code change — just set the env var.

**How to apply:** when adding a new repo to `github_read`, add it to the map with its own preferred-then-fallback token env var list rather than hardcoding a single token source.

## Capability-gated analysis tools (typecheck/lint/search/git-log/sonar)

Real static analysis (`typecheck_repo`, `lint_repo`, `search_code`, `git_log`, `sonar_scan`) cannot run inside the Repl or the agent's own execution — it runs as a standalone Express service on the user's own hardware ("TC"), which keeps persistent git clones of the three repos and is gated by its own `X-Analysis-Gate-Token` header. See `.agents/memory/horus-integration.md` for why this had to live off-Repl and the pm2/`.env` deployment gotcha hit while setting it up.

`getHorusTools()` in `lib/horus/src/tools.ts` is **async**: it only advertises the base analysis tools when `HORUS_ANALYSIS_URL` + `ANALYSIS_GATE_TOKEN` are both set, and additionally hides `sonar_scan` specifically by polling the service's `GET /capabilities` (60s cache, 3s timeout, fail-closed) — if SonarQube isn't configured on TC or the service doesn't respond in time, `sonar_scan` silently disappears from the tool list instead of being offered and then failing. Both the web chat and CLI (and therefore Bowie, which shares the same tool list) call `await getHorusTools()`.

**Why:** partial-configuration windows (e.g. analysis service up, SonarQube container not yet started) should degrade to "tool not offered" rather than the model repeatedly trying and failing a tool it can see.

**How to apply:** any new optional/environment-dependent tool should follow the same shape — advertise it only when its prerequisites are confirmed live (via a cheap capability check if availability can change independently of env vars being set), not just when the relevant secret exists.
