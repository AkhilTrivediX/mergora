import { resolve } from "node:path";

import { expect, test, type Locator, type Page } from "@playwright/test";

const axePath = resolve(
  import.meta.dirname,
  "../../../packages/test-utils/node_modules/axe-core/axe.min.js",
);
const runtimeFailures = new WeakMap<Page, string[]>();

function guardRuntime(page: Page): string[] {
  const failures: string[] = [];
  runtimeFailures.set(page, failures);
  page.on("console", (message) => {
    if (message.type() === "warning" || message.type() === "error") {
      failures.push(`console.${message.type()}: ${message.text()}`);
    }
  });
  page.on("pageerror", (error) => failures.push(`pageerror: ${error.message}`));
  return failures;
}

test.beforeEach(({ page }) => guardRuntime(page));
test.afterEach(({ page }) => expect(runtimeFailures.get(page) ?? []).toEqual([]));

async function openStory(page: Page, story: string, args?: string): Promise<void> {
  const storyArgs = args === undefined ? "" : `&args=${encodeURIComponent(args)}`;
  await page.goto(`/iframe.html?viewMode=story&id=components-data-display--${story}${storyArgs}`, {
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
    for (let attempt = 0; attempt < 20; attempt += 1) {
      try {
        return (await axe.run(document.body)).violations;
      } catch (error) {
        if (!(error instanceof Error) || !error.message.includes("Axe is already running")) {
          throw error;
        }
        await new Promise((resolvePromise) => setTimeout(resolvePromise, 50));
      }
    }
    throw new Error("Timed out waiting for the Storybook accessibility scan to finish.");
  });
}

type DataDisplayId =
  | "activity-feed"
  | "avatar"
  | "calendar-heatmap"
  | "card"
  | "carousel"
  | "chart"
  | "data-table"
  | "item"
  | "stat"
  | "table"
  | "timeline"
  | "virtual-list";

interface StoryEvidenceCase {
  readonly id: DataDisplayId;
  readonly basic: string;
  readonly recommended: string;
  readonly rootSlot: string;
}

const storyEvidenceCases: readonly StoryEvidenceCase[] = [
  {
    id: "avatar",
    basic: "basic-avatar",
    recommended: "recommended-avatar",
    rootSlot: "avatar-group",
  },
  { id: "card", basic: "basic-card", recommended: "recommended-card", rootSlot: "card" },
  { id: "item", basic: "basic-item", recommended: "recommended-item", rootSlot: "item" },
  { id: "table", basic: "basic-table", recommended: "recommended-table", rootSlot: "table-region" },
  {
    id: "data-table",
    basic: "basic-data-table",
    recommended: "recommended-data-table",
    rootSlot: "data-table",
  },
  {
    id: "virtual-list",
    basic: "basic-virtual-list",
    recommended: "recommended-virtual-list",
    rootSlot: "virtual-list",
  },
  {
    id: "timeline",
    basic: "basic-timeline",
    recommended: "recommended-timeline",
    rootSlot: "timeline",
  },
  { id: "stat", basic: "basic-stat", recommended: "recommended-stat", rootSlot: "stat" },
  { id: "chart", basic: "basic-chart", recommended: "recommended-chart", rootSlot: "chart" },
  {
    id: "carousel",
    basic: "basic-carousel",
    recommended: "recommended-carousel",
    rootSlot: "carousel",
  },
  {
    id: "calendar-heatmap",
    basic: "basic-calendar-heatmap",
    recommended: "recommended-calendar-heatmap",
    rootSlot: "calendar-heatmap",
  },
  {
    id: "activity-feed",
    basic: "basic-activity-feed",
    recommended: "recommended-activity-feed",
    rootSlot: "activity-feed",
  },
] as const;

const focusableSelector = [
  "a[href]",
  "button:not([disabled])",
  "input:not([disabled])",
  "select:not([disabled])",
  "summary",
  "textarea:not([disabled])",
  '[tabindex]:not([tabindex="-1"])',
].join(",");

