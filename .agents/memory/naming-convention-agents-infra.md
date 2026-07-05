---
name: Naming convention — agenti, modelli, secret, Cloudflare
description: Convenzione per etichette leggibili (no nomi criptici) su env var, modelli Ollama, tunnel/Access/service token Cloudflare. Applicare a ogni nuova risorsa infra del progetto.
---

Decisione (Fase 2c economy, 2026-07-05): ogni risorsa infrastrutturale legata
agli agenti Ollama deve avere un'etichetta leggibile col nome che usiamo
(Horus/Bowie/Quebracho/Nadir/Whisper), mai un'etichetta criptica tipo
"ollama: bikerlink latest" o un ID opaco.

**Why:** con più agenti + più servizi TC (hub, whisper, nominatim, valhalla,
searxng, analysis, gh, ssh) diventa facile confondere quale secret/tunnel
serve quale agente durante debug o rebuild; i nomi criptici hanno già causato
confusione in passato durante l'indagine sull'eviction VRAM.

**Convenzione (già in vigore per gli env var, estesa a Cloudflare):**

1. **Env var per-agente**: prefisso `<AGENT>_` (`HORUS_`, `BOWIE_`,
   `QUEBRACHO_`) + suffisso che descrive il ruolo: `_OLLAMA_URL`,
   `_OLLAMA_MODEL`, `_CF_ACCESS_CLIENT_ID`, `_CF_ACCESS_CLIENT_SECRET`.
   Bowie/Quebracho fanno fallback sulle var di Horus se non impostate
   (stesso tunnel condiviso) — pattern già in `lib/horus/src/client.ts`.
2. **Env var di infrastruttura condivisa** (non specifiche di un agente):
   nome descrittivo del servizio, non un codename — `AI_HUB_URL`,
   `HUB_GATE_TOKEN`, `CLOUDFLARE_API_TOKEN`, `TC_SSH_KEY`. Mai abbreviare in
   sigle non ovvie.
3. **Tag modello Ollama**: restano i nomi upstream (`qwen3:4b`,
   `qwen3:1.7b`, `granite4:tiny-h`, `all-minilm`) — non si inventano tag
   custom. La mappatura leggibile agente→modello vive nel codice/commenti,
   non nel tag stesso.
4. **Cloudflare — tunnel**: un solo tunnel per host fisico, nome descrittivo
   dell'host (`bikerlink-tc`) — già conforme, non rinominare in Fase 2c.
5. **Cloudflare — hostname pubblici**: uno per capability/servizio, nome
   funzionale non per-agente (un solo endpoint Ollama serve 3 agenti):
   `ollama-tc`, `whisper`, `hub`, `nominatim`, `valhalla`, `searxng`,
   `analysis`, `gh`, `tc` (ssh).
6. **Cloudflare — Access application**: nome visualizzato nel dashboard nel
   formato `"<Servizio> (TC)"`, es. `"Ollama (TC)"`, `"AI Hub (TC)"`,
   `"Whisper (TC)"`, `"SSH (TC)"`. Mai lasciare il nome default generato da
   Cloudflare.
7. **Cloudflare — service token**: nome nel formato `"<chi chiama> → <cosa
   chiama>"`, es. `"Replit → Ollama (TC)"`, `"Replit → AI Hub (TC)"`,
   `"Replit → SSH (TC)"` — deve essere chiaro chi usa quel token e verso
   quale servizio, per poterlo ruotare/revocare senza ambiguità.

**How to apply:** ogni volta che si crea/rinomina una risorsa Cloudflare
(tunnel, hostname, Access app, service token) o un secret Replit legato agli
agenti, verificare che rispetti questo schema prima di salvarla. La sezione
"Architecture decisions" di `replit.md` ha un riferimento breve a questo file.
