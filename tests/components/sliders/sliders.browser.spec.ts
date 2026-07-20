import { resolve } from "node:path";
import { expect, test, type Locator, type Page } from "@playwright/test";

const axePath = resolve(
  import.meta.dirname,
  "../../../packages/test-utils/node_modules/axe-core/axe.min.js",
);
const runtimeFailures = new WeakMap<Page, string[]>();

test.use({ hasTouch: true });

function guardRuntime(page: Page, browserName: string): string[] {
  const failures: string[] = [];
  runtimeFailures.set(page, failures);
  page.on("console", (message) => {
    if (
      browserName === "firefox" &&
      message.type() === "warning" &&
      message.text().includes("Ignoring ‘preventDefault()’ call on event of type ‘touchstart’") &&
      message.text().includes("listener registered as ‘passive’")
    ) {
      return;
    }
    if (message.type() === "warning" || message.type() === "error") {
      failures.push(`console.${message.type()}: ${message.text()}`);
    }
  });
  page.on("pageerror", (error) => failures.push(`pageerror: ${error.message}`));
  return failures;
}

test.beforeEach(({ browserName, page }) => {
  guardRuntime(page, browserName);
});

test.afterEach(({ page }) => {
  expect(runtimeFailures.get(page) ?? []).toEqual([]);
});

async function openStory(page: Page, story: string, heading: string): Promise<void> {
  await page.goto(`/iframe.html?viewMode=story&id=p4-sliders--${story}`, {
    waitUntil: "domcontentloaded",
  });
  await expect(page.getByRole("heading", { level: 1, name: heading })).toBeVisible();
}

async function axeViolations(page: Page): Promise<unknown[]> {
  await page.addScriptTag({ path: axePath });
  return page.evaluate(async () => {
    const axe = (
      globalThis as unknown as {
        axe: { run(target: Element): Promise<{ violations: unknown[] }> };
      }
    ).axe;
    for (let attempt = 0; attempt < 50; attempt += 1) {
      try {
        return (await axe.run(document.body)).violations;
      } catch (error) {
        if (!(error instanceof Error) || !error.message.includes("already running")) throw error;
        await new Promise((resolveDelay) => setTimeout(resolveDelay, 100));
      }
    }
    throw new Error("Axe remained busy for five seconds.");
  });
}

function slider(page: Page | Locator, name: string): Locator {
  return page.getByRole("slider", { exact: true, name });
}

async function submission(page: Page): Promise<Record<string, string>> {
  await page.getByRole("button", { name: "Preview canonical values" }).click();
  return JSON.parse((await page.getByTestId("submission-result").textContent()) ?? "{}") as Record<
    string,
    string
  >;
}

