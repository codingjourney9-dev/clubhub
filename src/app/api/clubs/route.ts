import { handleRouteError, ok } from "@/lib/api/response";
import { parseJsonBody } from "@/lib/api/request";
import { requireTenantAccess } from "@/lib/auth/guards";
import { createClub, listClubs } from "@/lib/services/club-service";
import { createClubSchema } from "@/lib/validation/club";
import { z } from "zod";
import { withApiRoute } from "@/lib/api/handler";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const listQuerySchema = z.object({ tenantId: z.uuid("A valid college id is required.") });

/** GET /api/clubs?tenantId=… — clubs in a college, with the caller's own role. */
async function handleGET(request: Request) {
  try {
    const url = new URL(request.url);
    const { tenantId } = listQuerySchema.parse({ tenantId: url.searchParams.get("tenantId") });

    const context = await requireTenantAccess(tenantId, "tenant:read");
    const clubs = await listClubs(tenantId, context.user.id);

    return ok({ clubs });
  } catch (error) {
    return handleRouteError(error);
  }
}

/**
 * POST /api/clubs — create a club.
 *
 * The tenantId in the body is never trusted on its own: `requireTenantAccess`
 * verifies the caller is an Owner/Admin of exactly that college before anything
 * is written. The founder is enrolled as the club's President.
 */
async function handlePOST(request: Request) {
  try {
    const input = await parseJsonBody(request, createClubSchema);
    const context = await requireTenantAccess(input.tenantId, "club:create");

    const club = await createClub(context.tenantId, context.user.id, input);

    return ok({ club }, { status: 201 });
  } catch (error) {
    return handleRouteError(error);
  }
}

export const GET = withApiRoute("GET /api/clubs", handleGET);
export const POST = withApiRoute("POST /api/clubs", handlePOST);
