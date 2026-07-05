# Contratto di parità — motore chat "AI Hub" (Task #193, Fase 2b)

> **Scopo.** Prima di spostare l'orchestrazione della chat dal server Replit
> (`artifacts/api-server/src/routes/horus.ts` + `lib/horus/src/client.ts`) al
> servizio su TC ("AI Hub"), questo documento elenca **tutti** i comportamenti
> oggi impliciti nel percorso Replit come una checklist di accettazione
> testabile. Il nuovo motore su TC è considerato "in parità" solo quando
> riproduce ognuno di questi punti, e i test di regressione SSE esistenti
> (`horus.sse.test.ts`, 5 test) continuano a passare contro il proxy Replit.
>
> Questo è lo **Step 0** del task: va completato e verificato PRIMA di toccare
> l'infrastruttura (Step 1+). Nessun comportamento sotto va "ricordato a
> memoria" durante la reimplementazione: si spunta questa lista.

## Fonte di verità attuale (da replicare)

- Orchestrazione per-agente: `createDirectChatHandler` + `runChatTurn` in
  `artifacts/api-server/src/routes/horus.ts`.
- Conversazione osservata a N agenti: `createBowieConversationHandler`.
- Client Ollama + streaming + timeout gateway: `lib/horus/src/client.ts`.
- Registry tool + selezione contestuale + esecuzione: `lib/horus/src/tools.ts`.
- Test di regressione: `artifacts/api-server/src/routes/horus.sse.test.ts`.

---

## A. Ciclo tool-loop (chat diretta a un agente)

- [ ] **A1 — Loop chiama-modello → tool_calls → esegui tool → richiama** fino a
  un massimo di iterazioni (`MAX_TOOL_ITERATIONS`). Alla fine restituisce
  `{ finalReply, usedTools, missingTool }`.
