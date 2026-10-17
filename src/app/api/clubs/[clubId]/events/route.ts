import { handleRouteError, ok } from "@/lib/api/response";
import { parseJsonBody } from "@/lib/api/request";
import { requireClubAccess } from "@/lib/auth/guards";
import { canClub, type Actor } from "@/lib/auth/rbac";
import { createEvent, listClubEvents } from "@/lib/services/event-service";
import { createEventSchema } from "@/lib/validation/event";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/clubs/:clubId/events — the club's events.
 *
 * Drafts are included only for people who may edit events, and members-only
 * events are filtered out for anyone who is not in the club. Both decisions are
 * made here, from the guard's view of the caller — never from a query parameter.
 */
export async function GET(_request: Request, { params }: { params: Promise<{ clubId: string }> }) {
  try {
    const { clubId } = await params;
    const context = await requireClubAccess(clubId, "club:read");

    const actor: Actor = { tenantRole: context.tenantRole, clubRole: context.clubRole };
    const isMember = context.clubRole !== null;

    const events = await listClubEvents(clubId, context.club.tenantId, {
      includeDrafts: canClub(actor, "event:update"),
    });

    return ok({ events: events.filter((event) => event.isPublic || isMember) });
  } catch (error) {
    return handleRouteError(error);
  }
}

/**
 * POST /api/clubs/:clubId/events — create a draft event.
 *
 * The body carries wall-clock times; the college's timezone (from the guard, not
 * from the client) turns them into UTC instants.
 */
export async function POST(request: Request, { params }: { params: Promise<{ clubId: string }> }) {
  try {
    const { clubId } = await params;
    const context = await requireClubAccess(clubId, "event:create");

    const input = await parseJsonBody(request, createEventSchema(context.club.timezone));

    const event = await createEvent({
      clubId,
      tenantId: context.club.tenantId,
      timeZone: context.club.timezone,
      createdById: context.user.id,
      input,
    });

    return ok({ event }, { status: 201 });
  } catch (error) {
    return handleRouteError(error);
  }
}
