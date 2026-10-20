import { beforeEach, describe, expect, it } from "vitest";

import { ApiError } from "../../src/lib/api/response";
import {
  acceptInvite,
  createClubInvite,
  createTenantInvite,
  listClubInvites,
  previewInvite,
  revokeInvite,
} from "../../src/lib/services/invite-service";
import type { Actor } from "../../src/lib/auth/rbac";
import { assertTestDatabase, testDb, truncateAll } from "../helpers/db";
import { p3, p3Emails, seedClubWorkspace } from "../helpers/phase3";

/**
 * Invite links: creation rights, previews and — the part that matters — exactly
 * once redemption.
 *
 * These run against a real Postgres because the guarantee being tested is a
 * database one: `SELECT … FOR UPDATE` on the invite row is what stops two people
 * from using the same one-use link at the same moment.
 */

const president: Actor = { tenantRole: "MEMBER", clubRole: "PRESIDENT" };
const eventManager: Actor = { tenantRole: "MEMBER", clubRole: "EVENT_MANAGER" };

beforeEach(async () => {
  await assertTestDatabase();
  await truncateAll();
  await seedClubWorkspace();
});

async function expectApiError(operation: Promise<unknown>): Promise<ApiError> {
  try {
    await operation;
  } catch (error) {
    if (error instanceof ApiError) return error;
    throw error;
  }
  throw new Error("Expected the call to fail, but it resolved.");
}

/** A person who is not yet in the club — the normal invite recipient. */
async function createOutsider(email: string) {
  return testDb().user.create({
    data: { email, firstName: "New", lastName: "Person" },
    select: { id: true, email: true },
  });
}

/** Points an invite's expiry into the past, which is otherwise impossible to create. */
async function expireInvite(token: string) {
  await testDb().clubInvite.update({
    where: { token },
    data: { expiresAt: new Date(Date.now() - 60_000) },
  });
}

describe("creating invites", () => {
  it("lets a club President mint a member link", async () => {
    const invite = await createClubInvite(p3.club, p3.tenant, president, p3.president, {
      role: "MEMBER",
      expiresInHours: 168,
      maxUses: 1,
    });

    expect(invite.role).toBe("MEMBER");
    expect(invite.target).toBe("Robotics Club");
    expect(invite.url).toContain(`/join/${invite.token}`);
    expect(invite.url.startsWith("http")).toBe(true);
  });

  it("refuses an Event Manager trying to mint a President link", async () => {
    const error = await expectApiError(
      createClubInvite(p3.club, p3.tenant, eventManager, p3.president, {
        role: "PRESIDENT",
        expiresInHours: 168,
        maxUses: 1,
      }),
    );
    expect(error.status).toBe(403);
    expect(error.code).toBe("FORBIDDEN");
  });

  it("refuses a President link even to the President (Phase 10: presidency is handed over, never invited)", async () => {
    const error = await expectApiError(
      createClubInvite(p3.club, p3.tenant, president, p3.president, {
        role: "PRESIDENT",
        expiresInHours: 168,
        maxUses: 1,
      }),
    );
    expect(error.status).toBe(403);
  });

  it("refuses an invite for a club in another college", async () => {
    const error = await expectApiError(
      createClubInvite(p3.club, p3.otherTenant, president, p3.president, {
        role: "MEMBER",
        expiresInHours: 24,
        maxUses: 1,
      }),
    );
    expect(error.status).toBe(404);
  });

  it("lets an Owner mint an Admin college link but not an Admin mint one", async () => {
    const asOwner = await createTenantInvite(p3.tenant, "OWNER", p3.owner, {
      role: "ADMIN",
      expiresInHours: 24,
      maxUses: 1,
    });
    expect(asOwner.role).toBe("ADMIN");
    expect(asOwner.kind).toBe("tenant");

    const error = await expectApiError(
      createTenantInvite(p3.tenant, "ADMIN", p3.owner, { role: "ADMIN", expiresInHours: 24, maxUses: 1 }),
    );
    expect(error.status).toBe(403);
  });
});

