import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  expect: { timeout: 10_000 },
  fullyParallel: false,
  reporter: "line",
  retries: 0,
  projects: [
    { name: "chromium", use: { ...devices["Desktop Chrome"] } },
    { name: "firefox", use: { ...devices["Desktop Firefox"] } },
    { name: "webkit", use: { ...devices["Desktop Safari"] } },
  ],
  testDir: ".",
  testMatch: "navigation-systems.browser.spec.ts",
  timeout: 60_000,
  use: {
    baseURL: "http://127.0.0.1:8165",
    headless: true,
    trace: "off",
  },
  webServer: {
    command:
      "corepack pnpm@11.14.0 --filter @mergora/storybook exec storybook dev --ci --port 8165",
    reuseExistingServer: false,
    timeout: 120_000,
    url: "http://127.0.0.1:8165/index.json",
  },
  workers: 1,
});
