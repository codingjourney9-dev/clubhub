import { fail, handleRouteError, ok } from "@/lib/api/response";
import { parseJsonBody } from "@/lib/api/request";
import { requireClubAccess } from "@/lib/auth/guards";
import { checkRateLimit } from "@/lib/rate-limit/token-bucket";
import { createClubInvite, listClubInvites } from "@/lib/services/invite-service";
import { createClubInviteSchema } from "@/lib/validation/invite";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** 30 invite links per user per hour — refills one every 2 minutes. */
const INVITE_RATE_LIMIT = { limit: 30, refillPerSecond: 30 / 3600 } as const;

/** GET /api/clubs/:clubId/invites — the links this club has issued (President/college admin). */
export async function GET(_request: Request, { params }: { params: Promise<{ clubId: string }> }) {
  try {
    const { clubId } = await params;
    const context = await requireClubAccess(clubId, "club:invite");

    const invites = await listClubInvites(clubId, context.club.tenantId);
    return ok({ invites });
  } catch (error) {
    return handleRouteError(error);
  }
}

/**
 * POST /api/clubs/:clubId/invites — mint an invite link.
 *
 * The role is chosen by the creator and validated against what they may hand out
 * (`canAssignClubRole`), so an Event Manager can never produce a President link.
 * Rate limited because a leaked session should not be able to spray links.
 */
export async function POST(request: Request, { params }: { params: Promise<{ clubId: string }> }) {
  try {
    const { clubId } = await params;
    const context = await requireClubAccess(clubId, "club:invite");

    const limit = checkRateLimit({ key: `invite:club:${context.user.id}`, ...INVITE_RATE_LIMIT });
    if (!limit.allowed) {
      return fail("RATE_LIMITED", "You are creating invite links very quickly. Try again in a minute.", {
        headers: { "Retry-After": String(limit.retryAfterSeconds) },
      });
    }

    const input = await parseJsonBody(request, createClubInviteSchema);
    const invite = await createClubInvite(
      clubId,
      context.club.tenantId,
      { tenantRole: context.tenantRole, clubRole: context.clubRole },
      context.user.id,
      input,
    );

    return ok({ invite }, { status: 201 });
  } catch (error) {
    return handleRouteError(error);
  }
}
