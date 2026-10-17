"use client";

import { toast } from "sonner";

import type { ApiErrorCode, ApiFailure, ApiSuccess, FieldErrors } from "@/types/api";

/**
 * One way for every screen to talk to the API.
 *
 * Before this existed each component did `await response.json()` and hoped. Three
 * things could go wrong that nobody handled:
 *
 *  • **The network died.** `fetch` rejects, the `try` had no `catch`, and the
 *    button simply stopped spinning with no explanation.
 *  • **The response was not JSON.** A proxy error or a crash mid-render returns
 *    HTML; `response.json()` then throws a syntax error that says nothing useful.
 *  • **The request hung.** No timeout, so "Signing in…" could spin forever.
 *
 * All three now come back as a normal failure result with a sentence a human can
 * act on, plus the request id from the server so a bug report can be matched to a
 * log line.
 */

export type ClientErrorCode = ApiErrorCode | "NETWORK_ERROR" | "TIMEOUT";

export interface ClientOk<T> {
  readonly ok: true;
  readonly data: T;
  readonly status: number;
  readonly requestId: string | null;
}

export interface ClientFail {
  readonly ok: false;
  readonly code: ClientErrorCode;
  readonly message: string;
  /** Field-level messages from a 422, when the server sent them. */
  readonly fieldErrors: FieldErrors | null;
  /** Null when the request never reached the server. */
  readonly status: number | null;
  readonly requestId: string | null;
}

export type ClientResult<T> = ClientOk<T> | ClientFail;

export interface CallOptions extends Omit<RequestInit, "body"> {
  /** Serialised as JSON with the right header — the common case. */
  readonly json?: unknown;
  /** Milliseconds before the request is abandoned. Defaults to 20 s. */
  readonly timeoutMs?: number;
}

const DEFAULT_TIMEOUT_MS = 20_000;

function isFieldErrors(value: unknown): value is FieldErrors {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  return Object.values(value).every(
    (entry) => Array.isArray(entry) && entry.every((item) => typeof item === "string"),
  );
}

/** Turns any thrown thing into a failure result — never rethrows. */
function failure(
  code: ClientErrorCode,
  message: string,
  extra: Partial<Pick<ClientFail, "fieldErrors" | "status" | "requestId">> = {},
): ClientFail {
  return {
    ok: false,
    code,
    message,
    fieldErrors: extra.fieldErrors ?? null,
    status: extra.status ?? null,
    requestId: extra.requestId ?? null,
  };
}

export async function callApi<T>(input: string, options: CallOptions = {}): Promise<ClientResult<T>> {
  const { json, timeoutMs = DEFAULT_TIMEOUT_MS, headers, signal, ...rest } = options;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  // Honour a caller-supplied signal as well as our timeout.
  if (signal) {
    if (signal.aborted) controller.abort();
    else signal.addEventListener("abort", () => controller.abort(), { once: true });
  }

  let response: Response;
  try {
    response = await fetch(input, {
      ...rest,
      signal: controller.signal,
      headers: json === undefined ? headers : { "Content-Type": "application/json", ...headers },
      body: json === undefined ? undefined : JSON.stringify(json),
    });
  } catch (error) {
    const aborted = error instanceof Error && error.name === "AbortError";
    return aborted
      ? failure(
          "TIMEOUT",
          "That took too long to answer. Your connection may be slow — try again.",
        )
      : failure(
          "NETWORK_ERROR",
          "You appear to be offline. Check your connection and try again.",
        );
  } finally {
    clearTimeout(timer);
  }

  const requestId = response.headers.get("x-request-id");

  let body: ApiSuccess<T> | ApiFailure;
  try {
    body = (await response.json()) as ApiSuccess<T> | ApiFailure;
  } catch {
    return failure(
      "INTERNAL_ERROR",
      "The server sent an unexpected reply. Please try again — if it keeps happening, quote the reference below.",
      { status: response.status, requestId },
    );
  }

  if (!body || typeof body !== "object" || !("ok" in body)) {
    return failure(
      "INTERNAL_ERROR",
      "The server sent an unexpected reply. Please try again.",
      { status: response.status, requestId },
    );
  }

  if (!body.ok) {
    return failure(body.error.code, body.error.message, {
      fieldErrors: isFieldErrors(body.error.details) ? body.error.details : null,
      status: response.status,
      requestId,
    });
  }

  return { ok: true, data: body.data, status: response.status, requestId };
}

const FRIENDLY_CODES: Partial<Record<ClientErrorCode, string>> = {
  NETWORK_ERROR: "No connection",
  TIMEOUT: "No answer in time",
  RATE_LIMITED: "Slow down a moment",
  UNAUTHORIZED: "Please sign in again",
  FORBIDDEN: "That is not yours to do",
  NOT_FOUND: "It is not there any more",
  INTERNAL_ERROR: "Something broke on our side",
};

/** The short headline for a failure: a code in words. */
export function failureTitle(result: ClientFail): string {
  return FRIENDLY_CODES[result.code] ?? "That did not work";
}

/**
 * Puts a failure in front of the user, with the reference tucked into the
 * description rather than shouted in the heading.
 */
export function notifyFailure(result: ClientFail, title?: string): void {
  const reference =
    result.requestId && result.status && result.status >= 500
      ? ` (ref ${result.requestId.slice(0, 8)})`
      : "";

  toast.error(title ?? failureTitle(result), {
    description: `${result.message}${reference}`,
  });
}

/** Convenience for a 422: which fields complained, in the order the server sent them. */
export function fieldErrorsOf(result: ClientFail): Record<string, string> {
  if (!result.fieldErrors) return {};
  return Object.fromEntries(
    Object.entries(result.fieldErrors).map(([field, messages]) => [field, messages[0] ?? ""]),
  );
}
