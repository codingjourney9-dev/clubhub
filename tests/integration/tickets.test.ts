import { beforeEach, describe, expect, it } from "vitest";

import { ApiError } from "../../src/lib/api/response";
import { updateEvent } from "../../src/lib/services/event-service";
import {
  cancelTicket,
  findTicketForUser,
  getTicketForOwner,
  listEventRoster,
  listMyTickets,
  registerForEvent,
} from "../../src/lib/services/ticket-service";
import { assertTestDatabase, testDb, truncateAll } from "../helpers/db";
import { p3, seedClubWorkspace } from "../helpers/phase3";

/**
 * Ticketing against a real database.
 *
 * The claims here are the ones a UI cannot be trusted to uphold, and the ones a
 * single-threaded test cannot prove:
 *
 *  • a room never holds more people than it has seats, even when everybody
 *    clicks at the same instant;
 *  • the waitlist is first-come-first-served and a cancellation actually lets
 *    somebody in;
 *  • one person gets one ticket, forever, no matter how many times they tap.
 */

beforeEach(async () => {
  await assertTestDatabase();
  await truncateAll();
  await seedClubWorkspace();
});

async function expectApiError(operation: Promise<unknown>): Promise<ApiError> {
  try {
    await operation;
  } catch (error) {
    if (error instanceof ApiError) return error;
    throw error;
  }
  throw new Error("Expected the call to fail, but it resolved.");
}

const HOUR = 3_600_000;

interface EventOverrides {
  capacity?: number | null;
  waitlistEnabled?: boolean;
  status?: "DRAFT" | "PUBLISHED" | "CANCELLED";
  isPublic?: boolean;
  startTime?: Date;
  endTime?: Date;
}

/** A published event in the near future, in the phase-3 club. */
async function makeEvent(overrides: EventOverrides = {}) {
  const startTime = overrides.startTime ?? new Date(Date.now() + 24 * HOUR);
  const endTime = overrides.endTime ?? new Date(startTime.getTime() + 3 * HOUR);

  return testDb().event.create({
    data: {
      tenantId: p3.tenant,
      clubId: p3.club,
      title: "Ticket Test Event",
      location: "Seminar Hall",
      startTime,
      endTime,
      capacity: overrides.capacity === undefined ? 5 : overrides.capacity,
      waitlistEnabled: overrides.waitlistEnabled ?? false,
      status: overrides.status ?? "PUBLISHED",
      isPublic: overrides.isPublic ?? true,
      createdById: p3.president,
    },
  });
}

/** A college member with no club role — the "ordinary student" of this fixture. */
async function makeStudent(index: number): Promise<string> {
  const id = `33333333-3333-4333-8333-${String(100 + index).padStart(12, "0")}`;

  await testDb().user.create({
    data: { id, email: `student${index}@test.dev`, firstName: `Student`, lastName: `${index}` },
  });
  await testDb().tenantMember.create({
    data: { tenantId: p3.tenant, userId: id, role: "MEMBER" },
  });

  return id;
}

