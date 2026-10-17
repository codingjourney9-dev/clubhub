import { beforeEach, describe, expect, it } from "vitest";

import { ApiError } from "../../src/lib/api/response";
import {
  checkIn,
  getAttendanceReport,
  getDoorManifest,
  syncCheckIns,
} from "../../src/lib/services/check-in-service";
import { registerForEvent } from "../../src/lib/services/ticket-service";
import { assertTestDatabase, testDb, truncateAll } from "../helpers/db";
import { p3, seedClubWorkspace } from "../helpers/phase3";

/**
 * The door, against a real database.
 *
 * The claims under test are the ones that matter in a basement with a queue:
 *
 *  • the same scan arriving twice creates one row, not two;
 *  • two volunteers scanning the same ticket produce exactly one check-in;
 *  • a whole offline batch replays without duplicating anything;
 *  • a ticket from another event or another college cannot open this door.
 */

beforeEach(async () => {
  await assertTestDatabase();
  await truncateAll();
  await seedClubWorkspace();
});

const HOUR = 3_600_000;

/** An event happening *now*, so the check-in window is open. */
async function makeLiveEvent(
  overrides: {
    capacity?: number;
    status?: "PUBLISHED" | "DRAFT" | "CANCELLED";
    waitlistEnabled?: boolean;
  } = {},
) {
  return testDb().event.create({
    data: {
      tenantId: p3.tenant,
      clubId: p3.club,
      title: "Open House",
      location: "Lab",
      startTime: new Date(Date.now() - HOUR),
      endTime: new Date(Date.now() + 3 * HOUR),
      capacity: overrides.capacity ?? 10,
      waitlistEnabled: overrides.waitlistEnabled ?? false,
      status: overrides.status ?? "PUBLISHED",
      isPublic: true,
      createdById: p3.president,
    },
  });
}

/**
 * Seats somebody and hands back their ticket (secret included).
 *
 * Registration closes when an event *starts*, so a ticket for tonight's event has
 * to have been claimed earlier. Rather than fake a ticket row, this moves the
 * event into the future, registers through the real service, and then puts the
 * clock back — which is exactly the life story of a real ticket.
 */
async function seatStudent(eventId: string, userId: string) {
  const original = await testDb().event.findUniqueOrThrow({
    where: { id: eventId },
    select: { startTime: true, endTime: true },
  });

  const futureStart = new Date(Date.now() + 24 * HOUR);
  await testDb().event.update({
    where: { id: eventId },
    data: { startTime: futureStart, endTime: new Date(futureStart.getTime() + 3 * HOUR) },
  });

  try {
    const result = await registerForEvent(eventId, p3.tenant, userId);

    return await testDb().ticket.findUniqueOrThrow({
      where: { id: result.ticket.id },
      select: { id: true, qrCodeUuid: true, status: true },
    });
  } finally {
    await testDb().event.update({
      where: { id: eventId },
      data: { startTime: original.startTime, endTime: original.endTime },
    });
  }
}

const DOOR = p3.president;

