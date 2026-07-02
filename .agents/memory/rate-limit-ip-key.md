---
name: Rate limiter must key off req.ip, not socket.remoteAddress
description: Why per-visitor in-memory rate limiters silently break behind Replit's trust-proxy setup, and how likes rate limiting was hardened.
---

Any per-visitor in-memory limiter (or dedup key) in this app must use `req.ip`
(via `getClientIp` in `artifacts/api-server/src/lib/like-rate-limit.ts`), never
`req.socket.remoteAddress`.

**Why:** `app.ts` sets `trust proxy = 1`, so `req.ip` correctly resolves the
real client address from `X-Forwarded-For` set by Replit's reverse proxy. But
`req.socket.remoteAddress` is the TCP peer, which behind that proxy is the
proxy's own internal address — identical for every visitor. Keying a
"per-visitor" bucket off it silently pools all visitors into one shared
bucket, defeating the limiter with no error or log to reveal it. This was the
root cause found when hardening the comment/post like rate limiters (they
previously used `remoteAddress` for the bucket key but `req.ip` for the
persisted `ip_hash`, so the two didn't even agree with each other).

**How to apply:** When adding any new per-IP throttle or abuse control in this
API, reuse `getClientIp`/`createLikeRateLimiter` from
`artifacts/api-server/src/lib/like-rate-limit.ts` rather than reading
`req.socket.remoteAddress` directly. Also remember: in-memory limiters are
per-process, so multi-instance autoscale multiplies the effective ceiling by
instance count — the DB-level unique constraint on (target id, ip_hash) is the
only instance-independent hard guarantee against exact duplicate likes.
