import { requireUuidParam } from "@/lib/api/params";
import { handleRouteError, ok } from "@/lib/api/response";
import { requireEventAccess } from "@/lib/auth/guards";
import { getDoorManifest } from "@/lib/services/check-in-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/events/:eventId/check-in/manifest — what the phone downloads before
 * the signal dies.
 *
 * It contains a **fingerprint** of each ticket secret, never the secret itself.
 * That is the difference between a volunteer's phone being able to *verify* a
 * ticket offline and it being a wallet of live tickets someone could copy.
 *
 * Organisers only (`attendance:scan`).
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ eventId: string }> },
) {
  try {
    const { eventId: rawEventId } = await params;
    const eventId = requireUuidParam(rawEventId, "event");

    const context = await requireEventAccess(eventId, "attendance:scan");
    const manifest = await getDoorManifest(eventId, context.event.tenantId);

    return ok(manifest, {
      // The door should always fetch fresh state; a cached manifest would happily
      // let somebody in twice.
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    return handleRouteError(error);
  }
}