async function expectSemanticContract(
  page: Page,
  id: DataDisplayId,
  enhanced: boolean,
): Promise<void> {
  switch (id) {
    case "avatar": {
      const group = page.getByRole("group", { name: "Review participants" });
      await expect(group).toBeVisible();
      await expect(group.getByRole("img")).toHaveCount(3);
      await expect(group).toContainText("1 more people");
      await expect(page.locator('[data-slot="avatar-presence"]')).toHaveCount(enhanced ? 1 : 0);
      await expect(group.locator(focusableSelector)).toHaveCount(0);
      break;
    }
    case "card": {
      const card = page.locator('[data-slot="card"]');
      await expect(card).not.toHaveAttribute("role");
      await expect(card).not.toHaveAttribute("tabindex");
      await expect(card.getByRole("heading", { level: 3, name: "Release notes" })).toBeVisible();
      await expect(card.locator('[data-slot="card-status"]')).toHaveCount(enhanced ? 1 : 0);
      const consumerAction = card.getByRole("button", { name: "Open notes" });
      await consumerAction.focus();
      await expect(consumerAction).toBeFocused();
      await expect(card.locator(focusableSelector)).toHaveCount(1);
      break;
    }
    case "item": {
      const item = page.locator('[data-slot="item"]');
      await expect(item).not.toHaveAttribute("role");
      await expect(item).not.toHaveAttribute("tabindex");
      await expect(item).toContainText("Selected. Token review");
      await expect(item.locator('[data-slot="item-selection-context"]')).toHaveCount(
        enhanced ? 1 : 0,
      );
      const consumerAction = item.getByRole("button", { name: "Open" });
      await consumerAction.focus();
      await expect(consumerAction).toBeFocused();
      await expect(item.locator(focusableSelector)).toHaveCount(1);
      break;
    }
    case "table": {
      const region = page.getByRole("region", { name: "Verification queue table" });
      await expect(region).toHaveAttribute("tabindex", "0");
      await region.focus();
      await expect(region).toBeFocused();
      const table = page.getByRole("table", { name: "Verification queue" });
      await expect(table.getByRole("columnheader")).toHaveCount(3);
      await expect(table.getByRole("rowheader")).toHaveCount(3);
      if (enhanced) {
        await expect(region).toHaveAttribute("data-responsive-labels", "true");
      } else {
        await expect(region).not.toHaveAttribute("data-responsive-labels");
      }
      await expect(region.locator("button, input, select, summary")).toHaveCount(0);
      break;
    }
    case "data-table": {
      const table = page.getByRole("table", { name: "Verification queue" });
      await expect(table.getByRole("columnheader")).toHaveCount(enhanced ? 4 : 3);
      const sortButton = page.getByRole("button", { name: /Checks/u });
      await sortButton.click();
      await expect(page.getByRole("columnheader", { name: /Checks/u })).toHaveAttribute(
        "aria-sort",
        "ascending",
      );
      if (enhanced) {
        const search = page.getByRole("searchbox", { name: "Filter rows" });
        await search.fill("Usage notes");
        await expect(table.getByText("Usage notes")).toBeVisible();
        await expect(table.getByText("Design tokens")).toHaveCount(0);
        const selection = page.getByRole("checkbox", { name: "Select row r3" });
        await selection.check();
        await expect(selection).toBeChecked();
        await expect(page.locator('[data-slot="data-table-query-summary"]')).toHaveAttribute(
          "aria-live",
          "polite",
        );
        await expect(
          page.getByRole("navigation", { name: "Verification queue pages" }),
        ).toBeVisible();
      } else {
        await expect(page.getByRole("searchbox")).toHaveCount(0);
        await expect(page.getByRole("checkbox")).toHaveCount(0);
        await expect(
          page.getByRole("navigation", { name: "Verification queue pages" }),
        ).toHaveCount(0);
        await expect(page.locator('[data-slot="data-table-query-summary"]')).toHaveCount(0);
      }
      break;
    }
    case "virtual-list": {
      const listbox = page.getByRole("listbox", { name: "Search results" });
      await expect(listbox).not.toHaveAttribute("aria-busy");
      const first = page.getByRole("option", { name: "Result 1" });
      await first.focus();
      await first.press("End");
      await expect(page.getByRole("option", { name: "Result 100" })).toBeFocused();
      await expect(page.locator('[data-slot="virtual-list-position-summary"]')).toHaveCount(
        enhanced ? 1 : 0,
      );
      break;
    }
    case "timeline": {
      const list = page.getByRole("list", { name: "Document history" });
      await expect(list.getByRole("listitem")).toHaveCount(2);
      await expect(list.locator("time")).toHaveCount(2);
      await expect(list.locator("time").first()).toHaveAttribute("datetime", /T/u);
      await expect(page.locator('[data-slot="timeline-duration"]')).toHaveCount(enhanced ? 1 : 0);
      await expect(list.locator(focusableSelector)).toHaveCount(0);
      break;
    }
    case "stat": {
      const stat = page.locator('[data-slot="stat"]');
      await expect(stat).toHaveJSProperty("tagName", "DL");
      await expect(stat.locator("dt")).toHaveText("Completed checks");
      await expect(stat.locator("dd")).toHaveCount(enhanced ? 3 : 2);
      await expect(stat.locator('[data-slot="stat-comparison"]')).toHaveCount(enhanced ? 1 : 0);
      await expect(stat.locator(focusableSelector)).toHaveCount(0);
      break;
    }
    case "chart": {
      await expect(page.getByRole("img", { name: /Daily checks/u })).toBeVisible();
      await expect(page.locator('[data-slot="chart"] details table')).toBeAttached();
      if (enhanced) {
        const point = page.getByRole("button", { name: /Wednesday/u });
        await point.click();
        await expect(point).toHaveAttribute("aria-pressed", "true");
        await expect(page.getByRole("list", { name: "Daily checks data points" })).toBeVisible();
      } else {
        await expect(page.getByRole("list", { name: "Daily checks data points" })).toHaveCount(0);
      }
      break;
    }
    case "carousel": {
      const carousel = page.getByRole("region", { name: "Feature tour" });
      await expect(carousel).toHaveAttribute("aria-roledescription", "carousel");
      if (enhanced) {
        await page.getByRole("button", { name: "Pause rotation" }).click();
        await expect(page.getByRole("button", { name: "Resume rotation" })).toBeVisible();
        await expect(page.locator('[data-slot="carousel-announcement"]')).toHaveAttribute(
          "aria-live",
          "polite",
        );
      } else {
        await expect(page.getByRole("button", { name: "Pause rotation" })).toHaveCount(0);
        await expect(page.locator('[data-slot="carousel-announcement"]')).toHaveCount(0);
      }
      await carousel.focus();
      await carousel.press("ArrowRight");
      await expect(page.getByRole("group", { name: "Evidence" })).toBeVisible();
      break;
    }
    case "calendar-heatmap": {
      const grid = page.getByRole("grid", { name: "Daily verification activity values" });
      await expect(grid.getByRole("gridcell")).toHaveCount(21);
      const first = grid.getByRole("gridcell").first();
      await first.focus();
      await first.press("End");
      const last = grid.getByRole("gridcell").last();
      await expect(last).toBeFocused();
      await expect(last).toHaveAttribute("aria-selected", "true");
      await expect(page.locator('[data-slot="calendar-heatmap"] details table')).toBeAttached();
      await expect(page.locator('[data-slot="calendar-heatmap-summary"]')).toHaveCount(
        enhanced ? 1 : 0,
      );
      break;
    }
    case "activity-feed": {
      const list = page.getByRole("list", { name: "Recent activity" });
      await expect(list.getByRole("listitem")).toHaveCount(2);
      await expect(list.locator("time")).toHaveCount(2);
      await expect(page.locator('[data-slot="activity-feed-continuation-status"]')).toHaveCount(
        enhanced ? 1 : 0,
      );
      await page.getByRole("button", { name: "Load more activity" }).click();
      await expect(list.getByRole("listitem")).toHaveCount(3);
      await expect(page.getByRole("button", { name: "Load more activity" })).toHaveCount(0);
      if (enhanced) {
        await expect(page.locator('[data-slot="activity-feed-continuation-status"]')).toContainText(
          "end of activity",
        );
      }
      break;
    }
  }
}

