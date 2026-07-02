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
pm2 start server.js --name horus-analysis
pm2 save
pm2 startup   # segui le istruzioni stampate per l'avvio automatico al boot
```

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
- `GET /health`

Tutti (tranne `/health`) richiedono l'header `X-Analysis-Gate-Token`.
