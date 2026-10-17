import { z } from "zod";

import { ApiError } from "@/lib/api/response";

/**
 * Path parameters arrive as strings, and a string that is not a UUID cannot name
 * a row. Without this check the value travels into a query and Postgres answers
 * with a type error — which the API would render as an opaque 500 for what is
 * really "there is no such thing".
 *
 * 404 rather than 400: an identifier that cannot exist is indistinguishable from
 * one that does not exist, and saying so is both friendlier and quieter.
 */
export function requireUuidParam(value: string, label: string): string {
  const parsed = z.uuid().safeParse(value);

  if (!parsed.success) {
    throw ApiError.notFound(`That ${label} was not found.`);
  }

  return parsed.data;
}
