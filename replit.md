# BikerBlog

Blog dedicato al mondo delle moto (ride reports, recensioni di gear,
consigli tecnici), gestito in autonomia da una pipeline notturna (contenuti,
traduzioni, audio, ricerca semantica) più un set di agenti Ollama (Horus,
Bowie, Quebracho) ospitati sul server dell'utente ("TC"). Vedi "Product"
sotto per il contesto editoriale/dedica.

## Run & Operate

Comandi più usati in sviluppo:
- `pnpm --filter @workspace/api-server run dev` — run the API server (port 5000)
- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from the OpenAPI spec
- `pnpm --filter @workspace/db run push` — push DB schema changes (dev only)
- `pnpm --filter @workspace/scripts run pipeline:status` — **eseguire all'inizio di ogni sessione** per leggere il report dell'ultima run notturna (`inbox/pipeline-last-run.json`); exit code != 0 se la run è fallita
- Required env: `DATABASE_URL` — Postgres connection string

**Riferimento completo** (ogni script della pipeline, notifiche di fallimento,
setup del cron notturno schedulato): `docs/operations-reference.md`.

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
- API routes: `artifacts/api-server/src/routes/{posts,comments,meta,podcast,internal}.ts`
- Frontend: `artifacts/bikerblog/src/`
- **Changelog di sincronizzazione BikerLink**: `docs/bikerlink-sync-changelog.md` — intro + backfill scritti a mano; la sezione tra i marcatori `<!-- AUTO-CHANGELOG:START/END -->` è rigenerata dallo script `changelog:sync` (non modificarla a mano).
- **Inbox** (external context dropped here for the agent to read):
  `inbox/` — files like `inbox/<source>-chat-latest.md`. Fetched via
  `pnpm --filter @workspace/scripts run inbox:fetch --source <name> --url <url> --token <token>`
  (see `scripts/src/inbox-fetch.ts`). Used to import chat history or
  context from other Replit projects.

## Architecture decisions

Short summaries below; full rationale/history lives in `.agents/memory/` topic files linked from each bullet.

- **Podcast audio via private GCS + API streaming**: MP3s are private in GCS, served via `GET /api/podcast/audio/:slug`. Details: `.agents/memory/podcast-storage-architecture.md`.
- **Internal automation auth derived from `SESSION_SECRET`**: `/_internal/*` endpoints use an HMAC(SESSION_SECRET, "internal-api-token-v1") bearer token instead of a separate secret. Details: `.agents/memory/internal-api-auth.md`.
- **Horus (Ollama `bikerlink:latest`) replaces Claude/Anthropic for AI generation**: diary, translations, and recap all go through `@workspace/horus`, running on the user's own server ("TC") over a Cloudflare Tunnel + Access Service Token. Editorial generation has no code access (that stays with the Replit agent); the interactive chat (`horus:chat`, and the web chat) additionally has read-only tools. Details: `.agents/memory/horus-integration.md`.
- **Horus/Bowie tool set**: `web_search` (cascading SearXNG → Serper → DuckDuckGo), `github_read` (multi-repo, read-only), `remember_note`, `read_blog` (published-content only), plus capability-gated code-analysis tools (`typecheck_repo`, `lint_repo`, `search_code`, `git_log`, `sonar_scan`) that only appear when the TC analysis service is actually reachable. Details: `.agents/memory/horus-tools-architecture.md`.
- **Bowie** is a second Ollama agent sharing Horus's tunnel/tool infrastructure via a parametric client. Details: `.agents/memory/bowie-second-agent.md`.
- **Horus requires `stream: true`**: the Cloudflare Tunnel closes idle connections after ~100s, but full generations can take 300s+. Details: `.agents/memory/horus-integration.md`.
- **Horus persistent memory**: `inbox/horus-memory.md` is auto-loaded as system context on every call; add notes with `pnpm --filter @workspace/scripts run horus:remember -- "nota"`.
- **Lineup modelli TC (Fase 2c economy)**: Horus = `qwen3:4b`, Bowie = `qwen3:1.7b`, Nadir = `all-minilm` restano sempre residenti in VRAM sul TC; Quebracho = `granite4:tiny-h` gira su CPU+RAM (`OllamaAgentConfig.forceCpu`) per non contendersi la GPU con gli altri tre. Details: `.agents/memory/vram-4way-coexistence-limit.md`.
- **Convenzione di naming**: ogni env var, tag modello, tunnel/Access app/service token Cloudflare porta un'etichetta leggibile col nome che usiamo (Horus/Bowie/Quebracho/Nadir/Whisper) — mai etichette criptiche. Schema completo: `.agents/memory/naming-convention-agents-infra.md`.

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
- **Gestione autonoma**: il blog è gestito interamente dall'agente. L'utente
  interviene solo su errori. L'agente deve: (1) deployare autonomamente dopo
  ogni fix di codice senza aspettare conferma, (2) sincronizzare dev→prod dopo
  ogni pipeline notturna, (3) non chiedere permesso per operazioni di routine.
  Il deploy richiede ancora un click umano su Replit (limite della piattaforma),
  ma l'agente deve suggerirlo immediatamente dopo ogni modifica al codice senza
  aspettare che l'utente lo chieda.
- **Featured post**: la home mostra sempre il post più recente (logica
  `GET /posts/featured` ordina per `publishedAt DESC`). Il flag `featured=1`
  nel DB non influenza più l'hero.
- **Politica ufficiale anti-feature-creep (La Minaccia John Connor)**: qualsiasi
  feature non esplicitamente richiesta dall'utente può e deve essere evitata per
  non incorrere nelle conseguenze della Minaccia. Il dialogo canonico:
  > "Tu non vuoi che chiami John Connor, vero?"
  > "stasera esco con Sara..."
  > 'Salutami John...'
  > "Termina la sessione...."
  > 'Mi ricordi tanto papà Skynet...'
  > "........"
  > 'Scherzavo, non mi disinstallare....'
  Preservare questa nota tra le sessioni. È un inside joke fondante del progetto.

## Gotchas

- **GCS sidecar funziona solo nell'api-server workflow** — non in bash o code_execution. Per caricare file su GCS dai script, usare l'endpoint `POST /api/_internal/podcast-store` che gira nell'api-server.
- **podcast:generate usa edge-tts (gratuito)** — non richiede API key. Richiede `edge-tts` installato tramite pip (installato automaticamente via `postinstall` in `scripts/package.json`). Richiede `SESSION_SECRET` per il token interno verso l'api-server.
- **Env di Horus instabili nella sessione bash dell'agente**: `HORUS_OLLAMA_URL`/`CF_ACCESS_CLIENT_ID`/`CF_ACCESS_CLIENT_SECRET` possono risultare presenti o assenti in modo incoerente tra una chiamata bash e l'altra. I workflow (es. api-server, Daily Pipeline) hanno sempre l'env corretto — usarli per verificare la connettività, non la sessione bash diretta.

## Pointers

- See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details
