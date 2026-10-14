import "server-only";

import { z } from "zod";

/**
 * Server-side environment contract.
 *
 * Validation is LAZY on purpose: importing this module must never throw during
 * `next build`, otherwise a missing DATABASE_URL would break CI for pages that
 * do not touch the database. The first call to `serverEnv()` fails loudly with
 * an actionable message instead.
 */
const serverEnvSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),

  /** Postgres connection string (pool model: one database, tenantId on every core table). */
  DATABASE_URL: z
    .string()
    .min(1)
    .refine((value) => value.startsWith("postgres"), {
      message: "must be a postgres:// or postgresql:// connection string",
    }),

  /** Auth.js v5 session signing secret. Generate with `npx auth secret`. */
  AUTH_SECRET: z.string().min(32, "must be at least 32 characters"),

  /** Canonical origin used to build callback URLs behind proxies. */
  AUTH_URL: z.url().optional(),

  /** IANA timezone used when a tenant has not set one. All stored times are UTC. */
  DEFAULT_TENANT_TIMEZONE: z.string().min(1).default("Asia/Kolkata"),

  /** Rate limiter backend. `memory` is per-process; swap for Redis in production. */
  RATE_LIMIT_DRIVER: z.enum(["memory", "redis"]).default("memory"),
});

export type ServerEnv = z.infer<typeof serverEnvSchema>;

let cached: ServerEnv | null = null;

/**
 * Returns the validated server environment, cached after the first call.
 * @throws {Error} when one or more variables are missing or malformed.
 */
export function serverEnv(): ServerEnv {
  if (cached) return cached;

  const parsed = serverEnvSchema.safeParse(process.env);

  if (!parsed.success) {
    const details = parsed.error.issues
      .map((issue) => `  - ${issue.path.join(".") || "(root)"}: ${issue.message}`)
      .join("\n");

    throw new Error(
      `Invalid server environment variables:\n${details}\n\n` +
        "Copy .env.example to .env and fill in the missing values.",
    );
  }

  cached = parsed.data;
  return cached;
}

/** True when the database is configured; lets pages degrade instead of crashing. */
export function hasDatabaseConfig(): boolean {
  return serverEnvSchema.shape.DATABASE_URL.safeParse(process.env.DATABASE_URL).success;
}
