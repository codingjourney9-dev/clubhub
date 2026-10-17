import { execFileSync } from "node:child_process";

import { beforeAll, describe, expect, it } from "vitest";

import { testDb, truncateAll } from "../helpers/db";
import { TEST_DATABASE_URL } from "../helpers/test-database";

/**
 * The seed script is the thing every reviewer and every future session relies on,
 * so two properties are enforced here: it produces the documented fixture, and
 * running it repeatedly changes nothing (fixed UUIDs + upserts).
 */

function runSeed(): void {
  execFileSync("npx", ["tsx", "prisma/seed.ts"], {
    cwd: process.cwd(),
    env: { ...process.env, DATABASE_URL: TEST_DATABASE_URL, NODE_ENV: "development" },
    stdio: "pipe",
  });
}

const EXPECTED = {
  tenants: 1,
  users: 4,
  tenantMembers: 4,
  clubs: 2,
  clubMembers: 6,
  events: 4,
  tickets: 8,
} as const;

beforeAll(async () => {
  await truncateAll();
  runSeed();
}, 120_000);

describe("seed script", () => {
  it("creates the documented fixture", async () => {
    const db = testDb();

    expect(await db.tenant.count()).toBe(EXPECTED.tenants);
    expect(await db.user.count()).toBe(EXPECTED.users);
    expect(await db.tenantMember.count()).toBe(EXPECTED.tenantMembers);
    expect(await db.club.count()).toBe(EXPECTED.clubs);
    expect(await db.clubMember.count()).toBe(EXPECTED.clubMembers);
    expect(await db.event.count()).toBe(EXPECTED.events);
  });

  it("gives every demo account a working password hash", async () => {
    const db = testDb();

    const users = await db.user.findMany({ select: { email: true, passwordHash: true } });
    for (const user of users) {
      // bcrypt hashes are 60 chars; asserting the shape catches a seed that
      // stored a plaintext value or an empty string.
      expect(user.passwordHash, `${user.email} should have a bcrypt hash`).toMatch(/^\$2[aby]\$\d{2}\$.{53}$/);
    }
  });

  it("models the RBAC requirement: one user, different roles per club", async () => {
    const db = testDb();

    const aarav = await db.user.findFirstOrThrow({ where: { email: "aarav.president@vit.ac.in" } });

    const memberships = await db.clubMember.findMany({
      where: { userId: aarav.id },
      select: { role: true, club: { select: { slug: true } } },
    });

    const byClub = Object.fromEntries(memberships.map((m) => [m.club.slug, m.role]));
    expect(byClub["robotics-club"]).toBe("PRESIDENT");
    expect(byClub["debate-society"]).toBe("MEMBER");
  });

  it("seeds both a public published event and a members-only draft", async () => {
    const db = testDb();

    expect(await db.event.count({ where: { isPublic: true, status: "PUBLISHED" } })).toBe(3);
    expect(
      await db.event.count({ where: { isPublic: false, status: "DRAFT", deletedAt: null } }),
    ).toBe(1);
  });

  it("seeds a full room with a real queue behind it", async () => {
    const db = testDb();

    // The demo needs a room that is actually full, otherwise a waitlist is an
    // abstract idea in a screenshot instead of a visible queue.
    expect(await db.ticket.count()).toBe(EXPECTED.tickets);
    expect(await db.ticket.count({ where: { status: "REGISTERED" } })).toBe(7);
    expect(await db.ticket.count({ where: { status: "WAITLISTED" } })).toBe(1);

    const debugNight = await db.event.findFirstOrThrow({
      where: { title: { contains: "Debug Night" } },
      select: { id: true, capacity: true },
    });

    const seated = await db.ticket.count({
      where: { eventId: debugNight.id, status: "REGISTERED" },
    });

    // Exactly full: no seats left, which is what makes the queue meaningful.
    expect(seated).toBe(debugNight.capacity);
  });

  it("is idempotent — re-running it creates no duplicates", async () => {
    runSeed();

    const db = testDb();
    expect(await db.tenant.count()).toBe(EXPECTED.tenants);
    expect(await db.user.count()).toBe(EXPECTED.users);
    expect(await db.tenantMember.count()).toBe(EXPECTED.tenantMembers);
    expect(await db.club.count()).toBe(EXPECTED.clubs);
    expect(await db.clubMember.count()).toBe(EXPECTED.clubMembers);
    expect(await db.event.count()).toBe(EXPECTED.events);
    expect(await db.ticket.count()).toBe(EXPECTED.tickets);
  }, 120_000);
});
