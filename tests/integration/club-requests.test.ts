import { beforeEach, describe, expect, it } from "vitest";

import { ApiError } from "../../src/lib/api/response";
import { getPublicClubProfile } from "../../src/lib/services/club-profile-service";
import {
  cancelClubRequest,
  getPendingClubView,
  listPendingRequestsForAdmin,
  loadStartClubContext,
  requestClub,
  resendClubCode,
  verifyClubCode,
} from "../../src/lib/services/club-request-service";
import { listClubs } from "../../src/lib/services/club-service";
import { loadMemberOverview } from "../../src/lib/services/dashboard-service";
import { assertTestDatabase, testDb, truncateAll } from "../helpers/db";
import { p3, p3Emails, seedClubWorkspace } from "../helpers/phase3";

/**
 * Phase 12 against a real database: a student starts a club, it stays PENDING
 * and hidden, and only the professor's code makes it live. Includes the races
 * (two requests at once, many guesses at once) that a unit test can't show.
 */

const STUDENT = { id: "55555555-5555-4555-8555-000000000001", email: "asha@cse.p3.edu" };
const DRIFTER = { id: "55555555-5555-4555-8555-000000000002", email: "zed@gmail.com" };
const OWNER = { id: p3.owner, email: p3Emails.owner };
const PROF = "prof.rao@p3.edu";

