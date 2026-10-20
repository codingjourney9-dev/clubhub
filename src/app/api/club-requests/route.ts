import { withApiRoute } from "@/lib/api/handler";
import { parseJsonBody } from "@/lib/api/request";
import { handleRouteError, ok } from "@/lib/api/response";
import { requireUser } from "@/lib/auth/session";
import { enforceRateLimit } from "@/lib/rate-limit/budgets";
import { requestClub } from "@/lib/services/club-request-service";
import { requestClubSchema } from "@/lib/validation/club-request";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/club-requests — start a club (Phase 12).
 * { name, category?, description?, tenantId?, facultyName?, facultyEmail? }
 *
 * Any signed-in student. 201 with status PENDING (a code went to the professor)
 * or status ACTIVE (a college Owner/Admin starting a club in their own college).
 */
async function handlePOST(request: Request) {
  try {
    const user = await requireUser();
    const input = await parseJsonBody(request, requestClubSchema);
    enforceRateLimit("clubRequest", user.id);

    const club = await requestClub(user, input);
    return ok({ club }, { status: 201 });
  } catch (error) {
    return handleRouteError(error);
  }
}

export const POST = withApiRoute("POST /api/club-requests", handlePOST);
