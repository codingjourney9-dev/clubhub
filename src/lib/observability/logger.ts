import { currentRequestContext, type RequestContext } from "@/lib/observability/context";

/**
 * Structured, single-line JSON logs.
 *
 * One line per event, machine-readable, with a stable `event` name so you can
 * count or alert on it (`api.request`, `api.error`). In a real deployment these
 * lines are what a log collector turns into dashboards; locally they are simply
 * readable in the terminal.
 *
 * Rules this file enforces:
 *  • never log a token, a QR secret or a password — `redactPath` handles URLs,
 *    and nothing else is accepted from a request body;
 *  • never log an email address — ids and roles only;
 *  • be quiet during tests, so a failing assertion is not buried in noise.
 */

export type LogLevel = "debug" | "info" | "warn" | "error";

const LEVEL_WEIGHT: Record<LogLevel, number> = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40,
};

function configuredLevel(): LogLevel {
  const raw = (process.env.LOG_LEVEL ?? "").toLowerCase();
  if (raw in LEVEL_WEIGHT) return raw as LogLevel;
  // Tests default to silent unless explicitly asked for output.
  if (process.env.NODE_ENV === "test") return "error";
  return "info";
}

function shouldLog(level: LogLevel): boolean {
  return LEVEL_WEIGHT[level] >= LEVEL_WEIGHT[configuredLevel()];
}

/**
 * Hides secrets that appear in a URL.
 *
 * `/api/invites/<token>` is the awkward one: the token *is* the credential, so
 * logging the path verbatim would leak it into every log file. UUIDs are kept —
 * they identify rows without granting access — and anything else long enough to be
 * a token is replaced.
 */
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function redactPath(path: string): string {
  const [pathname] = path.split("?");
  if (!pathname) return path;

  const segments = pathname.split("/").map((segment) => {
    if (segment.length < 16) return segment;
    if (UUID_PATTERN.test(segment)) return segment;
    return "<redacted>";
  });

  return segments.join("/");
}

export interface LogFields {
  readonly [key: string]: unknown;
}

export function logEvent(level: LogLevel, event: string, fields: LogFields = {}): void {
  if (!shouldLog(level)) return;

  const line = JSON.stringify({
    ts: new Date().toISOString(),
    level,
    event,
    ...fields,
  });

  if (level === "error") console.error(line);
  else if (level === "warn") console.warn(line);
  else console.log(line);
}

/**
 * The one line written for every API request that reaches a route handler.
 *
 * `status >= 500` is an error (somebody should look), `400–499` is a warning (the
 * caller did something wrong), everything else is information.
 */
export function logRequest(input: {
  context: RequestContext;
  status: number;
  durationMs: number;
}): void {
  const { context, status, durationMs } = input;

  const level: LogLevel = status >= 500 ? "error" : status >= 400 ? "warn" : "info";

  logEvent(level, "api.request", {
    requestId: context.requestId,
    method: context.method,
    path: redactPath(context.path),
    status,
    durationMs,
    ...(context.userId ? { userId: context.userId } : {}),
    ...(context.tenantId ? { tenantId: context.tenantId } : {}),
    ...(context.actorRole ? { actorRole: context.actorRole } : {}),
    ...(context.errorCode ? { errorCode: context.errorCode } : {}),
  });
}

/** Convenience for the handful of places that log outside a request (startup, seed). */
export function logServerError(event: string, error: unknown, fields: LogFields = {}): void {
  logEvent("error", event, {
    ...fields,
    error: error instanceof Error ? { name: error.name, message: error.message } : String(error),
  });
}

/** Exposed for tests that need to assert on the current context. */
export function describeCurrentRequest(): RequestContext | undefined {
  return currentRequestContext();
}
