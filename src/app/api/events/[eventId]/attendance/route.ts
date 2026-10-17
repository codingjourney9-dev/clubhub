import { requireUuidParam } from "@/lib/api/params";
import { handleRouteError, ok } from "@/lib/api/response";
import { requireEventAccess } from "@/lib/auth/guards";
import { getAttendanceReport } from "@/lib/services/check-in-service";
import { withApiRoute } from "@/lib/api/handler";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/events/:eventId/attendance — the sheet the club reads afterwards.
 *
 * "40 registered, 12 turned up" is the number that makes the next event better,
 * so it is a first-class endpoint rather than something scraped from the guest
 * list. Organisers only.
 */
async function handleGET(
  _request: Request,
  { params }: { params: Promise<{ eventId: string }> },
) {
  try {
    const { eventId: rawEventId } = await params;
    const eventId = requireUuidParam(rawEventId, "event");

    const context = await requireEventAccess(eventId, "attendance:report");
    const report = await getAttendanceReport(eventId, context.event.tenantId);

    return ok(report);
  } catch (error) {
    return handleRouteError(error);
  }
}

export const GET = withApiRoute("GET /api/events/[eventId]/attendance", handleGET);
