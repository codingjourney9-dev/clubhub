/**
 * Every route handler in this app speaks one envelope. Keeping it in one place
 * means client code (React Query hooks) can discriminate on `ok` without
 * guessing at shapes per endpoint.
 */

export type ApiErrorCode =
  | "BAD_REQUEST"
  | "UNAUTHORIZED"
  | "FORBIDDEN"
  | "NOT_FOUND"
  | "CONFLICT"
  | "VALIDATION_ERROR"
  | "RATE_LIMITED"
  | "INTERNAL_ERROR";

export interface ApiSuccess<TData> {
  readonly ok: true;
  readonly data: TData;
}

export interface ApiErrorBody {
  readonly code: ApiErrorCode;
  readonly message: string;
  /** Field-level errors (Zod) or extra machine-readable context. */
  readonly details?: unknown;
}

export interface ApiFailure {
  readonly ok: false;
  readonly error: ApiErrorBody;
}

export type ApiResult<TData> = ApiSuccess<TData> | ApiFailure;

/** `{ "startTime": ["Must be a valid ISO 8601 timestamp"] }` */
export type FieldErrors = Record<string, string[]>;
