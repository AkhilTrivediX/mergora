import { fileURLToPath, URL } from "node:url";

import { defineConfig } from "vite";

const workspaceRoot = fileURLToPath(new URL("../..", import.meta.url));

export default defineConfig({
  root: fileURLToPath(new URL("./fixture", import.meta.url)),
  publicDir: false,
  server: {
    fs: { allow: [workspaceRoot] },
    strictPort: true,
  },
});
