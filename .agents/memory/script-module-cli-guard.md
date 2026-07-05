---
name: Script top-level execution vs testability
description: Pattern for scripts in scripts/src that both run as a CLI entrypoint and export pure functions for node:test regression tests.
---

Several scripts in `scripts/src/` (`generate-daily-diary.ts`, `generate-bikerlink-manuals.ts`) run their `main()` at
top level with no guard, following the existing `generate-daily-diary.ts` convention. That's fine as long as the
script is only ever invoked as a subprocess (`tsx src/foo.ts` or spawned via `["src/foo.ts", ...]` from
`run-cluster-daily.ts`) — but the moment a `*.test.ts` file `import`s pure helper functions from that same module for
unit testing, the bare `await main()` at import time runs for real (hits the network, etc.) and the test suite fails
or hangs.

**Why:** `generate-bikerlink-manuals.ts` needed unit tests for its pure inventory/comparison functions but importing
them triggered a live GitHub API call and crashed with a 401 before any assertion ran.

**How to apply:** any new script that mixes exported pure functions (meant to be unit-tested) with a top-level
side-effecting `main()` must guard the execution: `if (process.argv[1] && import.meta.url === \`file://${process.argv[1]}\`) { await main(); }`.
Pure-function-only modules (like `reindex-nadir.ts`, `nadir-search-smoke.ts`) don't need this because they have no
top-level side effects — only add the guard when a script both exports for testing AND self-executes.
