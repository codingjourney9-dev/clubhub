// Prisma 7 configuration.
// Prisma 7 no longer auto-loads .env files, so `dotenv/config` is imported here
// (this file is only ever read by the Prisma CLI, never by the Next.js runtime).
import "dotenv/config";
import { defineConfig } from "prisma/config";

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
    seed: "tsx prisma/seed.ts",
  },
  datasource: {
    // Migrations need a DIRECT connection. When DATABASE_URL points at a pooler
    // (PgBouncer, Neon, Supabase), advisory locks and DDL fail in transaction
    // mode, so DIRECT_DATABASE_URL — when set — wins here.
    url: process.env["DIRECT_DATABASE_URL"] ?? process.env["DATABASE_URL"],
  },
});
