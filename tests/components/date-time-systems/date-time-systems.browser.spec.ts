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

async function openStory(page: Page, story: string): Promise<void> {
  await page.goto(`/iframe.html?viewMode=story&id=p4-date-and-time-systems--${story}`, {
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
    for (let attempt = 0; attempt < 10; attempt += 1) {
      try {
        return (await axe.run(document.body)).violations;
      } catch (error) {
        if (!(error instanceof Error) || !error.message.includes("already running")) throw error;
        await new Promise((resolveDelay) => setTimeout(resolveDelay, 100));
      }
    }
    throw new Error("Axe remained busy after the bounded retry window.");
  });
}

test("basic and recommended stories isolate every optional enhancement", async ({ page }) => {
  await page.setViewportSize({ height: 900, width: 360 });
  await openStory(page, "basic-defaults");
  for (const slot of [
    "date-field-context",
    "date-picker-presets",
    "time-field-zone",
    "time-picker-intervals",
    "date-time-field-zone",
    "date-time-field-wall-time",
    "date-time-field-resolved-value",
    "date-time-picker-presets",
    "month-picker-quarter",
    "year-picker-range",
    "year-picker-window",
    "date-range-picker-duration",
    "date-range-picker-duration-error",
    "range-calendar-duration",
    "range-calendar-preview",
    "range-calendar-span-error",
  ]) {
    await expect(page.locator(`[data-slot="${slot}"]`), slot).toHaveCount(0);
  }
  await expect(page.getByText("Closed for maintenance.")).toHaveCount(0);
  await expect(page.getByTestId("duration-issue-event")).toHaveCount(0);
  await expect(page.getByTestId("wall-time-resolution-event")).toHaveCount(0);
  await expect(page.locator('input[type="date"]')).not.toHaveCount(0);
  await expect(page.locator('input[type="time"]')).not.toHaveCount(0);
  await expect(page.locator('input[type="datetime-local"]')).not.toHaveCount(0);
  await expect(page.locator('input[type="month"]')).not.toHaveCount(0);

  await openStory(page, "recommended-mergora");
  await expect(page.locator('[data-slot="date-field-context"]')).not.toHaveCount(0);
  await expect(page.locator('[data-slot="date-picker-presets"]')).not.toHaveCount(0);
  await expect(page.locator('[data-slot="time-field-zone"]')).not.toHaveCount(0);
  await expect(page.locator('[data-slot="time-picker-intervals"]')).not.toHaveCount(0);
  await expect(page.locator('[data-slot="date-time-field-zone"]')).not.toHaveCount(0);
  await expect(page.locator('[data-slot="date-time-field-wall-time"]')).not.toHaveCount(0);
  await expect(page.locator('[data-slot="date-time-field-resolved-value"]')).not.toHaveCount(0);
  await expect(page.locator('[data-slot="month-picker-quarter"]')).not.toHaveCount(0);
  await expect(page.locator('[data-slot="year-picker-range"]')).not.toHaveCount(0);
  await expect(page.locator('[data-slot="year-picker-window"]')).toHaveCount(1);
  await expect(page.getByTestId("duration-issue-event")).toHaveText("Duration issue: none");
  await expect(page.getByTestId("wall-time-resolution-event")).toHaveText(
    "Resolution event: ambiguous",
  );
  await expect(page.locator('[data-slot="date-range-picker-duration"]')).toContainText(
    "3 calendar days",
  );
  await expect(page.getByText("Closed for maintenance.").first()).toBeAttached();

  const dateInput = page.locator('input[name="milestone-date"]');
  await page.getByRole("button", { name: "Second review" }).click();
  await expect(dateInput).toHaveValue("2026-08-18");
  await page.getByRole("button", { name: "10:30" }).click();
  await expect(page.locator('input[name="available-time"]')).toHaveValue("10:30");
});

