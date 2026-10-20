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
  transferPresidency,
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

/** Actors as the services see them: who they are plus their roles. */
const asPresident = { userId: p3.president, tenantRole: "MEMBER", clubRole: "PRESIDENT" } as const;
const asMember = { userId: p3.member, tenantRole: "MEMBER", clubRole: "MEMBER" } as const;
const asOwner = { userId: p3.owner, tenantRole: "OWNER", clubRole: null } as const;
const LEAD = "33333333-3333-4333-8333-0000000000a1";
const asLead = { userId: LEAD, tenantRole: "MEMBER", clubRole: "EVENT_MANAGER" } as const;
const HOUR = 3_600_000;

/** Adds a Lead (EVENT_MANAGER) to the fixture club. */
async function addLead(id: string = LEAD, email = "lead@test.dev") {
  await testDb().user.create({ data: { id, email, firstName: "Lia", lastName: "Lead" } });
  await testDb().tenantMember.create({ data: { tenantId: p3.tenant, userId: id, role: "MEMBER" } });
  await testDb().clubMember.create({ data: { clubId: p3.club, userId: id, role: "EVENT_MANAGER" } });
}

async function roleOf(userId: string) {
  const row = await testDb().clubMember.findFirst({
    where: { clubId: p3.club, userId, deletedAt: null },
    select: { role: true },
  });
  return row?.role ?? null;
}

describe("club members", () => {
  it("builds a display name from the profile", async () => {
    const members = await listClubMembers(p3.club, p3.tenant);
    const president = members.find((member) => member.user.id === p3.president);
    expect(president?.user.displayName).toBe("Priya President");
    expect(president?.role).toBe("PRESIDENT");
  });

  it("lets the President promote a Member to Lead and back", async () => {
    const promoted = await updateClubMemberRole(p3.club, p3.tenant, asPresident, p3.member, "EVENT_MANAGER");
    expect(promoted.role).toBe("EVENT_MANAGER");
    const demoted = await updateClubMemberRole(p3.club, p3.tenant, asPresident, p3.member, "MEMBER");
    expect(demoted.role).toBe("MEMBER");
  });

  it("never changes the President's role directly — that is what handing over is for", async () => {
    const error = await expectApiError(
      updateClubMemberRole(p3.club, p3.tenant, asOwner, p3.president, "MEMBER"),
    );
    expect(error.status).toBe(409);
    expect(error.message).toContain("Hand over presidency");
  });

  it("refuses role changes from a Lead", async () => {
    await addLead();
    const error = await expectApiError(
      updateClubMemberRole(p3.club, p3.tenant, asLead, p3.member, "EVENT_MANAGER"),
    );
    expect(error.status).toBe(403);
    expect(await roleOf(p3.member)).toBe("MEMBER");
  });

  it("will not touch a non-member", async () => {
    const error = await expectApiError(
      updateClubMemberRole(p3.club, p3.tenant, asPresident, p3.outsider, "MEMBER"),
    );
    expect(error.status).toBe(404);
  });
});

describe("removing people (tiered)", () => {
  it("lets a Lead remove a Member, softly, keeping the historical row", async () => {
    await addLead();
    const result = await removeClubMember(p3.club, p3.tenant, asLead, p3.member);
    expect(result).toMatchObject({ removed: true, cancelledTickets: 0 });

    const members = await listClubMembers(p3.club, p3.tenant);
    expect(members.map((member) => member.user.id)).not.toContain(p3.member);
    const row = await testDb().clubMember.findFirst({
      where: { clubId: p3.club, userId: p3.member },
      select: { deletedAt: true },
    });
    expect(row?.deletedAt).not.toBeNull();
  });

  it("does not let a Lead remove another Lead", async () => {
    await addLead();
    await addLead("33333333-3333-4333-8333-0000000000a2", "lead2@test.dev");
    const error = await expectApiError(
      removeClubMember(p3.club, p3.tenant, asLead, "33333333-3333-4333-8333-0000000000a2"),
    );
    expect(error.status).toBe(403);
    expect(error.message).toContain("Only the club's President can remove a Lead");
  });

  it("lets the President remove a Lead", async () => {
    await addLead();
    await removeClubMember(p3.club, p3.tenant, asPresident, LEAD);
    expect(await roleOf(LEAD)).toBeNull();
  });

  it("never removes the President — not even for a college Owner", async () => {
    for (const actor of [asOwner, asPresident]) {
      const error = await expectApiError(removeClubMember(p3.club, p3.tenant, actor, p3.president));
      expect([403, 409]).toContain(error.status);
    }
    expect(await roleOf(p3.president)).toBe("PRESIDENT");
  });

  it("does not let a plain Member remove anyone", async () => {
    await addLead();
    const error = await expectApiError(removeClubMember(p3.club, p3.tenant, asMember, LEAD));
    expect(error.status).toBe(403);
  });

  it("gives back upcoming members-only seats, keeps public and past ones, and lets the queue in", async () => {
    const db = testDb();
    const make = (title: string, isPublic: boolean, startOffsetHours: number, capacity = 5) =>
      db.event.create({
        data: {
          tenantId: p3.tenant,
          clubId: p3.club,
          title,
          location: "Lab",
          startTime: new Date(Date.now() + startOffsetHours * HOUR),
          endTime: new Date(Date.now() + (startOffsetHours + 2) * HOUR),
          capacity,
          waitlistEnabled: true,
          status: "PUBLISHED",
          isPublic,
          createdById: p3.president,
        },
      });
    const privateFull = await make("Members-only, full", false, 24, 1);
    const privateOther = await make("Members-only, waitlisted", false, 48, 1);
    const publicEvent = await make("Open to all", true, 24);
    const pastPrivate = await make("Members-only, finished", false, -48);

    // A student who will be waiting behind the member for the full room.
    const waiter = "33333333-3333-4333-8333-0000000000b1";
    await db.user.create({ data: { id: waiter, email: "waiter@test.dev" } });
    await db.tenantMember.create({ data: { tenantId: p3.tenant, userId: waiter, role: "MEMBER" } });

    const ticket = (eventId: string, userId: string, status: "REGISTERED" | "WAITLISTED", waitlistPosition?: number) =>
      db.ticket.create({
        data: {
          tenantId: p3.tenant,
          eventId,
          userId,
          status,
          qrCodeUuid: crypto.randomUUID(),
          ...(waitlistPosition ? { waitlistPosition } : {}),
        },
      });
    const fullSeat = await ticket(privateFull.id, p3.member, "REGISTERED");
    const queued = await ticket(privateFull.id, waiter, "WAITLISTED", 1);
    await ticket(privateOther.id, p3.president, "REGISTERED");
    const queueSpot = await ticket(privateOther.id, p3.member, "WAITLISTED", 1);
    const publicSeat = await ticket(publicEvent.id, p3.member, "REGISTERED");
    const pastSeat = await ticket(pastPrivate.id, p3.member, "REGISTERED");

    const result = await removeClubMember(p3.club, p3.tenant, asPresident, p3.member);
    expect(result.cancelledTickets).toBe(2);
    expect(result.promotedFromWaitlist).toBe(1);

    const statusOf = async (id: string) =>
      (await db.ticket.findUniqueOrThrow({ where: { id }, select: { status: true } })).status;
    expect(await statusOf(fullSeat.id)).toBe("CANCELLED");
    expect(await statusOf(queueSpot.id)).toBe("CANCELLED");
    expect(await statusOf(queued.id)).toBe("REGISTERED"); // the waiter got the seat
    expect(await statusOf(publicSeat.id)).toBe("REGISTERED"); // public: anyone may attend
    expect(await statusOf(pastSeat.id)).toBe("REGISTERED"); // history is not rewritten
  });
});