beforeEach(async () => {
  await assertTestDatabase();
  await truncateAll();
  const { db } = await seedClubWorkspace();
  await db.tenant.update({ where: { id: p3.tenant }, data: { domain: "p3.edu" } });
  await db.tenant.update({ where: { id: p3.otherTenant }, data: { domain: "other.edu" } });
  await db.user.createMany({
    data: [
      { id: STUDENT.id, email: STUDENT.email, firstName: "Asha", lastName: "Iyer" },
      { id: DRIFTER.id, email: DRIFTER.email, firstName: "Zed", lastName: null },
    ],
  });
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

async function startPending(name = "Chess Circle", user = STUDENT) {
  const result = await requestClub(user, { name, facultyEmail: PROF });
  if (result.status !== "PENDING" || !result.demoCode) throw new Error("expected a pending club with a demo code");
  return { clubId: result.clubId, code: result.demoCode };
}

const wrongCode = (code: string) => (code === "000000" ? "111111" : "000000");

describe("starting a club", () => {
  it("creates a PENDING club in the college matched from the email, with the student as President", async () => {
    const result = await requestClub(STUDENT, { name: "Chess Circle", facultyEmail: PROF, facultyName: "Dr Rao" });
    expect(result.status).toBe("PENDING");

    const db = testDb();
    const club = await db.club.findUniqueOrThrow({
      where: { id: result.clubId },
      include: { members: true, verification: true },
    });
    expect(club).toMatchObject({ tenantId: p3.tenant, status: "PENDING", facultyEmail: PROF, verifiedAt: null });
    expect(club.members).toEqual([expect.objectContaining({ userId: STUDENT.id, role: "PRESIDENT" })]);

    // Only a hash is the real record; the code itself is never in it.
    const code = result.status === "PENDING" ? result.demoCode : null;
    expect(code).toMatch(/^\d{6}$/);
    expect(club.verification?.codeHash).not.toContain(code);
    expect(club.verification).toMatchObject({ attempts: 0, consumedAt: null, email: PROF });

    // Not in the college until the professor confirms.
    expect(await db.tenantMember.count({ where: { userId: STUDENT.id } })).toBe(0);
  });

  it("refuses a different college when the email already belongs to one", async () => {
    const error = await expectApiError(
      requestClub(STUDENT, { name: "Chess", facultyEmail: PROF, tenantId: p3.otherTenant }),
    );
    expect(error.status).toBe(422);
    expect(error.message).toContain("Phase Three College");
  });

  it("asks a student with an unmatched email to pick, then accepts any college", async () => {
    const context = await loadStartClubContext(DRIFTER);
    expect(context.matchedCollege).toBeNull();
    expect(context.colleges.map((college) => college.id).sort()).toEqual([p3.otherTenant, p3.tenant].sort());

    expect((await expectApiError(requestClub(DRIFTER, { name: "Chess", facultyEmail: PROF }))).status).toBe(422);
    const result = await requestClub(DRIFTER, { name: "Chess", facultyEmail: PROF, tenantId: p3.otherTenant });
    expect(result.status).toBe("PENDING");
  });

  it("lets a college Owner create a live club in their own college with no professor", async () => {
    const result = await requestClub(OWNER, { name: "Film Society", tenantId: p3.tenant });
    expect(result.status).toBe("ACTIVE");
    const club = await testDb().club.findUniqueOrThrow({ where: { id: result.clubId }, include: { verification: true } });
    expect(club.status).toBe("ACTIVE");
    expect(club.verification).toBeNull();
  });

  it("insists on a professor's email, and not the student's own", async () => {
    const missing = await expectApiError(requestClub(STUDENT, { name: "Chess" }));
    expect(missing.status).toBe(422);
    expect(missing.details).toHaveProperty("facultyEmail");

    const own = await expectApiError(requestClub(STUDENT, { name: "Chess", facultyEmail: STUDENT.email }));
    expect(own.status).toBe(422);
    expect(own.message).toContain("not your own");
  });

  it("allows two clubs waiting at once, not three — even when all three are sent together", async () => {
    const results = await Promise.allSettled([
      requestClub(STUDENT, { name: "One", facultyEmail: PROF }),
      requestClub(STUDENT, { name: "Two", facultyEmail: PROF }),
      requestClub(STUDENT, { name: "Three", facultyEmail: PROF }),
    ]);
    expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(2);
    const rejected = results.find((result) => result.status === "rejected");
    expect(rejected && (rejected.reason as ApiError).status).toBe(409);
    expect((await loadStartClubContext(STUDENT)).pendingCount).toBe(2);
  });
});

describe("a pending club is locked", () => {
  it("is invisible to everyone but the student and the college's admins", async () => {
    const { clubId } = await startPending();

    expect(await getPublicClubProfile(clubId)).toBeNull();
    expect((await listClubs(p3.tenant, p3.owner)).map((club) => club.id)).not.toContain(clubId);
    expect(await getPendingClubView(clubId, p3.member)).toBeNull();
    expect(await getPendingClubView(clubId, p3.outsider)).toBeNull();

    const own = await getPendingClubView(clubId, STUDENT.id);
    expect(own?.viewer).toBe("requester");
    expect(own?.code?.demoCode).toMatch(/^\d{6}$/);

    // The admin sees the request but never the code.
    const admin = await getPendingClubView(clubId, p3.owner);
    expect(admin?.viewer).toBe("admin");
    expect(admin?.code?.demoCode).toBeNull();
    expect(admin?.requester?.email).toBe(STUDENT.email);
  });

  it("shows on the student's dashboard as pending, and in the admin's request list", async () => {
    const { clubId } = await startPending();
    const overview = await loadMemberOverview(STUDENT.id);
    expect(overview.clubRoles).toEqual([
      expect.objectContaining({ role: "PRESIDENT", club: expect.objectContaining({ id: clubId, status: "PENDING" }) }),
    ]);

    expect((await listPendingRequestsForAdmin(p3.owner)).map((row) => row.id)).toEqual([clubId]);
    expect(await listPendingRequestsForAdmin(p3.president)).toEqual([]);
    expect(await listPendingRequestsForAdmin(p3.outsider)).toEqual([]);
  });
});

describe("entering the professor's code", () => {
  it("makes the club live and puts the student in the college", async () => {
    const { clubId, code } = await startPending();
    await expect(verifyClubCode(clubId, STUDENT.id, code)).resolves.toEqual({ clubId, name: "Chess Circle" });

    const db = testDb();
    const club = await db.club.findUniqueOrThrow({ where: { id: clubId }, include: { verification: true } });
    expect(club.status).toBe("ACTIVE");
    expect(club.verifiedAt).toBeInstanceOf(Date);
    expect(club.verification).toMatchObject({ demoCode: null });
    expect(club.verification?.consumedAt).toBeInstanceOf(Date);
    expect(await db.tenantMember.findFirst({ where: { userId: STUDENT.id, tenantId: p3.tenant } })).toMatchObject({
      role: "MEMBER",
    });
    expect(await getPublicClubProfile(clubId)).not.toBeNull();

    // Once live it is no longer a request: the code page is gone.
    expect((await expectApiError(verifyClubCode(clubId, STUDENT.id, code))).status).toBe(404);
  });

  it("counts wrong tries and kills the code after five", async () => {
    const { clubId, code } = await startPending();
    const bad = wrongCode(code);

    const first = await expectApiError(verifyClubCode(clubId, STUDENT.id, bad));
    expect(first.status).toBe(422);
    expect(first.message).toContain("4 tries left");

    for (let i = 0; i < 3; i += 1) await expectApiError(verifyClubCode(clubId, STUDENT.id, bad));
    const last = await expectApiError(verifyClubCode(clubId, STUDENT.id, bad));
    expect(last.message).toContain("last try");

    // Even the right code no longer works.
    const dead = await expectApiError(verifyClubCode(clubId, STUDENT.id, code));
    expect(dead.message).toContain("no longer works");
    expect((await testDb().club.findUniqueOrThrow({ where: { id: clubId } })).status).toBe("PENDING");
  });

  it("gives exactly five tries even to guesses fired all at once", async () => {
    const { clubId, code } = await startPending();
    const bad = wrongCode(code);
    await Promise.allSettled(Array.from({ length: 12 }, () => verifyClubCode(clubId, STUDENT.id, bad)));
    const row = await testDb().clubVerification.findUniqueOrThrow({ where: { clubId } });
    expect(row.attempts).toBe(5);
  });

  it("refuses an expired code", async () => {
    const { clubId, code } = await startPending();
    await testDb().clubVerification.update({ where: { clubId }, data: { expiresAt: new Date(Date.now() - 1000) } });
    const error = await expectApiError(verifyClubCode(clubId, STUDENT.id, code));
    expect(error.status).toBe(422);
    expect(error.message).toContain("expired");
  });

  it("is only for the student who asked: admins get 403, everyone else 404", async () => {
    const { clubId, code } = await startPending();
    expect((await expectApiError(verifyClubCode(clubId, p3.owner, code))).status).toBe(403);
    expect((await expectApiError(verifyClubCode(clubId, p3.member, code))).status).toBe(404);
    expect((await expectApiError(verifyClubCode(clubId, p3.outsider, code))).status).toBe(404);
  });
});

describe("sending a new code", () => {
  it("waits 30 seconds between sends, then replaces the old code and resets the tries", async () => {
    const { clubId, code: oldCode } = await startPending();
    await expectApiError(verifyClubCode(clubId, STUDENT.id, wrongCode(oldCode)));

    const tooSoon = await expectApiError(resendClubCode(clubId, STUDENT.id));
    expect(tooSoon.status).toBe(429);

    await testDb().clubVerification.update({ where: { clubId }, data: { lastSentAt: new Date(Date.now() - 31_000) } });
    const fresh = await resendClubCode(clubId, STUDENT.id);
    expect(fresh.demoCode).toMatch(/^\d{6}$/);
    expect((await testDb().clubVerification.findUniqueOrThrow({ where: { clubId } })).attempts).toBe(0);

    if (fresh.demoCode !== oldCode) {
      expect((await expectApiError(verifyClubCode(clubId, STUDENT.id, oldCode))).status).toBe(422);
    }
    await verifyClubCode(clubId, STUDENT.id, fresh.demoCode!);
  });

  it("is refused to admins", async () => {
    const { clubId } = await startPending();
    expect((await expectApiError(resendClubCode(clubId, p3.owner))).status).toBe(403);
  });
});

describe("cancelling", () => {
  it("lets the student cancel, which frees a pending slot", async () => {
    const first = await startPending("One");
    await startPending("Two");
    await expect(cancelClubRequest(first.clubId, STUDENT.id)).resolves.toEqual({ removedBy: "requester" });

    const club = await testDb().club.findUniqueOrThrow({ where: { id: first.clubId }, include: { verification: true } });
    expect(club.deletedAt).toBeInstanceOf(Date);
    expect(club.verification).toBeNull();
    expect((await loadStartClubContext(STUDENT)).pendingCount).toBe(1);
    expect(await getPendingClubView(first.clubId, STUDENT.id)).toBeNull();
  });

  it("lets a college admin remove a request, and nobody else", async () => {
    const { clubId } = await startPending();
    expect((await expectApiError(cancelClubRequest(clubId, p3.member))).status).toBe(404);
    expect((await expectApiError(cancelClubRequest(clubId, p3.president))).status).toBe(404);
    await expect(cancelClubRequest(clubId, p3.owner)).resolves.toEqual({ removedBy: "admin" });
    expect((await expectApiError(cancelClubRequest(clubId, p3.owner))).status).toBe(404);
  });
});

describe("existing clubs", () => {
  it("are untouched: clubs made before Phase 12 are ACTIVE", async () => {
    expect((await testDb().club.findUniqueOrThrow({ where: { id: p3.club } })).status).toBe("ACTIVE");
  });

  it("cannot be PENDING without a professor's email (database rule)", async () => {
    await expect(
      testDb().club.create({ data: { tenantId: p3.tenant, name: "Bad", slug: "bad", status: "PENDING" } }),
    ).rejects.toThrow();
  });
});
