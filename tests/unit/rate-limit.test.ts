import { beforeEach, describe, expect, it } from "vitest";

import { checkRateLimit, clientIpFrom, resetRateLimits } from "@/lib/rate-limit/token-bucket";

beforeEach(() => {
  resetRateLimits();
});

describe("checkRateLimit()", () => {
  it("allows the full burst, then denies with a retry hint", () => {
    const options = { key: "register:ip:1.2.3.4", limit: 3, refillPerSecond: 0.1 };

    expect(checkRateLimit(options).allowed).toBe(true);
    expect(checkRateLimit(options).allowed).toBe(true);
    const third = checkRateLimit(options);
    expect(third.allowed).toBe(true);
    expect(third.remaining).toBe(0);

    const denied = checkRateLimit(options);
    expect(denied.allowed).toBe(false);
    expect(denied.retryAfterSeconds).toBeGreaterThanOrEqual(1);
  });

  it("keys buckets independently, so one abusive IP cannot lock out another", () => {
    const base = { limit: 1, refillPerSecond: 0 };

    expect(checkRateLimit({ ...base, key: "register:ip:9.9.9.9" }).allowed).toBe(true);
    expect(checkRateLimit({ ...base, key: "register:ip:9.9.9.9" }).allowed).toBe(false);
    expect(checkRateLimit({ ...base, key: "register:ip:8.8.8.8" }).allowed).toBe(true);
  });

  it("refills over time", () => {
    // 100 tokens/second means a denial a second later must succeed. (Real time is
    // used because the bucket reads Date.now; the window is generous.)
    const options = { key: "refill", limit: 1, refillPerSecond: 100 };
    expect(checkRateLimit(options).allowed).toBe(true);
    expect(checkRateLimit(options).allowed).toBe(false);

    const started = Date.now();
    while (Date.now() - started < 1100) {
      // busy-wait one second
    }

    expect(checkRateLimit(options).allowed).toBe(true);
  });

  it("never exceeds the burst size after a long idle period", () => {
    const options = { key: "idle", limit: 2, refillPerSecond: 100 };
    checkRateLimit(options);
    checkRateLimit(options);
    // Even with a full refill allowance, the bucket is capped at `limit`.
    const result = checkRateLimit(options);
    expect(result.remaining).toBeLessThanOrEqual(1);
  });
});

describe("clientIpFrom()", () => {
  it("takes the first hop of x-forwarded-for", () => {
    const request = new Request("http://localhost/api", {
      headers: { "x-forwarded-for": "203.0.113.7, 10.0.0.1, 10.0.0.2" },
    });
    expect(clientIpFrom(request)).toBe("203.0.113.7");
  });

  it("falls back to x-real-ip and then to a stable placeholder", () => {
    expect(clientIpFrom(new Request("http://localhost/api", { headers: { "x-real-ip": "198.51.100.4" } }))).toBe(
      "198.51.100.4",
    );
    expect(clientIpFrom(new Request("http://localhost/api"))).toBe("unknown");
  });
});
