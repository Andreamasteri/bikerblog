---
name: Mode-gated JSX ternary chains
description: A ternary chain at the end of a multi-mode page rendered its final "else" branch on every mode it didn't explicitly check, not just the intended one — causing a saved-conversations panel to always show below every chat tab, eating vertical space.
---

## The problem

`artifacts/bikerblog/src/pages/horus-chat.tsx` renders per-mode sections. The
first three modes (`chat`, `bowie-chat`, `quebracho-chat`) were correctly
gated with `className={mode === "X" ? "flex-1 ..." : "hidden"}` — always
mounted, just CSS-hidden when inactive.

But the block handling `conversation` / `history` / `viewingConvo` was a
separate, sibling JSX expression with its own ternary chain:

```jsx
{mode === "conversation" && healthNotOk ? (...)
  : mode === "conversation" ? (...)
  : viewingConvo ? (...)
  : (/* default: saved-conversations list, including the
       "Nessuna conversazione..." empty state */)}
```

This chain had no top-level gate. Whenever `mode` was `chat`, `bowie-chat`,
or `quebracho-chat` (none of which the chain checks), execution always fell
through to the final `else` branch and rendered the saved-conversations
panel — visibly stacked below the active chat's messages/input on every tab,
not just when the user was actually looking at history.

**Why:** it's easy to add a new mode's `if` branches to a growing ternary
chain without noticing the chain's *default* branch is reachable from modes
it was never meant to cover.

## The fix

Wrap the entire chain in a single top-level condition covering every mode it
should apply to:

```jsx
{(mode === "conversation" || mode === "history" || viewingConvo) && (
  mode === "conversation" && healthNotOk ? (...) : ... : (/* default */)
)}
```

**How to apply:** when a page has more than ~2 modes and a tail-ternary
JSX block, always ask "what happens when mode is none of these?" — if the
answer is "falls through to the last branch", it needs an explicit top-level
gate, not just more `else if` branches.
