import { randomUUID } from "node:crypto";

import { requireUuidParam } from "@/lib/api/params";
import { parseJsonBody } from "@/lib/api/request";
import { handleRouteError, ok } from "@/lib/api/response";
import { requireEventAccess } from "@/lib/auth/guards";
import { enforceRateLimit } from "@/lib/rate-limit/budgets";
import { checkIn } from "@/lib/services/check-in-service";
import { checkInSchema } from "@/lib/validation/check-in";
import { withApiRoute } from "@/lib/api/handler";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/events/:eventId/check-in — one scan, taken live at the door.
 *
 * Answers 200 even when the answer is "no". A refused scan is a normal event at a
 * door (wrong queue, cancelled ticket, already inside), and dressing it up as an
 * HTTP error would make the scanner's own logs useless. The body always carries
 * an `outcome` the UI switches on.
 */
async function handlePOST(
  request: Request,
  { params }: { params: Promise<{ eventId: string }> },
) {
  try {
    const { eventId: rawEventId } = await params;
    const eventId = requireUuidParam(rawEventId, "event");

    // Only Presidents and Event Managers may work the door.
    const context = await requireEventAccess(eventId, "attendance:scan");

    const input = await parseJsonBody(request, checkInSchema);

    enforceRateLimit("scan", context.user.id);

    const result = await checkIn({
      eventId,
      tenantId: context.event.tenantId,
      code: input.code,
      source: input.source,
      // A live scan may arrive without an id; generate one so that a retried
      // request from an unstable connection still collapses into one row.
      scanUuid: input.scanUuid ?? randomUUID(),
      scannedAt: input.scannedAt,
      checkedInById: context.user.id,
      deviceLabel: input.deviceLabel ?? null,
    });

    return ok(result);
  } catch (error) {
    return handleRouteError(error);
  }
}

export const POST = withApiRoute("POST /api/events/[eventId]/check-in", handlePOST);
