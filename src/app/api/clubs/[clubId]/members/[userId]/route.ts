import { handleRouteError, ok } from "@/lib/api/response";
import { parseJsonBody } from "@/lib/api/request";
import { requireClubAccess } from "@/lib/auth/guards";
import { canAssignClubRole } from "@/lib/auth/rbac";
import { removeClubMember, updateClubMemberRole } from "@/lib/services/club-service";
import { updateClubMemberRoleSchema } from "@/lib/validation/club";
import { ApiError } from "@/lib/api/response";
import { z } from "zod";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const paramsSchema = z.object({
  clubId: z.uuid(),
  userId: z.uuid("That is not a valid member id."),
});

/** PATCH /api/clubs/:clubId/members/:userId — change someone's club role. */
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ clubId: string; userId: string }> },
) {
  try {
    const raw = await params;
    const { clubId, userId } = paramsSchema.parse(raw);

    const context = await requireClubAccess(clubId, "club:manage_members");
    const input = await parseJsonBody(request, updateClubMemberRoleSchema);

    // Nobody may grant a role more powerful than the one they hold.
    if (!canAssignClubRole({ tenantRole: context.tenantRole, clubRole: context.clubRole }, input.role)) {
      throw ApiError.forbidden(`You cannot grant the ${input.role} role.`);
    }

    const membership = await updateClubMemberRole(clubId, context.club.tenantId, userId, input.role);
    return ok({ membership });
  } catch (error) {
    return handleRouteError(error);
  }
}

/** DELETE /api/clubs/:clubId/members/:userId — soft-remove a member (history is kept). */
export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ clubId: string; userId: string }> },
) {
  try {
    const raw = await params;
    const { clubId, userId } = paramsSchema.parse(raw);

    const context = await requireClubAccess(clubId, "club:manage_members");
    const result = await removeClubMember(clubId, context.club.tenantId, userId);

    return ok(result);
  } catch (error) {
    return handleRouteError(error);
  }
}
