import { resolve } from "node:path";
import { expect, test, type Page } from "@playwright/test";

const axePath = resolve(
  import.meta.dirname,
  "../../../packages/test-utils/node_modules/axe-core/axe.min.js",
);

async function openStory(page: Page, story: string): Promise<void> {
  await page.goto(`/iframe.html?viewMode=story&id=p2-advanced-intrinsic-layout--${story}`, {
    waitUntil: "domcontentloaded",
  });
  await expect(page.locator("[data-slot]").first()).toBeVisible();
}

async function axeViolations(page: Page): Promise<unknown[]> {
  await page.addScriptTag({ path: axePath });
  return page.evaluate(async () => {
    const axe = (
      globalThis as unknown as {
        axe: { run(target: Element): Promise<{ violations: unknown[] }> };
      }
    ).axe;
    return (await axe.run(document.body)).violations;
  });
}

test("advanced workbench exposes named separators and no automated accessibility violations", async ({
  page,
}, testInfo) => {
  await openStory(page, "advanced-layout-workbench");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(
    "Advanced intrinsic layout workbench",
  );
  await expect(page.getByRole("separator", { name: "Resize editable source panel" })).toHaveCount(
    1,
  );
  await expect(
    page.getByRole("separator", { name: "Resize navigation and work area" }),
  ).toHaveCount(1);
  expect(await axeViolations(page)).toEqual([]);
  await page.screenshot({ fullPage: true, path: testInfo.outputPath("advanced-workbench.png") });
});

test("Resizable supports arrows, Home, End, Enter, and non-drag touch controls", async ({
  page,
}) => {
  await openStory(page, "keyboard-and-touch-resize");
  const separator = page.getByRole("separator", { name: "Resize contract panel" });
  await separator.focus();
  await expect(separator).toHaveAttribute("aria-valuenow", "45");

  await page.keyboard.press("ArrowRight");
  await expect(separator).toHaveAttribute("aria-valuenow", "50");
  await page.keyboard.press("Home");
  await expect(separator).toHaveAttribute("aria-valuenow", "20");
  await page.keyboard.press("End");
  await expect(separator).toHaveAttribute("aria-valuenow", "90");
  await page.keyboard.press("Enter");
  await expect(separator).toHaveAttribute("aria-valuenow", "0");
  await expect(page.locator('[data-slot="resizable-primary"]')).toBeHidden();

  await page.getByRole("button", { name: "Restore panel" }).click();
  await expect(separator).toHaveAttribute("aria-valuenow", "90");
  await page.getByRole("button", { name: "Decrease panel size" }).click();
  await expect(separator).toHaveAttribute("aria-valuenow", "85");
});

test("Resizable pointer capture changes and commits the public value", async ({ page }) => {
  await openStory(page, "keyboard-and-touch-resize");
  const root = page.locator('[data-slot="resizable-root"]');
  const separator = page.getByRole("separator", { name: "Resize contract panel" });
  const rootBounds = await root.boundingBox();
  const separatorBounds = await separator.boundingBox();
  expect(rootBounds).not.toBeNull();
  expect(separatorBounds).not.toBeNull();
  if (rootBounds === null || separatorBounds === null) return;

  await page.mouse.move(
    separatorBounds.x + separatorBounds.width / 2,
    separatorBounds.y + separatorBounds.height / 2,
  );
  await page.mouse.down();
  await page.mouse.move(rootBounds.x + rootBounds.width * 0.7, separatorBounds.y + 4, {
    steps: 3,
  });
  await page.mouse.up();
  await expect(separator).toHaveAttribute("aria-valuenow", /6\d|70/u);
});

test("SplitPane keeps controlled, nested, collapse, and restore behavior coherent", async ({
  page,
}) => {
  await openStory(page, "controlled-and-nested-panes");
  const separator = page.getByRole("separator", {
    name: "Resize navigation and work area",
  });
  await expect(separator).toHaveAttribute("aria-valuenow", "28");
  await separator.focus();
  await page.keyboard.press("ArrowRight");
  await expect(separator).toHaveAttribute("aria-valuenow", "33");
  await page.keyboard.press("Enter");
  await expect(separator).toHaveAttribute("aria-valuenow", "0");
  await expect(page.getByRole("region", { name: "Navigation" })).toBeHidden();
  await page.getByRole("button", { name: "Restore preceding panel" }).click();
  await expect(page.getByRole("region", { name: "Navigation" })).toBeVisible();
  await expect(page.getByRole("separator", { name: "Resize source and evidence" })).toHaveCount(1);
});

