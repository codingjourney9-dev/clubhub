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