describe("previewing an invite", () => {
  it("returns only public fields — never the invite id or its token history", async () => {
    const invite = await createClubInvite(p3.club, p3.tenant, president, p3.president, {
      role: "EVENT_MANAGER",
      expiresInHours: 168,
      maxUses: 5,
    });

    const preview = await previewInvite(invite.token);
    expect(preview).not.toBeNull();
    expect(preview?.valid).toBe(true);
    expect(preview?.targetName).toBe("Robotics Club");
    expect(preview?.role).toBe("EVENT_MANAGER");
    expect(preview?.usesRemaining).toBe(5);
    expect(preview?.emailRestricted).toBe(false);
    expect(Object.keys(preview ?? {})).not.toContain("id");
    expect(Object.keys(preview ?? {})).not.toContain("createdById");
  });

  it("returns null for a token that does not exist", async () => {
    expect(await previewInvite("not-a-real-token-000000000000000000000")).toBeNull();
  });

  it("explains why a link cannot be used", async () => {
    const expired = await createClubInvite(p3.club, p3.tenant, president, p3.president, {
      role: "MEMBER",
      expiresInHours: 1,
      maxUses: 1,
    });
    await expireInvite(expired.token);
    expect((await previewInvite(expired.token))?.reason).toContain("expired");

    const revoked = await createClubInvite(p3.club, p3.tenant, president, p3.president, {
      role: "MEMBER",
      expiresInHours: 24,
      maxUses: 1,
    });
    await revokeInvite(revoked.id, p3.club, p3.tenant);
    expect((await previewInvite(revoked.token))?.reason).toContain("cancelled");

    const invite = await createClubInvite(p3.club, p3.tenant, president, p3.president, {
      role: "MEMBER",
      expiresInHours: 24,
      maxUses: 1,
    });
    await acceptInvite(invite.token, (await createOutsider("first@test.dev")).id, "first@test.dev");
    expect((await previewInvite(invite.token))?.reason).toContain("already been used");
  });

  it("flags a link whose club has been deleted", async () => {
    const invite = await createClubInvite(p3.club, p3.tenant, president, p3.president, {
      role: "MEMBER",
      expiresInHours: 24,
      maxUses: 1,
    });
    await testDb().club.update({ where: { id: p3.club }, data: { deletedAt: new Date() } });

    const preview = await previewInvite(invite.token);
    expect(preview?.valid).toBe(false);
    expect(preview?.reason).toContain("no longer exists");
  });
});