test("narrow split panes become sequential without overflow or unreachable panels", async ({
  browser,
}) => {
  const page = await browser.newPage({ viewport: { height: 900, width: 320 } });
  await openStory(page, "responsive-stack");
  const panels = page.locator('[data-slot="split-pane-panel"]');
  await expect(panels).toHaveCount(2);
  await expect(panels.nth(0)).toBeVisible();
  await expect(panels.nth(1)).toBeVisible();
  await expect(page.locator('[data-slot="split-pane-handle"]')).toBeHidden();
  const geometry = await page.evaluate(() => ({
    documentOverflow: document.documentElement.scrollWidth > window.innerWidth + 1,
    panelWidths: [...document.querySelectorAll<HTMLElement>('[data-slot="split-pane-panel"]')].map(
      (panel) => panel.getBoundingClientRect().width,
    ),
  }));
  expect(geometry.documentOverflow).toBe(false);
  expect(geometry.panelWidths.every((width) => width <= 320)).toBe(true);
  expect(await axeViolations(page)).toEqual([]);
  await page.close();
});

test("SplitPane persistence restores after hydration and writes only committed sizes", async ({
  page,
}) => {
  await openStory(page, "persistence-adapter");
  const separator = page.getByRole("separator", { name: "Resize persisted panels" });
  await expect(separator).toHaveAttribute("aria-valuenow", "25");
  await expect(page.getByLabel("Last persisted layout")).toHaveText("No new layout committed");
  await separator.focus();
  await page.keyboard.press("ArrowRight");
  await expect(separator).toHaveAttribute("aria-valuenow", "30");
  await expect(page.getByLabel("Last persisted layout")).toHaveText("30 / 70");
});

test("ScrollArea preserves a labelled native keyboard scrollport and visible overflow", async ({
  page,
}) => {
  await openStory(page, "native-scroll-affordance");
  const scrollArea = page.getByRole("region", { name: "Wide release comparison" });
  await expect(scrollArea).toHaveAttribute("tabindex", "0");
  const initial = await scrollArea.evaluate((node) => ({
    canScrollBlock: node.scrollHeight > node.clientHeight,
    canScrollInline: node.scrollWidth > node.clientWidth,
    scrollTop: node.scrollTop,
  }));
  expect(initial.canScrollBlock).toBe(true);
  expect(initial.canScrollInline).toBe(true);
  await scrollArea.focus();
  for (let index = 0; index < 5; index += 1) await page.keyboard.press("ArrowDown");
  await expect.poll(() => scrollArea.evaluate((node) => node.scrollTop)).toBeGreaterThan(0);
  expect(await axeViolations(page)).toEqual([]);
});

test("StickyRegion keeps the final focused control inside the visible scrollport", async ({
  page,
}) => {
  await openStory(page, "sticky-focus-preservation");
  const root = page.locator('[data-slot="sticky-region-root"]');
  const sticky = page.locator('[data-slot="sticky-region-content"]');
  const lastAction = page.getByRole("button", { name: "Focus verification action 12" });
  await lastAction.focus();
  const geometry = await page.evaluate(() => {
    const rootNode = document.querySelector<HTMLElement>('[data-slot="sticky-region-root"]')!;
    const stickyNode = document.querySelector<HTMLElement>('[data-slot="sticky-region-content"]')!;
    const focused = document.activeElement as HTMLElement;
    const rootBounds = rootNode.getBoundingClientRect();
    const stickyBounds = stickyNode.getBoundingClientRect();
    const focusBounds = focused.getBoundingClientRect();
    return {
      belowSticky: focusBounds.top >= stickyBounds.bottom - 1,
      insideBlockEnd: focusBounds.bottom <= rootBounds.bottom + 1,
      measuredSize: getComputedStyle(rootNode).getPropertyValue("--mrg-sticky-region-size"),
    };
  });
  expect(geometry.belowSticky).toBe(true);
  expect(geometry.insideBlockEnd).toBe(true);
  expect(Number.parseFloat(geometry.measuredSize)).toBeGreaterThan(0);
  await expect(root).toBeVisible();
  await expect(sticky).toBeVisible();
});

test("RTL horizontal ArrowRight moves the separator toward physical right", async ({ page }) => {
  await openStory(page, "right-to-left");
  const separator = page.getByRole("separator", { name: "تغيير حجم اللوحة" });
  await expect(separator).toHaveAttribute("aria-valuenow", "40");
  await separator.focus();
  await page.keyboard.press("ArrowRight");
  await expect(separator).toHaveAttribute("aria-valuenow", "35");
});

test("resize controls retain boundaries and focus in forced colors", async ({ browser }) => {
  const context = await browser.newContext({ forcedColors: "active" });
  const page = await context.newPage();
  await openStory(page, "keyboard-and-touch-resize");
  const separator = page.getByRole("separator", { name: "Resize contract panel" });
  await separator.focus();
  const style = await separator.evaluate((element) => {
    const computed = getComputedStyle(element);
    return {
      borderStyle: computed.borderStyle,
      borderWidth: computed.borderWidth,
      outlineStyle: computed.outlineStyle,
      outlineWidth: computed.outlineWidth,
    };
  });
  expect(style.borderStyle).not.toBe("none");
  expect(style.borderWidth).not.toBe("0px");
  expect(style.outlineStyle).not.toBe("none");
  expect(style.outlineWidth).not.toBe("0px");
  await context.close();
});
