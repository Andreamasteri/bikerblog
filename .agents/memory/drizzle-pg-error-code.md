---
name: Drizzle wraps raw pg error codes under `.cause`
description: Why `(err as {code}).code` fails to detect unique-violation (23505) on Drizzle transaction errors, and the fix.
---

When a `db.transaction()` callback throws (e.g. a Postgres unique constraint violation), `drizzle-orm`'s node-postgres driver wraps the raw `pg` error in a `DrizzleQueryError`. The original Postgres error — and its `.code` (e.g. `23505`) — lives at `err.cause.code`, not `err.code` directly.

**Why:** Code that does `const pgCode = (err as { code?: string }).code` to special-case unique-violation (e.g. "you already liked this") will always see `undefined` and fall through to a generic 500, even though the insert correctly rejected the duplicate at the DB level. This is easy to miss because the code compiles and looks right, and duplicate-insert protection appears to "work" (the row really isn't duplicated) while the HTTP response is wrong (500 instead of the intended 4xx).

**How to apply:** When catching errors from a Drizzle transaction to inspect a Postgres error code, check both locations:
```ts
const pgCode = (err as { code?: string }).code ?? (err as { cause?: { code?: string } }).cause?.code;
```
Applies to any Drizzle + node-postgres write path that relies on a DB-level unique index for idempotency/dedupe (e.g. like/vote endpoints) and needs to map constraint violations to a specific HTTP status.
