import { z } from "zod";

import { EventStatus } from "@/generated/prisma/enums";
import { parseWallClock, wallClockToUtc, WALL_CLOCK_PATTERN } from "@/lib/format/date";

/**
 * Validation for events.
 *
 * Times are the interesting part. The browser sends a *wall clock* reading
 * (`2026-11-01T09:00`) with no timezone, because that is what a human means by
 * "9 in the morning". The schema factory below is given the college's timezone,
 * so the reading can be resolved to a real UTC instant — and rejected with a
 * field error when that reading does not exist (the hour skipped each spring when
 * clocks go forward).
 *
 * Why a factory instead of a constant: the same text means different instants in
 * different colleges, so validity genuinely depends on who is asking. Building it
 * per request keeps that explicit instead of guessing a default zone.
 */

/** `2026-11-01T09:00` — exactly what `<input type="datetime-local">` produces. */
const wallClockSchema = z
  .string()
  .trim()
  .regex(WALL_CLOCK_PATTERN, "Pick a date and time, for example 2026-11-01 09:00.");

const titleSchema = z
  .string()
  .trim()
  .min(3, "Give the event a name of at least 3 characters.")
  .max(140, "Keep the name under 140 characters.");

const descriptionSchema = z.string().trim().max(5000, "That description is too long.").nullish();
const locationSchema = z.string().trim().max(200, "Keep the venue under 200 characters.").nullish();

const capacitySchema = z.coerce
  .number()
  .int("Capacity must be a whole number.")
  .min(1, "Capacity must be at least 1. Leave it empty for unlimited.")
  .max(100_000, "That is more people than we can track.")
  .nullish();

/** Fields shared by create and update. */
const commonFields = {
  title: titleSchema,
  description: descriptionSchema,
  location: locationSchema,
  capacity: capacitySchema,
  waitlistEnabled: z.boolean().default(false),
  isPublic: z.boolean().default(false),
};

/** Events longer than this are almost always a typo in the end date. */
export const MAX_EVENT_DURATION_DAYS = 60;

function checkWindow(
  values: { start: string; end: string },
  timeZone: string,
  ctx: z.RefinementCtx,
): { startTime: Date; endTime: Date } {
  const startTime = wallClockToUtc(values.start, timeZone);
  const endTime = wallClockToUtc(values.end, timeZone);

  if (!startTime) {
    ctx.addIssue({
      code: "custom",
      path: ["start"],
      message: `That start time does not exist in ${timeZone} — it falls in the hour skipped when clocks change. Pick another time.`,
    });
  }

  if (!endTime) {
    ctx.addIssue({
      code: "custom",
      path: ["end"],
      message: `That end time does not exist in ${timeZone} — it falls in the hour skipped when clocks change. Pick another time.`,
    });
  }

  if (startTime && endTime) {
    // Strictly after: a zero-length event has no door to open and no capacity to fill.
    if (endTime.getTime() <= startTime.getTime()) {
      ctx.addIssue({
        code: "custom",
        path: ["end"],
        message: "The end time must be after the start time.",
      });
    } else if (endTime.getTime() - startTime.getTime() > MAX_EVENT_DURATION_DAYS * 86_400_000) {
      ctx.addIssue({
        code: "custom",
        path: ["end"],
        message: `That is longer than ${MAX_EVENT_DURATION_DAYS} days — check the end date.`,
      });
    }
  }

  return { startTime: startTime ?? new Date(0), endTime: endTime ?? new Date(0) };
}

/**
 * Builds the create schema for one college.
 *
 * New events always start as DRAFT; publishing is a separate, explicit action.
 * Letting the same request create and publish would make it too easy to announce
 * a half-written event.
 */
export function createEventSchema(timeZone: string) {
  return z
    .strictObject({
      ...commonFields,
      start: wallClockSchema,
      end: wallClockSchema,
    })
    .superRefine((values, ctx) => {
      checkWindow(values, timeZone, ctx);

      // A waitlist is a queue for a full room; without a capacity there is no
      // "full", so the setting would silently do nothing.
      if (values.waitlistEnabled && (values.capacity === null || values.capacity === undefined)) {
        ctx.addIssue({
          code: "custom",
          path: ["waitlistEnabled"],
          message: "Set a capacity first — a waitlist only makes sense once the room can fill up.",
        });
      }
    });
}

/**
 * Builds the update schema for one college.
 *
 * `start` and `end` must be sent together: changing only one of them would leave
 * the pair in a state nobody validated, so the form always submits the window as
 * a whole.
 */
export function updateEventSchema(timeZone: string) {
  return z
    .strictObject({
      title: titleSchema.optional(),
      description: descriptionSchema,
      location: locationSchema,
      capacity: capacitySchema,
      waitlistEnabled: z.boolean().optional(),
      isPublic: z.boolean().optional(),
      start: wallClockSchema.optional(),
      end: wallClockSchema.optional(),
    })
    .superRefine((values, ctx) => {
      const hasStart = values.start !== undefined;
      const hasEnd = values.end !== undefined;

      if (hasStart !== hasEnd) {
        ctx.addIssue({
          code: "custom",
          path: [hasStart ? "end" : "start"],
          message: "Send the start and end time together.",
        });
        return;
      }

      if (values.start && values.end) {
        checkWindow({ start: values.start, end: values.end }, timeZone, ctx);
      }

      const touchesSomething = Object.values(values).some((value) => value !== undefined);
      if (!touchesSomething) {
        ctx.addIssue({ code: "custom", path: [], message: "Provide at least one field to update." });
      }
    });
}

/** Status changes are their own endpoint, so the allowed targets are explicit. */
export const eventStatusSchema = z.strictObject({
  status: z.enum(
    [EventStatus.PUBLISHED, EventStatus.CANCELLED],
    { message: "An event can only be published or cancelled from here." },
  ),
});

export type CreateEventInput = z.infer<ReturnType<typeof createEventSchema>>;
export type UpdateEventInput = z.infer<ReturnType<typeof updateEventSchema>>;
export type EventStatusInput = z.infer<typeof eventStatusSchema>;

/** Re-exported so services can resolve a wall clock without importing the formatter. */
export { parseWallClock, wallClockToUtc };