test("duration, unavailable-span, wall-time, and year-window adapters recover cleanly", async ({
  page,
}) => {
  await openStory(page, "recommended-mergora");

  const endDate = page.locator('input[name="window-end"]');
  await endDate.fill("2026-08-20");
  await expect(page.locator('[data-slot="date-range-picker-duration-error"]')).toContainText(
    "no more than 7 calendar days",
  );
  await expect(page.getByTestId("duration-issue-event")).toHaveText("Duration issue: maximum");
  await expect(endDate).toHaveAttribute("aria-invalid", "true");
  expect(await endDate.evaluate((element) => (element as HTMLInputElement).checkValidity())).toBe(
    false,
  );
  await endDate.fill("2026-08-10");
  await expect(page.locator('[data-slot="date-range-picker-duration-error"]')).toHaveCount(0);
  await expect(page.getByTestId("duration-issue-event")).toHaveText("Duration issue: none");
  expect(await endDate.evaluate((element) => (element as HTMLInputElement).checkValidity())).toBe(
    true,
  );

  const rangeCalendar = page.locator('[data-slot="range-calendar"]');
  const rangeEndPane = rangeCalendar.locator("section").nth(1);
  const blockedSpanEnd = rangeEndPane.locator('[data-slot="calendar-day"][data-date="2026-08-13"]');
  await blockedSpanEnd.hover();
  await expect(rangeCalendar.locator('[data-slot="range-calendar-preview"]')).toContainText(
    "10 calendar days if selected",
  );
  await blockedSpanEnd.click();
  await expect(rangeCalendar.locator('[data-slot="range-calendar-span-error"]')).toContainText(
    "crosses unavailable date 2026-08-11",
  );
  await expect(page.locator('input[name="calendar-range-end"]')).toHaveValue("2026-08-06");

  const localTime = page.locator('input[name="planned-start"]');
  await expect(page.locator('input[name="planned-start-instant"]')).toHaveValue(
    "2026-10-25T01:30:00Z",
  );
  await localTime.fill("2026-03-29T02:30");
  await expect(page.locator('[data-slot="date-time-field-wall-time"]').first()).toContainText(
    "does not exist",
  );
  await expect(page.getByTestId("wall-time-resolution-event")).toHaveText(
    "Resolution event: nonexistent",
  );
  expect(await localTime.evaluate((element) => (element as HTMLInputElement).checkValidity())).toBe(
    false,
  );
  await expect(page.locator('input[name="planned-start-instant"]')).toHaveCount(0);
  await localTime.fill("2026-08-04T09:00");
  expect(await localTime.evaluate((element) => (element as HTMLInputElement).checkValidity())).toBe(
    true,
  );
  await expect(page.locator('input[name="planned-start-instant"]')).toHaveValue(
    "2026-08-04T07:00:00Z",
  );
  await expect(page.getByTestId("wall-time-resolution-event")).toHaveText(
    "Resolution event: valid",
  );

  await expect(page.locator('[data-slot="year-picker-window-label"]')).toHaveText("2020–2030");
  await page.getByRole("button", { name: "Show later years" }).click();
  await expect(page.locator('[data-slot="year-picker-window-label"]')).toHaveText("2031–2041");
  await expect(page.locator('select[name="archive-year"] option[value="2035"]')).toHaveCount(1);
});

test("calendar supports roving keyboard navigation, selection, and explained unavailable dates", async ({
  page,
}) => {
  await openStory(page, "keyboard-workbench");
  const selectedCell = page.locator('[role="gridcell"][aria-selected="true"]').first();
  const selectedButton = selectedCell.getByRole("button");
  await selectedButton.focus();
  await selectedButton.press("PageDown");
  await expect(page.locator('[data-slot="calendar-heading"]')).toHaveText("September 2026");
  await expect(page.locator('[data-slot="calendar-day"]:focus')).toHaveAttribute(
    "data-date",
    "2026-09-04",
  );
  await expect(page.locator('[data-slot="calendar-day"]:focus')).toHaveAttribute("tabindex", "0");
  await page.locator('[data-slot="calendar-day"]:focus').press("ArrowRight");
  await expect(page.locator('[data-slot="calendar-day"]:focus')).toHaveAttribute(
    "data-date",
    "2026-09-05",
  );
  await page.locator('[data-slot="calendar-day"]:focus').click();
  await expect(page.locator('[data-slot="calendar-input"]')).toHaveValue("2026-09-05");

  await openStory(page, "recommended-mergora");
  const unavailable = page.locator('[data-slot="calendar-day"][data-date="2026-08-11"]').first();
  await expect(unavailable).toHaveAttribute("aria-disabled", "true");
  const describedBy = await unavailable.getAttribute("aria-describedby");
  expect(describedBy).toBeTruthy();
  await expect(page.locator(`#${describedBy}`)).toHaveText("Closed for maintenance.");
});

test("an initially invalid unavailable span blocks native submission until recovered", async ({
  page,
}) => {
  await openStory(page, "state-matrix");
  const rangeCalendar = page.locator('[data-slot="range-calendar"]');
  const endInput = rangeCalendar.locator("section").nth(1).locator('input[type="date"]');
  await expect(endInput).toHaveAttribute("aria-invalid", "true");
  expect(await endInput.evaluate((element) => (element as HTMLInputElement).checkValidity())).toBe(
    false,
  );
  await expect(rangeCalendar.locator('[data-slot="range-calendar-span-error"]')).toContainText(
    "Closed for maintenance.",
  );
  await endInput.fill("2026-08-10");
  await expect(rangeCalendar.locator('[data-slot="range-calendar-span-error"]')).toHaveCount(0);
  expect(await endInput.evaluate((element) => (element as HTMLInputElement).checkValidity())).toBe(
    true,
  );
});

