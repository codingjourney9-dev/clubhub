import { requireUuidParam } from "@/lib/api/params";
import { parseJsonBody } from "@/lib/api/request";
import { handleRouteError, ok } from "@/lib/api/response";
import { requireEventAccess } from "@/lib/auth/guards";
import { enforceRateLimit } from "@/lib/rate-limit/budgets";
import { syncCheckIns } from "@/lib/services/check-in-service";
import { checkInBatchSchema } from "@/lib/validation/check-in";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/events/:eventId/check-in/sync — flush the offline queue.
 *
 * This is the endpoint that makes the basement work. A phone that lost signal
 * keeps every accepted scan in local storage with the time it actually happened;
 * when the network returns, this call replays them in one batch.
 *
 * Two properties make it safe to call at any moment, as often as the client likes:
 *
 *  • every item carries its own `scanUuid`, and `Attendance.scanUuid` is UNIQUE,
 *    so a flushed batch that is sent twice creates exactly the same rows;
 *  • every item is judged independently, so one bad code cannot discard the rest.
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ eventId: string }> },
) {
  try {
    const { eventId: rawEventId } = await params;
    const eventId = requireUuidParam(rawEventId, "event");

    const context = await requireEventAccess(eventId, "attendance:scan");

    const input = await parseJsonBody(request, checkInBatchSchema);

    enforceRateLimit("scan", context.user.id);

    const { results, checkedIn } = await syncCheckIns({
      eventId,
      tenantId: context.event.tenantId,
      checkedInById: context.user.id,
      deviceLabel: input.deviceLabel ?? null,
      scans: input.scans,
    });

    return ok({
      results,
      counts: {
        received: input.scans.length,
        checkedIn,
        rejected: results.filter((result) => !result.admitted).length,
        replayed: results.filter((result) => result.replayed === true).length,
      },
    });
  } catch (error) {
    return handleRouteError(error);
  }
}
