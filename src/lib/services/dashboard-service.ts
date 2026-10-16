import "server-only";

import { cache } from "react";

import { db } from "@/lib/db/client";

/**
 * Reads everything the member dashboard shows for one user.
 *
 * Shared by the signed-in dashboard and the cookie-free `/demo` preview so the
 * two can never drift apart — the demo renders exactly what a real user sees.
 *
 * Every query is tenant-scoped through the user's own memberships: there is no
 * way to ask this function for another user's data by guessing an id, because it
 * starts from the clubs the user actually belongs to.
 */

export interface TenantRoleRow {
  readonly role: "OWNER" | "ADMIN" | "MEMBER";
  readonly tenant: { readonly id: string; readonly name: string; readonly slug: string; readonly timezone: string };
}

export interface ClubRoleRow {
  readonly role: "PRESIDENT" | "EVENT_MANAGER" | "MEMBER";
  readonly club: { readonly id: string; readonly name: string; readonly category: string | null };
}

export interface UpcomingEventRow {
  readonly id: string;
  readonly title: string;
  readonly startTime: Date;
  readonly capacity: number | null;
  readonly isPublic: boolean;
  readonly club: { readonly name: string; readonly tenant: { readonly timezone: string } };
  readonly _count: { readonly tickets: number };
}

export interface MemberOverview {
  readonly tenantRoles: readonly TenantRoleRow[];
  readonly clubRoles: readonly ClubRoleRow[];
  readonly upcomingEvents: readonly UpcomingEventRow[];
}

export const loadMemberOverview = cache(async (userId: string): Promise<MemberOverview> => {
  const [tenantRoles, clubRoles] = await Promise.all([
    db.tenantMember.findMany({
      where: { userId, deletedAt: null },
      select: {
        role: true,
        tenant: { select: { id: true, name: true, slug: true, timezone: true } },
      },
      orderBy: { joinedAt: "asc" },
    }),
    db.clubMember.findMany({
      where: { userId, deletedAt: null },
      select: {
        role: true,
        club: { select: { id: true, name: true, category: true } },
      },
      orderBy: { joinedAt: "asc" },
    }),
  ]);

  const clubIds = clubRoles.map((membership) => membership.club.id);

  const upcomingEvents = clubIds.length
    ? await db.event.findMany({
        where: {
          clubId: { in: clubIds },
          status: "PUBLISHED",
          deletedAt: null,
          endTime: { gte: new Date() },
        },
        orderBy: { startTime: "asc" },
        take: 5,
        select: {
          id: true,
          title: true,
          startTime: true,
          capacity: true,
          isPublic: true,
          club: { select: { name: true, tenant: { select: { timezone: true } } } },
          _count: { select: { tickets: { where: { status: "REGISTERED" } } } },
        },
      })
    : [];

  return { tenantRoles, clubRoles, upcomingEvents };
});
