---
name: Photon geocoding service on TC
description: How Photon (geocoding, OpenSearch-based) is run and exposed on TC — systemd unit, Cloudflare route, and shared Access token reuse.
---

Photon (komoot, `photon-1.2.1.jar`) runs on TC as a systemd service (`photon.service`,
`User=andrea`, binds `127.0.0.1:2322` only), using a pre-downloaded 44GB Europe
OpenSearch index (`/home/andrea/photon/photon_data`) — no Nominatim dependency,
no local build/import needed.

Exposed publicly at `photon.biker-link.net` through the existing `bikerlink-tc`
Cloudflare Tunnel (dashboard/API-managed ingress, no local `config.yml` on TC).

**Key reuse decision**: did NOT create a new per-service Cloudflare Access
application/policy/service-token from scratch. Cloudflare Access policies here
are **reusable objects** (`reusable: true`) shared across apps — whisper,
nominatim, valhalla, gh, ollama-tc, and now photon all reference the *same*
policy id (`Allow bikerlink-tc-access service token`) and the *same* underlying
service token (`bikerlink-tc-access`), whose Client ID/Secret are already the
`CF_ACCESS_CLIENT_ID`/`CF_ACCESS_CLIENT_SECRET` Replit secrets used by
`lib/horus/src/tools.ts` (`tcServiceAuthHeaders`). Only a new Access
*application* (`self_hosted`, domain-scoped) was created and pointed at that
existing policy id — no new token, no new secret needed.

**Why:** matches the established pattern for every other TC geo/STT service
(see `tc-geo-stt-services.md`) and avoids secret sprawl — one shared
service-token identity per TC-service surface, gated per-hostname by Access
apps rather than per-token.

**How to apply:** when exposing any new TC-hosted service the same way, check
`/accounts/:id/access/policies` for the existing reusable policy first and
attach it by id in the new app's `policies` array, instead of provisioning a
new service token.
