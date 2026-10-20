import { beforeEach, describe, expect, it } from "vitest";

import { ApiError } from "../../src/lib/api/response";
import {
  createAnnouncement,
  deleteAnnouncement,
  listAnnouncementsForMember,
  listClubAnnouncements,
  setAnnouncementPinned,
  updateAnnouncement,
} from "../../src/lib/services/announcement-service";
import { removeClubMember } from "../../src/lib/services/club-service";
import { assertTestDatabase, testDb, truncateAll } from "../helpers/db";
import { p3, seedClubWorkspace } from "../helpers/phase3";

/**
 * Club announcements (Phase 10). The per-announcement rules live in the
 * service, so they are tested here against a real database — including the
 * "only one pinned per club" index and the length CHECKs.
 */

const LEAD = "33333333-3333-4333-8333-0000000000a1";
const LEAD_2 = "33333333-3333-4333-8333-0000000000a2";
const asPresident = { userId: p3.president, tenantRole: "MEMBER", clubRole: "PRESIDENT" } as const;
const asLead = { userId: LEAD, tenantRole: "MEMBER", clubRole: "EVENT_MANAGER" } as const;
const asLead2 = { userId: LEAD_2, tenantRole: "MEMBER", clubRole: "EVENT_MANAGER" } as const;

beforeEach(async () => {
  await assertTestDatabase();
  await truncateAll();
  await seedClubWorkspace();
  for (const [id, email] of [
    [LEAD, "lead@test.dev"],
    [LEAD_2, "lead2@test.dev"],
  ] as const) {
    await testDb().user.create({ data: { id, email, firstName: "Lia", lastName: "Lead" } });
    await testDb().tenantMember.create({ data: { tenantId: p3.tenant, userId: id, role: "MEMBER" } });
    await testDb().clubMember.create({ data: { clubId: p3.club, userId: id, role: "EVENT_MANAGER" } });
  }
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

const post = (authorId: string, title: string, pinned = false) =>
  createAnnouncement({
    clubId: p3.club,
    tenantId: p3.tenant,
    authorId,
    input: { title, body: `Body of ${title}`, pinned },
  });

describe("posting and listing", () => {
  it("lists the pinned announcement first, then newest first, with the author's current role", async () => {
    const first = await post(LEAD, "First");
    await post(p3.president, "Second");
    await setAnnouncementPinned({ clubId: p3.club, tenantId: p3.tenant, announcementId: first.id, pinned: true });
    await post(LEAD, "Third");

    const list = await listClubAnnouncements(p3.club, p3.tenant);
    expect(list.map((item) => item.title)).toEqual(["First", "Third", "Second"]);
    expect(list[0]?.pinned).toBe(true);
    expect(list[0]?.author).toMatchObject({ displayName: "Lia Lead", role: "EVENT_MANAGER" });
  });

  it("never shows one college's announcements to another", async () => {
    await post(LEAD, "Robotics only");
    expect(await listClubAnnouncements(p3.club, p3.otherTenant)).toEqual([]);
  });
});

describe("pinning", () => {
  it("keeps at most one pinned per club — pinning another replaces it", async () => {
    const a = await post(LEAD, "A", true);
    const b = await post(LEAD_2, "B", true);
    const list = await listClubAnnouncements(p3.club, p3.tenant);
    expect(list.filter((item) => item.pinned).map((item) => item.id)).toEqual([b.id]);

    await setAnnouncementPinned({ clubId: p3.club, tenantId: p3.tenant, announcementId: a.id, pinned: true });
    const after = await listClubAnnouncements(p3.club, p3.tenant);
    expect(after.filter((item) => item.pinned).map((item) => item.id)).toEqual([a.id]);
  });

  it("stays at one pin when two people pin different posts at the same moment", async () => {
    const posts = await Promise.all(["A", "B", "C", "D"].map((title) => post(LEAD, title)));
    await Promise.all(
      posts.map((item) =>
        setAnnouncementPinned({ clubId: p3.club, tenantId: p3.tenant, announcementId: item.id, pinned: true }),
      ),
    );
    const pinned = await testDb().announcement.count({
      where: { clubId: p3.club, pinnedAt: { not: null }, deletedAt: null },
    });
    expect(pinned).toBe(1);
  });

  it("is enforced by the database too", async () => {
    await post(LEAD, "A", true);
    await expect(
      testDb().announcement.create({
        data: {
          tenantId: p3.tenant,
          clubId: p3.club,
          authorId: LEAD,
          title: "Sneaky",
          body: "Second pin",
          pinnedAt: new Date(),
        },
      }),
    ).rejects.toThrow();
  });
});

describe("editing and deleting", () => {
  it("lets only the author edit, and marks it edited", async () => {
    const item = await post(LEAD, "Original");

    const forbidden = await expectApiError(
      updateAnnouncement({
        clubId: p3.club,
        tenantId: p3.tenant,
        actor: asPresident,
        announcementId: item.id,
        input: { title: "Hijacked" },
      }),
    );
    expect(forbidden.status).toBe(403);

    const edited = await updateAnnouncement({
      clubId: p3.club,
      tenantId: p3.tenant,
      actor: asLead,
      announcementId: item.id,
      input: { body: "Fixed a typo" },
    });
    expect(edited).toMatchObject({ title: "Original", body: "Fixed a typo" });
    expect(edited.editedAt).not.toBeNull();
  });

  it("lets the author or the President delete — not another Lead", async () => {
    const mine = await post(LEAD, "Mine", true);
    const args = { clubId: p3.club, tenantId: p3.tenant, announcementId: mine.id };

    expect((await expectApiError(deleteAnnouncement({ ...args, actor: asLead2 }))).status).toBe(403);
    await expect(deleteAnnouncement({ ...args, actor: asPresident })).resolves.toEqual({
      id: mine.id,
      deleted: true,
    });

    // Gone for everyone, the row kept (soft delete), and the pin slot freed.
    expect(await listClubAnnouncements(p3.club, p3.tenant)).toEqual([]);
    const row = await testDb().announcement.findUniqueOrThrow({ where: { id: mine.id } });
    expect(row.deletedAt).not.toBeNull();
    expect(row.pinnedAt).toBeNull();
    await expect(post(LEAD_2, "New pin", true)).resolves.toMatchObject({ pinned: true });
  });

  it("404s for an announcement in another club or college", async () => {
    const item = await post(LEAD, "Here");
    const error = await expectApiError(
      deleteAnnouncement({ clubId: p3.club, tenantId: p3.otherTenant, actor: asLead, announcementId: item.id }),
    );
    expect(error.status).toBe(404);
  });
});

describe("the dashboard feed", () => {
  it("shows a member their clubs' announcements — and stops the moment they are removed", async () => {
    await post(LEAD, "For members");
    const before = await listAnnouncementsForMember(p3.member);
    expect(before.map((item) => item.title)).toEqual(["For members"]);
    expect(before[0]).toMatchObject({ clubName: "Robotics Club", timeZone: "Asia/Kolkata" });

    await removeClubMember(p3.club, p3.tenant, asLead, p3.member);
    expect(await listAnnouncementsForMember(p3.member)).toEqual([]);
  });

  it("shows nothing to someone in no club", async () => {
    await post(LEAD, "For members");
    expect(await listAnnouncementsForMember(p3.owner)).toEqual([]);
    expect(await listAnnouncementsForMember(p3.outsider)).toEqual([]);
  });
});

describe("database limits", () => {
  it("refuses a blank title even if the app's validation were bypassed", async () => {
    await expect(
      testDb().announcement.create({
        data: { tenantId: p3.tenant, clubId: p3.club, authorId: LEAD, title: "   ", body: "x" },
      }),
    ).rejects.toThrow();
  });

  it("refuses an announcement whose club belongs to a different college", async () => {
    await expect(
      testDb().announcement.create({
        data: { tenantId: p3.otherTenant, clubId: p3.club, authorId: LEAD, title: "x", body: "x" },
      }),
    ).rejects.toThrow();
  });
});
