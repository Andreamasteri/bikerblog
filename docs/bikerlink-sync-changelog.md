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
