import { describe, expect, it } from "vitest";

import {
  assertRateLimitDriverSupported,
  UnsupportedRateLimitDriverError,
} from "@/lib/rate-limit/driver";

/**
 * A configuration guard, tested like one.
 *
 * The failure mode this prevents is not a crash — it is a deployment that *looks*
 * fine. If `RATE_LIMIT_DRIVER=redis` were accepted silently, an operator would
 * believe limits were shared across instances while each process kept its own
 * count, and the first sign of trouble would be a burst of duplicate invites.
 */

describe("assertRateLimitDriverSupported", () => {
  it("accepts the in-memory driver", () => {
    expect(assertRateLimitDriverSupported("memory")).toBe("memory");
  });

  it("defaults to memory when unset", () => {
    expect(assertRateLimitDriverSupported(undefined)).toBe("memory");
  });

  it("is case-insensitive and tolerates whitespace in the env file", () => {
    expect(assertRateLimitDriverSupported(" MEMORY ")).toBe("memory");
  });

  it("refuses redis, which is documented as an option but not implemented", () => {
    expect(() => assertRateLimitDriverSupported("redis")).toThrow(
      UnsupportedRateLimitDriverError,
    );
  });

  it("explains what to do next, not just that it failed", () => {
    try {
      assertRateLimitDriverSupported("redis");
      expect.unreachable("should have thrown");
    } catch (error) {
      const message = (error as Error).message;
      expect(message).toContain("RATE_LIMIT_DRIVER");
      expect(message).toContain("token-bucket");
      // The safe option must be named, or the message is just a roadblock.
      expect(message).toContain("memory");
    }
  });

  it("treats a typo as an error rather than silently falling back", () => {
    expect(() => assertRateLimitDriverSupported("redsi")).toThrow(
      UnsupportedRateLimitDriverError,
    );
    expect(() => assertRateLimitDriverSupported("")).toThrow(UnsupportedRateLimitDriverError);
  });
});
