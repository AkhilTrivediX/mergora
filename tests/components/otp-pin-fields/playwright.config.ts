import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  expect: { timeout: 10_000 },
  fullyParallel: false,
  reporter: "line",
  retries: 0,
  testDir: ".",
  testMatch: "otp-pin-fields.browser.spec.ts",
  timeout: 60_000,
  use: {
    ...devices["Desktop Chrome"],
    baseURL: "http://127.0.0.1:8142",
    headless: true,
    trace: "off",
  },
  webServer: {
    command:
      "corepack pnpm@11.14.0 --filter @mergora/storybook exec storybook dev --ci --port 8142",
    reuseExistingServer: false,
    timeout: 120_000,
    url: "http://127.0.0.1:8142/index.json",
  },
  workers: 1,
});
