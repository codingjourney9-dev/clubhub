import { handleRouteError, ok } from "@/lib/api/response";
import { parseJsonBody } from "@/lib/api/request";
import { requireTenantAccess } from "@/lib/auth/guards";
import { updateTenant } from "@/lib/services/tenant-service";
import { updateTenantSchema } from "@/lib/validation/tenant";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** PATCH /api/tenants/:tenantId — update college name, timezone or branding (Owner/Admin). */
export async function PATCH(request: Request, { params }: { params: Promise<{ tenantId: string }> }) {
  try {
    const { tenantId } = await params;
    await requireTenantAccess(tenantId, "tenant:update");

    const input = await parseJsonBody(request, updateTenantSchema);
    const tenant = await updateTenant(tenantId, input);

    return ok({ tenant });
  } catch (error) {
    return handleRouteError(error);
  }
}
