import "server-only";

import { ApiError } from "@/lib/api/response";
import {
  checkInWindowState,
  decideCheckIn,
  describeOutcome,
  doorCodeFromSecret,
  normaliseDoorCode,
  type CheckInOutcome,
} from "@/lib/domain/check-in";
import { db } from "@/lib/db/client";
import { fingerprintSecret } from "@/lib/tickets/fingerprint";
import { TICKET_QR_PREFIX } from "@/lib/tickets/qr";
import type { Prisma } from "@/generated/prisma/client";

/**
 * The door.
 *
 * Three things make this different from every other service in the app:
 *
 *  1. **The input is not under our control.** A scan is a camera reading a square
 *     of pixels, so it may be a bus ticket or half a code. Unknown input is a
 *     normal case, not an error, and it must never reach the database as a query
 *     on an arbitrary string.
 *  2. **The same scan can arrive twice.** A flaky phone retries; a queued scan is
 *     replayed. `Attendance.scanUuid` is UNIQUE, so a replay collapses into the
 *     original row instead of creating a second check-in.
 *  3. **Two volunteers can scan the same ticket at the same moment.** The UNIQUE
 *     constraint on `ticketId` means exactly one write wins; the loser is told
 *     "already checked in", which is the truth, not an error.
 */

export interface CheckInResult {
  readonly outcome: CheckInOutcome;
  readonly message: string;
  /** True when the person should be let through. */
  readonly admitted: boolean;
  readonly ticket?: {
    readonly id: string;
    readonly status: string;
    readonly holder: string;
    readonly email: string;
  };
  /** Present when this ticket has a check-in row (fresh or existing). */
  readonly checkIn?: {
    readonly at: string;
    readonly by: string | null;
    readonly device: string | null;
    readonly source: "SCANNER" | "MANUAL";
  };
  /** True when this exact scan id had already been recorded (a replay). */
  readonly replayed?: boolean;
}

interface ResolvedTicket {
  id: string;
  status: "REGISTERED" | "WAITLISTED" | "CANCELLED";
  qrCodeUuid: string;
  firstName: string | null;
  lastName: string | null;
  email: string;
}

function displayName(ticket: ResolvedTicket): string {
  return [ticket.firstName, ticket.lastName].filter(Boolean).join(" ") || ticket.email;
}

/**
 * Finds the ticket a code refers to, inside **one event**.
 *
 * Scoping to the event is what stops a valid ticket from another event (or
 * another college) being accepted at this door — the search simply never sees it.
 *
 * Three inputs are accepted: the full QR payload, a bare UUID, and the 8-character
 * door code. The last one is a suffix match on the secret, so two tickets could in
 * principle share it; when that happens the answer is a deliberate refusal to
 * guess rather than an arbitrary choice.
 */
async function resolveTicket(
  eventId: string,
  tenantId: string,
  rawCode: string,
): Promise<
  | { kind: "found"; ticket: ResolvedTicket }
  | { kind: "not-found" }
  | { kind: "ambiguous" }
> {
  const code = rawCode.trim();

  // Payload → secret. Anything carrying our prefix is unwrapped first.
  const withoutPrefix = code.startsWith(TICKET_QR_PREFIX)
    ? code.slice(TICKET_QR_PREFIX.length).trim()
    : code;

  const select = {
    id: true,
    status: true,
    qrCodeUuid: true,
    user: { select: { firstName: true, lastName: true, email: true } },
  } as const;

  const shape = (row: {
    id: string;
    status: "REGISTERED" | "WAITLISTED" | "CANCELLED";
    qrCodeUuid: string;
    user: { firstName: string | null; lastName: string | null; email: string };
  }): ResolvedTicket => ({
    id: row.id,
    status: row.status,
    qrCodeUuid: row.qrCodeUuid,
    firstName: row.user.firstName,
    lastName: row.user.lastName,
    email: row.user.email,
  });

  if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(withoutPrefix)) {
    // Exact secret: the normal path, and the only one a QR scan ever takes.
    const exact = await db.ticket.findFirst({
      where: {
        eventId,
        tenantId,
        deletedAt: null,
        qrCodeUuid: withoutPrefix.toLowerCase(),
      },
      select,
    });

    return exact ? { kind: "found", ticket: shape(exact) } : { kind: "not-found" };
  }

  // Row-level security is not the tool here — this is a suffix search over one
  // event's tickets, and it is deliberately bounded by the event id first.
  const normalised = normaliseDoorCode(withoutPrefix);
  if (normalised.length < 4 || !/^[0-9a-f]+$/.test(normalised)) {
    return { kind: "not-found" };
  }

  const rows = await db.$queryRaw<
    { id: string; status: "REGISTERED" | "WAITLISTED" | "CANCELLED"; qr_code_uuid: string }[]
  >`
    SELECT id, status, qr_code_uuid::text AS qr_code_uuid
    FROM tickets
    WHERE event_id = ${eventId}::uuid
      AND tenant_id = ${tenantId}::uuid
      AND deleted_at IS NULL
      AND replace(qr_code_uuid::text, '-', '') LIKE ${`%${normalised}`}
    LIMIT 5
  `;

  if (rows.length === 0) return { kind: "not-found" };
  if (rows.length > 1) return { kind: "ambiguous" };

  // Re-read through Prisma so the shape (and the user relation) is identical to
  // the exact-match path.
  const ticket = await db.ticket.findFirst({
    where: { id: rows[0]!.id, eventId, tenantId, deletedAt: null },
    select,
  });

  return ticket ? { kind: "found", ticket: shape(ticket) } : { kind: "not-found" };
}

