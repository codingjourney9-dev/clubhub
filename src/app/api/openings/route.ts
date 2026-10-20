import { z } from "zod";

import { withApiRoute } from "@/lib/api/handler";
import { handleRouteError, ok } from "@/lib/api/response";
import { listOpenOpenings } from "@/lib/services/recruitment-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const querySchema = z.strictObject({
  limit: z.coerce.number().int().min(1).max(50).default(24),
  clubId: z.uuid("That is not a valid club id.").optional(),
});

/** GET /api/openings — the public recruitment board (every college, open roles only). */
async function handleGET(request: Request) {
  try {
    const query = querySchema.parse(Object.fromEntries(new URL(request.url).searchParams));
    const openings = await listOpenOpenings(query);
    return ok({ openings });
  } catch (error) {
    return handleRouteError(error);
  }
}

export const GET = withApiRoute("GET /api/openings", handleGET);
