---
name: Bowie chat known-good file map
description: Complete file list for the working Bowie chat feature (backend + frontend), as of the checkpoint where the user confirmed it works well ("carica i moduli se richiesto in modo preciso"). Use this to know exactly what to restore/diff if the feature regresses or gets corrupted.
---

## Status

Confirmed working by the user on 2026-07-04, right after the TC GPU upgrade (see `bowie-real-model-quality-check.md`): Bowie chat responds fast and can load/use tools correctly when asked precisely. This is the reference "good" state.

**Recovery mechanism:** Replit's automatic checkpoint system already covers this — checkpoint commit `5900a0a` ("Make NVIDIA GPU persistence mode survive reboots automatically") is the exact commit where this was confirmed working. Git tagging isn't available to the main agent (sandboxed as a destructive op), so checkpoints are the restore point, not a tag. If Bowie chat breaks later, diff against this commit (or the nearest earlier checkpoint) for the files below rather than reconstructing from scratch.

## File map

**Ollama client / config:**
- `lib/horus/src/client.ts` — `createOllamaAgentClient` factory + `bowieClient` instance (streaming, Cloudflare Access auth, `BOWIE_OLLAMA_MODEL`/`BOWIE_OLLAMA_URL`)
- `lib/horus/src/index.ts` — exports `bowieChatRaw`, `isBowieConfigured`, `checkBowieHealth`

**API routes:**
- `artifacts/api-server/src/routes/horus.ts` — `POST /horus/bowie-chat`, `POST /horus/bowie-conversation` (Horus↔Bowie↔Quebracho turn-taking), `GET /horus/bowie-conversations[/:id]`, `GET /horus/bowie-health`; also shared `runChatTurn`, `budgetedToolResult`, `tryParseTextualToolCall`
- `lib/db/src/schema/horus-conversations.ts` — `horus_bowie_conversations` table schema

**Shared tool execution:**
- `lib/horus/src/tools.ts` — tool specs (`web_search`, `github_read`, `search_manual`, etc.), `executeHorusTool`, `selectRelevantTools`

**Frontend:**
- `artifacts/bikerblog/src/pages/horus-chat.tsx` — main chat container, mode switching (Horus/Bowie/Observable conversation)
- `artifacts/bikerblog/src/pages/agent-chat-panel.tsx` — reusable per-agent chat panel (streaming, tool status)
- `artifacts/bikerblog/src/hooks/agent-health-status.tsx`, `artifacts/bikerblog/src/hooks/use-agent-health.ts` — agent availability UI/hooks

**Tests:**
- `artifacts/api-server/src/routes/horus.bowie-conversation.test.ts`
- `artifacts/api-server/src/routes/horus.sse.test.ts`
- `artifacts/bikerblog/src/pages/horus-chat.third-agent.test.tsx`

**How to apply:** if Bowie chat regresses (tool calls stop working, responses corrupt/garbled, conversation persistence breaks), first check whether the regression is a code change (diff these files against the last known-good checkpoint) vs. an infra issue (TC GPU/Ollama down — see `tc-ssh-access.md` and `bowie-real-model-quality-check.md` to check TC directly) before rewriting anything.
