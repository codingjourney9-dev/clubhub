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
    url: process.env["DATABASE_URL"],
  },
});
