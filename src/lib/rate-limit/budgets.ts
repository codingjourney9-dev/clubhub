import "server-only";

import { ApiError } from "@/lib/api/response";
import { checkRateLimit, type RateLimitResult } from "@/lib/rate-limit/token-bucket";

/**
 * Per-action budgets.
 *
 * Phase 2 introduced the token bucket for the public registration endpoint. The
 * point of naming budgets here is that a limit is a product decision, not a
 * number sprinkled into a handler: "a student may claim and drop a few seats a
 * minute" is a sentence about the product, and it belongs in one table.
 *
 * Keys are prefixed with the **authenticated user id** wherever one exists.
 * That is deliberate: an IP address is shared by an entire campus behind one
 * NAT, so keying on it would let one busy lab exhaust everyone's budget.
 */
export const RATE_LIMITS = {
  /** Claiming a seat, or joining a waitlist. */
  rsvp: { limit: 20, refillPerSecond: 0.5, label: "claim seats" },
  /** Giving a seat back. Separate bucket, so cancelling never blocks RSVPing. */
  cancel: { limit: 20, refillPerSecond: 0.5, label: "cancel tickets" },
  /**
   * Scans at the door. Deliberately far larger than any other budget: a busy door
   * is 300 people in an hour, and a single offline flush can legitimately arrive
   * as 200 scans in one request. 600 burst with 10/second refill is 600 a minute
   * sustained — generous for a volunteer, still finite for a script.
   */
  scan: { limit: 600, refillPerSecond: 10, label: "scan tickets" },
  /**
   * Posting club announcements. A burst of 10 covers a busy evening; after that
   * one every 30 seconds — plenty for people, useless for a spam loop.
   */
  announce: { limit: 10, refillPerSecond: 1 / 30, label: "post announcements" },
  /** Applying to club openings: a handful at once is normal, a hundred is a script. */
  apply: { limit: 20, refillPerSecond: 1 / 60, label: "send applications" },
  /**
   * Asking for a new club (Phase 12). The real cap is "two waiting at once" in
   * the database; this stops a script creating and cancelling in a loop.
   */
  clubRequest: { limit: 10, refillPerSecond: 1 / 120, label: "start clubs" },
  /**
   * Typing professor codes. Each code allows five wrong tries anyway (counted
   * in the database); this bounds guessing across many fresh codes.
   */
  clubCode: { limit: 20, refillPerSecond: 1 / 30, label: "enter codes" },
} as const;

export type RateLimitAction = keyof typeof RATE_LIMITS;

/**
 * Consumes one token from `action`'s budget for this actor, or throws a 429.
 *
 * The thrown error carries `Retry-After`, so a well-behaved client knows exactly
 * how long to wait instead of hammering the endpoint in a loop.
 */
export function enforceRateLimit(action: RateLimitAction, userId: string): RateLimitResult {
  const budget = RATE_LIMITS[action];

  const result = checkRateLimit({
    key: `${action}:user:${userId}`,
    limit: budget.limit,
    refillPerSecond: budget.refillPerSecond,
  });

  if (!result.allowed) {
    throw new ApiError(
      "RATE_LIMITED",
      `You are trying to ${budget.label} too quickly. Try again in ${result.retryAfterSeconds} second${
        result.retryAfterSeconds === 1 ? "" : "s"
      }.`,
      {
        headers: { "Retry-After": String(result.retryAfterSeconds) },
        details: { retryAfterSeconds: result.retryAfterSeconds },
      },
    );
  }

  return result;
}
