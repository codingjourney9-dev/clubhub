import { z } from "zod";

import { ApiError } from "@/lib/api/response";

/**
 * Parses and validates a JSON request body.
 *
 * Every route handler must go through this instead of `await request.json()`:
 * malformed JSON becomes a clean 400 and validation failures throw a ZodError
 * that `handleRouteError` renders as a 422 with per-field messages.
 */
export async function parseJsonBody<TSchema extends z.ZodType>(
  request: Request,
  schema: TSchema,
): Promise<z.output<TSchema>> {
  let json: unknown;

  try {
    json = await request.json();
  } catch {
    throw new ApiError("BAD_REQUEST", "Request body must be valid JSON.");
  }

  return schema.parse(json);
}
