# horus-analysis-service (da eseguire su TC)

Dà a Horus la capacità di fare vera analisi statica del codice (typecheck,
lint, ricerca full-text, git log) sui tre repo del progetto, invece della
sola lettura file-per-file di `github_read`. **Non fa parte del monorepo
pnpm**: è un piccolo servizio standalone che va copiato ed eseguito su TC
(ThinkCentre), la stessa macchina dove girano già Ollama e SearXNG.

Perché su TC e non su Replit: i tool di Horus eseguono sempre lato script,
mai sul server del modello — questa è una scelta di sicurezza già presa.
Spostare *anche* l'analisi statica su TC significa che tutto ciò che tocca
codice sorgente esterno (clone, npm install, tsc, eslint) gira sulla vostra
macchina, non nell'ambiente Replit.

## 1. Copiare i file su TC

Copia l'intera cartella `deploy/horus-analysis/` su TC (es. `scp -r` o
`git clone` di questo repo e poi entra nella cartella).

## 2. Installare le dipendenze

```bash
cd horus-analysis
npm install
```

Richiede inoltre, già installati globalmente su TC (probabile che ci siano
già, essendo una macchina di sviluppo):
- `git`
- `node` + `npm` (per repo che usano npm)
- `pnpm` (se bikerblog o altri repo usano pnpm — bikerblog sì)
- `npx` (incluso con npm) per eseguire `tsc`/`eslint` anche se non sono
  script dedicati nel `package.json` del repo target

## 3. Configurare le variabili d'ambiente

Crea un file `.env` (o esporta le variabili nella shell/servizio) con:

```bash
PORT=4600
ANALYSIS_GATE_TOKEN=<scegli-una-stringa-lunga-e-casuale>

# Token GitHub di sola lettura (STESSI valori già usati per github_read,
# copiali dal pannello Secrets di Replit — l'agente non può leggerli e
# trasferirli automaticamente, vanno incollati a mano)
GITHUB_TOKEN_BIKERLINK=...
GITHUB_TOKEN_BIKERBLOG=...
GITHUB_TOKEN_BIKERWEB=...
```

Se un repo non ha un token dedicato, il servizio prova comunque il clone
in modalità pubblica anonima (rate limit più basso, stesso comportamento
di `github_read`).

## 4. Avviare il servizio

Per un test rapido:

```bash
node server.js
```

Per farlo girare stabilmente (riavvio automatico, sopravvive al reboot),
usa `pm2` (stesso approccio consigliato per Ollama/SearXNG):

```bash
npm install -g pm2
pm2 start server.js --name horus-analysis --node-args="--env-file=.env"
pm2 save
pm2 startup   # segui le istruzioni stampate per l'avvio automatico al boot
```

**Importante**: `server.js` legge le variabili da `process.env`, ma non
carica automaticamente il file `.env` (nessuna dipendenza `dotenv`). Un
semplice `pm2 start server.js` (senza `--node-args="--env-file=.env"`)
avvia il servizio ma con `ANALYSIS_GATE_TOKEN` vuoto, e ogni richiesta
(compreso `/health`) risponde `401 unauthorized` in modo silenzioso, senza
un errore esplicito che lo segnali. Il flag `--env-file` è nativo di Node
≥20.6 e carica `.env` automaticamente — verifica la versione con
`node --version` se il servizio risulta "online" in `pm2` ma risponde 401
anche col token corretto.

## 5. Esporlo con un hostname raggiungibile da Replit

Serve un modo per raggiungere `http://localhost:4600` da Replit — stesso
schema già usato per Ollama (`HORUS_OLLAMA_URL`) o SearXNG
(`HORUS_SEARXNG_URL`). Opzioni:

- **Cloudflare Tunnel** (consigliato, stesso strumento già in uso): aggiungi
  una route pubblica del tunnel esistente che punti a
  `http://localhost:4600`, es. `analysis.<tuo-dominio>`.
- Qualsiasi altro modo con cui già esponi Ollama/SearXNG va bene, basta che
  il risultato sia un URL HTTPS raggiungibile da Replit.

