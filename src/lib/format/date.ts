/**
 * Timezone helpers.
 *
 * Storage rule: every timestamp is persisted in UTC (TIMESTAMPTZ). Rendering
 * rule: display in the viewer's timezone, with the tenant timezone used for
 * scheduling defaults and on admin screens where ambiguity would be costly.
 */

export function formatDateTimeInZone(
  date: Date,
  timeZone: string,
  locale = "en-IN",
): string {
  return new Intl.DateTimeFormat(locale, {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone,
  }).format(date);
}

export function formatDateInZone(date: Date, timeZone: string, locale = "en-IN"): string {
  return new Intl.DateTimeFormat(locale, { dateStyle: "full", timeZone }).format(date);
}

/** `2026-10-19` in the given zone — useful for grouping events by "day at the venue". */
export function zonedDayKey(date: Date, timeZone: string): string {
  return new Intl.DateTimeFormat("en-CA", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    timeZone,
  }).format(date);
}

/** Human label for a zone, e.g. "GMT+5:30" — shown next to times in admin tables. */
export function zoneAbbreviation(date: Date, timeZone: string): string {
  return (
    new Intl.DateTimeFormat("en-US", { timeZoneName: "shortOffset", timeZone })
      .formatToParts(date)
      .find((part) => part.type === "timeZoneName")?.value ?? timeZone
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Turning a human's "9:00 on 1 November" into an exact instant
// ─────────────────────────────────────────────────────────────────────────────

/**
 * The shape an HTML `<input type="datetime-local">` produces and expects:
 * `2026-11-01T09:00`, with no timezone attached. This is a *wall clock* reading,
 * not an instant — the same string means different moments in Delhi and London.
 */
export const WALL_CLOCK_PATTERN = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/;

export interface WallClockParts {
  readonly year: number;
  readonly month: number;
  readonly day: number;
  readonly hour: number;
  readonly minute: number;
}

/** Splits `2026-11-01T09:00` into numbers, or returns null if it is not that shape. */
export function parseWallClock(value: string): WallClockParts | null {
  const match = WALL_CLOCK_PATTERN.exec(value);
  if (!match) return null;

  const [, year, month, day, hour, minute] = match;
  return {
    year: Number(year),
    month: Number(month),
    day: Number(day),
    hour: Number(hour),
    minute: Number(minute),
  };
}

/**
 * How far ahead of UTC the given zone is at a specific instant, in milliseconds.
 *
 * Determined by asking Intl to express that instant in the zone, then comparing
 * the two readings. Asking per-instant (rather than once per zone) is what makes
 * daylight saving correct: the offset is +01:00 in a London winter and +02:00 in
 * a London summer.
 */
function offsetMsAt(instant: Date, timeZone: string): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).formatToParts(instant);

  const get = (type: Intl.DateTimeFormatPartTypes): number =>
    Number(parts.find((part) => part.type === type)?.value ?? "0");

  const asIfUtc = Date.UTC(
    get("year"),
    get("month") - 1,
    get("day"),
    get("hour"),
    get("minute"),
    get("second"),
  );

  return asIfUtc - instant.getTime();
}

/**
 * Reads a wall-clock string as a moment in `timeZone` and returns the UTC instant.
 *
 * Returns `null` when that wall-clock reading does not exist — the hour skipped
 * every spring when the clocks go forward (02:30 in London on the last Sunday in
 * March). Silently inventing a time there would surprise everyone at the door.
 *
 * For the *repeated* hour each autumn (01:30 happens twice in London), the earlier
 * occurrence is chosen, which is what a scheduler normally means.
 */
export function wallClockToUtc(wallClock: string, timeZone: string): Date | null {
  const parsed = parseWallClock(wallClock);
  if (!parsed) return null;

  const naive = Date.UTC(
    parsed.year,
    parsed.month - 1,
    parsed.day,
    parsed.hour,
    parsed.minute,
  );

  // Probe the offset a day either side, which captures BOTH offsets whenever the
  // date sits on a daylight-saving boundary. Each candidate is then accepted only
  // if the zone really renders it back as the wall clock we were given.
  const offsets = new Set([
    offsetMsAt(new Date(naive - 86_400_000), timeZone),
    offsetMsAt(new Date(naive), timeZone),
    offsetMsAt(new Date(naive + 86_400_000), timeZone),
  ]);

  const candidates = [...offsets]
    .map((offset) => naive - offset)
    .filter((instant) => utcToWallClock(new Date(instant), timeZone) === wallClock)
    .sort((a, b) => a - b);

  // No candidate → the reading fell in the spring-forward gap and never existed.
  // Several → the clocks went back and this hour happened twice; take the first.
  return candidates.length === 0 ? null : new Date(candidates[0] as number);
}

/**
 * Formats an instant as the wall-clock string the form inputs use, in `timeZone`.
 * This is what pre-fills the edit form, so a President in Delhi sees 09:00 for an
 * event they created at 09:00 — not 03:30.
 */
export function utcToWallClock(date: Date, timeZone: string): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).formatToParts(date);

  const get = (type: Intl.DateTimeFormatPartTypes): string =>
    parts.find((part) => part.type === type)?.value ?? "00";

  return `${get("year")}-${get("month")}-${get("day")}T${get("hour")}:${get("minute")}`;
}
