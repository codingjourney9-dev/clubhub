import { describe, expect, it } from "vitest";

import {
  checkInWindow,
  checkInWindowState,
  decideCheckIn,
  doorCodeFromSecret,
  letsPersonIn,
  normaliseDoorCode,
} from "../../src/lib/domain/check-in";
import { fingerprintSecret } from "../../src/lib/tickets/fingerprint";

/**
 * The door's rules, in isolation.
 *
 * These are the decisions that later run under a locked database and a queue of
 * people, so a failure here must be unmistakably about the rule itself.
 */

describe("decideCheckIn", () => {
  it("lets a registered ticket in", () => {
    expect(
      decideCheckIn({
        eventStatus: "PUBLISHED",
        ticketStatus: "REGISTERED",
        alreadyCheckedIn: false,
      }),
    ).toBe("CHECKED_IN");
  });

  it("says 'already checked in' rather than failing on a second scan", () => {
    expect(
      decideCheckIn({
        eventStatus: "PUBLISHED",
        ticketStatus: "REGISTERED",
        alreadyCheckedIn: true,
      }),
    ).toBe("ALREADY_CHECKED_IN");
  });

  it("refuses a waitlisted ticket: a queue place is not a seat", () => {
    expect(
      decideCheckIn({
        eventStatus: "PUBLISHED",
        ticketStatus: "WAITLISTED",
        alreadyCheckedIn: false,
      }),
    ).toBe("WAITLISTED");
  });

  it("refuses a cancelled ticket", () => {
    expect(
      decideCheckIn({
        eventStatus: "PUBLISHED",
        ticketStatus: "CANCELLED",
        alreadyCheckedIn: false,
      }),
    ).toBe("CANCELLED_TICKET");
  });

  it("puts a cancelled event above everything else", () => {
    // Even a perfectly good, unscanned, registered ticket is worthless once the
    // club has called the event off.
    expect(
      decideCheckIn({
        eventStatus: "CANCELLED",
        ticketStatus: "REGISTERED",
        alreadyCheckedIn: false,
      }),
    ).toBe("EVENT_CANCELLED");

    expect(
      decideCheckIn({
        eventStatus: "CANCELLED",
        ticketStatus: "WAITLISTED",
        alreadyCheckedIn: true,
      }),
    ).toBe("EVENT_CANCELLED");
  });

  it("only lets you through on the two admitting outcomes", () => {
    expect(letsPersonIn("CHECKED_IN")).toBe(true);
    expect(letsPersonIn("ALREADY_CHECKED_IN")).toBe(true);
    expect(letsPersonIn("WAITLISTED")).toBe(false);
    expect(letsPersonIn("NOT_FOUND")).toBe(false);
    expect(letsPersonIn("TOO_EARLY")).toBe(false);
  });
});

