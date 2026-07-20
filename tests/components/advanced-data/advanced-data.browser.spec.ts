import { resolve } from "node:path";

import { expect, test, type ConsoleMessage, type Page } from "@playwright/test";

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

test.beforeEach(({ page }) => guardRuntime(page));
test.afterEach(({ page }) => expect(runtimeFailures.get(page) ?? []).toEqual([]));

async function openStory(page: Page, story: string): Promise<void> {
  await page.goto(`/iframe.html?viewMode=story&id=systems-advanced-data--${story}`, {
    waitUntil: "domcontentloaded",
  });
  await expect(page.locator("[data-slot]").first()).toBeVisible();
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
          if (!(error instanceof Error) || !error.message.includes("already running")) throw error;
          await new Promise((resolveDelay) => setTimeout(resolveDelay, 100));
        }
      }
      throw new Error("Axe remained busy for five seconds.");
    },
    { ignoreColorContrast },
  );
}

async function cancelNativeDrag(
  page: Page,
  source: ReturnType<Page["locator"]>,
  target: ReturnType<Page["locator"]>,
): Promise<void> {
  const sourceBounds = await source.boundingBox();
  const targetBounds = await target.boundingBox();
  expect(sourceBounds).not.toBeNull();
  expect(targetBounds).not.toBeNull();
  if (sourceBounds === null || targetBounds === null) return;
  await source.evaluate((element) => {
    element.addEventListener(
      "dragstart",
      () => element.setAttribute("data-test-native-drag-started", "true"),
      { once: true },
    );
  });
  await page.mouse.move(
    sourceBounds.x + sourceBounds.width / 2,
    sourceBounds.y + sourceBounds.height / 2,
  );
  await page.mouse.down();
  await page.mouse.move(
    targetBounds.x + targetBounds.width / 2,
    targetBounds.y + targetBounds.height / 2,
    { steps: 12 },
  );
  await expect(source).toHaveAttribute("data-test-native-drag-started", "true");
  await page.keyboard.press("Escape");
  await page.mouse.up();
}

test("basic and recommended stories preserve exact enhancement isolation", async ({ page }) => {
  await openStory(page, "basic-query-builder");
  await expect(page.locator('[data-slot="query-builder-summary"]')).toHaveCount(0);
  await openStory(page, "recommended-query-builder");
  await expect(page.locator('[data-slot="query-builder-summary"]')).toBeVisible();

  await openStory(page, "basic-filter-builder");
  await expect(page.locator('[data-slot="filter-builder-summary"]')).toHaveCount(0);
  await expect(page.getByRole("combobox", { name: "Saved filters" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: /Edit filters/u })).toHaveCount(0);
  await openStory(page, "recommended-filter-builder");
  await expect(page.locator('[data-slot="filter-builder-summary"]')).toBeVisible();
  await expect(page.getByRole("combobox", { name: "Saved filters" })).toBeVisible();

  await openStory(page, "basic-sortable-list");
  await expect(page.locator('[data-slot="sortable-list-announcer"]')).toHaveCount(0);
  await expect(page.getByText("Move to position")).toHaveCount(0);
  await openStory(page, "recommended-sortable-list");
  await expect(page.locator('[data-slot="sortable-list-announcer"]')).toHaveCount(1);
  await expect(page.getByText("Move to position").first()).toBeVisible();

  await openStory(page, "basic-tree-grid");
  await expect(page.locator('[data-slot="tree-grid-summary"]')).toHaveCount(0);
  await expect(page.locator('[data-slot="tree-grid-announcer"]')).toHaveCount(0);
  await openStory(page, "recommended-tree-grid");
  await expect(page.locator('[data-slot="tree-grid-summary"]')).toBeVisible();
  await expect(page.locator('[data-slot="tree-grid-announcer"]')).toHaveCount(1);

  await openStory(page, "basic-kanban");
  await expect(page.locator('[data-slot="kanban-wip-status"]')).toHaveCount(0);
  await expect(page.getByRole("group", { name: "Kanban presentation" })).toHaveCount(0);
  await expect(page.locator('[data-slot="kanban-announcer"]')).toHaveCount(0);
  await openStory(page, "recommended-kanban");
  await expect(page.locator('[data-slot="kanban-wip-status"]')).toHaveCount(3);
  await expect(page.getByRole("group", { name: "Kanban presentation" })).toBeVisible();
  await expect(page.locator('[data-slot="kanban-announcer"]')).toHaveCount(1);
  await expect(page.locator('[data-slot="kanban"]')).toHaveAttribute("data-maturity", "beta");
});

