---
name: nginx sites-enabled backup file gotcha
description: On Debian-style nginx, dropping a .bak file inside sites-enabled/ (or sites-available/, snippets/) breaks `nginx -t` with confusing "duplicate default server" errors — always move backups out of nginx config dirs before testing.
---

Debian/Ubuntu nginx setups typically `include` everything in `sites-enabled/*`
(and often `snippets/*`) with a glob, not just symlinked vhost files. If you
copy a backup like `graphhopper.bak-cleanup-xyz` into the same directory
before editing, nginx will parse it as a live config file too.

**Why:** this produces misleading errors like "a duplicate default server for
0.0.0.0:80" that look like a logic bug in the edit, when the real cause is an
inert backup file sitting where nginx's include glob can see it.

**How to apply:** when editing files under `/etc/nginx/sites-enabled/`,
`/etc/nginx/sites-available/`, or `/etc/nginx/snippets/`, write backups to a
directory outside nginx's config tree (e.g. `/root/nginx-cleanup-backups/`)
before running `sudo nginx -t`. If `nginx -t` fails right after an edit with
an unrelated-looking duplicate-server or unexpected-include error, check for
stray `*.bak*` files in those three directories first.

Also: `sites-available/<name>` and `sites-enabled/<name>` are sometimes real
separate files (not a symlink pair) on hand-maintained hosts — a fix applied
to one does not automatically apply to the other; grep both.
