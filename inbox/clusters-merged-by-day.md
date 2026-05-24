# Cluster task BikerLink — per giornata · filtro: MERGED

> **100 task** in **10 cluster**
> Generato il: 2026-05-24T09:46:19.840Z
> Sorgente: /home/runner/workspace/inbox/bikerlink-archived-tasks.json

Ogni sezione rappresenta un cluster candidato per un post del blog.
Seleziona i cluster più significativi e scrivi il post con l'agente.

---
## 📅 2026-03-12 (7 task)

- ✅ **#2** — Raggio SOS visibile in rosso sulla mappa
- ✅ **#3** — Sposta tasti SOS nella tab Ride! con immagini personalizzate
- ✅ **#4** — Stile tasti SOS: rinomina, dimensioni, colori, spaziatura
- ✅ **#5** — Fix raggio SOS: rimuovi 5km, aggiungi campo personalizzato, fix Invia SOS
- ✅ **#6** — Rettifiche layout schermata iniziale: counter, header casco, ad space, SOS overlay
- ✅ **#7** — Rimuovi Accogli SOS, centra Lancia SOS, dettaglio SOS dal triangolo
- ✅ **#8** — Genera manuale d'uso BikerLink per utenti

<details>
<summary>Dettaglio task</summary>

### ✅ #2 — Raggio SOS visibile in rosso sulla mappa

_Creato: 2026-03-12 · Aggiornato: 2026-04-09 · Stato: MERGED_

# SOS Radius on Map

## What & Why
When a user sends an SOS request, they should set a radius of action. This radius must be displayed as a highly visible RED circle on the interactive map, so other users can see the SOS area clearly.

## Done looks like

_(…)_

---

### ✅ #3 — Sposta tasti SOS nella tab Ride! con immagini personalizzate

_Creato: 2026-03-12 · Aggiornato: 2026-04-09 · Stato: MERGED_

# Move SOS buttons to Ride! tab with custom images

  ## What & Why
  The two SOS buttons (launch SOS + accept SOS) are currently on the main map screen (index.tsx). The user wants them moved to the "Ride!" tab (ready.tsx), placed below the existing options ("Registra Giro" and "I Miei Percorsi"). The SVG helmet icons must be replaced with provided/generated images (no white background).

  ## Done looks like

_(…)_

---

### ✅ #4 — Stile tasti SOS: rinomina, dimensioni, colori, spaziatura

_Creato: 2026-03-12 · Aggiornato: 2026-04-09 · Stato: MERGED_

# Stile tasti SOS: rinomina, dimensioni, colori, spaziatura

## Cosa fare
4 modifiche ai due tasti SOS in app/(tabs)/ready.tsx:

1. **Rinomina tasto sinistro**: da "SOS" a "Lancia SOS"

_(…)_

---

### ✅ #5 — Fix raggio SOS: rimuovi 5km, aggiungi campo personalizzato, fix Invia SOS

_Creato: 2026-03-12 · Aggiornato: 2026-04-09 · Stato: MERGED_

# Fix raggio SOS e bottone Invia

## Cosa fare

### 1. Rimuovere la casella 5 km
- Nel modal SOS in ready.tsx, cambiare `[5, 10, 20, 50]` in `[10, 20, 50]`

_(…)_

---

### ✅ #6 — Rettifiche layout schermata iniziale: counter, header casco, ad space, SOS overlay

_Creato: 2026-03-12 · Aggiornato: 2026-04-09 · Stato: MERGED_

# Rettifiche layout schermata iniziale (index.tsx)

## Elenco elementi schermata (dall'alto in basso) — RIFERIMENTO
1. Scritta "BikerLink" con chat icon
2. Barra di ricerca utenti
3. Versione compatta della mappa

_(…)_

---

### ✅ #7 — Rimuovi Accogli SOS, centra Lancia SOS, dettaglio SOS dal triangolo

_Creato: 2026-03-12 · Aggiornato: 2026-04-09 · Stato: MERGED_

# Rimuovi tasto Accogli SOS, centra Lancia SOS, dettaglio SOS da triangolo

## Modifiche

### 1. Rimuovi tasto blu "Accogli SOS" da ready.tsx
- Rimuovere il Pressable del tasto destro (linee ~250-265) con sosAcceptIcon e badge

_(…)_

---

### ✅ #8 — Genera manuale d'uso BikerLink per utenti

_Creato: 2026-03-12 · Aggiornato: 2026-04-09 · Stato: MERGED_

# Manuale d'uso BikerLink

  ## Obiettivo
  Generare un manuale d'uso completo in italiano per gli utenti dell'app BikerLink.
  Deve coprire tutte le funzionalità accessibili dall'utente normale.
  NON includere: pannello admin, pannello moderatore, gestione advertisement, branding Syneco.

_(…)_

</details>

---

## 📅 2026-03-13 (4 task)

- ✅ **#9** — Sicurezza pre-APK: chiave sessione, token nei log, PayPal hardcoded
- ✅ **#10** — Creare e collegare email di reset password
- ✅ **#11** — Permessi Android mancanti + fotocamera iOS/Android
- ✅ **#18** — Donazione toggle + sicurezza nickname riservati

<details>
<summary>Dettaglio task</summary>

### ✅ #9 — Sicurezza pre-APK: chiave sessione, token nei log, PayPal hardcoded

_Creato: 2026-03-13 · Aggiornato: 2026-04-09 · Stato: MERGED_

# Sicurezza pre-APK

## What & Why
Risolvere tre problemi di sicurezza prima della build APK di produzione:
1. La chiave di sessione usa un valore di fallback leggibile nel codice sorgente
2. I token di reset password e verifica email vengono stampati nei log del server

_(…)_

---

### ✅ #10 — Creare e collegare email di reset password

_Creato: 2026-03-13 · Aggiornato: 2026-04-09 · Stato: MERGED_

# Email reset password

## What & Why
L'endpoint /forgot-password genera il token di reset e lo salva nel database, ma non invia nessuna email all'utente. Serve creare la funzione di invio email e collegarla all'endpoint.

## Done looks like

_(…)_

---

### ✅ #11 — Permessi Android mancanti + fotocamera iOS/Android

_Creato: 2026-03-13 · Aggiornato: 2026-04-09 · Stato: MERGED_

# Permessi Android e fotocamera iOS

  ## What & Why
  I permessi Android in app.json sono incompleti: manca GPS in primo piano e accesso foto/media. Inoltre la fotocamera è dichiarata su iOS ma mai usata nel codice — serve implementare l'opzione "scatta foto" ovunque si usa il picker immagini (profilo, contest, annunci admin).

  ## Done looks like

_(…)_

---

### ✅ #18 — Donazione toggle + sicurezza nickname riservati

_Creato: 2026-03-13 · Aggiornato: 2026-04-09 · Stato: MERGED_

# Donazione Toggle + Sicurezza Nickname Riservati

## What & Why
Aggiungere al pannello admin la possibilità di mostrare/nascondere il blocco "Supporta BikerLink" (con tasto PayPal) nel profilo utente, con testo personalizzabile e protezione da password admin. Contestualmente: blindare gli utenti admin/moderator dalla cancellazione e bloccare la registrazione di nickname riservati.

## Done looks like

_(…)_

</details>

---

## 📅 2026-03-14 (3 task)

- ✅ **#20** — Mercatino Moto — Vendita moto dal garage
- ✅ **#22** — Fix utenti fake visibili dopo disattivazione
- ✅ **#23** — Password per toggle utenti fake

<details>
<summary>Dettaglio task</summary>

### ✅ #20 — Mercatino Moto — Vendita moto dal garage

_Creato: 2026-03-14 · Aggiornato: 2026-04-09 · Stato: MERGED_

# Mercatino Moto — Vendita moto dal garage

