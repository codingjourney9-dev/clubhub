import { beforeEach, describe, expect, it } from "vitest";

import { ApiError } from "../../src/lib/api/response";
import { createTenantForUser, listTenantsForUser, updateTenant } from "../../src/lib/services/tenant-service";
import { assertTestDatabase, testDb, truncateAll } from "../helpers/db";
import { p3, p3Emails, seedClubWorkspace } from "../helpers/phase3";

/**
 * College lifecycle: self-serve creation (creator becomes Owner), the slug and
 * domain conflicts, and listing only the colleges you actually belong to.
 */

beforeEach(async () => {
  await assertTestDatabase();
  await truncateAll();
  await seedClubWorkspace();
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

describe("createTenantForUser", () => {
  it("makes the creator an Owner in the same transaction", async () => {
    const tenant = await createTenantForUser(p3.member, {
      name: "Sunrise Institute",
      timezone: "Asia/Kolkata",
    });

    expect(tenant.slug).toBe("sunrise-institute");

    const membership = await testDb().tenantMember.findFirst({
      where: { tenantId: tenant.id, userId: p3.member },
      select: { role: true },
    });
    expect(membership?.role).toBe("OWNER");
  });

  it("stores branding and the chosen timezone", async () => {
    const tenant = await createTenantForUser(p3.member, {
      name: "Colour College",
      timezone: "Europe/London",
      primaryColor: "#4f46e5",
    });

    const row = await testDb().tenant.findUnique({
      where: { id: tenant.id },
      select: { timezone: true, brandingSettings: true },
    });
    expect(row?.timezone).toBe("Europe/London");
    expect(row?.brandingSettings).toEqual({ primaryColor: "#4f46e5" });
  });

  it("suffixes the slug when the name is already taken", async () => {
    // The fixture college holds "phase-three", so the same name again must be numbered.
    const tenant = await createTenantForUser(p3.member, { name: "Phase Three", timezone: "UTC" });
    expect(tenant.slug).toBe("phase-three-2");
  });

  it("refuses a second college claiming the same email domain", async () => {
    await createTenantForUser(p3.member, {
      name: "First College",
      domain: "shared.ac.in",
      timezone: "UTC",
    });

    const error = await expectApiError(
      createTenantForUser(p3.member, {
        name: "Second College",
        domain: "shared.ac.in",
        timezone: "UTC",
      }),
    );
    expect(error.status).toBe(409);
    expect(error.message).toContain("domain");
  });
});

describe("listTenantsForUser", () => {
  it("returns only the colleges the person belongs to, with their role", async () => {
    const asMember = await listTenantsForUser(p3.member);
    expect(asMember).toHaveLength(1);
    expect(asMember[0]?.id).toBe(p3.tenant);
    expect(asMember[0]?.role).toBe("MEMBER");
    // The count feeds the onboarding page ("3 clubs"), so it must exclude deleted ones.
    expect(asMember[0]?._count.clubs).toBe(1);

    const asOutsider = await listTenantsForUser(p3.outsider);
    expect(asOutsider.map((tenant) => tenant.id)).toEqual([p3.otherTenant]);
  });

  it("drops a college membership that has been soft-deleted", async () => {
    await testDb().tenantMember.updateMany({
      where: { tenantId: p3.tenant, userId: p3.member },
      data: { deletedAt: new Date() },
    });

    expect(await listTenantsForUser(p3.member)).toHaveLength(0);
  });

  it("never lists the club counts of another college", async () => {
    const asMember = await listTenantsForUser(p3.member);
    expect(asMember.some((tenant) => tenant.id === p3.otherTenant)).toBe(false);
    expect(p3Emails.outsider).toBeTruthy();
  });
});

describe("updateTenant", () => {
  it("merges branding instead of replacing the whole JSON blob", async () => {
    await testDb().tenant.update({
      where: { id: p3.tenant },
      data: { brandingSettings: { logoText: "P3", primaryColor: "#000000" } },
    });

    const updated = await updateTenant(p3.tenant, { name: "Phase Three Institute" });
    expect(updated.name).toBe("Phase Three Institute");
    expect(updated.slug).toBe("phase-three"); // the slug is deliberately stable
    expect(updated.brandingSettings).toEqual({ logoText: "P3", primaryColor: "#000000" });

    const recoloured = await updateTenant(p3.tenant, { primaryColor: "#ffffff" });
    expect(recoloured.brandingSettings).toEqual({ logoText: "P3", primaryColor: "#ffffff" });
  });

  it("refuses a college that has been soft-deleted", async () => {
    await testDb().tenant.update({ where: { id: p3.tenant }, data: { deletedAt: new Date() } });

    const error = await expectApiError(updateTenant(p3.tenant, { name: "Ghost College" }));
    expect(error.status).toBe(404);
  });
});