test("sortable keyboard pickup moves and Escape restores the complete original order", async ({
  page,
}) => {
  await openStory(page, "recommended-sortable-list");
  const handle = page.getByRole("button", { name: /Move Overview/u });
  await handle.focus();
  await handle.press("Space");
  await expect(handle).toHaveAttribute("aria-pressed", "true");
  await handle.press("ArrowDown");
  await expect(page.locator('[data-slot="sortable-list-item"]').nth(1)).toContainText("Overview");
  await page.getByRole("button", { name: /Move Overview/u }).press("Escape");
  await expect(page.locator('[data-slot="sortable-list-item"]').first()).toContainText("Overview");
  await expect(page.getByRole("button", { name: /Move Overview/u })).toBeFocused();
  await expect(page.locator('[data-slot="sortable-list-announcer"]')).toContainText(
    "Movement cancelled",
  );
  expect(await axeViolations(page)).toEqual([]);
});

test("sortable and Kanban native pointer drags drop precisely and Escape cancels without mutation", async ({
  browserName,
  page,
}) => {
  await openStory(page, "recommended-sortable-list");
  const sortableItems = page.locator('[data-slot="sortable-list-item"]');
  const overviewHandle = page.getByRole("button", { name: /Move Overview/u });
  await overviewHandle.dragTo(sortableItems.filter({ hasText: "History" }));
  await expect(sortableItems.last()).toContainText("Overview");
  await expect(page.locator('[data-slot="sortable-list-announcer"]')).toContainText(
    "Overview moved to position 4",
  );

  await openStory(page, "recommended-sortable-list");
  const originalSortableOrder = await page
    .locator('[data-slot="sortable-list-item"] strong')
    .allTextContents();
  await cancelNativeDrag(
    page,
    page.getByRole("button", { name: /Move Overview/u }),
    page.locator('[data-slot="sortable-list-item"]').filter({ hasText: "History" }),
  );
  await expect
    .poll(() => page.locator('[data-slot="sortable-list-item"] strong').allTextContents())
    .toEqual(originalSortableOrder);

  await openStory(page, "recommended-kanban");
  const planned = page.getByRole("region", { name: /Planned/u });
  const active = page.getByRole("region", { name: /Active/u });
  const kanbanHandle = page.getByRole("button", { name: "Move Draft usage notes" });
  if (browserName === "firefox") {
    // Playwright's Firefox transport does not synthesize a native cross-list HTML drag/drop.
    // The same component path remains covered there by keyboard and non-drag controls.
    await expect(kanbanHandle).toHaveAttribute("draggable", "true");
  } else {
    await kanbanHandle.dragTo(active.locator("ol"));
    await expect(active).toContainText("Draft usage notes");
    await expect(planned).not.toContainText("Draft usage notes");
  }

  await openStory(page, "recommended-kanban");
  await cancelNativeDrag(
    page,
    page.getByRole("button", { name: "Move Draft usage notes" }),
    page.getByRole("region", { name: /Active/u }).locator("ol"),
  );
  await expect(page.getByRole("region", { name: /Planned/u })).toContainText("Draft usage notes");
  await expect(page.getByRole("region", { name: /Active/u })).not.toContainText(
    "Draft usage notes",
  );
  expect(await axeViolations(page)).toEqual([]);
});

