import { z } from "zod";
import { withApiRoute } from "@/lib/api/handler";
import { parseJsonBody } from "@/lib/api/request";
import { handleRouteError, ok } from "@/lib/api/response";
import { requireClubAccess } from "@/lib/auth/guards";
import { transferPresidency } from "@/lib/services/club-service";
import { transferPresidencySchema } from "@/lib/validation/club";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const paramsSchema = z.object({ clubId: z.uuid("That is not a valid club id.") });

/**
 * POST /api/clubs/:clubId/presidency — hand the club to another member.
 *
 * Body: { newPresidentUserId, formerPresidentBecomes: "EVENT_MANAGER" | "MEMBER",
 *         confirmClubName }. President or college admin only.
 */
async function handlePOST(request: Request, { params }: { params: Promise<{ clubId: string }> }) {
  try {
    const { clubId } = paramsSchema.parse(await params);
    const context = await requireClubAccess(clubId, "club:transfer_presidency");
    const input = await parseJsonBody(request, transferPresidencySchema);

    const result = await transferPresidency(clubId, context.club.tenantId, input);
    return ok(result);
  } catch (error) {
    return handleRouteError(error);
  }
}

export const POST = withApiRoute("POST /api/clubs/[clubId]/presidency", handlePOST);
