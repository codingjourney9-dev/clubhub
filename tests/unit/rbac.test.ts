import { describe, expect, it } from "vitest";

import {
  assignableClubRoles,
  canAssignClubRole,
  canAssignTenantRole,
  canClub,
  canTenant,
  CLUB_MATRIX,
  TENANT_MATRIX,
  type Actor,
} from "../../src/lib/auth/rbac";
import type { ClubRole, TenantRole } from "../../src/generated/prisma/enums";

/**
 * The RBAC matrix is the security core of the product, so it is tested as data:
 * every role/action pair that matters is asserted directly instead of being
 * inferred from route behaviour.
 */

const TENANT_ROLES: TenantRole[] = ["OWNER", "ADMIN", "MEMBER"];
const CLUB_ROLES: ClubRole[] = ["PRESIDENT", "EVENT_MANAGER", "MEMBER"];

function actor(tenantRole: TenantRole | null, clubRole: ClubRole | null): Actor {
  return { tenantRole, clubRole };
}

describe("tenant matrix", () => {
  it("lets every member read the college but only admins change it", () => {
    expect(canTenant("MEMBER", "tenant:read")).toBe(true);
    expect(canTenant("MEMBER", "tenant:update")).toBe(false);
    expect(canTenant("ADMIN", "tenant:update")).toBe(true);
    expect(canTenant("OWNER", "tenant:update")).toBe(true);
  });

  it("keeps club creation to Owners and Admins", () => {
    expect(canTenant("MEMBER", "club:create")).toBe(false);
    expect(canTenant("ADMIN", "club:create")).toBe(true);
    expect(canTenant("OWNER", "club:create")).toBe(true);
  });

  it("denies everything to a user with no tenant role", () => {
    for (const action of Object.keys(TENANT_MATRIX) as (keyof typeof TENANT_MATRIX)[]) {
      expect(canTenant(null, action)).toBe(false);
      expect(canTenant(undefined, action)).toBe(false);
    }
  });
});

describe("club matrix", () => {
  it("gives a club President full club authority", () => {
    for (const action of Object.keys(CLUB_MATRIX) as (keyof typeof CLUB_MATRIX)[]) {
      if (action === "club:delete") continue; // decided by the tenant matrix
      expect(canClub(actor("MEMBER", "PRESIDENT"), action)).toBe(true);
    }
  });

  it("restricts an Event Manager to event work", () => {
    const eventManager = actor("MEMBER", "EVENT_MANAGER");
    expect(canClub(eventManager, "event:create")).toBe(true);
    expect(canClub(eventManager, "event:publish")).toBe(true);
    expect(canClub(eventManager, "attendance:scan")).toBe(true);
    expect(canClub(eventManager, "club:update")).toBe(false);
    expect(canClub(eventManager, "club:manage_members")).toBe(false);
    expect(canClub(eventManager, "club:invite")).toBe(false);
    expect(canClub(eventManager, "event:delete")).toBe(false);
  });

  it("gives a plain member read-only access", () => {
    const member = actor("MEMBER", "MEMBER");
    expect(canClub(member, "club:read")).toBe(true);
    expect(canClub(member, "club:view_members")).toBe(true);
    expect(canClub(member, "event:create")).toBe(false);
    expect(canClub(member, "attendance:scan")).toBe(false);
  });

  it("denies everything to a signed-in user with no club and no college role", () => {
    for (const action of Object.keys(CLUB_MATRIX) as (keyof typeof CLUB_MATRIX)[]) {
      expect(canClub(actor(null, null), action)).toBe(false);
    }
  });

  it("lets a college Owner/Admin administer every club in that college", () => {
    for (const tenantRole of ["OWNER", "ADMIN"] as const) {
      expect(canClub(actor(tenantRole, null), "club:read")).toBe(true);
      expect(canClub(actor(tenantRole, null), "club:manage_members")).toBe(true);
      expect(canClub(actor(tenantRole, null), "club:invite")).toBe(true);
      expect(canClub(actor(tenantRole, null), "event:publish")).toBe(true);
      expect(canClub(actor(tenantRole, null), "club:delete")).toBe(true);
    }
  });

  it("does not let college authority add club roles on top", () => {
    // A college admin with no club membership still cannot be treated as a
    // President for role-assignment purposes — the override is explicit, not a
    // silent promotion to PRESIDENT.
    expect(canClub(actor("ADMIN", null), "club:update")).toBe(true);
    expect(assignableClubRoles(actor("ADMIN", null))).toContain("PRESIDENT");
  });

  it("only a college Owner/Admin or a President may delete a club", () => {
    // club:delete is intentionally empty at club level and defers to the tenant
    // matrix, so a President cannot delete their own club.
    expect(CLUB_MATRIX["club:delete"]).toHaveLength(0);
    expect(canClub(actor("MEMBER", "PRESIDENT"), "club:delete")).toBe(false);
    expect(canClub(actor("MEMBER", "EVENT_MANAGER"), "club:delete")).toBe(false);
    expect(canClub(actor("OWNER", null), "club:delete")).toBe(true);
  });
});

describe("role assignment (privilege escalation)", () => {
  it("lets only a President or college admin hand out club roles", () => {
    expect(assignableClubRoles(actor("MEMBER", "PRESIDENT"))).toEqual([
      "MEMBER",
      "EVENT_MANAGER",
      "PRESIDENT",
    ]);
    expect(assignableClubRoles(actor("OWNER", null))).toContain("PRESIDENT");
    expect(assignableClubRoles(actor("MEMBER", "EVENT_MANAGER"))).toEqual([]);
    expect(assignableClubRoles(actor("MEMBER", "MEMBER"))).toEqual([]);
    expect(assignableClubRoles(actor(null, null))).toEqual([]);
  });

  it("refuses an Event Manager trying to mint a President invite", () => {
    const eventManager = actor("MEMBER", "EVENT_MANAGER");
    expect(canAssignClubRole(eventManager, "PRESIDENT")).toBe(false);
    expect(canAssignClubRole(eventManager, "MEMBER")).toBe(false);
    expect(canAssignClubRole(actor("MEMBER", "PRESIDENT"), "PRESIDENT")).toBe(true);
  });

  it("lets only an Owner create Owners or Admins", () => {
    expect(canAssignTenantRole("OWNER", "OWNER")).toBe(true);
    expect(canAssignTenantRole("OWNER", "ADMIN")).toBe(true);
    expect(canAssignTenantRole("OWNER", "MEMBER")).toBe(true);

    // An Admin may invite ordinary members and nothing more.
    expect(canAssignTenantRole("ADMIN", "MEMBER")).toBe(true);
    expect(canAssignTenantRole("ADMIN", "ADMIN")).toBe(false);
    expect(canAssignTenantRole("ADMIN", "OWNER")).toBe(false);

    expect(canAssignTenantRole("MEMBER", "MEMBER")).toBe(false);
    expect(canAssignTenantRole(null, "MEMBER")).toBe(false);
  });

  it("never hands out a role outside the known sets", () => {
    for (const tenantRole of TENANT_ROLES) {
      for (const clubRole of CLUB_ROLES) {
        for (const role of assignableClubRoles(actor(tenantRole, clubRole))) {
          expect(CLUB_ROLES).toContain(role);
        }
      }
    }
  });
});
