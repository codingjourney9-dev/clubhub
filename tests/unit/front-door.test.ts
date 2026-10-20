import { describe, expect, it } from "vitest";

import { signInReason } from "@/lib/auth/sign-in-reason";
import { seatsLabel } from "@/lib/domain/seats";

describe("seatsLabel", () => {
  it("says 'Open entry' when there is no limit", () => {
    expect(seatsLabel(null, 500, false)).toEqual({ text: "Open entry", tone: "open" });
  });

  it("counts seats left while there are plenty", () => {
    expect(seatsLabel(120, 47, false)).toEqual({ text: "73 seats left", tone: "open" });
  });

  it("warns when only a few are left (5, or 10% of a big room)", () => {
    expect(seatsLabel(40, 35, false)).toEqual({ text: "Only 5 left", tone: "low" });
    expect(seatsLabel(40, 34, false)).toEqual({ text: "6 seats left", tone: "open" });
    expect(seatsLabel(300, 271, false)).toEqual({ text: "Only 29 left", tone: "low" });
  });

  it("says full, and mentions the waitlist only when there is one", () => {
    expect(seatsLabel(6, 6, false)).toEqual({ text: "Full", tone: "full" });
    expect(seatsLabel(6, 6, true)).toEqual({ text: "Full · waitlist open", tone: "full" });
    // Overbooked data (should never happen) still reads as full, never negative.
    expect(seatsLabel(6, 9, true).text).toBe("Full · waitlist open");
  });
});

describe("signInReason", () => {
  it("explains club creation and ticket redirects", () => {
    expect(signInReason("/onboarding")).toMatch(/President/);
    expect(signInReason("/events/0f1d2c3b-4a59-4e6d-8b7c-300000000005")).toMatch(/ticket/);
  });

  it("stays quiet for everything else", () => {
    expect(signInReason("/dashboard")).toBeNull();
    expect(signInReason("/events")).toBeNull();
    expect(signInReason("/events/abc/door")).toBeNull();
  });
});
