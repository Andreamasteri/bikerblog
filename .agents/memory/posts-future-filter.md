---
name: Post futuri nascosti nell'API
description: Le query pubbliche dei post filtrano publishedAt <= now() per evitare che post futuri appaiano in anticipo.
---

## Regola
`fetchPostsShaped()` e `GET /posts/featured` in `artifacts/api-server/src/routes/posts.ts` applicano sempre `lte(postsTable.publishedAt, new Date())`. `GET /posts/:slug` non filtra (accesso diretto per slug accettabile).

**Why:** La pipeline ha generato diary-2026-06-04 con publishedAt = sera del 4 giugno, ma visto che girava a mezzanotte il post è apparso subito con un giorno di anticipo.

**How to apply:** Nessuna azione richiesta — il filtro è già nel codice. Se si aggiunge un nuovo endpoint di lista, ricordarsi di includere lo stesso filtro.
