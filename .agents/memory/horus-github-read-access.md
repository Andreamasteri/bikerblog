---
name: github_read no-confirm + subfolder traversal fix
description: Why Bowie asked for confirmation before reading GitHub and got stuck at the first subfolder level, and how it was fixed.
---

## Symptom

Bowie (and other direct-chat agents) would sometimes ask the user for
permission before calling `github_read`, and after listing a folder it
would "get stuck" — unable to reliably descend into a subfolder it had just
listed.

## Root causes

1. **Confirmation**: the direct-chat system prompt
   (`buildDirectChatSystemPrompt` in `artifacts/api-server/src/routes/horus.ts`)
   had an explicit "no need to ask, just do it" instruction for
   `remember_note` but none for `github_read` — the model defaulted to
   asking permission for the tool it had no explicit green light for.
2. **Subfolder traversal**: `githubRead()` in `lib/horus/src/tools.ts`
   listed folder entries by **bare name only** (e.g. `components`). The
   model would then call `github_read` again with that bare name as `path`,
   which resolves relative to the repo root, not the folder just listed —
   almost always a 404 unless already at the root. This looked like "can't
   go past the first level" but was really a path-construction bug driven
   by the tool's own output shape.

## Fix

- Added an explicit "non serve chiedere conferma, leggi direttamente" line
  for `github_read` in the system prompt, plus explicit guidance on using
  the full path when descending.
- `githubRead()` now normalizes leading/trailing slashes and
  percent-encodes each path segment individually (not just `encodeURI` on
  the whole string, which leaves spaces untouched).
- Folder listings now render **each entry's full path from the repo root**
  (e.g. `lib/horus/src/tools.ts`, not `tools.ts`), plus one line telling the
  model to reuse that exact full path to go deeper. This directly fixed the
  traversal issue — the model previously had no way to know the correct
  path to send next.

## Residual known quirk (not fixed by this, separate issue)

Bowie (llama3.2:3b) sometimes emits a *textual* tool call (raw JSON like
`{"name": "web_search", ...}`) for a tool that wasn't attached to that turn
by contextual tool selection, instead of calling `github_read` again. This
is a contextual-tool-selection gap, not a traversal bug — see
`horus-textual-tool-call-fallback.md` and `horus-missing-tool-sentinel.md`
for the existing (partial) handling of this class of issue.