for (const storyCase of storyEvidenceCases) {
  test(`${storyCase.id} basic and recommended stories expose honest semantic and axe evidence`, async ({
    page,
  }) => {
    await openStory(page, storyCase.basic);
    await expect(page.getByTestId(`data-display-${storyCase.id}`)).toHaveAttribute(
      "data-kind",
      storyCase.id,
    );
    await expect(page.locator(`[data-slot="${storyCase.rootSlot}"]`)).toBeVisible();
    await expectSemanticContract(page, storyCase.id, false);
    expect(await axeViolations(page)).toEqual([]);

    await openStory(page, storyCase.recommended);
    await expect(page.getByTestId(`data-display-${storyCase.id}`)).toHaveAttribute(
      "data-kind",
      storyCase.id,
    );
    await expect(page.locator(`[data-slot="${storyCase.rootSlot}"]`)).toBeVisible();
    await expectSemanticContract(page, storyCase.id, true);
    expect(await axeViolations(page)).toEqual([]);
  });
}

test("recommended stories expose narrow RTL evidence without document-level clipping", async ({
  page,
}) => {
  await page.setViewportSize({ height: 900, width: 360 });
  for (const storyCase of storyEvidenceCases) {
    await openStory(page, storyCase.recommended, "direction:rtl;narrow:true");
    const host = page.getByTestId(`data-display-${storyCase.id}`);
    const geometry = await host.evaluate((element) => {
      const bounds = element.getBoundingClientRect();
      return {
        direction: getComputedStyle(element).direction,
        documentOverflow:
          document.documentElement.scrollWidth > document.documentElement.clientWidth + 1,
        width: Math.round(bounds.width),
      };
    });
    expect(geometry, storyCase.id).toEqual({
      direction: "rtl",
      documentOverflow: false,
      width: 320,
    });
  }
});

