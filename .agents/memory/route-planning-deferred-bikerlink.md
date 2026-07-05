---
name: Route planning (GraphHopper+Valhalla) deferred to BikerLink
description: Why the "combine GraphHopper+Valhalla routing" work is intentionally NOT built in this repo — owned by BikerLink side.
---

# Route planning: deferred, owned by BikerLink — DO NOT build here

The user's long-term intent for Horus is a real **route-planning** capability that
combines **GraphHopper + Valhalla data together**, optionally using the rider's
**own telemetry**, plus **Nominatim** for geocoding.

**Decision (2026-07-05):** do NOT build this integration in the BikerBlog repo.
The user explicitly paused it: *"Lascia in sospeso la cosa, completerò con
BikerLink... BikerLink ha già tutto predisposto"* — there is a dedicated task and
the whole interface already prepared on the BikerLink side.

**Why:** BikerLink already owns the route-planning interface/logic (GraphHopper
returns the encoded road polyline via `server/routes/planned-routes.ts` +
`decodePolyline()`; 8 regional GraphHopper map instances loaded one-by-one to
avoid needing huge cloud servers — see `inbox/bikerlink-history/tasks.md` #1313,
`inbox/diary-notes-2026-06-03/04.md`). Duplicating it in Horus tools = feature
creep (violates the John Connor anti-creep policy in replit.md).

**How to apply:** if a future session is asked to "make routing use both
engines" / "integrate GraphHopper and Valhalla", stop and confirm scope with the
user first. Current `route_directions` (lib/horus/src/tools.ts, `valhallaBaseUrl`,
`VALHALLA_URL` only) is intentionally Valhalla-only. No `GRAPHHOPPER_URL` env or
GraphHopper client exists by design.

**Infra state note (2026-07-05, changed from prior sessions):** both engines are
now exposed behind Cloudflare Access — `valhalla.biker-link.net` returns 403
(was 502; ingress fixed) and `gh.biker-link.net` returns 403 (previously
127.0.0.1-only on TC, now tunneled). So reachability is no longer the blocker;
the work is simply deferred to BikerLink.
