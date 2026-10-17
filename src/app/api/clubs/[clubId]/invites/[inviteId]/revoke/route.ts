import { handleRouteError, ok } from "@/lib/api/response";
import { requireClubAccess } from "@/lib/auth/guards";
import { revokeInvite } from "@/lib/services/invite-service";
import { z } from "zod";
import { withApiRoute } from "@/lib/api/handler";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const paramsSchema = z.object({ clubId: z.uuid(), inviteId: z.uuid() });

/** POST /api/clubs/:clubId/invites/:inviteId/revoke — cancel a link immediately. */
async function handlePOST(
  _request: Request,
  { params }: { params: Promise<{ clubId: string; inviteId: string }> },
) {
  try {
    const raw = await params;
    const { clubId, inviteId } = paramsSchema.parse(raw);

    const context = await requireClubAccess(clubId, "club:invite");
    const result = await revokeInvite(inviteId, clubId, context.club.tenantId);

    return ok(result);
  } catch (error) {
    return handleRouteError(error);
  }
}

export const POST = withApiRoute("POST /api/clubs/[clubId]/invites/[inviteId]/revoke", handlePOST);
