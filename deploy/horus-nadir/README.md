# horus-nadir (Nadir · da eseguire su TC)

**Nadir** dà a Horus e Bowie (e a un eventuale terzo agente futuro, es.
"Quebracho") la capacità di fare **ricerca semantica** — per significato, non
per parole esatte — su tre corpi di testo:

1. un **"manuale"** testuale (`inbox/nadir-manual.md`, lato repo);
2. le **conversazioni recenti** che coinvolgono Bowie;
3. i **commenti pubblici** dei post del blog.

Gli embedding sono calcolati in locale da Ollama con il modello **`all-minilm`**;
l'indice è un semplice file JSON con similarità del coseno in memoria (nessun
database vettoriale). Come `deploy/horus-analysis/`, **non fa parte del monorepo
pnpm**: è un piccolo servizio standalone da copiare ed eseguire su TC
(ThinkCentre), la stessa macchina dove girano già Ollama, SearXNG e il servizio
di analisi.

Perché su TC e non su Replit: i tool di Horus/Bowie eseguono sempre lato client,
mai sul server del modello. Tenere anche l'indicizzazione e gli embedding su TC
significa che il modello `all-minilm` e i dati indicizzati restano sulla vostra
macchina; Replit riceve solo i frammenti pertinenti in risposta a una query.

Il tool `search_manual` (in `lib/horus/src/tools.ts`) è **agnostico rispetto
all'agente**: qualunque agente abbia accesso alla lista di tool lo usa allo
stesso modo. Compare solo quando `NADIR_URL` **e** `NADIR_GATE_TOKEN` sono
entrambi impostati come secret su Replit; altrimenti non viene nemmeno mostrato
al modello.

## 1. Copiare i file su TC

Copia l'intera cartella `deploy/horus-nadir/` su TC (es. `scp -r` o `git clone`
di questo repo e poi entra nella cartella).

## 2. Installare le dipendenze

```bash
cd horus-nadir
npm install
```

Serve inoltre Ollama in esecuzione su TC con il modello di embedding scaricato:

```bash
ollama pull all-minilm
# verifica che ci sia:
ollama list | grep all-minilm
```

## 3. Configurare le variabili d'ambiente

Crea un file `.env` (o esporta le variabili) con:

```bash
PORT=4700
NADIR_GATE_TOKEN=<scegli-una-stringa-lunga-e-casuale>

# Dove prendere i dati da indicizzare: l'api-server di BikerBlog.
# BLOG_EXPORT_URL è l'URL pubblico del deployment (o del tunnel) dell'api-server.
BLOG_EXPORT_URL=https://bikerlink-blog.replit.app
# BLOG_EXPORT_TOKEN è lo STESSO bearer token usato dalle altre rotte /_internal/*.
# Il modo più semplice è impostare il secret INBOX_TOKEN su Replit (ha
# priorità) e incollare qui lo stesso valore. Se INBOX_TOKEN non è impostato,
# il token è derivato da SESSION_SECRET via HMAC e non è ricavabile a mano:
# in quel caso imposta INBOX_TOKEN.
BLOG_EXPORT_TOKEN=<lo-stesso-valore-di-INBOX_TOKEN>

# Opzionali (default già ragionevoli):
NADIR_OLLAMA_URL=http://127.0.0.1:11434   # Ollama locale su TC
NADIR_EMBED_MODEL=all-minilm              # modello di embedding
NADIR_INDEX_FILE=./nadir-index.json       # file dell'indice
NADIR_EMBED_BATCH_SIZE=32                 # testi per richiesta di embedding
```

## 4. Avviare il servizio

Test rapido:

```bash
node server.js
```

Per farlo girare stabilmente (riavvio automatico, sopravvive al reboot), usa
`pm2`, come per gli altri servizi su TC:

```bash
npm install -g pm2
pm2 start server.js --name horus-nadir --node-args="--env-file=.env"
pm2 save
pm2 startup   # segui le istruzioni per l'avvio automatico al boot
```

