import { wallClockToUtc, zonedDayKey } from "@/lib/format/date";

/**
 * The rules of the door, as pure functions.
 *
 * Scanning is the one part of the app that runs in the worst conditions:
 * a queue of people, a shaky hand, a cracked screen, and — in the basement —
 * no internet at all. Every decision a scanner makes is therefore written here
 * first, where it can be tested exhaustively, and only then wired to a screen.
 */

/** What the door decided, in the order the checks happen. */
export type CheckInOutcome =
  | "CHECKED_IN"
  | "ALREADY_CHECKED_IN"
  | "WAITLISTED"
  | "CANCELLED_TICKET"
  | "NOT_FOUND"
  | "AMBIGUOUS_CODE"
  | "TOO_EARLY"
  | "CLOSED"
  | "EVENT_CANCELLED";

export interface CheckInWindow {
  /** First instant a scan is accepted: local midnight on the day of the event. */
  readonly opensAt: Date;
  /** Last instant: the end of that local day, or three hours after it ends. */
  readonly closesAt: Date;
}

/** Extra time after an event ends, for people who leave late or scan on the way out. */
const GRACE_MS = 3 * 60 * 60 * 1000;

/**
 * When may this event be scanned?
 *
 * The specification asks that a scan only be accepted while the event "is today".
 * Taken literally that has a nasty edge: an 11 pm gig that runs past midnight
 * would stop accepting scans halfway through. So the window is:
 *
 *   opens  — 00:00 local time on the day the event starts
 *   closes — the later of (end of that local day) and (event end + 3 hours)
 *
 * "Local" is the **college's** timezone, not the phone's: a volunteer whose phone
 * is still on the airport's timezone must not shift the door's schedule.
 */
export function checkInWindow(
  event: { startTime: Date; endTime: Date },
  timeZone: string,
): CheckInWindow {
  const dayKey = zonedDayKey(event.startTime, timeZone);

  const opensAt = wallClockToUtc(`${dayKey}T00:00`, timeZone) ?? event.startTime;

  // The first instant of the *next* local day. The date parts are advanced with
  // calendar arithmetic (23:59 + 1 minute is still the same day), then converted
  // back to an instant — adding 36 hours to the timestamp would land two days out
  // for an event early in the local morning.
  const nextDayKey = addDaysToDayKey(dayKey, 1);
  const endOfDay =
    wallClockToUtc(`${nextDayKey}T00:00`, timeZone) ?? new Date(event.endTime.getTime() + GRACE_MS);

  const afterGrace = new Date(event.endTime.getTime() + GRACE_MS);

  return { opensAt, closesAt: afterGrace > endOfDay ? afterGrace : endOfDay };
}

/**
 * `2026-10-21` + 1 → `2026-10-22`, using UTC purely as a calendar, so no timezone
 * arithmetic can sneak in and shift the result by a day.
 */
function addDaysToDayKey(dayKey: string, days: number): string {
  const [year, month, day] = dayKey.split("-").map(Number);
  const date = new Date(Date.UTC(year!, month! - 1, day! + days));

  return date.toISOString().slice(0, 10);
}

export type WindowState = "TOO_EARLY" | "CLOSED" | "OPEN";

export function checkInWindowState(
  event: { startTime: Date; endTime: Date },
  timeZone: string,
  now: Date,
): WindowState {
  const { opensAt, closesAt } = checkInWindow(event, timeZone);

  if (now.getTime() < opensAt.getTime()) return "TOO_EARLY";
  if (now.getTime() >= closesAt.getTime()) return "CLOSED";
  return "OPEN";
}

/**
 * Should this ticket be let in?
 *
 * Note the ordering: a cancelled *event* outranks everything, because no ticket is
 * valid once the club has called it off. A cancelled *ticket* comes next. A
 * waitlisted person is politely turned away — they do not hold a seat, and
 * letting them in would silently exceed the room's capacity.
 */
export function decideCheckIn(input: {
  readonly eventStatus: "DRAFT" | "PUBLISHED" | "CANCELLED";
  readonly ticketStatus: "REGISTERED" | "WAITLISTED" | "CANCELLED";
  readonly alreadyCheckedIn: boolean;
}): CheckInOutcome {
  if (input.eventStatus === "CANCELLED") return "EVENT_CANCELLED";
  if (input.ticketStatus === "CANCELLED") return "CANCELLED_TICKET";
  if (input.ticketStatus === "WAITLISTED") return "WAITLISTED";
  // Deliberately last: "already inside" is the *useful* answer for a real ticket,
  // and it must win over every other complaint about the ticket itself.
  if (input.alreadyCheckedIn) return "ALREADY_CHECKED_IN";
  return "CHECKED_IN";
}

/** Whether an outcome should let the person through the door. */
export function letsPersonIn(outcome: CheckInOutcome): boolean {
  return outcome === "CHECKED_IN" || outcome === "ALREADY_CHECKED_IN";
}

/**
 * The human-readable half of a scan result.
 *
 * Kept next to the decision so the wording cannot drift from the rule it explains.
 */
export function describeOutcome(outcome: CheckInOutcome, name?: string | null): string {
  const who = name ? `${name} — ` : "";

  switch (outcome) {
    case "CHECKED_IN":
      return `${who}checked in.`;
    case "ALREADY_CHECKED_IN":
      return `${who}already checked in.`;
    case "WAITLISTED":
      return `${who}on the waitlist, not registered. They do not have a seat.`;
    case "CANCELLED_TICKET":
      return `${who}this ticket was cancelled.`;
    case "NOT_FOUND":
      return "No ticket for this event matches that code.";
    case "AMBIGUOUS_CODE":
      return "Several tickets match that code. Type a few more characters.";
    case "TOO_EARLY":
      return "This event is not today yet. The door opens at midnight on the day.";
    case "CLOSED":
      return "This event is over. Check-in closed the day after it ended.";
    case "EVENT_CANCELLED":
      return "This event was cancelled — no ticket is valid at the door.";
  }
}

/**
 * A short, typeable code for a ticket.
 *
 * The QR carries the full secret, but screens crack and cameras refuse to focus,
 * so the last 8 hex characters are printed under the QR as a fallback. Eight
 * characters is short enough to read aloud and long enough that two tickets in
 * one event will not collide in practice — and if they ever did, the server
 * refuses to guess (AMBIGUOUS_CODE) and asks for more.
 */
export function doorCodeFromSecret(secret: string): string {
  return secret.replace(/-/g, "").slice(-8).toUpperCase();
}

/** Normalises whatever was typed into the manual field. */
export function normaliseDoorCode(input: string): string {
  return input.replace(/[^0-9a-zA-Z]/g, "").toLowerCase();
}
