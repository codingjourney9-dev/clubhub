import "server-only";

import { cache } from "react";

import { ApiError } from "@/lib/api/response";
import { requireUser, type SessionUser } from "@/lib/auth/session";
import { canClub, canTenant, type ClubAction, type TenantAction } from "@/lib/auth/rbac";
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
    "attendance:scan": "check attendees in",
    "attendance:report": "view attendance reports",
  };
  return verbs[action] ?? action.replace(/[:_]/g, " ");
}
