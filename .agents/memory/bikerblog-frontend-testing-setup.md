---
name: BikerBlog frontend testing setup
description: How component tests are wired up for artifacts/bikerblog (vitest + jsdom), and jsdom gaps to watch for.
---

`artifacts/bikerblog` had no frontend test runner until it was added for
regression coverage of the Horus↔Bowie chat UI. Reuse this setup for any
future component/integration test in that artifact instead of re-deriving it.

- Test runner: vitest (`artifacts/bikerblog/vitest.config.ts`), React Testing
  Library + `@testing-library/user-event` + `@testing-library/jest-dom`.
  Run with `pnpm --filter @workspace/bikerblog exec vitest run` (there's also
  a `test` script in that package's `package.json`).
- `*.test.tsx` is excluded from `tsconfig.json` so test files don't affect
  `pnpm run typecheck`.
- jsdom does not implement `Element.scrollTo` — components that auto-scroll a
  ref (chat panels, message lists) will throw `scrollTo is not a function` in
  tests unless polyfilled. Polyfill lives in
  `artifacts/bikerblog/src/test/setup.ts`.
- SSE-streaming components (Horus/Bowie chat) can be tested by mocking
  `global.fetch` to return an object whose `body.getReader().read()` yields
  hand-built `event: ...\ndata: ...\n\n` chunks — no real `ReadableStream` is
  needed since the app code only calls `.getReader().read()`.
- When a component renders the same button label in more than one place
  (e.g. a header "reset" button and an inline error-banner button with the
  same text), scope queries with `within(banner)` using the banner's
  container (e.g. `text.closest("div")`) rather than a global
  `getByRole`/`findByRole`, which throws on multiple matches.

**Why:** the corrupted-resume regression test (guarding the "start over"
button appearing instead of an infinite retry loop after a rejected saved
conversation) needed all of the above; the same patterns will recur for any
other Horus/Bowie/streaming UI test.