## What & Why
Permettere ai biker di mettere in vendita le proprie moto direttamente dal garage, senza creare un marketplace separato. Approccio minimalista: una checkbox "In vendita" e un campo descrizione libera. Le moto in vendita vengono evidenziate sul profilo pubblico dell'utente e nella sezione motoclub. Funzionalità attivabile/disattivabile dall'admin panel.

## Done looks like

_(…)_

---

### ✅ #22 — Fix utenti fake visibili dopo disattivazione

_Creato: 2026-03-14 · Aggiornato: 2026-04-09 · Stato: MERGED_

# Fix fake users still visible after disabling

## What & Why
When the admin disables fake users via the toggle in the admin panel, they still appear in the app (nearby list, online list, etc.). Two bugs cause this:

1. The `getNearbyUsers` query returns ALL active users with coordinates — it never checks `isFake` or `isAvailable`, so fake users always appear in the nearby view.

_(…)_

---

### ✅ #23 — Password per toggle utenti fake

_Creato: 2026-03-14 · Aggiornato: 2026-04-09 · Stato: MERGED_

# Password per toggle utenti fake

## What & Why
Il toggle "Abilita utenti fake" nel pannello admin (fake-users.tsx) è attualmente un semplice Switch senza protezione. Chiunque abbia accesso al pannello admin può attivare/disattivare i fake con un tap accidentale. Serve aggiungere la stessa protezione con password admin già usata per gli altri toggle (donazione, verifica email, GPS, marketplace).

## Done looks like

_(…)_

</details>

---

## 📅 2026-03-15 (4 task)

- ✅ **#24** — Riorganizzazione pannello admin
- ✅ **#25** — Elimina tutti gli utenti fake
- ✅ **#26** — Fix toggle Abilita/Disabilita utenti fake
- ✅ **#27** — Generazione massiva 2420 utenti fake

<details>
<summary>Dettaglio task</summary>

### ✅ #24 — Riorganizzazione pannello admin

_Creato: 2026-03-15 · Aggiornato: 2026-04-09 · Stato: MERGED_

# Riorganizzazione pannello admin

## What & Why
Le sezioni del pannello admin e della pagina impostazioni sono state aggiunte nel tempo senza un ordine logico. Vanno riorganizzate in gruppi coerenti per facilitare la navigazione e la gestione.

## Done looks like

_(…)_

---

### ✅ #25 — Elimina tutti gli utenti fake

_Creato: 2026-03-15 · Aggiornato: 2026-04-09 · Stato: MERGED_

# Elimina tutti gli utenti fake

## What & Why
Attualmente è possibile eliminare i fake user solo uno alla volta dal pannello admin. Serve un'azione bulk per eliminarli tutti in un colpo solo, con conferma.

## Done looks like

_(…)_

---

### ✅ #26 — Fix toggle Abilita/Disabilita utenti fake

_Creato: 2026-03-15 · Aggiornato: 2026-04-09 · Stato: MERGED_

# Fix toggle Abilita/Disabilita utenti fake

## What & Why
Lo switch "Abilita utenti fake" nel pannello admin deriva il suo stato da
`allEnabled = users.length > 0 && users.every(u => u.profile?.isAvailable)`.
Se ci sono 0 fake user nel DB (dopo cancellazione), lo switch è sempre OFF

_(…)_

---

### ✅ #27 — Generazione massiva 2420 utenti fake

_Creato: 2026-03-15 · Aggiornato: 2026-04-09 · Stato: MERGED_

# Generazione massiva utenti fake (2420 utenti)

## What & Why
L'app ha bisogno di popolare il DB con un gran numero di utenti fake realistici,
distribuiti uniformemente su tutto il territorio nazionale (incluse Sicilia e Sardegna),
per rendere la piattaforma credibile e testabile. I numeri richiesti:

_(…)_

</details>

---

## 📅 2026-03-16 (15 task)

- ✅ **#29** — Script stress test 4 ore
- ✅ **#33** — Monitoraggio RAM e disco in parallelo allo stress test
- ✅ **#34** — Traduzioni EN + DE con selettore lingua manuale nel profilo
- ✅ **#35** — Aggiungi lingue Spagnolo e Francese
- ✅ **#36** — Selezione paese + regione europea
- ✅ **#37** — Verifica feature, pulizia cache e riavvio
- ✅ **#38** — Fix lingua + dropdown selettore + logout prominente in profilo
- ✅ **#39** — Mass-seed europeo: distribuire utenti fake in tutta Europa
- ✅ **#40** — Fix pulsante Elimina tutti utenti fake
- ✅ **#43** — Traduzione completa app — passata sistematica
- ✅ **#44** — Notifiche email per feedback e segnalazioni
- ✅ **#45** — Manuale utente PDF multilingue scaricabile
- ✅ **#46** — Filtro mappa per paese — Definisci Area
- ✅ **#47** — Contatori filtrati per paesi selezionati
- ✅ **#48** — Retry compilazione backend su OOM

<details>
<summary>Dettaglio task</summary>

### ✅ #29 — Script stress test 4 ore

_Creato: 2026-03-16 · Aggiornato: 2026-04-09 · Stato: MERGED_

# Script stress test 4 ore

## What & Why

Creare uno script Node.js standalone (`scripts/stress-test.ts`) che gira per 4 ore simulando attività realistica su tutte le funzioni dell'app BikerLink: chat utente↔utente, chat utente↔fake-user con risposte automatiche del chatbot, mercatino moto (proposals), richieste SOS, percorsi custom, visualizzazioni profilo, cambio disponibilità/posizione.

_(…)_

---

### ✅ #33 — Monitoraggio RAM e disco in parallelo allo stress test

_Creato: 2026-03-16 · Aggiornato: 2026-04-09 · Stato: MERGED_

# Monitoraggio RAM e disco in parallelo allo stress test

## Obiettivo

Aggiungere un loop di monitoraggio di sistema che gira in background mentre lo stress test è attivo, scrivendo metriche di RAM e disco nello stesso file di log cumulativo (`logs/stress-test-cumulative.log`) con tag `[SYS]`. Questo permette di correlare picchi di latenza HTTP con spike di consumo RAM.

_(…)_

---

### ✅ #34 — Traduzioni EN + DE con selettore lingua manuale nel profilo

_Creato: 2026-03-16 · Aggiornato: 2026-04-09 · Stato: MERGED_

# Traduzioni EN + DE con selettore lingua manuale

## Obiettivo

Aggiungere le traduzioni in inglese (EN) e tedesco (DE) all'app BikerLink, con un selettore lingua manuale nella schermata Profilo. La lingua scelta viene persistita in AsyncStorage.

_(…)_

---

### ✅ #35 — Aggiungi lingue Spagnolo e Francese

_Creato: 2026-03-16 · Aggiornato: 2026-04-09 · Stato: MERGED_

# Aggiungi Spagnolo e Francese all'app

## What & Why
Le lingue supportate al momento sono IT, EN, DE. L'app deve supportarne 5: Italiano, Inglese, Tedesco, Spagnolo e Francese. Bisogna aggiungere i dizionari ES e FR (stesse ~125 chiavi già presenti) e aggiornare il selettore nel profilo da 3 a 5 pulsanti.

## Done looks like

_(…)_

---

### ✅ #36 — Selezione paese + regione europea

_Creato: 2026-03-16 · Aggiornato: 2026-04-09 · Stato: MERGED_

# Selezione Paese + Regione Europea

## What & Why
Attualmente la selezione della regione è limitata alle 20 regioni italiane (lista hardcoded). Con l'aggiunta del supporto multilingue e dell'utenza europea, occorre permettere a ogni utente di scegliere il proprio paese (tutti gli stati europei + UK) e la relativa regione/provincia. Questo migliora la ricerca geografica, la visualizzazione sulla mappa e la rilevanza delle proposte.

## Done looks like

_(…)_

---

### ✅ #37 — Verifica feature, pulizia cache e riavvio

