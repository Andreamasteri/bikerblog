---
name: Pipeline gap catch-up (step 3.8)
description: Perché il blog aveva buchi e come step 3.8 li previene
---

## Problema
Il cron giornaliero gira nel deployment (UI Deploy → Scheduled), non nel dev
workflow. Quando il deployment va offline (es. container bloccato, BikerLink
giù), il cron smette di girare senza avvisi. Lo step 3.75 recupera solo ieri
nella finestra 00:00-01:59 — insufficiente per gap multi-giorno.

## Soluzione
Step 3.8 in `run-cluster-daily.ts`: controlla gli ultimi 7 giorni a ogni run.
Per ogni data mancante: fetch-bikerlink-activity + diary:generate. Silenzioso
se non ci sono gap. Steps 5-6-7 gestiscono EN/audio/prod-push automaticamente.

**Why:** Senza catch-up robusto, 5+ notti di cron offline = 5 giorni di blog vuoto.

**How to apply:** Automatico ad ogni run della pipeline. Nessuna azione manuale.
Se si vedono ancora buchi > 7 giorni, aumentare LOOKBACK_DAYS nel codice.
