import { expect, test, type Page } from "@playwright/test";

const runtimeFailures = new WeakMap<Page, string[]>();

test.beforeEach(({ page }) => {
  const failures: string[] = [];
  runtimeFailures.set(page, failures);
  page.on("console", (message) => {
    if (message.type() === "warning" || message.type() === "error") {
      failures.push(`console.${message.type()}: ${message.text()}`);
    }
  });
  page.on("pageerror", (error) => failures.push(`pageerror: ${error.message}`));
});

test.afterEach(({ page }) => expect(runtimeFailures.get(page) ?? []).toEqual([]));

async function openButtonStory(page: Page, globals: string): Promise<void> {
  await page.goto(
    `/iframe.html?viewMode=story&id=components-button--default&globals=${encodeURIComponent(globals)}`,
    { waitUntil: "domcontentloaded" },
  );
  await expect(page.getByRole("button", { name: "Save changes" })).toBeVisible();
}

test("global controls apply theme, density, RTL, reduced motion, and narrow presentation", async ({
  page,
}) => {
  await openButtonStory(
    page,
    "theme:dark;contrast:enhanced;density:touch;direction:rtl;motion:reduced;viewportMode:narrow",
  );

  const root = page.locator("html");
  await expect(root).toHaveAttribute("data-theme", "dark");
  await expect(root).toHaveAttribute("data-contrast", "enhanced");
  await expect(root).toHaveAttribute("data-density", "touch");
  await expect(root).toHaveAttribute("data-motion", "reduced");
  await expect(root).toHaveAttribute("data-viewport", "narrow");
  await expect(root).toHaveAttribute("dir", "rtl");

  const presentation = await page.evaluate(() => {
    const styles = getComputedStyle(document.documentElement);
    const canvas = document.querySelector<HTMLElement>("#storybook-root");
    return {
      controlHeight: styles.getPropertyValue("--mrg-semantic-density-control-height").trim(),
      motion: styles.getPropertyValue("--mrg-semantic-motion-duration-transition").trim(),
      width: canvas?.getBoundingClientRect().width ?? 0,
    };
  });
  expect(presentation.controlHeight).toBe("48px");
  expect(presentation.motion).toBe("1ms");
  expect(presentation.width).toBeGreaterThan(0);
  expect(presentation.width).toBeLessThanOrEqual(320);
});

test("forced-color token preview is selectable without fabricating OS media state", async ({
  page,
}) => {
  await openButtonStory(page, "contrast:forced-colors");
  await expect(page.locator("html")).toHaveAttribute("data-contrast", "forced-colors");
  const evidence = await page.evaluate(() => ({
    canvas: getComputedStyle(document.documentElement)
      .getPropertyValue("--mrg-semantic-color-background-canvas")
      .trim(),
    forcedColorsActive: matchMedia("(forced-colors: active)").matches,
  }));
  expect(evidence.canvas).toBe("Canvas");
  expect(evidence.forcedColorsActive).toBe(false);
});

test("actual forced-colors media mode remains separately testable", async ({ page }) => {
  await page.emulateMedia({ forcedColors: "active" });
  await openButtonStory(page, "contrast:standard");
  expect(await page.evaluate(() => matchMedia("(forced-colors: active)").matches)).toBe(true);
  await expect(page.getByRole("button", { name: "Save changes" })).toBeVisible();
});
