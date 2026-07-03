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

---

## Aggiornamenti automatici

_Da qui in giù il contenuto è generato automaticamente ogni notte. Ogni voce
corrisponde a una modifica registrata dopo il backfill iniziale._

<!-- AUTO-CHANGELOG:START -->
### 3 luglio 2026

**Task completati:**

- **Task #139** — Add automated coverage for corrupted saved-chat restart flow <!-- 19cc6fd -->
- **Task #138** — Changelog di sincronizzazione BikerLink (backfill + auto-update con task completati) <!-- f5d4bf4 -->
- **Task #137** — Confirm closing the browser mid-discussion stops Horus/Bowie generation <!-- b12a9ba -->
- **Task #136** — Surface corrupted resumeTranscript as one clear, non-looping error <!-- 5504788 -->
<!-- AUTO-CHANGELOG:END -->
