import { handleRouteError, ok } from "@/lib/api/response";
import { parseJsonBody } from "@/lib/api/request";
import { requireTenantAccess } from "@/lib/auth/guards";
import { checkRateLimit } from "@/lib/rate-limit/token-bucket";
import { createTenantInvite } from "@/lib/services/invite-service";
import { createTenantInviteSchema } from "@/lib/validation/invite";
import { fail } from "@/lib/api/response";
import { withApiRoute } from "@/lib/api/handler";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** 30 invite links per user per hour — refills one every 2 minutes. */
const INVITE_RATE_LIMIT = { limit: 30, refillPerSecond: 30 / 3600 } as const;

/** POST /api/tenants/:tenantId/invites — create a link that grants a tenant role. */
async function handlePOST(request: Request, { params }: { params: Promise<{ tenantId: string }> }) {
  try {
    const { tenantId } = await params;
    const context = await requireTenantAccess(tenantId, "tenant:invite");

    const limit = checkRateLimit({
      key: `invite:tenant:${context.user.id}`,
      ...INVITE_RATE_LIMIT,
    });
    if (!limit.allowed) {
      return fail("RATE_LIMITED", "You are creating invite links very quickly. Try again in a minute.", {
        headers: { "Retry-After": String(limit.retryAfterSeconds) },
      });
    }

    const input = await parseJsonBody(request, createTenantInviteSchema);
    const invite = await createTenantInvite(tenantId, context.role, context.user.id, input);

    return ok({ invite }, { status: 201 });
  } catch (error) {
    return handleRouteError(error);
  }
}

export const POST = withApiRoute("POST /api/tenants/[tenantId]/invites", handlePOST);
