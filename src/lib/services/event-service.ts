import "server-only";

import { ApiError } from "@/lib/api/response";
import { db } from "@/lib/db/client";
import { wallClockToUtc } from "@/lib/format/date";
import { promoteAfterCapacityChange } from "@/lib/services/ticket-service";
import type { EventStatus } from "@/generated/prisma/enums";
import type { CreateEventInput, UpdateEventInput } from "@/lib/validation/event";

/**
 * Event lifecycle.
 *
 * Three rules shape everything here:
 *
 *  1. **Times are stored in UTC.** The browser sends a wall clock reading and the
 *     college's timezone (from `requireClubAccess`) turns it into an instant, so
 *     the database never holds a local time that changes meaning twice a year.
 *  2. **Status moves in one direction.** Draft → Published → Cancelled. Nothing
 *     is published implicitly, and cancelling is how you tell people an event is
 *     off — deleting is reserved for drafts and cancelled events, so a student's
 *     ticket history is never silently destroyed.
 *  3. **Members-only means members-only.** A non-member gets a 404, not a "you
 *     are not allowed" — the same rule the club pages already follow.
 */

export const EVENT_STATUS_LABELS: Record<EventStatus, string> = {
  DRAFT: "Draft",
  PUBLISHED: "Published",
  CANCELLED: "Cancelled",
};

/** Everything a list row needs, without loading rows we do not render. */
const EVENT_LIST_SELECT = {
  id: true,
  title: true,
  description: true,
  location: true,
  startTime: true,
  endTime: true,
  capacity: true,
  waitlistEnabled: true,
  status: true,
  isPublic: true,
  createdAt: true,
} as const;

/**
 * How many seats are actually held, and how many people are queuing.
 *
 * This used to be `_count.tickets`, which counts *every* row — including
 * cancelled ones. With no ticketing that was harmless; the moment students can
 * cancel, it would show "7 / 6" and make the bar look broken. A seat is held
 * only by a REGISTERED ticket; people in the queue hold nothing yet.
 *
 * One grouped query for the whole page rather than one count per row.
 */
export async function ticketCountsByEvent(
  eventIds: readonly string[],
): Promise<Map<string, { registered: number; waitlisted: number }>> {
  const counts = new Map<string, { registered: number; waitlisted: number }>();
  for (const id of eventIds) counts.set(id, { registered: 0, waitlisted: 0 });

  if (eventIds.length === 0) return counts;

  const rows = await db.ticket.groupBy({
    by: ["eventId", "status"],
    where: {
      eventId: { in: [...eventIds] },
      status: { in: ["REGISTERED", "WAITLISTED"] },
    },
    _count: { _all: true },
  });

  for (const row of rows) {
    const entry = counts.get(row.eventId);
    if (!entry) continue;

    if (row.status === "REGISTERED") entry.registered = row._count._all;
    else entry.waitlisted = row._count._all;
  }

  return counts;
}

export interface EventListOptions {
  /** Drafts are only ever shown to people who can edit them. */
  readonly includeDrafts: boolean;
  /** Cancelled events stay visible (greyed out) so nobody turns up to a dead event. */
  readonly includeCancelled?: boolean;
}

/** Events belonging to one club, newest first by start time. */
export async function listClubEvents(
  clubId: string,
  tenantId: string,
  options: EventListOptions,
) {
  const events = await db.event.findMany({
    where: {
      clubId,
      tenantId,
      deletedAt: null,
      // A cancelled event stays visible to everyone on purpose: students who were
      // planning to attend must be able to see that it is off. Only DRAFTs are
      // private.
      ...(options.includeDrafts
        ? {}
        : {
            status:
              options.includeCancelled === false
                ? "PUBLISHED"
                : { in: ["PUBLISHED", "CANCELLED"] },
          }),
    },
    orderBy: { startTime: "asc" },
    select: EVENT_LIST_SELECT,
  });

  const counts = await ticketCountsByEvent(events.map((event) => event.id));

  return events.map((event) => ({
    ...event,
    registeredCount: counts.get(event.id)?.registered ?? 0,
    waitlistedCount: counts.get(event.id)?.waitlisted ?? 0,
  }));
}

/**
 * Loads one event, applying the visibility rule.
 *
 * A members-only event is invisible to anyone outside the club — including a
 * member of the same college — and answers 404 rather than 403 so its existence
 * cannot be probed.
 */
export async function getVisibleEvent(eventId: string, tenantId: string, canViewPrivate: boolean) {
  const event = await db.event.findFirst({
    where: { id: eventId, tenantId, deletedAt: null },
    select: {
      id: true,
      tenantId: true,
      clubId: true,
      title: true,
      description: true,
      location: true,
      startTime: true,
      endTime: true,
      capacity: true,
      waitlistEnabled: true,
      status: true,
      isPublic: true,
      createdById: true,
      createdAt: true,
      updatedAt: true,
      club: { select: { name: true, slug: true } },
    },
  });

  if (!event) throw ApiError.notFound("That event was not found.");

  if (!event.isPublic && !canViewPrivate) {
    // Same answer as a missing row: nobody learns that a private event exists.
    throw ApiError.notFound("That event was not found.");
  }

  const counts = await ticketCountsByEvent([event.id]);

  return {
    ...event,
    registeredCount: counts.get(event.id)?.registered ?? 0,
    waitlistedCount: counts.get(event.id)?.waitlisted ?? 0,
  };
}