_Creato: 2026-03-16 · Aggiornato: 2026-04-09 · Stato: MERGED_

# Verifica lingua, regioni, cache e riavvio

## What & Why
Verifica end-to-end che le tre feature implementate siano integre e funzionanti, pulizia della cache Metro, riavvio completo dell'app e controllo autonomo del corretto avvio. Include snapshot delle porte Replit prima e dopo.

## Done looks like

_(…)_

---

### ✅ #38 — Fix lingua + dropdown selettore + logout prominente in profilo

_Creato: 2026-03-16 · Aggiornato: 2026-04-09 · Stato: MERGED_

# Fix lingua, dropdown e logout in profile

## What & Why

Tre problemi da correggere nella schermata profilo:

_(…)_

---

### ✅ #39 — Mass-seed europeo: distribuire utenti fake in tutta Europa

_Creato: 2026-03-16 · Aggiornato: 2026-04-09 · Stato: MERGED_

# Spread mass-seed across Europe

## What & Why

Attualmente tutti i 2420 utenti fake sono distribuiti nelle 20 regioni italiane con `country: "IT"` hardcodato. Bisogna riscrivere la distribuzione geografica per coprire tutta Europa mantenendo le stesse tipologie e quantità.

_(…)_

---

### ✅ #40 — Fix pulsante Elimina tutti utenti fake

_Creato: 2026-03-16 · Aggiornato: 2026-04-09 · Stato: MERGED_

# Fix "Elimina tutti" utenti fake

## What & Why

Il pulsante "Elimina tutti gli utenti fake" nel pannello admin non funziona in modo affidabile. L'indagine ha mostrato che nessuna richiesta DELETE raggiunge il backend, oppure la query è troppo pesante per il database serverless Neon.

_(…)_

---

### ✅ #43 — Traduzione completa app — passata sistematica

_Creato: 2026-03-16 · Aggiornato: 2026-04-09 · Stato: MERGED_

# Traduzione Completa App — Passata Sistematica

## What & Why
Molte schermate dell'app hanno testo italiano hardcoded che non passa dal sistema i18n, rendendo inutile la scelta della lingua. Problemi principali segnalati: "Zavorrina" non si traduce mai, le etichette delle proposte restano in italiano, le date sono sempre in formato it-IT.

## Done looks like

_(…)_

---

### ✅ #44 — Notifiche email per feedback e segnalazioni

_Creato: 2026-03-16 · Aggiornato: 2026-04-09 · Stato: MERGED_

# Notifiche Email Feedback e Segnalazioni

## What & Why
Quando un utente invia un feedback/bug report o segnala un altro utente, i dati vengono salvati nel DB ma l'admin non riceve nessun avviso. Aggiungere l'invio automatico di un'email a bikerlinkapp@gmail.com ad ogni submission, così i problemi e le richieste vengono notati immediatamente.

## Done looks like

_(…)_

---

### ✅ #45 — Manuale utente PDF multilingue scaricabile

_Creato: 2026-03-16 · Aggiornato: 2026-04-09 · Stato: MERGED_

# Manuale Utente PDF Multilingue

## What & Why
Ogni utente deve poter scaricare un manuale d'uso completo di BikerLink direttamente dalla sezione Profilo. L'admin può aggiornare il file quando vuole. Il PDF contiene le istruzioni in tutte le 5 lingue supportate (IT/EN/DE/ES/FR).

## Done looks like

_(…)_

---

### ✅ #46 — Filtro mappa per paese — Definisci Area

_Creato: 2026-03-16 · Aggiornato: 2026-04-09 · Stato: MERGED_

# Filtro Mappa per Paese

## What & Why
La mappa carica tutti gli utenti disponibili senza distinzione geografica, causando lentezza su una piattaforma pan-europea con 50+ paesi. Aggiungere un filtro "Definisci Area" che permette all'utente di scegliere quali paesi includere nella visualizzazione, riducendo drasticamente il carico di rete e la complessità visiva della mappa.

## Done looks like

_(…)_

---

### ✅ #47 — Contatori filtrati per paesi selezionati

_Creato: 2026-03-16 · Aggiornato: 2026-04-09 · Stato: MERGED_

# Contatori filtrati per paesi selezionati

## What & Why
I tre contatori "online", "biker disponibili" e "zavorrine disponibili" mostrano totali globali anche quando l'utente ha selezionato una specifica area geografica (paesi). Questo crea incoerenza: le liste mostrano solo i paesi scelti, ma i badge dei counter mostrano tutti gli utenti del mondo. Bisogna allinearli.

## Done looks like

_(…)_

---

### ✅ #48 — Retry compilazione backend su OOM

_Creato: 2026-03-16 · Aggiornato: 2026-04-09 · Stato: MERGED_

# Retry compilazione backend su OOM

## What & Why
Lo script `scripts/start-backend.sh` non riprova la compilazione TypeScript se questa viene uccisa dal sistema (es. OOM killer). Il loop di retry esiste solo per crash del server già avviato — se `npm run server:build` fallisce, lo script esce subito con `exit 1` senza mai ritentare. Serve aggiungere un retry loop anche alla fase di compilazione.

## Done looks like

_(…)_

</details>

---

## 📅 2026-03-17 (11 task)

- ✅ **#49** — Mappa centrata su regione/ultima GPS all'apertura
- ✅ **#50** — Lazy loading traduzioni i18n per lingua
- ✅ **#51** — Default paese mappa: sempre Italia
- ✅ **#52** — Selettore paese nell'header della mappa
- ✅ **#53** — Fix 3 bug: moderatore back, ads lock, garage predefinita
- ✅ **#60** — Fix: tap su utente in match accettati apre profilo
- ✅ **#63** — Fix motore matching - cleanup DB e stabilizzazione
- ✅ **#64** — Match screen: rimuovi accettati, tab cronologia, reset rifiutati
- ✅ **#65** — Watchdog: monitoraggio e riavvio automatico
- ✅ **#66** — Schermata Debug DB (solo Admin)
- ✅ **#67** — Cestino match garage: reset a 'new' invece di delete fisico

<details>
<summary>Dettaglio task</summary>

### ✅ #49 — Mappa centrata su regione/ultima GPS all'apertura

_Creato: 2026-03-17 · Aggiornato: 2026-04-09 · Stato: MERGED_

# Mappa centrata su regione/ultima GPS all'apertura

## What & Why
All'apertura dell'app, la mappa aspetta il GPS live prima di centrarsi. L'utente vede la mappa inizialmente ferma su Roma o in posizione sbagliata. La logica corretta è: centrare immediatamente sulla regione del profilo (dati già disponibili), poi sull'ultima posizione GPS salvata, poi — solo se necessario — chiedere il GPS live.

## Done looks like

_(…)_

---

### ✅ #50 — Lazy loading traduzioni i18n per lingua

_Creato: 2026-03-17 · Aggiornato: 2026-04-09 · Stato: MERGED_

# Lazy loading traduzioni i18n per lingua

## What & Why
`lib/i18n.ts` contiene tutti e 5 i dizionari di traduzione in un unico file da 1816 righe. Metro deve parsare tutto al bundle iniziale, causando un rallentamento visibile (~40% del bundling). Ogni utente usa una sola lingua ma paga il costo di caricarle tutte.

## Done looks like

_(…)_

---

### ✅ #51 — Default paese mappa: sempre Italia

_Creato: 2026-03-17 · Aggiornato: 2026-04-09 · Stato: MERGED_

# Default paese mappa: sempre Italia

## What & Why
Al primo avvio, se non ci sono paesi salvati in AsyncStorage, il codice usa `user.country` come default (es. "DE" per un utente tedesco) oppure fa una rilevazione GPS lenta (5+ secondi). Questo causa due problemi: un utente tedesco vede solo biker tedeschi sulla mappa, e la rilevazione GPS rallenta l'avvio.