- [ ] **A2 — Selezione contestuale dei tool (Task #178).** Al primo turno si
  allega SOLO il sottoinsieme di tool pertinente al messaggio
  (`getHorusTools(message)`), o **nessun** tool per un messaggio puramente
  conversazionale. Motivo: tenere il prefill su CPU sotto il tetto ~100s del
  tunnel ("Ciao" non deve scadere).
- [ ] **A3 — Sentinel `[TOOL_MANCANTE: nome]` + 1 retry (Task #179).** Se il
  modello dichiara di aver bisogno di un tool che la selezione contestuale non
  aveva allegato, il turno viene rieseguito **una sola volta** con l'intero set
  disponibile (gating per capacità applicato da `getHorusTools()`), ripartendo
  da una conversazione pulita. Né il tag né il primo tentativo sono visibili
  all'utente: solo la risposta finale.
- [ ] **A4 — Cap sui risultati dei tool.** Ogni risultato-tool è troncato
  (`capToolResult` / `MAX_TOOL_RESULT_CHARS`) e il totale accumulato è limitato
  (`MAX_TOTAL_TOOL_RESULT_CHARS`, ~6000) prima del reinserimento nel prompt.
- [ ] **A5 — Fallback su tool-call testuale (modelli deboli).** Modelli piccoli
  (Bowie/llama3.2:3b, Quebracho) a volte emettono una tool-call come JSON nel
  testo invece che nel campo nativo `tool_calls`: va rilevata ed eseguita, non
  mostrata come JSON grezzo.
- [ ] **A6 — `usedTools` governa la lunghezza risposta.** Il cap sulla
  lunghezza della risposta (`truncateReply`) si allenta solo se in questo turno
  è stato davvero usato un tool.

## B. Fallback timeout gateway (524/502/503/504)

- [ ] **B1 — Rilevamento.** `isGatewayTimeoutError` riconosce sia HTTP
  502/503/504/524 (`OllamaGatewayTimeoutError`) sia la connessione chiusa a
  metà stream (`TypeError` con "terminated"/"other side closed"/"fetch failed").
- [ ] **B2 — Health-check prima del fallback.** Su gateway-timeout con tool si
  fa prima un ping veloce (`checkHealth`, ~6s su `/api/version`). Se l'agente
  non è raggiungibile → si salta il fallback e si lancia `overloadedMessage`.
- [ ] **B3 — Fallback senza tool, prompt minimo, timeout corto.** Se
  raggiungibile, si riprova **una volta** senza tool, con prompt MINIMO (niente
  cronologia, niente descrizione tool, solo nota corta + messaggio utente) e un
  `FALLBACK_TIMEOUT_MS` più corto del tetto tunnel. Se anche questo scade →
  `overloadedMessage`.
- [ ] **B4 — Messaggio d'errore già in italiano.** Le pagine HTML di errore del
  gateway sono riscritte in un messaggio IT comprensibile (`buildRequestFailedMessage`),
  mai incollate grezze in chat.
- [ ] **B5 — Abort del client durante il fallback** si propaga senza scrivere
  sullo stream.

## C. Cache best-effort della risposta (Task #185)

- [ ] **C1 — Chiave.** `sha256(agentName + message + JSON(history))`.
- [ ] **C2 — Hit serve subito `done` dalla cache** senza rigenerare (retry a un
  click dopo un drop di rete mobile → nessun altro ~80s).
- [ ] **C3 — Store PRIMA del check di abort.** La risposta completa è messa in
  cache anche se nel frattempo il client è sparito (è proprio lì che serve).
- [ ] **C4 — TTL + cap LRU-ish.** `REPLY_CACHE_TTL_MS` (10 min),
  `REPLY_CACHE_MAX_ENTRIES` (50), sfratto delle più vecchie.
- [ ] **C5 — In-RAM per-istanza.** Su autoscale non condivisa tra istanze: al
  massimo si rigenera. Il nuovo motore su TC (istanza singola) la rende di
  fatto più affidabile — comportamento accettabile, non un requisito nuovo.

## D. Streaming SSE ed eventi tipizzati

- [ ] **D1 — Header.** `Content-Type: text/event-stream`,
  `Cache-Control: no-cache, no-transform`, `Connection: keep-alive`,
  `flushHeaders()`.
- [ ] **D2 — Heartbeat 15s.** `setInterval(writeHeartbeatPing, 15000)`,
  sempre ripulito nel `finally`.
- [ ] **D3 — Eventi chat diretta:** `token {token}`,
  `tool_call {name,args}`, `tool_progress {...}`, `tool_result {...}`,
  `done {content}`, `error {message, recoverable}`.
- [ ] **D4 — `recoverable` corretto.** `true` per errori transitori (timeout,
  overload) → il client mostra "Riprova"; `false` per risposta vuota → nessun
  "Riprova" (invita a riformulare).
- [ ] **D5 — Eventi conversazione osservata:** `turn_start {agent,turnNumber,
  totalTurns,estimatedSecondsPerTurn}`, `token {agent,token}`,
  `turn_end {agent,content}`, `done {}`, `error {agent,message,transcript,
  conversationId}`.

## E. Semantica di abort

- [ ] **E1 — Si ascolta `res.on("close")`, NON `req.on("close")`.** `req`
  (IncomingMessage) emette "close" subito dopo che `express.json()` ha
  consumato il body — abortirebbe ogni chat prima del primo token. Coperto dal
  test di regressione SSE.
- [ ] **E2 — `AbortController` propagato** a `chatRaw` (`options.signal`) e al
  loop tool; su abort non si scrive più sullo stream.
- [ ] **E3 — Abort ↔ Stop client** (chiusura stream lato UI) equivalente alla
  chiusura tab.

## F. Client Ollama (client.ts)

- [ ] **F1 — `stream: true` obbligatorio** (il tunnel chiude a ~100s di
  silenzio → 524). I `tool_calls` arrivano regolarmente anche in streaming.
- [ ] **F2 — `keep_alive: -1` come NUMERO** (non stringa "-1", che Ollama 400a).
  Override per-chiamata via `keepAlive`.
- [ ] **F3 — `num_predict` = maxTokens** (default 4096).
- [ ] **F4 — Header CF Access** (`CF-Access-Client-Id/Secret`) su ogni chiamata
  quando configurati.
- [ ] **F5 — Memoria persistente Horus** allegata come system message se
  `useHorusMemoryByDefault` e non `skipMemory` (Horus in conversazione osservata
  usa `skipMemory:true`).
- [ ] **F6 — Health check economico** su `/api/version` (non `/api/chat`), 6s.

## G. Monitor VRAM (Task #194) — comportamenti server-side da preservare

- [ ] **G1 — Tool `check_vram_usage`** in parità come ogni altro tool (per
  Horus, Bowie E Quebracho).
- [ ] **G2 — Iniezione avviso congestione VRAM nel system prompt.** Oggi: TC
  (sampler) → `POST /_internal/vram-alert` su Replit → stato letto e agganciato
  al system prompt di ogni agente, **bypassando anche `skipMemory` di Horus**.
  Se l'orchestrazione si sposta su TC senza portare questo meccanismo, l'avviso
  VRAM smette di arrivare in chat dopo il cutover → va migrato esplicitamente.
- [ ] **G3 — Isteresi + POST solo su transizione** (già nel sampler su TC,
  invariato): non ribombardare l'endpoint.

## H. Eviction VRAM — NON è un comportamento da preservare

- [x] **H1 — `evictOthersBeforeRun` (solo Horus) NON va portato sul nuovo
  motore.** Era un workaround per la dimensione di `bikerlink:latest` (~7GB su
  GPU 8GB), non una specifica. **Risolto (2026-07-05, Fase 2c):** rimosso da
  `lib/horus/src/client.ts` insieme a `evictOtherResidentModels`.
- [x] **H2 — RISOLTO (2026-07-05, decisione utente).** Nuovo lineup: Horus
  (`qwen3:4b`) + Bowie (`qwen3:1.7b`) + Nadir (`all-minilm`) restano
  co-residenti "Forever" in VRAM (~6.1GB/8.19GB, confermato via smoke-test).
  Quebracho (`granite4:tiny-h`) gira su **CPU+RAM** invece che GPU
  (`OllamaAgentConfig.forceCpu`, `options.num_gpu:0` per-richiesta — nessun
  ripull necessario per rimetterlo su GPU in futuro). Con questo schema
  nessun agente compete per VRAM con un altro, quindi nessun meccanismo di
  eviction reciproca serve più. Dettagli:
  `.agents/memory/vram-4way-coexistence-limit.md`.

---

## Decisione sulla CLI (`horus:chat`)

**Decisione: la CLI resta FUORI dallo scope della migrazione del motore, in
modo esplicito e documentato.**

- Oggi `scripts/src/horus-chat.ts` implementa il proprio tool-loop locale
  (`MAX_TOOL_ITERATIONS = 5`) più un classificatore di memoria
  (`maybeAutoRemember`), chiamando direttamente `@workspace/horus`.
- **Perché fuori scope ora:** è uno strumento da terminale per l'admin (uso da
  macchina di sviluppo, non traffico di produzione). Migrarla al motore su TC
  significherebbe trasformarla da consumatrice diretta della libreria a client
  HTTP del nuovo endpoint — cambio di natura che aggiunge scope e rischio senza
  beneficio per gli utenti finali del blog.
- **Debito accettato:** finché la CLI resta fuori, esistono temporaneamente
  due logiche di tool-loop (CLI + AI Hub). È accettabile perché la CLI è
  a basso rischio e a basso traffico. **Da riconciliare** una volta che il
  motore AI Hub è il single-source stabile: a quel punto la CLI diventerà un
  thin client dell'endpoint `/chat` dell'AI Hub e il tool-loop locale sarà
  rimosso.
- Coerente con la policy anti-feature-creep del progetto: non si migra la CLI
  "per completezza" mentre non è necessario.

---

## Come si verifica la parità (accettazione)

1. I 5 test in `horus.sse.test.ts` passano (abort su `res.close`, non
   `req.close`; token prima dell'abort; ecc.) — continuano a girare contro il
   proxy Replit, che nel doppio-percorso resta il fallback.
2. Per ogni voce A–G sopra: un controllo manuale o automatico end-to-end sul
   nuovo endpoint AI Hub (chat reale con Horus, Bowie, Quebracho) che osserva
   gli stessi eventi SSE, lo stesso comportamento di fallback e le stesse
   risposte in cache.
3. H1/H2 sono esplicitamente NON verificati come "parità": H2 è deferito.
