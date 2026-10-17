import { handleRouteError } from "@/lib/api/response";
import {
  annotateRequest,
  newRequestId,
  runWithRequestContext,
  type RequestContext,
} from "@/lib/observability/context";
import { logRequest } from "@/lib/observability/logger";

/**
 * The wrapper every API route handler goes through.
 *
 * It does four things that are otherwise easy to forget in one of twenty-four
 * files:
 *
 *  1. gives the request an id (taken from the client's `x-request-id`, or minted),
 *  2. opens the request-scoped context guards fill in with user and tenant,
 *  3. times the handler and writes exactly one structured log line,
 *  4. echoes `x-request-id` back, so an error message on screen can be matched to
 *     the line in the log.
 *
 * Handlers keep their normal signature — this only wraps the export.
 */

export interface RouteContext<TParams> {
  params: Promise<TParams>;
}

type RouteHandler<TParams> = (
  request: Request,
  context: RouteContext<TParams>,
) => Promise<Response>;

export function withApiRoute<TParams = Record<string, string>>(
  name: string,
  handler: RouteHandler<TParams>,
): RouteHandler<TParams> {
  return async (request, context) => {
    const requestId = request.headers.get("x-request-id")?.slice(0, 64) || newRequestId();
    let path = name;

    try {
      path = new URL(request.url).pathname;
    } catch {
      // A malformed URL is not worth failing over; the route name will do.
    }

    const requestContext: RequestContext = {
      requestId,
      method: request.method,
      path,
      startedAt: Date.now(),
    };

    return runWithRequestContext(requestContext, async () => {
      let response: Response;

      try {
        response = await handler(request, context);
      } catch (error) {
        // Handlers normally translate their own errors; this is the safety net for
        // the ones that do not. `handleRouteError` logs unhandled throwables once.
        response = handleRouteError(error);
      }

      const durationMs = Date.now() - requestContext.startedAt;

      try {
        if (!response.headers.has("x-request-id")) {
          response.headers.set("x-request-id", requestId);
        }
      } catch {
        // Some responses (streams) have immutable headers; the log still has the id.
      }

      logRequest({ context: requestContext, status: response.status, durationMs });

      annotateRequest({}); // keeps the reference alive until the log line is written
      return response;
    });
  };
}
