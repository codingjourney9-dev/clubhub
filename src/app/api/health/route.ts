import { ok } from "@/lib/api/response";
import { siteConfig } from "@/config/site";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Liveness probe. Phase 2 adds database and auth-provider checks to the payload;
 * for now it proves the API layer, response envelope and routing all work.
 */
export async function GET() {
  return ok({
    status: "ok",
    service: siteConfig.name,
    phase: 1,
    environment: process.env.NODE_ENV ?? "development",
    timestamp: new Date().toISOString(),
    uptimeSeconds: Math.round(process.uptime()),
    node: process.version,
  });
}
