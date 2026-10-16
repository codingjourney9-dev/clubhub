import { afterAll } from "vitest";

import { disconnectTestDb } from "./helpers/db";

/** One pooled client for the whole file; closed when the worker ends. */
afterAll(async () => {
  await disconnectTestDb();
});
