import "server-only";

import { cache } from "react";

import { ApiError } from "@/lib/api/response";
import { getSessionUserId, requireUser, type SessionUser } from "@/lib/auth/session";
import { canClub, canTenant, type Actor, type ClubAction, type TenantAction } from "@/lib/auth/rbac";
import { db } from "@/lib/db/client";
import { annotateRequest } from "@/lib/observability/context";
import type { ClubRole, EventTag, TenantRole } from "@/generated/prisma/enums";

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

/**
 * The caller's id from the signed session cookie (no database trip).
 * @throws ApiError UNAUTHORIZED when nobody is signed in
 */
async function requireSessionUserId(): Promise<string> {
  const userId = await getSessionUserId();
  if (!userId) throw ApiError.unauthorized();
  return userId;
}

/** Only the caller's own, live membership rows ride along with a lookup. */
function ownMembership(userId: string) {
  return { where: { userId, deletedAt: null }, select: { role: true }, take: 1 } as const;
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
  // Who you are and what you are in this college are independent questions:
  // ask both at once (see getSessionUserId).
  const userId = await requireSessionUserId();
  const [user, membership] = await Promise.all([
    requireUser(),
    loadTenantMembership(userId, tenantId),
  ]);

  // No membership → treat the tenant as non-existent for this caller.
  if (!membership || membership.tenant.deletedAt) {
    throw ApiError.notFound("That college was not found.");
  }

  if (!canTenant(membership.role, action)) {
    throw ApiError.forbidden(
      `Your role in this college (${membership.role.toLowerCase()}) cannot ${describe(action)}.`,
    );
  }

  annotateRequest({ tenantId, actorRole: membership.role });

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
  // One query fetches the club together with the caller's own college and club
  // memberships (relationJoins makes it a single round trip), and it runs at
  // the same time as the user lookup.
  const userId = await requireSessionUserId();
  const [user, club] = await Promise.all([
    requireUser(),
    db.club.findFirst({
      where: { id: clubId, deletedAt: null },
      select: {
        id: true,
        tenantId: true,
        name: true,
        slug: true,
        tenant: {
          select: { timezone: true, deletedAt: true, members: ownMembership(userId) },
        },
        members: ownMembership(userId),
      },
    }),
  ]);

  if (!club || club.tenant.deletedAt) {
    throw ApiError.notFound("That club was not found.");
  }

  // Tenant scope FIRST: without this, a user from another college could probe
  // club ids and learn which ones exist.
  const tenantMembership = club.tenant.members[0];
  if (!tenantMembership) {
    throw ApiError.notFound("That club was not found.");
  }

  const clubRole = club.members[0]?.role ?? null;
  const tenantRole = tenantMembership.role;

  if (!canClub({ tenantRole, clubRole }, action)) {
    throw ApiError.forbidden(`Your role in ${club.name} cannot ${describe(action)}.`);
  }

  annotateRequest({ tenantId: club.tenantId, actorRole: clubRole ?? tenantRole });

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
export type EventAction =
  | "ticket:rsvp"
  | "ticket:view_roster"
  | "ticket:manage"
  | "attendance:scan"
  | "attendance:report";

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
    readonly posterUrl: string | null;
    readonly tags: readonly EventTag[];
    readonly instagramUrl: string | null;
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
  // Same shape as requireClubAccess: the event, its club, and the caller's own
  // memberships in one query, alongside the user lookup. The composite foreign
  // key (clubId, tenantId) guarantees the club's college IS the event's college.
  const userId = await requireSessionUserId();
  const [user, event] = await Promise.all([
    requireUser(),
    db.event.findFirst({
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
        posterUrl: true,
        tags: true,
        instagramUrl: true,
        club: {
          select: {
            id: true,
            name: true,
            slug: true,
            deletedAt: true,
            tenant: {
              select: { timezone: true, deletedAt: true, members: ownMembership(userId) },
            },
            members: ownMembership(userId),
          },
        },
      },
    }),
  ]);

  if (!event || event.club.deletedAt || event.club.tenant.deletedAt) {
    throw ApiError.notFound("That event was not found.");
  }

  const tenantMembership = event.club.tenant.members[0];
  if (!tenantMembership) {
    throw ApiError.notFound("That event was not found.");
  }

  const tenantRole = tenantMembership.role;
  const clubRole = event.club.members[0]?.role ?? null;
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

  annotateRequest({ tenantId: event.tenantId, actorRole: clubRole ?? tenantRole });

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
      posterUrl: event.posterUrl,
      tags: event.tags,
      instagramUrl: event.instagramUrl,
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
    "club:remove_member": "remove members from this club",
    "club:remove_lead": "remove Leads from this club",
    "club:change_roles": "promote or demote members of this club",
    "club:transfer_presidency": "hand over this club's presidency",
    "announcement:read": "read this club's announcements",
    "announcement:post": "post announcements in this club",
    "announcement:moderate": "delete other people's announcements in this club",
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
