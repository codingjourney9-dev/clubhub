import { withApiRoute } from "@/lib/api/handler";
import { requireUuidParam } from "@/lib/api/params";
import { parseJsonBody } from "@/lib/api/request";
import { handleRouteError, ok } from "@/lib/api/response";
import { requireClubAccess } from "@/lib/auth/guards";
import { decideApplication } from "@/lib/services/recruitment-service";
import { decideApplicationSchema } from "@/lib/validation/opening";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/clubs/:clubId/applications/:applicationId/decision — { decision: "ACCEPT" | "REJECT" }.
 * Accepting grants the opening's role at once.
 */
async function handlePOST(
  request: Request,
  { params }: { params: Promise<{ clubId: string; applicationId: string }> },
) {
  try {
    const raw = await params;
    const clubId = requireUuidParam(raw.clubId, "club");
    const applicationId = requireUuidParam(raw.applicationId, "application");
    const context = await requireClubAccess(clubId, "opening:manage_member");
    const { decision } = await parseJsonBody(request, decideApplicationSchema);

    const result = await decideApplication({
      clubId,
      tenantId: context.club.tenantId,
      actor: { userId: context.user.id, tenantRole: context.tenantRole, clubRole: context.clubRole },
      applicationId,
      decision,
    });
    return ok(result);
  } catch (error) {
    return handleRouteError(error);
  }
}

export const POST = withApiRoute("POST /api/clubs/[clubId]/applications/[applicationId]/decision", handlePOST);
