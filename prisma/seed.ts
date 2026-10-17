import "dotenv/config";

import { PrismaPg } from "@prisma/adapter-pg";
import bcrypt from "bcryptjs";

import { PrismaClient } from "../src/generated/prisma/client";
import { DEMO_INVITE_TOKEN } from "../src/config/demo";

/**
 * Deterministic seed for local development and demos.
 *
 * Fixed UUIDs make the script fully idempotent: re-running it updates the same
 * rows instead of creating duplicates, so it doubles as a "reset demo data"
 * command. Every user's password is `password123` — development only.
 */

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  throw new Error("DATABASE_URL is not set. Copy .env.example to .env first.");
}

const db = new PrismaClient({ adapter: new PrismaPg({ connectionString }) });

// ── Fixed ids ────────────────────────────────────────────────────────────────
const TENANT_ID = "0f1d2c3b-4a59-4e6d-8b7c-100000000001";
const USER = {
  aarav: "0f1d2c3b-4a59-4e6d-8b7c-000000000001", // President, Robotics Club
  meera: "0f1d2c3b-4a59-4e6d-8b7c-000000000002", // Event Manager, Robotics Club
  kabir: "0f1d2c3b-4a59-4e6d-8b7c-000000000003", // plain member of both clubs
  nisha: "0f1d2c3b-4a59-4e6d-8b7c-000000000004", // tenant admin (Dean of Student Affairs)
} as const;
const CLUB = {
  robotics: "0f1d2c3b-4a59-4e6d-8b7c-200000000001",
  debate: "0f1d2c3b-4a59-4e6d-8b7c-200000000002",
} as const;
const EVENT = {
  robowars: "0f1d2c3b-4a59-4e6d-8b7c-300000000001",
  workshop: "0f1d2c3b-4a59-4e6d-8b7c-300000000002",
  debate: "0f1d2c3b-4a59-4e6d-8b7c-300000000003",
  debugNight: "0f1d2c3b-4a59-4e6d-8b7c-300000000004",
} as const;

/** Fixed ticket ids/secrets keep this seed idempotent (Phase 5). */
const TICKET = {
  robowarsAarav: { id: "0f1d2c3b-4a59-4e6d-8b7c-400000000001", qr: "0f1d2c3b-4a59-4e6d-8b7c-500000000001" },
  robowarsMeera: { id: "0f1d2c3b-4a59-4e6d-8b7c-400000000002", qr: "0f1d2c3b-4a59-4e6d-8b7c-500000000002" },
  robowarsKabir: { id: "0f1d2c3b-4a59-4e6d-8b7c-400000000003", qr: "0f1d2c3b-4a59-4e6d-8b7c-500000000003" },
  robowarsNisha: { id: "0f1d2c3b-4a59-4e6d-8b7c-400000000004", qr: "0f1d2c3b-4a59-4e6d-8b7c-500000000004" },
  debugAarav: { id: "0f1d2c3b-4a59-4e6d-8b7c-400000000005", qr: "0f1d2c3b-4a59-4e6d-8b7c-500000000005" },
  debugMeera: { id: "0f1d2c3b-4a59-4e6d-8b7c-400000000006", qr: "0f1d2c3b-4a59-4e6d-8b7c-500000000006" },
  debugNisha: { id: "0f1d2c3b-4a59-4e6d-8b7c-400000000007", qr: "0f1d2c3b-4a59-4e6d-8b7c-500000000007" },
  debugKabir: { id: "0f1d2c3b-4a59-4e6d-8b7c-400000000008", qr: "0f1d2c3b-4a59-4e6d-8b7c-500000000008" },
} as const;

const DEMO_PASSWORD = "password123";

// DEMO_INVITE_TOKEN (imported above) is the one public invite link, defined in
// src/config/demo.ts so the read-only preview can render it too.

function utcDate(dayOffset: number, hours: number, minutes = 0): Date {
  const date = new Date();
  date.setUTCDate(date.getUTCDate() + dayOffset);
  date.setUTCHours(hours, minutes, 0, 0);
  return date;
}