interface EventForDoor {
  id: string;
  title: string;
  status: "DRAFT" | "PUBLISHED" | "CANCELLED";
  startTime: Date;
  endTime: Date;
  timezone: string;
}

async function loadEventForDoor(eventId: string, tenantId: string): Promise<EventForDoor> {
  const event = await db.event.findFirst({
    where: { id: eventId, tenantId, deletedAt: null },
    select: {
      id: true,
      title: true,
      status: true,
      startTime: true,
      endTime: true,
      club: { select: { tenant: { select: { timezone: true } } } },
    },
  });

  if (!event) throw ApiError.notFound("That event was not found.");

  return {
    id: event.id,
    title: event.title,
    status: event.status,
    startTime: event.startTime,
    endTime: event.endTime,
    timezone: event.club.tenant.timezone,
  };
}

/** Postgres unique-violation, surfaced through Prisma. */
function isUniqueViolation(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code?: unknown }).code === "P2002"
  );
}

export interface CheckInArgs {
  readonly eventId: string;
  readonly tenantId: string;
  readonly code: string;
  readonly source: "SCANNER" | "MANUAL";
  readonly scanUuid: string;
  readonly scannedAt?: string;
  readonly checkedInById: string;
  readonly deviceLabel?: string | null;
  /** Skips nothing — kept explicit so the window is always evaluated on purpose. */
  readonly now?: Date;
}

/**
 * Records one check-in.
 *
 * The flow is deliberately ordered cheapest-first: replay → event state → ticket
 * lookup → window → ticket state → write. Nothing is written unless every check
 * before it passed.
 */
