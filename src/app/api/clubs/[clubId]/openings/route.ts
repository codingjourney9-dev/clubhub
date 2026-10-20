import { withApiRoute } from "@/lib/api/handler";
import { requireUuidParam } from "@/lib/api/params";
import { parseJsonBody } from "@/lib/api/request";
import { handleRouteError, ok } from "@/lib/api/response";
import { requireClubAccess } from "@/lib/auth/guards";
import { createOpening } from "@/lib/services/recruitment-service";
import { createOpeningSchema } from "@/lib/validation/opening";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/clubs/:clubId/openings — post a role opening.
 * Member openings: Leads and the President. Lead openings: the President.
 */
async function handlePOST(request: Request, { params }: { params: Promise<{ clubId: string }> }) {
  try {
    const clubId = requireUuidParam((await params).clubId, "club");
    // Entry: at least the Member-openings tier. The service applies the tier
    // that matches the role being offered.
    const context = await requireClubAccess(clubId, "opening:manage_member");
    const input = await parseJsonBody(request, createOpeningSchema);

    const opening = await createOpening({
      clubId,
      tenantId: context.club.tenantId,
      timeZone: context.club.timezone,
      actor: { userId: context.user.id, tenantRole: context.tenantRole, clubRole: context.clubRole },
      input,
    });
    return ok({ opening }, { status: 201 });
  } catch (error) {
    return handleRouteError(error);
  }
}

export const POST = withApiRoute("POST /api/clubs/[clubId]/openings", handlePOST);
