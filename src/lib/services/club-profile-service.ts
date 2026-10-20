import "server-only";

import { cache } from "react";

import { db } from "@/lib/db";

import { listOpenOpenings, type PublicOpening } from "./recruitment-service";
import { listPublicUpcomingEvents, type PublicEvent } from "./public-event-service";

/**
 * The public face of a club — what a guest, a student from another college, or
 * a college member who hasn't joined sees.
 *
 * Deliberately thin: names of the people running it (never emails), a member
 * count (never the roster), events marked "open to everyone", and open roles.
 * Members-only events, announcements and invite links never appear here.
 */
export interface PublicClubProfile {
  readonly id: string;
  readonly name: string;
  readonly description: string | null;
  readonly category: string | null;
  readonly collegeName: string;
  readonly timeZone: string;
  readonly president: string | null;
  readonly leads: readonly string[];
  readonly memberCount: number;
  readonly events: readonly PublicEvent[];
  readonly openings: readonly PublicOpening[];
}

function fullName(user: { firstName: string | null; lastName: string | null }): string {
  return [user.firstName, user.lastName].filter(Boolean).join(" ") || "A club member";
}

export const getPublicClubProfile = cache(async (clubId: string): Promise<PublicClubProfile | null> => {
  const club = await db.club.findFirst({
    // A PENDING club (Phase 12) has no public face until its professor confirms it.
    where: { id: clubId, deletedAt: null, status: "ACTIVE", tenant: { deletedAt: null } },
    select: {
      id: true,
      name: true,
      description: true,
      category: true,
      tenant: { select: { name: true, timezone: true } },
      members: {
        where: { deletedAt: null, role: { in: ["PRESIDENT", "EVENT_MANAGER"] } },
        orderBy: { createdAt: "asc" },
        select: { role: true, user: { select: { firstName: true, lastName: true } } },
      },
      _count: { select: { members: { where: { deletedAt: null } } } },
    },
  });
  if (!club) return null;

  const [events, openings] = await Promise.all([
    listPublicUpcomingEvents(6, { clubId }),
    listOpenOpenings({ clubId, limit: 12 }),
  ]);

  const president = club.members.find((member) => member.role === "PRESIDENT");
  return {
    id: club.id,
    name: club.name,
    description: club.description,
    category: club.category,
    collegeName: club.tenant.name,
    timeZone: club.tenant.timezone,
    president: president ? fullName(president.user) : null,
    leads: club.members.filter((member) => member.role === "EVENT_MANAGER").map((member) => fullName(member.user)),
    memberCount: club._count.members,
    events,
    openings,
  };
});