export async function checkIn(args: CheckInArgs): Promise<CheckInResult> {
  const now = args.now ?? new Date();
  const event = await loadEventForDoor(args.eventId, args.tenantId);

  // ── Replay? A retried request carries the same scan id. ────────────────────
  // Answering with the original result keeps a flaky phone's retries harmless.
  const replay = await db.attendance.findUnique({
    where: { scanUuid: args.scanUuid },
    select: {
      id: true,
      checkInTime: true,
      source: true,
      deviceLabel: true,
      ticket: {
        select: {
          id: true,
          status: true,
          user: { select: { firstName: true, lastName: true, email: true } },
        },
      },
    },
  });

  if (replay) {
    const name = [replay.ticket.user.firstName, replay.ticket.user.lastName]
      .filter(Boolean)
      .join(" ");

    // The scan id is unique across the whole system, so a replay that names a
    // different event is a client bug, not a second ticket. Report it honestly.
    return {
      outcome: "ALREADY_CHECKED_IN",
      message: `${name || replay.ticket.user.email} — this scan had already been recorded.`,
      admitted: true,
      ticket: {
        id: replay.ticket.id,
        status: replay.ticket.status,
        holder: name || replay.ticket.user.email,
        email: replay.ticket.user.email,
      },
      checkIn: {
        at: replay.checkInTime.toISOString(),
        by: null,
        device: replay.deviceLabel,
        source: replay.source,
      },
      replayed: true,
    };
  }

  // ── The door's own schedule ────────────────────────────────────────────────
  const windowState = checkInWindowState(event, event.timezone, now);

  if (windowState !== "OPEN") {
    return {
      outcome: windowState,
      message: describeOutcome(windowState),
      admitted: false,
    };
  }

  // ── The ticket ─────────────────────────────────────────────────────────────
  const resolved = await resolveTicket(args.eventId, args.tenantId, args.code);

  if (resolved.kind === "not-found") {
    return { outcome: "NOT_FOUND", message: describeOutcome("NOT_FOUND"), admitted: false };
  }

  if (resolved.kind === "ambiguous") {
    return { outcome: "AMBIGUOUS_CODE", message: describeOutcome("AMBIGUOUS_CODE"), admitted: false };
  }

  const ticket = resolved.ticket;

  const existing = await db.attendance.findUnique({
    where: { ticketId: ticket.id },
    select: {
      checkInTime: true,
      source: true,
      deviceLabel: true,
      checkedInBy: { select: { firstName: true, lastName: true, email: true } },
    },
  });

  const outcome = decideCheckIn({
    eventStatus: event.status,
    ticketStatus: ticket.status,
    alreadyCheckedIn: existing !== null,
  });

  if (outcome !== "CHECKED_IN") {
    return {
      outcome,
      message: describeOutcome(outcome, displayName(ticket)),
      admitted: outcome === "ALREADY_CHECKED_IN",
      ticket: {
        id: ticket.id,
        status: ticket.status,
        holder: displayName(ticket),
        email: ticket.email,
      },
      ...(existing
        ? {
            checkIn: {
              at: existing.checkInTime.toISOString(),
              by: existing.checkedInBy
                ? [existing.checkedInBy.firstName, existing.checkedInBy.lastName]
                    .filter(Boolean)
                    .join(" ") || existing.checkedInBy.email
                : null,
              device: existing.deviceLabel,
              source: existing.source,
            },
          }
        : {}),
    };
  }

  // ── Write ──────────────────────────────────────────────────────────────────
  const scannedAt = parseScannedAt(args.scannedAt, now);

  try {
    const created = await db.attendance.create({
      data: {
        tenantId: args.tenantId,
        eventId: args.eventId,
        ticketId: ticket.id,
        checkInTime: scannedAt,
        source: args.source,
        checkedInById: args.checkedInById,
        scanUuid: args.scanUuid,
        deviceLabel: args.deviceLabel ?? null,
      },
      select: { checkInTime: true, source: true, deviceLabel: true },
    });

    return {
      outcome: "CHECKED_IN",
      message: describeOutcome("CHECKED_IN", displayName(ticket)),
      admitted: true,
      ticket: {
        id: ticket.id,
        status: ticket.status,
        holder: displayName(ticket),
        email: ticket.email,
      },
      checkIn: {
        at: created.checkInTime.toISOString(),
        by: null,
        device: created.deviceLabel,
        source: created.source,
      },
    };
  } catch (error) {
    // Someone else's scan of the same ticket won the race. That is a normal
    // outcome at a door with two volunteers, not a failure.
    if (isUniqueViolation(error)) {
      const winner = await db.attendance.findUnique({
        where: { ticketId: ticket.id },
        select: { checkInTime: true, source: true, deviceLabel: true },
      });

      return {
        outcome: "ALREADY_CHECKED_IN",
        message: describeOutcome("ALREADY_CHECKED_IN", displayName(ticket)),
        admitted: true,
        ticket: {
          id: ticket.id,
          status: ticket.status,
          holder: displayName(ticket),
          email: ticket.email,
        },
        ...(winner
          ? {
              checkIn: {
                at: winner.checkInTime.toISOString(),
                by: null,
                device: winner.deviceLabel,
                source: winner.source,
              },
            }
          : {}),
      };
    }

    throw error;
  }
}

/**
 * The time a scan actually happened.
 *
 * Offline queues are flushed hours later, so the client's timestamp is the honest
 * one and is what ends up in the attendance sheet. It is not trusted blindly: a
 * timestamp in the future (a phone with a wrong clock) is replaced by "now", and
 * anything unparseable falls back to "now" as well.
 */
function parseScannedAt(value: string | undefined, now: Date): Date {
  if (!value) return now;

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return now;

  const fiveMinutesFromNow = now.getTime() + 5 * 60 * 1000;
  return parsed.getTime() > fiveMinutesFromNow ? now : parsed;
}

export interface BatchItemResult extends CheckInResult {
  readonly scanUuid: string;
}

/**
 * Flushes the offline queue.
 *
 * Every item is processed independently: one bad code in a batch of thirty must
 * not lose the other twenty-nine. The response therefore mirrors the request,
 * one result per scan, and the client can mark each queued row as synced or
 * rejected.
 */
