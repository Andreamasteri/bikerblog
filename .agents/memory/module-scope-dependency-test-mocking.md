---
name: Testing module-scope (non-injected) dependencies
description: How to swap out a dependency that a route file imports directly at module scope (not passed via config), for a real-HTTP-server regression test.
---

Some dependencies in `horus.ts` (e.g. `getHorusTools`/`executeHorusTool` from
`@workspace/horus`) are imported directly at module scope, not passed through
`DirectChatAgentConfig` like `chatRaw` is. That means a test can't just build
a `config` object with a fake — the real implementation runs unless the
module itself is intercepted.

Node's built-in `node:test` `mock.module(specifier, { namedExports })` can
replace a module's exports for a single test file's process. Two things are
easy to get wrong:

1. **It requires `--experimental-test-module-mocks`** on the node invocation
   (added to the package's `test` script). Without it, `mock.module` is not
   a function at all. Only prints an experimental warning at runtime — no
   behavior change for tests that don't use it.
2. **It fully replaces `namedExports`, it does not merge with the real
   module.** Any export not explicitly listed becomes `undefined`. Since
   `horus.ts` imports many other real exports at module scope (`horusChatRaw`,
   `checkHorusHealth`, etc.) that must still work for the module to load,
   spread the real module first: `await import("@workspace/horus")` then
   `{ ...real, getHorusTools: fake, executeHorusTool: fake }`.

Also: the file under test must be imported dynamically (`await import("./horus.js")`)
*inside* the test, after `mock.module` is set up — a static top-level import
would resolve (and cache) the real module before the mock takes effect.
`node --test` isolates each test file in its own process, so mocking in one
file doesn't leak into others.

**How to apply:** for any future test that needs to fake a dependency a route
file imports directly (not via its handler-factory config), reach for this
pattern instead of adding a new injectable config field just for testability
— see `artifacts/api-server/src/routes/horus.multi-tool-budget.test.ts` for
the reference implementation.
