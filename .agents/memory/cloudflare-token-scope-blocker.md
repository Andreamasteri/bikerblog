---
name: Cloudflare API token scope — DNS only, no Zero Trust
description: History of getting CLOUDFLARE_API_TOKEN scoped for Tunnel/Access automation — RESOLVED 2026-07-05. Read this if a future token rotation loses Zero Trust scope again.
---

**RESOLVED (2026-07-05).** Current token has DNS edit (zone-scoped) + Account
Cloudflare Tunnel Edit + Access: Apps and Policies Edit + Access: Service
Tokens Edit. All three account-level Zero Trust endpoints confirmed working:
`/accounts/:id/cfd_tunnel`, `/accounts/:id/access/apps`,
`/accounts/:id/access/service_tokens`.

**Non-obvious gotcha for next time:** `GET /accounts` (the list-accounts
endpoint) needs a *separate* "Account Settings: Read" permission that is NOT
implied by Tunnel/Access/Service-Token edit permissions — it returned an
empty list throughout this whole exercise even after all three Zero Trust
permissions were correctly added and confirmed working. **Don't use
`/accounts` as your scope-verification probe.** Get the account ID once from
`GET /zones?name=<zone>` (`result[0].account.id`), then hit the actual
resource endpoints (`cfd_tunnel`, `access/apps`, `access/service_tokens`)
directly with that account ID to verify scope.

**Also non-obvious:** editing an existing token's permissions in the
Cloudflare dashboard does NOT change its token ID or secret value — so if a
permission check still fails after an "update", verify via the token's
secret-value hash (or just create a fresh token) rather than trusting that
"I edited it" means the value in Replit's secret changed. In this session,
two rounds of "I updated it" turned out to be edits to the wrong token
entirely (same ID/hash as before); only creating a brand-new token surfaced
a real ID/hash change.

**Current DNS state (read-only, confirmed 2026-07-05):** all hostnames CNAME
to tunnel `86122511-2752-4002-aec9-1fdd7c25b9f5.cfargotunnel.com`
(`bikerlink-tc`, healthy) — `analysis`, `gh`, `hub`, `nominatim`, `ollama-tc`,
`searxng`, `ssh`, `tc`, `valhalla`, `whisper` — except `ollama.biker-link.net`,
which still CNAMEs to the dead tunnel
`4626e124-4601-43c2-bbda-78ef4295da2d.cfargotunnel.com` (`bikerlink-pc`) and
needs its DNS record deleted once the tunnel itself is confirmed torn down.

Account ID for `biker-link.net`: `d116d3d97b133c543d02934be4bc98d2`.
