import { describe, expect, it } from "vitest";

import {
  decideSeat,
  nextWaitlistPosition,
  queueRank,
  registrationClosedReason,
} from "../../src/lib/domain/ticket-rules";

/**
 * The seat maths, enumerated.
 *
 * These are the decisions that later run inside a database transaction, so the
 * point of testing them alone is that a failure here is unambiguous: it is the
 * rule, not the locking, not the HTTP layer.
 */

describe("decideSeat", () => {
  it("always gives a seat when the event has no capacity", () => {
    expect(
      decideSeat({ capacity: null, registeredCount: 0, waitlistEnabled: false }),
    ).toBe("REGISTERED");
    expect(
      decideSeat({ capacity: null, registeredCount: 10_000, waitlistEnabled: true }),
    ).toBe("REGISTERED");
  });

  it("gives a seat while there is room", () => {
    expect(decideSeat({ capacity: 120, registeredCount: 0, waitlistEnabled: false })).toBe(
      "REGISTERED",
    );
    // The last seat is still a seat.
    expect(decideSeat({ capacity: 120, registeredCount: 119, waitlistEnabled: false })).toBe(
      "REGISTERED",
    );
  });

  it("refuses when full and there is no waitlist", () => {
    expect(decideSeat({ capacity: 120, registeredCount: 120, waitlistEnabled: false })).toBe("FULL");
    expect(decideSeat({ capacity: 1, registeredCount: 1, waitlistEnabled: false })).toBe("FULL");
  });

  it("queues when full and the organisers opened a waitlist", () => {
    expect(decideSeat({ capacity: 3, registeredCount: 3, waitlistEnabled: true })).toBe("WAITLISTED");
  });

  it("treats an overbooked room as full, not as a negative opportunity", () => {
    // Capacity can be lowered after people join; 9 held seats against a capacity
    // of 5 must never produce "there is room for -4".
    expect(decideSeat({ capacity: 5, registeredCount: 9, waitlistEnabled: false })).toBe("FULL");
    expect(decideSeat({ capacity: 5, registeredCount: 9, waitlistEnabled: true })).toBe("WAITLISTED");
  });
});

describe("nextWaitlistPosition", () => {
  it("starts a queue at 1", () => {
    expect(nextWaitlistPosition(null)).toBe(1);
  });

  it("counts upward from the highest position ever handed out", () => {
    expect(nextWaitlistPosition(1)).toBe(2);
    expect(nextWaitlistPosition(41)).toBe(42);
  });

  it("never reuses a number after someone leaves", () => {
    // Positions 1 and 3 remain after 2 gives up; the next joiner is 4, so two
    // people can never believe they are "second".
    expect(nextWaitlistPosition(3)).toBe(4);
  });
});

describe("queueRank", () => {
  it("numbers the queue from 1 in service order", () => {
    const positions = [1, 3, 7];
    expect(queueRank(positions, 1)).toBe(1);
    expect(queueRank(positions, 3)).toBe(2);
    expect(queueRank(positions, 7)).toBe(3);
  });

  it("has no rank for a ticket that is not waiting", () => {
    expect(queueRank([1, 2], null)).toBeNull();
    expect(queueRank([1, 2], 99)).toBeNull();
  });

  it("has no rank for an empty queue", () => {
    expect(queueRank([], 1)).toBeNull();
  });
});

describe("registrationClosedReason", () => {
  const future = new Date("2026-11-01T09:00:00Z");
  const past = new Date("2026-10-01T09:00:00Z");
  const now = new Date("2026-10-17T12:00:00Z");

  it("is open for a published event that has not started", () => {
    expect(
      registrationClosedReason({ status: "PUBLISHED", startTime: future, now }),
    ).toBeNull();
  });

  it("is closed for drafts and cancelled events", () => {
    expect(registrationClosedReason({ status: "DRAFT", startTime: future, now })).toBe("DRAFT");
    expect(registrationClosedReason({ status: "CANCELLED", startTime: future, now })).toBe(
      "CANCELLED",
    );
  });

  it("closes when the event starts, not when it ends", () => {
    expect(registrationClosedReason({ status: "PUBLISHED", startTime: past, now })).toBe("STARTED");
  });

  it("closes at the exact instant the event starts", () => {
    expect(
      registrationClosedReason({ status: "PUBLISHED", startTime: now, now }),
    ).toBe("STARTED");
  });
});
