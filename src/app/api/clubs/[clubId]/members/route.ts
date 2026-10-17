import { handleRouteError, ok } from "@/lib/api/response";
import { requireClubAccess } from "@/lib/auth/guards";
import { listClubMembers } from "@/lib/services/club-service";
import { withApiRoute } from "@/lib/api/handler";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET /api/clubs/:clubId/members — active members and their roles. */
async function handleGET(_request: Request, { params }: { params: Promise<{ clubId: string }> }) {
  try {
    const { clubId } = await params;
    const context = await requireClubAccess(clubId, "club:view_members");

    const members = await listClubMembers(clubId, context.club.tenantId);
    return ok({ members });
  } catch (error) {
    return handleRouteError(error);
  }
}

export const GET = withApiRoute("GET /api/clubs/[clubId]/members", handleGET);
