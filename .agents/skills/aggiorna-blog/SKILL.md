---
name: aggiorna-blog
description: Sincronizza i contenuti da BikerLink e pubblica immediatamente i nuovi post sul blog. Usare quando l'utente dice "aggiorna il blog", "sincronizza il blog", "pubblica i nuovi post", "forza il sync" o frasi simili.
---

# Aggiorna Blog

Quando l'utente dice "aggiorna il blog" (o varianti), esegui subito il comando di sync senza chiedere conferma.

## Comando

```bash
pnpm --filter @workspace/scripts run sync
```

## Cosa fa

1. **Fetch chat BikerLink** — tenta di scaricare la chat dall'endpoint `INBOX_URL` (soft-fail: se l'endpoint non risponde, continua lo stesso)
2. **Ricarica task dall'export locale** — aggiorna `inbox/bikerlink-archived-tasks.json` da `inbox/bikerlink-history/tasks-meta.json`
3. **Rigenera i cluster** — raggruppa i task MERGED per giornata → `inbox/clusters-merged-by-day.md`
4. **Pubblica** — ogni cluster non ancora presente nel DB diventa un post (`recap-YYYY-MM-DD`). Idempotente: i post già esistenti vengono saltati.

## Come eseguire

```bash
pnpm --filter @workspace/scripts run sync
```

Usa `bash` tool con questo comando e mostra all'utente l'output (quanti post pubblicati, quanti saltati).

## Output atteso

```
[sync] avvio — DD/MM/YYYY, HH:MM:SS
[sync] ▶ fetch:archived-tasks (locale)
[sync] ✓ fetch:archived-tasks completato
[sync] ▶ cluster:tasks (MERGED per giornata)
[sync] ✓ cluster:tasks completato
[sync] ▶ publish-from-clusters
[publish-from-clusters] pubblicato: recap-YYYY-MM-DD   ← nuovi
[publish-from-clusters] done — pubblicati: N, già presenti: M
[sync] ✅ fatto — DD/MM/YYYY, HH:MM:SS
```

## Note

- Il comando è idempotente: rilanciarlo non duplica post.
- Se `INBOX_URL` non è impostata, il fetch chat è skippato senza errori.
- Dopo il sync, il blog è aggiornato in tempo reale (nessun restart necessario).
- Script: `scripts/src/sync-and-publish.ts`

## Comportamento bilingue (IT/EN)

Ogni post pubblicato viene generato **in italiano e in inglese**. La traduzione avviene automaticamente via Claude (modello Haiku) subito dopo la generazione del contenuto IT.

- **Nuovi post** (`publish:from-clusters`, `diary:generate`): generati in IT, poi tradotti in EN nello stesso run. I campi `title_en`, `excerpt_en`, `content_en` vengono popolati nell'upsert.
- **Post già esistenti senza traduzione**: `diary:generate` esegue un backfill automatico al termine del run — traduce i post del range che non hanno ancora `content_en`.
- **Idempotenza**: se `content_en` è già presente e il contenuto IT non è cambiato, la ritraduzione viene saltata.
- **Frontend**: il selettore IT/EN è visibile nella pagina del post, nella home e nella timeline. La lingua scelta viene salvata in `localStorage` e ripristinata al reload. Se la traduzione EN non è disponibile per un post, il selettore mostra un fallback all'italiano con avviso visivo.
