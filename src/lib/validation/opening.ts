import { z } from "zod";

import {
  ANSWER_MAX,
  OPENING_DESCRIPTION_MAX,
  OPENING_MAX_QUESTIONS,
  OPENING_QUESTION_MAX,
  OPENING_REQUIREMENTS_MAX,
  OPENING_TITLE_MAX,
} from "@/lib/domain/openings";
import { WALL_CLOCK_PATTERN } from "@/lib/format/date";

const normaliseNewlines = (value: string) => value.replace(/\r\n?/g, "\n");

/** Multi-line text: newlines normalised, trimmed, length-checked. */
const text = (max: number, emptyMessage: string, tooLong: string) =>
  z
    .string({ message: emptyMessage })
    .transform(normaliseNewlines)
    .pipe(z.string().trim().min(1, emptyMessage).max(max, tooLong));

const title = z
  .string({ message: "Give the opening a title." })
  .trim()
  .min(1, "Give the opening a title.")
  .max(OPENING_TITLE_MAX, `Keep the title under ${OPENING_TITLE_MAX} characters.`);

const description = text(
  OPENING_DESCRIPTION_MAX,
  "Describe the role.",
  `Keep the description under ${OPENING_DESCRIPTION_MAX} characters.`,
);

/** Optional: blank becomes null ("no requirements"). */
const requirements = z
  .string()
  .transform(normaliseNewlines)
  .pipe(z.string().trim().max(OPENING_REQUIREMENTS_MAX, `Keep requirements under ${OPENING_REQUIREMENTS_MAX} characters.`))
  .transform((value) => (value === "" ? null : value))
  .nullable()
  .optional();

const questions = z
  .array(
    z
      .string()
      .trim()
      .min(1, "A question can't be empty — remove it instead.")
      .max(OPENING_QUESTION_MAX, `Keep each question under ${OPENING_QUESTION_MAX} characters.`),
    { message: "Add at least one question." },
  )
  .min(1, "Add at least one question for applicants.")
  .max(OPENING_MAX_QUESTIONS, `At most ${OPENING_MAX_QUESTIONS} questions.`);

/**
 * Optional closing date, as the form's wall clock ("2026-10-30T18:00"). The
 * service reads it in the college's timezone. Empty string / null = no date.
 */
const closesAt = z
  .union([
    z.literal("").transform(() => null),
    z.null(),
    z.string().regex(WALL_CLOCK_PATTERN, "Pick a closing date and time, e.g. 2026-10-30 18:00."),
  ])
  .optional();

export const createOpeningSchema = z.strictObject({
  title,
  description,
  requirements,
  role: z.enum(["MEMBER", "EVENT_MANAGER"], { message: "Choose Member or Lead." }),
  questions,
  closesAt,
});

/** Editing: any field, plus Open/Closed. The role it offers is fixed once posted. */
export const updateOpeningSchema = z
  .strictObject({
    title: title.optional(),
    description: description.optional(),
    requirements,
    questions: questions.optional(),
    closesAt,
    status: z.enum(["OPEN", "CLOSED"], { message: "Choose Open or Closed." }).optional(),
  })
  .refine((value) => Object.values(value).some((field) => field !== undefined), {
    message: "Change at least one thing.",
  });

export const applySchema = z.strictObject({
  /** One answer per question, in the opening's order. */
  answers: z
    .array(
      z
        .string({ message: "Answer every question." })
        .transform(normaliseNewlines)
        .pipe(
          z
            .string()
            .trim()
            .min(1, "Answer every question.")
            .max(ANSWER_MAX, `Keep each answer under ${ANSWER_MAX} characters.`),
        ),
    )
    .min(1, "Answer every question.")
    .max(OPENING_MAX_QUESTIONS),
});

export const decideApplicationSchema = z.strictObject({
  decision: z.enum(["ACCEPT", "REJECT"], { message: "Choose Accept or Reject." }),
});

export type CreateOpeningInput = z.infer<typeof createOpeningSchema>;
export type UpdateOpeningInput = z.infer<typeof updateOpeningSchema>;
