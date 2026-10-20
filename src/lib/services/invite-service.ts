import "server-only";

import { ApiError } from "@/lib/api/response";
import { canAssignClubRole, canAssignTenantRole, type Actor } from "@/lib/auth/rbac";
import { db } from "@/lib/db/client";
import { generateInviteToken } from "@/lib/slug";
import type { CreateClubInviteInput, CreateTenantInviteInput } from "@/lib/validation/invite";
import type { Prisma } from "@/generated/prisma/client";
import type { ClubRole, TenantRole } from "@/generated/prisma/enums";

/**
 * Invite links: creation, preview and redemption.
 *
 * Roles come from the LINK, never from whoever redeems it, so a Member link
 * cannot be turned into a President membership. Redemption happens inside a
 * transaction that locks the invite row, which is what makes a
 * `maxUses: 1` link genuinely single-use even if two people click at once.
 */

function expiryFrom(hours: number): Date {
  return new Date(Date.now() + hours * 60 * 60 * 1000);
}

/** Public URL a President can paste into a group chat. */
export function inviteUrl(token: string): string {
  const base = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
  return `${base.replace(/\/$/, "")}/join/${token}`;
}

export async function createClubInvite(
  clubId: string,
  tenantId: string,
  actor: Actor,
  createdById: string,
  input: CreateClubInviteInput,
) {
  const club = await db.club.findFirst({
    where: { id: clubId, tenantId, deletedAt: null },
    select: { id: true, name: true },
  });
  if (!club) throw ApiError.notFound("That club was not found.");

  // Privilege check: nobody may mint a role more powerful than their own.
  if (!canAssignClubRole(actor, input.role)) {
    throw ApiError.forbidden(`You cannot create an invite that grants the ${input.role} role.`);
  }

  const invite = await db.clubInvite.create({
    data: {
      tenantId,
      clubId,
      token: generateInviteToken(),
      role: input.role,
      email: input.email ?? null,
      expiresAt: expiryFrom(input.expiresInHours),
      maxUses: input.maxUses,
      createdById,
    },
    select: { id: true, token: true, role: true, expiresAt: true, maxUses: true, email: true },
  });

  return { ...invite, url: inviteUrl(invite.token), target: club.name, kind: "club" as const };
}

export async function createTenantInvite(
  tenantId: string,
  actorRole: TenantRole,
  createdById: string,
  input: CreateTenantInviteInput,
) {
  if (!canAssignTenantRole(actorRole, input.role)) {
    throw ApiError.forbidden(`You cannot create an invite that grants the ${input.role} role.`);
  }

  const tenant = await db.tenant.findFirst({
    where: { id: tenantId, deletedAt: null },
    select: { id: true, name: true },
  });
  if (!tenant) throw ApiError.notFound("That college was not found.");

  const invite = await db.tenantInvite.create({
    data: {
      tenantId,
      token: generateInviteToken(),
      role: input.role,
      email: input.email ?? null,
      expiresAt: expiryFrom(input.expiresInHours),
      maxUses: input.maxUses,
      createdById,
    },
    select: { id: true, token: true, role: true, expiresAt: true, maxUses: true, email: true },
  });

  return { ...invite, url: inviteUrl(invite.token), target: tenant.name, kind: "tenant" as const };
}

export interface InvitePreview {
  readonly kind: "club" | "tenant";
  readonly targetName: string;
  readonly role: ClubRole | TenantRole;
  readonly expiresAt: Date;
  readonly usesRemaining: number;
  readonly emailRestricted: boolean;
  readonly valid: boolean;
  readonly reason?: string;
}

/**
 * Looks up an invite for the join page. Deliberately returns only what the page
 * needs to render — never the invite id, creator, or usage history.
 */
export async function previewInvite(token: string): Promise<InvitePreview | null> {
  const clubInvite = await db.clubInvite.findUnique({
    where: { token },
    select: {
      role: true,
      expiresAt: true,
      maxUses: true,
      uses: true,
      revokedAt: true,
      email: true,
      club: { select: { name: true, deletedAt: true } },
    },
  });

  if (clubInvite) {
    const remaining = Math.max(0, clubInvite.maxUses - clubInvite.uses);
    const reason = describeInvalidity({
      revoked: clubInvite.revokedAt !== null,
      expired: clubInvite.expiresAt.getTime() < Date.now(),
      exhausted: remaining === 0,
      targetDeleted: clubInvite.club.deletedAt !== null,
    });

    return {
      kind: "club",
      targetName: clubInvite.club.name,
      role: clubInvite.role,
      expiresAt: clubInvite.expiresAt,
      usesRemaining: remaining,
      emailRestricted: clubInvite.email !== null,
      valid: reason === undefined,
      ...(reason ? { reason } : {}),
    };
  }

  const tenantInvite = await db.tenantInvite.findUnique({
    where: { token },
    select: {
      role: true,
      expiresAt: true,
      maxUses: true,
      uses: true,
      revokedAt: true,
      email: true,
      tenant: { select: { name: true, deletedAt: true } },
    },
  });

  if (!tenantInvite) return null;

  const remaining = Math.max(0, tenantInvite.maxUses - tenantInvite.uses);
  const reason = describeInvalidity({
    revoked: tenantInvite.revokedAt !== null,
    expired: tenantInvite.expiresAt.getTime() < Date.now(),
    exhausted: remaining === 0,
    targetDeleted: tenantInvite.tenant.deletedAt !== null,
  });

  return {
    kind: "tenant",
    targetName: tenantInvite.tenant.name,
    role: tenantInvite.role,
    expiresAt: tenantInvite.expiresAt,
    usesRemaining: remaining,
    emailRestricted: tenantInvite.email !== null,
    valid: reason === undefined,
    ...(reason ? { reason } : {}),
  };
}