## 6. Comunicare i dati all'agente

Una volta attivo, servono due valori in Replit (secrets, mai in chiaro):

- `HORUS_ANALYSIS_URL` — l'URL pubblico del servizio (es.
  `https://analysis.tuodominio.com`)
- `ANALYSIS_GATE_TOKEN` — lo stesso token scelto al punto 3

## Verifica

```bash
curl https://analysis.tuodominio.com/health
# {"ok":true}

curl -X POST https://analysis.tuodominio.com/typecheck \
  -H "Content-Type: application/json" \
  -H "X-Analysis-Gate-Token: <token>" \
  -d '{"repo":"bikerblog"}'
```

La prima chiamata per ogni repo è lenta (clone + `npm/pnpm install`); le
successive sono rapide perché il clone resta sul disco e viene solo
aggiornato con `git fetch` + `reset --hard`.

## Endpoint disponibili

- `POST /typecheck` `{ "repo": "bikerlink"|"bikerblog"|"bikerweb" }`
- `POST /lint` `{ "repo": ... }`
- `POST /search` `{ "repo": ..., "query": "testo o pattern" }` (usa `git grep`)
- `POST /git-log` `{ "repo": ..., "limit": 10 }`
- `POST /architect` `{ "repo": ..., "mode": "plan"|"debug"|"evaluate", "task": "...", "paths": ["src/foo.ts", "src/bar/"] }`
  — vedi sezione dedicata sotto.
- `GET /health`

Tutti (tranne `/health`) richiedono l'header `X-Analysis-Gate-Token`.

## `/architect` — analisi/pianificazione/debug profondo

A differenza di `/typecheck`, `/lint`, `/search`, `/git-log` (segnali grezzi
eseguiti da strumenti esterni), `/architect` fa davvero ragionare un modello
sul contesto fornito e restituisce un report scritto: pianificazione di una
feature/modifica (`mode: "plan"`), ricerca della causa radice di un bug
(`mode: "debug"`), o valutazione di uno stato/implementazione esistente
(`mode: "evaluate"`). È solo analisi: non scrive, non committa, non esegue
codice.

**Importante: usa Ollama in locale su TC, non il tunnel Cloudflare.** La
generazione avviene con una chiamata diretta a `http://localhost:11434`
(stessa macchina), quindi non soffre del limite di ~100s del tunnel usato per
`HORUS_OLLAMA_URL`. La richiesta che Replit fa VERSO `/architect`, invece,
passa comunque dal tunnel: l'endpoint scrive heartbeat (byte di spazio bianco,
innocui per il parsing JSON) mentre attende il risultato, per tenere viva
quella connessione durante generazioni lunghe.

Variabili d'ambiente opzionali (default già ragionevoli per l'uso attuale):

```bash
ARCHITECT_OLLAMA_URL=http://localhost:11434   # endpoint Ollama locale su TC
ARCHITECT_OLLAMA_MODEL=bikerlink:latest       # modello usato per il ragionamento
ARCHITECT_TIMEOUT_MS=480000                   # 8 minuti, timeout della generazione
```

Limiti applicati per contenere costo/tempo di ogni chiamata: al massimo 8
percorsi di file/cartelle per richiesta, 6000 caratteri per file e 30000
caratteri di contesto totale (troncati oltre soglia), 4000 caratteri massimi
per il campo `task`, e un tetto sulla lunghezza del report generato (num_predict
del modello). Se il servizio impiega più di `ARCHITECT_TIMEOUT_MS`, l'endpoint
risponde con un errore esplicito invece di restare appeso.

Esempio:

```bash
curl -X POST https://analysis.tuodominio.com/architect \
  -H "Content-Type: application/json" \
  -H "X-Analysis-Gate-Token: <token>" \
  -d '{
    "repo": "bikerblog",
    "mode": "plan",
    "task": "Aggiungere un filtro per categoria nella pagina podcast",
    "paths": ["artifacts/bikerblog/src/pages", "artifacts/api-server/src/routes/podcast.ts"]
  }'
```
