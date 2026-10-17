import { requireUuidParam } from "@/lib/api/params";
import { parseJsonBody } from "@/lib/api/request";
import { handleRouteError, ok } from "@/lib/api/response";
import { requireEventAccess } from "@/lib/auth/guards";
import { enforceRateLimit } from "@/lib/rate-limit/budgets";
import { registerForEvent } from "@/lib/services/ticket-service";
import { registrationBodySchema } from "@/lib/validation/ticket";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/events/:eventId/register — claim a seat, or join the waitlist.
 *
 * The body is empty on purpose: **who** is registering comes from the session and
 * **how many seats are left** comes from the database inside a row lock. Neither
 * is something a client gets to say.
 *
 * 201 for a new seat or queue place, 200 when the request was a harmless repeat
 * of one you already made.
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ eventId: string }> },
) {
  try {
    const { eventId: rawEventId } = await params;
    const eventId = requireUuidParam(rawEventId, "event");

    // Visibility first: a draft or a members-only event must answer 404 even to
    // a caller sending garbage, so the endpoint never confirms it exists.
    const context = await requireEventAccess(eventId, "ticket:rsvp");

    // Even an empty body is validated — see src/lib/validation/ticket.ts for why.
    await parseJsonBody(request, registrationBodySchema);

    // Keyed on the person, not the IP: an entire campus lab shares one address.
    enforceRateLimit("rsvp", context.user.id);

    const result = await registerForEvent(eventId, context.event.tenantId, context.user.id);

    return ok(result, { status: result.outcome.startsWith("already") ? 200 : 201 });
  } catch (error) {
    return handleRouteError(error);
  }
}
