import "server-only";

import { cache } from "react";

import { ApiError } from "@/lib/api/response";
import { requireUser, type SessionUser } from "@/lib/auth/session";
import { canClub, canTenant, type Actor, type ClubAction, type TenantAction } from "@/lib/auth/rbac";
import { db } from "@/lib/db/client";
import type { ClubRole, TenantRole } from "@/generated/prisma/enums";

/**
 * Authorisation guards. Every route handler that reads or writes tenant-owned
 * data must pass through one of these BEFORE touching the database.
 *
 * Two rules from docs/architecture.md §3 are implemented here, once:
 *
 *  1. The tenant is derived from the session + the resource, never from the
 *     request body alone.
 *  2. A user with no membership in a tenant gets **404, not 403** — a probe from
 *     another college must not reveal that the resource exists. Inside your own
 *     tenant, lacking a specific role is a genuine 403.
 */

export interface TenantContext {
  readonly user: SessionUser;
  readonly tenantId: string;
  readonly tenantName: string;
  readonly tenantTimezone: string;
  readonly role: TenantRole;
}

export interface ClubContext {
  readonly user: SessionUser;
  readonly club: {
    readonly id: string;
    readonly tenantId: string;
    readonly name: string;
    readonly slug: string;
    readonly timezone: string;
  };
  readonly tenantRole: TenantRole | null;
  readonly clubRole: ClubRole | null;
}

/** Shared, request-scoped lookup of the caller's memberships. */
const loadTenantMembership = cache(async (userId: string, tenantId: string) => {
  return db.tenantMember.findFirst({
    where: { userId, tenantId, deletedAt: null },
    select: {
      role: true,
      tenant: { select: { id: true, name: true, timezone: true, deletedAt: true } },
    },
  });
});

/**
 * Requires the caller to be a member of `tenantId` with permission for `action`.
 * @throws ApiError NOT_FOUND when they have no membership (never leaks existence)
 * @throws ApiError FORBIDDEN when they are a member but lack the role
 */
export async function requireTenantAccess(
  tenantId: string,
  action: TenantAction,
): Promise<TenantContext> {
  const user = await requireUser();

  const membership = await loadTenantMembership(user.id, tenantId);

  // No membership → treat the tenant as non-existent for this caller.
  if (!membership || membership.tenant.deletedAt) {
    throw ApiError.notFound("That college was not found.");
  }

  if (!canTenant(membership.role, action)) {
    throw ApiError.forbidden(
      `Your role in this college (${membership.role.toLowerCase()}) cannot ${describe(action)}.`,
    );
  }

  return {
    user,
    tenantId,
    tenantName: membership.tenant.name,
    tenantTimezone: membership.tenant.timezone,
    role: membership.role,
  };
}

/**
 * Resolves a club and checks permission for `action` against both the club role
 * and the caller's college role.
 *
 * @throws ApiError NOT_FOUND when the club does not exist, is soft-deleted, or
 *         belongs to a tenant the caller is not a member of
 * @throws ApiError FORBIDDEN when the caller is in the tenant but holds neither
 *         the required club role nor a college admin role
 */
export async function requireClubAccess(clubId: string, action: ClubAction): Promise<ClubContext> {
  const user = await requireUser();

  const club = await db.club.findFirst({
    where: { id: clubId, deletedAt: null },
    select: {
      id: true,
      tenantId: true,
      name: true,
      slug: true,
      tenant: { select: { timezone: true, deletedAt: true } },
    },
  });

  if (!club || club.tenant.deletedAt) {
    throw ApiError.notFound("That club was not found.");
  }

  // Tenant scope FIRST: without this, a user from another college could probe
  // club ids and learn which ones exist.
  const tenantMembership = await loadTenantMembership(user.id, club.tenantId);
  if (!tenantMembership) {
    throw ApiError.notFound("That club was not found.");
  }

  const clubMembership = await db.clubMember.findFirst({
    where: { clubId: club.id, userId: user.id, deletedAt: null },
    select: { role: true },
  });

  const clubRole = clubMembership?.role ?? null;
  const tenantRole = tenantMembership.role;

  if (!canClub({ tenantRole, clubRole }, action)) {
    throw ApiError.forbidden(`Your role in ${club.name} cannot ${describe(action)}.`);
  }

  return {
    user,
    club: {
      id: club.id,
      tenantId: club.tenantId,
      name: club.name,
      slug: club.slug,
      timezone: club.tenant.timezone,
    },
    tenantRole,
    clubRole,
  };
}

/**
 * Actions scoped to one event.
 *
 * `ticket:rsvp` is the odd one out: it is not a role check at all, it is a
 * visibility check (you may take a seat if you can see the event). The other two
 * are ordinary club permissions and go through the matrix.
 */
