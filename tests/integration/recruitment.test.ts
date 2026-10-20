import { beforeEach, describe, expect, it } from "vitest";

import { ApiError } from "../../src/lib/api/response";
import {
  applyToOpening,
  createOpening,
  decideApplication,
  getPublicOpening,
  listClubOpenings,
  listMyApplications,
  listOpenOpenings,
  listOpeningApplications,
  updateOpening,
  withdrawApplication,
} from "../../src/lib/services/recruitment-service";
import { assertTestDatabase, testDb, truncateAll } from "../helpers/db";
import { p3, seedClubWorkspace } from "../helpers/phase3";

/**
 * Recruitment board (Phase 11), against a real database: the unique index
 * behind "one application each", the row locks, and what accepting grants.
 */

const LEAD = "33333333-3333-4333-8333-0000000000b1";
const asPresident = { userId: p3.president, tenantRole: "MEMBER", clubRole: "PRESIDENT" } as const;
const asLead = { userId: LEAD, tenantRole: "MEMBER", clubRole: "EVENT_MANAGER" } as const;
const asOwner = { userId: p3.owner, tenantRole: "OWNER", clubRole: null } as const;
const TZ = "Asia/Kolkata";

beforeEach(async () => {
  await assertTestDatabase();
  await truncateAll();
  await seedClubWorkspace();
  await testDb().user.create({ data: { id: LEAD, email: "lead.b@test.dev", firstName: "Lia", lastName: "Lead" } });
  await testDb().tenantMember.create({ data: { tenantId: p3.tenant, userId: LEAD, role: "MEMBER" } });
  await testDb().clubMember.create({ data: { clubId: p3.club, userId: LEAD, role: "EVENT_MANAGER" } });
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

const post = (
  actor: typeof asPresident | typeof asLead | typeof asOwner,
  role: "MEMBER" | "EVENT_MANAGER",
  extra: { questions?: string[]; closesAt?: string | null } = {},
) =>
  createOpening({
    clubId: p3.club,
    tenantId: p3.tenant,
    timeZone: TZ,
    actor,
    input: {
      title: role === "MEMBER" ? "Builder" : "Workshop Lead",
      description: "Do the thing.",
      requirements: null,
      role,
      questions: extra.questions ?? ["Why do you want this role?"],
      closesAt: extra.closesAt,
    },
  });

const decide = (actor: typeof asPresident | typeof asLead | typeof asOwner, applicationId: string, decision: "ACCEPT" | "REJECT") =>
  decideApplication({ clubId: p3.club, tenantId: p3.tenant, actor, applicationId, decision });

describe("posting", () => {
  it("a Lead posts a Member opening; it shows on the public board with the college name", async () => {
    const opening = await post(asLead, "MEMBER");
    const board = await listOpenOpenings();
    expect(board.map((item) => item.id)).toEqual([opening.id]);
    expect(board[0]?.club.collegeName).toBe("Phase Three College");
    expect(board[0]?.postedBy).toBe("Lia Lead");
  });

  it("only the President (or a college admin) posts a Lead opening", async () => {
    expect((await expectApiError(post(asLead, "EVENT_MANAGER"))).status).toBe(403);
    await expect(post(asPresident, "EVENT_MANAGER")).resolves.toMatchObject({ role: "EVENT_MANAGER" });
    await expect(post(asOwner, "EVENT_MANAGER")).resolves.toMatchObject({ role: "EVENT_MANAGER" });
  });

  it("a Lead can't edit or close the President's Lead opening", async () => {
    const opening = await post(asPresident, "EVENT_MANAGER");
    const error = await expectApiError(
      updateOpening({
        clubId: p3.club,
        tenantId: p3.tenant,
        timeZone: TZ,
        actor: asLead,
        openingId: opening.id,
        input: { status: "CLOSED" },
      }),
    );
    expect(error.status).toBe(403);
  });

  it("refuses a closing date in the past", async () => {
    const error = await expectApiError(post(asLead, "MEMBER", { closesAt: "2020-01-01T10:00" }));
    expect(error.status).toBe(422);
  });

  it("the database refuses a Presidency opening and a fourth question even past the service", async () => {
    const base = {
      tenantId: p3.tenant,
      clubId: p3.club,
      createdById: p3.president,
      title: "x",
      description: "y",
    };
    await expect(
      testDb().roleOpening.create({ data: { ...base, role: "PRESIDENT", questions: ["Why?"] } }),
    ).rejects.toThrow();
    await expect(
      testDb().roleOpening.create({ data: { ...base, questions: ["a", "b", "c", "d"] } }),
    ).rejects.toThrow();
  });
});

describe("applying", () => {
  it("anyone signed in can apply, even from another college; the questions are copied in", async () => {
    const opening = await post(asLead, "MEMBER", { questions: ["Why?", "When are you free?"] });
    const application = await applyToOpening({ openingId: opening.id, applicantId: p3.outsider, answers: ["Fun.", "Evenings."] });
    expect(application.status).toBe("PENDING");

    // Editing the questions afterwards doesn't rewrite what was answered.
    await updateOpening({
      clubId: p3.club,
      tenantId: p3.tenant,
      timeZone: TZ,
      actor: asLead,
      openingId: opening.id,
      input: { questions: ["Something else?"] },
    });
    const { applications } = await listOpeningApplications({ clubId: p3.club, tenantId: p3.tenant, actor: asLead, openingId: opening.id });
    expect(applications[0]?.answers).toEqual([
      { question: "Why?", answer: "Fun." },
      { question: "When are you free?", answer: "Evenings." },
    ]);
    expect(applications[0]?.applicant.colleges).toEqual(["Other College"]);
  });

  it("needs exactly one answer per question", async () => {
    const opening = await post(asLead, "MEMBER", { questions: ["Why?", "When?"] });
    const error = await expectApiError(applyToOpening({ openingId: opening.id, applicantId: p3.outsider, answers: ["Fun."] }));
    expect(error.status).toBe(422);
  });

  it("one application per person: a repeat and a double-click race both get 409", async () => {
    const opening = await post(asLead, "MEMBER");
    const results = await Promise.allSettled(
      [1, 2, 3].map(() => applyToOpening({ openingId: opening.id, applicantId: p3.outsider, answers: ["Fun."] })),
    );
    expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    for (const result of results) {
      if (result.status === "rejected") expect((result.reason as ApiError).status).toBe(409);
    }
    expect(await testDb().openingApplication.count()).toBe(1);
  });

  it("closed by hand, or past its date: no new applications", async () => {
    const opening = await post(asLead, "MEMBER");
    await updateOpening({ clubId: p3.club, tenantId: p3.tenant, timeZone: TZ, actor: asLead, openingId: opening.id, input: { status: "CLOSED" } });
    expect((await expectApiError(applyToOpening({ openingId: opening.id, applicantId: p3.outsider, answers: ["x"] }))).status).toBe(409);
    expect(await listOpenOpenings()).toHaveLength(0);
    expect((await getPublicOpening(opening.id))?.state).toBe("closed");

    const dated = await post(asLead, "MEMBER");
    await testDb().roleOpening.update({ where: { id: dated.id }, data: { closesAt: new Date(Date.now() - 1000) } });
    expect((await expectApiError(applyToOpening({ openingId: dated.id, applicantId: p3.outsider, answers: ["x"] }))).status).toBe(409);
    expect((await getPublicOpening(dated.id))?.state).toBe("date_passed");
  });

  it("existing Members may apply only for Lead; Leads and the President not at all", async () => {
    const memberOpening = await post(asPresident, "MEMBER");
    const leadOpening = await post(asPresident, "EVENT_MANAGER");
    expect((await expectApiError(applyToOpening({ openingId: memberOpening.id, applicantId: p3.member, answers: ["x"] }))).status).toBe(409);
    await expect(applyToOpening({ openingId: leadOpening.id, applicantId: p3.member, answers: ["x"] })).resolves.toBeTruthy();
    expect((await expectApiError(applyToOpening({ openingId: leadOpening.id, applicantId: LEAD, answers: ["x"] }))).status).toBe(409);
    expect((await expectApiError(applyToOpening({ openingId: memberOpening.id, applicantId: p3.president, answers: ["x"] }))).status).toBe(409);
  });
});

describe("withdrawing", () => {
  it("only the applicant, only while pending — and they may apply again", async () => {
    const opening = await post(asLead, "MEMBER");
    const application = await applyToOpening({ openingId: opening.id, applicantId: p3.outsider, answers: ["x"] });

    // Someone else's application looks missing.
    expect((await expectApiError(withdrawApplication(application.id, p3.member))).status).toBe(404);

    await withdrawApplication(application.id, p3.outsider);
    expect((await expectApiError(withdrawApplication(application.id, p3.outsider))).status).toBe(409);
    expect((await expectApiError(decide(asLead, application.id, "ACCEPT"))).status).toBe(409);

    const again = await applyToOpening({ openingId: opening.id, applicantId: p3.outsider, answers: ["Second try"] });
    expect(again.id).toBe(application.id);
    expect(again.status).toBe("PENDING");
    expect((await listMyApplications(p3.outsider))[0]?.status).toBe("PENDING");
  });
});

describe("deciding", () => {
  it("accepting a cross-college applicant joins them to the college and the club as Member", async () => {
    const opening = await post(asLead, "MEMBER");
    const application = await applyToOpening({ openingId: opening.id, applicantId: p3.outsider, answers: ["x"] });

    const result = await decide(asLead, application.id, "ACCEPT");
    expect(result).toMatchObject({ status: "ACCEPTED", grantedRole: "MEMBER" });

    const membership = await testDb().tenantMember.findFirst({ where: { tenantId: p3.tenant, userId: p3.outsider } });
    expect(membership?.role).toBe("MEMBER");
    const clubMembership = await testDb().clubMember.findFirst({ where: { clubId: p3.club, userId: p3.outsider, deletedAt: null } });
    expect(clubMembership?.role).toBe("MEMBER");

    const row = await testDb().openingApplication.findUniqueOrThrow({ where: { id: application.id } });
    expect(row.decidedById).toBe(LEAD);
    expect(row.decidedAt).not.toBeNull();
  });

  it("accepting a Member for a Lead opening promotes them; only the President may", async () => {
    const opening = await post(asPresident, "EVENT_MANAGER");
    const application = await applyToOpening({ openingId: opening.id, applicantId: p3.member, answers: ["x"] });

    expect((await expectApiError(decide(asLead, application.id, "ACCEPT"))).status).toBe(403);
    expect((await expectApiError(listOpeningApplications({ clubId: p3.club, tenantId: p3.tenant, actor: asLead, openingId: opening.id }))).status).toBe(403);

    await expect(decide(asPresident, application.id, "ACCEPT")).resolves.toMatchObject({ grantedRole: "EVENT_MANAGER" });
    const membership = await testDb().clubMember.findFirst({ where: { clubId: p3.club, userId: p3.member, deletedAt: null } });
    expect(membership?.role).toBe("EVENT_MANAGER");
  });

  it("a removed member who's accepted again gets their old membership back", async () => {
    await testDb().clubMember.updateMany({ where: { clubId: p3.club, userId: p3.member }, data: { deletedAt: new Date() } });
    const opening = await post(asLead, "MEMBER");
    const application = await applyToOpening({ openingId: opening.id, applicantId: p3.member, answers: ["x"] });
    await decide(asLead, application.id, "ACCEPT");
    const rows = await testDb().clubMember.findMany({ where: { clubId: p3.club, userId: p3.member } });
    expect(rows).toHaveLength(1);
    expect(rows[0]?.deletedAt).toBeNull();
  });

  it("rejecting is final: no second decision, no re-applying", async () => {
    const opening = await post(asLead, "MEMBER");
    const application = await applyToOpening({ openingId: opening.id, applicantId: p3.outsider, answers: ["x"] });
    await decide(asLead, application.id, "REJECT");
    expect((await expectApiError(decide(asPresident, application.id, "ACCEPT"))).status).toBe(409);
    expect((await expectApiError(applyToOpening({ openingId: opening.id, applicantId: p3.outsider, answers: ["y"] }))).status).toBe(409);
    expect(await testDb().clubMember.count({ where: { userId: p3.outsider } })).toBe(0);
  });

  it("two reviewers clicking at once: exactly one decision lands", async () => {
    const opening = await post(asPresident, "MEMBER");
    const application = await applyToOpening({ openingId: opening.id, applicantId: p3.outsider, answers: ["x"] });
    const results = await Promise.allSettled([
      decide(asLead, application.id, "ACCEPT"),
      decide(asPresident, application.id, "REJECT"),
    ]);
    expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
  });

  it("pending applications can still be decided after the opening closes", async () => {
    const opening = await post(asLead, "MEMBER");
    const application = await applyToOpening({ openingId: opening.id, applicantId: p3.outsider, answers: ["x"] });
    await updateOpening({ clubId: p3.club, tenantId: p3.tenant, timeZone: TZ, actor: asLead, openingId: opening.id, input: { status: "CLOSED" } });
    await expect(decide(asLead, application.id, "ACCEPT")).resolves.toMatchObject({ status: "ACCEPTED" });
  });

  it("another club's reviewer can't reach the application (looks missing)", async () => {
    const opening = await post(asLead, "MEMBER");
    const application = await applyToOpening({ openingId: opening.id, applicantId: p3.outsider, answers: ["x"] });
    const otherClub = await testDb().club.create({
      data: { tenantId: p3.tenant, name: "Chess", slug: "chess" },
    });
    const error = await expectApiError(
      decideApplication({ clubId: otherClub.id, tenantId: p3.tenant, actor: asPresident, applicationId: application.id, decision: "ACCEPT" }),
    );
    expect(error.status).toBe(404);
  });
});

describe("club view of openings", () => {
  it("counts are for the people who can review; Members see zeros", async () => {
    const opening = await post(asLead, "MEMBER");
    await applyToOpening({ openingId: opening.id, applicantId: p3.outsider, answers: ["x"] });
    const forLead = await listClubOpenings(p3.club, p3.tenant, asLead);
    expect(forLead[0]).toMatchObject({ pendingCount: 1, totalCount: 1, canManage: true });
    const forMember = await listClubOpenings(p3.club, p3.tenant, { tenantRole: "MEMBER", clubRole: "MEMBER" });
    expect(forMember[0]).toMatchObject({ pendingCount: 0, totalCount: 0, canManage: false });
  });
});