export async function syncCheckIns(args: {
  readonly eventId: string;
  readonly tenantId: string;
  readonly checkedInById: string;
  readonly deviceLabel?: string | null;
  readonly scans: readonly {
    scanUuid: string;
    code: string;
    scannedAt?: string;
    source: "SCANNER" | "MANUAL";
  }[];
}): Promise<{ results: BatchItemResult[]; checkedIn: number }> {
  const results: BatchItemResult[] = [];

  for (const scan of args.scans) {
    try {
      const result = await checkIn({
        eventId: args.eventId,
        tenantId: args.tenantId,
        code: scan.code,
        source: scan.source,
        scanUuid: scan.scanUuid,
        scannedAt: scan.scannedAt,
        checkedInById: args.checkedInById,
        deviceLabel: args.deviceLabel ?? null,
      });

      results.push({ ...result, scanUuid: scan.scanUuid });
    } catch (error) {
      // A single malformed item must not abort the batch; the volunteer needs to
      // know which one failed, not lose the whole evening's scans.
      if (error instanceof ApiError) {
        results.push({
          scanUuid: scan.scanUuid,
          outcome: "NOT_FOUND",
          message: error.message,
          admitted: false,
        });
      } else {
        throw error;
      }
    }
  }

  return {
    results,
    checkedIn: results.filter((result) => result.outcome === "CHECKED_IN").length,
  };
}

export interface ManifestTicket {
  readonly ticketId: string;
  readonly holder: string;
  readonly email: string;
  readonly status: "REGISTERED" | "WAITLISTED";
  /** SHA-256 of the ticket secret — enough to verify, useless to forge. */
  readonly fingerprint: string;
  /**
   * The short code printed under the QR (last 8 characters of the secret).
   *
   * This is not treated as a secret: it is visible on the ticket in the holder's
   * hand, and on its own it cannot open anything — check-in still requires a
   * signed-in organiser. It is here so a phone that is offline can match a code
   * that was typed by hand, which is exactly the case the fallback exists for.
   */
  readonly doorCode: string;
  readonly checkedInAt: string | null;
}

export interface DoorManifest {
  readonly event: {
    readonly id: string;
    readonly title: string;
    readonly startTime: string;
    readonly endTime: string;
    readonly timezone: string;
    readonly status: string;
    readonly capacity: number | null;
  };
  readonly generatedAt: string;
  readonly tickets: readonly ManifestTicket[];
}

/**
 * The data a phone needs to run the door **with no internet**.
 *
 * It carries a fingerprint per ticket (never the secret itself), so the phone can
 * answer "is this a real ticket for this event?" on its own. It also carries the
 * check-in state, so an offline scan of a ticket already used this evening is
 * refused locally instead of being queued to fail later.
 */
export async function getDoorManifest(eventId: string, tenantId: string): Promise<DoorManifest> {
  const event = await db.event.findFirst({
    where: { id: eventId, tenantId, deletedAt: null },
    select: {
      id: true,
      title: true,
      startTime: true,
      endTime: true,
      capacity: true,
      status: true,
      club: { select: { tenant: { select: { timezone: true } } } },
    },
  });

  if (!event) throw ApiError.notFound("That event was not found.");

  const tickets = await db.ticket.findMany({
    where: { eventId, tenantId, deletedAt: null, status: { in: ["REGISTERED", "WAITLISTED"] } },
    orderBy: [{ status: "asc" }, { createdAt: "asc" }],
    select: {
      id: true,
      status: true,
      qrCodeUuid: true,
      user: { select: { firstName: true, lastName: true, email: true } },
      attendance: { select: { checkInTime: true } },
    },
  });

  return {
    event: {
      id: event.id,
      title: event.title,
      startTime: event.startTime.toISOString(),
      endTime: event.endTime.toISOString(),
      timezone: event.club.tenant.timezone,
      status: event.status,
      capacity: event.capacity,
    },
    generatedAt: new Date().toISOString(),
    tickets: tickets.map((ticket) => ({
      ticketId: ticket.id,
      holder:
        [ticket.user.firstName, ticket.user.lastName].filter(Boolean).join(" ") ||
        ticket.user.email,
      email: ticket.user.email,
      status: ticket.status as "REGISTERED" | "WAITLISTED",
      fingerprint: fingerprintSecret(ticket.qrCodeUuid),
      doorCode: doorCodeFromSecret(ticket.qrCodeUuid),
      checkedInAt: ticket.attendance?.checkInTime.toISOString() ?? null,
    })),
  };
}

export interface AttendanceReport {
  readonly event: {
    readonly id: string;
    readonly title: string;
    readonly startTime: string;
    readonly endTime: string;
    readonly timezone: string;
    readonly capacity: number | null;
  };
  readonly counts: {
    readonly registered: number;
    readonly waitlisted: number;
    readonly checkedIn: number;
    /** Checked in as a share of registered seats, 0–100. */
    readonly attendanceRate: number;
  };
  readonly rows: readonly {
    readonly ticketId: string;
    readonly holder: string;
    readonly email: string;
    readonly status: string;
    /** The short code printed on the ticket, so staff can find it on paper. */
    readonly doorCode: string;
    readonly checkInTime: string | null;
    readonly source: "SCANNER" | "MANUAL" | null;
    readonly device: string | null;
    readonly checkedInBy: string | null;
  }[];
}