test("single and every named range thumb submit canonically and reset natively", async ({
  page,
}) => {
  await openStory(page, "recommended-mergora", "Budget allocation workbench");
  const minimum = slider(page, "Minimum approved budget");
  const maximum = slider(page, "Maximum approved budget");
  const confidence = slider(page, "Confidence threshold");

  await expect(minimum).toHaveValue("4000");
  await expect(maximum).toHaveValue("10000");
  await expect(confidence).toHaveValue("0.8");
  await expect(minimum).toHaveAttribute(
    "aria-valuetext",
    new Intl.NumberFormat("en-US", {
      currency: "EUR",
      currencyDisplay: "code",
      maximumFractionDigits: 0,
      style: "currency",
    }).format(4000),
  );
  await expect(confidence).toHaveAttribute("aria-valuetext", "80%");
  await expect(minimum).toHaveAttribute("name", "budget-minimum");
  await expect(maximum).toHaveAttribute("name", "budget-maximum");
  await expect(confidence).toHaveAttribute("name", "confidence-threshold");
  await expect(page.locator('[data-intelligent-marks="meaningful"]')).toHaveCount(2);
  await expect(page.locator('[data-slot="slider-value-bubble"]')).toHaveCount(3);

  const fieldLabel = page
    .locator('[data-slot="field-label"]')
    .filter({ hasText: "Approved budget range" });
  const minimumId = await minimum.getAttribute("id");
  expect(minimumId).not.toBeNull();
  if (minimumId !== null) await expect(fieldLabel).toHaveAttribute("for", minimumId);
  const rangeOutputFor =
    (await minimum.locator("xpath=../../../..//output").getAttribute("for"))?.split(" ") ?? [];
  expect(rangeOutputFor).toContain(minimumId);
  expect(rangeOutputFor).toContain(await maximum.getAttribute("id"));
  expect(await submission(page)).toEqual({
    "confidence-threshold": "0.8",
    "budget-maximum": "10000",
    "budget-minimum": "4000",
  });

  await minimum.focus();
  await minimum.press("ArrowRight");
  await maximum.focus();
  await maximum.press("ArrowLeft");
  await confidence.focus();
  await confidence.press("Home");
  expect(await submission(page)).toEqual({
    "confidence-threshold": "0",
    "budget-maximum": "9750",
    "budget-minimum": "4250",
  });

  await page.getByRole("button", { name: "Restore slider defaults" }).click();
  await expect(minimum).toHaveValue("4000");
  await expect(maximum).toHaveValue("10000");
  await expect(confidence).toHaveValue("0.8");
  expect(await submission(page)).toEqual({
    "confidence-threshold": "0.8",
    "budget-maximum": "10000",
    "budget-minimum": "4000",
  });
  expect(await axeViolations(page)).toEqual([]);
});

test("keyboard boundaries, controlled updates, collision clamping, and thumb identity stay aligned", async ({
  page,
}) => {
  await openStory(page, "keyboard-and-collision", "Keyboard and collision policy");
  const start = slider(page, "Delivery window start");
  const end = slider(page, "Delivery window end");
  const single = slider(page, "Single value");

  await start.focus();
  await start.press("End");
  await expect(start).toHaveValue("60");
  await start.press("ArrowRight");
  await expect(start).toHaveValue("60");
  await expect(end).toHaveValue("60");
  await expect(page.locator('[data-slot="range-slider-collision-status"]')).toHaveText(
    "Range limits meet at 60.",
  );
  await expect(start).toHaveAttribute("aria-label", "Delivery window start");
  await expect(end).toHaveAttribute("aria-label", "Delivery window end");
  await end.focus();
  await end.press("Home");
  await expect(end).toHaveValue("60");

  await single.focus();
  await single.press("ArrowUp");
  await expect(single).toHaveValue("55");
  await single.press("PageUp");
  await expect(single).toHaveValue("65");
  await single.press("Home");
  await expect(single).toHaveValue("0");
  await single.press("End");
  await expect(single).toHaveValue("100");

  const controlledMinimum = slider(page, "Minimum review score");
  await controlledMinimum.focus();
  await controlledMinimum.press("End");
  await expect(page.getByTestId("controlled-output")).toHaveText("60 to 60");
  const controlledThumbBounds = await controlledMinimum.locator("xpath=../..").boundingBox();
  expect(controlledThumbBounds).not.toBeNull();
  if (controlledThumbBounds !== null) {
    const x = controlledThumbBounds.x + controlledThumbBounds.width / 2;
    const y = controlledThumbBounds.y + controlledThumbBounds.height / 2;
    await page.mouse.move(x, y);
    await page.mouse.down();
    await page.mouse.move(x + 80, y, { steps: 4 });
    await page.mouse.up();
    await expect(page.getByTestId("controlled-output")).toHaveText("60 to 60");
  }
});