async function expectMinimumTouchTarget(
  locator: Locator,
  label: string,
  minimum = 44,
): Promise<void> {
  const bounds = await locator.boundingBox();
  expect(bounds?.height ?? 0, `${label} height`).toBeGreaterThanOrEqual(minimum);
  expect(bounds?.width ?? 0, `${label} width`).toBeGreaterThanOrEqual(minimum);
}

test("component-owned interactions remain reachable in a touch-capable narrow context", async ({
  browser,
  browserName,
}) => {
  test.skip(browserName !== "chromium", "Playwright mobile touch emulation is Chromium-only.");
  const context = await browser.newContext({
    hasTouch: true,
    isMobile: true,
    viewport: { height: 800, width: 360 },
  });
  const page = await context.newPage();
  const failures = guardRuntime(page);

  await openStory(page, "recommended-data-table", "narrow:true");
  const sort = page.getByRole("button", { name: /Checks/u });
  await expectMinimumTouchTarget(sort, "data-table sort", 44);
  await sort.tap();
  await expect(page.getByRole("columnheader", { name: /Checks/u })).toHaveAttribute(
    "aria-sort",
    "ascending",
  );

  await openStory(page, "recommended-virtual-list", "narrow:true");
  const option = page.getByRole("option", { name: "Result 1" });
  await expectMinimumTouchTarget(option, "virtual-list option");
  await option.tap();
  await expect(option).toHaveAttribute("aria-selected", "true");

  await openStory(page, "recommended-chart", "narrow:true");
  const chartPoint = page.getByRole("button", { name: /Wednesday/u });
  await expectMinimumTouchTarget(chartPoint, "chart point");
  await chartPoint.tap();
  await expect(chartPoint).toHaveAttribute("aria-pressed", "true");

  await openStory(page, "recommended-carousel", "narrow:true");
  const next = page.getByRole("button", { name: "Next" });
  await expectMinimumTouchTarget(next, "carousel next");
  await next.tap();
  await expect(page.getByRole("group", { name: "Evidence" })).toBeVisible();

  await openStory(page, "recommended-calendar-heatmap", "narrow:true");
  const heatmapCell = page.getByRole("gridcell").nth(1);
  await expectMinimumTouchTarget(heatmapCell, "calendar heatmap cell");
  await heatmapCell.tap();
  await expect(heatmapCell).toHaveAttribute("aria-selected", "true");

  await openStory(page, "recommended-activity-feed", "narrow:true");
  const more = page.getByRole("button", { name: "Load more activity" });
  await expectMinimumTouchTarget(more, "activity feed continuation");
  await more.tap();
  await expect(
    page.getByRole("list", { name: "Recent activity" }).getByRole("listitem"),
  ).toHaveCount(3);

  expect(failures).toEqual([]);
  await context.close();
});

const preferenceSelectors: Readonly<Record<DataDisplayId, string>> = {
  "activity-feed": '[data-slot="activity-feed"]',
  avatar: '[data-slot="avatar"]',
  "calendar-heatmap": '[data-slot="calendar-heatmap"]',
  card: '[data-slot="card"]',
  carousel: '[data-slot="carousel"]',
  chart: '[data-slot="chart"]',
  "data-table": ".mrg-data-table__region",
  item: '[data-slot="item"]',
  stat: '[data-slot="stat"]',
  table: '[data-slot="table-region"]',
  timeline: '[data-slot="timeline"]',
  "virtual-list": '[data-slot="virtual-list-viewport"]',
};

