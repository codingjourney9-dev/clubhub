import "server-only";

/**
 * Guards the rate-limit backend configuration.
 *
 * `.env.example` used to advertise `RATE_LIMIT_DRIVER=redis` as "required before
 * scaling horizontally". That was a promise the code did not keep: only the
 * in-memory bucket exists, so setting `redis` did **nothing** and an operator
 * could reasonably believe their limits were shared across instances while each
 * process quietly kept its own count. On a horizontally-scaled deploy that turns
 * a 5-per-minute invite limit into 5-per-minute *per instance* — the exact kind of
 * silent failure this project is supposed to avoid.
 *
 * So the flag is now honest: `memory` works, `redis` stops the process at boot
 * with a message that says what to build. Failing loudly beats believing a
 * guarantee that is not there.
 */

export type RateLimitDriver = "memory" | "redis";

export class UnsupportedRateLimitDriverError extends Error {
  constructor(driver: string) {
    super(
      `RATE_LIMIT_DRIVER="${driver}" is not implemented. ` +
        "ClubHub ships a per-process in-memory token bucket; sharing budgets across " +
        "instances needs a Redis-backed implementation of checkRateLimit() in " +
        "src/lib/rate-limit/token-bucket.ts. Use RATE_LIMIT_DRIVER=memory, or run a " +
        "single instance.",
    );
    this.name = "UnsupportedRateLimitDriverError";
  }
}

/**
 * Throws when the configured driver cannot actually be honoured.
 *
 * Called at module load of the token bucket, so a misconfigured deployment fails
 * on the first request instead of silently under-limiting.
 */
export function assertRateLimitDriverSupported(
  driver: string | undefined = process.env.RATE_LIMIT_DRIVER,
): RateLimitDriver {
  // Trim first: a trailing space in a .env file ("memory ") is easy to type and
  // would otherwise be read as an unknown driver and stop the app from booting.
  const normalised = (driver ?? "memory").trim().toLowerCase();

  if (normalised === "memory") return "memory";

  // Deliberately any non-memory value, not just "redis": a typo in an env file
  // must not silently fall back to "memory" either.
  throw new UnsupportedRateLimitDriverError(normalised);
}