test("treegrid follows one-tab-stop hierarchy and direction-aware row navigation", async ({
  page,
}) => {
  await openStory(page, "recommended-tree-grid");
  const treegrid = page.getByRole("treegrid", { name: "Workstream hierarchy" });
  await expect(treegrid).toHaveAttribute("aria-multiselectable", "true");
  const first = page.getByRole("gridcell", { name: /Foundation/u });
  await first.focus();
  await first.press("ArrowDown");
  await expect(page.getByRole("gridcell", { name: /Semantic tokens/u })).toBeFocused();
  await page.getByRole("gridcell", { name: /Semantic tokens/u }).press("Space");
  await expect(page.getByRole("row", { name: /Semantic tokens/u })).toHaveAttribute(
    "aria-selected",
    "false",
  );
  await page.getByRole("gridcell", { name: /Semantic tokens/u }).press("ArrowRight");
  await expect(
    page.getByRole("row", { name: /Semantic tokens/u }).getByRole("gridcell", { name: "Ready" }),
  ).toBeFocused();
  await page.keyboard.press("Control+Home");
  await page.keyboard.press("d");
  await expect(page.getByRole("gridcell", { name: /Data systems/u })).toBeFocused();
  await page.keyboard.press("PageUp");
  await expect(page.getByRole("gridcell", { name: /Foundation/u })).toBeFocused();
  expect(await axeViolations(page)).toEqual([]);
});

test("treegrid exposes preferred controls in a coarse-pointer context", async ({ browser }) => {
  const context = await browser.newContext({
    hasTouch: true,
    isMobile: true,
    viewport: { height: 800, width: 390 },
  });
  const page = await context.newPage();
  const failures = guardRuntime(page);
  await openStory(page, "recommended-tree-grid");
  expect(await page.evaluate(() => matchMedia("(pointer: coarse)").matches)).toBe(true);

  const treegrid = page.getByRole("treegrid", { name: "Workstream hierarchy" });
  const controls = await treegrid.locator("button, input").evaluateAll((elements) =>
    elements.map((element) => {
      const { height, width } = element.getBoundingClientRect();
      return { height, tag: element.tagName, width };
    }),
  );
  expect(controls.length).toBeGreaterThan(0);
  expect(
    controls.every(({ height, tag, width }) => height >= 44 && (tag === "INPUT" || width >= 44)),
  ).toBe(true);

  const foundation = page.getByRole("row", { name: /Foundation/u });
  await expect(foundation).toHaveAttribute("aria-expanded", "true");
  await foundation.getByRole("button", { name: /Foundation/u }).tap();
  await expect(foundation).toHaveAttribute("aria-expanded", "false");
  expect(await axeViolations(page)).toEqual([]);
  expect(failures).toEqual([]);
  await context.close();
});

test("Kanban keyboard movement cancels atomically and the mobile list preserves every action", async ({
  page,
}) => {
  await page.setViewportSize({ width: 320, height: 568 });
  await openStory(page, "recommended-kanban");
  const handle = page.getByRole("button", { name: "Move Draft usage notes" });
  await handle.focus();
  await handle.press("Space");
  await handle.press("ArrowRight");
  await expect(page.getByRole("region", { name: /Active/u })).toContainText("Draft usage notes");
  await page.getByRole("button", { name: "Move Draft usage notes" }).press("Escape");
  await expect(page.getByRole("region", { name: /Planned/u })).toContainText("Draft usage notes");
  await page.getByRole("button", { name: "Mobile list view" }).click();
  await expect(page.locator('[data-slot="kanban"]')).toHaveAttribute("data-view", "list");
  await expect(page.getByRole("button", { name: "Move Draft usage notes" })).toBeVisible();
  await expect(page.getByRole("combobox", { name: "Move to column" }).first()).toBeVisible();
  expect(await axeViolations(page)).toEqual([]);
});

test("Kanban server failure rolls back, exposes retry, then allows undo after recovery", async ({
  page,
}) => {
  await openStory(page, "server-recovery");
  const planned = page.getByRole("region", { name: /Planned/u });
  const active = page.getByRole("region", { name: /Active/u });
  const card = page.locator('[data-slot="kanban-card"]').filter({
    hasText: "Draft usage notes",
  });
  await card.getByRole("button", { name: "Move to next column" }).click();
  await expect(page.getByRole("alert")).toContainText("could not be saved");
  await expect(planned).toContainText("Draft usage notes");
  await page.getByRole("button", { name: "Retry move" }).click();
  await expect(page.getByRole("alert")).toHaveCount(0);
  await expect(active).toContainText("Draft usage notes");
  await page.getByRole("button", { name: "Undo last move" }).click();
  await expect(planned).toContainText("Draft usage notes");
  expect(await axeViolations(page)).toEqual([]);
});

