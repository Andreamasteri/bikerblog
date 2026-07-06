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
- writes to `/tmp/tc_ssh/key` with `0600` permissions

**How to apply:** always run this script (not manual `printf`/`echo`) at
the start of any session needing TC SSH access. If `TC_SSH_KEY` is ever
re-set with real newlines instead of spaces, the script's header/footer
split still works (splitting on any whitespace run), so it's safe either
way.
