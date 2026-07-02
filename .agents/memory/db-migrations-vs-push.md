---
name: Drizzle migrations must be added by hand alongside schema.ts changes
description: This repo's DB history was built via `drizzle-kit push`, not `migrate` — schema.ts edits alone don't produce a migration file, and `drizzle-kit generate` is currently broken here.
---

Changing a `lib/db/src/schema/*.ts` file and running `pnpm --filter @workspace/db run push` updates the dev database directly, but does **not** create a migration file under `lib/db/migrations/`. Production/other environments that apply migrations (via `pnpm --filter @workspace/db run migrate`) will not see the change unless a migration file exists.

**Why:** `drizzle-kit generate` currently fails in this repo (`ENOENT ... 0001_snapshot.json`) because an earlier migration (`0001_add_post_likes`) was added by hand without ever generating its matching `meta/000X_snapshot.json`, breaking the snapshot chain `generate` relies on to diff. So `generate` cannot be used to produce new migrations until that gap is fixed.

**How to apply:** Any schema change (new column/table) must be accompanied by manually adding, in `lib/db/migrations/`: (1) a numbered `.sql` file with idempotent DDL (`ADD COLUMN IF NOT EXISTS`, `CREATE TABLE IF NOT EXISTS`, `DO $$ ... EXCEPTION WHEN duplicate_object THEN null; END $$` around FK constraints, `CREATE UNIQUE INDEX IF NOT EXISTS`), (2) a matching `meta/000X_snapshot.json` (copy the previous snapshot and add the new column/table), and (3) a new entry in `meta/_journal.json`. Verify with `pnpm --filter @workspace/db run migrate` (should run cleanly, no error) — do not rely on `generate` until the 0001 snapshot gap is fixed separately.
