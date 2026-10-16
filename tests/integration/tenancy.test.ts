import { beforeEach, describe, expect, it } from "vitest";

import { Prisma } from "../../src/generated/prisma/client";
import { ids, seedTwoTenants, testDb, truncateAll } from "../helpers/db";

/**
 * These cases exercise the database itself, not the service layer. The claim
 * under test is that cross-tenant rows are IMPOSSIBLE to insert — enforced by
 * composite `(id, tenant_id)` foreign keys rather than by remembering to filter.
 */

beforeEach(async () => {
  await truncateAll();
  await seedTwoTenants();
});

/** Asserts that a write is rejected by a specific Postgres constraint. */
async function expectRejected(
  operation: Promise<unknown>,
  expectedCode: "P2002" | "P2003",
): Promise<void> {
  await expect(operation).rejects.toSatisfy(
    (error: unknown) =>
      error instanceof Prisma.PrismaClientKnownRequestError && error.code === expectedCode,
    `expected Prisma error ${expectedCode}`,
  );
}

describe("composite tenant foreign keys", () => {
  it("rejects an event whose tenant does not own the club", async () => {
    const db = testDb();

    // clubA belongs to tenantA; claiming tenantB must fail at the FK, not in code.
    await expectRejected(
      db.event.create({
        data: {
          tenantId: ids.tenantB,
          clubId: ids.clubA,
          title: "Cross-tenant injection",
          startTime: new Date("2026-11-02T09:00:00Z"),
          endTime: new Date("2026-11-02T10:00:00Z"),
        },
      }),
      "P2003",
    );
  });

  it("rejects a ticket whose tenant is not the event's tenant", async () => {
    const db = testDb();

    await expectRejected(
      db.ticket.create({
        data: {
          tenantId: ids.tenantB, // eventA lives in tenantA
          eventId: ids.eventA,
          userId: ids.userA,
          qrCodeUuid: crypto.randomUUID(),
        },
      }),
      "P2003",
    );
  });

  it("rejects attendance whose tenant is not the ticket's tenant", async () => {
    const db = testDb();

    const ticket = await db.ticket.create({
      data: { tenantId: ids.tenantA, eventId: ids.eventA, userId: ids.userA, qrCodeUuid: crypto.randomUUID() },
    });

    await expectRejected(
      db.attendance.create({
        data: { tenantId: ids.tenantB, eventId: ids.eventA, ticketId: ticket.id },
      }),
      "P2003",
    );
  });

  it("accepts the same data when the tenant matches", async () => {
    const db = testDb();

    const event = await db.event.create({
      data: {
        tenantId: ids.tenantA,
        clubId: ids.clubA,
        title: "Legitimate event",
        startTime: new Date("2026-11-03T09:00:00Z"),
        endTime: new Date("2026-11-03T10:00:00Z"),
      },
    });

    expect(event.tenantId).toBe(ids.tenantA);
  });
});

