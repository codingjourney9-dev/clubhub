import "server-only";

import { ApiError } from "@/lib/api/response";
import { db } from "@/lib/db/client";
import { findAvailableSlug } from "@/lib/slug";
import type {
  CreateClubInput,
  TransferPresidencyInput,
  UpdateClubInput,
} from "@/lib/validation/club";
import { canChangeClubRole, canRemoveClubMember, type Actor } from "@/lib/auth/rbac";
import type { PromotableClubRole } from "@/lib/domain/club-roles";
import { cancelTicket } from "@/lib/services/ticket-service";
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
    where: { tenantId, deletedAt: null, status: "ACTIVE" },
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
    where: { id: clubId, tenantId, deletedAt: null, status: "ACTIVE" },
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

type ClubActor = Actor & { readonly userId: string };
type Tx = Prisma.TransactionClient;

/**
 * Serialises every change to who-holds-which-role in one club. Role changes,
 * removals and hand-overs all take this lock first, so two of them can never
 * interleave (e.g. a President demoting a Lead while handing the club to them).
 */
async function lockClub(tx: Tx, clubId: string, tenantId: string): Promise<void> {
  const rows = await tx.$queryRaw<{ id: string }[]>`
    SELECT id FROM "clubs"
    WHERE id = ${clubId}::uuid AND tenant_id = ${tenantId}::uuid AND deleted_at IS NULL
    FOR UPDATE
  `;
  if (rows.length === 0) throw ApiError.notFound("That club was not found.");
}

async function findActiveMembership(tx: Tx, clubId: string, userId: string) {
  return tx.clubMember.findFirst({
    where: { clubId, userId, deletedAt: null },
    select: { id: true, role: true },
  });
}

/**
 * Moves someone between Member and Lead. President only (or a college admin).
 *
 * The President's own role never changes here — that's what handing over is
 * for — so a club can't end up without one by accident.
 */
export async function updateClubMemberRole(
  clubId: string,
  tenantId: string,
  actor: ClubActor,
  targetUserId: string,
  role: PromotableClubRole,
) {
  return db.$transaction(async (tx) => {
    await lockClub(tx, clubId, tenantId);
    const membership = await findActiveMembership(tx, clubId, targetUserId);
    if (!membership) throw ApiError.notFound("That person is not a member of this club.");

    if (membership.role === "PRESIDENT") {
      throw new ApiError(
        "CONFLICT",
        "The President's role can't be changed directly. Use \"Hand over presidency\" to pass the club to someone else.",
      );
    }
    if (targetUserId === actor.userId) {
      throw ApiError.forbidden("You can't change your own role.");
    }
    if (!canChangeClubRole(actor, { userId: targetUserId, role: membership.role }, role)) {
      throw ApiError.forbidden("Only the club's President can promote or demote Leads.");
    }

    return tx.clubMember.update({
      where: { id: membership.id },
      data: { role },
      select: { id: true, role: true },
    });
  });
}

export interface RemoveMemberResult {
  readonly userId: string;
  readonly removed: true;
  /** Upcoming members-only tickets that were given back (public ones are kept). */
  readonly cancelledTickets: number;
  /** People who moved off a waitlist because of those freed seats. */
  readonly promotedFromWaitlist: number;
}

/**
 * Removes someone from the club (soft delete — the history row stays).
 *
 * Tiered: Leads remove Members; only the President removes Leads; nobody
 * removes the President (hand over first).
 *
 * Their seats at the club's upcoming MEMBERS-ONLY events go back — they're no
 * longer eligible — and anyone waiting moves up. Seats at public events stay:
 * anyone may attend those.
 */