export interface CreateEventArgs {
  readonly clubId: string;
  readonly tenantId: string;
  readonly timeZone: string;
  readonly createdById: string;
  readonly input: CreateEventInput;
}

/** Creates a DRAFT. Publishing is deliberately a separate action. */
export async function createEvent({
  clubId,
  tenantId,
  timeZone,
  createdById,
  input,
}: CreateEventArgs) {
  const club = await db.club.findFirst({
    where: { id: clubId, tenantId, deletedAt: null },
    select: { id: true },
  });
  if (!club) throw ApiError.notFound("That club was not found.");

  const startTime = wallClockToUtc(input.start, timeZone);
  const endTime = wallClockToUtc(input.end, timeZone);

  // The schema has already checked both; this is the belt-and-braces conversion
  // that stops an `Invalid Date` reaching Postgres if anything bypassed it.
  if (!startTime || !endTime) {
    throw new ApiError("VALIDATION_ERROR", "That time does not exist in this timezone.", {
      details: { start: ["Pick a different time."] },
    });
  }

  return db.event.create({
    data: {
      tenantId,
      clubId,
      title: input.title,
      description: input.description ?? null,
      location: input.location ?? null,
      startTime,
      endTime,
      capacity: input.capacity ?? null,
      waitlistEnabled: input.waitlistEnabled,
      isPublic: input.isPublic,
      status: "DRAFT",
      createdById,
    },
    select: {
      id: true,
      title: true,
      status: true,
      startTime: true,
      endTime: true,
      capacity: true,
      isPublic: true,
    },
  });
}

/**
 * Applies a partial update, then re-checks the two rules that depend on the
 * *merged* result rather than on the payload alone:
 * a waitlist needs a capacity, and a capacity cannot be lowered below the number
 * of people already holding a ticket.
 */
export async function updateEvent(
  eventId: string,
  tenantId: string,
  timeZone: string,
  input: UpdateEventInput,
) {
  const existing = await db.event.findFirst({
    where: { id: eventId, tenantId, deletedAt: null },
    select: {
      id: true,
      status: true,
      capacity: true,
      waitlistEnabled: true,
      startTime: true,
      endTime: true,
    },
  });

  if (!existing) throw ApiError.notFound("That event was not found.");

  if (existing.status === "CANCELLED") {
    throw new ApiError(
      "CONFLICT",
      "This event was cancelled, so it can no longer be edited. Create a new one instead.",
    );
  }

  const capacity = input.capacity === undefined ? existing.capacity : input.capacity;
  const waitlistEnabled = input.waitlistEnabled ?? existing.waitlistEnabled;

  if (waitlistEnabled && (capacity === null || capacity === undefined)) {
    throw new ApiError("VALIDATION_ERROR", "A waitlist needs a capacity.", {
      details: {
        waitlistEnabled: ["Set a capacity first — a waitlist only makes sense once the room can fill up."],
      },
    });
  }

  if (input.capacity !== undefined && input.capacity !== null) {
    const registered = await db.ticket.count({
      where: { eventId, status: { in: ["REGISTERED", "WAITLISTED"] } },
    });

    if (input.capacity < registered) {
      throw new ApiError(
        "CONFLICT",
        `${registered} people already hold a place. Capacity cannot be set below that — cancel their tickets first.`,
      );
    }
  }

  const startTime = input.start ? wallClockToUtc(input.start, timeZone) : undefined;
  const endTime = input.end ? wallClockToUtc(input.end, timeZone) : undefined;

  const updated = await db.event.update({
    where: { id: eventId },
    data: {
      ...(input.title === undefined ? {} : { title: input.title }),
      ...(input.description === undefined ? {} : { description: input.description }),
      ...(input.location === undefined ? {} : { location: input.location }),
      ...(input.capacity === undefined ? {} : { capacity: input.capacity }),
      ...(input.waitlistEnabled === undefined ? {} : { waitlistEnabled: input.waitlistEnabled }),
      ...(input.isPublic === undefined ? {} : { isPublic: input.isPublic }),
      ...(startTime ? { startTime } : {}),
      ...(endTime ? { endTime } : {}),
    },
    select: {
      id: true,
      title: true,
      status: true,
      startTime: true,
      endTime: true,
      capacity: true,
      isPublic: true,
    },
  });

  // Raising the capacity is a promise to the queue as much as to the room: the
  // people who were told "no space" should be let in immediately, not when
  // somebody happens to cancel. (A null capacity means unlimited, and an unlimited
  // event never had a queue to begin with.)
  const grew =
    input.capacity !== undefined &&
    input.capacity !== null &&
    existing.capacity !== null &&
    input.capacity > existing.capacity;

  if (grew) {
    await promoteAfterCapacityChange(eventId, tenantId);
  }

  return updated;
}

