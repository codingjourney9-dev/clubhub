import { z } from "zod";

import { ClubRole } from "@/generated/prisma/enums";

/** Validation for club resources and club membership. */

export const createClubSchema = z.strictObject({
  tenantId: z.uuid("A valid college id is required."),
  name: z.string().trim().min(2, "Use at least 2 characters.").max(120),
  description: z.string().trim().max(2000).optional(),
  category: z.string().trim().max(60).optional(),
});

export const updateClubSchema = z
  .strictObject({
    name: z.string().trim().min(2, "Use at least 2 characters.").max(120).optional(),
    description: z.string().trim().max(2000).nullish(),
    category: z.string().trim().max(60).nullish(),
    logoUrl: z.url("Use a full URL, e.g. https://…").nullish(),
  })
  .refine((value) => Object.keys(value).length > 0, {
    message: "Provide at least one field to update.",
  });

export const clubRoleSchema = z.enum(ClubRole, {
  message: "Choose one of PRESIDENT, EVENT_MANAGER or MEMBER.",
});

export const updateClubMemberRoleSchema = z.strictObject({
  role: clubRoleSchema,
});

export type CreateClubInput = z.infer<typeof createClubSchema>;
export type UpdateClubInput = z.infer<typeof updateClubSchema>;
export type UpdateClubMemberRoleInput = z.infer<typeof updateClubMemberRoleSchema>;
