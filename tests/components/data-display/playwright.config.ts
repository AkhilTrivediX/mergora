import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  expect: { timeout: 10_000 },
  forbidOnly: true,
  fullyParallel: false,
  outputDir: "../../../artifacts/browser/data-display",
  reporter: "line",
  testDir: ".",
  testMatch: "data-display.browser.spec.ts",
  timeout: 60_000,
  use: {
    ...devices["Desktop Chrome"],
    baseURL: "http://127.0.0.1:8130",
    headless: true,
    trace: "retain-on-failure",
  },
  workers: 1,
});
