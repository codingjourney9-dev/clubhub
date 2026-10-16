import { handleRouteError, ok } from "@/lib/api/response";
import { parseJsonBody } from "@/lib/api/request";
import { requireUser } from "@/lib/auth/session";
import { createTenantForUser, listTenantsForUser } from "@/lib/services/tenant-service";
import { createTenantSchema } from "@/lib/validation/tenant";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/tenants — the colleges the caller belongs to (powers the tenant switcher).
 * POST /api/tenants — self-serve college creation; the caller becomes its Owner.
 */
export async function GET() {
  try {
    const user = await requireUser();
    return ok({ tenants: await listTenantsForUser(user.id) });
  } catch (error) {
    return handleRouteError(error);
  }
}

export async function POST(request: Request) {
  try {
    const user = await requireUser();
    const input = await parseJsonBody(request, createTenantSchema);
    const tenant = await createTenantForUser(user.id, input);

    return ok({ tenant }, { status: 201 });
  } catch (error) {
    return handleRouteError(error);
  }
}