describe("handing over the presidency", () => {
  const handOver = (to: string, becomes: "EVENT_MANAGER" | "MEMBER", name = "Robotics Club") =>
    transferPresidency(p3.club, p3.tenant, {
      newPresidentUserId: to,
      formerPresidentBecomes: becomes,
      confirmClubName: name,
    });

  it("swaps the two roles, and the outgoing President picks Lead", async () => {
    const result = await handOver(p3.member, "EVENT_MANAGER");
    expect(result).toEqual({
      newPresidentUserId: p3.member,
      formerPresidentUserId: p3.president,
      formerPresidentRole: "EVENT_MANAGER",
    });
    expect(await roleOf(p3.member)).toBe("PRESIDENT");
    expect(await roleOf(p3.president)).toBe("EVENT_MANAGER");
  });

  it("…or picks Member", async () => {
    await handOver(p3.member, "MEMBER");
    expect(await roleOf(p3.president)).toBe("MEMBER");
  });

  it("accepts the club name in any letter case, but not a different name", async () => {
    await expect(handOver(p3.member, "MEMBER", "  robotics   CLUB ")).resolves.toBeTruthy();
    const error = await expectApiError(handOver(p3.president, "MEMBER", "Robotics"));
    expect(error.status).toBe(422);
    expect(error.details).toMatchObject({ confirmClubName: expect.any(Array) });
  });

  it("refuses someone outside the club, and someone who already is President", async () => {
    expect((await expectApiError(handOver(p3.outsider, "MEMBER"))).status).toBe(404);
    expect((await expectApiError(handOver(p3.president, "MEMBER"))).status).toBe(409);
    expect(await roleOf(p3.president)).toBe("PRESIDENT");
  });

  it("lets a college admin appoint a President for a club that has none", async () => {
    await testDb().clubMember.updateMany({
      where: { clubId: p3.club, userId: p3.president },
      data: { role: "MEMBER" },
    });
    const result = await handOver(p3.member, "MEMBER");
    expect(result.formerPresidentUserId).toBeNull();
    expect(await roleOf(p3.member)).toBe("PRESIDENT");
  });

  it("ends with exactly one President when two hand-overs race", async () => {
    await addLead();
    const outcomes = await Promise.allSettled([
      handOver(p3.member, "EVENT_MANAGER"),
      handOver(LEAD, "EVENT_MANAGER"),
    ]);
    // The club lock queues them: both succeed, one after the other.
    expect(outcomes.every((outcome) => outcome.status === "fulfilled")).toBe(true);
    const presidents = await testDb().clubMember.count({
      where: { clubId: p3.club, role: "PRESIDENT", deletedAt: null },
    });
    expect(presidents).toBe(1);
  });

  it("is backed by the database: a second President cannot be written at all", async () => {
    await expect(
      testDb().clubMember.updateMany({
        where: { clubId: p3.club, userId: p3.member },
        data: { role: "PRESIDENT" },
      }),
    ).rejects.toThrow();
    // A removed (soft-deleted) former President does not count.
    await testDb().clubMember.updateMany({
      where: { clubId: p3.club, userId: p3.president },
      data: { deletedAt: new Date() },
    });
    await expect(
      testDb().clubMember.updateMany({
        where: { clubId: p3.club, userId: p3.member },
        data: { role: "PRESIDENT" },
      }),
    ).resolves.toMatchObject({ count: 1 });
  });
});