describe("checking a ticket in", () => {
  it("admits a registered ticket and records who scanned it", async () => {
    const event = await makeLiveEvent();
    const ticket = await seatStudent(event.id, p3.member);

    const result = await checkIn({
      eventId: event.id,
      tenantId: p3.tenant,
      code: ticket.qrCodeUuid,
      source: "SCANNER",
      scanUuid: crypto.randomUUID(),
      checkedInById: DOOR,
      deviceLabel: "test phone",
    });

    expect(result.outcome).toBe("CHECKED_IN");
    expect(result.admitted).toBe(true);

    const row = await testDb().attendance.findUnique({
      where: { ticketId: ticket.id },
      select: { checkedInById: true, source: true, deviceLabel: true, tenantId: true },
    });

    expect(row).toEqual({
      checkedInById: DOOR,
      source: "SCANNER",
      deviceLabel: "test phone",
      tenantId: p3.tenant,
    });
  });

  it("accepts the full QR payload as well as the bare secret", async () => {
    const event = await makeLiveEvent();
    const ticket = await seatStudent(event.id, p3.member);

    const result = await checkIn({
      eventId: event.id,
      tenantId: p3.tenant,
      code: `clubhub:ticket:${ticket.qrCodeUuid}`,
      source: "SCANNER",
      scanUuid: crypto.randomUUID(),
      checkedInById: DOOR,
    });

    expect(result.outcome).toBe("CHECKED_IN");
  });

  it("accepts the eight-character door code typed by hand", async () => {
    const event = await makeLiveEvent();
    const ticket = await seatStudent(event.id, p3.member);

    // What a volunteer reads off a cracked screen, in either case.
    const doorCode = ticket.qrCodeUuid.replace(/-/g, "").slice(-8).toUpperCase();

    const result = await checkIn({
      eventId: event.id,
      tenantId: p3.tenant,
      code: doorCode,
      source: "MANUAL",
      scanUuid: crypto.randomUUID(),
      checkedInById: DOOR,
    });

    expect(result.outcome).toBe("CHECKED_IN");
    expect(result.ticket?.holder).toContain("Milo");

    const stored = await testDb().attendance.findUnique({
      where: { ticketId: ticket.id },
      select: { source: true },
    });
    expect(stored?.source).toBe("MANUAL");
  });

  it("says 'already checked in' on a second scan instead of failing", async () => {
    const event = await makeLiveEvent();
    const ticket = await seatStudent(event.id, p3.member);

    const first = await checkIn({
      eventId: event.id,
      tenantId: p3.tenant,
      code: ticket.qrCodeUuid,
      source: "SCANNER",
      scanUuid: crypto.randomUUID(),
      checkedInById: DOOR,
    });

    const second = await checkIn({
      eventId: event.id,
      tenantId: p3.tenant,
      code: ticket.qrCodeUuid,
      source: "SCANNER",
      scanUuid: crypto.randomUUID(),
      checkedInById: DOOR,
    });

    expect(first.outcome).toBe("CHECKED_IN");
    expect(second.outcome).toBe("ALREADY_CHECKED_IN");
    // Still admits: the person is inside and has just shown the same ticket again.
    expect(second.admitted).toBe(true);
    expect(second.checkIn?.at).toBe(first.checkIn?.at);

    expect(await testDb().attendance.count({ where: { eventId: event.id } })).toBe(1);
  });

  it("refuses a waitlisted ticket — a queue place is not a seat", async () => {
    const event = await makeLiveEvent({ capacity: 1, waitlistEnabled: true });

    await seatStudent(event.id, p3.member);

    // The president cannot get a seat, so they are on the waitlist.
    const waiting = await seatStudent(event.id, p3.president);

    const result = await checkIn({
      eventId: event.id,
      tenantId: p3.tenant,
      code: waiting.qrCodeUuid,
      source: "SCANNER",
      scanUuid: crypto.randomUUID(),
      checkedInById: DOOR,
    });

    expect(result.outcome).toBe("WAITLISTED");
    expect(result.admitted).toBe(false);
    expect(await testDb().attendance.count({ where: { eventId: event.id } })).toBe(0);
  });

  it("refuses every ticket once the event is cancelled", async () => {
    const event = await makeLiveEvent();
    const ticket = await seatStudent(event.id, p3.member);

    await testDb().event.update({ where: { id: event.id }, data: { status: "CANCELLED" } });

    const result = await checkIn({
      eventId: event.id,
      tenantId: p3.tenant,
      code: ticket.qrCodeUuid,
      source: "SCANNER",
      scanUuid: crypto.randomUUID(),
      checkedInById: DOOR,
    });

    expect(result.outcome).toBe("EVENT_CANCELLED");
    expect(result.admitted).toBe(false);
  });

  it("refuses a scan outside the day of the event", async () => {
    const event = await makeLiveEvent();
    const ticket = await seatStudent(event.id, p3.member);

    const result = await checkIn({
      eventId: event.id,
      tenantId: p3.tenant,
      code: ticket.qrCodeUuid,
      source: "SCANNER",
      scanUuid: crypto.randomUUID(),
      checkedInById: DOOR,
      now: new Date(Date.now() + 5 * 24 * HOUR),
    });

    expect(result.outcome).toBe("CLOSED");
    expect(await testDb().attendance.count({ where: { eventId: event.id } })).toBe(0);
  });

  it("cannot be used for another event's ticket", async () => {
    const event = await makeLiveEvent();
    const other = await makeLiveEvent();
    const ticket = await seatStudent(other.id, p3.member);

    const result = await checkIn({
      eventId: event.id,
      tenantId: p3.tenant,
      code: ticket.qrCodeUuid,
      source: "SCANNER",
      scanUuid: crypto.randomUUID(),
      checkedInById: DOOR,
    });

    expect(result.outcome).toBe("NOT_FOUND");
  });

  it("cannot be used across colleges", async () => {
    const event = await makeLiveEvent();
    const ticket = await seatStudent(event.id, p3.member);

    // Wrong tenant: the event itself is invisible, so the request dies before the
    // ticket is even looked at — and the API answers 404, not "wrong college".
    await expect(
      checkIn({
        eventId: event.id,
        tenantId: p3.otherTenant,
        code: ticket.qrCodeUuid,
        source: "SCANNER",
        scanUuid: crypto.randomUUID(),
        checkedInById: DOOR,
      }),
    ).rejects.toBeInstanceOf(ApiError);
  });

  it("rejects nonsense with a clear 'not a ticket' rather than a crash", async () => {
    const event = await makeLiveEvent();

    for (const code of ["WIFI:S:Campus;T:WPA;P:hunter2;;", "https://example.com", "zzzz"]) {
      const result = await checkIn({
        eventId: event.id,
        tenantId: p3.tenant,
        code,
        source: "SCANNER",
        scanUuid: crypto.randomUUID(),
        checkedInById: DOOR,
      });

      expect(result.outcome).toBe("NOT_FOUND");
    }
  });
});

