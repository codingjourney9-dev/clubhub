import "server-only";

import { ApiError } from "@/lib/api/response";
import { db } from "@/lib/db/client";
import { findAvailableSlug } from "@/lib/slug";
import type { CreateClubInput, UpdateClubInput } from "@/lib/validation/club";
import { Prisma } from "@/generated/prisma/client";
import type { ClubRole } from "@/generated/prisma/enums";

/**
 * Club lifecycle within a tenant.
 *
 * All reads and writes here are tenant-scoped: callers pass a `tenantId` that has
 * already been authorised by `requireTenantAccess`, and every query filters on
 * it, so a club id from another college simply does not match.
 */

export async function createClub(tenantId: string, founderId: string, input: CreateClubInput) {
  const slug = await findAvailableSlug(input.name, async (candidate) => {
    const existing = await db.club.findFirst({
      where: { tenantId, slug: candidate },
      select: { id: true },
    });
    return existing !== null;
  });

  try {
    return await db.$transaction(async (tx) => {
      const club = await tx.club.create({
        data: {
          tenantId,
          name: input.name,
          slug,
          description: input.description ?? null,
          category: input.category ?? null,
        },
        select: { id: true, name: true, slug: true, description: true, category: true },
      });

      // A club with no President could never create events or invite anyone, so
      // the founder is enrolled as President. College admins who found clubs
      // therefore gain club authority — deliberate, and visible in the UI.
      await tx.clubMember.create({
        data: { clubId: club.id, userId: founderId, role: "PRESIDENT" },
      });

      return club;
    });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      throw new ApiError("CONFLICT", "A club with that name already exists in this college.");
    }
    throw error;
  }
}

/** Clubs in a tenant, with the viewer's own role attached. */
export async function listClubs(tenantId: string, viewerId: string) {
  const clubs = await db.club.findMany({
    where: { tenantId, deletedAt: null },
    orderBy: { name: "asc" },
    select: {
      id: true,
      name: true,
      slug: true,
      description: true,
      category: true,
      logoUrl: true,
      createdAt: true,
      _count: {
        select: {
          members: { where: { deletedAt: null } },
          events: { where: { deletedAt: null } },
        },
      },
      members: {
        where: { userId: viewerId, deletedAt: null },
        select: { role: true },
      },
    },
  });

  return clubs.map(({ members, ...club }) => ({
    ...club,
    memberCount: club._count.members,
    eventCount: club._count.events,
    viewerRole: (members[0]?.role ?? null) satisfies ClubRole | null,
  }));
}

export async function getClubById(clubId: string, tenantId: string) {
  const club = await db.club.findFirst({
    where: { id: clubId, tenantId, deletedAt: null },
    select: {
      id: true,
      tenantId: true,
      name: true,
      slug: true,
      description: true,
      category: true,
      logoUrl: true,
      createdAt: true,
    },
  });

  if (!club) throw ApiError.notFound("That club was not found.");
  return club;
}

export async function updateClub(clubId: string, tenantId: string, input: UpdateClubInput) {
  await getClubById(clubId, tenantId);

  return db.club.update({
    where: { id: clubId },
    data: {
      ...(input.name === undefined ? {} : { name: input.name }),
      ...(input.description === undefined ? {} : { description: input.description }),
      ...(input.category === undefined ? {} : { category: input.category }),
      ...(input.logoUrl === undefined ? {} : { logoUrl: input.logoUrl }),
    },
    select: { id: true, name: true, slug: true, description: true, category: true, logoUrl: true },
  });
}

/**
 * Soft-deletes a club (docs/architecture.md §5.5).
 *
 * Refused while the club still has PUBLISHED, not-yet-finished events: removing
 * a club that students can currently see would orphan those events and their
 * registrations. Cancel the events first — that is an explicit, communicating act.
 */
export async function softDeleteClub(clubId: string, tenantId: string) {
  await getClubById(clubId, tenantId);

  const blockingEvents = await db.event.count({
    where: {
      clubId,
      deletedAt: null,
      status: "PUBLISHED",
      endTime: { gte: new Date() },
    },
  });

  if (blockingEvents > 0) {
    throw new ApiError(
      "CONFLICT",
      `This club still has ${blockingEvents} published event(s). Cancel them first — deleting now would ` +
        "hide events that students have already seen.",
    );
  }

  await db.club.update({ where: { id: clubId }, data: { deletedAt: new Date() } });
  return { id: clubId, deletedAt: new Date().toISOString() };
}

export async function listClubMembers(clubId: string, tenantId: string) {
  await getClubById(clubId, tenantId);

  const members = await db.clubMember.findMany({
    where: { clubId, deletedAt: null },
    orderBy: [{ role: "asc" }, { joinedAt: "asc" }],
    select: {
      id: true,
      role: true,
      joinedAt: true,
      user: {
        select: { id: true, email: true, firstName: true, lastName: true, avatarUrl: true },
      },
    },
  });

  return members.map((member) => ({
    membershipId: member.id,
    role: member.role,
    joinedAt: member.joinedAt,
    user: {
      ...member.user,
      displayName:
        [member.user.firstName, member.user.lastName].filter(Boolean).join(" ") || member.user.email,
    },
  }));
}

/** How many active Presidents a club has — used to protect the last one. */
async function countPresidents(clubId: string): Promise<number> {
  return db.clubMember.count({ where: { clubId, role: "PRESIDENT", deletedAt: null } });
}

/**
 * Changes a member's role.
 *
 * Guards the "last President" hole: demoting or removing the only President
 * would leave a club nobody can administer, so it is refused with a clear reason.
 */
export async function updateClubMemberRole(
  clubId: string,
  tenantId: string,
  targetUserId: string,
  role: ClubRole,
) {
  await getClubById(clubId, tenantId);

  const membership = await db.clubMember.findFirst({
    where: { clubId, userId: targetUserId, deletedAt: null },
    select: { id: true, role: true },
  });

  if (!membership) throw ApiError.notFound("That person is not a member of this club.");

  if (membership.role === "PRESIDENT" && role !== "PRESIDENT") {
    const presidents = await countPresidents(clubId);
    if (presidents <= 1) {
      throw new ApiError(
        "CONFLICT",
        "This is the club's only President. Promote someone else to President first, then change this role.",
      );
    }
  }

  return db.clubMember.update({
    where: { id: membership.id },
    data: { role },
    select: { id: true, role: true },
  });
}

/** Soft-removes a member, preserving the historical row (docs/architecture.md §5.5). */
export async function removeClubMember(clubId: string, tenantId: string, targetUserId: string) {
  await getClubById(clubId, tenantId);

  const membership = await db.clubMember.findFirst({
    where: { clubId, userId: targetUserId, deletedAt: null },
    select: { id: true, role: true },
  });

  if (!membership) throw ApiError.notFound("That person is not a member of this club.");

  if (membership.role === "PRESIDENT") {
    const presidents = await countPresidents(clubId);
    if (presidents <= 1) {
      throw new ApiError(
        "CONFLICT",
        "This is the club's only President. Promote someone else to President before removing them.",
      );
    }
  }

  await db.clubMember.update({ where: { id: membership.id }, data: { deletedAt: new Date() } });
  return { userId: targetUserId, removed: true };
}
