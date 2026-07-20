import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["tests/components/advanced-collections/*.test.tsx"],
  },
});