export async function removeClubMember(
  clubId: string,
  tenantId: string,
  actor: ClubActor,
  targetUserId: string,
): Promise<RemoveMemberResult> {
  await db.$transaction(async (tx) => {
    await lockClub(tx, clubId, tenantId);
    const membership = await findActiveMembership(tx, clubId, targetUserId);
    if (!membership) throw ApiError.notFound("That person is not a member of this club.");

    if (membership.role === "PRESIDENT") {
      throw new ApiError(
        "CONFLICT",
        "The President can't be removed. They need to hand over the presidency first.",
      );
    }
    if (targetUserId === actor.userId) {
      throw ApiError.forbidden("You can't remove yourself here.");
    }
    if (!canRemoveClubMember(actor, { userId: targetUserId, role: membership.role })) {
      throw ApiError.forbidden(
        membership.role === "EVENT_MANAGER"
          ? "Only the club's President can remove a Lead."
          : "Your role can't remove members.",
      );
    }

    await tx.clubMember.update({ where: { id: membership.id }, data: { deletedAt: new Date() } });
  });

  // The membership is gone first, so they can't grab a members-only seat again
  // in between. Each ticket then goes through the normal cancel path, which
  // locks its event and promotes the waitlist exactly like a self-cancel.
  const tickets = await db.ticket.findMany({
    where: {
      tenantId,
      userId: targetUserId,
      deletedAt: null,
      status: { in: ["REGISTERED", "WAITLISTED"] },
      event: { clubId, isPublic: false, deletedAt: null, endTime: { gt: new Date() } },
    },
    select: { id: true },
  });

  let cancelledTickets = 0;
  let promotedFromWaitlist = 0;
  for (const ticket of tickets) {
    const result = await cancelTicket({
      ticketId: ticket.id,
      tenantId,
      actorId: actor.userId,
      canManageOthers: true,
    });
    if (result.changed) cancelledTickets += 1;
    promotedFromWaitlist += result.promoted.length;
  }

  return { userId: targetUserId, removed: true, cancelledTickets, promotedFromWaitlist };
}

export interface TransferPresidencyResult {
  readonly newPresidentUserId: string;
  readonly formerPresidentUserId: string | null;
  readonly formerPresidentRole: PromotableClubRole | null;
}

/**
 * Hands the club to another member. The only way the President changes.
 *
 * Under the club lock: the current President steps down to the role they
 * chose (Lead or Member) and THEN the new one steps up — in that order, because
 * the database allows only one President per club at any instant.
 *
 * A college admin may run this too (e.g. the President graduated and vanished);
 * the outgoing President is then moved to the role the admin picked.
 *
 * Authorisation (`club:transfer_presidency`) is the caller's job.
 */
export async function transferPresidency(
  clubId: string,
  tenantId: string,
  input: TransferPresidencyInput,
): Promise<TransferPresidencyResult> {
  try {
    return await db.$transaction(async (tx) => {
      await lockClub(tx, clubId, tenantId);

      const club = await tx.club.findUniqueOrThrow({ where: { id: clubId }, select: { name: true } });
      if (normaliseName(input.confirmClubName) !== normaliseName(club.name)) {
        throw new ApiError("VALIDATION_ERROR", "The club name you typed doesn't match.", {
          details: { confirmClubName: ["Type the club's name exactly as shown."] },
        });
      }

      const target = await findActiveMembership(tx, clubId, input.newPresidentUserId);
      if (!target) throw ApiError.notFound("That person is not a member of this club.");
      if (target.role === "PRESIDENT") {
        throw new ApiError("CONFLICT", "That person is already the President.");
      }

      const current = await tx.clubMember.findFirst({
        where: { clubId, role: "PRESIDENT", deletedAt: null },
        select: { id: true, userId: true },
      });

      if (current) {
        await tx.clubMember.update({
          where: { id: current.id },
          data: { role: input.formerPresidentBecomes },
        });
      }
      await tx.clubMember.update({ where: { id: target.id }, data: { role: "PRESIDENT" } });

      return {
        newPresidentUserId: input.newPresidentUserId,
        formerPresidentUserId: current?.userId ?? null,
        formerPresidentRole: current ? input.formerPresidentBecomes : null,
      };
    });
  } catch (error) {
    // Only reachable if something bypassed the lock; the unique index still holds.
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      throw new ApiError("CONFLICT", "The presidency just changed. Reload the page and try again.");
    }
    throw error;
  }
}

function normaliseName(name: string): string {
  return name.trim().replace(/\s+/g, " ").toLowerCase();
}
