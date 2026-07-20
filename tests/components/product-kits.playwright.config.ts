import { defineConfig, devices } from "@playwright/test";

const port = 8134;

export default defineConfig({
  expect: { timeout: 10_000 },
  forbidOnly: true,
  fullyParallel: false,
  outputDir: "../../artifacts/browser/product-kits",
  projects: [
    { name: "chromium", use: { ...devices["Desktop Chrome"] } },
    { name: "firefox", use: { ...devices["Desktop Firefox"] } },
    { name: "webkit", use: { ...devices["Desktop Safari"] } },
  ],
  reporter: [
    ["line"],
    ["json", { outputFile: "../../artifacts/browser/product-kits-results.json" }],
  ],
  retries: 0,
  testDir: ".",
  testMatch: [
    "authentication-kit/*.browser.spec.ts",
    "billing-subscription-kit/*.browser.spec.ts",
    "onboarding-wizard/*.browser.spec.ts",
    "settings-workspace/*.browser.spec.ts",
  ],
  timeout: 60_000,
  use: {
    baseURL: `http://127.0.0.1:${port}`,
    headless: true,
    trace: "retain-on-failure",
  },
  webServer: {
    command:
      "corepack pnpm@11.14.0 --filter @mergora/storybook build && " +
      `corepack pnpm@11.14.0 exec vite preview --host 127.0.0.1 --port ${String(port)} ` +
      "--strictPort --outDir apps/storybook/storybook-static",
    cwd: "../..",
    reuseExistingServer: false,
    timeout: 120_000,
    url: `http://127.0.0.1:${port}/index.json`,
  },
  workers: 1,
});
