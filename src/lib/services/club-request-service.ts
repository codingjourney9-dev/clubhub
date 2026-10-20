import "server-only";

import { ApiError } from "@/lib/api/response";
import { db } from "@/lib/db/client";
import { isDemoModeEnabled } from "@/lib/demo/mode";
import {
  CODE_TTL_MS,
  MAX_CODE_ATTEMPTS,
  MAX_PENDING_REQUESTS,
  generateVerificationCode,
  hashVerificationCode,
  matchCollegeByEmail,
  verificationHashesMatch,
} from "@/lib/domain/club-verification";
import { serverEnv } from "@/lib/env";
import { logEvent } from "@/lib/observability/logger";
import { findAvailableSlug } from "@/lib/slug";
import { createClub } from "@/lib/services/club-service";
import { ensureTenantMembership } from "@/lib/services/invite-service";
import type { RequestClubInput } from "@/lib/validation/club-request";
import { Prisma } from "@/generated/prisma/client";

/**
 * Phase 12: any signed-in student can start a club.
 *
 *   1. The student fills in the club and their professor's email.
 *   2. The club is created PENDING with the student as President, and a 6-digit
 *      code is "sent" to the professor.
 *   3. The student types the code in → the club goes live (ACTIVE) and the
 *      student joins the college.
 *
 * There is no real email provider, so "sending" means: written to the server log
 * always, and ALSO shown on the pending page when the app runs in development or
 * demo mode. A real deployment (Vercel, DEMO_MODE=off) shows it nowhere but the
 * log — exactly the trade-off agreed for this phase.
 *
 * A PENDING club is locked: `requireClubAccess` only ever finds ACTIVE clubs, so
 * every events / openings / invites / members API answers 404 for it. The only
 * doors in are the functions below, open to the requesting student and (to look
 * and to remove, never to approve) the college's Owners and Admins.
 */

/** Seconds a student must wait between "send a new code" clicks. */
export const RESEND_COOLDOWN_SECONDS = 30;

export interface CollegeChoice {
  readonly id: string;
  readonly name: string;
  readonly domain: string | null;
}

/** Whether codes may be displayed on screen (never on a real deployment). */
export function revealsCodesOnScreen(): boolean {
  return process.env.NODE_ENV !== "production" || isDemoModeEnabled();
}

const displayName = (user: { firstName: string | null; lastName: string | null; email: string }) =>
  [user.firstName, user.lastName].filter(Boolean).join(" ") || user.email;

// ─────────────────────────────────────────────────────────────────────────────
// Starting a club
// ─────────────────────────────────────────────────────────────────────────────

export interface StartClubContext {
  /** The college that owns the student's email domain, if any. */
  readonly matchedCollege: CollegeChoice | null;
  /** Colleges this student may start a club in (see `allowedColleges`). */
  readonly colleges: readonly CollegeChoice[];
  /** Colleges where the student is Owner/Admin: clubs there go live at once. */
  readonly adminCollegeIds: readonly string[];
  readonly pendingCount: number;
  readonly maxPending: number;
}

/**
 * Everything the "Start a club" form needs, and the same rules `requestClub`
 * enforces — computed in one place so the form can never offer a choice the
 * server would then refuse.
 *
 * Which colleges are allowed:
 *   • email matches a college  → that college (plus any college they're already in)
 *   • email matches none       → any college, picked from the list
 */
export async function loadStartClubContext(user: { id: string; email: string }): Promise<StartClubContext> {
  const [colleges, memberships, pendingCount] = await Promise.all([
    db.tenant.findMany({
      where: { deletedAt: null },
      orderBy: { name: "asc" },
      select: { id: true, name: true, domain: true },
    }),
    db.tenantMember.findMany({
      where: { userId: user.id, deletedAt: null, tenant: { deletedAt: null } },
      select: { tenantId: true, role: true },
    }),
    countPendingRequests(db, user.id),
  ]);

  const matchedCollege = matchCollegeByEmail(user.email, colleges);
  const memberOf = new Set(memberships.map((membership) => membership.tenantId));
  const allowed = matchedCollege
    ? colleges.filter((college) => college.id === matchedCollege.id || memberOf.has(college.id))
    : colleges;

  return {
    matchedCollege,
    colleges: allowed,
    adminCollegeIds: memberships
      .filter((membership) => membership.role === "OWNER" || membership.role === "ADMIN")
      .map((membership) => membership.tenantId),
    pendingCount,
    maxPending: MAX_PENDING_REQUESTS,
  };
}

