import { afterAll } from "vitest";

import { disconnectTestDb } from "./helpers/db";
import { TEST_DATABASE_URL } from "./helpers/test-database";

/**
 * Runs before every test file is imported.
 *
 * Phase 3 tests call the real service layer, which uses the application's own
 * database client (`@/lib/db/client`). That client reads `DATABASE_URL`, so it
 * is repointed at the throwaway test database here — BEFORE anything imports it.
 * Without this line, service tests would quietly run against the development
 * database and truncate real seeded data.
 *
 * `tests/helpers/db.ts` proves the redirection worked with `assertTestDatabase()`,
 * so a mistake fails loudly instead of damaging dev data.
 */
process.env.DATABASE_URL = TEST_DATABASE_URL;

// The env contract requires a signing secret; tests never sign a session, but
// importing any server module runs the validation.
process.env.AUTH_SECRET ??= "test-secret-0123456789-0123456789-0123456789";

/** One pooled client for the whole file; closed when the worker ends. */
afterAll(async () => {
  await disconnectTestDb();
});
