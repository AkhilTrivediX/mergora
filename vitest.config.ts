import { availableParallelism } from "node:os";
import { fileURLToPath } from "node:url";

import { defineConfig } from "vitest/config";

const workerLimit =
  process.platform === "win32" && process.env.CI === "true"
    ? 2
    : Math.max(1, Math.min(8, availableParallelism()));

export default defineConfig({
  resolve: {
    alias: {
      mergora: fileURLToPath(new URL("./packages/cli/src/index.ts", import.meta.url)),
    },
  },
  test: {
    environment: "node",
    include: ["tests/**/*.test.{ts,tsx}"],
    hookTimeout: 10_000,
    maxWorkers: workerLimit,
    passWithNoTests: false,
    reporters: ["default"],
    testTimeout: 10_000,
  },
});
