---
name: Pipeline late-start guard
description: Replit scheduler può ritardare la pipeline oltre mezzanotte; step 3.75 copre automaticamente il giorno precedente mancante.
---

## Regola
Se la pipeline gira tra 00:00 e 01:59 ora italiana (finestra post-mezzanotte), `currentHourRome() < 2` è vero. In quel caso lo step 3.75 controlla se `diary-{ieri}` esiste nel DB e, se manca, lo genera con fetch-activity + diary:generate senza `--force`.

**Why:** Il task scheduler Replit ha ritardato la pipeline di 1h27 (23:30 → 00:57 ora italiana), facendo generare il diario del giorno sbagliato (06-04 invece di 06-03) e saltare il 06-03 completamente.

**How to apply:** Lo step 3.75 è già in `scripts/src/run-cluster-daily.ts`. Non fare nulla: gira automaticamente. Se la finestra di 2 ore non basta, aumentare `CATCHUP_WINDOW_END` nel blocco step 3.75.
