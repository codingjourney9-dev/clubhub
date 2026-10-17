import { beforeEach, describe, expect, it } from "vitest";

import { ApiError } from "../../src/lib/api/response";
import { wallClockToUtc } from "../../src/lib/format/date";
import {
  cancelEvent,
  createEvent,
  getVisibleEvent,
  listClubEvents,
  publishEvent,
  softDeleteEvent,
  updateEvent,
} from "../../src/lib/services/event-service";
import { assertTestDatabase, testDb, truncateAll } from "../helpers/db";
import { p3, seedClubWorkspace } from "../helpers/phase3";

/**
 * Event lifecycle against a real database.
 *
 * The claims under test are the ones a UI cannot be trusted to uphold: times are
 * stored as UTC instants resolved in the college's zone, a members-only event is
 * invisible outside the club, and status only moves Draft → Published →
 * Cancelled — with deleting reserved for events nobody is relying on.
 */

const KL = "Asia/Kolkata";
const LONDON = "Europe/London";

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

/** Tomorrow at 09:00 in the given zone, as the form would send it. */
function tomorrowAt(hour: number, timeZone = KL): string {
  const date = new Date(Date.now() + 86_400_000);
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
  return `${parts}T${String(hour).padStart(2, "0")}:00`;
}

const baseInput = {
  title: "RoboWars 2026",
  description: "Bot vs bot",
  location: "Open Air Theatre",
  capacity: 100,
  waitlistEnabled: false,
  isPublic: true,
} as const;

describe("creating an event", () => {
  it("stores the wall clock as a UTC instant in the college's timezone", async () => {
    const start = tomorrowAt(9);
    const end = tomorrowAt(11);

    const event = await createEvent({
      clubId: p3.club,
      tenantId: p3.tenant,
      timeZone: KL,
      createdById: p3.president,
      input: { ...baseInput, start, end },
    });

    // 09:00 in India is 03:30 UTC — the database holds the instant, not the text.
    expect(event.startTime.toISOString()).toContain("T03:30:00.000Z");

    const stored = await testDb().event.findUnique({
      where: { id: event.id },
      select: { startTime: true, status: true },
    });
    expect(stored?.startTime.toISOString()).toBe(wallClockToUtc(start, KL)?.toISOString());
  });

  it("always starts as a DRAFT, even when every field is filled in", async () => {
    const event = await createEvent({
      clubId: p3.club,
      tenantId: p3.tenant,
      timeZone: KL,
      createdById: p3.president,
      input: { ...baseInput, start: tomorrowAt(9), end: tomorrowAt(11) },
    });

    expect(event.status).toBe("DRAFT");
  });

  it("keeps an unlimited capacity as null rather than 0", async () => {
    const event = await createEvent({
      clubId: p3.club,
      tenantId: p3.tenant,
      timeZone: KL,
      createdById: p3.president,
      input: { ...baseInput, capacity: null, start: tomorrowAt(9), end: tomorrowAt(11) },
    });

    expect(event.capacity).toBeNull();
  });

  it("refuses a club from another college", async () => {
    const error = await expectApiError(
      createEvent({
        clubId: p3.club,
        tenantId: p3.otherTenant,
        timeZone: KL,
        createdById: p3.outsider,
        input: { ...baseInput, start: tomorrowAt(9), end: tomorrowAt(11) },
      }),
    );
    expect(error.status).toBe(404);
  });

  it("refuses a club that has been softly deleted", async () => {
    await testDb().club.update({ where: { id: p3.club }, data: { deletedAt: new Date() } });

    const error = await expectApiError(
      createEvent({
        clubId: p3.club,
        tenantId: p3.tenant,
        timeZone: KL,
        createdById: p3.president,
        input: { ...baseInput, start: tomorrowAt(9), end: tomorrowAt(11) },
      }),
    );
    expect(error.status).toBe(404);
  });
});

describe("listing events", () => {
  beforeEach(async () => {
    await createEvent({
      clubId: p3.club,
      tenantId: p3.tenant,
      timeZone: KL,
      createdById: p3.president,
      input: { ...baseInput, title: "Public Draft", start: tomorrowAt(9), end: tomorrowAt(10) },
    });
  });

  it("hides drafts from people who cannot edit events", async () => {
    const memberView = await listClubEvents(p3.club, p3.tenant, { includeDrafts: false });
    expect(memberView.map((event) => event.title)).not.toContain("Public Draft");

    const organiserView = await listClubEvents(p3.club, p3.tenant, { includeDrafts: true });
    expect(organiserView.map((event) => event.title)).toContain("Public Draft");
  });

  it("never returns another college's events", async () => {
    const foreign = await listClubEvents(p3.club, p3.otherTenant, { includeDrafts: true });
    expect(foreign).toHaveLength(0);
  });

  it("excludes softly deleted events", async () => {
    const event = await createEvent({
      clubId: p3.club,
      tenantId: p3.tenant,
      timeZone: KL,
      createdById: p3.president,
      input: { ...baseInput, title: "Gone Soon", start: tomorrowAt(9), end: tomorrowAt(10) },
    });
    await softDeleteEvent(event.id, p3.tenant);

    const events = await listClubEvents(p3.club, p3.tenant, { includeDrafts: true });
    expect(events.map((row) => row.title)).not.toContain("Gone Soon");
  });

  it("counts registrations for the capacity display", async () => {
    const events = await listClubEvents(p3.club, p3.tenant, { includeDrafts: true });
    expect(events[0]?.registeredCount).toBe(0);
  });
});

