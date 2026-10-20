/**
 * Recruitment rules shared by the server and the screens (Phase 11).
 * No database access here, so the same answers come out everywhere.
 */

export const OPENING_TITLE_MAX = 120;
export const OPENING_DESCRIPTION_MAX = 4000;
export const OPENING_REQUIREMENTS_MAX = 2000;
export const OPENING_QUESTION_MAX = 300;
export const OPENING_MAX_QUESTIONS = 3;
export const ANSWER_MAX = 1000;

/** What a new opening's question box starts with — editable. */
export const DEFAULT_OPENING_QUESTION = "Why do you want this role?";

export type OpeningState = "open" | "closed" | "date_passed";

/**
 * Is it taking applications right now? Closed by hand, or its closing date has
 * passed — either way, no new applications. (Pending ones can still be decided.)
 */
export function openingState(
  opening: { readonly status: "OPEN" | "CLOSED"; readonly closesAt: Date | null },
  now: Date = new Date(),
): OpeningState {
  if (opening.status === "CLOSED") return "closed";
  if (opening.closesAt && opening.closesAt.getTime() <= now.getTime()) return "date_passed";
  return "open";
}

export function isOpeningOpen(
  opening: { readonly status: "OPEN" | "CLOSED"; readonly closesAt: Date | null },
  now: Date = new Date(),
): boolean {
  return openingState(opening, now) === "open";
}

export const APPLICATION_STATUS_LABELS = {
  PENDING: "Waiting for a decision",
  ACCEPTED: "Accepted",
  REJECTED: "Not this time",
  WITHDRAWN: "Withdrawn",
} as const;

type Role = "PRESIDENT" | "EVENT_MANAGER" | "MEMBER";
const RANK: Record<Role, number> = { MEMBER: 1, EVENT_MANAGER: 2, PRESIDENT: 3 };

/**
 * Why this person can't apply, or null if they can.
 *  • already holding the offered role or a higher one in that club → no point;
 *  • Leads and the President don't apply to their own club at all.
 */
export function applyBlockedReason(
  currentRole: Role | null,
  offered: "MEMBER" | "EVENT_MANAGER",
): string | null {
  if (currentRole === null) return null;
  if (currentRole === "PRESIDENT") return "You're this club's President.";
  if (currentRole === "EVENT_MANAGER") return "You're already a Lead in this club.";
  if (RANK[currentRole] >= RANK[offered]) return "You're already a member of this club.";
  return null;
}
