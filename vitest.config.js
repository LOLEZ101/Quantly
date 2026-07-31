import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["tests/**/*.test.js", "tests/**/*.test.ts"],
    testTimeout: 180000,
    hookTimeout: 180000,
    // Heavy pipeline tests mutate exports/; keep files sequential.
    fileParallelism: false,
  },
});
