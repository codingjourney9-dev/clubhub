import "server-only";

import { ApiError } from "@/lib/api/response";
import { db } from "@/lib/db/client";
import { findAvailableSlug } from "@/lib/slug";
import type { CreateTenantInput, UpdateTenantInput } from "@/lib/validation/tenant";
import { Prisma } from "@/generated/prisma/client";

/**
 * Tenant (college) lifecycle.
 *
 * Creating a college and becoming its Owner must happen together or not at all:
 * a tenant with no Owner would be unreachable forever, so both writes live in
 * one transaction.
 */

export async function createTenantForUser(userId: string, input: CreateTenantInput) {
  // The email domain is globally unique. Checking it up front means we can name
  // the exact conflict, instead of reporting whichever uniqueness error Postgres
  // happens to raise first (the message for a duplicate name would be wrong).
  if (input.domain) {
    const domainTaken = await db.tenant.findUnique({
      where: { domain: input.domain },
      select: { id: true },
    });
    if (domainTaken) {
      throw new ApiError("CONFLICT", "That college domain is already registered.");
    }
  }

  const slug = await findAvailableSlug(input.name, async (candidate) => {
    const existing = await db.tenant.findUnique({ where: { slug: candidate }, select: { id: true } });
    return existing !== null;
  });

  try {
    return await db.$transaction(async (tx) => {
      const tenant = await tx.tenant.create({
        data: {
          name: input.name,
          slug,
          domain: input.domain ?? null,
          timezone: input.timezone,
          brandingSettings: input.primaryColor ? { primaryColor: input.primaryColor } : {},
        },
        select: { id: true, name: true, slug: true, timezone: true },
      });

      // The creator is always the Owner — this is the only path that mints one.
      await tx.tenantMember.create({
        data: { tenantId: tenant.id, userId, role: "OWNER" },
      });

      return tenant;
    });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      // Either the slug raced (retry next time) or the domain was claimed in the
      // milliseconds since the check above. `meta.target` can be a string, an
      // array or absent depending on the driver, so match against all of it.
      const target = JSON.stringify(error.meta ?? {});
      if (target.includes("domain")) {
        throw new ApiError("CONFLICT", "That college domain is already registered.");
      }
      throw new ApiError("CONFLICT", "That college name is already taken. Try a slightly different one.");
    }
    throw error;
  }
}

export async function listTenantsForUser(userId: string) {
  const memberships = await db.tenantMember.findMany({
    where: { userId, deletedAt: null, tenant: { deletedAt: null } },
    orderBy: { joinedAt: "asc" },
    select: {
      role: true,
      joinedAt: true,
      tenant: {
        select: {
          id: true,
          name: true,
          slug: true,
          domain: true,
          timezone: true,
          brandingSettings: true,
          _count: { select: { clubs: { where: { deletedAt: null, status: "ACTIVE" } } } },
        },
      },
    },
  });

  return memberships.map((membership) => ({
    ...membership.tenant,
    role: membership.role,
    joinedAt: membership.joinedAt,
  }));
}

export async function updateTenant(tenantId: string, input: UpdateTenantInput) {
  const existing = await db.tenant.findFirst({
    where: { id: tenantId, deletedAt: null },
    select: { brandingSettings: true },
  });

  if (!existing) throw ApiError.notFound("That college was not found.");

  const currentBranding = (existing.brandingSettings ?? {}) as Record<string, unknown>;

  return db.tenant.update({
    where: { id: tenantId },
    data: {
      ...(input.name === undefined ? {} : { name: input.name }),
      ...(input.timezone === undefined ? {} : { timezone: input.timezone }),
      // Branding is JSON; merge so one key never wipes the others.
      brandingSettings:
        input.primaryColor === undefined
          ? undefined
          : { ...currentBranding, primaryColor: input.primaryColor },
    },
    select: { id: true, name: true, slug: true, timezone: true, brandingSettings: true },
  });
}