/**
 * Draft → Published.
 *
 * Refused for events that have already finished (publishing the past announces
 * nothing), and idempotent for events that are already published.
 */
export async function publishEvent(eventId: string, tenantId: string) {
  const event = await db.event.findFirst({
    where: { id: eventId, tenantId, deletedAt: null },
    select: { id: true, status: true, endTime: true },
  });

  if (!event) throw ApiError.notFound("That event was not found.");

  if (event.status === "CANCELLED") {
    throw new ApiError("CONFLICT", "This event was cancelled. Create a new one instead of publishing it.");
  }

  if (event.status === "PUBLISHED") {
    return { id: event.id, status: event.status, changed: false as const };
  }

  if (event.endTime.getTime() < Date.now()) {
    throw new ApiError(
      "CONFLICT",
      "This event has already finished, so publishing it would announce nothing. Edit the dates first.",
    );
  }

  const updated = await db.event.update({
    where: { id: event.id },
    data: { status: "PUBLISHED" },
    select: { id: true, status: true },
  });

  return { ...updated, changed: true as const };
}

/**
 * → Cancelled.
 *
 * This is the honest way to call off an event: it stays visible (so nobody turns
 * up), and every ticket and attendance row survives for reporting.
 */
export async function cancelEvent(eventId: string, tenantId: string) {
  const event = await db.event.findFirst({
    where: { id: eventId, tenantId, deletedAt: null },
    select: { id: true, status: true },
  });

  if (!event) throw ApiError.notFound("That event was not found.");

  if (event.status === "CANCELLED") {
    return { id: event.id, status: event.status, changed: false as const };
  }

  const updated = await db.event.update({
    where: { id: event.id },
    data: { status: "CANCELLED" },
    select: { id: true, status: true },
  });

  return { ...updated, changed: true as const };
}

/**
 * Soft-deletes an event.
 *
 * Only drafts and already-cancelled events may be deleted. A published event has
 * been seen by students, so the honest way to remove it is to cancel it first —
 * otherwise a ticket would point at an event that no longer exists.
 */
export async function softDeleteEvent(eventId: string, tenantId: string) {
  const event = await db.event.findFirst({
    where: { id: eventId, tenantId, deletedAt: null },
    select: { id: true, status: true },
  });

  if (!event) throw ApiError.notFound("That event was not found.");

  if (event.status === "PUBLISHED") {
    throw new ApiError(
      "CONFLICT",
      "This event is published, so students can already see it. Cancel it first, then delete it.",
    );
  }

  await db.event.update({ where: { id: event.id }, data: { deletedAt: new Date() } });

  // Ticket and attendance rows are deliberately untouched: a cancelled event's
  // history is what makes attendance reports possible later.
  return { id: event.id, deletedAt: new Date().toISOString() };
}

/**
 * Published, upcoming events this person is allowed to see, across every college
 * they belong to.
 *
 * The visibility rule is the product's, not the UI's: a public event is visible to
 * anyone in the college, a members-only event only to that club's members. The
 * query applies it in SQL so a members-only event cannot leak into a list by
 * being filtered client-side afterwards.
 *
 * Drafts never appear here — they are somebody's unfinished work, and this is the
 * "what is on this week" page.
 */
export async function listUpcomingEventsForUser(userId: string) {
  const [tenantMemberships, clubMemberships] = await Promise.all([
    db.tenantMember.findMany({
      where: { userId, deletedAt: null, tenant: { deletedAt: null } },
      select: { tenantId: true },
    }),
    db.clubMember.findMany({
      where: { userId, deletedAt: null, club: { deletedAt: null } },
      select: { clubId: true },
    }),
  ]);

  const tenantIds = tenantMemberships.map((membership) => membership.tenantId);
  if (tenantIds.length === 0) return [];

  const clubIds = clubMemberships.map((membership) => membership.clubId);

  const events = await db.event.findMany({
    where: {
      tenantId: { in: tenantIds },
      deletedAt: null,
      status: "PUBLISHED",
      endTime: { gt: new Date() },
      OR: [{ isPublic: true }, { clubId: { in: clubIds } }],
    },
    orderBy: { startTime: "asc" },
    take: 60,
    select: {
      id: true,
      title: true,
      location: true,
      startTime: true,
      endTime: true,
      capacity: true,
      waitlistEnabled: true,
      isPublic: true,
      club: {
        select: {
          id: true,
          name: true,
          tenant: { select: { name: true, timezone: true } },
        },
      },
    },
  });

  const counts = await ticketCountsByEvent(events.map((event) => event.id));

  return events.map((event) => ({
    ...event,
    registeredCount: counts.get(event.id)?.registered ?? 0,
    waitlistedCount: counts.get(event.id)?.waitlisted ?? 0,
  }));
}
