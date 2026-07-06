---
name: TC_SSH_KEY newline-as-space encoding
description: Why manual /tmp/tc_ssh/key reconstruction from the TC_SSH_KEY secret kept failing, and the fixed one-command setup.
---

## The problem

`TC_SSH_KEY` (the secret) has its internal newlines collapsed into single
spaces — an artifact of how the multi-line OpenSSH private key was
originally pasted/set. A plain `printf '%s' "$TC_SSH_KEY" > key` therefore
produces a single-line file that OpenSSH's `ssh -i` rejects/hangs on,
since a valid key needs the header, base64 body wrapped across multiple
lines, and footer each on their own line.

**Why this kept recurring:** `/tmp` doesn't persist across agent sessions,
so the key file has to be rebuilt every session — and the naive
reconstruction silently produced a malformed (single-line) key, which
looked like "the login broke again" rather than a one-time formatting bug.

## The fix

`pnpm --filter @workspace/scripts run tc:ssh-setup` (script:
`scripts/src/tc-ssh-setup.ts`) reconstructs the key correctly:
- protects the multi-word header/footer (`-----BEGIN OPENSSH PRIVATE KEY-----`
  / `-----END ...-----`) before splitting
- treats every other whitespace run as a line break between base64 body
  chunks
- writes to `.local/tc_ssh/key` (not `/tmp`) with `0600` permissions

**Why `.local/` and not `/tmp`:** `/tmp` is wiped every agent session, so a
key written there had to be rebuilt every single session — this is what
the user meant by "temporary logins" and asked to be eliminated. `.local/`
is gitignored but persists across sessions for the life of the repl, so
running `tc:ssh-setup` once is enough; it never needs to be regenerated
again unless the repl's persistent storage itself is wiped or `TC_SSH_KEY`
is rotated. SSH commands must reference `.local/tc_ssh/key` (relative to
repo root), not `/tmp/tc_ssh/key`.

**How to apply:** run this script once (or whenever in doubt) instead of
manual `printf`/`echo` reconstruction, and always point `ssh -i` at
`.local/tc_ssh/key`. If `TC_SSH_KEY` is ever re-set with real newlines
instead of spaces, the script's header/footer split still works (splitting
on any whitespace run), so it's safe either way.
