import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  annotateRequest,
  currentRequestContext,
  newRequestId,
  runWithRequestContext,
} from "@/lib/observability/context";
import { logEvent, logRequest, redactPath } from "@/lib/observability/logger";

/**
 * The log is a product surface: it is what an on-call engineer has at 2 a.m.
 * Two properties matter and are tested here — it never leaks a secret, and it
 * carries enough context to answer "who did what, and how long did it take".
 */

function captureLines(): string[] {
  const lines: string[] = [];
  vi.spyOn(console, "log").mockImplementation((line) => lines.push(String(line)));
  vi.spyOn(console, "warn").mockImplementation((line) => lines.push(String(line)));
  vi.spyOn(console, "error").mockImplementation((line) => lines.push(String(line)));
  return lines;
}

beforeEach(() => {
  vi.stubEnv("LOG_LEVEL", "debug");
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
});

describe("redactPath", () => {
  it("keeps ids and short words", () => {
    expect(redactPath("/api/events/0f1d2c3b-4a59-4e6d-8b7c-300000000005/attendance")).toBe(
      "/api/events/0f1d2c3b-4a59-4e6d-8b7c-300000000005/attendance",
    );
  });

  it("hides an invite token, which is a credential", () => {
    expect(redactPath("/api/invites/demo-invite-robotics-club-000000000001")).toBe(
      "/api/invites/<redacted>",
    );
  });

  it("drops the query string entirely", () => {
    expect(redactPath("/demo?as=aarav&token=secret")).toBe("/demo");
  });
});

describe("logEvent", () => {
  it("writes one line of JSON with a stable event name", () => {
    const lines = captureLines();

    logEvent("info", "seed.finished", { events: 5 });

    expect(lines).toHaveLength(1);
    const parsed = JSON.parse(lines[0] ?? "{}");
    expect(parsed.event).toBe("seed.finished");
    expect(parsed.level).toBe("info");
    expect(parsed.events).toBe(5);
    expect(typeof parsed.ts).toBe("string");
  });

  it("respects LOG_LEVEL", () => {
    vi.stubEnv("LOG_LEVEL", "error");
    const lines = captureLines();

    logEvent("info", "quiet");
    logEvent("error", "loud");

    expect(lines).toHaveLength(1);
    expect(JSON.parse(lines[0] ?? "{}").event).toBe("loud");
  });
});

describe("request context", () => {
  it("is carried into nested async calls", async () => {
    const context = {
      requestId: newRequestId(),
      method: "POST",
      path: "/api/x",
      startedAt: Date.now(),
    };

    await runWithRequestContext(context, async () => {
      await Promise.resolve();
      annotateRequest({ userId: "user-1", tenantId: "tenant-1", actorRole: "PRESIDENT" });
      expect(currentRequestContext()?.userId).toBe("user-1");
    });

    expect(context).toMatchObject({ userId: "user-1", tenantId: "tenant-1" });
  });

  it("does nothing outside a request — services are also used by scripts", () => {
    expect(() => annotateRequest({ userId: "nobody" })).not.toThrow();
    expect(currentRequestContext()).toBeUndefined();
  });

  it("logs one line per request with the tenant, the user and the duration", async () => {
    const lines = captureLines();

    await runWithRequestContext(
      { requestId: "req-1", method: "POST", path: "/api/events/x/check-in", startedAt: Date.now() - 12 },
      async () => {
        annotateRequest({ userId: "u-1", tenantId: "t-1", actorRole: "PRESIDENT" });
        logRequest({ context: currentRequestContext()!, status: 200, durationMs: 12 });
      },
    );

    const parsed = JSON.parse(lines[0] ?? "{}");
    expect(parsed).toMatchObject({
      event: "api.request",
      requestId: "req-1",
      method: "POST",
      path: "/api/events/x/check-in",
      status: 200,
      userId: "u-1",
      tenantId: "t-1",
      actorRole: "PRESIDENT",
      level: "info",
    });
    expect(parsed.durationMs).toBeGreaterThanOrEqual(0);
  });

  it("grades the level by status: 4xx warns, 5xx errors", () => {
    const lines = captureLines();
    const base = { requestId: "r", method: "GET", path: "/api/x", startedAt: Date.now() };

    logRequest({ context: base, status: 403, durationMs: 1 });
    logRequest({ context: base, status: 500, durationMs: 1 });

    expect(JSON.parse(lines[0] ?? "{}").level).toBe("warn");
    expect(JSON.parse(lines[1] ?? "{}").level).toBe("error");
  });
});
