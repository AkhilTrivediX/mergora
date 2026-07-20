import { resolve } from "node:path";

import { expect, test, type Page } from "@playwright/test";

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

test.beforeEach(({ page }) => {
  guardRuntime(page);
});

test.afterEach(({ page }) => {
  expect(runtimeFailures.get(page) ?? []).toEqual([]);
});

async function openStory(page: Page, story: string, args?: string): Promise<void> {
  const storyArgs = args === undefined ? "" : `&args=${encodeURIComponent(args)}`;
  await page.goto(
    `/iframe.html?viewMode=story&id=components-data-grid-experimental--${story}${storyArgs}`,
    { waitUntil: "domcontentloaded" },
  );
  await expect(page.locator('[data-slot="data-grid-region"]').first()).toBeVisible();
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

test("basic DataGrid keeps table semantics and removes every D1-A enhancement", async ({
  page,
}) => {
  await openStory(page, "basic-defaults");
  await expect(page.getByRole("table", { name: "Library records" })).toBeVisible();
  await expect(page.getByRole("searchbox")).toHaveCount(0);
  await expect(page.getByRole("navigation")).toHaveCount(0);
  await expect(page.getByRole("radio")).toHaveCount(0);
  await expect(page.locator('[data-slot="data-grid-query-summary"]')).toHaveCount(0);
  await expect(page.locator('[data-slot="data-grid-selection-summary"]')).toHaveCount(0);
  await expect(page.locator('[data-slot="data-grid-operation-status"]')).toHaveCount(0);
  await expect(page.locator('[data-slot="data-grid-query-input"]')).toHaveCount(0);
  await expect(page.locator('[data-slot="data-grid-selection-input"]')).toHaveCount(0);
  await expect(page.locator('[data-slot="data-grid-column-visibility"]')).toHaveCount(0);
  await expect(page.locator("[data-story-controlled-form-data]")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Prepare safe CSV" })).toHaveCount(0);
  await expect(page.locator("[data-story-csv-preview]")).toHaveCount(0);
  await expect(page.locator('[data-slot="data-grid-region"]')).not.toHaveAttribute(
    "data-operation",
  );
  expect(await axeViolations(page)).toEqual([]);
});

test("Storybook controls enable independent enhancements without creating illegal combinations", async ({
  page,
}) => {
  await openStory(
    page,
    "basic-defaults",
    [
      "filteringEnabled:true",
      "columnVisibilityEnabled:true",
      "columnVisibilityPersistenceEnabled:true",
      "csvExportEnabled:true",
      "formSerializationEnabled:true",
      "operationMode:manual",
      "operationStatusState:error",
      "paginationEnabled:true",
      "queryAdapterEnabled:true",
      "selectionMode:single",
      "showQuerySummary:true",
      "showSelectionSummary:true",
    ].join(";"),
  );
  await expect(page.getByRole("searchbox", { name: "Filter records" })).toBeVisible();
  await page.getByText("Visible fields", { exact: true }).click();
  const ownerVisibility = page.getByRole("checkbox", { name: "Owner" });
  await expect(ownerVisibility).not.toBeChecked();
  await ownerVisibility.check();
  await expect(page.getByRole("columnheader", { name: "Owner" })).toBeVisible();
  await page.getByRole("button", { name: "Prepare safe CSV" }).click();
  await expect(page.locator("[data-story-csv-preview]")).toContainText("Record,State,Owner");
  await expect(page.locator("[data-story-csv-preview]")).toContainText("Design tokens,Ready,Asha");
  await expect(page.getByRole("navigation", { name: "Library records pagination" })).toBeVisible();
  await expect(page.getByRole("radio")).not.toHaveCount(0);
  await expect(page.locator('[data-slot="data-grid-query-summary"]')).toBeVisible();
  await expect(page.locator('[data-slot="data-grid-selection-summary"]')).toBeVisible();
  await expect(page.locator("[data-story-adapter-writes]")).toHaveText("0 persisted changes");
  await expect(page.locator('[data-slot="data-grid-row"]')).toHaveCount(6);
  await expect(page.locator('[data-slot="data-grid-query-input"]')).toHaveAttribute(
    "name",
    "libraryQueryControl",
  );
  await expect(page.getByRole("radio").first()).toHaveAttribute("name", "libraryRecordControl");
  await expect(page.getByRole("alert")).toContainText("Could not load records");
  await page.getByRole("button", { name: "Retry loading records" }).click();
  await expect(page.locator("[data-story-operation-retries]")).toHaveText("1 retry request");
  await page.getByRole("button", { name: "Inspect controlled FormData" }).click();
  await expect(page.locator("[data-story-controlled-form-data]")).toHaveText(
    '[["libraryRecordControl","artifact-2"],["libraryQueryControl","pagination=page&page=1&pageSize=2"]]',
  );

  await openStory(page, "basic-defaults", "selectionMode:none;showSelectionSummary:true");
  await expect(page.getByRole("radio")).toHaveCount(0);
  await expect(page.locator('[data-slot="data-grid-selection-summary"]')).toHaveCount(0);
});

test("recommended DataGrid filters, pages, persists query changes, and keeps selection context", async ({
  page,
}) => {
  await openStory(page, "recommended-mergora");
  const filter = page.getByRole("searchbox", { name: "Filter records" });
  const summary = page.locator('[data-slot="data-grid-query-summary"]');
  const selectionSummary = page.locator('[data-slot="data-grid-selection-summary"]');

  await page.getByRole("button", { name: "Prepare safe CSV" }).click();
  await expect(page.locator("[data-story-csv-preview]")).toContainText("Record,State,Owner");
  await expect(page.getByRole("columnheader", { name: "Owner" })).toHaveCount(0);
  await page.getByText("Visible fields", { exact: true }).click();
  await page.getByRole("checkbox", { name: "Owner" }).check();
  await expect(page.getByRole("columnheader", { name: "Owner" })).toBeVisible();

  await expect(page.getByRole("radio", { name: "Select Icon exports" })).toBeChecked();
  await expect(selectionSummary).toContainText("Selected Icon exports");
  await expect(page.getByRole("row", { name: /Design tokens/u })).toBeVisible();
  await expect(page.getByRole("row", { name: /Usage notes/u })).toHaveCount(0);

  await page.getByRole("button", { name: "Next page" }).click();
  await expect(page.getByRole("row", { name: /Usage notes/u })).toBeVisible();
  await expect(summary).toContainText("page 2");
  await page.getByRole("button", { name: "Next page" }).click();
  await expect(page.getByRole("row", { name: /Registry schema/u })).toBeVisible();
  await expect(page.locator('[data-slot="data-grid-region"]')).toBeFocused();

  await filter.fill("Review");
  await expect(page.getByRole("row", { name: /Icon exports/u })).toBeVisible();
  await expect(page.getByRole("row", { name: /Keyboard map/u })).toBeVisible();
  await expect(page.getByRole("row", { name: /Design tokens/u })).toHaveCount(0);
  await expect(summary).toContainText("2 records");
  await expect(page.locator("[data-story-adapter-writes]")).toHaveText(
    /[1-9]\d* persisted changes?/u,
  );
  expect(await axeViolations(page)).toEqual([]);
});

test("adapter restoration runs once after hydration under Strict Mode", async ({ page }) => {
  await openStory(page, "adapter-hydration");
  await expect(page.locator("[data-story-adapter-reads]")).toHaveText("1 hydration read");
  await expect(page.getByRole("searchbox", { name: "Filter records" })).toHaveValue("Review");
  await expect(page.getByRole("row", { name: /Icon exports/u })).toBeVisible();
  await expect(page.getByRole("row", { name: /Keyboard map/u })).toBeVisible();
  await expect(page.getByRole("row", { name: /Design tokens/u })).toHaveCount(0);
});

test("client filtering and pagination reset page ownership after a filter edit", async ({
  page,
}) => {
  await openStory(page, "client-filter-and-page");
  await page.getByRole("button", { name: "Next page" }).click();
  await expect(page.getByRole("row", { name: /Usage notes/u })).toBeVisible();
  await page.getByRole("searchbox", { name: "Filter records" }).fill("Ready");
  await expect(page.locator('[data-slot="data-grid-query-summary"]')).toContainText("page 1");
  await expect(page.getByRole("row", { name: /Design tokens/u })).toBeVisible();
  await expect(page.getByRole("row", { name: /Usage notes/u })).toHaveCount(0);
});

test("controlled query reports filter, sort, and page changes without internal divergence", async ({
  page,
}) => {
  await openStory(page, "controlled-query");
  const evidence = page.locator("[data-story-controlled-query]");
  await page.getByRole("searchbox", { name: "Filter records" }).fill("Review");
  await expect(evidence).toContainText("filter=Review");
  await page.getByRole("button", { name: "Record" }).click();
  await expect(evidence).toContainText("sort=title:ascending");
  await expect(evidence).toContainText("reason=sort");
});

test("controlled column visibility reports native checkbox changes without orphan cells", async ({
  page,
}) => {
  await openStory(page, "controlled-column-visibility");
  await expect(page.getByRole("columnheader", { name: "Owner" })).toHaveCount(0);
  await page.getByText("Visible fields", { exact: true }).click();
  await page.getByRole("checkbox", { name: "Owner" }).check();
  await expect(page.getByRole("columnheader", { name: "Owner" })).toBeVisible();
  await expect(page.locator("[data-story-controlled-column-visibility]")).toHaveText(
    "owner:visible",
  );
});

test("column visibility adapter restores once and persists only committed checkbox changes", async ({
  page,
}) => {
  await openStory(page, "column-visibility-adapter-hydration");
  const evidence = page.locator("[data-story-column-visibility-adapter]");
  await expect(evidence).toContainText("1 hydration read");
  await expect(page.getByRole("columnheader", { name: "Owner" })).toHaveCount(0);
  await page.getByText("Visible fields", { exact: true }).click();
  await page.getByRole("checkbox", { name: "Owner" }).check();
  await expect(page.getByRole("columnheader", { name: "Owner" })).toBeVisible();
  await expect(evidence).toContainText('[["title",true],["state",true],["owner",true]]');
});

test("manual page mode never slices consumer-owned rows and delegates page changes", async ({
  page,
}) => {
  await openStory(page, "manual-page");
  await expect(page.locator('[data-slot="data-grid-row"]')).toHaveCount(2);
  await expect(page.getByRole("row", { name: /Remote record 21/u })).toBeVisible();
  await expect(page.getByRole("row", { name: /Remote record 22/u })).toBeVisible();
  await expect(page.locator("[data-story-manual-request]")).toHaveText("Requested page 2");

  await page.getByRole("button", { name: "Next page" }).click();
  await expect(page.locator("[data-story-manual-request]")).toHaveText("Requested page 3");
  await expect(page.getByRole("row", { name: /Remote record 31/u })).toBeVisible();
  await expect(page.getByRole("row", { name: /Remote record 21/u })).toHaveCount(0);
});

test("manual cursor mode delegates cursor ownership without exposing numbered-page output", async ({
  page,
}) => {
  await openStory(page, "manual-cursor");
  const pagination = page.getByRole("navigation", { name: "Library records pagination" });
  await expect(pagination).toContainText("Batch alpha");
  await expect(pagination.getByRole("button", { name: "Previous results" })).toBeDisabled();
  await pagination.getByRole("button", { name: "Next results" }).click();
  await expect(pagination).toContainText("Batch beta");
  await expect(page.getByRole("row", { name: /Cursor record B1/u })).toBeVisible();
  await expect(page.locator("[data-story-manual-request]")).toHaveText("Requested cursor beta");
  await expect(page.locator('[data-slot="data-grid-region"]')).toBeFocused();
});

test("loading and error states retain rows, expose recovery, and restore useful focus", async ({
  page,
}) => {
  await openStory(page, "loading-and-error-recovery");
  const region = page.locator('[data-slot="data-grid-region"]');
  await expect(region).toHaveAttribute("aria-busy", "true");
  await expect(page.getByRole("row", { name: /Design tokens/u })).toBeVisible();
  await page.getByRole("button", { name: "Show recoverable error" }).click();

  const alert = page.getByRole("alert");
  await expect(alert).toContainText("Records could not be refreshed");
  await expect(region).not.toHaveAttribute("aria-busy", "true");
  await expect(page.getByRole("row", { name: /Design tokens/u })).toBeVisible();
  const retry = page.getByRole("button", { name: "Retry loading records" });
  await retry.focus();
  await retry.click();
  await expect(region).toHaveAttribute("aria-busy", "true");
  await expect(page.getByRole("row", { name: /Design tokens/u })).toBeVisible();
  await expect(region).not.toHaveAttribute("aria-busy", "true");
  await expect(region).toBeFocused();
  expect(await axeViolations(page)).toEqual([]);
});

test("single selection participates in exact FormData and native reset", async ({ page }) => {
  await openStory(page, "form-serialization-and-reset");
  const filter = page.getByRole("searchbox", { name: "Filter records" });
  await page.getByText("Visible fields", { exact: true }).click();
  const ownerVisibility = page.getByRole("checkbox", { name: "Owner" });
  await expect(ownerVisibility).not.toBeChecked();
  await ownerVisibility.check();
  await expect(page.getByRole("columnheader", { name: "Owner" })).toBeVisible();
  await filter.fill("Review");
  await page.getByRole("button", { name: "Inspect FormData" }).click();
  await expect(page.locator("[data-story-form-data]")).toHaveText(
    '[["libraryRecord","artifact-1"],["libraryQuery","filter=Review"]]',
  );
  await page.getByRole("radio", { name: "Select Icon exports" }).check();
  await page.getByRole("button", { name: "Inspect FormData" }).click();
  await expect(page.locator("[data-story-form-data]")).toHaveText(
    '[["libraryRecord","artifact-2"],["libraryQuery","filter=Review"]]',
  );
  const eventsBeforeReset = await page.locator("[data-story-form-events]").textContent();

  await filter.locator("xpath=ancestor::form").evaluate((form) => {
    form.addEventListener("reset", (event) => event.preventDefault(), { once: true });
  });
  await page.getByRole("button", { name: "Reset records form" }).click();
  await expect(filter).toHaveValue("Review");
  await expect(ownerVisibility).toBeChecked();
  await expect(page.getByRole("radio", { name: "Select Icon exports" })).toBeChecked();
  await expect(page.locator("[data-story-form-events]")).toHaveText(eventsBeforeReset ?? "");

  await page.getByRole("button", { name: "Reset records form" }).click();
  await expect(filter).toHaveValue("");
  await expect(ownerVisibility).not.toBeChecked();
  await expect(page.getByRole("columnheader", { name: "Owner" })).toHaveCount(0);
  await expect(page.getByRole("radio", { name: "Select Design tokens" })).toBeChecked();
  await page.getByRole("button", { name: "Inspect FormData" }).click();
  await expect(page.locator("[data-story-form-data]")).toHaveText(
    '[["libraryRecord","artifact-1"],["libraryQuery",""]]',
  );
  await expect(page.locator("[data-story-form-events]")).toHaveText(eventsBeforeReset ?? "");
});

test("client filtering is deterministic when the browser locale has Turkish casing", async ({
  browser,
}) => {
  const context = await browser.newContext({ locale: "tr-TR" });
  const page = await context.newPage();
  guardRuntime(page);
  await openStory(page, "client-filter-and-page");
  await page.getByRole("searchbox", { name: "Filter records" }).fill("i");
  await expect(page.getByRole("row", { name: /Icon exports/u })).toBeVisible();
  expect(runtimeFailures.get(page) ?? []).toEqual([]);
  await context.close();
});

test("empty state retains native table structure and has no orphan query controls", async ({
  page,
}) => {
  await openStory(page, "empty");
  await expect(page.getByRole("table", { name: "Library records" })).toBeVisible();
  await expect(page.getByText("No library records are available")).toBeVisible();
  await expect(page.locator('[data-slot="data-grid-row"]')).toHaveCount(0);
  await expect(page.getByRole("navigation")).toHaveCount(0);
  expect(await axeViolations(page)).toEqual([]);
});

test("keyboard sorting and native radio navigation keep summary state synchronized", async ({
  page,
}) => {
  await openStory(page, "keyboard-and-preferences");
  const recordSort = page.getByRole("button", { name: "Record" });
  await recordSort.focus();
  await page.keyboard.press("Enter");
  await expect(recordSort.locator("xpath=ancestor::th")).toHaveAttribute("aria-sort", "ascending");
  await page.keyboard.press("Space");
  await expect(recordSort.locator("xpath=ancestor::th")).toHaveAttribute("aria-sort", "descending");

  const selected = page.getByRole("radio", { name: "Select Icon exports" });
  await selected.focus();
  await page.keyboard.press("ArrowDown");
  await expect(page.getByRole("radio", { name: "Select Design tokens" })).toBeChecked();
  await expect(page.locator('[data-slot="data-grid-selection-summary"]')).toContainText(
    "Design tokens",
  );
});

test("DataGrid reflows at 320px in RTL and promotes coarse-pointer controls", async ({
  browser,
}) => {
  const context = await browser.newContext({
    hasTouch: true,
    viewport: { height: 720, width: 320 },
  });
  const page = await context.newPage();
  guardRuntime(page);
  await openStory(page, "narrow-and-rtl");
  const region = page.locator('[data-slot="data-grid-region"]');
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

  const undersized = await page
    .locator(
      '[data-slot="data-grid-column-header"] button, [data-slot="data-grid-filter-input"], [data-slot="data-grid-pagination"] button, [data-slot="data-grid-pagination"] select',
    )
    .evaluateAll((elements) =>
      elements
        .map((element) => {
          const bounds = element.getBoundingClientRect();
          return { height: bounds.height, width: bounds.width };
        })
        .filter(({ height, width }) => height < 44 || width < 44),
    );
  expect(undersized).toEqual([]);
  expect(await axeViolations(page)).toEqual([]);
  expect(runtimeFailures.get(page) ?? []).toEqual([]);
  await context.close();
});

test("forced colors retain boundaries and reduced motion removes row transitions", async ({
  browser,
}) => {
  const context = await browser.newContext({ forcedColors: "active", reducedMotion: "reduce" });
  const page = await context.newPage();
  guardRuntime(page);
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
  expect(violations.filter(({ id }) => id !== "color-contrast")).toEqual([]);
  expect(runtimeFailures.get(page) ?? []).toEqual([]);
  await context.close();
});
