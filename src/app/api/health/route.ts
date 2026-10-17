import { ok } from "@/lib/api/response";
import { siteConfig } from "@/config/site";
import { db } from "@/lib/db/client";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type DatabaseHealth =
  | { status: "up"; latencyMs: number }
  | { status: "down"; error: string };

/**
 * Liveness + readiness probe. Reports `degraded` rather than failing the
 * request when Postgres is unreachable, so the process stays up long enough to
 * serve the diagnosis.
 */
export async function GET() {
  const startedAt = Date.now();
  let database: DatabaseHealth;

  try {
    await db.$queryRaw`SELECT 1`;
    database = { status: "up", latencyMs: Date.now() - startedAt };
  } catch (error) {
    database = {
      status: "down",
      error: error instanceof Error ? error.message : "Unknown database error",
    };
  }

  return ok(
    {
      status: database.status === "up" ? "ok" : "degraded",
      service: siteConfig.name,
      phase: 6,
      environment: process.env.NODE_ENV ?? "development",
      timestamp: new Date().toISOString(),
      uptimeSeconds: Math.round(process.uptime()),
      node: process.version,
      database,
    },
    // Readiness probes should see a non-200 when a dependency is down.
    { status: database.status === "up" ? 200 : 503 },
  );
}
