import { withApiRoute } from "@/lib/api/handler";
import { requireUuidParam } from "@/lib/api/params";
import { parseJsonBody } from "@/lib/api/request";
import { handleRouteError, ok } from "@/lib/api/response";
import { requireUser } from "@/lib/auth/session";
import { enforceRateLimit } from "@/lib/rate-limit/budgets";
import { verifyClubCode } from "@/lib/services/club-request-service";
import { verifyClubCodeSchema } from "@/lib/validation/club-request";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/club-requests/:clubId/verify — { code: "123456" }.
 * The student who asked only. Right code → the club goes live (200).
 * Wrong / expired / used-up code → 422 with a message saying what to do next.
 */
async function handlePOST(request: Request, { params }: { params: Promise<{ clubId: string }> }) {
  try {
    const clubId = requireUuidParam((await params).clubId, "club");
    const user = await requireUser();
    const { code } = await parseJsonBody(request, verifyClubCodeSchema);
    enforceRateLimit("clubCode", user.id);

    const club = await verifyClubCode(clubId, user.id, code);
    return ok({ club });
  } catch (error) {
    return handleRouteError(error);
  }
}

export const POST = withApiRoute("POST /api/club-requests/[clubId]/verify", handlePOST);
