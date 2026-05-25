# [Project name]

_Replace the heading above with the project's name, and this line with one sentence describing what this app does for users._

## Run & Operate

- `pnpm --filter @workspace/api-server run dev` — run the API server (port 5000)
- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from the OpenAPI spec
- `pnpm --filter @workspace/db run push` — push DB schema changes (dev only)
- `pnpm --filter @workspace/scripts run seed:blog` — ripopola autori/post/commenti reali da `scripts/src/seed-blog/data.json` (idempotente, upsert per slug)
- `pnpm --filter @workspace/scripts run fetch:archived-tasks -- --local` — importa i task archiviati di BikerLink da `inbox/bikerlink-history/tasks-meta.json` → `inbox/bikerlink-archived-tasks.json`
- `pnpm --filter @workspace/scripts run fetch:archived-tasks -- --url <url> --token <tok>` — stessa importazione ma da endpoint live BikerLink
- `pnpm --filter @workspace/scripts run cluster:tasks -- --state MERGED --by day` — raggruppa i task per giornata → `inbox/clusters-merged-by-day.md` (candidati post)
- `pnpm --filter @workspace/scripts run cluster:daily` — cron entry point completo in 6 step: (1) aggiorna inbox chat se INBOX_URL è impostato, (2) genera cluster, (3) pubblica post cluster nel DB, (4) genera il post diaristico del giorno corrente (idempotente), (5) traduce i post senza EN in inglese (idempotente), (6) genera audio TTS per i post senza audio
- `pnpm --filter @workspace/scripts run publish:from-clusters` — pubblica manualmente i cluster già generati come post del blog
- `pnpm --filter @workspace/scripts run diary:generate` — genera/aggiorna post narrativi per tutti i 73 giorni (12 mar – 23 mag 2026) usando Claude + chat + task. Flag: `--dry-run`, `--force`, `--map-only`, `--date YYYY-MM-DD`, `--from YYYY-MM-DD`, `--to YYYY-MM-DD`. Scrive la mappa sessioni in `inbox/bikerlink-chat-day-map.json`.
  - **Note developer**: per aggiungere contesto manuale a un giorno (es. giornate di sviluppo intenso senza attività utenti), crea `inbox/diary-notes-YYYY-MM-DD.md` prima che la pipeline giri (23:30). Il generatore lo carica automaticamente e lo passa a Claude come fonte prioritaria. Se il file esiste ma la chat è vuota, genera il post solo dalle note. Se né note né chat sono disponibili, genera un post breve e onesto che riconosce l'assenza di dati invece di inventare narrazioni poetiche ("silenzio del terminale" ecc.).
- `pnpm --filter @workspace/scripts run translate:posts` — traduce i post IT→EN con Claude e salva `title_en`, `excerpt_en`, `body_en` nel DB. Flag: `--dry-run`, `--slug <slug>` (singolo post), `--force` (ritraduci anche chi ha già EN).
- `pnpm --filter @workspace/scripts run translate:backfill` — backfill di massa: traduce tutti i post con `body_en` NULL usando Claude Haiku (economico). Flag: `--dry-run`, `--slug <slug>` (singolo post), `--force` (ritraduci anche chi ha già EN). Logga: X translated, Y skipped, Z failed.
- `pnpm --filter @workspace/scripts run podcast:generate` — genera audio TTS (edge-tts, voce configurabile) per i post senza `audio_url` e li carica su GCS. Flag: `--slug <slug>` (solo un post), `--dry-run`, `--force` (rigenera anche chi ha già audio), `--voice <nome>` (sovrascrive la voce). Env: `PODCAST_VOICE` (default: `it-IT-DiegoNeural`). Richiede `SESSION_SECRET` (già presente).
  - Voci italiane disponibili (`edge-tts --list-voices | grep it-IT`):
    - `it-IT-DiegoNeural` — maschile (default)
    - `it-IT-ElsaNeural` — femminile
    - `it-IT-IsabellaNeural` — femminile
    - `it-IT-GiuseppeNeural` — maschile
  - Esempio voce femminile: `pnpm --filter @workspace/scripts run podcast:generate -- --voice it-IT-ElsaNeural`
- Required env: `DATABASE_URL` — Postgres connection string

## Deployment schedulato (cron 23:30 Europe/Rome)

Il cron giornaliero si configura una volta sola via UI di Replit:

1. Apri il pannello **Deploy → Scheduled**
2. Imposta **Run command**: `pnpm --filter @workspace/scripts run cluster:daily`
3. Imposta **Schedule**: `30 21 * * *` _(21:30 UTC = 23:30 ora italiana)_
4. Pubblica

Il comando esegue 6 step in sequenza (tutti idempotenti):
1. Aggiorna `inbox/bikerlink-chat-latest.md` da BikerLink (solo se `INBOX_URL` è impostato)
2. Genera `inbox/clusters-merged-by-day.md` dai task MERGED
3. Pubblica i cluster nuovi come post del blog (cluster già pubblicati vengono ignorati)
4. Genera il post diaristico per la data odierna (post già esistenti vengono ignorati)
5. Traduce i post senza contenuto EN in inglese (salta i già tradotti) — richiede `ANTHROPIC_API_KEY`
6. Genera audio TTS (edge-tts) per i post nuovi o riscritti senza `audio_url` — richiede `SESSION_SECRET` (per il token interno) e `edge-tts` installato (installato automaticamente via `postinstall` in `scripts/package.json`)

Env opzionali per lo step 1: `INBOX_URL`, `INBOX_TOKEN`, `INBOX_SOURCE` (default: `bikerlink`).

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
- **Inbox** (external context dropped here for the agent to read):
  `inbox/` — files like `inbox/<source>-chat-latest.md`. Fetched via
  `pnpm --filter @workspace/scripts run inbox:fetch --source <name> --url <url> --token <token>`
  (see `scripts/src/inbox-fetch.ts`). Used to import chat history or
  context from other Replit projects.

## Architecture decisions

- **Podcast audio via API streaming**: i file MP3 sono salvati privati su GCS (bucket con public access prevention); vengono serviti da `GET /api/podcast/audio/:slug` nell'api-server usando il sidecar GCS Replit. Il frontend usa questo URL come `src` del player.
- **Token interno derivato da SESSION_SECRET**: gli endpoint `/_internal/*` usano un HMAC(SESSION_SECRET, "internal-api-token-v1") come token di autenticazione. Nessun segreto aggiuntivo necessario per la comunicazione script→server.

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

## Pointers

- See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details
