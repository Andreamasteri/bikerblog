---
name: BikerLink user-identity exposure toward AI Assistant (investigation)
description: How BikerLink resolves and passes the logged-in user's identity to its AI Assistant (Bowie/Horus/Ares) backend — pure investigation for the "power" follow-up task's per-user history.
---

## Question

Does BikerLink expose the logged-in user's identity to its AI Assistant chat
(Bowie/Horus/Ares), and is that identity tied to a real server-side login
(not something the client can freely set)?

## Answer: yes, real session-derived identity, server-side only

- Endpoint: `POST /api/ai/assistant/message` in BikerLink's
  `server/routes/ai-assistant.ts`, gated by `requireUser` middleware
  (`server/routes/ai-assistant-helpers.ts`).
- `requireUser` reads `req.session.userId` (server-side session, not a
  header/body field) and re-resolves the full user row via
  `storage.getUser(userId)` before attaching it as `req.sessionUser`. A
  request with no valid session gets 401 before the AI agent ever runs.
- The route passes `user.id` into `resolvePersonaForTurn({ userId: user.id, ... })`
  and (elsewhere) into `runAssistantAgent({ userId, ... })`
  (`server/ai/assistant/agent.ts`, `userId?: string | null` field).
- `server/ai/assistant/user-context.ts` (`fetchUserData(userId)`) uses that
  same `userId` to pull live profile/routes/proposals from Postgres and
  injects a short live-context block into the system prompt on every call.
- The client (`components/user/ai-assistant/AssistantChatSheet.tsx`) never
  sends a user id at all — only `message`, `platform`, `history`,
  `source`, `imageUrls`. Identity is entirely resolved server-side from the
  session cookie, so it cannot be spoofed by the client payload.

## What this means for the "power" follow-up task

- The per-user identity signal BikerLink already has is `sessionUser.id`
  (a real DB user id), available on every `/api/ai/assistant/message` call.
- This exists **only inside BikerLink's own backend** (its Express session +
  its `users` table). BikerBlog/TC (Bowie's actual model host) has no
  visibility into it today — BikerLink calls out to TC for inference but the
  identity resolution and DB lookups happen entirely on BikerLink's side
  before that call.
- External dependency for the "power" task: if per-user history needs to
  live on the shared TC side (not just inside BikerLink's own DB), BikerLink
  would need to start forwarding `userId` (or an opaque per-user key derived
  from it) in its calls toward the shared Horus/Bowie infra — that forwarding
  does not exist yet and is out of scope for this investigation.
- Note: the admin-only direct web chat on BikerBlog's own `/horus` route
  (`artifacts/api-server/src/routes/horus.ts`) has no such per-user identity
  today and doesn't need one — it's single-account/admin-only by design.
