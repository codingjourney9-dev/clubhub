import { z } from "zod";
import { withApiRoute } from "@/lib/api/handler";
import { parseJsonBody } from "@/lib/api/request";
import { handleRouteError, ok } from "@/lib/api/response";
import { requireClubAccess } from "@/lib/auth/guards";
import { setAnnouncementPinned } from "@/lib/services/announcement-service";
import { pinAnnouncementSchema } from "@/lib/validation/announcement";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const paramsSchema = z.object({
  clubId: z.uuid("That is not a valid club id."),
  announcementId: z.uuid("That is not a valid announcement id."),
});

/** POST …/announcements/:id/pin — { pinned: true } pins it (replacing the old pin); false unpins. */
async function handlePOST(
  request: Request,
  { params }: { params: Promise<{ clubId: string; announcementId: string }> },
) {
  try {
    const { clubId, announcementId } = paramsSchema.parse(await params);
    const context = await requireClubAccess(clubId, "announcement:post");
    const { pinned } = await parseJsonBody(request, pinAnnouncementSchema);

    const announcement = await setAnnouncementPinned({
      clubId,
      tenantId: context.club.tenantId,
      announcementId,
      pinned,
    });
    return ok({ announcement });
  } catch (error) {
    return handleRouteError(error);
  }
}

export const POST = withApiRoute("POST /api/clubs/[clubId]/announcements/[announcementId]/pin", handlePOST);