test("pointer drag shares state and every visible thumb keeps a 44 CSS pixel target", async ({
  page,
}) => {
  await openStory(page, "keyboard-and-collision", "Keyboard and collision policy");
  const input = slider(page, "Single value");
  const thumb = input.locator("xpath=../..");
  const bounds = await thumb.boundingBox();
  expect(bounds).not.toBeNull();
  if (bounds !== null) {
    expect(bounds.width).toBeGreaterThanOrEqual(44);
    expect(bounds.height).toBeGreaterThanOrEqual(44);
    const x = bounds.x + bounds.width / 2;
    const y = bounds.y + bounds.height / 2;
    await page.mouse.move(x, y);
    await page.mouse.down();
    await page.mouse.move(x + 80, y, { steps: 5 });
    await page.mouse.up();
    await expect(input).not.toHaveValue("50");
  }

  await input.focus();
  await input.press("Home");
  const touchTrack = input.locator("xpath=ancestor::*[@data-slot='slider-track']");
  const touchTrackBounds = await touchTrack.boundingBox();
  expect(touchTrackBounds).not.toBeNull();
  if (touchTrackBounds !== null) {
    await touchTrack.tap({
      position: {
        x: touchTrackBounds.width * 0.75,
        y: touchTrackBounds.height / 2,
      },
    });
    expect(Number(await input.inputValue())).toBeGreaterThan(0);
  }

  const undersized = await page.locator('[data-slot="slider-thumb"]').evaluateAll((thumbs) =>
    thumbs
      .map((item) => {
        const box = item.getBoundingClientRect();
        return { height: box.height, width: box.width };
      })
      .filter(({ height, width }) => height < 44 || width < 44),
  );
  expect(undersized).toEqual([]);
});

test("read-only stays focusable and successful while disabled and invalid remain distinct", async ({
  page,
}) => {
  await openStory(page, "state-matrix", "Production state rail");
  const disabled = slider(page, "Disabled capacity");
  const readOnly = slider(page, "Read-only baseline");
  const invalidMinimum = slider(page, "Invalid window minimum");
  const invalidMaximum = slider(page, "Invalid window maximum");

  await expect(disabled).toBeDisabled();
  await expect(disabled).toHaveAttribute("name", "disabled-capacity");
  await expect(readOnly).toBeEnabled();
  await expect(readOnly).toHaveAttribute("aria-readonly", "true");
  await expect(readOnly).toHaveAttribute("name", "readonly-baseline");
  await readOnly.focus();
  await expect(readOnly).toBeFocused();
  await readOnly.press("ArrowRight");
  await expect(readOnly).toHaveValue("72");
  await expect(invalidMinimum).toHaveAttribute("aria-invalid", "true");
  await expect(invalidMaximum).toHaveAttribute("aria-invalid", "true");
  const formValues = await page
    .getByRole("form", { name: "Slider state samples" })
    .evaluate((form) =>
      Object.fromEntries(
        [...new FormData(form as HTMLFormElement).entries()].map(([name, value]) => [
          name,
          String(value),
        ]),
      ),
    );
  expect(formValues).toEqual({
    "invalid-maximum": "55",
    "invalid-minimum": "45",
    "readonly-baseline": "72",
  });
  await expect(readOnly).toHaveAccessibleDescription(/Read-only: value cannot be changed\./u);
  expect(await axeViolations(page)).toEqual([]);
});

