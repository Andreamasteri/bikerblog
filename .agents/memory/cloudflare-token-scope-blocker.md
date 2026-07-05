---
name: Cloudflare API token scope — DNS only, no Zero Trust
description: CLOUDFLARE_API_TOKEN currently only grants dns_records:edit/read + zone:read on the biker-link.net zone; no account access, no Access/Tunnel (Zero Trust) API scope. Blocks any Tunnel/Access-app/service-token automation via API.
---

Verified 2026-07-05 (Fase 2c, Step 5): `GET /zones?name=biker-link.net` with
`CLOUDFLARE_API_TOKEN` returns `permissions:
["#dns_records:edit","#dns_records:read","#zone:read"]` and `GET /accounts`
returns an empty list — the token has **no account-level access at all**,
only DNS edit/read scoped to the one zone.

**Why this matters:** Cloudflare Tunnels, Access applications, and Access
service tokens are all account-level Zero Trust resources
(`/accounts/:id/cfd_tunnel`, `/accounts/:id/access/apps`,
`/accounts/:id/access/service_tokens`). None of them are reachable with a
zone-scoped DNS token — there is no way to list, create, or delete a tunnel,
Access app, or service token via API with the current credential.

**How to apply:** before attempting any Cloudflare Tunnel/Access/service-token
rebuild via the API, re-verify token scope with
`GET /zones?name=<zone>` (check `permissions`) and `GET /accounts` (check
non-empty). If still DNS-only, the work must go through one of:
1. Ask the user to reissue `CLOUDFLARE_API_TOKEN` with added permissions
   (Account → Cloudflare Tunnel: Edit, Access: Apps and Policies: Edit,
   Access: Service Tokens: Edit) — same secret, new scope.
2. Provide the user a manual runbook to execute in the Zero Trust dashboard,
   using the project's naming convention
   (`.agents/memory/naming-convention-agents-infra.md`).
DNS record CRUD (CNAMEs to `*.cfargotunnel.com`) DOES work with the current
token and can be automated once new tunnel IDs exist.

**Current DNS state (read-only, confirmed 2026-07-05):** all hostnames CNAME
to tunnel `86122511-2752-4002-aec9-1fdd7c25b9f5.cfargotunnel.com`
(`bikerlink-tc`, healthy) — `analysis`, `gh`, `hub`, `nominatim`, `ollama-tc`,
`searxng`, `ssh`, `tc`, `valhalla`, `whisper` — except `ollama.biker-link.net`,
which still CNAMEs to the dead tunnel
`4626e124-4601-43c2-bbda-78ef4295da2d.cfargotunnel.com` (`bikerlink-pc`) and
needs its DNS record deleted once the tunnel itself is confirmed torn down.
