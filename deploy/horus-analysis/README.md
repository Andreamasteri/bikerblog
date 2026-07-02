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
- `POST /architect` `{ "repo": ..., "mode": "plan"|"debug"|"evaluate", "task": "...", "paths": ["src/foo.ts", "src/bar/"], "extraContext": "..." }`
  — vedi sezione dedicata sotto. `extraContext` (opzionale) è pensato per
  passare all'architetto l'output già ottenuto da un altro tool (tipicamente
  `sonar_scan`) senza rieseguire quell'analisi.
- `POST /sonar` `{ "repo": ... }` — vedi sezione dedicata sotto.
- `GET /capabilities` — risponde `{ "sonarAvailable": true|false }`, usato da `lib/horus/src/tools.ts` per decidere se esporre `sonar_scan` al modello senza dover leggere le env var di TC (invisibili a Replit).
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

### Risoluzione problemi: `/architect` fallisce

`/architect` dipende da un'installazione di Ollama **in locale su TC**
(`ARCHITECT_OLLAMA_URL`, default `http://localhost:11434`), separata dal
tunnel Cloudflare usato per `HORUS_OLLAMA_URL` (quello per la chat). Se questa
istanza locale non è installata, non è in esecuzione, o il modello indicato
non è stato scaricato, la risposta di errore (propagata fino alla chat di
Horus) distingue ora esplicitamente il tipo di problema invece di mostrare un
generico errore di rete:

- **"Ollama locale non raggiungibile su ..."** (`kind: "unreachable"`, HTTP
  502) — Ollama non è in esecuzione su TC, o `ARCHITECT_OLLAMA_URL` punta alla
  porta sbagliata. Verifica con `curl http://localhost:11434/api/tags` su TC
  stessa, oppure avvia Ollama (`ollama serve` o il servizio/pm2 corrispondente).
- **"Modello ... non trovato su Ollama locale"** (`kind: "model_not_found"`,
  HTTP 502) — `ARCHITECT_OLLAMA_MODEL` non corrisponde a un modello
  effettivamente scaricato su TC. Controlla con `ollama list` e, se manca,
  scaricalo con `ollama pull <modello>`, oppure allinea la variabile
  d'ambiente a un modello già presente.
- **"architetto: timeout dopo ...s"** (`kind: "timeout"`, HTTP 504) — Ollama è
  raggiungibile ma la generazione non ha finito entro `ARCHITECT_TIMEOUT_MS`
  (default 8 minuti). Tipico su hardware CPU con modelli grandi o richieste
  con molto contesto (`paths` numerosi/grandi); riprova con un `task`/`paths`
  più mirati o aumenta `ARCHITECT_TIMEOUT_MS`.
- **"Ollama locale ha risposto ..."** (`kind: "http_error"`, HTTP 502) — Ollama
  locale ha risposto ma con un errore diverso dai due casi sopra (es.
  richiesta malformata o servizio in stato inatteso); il corpo della risposta
  originale è incluso nel messaggio per il debug.

Ogni risposta di errore di `/architect` include sia `error` (messaggio
leggibile) sia `kind` (uno dei valori sopra), così script e log possono
distinguere i casi senza fare pattern-matching sul testo.

## `/sonar` — analisi SonarQube (code smell, duplicazioni, sicurezza, debito tecnico)

