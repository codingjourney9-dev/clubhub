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

/** Mutable session identity, swapped per test (the guards call `getSessionUserId()` and `requireUser()`). */
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
  // The guards read the id from the session cookie first so permission lookups
  // can run alongside the user lookup; it must be the same identity.
  getSessionUserId: async () => session.userId || null,
}));

const { requireClubAccess, requireEventAccess, requireTenantAccess } = await import(
  "../../src/lib/auth/guards"
);

/** Signs the given fixture person in for the next call. */
function signInAs(person: "owner" | "president" | "member" | "outsider" | "bystander") {
  if (person === "bystander") {
    session.userId = BYSTANDER;
    session.email = "phase3.bystander@test.dev";
    return;
  }
  session.userId = p3[person];
  session.email = p3Emails[person];
}

/** A plain college member who never joined the club. */
const BYSTANDER = "33333333-3333-4333-8333-000000000005";

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
    const context = await requireClubAccess(p3.club, "club:change_roles");
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
    const error = await expectApiError(requireClubAccess(p3.club, "club:change_roles"));
    expect(error.status).toBe(403);
    expect(error.message).toContain("Robotics Club");
  });

  it("gives a college admin authority over a club they never joined", async () => {
    signInAs("owner");
    const context = await requireClubAccess(p3.club, "club:change_roles");
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
    const error = await expectApiError(requireClubAccess(p3.club, "club:change_roles"));
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

describe("requireEventAccess", () => {
  const PUBLIC_EVENT = "33333333-3333-4333-8333-eeeeeeeeee01";
  const MEMBERS_ONLY = "33333333-3333-4333-8333-eeeeeeeeee02";
  const DRAFT = "33333333-3333-4333-8333-eeeeeeeeee03";

  beforeEach(async () => {
    const db = testDb();
    await db.user.create({
      data: { id: BYSTANDER, email: "phase3.bystander@test.dev", firstName: "Bea", lastName: "Stander" },
    });
    await db.tenantMember.create({ data: { tenantId: p3.tenant, userId: BYSTANDER, role: "MEMBER" } });

    const base = {
      tenantId: p3.tenant,
      clubId: p3.club,
      startTime: new Date("2030-01-10T10:00:00Z"),
      endTime: new Date("2030-01-10T12:00:00Z"),
    };
    await db.event.createMany({
      data: [
        { ...base, id: PUBLIC_EVENT, title: "Open Robot Day", status: "PUBLISHED", isPublic: true },
        { ...base, id: MEMBERS_ONLY, title: "Members Build Night", status: "PUBLISHED", isPublic: false },
        { ...base, id: DRAFT, title: "Secret Draft", status: "DRAFT", isPublic: true },
      ],
    });
  });

  it("shows a public event to anyone in the college, with the club's time zone", async () => {
    signInAs("bystander");
    const context = await requireEventAccess(PUBLIC_EVENT, "ticket:rsvp");
    expect(context.event.title).toBe("Open Robot Day");
    expect(context.club.timezone).toBe("Asia/Kolkata");
    expect(context.tenantRole).toBe("MEMBER");
    expect(context.clubRole).toBeNull();
    expect(context.isOrganizer).toBe(false);
  });

  it("hides every event from another college behind a 404 that names nothing", async () => {
    signInAs("outsider");
    const error = await expectApiError(requireEventAccess(PUBLIC_EVENT, "ticket:rsvp"));
    expect(error.status).toBe(404);
    expect(error.message).not.toContain("Robot");
  });

  it("hides a members-only event from college members outside the club", async () => {
    signInAs("bystander");
    const error = await expectApiError(requireEventAccess(MEMBERS_ONLY, "ticket:rsvp"));
    expect(error.status).toBe(404);
  });

  it("shows a members-only event to a club member", async () => {
    signInAs("member");
    const context = await requireEventAccess(MEMBERS_ONLY, "ticket:rsvp");
    expect(context.clubRole).toBe("MEMBER");
  });

  it("hides a draft from a plain club member but not from the president", async () => {
    signInAs("member");
    expect((await expectApiError(requireEventAccess(DRAFT, "ticket:rsvp"))).status).toBe(404);

    signInAs("president");
    const context = await requireEventAccess(DRAFT, "ticket:rsvp");
    expect(context.isOrganizer).toBe(true);
    expect(context.clubRole).toBe("PRESIDENT");
  });

  it("gives a college owner organiser rights over an event of a club they never joined", async () => {
    signInAs("owner");
    const context = await requireEventAccess(DRAFT, "attendance:scan");
    expect(context.isOrganizer).toBe(true);
    expect(context.clubRole).toBeNull();
    expect(context.tenantRole).toBe("OWNER");
  });

  it("returns 403 (not 404) when a member who can see the event lacks the role", async () => {
    signInAs("member");
    const error = await expectApiError(requireEventAccess(PUBLIC_EVENT, "attendance:scan"));
    expect(error.status).toBe(403);
  });

  it("does not let a removed president keep organiser rights", async () => {
    await testDb().clubMember.updateMany({
      where: { clubId: p3.club, userId: p3.president },
      data: { deletedAt: new Date() },
    });
    signInAs("president");
    expect((await expectApiError(requireEventAccess(DRAFT, "ticket:rsvp"))).status).toBe(404);
    expect((await expectApiError(requireEventAccess(PUBLIC_EVENT, "attendance:scan"))).status).toBe(403);
  });

  it("treats a removed college membership as no membership at all", async () => {
    await testDb().tenantMember.updateMany({
      where: { tenantId: p3.tenant, userId: p3.member },
      data: { deletedAt: new Date() },
    });
    signInAs("member");
    // Still a club member on paper — but outside the college, so it is a 404.
    expect((await expectApiError(requireEventAccess(MEMBERS_ONLY, "ticket:rsvp"))).status).toBe(404);
  });

  it("404s on a deleted event, a deleted club, and a deleted college", async () => {
    signInAs("owner");
    await testDb().event.update({ where: { id: PUBLIC_EVENT }, data: { deletedAt: new Date() } });
    expect((await expectApiError(requireEventAccess(PUBLIC_EVENT, "ticket:rsvp"))).status).toBe(404);

    await testDb().club.update({ where: { id: p3.club }, data: { deletedAt: new Date() } });
    expect((await expectApiError(requireEventAccess(MEMBERS_ONLY, "ticket:rsvp"))).status).toBe(404);

    await testDb().club.update({ where: { id: p3.club }, data: { deletedAt: null } });
    await testDb().tenant.update({ where: { id: p3.tenant }, data: { deletedAt: new Date() } });
    expect((await expectApiError(requireEventAccess(MEMBERS_ONLY, "ticket:rsvp"))).status).toBe(404);
  });

  it("refuses with 401 when nobody is signed in", async () => {
    session.userId = "";
    const error = await expectApiError(requireEventAccess(PUBLIC_EVENT, "ticket:rsvp"));
    expect(error.status).toBe(401);
  });
});
