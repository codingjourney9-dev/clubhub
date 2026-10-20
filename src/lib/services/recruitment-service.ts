import "server-only";

import { cache } from "react";

import { ApiError } from "@/lib/api/response";
import { canDecideApplication, canManageOpening, type Actor } from "@/lib/auth/rbac";
import { db } from "@/lib/db/client";
import { applyBlockedReason, isOpeningOpen, openingState, type OpeningState } from "@/lib/domain/openings";
import { wallClockToUtc } from "@/lib/format/date";
import { ensureTenantMembership } from "@/lib/services/invite-service";
import type { CreateOpeningInput, UpdateOpeningInput } from "@/lib/validation/opening";
import { Prisma } from "@/generated/prisma/client";
import type { ApplicationStatus, ClubRole } from "@/generated/prisma/enums";

/**
 * Recruitment board (Phase 11): clubs post openings, any signed-in student
 * (from any college) applies by answering the opening's questions, and the
 * club accepts or rejects. Accepting grants the role.
 *
 * Who may manage which opening follows the role it offers (`canManageOpening`):
 * Member openings — Leads and the President; Lead openings — the President.
 */

type Tx = Prisma.TransactionClient;

const displayName = (user: { firstName: string | null; lastName: string | null; email: string }) =>
  [user.firstName, user.lastName].filter(Boolean).join(" ") || user.email;

/** Openings live under live clubs in live colleges. */
const liveClub = { deletedAt: null, tenant: { deletedAt: null } } as const;

// ─────────────────────────────────────────────────────────────────────────────
// Reading (public)
// ─────────────────────────────────────────────────────────────────────────────

const publicSelect = {
  id: true,
  title: true,
  description: true,
  requirements: true,
  role: true,
  questions: true,
  status: true,
  closesAt: true,
  createdAt: true,
  club: {
    select: {
      id: true,
      name: true,
      category: true,
      tenant: { select: { name: true, timezone: true } },
    },
  },
  createdBy: { select: { firstName: true, lastName: true, email: true } },
} satisfies Prisma.RoleOpeningSelect;

type PublicRow = Prisma.RoleOpeningGetPayload<{ select: typeof publicSelect }>;

export interface PublicOpening {
  readonly id: string;
  readonly title: string;
  readonly description: string;
  readonly requirements: string | null;
  readonly role: "MEMBER" | "EVENT_MANAGER";
  readonly questions: readonly string[];
  readonly state: OpeningState;
  readonly closesAt: Date | null;
  readonly createdAt: Date;
  readonly postedBy: string;
  readonly club: {
    readonly id: string;
    readonly name: string;
    readonly category: string | null;
    readonly collegeName: string;
    readonly timeZone: string;
  };
}

function toPublic(row: PublicRow, now: Date): PublicOpening {
  return {
    id: row.id,
    title: row.title,
    description: row.description,
    requirements: row.requirements,
    role: row.role === "EVENT_MANAGER" ? "EVENT_MANAGER" : "MEMBER",
    questions: row.questions,
    state: openingState(row, now),
    closesAt: row.closesAt,
    createdAt: row.createdAt,
    // Only a name — the poster's email never appears on a public page.
    postedBy: [row.createdBy.firstName, row.createdBy.lastName].filter(Boolean).join(" ") || "A club organiser",
    club: {
      id: row.club.id,
      name: row.club.name,
      category: row.club.category,
      collegeName: row.club.tenant.name,
      timeZone: row.club.tenant.timezone,
    },
  };
}

/** Where "open" is decided in SQL: status OPEN and no date, or a date still ahead. */
function openWhere(now: Date): Prisma.RoleOpeningWhereInput {
  return { status: "OPEN", OR: [{ closesAt: null }, { closesAt: { gt: now } }] };
}

/** Every college's open roles, newest first — the public board. */
export async function listOpenOpenings(
  options: { limit?: number; clubId?: string } = {},
): Promise<PublicOpening[]> {
  const now = new Date();
  const rows = await db.roleOpening.findMany({
    where: {
      deletedAt: null,
      club: liveClub,
      ...openWhere(now),
      ...(options.clubId ? { clubId: options.clubId } : {}),
    },
    orderBy: { createdAt: "desc" },
    take: options.limit ?? 24,
    select: publicSelect,
  });
  return rows.map((row) => toPublic(row, now));
}