test("bounded virtual windows expand and preserve keyboard reachability", async ({ page }) => {
  await openStory(page, "virtualized-windows");

  const sortable = page.getByRole("region", { name: "Section order" });
  await expect(sortable).not.toContainText("History");
  await sortable.getByRole("button", { name: "Show more items" }).click();
  await expect(sortable).toContainText("History");

  const treegrid = page.getByRole("treegrid", { name: "Workstream hierarchy" });
  await expect(treegrid).not.toContainText("Data systems");
  const components = treegrid.getByRole("gridcell", { name: /Components/u });
  await components.focus();
  await components.press("PageDown");
  await expect(treegrid.getByRole("gridcell", { name: /Data systems/u })).toBeFocused();

  const planned = page.getByRole("region", { name: /Planned/u });
  await expect(planned).not.toContainText("Review empty state");
  await planned.getByRole("button", { name: "Show more cards" }).click();
  await expect(planned).toContainText("Review empty state");
  expect(await axeViolations(page)).toEqual([]);
});

test("mobile filter dialog restores focus and retains the inline editor contract", async ({
  page,
}) => {
  await page.setViewportSize({ width: 320, height: 568 });
  await openStory(page, "recommended-filter-builder");
  const trigger = page.getByRole("button", { name: /Edit filters/u });
  await expect(trigger).toBeVisible();
  await trigger.click();
  const dialog = page.getByRole("dialog", { name: /Content filters/u });
  await expect(dialog).toBeVisible();
  await dialog.getByRole("button", { name: "Done" }).click();
  await expect(dialog).toBeHidden();
  await expect(trigger).toBeFocused();
  expect(await axeViolations(page)).toEqual([]);
});

test("controlled form submission serializes canonical values and reset remains consumer-owned", async ({
  page,
}) => {
  await openStory(page, "controlled-and-form");
  const filters = page.locator('[data-slot="filter-builder"]');
  const firstValue = filters.getByRole("textbox", { name: "Value" }).first();
  await expect(firstValue).toHaveValue("Ready");
  await firstValue.fill("Changed");
  await expect(firstValue).toHaveValue("Changed");
  await page.getByRole("button", { name: "Reset" }).click();
  await expect(firstValue).toHaveValue("Ready");
  await page.getByRole("button", { name: "Submit" }).click();
  const result = page.locator('[data-slot="advanced-data-form-result"]');
  await expect(result).toContainText("query=");
  await expect(result).toContainText("filters=");
  expect(await axeViolations(page)).toEqual([]);
});

test("narrow RTL, forced colors, and reduced motion preserve visible focus and bounded layout", async ({
  browser,
  browserName,
}) => {
  const context = await browser.newContext({
    viewport: { width: 320, height: 568 },
    forcedColors: "active",
    reducedMotion: "reduce",
  });
  const page = await context.newPage();
  const failures = guardRuntime(page);
  await openStory(page, "narrow-and-rtl");
  await expect(page.locator("[dir=rtl]")).toHaveAttribute("dir", "rtl");
  const focusTarget = page.getByRole("button", { name: /Move Overview/u });
  await focusTarget.focus();
  const evidence = await focusTarget.evaluate((element) => ({
    outline: getComputedStyle(element).outlineStyle,
    duration: getComputedStyle(element).transitionDuration,
    pageOverflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
  }));
  expect(evidence.outline).not.toBe("none");
  expect(evidence.duration).toBe("0s");
  expect(evidence.pageOverflow).toBeLessThanOrEqual(1);
  expect(await axeViolations(page, { ignoreColorContrast: browserName !== "chromium" })).toEqual(
    [],
  );
  expect(failures).toEqual([]);
  await context.close();
});
