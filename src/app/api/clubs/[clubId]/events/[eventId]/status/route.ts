import { handleRouteError, ok } from "@/lib/api/response";
import { parseJsonBody } from "@/lib/api/request";
import { requireClubAccess } from "@/lib/auth/guards";
import { cancelEvent, publishEvent } from "@/lib/services/event-service";
import { eventStatusSchema } from "@/lib/validation/event";
import { withApiRoute } from "@/lib/api/handler";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/clubs/:clubId/events/:eventId/status — publish or cancel.
 *
 * Status is deliberately not a field on the edit form. Publishing is an
 * announcement and cancelling is a communication, so both deserve their own
 * action (and their own confirmation in the UI) rather than being one more value
 * that can be changed by accident while fixing a typo.
 */
async function handlePOST(
  request: Request,
  { params }: { params: Promise<{ clubId: string; eventId: string }> },
) {
  try {
    const { clubId, eventId } = await params;

    // Publishing and cancelling are both announcements, so both need that right.
    const context = await requireClubAccess(clubId, "event:publish");

    const { status } = await parseJsonBody(request, eventStatusSchema);

    const result =
      status === "PUBLISHED"
        ? await publishEvent(eventId, context.club.tenantId)
        : await cancelEvent(eventId, context.club.tenantId);

    return ok({ event: result });
  } catch (error) {
    return handleRouteError(error);
  }
}

export const POST = withApiRoute("POST /api/clubs/[clubId]/events/[eventId]/status", handlePOST);