describe("claiming a seat", () => {
  it("registers a person and gives the ticket its own unguessable secret", async () => {
    const event = await makeEvent();

    const result = await registerForEvent(event.id, p3.tenant, p3.member);

    expect(result.outcome).toBe("registered");
    expect(result.ticket.status).toBe("REGISTERED");
    expect(result.ticket.queuePosition).toBeNull();

    const stored = await testDb().ticket.findUnique({
      where: { id: result.ticket.id },
      select: { qrCodeUuid: true, userId: true, tenantId: true },
    });

    // The QR secret is not the ticket id: knowing one must not let you forge the
    // other. A UUID has 36 characters and is not derived from anything.
    expect(stored?.qrCodeUuid).toMatch(/^[0-9a-f-]{36}$/);
    expect(stored?.qrCodeUuid).not.toBe(result.ticket.id);
    expect(stored?.userId).toBe(p3.member);
    expect(stored?.tenantId).toBe(p3.tenant);
  });

  it("is idempotent: a double tap returns the ticket you already have", async () => {
    const event = await makeEvent();

    const first = await registerForEvent(event.id, p3.tenant, p3.member);
    const second = await registerForEvent(event.id, p3.tenant, p3.member);

    expect(second.outcome).toBe("already-registered");
    expect(second.ticket.id).toBe(first.ticket.id);
    expect(await testDb().ticket.count({ where: { eventId: event.id } })).toBe(1);
  });

  it("refuses when the room is full and no waitlist was opened", async () => {
    const event = await makeEvent({ capacity: 1, waitlistEnabled: false });
    await registerForEvent(event.id, p3.tenant, p3.member);

    const error = await expectApiError(registerForEvent(event.id, p3.tenant, p3.president));

    expect(error.status).toBe(409);
    expect(error.message).toContain("full");
    // Nothing was written: the seating did not grow a secret extra row.
    expect(await testDb().ticket.count({ where: { eventId: event.id } })).toBe(1);
  });

  it("queues people in arrival order when the room is full but a waitlist exists", async () => {
    const event = await makeEvent({ capacity: 1, waitlistEnabled: true });

    const seat = await registerForEvent(event.id, p3.tenant, p3.member);
    const first = await registerForEvent(event.id, p3.tenant, p3.president);
    const second = await registerForEvent(event.id, p3.tenant, p3.owner);

    expect(seat.ticket.status).toBe("REGISTERED");
    expect(first.outcome).toBe("waitlisted");
    expect(first.ticket.queuePosition).toBe(1);
    expect(second.outcome).toBe("waitlisted");
    expect(second.ticket.queuePosition).toBe(2);
  });

  it("takes everybody when the capacity is unlimited", async () => {
    const event = await makeEvent({ capacity: null });

    const students = await Promise.all([makeStudent(1), makeStudent(2), makeStudent(3)]);

    for (const student of [p3.member, ...students]) {
      const result = await registerForEvent(event.id, p3.tenant, student);
      expect(result.ticket.status).toBe("REGISTERED");
    }

    expect(await testDb().ticket.count({ where: { eventId: event.id } })).toBe(4);
  });

  it("refuses drafts, cancelled events and events that have already started", async () => {
    const draft = await makeEvent({ status: "DRAFT" });
    const cancelled = await makeEvent({ status: "CANCELLED" });
    const started = await makeEvent({
      startTime: new Date(Date.now() - HOUR),
      endTime: new Date(Date.now() + HOUR),
    });

    expect((await expectApiError(registerForEvent(draft.id, p3.tenant, p3.member))).message).toContain(
      "draft",
    );
    expect(
      (await expectApiError(registerForEvent(cancelled.id, p3.tenant, p3.member))).message,
    ).toContain("cancelled");
    expect(
      (await expectApiError(registerForEvent(started.id, p3.tenant, p3.member))).message,
    ).toContain("started");
  });

  it("cannot be pointed at another college's event", async () => {
    const event = await makeEvent();

    // Correct event id, wrong tenant: the row lock is scoped by tenant, so the
    // lookup misses and the caller learns nothing.
    const error = await expectApiError(registerForEvent(event.id, p3.otherTenant, p3.member));
    expect(error.status).toBe(404);
  });
});

describe("re-registering", () => {
  it("revives the cancelled ticket instead of creating a second one", async () => {
    const event = await makeEvent();
    const first = await registerForEvent(event.id, p3.tenant, p3.member);

    await cancelTicket({
      ticketId: first.ticket.id,
      tenantId: p3.tenant,
      actorId: p3.member,
      canManageOthers: false,
    });

    const again = await registerForEvent(event.id, p3.tenant, p3.member);

    expect(again.outcome).toBe("registered");
    expect(again.ticket.id).toBe(first.ticket.id);
    expect(again.ticket.status).toBe("REGISTERED");
    expect(await testDb().ticket.count({ where: { eventId: event.id } })).toBe(1);
  });

  it("rotates the QR secret, so an old screenshot stops working", async () => {
    const event = await makeEvent();
    const first = await registerForEvent(event.id, p3.tenant, p3.member);

    const before = await testDb().ticket.findUnique({
      where: { id: first.ticket.id },
      select: { qrCodeUuid: true },
    });

    await cancelTicket({
      ticketId: first.ticket.id,
      tenantId: p3.tenant,
      actorId: p3.member,
      canManageOthers: false,
    });
    await registerForEvent(event.id, p3.tenant, p3.member);

    const after = await testDb().ticket.findUnique({
      where: { id: first.ticket.id },
      select: { qrCodeUuid: true, cancelledAt: true },
    });

    expect(after?.qrCodeUuid).not.toBe(before?.qrCodeUuid);
    expect(after?.cancelledAt).toBeNull();
  });
});

