import { requireUuidParam } from "@/lib/api/params";
import { handleRouteError, ok } from "@/lib/api/response";
import { requireEventAccess } from "@/lib/auth/guards";
import { listEventRoster } from "@/lib/services/ticket-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/events/:eventId/tickets — the door list.
 *
 * Organisers only (`ticket:view_roster`). Students cannot ask who else is coming:
 * that is other people's data, and an event page does not need it.
 *
 * The response deliberately carries no QR secrets — a roster is a list of names,
 * not a wallet of tickets.
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ eventId: string }> },
) {
  try {
    const { eventId: rawEventId } = await params;
    const eventId = requireUuidParam(rawEventId, "event");

    const context = await requireEventAccess(eventId, "ticket:view_roster");
    const roster = await listEventRoster(eventId, context.event.tenantId);

    return ok({
      event: { id: context.event.id, title: context.event.title, capacity: context.event.capacity },
      ...roster,
      counts: { registered: roster.registered.length, waitlisted: roster.waitlisted.length },
    });
  } catch (error) {
    return handleRouteError(error);
  }
}
