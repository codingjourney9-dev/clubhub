import { withApiRoute } from "@/lib/api/handler";
import { requireUuidParam } from "@/lib/api/params";
import { handleRouteError, ok } from "@/lib/api/response";
import { requireClubAccess } from "@/lib/auth/guards";
import { listOpeningApplications } from "@/lib/services/recruitment-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET …/openings/:openingId/applications — the applications, for the people who decide them. */
async function handleGET(
  _request: Request,
  { params }: { params: Promise<{ clubId: string; openingId: string }> },
) {
  try {
    const raw = await params;
    const clubId = requireUuidParam(raw.clubId, "club");
    const openingId = requireUuidParam(raw.openingId, "opening");
    const context = await requireClubAccess(clubId, "opening:manage_member");

    const result = await listOpeningApplications({
      clubId,
      tenantId: context.club.tenantId,
      actor: { tenantRole: context.tenantRole, clubRole: context.clubRole },
      openingId,
    });
    return ok(result);
  } catch (error) {
    return handleRouteError(error);
  }
}

export const GET = withApiRoute("GET /api/clubs/[clubId]/openings/[openingId]/applications", handleGET);
