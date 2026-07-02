import { createHash } from "crypto";
import type { Request } from "express";

export function hashIp(ip: string): string {
  return createHash("sha256").update(ip).digest("hex");
}

/**
 * Resolves the client IP to use for both rate-limiting and per-visitor
 * like dedup. Express's `trust proxy` setting (see app.ts) makes `req.ip`
 * read the real client address from `X-Forwarded-For` as set by Replit's
 * trusted reverse proxy.
 *
 * IMPORTANT: never key a per-visitor limiter off `req.socket.remoteAddress`
 * in this deployment. Behind the proxy, every request's TCP peer is the
 * proxy itself, so `remoteAddress` is identical for all visitors — using it
 * silently turns a "per-visitor" bucket into one bucket shared by everyone,
 * defeating the limiter without any error or log to reveal it.
 */
export function getClientIp(req: Request): string {
  return req.ip ?? req.socket.remoteAddress ?? "unknown";
}

interface RateLimiterOptions {
  windowMs: number;
  max: number;
}

/**
 * Simple in-memory sliding-window token bucket, keyed per caller-supplied
 * string (normally the client IP from getClientIp). Each call site should
 * create its own limiter instance so different action types (post likes vs
 * comment likes) never share a bucket or budget.
 *
 * Caveat: this state is per-process. Under multi-instance autoscale, each
 * instance keeps its own bucket, so the effective ceiling is
 * `max * instanceCount`, not `max`. The hard guarantee against a single
 * visitor liking the same target twice is the DB unique index on
 * (postId/commentId, ipHash), which is instance-independent; this limiter
 * is only a best-effort throttle on burst volume across *different*
 * targets, consistent with the project's threat model (soft DoS control,
 * not a hard one).
 */
export function createLikeRateLimiter({ windowMs, max }: RateLimiterOptions) {
  const buckets = new Map<string, number[]>();

  setInterval(() => {
    const cutoff = Date.now() - windowMs;
    for (const [key, timestamps] of buckets) {
      const remaining = timestamps.filter((t) => t > cutoff);
      if (remaining.length === 0) buckets.delete(key);
      else buckets.set(key, remaining);
    }
  }, 5 * 60_000).unref();

  return function checkLikeRateLimit(key: string): boolean {
    const now = Date.now();
    const cutoff = now - windowMs;
    const bucket = (buckets.get(key) ?? []).filter((t) => t > cutoff);
    if (bucket.length >= max) return false;
    bucket.push(now);
    buckets.set(key, bucket);
    return true;
  };
}
