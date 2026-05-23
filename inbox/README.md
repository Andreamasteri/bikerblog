# Inbox

Drop external context here. Files named `*-chat-latest.md` are read by the agent on request.

---

## File presenti

| File / Cartella | Contenuto |
|---|---|
| `bikerlink-chat-latest.md` | Ultimo transcript di chat da BikerLink |
| `bikerlink-history/tasks-meta.json` | 299 task esportati da BikerLink (12 mar – 23 mag 2026) |
| `bikerlink-history/tasks.md` | Stessa storia in formato markdown leggibile |
| `bikerlink-archived-tasks.json` | Output di `fetch:archived-tasks` (creato al primo import) |
| `clusters-merged-by-day.md` | Cluster giornalieri di task MERGED (creato da `cluster:tasks`) |

---

## Procedura: importare lo storico di BikerLink come post del blog

### Passo 1 — Ottenere i task archiviati

**Opzione A — da BikerLink API** (quando BikerLink espone l'endpoint):

```bash
ARCHIVED_TASKS_URL=https://<bikerlink-domain>/api/admin/archived-tasks \
ARCHIVED_TASKS_TOKEN=<token> \
pnpm --filter @workspace/scripts run fetch:archived-tasks
```

L'endpoint atteso è `GET /api/admin/archived-tasks?page=<n>&pageSize=<n>`,
protetto da `Authorization: Bearer <token>`, che ritorna:
```json
{ "tasks": [...], "total": 2200, "page": 1, "pageSize": 100 }
```

**Opzione B — da file locale** (dati già presenti in `inbox/bikerlink-history/`):

```bash
pnpm --filter @workspace/scripts run fetch:archived-tasks -- --local
```

Entrambe le opzioni salvano il risultato in `inbox/bikerlink-archived-tasks.json`.

---

### Passo 2 — Generare i cluster candidati a post

```bash
# Raggruppa per giornata, tutti gli stati
pnpm --filter @workspace/scripts run cluster:tasks

# Solo task MERGED, per giornata (quelli che hanno prodotto codice reale)
pnpm --filter @workspace/scripts run cluster:tasks -- --state MERGED --by day

# Per settimana
pnpm --filter @workspace/scripts run cluster:tasks -- --state MERGED --by week
```

Il file di output (es. `inbox/clusters-merged-by-day.md`) mostra un titolo
per ogni giornata, l'elenco dei task e un blocco `<details>` con il testo
completo. Ogni sezione è un candidato naturale per un post del blog.

---

### Passo 3 — Revisione editoriale (umano + agente)

1. Apri `inbox/clusters-merged-by-day.md` e scorri i cluster.
2. Identifica le giornate più significative (feature rilasciata, svolta tecnica,
   sessione di debug intensa…).
3. Chiedi all'agente di scrivere un post partendo dal cluster:

   > "Scrivi un post per il blog BikerBlog basato sui task del 15 aprile 2026
   >  (cluster in inbox/clusters-merged-by-day.md). Tono: diario tecnico
   >  informale, prima persona plurale, massimo 600 parole."

4. Il post viene creato via API con `POST /api/posts` (o tramite lo script
   `seed:blog`) e appare sul blog con data retroattiva.

---

### Aggiornare i dati da BikerLink in futuro

```bash
# Rifetch completo (sovrascrive bikerlink-archived-tasks.json)
pnpm --filter @workspace/scripts run fetch:archived-tasks -- \
  --url https://<bikerlink-domain>/api/admin/archived-tasks \
  --token <token>

# Poi ri-genera i cluster
pnpm --filter @workspace/scripts run cluster:tasks -- --state MERGED --by day
```

---

## Script di riferimento

| Script npm | File sorgente | Cosa fa |
|---|---|---|
| `inbox:fetch` | `scripts/src/inbox-fetch.ts` | Scarica il transcript chat da BikerLink |
| `fetch:archived-tasks` | `scripts/src/fetch-archived-tasks.ts` | Scarica i task archiviati da BikerLink (o li importa da file locale) |
| `cluster:tasks` | `scripts/src/cluster-tasks.ts` | Raggruppa i task per giornata/settimana e genera markdown editoriale |
| `seed:blog` | `scripts/src/seed-blog.ts` | Carica autori/post/commenti reali nel DB (idempotente) |
