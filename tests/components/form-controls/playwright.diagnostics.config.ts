import { defineConfig, devices } from "@playwright/test";

const port = 8156;

export default defineConfig({
  expect: { timeout: 10_000 },
  forbidOnly: true,
  fullyParallel: false,
  reporter: "line",
  retries: 0,
  testDir: ".",
  testMatch: "form-controls.diagnostics.browser.spec.ts",
  timeout: 60_000,
  use: {
    ...devices["Desktop Chrome"],
    baseURL: `http://127.0.0.1:${port}`,
    headless: true,
    trace: "retain-on-failure",
  },
  webServer: {
    command: `corepack pnpm@11.14.0 --filter @mergora/storybook exec storybook dev --ci --port ${port}`,
    cwd: "../../..",
    reuseExistingServer: false,
    timeout: 120_000,
    url: `http://127.0.0.1:${port}/index.json`,
  },
  workers: 1,
});
