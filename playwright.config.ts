import { defineConfig, devices } from "@playwright/test";

const port = 4176;

export default defineConfig({
  testDir: "./tests/browser",
  testMatch: "**/*.spec.ts",
  fullyParallel: false,
  forbidOnly: true,
  retries: 0,
  ...(process.env.CI ? { workers: 1 } : {}),
  timeout: 30_000,
  expect: { timeout: 5_000 },
  outputDir: "artifacts/browser/playwright",
  reporter: [
    ["line"],
    ["json", { outputFile: "artifacts/browser/playwright-results.json" }],
    ["html", { open: "never", outputFolder: "artifacts/browser/report" }],
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
      `corepack pnpm@11.14.0 --filter mergora-tokens build && ` +
      `corepack pnpm@11.14.0 exec vite --config tests/browser/vite.config.ts ` +
      `--host 127.0.0.1 --port ${port}`,
    url: `http://127.0.0.1:${port}`,
    reuseExistingServer: false,
    timeout: 30_000,
  },
});
