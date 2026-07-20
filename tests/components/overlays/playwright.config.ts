import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  expect: { timeout: 10_000 },
  fullyParallel: false,
  reporter: "line",
  retries: 0,
  testDir: "..",
  testMatch: ["overlays/overlays.browser.spec.ts", "data-grid/data-grid.browser.spec.ts"],
  timeout: 60_000,
  use: {
    ...devices["Desktop Chrome"],
    baseURL: "http://127.0.0.1:8143",
    headless: true,
    trace: "off",
  },
  webServer: {
    command:
      "corepack pnpm@11.14.0 --filter @mergora/storybook exec storybook dev --ci --port 8143",
    reuseExistingServer: false,
    timeout: 120_000,
    url: "http://127.0.0.1:8143/index.json",
  },
  workers: 1,
});
