/**
 * migrate.ts — applica le Drizzle migrations pendenti.
 *
 * Usa drizzle-orm/node-postgres/migrator che traccia le migration applicate
 * nella tabella `drizzle.__drizzle_migrations`.
 * La migration 0000 è idempotente (IF NOT EXISTS) — sicura su DB esistenti.
 *
 * Usage: pnpm --filter @workspace/db run migrate
 */
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import pg from "pg";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL must be set");
}

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
const db = drizzle(pool);

console.log("[migrate] Applying pending migrations…");
await migrate(db, {
  migrationsFolder: path.join(__dirname, "../migrations"),
});
console.log("[migrate] Done.");
await pool.end();
