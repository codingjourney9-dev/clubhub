import { withApiRoute } from "@/lib/api/handler";
import { requireUuidParam } from "@/lib/api/params";
import { parseJsonBody } from "@/lib/api/request";
import { handleRouteError, ok } from "@/lib/api/response";
import { requireUser } from "@/lib/auth/session";
import { withdrawApplication } from "@/lib/services/recruitment-service";
import { z } from "zod";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** The body is empty on purpose; validating it still refuses smuggled fields. */
const withdrawBodySchema = z.strictObject({});

/** POST /api/applications/:applicationId/withdraw — the applicant takes back a pending application. */
async function handlePOST(request: Request, { params }: { params: Promise<{ applicationId: string }> }) {
  try {
    const applicationId = requireUuidParam((await params).applicationId, "application");
    const user = await requireUser();
    await parseJsonBody(request, withdrawBodySchema);

    const result = await withdrawApplication(applicationId, user.id);
    return ok(result);
  } catch (error) {
    return handleRouteError(error);
  }
}

export const POST = withApiRoute("POST /api/applications/[applicationId]/withdraw", handlePOST);