describe("checkInWindow", () => {
  // Debug Night: 21 Oct 2026, 19:00–22:00 in India (13:30–16:30 UTC).
  const event = {
    startTime: new Date("2026-10-21T13:30:00.000Z"),
    endTime: new Date("2026-10-21T16:30:00.000Z"),
  };

  it("opens at local midnight on the day of the event", () => {
    const { opensAt } = checkInWindow(event, "Asia/Kolkata");

    // 00:00 on 21 Oct in India is 18:30 UTC on 20 Oct.
    expect(opensAt.toISOString()).toBe("2026-10-20T18:30:00.000Z");
  });

  it("closes at the later of end-of-day and three hours after the event ends", () => {
    const { closesAt } = checkInWindow(event, "Asia/Kolkata");

    // The event ends at 22:00 IST. Midnight would be 18:30 UTC, but the three-hour
    // grace runs to 01:00 IST the next morning — 19:30 UTC — so that is the close.
    expect(closesAt.toISOString()).toBe("2026-10-21T19:30:00.000Z");
  });

  it("still closes the next morning, so an old event cannot be scanned forever", () => {
    expect(
      checkInWindowState(event, "Asia/Kolkata", new Date("2026-10-22T12:00:00.000Z")),
    ).toBe("CLOSED");
  });

  it("accepts a scan during the event", () => {
    expect(
      checkInWindowState(event, "Asia/Kolkata", new Date("2026-10-21T14:00:00.000Z")),
    ).toBe("OPEN");
  });

  it("refuses a scan the day before, even at the same clock time", () => {
    expect(
      checkInWindowState(event, "Asia/Kolkata", new Date("2026-10-20T14:00:00.000Z")),
    ).toBe("TOO_EARLY");
  });

  it("refuses a scan the day after", () => {
    expect(
      checkInWindowState(event, "Asia/Kolkata", new Date("2026-10-22T05:00:00.000Z")),
    ).toBe("CLOSED");
  });

  it("keeps an overnight event open past midnight", () => {
    // 23:00 on 21 Oct → 02:00 on 22 Oct, India. The end-of-day rule alone would
    // slam the door at 00:00, halfway through the event.
    const overnight = {
      startTime: new Date("2026-10-21T17:30:00.000Z"),
      endTime: new Date("2026-10-21T20:30:00.000Z"),
    };

    const { closesAt } = checkInWindow(overnight, "Asia/Kolkata");

    expect(closesAt.toISOString()).toBe("2026-10-21T23:30:00.000Z"); // 02:00 IST + 3h grace
    expect(
      checkInWindowState(overnight, "Asia/Kolkata", new Date("2026-10-21T20:00:00.000Z")),
    ).toBe("OPEN");
  });

  it("uses the college's timezone, not the phone's", () => {
    // The same instant is 21 Oct in India and still 20 Oct in London.
    const instant = new Date("2026-10-20T20:00:00.000Z");

    expect(checkInWindowState(event, "Asia/Kolkata", instant)).toBe("OPEN");
    expect(checkInWindowState(event, "Europe/London", instant)).toBe("TOO_EARLY");
  });
});

describe("door codes", () => {
  const secret = "0f1d2c3b-4a59-4e6d-8b7c-500000000009";

  it("is the last eight characters of the secret, upper-cased and dash-free", () => {
    expect(doorCodeFromSecret(secret)).toBe("00000009");
  });

  it("is stable for the same ticket", () => {
    expect(doorCodeFromSecret(secret)).toBe(doorCodeFromSecret(secret));
  });

  it("normalises what a human types", () => {
    expect(normaliseDoorCode("  0000-0009 ")).toBe("00000009");
    expect(normaliseDoorCode("a1b2 c3d4")).toBe("a1b2c3d4");
  });
});

describe("ticket fingerprints", () => {
  it("is deterministic and independent of dashes and case", () => {
    const a = fingerprintSecret("0F1D2C3B-4A59-4E6D-8B7C-500000000009");
    const b = fingerprintSecret("0f1d2c3b-4a59-4e6d-8b7c-500000000009");

    expect(a).toBe(b);
    expect(a).toMatch(/^[0-9a-f]{64}$/);
  });

  it("does not contain the secret it hashes", () => {
    const fingerprint = fingerprintSecret("0f1d2c3b-4a59-4e6d-8b7c-500000000009");

    // The whole point: a phone holding this cannot reconstruct a ticket.
    expect(fingerprint).not.toContain("0f1d2c3b");
    expect(fingerprint).not.toContain("500000000009");
  });

  it("differs for two tickets whose door codes collide", () => {
    // Two secrets sharing their last eight characters must still be
    // distinguishable by fingerprint — otherwise offline verification would let
    // the wrong person in.
    const a = "11111111-1111-4111-8111-111100000009";
    const b = "22222222-2222-4222-8222-222200000009";

    expect(doorCodeFromSecret(a)).toBe(doorCodeFromSecret(b));
    expect(fingerprintSecret(a)).not.toBe(fingerprintSecret(b));
  });
});
