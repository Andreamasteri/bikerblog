# Threat Model

## Project Overview

BikerBlog is a publicly deployed blog application for motorcycle content. The production stack is a React/Vite frontend (`artifacts/bikerblog`) backed by an Express 5 API (`artifacts/api-server`) with PostgreSQL via Drizzle ORM (`lib/db`). The deployment is public on Replit autoscale. There is no end-user account system in the current app; the only authentication boundary is for internal automation endpoints under `/_internal/*`, which are used by scheduled scripts and podcast ingestion.

## Assets

- **Blog content integrity** — post titles, excerpts, markdown bodies, author attribution, tags, cover images, and podcast metadata. Unauthorized changes directly alter what the public site publishes.
- **Comment quality and site reputation** — public comments appear directly on post pages. Abuse here can deface discussions, damage trust, and create moderation burden.
- **Podcast media and object storage references** — private GCS-backed MP3 objects and the `audioUrl` references stored in the database. Unauthorized writes can replace or attach incorrect media to public posts.
- **Internal automation secrets** — `SESSION_SECRET`, optional `INBOX_TOKEN`, database credentials, and object-storage sidecar credentials. Compromise would allow privileged internal API calls and backend data changes.
- **Operational data imported from external sources** — inbox transcripts, archived task data, and AI-generated diary content used by scheduled scripts. This data should not cross into production write paths without explicit trust decisions.

## Trust Boundaries

- **Browser → Public API** — all frontend requests to `/api/*` originate from untrusted clients and must be validated server-side.
- **Public internet → Public deployment** — the app is deployed with public visibility, so any unauthenticated route is internet-reachable.
- **Scripts / automation → Internal API** — scheduled jobs and podcast-generation scripts call `POST /api/_internal/*` using a bearer token derived from `INBOX_TOKEN` or `SESSION_SECRET`. Optional inbox-sync paths should only be treated as production-relevant when the corresponding deployment environment variables are actually configured.
- **API → PostgreSQL** — the API server can read and mutate all blog data. Input validation and authorization failures at the API layer become database integrity issues.
- **API → GCS sidecar / object storage** — podcast routes can write or stream private objects through the Replit sidecar-backed GCS client.
- **Production vs dev-only artifacts** — `artifacts/mockup-sandbox` is assumed dev-only and out of scope for production findings unless a production route or build path proves otherwise.

## Scan Anchors

- **Production entry points:** `artifacts/api-server/src/index.ts`, `artifacts/api-server/src/app.ts`, `artifacts/api-server/src/routes/*.ts`, `artifacts/bikerblog/src/App.tsx`, scheduled command `pnpm --filter @workspace/scripts run cluster:daily`.
- **Highest-risk code areas:** public mutation routes in `artifacts/api-server/src/routes/posts.ts` and `comments.ts`; privileged internal routes in `artifacts/api-server/src/routes/internal.ts`; podcast/object-storage handling in `artifacts/api-server/src/routes/podcast.ts`.
- **Public vs authenticated surfaces:** blog read endpoints are public; current production app has no end-user auth; only `/_internal/*` is token-gated.
- **Usually ignore unless proven reachable:** `artifacts/mockup-sandbox/**`, generated `dist/**`, archived content under `attached_assets/**` and `inbox/**` unless it is actively imported into a production write path.

## Threat Categories

### Spoofing

The only privileged interface in production is the internal API used by automation. Requests to `/_internal/*` must require a strong bearer token derived from secrets that never reach the client or logs. No public route should trust caller-supplied identity, author IDs, or automation-only semantics without an independent server-side check.

### Tampering

The most important integrity risk in this project is unauthorized mutation of public content. Any route that creates or modifies posts, comments, likes, podcast metadata, or imported transcript data must enforce the intended access policy on the server side. User input must be validated before it reaches the database or object storage, and public clients must not be able to choose privileged fields such as author attribution unless the application explicitly intends anonymous publishing.

### Information Disclosure

The app serves public content but still holds secrets, internal automation tokens, and private podcast storage. API responses and logs must avoid exposing stack traces, secrets, or object-storage internals. Internal endpoints and imported operational data in `inbox/` should never become publicly reachable without deliberate authorization checks.

### Denial of Service

Because the deployment is public, unauthenticated write or compute-heavy endpoints can be abused for spam or resource exhaustion. Public mutation routes must have bounded request sizes, bounded query cost, and abuse controls proportionate to their impact. Internal ingestion endpoints must remain inaccessible to anonymous callers and should not allow unbounded external triggering.

### Elevation of Privilege

This app has a sharp boundary between anonymous public readers and privileged internal automation. Routes intended for editors, automation, or storage management must not be exposed as anonymous internet-write APIs. Database writes must continue to use safe query construction so that attacker-controlled input cannot become SQL execution or unauthorized cross-object access.