import "server-only";

import { cache } from "react";
import { db } from "@/lib/db/client";
import { uuidParamSchema } from "@/lib/validation/ticket";
import type { Prisma } from "@/generated/prisma/client";

/**
 * What people WITHOUT an account (or from another college) may see.
 *
 * The rule is deliberately narrow and lives in one place:
 *
 *   published  AND  marked public  AND  not deleted
 *   AND its club still exists  AND its college still exists
 *
 * Drafts, members-only events and anything soft-deleted never leave this
 * file, so a guest can't learn they exist — the same "404, not 403" rule the
 * signed-in pages follow. Only fields that are safe for the open internet are
 * selected: no creator, no roster, no internal ids beyond the event and club.
 */

function publicEventWhere(): Prisma.EventWhereInput {
  return {
    deletedAt: null,
    isPublic: true,
    club: { deletedAt: null, tenant: { deletedAt: null } },
  };
}

const PUBLIC_EVENT_SELECT = {
  id: true,
  title: true,
  description: true,
  location: true,
  startTime: true,
  endTime: true,
  capacity: true,
  waitlistEnabled: true,
  status: true,
  club: {
    select: {
      id: true,
      name: true,
      category: true,
      tenant: { select: { name: true, timezone: true } },
    },
  },
  // A seat is held only by a REGISTERED ticket (see ticketCountsByEvent).
  _count: { select: { tickets: { where: { status: "REGISTERED" } } } },
} as const satisfies Prisma.EventSelect;

export type PublicEvent = Prisma.EventGetPayload<{ select: typeof PUBLIC_EVENT_SELECT }>;

/** Feed size: enough to fill a page, small enough to stay one fast query. */
export const PUBLIC_FEED_LIMIT = 24;

/** Upcoming public events from every college, soonest first. */
export async function listPublicUpcomingEvents(limit: number = PUBLIC_FEED_LIMIT): Promise<PublicEvent[]> {
  return db.event.findMany({
    where: { ...publicEventWhere(), status: "PUBLISHED", endTime: { gt: new Date() } },
    orderBy: { startTime: "asc" },
    take: Math.min(Math.max(limit, 1), 100),
    select: PUBLIC_EVENT_SELECT,
  });
}

/**
 * One public event by id, or `null`.
 *
 * Cancelled events are still returned (a shared link should say "cancelled",
 * not "not found"), drafts never are. A malformed id is a plain `null` rather
 * than a database error — the id comes straight from the address bar.
 */
export const getPublicEvent = cache(async (eventId: string): Promise<PublicEvent | null> => {
  if (!uuidParamSchema.safeParse(eventId).success) return null;

  return db.event.findFirst({
    where: { ...publicEventWhere(), id: eventId, status: { in: ["PUBLISHED", "CANCELLED"] } },
    select: PUBLIC_EVENT_SELECT,
  });
});