describe("redeeming an invite", () => {
  it("adds the person with the role the LINK carries", async () => {
    const invite = await createClubInvite(p3.club, p3.tenant, president, p3.president, {
      role: "EVENT_MANAGER",
      expiresInHours: 24,
      maxUses: 3,
    });
    const newcomer = await createOutsider("newcomer@test.dev");

    const result = await acceptInvite(invite.token, newcomer.id, newcomer.email);

    expect(result.role).toBe("EVENT_MANAGER");
    expect(result.alreadyMember).toBe(false);

    const membership = await testDb().clubMember.findFirst({
      where: { clubId: p3.club, userId: newcomer.id },
      select: { role: true },
    });
    expect(membership?.role).toBe("EVENT_MANAGER");
  });

  it("turns a stray old President link into a Lead seat — never a second President", async () => {
    // Only possible for links created before Phase 10 (the migration rewrites
    // them); planted directly here to prove the redemption-side safety net.
    const legacy = await testDb().clubInvite.create({
      data: {
        tenantId: p3.tenant,
        clubId: p3.club,
        token: "legacy-president-link-000000000000000000001",
        role: "PRESIDENT",
        expiresAt: new Date(Date.now() + 3_600_000),
        maxUses: 1,
        createdById: p3.president,
      },
    });
    const newcomer = await createOutsider("legacy@test.dev");

    const result = await acceptInvite(legacy.token, newcomer.id, newcomer.email);
    expect(result.role).toBe("EVENT_MANAGER");

    const presidents = await testDb().clubMember.count({
      where: { clubId: p3.club, role: "PRESIDENT", deletedAt: null },
    });
    expect(presidents).toBe(1);
  });

  it("honours a one-use link for exactly one of two people clicking at once", async () => {
    const invite = await createClubInvite(p3.club, p3.tenant, president, p3.president, {
      role: "MEMBER",
      expiresInHours: 24,
      maxUses: 1,
    });

    const [firstName, secondName] = await Promise.all([
      createOutsider("race-one@test.dev"),
      createOutsider("race-two@test.dev"),
    ]);
    if (!firstName || !secondName) throw new Error("fixture users missing");

    const [first, second] = await Promise.allSettled([
      acceptInvite(invite.token, firstName.id, firstName.email),
      acceptInvite(invite.token, secondName.id, secondName.email),
    ]);

    const outcomes = [first, second];
    const fulfilled = outcomes.filter((outcome) => outcome.status === "fulfilled");
    const rejected = outcomes.filter((outcome) => outcome.status === "rejected");

    expect(fulfilled).toHaveLength(1);
    expect(rejected).toHaveLength(1);
    expect((rejected[0] as PromiseRejectedResult).reason).toBeInstanceOf(ApiError);
    expect(((rejected[0] as PromiseRejectedResult).reason as ApiError).status).toBe(409);

    // The database agrees: one membership, one use.
    const rows = await testDb().clubMember.findMany({
      where: { clubId: p3.club, userId: { in: [firstName.id, secondName.id] } },
      select: { id: true },
    });
    expect(rows).toHaveLength(1);

    const stored = await testDb().clubInvite.findUnique({
      where: { token: invite.token },
      select: { uses: true, maxUses: true },
    });
    expect(stored).toEqual({ uses: 1, maxUses: 1 });
  });

  it("does not burn a use when someone who is already a member clicks the link", async () => {
    const invite = await createClubInvite(p3.club, p3.tenant, president, p3.president, {
      role: "MEMBER",
      expiresInHours: 24,
      maxUses: 1,
    });

    const result = await acceptInvite(invite.token, p3.member, p3Emails.member);
    expect(result.alreadyMember).toBe(true);

    const stored = await testDb().clubInvite.findUnique({
      where: { token: invite.token },
      select: { uses: true },
    });
    expect(stored?.uses).toBe(0);

    // …and the link is still usable by somebody else.
    const newcomer = await createOutsider("after-member@test.dev");
    await expect(acceptInvite(invite.token, newcomer.id, newcomer.email)).resolves.toMatchObject({
      alreadyMember: false,
    });
  });

  it("also joins the college, so the club is actually visible to the newcomer", async () => {
    // Every read is tenant-scoped: without a college membership the new club
    // member would log in to an empty app.
    const invite = await createClubInvite(p3.club, p3.tenant, president, p3.president, {
      role: "MEMBER",
      expiresInHours: 24,
      maxUses: 1,
    });
    const newcomer = await createOutsider("college-joiner@test.dev");
    await acceptInvite(invite.token, newcomer.id, newcomer.email);

    const membership = await testDb().tenantMember.findFirst({
      where: { tenantId: p3.tenant, userId: newcomer.id },
      select: { role: true },
    });
    expect(membership?.role).toBe("MEMBER");
  });

  it("never downgrades an existing college role when redeeming a club link", async () => {
    const invite = await createClubInvite(p3.club, p3.tenant, president, p3.president, {
      role: "MEMBER",
      expiresInHours: 24,
      maxUses: 5,
    });

    // The college Owner is not a club member, so redeeming adds club membership…
    await acceptInvite(invite.token, p3.owner, p3Emails.owner);

    // …and must leave his OWNER role untouched.
    const membership = await testDb().tenantMember.findFirst({
      where: { tenantId: p3.tenant, userId: p3.owner },
      select: { role: true },
    });
    expect(membership?.role).toBe("OWNER");
  });

  it("lets the same person click a one-use link twice without an error", async () => {
    const invite = await createClubInvite(p3.club, p3.tenant, president, p3.president, {
      role: "MEMBER",
      expiresInHours: 24,
      maxUses: 1,
    });
    const newcomer = await createOutsider("double-click@test.dev");

    const first = await acceptInvite(invite.token, newcomer.id, newcomer.email);
    expect(first.alreadyMember).toBe(false);

    // The link is now used up — but the second click is the same person, so it
    // must succeed and report the membership rather than fail with "already used".
    const second = await acceptInvite(invite.token, newcomer.id, newcomer.email);
    expect(second.alreadyMember).toBe(true);
    expect(second.role).toBe("MEMBER");

    const stored = await testDb().clubInvite.findUnique({
      where: { token: invite.token },
      select: { uses: true },
    });
    expect(stored?.uses).toBe(1);
  });

  it("revives a lapsed membership instead of creating a duplicate row", async () => {
    const original = await testDb().clubMember.findFirst({
      where: { clubId: p3.club, userId: p3.member },
      select: { id: true },
    });
    await testDb().clubMember.update({
      where: { id: original?.id },
      data: { deletedAt: new Date() },
    });

    const invite = await createClubInvite(p3.club, p3.tenant, president, p3.president, {
      role: "EVENT_MANAGER",
      expiresInHours: 24,
      maxUses: 1,
    });
    const result = await acceptInvite(invite.token, p3.member, p3Emails.member);

    expect(result.alreadyMember).toBe(false);
    expect(result.role).toBe("EVENT_MANAGER");

    const rows = await testDb().clubMember.findMany({
      where: { clubId: p3.club, userId: p3.member },
      select: { id: true, role: true, deletedAt: true },
    });
    expect(rows).toHaveLength(1);
    expect(rows[0]?.id).toBe(original?.id);
    expect(rows[0]?.deletedAt).toBeNull();
    expect(rows[0]?.role).toBe("EVENT_MANAGER");
  });

  it("rejects an expired link", async () => {
    const invite = await createClubInvite(p3.club, p3.tenant, president, p3.president, {
      role: "MEMBER",
      expiresInHours: 1,
      maxUses: 5,
    });
    await expireInvite(invite.token);

    const newcomer = await createOutsider("late@test.dev");
    const error = await expectApiError(acceptInvite(invite.token, newcomer.id, newcomer.email));
    expect(error.status).toBe(409);
    expect(error.message).toContain("expired");
  });

  it("keeps a used-up link closed to everybody else", async () => {
    const invite = await createClubInvite(p3.club, p3.tenant, president, p3.president, {
      role: "MEMBER",
      expiresInHours: 24,
      maxUses: 1,
    });
    const first = await createOutsider("the-one@test.dev");
    await acceptInvite(invite.token, first.id, first.email);

    const second = await createOutsider("too-late@test.dev");
    const error = await expectApiError(acceptInvite(invite.token, second.id, second.email));
    expect(error.status).toBe(409);
    expect(error.message).toContain("already been used");
  });

  it("rejects a revoked link immediately", async () => {
    const invite = await createClubInvite(p3.club, p3.tenant, president, p3.president, {
      role: "MEMBER",
      expiresInHours: 24,
      maxUses: 5,
    });
    await revokeInvite(invite.id, p3.club, p3.tenant);

    const newcomer = await createOutsider("revoked@test.dev");
    const error = await expectApiError(acceptInvite(invite.token, newcomer.id, newcomer.email));
    expect(error.status).toBe(409);
    expect(error.message).toContain("cancelled");
  });

  it("refuses a link addressed to somebody else", async () => {
    const invite = await createClubInvite(p3.club, p3.tenant, president, p3.president, {
      role: "MEMBER",
      email: p3Emails.member,
      expiresInHours: 24,
      maxUses: 1,
    });

    const wrongPerson = await createOutsider("wrong@test.dev");
    const error = await expectApiError(acceptInvite(invite.token, wrongPerson.id, wrongPerson.email));
    expect(error.status).toBe(403);
    expect(error.message).toContain("different email");

    // The right person, case-insensitively, gets in.
    await expect(
      acceptInvite(invite.token, p3.member, p3Emails.member.toUpperCase()),
    ).resolves.toMatchObject({ alreadyMember: true });
  });

  it("rejects a token that does not exist", async () => {
    const error = await expectApiError(
      acceptInvite("does-not-exist-000000000000000000000000", p3.owner, p3Emails.owner),
    );
    expect(error.status).toBe(404);
  });

  it("grants college membership through a tenant invite", async () => {
    const invite = await createTenantInvite(p3.tenant, "OWNER", p3.owner, {
      role: "ADMIN",
      expiresInHours: 24,
      maxUses: 1,
    });
    const newcomer = await createOutsider("college-admin@test.dev");

    await acceptInvite(invite.token, newcomer.id, newcomer.email);

    const membership = await testDb().tenantMember.findFirst({
      where: { tenantId: p3.tenant, userId: newcomer.id },
      select: { role: true },
    });
    expect(membership?.role).toBe("ADMIN");
  });
});

