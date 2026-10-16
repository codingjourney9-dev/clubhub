import { z } from "zod";

/**
 * Validation for tenant (college) and club resources.
 *
 * Same schemas power the API routes and the client forms — the server is always
 * the authority (docs/architecture.md §6).
 */

/**
 * Timezones are validated against the runtime's IANA database rather than a
 * hard-coded list, so the check can never drift from what the server supports.
 */
export const timezoneSchema = z.string().trim().min(1).refine(
  (timeZone) => {
    try {
      new Intl.DateTimeFormat("en-US", { timeZone });
      return true;
    } catch {
      return false;
    }
  },
  { message: "Use an IANA timezone such as Asia/Kolkata." },
);

export const hexColorSchema = z
  .string()
  .trim()
  .regex(/^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/, "Use a hex colour such as #4f46e5.");

const nameSchema = z.string().trim().min(2, "Use at least 2 characters.").max(120);

export const createTenantSchema = z.strictObject({
  name: nameSchema,
  /** Optional email domain for the college, e.g. "vit.ac.in". */
  domain: z
    .string()
    .trim()
    .toLowerCase()
    .regex(/^[a-z0-9-]+(\.[a-z0-9-]+)+$/, "Use a domain such as vit.ac.in.")
    .optional(),
  timezone: timezoneSchema.default("Asia/Kolkata"),
  primaryColor: hexColorSchema.optional(),
});

export const updateTenantSchema = z
  .strictObject({
    name: nameSchema.optional(),
    timezone: timezoneSchema.optional(),
    primaryColor: hexColorSchema.optional(),
  })
  .refine((value) => Object.keys(value).length > 0, {
    message: "Provide at least one field to update.",
  });

/** What the API expects to receive once parsed (defaults already applied). */
export type CreateTenantInput = z.infer<typeof createTenantSchema>;
export type UpdateTenantInput = z.infer<typeof updateTenantSchema>;

/**
 * What a form holds *before* parsing: fields carrying `.default()` are optional
 * here, because the default is applied by Zod, not by the input element.
 */
export type CreateTenantFormValues = z.input<typeof createTenantSchema>;
