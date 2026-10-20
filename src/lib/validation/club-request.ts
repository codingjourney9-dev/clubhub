import { z } from "zod";

/**
 * Phase 12: a student asks for a new club, then proves a professor backs it.
 *
 * The professor's email is optional HERE because college Owners/Admins don't
 * need one (their clubs go live at once). The service insists on it for
 * everyone else — that rule depends on who is asking, which a schema can't see.
 */
export const requestClubSchema = z.strictObject({
  name: z.string().trim().min(2, "Use at least 2 characters.").max(120),
  category: z.string().trim().max(60).optional(),
  description: z.string().trim().max(2000).optional(),
  /** Leave out to use the college matched from your email address. */
  tenantId: z.uuid("Choose a college from the list.").optional(),
  facultyName: z.string().trim().max(120).optional(),
  // Trim BEFORE validating (see emailSchema in ./auth for why the order matters).
  facultyEmail: z
    .string()
    .trim()
    .toLowerCase()
    .pipe(z.email("Enter the professor's full email address, e.g. name@college.edu.").max(254))
    .optional(),
});

export type RequestClubInput = z.infer<typeof requestClubSchema>;

export const verifyClubCodeSchema = z.strictObject({
  code: z
    .string({ message: "Enter the 6-digit code." })
    .trim()
    .regex(/^\d{6}$/, "The code is exactly 6 digits."),
});

export type VerifyClubCodeInput = z.infer<typeof verifyClubCodeSchema>;
