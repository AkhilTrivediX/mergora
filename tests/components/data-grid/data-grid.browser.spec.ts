import { resolve } from "node:path";

import { expect, test, type Page } from "@playwright/test";

const axePath = resolve(
  import.meta.dirname,
  "../../../packages/test-utils/node_modules/axe-core/axe.min.js",
);

async function openStory(page: Page, story: string) {
  await page.goto(`/iframe.html?viewMode=story&id=components-data-grid-experimental--${story}`, {
    waitUntil: "domcontentloaded",
  });
  await expect(page.getByRole("region", { name: /open incidents/iu })).toBeVisible();
}

async function axeViolations(page: Page): Promise<Array<{ id: string }>> {
  await page.addScriptTag({ path: axePath });
  return page.evaluate(async () => {
    const axe = (
      globalThis as unknown as {
        axe: { run(target: Element): Promise<{ violations: Array<{ id: string }> }> };
      }
    ).axe;
    for (let attempt = 0; attempt < 20; attempt += 1) {
      try {
        return (await axe.run(document.body)).violations;
      } catch (error) {
        if (!(error instanceof Error) || !error.message.includes("Axe is already running")) {
          throw error;
        }
        await new Promise((resolve) => setTimeout(resolve, 50));
      }
    }
    throw new Error("Storybook axe audit did not release its runner.");
  });
}

test("basic DataGrid keeps native table semantics without optional selection output", async ({
  page,
}) => {
  await openStory(page, "basic-defaults");
  await expect(page.getByRole("table", { name: "Open incidents" })).toBeVisible();
  await expect(page.getByRole("radio")).toHaveCount(0);
  await expect(page.locator('[data-slot="data-grid-selection-summary"]')).toHaveCount(0);
});

test("recommended DataGrid synchronizes native selection with its optional live summary", async ({
  page,
}) => {
  await openStory(page, "recommended-mergora");
  const selected = page.getByRole("radio", { name: "Select Export retry" });
  await expect(selected).toBeChecked();
  const summary = page.locator('[data-slot="data-grid-selection-summary"]');
  await expect(summary).toHaveAttribute("aria-live", "polite");
  await expect(summary).toContainText("Selected Export retry · Medium priority");

  await page.getByRole("radio", { name: "Select Profile image" }).check();
  await expect(summary).toContainText("Selected Profile image · Low priority");
  await expect(page.getByRole("row", { name: /Profile image/u })).toHaveAttribute(
    "data-selected",
    "true",
  );
  expect(await axeViolations(page)).toEqual([]);
});

test("DataGrid exposes native keyboard sorting and radio-group navigation", async ({ page }) => {
  await openStory(page, "recommended-mergora");

  const incidentSort = page.getByRole("button", { name: "Incident" });
  await incidentSort.focus();
  await page.keyboard.press("Enter");
  await expect(incidentSort.locator("xpath=ancestor::th")).toHaveAttribute(
    "aria-sort",
    "ascending",
  );
  await expect(page.getByRole("row").nth(1)).toContainText("Checkout latency");

  await page.keyboard.press("Space");
  await expect(incidentSort.locator("xpath=ancestor::th")).toHaveAttribute(
    "aria-sort",
    "descending",
  );
  await expect(page.getByRole("row").nth(1)).toContainText("Profile image");

  const exportRetry = page.getByRole("radio", { name: "Select Export retry" });
  await exportRetry.focus();
  await page.keyboard.press("ArrowUp");
  await expect(page.getByRole("radio", { name: "Select Profile image" })).toBeChecked();
  await expect(page.locator('[data-slot="data-grid-selection-summary"]')).toContainText(
    "Profile image",
  );
});

test("DataGrid supports controlled selection without diverging from the live summary", async ({
  page,
}) => {
  await openStory(page, "controlled-selection");
  await expect(page.getByRole("radio", { name: "Select Checkout latency" })).toBeChecked();
  const summary = page.locator('[data-slot="data-grid-selection-summary"]');
  await expect(summary).toContainText("Controlled selection · Checkout latency");
  await page.getByRole("radio", { name: "Select Export retry" }).check();
  await expect(page.getByRole("radio", { name: "Select Export retry" })).toBeChecked();
  await expect(summary).toContainText("Controlled selection · Export retry");
});

test("DataGrid retains boundaries in forced colors and removes selection motion", async ({
  browser,
}) => {
  const context = await browser.newContext({ forcedColors: "active", reducedMotion: "reduce" });
  const page = await context.newPage();
  await openStory(page, "recommended-mergora");
  const evidence = await page
    .locator('[data-slot="data-grid-row"][data-selected]')
    .evaluate((row) => {
      const cell = row.querySelector("td");
      if (cell === null) throw new Error("Expected a selected row cell.");
      const styles = getComputedStyle(cell);
      return { background: styles.backgroundColor, transition: styles.transitionDuration };
    });
  expect(evidence.background).not.toBe("rgba(0, 0, 0, 0)");
  expect(evidence.transition).toBe("0s");
  const violations = await axeViolations(page);
  // Emulated system Highlight/HighlightText colors are owned by the user's forced-color palette;
  // Firefox and WebKit expose a fixed emulation palette that axe cannot evaluate meaningfully.
  expect(violations.filter(({ id }) => id !== "color-contrast")).toEqual([]);
  await context.close();
});

test("DataGrid keeps document reflow and logical direction in a narrow RTL canvas", async ({
  page,
}) => {
  await page.setViewportSize({ height: 720, width: 320 });
  await openStory(page, "narrow-and-rtl");
  const region = page.getByRole("region", { name: "Open incidents" });
  const geometry = await region.evaluate((node) => {
    const bounds = node.getBoundingClientRect();
    return {
      direction: getComputedStyle(node).direction,
      documentOverflow: document.documentElement.scrollWidth > document.documentElement.clientWidth,
      regionScrollable: node.scrollWidth > node.clientWidth,
      width: Math.round(bounds.width),
    };
  });
  expect({
    direction: geometry.direction,
    documentOverflow: geometry.documentOverflow,
    regionScrollable: geometry.regionScrollable,
  }).toEqual({
    direction: "rtl",
    documentOverflow: false,
    regionScrollable: true,
  });
  expect(geometry.width).toBeGreaterThan(0);
  expect(geometry.width).toBeLessThanOrEqual(320);

  const sort = page.getByRole("button", { name: "Incident" });
  await sort.focus();
  await page.keyboard.press("Enter");
  await expect(sort.locator("xpath=ancestor::th")).toHaveAttribute("aria-sort", "ascending");
  expect(await axeViolations(page)).toEqual([]);
});
