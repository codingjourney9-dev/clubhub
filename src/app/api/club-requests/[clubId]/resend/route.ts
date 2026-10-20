import { withApiRoute } from "@/lib/api/handler";
import { requireUuidParam } from "@/lib/api/params";
import { handleRouteError, ok } from "@/lib/api/response";
import { requireUser } from "@/lib/auth/session";
import { resendClubCode } from "@/lib/services/club-request-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/club-requests/:clubId/resend — issue a fresh code (the old one stops
 * working). The student who asked only; at most once every 30 seconds (429).
 * No body.
 */
async function handlePOST(_request: Request, { params }: { params: Promise<{ clubId: string }> }) {
  try {
    const clubId = requireUuidParam((await params).clubId, "club");
    const user = await requireUser();
    const code = await resendClubCode(clubId, user.id);
    return ok({ code });
  } catch (error) {
    return handleRouteError(error);
  }
}

export const POST = withApiRoute("POST /api/club-requests/[clubId]/resend", handlePOST);