/** One opening, open or closed — public. Null when it doesn't exist (or was deleted). */
export const getPublicOpening = cache(async (openingId: string): Promise<PublicOpening | null> => {
  const row = await db.roleOpening.findFirst({
    where: { id: openingId, deletedAt: null, club: liveClub },
    select: publicSelect,
  });
  return row ? toPublic(row, new Date()) : null;
});

// ─────────────────────────────────────────────────────────────────────────────
// Managing openings (club side)
// ─────────────────────────────────────────────────────────────────────────────

export interface ClubOpeningRow extends PublicOpening {
  readonly pendingCount: number;
  readonly totalCount: number;
  /** The viewer may edit/close it and review its applications. */
  readonly canManage: boolean;
}

/** All of a club's openings (open first), with application counts for the people who review them. */
export async function listClubOpenings(
  clubId: string,
  tenantId: string,
  actor: Actor,
): Promise<ClubOpeningRow[]> {
  const now = new Date();
  const rows = await db.roleOpening.findMany({
    where: { clubId, tenantId, deletedAt: null },
    orderBy: { createdAt: "desc" },
    select: {
      ...publicSelect,
      _count: { select: { applications: true } },
      applications: { where: { status: "PENDING" }, select: { id: true } },
    },
  });
  return rows
    .map((row) => {
      const manage = canManageOpening(actor, row.role);
      return {
        ...toPublic(row, now),
        // Counts are organiser information; everyone else gets zeros.
        pendingCount: manage ? row.applications.length : 0,
        totalCount: manage ? row._count.applications : 0,
        canManage: manage,
      };
    })
    .sort((a, b) => Number(b.state === "open") - Number(a.state === "open"));
}

/** Reads the form's wall clock in the college's timezone; must be in the future. */
function parseClosesAt(value: string | null | undefined, timeZone: string): Date | null | undefined {
  if (value === undefined) return undefined;
  if (value === null) return null;
  const instant = wallClockToUtc(value, timeZone);
  if (!instant) {
    throw new ApiError("VALIDATION_ERROR", "That time doesn't exist (the clocks change then).", {
      details: { closesAt: ["Pick a different time."] },
    });
  }
  if (instant.getTime() <= Date.now()) {
    throw new ApiError("VALIDATION_ERROR", "The closing date has to be in the future.", {
      details: { closesAt: ["Pick a date in the future, or leave it empty."] },
    });
  }
  return instant;
}

export async function createOpening(args: {
  readonly clubId: string;
  readonly tenantId: string;
  readonly timeZone: string;
  readonly actor: Actor & { readonly userId: string };
  readonly input: CreateOpeningInput;
}) {
  const { clubId, tenantId, timeZone, actor, input } = args;
  if (!canManageOpening(actor, input.role)) {
    throw ApiError.forbidden(
      input.role === "EVENT_MANAGER"
        ? "Only the club's President can post a Lead opening."
        : "Your role can't post openings for this club.",
    );
  }
  return db.roleOpening.create({
    data: {
      tenantId,
      clubId,
      createdById: actor.userId,
      title: input.title,
      description: input.description,
      requirements: input.requirements ?? null,
      role: input.role,
      questions: input.questions,
      closesAt: parseClosesAt(input.closesAt, timeZone) ?? null,
    },
    select: { id: true, title: true, role: true, status: true, closesAt: true },
  });
}

async function findManageableOpening(clubId: string, tenantId: string, openingId: string, actor: Actor) {
  const opening = await db.roleOpening.findFirst({
    where: { id: openingId, clubId, tenantId, deletedAt: null },
    select: { id: true, role: true, title: true, questions: true },
  });
  if (!opening) throw ApiError.notFound("That opening was not found.");
  if (!canManageOpening(actor, opening.role)) {
    throw ApiError.forbidden("Only the club's President can manage a Lead opening.");
  }
  return opening;
}

