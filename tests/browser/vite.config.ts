import { resolve } from "node:path";
import { fileURLToPath, URL } from "node:url";

import { defineConfig } from "vite";

const workspaceRoot = fileURLToPath(new URL("../..", import.meta.url));
const fixtureWorkspaceRoot = resolve(process.env.MERGORA_VISUAL_FIXTURE_ROOT ?? workspaceRoot);

export default defineConfig({
  root: resolve(fixtureWorkspaceRoot, "tests", "browser", "fixture"),
  publicDir: false,
  resolve: {
    alias: {
      "axe-core": resolve(
        workspaceRoot,
        "packages",
        "test-utils",
        "node_modules",
        "axe-core",
        "axe.js",
      ),
      "mergora-tokens/tokens.css": resolve(
        fixtureWorkspaceRoot,
        "packages",
        "tokens",
        "dist",
        "tokens.css",
      ),
    },
  },
  server: {
    fs: { allow: [fixtureWorkspaceRoot, workspaceRoot] },
    strictPort: true,
  },
});
