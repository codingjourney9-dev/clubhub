import { beforeEach, describe, expect, it } from "vitest";

import { ApiError } from "../../src/lib/api/response";
import {
  createClub,
  getClubById,
  listClubMembers,
  listClubs,
  removeClubMember,
  softDeleteClub,
  updateClub,
  updateClubMemberRole,
} from "../../src/lib/services/club-service";
import { assertTestDatabase, testDb, truncateAll } from "../helpers/db";
import { p3, seedClubWorkspace } from "../helpers/phase3";

/**
 * Club lifecycle, exercised through the service layer against a real Postgres.
 *
 * The interesting cases are the ones the UI cannot be trusted to uphold: the
 * last-President rule, tenant isolation on every read, and the refusal to delete
 * a club that still has published events.
 */

beforeEach(async () => {
  await assertTestDatabase();
  await truncateAll();
  await seedClubWorkspace();
});

/** Captures the ApiError a call throws, so its status/code can be asserted. */
async function expectApiError(operation: Promise<unknown>): Promise<ApiError> {
  try {
    await operation;
  } catch (error) {
    if (error instanceof ApiError) return error;
    throw error;
  }
  throw new Error("Expected the call to fail, but it resolved.");
}

/** Reads a single membership role directly, for assertions on writes. */
async function membershipRole(clubId: string, userId: string) {
  const row = await testDb().clubMember.findFirst({
    where: { clubId, userId, deletedAt: null },
    select: { role: true },
  });
  return row?.role ?? null;
}

/** Creates a future, published event — the thing that blocks club deletion. */
async function createPublishedEvent(title = "Robotics Expo") {
  return testDb().event.create({
    data: {
      tenantId: p3.tenant,
      clubId: p3.club,
      title,
      startTime: new Date(Date.now() + 86_400_000),
      endTime: new Date(Date.now() + 90_000_000),
      status: "PUBLISHED",
      isPublic: true,
    },
  });
}

describe("createClub", () => {
  it("makes the founder the club's President in one transaction", async () => {
    const club = await createClub(p3.tenant, p3.owner, {
      tenantId: p3.tenant,
      name: "Quiz Society",
      description: "Weekly quizzes",
      category: "Academic",
    });

    expect(await membershipRole(club.id, p3.owner)).toBe("PRESIDENT");
    expect(club.slug).toBe("quiz-society");
  });

  it("suffixes a duplicate name inside the same college", async () => {
    // The fixture club already holds the "robotics" slug, so the next club with
    // that name must get a numbered one (clubs are unique per college, not globally).
    const club = await createClub(p3.tenant, p3.owner, { tenantId: p3.tenant, name: "Robotics" });
    expect(club.slug).toBe("robotics-2");
  });

  it("allows the same club name in a different college (per-tenant slugs)", async () => {
    const club = await createClub(p3.otherTenant, p3.outsider, {
      tenantId: p3.otherTenant,
      name: "Robotics Club",
    });
    expect(club.slug).toBe("robotics-club");
  });
});

describe("listing and reading clubs", () => {
  it("attaches the viewer's own role and counts only active members", async () => {
    const asPresident = await listClubs(p3.tenant, p3.president);
    expect(asPresident).toHaveLength(1);
    expect(asPresident[0]?.viewerRole).toBe("PRESIDENT");
    expect(asPresident[0]?.memberCount).toBe(2);

    // A college admin who never joined the club sees it, but with no club role:
    // the override is applied by the guard, not by silently reporting PRESIDENT.
    const asOwner = await listClubs(p3.tenant, p3.owner);
    expect(asOwner[0]?.viewerRole).toBeNull();
  });

  it("never lists another college's clubs", async () => {
    const clubs = await listClubs(p3.otherTenant, p3.outsider);
    expect(clubs).toHaveLength(0);
  });

  it("treats a cross-tenant club id as not found", async () => {
    const error = await expectApiError(getClubById(p3.club, p3.otherTenant));
    expect(error.status).toBe(404);
    expect(error.code).toBe("NOT_FOUND");
  });

  it("cannot be pointed at another tenant's club for updates either", async () => {
    const error = await expectApiError(updateClub(p3.club, p3.otherTenant, { name: "Hijacked" }));
    expect(error.status).toBe(404);

    // The real row is untouched.
    const club = await getClubById(p3.club, p3.tenant);
    expect(club.name).toBe("Robotics Club");
  });
});

describe("softDeleteClub", () => {
  it("refuses while a published future event exists", async () => {
    await createPublishedEvent();

    const error = await expectApiError(softDeleteClub(p3.club, p3.tenant));
    expect(error.status).toBe(409);
    expect(error.message).toContain("published event");
  });

  it("deletes once the blocking event is cancelled, and drops out of listings", async () => {
    const event = await createPublishedEvent();
    await testDb().event.update({ where: { id: event.id }, data: { status: "CANCELLED" } });

    await softDeleteClub(p3.club, p3.tenant);

    expect(await listClubs(p3.tenant, p3.president)).toHaveLength(0);
    // Soft delete: the row survives for auditing.
    const row = await testDb().club.findUnique({ where: { id: p3.club }, select: { deletedAt: true } });
    expect(row?.deletedAt).not.toBeNull();
  });

  it("does not count a finished event as blocking", async () => {
    const past = await testDb().event.create({
      data: {
        tenantId: p3.tenant,
        clubId: p3.club,
        title: "Last Month's Meetup",
        startTime: new Date(Date.now() - 172_800_000),
        endTime: new Date(Date.now() - 86_400_000),
        status: "PUBLISHED",
        isPublic: true,
      },
    });
    expect(past.id).toBeTruthy();

    await expect(softDeleteClub(p3.club, p3.tenant)).resolves.toMatchObject({ id: p3.club });
  });
});

describe("club members", () => {
  it("builds a display name from the profile", async () => {
    const members = await listClubMembers(p3.club, p3.tenant);
    const president = members.find((member) => member.user.id === p3.president);
    expect(president?.user.displayName).toBe("Priya President");
    expect(president?.role).toBe("PRESIDENT");
  });

  it("refuses to demote the club's only President", async () => {
    const error = await expectApiError(updateClubMemberRole(p3.club, p3.tenant, p3.president, "MEMBER"));
    expect(error.status).toBe(409);
    expect(error.message).toContain("only President");
  });

  it("allows the change once a second President exists", async () => {
    await updateClubMemberRole(p3.club, p3.tenant, p3.member, "PRESIDENT");

    const demoted = await updateClubMemberRole(p3.club, p3.tenant, p3.president, "EVENT_MANAGER");
    expect(demoted.role).toBe("EVENT_MANAGER");
  });

  it("refuses to remove the club's only President", async () => {
    const error = await expectApiError(removeClubMember(p3.club, p3.tenant, p3.president));
    expect(error.status).toBe(409);
  });

  it("removes a member softly, keeping the historical row", async () => {
    await removeClubMember(p3.club, p3.tenant, p3.member);

    const members = await listClubMembers(p3.club, p3.tenant);
    expect(members.map((member) => member.user.id)).not.toContain(p3.member);

    const row = await testDb().clubMember.findFirst({
      where: { clubId: p3.club, userId: p3.member },
      select: { deletedAt: true },
    });
    expect(row?.deletedAt).not.toBeNull();
  });

  it("will not touch a non-member", async () => {
    const error = await expectApiError(updateClubMemberRole(p3.club, p3.tenant, p3.outsider, "MEMBER"));
    expect(error.status).toBe(404);
  });
});
