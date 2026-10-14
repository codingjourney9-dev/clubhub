import { ok, handleRouteError, fail } from "@/lib/api/response";
import { parseJsonBody } from "@/lib/api/request";
import { clientIpFrom, checkRateLimit } from "@/lib/rate-limit/token-bucket";
import { registerUser } from "@/lib/services/user-service";
import { registerSchema } from "@/lib/validation/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** 5 signups per IP, refilling one every 3 minutes. */
const SIGNUP_RATE_LIMIT = { limit: 5, refillPerSecond: 5 / 900 } as const;

/**
 * POST /api/auth/register — create an account.
 *
 * Server-side validation is mandatory here (never trust the form): the body is
 * parsed with the same Zod schema the client uses, and rate limiting keeps a
 * script from mass-creating accounts.
 */
export async function POST(request: Request) {
  try {
    const limit = checkRateLimit({
      key: `register:ip:${clientIpFrom(request)}`,
      ...SIGNUP_RATE_LIMIT,
    });

    if (!limit.allowed) {
      return fail("RATE_LIMITED", "Too many sign-up attempts. Please try again shortly.", {
        headers: { "Retry-After": String(limit.retryAfterSeconds) },
      });
    }

    const input = await parseJsonBody(request, registerSchema);
    const user = await registerUser(input);

    return ok({ user }, { status: 201 });
  } catch (error) {
    return handleRouteError(error);
  }
}