describe("the same scan arriving twice", () => {
  it("collapses into one row and reports the replay", async () => {
    const event = await makeLiveEvent();
    const ticket = await seatStudent(event.id, p3.member);
    const scanUuid = crypto.randomUUID();

    const first = await checkIn({
      eventId: event.id,
      tenantId: p3.tenant,
      code: ticket.qrCodeUuid,
      source: "SCANNER",
      scanUuid,
      checkedInById: DOOR,
    });

    const retry = await checkIn({
      eventId: event.id,
      tenantId: p3.tenant,
      code: ticket.qrCodeUuid,
      source: "SCANNER",
      scanUuid,
      checkedInById: DOOR,
    });

    expect(first.outcome).toBe("CHECKED_IN");
    expect(retry.outcome).toBe("ALREADY_CHECKED_IN");
    expect(retry.replayed).toBe(true);
    expect(retry.checkIn?.at).toBe(first.checkIn?.at);

    expect(await testDb().attendance.count()).toBe(1);
  });
});

describe("two volunteers, one ticket", () => {
  it("records exactly one check-in when the scans arrive together", async () => {
    const event = await makeLiveEvent();
    const ticket = await seatStudent(event.id, p3.member);

    const results = await Promise.allSettled(
      Array.from({ length: 5 }, () =>
        checkIn({
          eventId: event.id,
          tenantId: p3.tenant,
          code: ticket.qrCodeUuid,
          source: "SCANNER",
          scanUuid: crypto.randomUUID(),
          checkedInById: DOOR,
        }),
      ),
    );

    expect(results.every((result) => result.status === "fulfilled")).toBe(true);

    const outcomes = results.map(
      (result) => (result as PromiseFulfilledResult<{ outcome: string }>).value.outcome,
    );

    expect(outcomes.filter((outcome) => outcome === "CHECKED_IN")).toHaveLength(1);
    expect(outcomes.filter((outcome) => outcome === "ALREADY_CHECKED_IN")).toHaveLength(4);
    expect(await testDb().attendance.count()).toBe(1);
  });
});

describe("flushing an offline queue", () => {
  it("checks in three tickets and creates exactly three rows", async () => {
    // The specification's offline test: scan three people with no network, then
    // sync, and confirm the database holds exactly three attendance rows.
    const event = await makeLiveEvent({ capacity: 10 });

    const studentIds = await Promise.all(
      [0, 1, 2].map(async (index) => {
        const id = `33333333-3333-4333-8333-${String(200 + index).padStart(12, "0")}`;
        await testDb().user.create({
          data: { id, email: `door${index}@test.dev`, firstName: "Door", lastName: `${index}` },
        });
        await testDb().tenantMember.create({
          data: { tenantId: p3.tenant, userId: id, role: "MEMBER" },
        });
        return id;
      }),
    );

    const tickets = await Promise.all(studentIds.map((id) => seatStudent(event.id, id)));

    // What the phone had queued, with the times the scans actually happened.
    const queued = tickets.map((ticket, index) => ({
      scanUuid: crypto.randomUUID(),
      code: ticket.qrCodeUuid,
      scannedAt: new Date(Date.now() - (10 - index) * 60_000).toISOString(),
      source: "SCANNER" as const,
    }));

    const { results, checkedIn } = await syncCheckIns({
      eventId: event.id,
      tenantId: p3.tenant,
      checkedInById: DOOR,
      deviceLabel: "offline phone",
      scans: queued,
    });

    expect(results).toHaveLength(3);
    expect(checkedIn).toBe(3);
    expect(results.every((result) => result.outcome === "CHECKED_IN")).toBe(true);
    expect(await testDb().attendance.count({ where: { eventId: event.id } })).toBe(3);

    // The times are the ones from the queue, not the moment of the upload.
    const rows = await testDb().attendance.findMany({
      where: { eventId: event.id },
      select: { checkInTime: true },
      orderBy: { checkInTime: "asc" },
    });

    for (const [index, row] of rows.entries()) {
      expect(row.checkInTime.toISOString()).toBe(queued[index]!.scannedAt);
    }
  });

  it("is safe to run twice — a retried flush creates no duplicates", async () => {
    const event = await makeLiveEvent();
    const ticket = await seatStudent(event.id, p3.member);

    const batch = {
      eventId: event.id,
      tenantId: p3.tenant,
      checkedInById: DOOR,
      scans: [
        { scanUuid: crypto.randomUUID(), code: ticket.qrCodeUuid, source: "SCANNER" as const },
      ],
    };

    const first = await syncCheckIns(batch);
    const second = await syncCheckIns(batch);

    expect(first.checkedIn).toBe(1);
    expect(second.checkedIn).toBe(0);
    expect(second.results[0]?.replayed).toBe(true);
    expect(await testDb().attendance.count()).toBe(1);
  });

  it("keeps the good scans when one item in the batch is wrong", async () => {
    const event = await makeLiveEvent();
    const ticket = await seatStudent(event.id, p3.member);

    const { results, checkedIn } = await syncCheckIns({
      eventId: event.id,
      tenantId: p3.tenant,
      checkedInById: DOOR,
      scans: [
        { scanUuid: crypto.randomUUID(), code: ticket.qrCodeUuid, source: "SCANNER" },
        { scanUuid: crypto.randomUUID(), code: "not-a-ticket", source: "MANUAL" },
      ],
    });

    expect(results).toHaveLength(2);
    expect(checkedIn).toBe(1);
    expect(results[0]?.outcome).toBe("CHECKED_IN");
    expect(results[1]?.outcome).toBe("NOT_FOUND");
    expect(await testDb().attendance.count()).toBe(1);
  });
});

