# Cluster task BikerLink — per giornata

> **299 task** in **37 cluster**
> Generato il: 2026-05-24T07:22:18.133Z
> Sorgente: /home/runner/workspace/inbox/bikerlink-archived-tasks.json

Ogni sezione rappresenta un cluster candidato per un post del blog.
Seleziona i cluster più significativi e scrivi il post con l'agente.

---
## 📅 2026-03-12 (8 task)

- 📋 **#1** — Sistema SOS Biker - Emergenza stradale
- ✅ **#2** — Raggio SOS visibile in rosso sulla mappa
- ✅ **#3** — Sposta tasti SOS nella tab Ride! con immagini personalizzate
- ✅ **#4** — Stile tasti SOS: rinomina, dimensioni, colori, spaziatura
- ✅ **#5** — Fix raggio SOS: rimuovi 5km, aggiungi campo personalizzato, fix Invia SOS
- ✅ **#6** — Rettifiche layout schermata iniziale: counter, header casco, ad space, SOS overlay
- ✅ **#7** — Rimuovi Accogli SOS, centra Lancia SOS, dettaglio SOS dal triangolo
- ✅ **#8** — Genera manuale d'uso BikerLink per utenti

<details>
<summary>Dettaglio task</summary>

### 📋 #1 — Sistema SOS Biker - Emergenza stradale

_Creato: 2026-03-12 · Aggiornato: 2026-04-08 · Stato: PROPOSED_

# SOS Biker Emergency System

  ## What & Why
  Add an emergency/distress system that allows any user (biker, zavorrina, coppia) to request roadside help from nearby bikers. Two helmet-shaped buttons (Shark Carbon style, signal orange) appear on the available users screen below the routes section. The left helmet has the label "SOS" underneath, the right helmet has the label "ACCOGLI SOS" underneath. The left helmet activates a distress request (with a reason input), the right helmet accepts another user's request. Accepting opens a private chat between the two users. Admin can globally enable/disable this feature.

  ## Done looks like

_(…)_

---

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

## 📅 2026-03-13 (11 task)

- ✅ **#9** — Sicurezza pre-APK: chiave sessione, token nei log, PayPal hardcoded
- ✅ **#10** — Creare e collegare email di reset password
- ✅ **#11** — Permessi Android mancanti + fotocamera iOS/Android
- 📋 **#12** — Motoclub — Backend (Schema, API, Auto-Join, Chat)
- 📋 **#13** — Motoclub — Tab Frontend (UI, Inviti, Profilo)
- 📋 **#14** — Motoclub — Pannello Admin (Approvazioni, Gestione)
- 📋 **#15** — Motoclub Admin Panel UI
- 📋 **#16** — Pulizia codice pre-produzione
- ❌ **#17** — Configurazione Build APK
- ✅ **#18** — Donazione toggle + sicurezza nickname riservati
- 📋 **#19** — GPS Gate — Restrict tabs without location permission

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

### 📋 #12 — Motoclub — Backend (Schema, API, Auto-Join, Chat)

_Creato: 2026-03-13 · Aggiornato: 2026-04-08 · Stato: PROPOSED_

# Motoclub — Backend (Schema, API, Auto-Join, Engagement)

## What & Why
Aggiungere il sistema Motoclub al backend di BikerLink. I motoclub raggruppano gli utenti in base alla marca o al modello della propria moto, creando una community pan-europea. Il backend gestisce: schema DB, lista marche/modelli pre-popolata, API CRUD, logica di auto-adesione, chat integrata, e funzionalità di engagement (statistiche club, messaggio di benvenuto, club del mese, proposte riservate ai club). Include anche l'aggiunta di `country` e `spokenLanguages` al profilo utente, necessari per i filtri geografici e linguistici dei club su scala europea.

## Done looks like

_(…)_

---

### 📋 #13 — Motoclub — Tab Frontend (UI, Inviti, Profilo)

_Creato: 2026-03-13 · Aggiornato: 2026-04-08 · Stato: PROPOSED_

# Motoclub — Tab Frontend (UI, Engagement, Proposte)

## What & Why
Creare il tab "Motoclub" nell'app BikerLink, posizionato tra "Ride!" e "Match", con icona scudo. Il tab permette a biker, zavorrine e coppie di esplorare i club per marca o modello su scala pan-europea, vedere i membri, entrare/uscire, e accedere alla chat di gruppo del club. Include funzionalità di engagement (badge profilo, statistiche, club del mese, proposte riservate) e filtri geografici e linguistici adatti a tutta Europa, non solo all'Italia.

## Done looks like

_(…)_

---

### 📋 #14 — Motoclub — Pannello Admin (Approvazioni, Gestione)

_Creato: 2026-03-13 · Aggiornato: 2026-04-08 · Stato: PROPOSED_

# Motoclub — Pannello Admin

## What & Why
Aggiungere al pannello admin di BikerLink la gestione dei motoclub: approvazione/rifiuto delle richieste di nuovi club, visualizzazione e gestione dei club esistenti (modifica, rimozione), e overview dei membri.

## Done looks like

_(…)_

---

### 📋 #15 — Motoclub Admin Panel UI

_Creato: 2026-03-13 · Aggiornato: 2026-04-08 · Stato: PROPOSED_

# Motoclub — Pannello Admin UI

## What & Why
Costruire la UI del pannello admin per la gestione dei motoclub. Gli endpoint API backend sono già pronti (approvazione/rifiuto richieste, lista club, eliminazione). Manca solo la schermata admin che li usa.

## Done looks like

_(…)_

---

### 📋 #16 — Pulizia codice pre-produzione

_Creato: 2026-03-13 · Aggiornato: 2026-04-08 · Stato: PROPOSED_

# Pulizia Codice Pre-Produzione

## What & Why
Rimuovere o isolare il codice di sviluppo che non deve andare in produzione: il seeding automatico di utenti finti (attualmente sempre attivo) e il servizio email che stampa i link solo in console (reset password, verifica email non arriva agli utenti reali).

## Done looks like

_(…)_

---

### ❌ #17 — Configurazione Build APK

_Creato: 2026-03-13 · Aggiornato: 2026-04-09 · Stato: CANCELLED_

# Configurazione Build APK (eas.json + versionCode)

  ## What & Why
  Configurare tutto il necessario per generare la prima APK Android con EAS Build. L'analisi del 20/03/2026 ha confermato: `eas.json` mancante (blocco principale), `versionCode` non dichiarato in `app.json`, tutte le icone Android presenti (adaptive icon, monochrome, splash), `google-services.json` NON necessario (nessun modulo Firebase), Package ID: `com.bikerlink.app`.

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

---

### 📋 #19 — GPS Gate — Restrict tabs without location permission

_Creato: 2026-03-13 · Aggiornato: 2026-04-08 · Stato: PROPOSED_

# GPS Gate — Restrict tabs without location permission

## What & Why
BikerLink depends entirely on GPS for matching, map, rides, and all core features. If a user denies GPS permission or disables location services after opening the app, they should only have access to **Profilo** and **Garage** tabs. All other tabs must be hidden until GPS is re-enabled. This prevents broken experiences and makes the GPS dependency explicit.

This feature is **controllable from the admin panel**: a protected toggle (`gps_required`) allows the admin to enable or disable the GPS gate. When disabled, the app works as before with all tabs always visible regardless of GPS status. When enabled, the restriction logic kicks in. Default: **enabled** (GPS required).

_(…)_

</details>

---

## 📅 2026-03-14 (4 task)

- ✅ **#20** — Mercatino Moto — Vendita moto dal garage
- 📋 **#21** — Fix crash loop avvio preview web
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

### 📋 #21 — Fix crash loop avvio preview web

_Creato: 2026-03-14 · Aggiornato: 2026-04-08 · Stato: PROPOSED_

# Fix crash loop avvio preview web

  ## What & Why
  L'app va in loop di ricaricamento continuo nella preview web di Replit. Il problema è nel LocationProvider che chiama `navigator.permissions.query({ name: "geolocation" })` all'avvio — nella preview Replit (iframe cross-origin), questa API può fallire causando un crash non catturato. Metro HMR poi ricarica la pagina, creando un loop infinito.

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

## 📅 2026-03-16 (21 task)

- 📋 **#28** — Caricamento progressivo + refresh 5 minuti
- ✅ **#29** — Script stress test 4 ore
- 📋 **#30** — Codici Invito — Schema + API Backend
- 📋 **#31** — Codici Invito — Registrazione + Pannello Admin
- 📋 **#32** — Fix avvio sequenziale Backend→Frontend
- ✅ **#33** — Monitoraggio RAM e disco in parallelo allo stress test
- ✅ **#34** — Traduzioni EN + DE con selettore lingua manuale nel profilo
- ✅ **#35** — Aggiungi lingue Spagnolo e Francese
- ✅ **#36** — Selezione paese + regione europea
- ✅ **#37** — Verifica feature, pulizia cache e riavvio
- ✅ **#38** — Fix lingua + dropdown selettore + logout prominente in profilo
- ✅ **#39** — Mass-seed europeo: distribuire utenti fake in tutta Europa
- ✅ **#40** — Fix pulsante Elimina tutti utenti fake
- 📋 **#41** — Chat di gruppo MotoClub
- 📋 **#42** — Filtro hashtag nelle chat MotoClub
- ✅ **#43** — Traduzione completa app — passata sistematica
- ✅ **#44** — Notifiche email per feedback e segnalazioni
- ✅ **#45** — Manuale utente PDF multilingue scaricabile
- ✅ **#46** — Filtro mappa per paese — Definisci Area
- ✅ **#47** — Contatori filtrati per paesi selezionati
- ✅ **#48** — Retry compilazione backend su OOM

<details>
<summary>Dettaglio task</summary>

### 📋 #28 — Caricamento progressivo + refresh 5 minuti

_Creato: 2026-03-16 · Aggiornato: 2026-04-08 · Stato: PROPOSED_

# Caricamento Progressivo + Refresh 5 Minuti

## What & Why
La schermata principale lancia 14 richieste HTTP in parallelo appena
l'utente si autentica, rallentando la comparsa della mappa e
sovraccaricando il server. Parallelamente, le query che mostrano gli

_(…)_

---

### ✅ #29 — Script stress test 4 ore

_Creato: 2026-03-16 · Aggiornato: 2026-04-09 · Stato: MERGED_

# Script stress test 4 ore

## What & Why

Creare uno script Node.js standalone (`scripts/stress-test.ts`) che gira per 4 ore simulando attività realistica su tutte le funzioni dell'app BikerLink: chat utente↔utente, chat utente↔fake-user con risposte automatiche del chatbot, mercatino moto (proposals), richieste SOS, percorsi custom, visualizzazioni profilo, cambio disponibilità/posizione.

_(…)_

---

### 📋 #30 — Codici Invito — Schema + API Backend

_Creato: 2026-03-16 · Aggiornato: 2026-04-08 · Stato: PROPOSED_

# Codici Invito — Schema + API Backend

## What & Why
L'app ha già una tabella `invitation_codes` e il backend valida il codice alla registrazione,
ma mancano il campo omaggio, le API admin per creare/gestire i codici, e il ritorno del
testo dell'omaggio al frontend dopo la registrazione.

_(…)_

---

### 📋 #31 — Codici Invito — Registrazione + Pannello Admin

_Creato: 2026-03-16 · Aggiornato: 2026-04-08 · Stato: PROPOSED_

# Codici Invito — Frontend (Registrazione + Admin)

## What & Why
Bisogna invogliare l'utente a registrarsi sul momento, davanti all'esercente che gli ha dato il QR.
Il flusso deve mostrare l'omaggio PRIMA della registrazione, col codice già inserito automaticamente,
così l'utente vede immediatamente il beneficio e completa l'iscrizione in pochi secondi.

_(…)_

---

### 📋 #32 — Fix avvio sequenziale Backend→Frontend

_Creato: 2026-03-16 · Aggiornato: 2026-04-08 · Stato: PROPOSED_

# Fix avvio sequenziale Backend→Frontend

  ## Obiettivo

  Garantire che esbuild non venga OOM-killato al riavvio dei workflow.

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

### 📋 #41 — Chat di gruppo MotoClub

_Creato: 2026-03-16 · Aggiornato: 2026-04-08 · Stato: PROPOSED_

# Chat di Gruppo MotoClub

## What & Why
Quando un utente è iscritto a un MotoClub, cliccando sulla card del club deve aprirsi la chat di gruppo. Il backend crea già automaticamente una conversazione di tipo "motoclub" al momento del join, con `conversationId` disponibile nell'API. Manca solo il collegamento lato frontend.

## Done looks like

_(…)_

---

### 📋 #42 — Filtro hashtag nelle chat MotoClub

_Creato: 2026-03-16 · Aggiornato: 2026-04-08 · Stato: PROPOSED_

