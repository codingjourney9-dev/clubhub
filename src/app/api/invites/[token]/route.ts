import { fail, handleRouteError, ok } from "@/lib/api/response";
import { requireUser } from "@/lib/auth/session";
import { acceptInvite, previewInvite } from "@/lib/services/invite-service";
import { inviteTokenSchema } from "@/lib/validation/invite";
import { withApiRoute } from "@/lib/api/handler";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/invites/:token — public preview for the join page.
 * Reveals only what is needed to render "You have been invited to X as Y".
 */
async function handleGET(_request: Request, { params }: { params: Promise<{ token: string }> }) {
  try {
    const raw = await params;
    const token = inviteTokenSchema.parse(raw.token);

    const preview = await previewInvite(token);
    if (!preview) {
      return fail("NOT_FOUND", "That invite link is not valid.");
    }

    return ok({ invite: preview });
  } catch (error) {
    return handleRouteError(error);
  }
}

/**
 * POST /api/invites/:token — redeem the invite for the signed-in user.
 *
 * The granted role comes from the invite record, never the request body, and the
 * row is locked inside a transaction so a one-use link cannot be redeemed twice
 * concurrently.
 */
async function handlePOST(_request: Request, { params }: { params: Promise<{ token: string }> }) {
  try {
    const raw = await params;
    const token = inviteTokenSchema.parse(raw.token);

    const user = await requireUser();
    const result = await acceptInvite(token, user.id, user.email);

    return ok({ membership: result });
  } catch (error) {
    return handleRouteError(error);
  }
}

export const GET = withApiRoute("GET /api/invites/[token]", handleGET);
export const POST = withApiRoute("POST /api/invites/[token]", handlePOST);