function describeInvalidity(state: {
  revoked: boolean;
  expired: boolean;
  exhausted: boolean;
  targetDeleted: boolean;
}): string | undefined {
  if (state.revoked) return "This invite link was cancelled.";
  if (state.expired) return "This invite link has expired. Ask for a new one.";
  if (state.exhausted) return "This invite link has already been used.";
  if (state.targetDeleted) return "This invite's club or college no longer exists.";
  return undefined;
}

export interface AcceptInviteResult {
  readonly kind: "club" | "tenant";
  readonly targetName: string;
  readonly role: ClubRole | TenantRole;
  readonly alreadyMember: boolean;
}

/**
 * Redeems an invite for the signed-in user.
 *
 * Uses `SELECT … FOR UPDATE` on the invite row so two simultaneous redemptions
 * of a one-use link serialise: the second sees `uses` already incremented and is
 * rejected. This is the same row-locking approach Phase 5 uses for capacity.
 */
export async function acceptInvite(token: string, userId: string, userEmail: string): Promise<AcceptInviteResult> {
  return db.$transaction(async (tx) => {
    // Lock the club invite row if it exists, else the tenant invite row. Taking
    // the lock first, then reading counts, is what prevents the double-redeem race.
    const lockedClub = await tx.$queryRaw<{ id: string }[]>`
      SELECT id FROM "club_invites" WHERE token = ${token} FOR UPDATE
    `;

    if (lockedClub.length > 0) {
      const invite = await tx.clubInvite.findUniqueOrThrow({
        where: { token },
        select: {
          id: true,
          clubId: true,
          tenantId: true,
          role: true,
          email: true,
          expiresAt: true,
          maxUses: true,
          uses: true,
          revokedAt: true,
          club: { select: { name: true, deletedAt: true } },
        },
      });

      const existing = await tx.clubMember.findFirst({
        where: { clubId: invite.clubId, userId },
        select: { id: true, role: true, deletedAt: true },
      });

      if (existing && existing.deletedAt === null) {
        // Already an active member. Checked BEFORE the link's own state: whether
        // the link is used up, expired or revoked is irrelevant to someone who is
        // already inside, and clicking twice (or refreshing) must not be an error.
        // Their real role is reported back — a link never silently upgrades anyone.
        await ensureTenantMembership(tx, invite.tenantId, userId);
        return {
          kind: "club" as const,
          targetName: invite.club.name,
          role: existing.role,
          alreadyMember: true,
        };
      }

      assertRedeemable(invite, userEmail);

      // Links can't make Presidents any more (the Phase 10 migration rewrote old
      // ones). Belt and braces: a stray one grants Lead, never a second President.
      const grantedRole = invite.role === "PRESIDENT" ? "EVENT_MANAGER" : invite.role;

      // Every read is tenant-scoped, so a club member without a college
      // membership could not see the club they just joined. Joining a club means
      // joining the college community as a plain member — never as an admin.
      await ensureTenantMembership(tx, invite.tenantId, userId);

      if (existing) {
        // Rejoining after leaving: revive the historical row, keeping joined_at history.
        await tx.clubMember.update({
          where: { id: existing.id },
          data: { deletedAt: null, role: grantedRole, joinedAt: new Date() },
        });
      } else {
        await tx.clubMember.create({
          data: { clubId: invite.clubId, userId, role: grantedRole },
        });
      }

      await tx.clubInvite.update({
        where: { id: invite.id },
        data: { uses: { increment: 1 } },
      });

      return {
        kind: "club" as const,
        targetName: invite.club.name,
        role: grantedRole,
        alreadyMember: false,
      };
    }

    const lockedTenant = await tx.$queryRaw<{ id: string }[]>`
      SELECT id FROM "tenant_invites" WHERE token = ${token} FOR UPDATE
    `;

    if (lockedTenant.length > 0) {
      const invite = await tx.tenantInvite.findUniqueOrThrow({
        where: { token },
        select: {
          id: true,
          tenantId: true,
          role: true,
          email: true,
          expiresAt: true,
          maxUses: true,
          uses: true,
          revokedAt: true,
          tenant: { select: { name: true, deletedAt: true } },
        },
      });

      const existing = await tx.tenantMember.findFirst({
        where: { tenantId: invite.tenantId, userId },
        select: { id: true, role: true, deletedAt: true },
      });

      // Same rule as clubs: an existing member is not blocked by a link that has
      // been used up or has expired, and keeps the role they already hold.
      if (existing && existing.deletedAt === null) {
        return {
          kind: "tenant" as const,
          targetName: invite.tenant.name,
          role: existing.role,
          alreadyMember: true,
        };
      }

      assertRedeemable(invite, userEmail);

      if (existing) {
        await tx.tenantMember.update({
          where: { id: existing.id },
          data: { deletedAt: null, role: invite.role, joinedAt: new Date() },
        });
      } else {
        await tx.tenantMember.create({
          data: { tenantId: invite.tenantId, userId, role: invite.role },
        });
      }

      await tx.tenantInvite.update({
        where: { id: invite.id },
        data: { uses: { increment: 1 } },
      });

      return {
        kind: "tenant" as const,
        targetName: invite.tenant.name,
        role: invite.role,
        alreadyMember: false,
      };
    }

    throw ApiError.notFound("That invite link is not valid.");
  });
}

