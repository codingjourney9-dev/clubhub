import { testDb } from "./db";

/**
 * Phase 3 fixture: one college with a club, a second empty college, and four
 * people covering every interesting authorisation position.
 *
 *   owner      college OWNER, no club role      → tenant override applies
 *   president  college MEMBER + club PRESIDENT  → full club authority
 *   member     college MEMBER + club MEMBER     → read-only club access
 *   outsider   member of a DIFFERENT college    → must never see this one
 */
export const p3 = {
  tenant: "33333333-3333-4333-8333-333333333333",
  otherTenant: "44444444-4444-4444-8444-444444444444",
  club: "33333333-3333-4333-8333-cccccccccccc",
  owner: "33333333-3333-4333-8333-000000000001",
  president: "33333333-3333-4333-8333-000000000002",
  member: "33333333-3333-4333-8333-000000000003",
  outsider: "44444444-4444-4444-8444-000000000004",
} as const;

export const p3Emails = {
  owner: "phase3.owner@test.dev",
  president: "phase3.president@test.dev",
  member: "phase3.member@test.dev",
  outsider: "phase3.outsider@test.dev",
} as const;

export async function seedClubWorkspace() {
  const db = testDb();

  await db.tenant.createMany({
    data: [
      { id: p3.tenant, name: "Phase Three College", slug: "phase-three", timezone: "Asia/Kolkata" },
      { id: p3.otherTenant, name: "Other College", slug: "other", timezone: "UTC" },
    ],
  });

  await db.user.createMany({
    data: [
      { id: p3.owner, email: p3Emails.owner, firstName: "Ovi", lastName: "Owner" },
      { id: p3.president, email: p3Emails.president, firstName: "Priya", lastName: "President" },
      { id: p3.member, email: p3Emails.member, firstName: "Milo", lastName: "Member" },
      { id: p3.outsider, email: p3Emails.outsider, firstName: "Outi", lastName: "Outsider" },
    ],
  });

  await db.tenantMember.createMany({
    data: [
      { tenantId: p3.tenant, userId: p3.owner, role: "OWNER" },
      { tenantId: p3.tenant, userId: p3.president, role: "MEMBER" },
      { tenantId: p3.tenant, userId: p3.member, role: "MEMBER" },
      { tenantId: p3.otherTenant, userId: p3.outsider, role: "OWNER" },
    ],
  });

  await db.club.create({
    data: {
      id: p3.club,
      tenantId: p3.tenant,
      name: "Robotics Club",
      slug: "robotics",
      description: "Builds robots.",
    },
  });

  await db.clubMember.createMany({
    data: [
      { clubId: p3.club, userId: p3.president, role: "PRESIDENT" },
      { clubId: p3.club, userId: p3.member, role: "MEMBER" },
    ],
  });

  return { db };
}