export type EventAction = "ticket:rsvp" | "ticket:view_roster" | "ticket:manage";

export interface EventContext {
  readonly user: SessionUser;
  readonly event: {
    readonly id: string;
    readonly tenantId: string;
    readonly clubId: string;
    readonly title: string;
    readonly description: string | null;
    readonly location: string | null;
    readonly startTime: Date;
    readonly endTime: Date;
    readonly capacity: number | null;
    readonly waitlistEnabled: boolean;
    readonly status: "DRAFT" | "PUBLISHED" | "CANCELLED";
    readonly isPublic: boolean;
  };
  readonly club: {
    readonly id: string;
    readonly name: string;
    readonly slug: string;
    readonly timezone: string;
  };
  readonly tenantRole: TenantRole;
  readonly clubRole: ClubRole | null;
  /** Whether this person runs the club — decides roster visibility and drafts. */
  readonly isOrganizer: boolean;
}

/**
 * Resolves one event and decides what the caller may do with it.
 *
 * The tenant is taken from the event row itself, then the caller's membership in
 * that tenant is checked — never the other way round. Otherwise a request naming
 * an event in another college would be authorised against the caller's own
 * college and quietly succeed.
 */
export async function requireEventAccess(
  eventId: string,
  action: EventAction,
): Promise<EventContext> {
  const user = await requireUser();

  const event = await db.event.findFirst({
    where: { id: eventId, deletedAt: null },
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
      club: {
        select: {
          id: true,
          name: true,
          slug: true,
          deletedAt: true,
          tenant: { select: { timezone: true, deletedAt: true } },
        },
      },
    },
  });

  if (!event || event.club.deletedAt || event.club.tenant.deletedAt) {
    throw ApiError.notFound("That event was not found.");
  }

  const tenantMembership = await loadTenantMembership(user.id, event.tenantId);
  if (!tenantMembership) {
    throw ApiError.notFound("That event was not found.");
  }

  const clubMembership = await db.clubMember.findFirst({
    where: { clubId: event.club.id, userId: user.id, deletedAt: null },
    select: { role: true },
  });

  const tenantRole = tenantMembership.role;
  const clubRole = clubMembership?.role ?? null;
  const actor: Actor = { tenantRole, clubRole };
  const isOrganizer = canClub(actor, "event:update");

  if (action === "ticket:rsvp") {
    // A draft is a private workspace, not an event that exists but is closed.
    if (event.status === "DRAFT" && !isOrganizer) {
      throw ApiError.notFound("That event was not found.");
    }

    // Members-only events answer 404 to everyone outside the club — the same
    // rule the club page follows, so a seat cannot reveal an event either.
    if (!event.isPublic && !canClub(actor, "event:view_private")) {
      throw ApiError.notFound("That event was not found.");
    }
  } else if (!canClub(actor, action)) {
    throw ApiError.forbidden(`Your role in ${event.club.name} cannot ${describe(action)}.`);
  }

  return {
    user,
    event: {
      id: event.id,
      tenantId: event.tenantId,
      clubId: event.clubId,
      title: event.title,
      description: event.description,
      location: event.location,
      startTime: event.startTime,
      endTime: event.endTime,
      capacity: event.capacity,
      waitlistEnabled: event.waitlistEnabled,
      status: event.status,
      isPublic: event.isPublic,
    },
    club: {
      id: event.club.id,
      name: event.club.name,
      slug: event.club.slug,
      timezone: event.club.tenant.timezone,
    },
    tenantRole,
    clubRole,
    isOrganizer,
  };
}

/** Human-readable verb for an action code, used in error messages. */
function describe(action: string): string {
  const verbs: Record<string, string> = {
    "tenant:read": "view this college",
    "tenant:update": "edit this college",
    "tenant:invite": "invite members to this college",
    "tenant:manage_members": "manage this college's members",
    "club:create": "create clubs here",
    "club:read": "view this club",
    "club:update": "edit this club",
    "club:delete": "delete this club",
    "club:manage_members": "manage members of this club",
    "club:invite": "invite people to this club",
    "club:view_members": "see this club's members",
    "event:create": "create events for this club",
    "event:update": "edit this club's events",
    "event:publish": "publish this club's events",
    "event:delete": "delete this club's events",
    "ticket:view_roster": "see who is coming to this event",
    "ticket:manage": "cancel other people's tickets",
    "attendance:scan": "check attendees in",
    "attendance:report": "view attendance reports",
  };
  return verbs[action] ?? action.replace(/[:_]/g, " ");
}