Il comportamento corretto è: se nessun paese è salvato in AsyncStorage → default fisso `["IT"]`, sempre. L'utente può aggiungere altri paesi dal selettore area.

_(…)_

---

### ✅ #52 — Selettore paese nell'header della mappa

_Creato: 2026-03-17 · Aggiornato: 2026-04-09 · Stato: MERGED_

# Selettore paese nell'header della mappa

## What & Why
Il pulsante di selezione area (🌍 Area — 🇮🇹 1 paese) è attualmente posizionato sotto la barra di ricerca, togliendo spazio verticale alle pubblicità e alle stats. Deve essere spostato dentro la riga dell'header, tra l'icona del casco e l'icona della chat.

Layout attuale:

_(…)_

---

### ✅ #53 — Fix 3 bug: moderatore back, ads lock, garage predefinita

_Creato: 2026-03-17 · Aggiornato: 2026-04-09 · Stato: MERGED_

# Fix 3 bug: moderatore, ads, garage predefinita

## What & Why

### Bug 1 — Freccia indietro moderatore su Android
Il pannello moderatore (`app/moderator/index.tsx`) usa un pulsante custom con `router.back()`. Se non esiste storia di navigazione nel stack (edge case), il back non funziona. Fix: usare `router.canGoBack()` e come fallback `router.replace("/(tabs)/profile")`.

_(…)_

---

### ✅ #60 — Fix: tap su utente in match accettati apre profilo

_Creato: 2026-03-17 · Aggiornato: 2026-04-09 · Stato: MERGED_

