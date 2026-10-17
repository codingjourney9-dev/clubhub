import "server-only";

import { assertRateLimitDriverSupported } from "@/lib/rate-limit/driver";

/**
 * In-memory token bucket, deliberately tiny.
 *
 * It exists so the public registration endpoint cannot be scripted into
 * creating thousands of accounts. Phase 5 generalises this into
 * `src/lib/rate-limit/` with a Redis driver and adds per-action budgets for
 * RSVPs and invites; this module stays the contract those call sites use.
 *
 * Caveat: state is per-process, so N instances allow N times the budget. There is
 * no Redis implementation yet, and `assertRateLimitDriverSupported` refuses to
 * start rather than let a `redis` setting pretend otherwise — see driver.ts.
 */

// Fail at load time, not quietly per request.
assertRateLimitDriverSupported();

export interface RateLimitResult {
  readonly allowed: boolean;
  readonly limit: number;
  readonly remaining: number;
  /** Seconds until the next token is available. */
  readonly retryAfterSeconds: number;
}

interface Bucket {
  tokens: number;
  updatedAt: number;
}

const buckets = new Map<string, Bucket>();

export interface RateLimitOptions {
  /** Identifies the caller + action, e.g. `register:ip:1.2.3.4`. */
  readonly key: string;
  /** Bucket size (burst). */
  readonly limit: number;
  /** Token refill rate per second. */
  readonly refillPerSecond: number;
}

export function checkRateLimit({ key, limit, refillPerSecond }: RateLimitOptions): RateLimitResult {
  const now = Date.now();
  const bucket = buckets.get(key) ?? { tokens: limit, updatedAt: now };

  const elapsedSeconds = (now - bucket.updatedAt) / 1000;
  bucket.tokens = Math.min(limit, bucket.tokens + elapsedSeconds * refillPerSecond);
  bucket.updatedAt = now;

  if (bucket.tokens < 1) {
    const deficit = 1 - bucket.tokens;
    buckets.set(key, bucket);
    return {
      allowed: false,
      limit,
      remaining: 0,
      retryAfterSeconds: Math.max(1, Math.ceil(deficit / refillPerSecond)),
    };
  }

  bucket.tokens -= 1;
  buckets.set(key, bucket);

  return {
    allowed: true,
    limit,
    remaining: Math.floor(bucket.tokens),
    retryAfterSeconds: 0,
  };
}

/**
 * Best-effort client IP.
 *
 * This trusts `x-forwarded-for`, which is only safe because the app always runs
 * behind a proxy that OVERWRITES it (Vercel, nginx, the sandbox preview proxy).
 * If the app is ever exposed directly, the header is client-controlled and this
 * must fall back to the socket address instead. Phase 5 prefers the
 * authenticated user id wherever one exists, which sidesteps the issue entirely.
 */
export function clientIpFrom(request: Request): string {
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) {
    const first = forwarded.split(",")[0]?.trim();
    if (first) return first;
  }
  return request.headers.get("x-real-ip") ?? "unknown";
}

/** Test/ops hook — clears all buckets. */
export function resetRateLimits(): void {
  buckets.clear();
}
