import { beforeEach, describe, expect, it, vi } from "vitest";

import { ApiError } from "../../src/lib/api/response";
import { assertTestDatabase, testDb, truncateAll } from "../helpers/db";
import { p3, p3Emails, seedClubWorkspace } from "../helpers/phase3";

/**
 * The guards are where "who may do this?" is decided for every request, so the
 * two rules from the architecture doc are asserted here directly:
 *
 *   1. Someone with no membership in the college gets **404, not 403** — a probe
 *      from another college must not learn that a club or college exists.
 *   2. Inside your own college, lacking a role is a genuine **403**.
 */

/** Mutable session identity, swapped per test (the guards call `requireUser()`). */
const session = vi.hoisted(() => ({ userId: "", email: "" }));

vi.mock("@/lib/auth/session", () => ({
  requireUser: async () => ({
    id: session.userId,
    email: session.email,
    firstName: "Test",
    lastName: "User",
    avatarUrl: null,
    timezone: null,
    displayName: "Test User",
  }),
  getCurrentUser: async () => null,
}));

const { requireClubAccess, requireTenantAccess } = await import("../../src/lib/auth/guards");

/** Signs the given fixture person in for the next call. */
function signInAs(person: "owner" | "president" | "member" | "outsider") {
  session.userId = p3[person];
  session.email = p3Emails[person];
}

async function expectApiError(operation: Promise<unknown>): Promise<ApiError> {
  try {
    await operation;
  } catch (error) {
    if (error instanceof ApiError) return error;
    throw error;
  }
  throw new Error("Expected the call to fail, but it resolved.");
}

beforeEach(async () => {
  await assertTestDatabase();
  await truncateAll();
  await seedClubWorkspace();
});

describe("requireTenantAccess", () => {
  it("lets a member read their own college", async () => {
    signInAs("member");
    const context = await requireTenantAccess(p3.tenant, "tenant:read");
    expect(context.tenantName).toBe("Phase Three College");
    expect(context.role).toBe("MEMBER");
  });

  it("hides another college behind a 404, not a 403", async () => {
    signInAs("outsider");
    const error = await expectApiError(requireTenantAccess(p3.tenant, "tenant:read"));
    expect(error.status).toBe(404);
    expect(error.code).toBe("NOT_FOUND");
    // The message must not confirm the college exists.
    expect(error.message).not.toContain("Phase Three");
  });

  it("returns 403 when a member lacks the role for a write", async () => {
    signInAs("member");
    const error = await expectApiError(requireTenantAccess(p3.tenant, "club:create"));
    expect(error.status).toBe(403);
    expect(error.code).toBe("FORBIDDEN");
  });

  it("treats a soft-deleted college membership as no membership", async () => {
    await testDb().tenantMember.updateMany({
      where: { tenantId: p3.tenant, userId: p3.member },
      data: { deletedAt: new Date() },
    });

    signInAs("member");
    const error = await expectApiError(requireTenantAccess(p3.tenant, "tenant:read"));
    expect(error.status).toBe(404);
  });
});

describe("requireClubAccess", () => {
  it("resolves the caller's own club roles", async () => {
    signInAs("president");
    const context = await requireClubAccess(p3.club, "club:manage_members");
    expect(context.clubRole).toBe("PRESIDENT");
    expect(context.tenantRole).toBe("MEMBER");
    expect(context.club.name).toBe("Robotics Club");
    expect(context.club.timezone).toBe("Asia/Kolkata");
  });

  it("hides a club in another college behind a 404", async () => {
    signInAs("outsider");
    const error = await expectApiError(requireClubAccess(p3.club, "club:read"));
    expect(error.status).toBe(404);
    expect(error.message).not.toContain("Robotics");
  });

  it("returns 403 for a club member who is not allowed to manage the club", async () => {
    signInAs("member");
    const error = await expectApiError(requireClubAccess(p3.club, "club:manage_members"));
    expect(error.status).toBe(403);
    expect(error.message).toContain("Robotics Club");
  });

  it("gives a college admin authority over a club they never joined", async () => {
    signInAs("owner");
    const context = await requireClubAccess(p3.club, "club:manage_members");
    expect(context.clubRole).toBeNull();
    expect(context.tenantRole).toBe("OWNER");
  });

  it("treats a soft-deleted club as not found for everyone", async () => {
    await testDb().club.update({ where: { id: p3.club }, data: { deletedAt: new Date() } });

    signInAs("president");
    const error = await expectApiError(requireClubAccess(p3.club, "club:read"));
    expect(error.status).toBe(404);
  });

  it("treats a club in a soft-deleted college as not found", async () => {
    await testDb().tenant.update({ where: { id: p3.tenant }, data: { deletedAt: new Date() } });

    signInAs("owner");
    const error = await expectApiError(requireClubAccess(p3.club, "club:read"));
    expect(error.status).toBe(404);
  });

  it("does not let a removed club member keep their authority", async () => {
    await testDb().clubMember.updateMany({
      where: { clubId: p3.club, userId: p3.president },
      data: { deletedAt: new Date() },
    });

    signInAs("president");
    const error = await expectApiError(requireClubAccess(p3.club, "club:manage_members"));
    expect(error.status).toBe(403);
  });

  it("404s on a club id that does not exist at all", async () => {
    signInAs("owner");
    const error = await expectApiError(
      requireClubAccess("99999999-9999-4999-8999-999999999999", "club:read"),
    );
    expect(error.status).toBe(404);
  });
});
