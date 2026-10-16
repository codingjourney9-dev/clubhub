import { describe, expect, it } from "vitest";

import { findAvailableSlug, generateInviteToken, slugify } from "../../src/lib/slug";

describe("slugify", () => {
  it("turns a club name into a URL-safe slug", () => {
    expect(slugify("Robotics Club!!")).toBe("robotics-club");
    expect(slugify("  Debating   Society  ")).toBe("debating-society");
    expect(slugify("C++ & Java")).toBe("c-java");
  });

  it("strips accents instead of dropping the letters", () => {
    expect(slugify("École Polytechnique")).toBe("ecole-polytechnique");
  });

  it("never returns an empty slug", () => {
    expect(slugify("")).toBe("item");
    expect(slugify("!!!")).toBe("item");
  });

  it("caps the length and never ends with a dash", () => {
    const slug = slugify("A".repeat(80) + " robotics");
    expect(slug.length).toBeLessThanOrEqual(60);
    expect(slug.endsWith("-")).toBe(false);
  });
});

describe("findAvailableSlug", () => {
  it("returns the plain slug when it is free", async () => {
    await expect(findAvailableSlug("Robotics Club", async () => false)).resolves.toBe("robotics-club");
  });

  it("appends a counter until it finds a free name", async () => {
    const taken = new Set(["robotics-club", "robotics-club-2", "robotics-club-3"]);
    await expect(
      findAvailableSlug("Robotics Club", async (candidate) => taken.has(candidate)),
    ).resolves.toBe("robotics-club-4");
  });

  it("falls back to a random suffix instead of failing the request", async () => {
    // Every deterministic candidate is taken, so uniqueness has to come from randomness.
    const slug = await findAvailableSlug("Robotics", async () => true, 3);
    expect(slug).toMatch(/^robotics-[a-z0-9]{5}$/);
  });
});

describe("generateInviteToken", () => {
  it("is URL-safe and unguessable in shape", () => {
    const token = generateInviteToken();
    // 32 random bytes → 43 base64url characters, no padding.
    expect(token).toHaveLength(43);
    expect(token).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(token).not.toContain("=");
  });

  it("never repeats itself", () => {
    const tokens = new Set(Array.from({ length: 1000 }, () => generateInviteToken()));
    expect(tokens.size).toBe(1000);
  });
});
