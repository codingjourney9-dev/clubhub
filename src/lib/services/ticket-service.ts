import "server-only";

import { randomUUID } from "node:crypto";

import { ApiError } from "@/lib/api/response";
import {
  decideSeat,
  nextWaitlistPosition,
  queueRank,
  registrationClosedReason,
  type ClosedReason,
} from "@/lib/domain/ticket-rules";
import { db } from "@/lib/db/client";
import type { Prisma } from "@/generated/prisma/client";
import type { TicketStatus } from "@/generated/prisma/enums";

/**
 * Ticketing.
 *
 * ## The problem this file exists to solve
 *
 * A popular event has 120 seats and 500 students tap "Register" in the same
 * second. The naive implementation is two statements:
 *
 *     const taken = await count(tickets);
 *     if (taken < capacity) await createTicket();
 *
 * and it is wrong. Every one of those 500 requests can read `taken = 119` before
 * any of them writes, and then all 380 "extra" people believe they have a seat.
 * This is the classic time-of-check-to-time-of-use race, and it cannot be fixed
 * in application code no matter how carefully you write the `if`.
 *
 * ## The fix
 *
 * Every write that can change the number of seats held takes a **row lock on the
 * event** before it counts anything:
 *
 *     SELECT … FROM events WHERE id = … FOR UPDATE
 *
 * The first transaction in gets the lock; everyone else for that event queues on
 * it, and each one then counts a *committed* number. Different events do not
 * block each other, so the lock is per-event rather than global. This is the same
 * mechanism a bank uses when moving money between two accounts.
 *
 * The database also participates in its own defence: `tickets` has a UNIQUE
 * (event_id, user_id) constraint, so even a bug in this file cannot produce two
 * tickets for one person on one event.
 */

/** Columns returned after a seat is claimed. */
const TICKET_SELECT = {
  id: true,
  status: true,
  waitlistPosition: true,
  createdAt: true,
} as const;

export type RegisterOutcome =
  | "registered"
  | "waitlisted"
  | "already-registered"
  | "already-waitlisted";

export interface IssuedTicket {
  readonly id: string;
  readonly status: TicketStatus;
  readonly waitlistPosition: number | null;
  /** 1-based place in the queue; null unless currently waitlisted. */
  readonly queuePosition: number | null;
}

export interface RegisterResult {
  readonly ticket: IssuedTicket;
  readonly outcome: RegisterOutcome;
}

/** Shape of the locked row; snake_case because it comes straight from SQL. */
interface LockedEventRow {
  id: string;
  capacity: number | null;
  waitlist_enabled: boolean;
  status: "DRAFT" | "PUBLISHED" | "CANCELLED";
  start_time: Date;
  end_time: Date;
}

/**
 * Takes the per-event write lock and returns the numbers that matter.
 *
 * `FOR UPDATE` is the whole trick: it makes the transaction that holds it the
 * only one allowed to change seats for this event. READ COMMITTED (Postgres'
 * default) gives every *statement* a fresh snapshot, so once the lock is granted
 * the following `count` sees everything the previous holder committed.
 */
async function lockEvent(
  tx: Prisma.TransactionClient,
  eventId: string,
  tenantId: string,
): Promise<LockedEventRow> {
  const rows = await tx.$queryRaw<LockedEventRow[]>`
    SELECT id, capacity, waitlist_enabled, status, start_time, end_time
    FROM events
    WHERE id = ${eventId}::uuid
      AND tenant_id = ${tenantId}::uuid
      AND deleted_at IS NULL
    FOR UPDATE
  `;

  const event = rows[0];
  if (!event) throw ApiError.notFound("That event was not found.");

  return event;
}

/** Human wording for "you cannot register, and here is why". */
function closedMessage(reason: ClosedReason): string {
  switch (reason) {
    case "DRAFT":
      return "This event is still a draft, so it is not taking registrations yet.";
    case "CANCELLED":
      return "This event was cancelled, so it is not taking registrations.";
    case "STARTED":
      return "Registration closed when this event started.";
  }
}

/** Every waitlisted position, in service order. Used to compute a queue rank. */
async function waitlistPositions(
  tx: Prisma.TransactionClient,
  eventId: string,
): Promise<number[]> {
  const rows = await tx.ticket.findMany({
    where: { eventId, status: "WAITLISTED", waitlistPosition: { not: null } },
    orderBy: [{ waitlistPosition: "asc" }, { createdAt: "asc" }],
    select: { waitlistPosition: true },
  });

  return rows.map((row) => row.waitlistPosition as number);
}