A differenza di `/typecheck` e `/lint` (errori di tipo e regole di stile),
`/sonar` lancia una vera scansione [SonarQube](https://www.sonarsource.com/products/sonarqube/)
sul clone locale del repo richiesto e restituisce problemi che tsc/eslint non
vedono: code smell, duplicazioni di codice, vulnerabilità, security hotspot e
stima del debito tecnico.

**SonarQube gira su TC, non su Replit** (Docker), come Ollama/SearXNG. Questo
servizio (`horus-analysis`) si limita a lanciare lo scanner CLI contro il
clone del repo e a leggere i risultati dalla Web API locale di SonarQube.

### Versione consigliata

**SonarQube Server 2026.1 LTA** (ultima Long Term Active al momento della
stesura di questa guida — verifica se è uscita una patch più recente della
stessa linea 2026.1.x prima di installare), immagine Docker Community Edition
(gratuita): `sonarqube:2026-lta-community`.

Requisiti:
- JDK completo (non solo JRE) — l'immagine Docker ufficiale lo include già.
- Java 21 o 25 supportati dalla 2026.1 LTA.
- Almeno 2 GB di RAM liberi dedicati al container (SonarQube è pesante su
  hardware CPU condiviso con Ollama; valuta di non far girare scansioni e
  generazioni Ollama pesanti in contemporanea se TC ha risorse limitate).
- `sonar-scanner` (SonarScanner CLI) installato **sulla stessa macchina/rete
  raggiungibile da dove gira `horus-analysis`** e presente nel `PATH` del
  processo che avvia `server.js` (es. via pm2). Scaricabile da
  [docs.sonarsource.com](https://docs.sonarsource.com/sonarqube-server/analyzing-source-code/scanners/sonarscanner/).

### Avvio del server SonarQube (Docker)

```bash
docker run -d --name sonarqube \
  -p 9000:9000 \
  -v sonarqube_data:/opt/sonarqube/data \
  -v sonarqube_extensions:/opt/sonarqube/extensions \
  -v sonarqube_logs:/opt/sonarqube/logs \
  sonarqube:2026-lta-community
```

La prima volta impiega qualche minuto ad avviarsi. Verifica con
`curl http://localhost:9000/api/system/status` (deve rispondere
`{"status":"UP"}`).

### Generare il token di analisi

1. Apri `http://localhost:9000` (o l'hostname/porta che hai esposto), login
   iniziale `admin`/`admin` (richiede cambio password al primo accesso).
2. Vai su **My Account → Security → Generate Tokens**, tipo "Global Analysis
   Token" (o un token di progetto se preferisci limitarlo per repo).
3. Copia il token: ti servirà solo come variabile d'ambiente del servizio
   `horus-analysis`, non va mai messo nel codice.

### Variabili d'ambiente aggiuntive per `horus-analysis`

Da aggiungere allo stesso `.env` del punto 3 sopra:

```bash
SONARQUBE_URL=http://localhost:9000   # default se non impostata
SONARQUBE_TOKEN=<il-token-generato-sopra>
```

Se `SONARQUBE_TOKEN` non è impostato, `sonar_scan` **non compare nemmeno
nella lista dei tool** che Horus/Bowie vedono: `lib/horus/src/tools.ts`
interroga `GET /capabilities` (cache 60s, timeout 3s) e toglie il tool se
`sonarAvailable` è `false` o il servizio non risponde in tempo. Se qualcuno
invoca comunque `/sonar` durante una finestra di configurazione parziale
(cache scaduta, richiesta diretta, ecc.), l'endpoint risponde con un
messaggio chiaro ("SonarQube non configurato") invece di un errore generico.

Timeout opzionali (default già ragionevoli):

```bash
SONAR_SCANNER_TIMEOUT_MS=900000   # 15 minuti, esecuzione dello scanner CLI
SONAR_TASK_TIMEOUT_MS=600000      # 10 minuti, attesa del completamento lato server (Compute Engine task)
```

### Come funziona `/sonar`

L'analisi SonarQube è **asincrona**: `sonar-scanner` carica i risultati grezzi
e il server li elabora in background (un "Compute Engine task"). L'endpoint:

1. Lancia `sonar-scanner` contro il clone persistente del repo richiesto
   (`-Dsonar.projectKey=horus-<repo>`, `-Dsonar.host.url`, `-Dsonar.token`).
2. Estrae l'URL del Compute Engine task dall'output dello scanner e fa
   polling di `GET /api/ce/task?id=...` finché non risulta `SUCCESS` (o
   fallisce con un errore esplicito su `FAILED`/timeout).
3. Una volta completata, interroga in parallelo `GET /api/issues/search`,
   `GET /api/hotspots/search` e `GET /api/measures/component`
   (`duplicated_lines_density`, `duplicated_blocks`, `sqale_index`,
   `sqale_debt_ratio`, `sqale_rating`) per il progetto e restituisce un
   riassunto testuale (conteggio per tipo/severità, duplicazioni e debito
   tecnico, i problemi/hotspot principali), simile a come `/typecheck` e
   `/lint` formattano oggi i loro risultati.

Come `/architect`, la richiesta HTTP verso questo endpoint passa dal tunnel
Cloudflare: l'handler scrive heartbeat (spazi bianchi) mentre attende scanner
e task, per non far scadere la connessione durante un'analisi lunga.

Esempio:

```bash
curl -X POST https://analysis.tuodominio.com/sonar \
  -H "Content-Type: application/json" \
  -H "X-Analysis-Gate-Token: <token>" \
  -d '{"repo": "bikerblog"}'
```

### Collaborazione con `/architect`

`sonar_scan` e `architect` sono pensati per essere incatenati da Horus/Bowie:
prima si lancia `sonar_scan` su un repo, poi — se l'utente chiede un piano di
fix — gli esiti rilevanti vengono passati ad `architect` nel campo
`extraContext` invece di rieseguire l'analisi da zero. Questo è responsabilità
del modello/prompt lato `lib/horus/src/tools.ts`, non di questo servizio:
`/sonar` e `/architect` restano endpoint indipendenti, `extraContext` è solo
un campo di testo libero che l'endpoint `/architect` inserisce nel prompt del
modello.