**Importante**: come `horus-analysis`, `server.js` legge da `process.env` ma non
carica `.env` da solo (nessuna dipendenza `dotenv`). Senza
`--node-args="--env-file=.env"` il servizio parte con `NADIR_GATE_TOKEN` vuoto e
ogni richiesta protetta risponde `401`. Il flag `--env-file` è nativo di Node
≥20.6.

## 5. Esporlo con un hostname raggiungibile da Replit

Serve un modo per raggiungere `http://localhost:4700` da Replit — stesso schema
già usato per Ollama/SearXNG/analisi. Consigliato: aggiungi una route al
Cloudflare Tunnel esistente che punti a `http://localhost:4700`, es.
`nadir.<tuo-dominio>`.

## 6. Comunicare i dati all'agente

Una volta attivo, imposta due secret in Replit (mai in chiaro):

- `NADIR_URL` — l'URL pubblico del servizio (es. `https://nadir.tuodominio.com`)
- `NADIR_GATE_TOKEN` — lo stesso token scelto al punto 3

Da quel momento `search_manual` compare tra i tool di Horus e Bowie.

## 7. Prima indicizzazione

L'indice è vuoto finché non lanci una indicizzazione, che scarica i dati
dall'api-server e calcola gli embedding:

```bash
curl -X POST https://nadir.tuodominio.com/reindex \
  -H "X-Nadir-Gate-Token: <token>"
# { "result": { "indexed": 123, "bySource": { "manual": 4, "conversation": 90, "comment": 29 } } }
```

Rilancia `/reindex` quando aggiorni il manuale o vuoi includere nuove
conversazioni/commenti. L'indice viene salvato su disco (`NADIR_INDEX_FILE`) e
ricaricato automaticamente al riavvio del servizio.

## Aggiornare il "manuale"

Il manuale è il file `inbox/nadir-manual.md` di questo repo: un semplice file di
testo/Markdown. Aggiungi lì note, procedure, convenzioni o qualunque conoscenza
da rendere ricercabile, poi rilancia `/reindex` su Nadir. Ogni paragrafo (blocco
separato da una riga vuota) diventa un frammento indicizzabile a sé.
L'endpoint `GET /api/_internal/nadir-export` dell'api-server legge questo file e
lo passa a Nadir insieme a conversazioni e commenti.

## Verifica

```bash
curl https://nadir.tuodominio.com/health
# {"ok":true,"service":"Nadir","embedModel":"all-minilm","indexed":123,"builtAt":"..."}

curl -X POST https://nadir.tuodominio.com/search \
  -H "Content-Type: application/json" \
  -H "X-Nadir-Gate-Token: <token>" \
  -d '{"query":"come si configura il podcast","limit":5}'
```

## Endpoint disponibili

- `GET /health` — liveness + modello di embedding in uso (`all-minilm`) e numero
  di documenti indicizzati. **Non** richiede il gate token (probe di stato).
- `POST /reindex` — riscarica i dati dall'api-server e ricostruisce l'indice.
  Scrive heartbeat (spazi bianchi, innocui per `JSON.parse`) mentre lavora, per
  non far scadere il tunnel Cloudflare durante indicizzazioni lunghe.
- `POST /search` `{ "query": "...", "limit": 5 }` — ricerca semantica; restituisce
  i frammenti più pertinenti con origine e punteggio di similarità.

Tutti tranne `/health` richiedono l'header `X-Nadir-Gate-Token`.

## Note di sicurezza

- Nadir non ha accesso diretto al database: tutti i dati arrivano dall'endpoint
  di sola lettura `GET /api/_internal/nadir-export`, protetto dallo stesso
  bearer token interno delle altre rotte `/_internal/*`.
- Nadir non scrive mai nulla sull'api-server né sul DB: legge, indicizza in
  locale e risponde a query. L'unico effetto collaterale è il file dell'indice
  su TC.
