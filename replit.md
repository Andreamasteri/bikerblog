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
- `pnpm --filter @workspace/scripts run cluster:daily` — cron entry point completo in 7 step: (1) aggiorna inbox chat se INBOX_URL è impostato, (2) genera cluster, (3) pubblica post cluster nel DB, (3.5) auto-fetch attività BikerLink da DB live (OTA + restart → diary-notes automatiche), (4) genera il post diaristico del giorno corrente (idempotente), (5) traduce i post senza EN in inglese (idempotente), (6) genera audio TTS per i post senza audio, (7) self-check produzione (verifica + ripara automaticamente dev→prod)
- `pnpm --filter @workspace/scripts run pipeline:status` — **eseguire all'inizio di ogni sessione** per leggere il report dell'ultima run notturna (`inbox/pipeline-last-run.json`). Mostra step eseguiti, post pubblicati, traduzioni, audio generati, errori e warning. Exit code != 0 se la run è fallita.
- `pnpm --filter @workspace/scripts run pipeline:notify-test` — invia un alert di prova per verificare la configurazione dei canali di notifica (vedi "Notifica di fallimento pipeline" sotto).
- `pnpm --filter @workspace/scripts run self-check` — verifica che ogni post pubblicato negli ultimi 7 giorni sia presente in produzione con `body_en`, `audio_url` e contenuto aggiornato (rileva stale tramite excerpt diff). Se rileva gap, fa push automatico via `/_internal/seed-posts` usando `SEED_TOKEN`. Env opzionali: `PROD_URL` (default `https://bikerlink-blog.replit.app`), `SELF_CHECK_DAYS` (default 7).
- `pnpm --filter @workspace/scripts run bikerlink:activity -- --date YYYY-MM-DD` — recupera OTA release e server restart del DB BikerLink per una data e scrive `inbox/diary-notes-YYYY-MM-DD.md`. Eseguito automaticamente dallo step 3.5 della pipeline. Non sovrascrive note manuali già esistenti. Richiede `BIKERLINK_DATABASE_URL`.
- `pnpm --filter @workspace/scripts run publish:from-clusters` — pubblica manualmente i cluster già generati come post del blog
- `pnpm --filter @workspace/scripts run diary:generate` — genera/aggiorna post narrativi per tutti i giorni usando Horus + chat + task. Flag: `--dry-run`, `--force`, `--map-only`, `--date YYYY-MM-DD`, `--from YYYY-MM-DD`, `--to YYYY-MM-DD`. Scrive la mappa sessioni in `inbox/bikerlink-chat-day-map.json`.
  - **Note developer**: per aggiungere contesto manuale a un giorno (es. giornate di sviluppo intenso senza attività utenti), crea `inbox/diary-notes-YYYY-MM-DD.md` prima che la pipeline giri (23:30). Il generatore lo carica automaticamente e lo passa a Horus come fonte prioritaria. Se il file esiste ma la chat è vuota, genera il post solo dalle note. Se né note né chat sono disponibili, genera un post breve e onesto che riconosce l'assenza di dati invece di inventare narrazioni poetiche ("silenzio del terminale" ecc.).
- `pnpm --filter @workspace/scripts run translate:posts` — traduce i post IT→EN con Horus e salva `title_en`, `excerpt_en`, `body_en` nel DB. Flag: `--dry-run`, `--slug <slug>` (singolo post), `--force` (ritraduci anche chi ha già EN).
- `pnpm --filter @workspace/scripts run translate:backfill` — backfill di massa: traduce tutti i post con `body_en` NULL usando Horus. Flag: `--dry-run`, `--slug <slug>` (singolo post), `--force` (ritraduci anche chi ha già EN). Logga: X translated, Y skipped, Z failed.
- `pnpm --filter @workspace/scripts run horus:remember -- "nota"` — aggiunge una nota permanente alla memoria di Horus (`inbox/horus-memory.md`), allegata automaticamente a ogni chiamata (correzioni, convenzioni, stile).
- Chat web con Horus: `https://<dominio>/horus` (non in nav) — versione web dell'ex chat CLI `horus:chat`, protetta da password (`HORUS_CHAT_PASSWORD`, header `X-Horus-Password`). UI a bolle con streaming SSE token-per-token e badge per le tool call. Backend condiviso con la CLI via `@workspace/horus` (`lib/horus`), route `POST /api/horus/chat` in `artifacts/api-server/src/routes/horus.ts`.
- `pnpm --filter @workspace/api-server run test` — regression check per gli endpoint SSE di chat (Horus/Bowie): avvia un vero server HTTP con un `chatRaw` finto e verifica che gli eventi arrivino davvero e che l'abort scatti solo su disconnessione reale del client, non subito dopo la lettura del body (vedi `artifacts/api-server/src/routes/horus.sse.test.ts`). Usa il test runner nativo di Node (`node --test`), nessun framework aggiuntivo.
- `pnpm --filter @workspace/scripts run podcast:generate` — genera audio TTS (edge-tts, voce configurabile) per i post senza `audio_url` e li carica su GCS. Flag: `--slug <slug>` (solo un post), `--dry-run`, `--force` (rigenera anche chi ha già audio), `--voice <nome>` (sovrascrive la voce). Env: `PODCAST_VOICE` (default: `it-IT-DiegoNeural`). Richiede `SESSION_SECRET` (già presente).
  - Voci italiane disponibili (`edge-tts --list-voices | grep it-IT`):
    - `it-IT-DiegoNeural` — maschile (default)
    - `it-IT-ElsaNeural` — femminile
    - `it-IT-IsabellaNeural` — femminile
    - `it-IT-GiuseppeNeural` — maschile
  - Esempio voce femminile: `pnpm --filter @workspace/scripts run podcast:generate -- --voice it-IT-ElsaNeural`