test("native form submission and reset preserve canonical values", async ({ page }) => {
  await openStory(page, "form-lifecycle");
  const date = page.locator('input[name="effective-date"]');
  const time = page.locator('input[name="effective-time"]');
  const localDateTime = page.locator('input[name="effective-local-date-time"]');
  const month = page.locator('input[name="reporting-month"]');
  const year = page.locator('select[name="archive-year"]');
  const fieldRangeStart = page.locator('input[name="field-range-start"]');
  const fieldRangeEnd = page.locator('input[name="field-range-end"]');
  const calendarRangeStart = page.locator('input[name="calendar-form-start"]');
  const calendarRangeEnd = page.locator('input[name="calendar-form-end"]');
  await date.fill("2026-09-10");
  await time.fill("14:30");
  await month.fill("2026-09");
  await year.selectOption("2028");
  await fieldRangeStart.fill("2026-09-10");
  await fieldRangeEnd.fill("2026-09-12");
  await calendarRangeStart.fill("2026-09-15");
  await calendarRangeEnd.fill("2026-09-18");
  await page.getByRole("button", { name: "Inspect values" }).click();
  await expect(page.getByTestId("date-time-form-output")).toContainText(
    '"effective-date":"2026-09-10"',
  );
  await expect(page.getByTestId("date-time-form-output")).toContainText('"effective-time":"14:30"');
  await expect(page.getByTestId("date-time-form-output")).toContainText(
    '"effective-local-date-time":"2026-08-04T09:00"',
  );
  await expect(page.getByTestId("date-time-form-output")).toContainText(
    '"effective-instant":"2026-08-04T07:00:00Z"',
  );
  await expect(page.getByTestId("date-time-form-output")).toContainText(
    '"reporting-month":"2026-09"',
  );
  await expect(page.getByTestId("date-time-form-output")).toContainText('"archive-year":"2028"');
  await page.getByRole("button", { name: "Restore defaults" }).click();
  await expect(date).toHaveValue("2026-08-04");
  await expect(time).toHaveValue("09:00");
  await expect(localDateTime).toHaveValue("2026-08-04T09:00");
  await expect(month).toHaveValue("2026-08");
  await expect(year).toHaveValue("2026");
  await expect(fieldRangeStart).toHaveValue("2026-08-04");
  await expect(fieldRangeEnd).toHaveValue("2026-08-06");
  await expect(calendarRangeStart).toHaveValue("2026-08-04");
  await expect(calendarRangeEnd).toHaveValue("2026-08-06");
});

test("narrow and RTL presentations preserve reflow and direction-aware arrows", async ({
  page,
}) => {
  await page.setViewportSize({ height: 900, width: 320 });
  await openStory(page, "narrow-mobile");
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - innerWidth);
  expect(overflow).toBeLessThanOrEqual(1);

  await openStory(page, "right-to-left");
  const selected = page.locator('[role="gridcell"][aria-selected="true"] button').first();
  await selected.focus();
  await selected.press("ArrowLeft");
  await expect(page.locator('[data-slot="calendar-day"]:focus')).toHaveAttribute(
    "data-date",
    "2026-08-05",
  );
});

test("coarse-pointer touch context exposes 44 CSS-pixel day targets and accepts a tap", async ({
  baseURL,
  browser,
}) => {
  if (baseURL === undefined) throw new Error("The date-time browser suite requires a base URL.");
  const context = await browser.newContext({
    baseURL,
    hasTouch: true,
    viewport: { height: 900, width: 390 },
  });
  const page = await context.newPage();
  const runtime = guardRuntime(page);
  await openStory(page, "user-preference-evidence");
  const touchContext = await page.evaluate(() => ({
    coarse: matchMedia("(pointer: coarse)").matches,
  }));
  expect(touchContext.coarse).toBe(true);

  const calendar = page.locator('[data-slot="calendar"]').first();
  const dayTargets = await calendar.locator('[data-slot="calendar-day"]').evaluateAll((elements) =>
    elements.map((element) => {
      const { height, width } = element.getBoundingClientRect();
      return { height, width };
    }),
  );
  expect(dayTargets.length).toBeGreaterThan(0);
  expect(dayTargets.every(({ height, width }) => height >= 44 && width >= 44)).toBe(true);
  const navigationTargets = await calendar
    .locator('[data-slot="calendar-previous"], [data-slot="calendar-next"]')
    .evaluateAll((elements) =>
      elements.map((element) => {
        const { height, width } = element.getBoundingClientRect();
        return { height, width };
      }),
    );
  expect(navigationTargets.every(({ height, width }) => height >= 44 && width >= 44)).toBe(true);

  const nextDate = calendar.locator('[data-slot="calendar-day"][data-date="2026-08-05"]');
  await nextDate.tap();
  await expect(nextDate).toHaveAttribute("data-selected", "true");
  expect(await axeViolations(page)).toEqual([]);
  expect(runtime).toEqual([]);
  await context.close();
});

test("forced colors, reduced motion, and axe retain usable semantics", async ({
  browserName,
  page,
}) => {
  await page.emulateMedia(
    browserName === "chromium"
      ? { forcedColors: "active", reducedMotion: "reduce" }
      : { reducedMotion: "reduce" },
  );
  await openStory(page, "user-preference-evidence");
  const selected = page.locator('[data-slot="calendar-day"][data-selected="true"]');
  await expect(selected).toBeVisible();
  await selected.focus();
  if (browserName === "chromium") {
    const outlineStyle = await selected.evaluate(
      (element) => getComputedStyle(element).outlineStyle,
    );
    expect(outlineStyle).not.toBe("none");
  }
  expect(await axeViolations(page)).toEqual([]);
});
