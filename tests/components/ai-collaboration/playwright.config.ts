import { defineConfig, devices } from "@playwright/test";

const baseURL = process.env.MERGORA_STORYBOOK_URL ?? "http://127.0.0.1:8130";

export default defineConfig({
  expect: { timeout: 10_000 },
  forbidOnly: true,
  fullyParallel: false,
  outputDir: "../../../artifacts/browser/ai-collaboration",
  reporter: "line",
  testDir: ".",
  testMatch: "ai-collaboration.browser.spec.ts",
  timeout: 60_000,
  use: {
    ...devices["Desktop Chrome"],
    baseURL,
    headless: true,
    trace: "retain-on-failure",
  },
  workers: 1,
});
