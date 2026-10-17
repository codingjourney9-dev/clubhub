import { z } from "zod";

/**
 * Validation for the ticketing endpoints.
 *
 * The rule for this codebase is that **every** request is validated on the
 * server, including the ones that appear to have nothing to validate. A POST
 * with no fields still gets a schema, for two reasons:
 *
 *  1. It documents the contract ("this endpoint takes no input").
 *  2. `strictObject` rejects unknown keys, so a client that sends
 *     `{ "userId": "someone-else" }` in the hope of registering on another
 *     person's behalf gets a 422 instead of being quietly ignored. Silently
 *     ignored fields are how privilege bugs start.
 */
export const registrationBodySchema = z.strictObject({});

/** Path parameters must be real UUIDs; anything else cannot name a row. */
export const uuidParamSchema = z.uuid("That is not a valid identifier.");

export type RegistrationBody = z.infer<typeof registrationBodySchema>;