describe("cancelling", () => {
  it("promotes the first person in the queue into the freed seat", async () => {
    const event = await makeEvent({ capacity: 1, waitlistEnabled: true });

    const seated = await registerForEvent(event.id, p3.tenant, p3.member);
    const firstInLine = await registerForEvent(event.id, p3.tenant, p3.president);
    const secondInLine = await registerForEvent(event.id, p3.tenant, p3.owner);

    const result = await cancelTicket({
      ticketId: seated.ticket.id,
      tenantId: p3.tenant,
      actorId: p3.member,
      canManageOthers: false,
    });

    expect(result.changed).toBe(true);
    expect(result.promoted).toHaveLength(1);
    expect(result.promoted[0]?.ticketId).toBe(firstInLine.ticket.id);
    expect(result.promoted[0]?.displayName).toContain("Priya");

    // The promoted person now holds a seat and is no longer "position 1".
    const promoted = await testDb().ticket.findUnique({
      where: { id: firstInLine.ticket.id },
      select: { status: true, waitlistPosition: true },
    });
    expect(promoted).toEqual({ status: "REGISTERED", waitlistPosition: null });

    // And the next person keeps their place at the front of the queue.
    const roster = await listEventRoster(event.id, p3.tenant);
    expect(roster.waitlisted).toHaveLength(1);
    expect(roster.waitlisted[0]?.id).toBe(secondInLine.ticket.id);
    expect(roster.waitlisted[0]?.queuePosition).toBe(1);
  });

  it("does not promote anybody when a waiter leaves the queue", async () => {
    const event = await makeEvent({ capacity: 1, waitlistEnabled: true });

    await registerForEvent(event.id, p3.tenant, p3.member); // seat
    const waiter = await registerForEvent(event.id, p3.tenant, p3.president);

    const result = await cancelTicket({
      ticketId: waiter.ticket.id,
      tenantId: p3.tenant,
      actorId: p3.president,
      canManageOthers: false,
    });

    expect(result.changed).toBe(true);
    expect(result.promoted).toHaveLength(0);

    const roster = await listEventRoster(event.id, p3.tenant);
    expect(roster.registered).toHaveLength(1);
    expect(roster.waitlisted).toHaveLength(0);
  });

  it("is idempotent and keeps the row for history", async () => {
    const event = await makeEvent();
    const ticket = await registerForEvent(event.id, p3.tenant, p3.member);

    await cancelTicket({
      ticketId: ticket.ticket.id,
      tenantId: p3.tenant,
      actorId: p3.member,
      canManageOthers: false,
    });
    const again = await cancelTicket({
      ticketId: ticket.ticket.id,
      tenantId: p3.tenant,
      actorId: p3.member,
      canManageOthers: false,
    });

    expect(again.changed).toBe(false);

    const stored = await testDb().ticket.findUnique({
      where: { id: ticket.ticket.id },
      select: { status: true, cancelledAt: true, deletedAt: true },
    });
    expect(stored?.status).toBe("CANCELLED");
    expect(stored?.cancelledAt).toBeInstanceOf(Date);
    // Soft, not gone: attendance reports need to know who dropped out.
    expect(stored?.deletedAt).toBeNull();
  });

  it("hides somebody else's ticket behind a 404", async () => {
    const event = await makeEvent();
    const ticket = await registerForEvent(event.id, p3.tenant, p3.member);

    const error = await expectApiError(
      cancelTicket({
        ticketId: ticket.ticket.id,
        tenantId: p3.tenant,
        actorId: p3.president,
        canManageOthers: false,
      }),
    );

    expect(error.status).toBe(404);
    // Untouched.
    expect(
      await testDb().ticket.count({ where: { id: ticket.ticket.id, status: "REGISTERED" } }),
    ).toBe(1);
  });

  it("lets an organiser cancel someone else's ticket", async () => {
    const event = await makeEvent();
    const ticket = await registerForEvent(event.id, p3.tenant, p3.member);

    const result = await cancelTicket({
      ticketId: ticket.ticket.id,
      tenantId: p3.tenant,
      actorId: p3.president,
      canManageOthers: true,
    });

    expect(result.changed).toBe(true);
  });
});

