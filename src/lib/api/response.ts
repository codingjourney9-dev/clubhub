import { NextResponse } from "next/server";
import { ZodError } from "zod";

import { annotateRequest, currentRequestContext } from "@/lib/observability/context";
import { logServerError } from "@/lib/observability/logger";
import type {
  ApiErrorBody,
  ApiErrorCode,
  ApiFailure,
  ApiSuccess,
  FieldErrors,
} from "@/types/api";

/** Canonical HTTP status for each error code, so call sites cannot invent their own. */
const STATUS_BY_CODE: Record<ApiErrorCode, number> = {
  BAD_REQUEST: 400,
  UNAUTHORIZED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  CONFLICT: 409,
  VALIDATION_ERROR: 422,
  RATE_LIMITED: 429,
  INTERNAL_ERROR: 500,
};

export function ok<TData>(
  data: TData,
  init?: { status?: number; headers?: HeadersInit },
): NextResponse<ApiSuccess<TData>> {
  return NextResponse.json(
    { ok: true, data } satisfies ApiSuccess<TData>,
    { status: init?.status ?? 200, headers: init?.headers },
  );
}

export function fail(
  code: ApiErrorCode,
  message: string,
  options?: { status?: number; details?: unknown; headers?: HeadersInit },
): NextResponse<ApiFailure> {
  return NextResponse.json(
    {
      ok: false,
      error: {
        code,
        message,
        ...(options?.details === undefined ? {} : { details: options.details }),
      } satisfies ApiErrorBody,
    },
    { status: options?.status ?? STATUS_BY_CODE[code], headers: options?.headers },
  );
}

/**
 * Throwable variant of `fail()`. Throwing from deep inside a service keeps the
 * happy path readable; `handleRouteError` converts it back into a response.
 */
export class ApiError extends Error {
  readonly code: ApiErrorCode;
  readonly status: number;
  readonly details: unknown;
  /** Extra response headers, e.g. `Retry-After` on a 429. */
  readonly headers: HeadersInit | undefined;

  constructor(
    code: ApiErrorCode,
    message: string,
    options?: { status?: number; details?: unknown; headers?: HeadersInit },
  ) {
    super(message);
    this.name = "ApiError";
    this.code = code;
    this.status = options?.status ?? STATUS_BY_CODE[code];
    this.details = options?.details;
    this.headers = options?.headers;
  }

  static unauthorized(message = "You must be signed in to do that.") {
    return new ApiError("UNAUTHORIZED", message);
  }

  static forbidden(message = "You do not have permission to perform this action.") {
    return new ApiError("FORBIDDEN", message);
  }

  static notFound(message = "The requested resource was not found.") {
    return new ApiError("NOT_FOUND", message);
  }
}

/** Flattens Zod issues into `{ field: [messages] }`, keyed by dotted path. */
export function toFieldErrors(error: ZodError): FieldErrors {
  const fieldErrors: FieldErrors = {};

  for (const issue of error.issues) {
    const key = issue.path.length > 0 ? issue.path.join(".") : "_root";
    (fieldErrors[key] ??= []).push(issue.message);
  }

  return fieldErrors;
}

export function validationFailed(
  error: ZodError,
  message = "Request validation failed.",
): NextResponse<ApiFailure> {
  return fail("VALIDATION_ERROR", message, { details: toFieldErrors(error) });
}

/**
 * Single exit point for every route handler's catch block. Unknown throwables are
 * logged server-side and returned as an opaque 500 so internals never leak.
 */
export function handleRouteError(error: unknown): NextResponse<ApiFailure> {
  if (error instanceof ZodError) {
    // The field names go into the log line; the values never do.
    annotateRequest({ errorCode: "VALIDATION_ERROR", errorMessage: error.issues[0]?.message });
    return validationFailed(error);
  }

  if (error instanceof ApiError) {
    annotateRequest({ errorCode: error.code, errorMessage: error.message });
    return fail(error.code, error.message, {
      status: error.status,
      details: error.details,
      headers: error.headers,
    });
  }

  // Unknown throwable: this is a bug, so it gets a log line of its own — the
  // request line alone would only say "500". The response stays opaque.
  annotateRequest({
    errorCode: "INTERNAL_ERROR",
    errorMessage: error instanceof Error ? error.message : "Unknown error",
  });
  logServerError("api.unhandled", error, {
    requestId: currentRequestContext()?.requestId,
    path: currentRequestContext()?.path,
  });
  return fail("INTERNAL_ERROR", "Something went wrong. Please try again.");
}
