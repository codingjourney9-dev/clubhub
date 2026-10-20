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
  /**
   * Members are managed in tiers (Phase 10). Which tier applies depends on the
   * TARGET's role, so use `canRemoveClubMember` / `canChangeClubRole` rather
   * than these rows directly when a specific person is involved.
   */
  "club:remove_member": ["PRESIDENT", "EVENT_MANAGER"],
  "club:remove_lead": ["PRESIDENT"],
  /** Promote a Member to Lead, or a Lead back to Member. */
  "club:change_roles": ["PRESIDENT"],
  /** Hand the presidency to another member. The only way a club's President changes. */
  "club:transfer_presidency": ["PRESIDENT"],
  "club:invite": ["PRESIDENT"],
  /** Members-only announcements: everybody in the club reads… */
  "announcement:read": ["PRESIDENT", "EVENT_MANAGER", "MEMBER"],
  /** …Leads and the President post, pin and unpin… */
  "announcement:post": ["PRESIDENT", "EVENT_MANAGER"],
  /** …and the President may also delete posts written by others. */
  "announcement:moderate": ["PRESIDENT"],
  "club:view_members": ["PRESIDENT", "EVENT_MANAGER", "MEMBER"],
  "event:create": ["PRESIDENT", "EVENT_MANAGER"],
  "event:update": ["PRESIDENT", "EVENT_MANAGER"],
  "event:publish": ["PRESIDENT", "EVENT_MANAGER"],
  "event:delete": ["PRESIDENT"],
  "event:view_private": ["PRESIDENT", "EVENT_MANAGER", "MEMBER"],
  /** Who is coming, and who is queuing — organisers only, never other students. */
  "ticket:view_roster": ["PRESIDENT", "EVENT_MANAGER"],
  /** Cancelling somebody else's ticket (a no-show, a duplicate, a mistake). */
  "ticket:manage": ["PRESIDENT", "EVENT_MANAGER"],
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
 * Roles a given actor is allowed to HAND OUT — through an invite link or the
 * role dropdown.
 *
 * Never PRESIDENT: a club has exactly one, and it only changes hands through
 * `transferPresidency` (the database enforces this with a unique index too).
 * A Lead cannot hand out roles at all.
 */
export function assignableClubRoles(actor: Actor): readonly ClubRole[] {
  return canClub(actor, "club:change_roles") ? ["MEMBER", "EVENT_MANAGER"] : [];
}

/**
 * May `actor` remove this particular person from the club?
 *
 *  • the President is never removed — the presidency must be handed over first;
 *  • removing a Lead is the President's call (or a college admin's);
 *  • removing a Member is open to Leads too;
 *  • nobody removes themselves through this rule (that would be "leave").
 */
export function canRemoveClubMember(
  actor: Actor & { readonly userId: string },
  target: { readonly userId: string; readonly role: ClubRole },
): boolean {
  if (target.userId === actor.userId) return false;
  if (target.role === "PRESIDENT") return false;
  if (target.role === "EVENT_MANAGER") return canClub(actor, "club:remove_lead");
  return canClub(actor, "club:remove_member");
}

/** May `actor` move this person from `target.role` to `newRole`? */
export function canChangeClubRole(
  actor: Actor & { readonly userId: string },
  target: { readonly userId: string; readonly role: ClubRole },
  newRole: ClubRole,
): boolean {
  if (target.userId === actor.userId) return false;
  if (target.role === "PRESIDENT" || newRole === "PRESIDENT") return false;
  return canClub(actor, "club:change_roles");
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
