---
name: TC (thinkcentre) direct SSH access
description: How to reach the user's TC box command line directly via SSH over the Cloudflare Access tunnel, and pitfalls hit while setting it up.
---

## What TC SSH access is

Beyond the HTTP-only Horus/Bowie/SearXNG/analysis services already documented in `horus-integration.md`, this project can also get a real interactive shell on TC via SSH tunneled through Cloudflare Access (same tunnel infra, different protocol). This is separate from and complementary to the HTTP tool integrations.

**Secrets involved:** `TC_SSH_HOST`, `TC_SSH_USER`, `TC_SSH_KEY` (private key, OpenSSH format), plus the existing `CF_ACCESS_CLIENT_ID`/`CF_ACCESS_CLIENT_SECRET` used for Cloudflare Access.

**Connection pattern** (the plain `ssh -i key user@host` request times out — the hostname resolves to Cloudflare's proxy IPs and raw port 22 isn't passed through):

```bash
ssh -i ~/.ssh/tc_key -o ProxyCommand="cloudflared access ssh --hostname %h" "$TC_SSH_USER@$TC_SSH_HOST" 'command'
```

`cloudflared` (already present via nix) handles the Access-authenticated tunnel; `CF_ACCESS_CLIENT_ID/SECRET` must be in the environment for it to authenticate non-interactively.

## Pitfalls hit during setup (2026-07-04)

1. **Multiple stored keys can silently be different keypairs.** Two secrets that both "look like" the TC key (e.g. a plain and a base64-encoded variant) had completely different key material — only one (or neither) may match `authorized_keys` on the server. Always derive and compare the fingerprint (`ssh-keygen -l -f`) rather than assuming secrets with similar names are copies of the same key.

2. **The agent cannot write TC's `authorized_keys` itself** (no access yet, chicken-and-egg) — the user must paste the public key on TC by hand. Confirm which OS user they added it to; `TC_SSH_USER` in secrets must match exactly (a mismatch, e.g. key added for `andrea` while secrets said `replit-agent`, produces the same generic `Permission denied (publickey,password)` as a wrong key, with no distinguishing error).

3. **Users can paste the public key into the private-key secret by mistake** (or vice versa) — both are plausible-looking blobs to a non-technical eye. If `ssh-keygen -l -f <file>` succeeds but `ssh-keygen -y -f <file>` or `openssl pkey -in <file>` fails, or the file is a single `ssh-ed25519 AAAA... comment` line, that's the public key, not private — ask the user to re-paste the `-----BEGIN OPENSSH PRIVATE KEY-----` block instead.

4. **Pasting into a secrets UI text field can flatten newlines into spaces**, turning a valid multi-line PEM-style key into one line (`-----BEGIN...----- <base64 with spaces> -----END...-----`). `ssh`/`ssh-keygen` then fail with `error in libcrypto` / "is not a key file" even though the fingerprint step may still partially work. Fix by reconstructing the file programmatically: split on the BEGIN/END markers, replace remaining spaces in the body with newlines, and rewrite with real line breaks — don't ask the user to fix whitespace themselves, just repair it in code before writing the key file.

**How to apply:** when setting up or debugging any new SSH-based access to user hardware, verify with `ssh-keygen -l -f` at every step (after receiving the secret, after any reformatting) and don't re-attempt the exact same failing command — diagnose via fingerprint comparison and raw file inspection (`cat -A`) first.
