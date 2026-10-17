import { ApiError, handleRouteError, ok } from "@/lib/api/response";
import { parseJsonBody } from "@/lib/api/request";
import { requireClubAccess } from "@/lib/auth/guards";
import { canClub, type Actor } from "@/lib/auth/rbac";
import { getVisibleEvent, softDeleteEvent, updateEvent } from "@/lib/services/event-service";
import { updateEventSchema } from "@/lib/validation/event";
import { withApiRoute } from "@/lib/api/handler";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * One event, addressed through its club so the guard can prove the caller belongs
 * to that club's college before the event id is even looked up.
 */
async function handleGET(
  _request: Request,
  { params }: { params: Promise<{ clubId: string; eventId: string }> },
) {
  try {
    const { clubId, eventId } = await params;
    const context = await requireClubAccess(clubId, "club:read");

    const actor: Actor = { tenantRole: context.tenantRole, clubRole: context.clubRole };
    const isMember = context.clubRole !== null;
    const canEdit = canClub(actor, "event:update");

    const event = await getVisibleEvent(eventId, context.club.tenantId, isMember);

    // The event exists in this college but under a different club: the URL is wrong.
    if (event.clubId !== clubId) throw ApiError.notFound("That event was not found.");

    // A draft is a private work-in-progress — members should not see it early.
    if (event.status === "DRAFT" && !canEdit) throw ApiError.notFound("That event was not found.");

    return ok({ event, permissions: { canEdit, canDelete: canClub(actor, "event:delete") } });
  } catch (error) {
    return handleRouteError(error);
  }
}

/** PATCH /api/clubs/:clubId/events/:eventId — edit a draft or published event. */
async function handlePATCH(
  request: Request,
  { params }: { params: Promise<{ clubId: string; eventId: string }> },
) {
  try {
    const { clubId, eventId } = await params;
    const context = await requireClubAccess(clubId, "event:update");

    const input = await parseJsonBody(request, updateEventSchema(context.club.timezone));
    const event = await updateEvent(eventId, context.club.tenantId, context.club.timezone, input);

    return ok({ event });
  } catch (error) {
    return handleRouteError(error);
  }
}

/** DELETE — soft delete, refused for published events (cancel first). */
async function handleDELETE(
  _request: Request,
  { params }: { params: Promise<{ clubId: string; eventId: string }> },
) {
  try {
    const { clubId, eventId } = await params;
    const context = await requireClubAccess(clubId, "event:delete");

    const result = await softDeleteEvent(eventId, context.club.tenantId);
    return ok({ event: result });
  } catch (error) {
    return handleRouteError(error);
  }
}

export const GET = withApiRoute("GET /api/clubs/[clubId]/events/[eventId]", handleGET);
export const PATCH = withApiRoute("PATCH /api/clubs/[clubId]/events/[eventId]", handlePATCH);
export const DELETE = withApiRoute("DELETE /api/clubs/[clubId]/events/[eventId]", handleDELETE);