/**
 * Makes sure the person is a member of the college, so the club they are joining
 * is visible to them. Existing memberships — and their roles — are left alone,
 * and a membership that was soft-deleted is revived rather than duplicated.
 */
async function ensureTenantMembership(
  tx: Prisma.TransactionClient,
  tenantId: string,
  userId: string,
): Promise<void> {
  const existing = await tx.tenantMember.findFirst({
    where: { tenantId, userId },
    select: { id: true, deletedAt: true },
  });

  if (!existing) {
    await tx.tenantMember.create({ data: { tenantId, userId, role: "MEMBER" } });
    return;
  }

  if (existing.deletedAt) {
    // They were removed from the college at some point; rejoining through a club
    // link brings them back as a plain member, not with their old role.
    await tx.tenantMember.update({
      where: { id: existing.id },
      data: { deletedAt: null, role: "MEMBER", joinedAt: new Date() },
    });
  }
}

function assertRedeemable(
  invite: {
    expiresAt: Date;
    maxUses: number;
    uses: number;
    revokedAt: Date | null;
    email: string | null;
    club?: { deletedAt: Date | null };
    tenant?: { deletedAt: Date | null };
  },
  userEmail: string,
): void {
  if (invite.revokedAt) throw new ApiError("CONFLICT", "This invite link was cancelled.");
  if (invite.expiresAt.getTime() < Date.now()) {
    throw new ApiError("CONFLICT", "This invite link has expired. Ask for a new one.");
  }
  if (invite.uses >= invite.maxUses) {
    throw new ApiError("CONFLICT", "This invite link has already been used.");
  }
  const targetDeleted = invite.club?.deletedAt ?? invite.tenant?.deletedAt ?? null;
  if (targetDeleted) {
    throw new ApiError("CONFLICT", "This invite's club or college no longer exists.");
  }
  // Address-restricted links only work for the intended person.
  if (invite.email && invite.email.toLowerCase() !== userEmail.toLowerCase()) {
    throw new ApiError("FORBIDDEN", "This invite was issued to a different email address.");
  }
}

/** Invites a club admin can see and revoke. */
export async function listClubInvites(clubId: string, tenantId: string) {
  const invites = await db.clubInvite.findMany({
    where: { clubId, tenantId },
    orderBy: { createdAt: "desc" },
    take: 25,
    select: {
      id: true,
      token: true,
      role: true,
      email: true,
      expiresAt: true,
      maxUses: true,
      uses: true,
      revokedAt: true,
      createdAt: true,
      createdBy: { select: { firstName: true, lastName: true, email: true } },
    },
  });

  return invites.map((invite) => ({
    ...invite,
    url: inviteUrl(invite.token),
    status: computeInviteStatus(invite),
  }));
}

function computeInviteStatus(invite: {
  revokedAt: Date | null;
  expiresAt: Date;
  uses: number;
  maxUses: number;
}): "active" | "expired" | "used_up" | "revoked" {
  if (invite.revokedAt) return "revoked";
  if (invite.expiresAt.getTime() < Date.now()) return "expired";
  if (invite.uses >= invite.maxUses) return "used_up";
  return "active";
}

export async function revokeInvite(inviteId: string, clubId: string, tenantId: string) {
  const invite = await db.clubInvite.findFirst({
    where: { id: inviteId, clubId, tenantId },
    select: { id: true, revokedAt: true },
  });

  if (!invite) throw ApiError.notFound("That invite was not found.");
  if (invite.revokedAt) return { id: invite.id, revokedAt: invite.revokedAt.toISOString() };

  const updated = await db.clubInvite.update({
    where: { id: invite.id },
    data: { revokedAt: new Date() },
    select: { id: true, revokedAt: true },
  });

  return { id: updated.id, revokedAt: updated.revokedAt?.toISOString() ?? null };
}