function countPendingRequests(client: Prisma.TransactionClient | typeof db, userId: string) {
  return client.club.count({
    where: {
      status: "PENDING",
      deletedAt: null,
      members: { some: { userId, role: "PRESIDENT", deletedAt: null } },
    },
  });
}

export type RequestClubResult =
  | { readonly status: "ACTIVE"; readonly clubId: string; readonly name: string }
  | {
      readonly status: "PENDING";
      readonly clubId: string;
      readonly name: string;
      /** Only when codes are revealed on screen (dev / demo). */
      readonly demoCode: string | null;
    };

/**
 * Starts a club. A college Owner/Admin starting one in their own college gets a
 * live club immediately; everybody else gets a PENDING club and a code.
 *
 * @throws 422 no college could be determined, or professor email missing/own
 * @throws 409 the student already has the maximum number of pending clubs
 */
export async function requestClub(
  user: { id: string; email: string },
  input: RequestClubInput,
): Promise<RequestClubResult> {
  const context = await loadStartClubContext(user);
  const tenantId = input.tenantId ?? context.matchedCollege?.id;

  if (!tenantId) {
    throw new ApiError("VALIDATION_ERROR", "Choose your college from the list.", {
      details: { tenantId: ["Your email address doesn't match a college, so pick yours from the list."] },
    });
  }

  const college = context.colleges.find((candidate) => candidate.id === tenantId);
  if (!college) {
    const message = context.matchedCollege
      ? `Your email address belongs to ${context.matchedCollege.name}, so your club goes there.`
      : "That college was not found.";
    throw new ApiError("VALIDATION_ERROR", message, { details: { tenantId: [message] } });
  }

  // College Owners/Admins already run the college: no professor needed.
  if (context.adminCollegeIds.includes(tenantId)) {
    const club = await createClub(tenantId, user.id, {
      tenantId,
      name: input.name,
      description: input.description,
      category: input.category,
    });
    return { status: "ACTIVE", clubId: club.id, name: club.name };
  }

  const facultyEmail = input.facultyEmail;
  if (!facultyEmail) {
    throw new ApiError("VALIDATION_ERROR", "Enter your professor's email address.", {
      details: { facultyEmail: ["A professor confirms the club with a code sent to this address."] },
    });
  }
  if (facultyEmail === user.email.trim().toLowerCase()) {
    throw new ApiError("VALIDATION_ERROR", "Enter your professor's email, not your own.", {
      details: { facultyEmail: ["This is your own email. The code must go to a professor."] },
    });
  }

  const slug = await findAvailableSlug(input.name, async (candidate) => {
    const existing = await db.club.findFirst({ where: { tenantId, slug: candidate }, select: { id: true } });
    return existing !== null;
  });

  const code = generateVerificationCode();
  const now = new Date();

  let club: { id: string; name: string };
  try {
    club = await db.$transaction(async (tx) => {
      // Lock the student's row so two simultaneous requests can't both pass the
      // "at most two pending" check below.
      await tx.$queryRaw`SELECT id FROM users WHERE id = ${user.id}::uuid FOR UPDATE`;
      if ((await countPendingRequests(tx, user.id)) >= MAX_PENDING_REQUESTS) {
        throw new ApiError(
          "CONFLICT",
          `You already have ${MAX_PENDING_REQUESTS} clubs waiting for a professor. Finish or cancel one first.`,
        );
      }

      const created = await tx.club.create({
        data: {
          tenantId,
          name: input.name,
          slug,
          description: input.description ?? null,
          category: input.category ?? null,
          status: "PENDING",
          facultyName: input.facultyName || null,
          facultyEmail,
        },
        select: { id: true, name: true },
      });

      await tx.clubMember.create({ data: { clubId: created.id, userId: user.id, role: "PRESIDENT" } });
      await tx.clubVerification.create({
        data: {
          clubId: created.id,
          tenantId,
          email: facultyEmail,
          ...codeFields(created.id, code, now),
        },
      });
      return created;
    });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      throw new ApiError("CONFLICT", "A club with that name was just created in this college. Try again.");
    }
    throw error;
  }

  deliverCode({ clubId: club.id, clubName: club.name, email: facultyEmail, code, reason: "requested" });
  logEvent("info", "club.requested", { clubId: club.id, tenantId, userId: user.id });

  return {
    status: "PENDING",
    clubId: club.id,
    name: club.name,
    demoCode: revealsCodesOnScreen() ? code : null,
  };
}

