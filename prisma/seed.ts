import "dotenv/config";

import { PrismaPg } from "@prisma/adapter-pg";
import bcrypt from "bcryptjs";

import { PrismaClient } from "../src/generated/prisma/client";
import type { EventTag } from "../src/generated/prisma/enums";
import { DEMO_INVITE_TOKEN } from "../src/config/demo";
import { normalizeSslMode } from "../src/lib/db/connection-string";

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

const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: normalizeSslMode(connectionString) }) });

// ── Fixed ids ────────────────────────────────────────────────────────────────
const TENANT_ID = "0f1d2c3b-4a59-4e6d-8b7c-100000000001";
const USER = {
  aarav: "0f1d2c3b-4a59-4e6d-8b7c-000000000001", // President, Robotics Club
  meera: "0f1d2c3b-4a59-4e6d-8b7c-000000000002", // Lead (EVENT_MANAGER), Robotics Club
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
  openHouse: "0f1d2c3b-4a59-4e6d-8b7c-300000000005",
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
  openAarav: { id: "0f1d2c3b-4a59-4e6d-8b7c-400000000009", qr: "0f1d2c3b-4a59-4e6d-8b7c-500000000009" },
  openMeera: { id: "0f1d2c3b-4a59-4e6d-8b7c-40000000000a", qr: "0f1d2c3b-4a59-4e6d-8b7c-50000000000a" },
  openKabir: { id: "0f1d2c3b-4a59-4e6d-8b7c-40000000000b", qr: "0f1d2c3b-4a59-4e6d-8b7c-50000000000b" },
  openNisha: { id: "0f1d2c3b-4a59-4e6d-8b7c-40000000000c", qr: "0f1d2c3b-4a59-4e6d-8b7c-50000000000c" },
} as const;

/** Fixed announcement ids (Phase 10), for the same reason. */
const ANNOUNCEMENT = {
  buildNights: "0f1d2c3b-4a59-4e6d-8b7c-600000000001",
  doorVolunteers: "0f1d2c3b-4a59-4e6d-8b7c-600000000002",
  debateNeedsPresident: "0f1d2c3b-4a59-4e6d-8b7c-600000000003",
} as const;

/** Fixed recruitment ids (Phase 11). */
const OPENING = {
  electronics: "0f1d2c3b-4a59-4e6d-8b7c-700000000001",
  workshopLead: "0f1d2c3b-4a59-4e6d-8b7c-700000000002",
  mediaClosed: "0f1d2c3b-4a59-4e6d-8b7c-700000000003",
  debaters: "0f1d2c3b-4a59-4e6d-8b7c-700000000004",
} as const;
const APPLICATION = {
  kabirWorkshopLead: "0f1d2c3b-4a59-4e6d-8b7c-800000000001",
} as const;

/**
 * Two people are already through the door before you arrive.
 *
 * Leaving one seat unscanned is deliberate: the demo needs a ticket that can
 * still be checked in, otherwise the door preview can only show "already inside".
 */