- Required env: `DATABASE_URL` — Postgres connection string

## Notifica di fallimento pipeline

`run-cluster-daily.ts` invia un alert (silent-on-success: nessun invio se tutto va bene) quando la run notturna fallisce (`overall === "fail"`) o è inaspettatamente silenziosa (0 post pubblicati e 0 audio generati pur avendo eseguito almeno uno step non skippato). Il messaggio include data, motivo, step falliti, post pubblicati, audio generati, traduzioni completate ed errori/warning raccolti. Logica e invio in `scripts/src/notify.ts` (`sendPipelineAlert`), testabile con `pnpm --filter @workspace/scripts run pipeline:notify-test`.

Canali opzionali (si inviano a tutti quelli configurati contemporaneamente; se nessuno è configurato viene solo loggato un warning, la pipeline non si blocca mai per questo):
- **Email via Resend**: `RESEND_API_KEY`, `PIPELINE_ALERT_EMAIL_TO` (opzionale `PIPELINE_ALERT_EMAIL_FROM`)
- **Slack** (incoming webhook): `PIPELINE_ALERT_SLACK_WEBHOOK_URL`
- **Telegram** (bot): `PIPELINE_ALERT_TELEGRAM_BOT_TOKEN`, `PIPELINE_ALERT_TELEGRAM_CHAT_ID`

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
5. Traduce i post senza contenuto EN in inglese (salta i già tradotti) — richiede Horus (vedi sotto)
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
- **Horus (Ollama `bikerlink:latest`) sostituisce Claude/Anthropic per tutta la generazione AI**: diario, traduzioni (`translate.ts`, `translate-backfill.ts`) e recap (`enrich-posts-with-ai.ts`) usano `horusChat()` in `scripts/src/horus-client.ts`. Horus gira su un server dell'utente ("TC") raggiunto via Cloudflare Tunnel + Access Service Token (`HORUS_OLLAMA_URL`, `CF_ACCESS_CLIENT_ID`, `CF_ACCESS_CLIENT_SECRET`). Per la generazione di contenuti editoriali (diario/traduzioni/recap) non ha accesso al codice: quella parte resta esclusivamente all'agente Replit. Nella chat interattiva (`horus:chat`) ha invece accesso READ-ONLY autenticato al codice sorgente di più repo GitHub del progetto come contesto di conversazione (vedi sotto) — nessun harness di coding, nessuna scrittura/commit.
- **Chat interattiva di Horus con tool (`horus:chat`)**: `bikerlink:latest` supporta il function calling nativo di Ollama. `scripts/src/horus-tools.ts` definisce tre tool: `web_search` (vedi voce dedicata sotto), `github_read` (lettura file/cartelle da uno dei repo del progetto — `bikerlink`, `bikerblog`, `bikerweb` — scelto dal modello tramite il parametro `repo`; vedi sotto per l'autenticazione), `remember_note` (salva in `inbox/horus-memory.md`). L'esecuzione dei tool avviene sempre lato script (mai sul server Ollama). `scripts/src/horus-client.ts` espone `horusChatRaw()` (usata dalla chat, restituisce anche `toolCalls`) oltre a `horusChat()` (invariata, usata da diario/traduzioni/recap). L'auto-apprendimento in memoria NON si affida solo al tool `remember_note` (il modello a volte "racconta" di averlo chiamato senza farlo davvero): dopo ogni scambio `horus-chat.ts` esegue anche una classificazione deterministica separata (`maybeAutoRemember`) che salva la nota se rilevante, indipendentemente dal tool calling.
- **`web_search` di Horus usa un backend a cascata** (`scripts/src/horus-tools.ts`), dal più al meno preferito: (1) `HORUS_SEARXNG_URL` — istanza self-hosted di SearXNG su TC (motore di meta-ricerca open source e gratuito, aggrega Google/Bing/DDG), la stessa già usata dall'ecosistema AI di BikerLink (vedi `server/ai/assistant/web-search.ts` nel repo bikerlink) — **attiva e verificata**, protetta da un gate nginx che richiede l'header `X-Searxng-Key` con `SEARXNG_GATE_TOKEN` (non Cloudflare Access: `CF_ACCESS_CLIENT_ID/SECRET` restano solo per Ollama, hostname diverso); (2) `SERPER_API_KEY` — risultati Google reali via serper.dev (piano gratuito limitato), usato se SearXNG non è configurato o la singola richiesta fallisce; (3) fallback keyless sulla DuckDuckGo Instant Answer API (solo contenuti enciclopedici) se nessuna delle due sopra è disponibile. In ogni caso, se la ricerca fallisce o non trova nulla, il tool lo dichiara esplicitamente al modello invece di restituire risultati vuoti o inventati.
- **`read_blog` legge i contenuti pubblicati di BikerBlog**: distinto da `github_read` (che legge il *codice*), questo tool legge i *contenuti pubblici* del blog — elenco post (con filtri `tag`/`category`/`search`), dettaglio per slug, post in evidenza, post più popolari — chiamando gli endpoint pubblici già esistenti dell'api-server (`GET /posts`, `/posts/:slug`, `/posts/featured`, `/posts/popular`). Nessun nuovo secret: gli endpoint sono già pubblici; opzionale `API_BASE_URL` per puntare a un'istanza diversa da `http://localhost:8080`. Sola lettura, usato da Horus per studiare stile e argomenti già trattati prima di proporre a parole bozze di nuovi post — non crea, modifica o pubblica nulla.
- **`github_read` multi-repo con token dedicato a Horus**: il tool legge da `bikerlink` (`Andreamasteri/Bikerlink`), `bikerblog` (`Andreamasteri/bikerblog`, questo stesso progetto) e `bikerweb` (`Andreamasteri/bikerweb`). Il secret `GITHUB_TOKEN_BIKERBLOG` è un fine-grained Personal Access Token creato appositamente per Horus, di sola lettura (permessi "Contents: Read-only" + "Metadata: Read-only", nessuna scrittura/admin) e oggi copre già l'accesso a tutti e tre i repo — separato e più ristretto rispetto al token dell'integrazione GitHub di Replit (che ha permessi push/admin e serve solo per il push/pull di questo progetto). Ogni repo in `GITHUB_REPOS` (`scripts/src/horus-tools.ts`) dichiara una lista ordinata di env var candidate per il token (es. `bikerlink` prova prima un ipotetico `GITHUB_TOKEN_BIKERLINK` più specifico, poi ricade su `GITHUB_TOKEN_BIKERBLOG`): se in futuro arriva un token dedicato più ristretto per un singolo repo, basta impostare quella env var, senza altre modifiche al codice. Se nessun token è disponibile per un repo, si ricade automaticamente in lettura anonima (rate limit pubblico più basso, stesso comportamento). Il valore del secret può essere salvato senza il prefisso `github_pat_` (troncato in fase di incolla) — il codice lo normalizza automaticamente aggiungendo il prefisso se mancante.
- **Analisi statica del codice (`typecheck_repo`, `lint_repo`, `search_code`, `git_log`) gira su TC, non nel Repl**: `deploy/horus-analysis/` è un servizio Express standalone pensato per essere eseguito sull'hardware dell'utente (TC), che mantiene cloni git persistenti di bikerlink/bikerblog/bikerweb ed espone `/typecheck`, `/lint`, `/search`, `/git-log` protetti da header `X-Analysis-Gate-Token`. `lib/horus/src/tools.ts` espone `getHorusTools()` che aggiunge questi 4 tool alla lista base SOLO se sono impostate entrambe le env var `HORUS_ANALYSIS_URL` e `ANALYSIS_GATE_TOKEN`; `HORUS_TOOLS` (deprecato) resta solo i tool base per compatibilità. Sia la web chat (`horus.ts`) sia la CLI (`horus-chat.ts`) usano `getHorusTools()`. Setup del servizio su TC descritto in `deploy/horus-analysis/README.md`; l'agente Replit non ha accesso fisico a TC né può leggere il valore dei secret, quindi l'utente deve copiare token/URL manualmente.
- **Horus richiede `stream: true`**: il Cloudflare Tunnel chiude le richieste dopo ~100s di silenzio (524), ma un post diario/traduzione completo su CPU può richiedere 300s+. `horusChat()` usa streaming NDJSON (accumulando `message.content` chunk per chunk) per mantenere il tunnel vivo; `stream: false` causa fallimenti sistematici sui contenuti lunghi.
- **Memoria persistente di Horus**: `inbox/horus-memory.md` viene caricato automaticamente da `horusChat()` come system message ad ogni chiamata. Per aggiungere una nota permanente (correzioni di stile, convenzioni), usare `pnpm --filter @workspace/scripts run horus:remember -- "nota"`.

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