/** Edit text, questions or closing date; close or reopen. */
export async function updateOpening(args: {
  readonly clubId: string;
  readonly tenantId: string;
  readonly timeZone: string;
  readonly actor: Actor;
  readonly openingId: string;
  readonly input: UpdateOpeningInput;
}) {
  const { clubId, tenantId, timeZone, actor, openingId, input } = args;
  const opening = await findManageableOpening(clubId, tenantId, openingId, actor);

  return db.roleOpening.update({
    where: { id: opening.id },
    data: {
      ...(input.title !== undefined ? { title: input.title } : {}),
      ...(input.description !== undefined ? { description: input.description } : {}),
      ...(input.requirements !== undefined ? { requirements: input.requirements } : {}),
      ...(input.questions !== undefined ? { questions: input.questions } : {}),
      ...(input.closesAt !== undefined ? { closesAt: parseClosesAt(input.closesAt, timeZone) } : {}),
      ...(input.status !== undefined ? { status: input.status } : {}),
    },
    select: { id: true, title: true, role: true, status: true, closesAt: true },
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// Applying (student side)
// ─────────────────────────────────────────────────────────────────────────────

export interface Answer {
  readonly question: string;
  readonly answer: string;
}

function readAnswers(value: Prisma.JsonValue): Answer[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) =>
    item && typeof item === "object" && !Array.isArray(item) && typeof item.question === "string" && typeof item.answer === "string"
      ? [{ question: item.question, answer: item.answer }]
      : [],
  );
}

/** What the opening page needs to know about the viewer. */
export async function getApplicantView(openingId: string, userId: string) {
  const opening = await db.roleOpening.findFirst({
    where: { id: openingId, deletedAt: null },
    select: { clubId: true, role: true },
  });
  if (!opening) return null;

  const [membership, application] = await Promise.all([
    db.clubMember.findFirst({
      where: { clubId: opening.clubId, userId, deletedAt: null },
      select: { role: true },
    }),
    db.openingApplication.findUnique({
      where: { openingId_applicantId: { openingId, applicantId: userId } },
      select: { id: true, status: true, createdAt: true, answers: true },
    }),
  ]);

  return {
    blockedReason: applyBlockedReason(membership?.role ?? null, opening.role === "EVENT_MANAGER" ? "EVENT_MANAGER" : "MEMBER"),
    application: application
      ? { ...application, answers: readAnswers(application.answers) }
      : null,
  };
}

/**
 * Sends an application. Rules:
 *  • the opening must be taking applications (open, date not passed);
 *  • one per person per opening (a unique index backs this) — a WITHDRAWN one
 *    may be sent again, an accepted or rejected one may not;
 *  • someone already holding that role (or a higher one) in the club can't apply;
 *  • exactly one answer per question; the questions are copied in with them.
 */
export async function applyToOpening(args: {
  readonly openingId: string;
  readonly applicantId: string;
  readonly answers: readonly string[];
}) {
  const { openingId, applicantId, answers } = args;

  try {
    return await db.$transaction(async (tx) => {
      // Lock the opening: closing it and applying to it can't interleave.
      const locked = await tx.$queryRaw<{ id: string }[]>`
        SELECT id FROM "role_openings" WHERE id = ${openingId}::uuid AND deleted_at IS NULL FOR UPDATE
      `;
      if (locked.length === 0) throw ApiError.notFound("That opening was not found.");

      const opening = await tx.roleOpening.findUniqueOrThrow({
        where: { id: openingId },
        select: {
          id: true,
          tenantId: true,
          clubId: true,
          role: true,
          status: true,
          closesAt: true,
          questions: true,
          club: { select: { deletedAt: true, tenant: { select: { deletedAt: true } } } },
        },
      });
      if (opening.club.deletedAt || opening.club.tenant.deletedAt) {
        throw ApiError.notFound("That opening was not found.");
      }
      if (!isOpeningOpen(opening)) {
        throw new ApiError("CONFLICT", "This opening has closed — it isn't taking applications any more.");
      }

      const membership = await tx.clubMember.findFirst({
        where: { clubId: opening.clubId, userId: applicantId, deletedAt: null },
        select: { role: true },
      });
      const blocked = applyBlockedReason(
        membership?.role ?? null,
        opening.role === "EVENT_MANAGER" ? "EVENT_MANAGER" : "MEMBER",
      );
      if (blocked) throw new ApiError("CONFLICT", `${blocked} There's no need to apply.`);

      if (answers.length !== opening.questions.length) {
        throw new ApiError("VALIDATION_ERROR", "Answer every question.", {
          details: { answers: [`This opening has ${opening.questions.length} question(s).`] },
        });
      }
      const snapshot: Answer[] = opening.questions.map((question, index) => ({
        question,
        answer: answers[index] as string,
      }));

      const existing = await tx.openingApplication.findUnique({
        where: { openingId_applicantId: { openingId, applicantId } },
        select: { id: true, status: true },
      });
      if (existing && existing.status !== "WITHDRAWN") {
        throw new ApiError(
          "CONFLICT",
          existing.status === "PENDING"
            ? "You've already applied — the club hasn't decided yet."
            : "You've already applied to this opening and the club has decided.",
        );
      }

      const select = { id: true, status: true, createdAt: true } as const;
      if (existing) {
        // Applying again after withdrawing: the same row, fresh answers.
        return tx.openingApplication.update({
          where: { id: existing.id },
          data: { answers: snapshot as unknown as Prisma.InputJsonValue, status: "PENDING", createdAt: new Date() },
          select,
        });
      }
      return tx.openingApplication.create({
        data: {
          tenantId: opening.tenantId,
          openingId,
          applicantId,
          answers: snapshot as unknown as Prisma.InputJsonValue,
        },
        select,
      });
    });
  } catch (error) {
    // Two clicks at once: the unique index lets exactly one through.
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      throw new ApiError("CONFLICT", "You've already applied — the club hasn't decided yet.");
    }
    throw error;
  }
}