/** The columns written whenever a fresh code is issued (first send or resend). */
function codeFields(clubId: string, code: string, now: Date) {
  return {
    codeHash: hashVerificationCode(serverEnv().AUTH_SECRET, clubId, code),
    demoCode: revealsCodesOnScreen() ? code : null,
    attempts: 0,
    expiresAt: new Date(now.getTime() + CODE_TTL_MS),
    lastSentAt: now,
    consumedAt: null,
  };
}

/**
 * "Sends" the code. There is no email provider in this project, so the server
 * log is the delivery channel — on Vercel that's the Logs tab.
 */
function deliverCode(input: { clubId: string; clubName: string; email: string; code: string; reason: string }) {
  logEvent("info", "club.verification_code", {
    clubId: input.clubId,
    club: input.clubName,
    to: input.email,
    code: input.code,
    reason: input.reason,
    note: "No email is sent: read the code from this log line.",
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// The pending club
// ─────────────────────────────────────────────────────────────────────────────

export interface PendingClubView {
  readonly id: string;
  readonly tenantId: string;
  readonly name: string;
  readonly category: string | null;
  readonly description: string | null;
  readonly collegeName: string;
  readonly timezone: string;
  readonly facultyName: string | null;
  readonly facultyEmail: string;
  readonly createdAt: Date;
  readonly requester: { readonly id: string; readonly name: string; readonly email: string } | null;
  /** Who is looking: the student who asked, or a college Owner/Admin. */
  readonly viewer: "requester" | "admin";
  readonly code: {
    readonly expiresAt: Date;
    readonly lastSentAt: Date;
    readonly attemptsLeft: number;
    /** Shown only to the requester, and only when codes are revealed on screen. */
    readonly demoCode: string | null;
  } | null;
}

/**
 * The pending club as `userId` may see it, or null when they may not see it at
 * all (it doesn't exist, isn't pending, or they're neither the student who asked
 * nor an admin of its college). Null becomes a plain 404 — a pending club is
 * invisible to everyone else.
 */
export async function getPendingClubView(clubId: string, userId: string): Promise<PendingClubView | null> {
  const club = await db.club.findFirst({
    where: { id: clubId, status: "PENDING", deletedAt: null, tenant: { deletedAt: null } },
    select: {
      id: true,
      tenantId: true,
      name: true,
      category: true,
      description: true,
      facultyName: true,
      facultyEmail: true,
      createdAt: true,
      tenant: {
        select: {
          name: true,
          timezone: true,
          members: { where: { userId, deletedAt: null }, select: { role: true } },
        },
      },
      members: {
        where: { role: "PRESIDENT", deletedAt: null },
        select: { user: { select: { id: true, firstName: true, lastName: true, email: true } } },
      },
      verification: {
        select: { expiresAt: true, lastSentAt: true, attempts: true, demoCode: true, consumedAt: true },
      },
    },
  });
  if (!club) return null;

  const requester = club.members[0]?.user ?? null;
  const tenantRole = club.tenant.members[0]?.role;
  const viewer =
    requester?.id === userId ? "requester" : tenantRole === "OWNER" || tenantRole === "ADMIN" ? "admin" : null;
  if (!viewer) return null;

  const verification = club.verification && !club.verification.consumedAt ? club.verification : null;

  return {
    id: club.id,
    tenantId: club.tenantId,
    name: club.name,
    category: club.category,
    description: club.description,
    collegeName: club.tenant.name,
    timezone: club.tenant.timezone,
    facultyName: club.facultyName,
    facultyEmail: club.facultyEmail ?? "",
    createdAt: club.createdAt,
    requester: requester ? { id: requester.id, name: displayName(requester), email: requester.email } : null,
    viewer,
    code: verification
      ? {
          expiresAt: verification.expiresAt,
          lastSentAt: verification.lastSentAt,
          attemptsLeft: Math.max(MAX_CODE_ATTEMPTS - verification.attempts, 0),
          demoCode: viewer === "requester" && revealsCodesOnScreen() ? verification.demoCode : null,
        }
      : null,
  };
}

/** The pending club, or 404; and 403 when an admin tries a requester-only step. */
async function requirePendingClub(clubId: string, userId: string, need: "requester" | "requester-or-admin") {
  const view = await getPendingClubView(clubId, userId);
  if (!view) throw ApiError.notFound("That club request was not found.");
  if (need === "requester" && view.viewer !== "requester") {
    throw ApiError.forbidden("Only the student who asked for this club can enter or resend its code.");
  }
  return view;
}

type VerifyOutcome =
  | { kind: "ok" }
  | { kind: "gone" }
  | { kind: "no-code" }
  | { kind: "used-up" }
  | { kind: "expired" }
  | { kind: "wrong"; attemptsLeft: number };

/**
 * Checks the professor's code. Right → the club goes live and the student joins
 * its college. Wrong → one try used; five wrong tries kill the code.
 *
 * The attempt counter is updated inside a row lock, so ten requests fired at
 * once still get exactly five tries between them — and the wrong-try increment
 * is committed BEFORE the error is thrown (throwing inside the transaction
 * would roll it back and hand out unlimited guesses).
 *
 * @throws 422 wrong, expired or used-up code (message says what to do next)
 */
export async function verifyClubCode(
  clubId: string,
  userId: string,
  code: string,
): Promise<{ clubId: string; name: string }> {
  const view = await requirePendingClub(clubId, userId, "requester");
  const secret = serverEnv().AUTH_SECRET;

  const outcome = await db.$transaction(async (tx): Promise<VerifyOutcome> => {
    const locked = await tx.$queryRaw<{ status: string; deleted_at: Date | null }[]>`
      SELECT status, deleted_at FROM clubs WHERE id = ${clubId}::uuid FOR UPDATE`;
    if (locked[0]?.status !== "PENDING" || locked[0].deleted_at) return { kind: "gone" };

    const verification = await tx.clubVerification.findUnique({ where: { clubId } });
    if (!verification || verification.consumedAt) return { kind: "no-code" };
    if (verification.attempts >= MAX_CODE_ATTEMPTS) return { kind: "used-up" };
    if (verification.expiresAt.getTime() <= Date.now()) return { kind: "expired" };

    if (!verificationHashesMatch(hashVerificationCode(secret, clubId, code), verification.codeHash)) {
      const attempts = verification.attempts + 1;
      await tx.clubVerification.update({ where: { clubId }, data: { attempts } });
      return { kind: "wrong", attemptsLeft: Math.max(MAX_CODE_ATTEMPTS - attempts, 0) };
    }

    const now = new Date();
    await tx.clubVerification.update({ where: { clubId }, data: { consumedAt: now, demoCode: null } });
    await tx.club.update({ where: { id: clubId }, data: { status: "ACTIVE", verifiedAt: now } });
    await ensureTenantMembership(tx, view.tenantId, userId);
    return { kind: "ok" };
  });

  const fail = (message: string): never => {
    throw new ApiError("VALIDATION_ERROR", message, { details: { code: [message] } });
  };

  switch (outcome.kind) {
    case "ok":
      logEvent("info", "club.verified", { clubId, tenantId: view.tenantId, userId });
      return { clubId, name: view.name };
    case "gone":
      throw ApiError.notFound("That club request was not found.");
    case "no-code":
      return fail("There is no code waiting. Press “Send a new code”.");
    case "used-up":
      return fail(`That code had ${MAX_CODE_ATTEMPTS} wrong tries and no longer works. Press “Send a new code”.`);
    case "expired":
      return fail("That code has expired. Press “Send a new code”.");
    case "wrong":
      return fail(
        outcome.attemptsLeft === 0
          ? "That code isn't right, and that was the last try. Press “Send a new code”."
          : `That code isn't right. ${outcome.attemptsLeft} ${outcome.attemptsLeft === 1 ? "try" : "tries"} left.`,
      );
  }
}

/**
 * Issues a fresh code (the old one stops working) to the professor email given
 * when the club was requested.
 *
 * @throws 429 asked again within RESEND_COOLDOWN_SECONDS
 */
export async function resendClubCode(
  clubId: string,
  userId: string,
): Promise<{ expiresAt: Date; demoCode: string | null }> {
  const view = await requirePendingClub(clubId, userId, "requester");

  if (view.code) {
    const waited = (Date.now() - view.code.lastSentAt.getTime()) / 1000;
    if (waited < RESEND_COOLDOWN_SECONDS) {
      const retryAfter = Math.ceil(RESEND_COOLDOWN_SECONDS - waited);
      throw new ApiError(
        "RATE_LIMITED",
        `A code was sent moments ago. You can ask for another in ${retryAfter} second${retryAfter === 1 ? "" : "s"}.`,
        { headers: { "Retry-After": String(retryAfter) }, details: { retryAfterSeconds: retryAfter } },
      );
    }
  }

  const code = generateVerificationCode();
  const fields = codeFields(clubId, code, new Date());
  await db.clubVerification.upsert({
    where: { clubId },
    create: { clubId, tenantId: view.tenantId, email: view.facultyEmail, ...fields },
    update: fields,
  });

  deliverCode({ clubId, clubName: view.name, email: view.facultyEmail, code, reason: "resent" });
  return { expiresAt: fields.expiresAt, demoCode: fields.demoCode };
}

/**
 * Withdraws a pending club: by the student who asked, or removed by a college
 * Owner/Admin. Soft-deleted like everything else, so it's recoverable.
 */
export async function cancelClubRequest(clubId: string, userId: string): Promise<{ removedBy: "requester" | "admin" }> {
  const view = await requirePendingClub(clubId, userId, "requester-or-admin");
  const now = new Date();

  await db.$transaction(async (tx) => {
    const updated = await tx.club.updateMany({
      where: { id: clubId, status: "PENDING", deletedAt: null },
      data: { deletedAt: now },
    });
    if (updated.count === 0) throw ApiError.notFound("That club request was not found.");
    await tx.clubMember.updateMany({ where: { clubId, deletedAt: null }, data: { deletedAt: now } });
    await tx.clubVerification.deleteMany({ where: { clubId } });
  });

  logEvent("info", "club.request_cancelled", { clubId, tenantId: view.tenantId, userId, by: view.viewer });
  return { removedBy: view.viewer };
}

// ─────────────────────────────────────────────────────────────────────────────
// Lists
// ─────────────────────────────────────────────────────────────────────────────

export interface PendingRequestRow {
  readonly id: string;
  readonly name: string;
  readonly collegeName: string;
  readonly timezone: string;
  readonly facultyEmail: string;
  readonly requesterName: string;
  readonly requesterEmail: string;
  readonly createdAt: Date;
}

/** Pending clubs in every college where `userId` is Owner or Admin. */
export async function listPendingRequestsForAdmin(userId: string): Promise<PendingRequestRow[]> {
  const clubs = await db.club.findMany({
    where: {
      status: "PENDING",
      deletedAt: null,
      tenant: {
        deletedAt: null,
        members: { some: { userId, deletedAt: null, role: { in: ["OWNER", "ADMIN"] } } },
      },
    },
    orderBy: { createdAt: "asc" },
    select: {
      id: true,
      name: true,
      facultyEmail: true,
      createdAt: true,
      tenant: { select: { name: true, timezone: true } },
      members: {
        where: { role: "PRESIDENT", deletedAt: null },
        select: { user: { select: { firstName: true, lastName: true, email: true } } },
      },
    },
  });

  return clubs.map((club) => {
    const requester = club.members[0]?.user;
    return {
      id: club.id,
      name: club.name,
      collegeName: club.tenant.name,
      timezone: club.tenant.timezone,
      facultyEmail: club.facultyEmail ?? "",
      requesterName: requester ? displayName(requester) : "Unknown",
      requesterEmail: requester?.email ?? "",
      createdAt: club.createdAt,
    };
  });
}
