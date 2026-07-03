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
- `pnpm --filter @workspace/scripts run cluster:daily` — cron entry point completo in 8 step: (1) aggiorna inbox chat se INBOX_URL è impostato, (2) genera cluster, (3) pubblica post cluster nel DB, (3.5) auto-fetch attività BikerLink da DB live (OTA + restart → diary-notes automatiche), (4) genera il post diaristico del giorno corrente (idempotente), (5) traduce i post senza EN in inglese (idempotente), (6) genera audio TTS per i post senza audio, (7) self-check produzione (verifica + ripara automaticamente dev→prod), (7.5) reindicizzazione semantica Nadir (POST /reindex via `NADIR_URL` + `NADIR_GATE_TOKEN`) per tenere l'indice di ricerca allineato ai contenuti — silenzioso in caso di successo, saltato se non configurato, warn non fatale se irraggiungibile; se però lo step resta in warn per 3 notti consecutive (serie letta dallo storico `inbox/pipeline-history/*.json`, nessuno stato extra) scatta un vero alert via `sendPipelineAlert` perché l'indice è ormai fermo, (9) connettività Horus/Bowie sul tunnel Cloudflare reale contro PROD_URL (vedi sotto)
- `pnpm --filter @workspace/scripts run changelog:sync` — rigenera la sezione automatica di `docs/bikerlink-sync-changelog.md` da due sorgenti: (a) i commit git successivi al backfill iniziale e (b) i **task completati** — rilevati dai commit "Task #NNN" (deduplicati per numero di task, vince il commit più recente) e, se presente, da una sorgente task esterna opzionale `inbox/completed-tasks.json` (stesso schema `ArchivedTask[]` degli altri script). Ogni giorno mostra due sotto-elenchi: "Task completati" e "Altre modifiche". I task Bowie/Nadir compaiono sempre: se il commit ha un tag "Task #NNN" finiscono in "Task completati", altrimenti in "Altre modifiche". Ogni voce mostra **sia** il testo tecnico originale del commit (spesso in inglese) **sia** una riga aggiuntiva "_In parole semplici:_" in italiano semplice generata da Horus — aggiunta accanto, mai al posto dell'originale. Le riformulazioni italiane sono memorizzate in `inbox/changelog-italian-cache.json` (chiave = short hash del commit / `external-#NNN`), così Horus viene chiamato solo per le voci nuove e l'output resta deterministico/idempotente. Se Horus non è configurato o non risponde, la voce mostra solo il testo tecnico (nessun blocco, nessuna voce mancante). Deterministico e idempotente. Flag: `--dry-run`. Eseguito automaticamente dallo step 10 della pipeline notturna. Serve a tenere BikerLink (progetto gemello) allineato su cosa è cambiato qui.
- `pnpm --filter @workspace/scripts run test` — regression test (fixture-based, `node --test`) per: (a) `changelog:sync` — estrazione dei task ref, dedup dei task su più commit, fold-in della sorgente esterna, raggruppamento per giorno e idempotenza (`scripts/src/update-sync-changelog.test.ts`); (b) l'allarme staleness dell'indice Nadir — conteggio della serie di "warn" consecutivi dello step 7.5 letta dallo storico, con reset su ok/skipped/report mancante o illeggibile e nessun doppio conteggio del report odierno (`scripts/src/nadir-warn-streak.test.ts`).
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
- `pnpm --filter @workspace/scripts run horus:sse-smoke` — smoke check manuale che colpisce DAVVERO `/horus/chat`, `/horus/bowie-chat` e `/horus/bowie-conversation`, attraverso il tunnel Cloudflare reale (nessun `chatRaw` finto come nel test sopra), e verifica che arrivi almeno un evento reale (token/heartbeat/turn_start) entro un timeout. Lanciato da console contro `API_BASE_URL` (default `http://localhost:8080`, quindi va eseguito mentre l'api-server gira davvero — vedi Gotchas sull'instabilità delle env var di Horus nella sessione bash diretta). Si auto-salta (exit 0) se `HORUS_CHAT_PASSWORD` o Horus non sono configurati; salta solo i check di Bowie se non è configurato lui. Env opzionali: `API_BASE_URL`, `HORUS_SMOKE_TIMEOUT_MS` (default 45000). La stessa logica (`runHorusSseSmoke()` in `scripts/src/horus-sse-smoke.ts`) è riusata automaticamente dallo step 9 di `cluster:daily` contro `PROD_URL`, quindi un tunnel/Ollama silenziosamente morto genera un alert via `sendPipelineAlert` senza bisogno di lanciare questo comando a mano.
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

Il comando esegue gli step in sequenza (tutti idempotenti):
1. Aggiorna `inbox/bikerlink-chat-latest.md` da BikerLink (solo se `INBOX_URL` è impostato)
2. Genera `inbox/clusters-merged-by-day.md` dai task MERGED
3. Pubblica i cluster nuovi come post del blog (cluster già pubblicati vengono ignorati)
4. Genera il post diaristico per la data odierna (post già esistenti vengono ignorati)
5. Traduce i post senza contenuto EN in inglese (salta i già tradotti) — richiede Horus (vedi sotto)
6. Genera audio TTS (edge-tts) per i post nuovi o riscritti senza `audio_url` — richiede `SESSION_SECRET` (per il token interno) e `edge-tts` installato (installato automaticamente via `postinstall` in `scripts/package.json`)
7. Reindicizza Nadir (step 7.5): chiama `POST /reindex` via `NADIR_URL` + `NADIR_GATE_TOKEN` così l'indice di ricerca semantica resta allineato ai contenuti pubblicati senza trigger manuale. Silenzioso in caso di successo, saltato se Nadir non è configurato, warn non fatale se irraggiungibile (non blocca la pipeline, non genera alert)
8. Verifica raggiungibilità ricerca Nadir (step 9.5): colpisce DAVVERO `POST /search` su Nadir (stesso endpoint usato da `search_manual`) con una query di prova, dopo il check SSE di Horus/Bowie. A differenza dello step 7.5 (che tollera un'indicizzazione fallita senza alert), un fallimento qui finisce tra i `criticalWarnings` e attiva `sendPipelineAlert` — se Nadir muore dopo un reindex riuscito, gli agenti perdono la ricerca semantica senza segnale altrimenti. Silenzioso se Nadir non è configurato, silenzioso in caso di successo. Logica in `scripts/src/nadir-search-smoke.ts` (`checkNadirSearch`).

9. Aggiorna `docs/bikerlink-sync-changelog.md` (step 10): rigenera la sezione automatica dai commit git e dai task completati (vedi `changelog:sync` sopra) — serve a BikerLink (progetto gemello) per allinearsi

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