describe("visibility of members-only events", () => {
  async function createPrivateEvent(): Promise<string> {
    const event = await createEvent({
      clubId: p3.club,
      tenantId: p3.tenant,
      timeZone: KL,
      createdById: p3.president,
      input: {
        ...baseInput,
        title: "Members Only Workshop",
        isPublic: false,
        start: tomorrowAt(9),
        end: tomorrowAt(11),
      },
    });
    await publishEvent(event.id, p3.tenant);
    return event.id;
  }

  it("is visible to a club member", async () => {
    const eventId = await createPrivateEvent();
    const event = await getVisibleEvent(eventId, p3.tenant, true);
    expect(event.title).toBe("Members Only Workshop");
  });

  it("answers 404 to someone outside the club — not 403", async () => {
    const eventId = await createPrivateEvent();

    const error = await expectApiError(getVisibleEvent(eventId, p3.tenant, false));
    expect(error.status).toBe(404);
    expect(error.message).not.toContain("Workshop");
  });

  it("still 404s for a completely different college", async () => {
    const eventId = await createPrivateEvent();
    const error = await expectApiError(getVisibleEvent(eventId, p3.otherTenant, true));
    expect(error.status).toBe(404);
  });

  it("shows a public event to any member of the college", async () => {
    const event = await createEvent({
      clubId: p3.club,
      tenantId: p3.tenant,
      timeZone: KL,
      createdById: p3.president,
      input: { ...baseInput, title: "Open Day", start: tomorrowAt(9), end: tomorrowAt(11) },
    });
    await publishEvent(event.id, p3.tenant);

    const visible = await getVisibleEvent(event.id, p3.tenant, false);
    expect(visible.title).toBe("Open Day");
  });
});

describe("publishing", () => {
  it("moves a draft to published, once", async () => {
    const event = await createEvent({
      clubId: p3.club,
      tenantId: p3.tenant,
      timeZone: KL,
      createdById: p3.president,
      input: { ...baseInput, start: tomorrowAt(9), end: tomorrowAt(11) },
    });

    const first = await publishEvent(event.id, p3.tenant);
    expect(first.status).toBe("PUBLISHED");
    expect(first.changed).toBe(true);

    // Clicking publish twice is not an error.
    const second = await publishEvent(event.id, p3.tenant);
    expect(second.changed).toBe(false);
  });

  it("refuses an event that has already finished", async () => {
    const event = await createEvent({
      clubId: p3.club,
      tenantId: p3.tenant,
      timeZone: KL,
      createdById: p3.president,
      input: { ...baseInput, start: tomorrowAt(9), end: tomorrowAt(11) },
    });

    await testDb().event.update({
      where: { id: event.id },
      data: {
        startTime: new Date(Date.now() - 7_200_000),
        endTime: new Date(Date.now() - 3_600_000),
      },
    });

    const error = await expectApiError(publishEvent(event.id, p3.tenant));
    expect(error.status).toBe(409);
    expect(error.message).toContain("already finished");
  });

  it("refuses to publish a cancelled event", async () => {
    const event = await createEvent({
      clubId: p3.club,
      tenantId: p3.tenant,
      timeZone: KL,
      createdById: p3.president,
      input: { ...baseInput, start: tomorrowAt(9), end: tomorrowAt(11) },
    });
    await cancelEvent(event.id, p3.tenant);

    const error = await expectApiError(publishEvent(event.id, p3.tenant));
    expect(error.status).toBe(409);
  });
});

describe("cancelling", () => {
  it("keeps the event visible and keeps its tickets", async () => {
    const event = await createEvent({
      clubId: p3.club,
      tenantId: p3.tenant,
      timeZone: KL,
      createdById: p3.president,
      input: { ...baseInput, start: tomorrowAt(9), end: tomorrowAt(11) },
    });
    await publishEvent(event.id, p3.tenant);

    await testDb().ticket.create({
      data: {
        tenantId: p3.tenant,
        eventId: event.id,
        userId: p3.member,
        qrCodeUuid: crypto.randomUUID(),
      },
    });

    await cancelEvent(event.id, p3.tenant);

    const events = await listClubEvents(p3.club, p3.tenant, { includeDrafts: false });
    expect(events.map((row) => row.status)).toContain("CANCELLED");

    const tickets = await testDb().ticket.count({ where: { eventId: event.id } });
    expect(tickets).toBe(1);
  });

  it("is idempotent", async () => {
    const event = await createEvent({
      clubId: p3.club,
      tenantId: p3.tenant,
      timeZone: KL,
      createdById: p3.president,
      input: { ...baseInput, start: tomorrowAt(9), end: tomorrowAt(11) },
    });

    expect((await cancelEvent(event.id, p3.tenant)).changed).toBe(true);
    expect((await cancelEvent(event.id, p3.tenant)).changed).toBe(false);
  });
});

