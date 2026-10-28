import "dotenv/config";
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // Services fall back to DATABASE_URL (e.g. withSystem()), so point it at the test database too.
    env: { DATABASE_URL: process.env.TEST_DATABASE_URL ?? "" },
    globalSetup: ["./tests/global-setup.ts"],
    // Files share one database; run them one after another.
    fileParallelism: false,
    testTimeout: 20_000,
    hookTimeout: 60_000,
  },
});
