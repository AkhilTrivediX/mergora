import { expect, test as base } from "@playwright/test";
import type { Page } from "@playwright/test";

export const test = base.extend<{ browserDiagnostics: readonly string[] }>({
  browserDiagnostics: [
    async ({ page }, use) => {
      const diagnostics: string[] = [];
      page.on("console", (message) => {
        if (message.type() === "error" || message.type() === "warning") {
          diagnostics.push(`console ${message.type()}: ${message.text()}`);
        }
      });
      page.on("pageerror", (error) => diagnostics.push(`pageerror: ${error.message}`));
      page.on("requestfailed", (request) => {
        diagnostics.push(
          `request: ${request.method()} ${request.url()} ${request.failure()?.errorText ?? "failed"}`,
        );
      });
      page.on("response", (response) => {
        if (response.status() >= 400)
          diagnostics.push(`response: ${response.status()} ${response.url()}`);
      });

      await use(diagnostics);
      expect(
        diagnostics,
        "The browser fixture must not hide console, page, or resource failures.",
      ).toEqual([]);
    },
    { auto: true },
  ],
});

export async function loadFixture(page: Page, path = "/"): Promise<void> {
  const response = await page.goto(path);
  expect(response?.ok(), `The fixture route must resolve: ${path}`).toBe(true);
  await expect(page.locator("#evidence-root")).toBeVisible();

  const fontState = await page.evaluate(async () => {
    await Promise.all([
      document.fonts.load('16px "Schibsted Grotesk"'),
      document.fonts.load('16px "Commit Mono"'),
    ]);
    await document.fonts.ready;
    return {
      checks: {
        prose: document.fonts.check('16px "Schibsted Grotesk"'),
        mono: document.fonts.check('16px "Commit Mono"'),
      },
      faces: [...document.fonts]
        .filter((face) => face.family === "Schibsted Grotesk" || face.family === "Commit Mono")
        .map((face) => ({ family: face.family, status: face.status })),
      resources: performance
        .getEntriesByType("resource")
        .map((entry) => entry.name)
        .filter((name) => name.endsWith(".woff2")),
      status: document.fonts.status,
    };
  });

  expect(fontState).toEqual({
    checks: { prose: true, mono: true },
    faces: expect.any(Array),
    resources: expect.arrayContaining([
      expect.stringContaining("schibsted-grotesk-latin-ext-wght.woff2"),
      expect.stringContaining("commit-mono-latin-greek-wght.woff2"),
    ]),
    status: "loaded",
  });
  expect(fontState.faces.every((face) => face.status === "loaded")).toBe(true);
}

export { expect };
