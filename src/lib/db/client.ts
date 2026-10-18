import "server-only";

import { PrismaPg } from "@prisma/adapter-pg";

import { PrismaClient } from "@/generated/prisma/client";
import { serverEnv } from "@/lib/env";

/**
 * Prisma 7 client, constructed with a driver adapter (required in v7 — the
 * Rust query engine is gone, so connections are pooled by `pg` underneath).
 *
 * A global singleton keeps `next dev`'s hot reload from opening a new pool on
 * every edit; production builds get exactly one client per process.
 */
const globalForPrisma = globalThis as unknown as { __clubhubPrisma?: PrismaClient };

/**
 * How many Postgres connections one instance may hold open.
 *
 * `pg` defaults to 10, which is sensible for a long-lived server and wrong for
 * serverless: every warm function instance gets its own pool, and free database
 * plans often allow only a handful of connections in total. Setting
 * `DATABASE_POOL_MAX=1` (Vercel, Lambda) is the difference between a working
 * deploy and `P2037: too many database connections`.
 */
function poolMax(): number | undefined {
  const raw = process.env.DATABASE_POOL_MAX;
  if (!raw) return undefined;

  const parsed = Number.parseInt(raw, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : undefined;
}

function createPrismaClient(): PrismaClient {
  const max = poolMax();
  const adapter = new PrismaPg({
    connectionString: serverEnv().DATABASE_URL,
    ...(max ? { max } : {}),
  });

  return new PrismaClient({
    adapter,
    log:
      serverEnv().NODE_ENV === "production"
        ? ["error"]
        : ["warn", "error"],
  });
}

/**
 * One client per process — and this line matters more than it looks.
 *
 * The first version of the lazy client only cached in development, so in
 * production every property access built a *new* Prisma client with its own
 * connection pool. Postgres ran out of slots within a handful of requests
 * (`P2037: too many database connections`). A module-scoped cache is the actual
 * singleton; `globalThis` is only there so `next dev`'s hot reload reuses a pool
 * instead of leaking one per edit.
 */
let cachedClient: PrismaClient | null = null;

function getClient(): PrismaClient {
  if (cachedClient) return cachedClient;

  if (process.env.NODE_ENV !== "production" && globalForPrisma.__clubhubPrisma) {
    cachedClient = globalForPrisma.__clubhubPrisma;
    return cachedClient;
  }

  cachedClient = createPrismaClient();

  if (process.env.NODE_ENV !== "production") {
    globalForPrisma.__clubhubPrisma = cachedClient;
  }

  return cachedClient;
}

/**
 * The database handle, connected **lazily**.
 *
 * Constructing the client reads DATABASE_URL, and `next build` imports every
 * route module to collect page data — so an eager client would make a build
 * require a live database credential. That is both awkward (CI needs production
 * secrets to compile a page that never runs) and dangerous (those secrets end up
 * in the build environment of every pull request).
 *
 * A Proxy defers the connection until the first query, so:
 *   • `next build` needs no DATABASE_URL at all,
 *   • a missing database is a request-time error with a clear message, not a
 *     build-time mystery,
 *   • every existing call site (`db.user.findMany`, `db.$transaction`, ...) is
 *     unchanged.
 */
export const db: PrismaClient = new Proxy({} as PrismaClient, {
  get(_target, property) {
    const client = getClient();
    // Bind functions to the real client: Prisma's methods rely on `this`.
    const value = Reflect.get(client, property, client) as unknown;
    return typeof value === "function" ? value.bind(client) : value;
  },
  has(_target, property) {
    return property in getClient();
  },
});

// Warm the connection in the background during development, where the first
// request after an edit should not pay for the handshake. Never at build time.
if (process.env.NODE_ENV === "development") {
  void Promise.resolve().then(() => getClient());
}