/**
 * Moves people from the queue into the room, oldest first, while there is space.
 *
 * Called with the event row already locked, from two places: a cancellation (one
 * seat freed) and a capacity increase (possibly many). The loop is the same code
 * for both — it just runs until the room is full or the queue is empty.
 *
 * Promotion clears `waitlistPosition`: a person with a seat is no longer in line,
 * and leaving a number there would make the next rank calculation lie.
 */
async function promoteFromWaitlist(
  tx: Prisma.TransactionClient,
  eventId: string,
  capacity: number | null,
): Promise<PromotedTicket[]> {
  // An unlimited event has no queue to promote from.
  if (capacity === null) return [];

  const promoted: PromotedTicket[] = [];
  let registered = await tx.ticket.count({ where: { eventId, status: "REGISTERED" } });

  while (registered < capacity) {
    const next = await tx.ticket.findFirst({
      where: { eventId, status: "WAITLISTED" },
      orderBy: [{ waitlistPosition: "asc" }, { createdAt: "asc" }],
      select: {
        id: true,
        userId: true,
        user: { select: { firstName: true, lastName: true, email: true } },
      },
    });

    if (!next) break;

    await tx.ticket.update({
      where: { id: next.id },
      data: { status: "REGISTERED", waitlistPosition: null },
    });

    registered += 1;
    promoted.push({
      ticketId: next.id,
      userId: next.userId,
      displayName:
        [next.user.firstName, next.user.lastName].filter(Boolean).join(" ") || next.user.email,
    });
  }

  return promoted;
}

export interface PromotedTicket {
  readonly ticketId: string;
  readonly userId: string;
  readonly displayName: string;
}

/**
 * Claims a seat (or a place in the queue) for one person.
 *
 * Idempotent by design: asking twice returns the ticket you already have rather
 * than failing. That matters because the most common cause of a double request is
 * not mischief — it is a student tapping twice on a slow connection.
 *
 * A cancelled ticket is *revived* rather than duplicated, because the unique
 * (event_id, user_id) constraint means the old row is the only one this person
 * can ever have. Its QR secret is rotated, so a screenshot of the cancelled
 * ticket is worthless.
 */
export async function registerForEvent(
  eventId: string,
  tenantId: string,
  userId: string,
): Promise<RegisterResult> {
  return db.$transaction(
    async (tx) => {
      const event = await lockEvent(tx, eventId, tenantId);

      const closed = registrationClosedReason({
        status: event.status,
        startTime: event.start_time,
        now: new Date(),
      });

      if (closed) {
        throw new ApiError("CONFLICT", closedMessage(closed));
      }

      const existing = await tx.ticket.findFirst({
        where: { eventId, userId },
        select: { id: true, status: true, waitlistPosition: true },
      });

      if (existing && existing.status !== "CANCELLED") {
        const positions =
          existing.status === "WAITLISTED" ? await waitlistPositions(tx, eventId) : [];

        return {
          ticket: {
            id: existing.id,
            status: existing.status,
            waitlistPosition: existing.waitlistPosition,
            queuePosition: queueRank(positions, existing.waitlistPosition),
          },
          outcome:
            existing.status === "WAITLISTED" ? "already-waitlisted" : "already-registered",
        } satisfies RegisterResult;
      }

      const registeredCount = await tx.ticket.count({
        where: { eventId, status: "REGISTERED" },
      });

      const seat = decideSeat({
        capacity: event.capacity,
        registeredCount,
        waitlistEnabled: event.waitlist_enabled,
      });

      if (seat === "FULL") {
        throw new ApiError(
          "CONFLICT",
          "This event is full, and its organisers did not open a waitlist.",
        );
      }

      let waitlistPosition: number | null = null;

      if (seat === "WAITLISTED") {
        const highest = await tx.ticket.aggregate({
          where: { eventId, status: "WAITLISTED" },
          _max: { waitlistPosition: true },
        });

        waitlistPosition = nextWaitlistPosition(highest._max.waitlistPosition ?? null);
      }

      const data = {
        status: seat,
        waitlistPosition,
        cancelledAt: null,
        deletedAt: null,
        // New secret on every issuance: a photographed QR from a cancelled
        // ticket must not become valid again when the person re-registers.
        qrCodeUuid: randomUUID(),
      } as const;

      const ticket = existing
        ? await tx.ticket.update({ where: { id: existing.id }, data, select: TICKET_SELECT })
        : await tx.ticket.create({
            data: { tenantId, eventId, userId, ...data },
            select: TICKET_SELECT,
          });

      const positions = seat === "WAITLISTED" ? await waitlistPositions(tx, eventId) : [];

      return {
        ticket: {
          ...ticket,
          queuePosition: queueRank(positions, waitlistPosition),
        },
        outcome: seat === "WAITLISTED" ? "waitlisted" : "registered",
      } satisfies RegisterResult;
    },
    // Room under contention: transactions queue on the row lock. These ceilings
    // are generous on purpose — the point of the lock is that waiting is correct.
    { maxWait: 15_000, timeout: 15_000 },
  );
}