async function main() {
  const passwordHash = await bcrypt.hash(DEMO_PASSWORD, 12);

  // ── Tenant ────────────────────────────────────────────────────────────────
  const tenant = await db.tenant.upsert({
    where: { slug: "vit-vadodara" },
    update: {},
    create: {
      id: TENANT_ID,
      name: "Vadodara Institute of Technology",
      slug: "vit-vadodara",
      domain: "vit.ac.in",
      timezone: "Asia/Kolkata",
      brandingSettings: { primaryColor: "#4f46e5", tagline: "Student clubs, one campus" },
    },
  });

  // ── Users ─────────────────────────────────────────────────────────────────
  const people = [
    { id: USER.aarav, firstName: "Aarav", lastName: "Shah", email: "aarav.president@vit.ac.in" },
    { id: USER.meera, firstName: "Meera", lastName: "Patel", email: "meera.manager@vit.ac.in" },
    { id: USER.kabir, firstName: "Kabir", lastName: "Rao", email: "kabir.member@vit.ac.in" },
    { id: USER.nisha, firstName: "Nisha", lastName: "Verma", email: "dean.admin@vit.ac.in" },
  ];

  for (const person of people) {
    await db.user.upsert({
      where: { email: person.email },
      update: { firstName: person.firstName, lastName: person.lastName },
      create: { ...person, passwordHash, timezone: "Asia/Kolkata" },
    });
  }

  // ── Clubs ─────────────────────────────────────────────────────────────────
  const robotics = await db.club.upsert({
    where: { tenantId_slug: { tenantId: tenant.id, slug: "robotics-club" } },
    update: {},
    create: {
      id: CLUB.robotics,
      tenantId: tenant.id,
      name: "Robotics Club",
      slug: "robotics-club",
      description: "Builds autonomous bots, runs workshops and represents the campus at national competitions.",
      category: "Technology",
    },
  });

  const debate = await db.club.upsert({
    where: { tenantId_slug: { tenantId: tenant.id, slug: "debate-society" } },
    update: {},
    create: {
      id: CLUB.debate,
      tenantId: tenant.id,
      name: "Debate Society",
      slug: "debate-society",
      description: "Parliamentary debate, Model UN and public speaking on campus.",
      category: "Literary",
    },
  });

  // ── Memberships: the same user holds different roles in different clubs ───
  const tenantRoles = [
    { userId: USER.aarav, role: "OWNER" as const },
    { userId: USER.nisha, role: "ADMIN" as const },
    { userId: USER.meera, role: "MEMBER" as const },
    { userId: USER.kabir, role: "MEMBER" as const },
  ];

  for (const membership of tenantRoles) {
    await db.tenantMember.upsert({
      where: { tenantId_userId: { tenantId: tenant.id, userId: membership.userId } },
      update: { role: membership.role, deletedAt: null },
      create: { tenantId: tenant.id, userId: membership.userId, role: membership.role },
    });
  }

  const clubRoles = [
    { clubId: robotics.id, userId: USER.aarav, role: "PRESIDENT" as const },
    { clubId: robotics.id, userId: USER.meera, role: "EVENT_MANAGER" as const },
    { clubId: robotics.id, userId: USER.kabir, role: "MEMBER" as const },
    { clubId: debate.id, userId: USER.aarav, role: "MEMBER" as const }, // President here, Member there
    { clubId: debate.id, userId: USER.meera, role: "MEMBER" as const },
    { clubId: debate.id, userId: USER.kabir, role: "MEMBER" as const },
  ];

  for (const membership of clubRoles) {
    await db.clubMember.upsert({
      where: { clubId_userId: { clubId: membership.clubId, userId: membership.userId } },
      update: { role: membership.role, deletedAt: null },
      create: membership,
    });
  }

  // ── One public demo invite link, so the preview can show the joining page ──
  // Grants only MEMBER of a seeded club. Re-seeding keeps the same token, so a
  // link you have already opened in the preview keeps working.
  const demoInviteExpiry = new Date();
  demoInviteExpiry.setUTCDate(demoInviteExpiry.getUTCDate() + 30);

  await db.clubInvite.upsert({
    where: { token: DEMO_INVITE_TOKEN },
    update: { expiresAt: demoInviteExpiry, revokedAt: null },
    create: {
      tenantId: tenant.id,
      clubId: robotics.id,
      token: DEMO_INVITE_TOKEN,
      role: "MEMBER",
      expiresAt: demoInviteExpiry,
      maxUses: 25,
      uses: 3,
      createdById: USER.aarav,
    },
  });

  // ── Events: public + members-only, past + upcoming ────────────────────────
  const events = [
    {
      id: EVENT.debate,
      clubId: debate.id,
      title: "Inter-College Parliamentary Debate",
      description: "Asia-style parliamentary debate: three preliminary rounds, semi-finals and a grand final.",
      location: "Seminar Hall 2, Academic Block C",
      startTime: utcDate(5, 4, 30), // 10:00 IST
      endTime: utcDate(5, 12, 30), // 18:00 IST
      capacity: 60,
      waitlistEnabled: true,
      status: "PUBLISHED" as const,
      isPublic: true,
      createdById: USER.kabir,
    },
    {
      id: EVENT.robowars,
      clubId: robotics.id,
      title: "RoboWars 2026 — Qualifiers",
      description: "Bot-vs-bot eliminations. Teams of four, battery and weight limits enforced at check-in.",
      location: "Open Air Theatre",
      startTime: utcDate(12, 3, 30), // 09:00 IST
      endTime: utcDate(12, 12, 30), // 18:00 IST
      capacity: 120,
      waitlistEnabled: true,
      status: "PUBLISHED" as const,
      isPublic: true,
      createdById: USER.aarav,
    },
    {
      id: EVENT.debugNight,
      clubId: robotics.id,
      title: "Debug Night: RoboWars Warm-up",
      description:
        "Three seats only: bring a broken bot and leave with it working. Organisers keep the room small on purpose so everybody gets help.",
      location: "Robotics Lab, Block D",
      startTime: utcDate(4, 13, 30), // 19:00 IST
      endTime: utcDate(4, 16, 30), // 22:00 IST
      capacity: 3,
      waitlistEnabled: true,
      status: "PUBLISHED" as const,
      isPublic: true,
      createdById: USER.aarav,
    },
    {
      id: EVENT.workshop,
      clubId: robotics.id,
      title: "Line-Follower Workshop (members only)",
      description: "Hands-on session: IR sensing, PID tuning and motor drivers. Kits provided.",
      location: "Robotics Lab, Block D",
      startTime: utcDate(21, 5, 30), // 11:00 IST
      endTime: utcDate(21, 9, 30), // 15:00 IST
      capacity: 30,
      waitlistEnabled: false,
      status: "DRAFT" as const,
      isPublic: false,
      createdById: USER.meera,
    },
  ];

  for (const event of events) {
    await db.event.upsert({
      where: { id: event.id },
      update: {
        title: event.title,
        description: event.description,
        location: event.location,
        startTime: event.startTime,
        endTime: event.endTime,
        capacity: event.capacity,
        waitlistEnabled: event.waitlistEnabled,
        status: event.status,
        isPublic: event.isPublic,
        deletedAt: null,
      },
      create: { tenantId: tenant.id, ...event },
    });
  }

  // ── Tickets: a room with people in it, and a real queue to look at ────────
  // Without these every event would read "0 / 120" and the demo could not show a
  // full room, a waitlist, or a ticket with a QR code on it.
  const tickets = [
    { seat: TICKET.robowarsAarav, eventId: EVENT.robowars, userId: USER.aarav, status: "REGISTERED" as const, position: null },
    { seat: TICKET.robowarsMeera, eventId: EVENT.robowars, userId: USER.meera, status: "REGISTERED" as const, position: null },
    { seat: TICKET.robowarsKabir, eventId: EVENT.robowars, userId: USER.kabir, status: "REGISTERED" as const, position: null },
    { seat: TICKET.robowarsNisha, eventId: EVENT.robowars, userId: USER.nisha, status: "REGISTERED" as const, position: null },

    // Debug Night is deliberately full: 3 seats, 3 holders, and Kabir waiting.
    { seat: TICKET.debugAarav, eventId: EVENT.debugNight, userId: USER.aarav, status: "REGISTERED" as const, position: null },
    { seat: TICKET.debugMeera, eventId: EVENT.debugNight, userId: USER.meera, status: "REGISTERED" as const, position: null },
    { seat: TICKET.debugNisha, eventId: EVENT.debugNight, userId: USER.nisha, status: "REGISTERED" as const, position: null },
    { seat: TICKET.debugKabir, eventId: EVENT.debugNight, userId: USER.kabir, status: "WAITLISTED" as const, position: 1 },
  ];

  for (const ticket of tickets) {
    await db.ticket.upsert({
      where: { eventId_userId: { eventId: ticket.eventId, userId: ticket.userId } },
      update: {
        status: ticket.status,
        waitlistPosition: ticket.position,
        cancelledAt: null,
        deletedAt: null,
      },
      create: {
        id: ticket.seat.id,
        tenantId: tenant.id,
        eventId: ticket.eventId,
        userId: ticket.userId,
        qrCodeUuid: ticket.seat.qr,
        status: ticket.status,
        waitlistPosition: ticket.position,
      },
    });
  }

  console.log(`
  Seed complete ────────────────────────────────────────────────
  Tenant   ${tenant.name}  (${tenant.timezone})

  Demo accounts — password for all: ${DEMO_PASSWORD}

    aarav.president@vit.ac.in   Tenant Owner   · President, Robotics Club · Member, Debate Society
    meera.manager@vit.ac.in     Tenant Member  · Event Manager, Robotics Club
    kabir.member@vit.ac.in      Tenant Member  · Member in both clubs
    dean.admin@vit.ac.in        Tenant Admin   · no club role (cross-club visibility)

  Clubs    2   Events   4 (3 published · 1 draft members-only)
  Tickets  8 (7 seats held · 1 person queuing for a full room)
  Invites  1   public demo link: join/${DEMO_INVITE_TOKEN}
  ──────────────────────────────────────────────────────────────
`);
}

main()
  .catch((error) => {
    console.error("Seed failed:", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await db.$disconnect();
  });
