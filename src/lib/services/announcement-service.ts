import "server-only";

import { ApiError } from "@/lib/api/response";
import { canClub, type Actor } from "@/lib/auth/rbac";
import { db } from "@/lib/db/client";
import type { ClubRole } from "@/generated/prisma/enums";
import { Prisma } from "@/generated/prisma/client";
import type {
  CreateAnnouncementInput,
  UpdateAnnouncementInput,
} from "@/lib/validation/announcement";

/**
 * Club announcements (Phase 10): members-only notes from a club's Leads and
 * President. Callers authorise the CLUB-level action (`announcement:read` /
 * `announcement:post`) with `requireClubAccess`; this file adds the
 * per-announcement rules (only the author edits; author or President deletes).
 */

type ClubActor = Actor & { readonly userId: string };

/** What every screen needs about one announcement. Dates are ISO strings so it can cross into client components. */
export interface AnnouncementView {
  readonly id: string;
  readonly clubId: string;
  readonly title: string;
  readonly body: string;
  readonly pinned: boolean;
  readonly createdAt: string;
  readonly editedAt: string | null;
  readonly author: {
    readonly id: string;
    readonly displayName: string;
    /** Their CURRENT role in the club, or null if they have since left. */
    readonly role: ClubRole | null;
  };
}

const LIST_LIMIT = 30;

function selectView(clubId: string) {
  return {
    id: true,
    clubId: true,
    title: true,
    body: true,
    pinnedAt: true,
    createdAt: true,
    editedAt: true,
    author: {
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        clubMemberships: { where: { clubId, deletedAt: null }, select: { role: true }, take: 1 },
      },
    },
  } satisfies Prisma.AnnouncementSelect;
}

type Row = Prisma.AnnouncementGetPayload<{ select: ReturnType<typeof selectView> }>;

function toView(row: Row): AnnouncementView {
  const { author } = row;
  return {
    id: row.id,
    clubId: row.clubId,
    title: row.title,
    body: row.body,
    pinned: row.pinnedAt !== null,
    createdAt: row.createdAt.toISOString(),
    editedAt: row.editedAt?.toISOString() ?? null,
    author: {
      id: author.id,
      displayName: [author.firstName, author.lastName].filter(Boolean).join(" ") || author.email,
      role: author.clubMemberships[0]?.role ?? null,
    },
  };
}

/** The pinned one first, then newest first. */
export async function listClubAnnouncements(
  clubId: string,
  tenantId: string,
  limit = LIST_LIMIT,
): Promise<AnnouncementView[]> {
  const rows = await db.announcement.findMany({
    where: { clubId, tenantId, deletedAt: null },
    orderBy: [{ pinnedAt: { sort: "desc", nulls: "last" } }, { createdAt: "desc" }],
    take: limit,
    select: selectView(clubId),
  });
  return rows.map(toView);
}

export interface DashboardAnnouncement extends AnnouncementView {
  readonly clubName: string;
  /** The club's college timezone, for rendering the time. */
  readonly timeZone: string;
}

/**
 * The latest announcements from every club this person is an active member
 * of — for their dashboard. Leaving a club hides its announcements at once.
 */
export async function listAnnouncementsForMember(
  userId: string,
  limit = 5,
): Promise<DashboardAnnouncement[]> {
  const rows = await db.announcement.findMany({
    where: {
      deletedAt: null,
      club: {
        deletedAt: null,
        tenant: { deletedAt: null },
        members: { some: { userId, deletedAt: null } },
      },
    },
    orderBy: { createdAt: "desc" },
    take: limit,
    select: {
      id: true,
      clubId: true,
      title: true,
      body: true,
      pinnedAt: true,
      createdAt: true,
      editedAt: true,
      club: { select: { name: true, tenant: { select: { timezone: true } } } },
      author: { select: { id: true, email: true, firstName: true, lastName: true } },
    },
  });

  return rows.map((row) => ({
    id: row.id,
    clubId: row.clubId,
    clubName: row.club.name,
    timeZone: row.club.tenant.timezone,
    title: row.title,
    body: row.body,
    pinned: row.pinnedAt !== null,
    createdAt: row.createdAt.toISOString(),
    editedAt: row.editedAt?.toISOString() ?? null,
    author: {
      id: row.author.id,
      displayName:
        [row.author.firstName, row.author.lastName].filter(Boolean).join(" ") || row.author.email,
      role: null,
    },
  }));
}