test("vertical and RTL keyboard semantics, localized value text, and forced colors stay operable", async ({
  page,
}) => {
  await page.emulateMedia({ forcedColors: "active", reducedMotion: "reduce" });
  await openStory(page, "direction-and-orientation", "Direction and orientation workbench");
  const rtlMinimum = slider(page, "الحد الأدنى للميزانية");
  const vertical = slider(page, "Storage temperature");

  await expect(rtlMinimum).toHaveAttribute("aria-orientation", "horizontal");
  await expect(rtlMinimum).toHaveValue("2500");
  const rtlThumbBounds = await rtlMinimum.locator("xpath=../..").boundingBox();
  expect(rtlThumbBounds).not.toBeNull();
  if (rtlThumbBounds !== null) {
    const x = rtlThumbBounds.x + rtlThumbBounds.width / 2;
    const y = rtlThumbBounds.y + rtlThumbBounds.height / 2;
    await page.mouse.move(x, y);
    await page.mouse.down();
    await page.mouse.move(x + 40, y, { steps: 4 });
    await page.mouse.up();
    expect(Number(await rtlMinimum.inputValue())).toBeLessThan(2500);
  }
  await rtlMinimum.focus();
  await rtlMinimum.press("Home");
  await expect(rtlMinimum).toHaveValue("1000");
  await rtlMinimum.press("ArrowLeft");
  await expect(rtlMinimum).toHaveValue("1250");
  await rtlMinimum.press("ArrowRight");
  await expect(rtlMinimum).toHaveValue("1000");

  await expect(vertical).toHaveAttribute("aria-orientation", "vertical");
  await expect(vertical).toHaveAttribute(
    "aria-valuetext",
    new Intl.NumberFormat("en-US", { style: "unit", unit: "celsius" }).format(4),
  );
  const verticalThumbBounds = await vertical.locator("xpath=../..").boundingBox();
  expect(verticalThumbBounds).not.toBeNull();
  if (verticalThumbBounds !== null) {
    const x = verticalThumbBounds.x + verticalThumbBounds.width / 2;
    const y = verticalThumbBounds.y + verticalThumbBounds.height / 2;
    await page.mouse.move(x, y);
    await page.mouse.down();
    await page.mouse.move(x, y - 40, { steps: 4 });
    await page.mouse.up();
    expect(Number(await vertical.inputValue())).toBeGreaterThan(4);
  }
  await vertical.focus();
  await vertical.press("Home");
  await expect(vertical).toHaveValue("0");
  await vertical.press("ArrowUp");
  await expect(vertical).toHaveValue("1");
  await vertical.press("PageDown");
  await expect(vertical).toHaveValue("0");
  await vertical.press("End");
  await expect(vertical).toHaveValue("10");
  expect(await axeViolations(page)).toEqual([]);
});

test("narrow mobile geometry has no document overflow and preserves endpoint context", async ({
  page,
}) => {
  await page.setViewportSize({ height: 720, width: 320 });
  await openStory(page, "narrow-and-touch", "Narrow touch specimen");
  await expect(slider(page, "Mobile range minimum")).toHaveValue("25");
  await expect(slider(page, "Mobile range maximum")).toHaveValue("75");
  await expect(page.locator('[data-slot="slider-thumb"]')).toHaveCount(2);
  await expect(page.locator('[data-slot="slider-mark"][data-edge="minimum"]')).toBeVisible();
  await expect(page.locator('[data-slot="slider-mark"][data-edge="maximum"]')).toBeVisible();
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - innerWidth);
  expect(overflow).toBeLessThanOrEqual(0);
  expect(await axeViolations(page)).toEqual([]);
});

test("plain mode removes every optional slider surface and accessibility event source", async ({
  page,
}) => {
  await openStory(page, "plain-baseline", "Budget allocation workbench");
  await expect(page.locator("[data-intelligent-marks]")).toHaveCount(0);
  await expect(page.locator('[data-slot="slider-value-bubble"]')).toHaveCount(0);
  await expect(page.locator('[data-slot="range-slider-collision-status"]')).toHaveCount(0);
  await expect(page.locator('[data-slot="slider-mark"]')).toHaveCount(6);
  expect(await axeViolations(page)).toEqual([]);
});

test("enhanced preference specimen stays bounded in forced colors and reduced motion", async ({
  page,
}) => {
  await page.emulateMedia({ forcedColors: "active", reducedMotion: "reduce" });
  await page.setViewportSize({ height: 720, width: 320 });
  await openStory(page, "preference-modes", "System preference specimen");
  await expect(page.locator('[data-slot="slider-mark"]')).toHaveCount(5);
  await expect(page.locator('[data-slot="slider-value-bubble"]')).toHaveCount(2);
  const radius = await page
    .locator('[data-slot="slider-thumb"]')
    .first()
    .evaluate((thumb) => Number.parseFloat(getComputedStyle(thumb, "::before").borderRadius));
  expect(radius).toBeLessThanOrEqual(16);
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - innerWidth);
  expect(overflow).toBeLessThanOrEqual(0);
  expect(await axeViolations(page)).toEqual([]);
});
