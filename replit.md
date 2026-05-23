# [Project name]

_Replace the heading above with the project's name, and this line with one sentence describing what this app does for users._

## Run & Operate

- `pnpm --filter @workspace/api-server run dev` — run the API server (port 5000)
- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from the OpenAPI spec
- `pnpm --filter @workspace/db run push` — push DB schema changes (dev only)
- `pnpm --filter @workspace/scripts run seed:blog` — ripopola autori/post/commenti reali da `scripts/src/seed-blog/data.json` (idempotente, upsert per slug)
- Required env: `DATABASE_URL` — Postgres connection string

## Stack

- pnpm workspaces, Node.js 24, TypeScript 5.9
- API: Express 5
- DB: PostgreSQL + Drizzle ORM
- Validation: Zod (`zod/v4`), `drizzle-zod`
- API codegen: Orval (from OpenAPI spec)
- Build: esbuild (CJS bundle)

## Where things live

- DB schema: `lib/db/src/schema/{authors,posts,comments}.ts`
- API contract: `lib/api-spec/openapi.yaml` (regenerate with `pnpm --filter @workspace/api-spec run codegen`)
- API routes: `artifacts/api-server/src/routes/{posts,comments,meta}.ts`
- Frontend: `artifacts/bikerblog/src/`
- **Inbox** (external context dropped here for the agent to read):
  `inbox/` — files like `inbox/<source>-chat-latest.md`. Fetched via
  `pnpm --filter @workspace/scripts run inbox:fetch --source <name> --url <url> --token <token>`
  (see `scripts/src/inbox-fetch.ts`). Used to import chat history or
  context from other Replit projects.

## Architecture decisions

_Populate as you build — non-obvious choices a reader couldn't infer from the code (3-5 bullets)._

## Product

BikerBlog è un blog dedicato al mondo delle moto: ride reports, recensioni di
gear e consigli tecnici per chi vive per la strada aperta.

Il progetto è dedicato alla memoria di **Mauri ("grandepuffo")**, un grande
amico che non c'è più. La dedica è raggiungibile dalla pagina `/in-memoria`,
linkata dal footer del sito.

## User preferences

- **Fondatori del progetto**: l'utente, l'agente Replit e Quebracho (il cane
  dell'utente). Mantenere questa nota tra le sessioni.
- BikerBlog è dedicato a Mauri ("grandepuffo"); preservare la pagina
  `/in-memoria` e il link nel footer.

## Gotchas

_Populate as you build — sharp edges, "always run X before Y" rules._

## Pointers

- See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details