test("forced colors and reduced motion produce concrete family-level computed evidence", async ({
  browser,
}) => {
  test.setTimeout(120_000);
  const context = await browser.newContext({ forcedColors: "active", reducedMotion: "reduce" });
  const page = await context.newPage();
  const failures = guardRuntime(page);

  for (const storyCase of storyEvidenceCases) {
    await openStory(page, storyCase.recommended);
    const target = page.locator(preferenceSelectors[storyCase.id]).first();
    const styles = await target.evaluate((element) => {
      const style = getComputedStyle(element);
      return {
        animationDuration: style.animationDuration,
        backgroundColor: style.backgroundColor,
        color: style.color,
      };
    });
    expect(styles.backgroundColor, `${storyCase.id} forced-color background`).not.toBe(
      "rgba(0, 0, 0, 0)",
    );
    expect(styles.color, `${storyCase.id} forced-color text`).not.toBe("rgba(0, 0, 0, 0)");
    expect(
      styles.animationDuration.split(",").every((duration) => duration.trim() === "0s"),
      `${storyCase.id} reduced-motion animation`,
    ).toBe(true);
  }

  await openStory(page, "recommended-item");
  await expect(page.locator('[data-slot="item"]')).toHaveCSS("transition-duration", "0s");
  await openStory(page, "recommended-virtual-list");
  await expect(page.locator('[data-slot="virtual-list-viewport"]')).toHaveCSS(
    "scroll-behavior",
    "auto",
  );
  await openStory(page, "recommended-carousel");
  await expect(page.locator('[data-slot="carousel-slide"]:visible')).toHaveCSS(
    "animation-duration",
    "0s",
  );
  expect(await axeViolations(page)).toEqual([]);
  expect(failures).toEqual([]);
  await context.close();
});

test("virtual list End and Home synchronize the offscreen window and DOM viewport", async ({
  page,
}) => {
  await openStory(page, "recommended-virtual-list");
  const viewport = page.getByRole("listbox", { name: "Search results" });
  const first = page.getByRole("option", { name: "Result 1" });
  await first.focus();
  await first.press("End");
  const last = page.getByRole("option", { name: "Result 100" });
  await expect(last).toBeFocused();
  expect(await viewport.evaluate((element) => element.scrollTop)).toBeGreaterThan(0);
  await last.press("Home");
  await expect(page.getByRole("option", { name: "Result 1" })).toBeFocused();
  await expect.poll(() => viewport.evaluate((element) => element.scrollTop)).toBe(0);
  expect(await axeViolations(page)).toEqual([]);
});

test("inherited RTL direction maps spatial carousel arrows", async ({ page }) => {
  await openStory(page, "narrow-and-rtl");
  const carousel = page.getByRole("region", { name: "Feature tour" });
  await carousel.focus();
  await carousel.press("ArrowLeft");
  await expect(page.getByRole("group", { name: "Evidence" })).toBeVisible();
});

test("reduced motion prevents rotation and leaves user-triggered announcements polite", async ({
  browser,
}) => {
  const context = await browser.newContext({ forcedColors: "active", reducedMotion: "reduce" });
  const page = await context.newPage();
  const failures = guardRuntime(page);
  await openStory(page, "recommended-carousel");
  const carousel = page.getByRole("region", { name: "Feature tour" });
  await expect(page.locator('[data-slot="carousel-announcement"]')).toHaveAttribute(
    "aria-live",
    "polite",
  );
  const evidence = await carousel.evaluate((element) => ({
    border: getComputedStyle(element).borderColor,
    animation: getComputedStyle(element.querySelector('[data-slot="carousel-slide"]')!)
      .animationDuration,
  }));
  expect(evidence.border).not.toBe("rgba(0, 0, 0, 0)");
  expect(evidence.animation).toBe("0s");
  expect(await axeViolations(page)).toEqual([]);
  expect(failures).toEqual([]);
  await context.close();
});

test("basic and recommended exports preserve enhancement isolation", async ({ page }) => {
  await openStory(page, "basic-data-table");
  await expect(page.getByRole("searchbox")).toHaveCount(0);
  await expect(page.locator('[data-slot="data-table-query-summary"]')).toHaveCount(0);
  await openStory(page, "recommended-data-table");
  await expect(page.getByRole("searchbox", { name: "Filter rows" })).toBeVisible();
  await expect(page.locator('[data-slot="data-table-query-summary"]')).toHaveAttribute(
    "aria-live",
    "polite",
  );
  expect(await axeViolations(page)).toEqual([]);
});