const CHECK_IN = {
  robowarsAarav: "0f1d2c3b-4a59-4e6d-8b7c-600000000001",
  debugAarav: "0f1d2c3b-4a59-4e6d-8b7c-600000000002",
  debugMeera: "0f1d2c3b-4a59-4e6d-8b7c-600000000003",
  openAarav: "0f1d2c3b-4a59-4e6d-8b7c-600000000004",
  openMeera: "0f1d2c3b-4a59-4e6d-8b7c-600000000005",
  robowarsMeera: "0f1d2c3b-4a59-4e6d-8b7c-600000000006",
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
      // Re-seeding must leave every practice account usable with the published
      // password — even if one of these emails was registered earlier with a
      // different one (e.g. while trying out "Create account"), or the database
      // was branched from another copy. Without resetting the hash here, the seed
      // would report success while sign-in kept failing for that account.
      update: {
        firstName: person.firstName,
        lastName: person.lastName,
        passwordHash,
        deletedAt: null,
      },
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

  // A club has exactly one President (database rule since Phase 10). If you
  // handed Robotics to someone else while trying the app, re-seeding hands it
  // back to Aarav: the other person steps down to Lead first, so the two never
  // overlap. Debate is seeded with no President on purpose.
  await db.clubMember.updateMany({
    where: { clubId: robotics.id, role: "PRESIDENT", userId: { not: USER.aarav } },
    data: { role: "EVENT_MANAGER" },
  });

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

  // ── Announcements (Phase 10): members-only news, one pinned per club ──
  // Fixed ids, so re-seeding restores these exact posts (undeleting them if you
  // deleted one while trying the app) instead of piling up copies.
  const hoursAgo = (hours: number) => new Date(Date.now() - hours * 3_600_000);
  await db.announcement.updateMany({
    where: { clubId: { in: [robotics.id, debate.id] }, pinnedAt: { not: null }, id: { notIn: [ANNOUNCEMENT.buildNights] } },
    data: { pinnedAt: null },
  });
  const announcements = [
    {
      id: ANNOUNCEMENT.buildNights,
      clubId: robotics.id,
      authorId: USER.aarav,
      title: "RoboWars build nights: Tue & Thu, 6–9 pm",
      body:
        "Lab 2 is booked for us every Tuesday and Thursday until RoboWars.\n" +
        "Bring your own laptop; the soldering kit stays in the cupboard by the door.\n" +
        "Sign the sheet when you take a battery pack.",
      pinnedAt: hoursAgo(70),
      createdAt: hoursAgo(72),
    },
    {
      id: ANNOUNCEMENT.doorVolunteers,
      clubId: robotics.id,
      authorId: USER.meera,
      title: "Volunteers needed at the RoboWars door",
      body:
        "We need 4 people to scan tickets at the entrance on the day. Each shift is 30 minutes " +
        "and I'll show you the scanner beforehand. Tell me after class or reply in the WhatsApp group.",
      pinnedAt: null,
      createdAt: hoursAgo(20),
    },
    {
      id: ANNOUNCEMENT.debateNeedsPresident,
      clubId: debate.id,
      authorId: USER.nisha,
      title: "Debate Club needs a President",
      body:
        "The Debate Club has no President this term. If you would like to run it, drop by the " +
        "Student Affairs office — we can hand the club over to you from its page.",
      pinnedAt: null,
      createdAt: hoursAgo(30),
    },
  ];
  for (const { id, ...announcement } of announcements) {
    await db.announcement.upsert({
      where: { id },
      update: { ...announcement, editedAt: null, deletedAt: null },
      create: { id, tenantId: tenant.id, ...announcement },
    });
  }

  // ── Recruitment board (Phase 11) ──────────────────────────────────────────
  // Re-seeding is a reset: seeded openings get their text and status back, and
  // applications other than the seeded one are cleared from them.
  const openings = [
    {
      id: OPENING.electronics,
      clubId: robotics.id,
      createdById: USER.meera,
      title: "Electronics team member",
      description:
        "Help build the drive and weapon electronics for our RoboWars bots: wiring, motor drivers and battery packs. Build nights are Tuesday and Thursday evenings in the Robotics Lab.",
      requirements: "No experience needed — we teach soldering. Bring curiosity and two evenings a week.",
      role: "MEMBER" as const,
      questions: ["Why do you want this role?", "Have you built or repaired anything electronic? Tell us about it."],
      status: "OPEN" as const,
      closesAt: null,
      createdAt: hoursAgo(26),
    },
    {
      id: OPENING.workshopLead,
      clubId: robotics.id,
      createdById: USER.aarav,
      title: "Workshop Lead",
      description:
        "Run our beginner Line-Follower workshops: plan the sessions, book the lab, and teach first-years. As a Lead you'll also create events and post announcements.",
      requirements: "At least one robot built. Comfortable speaking in front of 30 people.",
      role: "EVENT_MANAGER" as const,
      questions: ["Why do you want this role?", "Describe a robot or project you built.", "Which weekday evenings are you free?"],
      status: "OPEN" as const,
      closesAt: utcDate(10, 12, 30), // 18:00 IST, ten days out
      createdAt: hoursAgo(20),
    },
    {
      id: OPENING.mediaClosed,
      clubId: robotics.id,
      createdById: USER.aarav,
      title: "Photography & social media",
      description: "Shoot our events and run the club Instagram.",
      requirements: null,
      role: "MEMBER" as const,
      questions: ["Why do you want this role?"],
      status: "CLOSED" as const,
      closesAt: null,
      createdAt: hoursAgo(24 * 12),
    },
    {
      id: OPENING.debaters,
      clubId: debate.id,
      createdById: USER.nisha,
      title: "New debaters — all years welcome",
      description:
        "Join the Debate Society's practice squad. Weekly motions, mock rounds and a shot at the inter-college team.",
      requirements: null,
      role: "MEMBER" as const,
      questions: ["Why do you want this role?"],
      status: "OPEN" as const,
      closesAt: null,
      createdAt: hoursAgo(8),
    },
  ];
  for (const { id, ...opening } of openings) {
    await db.roleOpening.upsert({
      where: { id },
      update: { ...opening, deletedAt: null },
      create: { id, tenantId: tenant.id, ...opening },
    });
  }
  // Openings someone added to the two demo clubs (by hand, or the smoke test)
  // go too — their applications with them (ON DELETE CASCADE).
  await db.roleOpening.deleteMany({
    where: { clubId: { in: [robotics.id, debate.id] }, id: { notIn: Object.values(OPENING) } },
  });
  await db.openingApplication.deleteMany({
    where: { openingId: { in: Object.values(OPENING) }, id: { notIn: Object.values(APPLICATION) } },
  });
  const kabirAnswers = [
    { question: "Why do you want this role?", answer: "I've been at every build night this semester and I'd love to teach the first-years what I learned." },
    { question: "Describe a robot or project you built.", answer: "A two-wheel line follower with a PID loop on an Arduino Nano — it came third at the intra-college race." },
    { question: "Which weekday evenings are you free?", answer: "Tuesday and Thursday after 5 pm." },
  ];
  await db.openingApplication.upsert({
    where: { id: APPLICATION.kabirWorkshopLead },
    update: { answers: kabirAnswers, status: "PENDING", decidedById: null, decidedAt: null, createdAt: hoursAgo(5) },
    create: {
      id: APPLICATION.kabirWorkshopLead,
      tenantId: tenant.id,
      openingId: OPENING.workshopLead,
      applicantId: USER.kabir,
      answers: kabirAnswers,
      createdAt: hoursAgo(5),
    },
  });

  // ── Events: public + members-only, past + upcoming ────────────────────────
  const WA_DEMO = "https://chat.whatsapp.com/DemoInviteCodeClubHub0001";
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
      posterUrl: "/posters/parliamentary-debate.jpg",
      tags: ["TALK", "COMPETITION"] as EventTag[],
      instagramUrl: "https://www.instagram.com/vit_debating_society/",
      whatsappUrl: null,
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
      // Posters in the seed are files in public/posters/ so the demo works
      // offline; organisers paste https links (the API refuses anything else).
      posterUrl: "/posters/robowars-2026.jpg",
      tags: ["TECHNICAL", "COMPETITION"] as EventTag[],
      instagramUrl: "https://www.instagram.com/vit_robotics_club/",
      // A dummy invite: seat holders see it, everyone else sees "get a ticket".
      whatsappUrl: WA_DEMO,
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
      posterUrl: "/posters/debug-night.jpg",
      tags: ["TECHNICAL", "WORKSHOP"] as EventTag[],
      instagramUrl: null,
      whatsappUrl: WA_DEMO,
      createdById: USER.aarav,
    },
    {
      // Deliberately anchored to "now" rather than a fixed date: this is the event
      // the door demo opens, and it must always be happening.
      id: EVENT.openHouse,
      clubId: robotics.id,
      title: "Open House — Robot Demos",
      description:
        "The lab doors are open all afternoon. Come and drive something. Badge in at the desk — this is the event the door scanner demo uses.",
      location: "Robotics Lab, Block D",
      startTime: new Date(Date.now() - 60 * 60 * 1000),
      endTime: new Date(Date.now() + 3 * 60 * 60 * 1000),
      capacity: 40,
      waitlistEnabled: true,
      status: "PUBLISHED" as const,
      isPublic: true,
      posterUrl: null,
      tags: ["TECHNICAL", "SOCIAL"] as EventTag[],
      instagramUrl: "https://www.instagram.com/vit_robotics_club/",
      whatsappUrl: null,
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
      posterUrl: null,
      tags: ["WORKSHOP"] as EventTag[],
      instagramUrl: null,
      whatsappUrl: null,
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
        posterUrl: event.posterUrl,
        tags: event.tags,
        instagramUrl: event.instagramUrl,
        whatsappUrl: event.whatsappUrl,
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

    // Today's open house: two through the door already, two still outside.
    { seat: TICKET.openAarav, eventId: EVENT.openHouse, userId: USER.aarav, status: "REGISTERED" as const, position: null },
    { seat: TICKET.openMeera, eventId: EVENT.openHouse, userId: USER.meera, status: "REGISTERED" as const, position: null },
    { seat: TICKET.openKabir, eventId: EVENT.openHouse, userId: USER.kabir, status: "REGISTERED" as const, position: null },
    { seat: TICKET.openNisha, eventId: EVENT.openHouse, userId: USER.nisha, status: "REGISTERED" as const, position: null },
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

  // ── Attendance: a door that has already been used once ────────────────────
  const checkIns = [
    { id: CHECK_IN.robowarsAarav, ticketId: TICKET.robowarsAarav.id, eventId: EVENT.robowars, offset: 12, hour: 3, minute: 52 },
    { id: CHECK_IN.debugAarav, ticketId: TICKET.debugAarav.id, eventId: EVENT.debugNight, offset: 4, hour: 13, minute: 31 },
    { id: CHECK_IN.debugMeera, ticketId: TICKET.debugMeera.id, eventId: EVENT.debugNight, offset: 4, hour: 13, minute: 34 },
    { id: CHECK_IN.robowarsMeera, ticketId: TICKET.robowarsMeera.id, eventId: EVENT.robowars, offset: 12, hour: 3, minute: 58 },
  ];

  // The open house happened today, so its check-ins are "minutes ago".
  const openHouseCheckIns = [
    { id: CHECK_IN.openAarav, ticketId: TICKET.openAarav.id, minutesAgo: 48 },
  ];

  for (const checkIn of checkIns) {
    await db.attendance.upsert({
      where: { ticketId: checkIn.ticketId },
      update: {},
      create: {
        id: checkIn.id,
        tenantId: tenant.id,
        eventId: checkIn.eventId,
        ticketId: checkIn.ticketId,
        checkInTime: utcDate(checkIn.offset, checkIn.hour, checkIn.minute),
        source: "SCANNER",
        checkedInById: USER.aarav,
        scanUuid: checkIn.id,
        deviceLabel: "seed: demo door",
      },
    });
  }

  for (const checkIn of openHouseCheckIns) {
    await db.attendance.upsert({
      where: { ticketId: checkIn.ticketId },
      update: {},
      create: {
        id: checkIn.id,
        tenantId: tenant.id,
        eventId: EVENT.openHouse,
        ticketId: checkIn.ticketId,
        checkInTime: new Date(Date.now() - checkIn.minutesAgo * 60 * 1000),
        source: "SCANNER",
        checkedInById: USER.aarav,
        scanUuid: checkIn.id,
        deviceLabel: "seed: demo door",
      },
    });
  }

  console.log(`
  Seed complete ────────────────────────────────────────────────
  Tenant   ${tenant.name}  (${tenant.timezone})

  Demo accounts — password for all: ${DEMO_PASSWORD}

    aarav.president@vit.ac.in   Tenant Owner   · President, Robotics Club · Member, Debate Society
    meera.manager@vit.ac.in     Tenant Member  · Lead, Robotics Club · Member, Debate Society
    kabir.member@vit.ac.in      Tenant Member  · Member in both clubs
    dean.admin@vit.ac.in        Tenant Admin   · no club role (cross-club visibility)

  Clubs    2   Events   5 (4 published · 1 draft members-only)
  Tickets  12 (11 seats held · 1 person queuing for a full room)
  Door     5 checked in — Open House (today) 1 of 4 · Debug Night 2 of 3 · RoboWars 2 of 4
  Invites  1   public demo link: join/${DEMO_INVITE_TOKEN}
  Announcements 3 (1 pinned in Robotics · Debate has no President yet)
  Openings 4 (3 open · 1 closed)   Applications 1 (Kabir → Workshop Lead, waiting)
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
