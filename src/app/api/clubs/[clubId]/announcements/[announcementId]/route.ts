import { z } from "zod";
import { withApiRoute } from "@/lib/api/handler";
import { parseJsonBody } from "@/lib/api/request";
import { handleRouteError, ok } from "@/lib/api/response";
import { requireClubAccess } from "@/lib/auth/guards";
import { deleteAnnouncement, updateAnnouncement } from "@/lib/services/announcement-service";
import { updateAnnouncementSchema } from "@/lib/validation/announcement";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const paramsSchema = z.object({
  clubId: z.uuid("That is not a valid club id."),
  announcementId: z.uuid("That is not a valid announcement id."),
});
type Params = { params: Promise<{ clubId: string; announcementId: string }> };

/** PATCH …/announcements/:id — the author edits the title and/or message. */
async function handlePATCH(request: Request, { params }: Params) {
  try {
    const { clubId, announcementId } = paramsSchema.parse(await params);
    const context = await requireClubAccess(clubId, "announcement:post");
    const input = await parseJsonBody(request, updateAnnouncementSchema);

    const announcement = await updateAnnouncement({
      clubId,
      tenantId: context.club.tenantId,
      actor: { userId: context.user.id, tenantRole: context.tenantRole, clubRole: context.clubRole },
      announcementId,
      input,
    });
    return ok({ announcement });
  } catch (error) {
    return handleRouteError(error);
  }
}

/** DELETE …/announcements/:id — the author, or the President / a college admin. */
async function handleDELETE(_request: Request, { params }: Params) {
  try {
    const { clubId, announcementId } = paramsSchema.parse(await params);
    const context = await requireClubAccess(clubId, "announcement:post");

    const result = await deleteAnnouncement({
      clubId,
      tenantId: context.club.tenantId,
      actor: { userId: context.user.id, tenantRole: context.tenantRole, clubRole: context.clubRole },
      announcementId,
    });
    return ok(result);
  } catch (error) {
    return handleRouteError(error);
  }
}

export const PATCH = withApiRoute("PATCH /api/clubs/[clubId]/announcements/[announcementId]", handlePATCH);
export const DELETE = withApiRoute("DELETE /api/clubs/[clubId]/announcements/[announcementId]", handleDELETE);
