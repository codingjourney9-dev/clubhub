import { describe, expect, it } from "vitest";

import {
  parseWallClock,
  utcToWallClock,
  wallClockToUtc,
  zoneAbbreviation,
} from "../../src/lib/format/date";

/**
 * Wall-clock conversion is where most scheduling bugs hide, so it is tested
 * before anything is built on top of it.
 *
 * The rule being upheld: a President types "09:00" and means 09:00 *at their
 * college*. It is stored as UTC and shown back as 09:00 — including across a
 * daylight-saving boundary, where the UTC offset itself changes.
 */

describe("parseWallClock", () => {
  it("accepts the exact shape the datetime-local input produces", () => {
    expect(parseWallClock("2026-11-01T09:00")).toEqual({
      year: 2026,
      month: 11,
      day: 1,
      hour: 9,
      minute: 0,
    });
  });

  it("rejects anything else, including a value with a timezone attached", () => {
    expect(parseWallClock("2026-11-01 09:00")).toBeNull();
    expect(parseWallClock("2026-11-01T09:00:00Z")).toBeNull();
    expect(parseWallClock("01/11/2026 09:00")).toBeNull();
    expect(parseWallClock("")).toBeNull();
  });
});

describe("wallClockToUtc", () => {
  it("converts a fixed-offset zone (India, UTC+5:30) exactly", () => {
    const instant = wallClockToUtc("2026-11-01T09:00", "Asia/Kolkata");
    expect(instant?.toISOString()).toBe("2026-11-01T03:30:00.000Z");
  });

  it("converts UTC to itself", () => {
    const instant = wallClockToUtc("2026-11-01T09:00", "UTC");
    expect(instant?.toISOString()).toBe("2026-11-01T09:00:00.000Z");
  });

  it("uses the SUMMER offset for a summer date in London (BST, UTC+1)", () => {
    // 1 July 2026 — London is on British Summer Time.
    const instant = wallClockToUtc("2026-07-01T09:00", "Europe/London");
    expect(instant?.toISOString()).toBe("2026-07-01T08:00:00.000Z");
  });

  it("uses the WINTER offset for a winter date in London (GMT, UTC+0)", () => {
    // 1 December 2026 — London is back on Greenwich Mean Time.
    const instant = wallClockToUtc("2026-12-01T09:00", "Europe/London");
    expect(instant?.toISOString()).toBe("2026-12-01T09:00:00.000Z");
  });

  it("straddles the American DST change correctly", () => {
    // New York: UTC-4 in summer, UTC-5 in winter.
    expect(wallClockToUtc("2026-07-01T09:00", "America/New_York")?.toISOString()).toBe(
      "2026-07-01T13:00:00.000Z",
    );
    expect(wallClockToUtc("2026-12-01T09:00", "America/New_York")?.toISOString()).toBe(
      "2026-12-01T14:00:00.000Z",
    );
  });

  it("refuses a wall clock that never happens (the spring-forward gap)", () => {
    // London jumps 01:00 → 02:00 on 29 March 2026, so 01:30 does not exist.
    expect(wallClockToUtc("2026-03-29T01:30", "Europe/London")).toBeNull();
  });

  it("resolves the repeated autumn hour to the earlier occurrence", () => {
    // London repeats 01:30 on 25 October 2026 (BST first, then GMT).
    const instant = wallClockToUtc("2026-10-25T01:30", "Europe/London");
    expect(instant?.toISOString()).toBe("2026-10-25T00:30:00.000Z");
    // …and that instant really does read 01:30 in London.
    expect(utcToWallClock(instant as Date, "Europe/London")).toBe("2026-10-25T01:30");
  });

  it("handles midnight, which naive implementations turn into 24:00", () => {
    const instant = wallClockToUtc("2026-11-01T00:00", "Asia/Kolkata");
    expect(instant?.toISOString()).toBe("2026-10-31T18:30:00.000Z");
    expect(utcToWallClock(instant as Date, "Asia/Kolkata")).toBe("2026-11-01T00:00");
  });

  it("returns null for a malformed value instead of an Invalid Date", () => {
    expect(wallClockToUtc("not a date", "Asia/Kolkata")).toBeNull();
  });
});

describe("round trip", () => {
  const cases = [
    ["2026-11-01T09:00", "Asia/Kolkata"],
    ["2026-07-01T18:45", "Europe/London"],
    ["2026-01-15T23:59", "Europe/London"],
    ["2026-07-04T00:00", "America/New_York"],
    ["2026-12-31T23:59", "UTC"],
    ["2026-06-15T12:00", "Asia/Dubai"],
  ] as const;

  it.each(cases)("%s in %s survives a conversion there and back", (wallClock, zone) => {
    const instant = wallClockToUtc(wallClock, zone);
    expect(instant).not.toBeNull();
    expect(utcToWallClock(instant as Date, zone)).toBe(wallClock);
  });
});

describe("zoneAbbreviation", () => {
  it("names the offset in force at that instant", () => {
    // Same zone, two different offsets — which is the whole point of asking per date.
    expect(zoneAbbreviation(new Date("2026-07-01T08:00:00Z"), "Europe/London")).toBe("GMT+1");
    // Winter London is UTC+0; Intl renders that as "GMT" or "GMT+0" depending on ICU data.
    expect(zoneAbbreviation(new Date("2026-12-01T09:00:00Z"), "Europe/London")).toMatch(/^GMT(\+0)?$/);
  });
});
