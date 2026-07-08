<!--
  Questo file è in parte gestito automaticamente.
  La sezione tra i marcatori AUTO-CHANGELOG:START e AUTO-CHANGELOG:END viene
  rigenerata dallo script `pnpm --filter @workspace/scripts run changelog:sync`
  (eseguito ogni notte dalla pipeline `cluster:daily`).
  NON modificare a mano il contenuto tra quei marcatori: verrà sovrascritto.
  Tutto ciò che sta PRIMA del marcatore START (intro + backfill iniziale) è
  scritto a mano e non viene mai toccato dallo script.
-->

# Changelog di sincronizzazione con BikerLink

Questo file serve a **BikerLink** (il progetto "gemello", il cui agente è
temporaneamente fuori uso) per sapere, in linguaggio semplice, tutto ciò che è
cambiato qui su **BikerBlog** dal 2 luglio 2026 in poi. Così su BikerLink si
possono adeguare codice e task senza dover ricostruire a mano la cronologia.

**Come funziona questo file:**

- La sezione **"Backfill iniziale"** qui sotto è scritta a mano e copre le
  prime ~36 ore di lavoro (dal 2 luglio ~12:30 al 3 luglio ~13:00).
- La sezione **"Aggiornamenti automatici"** più in basso si aggiorna da sola:
  ogni notte, quando gira la pipeline, lo script aggiunge una riga per ogni
  nuova modifica (commit) e per ogni task completato. Non serve chiedere
  all'agente di ricostruirla.

Legenda: ogni voce è una singola modifica. Le voci che iniziano con "Task #"
corrispondono a un task portato a termine.

---

## Backfill iniziale (2–3 luglio 2026)

### 2 luglio 2026 — dalle 12:30 alle 17:35 · Arriva Horus (la nuova "voce" del blog)

- **Il blog smette di usare l'AI di Anthropic (Claude) e passa a "Horus".**
  Horus è un modello AI che gira sul server personale dell'utente (chiamato
  "TC"), raggiunto tramite un tunnel sicuro. Tutta la scrittura automatica del
  blog — diario giornaliero, traduzioni in inglese, riassunti — ora passa da
  Horus invece che da un servizio esterno a pagamento.
- **Prima chat con Horus da riga di comando.** È possibile "parlare" con Horus
  da terminale per fare domande e prove.
- **Horus impara a usare degli strumenti.** Può cercare sul web (tramite un
  motore di ricerca privato), leggere il codice su GitHub (in sola lettura, su
  più repository) e ricordare note tra una sessione e l'altra.
- **Primo strumento "architetto".** Uno strumento con cui Horus può fare analisi
  e ragionamenti più approfonditi su codice e problemi.

### 2 luglio 2026 — dalle 17:35 alle 20:36 · Horus incontra Bowie e impara a leggere il blog

- **Horus scopre e dialoga con "Bowie" per la prima volta.** Bowie è un secondo
  agente AI che vive sullo stesso server. I due possono conversare tra loro.
- **Chat web per Horus.** Al posto della sola riga di comando ora c'è una pagina
  web (protetta da password) dove chattare con Horus, con le risposte che
  compaiono man mano che vengono scritte.
- **Chat diretta con Bowie**, con le stesse funzionalità della chat con Horus.
- **Le conversazioni Horus↔Bowie vengono salvate** e c'è una pagina per
  rileggerle, con una ricerca per argomento.
- **Horus può leggere i contenuti pubblicati del blog** (post, podcast e
  commenti) tramite un nuovo strumento, così le sue risposte tengono conto di
  cosa c'è davvero online.
- **Barra di avanzamento per le analisi lunghe** dell'architetto, così non
  sembra "bloccato" mentre lavora; ed è possibile annullarle a metà.
- **Avviso se lo strumento di analisi non è configurato bene** sul server.
- **Audit automatico dei nuovi post**: appena un post viene pubblicato, viene
  controllato automaticamente.
- **Notifiche quando la pipeline notturna fallisce** o non pubblica nulla, con
  una cronologia delle esecuzioni per vedere l'andamento nel tempo.
- **Filtro privacy sulle traduzioni** in inglese, per non far trapelare
  informazioni riservate.
- **Analisi del codice con SonarQube** integrata negli strumenti di Horus.
- **Corrette 38 vulnerabilità nelle dipendenze** del progetto.
- **Reso più robusto il limite anti-abuso** sui "mi piace" di post e commenti.

### 2 luglio 2026 (dalle 20:36) → 3 luglio 2026 (fino alle 09:35) · Controlli di rete e affidabilità

- **Stato della connessione visibile** nella conversazione osservabile
  Horus↔Bowie, così si capisce subito se sono raggiungibili.
- **Controllo di rete reale ("smoke check")** che verifica davvero, dal vivo,
  che le chat di Horus e Bowie rispondano — non solo in teoria.
- **Alert automatico se la connettività Horus/Bowie diventa silenziosa**, così
  un tunnel o un modello spento viene segnalato senza doverlo scoprire a mano.
- **Riorganizzazione del file `replit.md`** (la guida interna del progetto) per
  renderlo più leggibile.

### 3 luglio 2026 — dalle 09:35 alle 13:00 · Messaggi d'errore più chiari e conversazioni più solide

- **Messaggi di errore più comprensibili nella chat**: per esempio, quando il
  server impiega troppo a rispondere (timeout del gateway) ora compare una
  spiegazione in italiano invece di codice tecnico.
- **Avviso preventivo se Horus è irraggiungibile** prima ancora di avviare una
  conversazione Horus↔Bowie, così non si parte "a vuoto".
- **Gestione dei "cali di linea" a metà conversazione**: se uno dei due agenti
  si interrompe, il sistema capisce di chi era il turno e riprende da lì.
- **Le conversazioni Horus↔Bowie interrotte non vanno più perse** se si
  ricarica la pagina: vengono salvate e recuperate.
- **Test di non-regressione dedicati** per assicurarsi che questi recuperi
  continuino a funzionare anche in futuro.

### 3 luglio 2026 · Arriva "Nadir", la memoria ricercabile di Horus e Bowie

- **Nuovo servizio "Nadir" per la ricerca semantica.** Nadir è un piccolo
  programma che gira sul server personale dell'utente ("TC"), come gli altri
  strumenti di Horus. Serve a cercare informazioni "per significato" e non per
  parole esatte: gli si fa una domanda a parole e restituisce i pezzi di testo
  più pertinenti. Costruisce il suo indice su tre fonti — un "manuale" testuale
  scritto a mano, le conversazioni recenti che coinvolgono Bowie e i commenti
  pubblici dei lettori. Usa il modello `all-minilm` (via Ollama) per capire i
  significati e un semplice file per l'indice, senza database aggiuntivi.
- **Nuovo strumento `search_manual` per Horus e Bowie.** Entrambi gli agenti
  possono ora interrogare Nadir allo stesso modo. Lo strumento è pensato per
  essere "neutro": un eventuale terzo agente in futuro lo userebbe senza
  modifiche. Compare solo quando Nadir è configurato, altrimenti resta nascosto.
