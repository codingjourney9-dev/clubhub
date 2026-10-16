import { handleRouteError, ok } from "@/lib/api/response";
import { requireClubAccess } from "@/lib/auth/guards";
import { revokeInvite } from "@/lib/services/invite-service";
import { z } from "zod";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const paramsSchema = z.object({ clubId: z.uuid(), inviteId: z.uuid() });

/** POST /api/clubs/:clubId/invites/:inviteId/revoke — cancel a link immediately. */
export async function POST(
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
