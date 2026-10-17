import { ok } from "@/lib/api/response";
import { withApiRoute } from "@/lib/api/handler";
import { siteConfig } from "@/config/site";
import { db } from "@/lib/db/client";
import { isDemoModeEnabled } from "@/lib/demo/mode";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Liveness + readiness.
 *
 * Two different questions, answered separately:
 *
 *  • **Liveness** — is the process alive? If this file runs at all, yes.
 *  • **Readiness** — can it actually serve traffic? That needs a reachable
 *    database *and* a schema that has been migrated. A deploy that forgot
 *    `prisma migrate deploy` serves 500s while the process looks perfectly
 *    healthy, so the check below asks the database what it thinks.
 *
 * A failure is reported as `degraded` with a 503 rather than crashing, so the
 * probe can read the diagnosis instead of a connection reset.
 */

type CheckState = "up" | "down";

interface DatabaseCheck {
  readonly state: CheckState;
  readonly latencyMs: number;
  readonly error?: string;
}

interface MigrationCheck {
  readonly state: CheckState;
  /** How many migrations the database says it has applied. */
  readonly applied: number;
  /** Name of the most recent one — "is the deploy current?" in one string. */
  readonly latest: string | null;
  readonly error?: string;
}

async function checkDatabase(): Promise<DatabaseCheck> {
  const startedAt = Date.now();
  try {
    await db.$queryRaw`SELECT 1`;
    return { state: "up", latencyMs: Date.now() - startedAt };
  } catch (error) {
    return {
      state: "down",
      latencyMs: Date.now() - startedAt,
      error: error instanceof Error ? error.message : "Unknown database error",
    };
  }
}

/**
 * Reads Prisma's own bookkeeping table.
 *
 * `applied > 0` is the difference between "the database is up" and "the database
 * is ready": a fresh, empty database answers `SELECT 1` just fine and then fails
 * every real query.
 */
async function checkMigrations(): Promise<MigrationCheck> {
  try {
    const rows = await db.$queryRaw<{ applied: bigint; latest: string | null }[]>`
      SELECT
        (SELECT COUNT(*) FROM "_prisma_migrations" WHERE finished_at IS NOT NULL) AS applied,
        (SELECT migration_name FROM "_prisma_migrations"
          WHERE finished_at IS NOT NULL
          ORDER BY finished_at DESC LIMIT 1) AS latest
    `;

    const row = rows[0];
    return {
      state: row && Number(row.applied) > 0 ? "up" : "down",
      applied: row ? Number(row.applied) : 0,
      latest: row?.latest ?? null,
    };
  } catch (error) {
    return {
      state: "down",
      applied: 0,
      latest: null,
      error: error instanceof Error ? error.message : "Migration table unreadable",
    };
  }
}

async function handleGET(): Promise<Response> {
  const [database, migrations] = await Promise.all([checkDatabase(), checkMigrations()]);

  const ready = database.state === "up" && migrations.state === "up";

  return ok(
    {
      status: ready ? "ok" : "degraded",
      /** True only when this instance can serve a real request right now. */
      ready,
      service: siteConfig.name,
      version: siteConfig.version,
      phase: 7,
      environment: process.env.NODE_ENV ?? "development",
      timestamp: new Date().toISOString(),
      uptimeSeconds: Math.round(process.uptime()),
      node: process.version,
      checks: {
        database,
        migrations,
        demoMode: { state: isDemoModeEnabled() ? "on" : "off" },
      },
    },
    // Readiness probes should see a non-200 when a dependency is down.
    { status: ready ? 200 : 503 },
  );
}

export const GET = withApiRoute("GET /api/health", handleGET);
