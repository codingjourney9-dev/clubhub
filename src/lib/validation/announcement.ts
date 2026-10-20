import { z } from "zod";

/** Limits shared with the database CHECK constraints (Phase 10 migration). */
export const ANNOUNCEMENT_TITLE_MAX = 120;
export const ANNOUNCEMENT_BODY_MAX = 4000;

/** Windows line endings become plain newlines, so lengths match what people see. */
const normaliseNewlines = (value: string) => value.replace(/\r\n?/g, "\n");

const title = z
  .string({ message: "Give the announcement a title." })
  .trim()
  .min(1, "Give the announcement a title.")
  .max(ANNOUNCEMENT_TITLE_MAX, `Keep the title under ${ANNOUNCEMENT_TITLE_MAX} characters.`);

const body = z
  .string({ message: "Write a message." })
  .transform(normaliseNewlines)
  .pipe(
    z
      .string()
      .trim()
      .min(1, "Write a message.")
      .max(ANNOUNCEMENT_BODY_MAX, `Keep the message under ${ANNOUNCEMENT_BODY_MAX} characters.`),
  );

export const createAnnouncementSchema = z.strictObject({
  title,
  body,
  /** Pin it to the top straight away (replaces any current pin). */
  pinned: z.boolean().optional(),
});

export const updateAnnouncementSchema = z
  .strictObject({ title: title.optional(), body: body.optional() })
  .refine((value) => value.title !== undefined || value.body !== undefined, {
    message: "Change the title or the message.",
  });

export const pinAnnouncementSchema = z.strictObject({
  pinned: z.boolean({ message: "Say whether to pin (true) or unpin (false)." }),
});

export type CreateAnnouncementInput = z.infer<typeof createAnnouncementSchema>;
export type UpdateAnnouncementInput = z.infer<typeof updateAnnouncementSchema>;
