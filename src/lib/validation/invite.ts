import { z } from "zod";

import { ClubRole, TenantRole } from "@/generated/prisma/enums";
import { emailSchema } from "@/lib/validation/auth";

/**
 * Invite links.
 *
 * A link carries a role, an expiry and a use budget. Role is decided by the
 * creator — never by the person redeeming it — which is what stops a Member link
 * from being turned into a President membership.
 */

export const MAX_INVITE_LIFETIME_HOURS = 24 * 30; // 30 days

export const createClubInviteSchema = z.strictObject({
  role: z.enum(ClubRole, { message: "Choose the role this link grants." }),
  /** Restrict the link to one address. Omit for "anyone with the link". */
  email: emailSchema.optional(),
  expiresInHours: z.coerce
    .number()
    .int("Use whole hours.")
    .min(1, "A link must last at least an hour.")
    .max(MAX_INVITE_LIFETIME_HOURS, "Links cannot last longer than 30 days.")
    .default(24 * 7),
  maxUses: z.coerce
    .number()
    .int("Use a whole number.")
    .min(1, "A link must be usable at least once.")
    .max(500, "A single link cannot admit more than 500 people.")
    .default(1),
});

export const createTenantInviteSchema = z.strictObject({
  role: z.enum(TenantRole, { message: "Choose the role this link grants." }),
  email: emailSchema.optional(),
  expiresInHours: z.coerce
    .number()
    .int("Use whole hours.")
    .min(1)
    .max(MAX_INVITE_LIFETIME_HOURS)
    .default(24 * 7),
  maxUses: z.coerce.number().int().min(1).max(500).default(1),
});

export const inviteTokenSchema = z
  .string()
  .trim()
  .min(20, "That invite link looks incomplete.")
  .max(200, "That invite link looks invalid.")
  // base64url alphabet only — anything else cannot be one of our tokens.
  .regex(/^[A-Za-z0-9_-]+$/, "That invite link looks invalid.");

export type CreateClubInviteInput = z.infer<typeof createClubInviteSchema>;
export type CreateTenantInviteInput = z.infer<typeof createTenantInviteSchema>;
