import { defineConfig, devices } from "@playwright/test";

const port = 4184;

export default defineConfig({
  testDir: ".",
  testMatch: "**/*.spec.ts",
  fullyParallel: false,
  forbidOnly: true,
  retries: 0,
  ...(process.env.CI ? { workers: 1 } : {}),
  timeout: 45_000,
  expect: { timeout: 7_500 },
  outputDir: "../../artifacts/web/playwright",
  reporter: [["line"], ["html", { open: "never", outputFolder: "../../artifacts/web/report" }]],
  use: {
    baseURL: `http://127.0.0.1:${String(port)}`,
    colorScheme: "light",
    locale: "en-US",
    screenshot: "only-on-failure",
    trace: "retain-on-failure",
    viewport: { height: 844, width: 390 },
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"], viewport: { height: 844, width: 390 } },
    },
    {
      name: "firefox",
      use: { ...devices["Desktop Firefox"], viewport: { height: 844, width: 390 } },
    },
    {
      name: "webkit",
      use: { ...devices["Desktop Safari"], viewport: { height: 844, width: 390 } },
    },
  ],
  webServer: {
    command: `corepack pnpm@11.14.0 --filter mergora-tokens build && corepack pnpm@11.14.0 --filter @mergora/storybook build && corepack pnpm@11.14.0 --filter @mergora/web build && node ../../scripts/assemble-quality-lab.mjs && node static-server.mjs`,
    env: {
      MERGORA_BASE_PATH: "",
      MERGORA_SITE_ORIGIN: "https://mergora.dev",
      MERGORA_WEB_TEST_PORT: String(port),
    },
    reuseExistingServer: false,
    timeout: 120_000,
    url: `http://127.0.0.1:${String(port)}`,
  },
});
