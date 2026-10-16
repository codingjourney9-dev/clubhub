import { describe, expect, it } from "vitest";

import { formatDateTimeInZone, zonedDayKey, zoneAbbreviation } from "@/lib/format/date";

/** 15:30 UTC — deliberately a time that lands on the next calendar day in IST. */
const AFTERNOON_UTC = new Date("2026-11-01T15:30:00Z");

describe("formatDateTimeInZone()", () => {
  it("renders one stored instant differently per zone (storage stays UTC)", () => {
    expect(formatDateTimeInZone(AFTERNOON_UTC, "UTC")).toContain("3:30");
    expect(formatDateTimeInZone(AFTERNOON_UTC, "Asia/Kolkata")).toContain("9:00");
  });

  it("rolls the date forward for zones ahead of UTC", () => {
    const lateUtc = new Date("2026-11-01T20:00:00Z");
    expect(formatDateTimeInZone(lateUtc, "UTC")).toContain("Nov 2026");
    expect(formatDateTimeInZone(lateUtc, "Asia/Kolkata")).toContain("Nov 2026");
    // 20:00Z on the 1st is 01:30 on the 2nd in IST.
    expect(formatDateTimeInZone(lateUtc, "Asia/Kolkata")).toContain("2 Nov");
  });

  it("respects daylight saving in zones that observe it", () => {
    // 12:00 UTC is 13:00 in London during BST (August) but 12:00 in GMT (December).
    const summer = new Date("2026-08-15T12:00:00Z");
    const winter = new Date("2026-12-15T12:00:00Z");

    // en-IN renders 12-hour time, so the assertions match on the clock value.
    expect(formatDateTimeInZone(summer, "Europe/London")).toContain("1:00 pm");
    expect(formatDateTimeInZone(winter, "Europe/London")).toContain("12:00 pm");
  });
});

describe("zonedDayKey()", () => {
  it("groups an event by the day it happens at the venue, not by the server's day", () => {
    // 2026-11-01T20:00Z is still 1 Nov in UTC but 2 Nov at the venue.
    expect(zonedDayKey(new Date("2026-11-01T20:00:00Z"), "UTC")).toBe("2026-11-01");
    expect(zonedDayKey(new Date("2026-11-01T20:00:00Z"), "Asia/Kolkata")).toBe("2026-11-02");
  });
});

describe("zoneAbbreviation()", () => {
  it("labels the zone so admin screens are unambiguous", () => {
    expect(zoneAbbreviation(AFTERNOON_UTC, "Asia/Kolkata")).toMatch(/GMT\+5:30/);
  });
});
