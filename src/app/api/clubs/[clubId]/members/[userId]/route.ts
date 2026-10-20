import { handleRouteError, ok } from "@/lib/api/response";
import { parseJsonBody } from "@/lib/api/request";
import { requireClubAccess } from "@/lib/auth/guards";
import { removeClubMember, updateClubMemberRole } from "@/lib/services/club-service";
import { updateClubMemberRoleSchema } from "@/lib/validation/club";
import { z } from "zod";
import { withApiRoute } from "@/lib/api/handler";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const paramsSchema = z.object({
  clubId: z.uuid(),
  userId: z.uuid("That is not a valid member id."),
});

/**
 * PATCH /api/clubs/:clubId/members/:userId — move someone between Member and Lead.
 * President (or college admin) only. Presidency changes via POST …/presidency.
 */
async function handlePATCH(
  request: Request,
  { params }: { params: Promise<{ clubId: string; userId: string }> },
) {
  try {
    const raw = await params;
    const { clubId, userId } = paramsSchema.parse(raw);

    const context = await requireClubAccess(clubId, "club:change_roles");
    const input = await parseJsonBody(request, updateClubMemberRoleSchema);

    // Per-target rules (never the President, never yourself) live in the
    // service, checked under the club lock.
    const membership = await updateClubMemberRole(
      clubId,
      context.club.tenantId,
      { userId: context.user.id, tenantRole: context.tenantRole, clubRole: context.clubRole },
      userId,
      input.role,
    );
    return ok({ membership });
  } catch (error) {
    return handleRouteError(error);
  }
}

/**
 * DELETE /api/clubs/:clubId/members/:userId — soft-remove someone (history is kept).
 * Leads remove Members; only the President removes Leads; the President can't
 * be removed. Their upcoming members-only seats are given back.
 */
async function handleDELETE(
  _request: Request,
  { params }: { params: Promise<{ clubId: string; userId: string }> },
) {
  try {
    const raw = await params;
    const { clubId, userId } = paramsSchema.parse(raw);

    // Entry check: at least the lowest removal tier. The service then applies
    // the tier that matches the target's role.
    const context = await requireClubAccess(clubId, "club:remove_member");
    const result = await removeClubMember(
      clubId,
      context.club.tenantId,
      { userId: context.user.id, tenantRole: context.tenantRole, clubRole: context.clubRole },
      userId,
    );

    return ok(result);
  } catch (error) {
    return handleRouteError(error);
  }
}

export const PATCH = withApiRoute("PATCH /api/clubs/[clubId]/members/[userId]", handlePATCH);
export const DELETE = withApiRoute("DELETE /api/clubs/[clubId]/members/[userId]", handleDELETE);