# Fix: tap su utente in match accettati

  ## What & Why
  Nella tab Match, le card dei match accettati (sia proposal-match che garage-match) mostrano il nickname dell'altra persona come testo statico non toccabile. L'utente si aspetta di poter toccare il nome/icona per vedere il profilo completo. I componenti `MatchCardFull` e `GarageMatchCard` usano un `View` normale invece di un `TouchableOpacity`.

  Gli ID degli utenti sono già presenti nel payload delle API (`userId1`/`userId2` per i proposal match, `bikerId`/`zavarrinaId` per i garage match). La route del profilo `/profile/[id]` esiste già e funziona (è usata in tutta l'app).

_(…)_

---

### ✅ #63 — Fix motore matching - cleanup DB e stabilizzazione

_Creato: 2026-03-17 · Aggiornato: 2026-04-09 · Stato: MERGED_

# Fix motore matching - cleanup DB e stabilizzazione

## What & Why
Il vecchio bug del matching (if separati invece di if/else if, già fixato in #59) ha generato 2.267.423 match errati nel DB, occupando 710 MB. La logica difettosa matchava tutte le moto della stessa marca ignorando il modello, producendo combinazioni sbagliate (es. wishlist "Ducati Multistrada V2" → match con "Ducati Monster 821").

Ora che il motore è corretto (brand+model > solo-brand > solo-tipo), i dati storici vanno ripuliti e la tabella va irrobustita per prevenire future esplosioni.

_(…)_

---

### ✅ #64 — Match screen: rimuovi accettati, tab cronologia, reset rifiutati

_Creato: 2026-03-17 · Aggiornato: 2026-04-09 · Stato: MERGED_

# Match screen: rimuovi accettati, elimina cronologia, reset rifiutati

  ## What & Why
  Tre miglioramenti UX richiesti dall'utente per la schermata Match:

  1. **Rimuovi match accettati**: una volta chiusa una storia con un match accettato, l'utente deve poter cancellarlo per fare spazio ad altri. Aggiungere un bottone "elimina" su ogni card del tab "accettati".

_(…)_

---

### ✅ #65 — Watchdog: monitoraggio e riavvio automatico

_Creato: 2026-03-17 · Aggiornato: 2026-04-09 · Stato: MERGED_

# Watchdog: monitoraggio e riavvio automatico

## What & Why
Creare uno script watchdog persistente che monitora backend (porta 5000) e frontend (porta 8081), li riavvia automaticamente se crashano, e controlla periodicamente la salute del server inviando un alert nel log se qualcosa non risponde.

## Done looks like

_(…)_

---

### ✅ #66 — Schermata Debug DB (solo Admin)

_Creato: 2026-03-17 · Aggiornato: 2026-04-09 · Stato: MERGED_

# Schermata Debug DB per Admin

## What & Why
Aggiungere una schermata di debug visibile solo agli admin che mostra in tempo reale lo stato del database: conteggio record per ogni tabella e ultimi inserimenti. Serve per monitorare la crescita del DB e individuare anomalie senza accedere direttamente al database.

## Done looks like

_(…)_

---

### ✅ #67 — Cestino match garage: reset a 'new' invece di delete fisico

_Creato: 2026-03-17 · Aggiornato: 2026-04-09 · Stato: MERGED_

# Cestino match garage: reset a "new"

## What & Why
Quando l'utente tocca il cestino su un match accettato nel tab Garage,
il record viene eliminato fisicamente dal DB. Il motore di matching
(cap 500/ciclo, ~42.000 combinazioni) impiega potenzialmente ore prima

_(…)_

</details>

---

## 📅 2026-03-18 (20 task)

- ✅ **#68** — Redesign Match Screen + Match Biker ↔ Biker
- ✅ **#69** — Ads nei Match + Layout header inline
- ✅ **#70** — Sistema Backup automatico su Google Drive
- ✅ **#71** — Rimuovi tasto 'Backup ora' ridondante dall'admin
- ✅ **#72** — Messaggio home admin (BikerLink/casco tap)
- ✅ **#73** — Codici invito — email con immagine gadget sovraimpressa
- ✅ **#74** — Rimuovi pannello Chat Utenti dall'admin
- ✅ **#75** — Avviso permanente pannello Advertisement
- ✅ **#76** — Sezione Documentazione nel profilo
- ✅ **#77** — Elimina Chat + Blocco Utente
- ✅ **#78** — Splash Message — Modalità Singolo / Cicla
- ✅ **#79** — Fix scorrimento lista regioni utenti fake
- ✅ **#81** — Fix crash mappa fullscreen su iOS
- ✅ **#82** — Fix definitivo crash mappa fullscreen iOS
- ✅ **#83** — Fix bug garage: isDefault moto + moto spariscono dopo logout
- ✅ **#84** — Velocizza badge nuovi messaggi
- ✅ **#86** — Fix flag Predefinita moto garage
- ✅ **#87** — Fix matching: diagnostica garage e match admin
- ✅ **#88** — Fix: Elimina moto utenti fake
- ✅ **#89** — Pannello Iscritti nella Chat Motoclub

<details>
<summary>Dettaglio task</summary>

### ✅ #68 — Redesign Match Screen + Match Biker ↔ Biker

_Creato: 2026-03-18 · Aggiornato: 2026-04-09 · Stato: MERGED_

# Redesign Match Screen + Match Biker ↔ Biker

## What & Why

Ristrutturare completamente la schermata Match eliminando la logica "per status" (In attesa / Accettati / Garage) e passando a una logica "per tipo di match" più intuitiva. Aggiungere contestualmente la nuova tipologia **biker ↔ biker** basata su moto compatibili nel garage, che trova compagni di viaggio con veicolo simile.

_(…)_

---

### ✅ #69 — Ads nei Match + Layout header inline

_Creato: 2026-03-18 · Aggiornato: 2026-04-09 · Stato: MERGED_

# Ads nei Match + Layout header

## What & Why
Riorganizzare il layout della schermata Match e aggiungere uno slot pubblicitario
dedicato tra il titolo e le tab zavorrine/biker/proposte.
L'obiettivo è liberare spazio sopra le tab inserendo il pulsante "reset rifiutati"

_(…)_

---

### ✅ #70 — Sistema Backup automatico su Google Drive

_Creato: 2026-03-18 · Aggiornato: 2026-04-09 · Stato: MERGED_

---
title: Sistema Backup automatico su Google Drive
---
# Sistema Backup — Replit Object Storage

## What & Why

_(…)_

---

### ✅ #71 — Rimuovi tasto 'Backup ora' ridondante dall'admin

_Creato: 2026-03-18 · Aggiornato: 2026-04-09 · Stato: MERGED_

Rimuovi il tasto "Backup ora" ridondante dalla schermata admin principale.

## What & Why
Il tasto verde "Backup ora" (action="backup-now") nella lista della sezione "Sistema" di `app/admin/index.tsx` è ridondante: la stessa funzione è già accessibile entrando in "Backup automatici". Va eliminato per semplificare l'interfaccia.

## Done looks like

_(…)_

---

### ✅ #72 — Messaggio home admin (BikerLink/casco tap)

_Creato: 2026-03-18 · Aggiornato: 2026-04-09 · Stato: MERGED_

# Messaggio home cliccando BikerLink/casco

## What & Why
Aggiungere un sistema di annuncio controllato dall'admin: un toggle attivo/disattivo
e un testo libero nella schermata impostazioni. Quando l'utente clicca "BikerLink"
o il casco nella home, si apre un modal con il messaggio (solo se abilitato).

_(…)_

---

### ✅ #73 — Codici invito — email con immagine gadget sovraimpressa

_Creato: 2026-03-18 · Aggiornato: 2026-04-09 · Stato: MERGED_

# Redesign codici invito — email con immagine gadget

## What & Why
Ridisegnare il sistema codici invito: l'admin carica un'immagine per ogni codice; quando
un utente si registra inserendo un codice valido, gli viene inviata automaticamente un'email
contenente l'immagine con data/ora sovraimpresse e il messaggio "Riscatta il tuo gadget

_(…)_

---

### ✅ #74 — Rimuovi pannello Chat Utenti dall'admin

_Creato: 2026-03-18 · Aggiornato: 2026-04-09 · Stato: MERGED_

# Rimuovi pannello Chat Utenti dall'admin

## What & Why
Il pannello "Chat Utenti" nel pannello admin mostra solo messaggi grezzi senza contesto utile e occupa memoria inutilmente. Va rimosso completamente.

## Done looks like

_(…)_

---

### ✅ #75 — Avviso permanente pannello Advertisement

_Creato: 2026-03-18 · Aggiornato: 2026-04-09 · Stato: MERGED_

# Avviso permanente pannello Advertisement

## What & Why
Aggiungere una dicitura di avvertimento visibile in cima alla schermata Advertisement del pannello admin, per ricordare all'admin di arrestare il sistema di Advertisement prima di caricare una nuova campagna.

## Done looks like

_(…)_

---

### ✅ #76 — Sezione Documentazione nel profilo

_Creato: 2026-03-18 · Aggiornato: 2026-04-09 · Stato: MERGED_

# Sezione "Documentazione" nel Profilo

## What & Why
La sezione del profilo contiene un link alla Privacy Policy e il download del Manuale Utente, mescolati con le voci di menu ordinarie. L'utente vuole un'area dedicata "Documentazione" che raccolga tutti i documenti scaricabili (Manuale, EULA, Privacy Policy, esportazione dati utente) separata dal menu principale.

## Done looks like

_(…)_

---

### ✅ #77 — Elimina Chat + Blocco Utente

_Creato: 2026-03-18 · Aggiornato: 2026-04-09 · Stato: MERGED_

# Elimina Chat + Blocco Utente

## What & Why
Aggiungere un tasto esplicito per eliminare le conversazioni e introdurre il blocco peer-to-peer tra utenti. Il blocco è irreversibile e bidirezionale: se A blocca B, né A vedrà B né B vedrà A (in chat, profili, match, ecc.).

## Done looks like

_(…)_

---

### ✅ #78 — Splash Message — Modalità Singolo / Cicla

_Creato: 2026-03-18 · Aggiornato: 2026-04-09 · Stato: MERGED_

# Splash Message — Modalità Singolo / Cicla

## What & Why
Nella sezione "Messaggio Splash" del pannello admin, aggiungere la possibilità di scegliere tra due modalità:
- **Messaggio singolo**: comportamento attuale, un testo fisso mostrato nello splash.
- **Cicla messaggi**: una lista di messaggi editabile direttamente nell'admin, mostrati in rotazione ogni volta che l'utente vede lo splash.

_(…)_

---

### ✅ #79 — Fix scorrimento lista regioni utenti fake

_Creato: 2026-03-18 · Aggiornato: 2026-04-09 · Stato: MERGED_

# Fix scorrimento lista regioni utenti fake

## What & Why
Nel modale di creazione utente fake, il selettore regione mostra tutte le 20 regioni italiane dentro una `View` statica. Se la lista supera lo spazio visibile del modale, le regioni in fondo non sono raggiungibili. Bisogna renderla scorrevole.

## Done looks like

_(…)_

---

### ✅ #81 — Fix crash mappa fullscreen su iOS

_Creato: 2026-03-18 · Aggiornato: 2026-04-09 · Stato: MERGED_

# Fix crash mappa fullscreen iOS

## What & Why
Su iPhone (testato su iPhone 13 Pro in Expo Go), aprendo la mappa a schermo intero l'app crasha. La causa è che vengono montate simultaneamente due istanze di `MapView` (minimap + Modal fullscreen), entrambe con `PROVIDER_GOOGLE` che richiedono i permessi di localizzazione in parallelo. Su iOS questo provoca la chiusura forzata di Expo Go.

## Done looks like

_(…)_

---

### ✅ #82 — Fix definitivo crash mappa fullscreen iOS

_Creato: 2026-03-18 · Aggiornato: 2026-04-09 · Stato: MERGED_

# Fix crash mappa iOS — mount delay + cleanup async

## What & Why
Il fix precedente (#81) rimuoveva la minimap nello stesso ciclo di render in cui montava il MapView fullscreen. Sul layer nativo iOS questo non basta: il MapView nativo della minimap non fa in tempo a deallocarsi prima che venga inizializzato il secondo MapView nel Modal, causando ancora il crash in Expo Go su iPhone.

Serve agire su due fronti:

_(…)_

---

### ✅ #83 — Fix bug garage: isDefault moto + moto spariscono dopo logout

_Creato: 2026-03-18 · Aggiornato: 2026-04-09 · Stato: MERGED_

# Fix bug garage: isDefault + moto spariscono

## What & Why
Due bug nel garage moto:

**Bug 1 — isDefault non salvato alla creazione:**

_(…)_

---

### ✅ #84 — Velocizza badge nuovi messaggi

_Creato: 2026-03-18 · Aggiornato: 2026-04-09 · Stato: MERGED_

# Velocizza badge nuovi messaggi

## What & Why
Il badge arancione "nuovi messaggi" sulla tab Chat si aggiorna ogni 30 secondi, causando un ritardo percepibile quando un utente riceve un messaggio. Ridurre l'intervallo di polling migliora la reattività e l'esperienza utente.

## Done looks like

_(…)_

---

### ✅ #86 — Fix flag Predefinita moto garage

_Creato: 2026-03-18 · Aggiornato: 2026-04-09 · Stato: MERGED_

# Fix flag "Predefinita" moto garage

## What & Why
Quando si aggiunge una moto al garage e si seleziona "Predefinita", riaprendo il profilo di quella moto la flag risulta deselezionata. Il flag viene perso durante il salvataggio o nel ritorno dei dati al frontend.

## Done looks like

_(…)_

---

### ✅ #87 — Fix matching: diagnostica garage e match admin

_Creato: 2026-03-18 · Aggiornato: 2026-04-09 · Stato: MERGED_

# Fix matching: diagnostica garage e match admin

## What & Why
Il motore di matching completa ogni ciclo in 0.0s senza produrre match, e l'account admin non ha nessun match nonostante 2400 utenti fake appena creati. Il problema ha tre cause probabili:
1. La query `getAllBikerMotorcyclesWithUsers` filtra per `userType IN ('biker','coppia')` — l'admin (con `userType = 'admin'`) non viene mai incluso in nessun bucket
2. Il seed dei 2400 utenti fake potrebbe aver fallito silenziosamente l'inserimento delle moto (logSeedError non blocca l'esecuzione)

_(…)_

---

### ✅ #88 — Fix: Elimina moto utenti fake

_Creato: 2026-03-18 · Aggiornato: 2026-04-09 · Stato: MERGED_

# Fix: Elimina moto utenti fake

## What & Why
Quando si preme "Elimina tutti gli utenti fake" dal pannello admin, il metodo `deleteAllFakeUsers()` in `server/storage.ts` cancella gli utenti e le conversazioni orfane, ma non elimina le moto (`userMotorcycles`) associate a quegli utenti fake. Questo lascia record orfani nel database.

## Done looks like

_(…)_

---

### ✅ #89 — Pannello Iscritti nella Chat Motoclub

_Creato: 2026-03-18 · Aggiornato: 2026-04-09 · Stato: MERGED_

# Pannello Iscritti nella Chat Motoclub

## What & Why
Nella chat di un motoclub, l'utente non ha modo di vedere chi è iscritto al club. Si vuole aggiungere un pulsante "Iscritti" vicino al nome del club nella barra superiore della chat. Toccandolo appare una lista scorrevole degli iscritti al club.

## Done looks like

_(…)_

</details>

---

## 📅 2026-03-19 (15 task)

- ✅ **#90** — Match biker per famiglia di moto
- ✅ **#91** — Fix eliminazione match accettati
- ✅ **#92** — Popola motoclub con utenti fake
- ✅ **#93** — Fix freeze pannello admin motoclub
- ✅ **#94** — Stato online/disponibile nel profilo + fix counter
- ✅ **#95** — Schermata dettaglio motoclub
- ✅ **#96** — Admin toggle: zavorrine nei motoclub
- ✅ **#97** — Fix crash admin motoclub
- ✅ **#98** — Fix colonna mancante placement in ad_campaigns
- ✅ **#99** — Pulizia UX schermata Campagne (ex Advertisement)
- ✅ **#100** — Ghost Mode utenti (modalità invisibile)
- ✅ **#101** — Rimuovi placement 'match' dalle campagne admin
- ✅ **#102** — Indicatore Online/Offline sulla mappa (con Ghost Mode)
- ✅ **#103** — Riavvia frontend e verifica indicatore Online/Offline sulla mappa
- ✅ **#104** — Fix due bug Ghost Mode: toggle admin e reset al login

<details>
<summary>Dettaglio task</summary>

### ✅ #90 — Match biker per famiglia di moto

_Creato: 2026-03-19 · Aggiornato: 2026-04-09 · Stato: MERGED_

# Match biker per famiglia di moto

## What & Why
Il motore di matching biker↔biker richiede marca+modello identici al carattere (es. "Ducati Monster 821" ≠ "Ducati Monster 937"). L'utente vuole che biker con moto della stessa famiglia (stessa marca, stesso nome-base del modello) facciano match, ignorando la cilindrata/variante numerica finale (821, 937, 650, ecc.).

Esempio atteso: "Ducati Monster 821" e "Ducati Monster 694" → match (entrambi "Monster").

_(…)_

---

### ✅ #91 — Fix eliminazione match accettati

_Creato: 2026-03-19 · Aggiornato: 2026-04-09 · Stato: MERGED_

# Fix eliminazione match accettati

## What & Why
Se un utente accetta un match biker-biker e poi lo elimina col tasto cestino (rosso), il sistema rimette il match in stato "new" e lo ripropone. Il comportamento corretto: il match eliminato dopo essere stato accettato deve diventare "rejected" e non riapparire finché l'utente non preme il pulsante "reset rifiutati" in alto a destra (che svuota tutti i match rejected).

## Done looks like

_(…)_

---

### ✅ #92 — Popola motoclub con utenti fake

_Creato: 2026-03-19 · Aggiornato: 2026-04-09 · Stato: MERGED_

# Popola motoclub con utenti fake

## What & Why
I motoclub sono vuoti perché il sistema di creazione degli utenti fake non li iscrive ad alcun club. L'admin si aspetta che i fake user vengano automaticamente distribuiti nei motoclub esistenti (approvati), così le sezioni club risultano popolate come in produzione reale.

## Done looks like

_(…)_

---

### ✅ #93 — Fix freeze pannello admin motoclub

_Creato: 2026-03-19 · Aggiornato: 2026-04-09 · Stato: MERGED_

# Fix performance pannello admin motoclub

## What & Why
Aprire la sezione "Motoclub" nell'admin panel causa un freeze dell'app per due bug di performance:

1. **N+1 query sulla lista club**: `GET /admin/motoclubs` esegue una query SQL separata per ogni club per contare i membri. Con 50 club fa 51 query al DB in sequenza.

_(…)_

---

### ✅ #94 — Stato online/disponibile nel profilo + fix counter

_Creato: 2026-03-19 · Aggiornato: 2026-04-09 · Stato: MERGED_

# Stato Online e Disponibilità nel Profilo

## What & Why
Il profilo utente (sia il modal sulla mappa che la pagina completa) non mostra se un utente è online/offline né se è disponibile/non disponibile. Inoltre il counter degli utenti disponibili sulla schermata home non riflette i cambiamenti in tempo reale. Questi dati sono già presenti nel backend ma non vengono esposti nella UI del profilo.

## Done looks like

_(…)_

---

### ✅ #95 — Schermata dettaglio motoclub

_Creato: 2026-03-19 · Aggiornato: 2026-04-09 · Stato: MERGED_

# Schermata dettaglio motoclub

## What & Why
Attualmente toccare un motoclub nella tab "I Miei" porta direttamente alla chat di gruppo, saltando qualsiasi contesto sul club. L'utente vuole una schermata intermedia che mostri i dettagli del club (info, iscritti) con un'icona separata per aprire la chat.

## Done looks like

_(…)_

---

### ✅ #96 — Admin toggle: zavorrine nei motoclub

_Creato: 2026-03-19 · Aggiornato: 2026-04-09 · Stato: MERGED_

# Admin toggle: zavorrine nei motoclub

## What & Why
Il pannello admin deve permettere di abilitare/disabilitare la partecipazione automatica delle zavorrine ai motoclub. Quando abilitato (default), le zavorrine vengono aggiunte ai club che corrispondono alle moto nella loro wishlist — esattamente come i biker vengono aggiunti in base al garage. La flag in `app_settings` è sufficiente: non serve nessun job periodico perché l'infrastruttura esiste già.

**Nota tecnica importante (già investigata):**

_(…)_

---

### ✅ #97 — Fix crash admin motoclub

_Creato: 2026-03-19 · Aggiornato: 2026-04-09 · Stato: MERGED_

# Fix crash pannello admin motoclub

## What & Why
Aprendo la sezione "Motoclub" nel pannello admin, l'app crasha con:
`TypeError: Cannot read property 'id' of null`

_(…)_

---

### ✅ #98 — Fix colonna mancante placement in ad_campaigns

_Creato: 2026-03-19 · Aggiornato: 2026-04-09 · Stato: MERGED_

# Fix colonna mancante `placement` in ad_campaigns

## What & Why

Creando o visualizzando campagne pubblicitarie dal pannello admin, l'app restituisce errore 500. Il log backend mostra:
```

_(…)_

---

### ✅ #99 — Pulizia UX schermata Campagne (ex Advertisement)

_Creato: 2026-03-19 · Aggiornato: 2026-04-09 · Stato: MERGED_

# Pulizia UX schermata Campagne

## What & Why

Tre miglioramenti alla schermata advertisement del pannello admin:

_(…)_

---

### ✅ #100 — Ghost Mode utenti (modalità invisibile)

_Creato: 2026-03-19 · Aggiornato: 2026-04-09 · Stato: MERGED_

# Ghost Mode utenti (modalità invisibile)

## What & Why
Aggiungere un "ghost mode" (modalità invisibile) nel tab **Ride**, subito sotto il pulsante "Disponibile". Quando attivo, l'utente risulta offline per tutti gli altri — non appare nelle liste online, nei contatori né sul profilo altrui.

Logica di mutua esclusione:

_(…)_

---

### ✅ #101 — Rimuovi placement 'match' dalle campagne admin

_Creato: 2026-03-19 · Aggiornato: 2026-04-09 · Stato: MERGED_

# Rimuovi placement 'match' dalle campagne admin

## What & Why
Il placement "match" non è più usato (SynecoAd rimosso dalla tab Match).
Va eliminato dai riferimenti nell'interfaccia admin campagne per evitare confusione.

_(…)_

---

### ✅ #102 — Indicatore Online/Offline sulla mappa (con Ghost Mode)

_Creato: 2026-03-19 · Aggiornato: 2026-04-09 · Stato: MERGED_

# Aggiungi indicatore Online/Offline sulla mappa

## What & Why
Sulla mappa, sotto il badge "Disponibile/Non disponibile" dell'utente corrente,
aggiungere una riga "Online/Offline". Quando il ghost mode è attivo, l'utente
risulta Offline (anche visivamente per se stesso sulla mappa).

_(…)_

---

### ✅ #103 — Riavvia frontend e verifica indicatore Online/Offline sulla mappa

_Creato: 2026-03-19 · Aggiornato: 2026-04-09 · Stato: MERGED_

# Riavvia frontend e verifica Online/Offline sulla mappa

## What & Why
Il workflow Start Frontend è crashato dopo le modifiche al Task #102.
Il nuovo codice con l'indicatore Online/Offline non è stato caricato.
Serve riavviare il frontend per rendere visibili le modifiche.

_(…)_

---

### ✅ #104 — Fix due bug Ghost Mode: toggle admin e reset al login

_Creato: 2026-03-19 · Aggiornato: 2026-04-09 · Stato: MERGED_

# Fix due bug Ghost Mode

## Bug 1 — Admin toggle Ghost Mode sempre "attiva"
**File**: `app/admin/settings.tsx` riga 1061

Il toggle usa `String(val)` (stringa) invece di `val` (boolean).

_(…)_

</details>

---

## 📅 2026-03-20 (15 task)

- ✅ **#105** — Privacy Policy in 5 lingue + data ultimo aggiornamento fissa
- ✅ **#106** — Doppio consenso privacy alla registrazione (GDPR Art. 7)
- ✅ **#107** — EULA localizzato in 5 lingue nella registrazione
- ✅ **#108** — Privacy Policy accessibile dalla landing page pubblica + nota hosting
- ✅ **#109** — Tracciabilità consensi GDPR nel database
- ✅ **#110** — Export dati completo (GDPR art. 20)
- ✅ **#111** — Revoca consenso e aggiornamento testo policy
- ✅ **#112** — EAS Build — Genera APK Android
- ✅ **#113** — Fix Gradle error e rilancia build APK
- ✅ **#114** — Fix dipendenze Expo SDK 54 + build APK
- ✅ **#116** — Fix crash APK: disabilita New Arch + development build
- ✅ **#117** — Fix APK: moduli nativi + preview build
- ✅ **#118** — Audit + APK Android preview build
- ✅ **#119** — Fix matching engine — da loop continuo a trigger on-demand
- ✅ **#120** — Fix APK crash + trigger matching da frontend + verifica + Build #9

<details>
<summary>Dettaglio task</summary>

### ✅ #105 — Privacy Policy in 5 lingue + data ultimo aggiornamento fissa

_Creato: 2026-03-20 · Aggiornato: 2026-04-09 · Stato: MERGED_

# Privacy Policy in 5 lingue + data fissa

## Problema 1 — Privacy Policy solo in italiano
Il GDPR Art. 12 richiede che l'informativa sia fornita in modo
"intelligibile" nella lingua dell'utente. Attualmente esiste solo
la versione italiana in `app/privacy-policy.tsx` come

_(…)_

---

### ✅ #106 — Doppio consenso privacy alla registrazione (GDPR Art. 7)

_Creato: 2026-03-20 · Aggiornato: 2026-04-09 · Stato: MERGED_

# Doppio consenso privacy alla registrazione

## Problema
Il GDPR Art. 7(2) richiede che il consenso al trattamento dati sia
separato dall'accettazione dei termini di servizio. Non si possono
"bundlare" insieme (cosiddetto bundled consent = non valido).

_(…)_

---

### ✅ #107 — EULA localizzato in 5 lingue nella registrazione

_Creato: 2026-03-20 · Aggiornato: 2026-04-09 · Stato: MERGED_

# EULA localizzato in 5 lingue nella registrazione

## Problema
`EULA_TEXT` in `app/(auth)/register.tsx` (righe 62-98) è una stringa
hardcoded solo in italiano. Cambiando la lingua dell'app, l'EULA rimane
in italiano mentre tutto il resto si traduce.

_(…)_

---

### ✅ #108 — Privacy Policy accessibile dalla landing page pubblica + nota hosting

_Creato: 2026-03-20 · Aggiornato: 2026-04-09 · Stato: MERGED_

# Privacy Policy accessibile dalla landing page pubblica + nota hosting

## Problema 1 — Policy non raggiungibile senza login
La privacy policy esiste solo come schermata in-app (route Expo `/privacy-policy`).
Chi visita il sito pubblico (porta 5000) non può leggere la policy senza
scaricare l'app.

_(…)_

---

### ✅ #109 — Tracciabilità consensi GDPR nel database

_Creato: 2026-03-20 · Aggiornato: 2026-04-09 · Stato: MERGED_

# Tracciabilità consensi GDPR nel database

## What & Why
Il consenso alla Privacy Policy viene validato solo lato app ma non viene
salvato nel database. Questo viola il GDPR art. 7: il titolare deve poter
dimostrare che il consenso è stato prestato (onere della prova). Serve anche

_(…)_

---

### ✅ #110 — Export dati completo (GDPR art. 20)

_Creato: 2026-03-20 · Aggiornato: 2026-04-09 · Stato: MERGED_

# Export dati completo (GDPR art. 20)

## What & Why
L'endpoint `GET /api/user/export-data` attualmente esporta solo i dati
del profilo di base, con `createdAt: null` hardcoded. Il GDPR art. 20
(diritto alla portabilità) richiede che l'export contenga tutti i dati

_(…)_

---

### ✅ #111 — Revoca consenso e aggiornamento testo policy

_Creato: 2026-03-20 · Aggiornato: 2026-04-09 · Stato: MERGED_

# Revoca consenso e aggiornamento testo policy

## What & Why
Due requisiti GDPR rimasti aperti:
1. **GDPR art. 7 comma 3**: il consenso deve poter essere ritirato in
   qualsiasi momento con la stessa facilità con cui è stato prestato.

_(…)_

---

### ✅ #112 — EAS Build — Genera APK Android

_Creato: 2026-03-20 · Aggiornato: 2026-04-09 · Stato: MERGED_

# EAS Build — Genera APK Android

## What & Why
Lanciare il primo build APK Android tramite EAS Build usando le credenziali Expo dell'utente (EXPO_TOKEN). Il file eas.json e app.json sono già configurati (Task #17).

## Done looks like

_(…)_

---

### ✅ #113 — Fix Gradle error e rilancia build APK

_Creato: 2026-03-20 · Aggiornato: 2026-04-09 · Stato: MERGED_

# Fix Gradle Error e Rilancia Build APK

## What & Why
Il build EAS Android (ID: 740e5271) è fallito con `EAS_BUILD_UNKNOWN_GRADLE_ERROR`. La causa è `newArchEnabled: true` in app.json — la New React Native Architecture non è compatibile con alcuni pacchetti nativi presenti nell'app (react-native-keyboard-controller, react-native-worklets, react-native-maps).

## Done looks like

_(…)_

---

### ✅ #114 — Fix dipendenze Expo SDK 54 + build APK

_Creato: 2026-03-20 · Aggiornato: 2026-04-09 · Stato: MERGED_

# Fix Dipendenze Expo SDK 54 — Sblocca Build APK

## What & Why
Il build APK su EAS fallisce (EAS_BUILD_UNKNOWN_GRADLE_ERROR) perché diverse dipendenze native hanno versioni incompatibili con Expo SDK 54. `expo doctor` ha identificato 4 major version mismatch che rendono il codice nativo incompilabile via Gradle.

## Done looks like

_(…)_

---

### ✅ #116 — Fix crash APK: disabilita New Arch + development build

_Creato: 2026-03-20 · Aggiornato: 2026-04-09 · Stato: MERGED_

# Fix crash APK: newArchEnabled:false + development build

  ## What & Why
  L'APK crasha all'avvio sul dispositivo fisico. La causa root è un conflitto tra due librerie native:
  - `react-native-reanimated 4.x` richiede `newArchEnabled: true`
  - `react-native-keyboard-controller 1.18.5` (avvolge tutta l'app nel root layout come `KeyboardProvider`) crasha su dispositivi fisici Android con New Architecture attiva

_(…)_

---

### ✅ #117 — Fix APK: moduli nativi + preview build

_Creato: 2026-03-20 · Aggiornato: 2026-04-09 · Stato: MERGED_

# Fix moduli nativi mancanti + nuovo APK

## What & Why
Il development APK (build #7) mostra 8 errori "Cannot find native module" all'avvio sul dispositivo fisico. I moduli Expo che funzionavano in Expo Go (pre-bundled) vanno dichiarati esplicitamente nel build nativo.

Due errori confermati dagli screenshot: ExpoScreenOrientation (expo-screen-orientation) ed ExpoCamera (expo-camera). Gli altri 6 sono sconosciuti perché l'app crasha prima di mostrarli tutti.

_(…)_

---

### ✅ #118 — Audit + APK Android preview build

_Creato: 2026-03-20 · Aggiornato: 2026-04-09 · Stato: MERGED_

# Audit dipendenze + APK Android Preview Build

  ## What & Why
  Audit completo del codebase superato senza problemi critici. Tutte le dipendenze native mancanti sono già state installate (expo-camera, expo-screen-orientation, expo-file-system). Il piano aggiornato EAS è disponibile. Lanciare il build preview APK.

  ## Audit risultato (tutto OK)

_(…)_

---

### ✅ #119 — Fix matching engine — da loop continuo a trigger on-demand

_Creato: 2026-03-20 · Aggiornato: 2026-04-09 · Stato: MERGED_

Backend: sostituire il loop continuo del matching con un sistema on-demand. Nuova funzione `triggerMatchingRun()` con debounce 5min. Endpoint autenticato `POST /api/matching/trigger`. FakeZavorrina e cleanup restano su timer. Redeploy immediato → risolve admin server error.

_(…)_

---

### ✅ #120 — Fix APK crash + trigger matching da frontend + verifica + Build #9

_Creato: 2026-03-20 · Aggiornato: 2026-04-09 · Stato: MERGED_

Fix reactCompiler:true da app.json + trigger matching dopo login. STEP 1: modifiche codice. STEP 2: verifica su Expo Go (login admin + testolo1 senza crash, matching trigger nei log). STEP 3: solo se verifica OK → Build #9 EAS preview.

_(…)_

</details>

---

## 📅 2026-03-21 (6 task)

- ✅ **#121** — Fix crash Expo Go — reanimated incompatibile in splash.tsx
- ✅ **#122** — Fix AuthProvider smontato durante inizializzazione font
- ✅ **#123** — Fix ReanimatedModule NullPointerException — rimuovere react-native-keyboard-controller
- ✅ **#124** — Build #9 APK EAS preview — con --clear-cache
- ✅ **#125** — Startup sequenziale robusto — StartupGate + rimozione keyboard-controller
- ✅ **#126** — Ottimizza Metro: 3 cicli iterativi

<details>
<summary>Dettaglio task</summary>

### ✅ #121 — Fix crash Expo Go — reanimated incompatibile in splash.tsx

_Creato: 2026-03-21 · Aggiornato: 2026-04-09 · Stato: MERGED_

# Fix crash Expo Go — reanimated incompatibile

## What & Why
`splash.tsx` usa `react-native-reanimated 3.19.5`, ma Expo Go per SDK 54 ha nel bundle
una versione nativa del modulo più vecchia. Quando il JS prova a caricare `useSharedValue`,
`useAnimatedStyle` ecc., il `ReanimatedModule` nativo lancia `NullPointerException` e l'app

_(…)_

---

### ✅ #122 — Fix AuthProvider smontato durante inizializzazione font

_Creato: 2026-03-21 · Aggiornato: 2026-04-09 · Stato: MERGED_

# Fix AuthProvider smontato durante inizializzazione font

## What & Why
In `_layout.tsx` riga 163, `if (!ready) return null` smonta l'intero albero React — compresi
tutti i provider (AuthProvider, QueryClientProvider, ecc.) — mentre i font sono in caricamento.
Expo Router riesce comunque a rendere `welcome.tsx` attraverso il suo sistema interno di routing,

_(…)_

---

### ✅ #123 — Fix ReanimatedModule NullPointerException — rimuovere react-native-keyboard-controller

_Creato: 2026-03-21 · Aggiornato: 2026-04-09 · Stato: MERGED_

# Fix ReanimatedModule NullPointerException — react-native-keyboard-controller

## What & Why
`react-native-keyboard-controller` usa `react-native-reanimated` internamente.
Con la configurazione attuale (newArchEnabled: false, Expo Go), l'inizializzazione nativa di
reanimated crasha con NullPointerException ogni volta che un modulo che importa

_(…)_

---

### ✅ #124 — Build #9 APK EAS preview — con --clear-cache

_Creato: 2026-03-21 · Aggiornato: 2026-04-09 · Stato: MERGED_

# Build #9 APK EAS preview

## What & Why
Avviare la Build #9 dell'APK Android con EAS usando il profilo "preview" e --clear-cache.
Tutte le correzioni necessarie sono già applicate:
- Task #119: matching engine on-demand (no loop infinito)

_(…)_

---

### ✅ #125 — Startup sequenziale robusto — StartupGate + rimozione keyboard-controller

_Creato: 2026-03-21 · Aggiornato: 2026-04-09 · Stato: MERGED_

# Startup sequenziale robusto — StartupGate + rimozione keyboard-controller

## Sostituisce task #122 e #123

## What & Why
Due crash in Expo Go con la stessa radice: dipendenze non compatibili che si attivano

_(…)_

---

### ✅ #126 — Ottimizza Metro: 3 cicli iterativi

_Creato: 2026-03-21 · Aggiornato: 2026-04-09 · Stato: MERGED_

# Ottimizza Metro: 3 cicli iterativi

## What & Why
Metro (il bundler del frontend) viene terminato dalla memoria (OOM kill) durante l'avvio, causando crash ripetuti. Il Watchdog riesce a recuperarlo, ma il processo è instabile. L'obiettivo è rendere l'avvio stabile e riducre il consumo di RAM con tre cicli di ottimizzazione progressiva, ognuno seguito da una prova reale con log registrati.

## Done looks like

_(…)_

</details>