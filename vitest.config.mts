import { fileURLToPath } from "node:url";

import { defineConfig } from "vitest/config";

const fromRoot = (relative: string) => fileURLToPath(new URL(relative, import.meta.url));

export default defineConfig({
  resolve: {
    alias: {
      "@": fromRoot("./src"),
      // `server-only` throws outside a React Server Component bundle. The tests
      // run those modules in plain Node on purpose, so the guard is stubbed here.
      "server-only": fromRoot("./tests/stubs/server-only.ts"),
    },
  },
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"],
    // A fresh database is created, migrated and seeded before the suite runs —
    // this is what proves "migrations apply from scratch" rather than assuming it.
    globalSetup: [fromRoot("./tests/global-setup.ts")],
    setupFiles: [fromRoot("./tests/setup.ts")],
    // Integration cases share one database; running files in parallel would make
    // row-count assertions race each other.
    fileParallelism: false,
    testTimeout: 30_000,
    hookTimeout: 60_000,
  },
});