describe("listing and revoking invites", () => {
  it("reports each link's status and never leaks the stored token", async () => {
    const active = await createClubInvite(p3.club, p3.tenant, president, p3.president, {
      role: "MEMBER",
      expiresInHours: 24,
      maxUses: 5,
    });
    const expired = await createClubInvite(p3.club, p3.tenant, president, p3.president, {
      role: "MEMBER",
      expiresInHours: 1,
      maxUses: 1,
    });
    await expireInvite(expired.token);
    const used = await createClubInvite(p3.club, p3.tenant, president, p3.president, {
      role: "MEMBER",
      expiresInHours: 24,
      maxUses: 1,
    });
    const first = await createOutsider("used-link@test.dev");
    await acceptInvite(used.token, first.id, first.email);

    const invites = await listClubInvites(p3.club, p3.tenant);
    const byId = new Map(invites.map((invite) => [invite.id, invite]));

    expect(byId.get(active.id)?.status).toBe("active");
    expect(byId.get(expired.id)?.status).toBe("expired");
    expect(byId.get(used.id)?.status).toBe("used_up");
    // Each row shows a shareable URL that contains the token, and nothing else does.
    expect(byId.get(active.id)?.url).toContain(active.token);
  });

  it("revocation is idempotent and scoped to its own club", async () => {
    const invite = await createClubInvite(p3.club, p3.tenant, president, p3.president, {
      role: "MEMBER",
      expiresInHours: 24,
      maxUses: 1,
    });

    const first = await revokeInvite(invite.id, p3.club, p3.tenant);
    const second = await revokeInvite(invite.id, p3.club, p3.tenant);
    expect(second.revokedAt).toBe(first.revokedAt);

    const error = await expectApiError(revokeInvite(invite.id, p3.club, p3.otherTenant));
    expect(error.status).toBe(404);
  });

  it("shows no invites for a club in another college", async () => {
    await createClubInvite(p3.club, p3.tenant, president, p3.president, {
      role: "MEMBER",
      expiresInHours: 24,
      maxUses: 1,
    });

    expect(await listClubInvites(p3.club, p3.otherTenant)).toHaveLength(0);
  });
});