/**
 * The sheet the club actually wants after the event: who came, who did not, and
 * the gap between the two numbers.
 */
export async function getAttendanceReport(
  eventId: string,
  tenantId: string,
): Promise<AttendanceReport> {
  const event = await db.event.findFirst({
    where: { id: eventId, tenantId, deletedAt: null },
    select: {
      id: true,
      title: true,
      startTime: true,
      endTime: true,
      capacity: true,
      club: { select: { tenant: { select: { timezone: true } } } },
    },
  });

  if (!event) throw ApiError.notFound("That event was not found.");

  const [registered, waitlisted, tickets] = await Promise.all([
    db.ticket.count({ where: { eventId, tenantId, status: "REGISTERED" } }),
    db.ticket.count({ where: { eventId, tenantId, status: "WAITLISTED" } }),
    db.ticket.findMany({
      where: { eventId, tenantId, deletedAt: null, status: { in: ["REGISTERED", "WAITLISTED"] } },
      orderBy: [{ createdAt: "asc" }],
      select: {
        id: true,
        status: true,
        qrCodeUuid: true,
        user: { select: { firstName: true, lastName: true, email: true } },
        attendance: {
          select: {
            checkInTime: true,
            source: true,
            deviceLabel: true,
            checkedInBy: { select: { firstName: true, lastName: true, email: true } },
          },
        },
      },
    }),
  ]);

  const checkedIn = tickets.filter((ticket) => ticket.attendance !== null).length;

  return {
    event: {
      id: event.id,
      title: event.title,
      startTime: event.startTime.toISOString(),
      endTime: event.endTime.toISOString(),
      timezone: event.club.tenant.timezone,
      capacity: event.capacity,
    },
    counts: {
      registered,
      waitlisted,
      checkedIn,
      attendanceRate: registered === 0 ? 0 : Math.round((checkedIn / registered) * 100),
    },
    rows: tickets.map((ticket) => ({
      ticketId: ticket.id,
      holder:
        [ticket.user.firstName, ticket.user.lastName].filter(Boolean).join(" ") ||
        ticket.user.email,
      email: ticket.user.email,
      status: ticket.status,
      doorCode: doorCodeFromSecret(ticket.qrCodeUuid),
      checkInTime: ticket.attendance?.checkInTime.toISOString() ?? null,
      source: ticket.attendance?.source ?? null,
      device: ticket.attendance?.deviceLabel ?? null,
      checkedInBy: ticket.attendance?.checkedInBy
        ? [ticket.attendance.checkedInBy.firstName, ticket.attendance.checkedInBy.lastName]
            .filter(Boolean)
            .join(" ") || ticket.attendance.checkedInBy.email
        : null,
    })),
  };
}

/** Events this person is allowed to run the door for. */
export async function listScannableEvents(userId: string) {
  const memberships = await db.clubMember.findMany({
    where: {
      userId,
      deletedAt: null,
      role: { in: ["PRESIDENT", "EVENT_MANAGER"] },
      club: { deletedAt: null, status: "ACTIVE" },
    },
    select: { clubId: true },
  });

  const clubIds = memberships.map((membership) => membership.clubId);

  // A college owner/admin can run the door for every club in their college.
  const adminOf = await db.tenantMember.findMany({
    where: { userId, deletedAt: null, role: { in: ["OWNER", "ADMIN"] } },
    select: { tenantId: true },
  });

  const tenantIds = adminOf.map((membership) => membership.tenantId);

  if (clubIds.length === 0 && tenantIds.length === 0) return [];

  return db.event.findMany({
    where: {
      deletedAt: null,
      status: { in: ["PUBLISHED", "DRAFT"] },
      endTime: { gt: new Date(Date.now() - 36 * 60 * 60 * 1000) },
      club: { deletedAt: null },
      OR: [{ clubId: { in: clubIds } }, { tenantId: { in: tenantIds } }],
    },
    orderBy: { startTime: "asc" },
    take: 40,
    select: {
      id: true,
      title: true,
      startTime: true,
      endTime: true,
      status: true,
      capacity: true,
      club: { select: { name: true, tenant: { select: { timezone: true } } } },
      _count: { select: { attendance: true } },
    },
  });
}

/** Small helper for the routes: the door needs the tenant, not just the event id. */
export type { Prisma };