export interface CancelResult {
  readonly ticketId: string;
  readonly changed: boolean;
  /** People this cancellation let into the room, front of the queue first. */
  readonly promoted: readonly PromotedTicket[];
}

/**
 * Gives a seat back.
 *
 * Three things happen atomically: the ticket is marked cancelled (never deleted —
 * attendance history has to survive), any seat it held goes to the front of the
 * queue, and the queue is re-ranked. All three under the same event lock, so two
 * people cancelling at once cannot promote the same waiter twice.
 */
export async function cancelTicket(args: {
  readonly ticketId: string;
  readonly tenantId: string;
  readonly actorId: string;
  /** Organisers may cancel anyone's ticket; everyone else only their own. */
  readonly canManageOthers: boolean;
}): Promise<CancelResult> {
  const { ticketId, tenantId, actorId, canManageOthers } = args;

  return db.$transaction(
    async (tx) => {
      const ticket = await tx.ticket.findFirst({
        where: { id: ticketId, tenantId, deletedAt: null },
        select: { id: true, eventId: true, userId: true },
      });

      if (!ticket) throw ApiError.notFound("That ticket was not found.");

      // Someone else's ticket answers exactly like a missing one: a student must
      // not be able to probe for other people's ticket ids.
      if (!canManageOthers && ticket.userId !== actorId) {
        throw ApiError.notFound("That ticket was not found.");
      }

      const event = await lockEvent(tx, ticket.eventId, tenantId);

      // Re-read *after* the lock: the ticket may have been cancelled or promoted
      // while this request waited.
      const fresh = await tx.ticket.findUnique({
        where: { id: ticket.id },
        select: { status: true },
      });

      if (!fresh || fresh.status === "CANCELLED") {
        return { ticketId: ticket.id, changed: false, promoted: [] } satisfies CancelResult;
      }

      await tx.ticket.update({
        where: { id: ticket.id },
        data: { status: "CANCELLED", cancelledAt: new Date(), waitlistPosition: null },
      });

      // Only a registered seat frees a place in the room. Leaving the queue does
      // not let anybody in, so there is nothing to promote.
      const promoted =
        fresh.status === "REGISTERED"
          ? await promoteFromWaitlist(tx, ticket.eventId, event.capacity)
          : [];

      return { ticketId: ticket.id, changed: true, promoted } satisfies CancelResult;
    },
    { maxWait: 15_000, timeout: 15_000 },
  );
}

/**
 * Re-runs promotion after an organiser raises an event's capacity.
 *
 * Separate transaction on purpose: the capacity update itself is a simple row
 * write, and wrapping both together would hold the event lock for the duration of
 * the edit. Running promotion immediately afterwards is enough — the lock makes
 * it safe whenever it happens.
 */
export async function promoteAfterCapacityChange(
  eventId: string,
  tenantId: string,
): Promise<readonly PromotedTicket[]> {
  return db.$transaction(async (tx) => {
    const event = await lockEvent(tx, eventId, tenantId);
    return promoteFromWaitlist(tx, eventId, event.capacity);
  });
}

/** Everything needed to render one ticket, for its owner only. */
export async function getTicketForOwner(ticketId: string, userId: string) {
  const ticket = await db.ticket.findFirst({
    // Scoped by owner, not by tenant: a person's tickets are theirs, and the row
    // already belongs to exactly one college.
    where: { id: ticketId, userId, deletedAt: null },
    select: {
      id: true,
      status: true,
      waitlistPosition: true,
      qrCodeUuid: true,
      createdAt: true,
      cancelledAt: true,
      event: {
        select: {
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
          club: {
            select: {
              id: true,
              name: true,
              slug: true,
              tenant: { select: { name: true, timezone: true } },
            },
          },
        },
      },
    },
  });

  if (!ticket) throw ApiError.notFound("That ticket was not found.");

  return ticket;
}