/** Takes back a pending application. Only the applicant, only while pending. */
export async function withdrawApplication(applicationId: string, applicantId: string) {
  const application = await db.openingApplication.findFirst({
    where: { id: applicationId, applicantId },
    select: { id: true, status: true },
  });
  // Someone else's application looks exactly like a missing one.
  if (!application) throw ApiError.notFound("That application was not found.");
  if (application.status !== "PENDING") {
    throw new ApiError("CONFLICT", "Only an application that's still waiting can be withdrawn.");
  }
  const result = await db.openingApplication.updateMany({
    where: { id: application.id, status: "PENDING" },
    data: { status: "WITHDRAWN" },
  });
  if (result.count === 0) {
    throw new ApiError("CONFLICT", "The club decided just now — reload to see the result.");
  }
  return { id: application.id, status: "WITHDRAWN" as const };
}

/** "My applications": everything this person has sent, newest first. */
export async function listMyApplications(userId: string) {
  const rows = await db.openingApplication.findMany({
    where: { applicantId: userId },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      status: true,
      createdAt: true,
      decidedAt: true,
      opening: {
        select: {
          id: true,
          title: true,
          role: true,
          status: true,
          closesAt: true,
          deletedAt: true,
          club: { select: { id: true, name: true, tenant: { select: { name: true, timezone: true } } } },
        },
      },
    },
  });
  return rows.map((row) => ({
    id: row.id,
    status: row.status,
    createdAt: row.createdAt,
    decidedAt: row.decidedAt,
    opening: {
      id: row.opening.id,
      title: row.opening.title,
      role: row.opening.role,
      removed: row.opening.deletedAt !== null,
      clubId: row.opening.club.id,
      clubName: row.opening.club.name,
      collegeName: row.opening.club.tenant.name,
      timeZone: row.opening.club.tenant.timezone,
    },
  }));
}

// ─────────────────────────────────────────────────────────────────────────────
// Reviewing (club side)
// ─────────────────────────────────────────────────────────────────────────────

export interface ReviewApplication {
  readonly id: string;
  readonly status: ApplicationStatus;
  readonly createdAt: Date;
  readonly decidedAt: Date | null;
  readonly decidedBy: string | null;
  readonly answers: readonly Answer[];
  readonly applicant: {
    readonly id: string;
    readonly displayName: string;
    readonly email: string;
    /** Their colleges — they may come from anywhere. */
    readonly colleges: readonly string[];
    readonly currentRole: ClubRole | null;
  };
}