# Filtro Hashtag nelle Chat MotoClub

  ## What & Why
  Nelle chat di gruppo dei MotoClub, gli utenti devono poter usare hashtag regionali (es. #veneto, #liguria) per organizzare i messaggi. Un banner di benvenuto spiega la funzionalità, un bottone filtro permette di vedere solo i messaggi con gli hashtag scelti. Un toggle opzionale aggiunge automaticamente gli hashtag attivi in fondo ad ogni messaggio inviato.

  ## Done looks like

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

## 📅 2026-03-17 (19 task)

- ✅ **#49** — Mappa centrata su regione/ultima GPS all'apertura
- ✅ **#50** — Lazy loading traduzioni i18n per lingua
- ✅ **#51** — Default paese mappa: sempre Italia
- ✅ **#52** — Selettore paese nell'header della mappa
- ✅ **#53** — Fix 3 bug: moderatore back, ads lock, garage predefinita
- 📋 **#54** — Avvio sequenziale: porte, cache, riavvio
- 📋 **#55** — Heartbeat + visibilità utenti in tempo reale
- 📋 **#56** — Fix email verifica registrazione
- 📋 **#57** — Mass seed 5000 utenti + distribuzione geografica uniforme
- 📋 **#58** — Asset Play Store (icona 512×512 + feature graphic)
- 📋 **#59** — Fix matching: brand+modello ignorato
- ✅ **#60** — Fix: tap su utente in match accettati apre profilo
- 📋 **#61** — Garage matching biker-biker
- 📋 **#62** — Nascondi match rifiutati dalla schermata
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

### 📋 #54 — Avvio sequenziale: porte, cache, riavvio

_Creato: 2026-03-17 · Aggiornato: 2026-04-08 · Stato: PROPOSED_

# Avvio sequenziale: porte, cache, riavvio

## What & Why
Applicare il protocollo operativo standard prima di procedere con qualsiasi sviluppo: verifica porte attive, pulizia cache, riavvio ordinato Backend → Frontend. Garantisce un ambiente pulito e stabile per i task successivi.

## Done looks like

_(…)_

---

### 📋 #55 — Heartbeat + visibilità utenti in tempo reale

_Creato: 2026-03-17 · Aggiornato: 2026-04-08 · Stato: PROPOSED_

# Heartbeat + Visibilità utenti in tempo reale

## What & Why
`lastLoginAt` viene aggiornato solo al login. Dopo 15 minuti senza heartbeat, ogni utente scompare da tutti i counter e liste online — anche se sta usando attivamente l'app. Questo causa tre sintomi visibili: (1) due utenti reali loggati non si vedono a vicenda, (2) in produzione nessuno compare nei counter, (3) un utente vede se stesso sulla mappa ma non nei conteggi. Parallelamente, i fake users vengono creati senza il campo `country` (sempre NULL), quindi risultano invisibili quando il filtro mappa è su `["IT"]`.

## Done looks like

_(…)_

---

### 📋 #56 — Fix email verifica registrazione

_Creato: 2026-03-17 · Aggiornato: 2026-04-30 · Stato: PROPOSED_

# Fix email verifica registrazione

## What & Why
Durante la registrazione l'email di conferma non arriva all'utente. Le credenziali in DB risultano configurate (`email_verification_enabled=true`, `gmail_user=bikerlinkapp@gmail.com`, `gmail_app_password` valorizzato; le env var `GMAIL_USER`/`GMAIL_APP_PASSWORD` non sono settate, ma il codice fa fallback corretto sul DB), eppure l'utente resta bloccato sulla schermata "verifica email". In admin non c'è nessun segnale visibile dell'errore: l'invio fallisce in silenzio nei log del server.

Sospetti principali (in ordine di probabilità, da verificare nei passi 1-3):

_(…)_

---

### 📋 #57 — Mass seed 5000 utenti + distribuzione geografica uniforme

_Creato: 2026-03-17 · Aggiornato: 2026-04-08 · Stato: PROPOSED_

# Mass seed 5000 utenti + distribuzione geografica

## What & Why
Il mass seed attuale genera ~2.420 utenti e li concentra su 49 punti fissi (una città per zona) con un offset di soli ±0.4° (~40-50km). Il risultato è che sulla mappa gli utenti appaiono ammassati in pochi cluster. Serve alzare il numero a 5.000 mantenendo le stesse proporzioni e distribuirli in modo equo su tutto il territorio europeo.

## Done looks like

_(…)_

---

### 📋 #58 — Asset Play Store (icona 512×512 + feature graphic)

_Creato: 2026-03-17 · Aggiornato: 2026-04-08 · Stato: PROPOSED_

# Logo e Asset Play Store

  ## What & Why
  Generare gli asset grafici per la pubblicazione su Google Play Store: icona alta risoluzione (512×512) e feature graphic (1024×500). L'icona attuale (1024×1024) è ottima per l'app ma il Play Store richiede un upload separato a 512×512 nella Play Console, mentre la feature graphic è il banner mostrato in cima alla scheda dell'app.

  ## Done looks like

_(…)_

---

### 📋 #59 — Fix matching: brand+modello ignorato

_Creato: 2026-03-17 · Aggiornato: 2026-04-08 · Stato: PROPOSED_

# Fix logica matching brand+modello

  ## What & Why
  Il motore di matching confronta le wishlist moto delle zavorrine con le moto dei biker usando tre blocchi `if` indipendenti: tipo, solo-brand, e brand+modello. Poiché i blocchi sono separati (non if/else if), il controllo "solo brand" viene soddisfatto per primo e imposta `compatible = true` anche quando la wish specifica anche il modello. Risultato: una zavorrina che vuole una "Ducati Monster" si accoppia con qualsiasi Ducati, ignorando il modello.

  ## Done looks like

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

### 📋 #61 — Garage matching biker-biker

_Creato: 2026-03-17 · Aggiornato: 2026-04-08 · Stato: PROPOSED_

# Garage matching biker-biker

  ## What & Why
  Attualmente il sistema di garage matching è limitato: le wishlist (moto che si vuole trovare) sono accessibili solo alle zavorrine. L'utente vuole che i biker possano anch'essi creare wishlist e ricevere match con altri biker che hanno quella moto, usando la stessa logica brand+modello > solo-brand > solo-tipo già corretta.

  Il motore di matching (`runWishlistMatching`) già processa TUTTE le wishlist contro TUTTE le moto biker senza filtrare per ruolo — basta sbloccare l'accesso e l'interfaccia.

_(…)_

---

### 📋 #62 — Nascondi match rifiutati dalla schermata

_Creato: 2026-03-17 · Aggiornato: 2026-04-08 · Stato: PROPOSED_

# Nascondi match rifiutati dalla schermata

  ## What & Why
  Su iOS, i match rifiutati rimangono visibili nella schermata Match con aspetto sbiadito (dimmed) invece di sparire. Il problema ha due cause:

  1. **Dati non filtrati**: il tab "garage" mostra `garageMatchesTagged` che include TUTTI i garage match (nuovi, accettati, rifiutati). Dopo il rifiuto, il match cambia status a "rejected" ma rimane nella lista del tab garage, dove viene renderizzato sbiadito.

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

## 📅 2026-03-18 (22 task)

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
- ❌ **#80** — Protezione utente BikerLink_Official
- ✅ **#81** — Fix crash mappa fullscreen su iOS
- ✅ **#82** — Fix definitivo crash mappa fullscreen iOS
- ✅ **#83** — Fix bug garage: isDefault moto + moto spariscono dopo logout
- ✅ **#84** — Velocizza badge nuovi messaggi
- ❌ **#85** — Fix pic!: foto degli altri utenti non visibili
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

### ❌ #80 — Protezione utente BikerLink_Official

_Creato: 2026-03-18 · Aggiornato: 2026-04-09 · Stato: CANCELLED_

# Protezione utente BikerLink_Official

## What & Why
L'utente "BikerLink_Official" è l'account ufficiale della piattaforma e deve essere intoccabile: nessun admin può eliminarlo, sospenderlo, bloccare il suo account o modificare email/password. Nessun utente normale può bloccarlo (nasconderlo dalla propria mappa).

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

### ❌ #85 — Fix pic!: foto degli altri utenti non visibili

_Creato: 2026-03-18 · Aggiornato: 2026-04-09 · Stato: CANCELLED_

# Fix pic!: foto degli altri utenti non visibili

## What & Why
Nel sistema pic! (contest settimanale), le foto caricate dagli utenti non
sono visibili agli altri partecipanti: il riquadro compare ma l'immagine è
vuota. L'utente che ha caricato la foto la vede perché l'URI locale è ancora

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

## 📅 2026-03-20 (16 task)

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
- ❌ **#115** — Fix EXPO_PUBLIC_DOMAIN nel build APK
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

### ❌ #115 — Fix EXPO_PUBLIC_DOMAIN nel build APK

_Creato: 2026-03-20 · Aggiornato: 2026-04-09 · Stato: CANCELLED_

# Fix EXPO_PUBLIC_DOMAIN nel build EAS

  ## What & Why
  L'APK Android prodotto dal build #5 mostra l'errore "EXPO_PUBLIC_DOMAIN is not set" appena avviato. In sviluppo su Replit, la variabile viene iniettata automaticamente dallo script di avvio (`$REPLIT_DEV_DOMAIN:5000`). Nel build EAS però nessuna env var viene configurata, quindi `lib/query-client.ts` lancia un errore e l'app non riesce a contattare il backend.

  La soluzione è aggiungere la variabile `EXPO_PUBLIC_DOMAIN=biker-link.replit.app` direttamente in `eas.json` per entrambi i profili `preview` e `production`, poi rilanciare il build.

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

---

## 📅 2026-03-26 (1 task)

- 📋 **#189** — EAS Build APK Android (cloud)

<details>
<summary>Dettaglio task</summary>

### 📋 #189 — EAS Build APK Android (cloud)

_Creato: 2026-03-26 · Aggiornato: 2026-03-26 · Stato: PROPOSED_

# EAS Build APK Android (cloud)

## What & Why
Pubblicare il backend BikerLink su Replit e generare l'APK Android tramite EAS Build (cloud), così l'utente può scaricare e installare l'app direttamente sul proprio dispositivo Android senza bisogno di Android Studio.

## Done looks like

_(…)_

</details>

---

## 📅 2026-03-27 (2 task)

- ❌ **#214** — EULA e Privacy Policy PDF multilingua
- ❌ **#224** — Nuovo APK --clear-cache (codice aggiornato)

<details>
<summary>Dettaglio task</summary>

### ❌ #214 — EULA e Privacy Policy PDF multilingua

_Creato: 2026-03-27 · Aggiornato: 2026-04-09 · Stato: CANCELLED_

# EULA e Privacy Policy PDF multilingua

## What & Why
L'admin panel ha una duplicazione: esiste già una sezione "Documenti PDF" per caricare/scaricare EULA e Privacy Policy, ma è presente anche una seconda sezione "Documenti Legali" con editor di testo grezzo per gli stessi documenti. Va eliminata la sezione duplicata. Inoltre vanno generati i PDF ufficiali multilingua (5 lingue) da caricare nel server.

## Done looks like

_(…)_

---

### ❌ #224 — Nuovo APK --clear-cache (codice aggiornato)

_Creato: 2026-03-27 · Aggiornato: 2026-03-27 · Stato: CANCELLED_

# Nuovo APK (--clear-cache, codice aggiornato)

## What & Why
Il precedente APK (Build #9) era stato compilato da un commit non aggiornato,
con funzionalità mancanti o non funzionanti. Serve un rebuild completo dal main
aggiornato, con cache EAS azzerata, che includa tutte le modifiche mergiate

_(…)_

</details>

---

## 📅 2026-03-28 (3 task)

- ❌ **#228** — OTA Updates — Configurazione EAS Update
- 📋 **#234** — Fix origin APK + Rebuild EAS
- ❌ **#254** — Controllo accurato sistema in Power Mode: pulizia, riavvio, verifica app

<details>
<summary>Dettaglio task</summary>

### ❌ #228 — OTA Updates — Configurazione EAS Update

_Creato: 2026-03-28 · Aggiornato: 2026-04-09 · Stato: CANCELLED_

# Configurazione OTA Updates (EAS Update)

## What & Why
Aggiungere `expo-updates` e configurare EAS Update per permettere di pubblicare aggiornamenti JavaScript all'app già installata senza ricompilare l'APK. Ogni modifica al codice JS (nuove feature, bugfix, UI) potrà essere distribuita agli utenti con un semplice comando, senza passare dal Play Store.

## Done looks like

_(…)_

---

### 📋 #234 — Fix origin APK + Rebuild EAS

_Creato: 2026-03-28 · Aggiornato: 2026-03-28 · Stato: PROPOSED_

# Fix origin APK + Rebuild EAS

## What & Why
L'APK installato crasha immediatamente con l'errore `LoadJSBundleFromFile` perché in `app.json` il plugin `expo-router` ha `origin: "https://replit.com/"`. Quando l'app gira su Replit questa è corretta, ma nell'APK standalone l'app cerca di caricare il bundle JS da quell'URL remoto invece di usare quello incorporato nell'APK — causando il crash. Va corretta prima del rebuild.

## Done looks like

_(…)_

---

### ❌ #254 — Controllo accurato sistema in Power Mode: pulizia, riavvio, verifica app

_Creato: 2026-03-28 · Aggiornato: 2026-04-09 · Stato: CANCELLED_

## Obiettivo
Controllo accurato del sistema in Power Mode: pulizia completa, riavvio da zero, verifica che l'app funzioni end-to-end (backend + Metro + preview funzionante).

## Passi

### 1. Pulizia totale

_(…)_

</details>

---

## 📅 2026-03-29 (4 task)

- ❌ **#270** — OTA obbligatoria + script push bash
- ❌ **#271** — Admin OTA: lista utenti non aggiornati + Forza OTA
- ❌ **#272** — Fix OTA: aggiornamenti rilevati ma non applicati — fix AsyncStorage timing + errori visibili
- ❌ **#284** — OTA-9: diagnostica e badge dinamico

<details>
<summary>Dettaglio task</summary>

### ❌ #270 — OTA obbligatoria + script push bash

_Creato: 2026-03-29 · Aggiornato: 2026-03-29 · Stato: CANCELLED_

# OTA obbligatoria + script push bash

## What & Why
La schermata OTA va resa bloccante: l'utente non deve poter rimandare l'aggiornamento. Il pulsante "Più tardi" va eliminato. Serve inoltre uno script bash per forzare il push OTA agli EAS server senza passare dall'interfaccia admin.

## Done looks like

_(…)_

---

### ❌ #271 — Admin OTA: lista utenti non aggiornati + Forza OTA

_Creato: 2026-03-29 · Aggiornato: 2026-03-29 · Stato: CANCELLED_

# Admin OTA: lista utenti non aggiornati + Forza OTA

## What & Why
Il pannello admin OTA deve mostrare quali utenti non hanno ancora applicato l'ultima versione OTA, con la possibilità di forzare l'aggiornamento su ogni singolo utente. La forzatura avviene tramite il sistema heartbeat già esistente: il server imposta un flag per quell'utente, e al prossimo heartbeat l'app lo legge e applica automaticamente l'aggiornamento.

## Done looks like

_(…)_

---

### ❌ #272 — Fix OTA: aggiornamenti rilevati ma non applicati — fix AsyncStorage timing + errori visibili

_Creato: 2026-03-29 · Aggiornato: 2026-04-09 · Stato: CANCELLED_

---
title: Fix meccanismo applicazione OTA — fetchUpdateAsync conflitto con checkAutomatically
---

# Fix OTA: aggiornamenti rilevati ma non applicati

_(…)_

---

### ❌ #284 — OTA-9: diagnostica e badge dinamico

_Creato: 2026-03-29 · Aggiornato: 2026-04-09 · Stato: CANCELLED_

# OTA-9 Diagnostica — Debug aggiornamenti

## What & Why

L'APK riceve le OTA ma non le applica: dopo 2 avvii non compare nessun badge versione nel tab Profilo, segno che il bundle embedded non è mai stato sostituito da quelli pubblicati via EAS Update. Bisogna diagnosticare il problema e garantire che il meccanismo funzioni.

_(…)_

</details>

---

## 📅 2026-04-01 (1 task)

- ❌ **#368** — Build APK v2: cache pulita + runtimeVersion 2.0.0 + OTA-01

<details>
<summary>Dettaglio task</summary>

### ❌ #368 — Build APK v2: cache pulita + runtimeVersion 2.0.0 + OTA-01

_Creato: 2026-04-01 · Aggiornato: 2026-04-09 · Stato: CANCELLED_

# Build APK v2 — cache pulita, GitHub sync, runtimeVersion 2.0.0 + OTA-01

  ## What & Why
  Il ciclo OTA 1.x è irrecuperabile per alcune devices (bug AsyncStorage).
  Si ricomincia da zero:
  - runtimeVersion 1.0.0 → 2.0.0 crea un taglio netto: le vecchie OTA non raggiungono

_(…)_

</details>

---

## 📅 2026-04-03 (1 task)

- ❌ **#397** — Fix Google Drive: ricollega account Bikerlinkapp e ri-carica PDF

<details>
<summary>Dettaglio task</summary>

### ❌ #397 — Fix Google Drive: ricollega account Bikerlinkapp e ri-carica PDF

_Creato: 2026-04-03 · Aggiornato: 2026-04-09 · Stato: CANCELLED_

# Fix connessione Google Drive Bikerlinkapp

## What & Why
I PDF BikerLink (manuale, EULA, privacy policy) sono stati caricati nel Drive
sbagliato perché la connessione Google Drive punta a un account personale invece
dell'account ufficiale "Bikerlinkapp". Prima di eseguire il task, l'utente deve

_(…)_

</details>

---

## 📅 2026-04-06 (1 task)

- ❌ **#401** — Fix OTA: stop race condition + build APK v5

<details>
<summary>Dettaglio task</summary>

### ❌ #401 — Fix OTA: stop race condition + build APK v5

_Creato: 2026-04-06 · Aggiornato: 2026-04-09 · Stato: CANCELLED_

# Fix OTA: checkAutomatically NEVER + APK v5

  ## What & Why
  L'app usa `checkAutomatically: "ON_LOAD"` in `app.json`, che fa scaricare automaticamente gli aggiornamenti OTA prima che il checker JavaScript possa intervenire. Questo crea una race condition: se il download finisce in meno di 2 secondi, `checkForUpdateAsync()` restituisce `isAvailable: false` (update già scaricato ma non applicato), e il passive check non lo applica. Risultato: l'app rimane ferma all'OTA precedente.

  La fix definitiva è impostare `checkAutomatically: "NEVER"` così il download automatico non parte, e il checker JS gestisce tutto in modo deterministico al 100%.

_(…)_

</details>

---

## 📅 2026-04-09 (1 task)

- ❌ **#463** — CANCELLED - Fix Spotify 403 → schermata In Arrivo (no popup errore)

<details>
<summary>Dettaglio task</summary>

### ❌ #463 — CANCELLED - Fix Spotify 403 → schermata In Arrivo (no popup errore)

_Creato: 2026-04-09 · Aggiornato: 2026-04-09 · Stato: CANCELLED_

# Fix Spotify 403 → schermata "in arrivo"

## What & Why
Quando Spotify restituisce HTTP 403 (app in Development mode, Extended Quota Mode non attiva), il frontend mostra un popup di errore brutto. Il codice ha già una schermata "Funzione in arrivo" attivabile tramite la query `spotify_coming_soon`, ma non si attiva automaticamente su questo errore.

## Done looks like

_(…)_

</details>

---

## 📅 2026-04-10 (2 task)

- ❌ **#476** — Accordion Stile Mappa e Documentazione nel profilo
- ❌ **#488** — Pulizia cache EAS + sync GitHub + backup GDrive

<details>
<summary>Dettaglio task</summary>

### ❌ #476 — Accordion Stile Mappa e Documentazione nel profilo

_Creato: 2026-04-10 · Aggiornato: 2026-04-10 · Stato: CANCELLED_

# Accordion Stile Mappa e Documentazione

## What & Why
Le sezioni "Stile Mappa" e "Documentazione" nel profilo utente devono usare lo stesso stile accordion collassabile già applicato a "La mia privacy — Altera Posizione". Questo rende il profilo più compatto e coerente visivamente.

## Done looks like

_(…)_

---

### ❌ #488 — Pulizia cache EAS + sync GitHub + backup GDrive

_Creato: 2026-04-10 · Aggiornato: 2026-04-10 · Stato: CANCELLED_

# Pulizia cache EAS + GitHub + Backup GDrive

## What & Why
Operazione di manutenzione periodica: pulizia completa delle cache EAS/Metro/Expo, sincronizzazione del codice su GitHub, e backup aggiornato del progetto su Google Drive. Il sistema OTA resta invariato — non toccare publish-ota.sh né ota-updates.json.

## Done looks like

_(…)_

</details>

---

## 📅 2026-04-11 (1 task)

- ❌ **#517** — Report azionario — profilo aggressivo breve termine

<details>
<summary>Dettaglio task</summary>

### ❌ #517 — Report azionario — profilo aggressivo breve termine

_Creato: 2026-04-11 · Aggiornato: 2026-04-11 · Stato: CANCELLED_

# Report Azionario — Profilo Aggressivo Breve Termine

## What & Why
Generare un report di ricerca azionaria completo per un investitore con profilo aggressivo e orizzonte breve termine (meno di 1 anno), con 10.000€ disponibili. Il report analizza titoli ad alto momentum nei settori AI/semiconduttori, difesa ed energia.

**Profilo investitore:**

_(…)_

</details>

---

## 📅 2026-04-14 (1 task)

- ❌ **#587** — APK v19 — New Arch obbligatoria in RN 0.83 (maps 1.27.2 + Reanimated 4.x)

<details>
<summary>Dettaglio task</summary>

### ❌ #587 — APK v19 — New Arch obbligatoria in RN 0.83 (maps 1.27.2 + Reanimated 4.x)

_Creato: 2026-04-14 · Aggiornato: 2026-04-14 · Stato: CANCELLED_

---
  title: APK v19 — fix definitivo (New Arch obbligatoria in RN 0.83, maps 1.27.2)
  ---
  # APK v19 — New Architecture è l'unica opzione

  ## Scoperta critica

_(…)_

</details>

---

## 📅 2026-04-15 (3 task)

- ❌ **#595** — Background Location — Staying Alive
- ❌ **#597** — Pallino Flottante — Widget Overlay
- ❌ **#600** — Fix: Tap club su mappa → schermata pubblica

<details>
<summary>Dettaglio task</summary>

### ❌ #595 — Background Location — Staying Alive

_Creato: 2026-04-15 · Aggiornato: 2026-04-15 · Stato: CANCELLED_

# Background Location — Staying Alive

## What & Why
Implementare il vero background location tracking con expo-task-manager: quando l'app è minimizzata, la posizione continua ad aggiornarsi sul server. Su iOS appare il "pallino" blu nella status bar (background location indicator). Su Android appare una notifica persistente (foreground service). Questo mantiene la visibilità dell'utente sulla mappa e garantisce il funzionamento di SOS anche con l'app in background.

Il tentativo precedente (Task #564) è stato rimosso perché è stato distribuito via OTA su un APK che non aveva ACCESS_BACKGROUND_LOCATION nel manifest (causa crash). Questa volta il codice deve essere scritto in modo sicuro, e il task include la modifica di app.json (che richiede una nuova build nativa per Android).

_(…)_

---

### ❌ #597 — Pallino Flottante — Widget Overlay

_Creato: 2026-04-15 · Aggiornato: 2026-04-15 · Stato: CANCELLED_

# Pallino Flottante — Widget Overlay

## What & Why
Aggiungere un widget flottante draggabile che rimane visibile sopra qualsiasi schermata dell'app. Il pallino mostra un badge con il totale dei messaggi non letti e delle notifiche (match, proposte), e al tocco apre un mini-menu contestuale. È il punto di espansione futuro per funzioni premium (GPS keep-alive, musica, ecc.).

Controllato a due livelli: l'admin può abilitarlo/disabilitarlo globalmente; se abilitato dall'admin, l'utente può scegliere se tenerlo attivo o no (opzione in fondo a "Modifica Profilo", discreta). Default: ON per entrambi.

_(…)_

---

### ❌ #600 — Fix: Tap club su mappa → schermata pubblica

_Creato: 2026-04-15 · Aggiornato: 2026-04-15 · Stato: CANCELLED_

# Fix: Tap Club su Mappa → Schermata Pubblica

## What & Why
Cliccando su un club sulla mappa appare "Club non trovato" se l'utente non è membro. Il backend blocca con un 403 chiunque non sia già iscritto al club, e il frontend mostra quell'errore generico. Poiché la mappa mostra tutti i club approvati (inclusi quelli a cui non si appartiene, per scoprirli), è necessaria una vista pubblica del club accessibile a tutti.

## Done looks like

_(…)_

</details>

---

## 📅 2026-04-17 (16 task)

- ❌ **#640** — Show a confirmation message after refreshing folder names
- 📋 **#645** — Fix Drive: quota esaurita + browse vuoto
- ❌ **#646** — MapLibre GL — Motore mappa alternativo
- ❌ **#649** — Toggle motore mappa nel pannello admin
- ❌ **#650** — Completare migrazione mappe su Leaflet
- ❌ **#652** — Pubblica OTA-71 con le modifiche UI admin backup/traduzioni
- ❌ **#653** — Invio foto in chat
- ❌ **#654** — Fix posizione X mappa fullscreen
- ❌ **#655** — Chiudi task completati + Fix X mappa + OTA-73
- ❌ **#658** — Mostra il profilo GPS scelto anche durante il tracciamento attivo
- ❌ **#659** — Permettere di cambiare il profilo GPS anche a giro già avviato
- ❌ **#660** — Aggiungere grafici di velocità e altitudine al dettaglio del giro
- ❌ **#662** — Annulla il countdown Delayed Start con un tap
- ❌ **#664** — Tocca il countdown per annullarlo
- ❌ **#665** — Override touch schermo durante Hands Off
- ❌ **#666** — Badge precisione GPS in tempo reale

<details>
<summary>Dettaglio task</summary>

### ❌ #640 — Show a confirmation message after refreshing folder names

_Creato: 2026-04-17 · Aggiornato: 2026-04-17 · Stato: CANCELLED_

# Show a confirmation message after refreshing folder names

  ## What & Why
  The "Refresh folder names" button in the Drive browser currently clears the cache silently (no visible feedback beyond the spinner disappearing). A brief success toast or inline message like "Folder names updated" would confirm to admins that the action worked.

  ## Done looks like

_(…)_

---

### 📋 #645 — Fix Drive: quota esaurita + browse vuoto

_Creato: 2026-04-17 · Aggiornato: 2026-04-17 · Stato: PROPOSED_

# Fix Drive: quota esaurita + browse vuoto

## What & Why
Il Service Account Google ha esaurito la quota di 15GB su Drive perché ogni esportazione traduzioni veniva salvata nella root del SA senza mai eliminare i file precedenti. Di conseguenza:
- L'esportazione traduzioni fallisce con "quota exceeded"
- Il browser "Scegli cartella Drive" mostra il Drive del SA (vuoto per l'admin), non il Drive personale condiviso con il SA

_(…)_

---

### ❌ #646 — MapLibre GL — Motore mappa alternativo

_Creato: 2026-04-17 · Aggiornato: 2026-04-17 · Stato: CANCELLED_

# MapLibre GL — Motore mappa alternativo

## What & Why
Aggiungere MapLibre GL come secondo motore mappa, selezionabile dall'admin tramite un toggle nel pannello "Stile Mappa". Quando l'admin sceglie MapLibre, tutti i componenti mappa dell'app usano MapLibre GL (nativo, vettoriale, fluido). Quando sceglie Leaflet, tutto rimane come ora. Questo risolve anche il bug critico esistente in RouteDetailMap dove PROVIDER_GOOGLE viene forzato su Android (crash senza API key).

## Done looks like

_(…)_

---

### ❌ #649 — Toggle motore mappa nel pannello admin

_Creato: 2026-04-17 · Aggiornato: 2026-04-17 · Stato: CANCELLED_

# Toggle motore mappa nel pannello admin

## What & Why
Dopo la migrazione a Leaflet (task #650), react-native-maps rimane compilato nell'APK ma non viene più usato di default. Invece di rimuoverlo subito (il che richiederebbe un nuovo APK), aggiungiamo un toggle nel pannello admin per scegliere il motore mappa tra Leaflet (WebView, default) e Google Maps (react-native-maps). Questo permette di passare da un motore all'altro via OTA, senza rebuild, utile per testare o fare fallback rapido in caso di problemi.

## Done looks like

_(…)_

---

### ❌ #650 — Completare migrazione mappe su Leaflet

_Creato: 2026-04-17 · Aggiornato: 2026-04-17 · Stato: CANCELLED_

# Completare migrazione mappe su Leaflet

## What & Why
Quattro componenti usano ancora react-native-maps direttamente (`MapPickerModal.native.tsx`, `TrackingMap.tsx`, `RouteDetailMap.tsx`, `RouteMap.tsx`), e tre schermate importano ancora `MapPickerModal`. L'obiettivo è migrare tutto su Leaflet via WebView, come già fatto per `InteractiveMap.tsx`, in modo da eliminare completamente la dipendenza da react-native-maps e il relativo rischio di crash per mancanza di Google Maps API key su Android.

## Done looks like

_(…)_

---

### ❌ #652 — Pubblica OTA-71 con le modifiche UI admin backup/traduzioni

_Creato: 2026-04-17 · Aggiornato: 2026-04-17 · Stato: CANCELLED_

# Pubblica OTA-71 con le modifiche UI admin backup/traduzioni

  ## What & Why
  Le modifiche frontend del Task #651 (rimozione folder picker da backup.tsx e traduzioni.tsx, label cartelle fisse) sono pronte ma non ancora distribuite agli utenti Android. Va pubblicata una OTA.

  ## Done looks like

_(…)_

---

### ❌ #653 — Invio foto in chat

_Creato: 2026-04-17 · Aggiornato: 2026-04-17 · Stato: CANCELLED_

# Invio Foto in Chat

  ## What & Why
  Aggiungere la possibilità di inviare foto nelle chat (private, di gruppo, motoclub). L'utente può scegliere un'immagine dalla galleria del telefono oppure scattarne una al volo con la fotocamera. Le foto vengono visualizzate come bolle nell'interfaccia chat.

  ## Done looks like

_(…)_

---

### ❌ #654 — Fix posizione X mappa fullscreen

_Creato: 2026-04-17 · Aggiornato: 2026-04-17 · Stato: CANCELLED_

# Fix posizione X mappa fullscreen

## What & Why
Il pulsante di chiusura (X) della mappa a schermo intero è posizionato male. Va spostato 15px più in basso e 8px più a destra.

## Done looks like

_(…)_

---

### ❌ #655 — Chiudi task completati + Fix X mappa + OTA-73

_Creato: 2026-04-17 · Aggiornato: 2026-04-17 · Stato: CANCELLED_

# Chiudi task completati + Fix #654 + OTA-73

## What & Why
Quattro task (OTA-71 #652, toggle mappa #649, migrazione Leaflet #650, foto chat #653) risultano ancora aperti ma il lavoro è già incluso nelle OTA-71 e OTA-72 già pubblicate. Vanno chiusi. Resta da fare solo il fix posizione pulsante X mappa fullscreen (#654), dopodiché si pubblica OTA-73.

## Done looks like

_(…)_

---

### ❌ #658 — Mostra il profilo GPS scelto anche durante il tracciamento attivo

_Creato: 2026-04-17 · Aggiornato: 2026-05-01 · Stato: CANCELLED_

# Mostra il profilo GPS scelto anche durante il tracciamento attivo

  ## What & Why
  Attualmente il selettore Easy/Medium/Race è visibile solo prima di avviare il giro.
  Una volta avviato il tracciamento, l'utente non vede più quale profilo è attivo.
  Sarebbe utile mostrare il nome del profilo (es. "Race · 1s") nell'infoBox o nella dashboard.

_(…)_

---

### ❌ #659 — Permettere di cambiare il profilo GPS anche a giro già avviato

_Creato: 2026-04-17 · Aggiornato: 2026-05-01 · Stato: CANCELLED_

# Permettere di cambiare il profilo GPS anche a giro già avviato

  ## What & Why
  Il profilo (Easy/Medium/Race) si sceglie solo prima di avviare il giro. 
  Se le condizioni stradali cambiano (es. si passa dall'autostrada alla città), 
  l'utente non può adattare la frequenza GPS senza fermare e riavviare il tracciamento.

_(…)_

---

### ❌ #660 — Aggiungere grafici di velocità e altitudine al dettaglio del giro

_Creato: 2026-04-17 · Aggiornato: 2026-05-01 · Stato: CANCELLED_

# Aggiungere grafici di velocità e altitudine al dettaglio del giro

  ## What & Why
  I RecordCard mostrano statistiche aggregate (media, max) ma non c'è nessun grafico 
  che mostri l'andamento di velocità e altitudine nel tempo. I punti GPS sono già 
  salvati in DB e potrebbero alimentare un grafico lineare.

_(…)_

---

### ❌ #662 — Annulla il countdown Delayed Start con un tap

_Creato: 2026-04-17 · Aggiornato: 2026-04-17 · Stato: CANCELLED_

# Annulla il countdown Delayed Start con un tap

  ## What & Why
  Attualmente, una volta avviato il countdown del Delayed Start, non c'è modo di annullarlo se l'utente cambia idea. Serve un pulsante "Annulla" visibile durante il conto alla rovescia.

  ## Done looks like

_(…)_

---

### ❌ #664 — Tocca il countdown per annullarlo

_Creato: 2026-04-17 · Aggiornato: 2026-04-17 · Stato: CANCELLED_

# Tocca il countdown per annullarlo

  ## What & Why
  Quando il countdown è attivo (5, 4, 3…) non c'è modo di annullarlo se ci si pente. Un tap sull'overlay del countdown dovrebbe cancellarlo e riportare alla schermata di avvio.

  ## Done looks like

_(…)_

---

### ❌ #665 — Override touch schermo durante Hands Off

_Creato: 2026-04-17 · Aggiornato: 2026-04-17 · Stato: CANCELLED_

# Override touch schermo durante Hands Off

  ## What & Why
  Quando "Hands Off" è attivo e la velocità supera la soglia, lo schermo non risponde ai tocchi. Ma se l'utente ha un'emergenza e vuole fermare il tracciamento, non può farlo. Serve un meccanismo di sblocco (es. pressione lunga 2 secondi sull'overlay).

  ## Done looks like

_(…)_

---

### ❌ #666 — Badge precisione GPS in tempo reale

_Creato: 2026-04-17 · Aggiornato: 2026-04-17 · Stato: CANCELLED_

# Badge precisione GPS in tempo reale

## What & Why
Il tab Performance Counter deve mostrare in cima, sempre visibile, la qualità del segnale GPS ricevuto. Il dato viene già fornito da `expo-location` nel campo `coords.accuracy` (raggio di incertezza in metri) per ogni aggiornamento di posizione, ma attualmente viene scartato. Si tratta di un'informazione utile al pilota per capire quanto siano affidabili velocità, distanza e quota rilevate.

## Done looks like

_(…)_

</details>

---

## 📅 2026-04-18 (29 task)

- ❌ **#677** — Calibrazione e confronto accuracy GPS in tempo reale
- ❌ **#679** — Mostra la mappa del percorso anche nel dettaglio di ogni uscita salvata
- ❌ **#680** — Ottimizzare gli aggiornamenti della mappa per gite molto lunghe
- ❌ **#684** — Reset automatico modalità 0-100 se la misurazione si blocca
- ❌ **#685** — Animazione pulsante sulla velocità durante il VIA! (0-100)
- ❌ **#686** — Mostra il tempo trascorso in tempo reale durante la misurazione 0-100
- ❌ **#688** — Mostra schermata risultato dopo il completamento 0-100
- ❌ **#690** — Avvisa l'utente se la sessione non si è salvata correttamente
- ❌ **#691** — Rendi il blocco tocchi durante Hands-Off più robusto e preciso
- ❌ **#693** — Guida utente: abilitare 'Sempre' per GPS in background (opzionale)
- ❌ **#697** — Mostra semaforo GPS prima di avviare un giro
- ❌ **#699** — Mostra una dashboard degli errori GPS nel pannello admin
- ❌ **#701** — Mostra nel profilo l'OTA attiva letta da expo-updates (non hardcoded)
- ❌ **#703** — Audit completo di tutte le chiamate watchPositionAsync nell'app
- ❌ **#704** — Prevent accidental re-introduction of duplicate OTA constants
- ❌ **#709** — Verifica che il crash all'avvio sia risolto — analisi beacon OTA-96
- ❌ **#711** — Fermare il watcher GPS di sistema durante il tracciamento attivo
- ❌ **#712** — Automatically delete orphaned routes directly from the database on a schedule
- ❌ **#714** — Stop layout watcher durante tracking attivo
- ❌ **#715** — Cleanup rotte GPS orfane al riavvio tracking
- ❌ **#722** — Reintrodurre il GPS nel cronometro (OTA-103)
- ❌ **#723** — Reintrodurre la mappa Leaflet nel cronometro (OTA-104+)
- ❌ **#724** — Reintrodurre sensori, background tracking, salvataggio giro e musica
- ❌ **#729** — Show speed and distance in preferred units on ride detail and public route screens
- ❌ **#730** — Let users enter the hands-off speed threshold in their preferred unit
- ❌ **#731** — Show speed in preferred units during live ride tracking
- ❌ **#732** — Apply preferred units to other users' public profiles and shared route views
- ❌ **#738** — Ricalibra G anche in modalità 0-100 sprint
- ❌ **#739** — Sincronizza i giri recuperati con il server dopo il recupero offline

<details>
<summary>Dettaglio task</summary>

### ❌ #677 — Calibrazione e confronto accuracy GPS in tempo reale

_Creato: 2026-04-18 · Aggiornato: 2026-05-01 · Stato: CANCELLED_

# Calibrazione e confronto accuracy GPS in tempo reale

  ## What & Why
  Il profilo ora permette di scegliere 5 livelli di precisione GPS, ma l'utente non ha feedback visivo sull'accuracy effettiva ricevuta dal dispositivo in ciascuna modalità. Un pannello di diagnostica GPS aiuterebbe a scegliere il livello giusto e a capire perché la velocità può risultare 0 in certi contesti.

  ## Done looks like

_(…)_

---

### ❌ #679 — Mostra la mappa del percorso anche nel dettaglio di ogni uscita salvata

_Creato: 2026-04-18 · Aggiornato: 2026-05-01 · Stato: CANCELLED_

# Mostra la mappa del percorso anche nel dettaglio di ogni uscita salvata

  ## What & Why
  Al momento la mappa GPS live è visibile solo durante il tracking attivo. Una volta finita la sessione, l'utente non può rivedere il percorso fatto su mappa. Aggiungere la mappa nel dettaglio dell'uscita (ride history) renderebbe il feature completo e molto più utile.

  ## Done looks like

_(…)_

---

### ❌ #680 — Ottimizzare gli aggiornamenti della mappa per gite molto lunghe

_Creato: 2026-04-18 · Aggiornato: 2026-05-01 · Stato: CANCELLED_

# Ottimizzare gli aggiornamenti della mappa per gite molto lunghe

  ## What & Why
  Attualmente, ogni volta che arriva un fix GPS durante il tracking, il componente TrackingMap riceve l'array completo di tutti i punti accumulati. Su gite lunghe (2-3 ore a 1 fix/secondo) questo array può arrivare a migliaia di elementi, causando un payload JSON molto grande ad ogni update. Questo può rallentare la mappa su dispositivi meno potenti.

  ## Done looks like

_(…)_

---

### ❌ #684 — Reset automatico modalità 0-100 se la misurazione si blocca

_Creato: 2026-04-18 · Aggiornato: 2026-04-18 · Stato: CANCELLED_

# Reset automatico modalità 0-100 se la misurazione si blocca

  ## What & Why
  Se l'utente attiva il 0-100 ma non parte (o GPS perde segnale), il countdown scatta ma poi rimane bloccato in fase "waiting" per sempre. Aggiungere un timeout automatico (es. 3 minuti) che resetta la fase sprint e avvisa l'utente, evitando che il tracciamento rimanga in uno stato inconsistente.

  ## Done looks like

_(…)_

---

### ❌ #685 — Animazione pulsante sulla velocità durante il VIA! (0-100)

_Creato: 2026-04-18 · Aggiornato: 2026-04-18 · Stato: CANCELLED_

# Animazione pulsante sulla velocità durante il VIA! (0-100)

  ## What & Why
  Il pannello velocità mostrato durante la fase di misura 0-100 km/h è statico. Aggiungere un'animazione pulsante al numero di velocità (e/o al badge VIA!) durante la fase "measuring" renderebbe il pannello più dinamico e coinvolgente durante la corsa.

  ## Done looks like

_(…)_

---

### ❌ #686 — Mostra il tempo trascorso in tempo reale durante la misurazione 0-100

_Creato: 2026-04-18 · Aggiornato: 2026-04-18 · Stato: CANCELLED_

# Mostra il tempo trascorso in tempo reale durante la misurazione 0-100

  ## What & Why
  Durante la fase "measuring" del pannello velocità 0-100, l'utente non vede quanto tempo è passato dall'inizio dello sprint. Aggiungere un cronometro live (es. "1.34s...") sotto il valore velocità darebbe un feedback immediato sulla prestazione in corso.

  ## Done looks like

_(…)_

---

### ❌ #688 — Mostra schermata risultato dopo il completamento 0-100

_Creato: 2026-04-18 · Aggiornato: 2026-04-18 · Stato: CANCELLED_

# Mostra schermata risultato dopo il completamento 0-100

  ## What & Why
  Quando la misurazione 0-100 km/h termina, il tempo risultante appare nello
  SprintDashboard ma l'utente riceve un feedback visivo minimo. Aggiungere una
  schermata risultato dedicata (overlay o card) che mostri chiaramente il tempo

_(…)_

---

### ❌ #690 — Avvisa l'utente se la sessione non si è salvata correttamente

_Creato: 2026-04-18 · Aggiornato: 2026-04-18 · Stato: CANCELLED_

# Avvisa l'utente se la sessione non si è salvata correttamente

  ## What & Why
  Quando la chiamata API di stop del tracking fallisce (errore di rete o server),
  l'utente vede solo un generico "Errore nel completamento della sessione" e l'app
  torna allo schermo di Start — ma la sessione sul backend rimane aperta e i dati

_(…)_

---

### ❌ #691 — Rendi il blocco tocchi durante Hands-Off più robusto e preciso

_Creato: 2026-04-18 · Aggiornato: 2026-04-18 · Stato: CANCELLED_

# Rendi il blocco tocchi durante Hands-Off più robusto e preciso

  ## What & Why
  Attualmente la ScrollView principale usa `pointerEvents={handsOffActive ? "none" : "auto"}`,
  il che blocca TUTTI i tocchi sull'intera schermata quando Hands-Off è attivo.
  Questo pattern ha già causato un bug grave (pulsante Start irraggiungibile dopo

_(…)_

---

### ❌ #693 — Guida utente: abilitare 'Sempre' per GPS in background (opzionale)

_Creato: 2026-04-18 · Aggiornato: 2026-04-18 · Stato: CANCELLED_

# Guida utente: abilitare 'Sempre' per GPS in background

  ## What & Why
  Con OTA-91, la richiesta del permesso background GPS è stata rimossa dall'avvio del tracking per non bloccare l'utente. Tuttavia, senza il permesso "Sempre", il tracking si interrompe quando lo schermo si spegne. Sarebbe utile mostrare una guida contestuale (es. banner o modale) che spiega come abilitare il permesso background GPS nelle impostazioni, attivata solo quando l'utente esplicitamente va in background (AppState change) e il permesso non è concesso.

  ## Done looks like

_(…)_

---

### ❌ #697 — Mostra semaforo GPS prima di avviare un giro

_Creato: 2026-04-18 · Aggiornato: 2026-04-18 · Stato: CANCELLED_

# Mostra semaforo GPS prima di avviare un giro

  ## What & Why
  Dopo il fix del crash OTA-92, l'utente vede il pulsante Start anche quando il GPS non è ancora agganciato. Avviare un giro con GPS scarso può produrre tracciati imprecisi o un errore "GPS non disponibile". Un semaforo visivo (Ottimo/Buono/Scarso) sulla schermata di tracciamento prima di premere Start aiuterebbe l'utente ad aspettare il segnale sufficiente.

  ## Done looks like

_(…)_

---

### ❌ #699 — Mostra una dashboard degli errori GPS nel pannello admin

_Creato: 2026-04-18 · Aggiornato: 2026-04-18 · Stato: CANCELLED_

# Mostra una dashboard degli errori GPS nel pannello admin

  ## What & Why
  Attualmente gli errori GPS vengono loggati sul server e inviati via email. Non c'è un modo rapido per vedere la lista e la frequenza degli errori direttamente nell'app admin senza dover leggere le email.

  ## Done looks like

_(…)_

---

### ❌ #701 — Mostra nel profilo l'OTA attiva letta da expo-updates (non hardcoded)

_Creato: 2026-04-18 · Aggiornato: 2026-04-18 · Stato: CANCELLED_

# Mostra nel profilo l'OTA attiva letta da expo-updates (non hardcoded)

  ## What & Why
  CURRENT_OTA_NUMBER è ancora un valore hardcoded in profile.tsx che deve essere aggiornato manualmente prima di ogni OTA. Il check automatico (ota-guard) avvisa se dimentica, ma il valore rimane duplicato tra profile.tsx e ota-updates.json.

  Un'alternativa più robusta: leggere il numero OTA direttamente dall'updateId di expo-updates (Updates.updateId) e fare un lookup nel registro ota-updates.json servito dall'API, eliminando la costante hardcoded.

_(…)_

---

### ❌ #703 — Audit completo di tutte le chiamate watchPositionAsync nell'app

_Creato: 2026-04-18 · Aggiornato: 2026-04-18 · Stato: CANCELLED_

# Audit completo watchPositionAsync nell'app

  ## What & Why
  Tre OTA consecutive (91, 92, 93) sono state necessarie per correggere crash causati da watchPositionAsync non protetto. Ogni fix è stato chirurgico su un punto specifico scoperto dopo il crash. Non è mai stato fatto un audit sistematico di *tutte* le chiamate watchPositionAsync nell'intera codebase, né in altri file oltre tracking.tsx.

  ## Done looks like

_(…)_

---

### ❌ #704 — Prevent accidental re-introduction of duplicate OTA constants

_Creato: 2026-04-18 · Aggiornato: 2026-04-18 · Stato: CANCELLED_

# Prevent accidental re-introduction of duplicate OTA constants

  ## What & Why
  Now that `CURRENT_OTA_NUMBER` lives exclusively in `lib/ota.ts`, there is no automated check that prevents a developer (or agent) from accidentally defining the constant again in another file (e.g. a copy-paste into a new screen). The existing `scripts/validate-ota.sh` validates that the number matches `ota-updates.json`, but does not verify that the constant is defined in only one place.

  ## Done looks like

_(…)_

---

### ❌ #709 — Verifica che il crash all'avvio sia risolto — analisi beacon OTA-96

_Creato: 2026-04-18 · Aggiornato: 2026-05-01 · Stato: CANCELLED_

# Verifica che il crash all'avvio sia risolto — analisi beacon OTA-96

  ## Cosa & Perché
  OTA-96 ha introdotto beacon diagnostici in startTracking (watchPositionResolved, onNativeLocation:error) e reso accessibile il POST /api/admin/client-error. Dopo che gli utenti ricevono l'aggiornamento, i log di produzione devono mostrare il punto esatto del crash per confermare che sia risolto o per localizzare un crash residuo.

  ## Done looks like

_(…)_

---

### ❌ #711 — Fermare il watcher GPS di sistema durante il tracciamento attivo

_Creato: 2026-04-18 · Aggiornato: 2026-04-18 · Stato: CANCELLED_

# Fermare il watcher GPS di sistema durante il tracciamento attivo

  ## Cosa & Perché
  Quando l'utente inizia a registrare un giro, nell'app sono attivi SIMULTANEAMENTE:
  - Il watcher GPS di _layout.tsx (Accuracy.Balanced, ogni 30s — aggiorna la posizione sulla mappa)
  - Il watcher GPS di tracking.tsx (Accuracy.High, ogni 15s — registra il percorso)

_(…)_

---

### ❌ #712 — Automatically delete orphaned routes directly from the database on a schedule

_Creato: 2026-04-18 · Aggiornato: 2026-04-18 · Stato: CANCELLED_

# Automatically delete orphaned routes from the database on a schedule

  ## What & Why
  The current cleanup only hides orphaned routes from the GET /api/routes response and cleans them up client-side on next startTracking. Orphaned routes (created before a crash, with totalDistanceKm=0 and no GPS points) remain permanently in the database. A server-side background job or periodic cleanup would remove them from storage entirely, keeping the DB clean.

  ## Done looks like

_(…)_

---

### ❌ #714 — Stop layout watcher durante tracking attivo

_Creato: 2026-04-18 · Aggiornato: 2026-04-18 · Stato: CANCELLED_

# Stop layout watcher durante tracking attivo

## What & Why
Il watcher GPS nativo in `_layout.tsx` (`startNativeWatcher`) aggiorna continuamente la posizione globale dell'utente. Quando la schermata di tracking è attiva, questo watcher entra in conflitto con il watcher di tracking in `tracking.tsx`: entrambi chiedono aggiornamenti GPS in parallelo, sprecando batteria e potenzialmente causando race condition sullo stato della posizione.

La soluzione è sospendere il native watcher di `_layout.tsx` per tutta la durata di una sessione di tracking attiva, e riprenderlo alla fine.

_(…)_

---

### ❌ #715 — Cleanup rotte GPS orfane al riavvio tracking

_Creato: 2026-04-18 · Aggiornato: 2026-04-18 · Stato: CANCELLED_

# Cleanup rotte GPS orfane al riavvio tracking

## What & Why
Quando la schermata di tracking viene chiusa bruscamente (crash, home button, cambio tab), possono rimanere task di background GPS (`BG_LOCATION_TASK`) e subscription `watchPositionAsync` non terminati. OTA-97 ha già aggiunto una difesa in `startTracking`, ma non gestisce i punti GPS in sospeso sul server (route create ma mai concluse) né pulisce eventuali sessioni zombie nel DB.

## Done looks like

_(…)_

---

### ❌ #722 — Reintrodurre il GPS nel cronometro (OTA-103)

_Creato: 2026-04-18 · Aggiornato: 2026-04-18 · Stato: CANCELLED_

# Reintrodurre il GPS nel cronometro (OTA-103)

  ## What & Why
  Dopo aver verificato che il tab "Registra giro" non crasha più con il cronometro minimale (OTA-102), il primo passo del rebuild incrementale è aggiungere il tracciamento GPS in foreground per misurare distanza percorsa e velocità durante il cronometro. Questo è il primo dei 6 step di reintroduzione pianificati.

  ## Done looks like

_(…)_

---

### ❌ #723 — Reintrodurre la mappa Leaflet nel cronometro (OTA-104+)

_Creato: 2026-04-18 · Aggiornato: 2026-04-18 · Stato: CANCELLED_

# Reintrodurre la mappa Leaflet nel cronometro

  ## What & Why
  Dopo OTA-103 (GPS), aggiungere la mappa Leaflet (TrackingMap) per mostrare la traccia del giro in tempo reale. Step incrementale del rebuild della schermata di tracking.

  ## Done looks like

_(…)_

---

### ❌ #724 — Reintrodurre sensori, background tracking, salvataggio giro e musica

_Creato: 2026-04-18 · Aggiornato: 2026-04-18 · Stato: CANCELLED_

# Reintrodurre sensori, background tracking, salvataggio giro e musica

  ## What & Why
  Step finali del rebuild della schermata "Registra giro", da fare uno alla volta dopo che mappa+GPS sono confermati stabili:

  1. **OTA-105 — sensori**: `expo-sensors` / DeviceMotion per accelerazione e inclinazione.

_(…)_

---

### ❌ #729 — Show speed and distance in preferred units on ride detail and public route screens

_Creato: 2026-04-18 · Aggiornato: 2026-04-18 · Stato: CANCELLED_

# Show speed and distance in preferred units on ride detail and public route screens

  ## What & Why
  The tracking screen now respects unit preferences, but several other screens still
  hardcode "km/h" and "km" regardless of the user's settings:
  - `app/route/[id].tsx` — ride detail page (avgSpeedKmh, maxSpeedKmh, totalDistanceKm)

_(…)_

---

### ❌ #730 — Let users enter the hands-off speed threshold in their preferred unit

_Creato: 2026-04-18 · Aggiornato: 2026-04-18 · Stato: CANCELLED_

# Let users enter the hands-off speed threshold in their preferred unit

  ## What & Why
  The tracking screen has a "hands-off" mode where the screen locks when speed
  exceeds a threshold the user types in (default 50). This input is always shown
  as "km/h" even when the user has selected mph or knots in their profile. Users

_(…)_

---

### ❌ #731 — Show speed in preferred units during live ride tracking

_Creato: 2026-04-18 · Aggiornato: 2026-04-18 · Stato: CANCELLED_

# Show speed in preferred units during live ride tracking

  ## What & Why
  Task #728 applied unit preferences to history and statistics screens. The live tracking screen (app/(tabs)/tracking.tsx) still shows current speed, max speed, average speed, and distance in hardcoded km and km/h during an active ride. Users who prefer miles or knots should see consistent units across all parts of the app.

  ## Done looks like

_(…)_

---

### ❌ #732 — Apply preferred units to other users' public profiles and shared route views

_Creato: 2026-04-18 · Aggiornato: 2026-04-18 · Stato: CANCELLED_

# Apply preferred units to other users' public profiles and shared route views

  ## What & Why
  Task #728 applied unit preferences to the logged-in user's own statistics screen. When viewing another biker's public profile or a shared route (published to the feed), distances and speeds are still displayed in hardcoded km/km/h. Users who prefer miles or knots see inconsistent units.

  ## Done looks like

_(…)_

---

### ❌ #738 — Ricalibra G anche in modalità 0-100 sprint

_Creato: 2026-04-18 · Aggiornato: 2026-05-01 · Stato: CANCELLED_

# Ricalibra G anche in modalità 0-100 sprint

  ## What & Why
  Il pulsante "Ricalibra" è attualmente visibile solo nella stats grid normale.
  Quando l'utente usa la modalità 0-100, le card G (G istantaneo, G max accel, G max frenata)
  nella sezione sprint non hanno il pulsante di ricalibrazione. Se il telefono viene

_(…)_

---

### ❌ #739 — Sincronizza i giri recuperati con il server dopo il recupero offline

_Creato: 2026-04-18 · Aggiornato: 2026-05-01 · Stato: CANCELLED_

# Sincronizza i giri recuperati con il server dopo il recupero offline

  ## What & Why
  Quando l'utente sceglie "Recupera" un giro interrotto, i dati rimangono solo in memoria locale
  (come da spec attuale). I giri recuperati non vengono creati come route sul server e quindi non
  compaiono nella cronologia persistente. Un utente che chiude e riapre l'app perde i dati recuperati.

_(…)_

</details>

---

## 📅 2026-04-19 (11 task)

- ❌ **#741** — Mostra la mappa del percorso anche nei giri condivisi su Pic!
- ❌ **#744** — Rimuovere il badge BETA dai sensori G quando confermati stabili
- ❌ **#748** — Aggiungere link alla Privacy Policy direttamente nell'app
- ❌ **#749** — Build AAB per pubblicazione Play Store (Google richiede formato bundle)
- ❌ **#755** — Scegliere la visibilità del percorso al momento della creazione
- ❌ **#756** — Mostra il nome del giro nella lista dei percorsi completati
- ❌ **#757** — Rinominare un giro precedente dalla lista dei percorsi
- ❌ **#760** — Build and release APK with volume-button Hands-Off support
- 📋 **#763** — Admin toggle — Abilita uso sensori telefono
- ❌ **#764** — Build APK v30 + AAB + iOS insieme per il Play Store e App Store
- ❌ **#768** — Build APK v30 + AAB + iOS per distribuzione

<details>
<summary>Dettaglio task</summary>

### ❌ #741 — Mostra la mappa del percorso anche nei giri condivisi su Pic!

_Creato: 2026-04-19 · Aggiornato: 2026-04-19 · Stato: CANCELLED_

# Mostra la mappa del percorso anche nei giri condivisi su Pic!

  ## What & Why
  Quando un utente pubblica un giro su Pic!, le statistiche vengono condivise ma non la mappa del percorso. Aggiungere una preview della mappa nel post aumenterebbe l'engagement e farebbe capire meglio il tragitto.

  ## Done looks like

_(…)_

---

### ❌ #744 — Rimuovere il badge BETA dai sensori G quando confermati stabili

_Creato: 2026-04-19 · Aggiornato: 2026-04-19 · Stato: CANCELLED_

# Promuovere i sensori G da BETA a stabile

  ## What & Why
  Il toggle "Sensori telefono (G)" è stato rilasciato con badge BETA e default OFF per
  sicurezza (OTA-112). Dopo aver raccolto feedback dagli utenti, se i sensori funzionano
  senza freeze, rimuovere il badge BETA, portare il default a ON, e considerare di far

_(…)_

---

### ❌ #748 — Aggiungere link alla Privacy Policy direttamente nell'app

_Creato: 2026-04-19 · Aggiornato: 2026-04-19 · Stato: CANCELLED_

# Aggiungere link alla Privacy Policy nell'app

  ## What & Why
  La Privacy Policy è ora disponibile all'URL /privacy sul server, ma non è raggiungibile dall'interno dell'app.
  Google Play e Apple richiedono che la privacy policy sia accessibile direttamente in-app (non solo via URL esterno).
  Va aggiunto un link nella schermata delle impostazioni e/o nella schermata di registrazione/accettazione EULA.

_(…)_

---

### ❌ #749 — Build AAB per pubblicazione Play Store (Google richiede formato bundle)

_Creato: 2026-04-19 · Aggiornato: 2026-04-19 · Stato: CANCELLED_

# Build AAB (Android App Bundle) per Play Store

  ## What & Why
  La guida di submission (docs/playstore-submission-guide.md) utilizza l'APK EAS attuale (versionCode 29).
  Google Play accetta APK ma per la pubblicazione pubblica raccomanda fortemente AAB (Android App Bundle):
  è il formato obbligatorio per le nuove app dal 2021 e consente ottimizzazioni di dimensione per gli utenti.

_(…)_

---

### ❌ #755 — Scegliere la visibilità del percorso al momento della creazione

_Creato: 2026-04-19 · Aggiornato: 2026-05-01 · Stato: CANCELLED_

# Scegliere la visibilità del percorso al momento della creazione

  ## What & Why
  Al momento, i nuovi percorsi vengono sempre creati come "Pubblico" per default. L'utente dovrebbe poter scegliere Pubblico/Amici/Privato già in fase di creazione, senza dover tornare nella lista dei percorsi per cambiare la visibilità.

  ## Done looks like

_(…)_

---

### ❌ #756 — Mostra il nome del giro nella lista dei percorsi completati

_Creato: 2026-04-19 · Aggiornato: 2026-04-19 · Stato: CANCELLED_

# Mostra il nome del giro nella lista dei percorsi completati

  ## What & Why
  Con il Task #754 è possibile assegnare un nome al giro alla fine. Però il componente `RecordCard` in `app/(tabs)/tracking.tsx` non mostra il titolo nella lista dei giri completati — l'utente non vede il nome che ha scelto a meno che non apra il dettaglio.

  ## Done looks like

_(…)_

---

### ❌ #757 — Rinominare un giro precedente dalla lista dei percorsi

_Creato: 2026-04-19 · Aggiornato: 2026-04-19 · Stato: CANCELLED_

# Rinominare un giro precedente dalla lista dei percorsi

  ## What & Why
  Con il Task #754 l'utente può assegnare un nome solo appena finisce il giro. Se vuole rinominare un giro salvato in precedenza, non c'è modo di farlo. Sarebbe utile poter toccare il titolo di un giro nella lista e modificarlo.

  ## Done looks like

_(…)_

---

### ❌ #760 — Build and release APK with volume-button Hands-Off support

_Creato: 2026-04-19 · Aggiornato: 2026-04-19 · Stato: CANCELLED_

# Build and release APK with volume-button Hands-Off support

  ## What & Why
  Task #759 added `react-native-volume-manager` (a native module) to enable dismissing the Hands-Off overlay with 5 quick volume-down presses. Because this package contains native Android code, it cannot be shipped via OTA — a new APK build is required for the feature to reach users.

  ## Done looks like

_(…)_

---

### 📋 #763 — Admin toggle — Abilita uso sensori telefono

_Creato: 2026-04-19 · Aggiornato: 2026-04-19 · Stato: PROPOSED_

# Admin Toggle — Sensori Telefono

## What & Why
Aggiungere un toggle nel pannello admin "Abilita uso sensori telefono" che controlla la visibilità del tasto "Usa sensori telefono" nella schermata "Registra giro e performance". Se disabilitato dall'admin, il tasto sparisce completamente per tutti gli utenti.

## Done looks like

_(…)_

---

### ❌ #764 — Build APK v30 + AAB + iOS insieme per il Play Store e App Store

_Creato: 2026-04-19 · Aggiornato: 2026-04-19 · Stato: CANCELLED_

# Build APK v30 + AAB + iOS per distribuzione

  ## What & Why
  L'utente vuole fare 2 prove sull'app (OTA 118 già pubblicata) e poi buildare APK v30 + AAB + iOS insieme. Questo è il prossimo passo pianificato dopo il completamento del task #762.

  ## Done looks like

_(…)_

---

### ❌ #768 — Build APK v30 + AAB + iOS per distribuzione

_Creato: 2026-04-19 · Aggiornato: 2026-05-01 · Stato: CANCELLED_

# Build APK v30 + AAB + iOS

  ## What & Why
  L'APK corrente è la v29. Dopo i task #765 e #766 è il momento di produrre una nuova build nativa che includa tutte le ultime modifiche (toggle sensori G-force, importazione playlist da chat).

  ## Done looks like

_(…)_

</details>

---

## 📅 2026-04-20 (7 task)

- ❌ **#775** — Prevent the rest of the Music tab from re-rendering when the search bar updates
- 📋 **#786** — Pubblica OTA-127
- ❌ **#790** — Attivare le nuove funzioni backend in produzione
- ❌ **#794** — Keep the app protected as dependencies update over time
- ❌ **#801** — Verifica login admin su biker-link.replit.app dopo il deploy
- ❌ **#803** — Invia BikerLink all'App Store: build iOS + submission
- ❌ **#804** — View OTA update errors in the admin panel

<details>
<summary>Dettaglio task</summary>

### ❌ #775 — Prevent the rest of the Music tab from re-rendering when the search bar updates

_Creato: 2026-04-20 · Aggiornato: 2026-04-20 · Stato: CANCELLED_

# Prevent re-renders from the search input in the Music tab

  ## What & Why
  Similar to the Last.fm form fix, the search input state (searchInput, debouncedQuery) lives in the top-level MusicScreen component. Every keystroke in the search bar triggers a full re-render of MusicScreen and all its children. Extracting the search bar into its own memoized component with local state would reduce re-renders significantly on low-end devices.

  ## Done looks like

_(…)_

---

### 📋 #786 — Pubblica OTA-127

_Creato: 2026-04-20 · Aggiornato: 2026-04-20 · Stato: PROPOSED_

# Pubblica OTA-127

## What & Why
Pubblicare l'aggiornamento OTA-127 per distribuire le modifiche correnti agli utenti Android con APK v29 installato.

## Done looks like

_(…)_

---

### ❌ #790 — Attivare le nuove funzioni backend in produzione

_Creato: 2026-04-20 · Aggiornato: 2026-05-01 · Stato: CANCELLED_

# Attivare le nuove funzioni backend in produzione

  ## What & Why
  Diversi endpoint aggiunti nelle ultime sessioni (Clear Last.fm cache admin, export Privacy Policy PDF, OAuth Last.fm) non sono ancora attivi sulla versione pubblicata dell'app. Gli utenti in produzione non ne beneficiano.

  ## Done looks like

_(…)_

---

### ❌ #794 — Keep the app protected as dependencies update over time

_Creato: 2026-04-20 · Aggiornato: 2026-05-01 · Stato: CANCELLED_

# Periodic security audit automation

  ## What & Why
  After resolving all vulnerabilities with npm overrides, the overrides may drift as upstream packages are updated. There is no automated check to alert when new vulnerabilities appear or when overrides can be removed (because the upstream packages have been fixed natively).

  ## Done looks like

_(…)_

---

### ❌ #801 — Verifica login admin su biker-link.replit.app dopo il deploy

_Creato: 2026-04-20 · Aggiornato: 2026-04-20 · Stato: CANCELLED_

# Verifica login admin su biker-link.replit.app dopo il deploy

  ## What & Why
  Dopo il deploy del backend (Task #800), è necessario verificare manualmente (o tramite script) che il login admin funzioni correttamente su biker-link.replit.app con la nuova password. Attualmente non esiste uno smoke test automatico post-deploy.

  ## Done looks like

_(…)_

---

### ❌ #803 — Invia BikerLink all'App Store: build iOS + submission

_Creato: 2026-04-20 · Aggiornato: 2026-04-20 · Stato: CANCELLED_

# Invia BikerLink all'App Store: build iOS + submission

  ## What & Why
  Con i 3 blockers App Store corretti (NSAllowsArbitraryLoads rimosso, chiavi Apple Music
  rimosse, stringhe expo-media-library corrette) e le versioni già aggiornat
  (buildNumber "2", versionCode 31), l'app è pronta per la build EAS e la submission

_(…)_

---

### ❌ #804 — View OTA update errors in the admin panel

_Creato: 2026-04-20 · Aggiornato: 2026-04-20 · Stato: CANCELLED_

# View OTA update errors in the admin panel

  ## What & Why
  The app now silently reports OTA update failures to `/api/admin/ota-error` in production, but there is no UI to view these events. Adding an admin panel section for OTA errors would help diagnose failed updates before they impact users.

  ## Done looks like

_(…)_

</details>

---

## 📅 2026-04-21 (2 task)

- ❌ **#814** — Genera gli screenshot dell'app nelle dimensioni richieste da App Store
- ❌ **#815** — Traduci il link Termini di Servizio in tutte le lingue dell'app

<details>
<summary>Dettaglio task</summary>

### ❌ #814 — Genera gli screenshot dell'app nelle dimensioni richieste da App Store

_Creato: 2026-04-21 · Aggiornato: 2026-05-01 · Stato: CANCELLED_

# Genera gli screenshot dell'app nelle dimensioni richieste da App Store

  ## What & Why
  Gli screenshot da caricare su App Store Connect non esistono ancora nel progetto. Apple richiede screenshot con dimensioni precise per ogni formato iPhone supportato.

  ## Done looks like

_(…)_

---

### ❌ #815 — Traduci il link Termini di Servizio in tutte le lingue dell'app

_Creato: 2026-04-21 · Aggiornato: 2026-05-01 · Stato: CANCELLED_

# Traduci il link Termini di Servizio in tutte le lingue dell'app

  ## What & Why
  Il testo "Leggi i Termini di Servizio completi →" aggiunto nella schermata di
  registrazione (step 4 EULA) è hardcoded in italiano. L'app supporta 6 lingue
  (it, en, de, es, fr, tr) tramite il sistema i18n in lib/i18n.ts.

_(…)_

</details>

---

## 📅 2026-04-22 (10 task)

- ❌ **#818** — Pubblica l'app su Google Play Store dopo la verifica del pacchetto
- ❌ **#823** — Aggiungi il link Privacy Policy in tutte le lingue dell'app
- ❌ **#825** — Notifica email/push al moderatore quando viene assegnato un nuovo ticket bug
- ❌ **#826** — Filtro per moderatore nei log admin
- ❌ **#827** — Paginazione dei log moderatori per prevenire caricamenti lenti
- ❌ **#831** — Upload APK to Play Console and confirm adi-registration.properties verification passes
- ❌ **#833** — Verifica fingerprint APK e carica su Google Play Console
- ❌ **#836** — Aggiungi allarme vibrazione/sonoro quando si supera una soglia G
- ❌ **#837** — Esporta o condividi la cronologia picchi G
- ❌ **#838** — Grafico storico dei picchi G nel tempo

<details>
<summary>Dettaglio task</summary>

### ❌ #818 — Pubblica l'app su Google Play Store dopo la verifica del pacchetto

_Creato: 2026-04-22 · Aggiornato: 2026-04-22 · Stato: CANCELLED_

# Pubblica l'app su Google Play Store dopo la verifica del pacchetto

  ## What & Why
  Una volta completata la verifica del nome pacchetto `com.bikerlink.app` su Google Play Console, 
  l'app BikerLink è pronta per essere caricata sul Play Store. Serve un build AAB firmato con 
  il profilo production di EAS e il successivo upload su Play Console.

_(…)_

---

### ❌ #823 — Aggiungi il link Privacy Policy in tutte le lingue dell'app

_Creato: 2026-04-22 · Aggiornato: 2026-05-01 · Stato: CANCELLED_

# Aggiungi il link Privacy Policy in tutte le lingue dell'app

  ## What & Why
  Come il link ToS, anche il testo del checkbox Privacy Policy nella schermata di registrazione (step 4) è parzialmente hardcoded o potrebbe non essere coerente in tutte le lingue. Verificare che anche il link alla Privacy Policy segua le stesse traduzioni già presenti.

  ## Done looks like

_(…)_

---

### ❌ #825 — Notifica email/push al moderatore quando viene assegnato un nuovo ticket bug

_Creato: 2026-04-22 · Aggiornato: 2026-05-01 · Stato: CANCELLED_

Quando un utente invia un bug o una feature request (POST /api/feedback), inviare una notifica push o email ai moderatori attivi. File rilevanti: server/routes/feedback.ts, server/routes/moderator.ts. Attualmente i moderatori devono aprire manualmente la schermata per vedere i nuovi ticket.

_(…)_

---

### ❌ #826 — Filtro per moderatore nei log admin

_Creato: 2026-04-22 · Aggiornato: 2026-05-01 · Stato: CANCELLED_

La schermata Log Moderatori (app/admin/moderator-logs.tsx) mostra tutti i log di tutti i moderatori. Aggiungere un filtro per selezionare un singolo moderatore e vedere solo le sue azioni. Il backend (server/routes/admin.ts, GET /moderator-logs) potrebbe supportare un query param ?moderatorId=... per efficienza.

_(…)_

---

### ❌ #827 — Paginazione dei log moderatori per prevenire caricamenti lenti

_Creato: 2026-04-22 · Aggiornato: 2026-05-01 · Stato: CANCELLED_

Il GET /api/admin/moderator-logs carica tutti i log in memoria (server/routes/admin.ts). Con molti moderatori e molte azioni, la risposta diventerà pesante. Aggiungere paginazione limit/offset al backend e scroll infinito alla UI (app/admin/moderator-logs.tsx).

_(…)_

---

### ❌ #831 — Upload APK to Play Console and confirm adi-registration.properties verification passes

_Creato: 2026-04-22 · Aggiornato: 2026-04-22 · Stato: CANCELLED_

# Upload APK to Play Console and confirm adi-registration.properties verification

  ## What & Why
  The code changes for including adi-registration.properties in the release APK are verified and correct. The final step is to download the APK produced by EAS Build (profile: preview), confirm the file is present inside the APK, and upload it to Play Console so Google can verify and register package com.bikerlink.app.

  ## Done looks like

_(…)_

---

### ❌ #833 — Verifica fingerprint APK e carica su Google Play Console

_Creato: 2026-04-22 · Aggiornato: 2026-05-01 · Stato: CANCELLED_

# Verifica fingerprint APK e carica su Google Play Console

  ## What & Why
  La build d2bb5256-eb7d-4e40-8b4c-f7ef57a6d79f (versionCode 32, v2.0.0) includerà adi-registration.properties nel package. Una volta completata, va scaricato l'APK e verificato il fingerprint SHA-256 con apksigner, poi caricato su Play Console.

  ## Done looks like

_(…)_

---

### ❌ #836 — Aggiungi allarme vibrazione/sonoro quando si supera una soglia G

_Creato: 2026-04-22 · Aggiornato: 2026-04-22 · Stato: CANCELLED_

# Aggiungi allarme vibrazione/sonoro quando si supera una soglia G

  ## What & Why
  I motociclisti potrebbero voler essere avvisati in tempo reale quando raggiungono una soglia G pericolosa (es. frenata >0.8G). Un feedback aptico o sonoro immediato aumenta la sicurezza e l'utilità del pannello sensori.

  ## Done looks like

_(…)_

---

### ❌ #837 — Esporta o condividi la cronologia picchi G

_Creato: 2026-04-22 · Aggiornato: 2026-04-22 · Stato: CANCELLED_

# Esporta o condividi la cronologia picchi G

  ## What & Why
  I motociclisti potrebbero voler condividere i loro picchi G con amici o salvarli come CSV/testo per confronti a lungo termine.

  ## Done looks like

_(…)_

---

### ❌ #838 — Grafico storico dei picchi G nel tempo

_Creato: 2026-04-22 · Aggiornato: 2026-04-22 · Stato: CANCELLED_

# Grafico storico dei picchi G nel tempo

  ## What & Why
  Avere i picchi G salvati per sessione abilita la visualizzazione di un grafico di tendenza. I motociclisti potrebbero vedere se stanno migliorando o cambiando stile di guida nel tempo.

  ## Done looks like

_(…)_

</details>

---

## 📅 2026-04-23 (4 task)

- ❌ **#842** — Evita che sessioni in memoria si perdano ad ogni riavvio del server
- ❌ **#843** — Reindirizza alla schermata di login se la sessione scade mentre usi l'app
- ❌ **#845** — APK — Bump versionCode 34 per build Play Store/App Store
- ❌ **#848** — Prepara i 5 screenshot iPhone per la submission App Store

<details>
<summary>Dettaglio task</summary>

### ❌ #842 — Evita che sessioni in memoria si perdano ad ogni riavvio del server

_Creato: 2026-04-23 · Aggiornato: 2026-05-01 · Stato: CANCELLED_

# Sessioni persistenti — sopravvivono ai riavvii del server

  ## What & Why
  Attualmente le sessioni utente sono salvate solo in memoria. Quando il server si riavvia (per crash OOM, deploy, o manutenzione), tutte le sessioni vengono azzerate e ogni utente deve riloggarsi. Questo è il comportamento che ha causato il logout involontario dopo il crash della notte del 22/23 aprile.

  Il fix del task #840 riduce la frequenza dei crash OOM, ma non elimina completamente i riavvii (deploy, aggiornamenti, crash residui). Un session store persistente (salvato nel database PostgreSQL già disponibile) garantisce che gli utenti restino loggati anche attraverso i riavvii.

_(…)_

---

### ❌ #843 — Reindirizza alla schermata di login se la sessione scade mentre usi l'app

_Creato: 2026-04-23 · Aggiornato: 2026-04-23 · Stato: CANCELLED_

## What & Why

  Con il fix del task #841, il logout involontario allo splash screen è risolto.
  Rimane però un gap: se la sessione scade MENTRE l'utente è già dentro l'app (tab attiva),
  `isAuthenticated` diventa false ma non c'è un redirect automatico alla welcome screen.
  L'utente continua a vedere le tab con dati vuoti/broken finché non riapre l'app.

_(…)_

---

### ❌ #845 — APK — Bump versionCode 34 per build Play Store/App Store

_Creato: 2026-04-23 · Aggiornato: 2026-04-23 · Stato: CANCELLED_

---
  title: APK — Bump versionCode 34 per build Play Store/App Store
  ---
  # APK — Bump versionCode 34

  ## What & Why

_(…)_

---

### ❌ #848 — Prepara i 5 screenshot iPhone per la submission App Store

_Creato: 2026-04-23 · Aggiornato: 2026-05-01 · Stato: CANCELLED_

# Screenshot App Store iOS — Richiesti per la submission

  ## What & Why
  Apple richiede obbligatoriamente almeno 5 screenshot per iPhone (dimensione 6.9" — 1320×2868px) prima di poter sottomettere l'app all'App Store. Senza questi la submission viene bloccata da App Store Connect.

  ## Done looks like

_(…)_

</details>

---

## 📅 2026-04-24 (1 task)

- 📋 **#904** — Live Ride Streaming (HLS)

<details>
<summary>Dettaglio task</summary>

### 📋 #904 — Live Ride Streaming (HLS)

_Creato: 2026-04-24 · Aggiornato: 2026-04-24 · Stato: PROPOSED_

# Live Ride Streaming (HLS)

## What & Why
Permette a un biker di avviare una diretta del suo giro dalla schermata di tracking. Gli altri utenti possono guardare la diretta in tempo reale direttamente nell'app, con una mappa che mostra il punto GPS del broadcaster aggiornato in diretta. Il protocollo usato è HLS (HTTP Live Streaming), lo stesso di VLC/VideoLAN — compatibile con expo-av senza moduli nativi aggiuntivi.

## Done looks like

_(…)_

</details>

---

## 📅 2026-04-27 (1 task)

- 📋 **#1054** — Fix build Android R8 + Ottimizza profilo preview EAS

<details>
<summary>Dettaglio task</summary>

### 📋 #1054 — Fix build Android R8 + Ottimizza profilo preview EAS

_Creato: 2026-04-27 · Aggiornato: 2026-04-27 · Stato: PROPOSED_

# Fix build Android R8 + Ottimizza profilo preview EAS

## What & Why
Il build Android release fallisce durante la fase R8 (minificazione) perché `expo-av` referenzia `expo.modules.core.interfaces.services.KeepAwakeManager`, rimossa dal tree-shaker. Serve una regola ProGuard per preservarla.

In parallelo, il profilo `preview` di EAS va completato con: cache pulita ad ogni build, skip del fingerprint automatico, architettura arm64 esclusiva, output APK, e gradleCommand esplicito.

_(…)_

</details>

---

## 📅 2026-05-01 (10 task)

- 📋 **#1186** — Add a language switcher in the app settings screen
- 📋 **#1190** — Aggiungi vibrazione + audio breve quando il GPS viene recuperato
- 📋 **#1192** — Periodic orphan-image sweep: delete uploads/ads/ files with no DB reference
- 📋 **#1196** — Show notification delivery errors so push problems are visible
- 📋 **#1198** — Show download progress for large admin backups instead of just a spinner
- 📋 **#1203** — Filter OTA history by runtime version cycle in the admin panel
- 📋 **#1204** — Add validation guard to OTA retention input (min 7 days, max 3650 days)
- 📋 **#1216** — Show OTA adoption as a percentage bar so it's easier to see rollout progress at a glance
- 📋 **#1217** — Add a time-range filter to the OTA adoption card (last 7d / 30d / all time)
- 📋 **#1218** — Show the current OTA event table row count in the admin panel

<details>
<summary>Dettaglio task</summary>

### 📋 #1186 — Add a language switcher in the app settings screen

_Creato: 2026-05-01 · Aggiornato: 2026-05-01 · Stato: PROPOSED_

# Add in-app language switcher to settings

  ## What & Why
  The i18n system supports 7 languages (IT, EN, DE, ES, FR, TR, EL) but there is no UI for users to change language from within the app. Users must rely on device locale detection.

  ## Done looks like

_(…)_

---

### 📋 #1190 — Aggiungi vibrazione + audio breve quando il GPS viene recuperato

_Creato: 2026-05-01 · Aggiornato: 2026-05-01 · Stato: PROPOSED_

# Haptic + audio feedback al ripristino del segnale GPS

  ## What & Why
  Il banner rosso "GPS perso" è silenzioso. Quando il segnale torna, l'utente potrebbe non accorgersene subito se ha lo schermo in tasca. Un breve feedback aptico (vibrazione) + suono di conferma ("signal recovered") migliora la UX senza essere invasivo.

  ## Done looks like

_(…)_

---

### 📋 #1192 — Periodic orphan-image sweep: delete uploads/ads/ files with no DB reference

_Creato: 2026-05-01 · Aggiornato: 2026-05-01 · Stato: PROPOSED_

# Periodic orphan-image sweep

  ## What & Why
  Campaigns can also lose their image reference when an admin replaces the image via PUT /api/admin/advertisements/:id (the old file is not deleted). A periodic background job that scans uploads/ads/ for files not referenced by any campaign row would catch these and any edge cases missed by per-delete cleanup.

  ## Done looks like

_(…)_

---

### 📋 #1196 — Show notification delivery errors so push problems are visible

_Creato: 2026-05-01 · Aggiornato: 2026-05-01 · Stato: PROPOSED_

# Show notification delivery errors so push problems are visible

  ## What & Why
  The Expo push service returns per-message error tickets (e.g. DeviceNotRegistered, InvalidCredentials). Currently these are only logged as warnings and silently discarded. Stale tokens that return DeviceNotRegistered should be cleared from the database to avoid wasting push quota and to keep the users table clean.

  ## Done looks like

_(…)_

---

### 📋 #1198 — Show download progress for large admin backups instead of just a spinner

_Creato: 2026-05-01 · Aggiornato: 2026-05-01 · Stato: PROPOSED_

# Show download progress for large admin backups

  ## What & Why
  The "Scarica" button in the admin backup screen shows a spinner while downloading, but gives no indication of how much has been downloaded. Database dumps and media zips can be tens or hundreds of MB — admins have no feedback on whether the download is progressing or stalled.

  ## Done looks like

_(…)_

---

### 📋 #1203 — Filter OTA history by runtime version cycle in the admin panel

_Creato: 2026-05-01 · Aggiornato: 2026-05-01 · Stato: PROPOSED_

# Filter OTA history by runtime version cycle

  ## What & Why
  Now that runtime version is visible next to each OTA release in the admin panel
  (Task #1034), a natural next step is to let admins filter the list by cycle
  (e.g., show only rv 8.0.0 releases) to quickly identify cross-cycle stale entries

_(…)_

---

### 📋 #1204 — Add validation guard to OTA retention input (min 7 days, max 3650 days)

_Creato: 2026-05-01 · Aggiornato: 2026-05-01 · Stato: PROPOSED_

# Add validation guard to OTA retention input

  ## What & Why
  The OTA cleanup retention setting (Task #1041) accepts any positive integer.
  A retention of 1 day or 2 days would aggressively delete recent superseded
  releases before admins have a chance to rollback. Adding a minimum of 7 days

_(…)_

---

### 📋 #1216 — Show OTA adoption as a percentage bar so it's easier to see rollout progress at a glance

_Creato: 2026-05-01 · Aggiornato: 2026-05-01 · Stato: PROPOSED_

# Show OTA adoption as a percentage bar

  ## What & Why
  The new Adozione OTA card (Task #1167) shows raw ok/error counts per update and platform. Adding a visual percentage bar (e.g. "87% success rate") would make it immediately obvious whether a rollout is going well without needing to read individual numbers.

  ## Done looks like

_(…)_

---

### 📋 #1217 — Add a time-range filter to the OTA adoption card (last 7d / 30d / all time)

_Creato: 2026-05-01 · Aggiornato: 2026-05-01 · Stato: PROPOSED_

# Add time-range filter to OTA adoption stats

  ## What & Why
  The /api/admin/ota-stats endpoint (added in Task #1167) queries all ota_events with no date filter. As history grows this could show very old updates. A time-range filter (last 7d / 30d / all) lets admins see recent adoption separately from historical data.

  ## Done looks like

_(…)_

---

### 📋 #1218 — Show the current OTA event table row count in the admin panel

_Creato: 2026-05-01 · Aggiornato: 2026-05-01 · Stato: PROPOSED_

# Show ota_events row count in admin panel

  ## What & Why
  After adding the scheduled cleanup (Task #1168), admins have no visibility into the current table size or whether the cleanup is keeping it under control. A simple row count + last cleanup timestamp displayed in the admin OTA section would confirm the job is working.

  ## Done looks like

_(…)_

</details>

---

## 📅 2026-05-02 (4 task)

- 📋 **#1219** — Open the right content when tapping a push notification while the app is closed
- 📋 **#1221** — Get a push notification on your phone when the live OTA version is wrong
- 📋 **#1222** — Let admins share a crash report directly from the modal (WhatsApp, Slack, email…)
- 📋 **#1223** — Remember that the user denied GPS background so the prompt doesn't reappear every session

<details>
<summary>Dettaglio task</summary>

### 📋 #1219 — Open the right content when tapping a push notification while the app is closed

_Creato: 2026-05-02 · Aggiornato: 2026-05-02 · Stato: PROPOSED_

# Handle deep-link navigation from cold-start push notification tap

  ## What & Why
  Task #1170 wires up in-app notification list taps to navigate to the right screen.
  But when the user taps a push notification from the system tray while the app is
  closed (or backgrounded), `app/+native-intent.tsx` currently redirects everything

_(…)_

---

### 📋 #1221 — Get a push notification on your phone when the live OTA version is wrong

_Creato: 2026-05-02 · Aggiornato: 2026-05-02 · Stato: PROPOSED_

# Send a push/email alert to admin when WARN_OTA_MISMATCH is detected

  ## What & Why
  Task #1172 makes the Error Monitor log WARN_OTA_MISMATCH when production serves the
  wrong OTA bundle, but the admin only sees this if they actively check the log file.
  Adding an active alert (push notification via Expo or email) would surface the problem

_(…)_

---

### 📋 #1222 — Let admins share a crash report directly from the modal (WhatsApp, Slack, email…)

_Creato: 2026-05-02 · Aggiornato: 2026-05-02 · Stato: PROPOSED_

# Add a Share button to the crash log modal

  ## What & Why
  The modal already has a Copy button (Task #1173). A Share button using the native
  share sheet would let admins forward crash reports directly to teammates via
  WhatsApp, Slack, email, or any installed app — faster than copy-paste.

_(…)_

---

### 📋 #1223 — Remember that the user denied GPS background so the prompt doesn't reappear every session

_Creato: 2026-05-02 · Aggiornato: 2026-05-02 · Stato: PROPOSED_

# Persist GPS background denial so the notice doesn't re-show on every app open

  ## What & Why
  AlwaysPermissionNotice is shown based on hasBackgroundPermission=false. After a user
  denies the OS dialog and dismisses the notice, the next time they open the app the same
  modal will appear again — even though they already said no. This is annoying and reduces

_(…)_

</details>

---

## 📅 2026-05-04 (2 task)

- 📋 **#1224** — Clean up the old ad image file when an admin replaces it via the edit form
- 📋 **#1227** — Upgrade sprint-history.tsx sprint label to use convertSpeed() for knots support

<details>
<summary>Dettaglio task</summary>

### 📋 #1224 — Clean up the old ad image file when an admin replaces it via the edit form

_Creato: 2026-05-04 · Aggiornato: 2026-05-04 · Stato: PROPOSED_

# Delete old image file when an admin replaces an ad image via PUT

  ## What & Why
  Task #1175 confirmed that DELETE handlers already clean up image files on disk.
  However, the PUT /advertisements/:id handler (server/routes/admin.ts ~line 2226)
  uploads a new image when req.file is present but does NOT delete the old one.

_(…)_

---

### 📋 #1227 — Upgrade sprint-history.tsx sprint label to use convertSpeed() for knots support

_Creato: 2026-05-04 · Aggiornato: 2026-05-04 · Stato: PROPOSED_

# Use convertSpeed() in sprint-history.tsx for consistent unit handling

  ## What & Why
  app/sprint-history.tsx currently builds the sprint target label with a manual
  ternary (lines 55-56):
    const targetSpeed = speedUnit === "mph" ? 62 : 100;

_(…)_

</details>

---

## 📅 2026-05-18 (19 task)

- 📋 **#1230** — Add Portuguese (pt) and Polish (pl) language support
- 📋 **#1246** — Skip the manual 'Confirm' step in Last.fm login — connect automatically
- 📋 **#1248** — Remove unused iOS section from eas.json production profile
- 📋 **#1251** — Tapping Previous while shuffling should respect history (go back to last played)
- 📋 **#1254** — Resume music after a Bluetooth headset reconnects mid-track
- 📋 **#1255** — Show a toast when the ride ends if background GPS points were collected
- 📋 **#1260** — Show ad storage usage in the admin panel so orphan counts are visible
- 📋 **#1262** — OTA Modulare — Failsafe + Skill V43 + Check 6h
- 📋 **#1264** — Extend admin-exclusion check to cover includeOffline and countOnlineUsers DB path
- 📋 **#1277** — Show matched-proposal notifications in the app's notification bell
- 📋 **#1280** — Mostra il toggle Widget solo se il widget flottante è attivo sul dispositivo
- 📋 **#1282** — Make notification taps work even when the app is fully closed (not just backgrounded)
- 📋 **#1284** — Stop GPS spike noise from inflating ride statistics
- 📋 **#1285** — Mappa: torna automaticamente sull'utente dopo inattività
- 📋 **#1286** — Mappa: salva e ripristina il livello di zoom precedente
- 📋 **#1287** — Show biker photos on their public profile card visible to other users
- 📋 **#1289** — Carica gli asset competitor su Object Storage per persistenza in produzione
- 📋 **#1290** — Remember the map center between app restarts
- 📋 **#1292** — Keep map style preference hidden when admin later disables the toggle

<details>
<summary>Dettaglio task</summary>

### 📋 #1230 — Add Portuguese (pt) and Polish (pl) language support

_Creato: 2026-05-18 · Aggiornato: 2026-05-18 · Stato: PROPOSED_

# Add Portuguese and Polish translations

  ## What & Why
  The app now covers Italian, English, German, Spanish, French, Turkish and Greek. Portuguese and Polish are two of the largest European motorcycle communities — adding them would meaningfully expand the app's reach.

  ## Done looks like

_(…)_

---

### 📋 #1246 — Skip the manual 'Confirm' step in Last.fm login — connect automatically

_Creato: 2026-05-18 · Aggiornato: 2026-05-18 · Stato: PROPOSED_

# Skip the manual 'Confirm' step in Last.fm login — connect automatically

  ## What & Why
  The current Last.fm OAuth flow is a two-step process: (1) the user opens the Last.fm auth page in a browser, (2) after the browser closes they must manually tap a "Confirm" button for the app to finalise the connection. Step 2 is unnecessary — the `openAuthSessionAsync` result already returns the redirect URL (`bikerlink://lastfm-callback?token=...`), so the app can extract the token from there and call `POST /api/lastfm/auth-session` automatically as soon as the browser closes.

  ## Done looks like

_(…)_

---

### 📋 #1248 — Remove unused iOS section from eas.json production profile

_Creato: 2026-05-18 · Aggiornato: 2026-05-18 · Stato: PROPOSED_

# Remove unused iOS section from eas.json production profile

  ## What & Why
  The `production` build profile in `eas.json` still contains:
  ```json
  "ios": { "autoIncrement": false }

_(…)_

---

### 📋 #1251 — Tapping Previous while shuffling should respect history (go back to last played)

_Creato: 2026-05-18 · Aggiornato: 2026-05-18 · Stato: PROPOSED_

# Tapping Previous while shuffling should respect history

  ## What & Why
  The `prev()` function in `lib/player-context.tsx` always steps linearly backward through the queue index (idx - 1). When shuffle is on, there is no concept of a "previous shuffled track" — the user can't go back to what they just heard.

  A good UX would maintain a separate shuffle-back stack: every time a track finishes or `next()` is called, the index is pushed onto a stack. Tapping previous in shuffle mode would pop that stack to return to the last played track.

_(…)_

---

### 📋 #1254 — Resume music after a Bluetooth headset reconnects mid-track

_Creato: 2026-05-18 · Aggiornato: 2026-05-18 · Stato: PROPOSED_

# Resume music after a Bluetooth headset reconnects mid-track

  ## What & Why
  When a Bluetooth audio device disconnects mid-playback (headset runs out of battery,
  momentary disconnect), Android fires a BECOME_NOISY broadcast and the OS pauses audio.
  The current interruption recovery (Task #1206) handles AppState-based focus loss but

_(…)_

---

### 📋 #1255 — Show a toast when the ride ends if background GPS points were collected

_Creato: 2026-05-18 · Aggiornato: 2026-05-18 · Stato: PROPOSED_

# Show a toast when the ride ends if background GPS points were collected

  ## What & Why
  When a ride is stopped, `pendingBgToastCountRef` is now cleared (Task #1226).
  But if the user stopped the ride while on another tab and background GPS points
  were collected, they never see any confirmation that those points were recorded.

_(…)_

---

### 📋 #1260 — Show ad storage usage in the admin panel so orphan counts are visible

_Creato: 2026-05-18 · Aggiornato: 2026-05-18 · Stato: PROPOSED_

# Show ad storage usage in the admin panel

  ## What & Why
  After the orphan cleanup, admins have no visibility into how many objects are
  in public/ads/ or how much storage they consume. Adding a simple counter on
  the Advertisements admin page (similar to the existing /advertisements/cache-stats

_(…)_

---

### 📋 #1262 — OTA Modulare — Failsafe + Skill V43 + Check 6h

_Creato: 2026-05-18 · Aggiornato: 2026-05-18 · Stato: PROPOSED_

# OTA Modulare — Failsafe + Skill V43 + Check 6h

## What & Why
Il sistema OTA attuale non ha un failsafe designato lato admin né una procedura di startup
garantita. Il confronto tra APK v43 (stabile) e v44 (correzioni in corso, esito incerto)
suggerisce che la logica di avvio di v43 sia più robusta.

_(…)_

---

### 📋 #1264 — Extend admin-exclusion check to cover includeOffline and countOnlineUsers DB path

_Creato: 2026-05-18 · Aggiornato: 2026-05-18 · Stato: PROPOSED_

The Task #1233 check covers the main storage methods and OnlineTracker, but two code paths are not yet exercised: storage.countOnlineUsers() (the DB-backed count query) and the inline includeOffline branch in GET /api/users/online-list which has its own notInArr(role,["admin"]) condition separate from storage.getOnlineUsersList(). Add assertions to scripts/check-admin-map-exclusion.ts for both paths.

_(…)_

---

### 📋 #1277 — Show matched-proposal notifications in the app's notification bell

_Creato: 2026-05-18 · Aggiornato: 2026-05-18 · Stato: PROPOSED_

# Show matched-proposal notifications in the app's notification bell

  ## What & Why
  The zone-match notification is now saved to the database, but the frontend notification list needs to handle referenceType="proposal_match" entries that belong to third-party observers (not the two matched users). Currently tapping such a notification may not navigate anywhere meaningful for these observers — it should show a prompt to create their own proposal instead.

  ## Done looks like

_(…)_

---

### 📋 #1280 — Mostra il toggle Widget solo se il widget flottante è attivo sul dispositivo

_Creato: 2026-05-18 · Aggiornato: 2026-05-18 · Stato: PROPOSED_

# Mostra il toggle Widget solo se il widget flottante è attivo sul dispositivo

  ## What & Why
  Il toggle Widget in "Il mio profilo" è condizionato solo all'abilitazione admin (`adminWidgetEnabled`). Sarebbe utile nasconderlo o mostrarlo disabilitato anche se il floating widget non è supportato dalla piattaforma (es. web), per evitare confusione.

  ## Done looks like

_(…)_

---

### 📋 #1282 — Make notification taps work even when the app is fully closed (not just backgrounded)

_Creato: 2026-05-18 · Aggiornato: 2026-05-18 · Stato: PROPOSED_

# Make notification taps work when app is fully closed

  ## What & Why
  The current fix handles cold start by queuing the navigation until the router is mounted. However, on Android, when the app is fully terminated and relaunched via the overlay deep link, the `Linking.getInitialURL()` call may race with expo-router's initialization in some edge cases. A more robust solution would use a persistent pending-navigation store (AsyncStorage) so the intent is never dropped regardless of boot timing.

  ## Done looks like

_(…)_

---

### 📋 #1284 — Stop GPS spike noise from inflating ride statistics

_Creato: 2026-05-18 · Aggiornato: 2026-05-18 · Stato: PROPOSED_

# Stop GPS spike noise from inflating ride statistics

  ## What & Why
  The current maxSpeed guard only filters out readings above 300 km/h. Recovered rides (offline buffer recovery flow) still apply maxSpeed without any spike filter — line 1191 of `app/(tabs)/tracking.tsx`. Likewise, the server-side recalculation in `server/routes/tracking.ts` (line 167) has no upper-bound guard on speedKmh stored in the database. A bad GPS point persisted in the DB can still produce a wrong maxSpeed when the server recalculates.

  ## Done looks like

_(…)_

---

### 📋 #1285 — Mappa: torna automaticamente sull'utente dopo inattività

_Creato: 2026-05-18 · Aggiornato: 2026-05-18 · Stato: PROPOSED_

# Mappa: torna automaticamente sull'utente dopo inattività

  ## What & Why
  Dopo che l'utente ha spostato la mappa manualmente, la mappa rimane ferma. Aggiungere un pulsante/logica di "re-center automatico" dopo N secondi di inattività migliorebbe l'esperienza, soprattutto su moto in movimento.

  ## Done looks like

_(…)_

---

### 📋 #1286 — Mappa: salva e ripristina il livello di zoom precedente

_Creato: 2026-05-18 · Aggiornato: 2026-05-18 · Stato: PROPOSED_

# Mappa: salva e ripristina il livello di zoom precedente

  ## What & Why
  Ogni volta che si riapre l'app la mappa torna allo zoom di default, anche se l'utente aveva impostato uno zoom diverso. Con la cache GPS già in posto, salvare anche il delta latitudine/longitudine (livello zoom) in AsyncStorage completa l'esperienza di "riapre dove avevo lasciato".

  ## Done looks like

_(…)_

---

### 📋 #1287 — Show biker photos on their public profile card visible to other users

_Creato: 2026-05-18 · Aggiornato: 2026-05-18 · Stato: PROPOSED_

# Show biker photos on their public profile card visible to other users

  ## What & Why
  Bikers can now upload up to 3 photos in their own profile panel, but those photos are not yet displayed when other users view a biker's public profile card or detail page. To complete the feature, biker photos should be visible to other users just like zavorrina photos already are.

  ## Done looks like

_(…)_

---

### 📋 #1289 — Carica gli asset competitor su Object Storage per persistenza in produzione

_Creato: 2026-05-18 · Aggiornato: 2026-05-18 · Stato: PROPOSED_

# Carica gli asset competitor su Object Storage per persistenza in produzione

  ## What & Why
  Il PDF e il PNG dell'analisi competitor sono salvati in `server/public/assets/` che è sul filesystem locale. In produzione Replit, i file locali non sono persistenti tra deploy. Caricarli su Object Storage garantisce che rimangano disponibili indipendentemente dai deploy.

  ## Done looks like

_(…)_

---

### 📋 #1290 — Remember the map center between app restarts

_Creato: 2026-05-18 · Aggiornato: 2026-05-18 · Stato: PROPOSED_

# Remember the map center between app restarts

  ## What & Why
  The small map currently centers on the user's saved profile position at logout. However, if the user manually pans the map to a different area and then closes the app, the next session still starts from the logout position rather than where they left off. Persisting the last known map center in AsyncStorage would give a more natural "resume" feeling.

  ## Done looks like

_(…)_

---

### 📋 #1292 — Keep map style preference hidden when admin later disables the toggle

_Creato: 2026-05-18 · Aggiornato: 2026-05-18 · Stato: PROPOSED_

# Keep map style preference hidden when admin later disables the toggle

  ## What & Why
  When an admin disables the "Scelta stile utente" toggle after a user has already set their own map style, the user's saved `preferredMapStyle` value in the database remains and will silently be applied again if the toggle is re-enabled. There is no indication to the admin that existing user preferences persist, and the resolved provider in `lib/map-context.tsx` will use the stale user pref on re-enable.

  ## Done looks like

_(…)_

</details>

---

## 📅 2026-05-19 (34 task)

- 📋 **#1301** — Add Asia, North America, and Middle East countries to the area selector
- 📋 **#1302** — Let users search for a country or city inside the area selector
- 📋 **#1303** — Add a database index to make conversations load even faster
- 📋 **#1304** — Load more conversations when the user scrolls to the bottom of the chat list
- 📋 **#1306** — Keep map focused on the right user when navigating back to the map
- 📋 **#1310** — Show sensor overlay toggle for the 0-100 sprint screen too
- 📋 **#1311** — Persist sensor overlay preference across rides
- 📋 **#1313** — Show the route on a map in the Giri detail screen
- 📋 **#1315** — Aggiungi un form di contatto diretto nella pagina investitori
- 📋 **#1316** — Proteggi la pagina investitori con un accesso riservato
- 📋 **#1321** — Promote GPS-based and event match types from predisposed to real DB match rows
- 📋 **#1322** — Prevent match preferences from blocking direct match requests made via 'Richiedi Match'
- 📋 **#1340** — Add match history timeline — show when each match was created and status changes over time
- 📋 **#1343** — Fix startup error: users.is_deleted column missing
- 📋 **#1353** — Add app store preview screenshots to the landing page
- 📋 **#1354** — Hook up the investor contact form so it actually sends messages
- 📋 **#1358** — Let admins upload PDF and video files directly in the media panel
- 📋 **#1359** — Let logged-in users edit their profile from the web area
- 📋 **#1360** — Add navbar links to the landing page pointing to the web portal
- 📋 **#1362** — Rigenera automaticamente i PDF di documentazione ad ogni release
- 📋 **#1364** — Track who toggled match preferences and when
- 📋 **#1365** — Mostra una mappa anteprima del tracciato GPX importato
- 📋 **#1366** — Permetti di scegliere visibilità e titolo quando si importa un GPX
- 📋 **#1372** — Show a Pic! badge on sprint rows already shared
- 📋 **#1373** — Render sprint performance cards nicely in the Pic! feed
- 📋 **#1374** — Mostra anche distanza percorsa nella notifica blocco-schermo
- 📋 **#1375** — Filter the sprint leaderboard by bike type and engine size
- 📋 **#1379** — Sync country/area selection across devices too
- 📋 **#1380** — Show riders in more African countries in the area picker
- 📋 **#1382** — Mostra agli utenti come l'admin ha configurato le regole di privacy
- 📋 **#1384** — Mostra il pulsante 'Sync ora' nel pannello admin per triggerare il sync senza usare la shell
- 📋 **#1385** — Animate the visibility badge when it changes state
- 📋 **#1386** — Translate privacy toggle strings in the ride/settings screen too
- 📋 **#1387** — Clear stale sensor snapshot when a ride ends so the next ride starts fresh

<details>
<summary>Dettaglio task</summary>

### 📋 #1301 — Add Asia, North America, and Middle East countries to the area selector

_Creato: 2026-05-19 · Aggiornato: 2026-05-19 · Stato: PROPOSED_

# Add Asia, North America, and Middle East countries to the area selector

  ## What & Why
  The CONTINENT_MAP currently has only JP and IN under Asia (AS) and only US/CA under North America (NA). Missing: China, South Korea, Thailand, Vietnam, Indonesia, Philippines, Malaysia, Saudi Arabia, UAE, Turkey, Israel, Mexico, Central American nations, etc.

  ## Done looks like

_(…)_

---

### 📋 #1302 — Let users search for a country or city inside the area selector

_Creato: 2026-05-19 · Aggiornato: 2026-05-19 · Stato: PROPOSED_

# Let users search for a country or city inside the area selector

  ## What & Why
  With 130+ countries across 6 continents, the accordion list is large. A search bar at the top of the area modal would let users quickly find a specific country (e.g. "Brazil", "Australia") without manually expanding continents.

  ## Done looks like

_(…)_

---

### 📋 #1303 — Add a database index to make conversations load even faster

_Creato: 2026-05-19 · Aggiornato: 2026-05-19 · Stato: PROPOSED_

# Add a database index to make conversations load even faster

  ## What & Why
  The `GET /api/chat/conversations` endpoint now paginates and uses a JOIN query, but the JOIN between `conversations` and `conversation_participants` on `conversationId`/`userId` can still do a full table scan without an index. Adding a composite index on `(userId, conversationId)` in `conversation_participants` will make the JOIN sub-millisecond even at scale.

  ## Done looks like

_(…)_

---

### 📋 #1304 — Load more conversations when the user scrolls to the bottom of the chat list

_Creato: 2026-05-19 · Aggiornato: 2026-05-19 · Stato: PROPOSED_

# Load more conversations when the user scrolls to the bottom of the chat list

  ## What & Why
  The backend now supports pagination (`limit` + `offset` query params, default 20 items) but the frontend chat tab still fetches all conversations in one call. Wiring up infinite scroll / "load more" will let users with 50+ conversations see the first 20 almost immediately, and fetch older ones on demand.

  ## Done looks like

_(…)_

---

### 📋 #1306 — Keep map focused on the right user when navigating back to the map

_Creato: 2026-05-19 · Aggiornato: 2026-05-19 · Stato: PROPOSED_

# Keep map focused on the right user when navigating back to the map

  ## What & Why
  Currently, when navigating from a profile to the map with focusLat/focusLng params, the map centers on those coordinates. However, if the user visits another profile or presses back, the old params may still be in the URL and re-trigger the focus on stale coordinates. A dedicated "pending focus" mechanism — cleared after use — would be more robust than URL params.

  ## Done looks like

_(…)_

---

### 📋 #1310 — Show sensor overlay toggle for the 0-100 sprint screen too

_Creato: 2026-05-19 · Aggiornato: 2026-05-19 · Stato: PROPOSED_

# Show sensor overlay toggle for the 0-100 sprint screen too

  ## What & Why
  The live sensor overlay toggle ("Sensori live") was added only for Race Mode (profile === "race"). The 0-100 sprint screen shows aggregate sensor cards after GO!, but doesn't yet have the compact live overlay with G-long / G-lateral / tilt that Race Mode has. Adding the same toggle to the sprint UI would give the rider real-time sensor feedback during the sprint.

  ## Done looks like

_(…)_

---

### 📋 #1311 — Persist sensor overlay preference across rides

_Creato: 2026-05-19 · Aggiornato: 2026-05-19 · Stato: PROPOSED_

# Persist sensor overlay preference across rides

  ## What & Why
  The `showSensorOverlay` state (Race Mode live sensor panel toggle) is in-memory React state and resets to `false` every time the user navigates away from the tracking tab or the app restarts. Saving this preference to AsyncStorage — alongside existing persisted settings like `sensorsEnabled` — would mean riders don't have to re-enable it on every ride.

  ## Done looks like

_(…)_

---

### 📋 #1313 — Show the route on a map in the Giri detail screen

_Creato: 2026-05-19 · Aggiornato: 2026-05-19 · Stato: PROPOSED_

# Show route polyline on map in Giri detail screen

  ## What & Why
  The Giri detail screen (app/giri/[id].tsx) currently shows stats, waypoints, weather, POI, and bikers — but no map visualization of the route. Users expect to see the actual road on a map before riding.

  ## Done looks like

_(…)_

---

### 📋 #1315 — Aggiungi un form di contatto diretto nella pagina investitori

_Creato: 2026-05-19 · Aggiornato: 2026-05-19 · Stato: PROPOSED_

# Aggiungi un form di contatto diretto nella pagina investitori

  ## What & Why
  La pagina /investors ha attualmente solo un link mailto:. Un form integrato (nome, email, messaggio, tipo di investitore) aumenta il tasso di conversione e permette di raccogliere lead in modo strutturato senza richiedere un client di posta.

  ## Done looks like

_(…)_

---

### 📋 #1316 — Proteggi la pagina investitori con un accesso riservato

_Creato: 2026-05-19 · Aggiornato: 2026-05-19 · Stato: PROPOSED_

# Proteggi la pagina investitori con un accesso riservato

  ## What & Why
  La pagina /investors è pubblica ma contiene dati sensibili su mercato, revenue e strategia. Una protezione semplice (password o token URL) la rende accessibile solo a chi ne ha diritto.

  ## Done looks like

_(…)_

---

### 📋 #1321 — Promote GPS-based and event match types from predisposed to real DB match rows

_Creato: 2026-05-19 · Aggiornato: 2026-05-19 · Stato: PROPOSED_

# Promote GPS/event matches to real match rows

  ## What & Why
  Match types 11–17 (lean angle, route zone, avg speed, avg duration, day/time, events) currently compute affinities but do not persist them as match rows in the DB — they are "predisposed" and return 0 inserted rows. Once the data model is confirmed ready, these should create actual match rows so users see them in their match feeds.

  ## Done looks like

_(…)_

---

### 📋 #1322 — Prevent match preferences from blocking direct match requests made via 'Richiedi Match'

_Creato: 2026-05-19 · Aggiornato: 2026-05-19 · Stato: PROPOSED_

# Ensure directMatch preference is checked in direct-match request flow

  ## What & Why
  The `directMatch` preference flag is stored in the DB and readable via API but is not yet checked server-side when a user sends a direct match request (via the "Richiedi Match" button). A user with `directMatch=false` should not receive unsolicited direct match requests.

  ## Done looks like

_(…)_

---

### 📋 #1340 — Add match history timeline — show when each match was created and status changes over time

_Creato: 2026-05-19 · Aggiornato: 2026-05-19 · Stato: PROPOSED_

# Add match history timeline to the Match Inspector detail view

  ## What & Why
  The current Match Inspector detail shows each user's active matches grouped by type, but there's no historical view of when matches were made/accepted/rejected over time. An admin timeline would help diagnose why the engine is or isn't producing matches for specific users.

  ## Done looks like

_(…)_

---

### 📋 #1343 — Fix startup error: users.is_deleted column missing

_Creato: 2026-05-19 · Aggiornato: 2026-05-19 · Stato: PROPOSED_

# Fix startup error: users.is_deleted column missing

  ## What & Why
  At startup (Phase 4+), a DrizzleQueryError appears: "column is_deleted does not exist" on the `users` table, triggered by the `/api/stats/global` query. The column is used in queries but lacks a migration to add it to the database.

  ## Done looks like

_(…)_

---

### 📋 #1353 — Add app store preview screenshots to the landing page

_Creato: 2026-05-19 · Aggiornato: 2026-05-19 · Stato: PROPOSED_

# Add app store preview screenshots to the landing page

  ## What & Why
  The feature sections (01–08) each have a `.feature-visual` placeholder div that currently renders as an empty dark box. Real in-app screenshots or mockup images in these slots would dramatically increase conversion and visual impact.

  ## Done looks like

_(…)_

---

### 📋 #1354 — Hook up the investor contact form so it actually sends messages

_Creato: 2026-05-19 · Aggiornato: 2026-05-19 · Stato: PROPOSED_

# Hook up the investor contact form so it actually sends messages

  ## What & Why
  The landing page footer links to `#investitori` nav item and there is an "INVESTITORI" nav link, but there is no functioning contact or lead-capture form for investors. Adding a simple form that POSTs to the backend (or sends an email) would make the investor CTA actionable.

  ## Done looks like

_(…)_

---

### 📋 #1358 — Let admins upload PDF and video files directly in the media panel

_Creato: 2026-05-19 · Aggiornato: 2026-05-19 · Stato: PROPOSED_

# Let admins upload PDF and video files directly in the media panel

  ## What & Why
  The admin media panel (/admin/media) currently accepts a URL or file upload, but the file upload endpoint requires object storage integration to be fully wired. The UI is complete but the upload flow needs end-to-end testing and the file-serving route needs validation with real object storage.

  ## Done looks like

_(…)_

---

### 📋 #1359 — Let logged-in users edit their profile from the web area

_Creato: 2026-05-19 · Aggiornato: 2026-05-19 · Stato: PROPOSED_

# Let logged-in users edit their profile from the web area

  ## What & Why
  The /area-utente page currently shows the user's profile (nickname, type, garage, stats) in read-only mode. Users expect to be able to update their info — at minimum their nickname or profile preferences — from the web interface without needing the mobile app.

  ## Done looks like

_(…)_

---

### 📋 #1360 — Add navbar links to the landing page pointing to the web portal

_Creato: 2026-05-19 · Aggiornato: 2026-05-19 · Stato: PROPOSED_

# Add navbar links to the landing page pointing to the web portal

  ## What & Why
  The landing page (/) and the web portal (/accedi, /registrati, /media) are separate HTML files with no cross-links. Users visiting the landing page have no way to discover the register/login pages unless they know the URL.

  ## Done looks like

_(…)_

---

### 📋 #1362 — Rigenera automaticamente i PDF di documentazione ad ogni release

_Creato: 2026-05-19 · Aggiornato: 2026-05-19 · Stato: PROPOSED_

# Rigenera automaticamente i PDF di documentazione ad ogni release

  ## What & Why
  Esistono due script di generazione PDF (`generate-manual-pdf.mjs` e ora `generate-matching-pdf.mjs`) che devono essere lanciati manualmente. È facile dimenticarsene e finire con PDF disallineati rispetto ai markdown sorgente. Conviene agganciarli a uno step automatico (es. pre-build, hook di post-merge, o script unico `docs:all`).

  ## Done looks like

_(…)_

---

### 📋 #1364 — Track who toggled match preferences and when

_Creato: 2026-05-19 · Aggiornato: 2026-05-19 · Stato: PROPOSED_

# Track who toggled match preferences and when

  ## What & Why
  The admin can now toggle global visibility of match preferences and reset all users' preferences in bulk, but these privileged actions leave no audit trail. For accountability and debugging (e.g. "why did everyone's preferences reset last Tuesday?"), log who performed them and when.

  ## Done looks like

_(…)_

---

### 📋 #1365 — Mostra una mappa anteprima del tracciato GPX importato

_Creato: 2026-05-19 · Aggiornato: 2026-05-19 · Stato: PROPOSED_

# Mostra una mappa anteprima del tracciato GPX importato

  ## What & Why
  Quando un utente importa un file GPX, il backend salva solo i waypoint (`<wpt>`) ma scarta tutti i `<trkpt>` del tracciato reale (vedi `server/routes/planned-routes.ts` blocco import-gpx). Di conseguenza la pagina dettaglio del Giro mostra solo le tappe in linea retta, perdendo la forma reale del percorso che l'utente ha caricato. Salvare e visualizzare la polyline del tracciato renderebbe l'import GPX molto più utile.

  ## Done looks like

_(…)_

---

### 📋 #1366 — Permetti di scegliere visibilità e titolo quando si importa un GPX

_Creato: 2026-05-19 · Aggiornato: 2026-05-19 · Stato: PROPOSED_

# Permetti di scegliere visibilità e titolo quando si importa un GPX

  ## What & Why
  L'attuale flusso di import salva sempre il Giro come `private` e usa il nome del file come titolo. Gli utenti che importano percorsi da rally o da amici vorrebbero spesso condividerli subito con la community o assegnare un titolo descrittivo prima del salvataggio.

  ## Done looks like

_(…)_

---

### 📋 #1372 — Show a Pic! badge on sprint rows already shared

_Creato: 2026-05-19 · Aggiornato: 2026-05-19 · Stato: PROPOSED_

# Show a Pic! badge on sprint rows already shared

  ## What & Why
  After publishing a sprint to the Photo Contest from sprint-history, there's no visual indication that the sprint has already been shared. Riders may publish the same result multiple times by accident. A small "shared" badge or a disabled state on the share button would make the published state visible.

  ## Done looks like

_(…)_

---

### 📋 #1373 — Render sprint performance cards nicely in the Pic! feed

_Creato: 2026-05-19 · Aggiornato: 2026-05-19 · Stato: PROPOSED_

# Render sprint performance cards nicely in the Pic! feed

  ## What & Why
  Sprint entries published from sprint-history now reach the Pic! contest with structured `performanceData` (type="sprint", time, G, tilt) but no photo. The Pic! feed should detect these performance-only entries and render a polished stat card (trophy icon, big 0→100 time, G / tilt chips) instead of an empty placeholder.

  ## Done looks like

_(…)_

---

### 📋 #1374 — Mostra anche distanza percorsa nella notifica blocco-schermo

_Creato: 2026-05-19 · Aggiornato: 2026-05-19 · Stato: PROPOSED_

# Mostra anche distanza percorsa nella notifica blocco-schermo

  ## What & Why
  La notifica del foreground service ora mostra il numero di punti GPS acquisiti durante la registrazione a schermo bloccato. Aggiungere anche la distanza percorsa (es. "12,4 km — 87 punti acquisiti") darebbe al pilota un'informazione molto più utile a colpo d'occhio senza sbloccare il telefono.

  ## Done looks like

_(…)_

---

### 📋 #1375 — Filter the sprint leaderboard by bike type and engine size

_Creato: 2026-05-19 · Aggiornato: 2026-05-19 · Stato: PROPOSED_

# Filter the sprint leaderboard by bike type and engine size

  ## What & Why
  The leaderboard endpoint already supports filtering by motorcycle type and displacement range via query params, but the UI doesn't expose those filters yet. Adding chips/dropdowns would let riders compare like-for-like (e.g. naked vs sport, 600cc class vs 1000cc class) and make the leaderboard more meaningful.

  ## Done looks like

_(…)_

---

### 📋 #1379 — Sync country/area selection across devices too

_Creato: 2026-05-19 · Aggiornato: 2026-05-19 · Stato: PROPOSED_

# Sync country/area selection across devices too

  ## What & Why
  We now sync the four map filter toggles (Biker, Zavorrine, Motoclub, Eventi) to the user's profile, but the selected countries / areas on the map are still saved only in AsyncStorage (`map_area_countries`). For consistency, the country selection should follow the same pattern so users get the same map view on every device.

  ## Done looks like

_(…)_

---

### 📋 #1380 — Show riders in more African countries in the area picker

_Creato: 2026-05-19 · Aggiornato: 2026-05-19 · Stato: PROPOSED_

# Show riders in more African countries in the area picker

  ## What & Why
  The Africa continent group in `lib/countries-regions.ts` (CONTINENT_MAP) lists ~50 country codes (AO, BF, BI, BJ, BW, CD, CF, CG, CI, CM, CV, DJ, DZ, EG, ER, GA, GM, GN, GQ, GW, KM, LR, LS, LY, MA, MG, ML, MR, MU, MW, MZ, NA, NE, RW, SC, SD, SL, SN, SO, SS, ST, SZ, TD, TG, TN, UG, ZM, ZW, etc.), but only ET, GH, KE, NG, TZ, and ZA have CountryData entries with regions. The rest don't render any entries when the user expands "Africa" in the area picker.

  ## Done looks like

_(…)_

---

### 📋 #1382 — Mostra agli utenti come l'admin ha configurato le regole di privacy

_Creato: 2026-05-19 · Aggiornato: 2026-05-19 · Stato: PROPOSED_

# Mostra agli utenti come l'admin ha configurato le regole di privacy

  ## What & Why
  Oggi l'utente non ha modo di sapere se la randomizzazione offline è disabilitata globalmente o se la mappa è filtrata per soli online/disponibili. Esponendo le regole correnti tramite un endpoint pubblico (read-only) il client può adattare l'UI (es. nascondere il toggle utente se l'admin l'ha disattivato globalmente) e mostrare un piccolo avviso informativo.

  ## Done looks like

_(…)_

---

### 📋 #1384 — Mostra il pulsante 'Sync ora' nel pannello admin per triggerare il sync senza usare la shell

_Creato: 2026-05-19 · Aggiornato: 2026-05-19 · Stato: PROPOSED_

# Pulsante Sync ora nel pannello admin

  ## What & Why
  L'endpoint POST /api/admin/sync/trigger esiste ma non è esposto nell'interfaccia admin. Per triggerare un sync immediato bisogna usare la shell o curl. Un pulsante nella pagina admin settings consentirebbe al developer di sincronizzare il DB dev dal pannello senza accesso al terminale.

  ## Done looks like

_(…)_

---

### 📋 #1385 — Animate the visibility badge when it changes state

_Creato: 2026-05-19 · Aggiornato: 2026-05-19 · Stato: PROPOSED_

# Animate the visibility badge when it changes state

  ## What & Why
  The visibility summary badge in the Status tab currently updates instantly with no visual feedback. A brief color-fade or scale animation when the badge transitions between states (e.g. ghost mode on/off) would make the change feel polished and deliberate.

  ## Done looks like

_(…)_

---

### 📋 #1386 — Translate privacy toggle strings in the ride/settings screen too

_Creato: 2026-05-19 · Aggiornato: 2026-05-19 · Stato: PROPOSED_

# Translate privacy toggle strings in the ride/settings screen too

  ## What & Why
  The ride.tsx (or settings/GPS) screen may contain hardcoded Italian strings related to ghost mode, privacy, and GPS settings that were not covered by this task — which only targeted ready.tsx. Non-Italian users on those screens would still see Italian text.

  ## Done looks like

_(…)_

---

### 📋 #1387 — Clear stale sensor snapshot when a ride ends so the next ride starts fresh

_Creato: 2026-05-19 · Aggiornato: 2026-05-19 · Stato: PROPOSED_

# Clear stale sensor snapshot when a ride ends so the next ride starts fresh

  ## What & Why
  `BG_SENSOR_SNAPSHOT_KEY` is now written to AsyncStorage during every ride and persists indefinitely.
  If the app crashes mid-ride or the user force-quits, the last snapshot from the previous session
  remains in storage. On the next ride, the background task would read that stale value until the

_(…)_

</details>

---

## 📅 2026-05-23 (2 task)

- 🔄 **#2168** — Fix crash loop web — SyntaxError 'app'
- 🔄 **#2173** — Export storia task + endpoint protetto

<details>
<summary>Dettaglio task</summary>

### 🔄 #2168 — Fix crash loop web — SyntaxError 'app'

_Creato: 2026-05-23 · Aggiornato: 2026-05-23 · Stato: IN_PROGRESS_

# Fix crash loop web — SyntaxError Unexpected identifier 'app'

## What & Why
La preview web crasha in loop continuo con `SyntaxError: Unexpected identifier 'app'`. Il browser console mostra 88+ occorrenze dello stesso errore. L'app non è utilizzabile nella preview web di Replit.

## Done looks like

_(…)_

---

### 🔄 #2173 — Export storia task + endpoint protetto

_Creato: 2026-05-23 · Aggiornato: 2026-05-23 · Stato: IN_PROGRESS_

# Export storia task BikerLink

## What & Why
Esportare la storia completa dei task del progetto in un file Markdown leggibile da un altro agente, con un endpoint Express protetto per scaricarli via HTTP.

## Realtà della sorgente dati (importante per il task agent)

_(…)_

</details>