describe("uniqueness that protects correctness", () => {
  it("allows exactly one ticket per user per event (double-RSVP is impossible)", async () => {
    const db = testDb();
    const qr = () => crypto.randomUUID();

    await db.ticket.create({
      data: { tenantId: ids.tenantA, eventId: ids.eventA, userId: ids.userA, qrCodeUuid: qr() },
    });

    await expectRejected(
      db.ticket.create({
        data: { tenantId: ids.tenantA, eventId: ids.eventA, userId: ids.userA, qrCodeUuid: qr() },
      }),
      "P2002",
    );
  });

  it("keeps QR secrets globally unique", async () => {
    const db = testDb();
    const sharedSecret = crypto.randomUUID();

    await db.ticket.create({
      data: { tenantId: ids.tenantA, eventId: ids.eventA, userId: ids.userA, qrCodeUuid: sharedSecret },
    });

    // A second user presenting the same code must collide even across events.
    const otherEvent = await db.event.create({
      data: {
        tenantId: ids.tenantA,
        clubId: ids.clubA,
        title: "Second event",
        startTime: new Date("2026-12-01T09:00:00Z"),
        endTime: new Date("2026-12-01T10:00:00Z"),
      },
    });

    await expectRejected(
      db.ticket.create({
        data: {
          tenantId: ids.tenantA,
          eventId: otherEvent.id,
          userId: ids.userA,
          qrCodeUuid: sharedSecret,
        },
      }),
      "P2002",
    );
  });

  it("allows a ticket to be checked in only once", async () => {
    const db = testDb();

    const ticket = await db.ticket.create({
      data: { tenantId: ids.tenantA, eventId: ids.eventA, userId: ids.userA, qrCodeUuid: crypto.randomUUID() },
    });

    await db.attendance.create({
      data: { tenantId: ids.tenantA, eventId: ids.eventA, ticketId: ticket.id },
    });

    await expectRejected(
      db.attendance.create({
        data: { tenantId: ids.tenantA, eventId: ids.eventA, ticketId: ticket.id },
      }),
      "P2002",
    );
  });

  it("collapses replayed offline scans with the same scanUuid", async () => {
    const db = testDb();
    const scanUuid = crypto.randomUUID();

    const ticket = await db.ticket.create({
      data: { tenantId: ids.tenantA, eventId: ids.eventA, userId: ids.userA, qrCodeUuid: crypto.randomUUID() },
    });
    const second = await db.ticket.create({
      data: {
        tenantId: ids.tenantA,
        eventId: ids.eventA,
        userId: ids.userB,
        qrCodeUuid: crypto.randomUUID(),
      },
    });

    await db.attendance.create({
      data: { tenantId: ids.tenantA, eventId: ids.eventA, ticketId: ticket.id, scanUuid },
    });

    // Phase 6 replays queued scans; the unique key is what makes that idempotent.
    await expectRejected(
      db.attendance.create({
        data: { tenantId: ids.tenantA, eventId: ids.eventA, ticketId: second.id, scanUuid },
      }),
      "P2002",
    );
  });
});

describe("referential integrity and soft deletes", () => {
  it("refuses to hard-delete a club that still has events", async () => {
    const db = testDb();

    await expectRejected(db.club.delete({ where: { id: ids.clubA } }), "P2003");
  });

  it("keeps attendance history after an event is soft-deleted", async () => {
    const db = testDb();

    const ticket = await db.ticket.create({
      data: { tenantId: ids.tenantA, eventId: ids.eventA, userId: ids.userA, qrCodeUuid: crypto.randomUUID() },
    });
    await db.attendance.create({
      data: { tenantId: ids.tenantA, eventId: ids.eventA, ticketId: ticket.id },
    });

    await db.event.update({ where: { id: ids.eventA }, data: { deletedAt: new Date() } });

    const visibleEvents = await db.event.findMany({ where: { tenantId: ids.tenantA, deletedAt: null } });
    expect(visibleEvents.map((event) => event.id)).not.toContain(ids.eventA);

    // The audit trail outlives the "deleted" event.
    const attendance = await db.attendance.findFirst({ where: { eventId: ids.eventA } });
    expect(attendance).not.toBeNull();
    expect(await db.ticket.findUnique({ where: { id: ticket.id } })).not.toBeNull();
  });
});

describe("scoped reads", () => {
  it("returns only rows belonging to the requested tenant", async () => {
    const db = testDb();

    await db.event.create({
      data: {
        tenantId: ids.tenantB,
        clubId: ids.clubB,
        title: "Beta only event",
        startTime: new Date("2026-11-04T09:00:00Z"),
        endTime: new Date("2026-11-04T10:00:00Z"),
      },
    });

    const alphaEvents = await db.event.findMany({ where: { tenantId: ids.tenantA } });
    const betaEvents = await db.event.findMany({ where: { tenantId: ids.tenantB } });

    expect(alphaEvents.every((event) => event.tenantId === ids.tenantA)).toBe(true);
    expect(betaEvents.map((event) => event.title)).toEqual(["Beta only event"]);
  });

  it("resolves an event's tenant through its club consistently", async () => {
    const db = testDb();

    const event = await db.event.findFirstOrThrow({
      where: { id: ids.eventA },
      select: { tenantId: true, club: { select: { tenantId: true } } },
    });

    expect(event.club.tenantId).toBe(event.tenantId);
  });
});