/** One opening's applications, for the people allowed to decide them. Pending first. */
export async function listOpeningApplications(args: {
  readonly clubId: string;
  readonly tenantId: string;
  readonly actor: Actor;
  readonly openingId: string;
}): Promise<{ opening: { id: string; title: string; role: ClubRole; questions: string[] }; applications: ReviewApplication[] }> {
  const { clubId, tenantId, actor, openingId } = args;
  const opening = await findManageableOpening(clubId, tenantId, openingId, actor);

  const rows = await db.openingApplication.findMany({
    where: { openingId: opening.id, tenantId },
    orderBy: [{ createdAt: "asc" }],
    select: {
      id: true,
      status: true,
      createdAt: true,
      decidedAt: true,
      answers: true,
      decidedBy: { select: { firstName: true, lastName: true, email: true } },
      applicant: {
        select: {
          id: true,
          email: true,
          firstName: true,
          lastName: true,
          tenantMemberships: { where: { deletedAt: null }, select: { tenant: { select: { name: true } } } },
          clubMemberships: { where: { clubId, deletedAt: null }, select: { role: true }, take: 1 },
        },
      },
    },
  });

  const order: Record<ApplicationStatus, number> = { PENDING: 0, ACCEPTED: 1, REJECTED: 2, WITHDRAWN: 3 };
  const applications = rows
    .map((row) => ({
      id: row.id,
      status: row.status,
      createdAt: row.createdAt,
      decidedAt: row.decidedAt,
      decidedBy: row.decidedBy ? displayName(row.decidedBy) : null,
      answers: readAnswers(row.answers),
      applicant: {
        id: row.applicant.id,
        displayName: displayName(row.applicant),
        email: row.applicant.email,
        colleges: row.applicant.tenantMemberships.map((membership) => membership.tenant.name),
        currentRole: row.applicant.clubMemberships[0]?.role ?? null,
      },
    }))
    .sort((a, b) => order[a.status] - order[b.status]);

  return { opening, applications };
}

async function lockClub(tx: Tx, clubId: string) {
  await tx.$queryRaw`SELECT id FROM "clubs" WHERE id = ${clubId}::uuid FOR UPDATE`;
}

/**
 * Accept or reject a pending application.
 *
 * Accepting, in one transaction under the club lock (the same lock role
 * changes and hand-overs take):
 *  • the applicant joins the club's college as a plain member if they weren't
 *    in it (cross-college applicants are allowed);
 *  • they get the opening's role — a new membership, a revived old one, or a
 *    Member promoted to Lead. Nobody is ever moved DOWN by an acceptance;
 *  • the application is marked accepted, with who decided and when.
 */
export async function decideApplication(args: {
  readonly clubId: string;
  readonly tenantId: string;
  readonly actor: Actor & { readonly userId: string };
  readonly applicationId: string;
  readonly decision: "ACCEPT" | "REJECT";
}) {
  const { clubId, tenantId, actor, applicationId, decision } = args;

  return db.$transaction(async (tx) => {
    await lockClub(tx, clubId);

    const application = await tx.openingApplication.findFirst({
      where: { id: applicationId, tenantId, opening: { clubId, deletedAt: null } },
      select: { id: true, status: true, applicantId: true, opening: { select: { role: true } } },
    });
    if (!application) throw ApiError.notFound("That application was not found.");

    const role = application.opening.role;
    if (!canDecideApplication(actor, role)) {
      throw ApiError.forbidden("Only the club's President can decide applications for a Lead role.");
    }
    if (application.applicantId === actor.userId) {
      throw ApiError.forbidden("You can't decide your own application.");
    }
    if (application.status !== "PENDING") {
      throw new ApiError(
        "CONFLICT",
        application.status === "WITHDRAWN"
          ? "The applicant withdrew this application."
          : "Someone already decided this application — reload to see the result.",
      );
    }

    let grantedRole: ClubRole | null = null;
    if (decision === "ACCEPT") {
      await ensureTenantMembership(tx, tenantId, application.applicantId);

      const existing = await tx.clubMember.findFirst({
        where: { clubId, userId: application.applicantId },
        select: { id: true, role: true, deletedAt: true },
      });
      if (!existing) {
        await tx.clubMember.create({ data: { clubId, userId: application.applicantId, role } });
        grantedRole = role;
      } else if (existing.deletedAt) {
        await tx.clubMember.update({
          where: { id: existing.id },
          data: { deletedAt: null, role, joinedAt: new Date() },
        });
        grantedRole = role;
      } else if (existing.role === "MEMBER" && role === "EVENT_MANAGER") {
        await tx.clubMember.update({ where: { id: existing.id }, data: { role } });
        grantedRole = role;
      } else {
        // Already holds this role or higher (e.g. promoted meanwhile): keep it.
        grantedRole = existing.role;
      }
    }

    await tx.openingApplication.update({
      where: { id: application.id },
      data: {
        status: decision === "ACCEPT" ? "ACCEPTED" : "REJECTED",
        decidedById: actor.userId,
        decidedAt: new Date(),
      },
    });

    return {
      id: application.id,
      status: decision === "ACCEPT" ? ("ACCEPTED" as const) : ("REJECTED" as const),
      grantedRole,
    };
  });
}
