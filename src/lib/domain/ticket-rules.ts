/**
 * Seat allocation and waitlist rules, written as pure functions.
 *
 * Everything in this file is deliberately boring: no database, no clock, no
 * network. That matters for two reasons.
 *
 *  1. **It can be tested exhaustively.** The interesting failures in ticketing
 *     ("the 121st person got a seat", "someone was promoted twice") come from
 *     combinations of a handful of inputs, so those combinations are enumerated
 *     in `tests/unit/ticket-rules.test.ts` instead of being hoped for.
 *  2. **It can be reused on both sides.** The page that renders "Join waitlist"
 *     and the server that actually takes the decision call the same function, so
 *     the button cannot promise something the server will refuse.
 *
 * The one thing these functions do NOT decide is whether two requests raced:
 * that needs the database row lock. See `src/lib/services/ticket-service.ts`.
 */

export type SeatOutcome = "REGISTERED" | "WAITLISTED" | "FULL";

export interface SeatDecisionInput {
  /** `null` means "no limit" — the event takes everyone who asks. */
  readonly capacity: number | null;
  /** Seats currently held by someone (WAITLISTED people do not hold one). */
  readonly registeredCount: number;
  readonly waitlistEnabled: boolean;
}

/**
 * Where does the next person go?
 *
 * Order matters: an unlimited event never has a waitlist, and a full room only
 * grows a queue when the organisers asked for one. Without that switch, "full"
 * means an honest "no" rather than a queue nobody intends to clear.
 */
export function decideSeat({
  capacity,
  registeredCount,
  waitlistEnabled,
}: SeatDecisionInput): SeatOutcome {
  if (capacity === null) return "REGISTERED";

  // `registeredCount > capacity` is possible (capacity may have been lowered
  // after people joined), and it is still just "full".
  if (registeredCount < capacity) return "REGISTERED";

  return waitlistEnabled ? "WAITLISTED" : "FULL";
}

/**
 * The number printed on a waitlist entry.
 *
 * Positions are handed out from a counter that only ever grows, so they are not
 * always consecutive: if the person at position 2 gives up, positions 1 and 3
 * remain. The number stored is therefore an identity, not a rank — the rank a
 * person sees ("you are 2nd in line") is computed from the current queue by
 * `queueRank`, which is why nobody has to be renumbered on every cancellation.
 */
export function nextWaitlistPosition(highestPosition: number | null): number {
  return (highestPosition ?? 0) + 1;
}

/**
 * The queue rank to show a human: 1 for the front of the line.
 *
 * `orderedPositions` must be the positions of the *current* waitlist in service
 * order (lowest first). Returns `null` when the given ticket is not in it — a
 * promoted ticket has no position any more, and showing a stale number would be
 * worse than showing nothing.
 */
export function queueRank(
  orderedPositions: readonly number[],
  position: number | null,
): number | null {
  if (position === null) return null;

  const index = orderedPositions.indexOf(position);
  return index === -1 ? null : index + 1;
}

/** Why registration is closed, or `null` when it is open. */
export type ClosedReason = "DRAFT" | "CANCELLED" | "STARTED";

export interface RegistrationWindowInput {
  readonly status: "DRAFT" | "PUBLISHED" | "CANCELLED";
  readonly startTime: Date;
  readonly now: Date;
}

/**
 * Is the door open?
 *
 * Registration closes **when the event starts**, not when it ends. An event that
 * has begun is being run: seats are being counted at the door, and letting people
 * join from their phone mid-event makes the capacity check meaningless.
 */
export function registrationClosedReason({
  status,
  startTime,
  now,
}: RegistrationWindowInput): ClosedReason | null {
  if (status === "DRAFT") return "DRAFT";
  if (status === "CANCELLED") return "CANCELLED";
  if (startTime.getTime() <= now.getTime()) return "STARTED";
  return null;
}
