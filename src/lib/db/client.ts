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

function createPrismaClient(): PrismaClient {
  const adapter = new PrismaPg({ connectionString: serverEnv().DATABASE_URL });

  return new PrismaClient({
    adapter,
    log:
      serverEnv().NODE_ENV === "production"
        ? ["error"]
        : ["warn", "error"],
  });
}

export const db: PrismaClient = globalForPrisma.__clubhubPrisma ?? createPrismaClient();

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.__clubhubPrisma = db;
}
