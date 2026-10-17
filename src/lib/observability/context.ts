import { AsyncLocalStorage } from "node:async_hooks";

import { randomUUID } from "node:crypto";

/**
 * A request-scoped "backpack".
 *
 * Every API request runs inside its own store. Guards drop the signed-in user and
 * the tenant they are acting in; handlers may add more; and when the response is
 * ready, one structured log line is written containing all of it.
 *
 * Why `AsyncLocalStorage` rather than passing an argument everywhere: the tenant is
 * discovered *deep* inside `requireEventAccess` (after a database lookup), while the
 * logger lives at the very edge of the request. A backpack lets the two meet
 * without threading a parameter through every service call.
 *
 * Node-only: all route handlers declare `runtime = "nodejs"`, so this never runs on
 * the edge runtime (where `AsyncLocalStorage` is unavailable).
 */

export interface RequestContext {
  /** Correlates the log line with the response header and the client's error toast. */
  readonly requestId: string;
  readonly method: string;
  readonly path: string;
  /** `Date.now()` at entry — the log line reports the total wall time. */
  readonly startedAt: number;

  // Filled in later, in this order: who → which tenant → what happened.
  userId?: string;
  tenantId?: string;
  /** The caller's role, e.g. `PRESIDENT` or `OWNER`. Never an email. */
  actorRole?: string;
  errorCode?: string;
  errorMessage?: string;
}

const storage = new AsyncLocalStorage<RequestContext>();

/** Runs `fn` with a fresh context. Everything it awaits inherits the store. */
export function runWithRequestContext<T>(context: RequestContext, fn: () => T): T {
  return storage.run(context, fn);
}

/** `undefined` outside a request (scripts, tests, migrations). */
export function currentRequestContext(): RequestContext | undefined {
  return storage.getStore();
}

/**
 * Adds facts to the current request's context.
 *
 * Deliberately silent when there is no request: the same services are used by
 * server components, the seed script and tests, and none of them should have to
 * care that logging exists.
 */
export function annotateRequest(patch: Partial<Omit<RequestContext, "requestId" | "method" | "path" | "startedAt">>) {
  const context = storage.getStore();
  if (!context) return;
  Object.assign(context, patch);
}

/** A fresh correlation id, used when the client did not send one. */
export function newRequestId(): string {
  return randomUUID();
}