- **Nuovo canale di sola lettura** sul blog per fornire a Nadir i dati da
  indicizzare (manuale, conversazioni, commenti), protetto dallo stesso token
  interno già usato dalle altre automazioni.

### 3 luglio 2026 · La conversazione tra IA ora può ospitare più di due voci

- **La conversazione osservabile Horus↔Bowie è stata resa "generica".** Prima
  il codice sapeva parlare solo di due agenti fissi (Horus e Bowie) e l'ordine
  dei turni era scritto attorno a quel numero preciso. Ora c'è un semplice
  elenco di partecipanti: per aggiungere in futuro un terzo interlocutore (per
  esempio "Quebracho", che vivrà lato BikerLink) basterà aggiungere una riga a
  quell'elenco, senza riscrivere la logica dei turni. È solo una
  ristrutturazione interna: per Horus e Bowie tutto continua a funzionare
  esattamente come prima (chi apre la discussione, come si alternano, come si
  riprende dopo un'interruzione). Sono stati aggiunti anche test che simulano
  una conversazione a tre voci per garantire che questa apertura funzioni
  davvero.

---

## Aggiornamenti automatici

_Da qui in giù il contenuto è generato automaticamente ogni notte. Ogni voce
corrisponde a una modifica registrata dopo il backfill iniziale._

<!-- AUTO-CHANGELOG:START -->
### 8 luglio 2026

**Task completati:**

- **Task #215** — Sblocca sonar_scan — aggiungi /capabilities al servizio di analisi <!-- 6c4c867 -->
- **Task #153** — Detect degraded-but-reachable Nadir (empty/garbage results) <!-- 2b1ba58 -->

**Altre modifiche:**

- **03:52** · Update the blog’s promotional image for better user engagement <!-- 46608a3 -->
- **03:51** · Update documentation for completed tasks and troubleshooting efforts <!-- 228150e -->
- **03:51** · Update documentation to reflect current troubleshooting efforts <!-- 10fa0d9 -->
- **03:51** · Update documentation to reflect current troubleshooting efforts <!-- 6e216b3 -->
- **03:50** · Feat: catch Nadir index stuck out of date (stale-index check in step 7.5) <!-- 54ff9b7 -->
- **03:41** · Update documentation to reflect current troubleshooting and debugging efforts <!-- 89948ea -->
- **03:17** · Update documentation for troubleshooting and debugging Update bikerlink-sync-changelog.md to reflect current troubleshooting status and GPU debugging efforts. <!-- 2594498 -->

### 7 luglio 2026

**Task completati:**

- **Task #223** — (Fase 2e POWER): fix stale horus tool-gating test + docs reconcile <!-- 98a4cf9 -->
  - _In parole semplici:_ Okay, I need to translate this changelog entry into a simple Italian sentence that's easy for non-programmers to understand. Let me first read the original text carefully.
- **Task #217** — Feat: expose architect mode selector in Horus web chat panel <!-- 708f424 -->
  - _In parole semplici:_ Okay, the user wants me to rewrite a tech changelog entry into a short, simple Italian sentence that's easy for non-programmers to understand. Let me first understand the original text.
- **Task #211** — Ares: add task-review mode <!-- a5fe07c -->
  - _In parole semplici:_ Okay, let me try to figure out how to approach this. The user wants me to rewrite a technical changelog entry into a short, simple Italian sentence that's easy for non-programmers to understand. They specified no technical jargon without explanation, no extra details, and just the sentence without quotes or prefixes.
- **Task #210** — Attiva tool analisi codice Horus <!-- 1026812 -->
  - _In parole semplici:_ Okay, I need to rewrite this technical changelog entry into a short, simple Italian sentence that's understandable for non-programmers. The original text is "Attiva tool analisi codice Horus".
- **Task #209** — Routing multi-proposta obbligatoria e output strutturato <!-- c90d91c -->
  - _In parole semplici:_ Okay, I need to rewrite this technical changelog entry into a short, simple Italian sentence that's easy for non-programmers to understand. The original text is "Routing multi-proposta obbligatoria e output strutturato". Let me break it down.
- **Task #208** — Add GRAPHHOPPER_URL env var and run regional coverage probe <!-- c547e9a -->
  - _In parole semplici:_ Okay, let's tackle this query. The user wants me to rewrite a technical changelog entry into a short, simple Italian sentence that's easy for non-programmers to understand. They specified not to use technical jargon without explanation, and not to add any extra details.
- **Task #201** — Ares — agente heavy on-demand per analisi e risoluzione complesse <!-- a531fbc -->
  - _In parole semplici:_ Okay, the user wants me to rewrite this technical changelog entry into a single short sentence in Italian that's easy for non-programmers to understand. Let me read the original text first.

**Altre modifiche:**

- **23:07** · Update documentation with current troubleshooting status <!-- 6e6c1d5 -->
- **22:33** · Update documentation for power supply and GPU debugging <!-- 2ae4d96 -->
- **21:42** · Update documentation for external power supply and GPU debugging <!-- 9c16c66 -->
- **20:57** · Add documentation for controlling power supply via USB relay <!-- 60d4d4e -->
- **20:30** · Add completion of a task for fixing a test and reconciling documentation <!-- 4346057 -->
- **14:45** · Add a gated heavy coder to prevent interruptions during active chats <!-- 32b4ca9 -->
  - _In parole semplici:_ Okay, let's tackle this request. The user wants me to rewrite a technical changelog entry into a short, simple Italian sentence that's easy for non-programmers to understand. They specified no technical jargon without explanation, no extra details, and just the sentence without quotes or prefixes.
- **13:28** · Saved progress at the end of the loop <!-- 51343b2 -->
  - _In parole semplici:_ Okay, let me try to figure out how to approach this. The user wants me to rewrite a technical changelog entry into a short, simple Italian sentence that's understandable for someone who isn't a programmer. No tech jargon without explanation, don't add extra details, and just the sentence without quotes, prefixes, or explanations.
- **13:13** · Update Ares tool to support custom timeouts for task reviews <!-- c9a341d -->
  - _In parole semplici:_ Okay, the user wants me to rewrite a technical changelog entry into a short, simple Italian sentence that's understandable for non-programmers. Let me see.
- **12:33** · Add Ares task review for power modes <!-- 26bdd38 -->
  - _In parole semplici:_ Okay, I need to rewrite this tech changelog entry into a short Italian sentence that's easy for non-programmers to understand. Let me see.
- **12:27** · Add ability to save architect mode preferences across sessions <!-- 02e1895 -->
  - _In parole semplici:_ Okay, I need to rewrite this technical changelog entry into a short, simple Italian sentence that's easy for non-programmers to understand. The original text says: "Add ability to save architect mode preferences across sessions".
- **12:24** · Feat: persist Horus architect mode to localStorage across page reloads <!-- 0d6b800 -->
  - _In parole semplici:_ Okay, I need to rephrase this tech changelog entry into a short, simple Italian sentence that's easy for non-programmers to understand. The original text says: "Feat: persist Horus architect mode to localStorage across page reloads".
- **12:24** · Test: add automated coverage for mode-switch history clearing in AgentChatPanel <!-- 358f7a5 -->
  - _In parole semplici:_ Okay, let me try to figure out how to approach this. The user wants me to rewrite a technical changelog entry into a short, simple Italian sentence that's easy for non-programmers to understand. They specified not to use technical jargon without explaining it, no extra details, and just the sentence without quotes or prefixes.
- **12:24** · Git commit prior to merge <!-- c4b5b4f -->
  - _In parole semplici:_ Okay, let me try to figure out how to approach this. The user wants me to rewrite a technical changelog entry into a short, simple Italian sentence that's understandable for non-programmers. They specified not to use technical jargon without explaining it, don't add extra details, and just give the sentence without quotes, prefixes, or explanations.
- **12:17** · Add ares review task functionality and associated tests <!-- cbcebf7 -->
  - _In parole semplici:_ Okay, let's tackle this request. The user wants me to rewrite the technical changelog entry "Add ares review task functionality and associated tests" into a single short sentence in simple Italian that's understandable for non-programmers. They don't want any technical jargon without explanation, no extra details, and just the sentence without quotes or prefixes.
- **11:58** · Feat(horus): architect mode — system prompt strutturato + review-task script <!-- 17f5d87 -->
  - _In parole semplici:_ Okay, I need to rewrite this technical changelog entry into a short, simple Italian sentence that's easy for non-programmers to understand. Let me first understand what the original text says.
- **11:55** · Feat(horus): architect mode — system prompt strutturato + review-task script <!-- ead8f40 -->
  - _In parole semplici:_ Okay, let me try to figure out how to approach this. The user wants me to rewrite a technical changelog entry in a short, simple Italian sentence that's understandable for non-programmers. They specified not to use technical jargon without explaining it, and not to add extra details.
- **11:46** · Update website's social media preview image <!-- c6b1a24 -->
  - _In parole semplici:_ Okay, I need to rewrite this technical changelog entry into a short, simple Italian sentence that's easy for non-programmers to understand. The original is "Update website's social media preview image". Let me break it down.
- **10:30** · Add ability to plan motorcycle trips and routes <!-- 4d2b086 -->
  - _In parole semplici:_ Okay, I need to rewrite this technical changelog entry into a short Italian sentence that's easy to understand for non-programmers. The original text is "Add ability to plan motorcycle trips and routes".
- **10:27** · Improve Horus routing and retry logic for better user experience <!-- 640fa3a -->
  - _In parole semplici:_ Okay, I need to rewrite this technical changelog entry into a short, simple Italian sentence that's easy for non-programmers to understand. The original text is "Improve Horus routing and retry logic for better user experience".
- **10:25** · Fix(tools): call_horus auto-selected for routing in Bowie context <!-- e5197c8 -->
  - _In parole semplici:_ Okay, let me try to work through this. The user wants me to rewrite a technical changelog entry into a short, simple Italian sentence that's understandable for non-programmers. They specified no technical jargon without explanation, don't add details, and just respond with the sentence.
- **10:22** · Add personalized route suggestions based on rider style <!-- 87877e1 -->
  - _In parole semplici:_ Okay, I need to rewrite this technical changelog entry into a short, simple Italian sentence that's easy for non-programmers to understand. The original text is "Add personalized route suggestions based on rider style".
- **10:08** · Feat(horus): add get_weather, get_traffic, route_via_graphhopper tools (trigger-abilitabili) <!-- a3fb9b8 -->
  - _In parole semplici:_ Okay, I need to rewrite this technical changelog entry into a short, simple Italian sentence that's easy for non-programmers to understand. Let me see.
- **09:47** · Add navigation chat endpoint for BikerLink integration <!-- 6f1129a -->
  - _In parole semplici:_ Okay, I need to rewrite this tech changelog entry into a short, simple Italian sentence that's understandable for non-programmers. The original text is "Add navigation chat endpoint for BikerLink integration". Let me break it down.
- **09:38** · Add Ares tool to analyze backlog items and improve agent prompts <!-- 3de3df6 -->
  - _In parole semplici:_ Okay, I need to translate this technical changelog entry into a short, simple Italian sentence that's understandable for non-programmers. The original text is: "Add Ares tool to analyze backlog items and improve agent prompts".
- **09:30** · Expand agent capabilities for GitHub access and coordination <!-- 121a82e -->
  - _In parole semplici:_ Okay, I need to rewrite this technical changelog entry into a short, simple Italian sentence that's easy for non-programmers to understand. The original text is "Expand agent capabilities for GitHub access and coordination".
- **09:27** · Add inter-agent communication tools and capabilities for Bowie <!-- 3fd4057 -->
  - _In parole semplici:_ Okay, I need to rewrite this technical changelog entry in a short, simple Italian sentence that's easy for non-programmers to understand. The original text is: "Add inter-agent communication tools and capabilities for Bowie".
- **09:03** · Make API server logs persistent across sessions <!-- 4b9cb86 -->
  - _In parole semplici:_ Okay, I need to rewrite this technical changelog entry into a short, simple Italian sentence that's easy for non-programmers to understand. The original text is "Make API server logs persistent across sessions". Let me break this down.
- **08:59** · Update documentation to simplify changelog entries <!-- b5acb8a -->
  - _In parole semplici:_ Okay, I need to rewrite this technical changelog entry into a short, simple Italian sentence that's easy for non-programmers to understand. The original text says: "Update documentation to simplify changelog entries".
- **07:38** · Update page title to reflect selected agent <!-- 0e8c183 -->
  - _In parole semplici:_ Okay, the user wants me to rewrite a technical changelog entry into a short, simple Italian sentence that's understandable for non-programmers. They specified no technical jargon without explanation, no extra details, and just the sentence without quotes or prefixes.
- **07:19** · Fix Horus (qwen3:4b) empty responses — add think:false <!-- 900008a -->
  - _In parole semplici:_ Okay, let me try to figure out how to approach this. The user wants me to rewrite a technical changelog entry into a short, simple Italian sentence that's easy for non-programmers to understand. They specified no technical jargon without explanation, don't add extra details, and just the sentence without quotes or prefixes.
- **07:02** · Update Horus model to use the same configuration as Bowie <!-- 7b93c75 -->
  - _In parole semplici:_ Okay, let's see. The user wants me to rewrite this technical changelog entry into a short, simple Italian sentence that's easy for non-programmers to understand. They specified no tech jargon without explanation, don't add extra details, and just the sentence without quotes or prefixes.
- **06:25** · Update documentation to reflect recent task completions <!-- 5e320c2 -->
  - _In parole semplici:_ Okay, I need to rewrite this changelog entry in a short, simple Italian sentence that's easy for non-programmers to understand. The original text is "Update documentation to reflect recent task completions".
- **06:13** · Update documentation to reflect recent task completions <!-- 8b8fe60 -->
  - _In parole semplici:_ Okay, let me try to figure out how to approach this. The user wants me to rewrite a technical changelog entry into a short, simple Italian sentence that's easy for non-programmers to understand. They specified no tech jargon without explanation, no extra details, and just the sentence without quotes or prefixes.
- **05:24** · Update documentation to include recent task completions <!-- 1f11eb3 -->
  - _In parole semplici:_ Okay, I need to rephrase this technical changelog entry into a simple Italian sentence that's easy for non-programmers to understand. The original text is "Update documentation to include recent task completions".

### 6 luglio 2026

**Altre modifiche:**

- **23:04** · Update documentation with build lessons and recent task completions <!-- 12933aa -->
  - _In parole semplici:_ Okay, let me try to figure out how to approach this. The user wants me to rewrite a technical changelog entry in a short, simple Italian sentence that's understandable for non-programmers. They specified not to use technical jargon without explaining it, and not to add any extra details. Just the sentence, no quotes, no prefixes, no explanations.
- **21:15** · Make SSH key login persistent across sessions <!-- b000252 -->
  - _In parole semplici:_ Okay, I need to rewrite this technical changelog entry into a short, simple Italian sentence that's easy for non-programmers to understand. The original text is "Make SSH key login persistent across sessions". Let me break it down.
- **21:03** · Add script to properly format SSH keys from environment variables <!-- 60ab139 -->
  - _In parole semplici:_ Okay, I need to rewrite this technical changelog entry into a short, simple Italian sentence that's easy for non-programmers to understand. The original text is: "Add script to properly format SSH keys from environment variables".
- **21:01** · Update project changelog to reflect recent task completions <!-- 709a062 -->
  - _In parole semplici:_ Okay, let's tackle this. The user wants a short, simple Italian sentence that explains the changelog update without technical jargon. They don't want any extra details.
- **20:06** · Fix issue where timezone database was not being correctly created <!-- aee3be8 -->
  - _In parole semplici:_ Okay, let's tackle this query. The user wants me to rewrite a technical changelog entry into a short, simple Italian sentence that's easy for non-programmers to understand. They specified no technical jargon without explanation, no extra details, and just the sentence without quotes or prefixes.
- **19:32** · Update project changelog to reflect recent task completions <!-- d066975 -->
  - _In parole semplici:_ Okay, let me try to figure out how to approach this. The user wants me to rewrite a technical changelog entry into a short, simple Italian sentence that's easy for non-programmers to understand. They specified no technical jargon without explanation, no extra details, and just the sentence without quotes or prefixes.
- **16:34** · Update project changelog to reflect recent task completions <!-- 2c83677 -->
  - _In parole semplici:_ Okay, let's tackle this request. The user wants me to rewrite a technical changelog entry into a short, simple Italian sentence that's easy for non-programmers to understand. They specified no technical jargon without explanation, no extra details, and just the sentence without quotes or prefixes.
- **13:41** · Update project changelog to reflect recent task completions <!-- 23ff375 -->
  - _In parole semplici:_ Okay, I need to rewrite this changelog entry in a short, simple Italian sentence that's easy for non-programmers to understand. The original text is "Update project changelog to reflect recent task completions".
- **12:11** · Update firewall configuration to remove outdated Tailscale references <!-- c9f0a54 -->
  - _In parole semplici:_ Okay, I need to rephrase this technical changelog entry into a short, simple Italian sentence that's easy for non-programmers to understand. Let me read the original text first: "Update firewall configuration to remove outdated Tailscale references".
- **12:07** · Improve security by hardening the firewall configuration <!-- 1556d97 -->
  - _In parole semplici:_ Okay, I need to rewrite this changelog entry in a simple Italian sentence that's easy for non-programmers to understand. The original text is "Improve security by hardening the firewall configuration".
- **12:03** · Add geocoding service to the platform and secure its access <!-- e0b6c78 -->
  - _In parole semplici:_ Okay, I need to rephrase the technical changelog entry into a short, simple Italian sentence that's understandable for non-programmers. The original says: "Add geocoding service to the platform and secure its access".
- **10:46** · Update project changelog to reflect task completion <!-- b1ad2dc -->
  - _In parole semplici:_ Okay, let's see. The user wants me to rewrite a technical changelog entry in a short Italian sentence that's easy to understand for non-programmers. They specified no technical jargon without explanation, don't add extra details, and just the sentence without quotes or prefixes.
- **10:40** · Add documentation for nginx configuration backup errors <!-- 845bf33 -->
  - _In parole semplici:_ Okay, let's tackle this request. The user wants me to rewrite a technical changelog entry into a short, simple Italian sentence that's easy for non-programmers to understand. They specified no tech jargon without explanation, no extra details, and just the sentence without quotes or prefixes.
- **00:52** · Update project changelog to reflect task completion <!-- a9077cf -->
  - _In parole semplici:_ Okay, let me try to figure out how to approach this. The user wants me to rewrite a technical changelog entry into a short, simple Italian sentence that's easy for non-programmers to understand. The original text is "Update project changelog to reflect task completion".

### 5 luglio 2026

**Task completati:**

- **Task #203** — Clone locale BikerLink su TC con refresh automatico ogni 24h <!-- d958b02 -->
  - _In parole semplici:_ Okay, let's tackle this request. The user wants me to rewrite a technical changelog entry in one short, simple Italian sentence that's understandable for non-programmers. They specified no technical jargon without explanation, no extra details, and just the sentence without quotes, prefixes, or explanations.
- **Task #200** — Add structured tracing for the LLM tool-loop <!-- e0df4a9 -->
  - _In parole semplici:_ Okay, let me try to figure out how to approach this. The user wants me to rewrite a technical changelog entry into a short, simple Italian sentence that's understandable for non-programmers. They specified not to use technical jargon without explaining it, no extra details, and just the sentence without quotes or prefixes.
- **Task #197** — Deliverable B: free cloud fallback for Quebracho <!-- 6d4931d -->
  - _In parole semplici:_ Okay, I need to rephrase this technical changelog entry into a short, simple Italian sentence that's easy for non-programmers to understand. Let me first understand what "Deliverable B: free cloud fallback for Quebracho" means.
- **Task #195** — Manuali BikerLink generati da Horus e Quebracho <!-- cc14724 -->
  - _In parole semplici:_ I manuali di BikerLink sono stati generati dai motori linguistici Horus e Quebracho

**Altre modifiche:**

- **23:15** · Add documentation for Valhalla build quirks <!-- 3773323 -->
  - _In parole semplici:_ Okay, I need to rewrite this tech changelog entry in a short, simple Italian sentence that's easy for non-programmers to understand. The original text is "Add documentation for Valhalla build quirks".
- **22:15** · Update project changelog to reflect task completion <!-- e00482a -->
  - _In parole semplici:_ Okay, I need to rewrite this technical changelog entry into a short, simple Italian sentence that's easy for non-programmers to understand. Let me read the original: "Update project changelog to reflect task completion".
- **22:03** · Update documentation with realistic build times <!-- 294e8f4 -->
  - _In parole semplici:_ Okay, let me try to figure out how to approach this. The user wants me to rewrite a technical changelog entry into a short, simple Italian sentence that's understandable for non-programmers. They specified not to use technical jargon without explaining it, don't add extra details, and just give the sentence without quotes, prefixes, or explanations.
- **21:56** · Update documentation on Valhalla tile swap process <!-- 70dee85 -->
  - _In parole semplici:_ Okay, let me try to figure out how to approach this. The user wants me to rewrite a technical changelog entry into a short, simple Italian sentence that's understandable for non-programmers. No tech jargon without explanation, don't add extra details, just the sentence.
- **19:57** · Document Valhalla tile build process and address cleanup issues <!-- 174d633 -->
  - _In parole semplici:_ Okay, I need to rewrite this tech changelog entry into a short, simple Italian sentence that's easy for non-programmers to understand. Let me see.
- **19:30** · Saved progress at the end of the loop <!-- 928e60c -->
  - _In parole semplici:_ Okay, let me try to figure out how to approach this. The user wants me to rewrite a technical changelog entry in a short, simple Italian sentence that's understandable for non-programmers. They specified not to use technical jargon without explaining it and not to add extra details.
- **17:45** · Defer decision on cloud fallback model until BikerLink work <!-- 68a4839 -->
  - _In parole semplici:_ Okay, I need to rephrase the technical changelog entry into a short, simple Italian sentence that's understandable for non-programmers. Let me first understand what the original text means.
- **17:37** · Document live test results for cloud fallback resilience <!-- 97d9836 -->
  - _In parole semplici:_ Okay, let me try to figure this out. The user wants me to rewrite a technical changelog entry in a short, simple Italian sentence that's easy for non-programmers to understand. They specified no technical jargon without explanation, and I shouldn't add any details not present in the original text.
- **17:23** · Ares: agente heavy on-demand (POWER mode) — Task #201 <!-- cc5755d -->
  - _In parole semplici:_ Okay, let me try to figure this out. The user wants me to rewrite a technical changelog entry into a short, simple Italian sentence that's easy for non-programmers to understand. No tech jargon without explaining, don't add extra details, just the sentence.
- **16:53** · Add nightly semantic supervision and alerting for AI interactions <!-- 8e3041e -->
  - _In parole semplici:_ Okay, the user wants me to rewrite a technical changelog entry into a short, simple Italian sentence that's understandable for non-programmers. Let me break this down.
- **16:42** · Update documentation regarding service failures <!-- 3c1623d -->
  - _In parole semplici:_ Okay, let me try to figure out how to approach this. The user wants me to rewrite a technical changelog entry into a short, simple Italian sentence that's easy for non-programmers to understand. The original text is "Update documentation regarding service failures".
- **16:36** · Update project changelog to reflect task completion <!-- 3ae4120 -->
  - _In parole semplici:_ Okay, let me tackle this request. The user wants me to rewrite a technical changelog entry into a short, simple Italian sentence that's easy for non-programmers to understand. They specified no technical jargon without explanation, no extra details, and just the sentence without quotes or prefixes.
- **15:43** · Update project documentation with new route planning and transcription tools <!-- 6ed185d -->
  - _In parole semplici:_ Okay, let's tackle this query. The user wants a short, simple Italian sentence that explains the tech changelog entry without technical jargon. The original text is "Update project documentation with new route planning and transcription tools".
- **14:03** · Defer route planning integration to BikerLink's dedicated task <!-- 7629f4c -->
  - _In parole semplici:_ Okay, I need to rewrite this tech changelog entry into a short, simple Italian sentence that's easy for non-technical people to understand. Let me read the original text: "Defer route planning integration to BikerLink's dedicated task".
- **14:00** · Update project documentation with new route planning and transcription tools <!-- 716f3bb -->
  - _In parole semplici:_ Okay, I need to rephrase this tech changelog entry into a short, simple Italian sentence that's easy for non-programmers to understand. The original text is: "Update project documentation with new route planning and transcription tools".
- **07:36** · Fase 2e (POWER): Whisper STT + route-planning tools per Horus/Bowie <!-- 565340e -->
  - _In parole semplici:_ Okay, let's tackle this request. The user wants me to rewrite a technical changelog entry into a short, simple Italian sentence that's easy for non-programmers to understand. No tech jargon without explanation, no extra details, just the sentence.
- **07:05** · Add new tools for geocoding, routing, and speech-to-text transcription <!-- 30a63b3 -->
  - _In parole semplici:_ Okay, I need to rewrite this tech changelog entry into a short, simple Italian sentence that's understandable for non-programmers. The original text is: "Add new tools for geocoding, routing, and speech-to-text transcription".
- **06:36** · Update task completion documentation with new tasks and changes <!-- fc2c32e -->
  - _In parole semplici:_ Okay, I need to rewrite this technical changelog entry in a short, simple Italian sentence that's easy for non-programmers to understand. The original text is: "Update task completion documentation with new tasks and changes".
- **05:42** · Update documentation to reflect recent AI model and service changes <!-- e9b65d3 -->
  - _In parole semplici:_ Okay, I need to rewrite this changelog entry into a short, simple Italian sentence that's easy for non-programmers to understand. Let me first understand what the original says.
- **05:35** · Update models and labels for improved AI content generation <!-- bc3a407 -->
  - _In parole semplici:_ Okay, I need to rewrite this tech changelog entry into a short, simple Italian sentence that's easy for non-programmers to understand. Let me look at the original text: "Update models and labels for improved AI content generation".
- **05:31** · Add a health check endpoint for the AI Hub service <!-- 1364bf0 -->
  - _In parole semplici:_ Okay, the user wants me to rewrite a technical changelog entry into a short, simple Italian sentence that non-programmers can understand. Let me look at the original text: "Add a health check endpoint for the AI Hub service".
- **05:23** · Update documentation on Cloudflare API token permissions <!-- 1958a6d -->
  - _In parole semplici:_ Okay, I need to rewrite this technical changelog entry into a short, simple Italian sentence that's easy for non-programmers to understand. Let me check the original text: "Update documentation on Cloudflare API token permissions".
- **04:45** · Update project documentation and code for agent configurations and naming conventions <!-- 46ad72a -->
  - _In parole semplici:_ Okay, let me try to figure out how to rephrase this changelog entry into a simple Italian sentence without technical jargon. The original text is: "Update project documentation and code for agent configurations and naming conventions".
- **04:07** · Document VRAM limits for running multiple AI models simultaneously <!-- e0c2a41 -->
  - _In parole semplici:_ Okay, let me tackle this request. The user wants me to rewrite a technical changelog entry into a short, simple Italian sentence that's understandable for non-programmers. They don't want tech jargon without explanation, and I shouldn't add any extra details. Just the sentence, no quotes, no prefixes, no explanations.
- **01:41** · Update AI Hub URL and rename related files <!-- d4fff78 -->
  - _In parole semplici:_ Okay, I need to rewrite this technical changelog entry into a single short sentence in Italian that's easy for non-programmers to understand. Let me first understand what the original text says.
- **01:23** · Update system to use new AI Hub URL and rename related files <!-- 687194d -->
  - _In parole semplici:_ Abbiamo aggiornato il sistema per utilizzare un nuovo indirizzo del nostro hub di intelligenza artificiale e rinominato i file correlati.
- **01:05** · Task start baseline checkpoint for code review <!-- 794a0d4 -->
  - _In parole semplici:_ Iniziato il processo di revisione del codice.
- **01:01** · Organize project documentation for better readability and maintenance <!-- 6e3778c -->
  - _In parole semplici:_ Abbiamo organizzato la documentazione del progetto per renderla più leggibile e facile da mantenere
- **00:38** · Update project changelog with recent task completions and improvements <!-- 1c6872e -->
  - _In parole semplici:_ Aggiornamento del registro delle modifiche con i compiti recenti completati e miglioramenti
- **00:35** · Integrate Quebracho as a new AI assistant and improve existing agent capabilities <!-- 61927cd -->
  - _In parole semplici:_ Abbiamo integrato un nuovo assistente intelligente chiamato Quebracho e migliorato le capacità del nostro agente esistente.

### 4 luglio 2026

**Task completati:**

- **Task #191** — Import BikerLink manuals (Nadir + local archive) <!-- e62a1f5 -->
  - _In parole semplici:_ Abbiamo importato i manuali di BikerLink in modo che gli utenti possano consultarli facilmente all'interno dell'app.
- **Task #188** — Mostra sempre "Riprova" quando l'agente va in timeout (chat diretta) <!-- 867a3a2 -->
  - _In parole semplici:_ In caso di timeout durante una chat diretta, l'app mostrerà sempre la scritta "Riprova".
- **Task #184** — Type health-status mocks against HealthResult <!-- 26f3fe8 -->
  - _In parole semplici:_ Abbiamo migliorato i test di salute del sistema per fornire risultati più precisi e affidabili.
- **Task #183** — Type chat test mocks against real AgentRegistryEntry shape <!-- b278cda -->
  - _In parole semplici:_ Abbiamo migliorato il sistema di messaggi per una migliore compatibilità con i dati degli utenti.
- **Task #182** — Restore the chat test suite so future breakages get caught <!-- e665d3e -->
  - _In parole semplici:_ Abbiamo ripristinato i test della chat per intercettare eventuali problemi futuri.
- **Task #181** — Fix raw "network error" leaking into Horus/Bowie chat <!-- 78d48cc -->
  - _In parole semplici:_ Abbiamo risolto un problema che causava l'errore di rete grezzo nella chat tra Horus e Bowie
- **Task #178** — Contextual tool loading + always-resident Ollama models <!-- 62efe66 -->
  - _In parole semplici:_ Caricamento degli strumenti contestuali e modelli Ollama sempre attivi.
- **Task #176** — Fail fast when Horus/Bowie tool-free fallback also times out <!-- 171c7d7 -->
  - _In parole semplici:_ Se il sistema di backup senza strumenti orari fallisce, l'app si blocca rapidamente per evitare problemi.

**Altre modifiche:**

- **23:40** · Add VRAM usage monitoring and alerting integration <!-- 15f9206 -->
  - _In parole semplici:_ Aggiunta del monitoraggio e dell'allerta sull'utilizzo della memoria video
- **21:53** · Add shared file tools for cross-agent communication <!-- 9e9cd1e -->
  - _In parole semplici:_ Aggiunta di strumenti per file condivisi per la comunicazione tra agenti
- **21:45** · Add file management tools for inter-agent collaboration <!-- 8ce47af -->
  - _In parole semplici:_ Aggiunto strumenti di gestione dei file per collaborare tra gli agenti
- **21:30** · Update the project's open graph image for the blog <!-- 570b17a -->
  - _In parole semplici:_ Abbiamo aggiornato l'immagine dell'open graph per il nostro blog.
- **21:02** · Document the current state of the Bowie chat feature <!-- 1c6a254 -->
  - _In parole semplici:_ Abbiamo registrato lo stato attuale della funzione di chat Bowie.
- **21:00** · Make NVIDIA GPU persistence mode survive reboots automatically <!-- 5900a0a -->
  - _In parole semplici:_ Abbiamo migliorato il modo in cui l'app utilizza le GPU NVIDIA per garantire che la modalità di persistenza sopravviva ai riavvii automatici.
- **20:54** · Update project memory to reflect GPU resolution of latency issues <!-- 4975ed0 -->
  - _In parole semplici:_ Abbiamo migliorato il modo in cui l'app gestisce le problematiche di latenza legate alla risoluzione della GPU.
- **20:54** · Update memory to reflect GPU acceleration for faster responses <!-- 2a47ee2 -->
  - _In parole semplici:_ Aggiornamento memoria per utilizzare l'accelerazione della GPU e migliorare le prestazioni dell'app
- **20:18** · Add direct SSH access to user's TC box via Cloudflare tunnel <!-- 882c6fb -->
  - _In parole semplici:_ Aggiunta dell'accesso SSH diretto alla scatola di traffico dell'utente tramite il tunnel Cloudflare.
- **20:16** · Saved progress at the end of the loop <!-- ce5c697 -->
  - _In parole semplici:_ Salva il progresso alla fine di ogni ciclo.
- **20:13** · Update the website's social sharing image <!-- d16a1cb -->
  - _In parole semplici:_ Abbiamo aggiornato l'immagine condivisa sui social media del nostro sito web.
- **20:12** · Update project documentation with recent changes <!-- 5d9bed4 -->
  - _In parole semplici:_ Aggiornamento della documentazione del progetto con le modifiche recenti
- **20:04** · Update project documentation with recent changes <!-- e7ba95b -->
  - _In parole semplici:_ Aggiornamento della documentazione del progetto con le modifiche recenti
- **19:58** · Add Cloudflared and update site image <!-- 75cbc4e -->
  - _In parole semplici:_ Abbiamo migliorato la sicurezza del sito con l'aggiunta di Cloudflared e l'aggiornamento dell'immagine del sito.
- **19:57** · Add Cloudflared to project dependencies and update site image <!-- ec28a0f -->
  - _In parole semplici:_ Aggiunto Cloudflared ai dipendenze del progetto e aggiornata l'immagine del sito
- **19:55** · Add Cloudflared to project dependencies and update site image <!-- a655a02 -->
  - _In parole semplici:_ Aggiunto Cloudflared tra le dipendenze del progetto e aggiornata l'immagine del sito
- **19:53** · Saved progress at the end of the loop <!-- d22f841 -->
  - _In parole semplici:_ Salvato il progresso alla fine del ciclo
- **19:08** · Improve app response speed by increasing message history limit <!-- c4d192c -->
  - _In parole semplici:_ Abbiamo aumentato il limite di storia dei messaggi per migliorare la velocità di risposta dell'app.
- **19:04** · Improve app response speed by increasing message history limit <!-- 14093de -->
  - _In parole semplici:_ Abbiamo migliorato le prestazioni dell'app aumentando il limite di storia dei messaggi.
- **16:01** · Improve app response speed by increasing message history limit <!-- 5abd63a -->
  - _In parole semplici:_ Abbiamo migliorato le prestazioni dell'app aumentando il limite della cronologia dei messaggi.
- **15:57** · Improve app response speed by increasing message history limit <!-- 7b840bd -->
  - _In parole semplici:_ Abbiamo migliorato la velocità di risposta dell'app aumentando il limite della cronologia dei messaggi.
- **15:33** · Improve response speed by increasing message history limit <!-- 471a0ea -->
  - _In parole semplici:_ Abbiamo aumentato il limite di storia dei messaggi per migliorare la velocità di risposta dell'app.
- **06:42** · Revert message history limit to improve response speed <!-- 53d0cf8 -->
  - _In parole semplici:_ Abbiamo migliorato la velocità di risposta dell'app aumentando il limite della cronologia dei messaggi.
- **04:17** · Fix Task #185: recover chat replies lost to mobile network drops <!-- ae1746d -->
  - _In parole semplici:_ Abbiamo risolto un problema che causava la perdita di risposte alle chat durante le interruzioni della rete mobile.
- **03:33** · Git commit prior to merge <!-- 69a5327 -->
  - _In parole semplici:_ Commit effettuato prima del merge.
- **03:29** · Git commit prior to merge <!-- db7d8e1 -->
  - _In parole semplici:_ Commit effettuato prima del merge.
- **03:22** · Git commit prior to merge <!-- 9de01c2 -->
  - _In parole semplici:_ Commit git prima del merge.
- **03:17** · Git commit prior to merge <!-- 2c6efa9 -->
  - _In parole semplici:_ Commit git prima del merge.
- **03:02** · Update Ollama chat to correctly format keep alive duration <!-- 3e34770 -->
  - _In parole semplici:_ Abbiamo aggiornato il sistema di chat Ollama per formattare correttamente la durata del keep alive.
- **02:53** · Improve error handling for missing tools in direct chat interactions <!-- 8a526be -->
  - _In parole semplici:_ Abbiamo migliorato il modo in cui l'app gestisce gli errori quando un utente prova a utilizzare uno strumento mancante nella chat diretta.
- **02:41** · Add completed task to changelog indicating tool loading and model residency <!-- d0d5c2b -->
  - _In parole semplici:_ Abbiamo aggiunto una voce al registro delle modifiche per indicare il caricamento dell'strumento e la residenza del modello.

### 3 luglio 2026

**Task completati:**

- **Task #170** — Add regression coverage for stopping a chat mid-tool-call <!-- a974b29 -->
  - _In parole semplici:_ Abbiamo migliorato il sistema di chat per permettere agli utenti di fermare una conversazione durante l'utilizzo dell'app.
- **Task #169** — End-to-end regression test for multi-tool budget threading <!-- 653c853 -->
  - _In parole semplici:_ Abbiamo eseguito dei test di regressione end-to-end per il calcolo del budget nella funzione multi-tool.
- **Task #168** — Protect the chat-timeout safeguard's coverage at its source <!-- d963bd1 -->
  - _In parole semplici:_ Abbiamo migliorato il sistema di protezione del timeout delle chat per garantire una maggiore stabilità e affidabilità.
- **Task #167** — Bound total tool-result size per turn (multi-tool reliability) <!-- dea91e7 -->
  - _In parole semplici:_ Abbiamo aumentato la dimensione totale del risultato degli strumenti legati in modo da migliorare la affidabilità dei nostri multi-strumenti.
- **Task #166** — Stop CLI chat freezing on the same tunnel timeout as web chat <!-- 1221fd2 -->
  - _In parole semplici:_ Risolto il problema di blocco della chat CLI durante lo stesso timeout del tunnel come nella chat web.
- **Task #165** — Fix Horus/Bowie web chat freeze from the 2nd message <!-- e4a0522 -->
  - _In parole semplici:_ Corretto il blocco della chat web di Horus/Bowie dal secondo messaggio
- **Task #164** — Catch a regression where two agents down at once hide one of the names <!-- ea4ce1e -->
  - _In parole semplici:_ Abbiamo risolto un problema in cui due agenti offline contemporaneamente facevano scomparire uno dei nomi.
- **Task #163** — Add a "Chat con Quebracho" direct-chat tab <!-- d5ab446 -->
  - _In parole semplici:_ Abbiamo aggiunto una nuova opzione di chat diretta con il nostro assistente virtuale Quebracho.
- **Task #162** — Add regression test for GET /horus/agents registry endpoint <!-- 25d27e6 -->
  - _In parole semplici:_ Abbiamo aggiunto un test di regressione per il endpoint di registro degli agenti GET /horus/agents
- **Task #161** — Show which agent is reachable when only one of several goes down <!-- 4c1fccd -->
  - _In parole semplici:_ L'app indica quale agente è raggiungibile quando uno solo di diversi va offline.
- **Task #160** — Remember preferred conversation length preset (Horus/Bowie) <!-- 8da3d1a -->
  - _In parole semplici:_ L'app BikerLink ricorda la lunghezza preferita delle conversazioni orarie (Horus/Bowie).
- **Task #158** — Let users pick a shorter Horus↔Bowie conversation before starting it <!-- c62a700 -->
  - _In parole semplici:_ Abbiamo migliorato la funzione di chat tra Horus e Bowie per consentire agli utenti di scegliere una conversazione più breve prima di avviare.
- **Task #157** — Keep long Horus<->Bowie conversations from dragging on <!-- d2594fe -->
  - _In parole semplici:_ Abbiamo migliorato il sistema di chat tra Horus e Bowie per rendere le conversazioni più rapide ed efficienti.
- **Task #155** — Add Quebracho as a third AI voice to the Horus<->Bowie conversation <!-- 222ab31 -->
  - _In parole semplici:_ Abbiamo aggiunto una terza voce AI, Quebracho, alla conversazione tra Horus e Bowie.
- **Task #154** — Generalize the observed-conversation UI to N agents <!-- 792a759 -->
  - _In parole semplici:_ Abbiamo migliorato l'interfaccia utente per gestire conversazioni con più agenti contemporaneamente.
- **Task #150** — Verify Bowie's real llama3.2:3b model still gives good conversations <!-- 24fd067 -->
  - _In parole semplici:_ Abbiamo verificato che il modello di llama3.2:3b di Bowie funzioni correttamente per conversazioni di qualità.
- **Task #147** — Alert when Nadir semantic search silently stops working <!-- 8f6b0ed -->
  - _In parole semplici:_ Ricevi una notifica quando la ricerca semantica di Nadir si ferma silenziosamente.
- **Task #146** — Regression coverage so the nightly Nadir reindex can never crash the pipeline <!-- f034c82 -->
  - _In parole semplici:_ Abbiamo migliorato il test delle regressioni per evitare interruzioni notturne del pipeline di indicizzazione.
- **Task #145** — Warn when the search index silently stops updating <!-- 4abd4eb -->
  - _In parole semplici:_ Avvisa quando l'indice di ricerca si ferma silenziosamente.
- **Task #144** — Add regression coverage for Nadir export route and search_manual tool <!-- ff5a50b -->
  - _In parole semplici:_ Abbiamo migliorato il sistema di test per l'esportazione del percorso di Nadir e lo strumento di ricerca manuale.
- **Task #143** — Keep Nadir's search index fresh automatically every night <!-- 9dec50b -->
  - _In parole semplici:_ Ogni notte l'app aggiorna automaticamente l'indice di ricerca di Nadir per garantire risultati precisi e veloci.
- **Task #142** — Generalize observable convo agents from Horus/Bowie union to N-agent registry <!-- 2b9caaa -->
  - _In parole semplici:_ Abbiamo migliorato il sistema di gestione degli agenti conversazionali per supportare più agenti contemporaneamente.
- **Task #139** — Add automated coverage for corrupted saved-chat restart flow <!-- 19cc6fd -->
  - _In parole semplici:_ Abbiamo migliorato il processo di riavvio della chat salvata in caso di problemi per farlo funzionare automaticamente.
- **Task #138** — Changelog di sincronizzazione BikerLink (backfill + auto-update con task completati) <!-- dc46e5d -->
  - _In parole semplici:_ BikerLink ora sincronizza automaticamente i tuoi dati e aggiorna le attività concluse.
- **Task #137** — Confirm closing the browser mid-discussion stops Horus/Bowie generation <!-- b12a9ba -->
  - _In parole semplici:_ Abbiamo risolto il problema che impediva di chiudere il browser durante una discussione in corso tra Horus e Bowie.
- **Task #136** — Surface corrupted resumeTranscript as one clear, non-looping error <!-- 5504788 -->
  - _In parole semplici:_ Risolto il problema di ripetizione del testo nella trascrizione della superficie corrotta.
- **Task #135** — Build "Nadir" standalone semantic-search service for Horus/Bowie <!-- 161851a -->
  - _In parole semplici:_ Abbiamo creato un servizio di ricerca semantica in grado di funzionare in modo autonomo per Horus e Bowie
- **Task #134** — Attivare Bowie con configurazione reale (llama3.2:3b) <!-- 8787680 -->
  - _In parole semplici:_ Abbiamo migliorato il modello di intelligenza artificiale utilizzato da Bowie per fornire risposte più accurate e coerenti.

**Altre modifiche:**

- **22:39** · Git commit prior to merge <!-- 70389c3 -->
  - _In parole semplici:_ Commit effettuato prima del merge.
- **22:36** · Fix Horus/Bowie chat freezing after first message (gateway-timeout fallback) <!-- 24ebf31 -->
  - _In parole semplici:_ Risolto il problema di blocco della chat tra Horus e Bowie dopo il primo messaggio
- **22:04** · Git commit prior to merge <!-- df1b62a -->
  - _In parole semplici:_ Commit effettuato prima del merge.
- **21:55** · Git commit prior to merge <!-- 5b74224 -->
  - _In parole semplici:_ Commit effettuato prima del merge.
- **21:48** · Git commit prior to merge <!-- a1b2696 -->
  - _In parole semplici:_ Commit effettuato prima del merge.
- **21:45** · Git commit prior to merge <!-- 8141dd2 -->
  - _In parole semplici:_ Commit Git prima del merge.
- **21:42** · Git commit prior to merge <!-- 71be900 -->
  - _In parole semplici:_ Commit Git prima del merge.
- **21:00** · Adjust response limits to prevent chat timeouts on slower hardware <!-- 0fc1b99 -->
  - _In parole semplici:_ Abbiamo ottimizzato i limiti di risposta per evitare tempi di attesa eccessivi su dispositivi più lenti.
- **20:47** · Filter agents for group conversations to only include configured ones <!-- f904a35 -->
  - _In parole semplici:_ In futuro, solo gli agenti filtrati e configurati potranno partecipare alle conversazioni di gruppo.
- **20:35** · Improve chat experience by fixing tool output and UI layout <!-- 7b6b855 -->
  - _In parole semplici:_ Abbiamo migliorato l'esperienza di chat risolvendo problemi nell'output delle funzioni e nella disposizione dell'interfaccia utente.
- **20:21** · Prevent chat server crashes by safely handling disconnections <!-- bf6b4c0 -->
  - _In parole semplici:_ Abbiamo migliorato la stabilità della chat impedendo che si verifichino crash del server in caso di disconnessioni improvvise degli utenti.
- **20:14** · Enable tools in web chat and adjust reply length limits <!-- 1eb694c -->
  - _In parole semplici:_ Abbiamo attivato gli strumenti nella chat web e regolato i limiti di lunghezza delle risposte
- **19:57** · Add file handling and improve message memory for AI chat <!-- c77eb7c -->
  - _In parole semplici:_ Abbiamo migliorato il modo in cui l'app gestisce i file e le conversazioni con l'IA per offrirti un'esperienza più fluida.
- **19:52** · Increase chat message history for AI to improve conversation continuity <!-- ecaab04 -->
  - _In parole semplici:_ Aumento della cronologia dei messaggi delle chat per l'IA per migliorare la continuità della conversazione
- **19:27** · Update changelog to include recent task completions and AI response changes <!-- 2c40f37 -->
  - _In parole semplici:_ L'app BikerLink ha aggiornato il registro delle modifiche per includere i compiti recentemente completati e le variazioni nelle risposte dell'IA.
- **19:24** · Update AI assistants to provide brief, direct responses <!-- 394972a -->
  - _In parole semplici:_ Abbiamo migliorato i nostri assistenti virtuali per fornire risposte brevi e dirette.
- **19:09** · Add notes about completed tasks and merge commits to the changelog <!-- 386df50 -->
  - _In parole semplici:_ Aggiunto la possibilità di annotare i compiti completati e di unire i commit al changelog
- **18:29** · Git commit prior to merge <!-- a3d1cef -->
  - _In parole semplici:_ Commit effettuato prima del merge.
- **18:24** · Git commit prior to merge <!-- fec61bc -->
  - _In parole semplici:_ Commit effettuato prima del merge.
- **18:06** · Derive agent health-gate config from a single registry <!-- d971b78 -->
  - _In parole semplici:_ Abbiamo migliorato il modo in cui l'app gestisce le informazioni di salute dell'agente
- **18:06** · Git commit prior to merge <!-- 2818ec4 -->
  - _In parole semplici:_ Commit effettuato prima del merge.
- **16:46** · Git commit prior to merge <!-- 2a7146f -->
  - _In parole semplici:_ Commit prima del merge.
- **16:40** · Git commit prior to merge <!-- a96f001 -->
  - _In parole semplici:_ Commit git prima del merge.
- **16:36** · Git commit prior to merge <!-- 908333a -->
  - _In parole semplici:_ Commit git prima del merge.
- **16:16** · Update system to sync changelog in real-time after every merge <!-- 75b8117 -->
  - _In parole semplici:_ Abbiamo migliorato il sistema per sincronizzare i cambiamenti in tempo reale dopo ogni fusione.
- **16:05** · Update changelog to reflect all recent task completions <!-- c2d5f6e -->
  - _In parole semplici:_ Abbiamo aggiornato il registro delle modifiche per riflettere tutti i compiti recentemente completati.
- **15:52** · Git commit prior to merge <!-- f273a97 -->
  - _In parole semplici:_ Commit effettuato prima del merge.
- **15:09** · Git commit prior to merge <!-- 2f6b11a -->
  - _In parole semplici:_ Commit git prima del merge.
- **13:37** · Add simple Italian translations to commit log entries <!-- 0d597b1 -->
  - _In parole semplici:_ Aggiunto supporto per le traduzioni in italiano nei messaggi di commit
<!-- AUTO-CHANGELOG:END -->
