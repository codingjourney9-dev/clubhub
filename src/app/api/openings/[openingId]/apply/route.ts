import { withApiRoute } from "@/lib/api/handler";
import { requireUuidParam } from "@/lib/api/params";
import { parseJsonBody } from "@/lib/api/request";
import { handleRouteError, ok } from "@/lib/api/response";
import { requireUser } from "@/lib/auth/session";
import { enforceRateLimit } from "@/lib/rate-limit/budgets";
import { applyToOpening } from "@/lib/services/recruitment-service";
import { applySchema } from "@/lib/validation/opening";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/openings/:openingId/apply — { answers: string[] }, one per question.
 * Any signed-in student, from any college. Who is applying comes from the session.
 */
async function handlePOST(request: Request, { params }: { params: Promise<{ openingId: string }> }) {
  try {
    const openingId = requireUuidParam((await params).openingId, "opening");
    const user = await requireUser();
    const { answers } = await parseJsonBody(request, applySchema);
    enforceRateLimit("apply", user.id);

    const application = await applyToOpening({ openingId, applicantId: user.id, answers });
    return ok({ application }, { status: 201 });
  } catch (error) {
    return handleRouteError(error);
  }
}

export const POST = withApiRoute("POST /api/openings/[openingId]/apply", handlePOST);
