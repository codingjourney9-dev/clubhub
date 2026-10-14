import { z } from "zod";

/**
 * Auth input contracts, shared by the route handler, the server action and the
 * client forms — one definition, enforced on both sides.
 */

/** Emails are normalised to lowercase so uniqueness is case-insensitive in practice. */
export const emailSchema = z
  .email("Enter a valid email address.")
  .max(254, "Email addresses cannot exceed 254 characters.")
  .trim()
  .toLowerCase();

export const passwordSchema = z
  .string()
  .min(8, "Use at least 8 characters.")
  // bcrypt silently truncates beyond 72 bytes; reject instead of pretending.
  .max(72, "Passwords cannot exceed 72 characters.");

export const loginSchema = z.object({
  email: emailSchema,
  password: z.string().min(1, "Enter your password."),
});

export const registerSchema = z.strictObject({
  firstName: z.string().trim().min(1, "First name is required.").max(80),
  lastName: z.string().trim().min(1, "Last name is required.").max(80),
  email: emailSchema,
  password: passwordSchema,
});

export type LoginInput = z.infer<typeof loginSchema>;
export type RegisterInput = z.infer<typeof registerSchema>;