describe("the queue under pressure", () => {
  it("never sells seat 6 of a 5-seat room, even with 20 simultaneous requests", async () => {
    const event = await makeEvent({ capacity: 5, waitlistEnabled: true });
    const students = await Promise.all(Array.from({ length: 20 }, (_, i) => makeStudent(i)));

    // Every request starts before any of them finishes: this is the stampede.
    const results = await Promise.allSettled(
      students.map((student) => registerForEvent(event.id, p3.tenant, student)),
    );

    expect(results.every((result) => result.status === "fulfilled")).toBe(true);

    const registered = await testDb().ticket.count({
      where: { eventId: event.id, status: "REGISTERED" },
    });
    const waitlisted = await testDb().ticket.count({
      where: { eventId: event.id, status: "WAITLISTED" },
    });

    expect(registered).toBe(5);
    expect(waitlisted).toBe(15);
    expect(await testDb().ticket.count({ where: { eventId: event.id } })).toBe(20);
  });

  it("gives every waiter a distinct place in line", async () => {
    const event = await makeEvent({ capacity: 2, waitlistEnabled: true });
    const students = await Promise.all(Array.from({ length: 10 }, (_, i) => makeStudent(i)));

    await Promise.all(
      students.map((student) => registerForEvent(event.id, p3.tenant, student)),
    );

    const waiting = await testDb().ticket.findMany({
      where: { eventId: event.id, status: "WAITLISTED" },
      select: { waitlistPosition: true },
      orderBy: { waitlistPosition: "asc" },
    });

    const positions = waiting.map((ticket) => ticket.waitlistPosition);
    expect(positions).toHaveLength(8);
    // Two people must never share a place in the queue.
    expect(new Set(positions).size).toBe(8);
  });

  it("rejects the losers cleanly when there is no waitlist", async () => {
    const event = await makeEvent({ capacity: 3, waitlistEnabled: false });
    const students = await Promise.all(Array.from({ length: 15 }, (_, i) => makeStudent(i)));

    const results = await Promise.allSettled(
      students.map((student) => registerForEvent(event.id, p3.tenant, student)),
    );

    const fulfilled = results.filter((result) => result.status === "fulfilled");
    const rejected = results.filter(
      (result): result is PromiseRejectedResult => result.status === "rejected",
    );

    expect(fulfilled).toHaveLength(3);
    expect(rejected).toHaveLength(12);
    expect(rejected.every((result) => result.reason instanceof ApiError)).toBe(true);
    expect(rejected.every((result) => result.reason.status === 409)).toBe(true);

    expect(
      await testDb().ticket.count({ where: { eventId: event.id, status: "REGISTERED" } }),
    ).toBe(3);
  });

  it("gives one person exactly one ticket when they tap five times at once", async () => {
    const event = await makeEvent({ capacity: 10 });

    const results = await Promise.allSettled(
      Array.from({ length: 5 }, () => registerForEvent(event.id, p3.tenant, p3.member)),
    );

    expect(results.every((result) => result.status === "fulfilled")).toBe(true);
    expect(await testDb().ticket.count({ where: { eventId: event.id } })).toBe(1);
  });
});

describe("raising the capacity", () => {
  it("lets the queue in, in order, instead of waiting for a cancellation", async () => {
    const event = await makeEvent({ capacity: 1, waitlistEnabled: true });

    await registerForEvent(event.id, p3.tenant, p3.member);
    const first = await registerForEvent(event.id, p3.tenant, p3.president);
    const second = await registerForEvent(event.id, p3.tenant, p3.owner);

    await updateEvent(event.id, p3.tenant, "Asia/Kolkata", { capacity: 3 });

    const roster = await listEventRoster(event.id, p3.tenant);
    expect(roster.registered.map((ticket) => ticket.id)).toEqual(
      expect.arrayContaining([first.ticket.id, second.ticket.id]),
    );
    expect(roster.waitlisted).toHaveLength(0);
  });

  it("leaves the queue alone when the capacity does not actually grow", async () => {
    const event = await makeEvent({ capacity: 1, waitlistEnabled: true });

    await registerForEvent(event.id, p3.tenant, p3.member);
    await registerForEvent(event.id, p3.tenant, p3.president);

    // Editing the title is not an invitation to promote anybody.
    await updateEvent(event.id, p3.tenant, "Asia/Kolkata", { title: "Renamed Event" });

    const roster = await listEventRoster(event.id, p3.tenant);
    expect(roster.registered).toHaveLength(1);
    expect(roster.waitlisted).toHaveLength(1);
  });
});

describe("what each person can see", () => {
  it("lists a student's own tickets with the college's timezone", async () => {
    const event = await makeEvent();
    await registerForEvent(event.id, p3.tenant, p3.member);

    const tickets = await listMyTickets(p3.member);

    expect(tickets).toHaveLength(1);
    expect(tickets[0]?.event.id).toBe(event.id);
    expect(tickets[0]?.event.club.tenant.timezone).toBe("Asia/Kolkata");
  });

  it("shows a live ticket for the event page but not a cancelled one", async () => {
    const event = await makeEvent();
    const ticket = await registerForEvent(event.id, p3.tenant, p3.member);

    expect((await findTicketForUser(event.id, p3.member))?.id).toBe(ticket.ticket.id);

    await cancelTicket({
      ticketId: ticket.ticket.id,
      tenantId: p3.tenant,
      actorId: p3.member,
      canManageOthers: false,
    });

    expect(await findTicketForUser(event.id, p3.member)).toBeNull();
  });

  it("lets only the owner open their ticket, secret and all", async () => {
    const event = await makeEvent();
    const ticket = await registerForEvent(event.id, p3.tenant, p3.member);

    const mine = await getTicketForOwner(ticket.ticket.id, p3.member);
    expect(mine.qrCodeUuid).toBeTruthy();

    const error = await expectApiError(
      getTicketForOwner(ticket.ticket.id, p3.president),
    );
    expect(error.status).toBe(404);
  });
});
