import { execFileSync } from "node:child_process";

import { Client } from "pg";

import { ADMIN_DATABASE_URL, TEST_DATABASE_NAME, TEST_DATABASE_URL } from "./helpers/test-database";

/**
 * Builds the test database from scratch:
 *   1. drop + create  (unconditionally — no shared state between runs)
 *   2. `prisma migrate deploy` — the same command production runs
 *   3. no seed: the seed test runs it itself to prove idempotency
 *
 * If step 2 fails, the suite fails loudly rather than testing a half-built schema.
 */
export default async function globalSetup() {
  const admin = new Client({ connectionString: ADMIN_DATABASE_URL });
  await admin.connect();
  try {
    await admin.query(`DROP DATABASE IF EXISTS "${TEST_DATABASE_NAME}" WITH (FORCE);`);
    await admin.query(`CREATE DATABASE "${TEST_DATABASE_NAME}";`);
  } finally {
    await admin.end();
  }

  execFileSync("npx", ["prisma", "migrate", "deploy"], {
    cwd: process.cwd(),
    env: { ...process.env, DATABASE_URL: TEST_DATABASE_URL },
    stdio: "pipe",
  });
}