/** One club's pin at a time: clear whatever is pinned, inside the caller's transaction. */
async function clearPin(tx: Prisma.TransactionClient, clubId: string, exceptId?: string) {
  await tx.announcement.updateMany({
    where: { clubId, pinnedAt: { not: null }, ...(exceptId ? { id: { not: exceptId } } : {}) },
    data: { pinnedAt: null },
  });
}

/** Takes the club row lock, so two people pinning at once queue instead of colliding. */
async function lockClub(tx: Prisma.TransactionClient, clubId: string) {
  await tx.$queryRaw`SELECT id FROM "clubs" WHERE id = ${clubId}::uuid FOR UPDATE`;
}

export async function createAnnouncement(args: {
  readonly clubId: string;
  readonly tenantId: string;
  readonly authorId: string;
  readonly input: CreateAnnouncementInput;
}): Promise<AnnouncementView> {
  const { clubId, tenantId, authorId, input } = args;

  const row = await db.$transaction(async (tx) => {
    if (input.pinned) {
      await lockClub(tx, clubId);
      await clearPin(tx, clubId);
    }
    return tx.announcement.create({
      data: {
        tenantId,
        clubId,
        authorId,
        title: input.title,
        body: input.body,
        pinnedAt: input.pinned ? new Date() : null,
      },
      select: selectView(clubId),
    });
  });
  return toView(row);
}

async function findLive(clubId: string, tenantId: string, announcementId: string) {
  const row = await db.announcement.findFirst({
    where: { id: announcementId, clubId, tenantId, deletedAt: null },
    select: { id: true, authorId: true },
  });
  if (!row) throw ApiError.notFound("That announcement was not found.");
  return row;
}

/** Only the person who wrote it may change the words. */
export async function updateAnnouncement(args: {
  readonly clubId: string;
  readonly tenantId: string;
  readonly actor: ClubActor;
  readonly announcementId: string;
  readonly input: UpdateAnnouncementInput;
}): Promise<AnnouncementView> {
  const { clubId, tenantId, actor, announcementId, input } = args;
  const existing = await findLive(clubId, tenantId, announcementId);

  if (existing.authorId !== actor.userId) {
    throw ApiError.forbidden("Only the person who posted this announcement can edit it.");
  }

  const row = await db.announcement.update({
    where: { id: existing.id },
    data: {
      ...(input.title !== undefined ? { title: input.title } : {}),
      ...(input.body !== undefined ? { body: input.body } : {}),
      editedAt: new Date(),
    },
    select: selectView(clubId),
  });
  return toView(row);
}

/** The author can take their own post down; the President (or a college admin) can take any down. */
export function canDeleteAnnouncement(actor: ClubActor, authorId: string): boolean {
  return authorId === actor.userId || canClub(actor, "announcement:moderate");
}

export async function deleteAnnouncement(args: {
  readonly clubId: string;
  readonly tenantId: string;
  readonly actor: ClubActor;
  readonly announcementId: string;
}): Promise<{ id: string; deleted: true }> {
  const { clubId, tenantId, actor, announcementId } = args;
  const existing = await findLive(clubId, tenantId, announcementId);

  if (!canDeleteAnnouncement(actor, existing.authorId)) {
    throw ApiError.forbidden("Only the author or the club's President can delete this announcement.");
  }

  // Soft delete, and drop the pin so the slot is free for another.
  await db.announcement.update({
    where: { id: existing.id },
    data: { deletedAt: new Date(), pinnedAt: null },
  });
  return { id: existing.id, deleted: true };
}

/** Pin to the top (replacing the current pin) or unpin. Any Lead or the President. */
export async function setAnnouncementPinned(args: {
  readonly clubId: string;
  readonly tenantId: string;
  readonly announcementId: string;
  readonly pinned: boolean;
}): Promise<AnnouncementView> {
  const { clubId, tenantId, announcementId, pinned } = args;
  const existing = await findLive(clubId, tenantId, announcementId);

  const row = await db.$transaction(async (tx) => {
    await lockClub(tx, clubId);
    if (pinned) await clearPin(tx, clubId, existing.id);
    return tx.announcement.update({
      where: { id: existing.id },
      data: { pinnedAt: pinned ? new Date() : null },
      select: selectView(clubId),
    });
  });
  return toView(row);
}