describe("deleting", () => {
  async function draftEvent() {
    return createEvent({
      clubId: p3.club,
      tenantId: p3.tenant,
      timeZone: KL,
      createdById: p3.president,
      input: { ...baseInput, start: tomorrowAt(9), end: tomorrowAt(11) },
    });
  }

  it("soft-deletes a draft", async () => {
    const event = await draftEvent();
    await softDeleteEvent(event.id, p3.tenant);

    const row = await testDb().event.findUnique({
      where: { id: event.id },
      select: { deletedAt: true },
    });
    expect(row?.deletedAt).not.toBeNull();

    const error = await expectApiError(getVisibleEvent(event.id, p3.tenant, true));
    expect(error.status).toBe(404);
  });

  it("refuses to delete a published event and says what to do instead", async () => {
    const event = await draftEvent();
    await publishEvent(event.id, p3.tenant);

    const error = await expectApiError(softDeleteEvent(event.id, p3.tenant));
    expect(error.status).toBe(409);
    expect(error.message).toContain("Cancel it first");
  });

  it("allows deleting once cancelled, keeping attendance rows for reporting", async () => {
    const event = await draftEvent();
    await publishEvent(event.id, p3.tenant);

    const ticket = await testDb().ticket.create({
      data: {
        tenantId: p3.tenant,
        eventId: event.id,
        userId: p3.member,
        qrCodeUuid: crypto.randomUUID(),
      },
    });
    await testDb().attendance.create({
      data: { tenantId: p3.tenant, eventId: event.id, ticketId: ticket.id, source: "SCANNER" },
    });

    await cancelEvent(event.id, p3.tenant);
    await softDeleteEvent(event.id, p3.tenant);

    const events = await listClubEvents(p3.club, p3.tenant, { includeDrafts: true });
    expect(events.map((row) => row.id)).not.toContain(event.id);

    // The history that matters survives the deletion.
    expect(await testDb().ticket.count({ where: { eventId: event.id } })).toBe(1);
    expect(await testDb().attendance.count({ where: { eventId: event.id } })).toBe(1);
  });
});

describe("editing", () => {
  async function draftEvent() {
    return createEvent({
      clubId: p3.club,
      tenantId: p3.tenant,
      timeZone: KL,
      createdById: p3.president,
      input: { ...baseInput, capacity: 10, start: tomorrowAt(9), end: tomorrowAt(11) },
    });
  }

  it("re-resolves the times when the window changes", async () => {
    const event = await draftEvent();
    const newStart = tomorrowAt(14);

    const updated = await updateEvent(event.id, p3.tenant, KL, {
      start: newStart,
      end: tomorrowAt(16),
    });

    expect(updated.startTime.toISOString()).toBe(wallClockToUtc(newStart, KL)?.toISOString());
  });

  it("refuses a capacity below the number of people already holding places", async () => {
    const event = await draftEvent();
    await testDb().ticket.createMany({
      data: [p3.member, p3.president].map((userId) => ({
        tenantId: p3.tenant,
        eventId: event.id,
        userId,
        qrCodeUuid: crypto.randomUUID(),
      })),
    });

    const error = await expectApiError(updateEvent(event.id, p3.tenant, KL, { capacity: 1 }));
    expect(error.status).toBe(409);
    expect(error.message).toContain("2 people");
  });

  it("refuses a waitlist with no capacity", async () => {
    const event = await draftEvent();

    const error = await expectApiError(
      updateEvent(event.id, p3.tenant, KL, { capacity: null, waitlistEnabled: true }),
    );
    expect(error.status).toBe(422);
    expect((error.details as Record<string, string[]>).waitlistEnabled?.[0]).toContain("capacity");
  });

  it("refuses to edit a cancelled event", async () => {
    const event = await draftEvent();
    await cancelEvent(event.id, p3.tenant);

    const error = await expectApiError(updateEvent(event.id, p3.tenant, KL, { title: "New name" }));
    expect(error.status).toBe(409);
  });

  it("cannot reach an event in another college", async () => {
    const event = await draftEvent();
    const error = await expectApiError(
      updateEvent(event.id, p3.otherTenant, KL, { title: "Hijacked" }),
    );
    expect(error.status).toBe(404);
  });
});

describe("timezone handling across colleges", () => {
  it("resolves the same wall clock differently for a London college", async () => {
    const start = tomorrowAt(9, LONDON);
    const end = tomorrowAt(11, LONDON);

    const event = await createEvent({
      clubId: p3.club,
      tenantId: p3.tenant,
      timeZone: LONDON,
      createdById: p3.president,
      input: { ...baseInput, start, end },
    });

    const stored = await testDb().event.findUnique({
      where: { id: event.id },
      select: { startTime: true },
    });

    // Same 09:00 reading, different instant: London's offset is not India's.
    expect(stored?.startTime.toISOString()).toBe(wallClockToUtc(start, LONDON)?.toISOString());
    expect(stored?.startTime.toISOString()).not.toBe(wallClockToUtc(start, KL)?.toISOString());
  });
});
