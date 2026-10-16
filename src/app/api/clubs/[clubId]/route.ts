import { handleRouteError, ok } from "@/lib/api/response";
import { parseJsonBody } from "@/lib/api/request";
import { requireClubAccess } from "@/lib/auth/guards";
import { getClubById, softDeleteClub, updateClub } from "@/lib/services/club-service";
import { updateClubSchema } from "@/lib/validation/club";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET /api/clubs/:clubId — club detail (any member of the college). */
export async function GET(_request: Request, { params }: { params: Promise<{ clubId: string }> }) {
  try {
    const { clubId } = await params;
    const context = await requireClubAccess(clubId, "club:read");

    const club = await getClubById(clubId, context.club.tenantId);
    return ok({ club, viewerRole: context.clubRole, tenantRole: context.tenantRole });
  } catch (error) {
    return handleRouteError(error);
  }
}

/** PATCH /api/clubs/:clubId — edit name, description, category, logo (President or college admin). */
export async function PATCH(request: Request, { params }: { params: Promise<{ clubId: string }> }) {
  try {
    const { clubId } = await params;
    const context = await requireClubAccess(clubId, "club:update");

    const input = await parseJsonBody(request, updateClubSchema);
    const club = await updateClub(clubId, context.club.tenantId, input);

    return ok({ club });
  } catch (error) {
    return handleRouteError(error);
  }
}

/**
 * DELETE /api/clubs/:clubId — SOFT delete (sets deleted_at).
 *
 * Refused while published events are still upcoming, so a club cannot silently
 * disappear from under events students have already seen. Attendance and ticket
 * history is preserved.
 */
export async function DELETE(_request: Request, { params }: { params: Promise<{ clubId: string }> }) {
  try {
    const { clubId } = await params;
    const context = await requireClubAccess(clubId, "club:delete");

    const result = await softDeleteClub(clubId, context.club.tenantId);
    return ok(result);
  } catch (error) {
    return handleRouteError(error);
  }
}
