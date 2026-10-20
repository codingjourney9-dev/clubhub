import { withApiRoute } from "@/lib/api/handler";
import { requireUuidParam } from "@/lib/api/params";
import { handleRouteError, ok } from "@/lib/api/response";
import { requireUser } from "@/lib/auth/session";
import { cancelClubRequest } from "@/lib/services/club-request-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * DELETE /api/club-requests/:clubId — cancel a club that is still waiting for
 * its professor. The student who asked, or a college Owner/Admin; anyone else
 * gets 404 (a pending club is invisible to them). Soft delete.
 */
async function handleDELETE(_request: Request, { params }: { params: Promise<{ clubId: string }> }) {
  try {
    const clubId = requireUuidParam((await params).clubId, "club");
    const user = await requireUser();
    const result = await cancelClubRequest(clubId, user.id);
    return ok(result);
  } catch (error) {
    return handleRouteError(error);
  }
}

export const DELETE = withApiRoute("DELETE /api/club-requests/[clubId]", handleDELETE);
