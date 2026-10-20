import { z } from "zod";
import { withApiRoute } from "@/lib/api/handler";
import { parseJsonBody } from "@/lib/api/request";
import { handleRouteError, ok } from "@/lib/api/response";
import { requireClubAccess } from "@/lib/auth/guards";
import { enforceRateLimit } from "@/lib/rate-limit/budgets";
import { createAnnouncement, listClubAnnouncements } from "@/lib/services/announcement-service";
import { createAnnouncementSchema } from "@/lib/validation/announcement";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const paramsSchema = z.object({ clubId: z.uuid("That is not a valid club id.") });
type Params = { params: Promise<{ clubId: string }> };

/** GET /api/clubs/:clubId/announcements — members (and college admins) only. */
async function handleGET(_request: Request, { params }: Params) {
  try {
    const { clubId } = paramsSchema.parse(await params);
    const context = await requireClubAccess(clubId, "announcement:read");
    const announcements = await listClubAnnouncements(clubId, context.club.tenantId);
    return ok({ announcements });
  } catch (error) {
    return handleRouteError(error);
  }
}

/** POST /api/clubs/:clubId/announcements — Leads and the President. Body: { title, body, pinned? }. */
async function handlePOST(request: Request, { params }: Params) {
  try {
    const { clubId } = paramsSchema.parse(await params);
    const context = await requireClubAccess(clubId, "announcement:post");
    const input = await parseJsonBody(request, createAnnouncementSchema);
    enforceRateLimit("announce", context.user.id);

    const announcement = await createAnnouncement({
      clubId,
      tenantId: context.club.tenantId,
      authorId: context.user.id,
      input,
    });
    return ok({ announcement }, { status: 201 });
  } catch (error) {
    return handleRouteError(error);
  }
}

export const GET = withApiRoute("GET /api/clubs/[clubId]/announcements", handleGET);
export const POST = withApiRoute("POST /api/clubs/[clubId]/announcements", handlePOST);
