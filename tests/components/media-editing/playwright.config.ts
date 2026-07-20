import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  expect: { timeout: 10_000 },
  forbidOnly: true,
  fullyParallel: false,
  outputDir: "../../../artifacts/browser/media-editing",
  reporter: "line",
  testDir: ".",
  testMatch: "media-editing.browser.spec.ts",
  timeout: 60_000,
  use: {
    ...devices["Desktop Chrome"],
    baseURL: "http://127.0.0.1:8130",
    headless: true,
    trace: "retain-on-failure",
  },
  workers: 1,
});
