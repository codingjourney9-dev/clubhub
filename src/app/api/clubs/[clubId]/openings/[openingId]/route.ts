import { withApiRoute } from "@/lib/api/handler";
import { requireUuidParam } from "@/lib/api/params";
import { parseJsonBody } from "@/lib/api/request";
import { handleRouteError, ok } from "@/lib/api/response";
import { requireClubAccess } from "@/lib/auth/guards";
import { updateOpening } from "@/lib/services/recruitment-service";
import { updateOpeningSchema } from "@/lib/validation/opening";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** PATCH /api/clubs/:clubId/openings/:openingId — edit, close ({status:"CLOSED"}) or reopen. */
async function handlePATCH(
  request: Request,
  { params }: { params: Promise<{ clubId: string; openingId: string }> },
) {
  try {
    const raw = await params;
    const clubId = requireUuidParam(raw.clubId, "club");
    const openingId = requireUuidParam(raw.openingId, "opening");
    const context = await requireClubAccess(clubId, "opening:manage_member");
    const input = await parseJsonBody(request, updateOpeningSchema);

    const opening = await updateOpening({
      clubId,
      tenantId: context.club.tenantId,
      timeZone: context.club.timezone,
      actor: { tenantRole: context.tenantRole, clubRole: context.clubRole },
      openingId,
      input,
    });
    return ok({ opening });
  } catch (error) {
    return handleRouteError(error);
  }
}

export const PATCH = withApiRoute("PATCH /api/clubs/[clubId]/openings/[openingId]", handlePATCH);
