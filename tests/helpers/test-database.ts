/**
 * Connection details for the throwaway database the test suite owns.
 *
 * The suite never touches the development database: it rebuilds `clubhub_test`
 * from zero on every run, which is also how the "migrations apply to a fresh
 * database" acceptance criterion gets verified instead of assumed.
 */

const DEV_URL = process.env.DATABASE_URL ?? "postgresql://clubhub:clubhub@localhost:5432/clubhub";

export const TEST_DATABASE_NAME = process.env.TEST_DATABASE_NAME ?? "clubhub_test";

export const TEST_DATABASE_URL = process.env.TEST_DATABASE_URL ?? withDatabase(DEV_URL, TEST_DATABASE_NAME);

/** Server-level connection (used to DROP/CREATE the test database). */
export const ADMIN_DATABASE_URL = process.env.ADMIN_DATABASE_URL ?? withDatabase(DEV_URL, "postgres");

/** Swaps the database name in a postgres connection string, preserving credentials, host and params. */
function withDatabase(url: string, database: string): string {
  const parsed = new URL(url);
  parsed.pathname = `/${database}`;
  return parsed.toString();
}
