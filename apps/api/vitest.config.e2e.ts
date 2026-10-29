import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: { tsconfigPaths: true },
  test: {
    globals: true,
    root: "./",
    include: ["**/*.e2e-spec.ts"],
    // One file at a time: every e2e file uses the same real database and Redis.
    fileParallelism: false,
    // Neon's free database sleeps when idle; the first query wakes it, which takes a few seconds.
    testTimeout: 30_000,
    hookTimeout: 60_000, // beforeAll/afterAll start and stop the whole API
  },
});
