import type { ClubRole, TenantRole } from "@/generated/prisma/enums";

/**
 * The authorisation matrix, encoded ONCE as data.
 *
 * Every route handler that touches a tenant or club resource goes through the
 * guards in `src/lib/auth/guards.ts`, which consult this table. That means the
 * rules live in exactly one auditable place instead of being re-derived with
 * `if (role === "PRESIDENT" || ...)` in dozens of handlers — the classic way
 * permission bugs get introduced.
 *
 * The source of truth for the product rules is docs/architecture.md §4.
 *
 * Reading the tables: "which roles may perform this action?"
 */

/** Actions scoped to a whole college. */
export const TENANT_MATRIX = {
  "tenant:read": ["OWNER", "ADMIN", "MEMBER"],
  "tenant:update": ["OWNER", "ADMIN"],
  "tenant:invite": ["OWNER", "ADMIN"],
  "tenant:manage_members": ["OWNER", "ADMIN"],
  /** Creating a club is an administrative act, not something any member may do. */
  "club:create": ["OWNER", "ADMIN"],
} as const satisfies Record<string, readonly TenantRole[]>;

/** Actions scoped to a single club. */
export const CLUB_MATRIX = {
  /** Seeing the club exists, its description and its public events. */
  "club:read": ["PRESIDENT", "EVENT_MANAGER", "MEMBER"],
  "club:update": ["PRESIDENT"],
  /** Renaming a club's identity or removing it is reserved to the college. */
  "club:delete": [],
  "club:manage_members": ["PRESIDENT"],
  "club:invite": ["PRESIDENT"],
  "club:view_members": ["PRESIDENT", "EVENT_MANAGER", "MEMBER"],
  "event:create": ["PRESIDENT", "EVENT_MANAGER"],
  "event:update": ["PRESIDENT", "EVENT_MANAGER"],
  "event:publish": ["PRESIDENT", "EVENT_MANAGER"],
  "event:delete": ["PRESIDENT"],
  "event:view_private": ["PRESIDENT", "EVENT_MANAGER", "MEMBER"],
  "attendance:scan": ["PRESIDENT", "EVENT_MANAGER"],
  "attendance:report": ["PRESIDENT", "EVENT_MANAGER"],
} as const satisfies Record<string, readonly ClubRole[]>;

/** Actions any signed-in user with a tenant identity may perform. */
export type MemberAction = "ticket:rsvp" | "event:view_public";

export type TenantAction = keyof typeof TENANT_MATRIX;
export type ClubAction = keyof typeof CLUB_MATRIX;

/**
 * Roles that outrank club roles inside their own college.
 *
 * A college Owner/Admin can administer every club in that college — which is how
 * the matrix in docs/architecture.md §4 reads ("✅" in the Owner and Admin
 * columns of club-level rows). Tenant-level authority does NOT leak across
 * tenants: it is always evaluated together with the tenant this club belongs to.
 */
const TENANT_OVERRIDE: readonly TenantRole[] = ["OWNER", "ADMIN"];

export function canTenant(role: TenantRole | null | undefined, action: TenantAction): boolean {
  if (!role) return false;
  return (TENANT_MATRIX[action] as readonly TenantRole[]).includes(role);
}

export interface Actor {
  readonly tenantRole: TenantRole | null;
  readonly clubRole: ClubRole | null;
}

export function canClub(actor: Actor, action: ClubAction): boolean {
  const allowed = CLUB_MATRIX[action] as readonly ClubRole[];

  // College-level override: administrators of the tenant can administer its clubs.
  if (actor.tenantRole && TENANT_OVERRIDE.includes(actor.tenantRole)) {
    // ...except actions explicitly reserved for nobody at club level, which are
    // then decided by the tenant matrix instead (club:delete lives there).
    if (allowed.length === 0) return canTenant(actor.tenantRole, "club:create");
    return true;
  }

  if (!actor.clubRole) return false;
  return allowed.includes(actor.clubRole);
}

/**
 * Roles a given actor is allowed to HAND OUT through an invite.
 *
 * Prevents privilege escalation: an Event Manager must not be able to mint a
 * President link, and a plain member cannot invite at all (enforced upstream by
 * `club:invite`).
 */
export function assignableClubRoles(actor: Actor): readonly ClubRole[] {
  const isPresident = actor.clubRole === "PRESIDENT";
  const isCollegeAdmin =
    actor.tenantRole !== null && TENANT_OVERRIDE.includes(actor.tenantRole);

  if (isPresident || isCollegeAdmin) {
    // Only a President or college admin may create another President.
    return ["MEMBER", "EVENT_MANAGER", "PRESIDENT"];
  }
  return [];
}

export function canAssignClubRole(actor: Actor, role: ClubRole): boolean {
  return assignableClubRoles(actor).includes(role);
}

/** Tenant roles an actor may hand out: only Owners may create Owners or Admins. */
export function canAssignTenantRole(actorRole: TenantRole | null, role: TenantRole): boolean {
  if (actorRole === "OWNER") return true;
  if (actorRole === "ADMIN") return role === "MEMBER";
  return false;
}
