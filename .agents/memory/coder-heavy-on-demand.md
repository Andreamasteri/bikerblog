---
name: Coder pesante on-demand (gated eviction)
description: Coder heavy che riusa lo slot Ares/devstral, con eviction MAI-interruttiva di una chat in corso, rollback temporizzato, escalation Quebracho e stato condiviso.
---

# Coder pesante on-demand

Il "coder" NON è un nuovo modello sul TC: riusa lo **slot heavy di Ares**
(stesso `ARES_OLLAMA_MODEL`/devstral, stesso lock a ciclo singolo). Coder e Ares
non possono girare insieme — `isCoderRunning()` è un alias di `isAresRunning()`.
**Why:** decisione approvata dall'utente per non aggiungere un 5° modello alla
GPU 8GB già satura (economy lineup residente).

## Invariante centrale: l'eviction è GATED sull'attività di chat

Il coder sfratta la lineup residente per entrare in VRAM, ma **non interrompe
mai una sessione di chat in corso**. Il gate vive nel `preflight` di
`runAresGpuCycle` (gira PRIMA di toccare la GPU → un rifiuto non sfratta nulla):
- chat ATTIVA in questo istante → gated, sempre (anche con trigger admin);
- trigger NON admin (es. escalation Quebracho) → serve anche idle ≥
  `CODER_MIN_IDLE_MS` (default 5min, "bassa affluenza");
- trigger admin → salta solo la soglia idle, non il blocco su chat attiva.

Un rifiuto torna con `gated: true` (endpoint HTTP 409, non 5xx): è comportamento
voluto, "riprova quando la chat è libera", non un errore.

**How to apply:** ogni nuovo handler di chat streaming DEVE registrare
`beginChatActivity()` a inizio turno e chiamarne il release nel `finally`
(idempotente). Se dimentichi il release, il contatore resta appeso e blocca il
coder per sempre. Attualmente registrano: la chat diretta e la conversazione a
più agenti (bowie-conversation).

## Rollback temporizzato del ripristino

Dopo il ciclo, la lineup va SEMPRE ripristinata nel `finally`. Il coder passa
`restoreTimeoutMs` (`CODER_RESTORE_TIMEOUT_MS`, default 60s): se il ripristino
non completa in tempo, `RESTORE_TIMEOUT_SENTINEL` ("__restore_timeout__") finisce
in `restoreFailures` e `restoreTimedOut=true`. L'endpoint logga (`req.log.error`)
e scrive `inbox/coder-alert-state.json`; l'alert emerge poi spontaneamente
all'admin perché iniettato nei system prompt di chat (come vram/supervision).
**Why:** un ripristino appeso lascerebbe la lineup economy assente senza che
nessuno se ne accorga; l'alert non è push, si vede alla prossima chat.

## Orchestrazione e stato condiviso

`POST /_internal/coder/analyze` è il **punto unico** (sia trigger admin sia
escalation Quebracho passano di qui) così gate + alert vivono in un posto solo.
Lo script `scripts/src/coder-escalate.ts` (`coder:escalate`) è il ponte di
Quebracho→coder (HMAC(SESSION_SECRET,"internal-api-token-v1"), pattern
podcast-generate). `GET /_internal/coder/status` espone `running/chatActive/
chatIdleMs/activeChats` (+ residenza reale best-effort via /api/ps) perché il
loop leggero di Quebracho e il coder concordino su "chi gira" invece di dedurlo.
**Why:** `chat-activity` è in-process (un solo api-server) e non è leggibile
dagli script → serve l'endpoint di stato come dipendenza dichiarata.

## Test (gotcha)

`chat-activity.ts` è stato a livello di modulo: in `coder.test.ts` va importato
SENZA cache-bust (lo condivide con l'`ares.js` cache-bustato via specifier
`./chat-activity.js`), così `beginChatActivity()` del test è visto dal gate;
azzerare con `__resetChatActivityForTests()` tra i test. Per simulare un warmup
KO bisogna far fallire SIA `/api/generate` SIA `/api/embeddings` (warmupModel ha
un fallback su embeddings). Env letti a module-scope (`CODER_RESTORE_TIMEOUT_MS`,
`CODER_MIN_IDLE_MS`) vanno impostati PRIMA dell'import cache-bustato.
