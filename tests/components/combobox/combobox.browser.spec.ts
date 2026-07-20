import { resolve } from "node:path";
import { devices, expect, test, type ConsoleMessage, type Page } from "@playwright/test";

const axePath = resolve(
  import.meta.dirname,
  "../../../packages/test-utils/node_modules/axe-core/axe.min.js",
);
const runtimeFailures = new WeakMap<Page, string[]>();

function isPlaywrightFirefoxLayoutWarning(message: ConsoleMessage): boolean {
  const text = message.text();
  return (
    message.type() === "warning" &&
    text.includes("Layout was forced before the page was fully loaded.") &&
    (message.location().url.startsWith("chrome://juggler/") ||
      text.includes('file: "chrome://juggler/'))
  );
}

function guardRuntime(page: Page): string[] {
  const failures: string[] = [];
  runtimeFailures.set(page, failures);
  page.on("console", (message) => {
    if (
      (message.type() === "warning" || message.type() === "error") &&
      !isPlaywrightFirefoxLayoutWarning(message)
    ) {
      failures.push(`console.${message.type()}: ${message.text()}`);
    }
  });
  page.on("pageerror", (error) => failures.push(`pageerror: ${error.message}`));
  return failures;
}

test.beforeEach(({ page }) => {
  guardRuntime(page);
});

test.afterEach(({ page }) => {
  expect(runtimeFailures.get(page) ?? []).toEqual([]);
});

async function openStory(page: Page, story: string): Promise<void> {
  await page.goto(`/iframe.html?viewMode=story&id=p4-combobox--${story}`, {
    waitUntil: "domcontentloaded",
  });
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
}

async function axeViolations(
  page: Page,
  { ignoreColorContrast = false }: { ignoreColorContrast?: boolean } = {},
): Promise<unknown[]> {
  await page.addScriptTag({ path: axePath });
  return page.evaluate(
    async ({ ignoreColorContrast }) => {
      const axe = (
        globalThis as unknown as {
          axe: {
            run(
              target: Element,
              options?: { rules: Record<string, { enabled: boolean }> },
            ): Promise<{ violations: unknown[] }>;
          };
        }
      ).axe;
      const runOptions = ignoreColorContrast
        ? { rules: { "color-contrast": { enabled: false } } }
        : undefined;
      for (let attempt = 0; attempt < 50; attempt += 1) {
        try {
          return (await axe.run(document.body, runOptions)).violations;
        } catch (error) {
          if (
            !(error instanceof Error) ||
            !error.message.toLowerCase().includes("axe is already running")
          )
            throw error;
          await new Promise((resolveDelay) => setTimeout(resolveDelay, 100));
        }
      }
      throw new Error("Axe remained busy for five seconds.");
    },
    { ignoreColorContrast },
  );
}

test("basic mode omits clear UI while recommended mode clears controlled text and key", async ({
  page,
}) => {
  await openStory(page, "basic-defaults");
  await expect(page.getByRole("button", { name: "Clear habitat" })).toHaveCount(0);
  await expect(page.getByRole("combobox", { name: "Habitat profile" })).toHaveValue("Coastal");
  expect(await axeViolations(page)).toEqual([]);

  await openStory(page, "recommended-mergora");
  const input = page.getByRole("combobox", { name: "Habitat profile" });
  const clear = page.getByRole("button", { name: "Clear habitat" });
  await expect(clear).toBeEnabled();
  await clear.click();
  await expect(input).toHaveValue("");
  await expect(clear).toBeDisabled();
  await expect(page.getByTestId("combobox-value")).toHaveText("Selection: none; input: empty");
  await expect(page.locator('[data-slot="combobox-popover"]')).toHaveCount(0);
  expect(await axeViolations(page)).toEqual([]);
});

test("keyboard filtering, selection, Escape dismissal, and focus remain native", async ({
  page,
}) => {
  await openStory(page, "recommended-mergora");
  const input = page.getByRole("combobox", { name: "Habitat profile" });
  await input.fill("For");
  await input.press("ArrowDown");
  const option = page.getByRole("option", { name: /Forest/u });
  await expect(option).toBeVisible();
  await input.press("Enter");
  await expect(input).toHaveValue("Forest");
  await expect(page.getByTestId("combobox-value")).toContainText("Selection: forest");
  await input.press("ArrowDown");
  await expect(page.locator('[data-slot="combobox-popover"]')).toBeVisible();
  await input.press("Escape");
  await expect(page.locator('[data-slot="combobox-popover"]')).toBeHidden();
  await expect(input).toBeFocused();
});

test("RTL, 320px reflow, forced colors, reduced motion, and touch retain usable controls", async ({
  baseURL,
  browser,
  browserName,
}) => {
  if (baseURL === undefined) throw new Error("Combobox browser evidence requires a base URL.");
  const context = await browser.newContext({
    ...devices["Pixel 7"],
    baseURL,
    forcedColors: "active",
    hasTouch: true,
    reducedMotion: "reduce",
    viewport: { height: 780, width: 320 },
  });
  const page = await context.newPage();
  const failures = guardRuntime(page);
  try {
    await openStory(page, "right-to-left-and-narrow");
    await expect(page.locator('[data-slot="provider"]')).toHaveAttribute("dir", "rtl");
    const input = page.getByRole("combobox", { name: "Habitat profile" });
    await input.tap();
    await page.getByRole("button", { name: "Show habitat options" }).tap();
    await expect(page.locator('[data-slot="combobox-popover"]')).toBeVisible();
    await input.fill("Des");
    const desert = page.getByRole("option", { name: /Desert/u });
    await expect(desert).toBeVisible();
    await desert.tap({ timeout: 10_000 });
    await expect(input).toHaveValue("Desert");
    const targets = await page
      .locator(
        '[data-slot="combobox-input"], [data-slot="combobox-clear"], [data-slot="combobox-trigger"]',
      )
      .evaluateAll((elements) =>
        elements
          .map((element) => {
            const bounds = element.getBoundingClientRect();
            return { height: bounds.height, width: bounds.width };
          })
          .filter(({ height, width }) => height < 44 || width < 44),
      );
    expect(targets).toEqual([]);
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth - innerWidth),
    ).toBeLessThanOrEqual(0);
    await input.focus();
    expect(await input.evaluate((element) => getComputedStyle(element).outlineStyle)).not.toBe(
      "none",
    );
    expect(await axeViolations(page, { ignoreColorContrast: browserName !== "chromium" })).toEqual(
      [],
    );
    expect(failures).toEqual([]);
  } finally {
    await context.close();
  }
});
