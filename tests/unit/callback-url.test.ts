import { describe, expect, it } from "vitest";

import { authHref, safeCallbackUrl } from "@/lib/auth/callback-url";

describe("safeCallbackUrl", () => {
  it("keeps paths on this site, including query strings", () => {
    expect(safeCallbackUrl("/onboarding")).toBe("/onboarding");
    expect(safeCallbackUrl("/events/abc?tab=roster")).toBe("/events/abc?tab=roster");
  });

  it("falls back to the dashboard when nothing usable is given", () => {
    expect(safeCallbackUrl(undefined)).toBe("/dashboard");
    expect(safeCallbackUrl(null)).toBe("/dashboard");
    expect(safeCallbackUrl("")).toBe("/dashboard");
    expect(safeCallbackUrl(["/a", "/b"])).toBe("/dashboard");
    expect(safeCallbackUrl("/" + "a".repeat(600))).toBe("/dashboard");
  });

  it.each([
    "https://evil.example",
    "http://evil.example/dashboard",
    "javascript:alert(1)",
    "//evil.example",
    "/\\evil.example",
    "/\t/evil.example",
    "/\n/evil.example",
    "evil.example",
  ])("refuses to leave the site: %j", (value) => {
    expect(safeCallbackUrl(value)).toBe("/dashboard");
  });

  it("does not bounce back into the sign-in or sign-up pages", () => {
    expect(safeCallbackUrl("/sign-in")).toBe("/dashboard");
    expect(safeCallbackUrl("/sign-up?callbackUrl=/x")).toBe("/dashboard");
    expect(safeCallbackUrl("/sign-insider")).toBe("/sign-insider");
  });

  it("honours a custom fallback", () => {
    expect(safeCallbackUrl("https://evil.example", "/events")).toBe("/events");
  });
});

describe("authHref", () => {
  it("carries a safe return path, encoded", () => {
    expect(authHref("/sign-in", "/onboarding")).toBe("/sign-in?callbackUrl=%2Fonboarding");
    expect(authHref("/sign-up", "/events/1?x=1&y=2")).toBe("/sign-up?callbackUrl=%2Fevents%2F1%3Fx%3D1%26y%3D2");
  });

  it("drops unsafe or empty return paths entirely", () => {
    expect(authHref("/sign-in", "https://evil.example")).toBe("/sign-in");
    expect(authHref("/sign-up", null)).toBe("/sign-up");
  });
});
