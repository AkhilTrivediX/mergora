import { resolve } from "node:path";

import { defineConfig } from "vitest/config";

const storybookModules = resolve(import.meta.dirname, "../../../apps/storybook/node_modules");

export default defineConfig({
  resolve: {
    alias: [
      {
        find: "react/jsx-dev-runtime",
        replacement: resolve(storybookModules, "react/jsx-dev-runtime.js"),
      },
      {
        find: "react/jsx-runtime",
        replacement: resolve(storybookModules, "react/jsx-runtime.js"),
      },
      {
        find: "react-dom/server",
        replacement: resolve(storybookModules, "react-dom/server.node.js"),
      },
      { find: "react", replacement: resolve(storybookModules, "react/index.js") },
    ],
  },
  test: {
    environment: "node",
    include: ["tests/components/button/button.ssr.spec.ts"],
    reporters: ["default"],
  },
});
