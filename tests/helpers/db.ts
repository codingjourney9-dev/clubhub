import { PrismaPg } from "@prisma/adapter-pg";

import { PrismaClient } from "../../src/generated/prisma/client";
import { TEST_DATABASE_NAME, TEST_DATABASE_URL } from "./test-database";

let client: PrismaClient | null = null;

/** Prisma client bound to the disposable test database (not the dev one). */
export function testDb(): PrismaClient {
  client ??= new PrismaClient({ adapter: new PrismaPg({ connectionString: TEST_DATABASE_URL }) });
  return client;
}

export async function disconnectTestDb(): Promise<void> {
  if (client) {
    await client.$disconnect();
    client = null;
  }
}

/** Truncates every table, preserving the schema produced by the migrations. */
export async function truncateAll(): Promise<void> {
  const db = testDb();
  await db.$executeRawUnsafe(
    `TRUNCATE TABLE club_verifications, opening_applications, role_openings, announcements, attendance, tickets, events, club_invites, club_members, clubs, ` +
      `tenant_invites, tenant_members, tenants, users RESTART IDENTITY CASCADE;`,
  );
}

/**
 * Fails the test if the client is not connected to the disposable test database.
 *
 * Truncating the wrong database would destroy the seeded development data, so
 * integration tests assert this before every case rather than trusting the
 * environment to be set up correctly.
 */
export async function assertTestDatabase(): Promise<void> {
  const rows = await testDb().$queryRaw<{ name: string }[]>`SELECT current_database() AS name`;
  const name = rows[0]?.name;

  if (name !== TEST_DATABASE_NAME) {
    throw new Error(
      `Refusing to run: connected to "${name ?? "unknown"}" but the tests own "${TEST_DATABASE_NAME}".`,
    );
  }
}

export const ids = {
  tenantA: "11111111-1111-4111-8111-111111111111",
  tenantB: "22222222-2222-4222-8222-222222222222",
  clubA: "11111111-1111-4111-8111-aaaaaaaaaaaa",
  clubB: "22222222-2222-4222-8222-bbbbbbbbbbbb",
  eventA: "11111111-1111-4111-8111-eeeeeeeeeeee",
  userA: "11111111-1111-4111-8111-u00000000000".replace("u", "0"),
  userB: "22222222-2222-4222-8222-000000000000",
} as const;

/**
 * Creates two tenants that each own a club and an event, plus one user in each.
 * Small, explicit fixture: enough to probe the cross-tenant constraints.
 */
export async function seedTwoTenants() {
  const db = testDb();

  await db.tenant.createMany({
    data: [
      { id: ids.tenantA, name: "Alpha College", slug: "alpha" },
      { id: ids.tenantB, name: "Beta College", slug: "beta" },
    ],
  });

  await db.user.createMany({
    data: [
      { id: ids.userA, email: "alpha@test.dev", firstName: "A", lastName: "One" },
      { id: ids.userB, email: "beta@test.dev", firstName: "B", lastName: "Two" },
    ],
  });

  await db.club.createMany({
    data: [
      { id: ids.clubA, tenantId: ids.tenantA, name: "Alpha Robotics", slug: "robotics" },
      { id: ids.clubB, tenantId: ids.tenantB, name: "Beta Robotics", slug: "robotics" },
    ],
  });

  await db.event.createMany({
    data: [
      {
        id: ids.eventA,
        tenantId: ids.tenantA,
        clubId: ids.clubA,
        title: "Alpha Hackathon",
        startTime: new Date("2026-11-01T09:00:00Z"),
        endTime: new Date("2026-11-01T18:00:00Z"),
        capacity: 2,
        status: "PUBLISHED",
        isPublic: true,
      },
    ],
  });

  return { db, ids };
}