describe("the offline guest list", () => {
  it("carries fingerprints and door codes, never the secrets", async () => {
    const event = await makeLiveEvent();
    const ticket = await seatStudent(event.id, p3.member);

    const manifest = await getDoorManifest(event.id, p3.tenant);
    const entry = manifest.tickets.find((row) => row.ticketId === ticket.id);

    expect(entry?.fingerprint).toMatch(/^[0-9a-f]{64}$/);
    expect(entry?.doorCode).toHaveLength(8);

    // The secret must not appear anywhere in what the phone stores.
    const serialised = JSON.stringify(manifest);
    expect(serialised).not.toContain(ticket.qrCodeUuid);
  });

  it("carries the check-in state, so the phone can refuse a second entry offline", async () => {
    const event = await makeLiveEvent();
    const ticket = await seatStudent(event.id, p3.member);

    await checkIn({
      eventId: event.id,
      tenantId: p3.tenant,
      code: ticket.qrCodeUuid,
      source: "SCANNER",
      scanUuid: crypto.randomUUID(),
      checkedInById: DOOR,
    });

    const manifest = await getDoorManifest(event.id, p3.tenant);
    const entry = manifest.tickets.find((row) => row.ticketId === ticket.id);

    expect(entry?.checkedInAt).toBeTruthy();
  });

  it("lists waitlisted people too, so the phone can say 'no seat'", async () => {
    const event = await makeLiveEvent({ capacity: 1, waitlistEnabled: true });
    await seatStudent(event.id, p3.member);
    await seatStudent(event.id, p3.president);

    const manifest = await getDoorManifest(event.id, p3.tenant);

    expect(manifest.tickets.filter((row) => row.status === "WAITLISTED")).toHaveLength(1);
  });
});

describe("the attendance report", () => {
  it("counts who came against who registered", async () => {
    const event = await makeLiveEvent({ capacity: 10 });

    const seated = await seatStudent(event.id, p3.member);
    await seatStudent(event.id, p3.president);
    await seatStudent(event.id, p3.owner);

    await checkIn({
      eventId: event.id,
      tenantId: p3.tenant,
      code: seated.qrCodeUuid,
      source: "SCANNER",
      scanUuid: crypto.randomUUID(),
      checkedInById: DOOR,
    });

    const report = await getAttendanceReport(event.id, p3.tenant);

    expect(report.counts.registered).toBe(3);
    expect(report.counts.checkedIn).toBe(1);
    expect(report.counts.attendanceRate).toBe(33);
    expect(report.rows).toHaveLength(3);
    expect(report.rows.filter((row) => row.checkInTime !== null)).toHaveLength(1);
  });

  it("is not readable for another college's event", async () => {
    const event = await makeLiveEvent();

    await expect(getAttendanceReport(event.id, p3.otherTenant)).rejects.toBeInstanceOf(ApiError);
  });
});