/** This person's live ticket for one event, or null, with their place in the queue. */
export async function findTicketForUser(eventId: string, userId: string) {
  const ticket = await db.ticket.findFirst({
    where: { eventId, userId, deletedAt: null, status: { not: "CANCELLED" } },
    select: {
      id: true,
      status: true,
      waitlistPosition: true,
      createdAt: true,
    },
  });

  if (!ticket) return null;
  if (ticket.status !== "WAITLISTED") return { ...ticket, queuePosition: null };

  const positions = await db.ticket.findMany({
    where: { eventId, status: "WAITLISTED", waitlistPosition: { not: null } },
    orderBy: [{ waitlistPosition: "asc" }, { createdAt: "asc" }],
    select: { waitlistPosition: true },
  });

  return {
    ...ticket,
    queuePosition: queueRank(
      positions.map((row) => row.waitlistPosition as number),
      ticket.waitlistPosition,
    ),
  };
}

/** All of one person's tickets, soonest event first. */
export async function listMyTickets(userId: string) {
  const tickets = await db.ticket.findMany({
    where: {
      userId,
      deletedAt: null,
      event: { deletedAt: null },
    },
    orderBy: [{ event: { startTime: "asc" } }],
    select: {
      id: true,
      status: true,
      waitlistPosition: true,
      createdAt: true,
      event: {
        select: {
          id: true,
          title: true,
          location: true,
          startTime: true,
          endTime: true,
          status: true,
          club: {
            select: {
              id: true,
              name: true,
              tenant: { select: { name: true, timezone: true } },
            },
          },
        },
      },
    },
  });

  // Queue places for every waitlisted ticket, in one query rather than one per row.
  const waitlistedEventIds = [
    ...new Set(
      tickets.filter((ticket) => ticket.status === "WAITLISTED").map((ticket) => ticket.event.id),
    ),
  ];

  const positionsByEvent = new Map<string, number[]>();

  if (waitlistedEventIds.length > 0) {
    const rows = await db.ticket.findMany({
      where: {
        eventId: { in: waitlistedEventIds },
        status: "WAITLISTED",
        waitlistPosition: { not: null },
      },
      orderBy: [{ waitlistPosition: "asc" }, { createdAt: "asc" }],
      select: { eventId: true, waitlistPosition: true },
    });

    for (const row of rows) {
      const list = positionsByEvent.get(row.eventId) ?? [];
      list.push(row.waitlistPosition as number);
      positionsByEvent.set(row.eventId, list);
    }
  }

  return tickets.map((ticket) => ({
    ...ticket,
    queuePosition:
      ticket.status === "WAITLISTED"
        ? queueRank(
            positionsByEvent.get(ticket.event.id) ?? [],
            ticket.waitlistPosition,
          )
        : null,
  }));
}

/**
 * Who is coming (and who is queuing) for one event.
 *
 * Organiser-only: the route guard has already checked `ticket:view_roster` before
 * this is called. Guests are listed without their own QR secrets — the roster is
 * a door list, not a bundle of keys.
 */
export async function listEventRoster(eventId: string, tenantId: string) {
  const tickets = await db.ticket.findMany({
    where: { eventId, tenantId, deletedAt: null, status: { in: ["REGISTERED", "WAITLISTED"] } },
    orderBy: [{ status: "asc" }, { waitlistPosition: "asc" }, { createdAt: "asc" }],
    select: {
      id: true,
      status: true,
      waitlistPosition: true,
      createdAt: true,
      user: {
        select: { id: true, email: true, firstName: true, lastName: true },
      },
    },
  });

  const registered = tickets.filter((ticket) => ticket.status === "REGISTERED");
  const waitlisted = tickets.filter((ticket) => ticket.status === "WAITLISTED");

  const positions = waitlisted.map((ticket) => ticket.waitlistPosition as number);

  return {
    registered: registered.map((ticket) => ({
      id: ticket.id,
      createdAt: ticket.createdAt,
      user: ticket.user,
      displayName:
        [ticket.user.firstName, ticket.user.lastName].filter(Boolean).join(" ") || ticket.user.email,
    })),
    waitlisted: waitlisted.map((ticket) => ({
      id: ticket.id,
      createdAt: ticket.createdAt,
      user: ticket.user,
      displayName:
        [ticket.user.firstName, ticket.user.lastName].filter(Boolean).join(" ") || ticket.user.email,
      queuePosition: queueRank(positions, ticket.waitlistPosition),
    })),
  };
}
