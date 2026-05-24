#!/usr/bin/env tsx
/**
 * migrate-author-mendo — rinomina l'autore id=1 da "Andrea" a "Mendo".
 *
 * Script one-shot idempotente: può essere rieseguito senza danni.
 * Aggiorna il nome sia nel DB di sviluppo che in quello di produzione
 * (a seconda del DATABASE_URL configurato nell'ambiente).
 *
 * Usage:
 *   pnpm --filter @workspace/scripts run migrate:author-mendo
 *
 * Requires DATABASE_URL.
 */
import { eq } from "drizzle-orm";
import { db, pool, authorsTable } from "@workspace/db";

const OLD_NAME = "Andrea";
const NEW_NAME = "Mendo";
const AUTHOR_ID = 1;

async function run(): Promise<void> {
  const [author] = await db
    .select({ id: authorsTable.id, name: authorsTable.name })
    .from(authorsTable)
    .where(eq(authorsTable.id, AUTHOR_ID));

  if (!author) {
    console.error(`[migrate-author-mendo] ERRORE: autore id=${AUTHOR_ID} non trovato`);
    process.exit(1);
  }

  if (author.name === NEW_NAME) {
    console.log(`[migrate-author-mendo] Già aggiornato: id=${AUTHOR_ID} name="${NEW_NAME}" — nessuna modifica necessaria.`);
    await pool.end();
    return;
  }

  console.log(`[migrate-author-mendo] Aggiornamento: "${author.name}" → "${NEW_NAME}" (id=${AUTHOR_ID})`);

  const [updated] = await db
    .update(authorsTable)
    .set({ name: NEW_NAME })
    .where(eq(authorsTable.id, AUTHOR_ID))
    .returning({ id: authorsTable.id, name: authorsTable.name });

  console.log(`[migrate-author-mendo] OK: id=${updated.id} name="${updated.name}"`);
  await pool.end();
}

run().catch((err) => {
  console.error("[migrate-author-mendo] ERRORE:", err);
  process.exit(1);
});
