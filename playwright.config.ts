import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { defineConfig, devices } from "@playwright/test";

const port = 4176;
const workspaceRoot = fileURLToPath(new URL(".", import.meta.url));
const visualRunId = process.env.MERGORA_VISUAL_RUN_ID;
const visualPhase = process.env.MERGORA_VISUAL_PHASE ?? "standalone";
const visualArtifactRoot =
  visualRunId === undefined
    ? undefined
    : resolve(workspaceRoot, "artifacts", "browser-evidence", "visual-regression", visualRunId);
const viteConfig = resolve(workspaceRoot, "tests", "browser", "vite.config.ts").replaceAll(
  "\\",
  "/",
);
const tokenBuild =
  visualPhase === "baseline" ? "" : "corepack pnpm@11.14.0 --filter mergora-tokens build && ";

export default defineConfig({
  testDir: "./tests/browser",
  testMatch: "**/*.spec.ts",
  fullyParallel: false,
  forbidOnly: true,
  retries: 0,
  ...(process.env.CI ? { workers: 1 } : {}),
  timeout: 30_000,
  expect: { timeout: 5_000 },
  outputDir:
    visualArtifactRoot === undefined
      ? "artifacts/browser/playwright"
      : resolve(visualArtifactRoot, "playwright", visualPhase),
  ...(visualArtifactRoot === undefined
    ? {}
    : {
        snapshotPathTemplate: resolve(
          visualArtifactRoot,
          "expected",
          "{projectName}",
          "{arg}{ext}",
        ),
      }),
  reporter: [
    ["line"],
    [
      "json",
      {
        outputFile:
          visualArtifactRoot === undefined
            ? "artifacts/browser/playwright-results.json"
            : resolve(visualArtifactRoot, `playwright-results-${visualPhase}.json`),
      },
    ],
    [
      "html",
      {
        open: "never",
        outputFolder:
          visualArtifactRoot === undefined
            ? "artifacts/browser/report"
            : resolve(visualArtifactRoot, `report-${visualPhase}`),
      },
    ],
  ],
  use: {
    baseURL: `http://127.0.0.1:${port}`,
    locale: "en-US",
    timezoneId: "Asia/Kolkata",
    colorScheme: "light",
    screenshot: "only-on-failure",
    trace: "retain-on-failure",
    video: "off",
  },
  projects: [
    { name: "chromium", use: { ...devices["Desktop Chrome"] } },
    { name: "firefox", use: { ...devices["Desktop Firefox"] } },
    { name: "webkit", use: { ...devices["Desktop Safari"] } },
  ],
  webServer: {
    command:
      tokenBuild +
      `corepack pnpm@11.14.0 exec vite --config "${viteConfig}" ` +
      `--host 127.0.0.1 --port ${port}`,
    cwd: workspaceRoot,
    url: `http://127.0.0.1:${port}`,
    reuseExistingServer: false,
    timeout: 30_000,
  },
});
