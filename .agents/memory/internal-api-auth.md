---
name: Internal API auth via SESSION_SECRET
description: Why /_internal/* automation endpoints derive their bearer token from SESSION_SECRET instead of a dedicated secret.
---

## Design

`/_internal/*` endpoints (used by scheduled scripts, self-check, and podcast ingestion) authenticate via `HMAC(SESSION_SECRET, "internal-api-token-v1")` as the bearer token, rather than a separately issued secret.

**Why:** avoids provisioning and rotating an extra secret just for script→server calls — `SESSION_SECRET` already exists and is already trusted server-side, so deriving a fixed-purpose token from it (with a distinct HMAC "purpose" string) gives a stable, non-guessable credential without adding new secret-management surface.

**How to apply:** any new internal-only automation route should reuse this same derivation (same HMAC purpose string) rather than inventing a new token scheme. If a route ever needs a genuinely different trust level (e.g. a third-party webhook), that's a signal to introduce a dedicated secret instead of overloading this one.
