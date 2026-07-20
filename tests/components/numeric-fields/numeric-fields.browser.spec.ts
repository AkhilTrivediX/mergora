import { resolve } from "node:path";
import { expect, test, type ConsoleMessage, type Locator, type Page } from "@playwright/test";

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

async function openStory(page: Page, story: string, heading: string): Promise<void> {
  await page.goto(`/iframe.html?viewMode=story&id=p4-numeric-fields--${story}`, {
    waitUntil: "domcontentloaded",
  });
  await expect(page.getByRole("heading", { level: 1, name: heading })).toBeVisible();
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

function visibleNumericInput(scope: Page | Locator, label: string): Locator {
  return scope.getByRole("textbox", { name: label, exact: true });
}

test("workbench associates visible labels, preserves target size, and submits canonical values", async ({
  page,
}) => {
  await openStory(page, "recommended-mergora", "Project budget model");

  const projectBudget = visibleNumericInput(page, "Monthly operating budget");
  const contingency = visibleNumericInput(page, "Contingency target");
  const score = visibleNumericInput(page, "Review score");
  await expect(projectBudget).toHaveAttribute("required", "");
  await expect(projectBudget).toHaveAttribute("inputmode", "numeric");
  await expect(projectBudget).toHaveValue(/EUR.*8,000\.00/u);
  await expect(contingency).toHaveValue("15%");
  await expect(score).toHaveValue("8.5");
  await expect(page.locator('[data-slot="number-field-status"]')).toHaveCount(3);
  await expect(page.locator('[data-slot="number-field-canonical-preview"]')).toHaveCount(3);
  await expect(
    page
      .locator('[data-slot="currency-field"] [data-slot="number-field-canonical-preview"] data')
      .first(),
  ).toHaveText("8000");
  await expect(
    page
      .locator('[data-slot="percentage-field"] [data-slot="number-field-canonical-preview"] data')
      .first(),
  ).toHaveText("0.15");

  await page.getByRole("button", { name: "Preview canonical values" }).click();
  expect(JSON.parse((await page.getByTestId("submission-result").textContent()) ?? "{}")).toEqual({
    "contingency-target": "0.15",
    "monthly-budget": "8000",
    "review-score": "8.5",
  });

  const undersized = await page
    .locator('[data-slot="number-field-decrement"], [data-slot="number-field-increment"]')
    .evaluateAll((controls) =>
      controls
        .map((control) => {
          const bounds = control.getBoundingClientRect();
          return { height: bounds.height, width: bounds.width };
        })
        .filter(({ height, width }) => height < 40 || width < 24),
    );
  expect(undersized).toEqual([]);
  expect(await axeViolations(page)).toEqual([]);
});

test("numeric controls expose preferred targets and tap behavior for coarse pointers", async ({
  browser,
}) => {
  const context = await browser.newContext({
    hasTouch: true,
    isMobile: true,
    viewport: { height: 800, width: 390 },
  });
  const page = await context.newPage();
  const failures = guardRuntime(page);
  await openStory(page, "recommended-mergora", "Project budget model");
  expect(await page.evaluate(() => matchMedia("(pointer: coarse)").matches)).toBe(true);

  const controls = page.locator(
    '[data-slot="number-field-decrement"], [data-slot="number-field-increment"], [data-slot="number-field-scrub"]',
  );
  const sizes = await controls.evaluateAll((elements) =>
    elements.map((element) => {
      const { height, width } = element.getBoundingClientRect();
      return { height, width };
    }),
  );
  expect(sizes.length).toBeGreaterThan(0);
  expect(sizes.every(({ height, width }) => height >= 44 && width >= 44)).toBe(true);

  const score = visibleNumericInput(page, "Review score");
  await expect(score).toHaveValue("8.5");
  await page
    .locator('[data-slot="number-field"]')
    .filter({ has: score })
    .locator('[data-slot="number-field-increment"]')
    .tap();
  await expect(score).toHaveValue("8.6");
  await expect(
    page
      .locator('[data-slot="number-field"]')
      .filter({ has: score })
      .locator('[data-slot="number-field-canonical-preview"] data'),
  ).toHaveText("8.6");
  expect(await axeViolations(page)).toEqual([]);
  expect(failures).toEqual([]);
  await context.close();
});

test("locale matrix formats grouping, currency, percentages, and partial decimal entry", async ({
  page,
}) => {
  await openStory(page, "locale-matrix", "Locale-aware value matrix");
  const examples = [
    { currency: "USD", locale: "en-US", title: "English" },
    { currency: "EUR", locale: "de-DE", title: "Deutsch" },
    { currency: "INR", locale: "hi-IN", title: "हिन्दी" },
    { currency: "EGP", locale: "ar-EG", title: "العربية" },
  ] as const;

  for (const example of examples) {
    const section = page.getByRole("region", { name: example.title });
    await expect(visibleNumericInput(section, "Localized number")).toHaveValue(
      new Intl.NumberFormat(example.locale, { maximumFractionDigits: 2 }).format(1234567.89),
    );
    await expect(visibleNumericInput(section, "Localized amount")).toHaveValue(
      new Intl.NumberFormat(example.locale, {
        currency: example.currency,
        currencyDisplay: "code",
        maximumFractionDigits: new Intl.NumberFormat(example.locale, {
          currency: example.currency,
          style: "currency",
        }).resolvedOptions().maximumFractionDigits,
        minimumFractionDigits: new Intl.NumberFormat(example.locale, {
          currency: example.currency,
          style: "currency",
        }).resolvedOptions().maximumFractionDigits,
        style: "currency",
      }).format(9876.5),
    );
    await expect(visibleNumericInput(section, "Localized percentage")).toHaveValue(
      new Intl.NumberFormat(example.locale, {
        maximumFractionDigits: 2,
        minimumFractionDigits: 0,
        style: "percent",
      }).format(0.125),
    );
  }

  const germanNumber = visibleNumericInput(
    page.getByRole("region", { name: "Deutsch" }),
    "Localized number",
  );
  await germanNumber.fill("1,5");
  await expect(germanNumber).toHaveValue("1,5");
  await germanNumber.blur();
  await expect(germanNumber).toHaveValue("1,5");
});

test("keyboard, scrub, bounds, pointer drag, and wheel safeguard share one state", async ({
  page,
}) => {
  await openStory(page, "scrub-and-keyboard", "Scrub, stepper, and keyboard parity");
  const confidence = visibleNumericInput(page, "Confidence score");
  const scrub = page.getByRole("button", { name: "Scrub value" });

  await confidence.focus();
  await confidence.press("ArrowUp");
  await expect(confidence).toHaveValue("50.5");
  await scrub.press("ArrowRight");
  await expect(confidence).toHaveValue("51");
  await scrub.press("PageUp");
  await expect(confidence).toHaveValue("56");
  await scrub.press("Home");
  await expect(confidence).toHaveValue("0");
  await scrub.press("End");
  await expect(confidence).toHaveValue("100");

  await confidence.fill("50");
  await confidence.blur();
  const scrubBounds = await scrub.boundingBox();
  expect(scrubBounds).not.toBeNull();
  if (scrubBounds !== null) {
    const x = scrubBounds.x + scrubBounds.width / 2;
    const y = scrubBounds.y + scrubBounds.height / 2;
    await page.mouse.move(x, y);
    await page.mouse.down();
    await page.mouse.move(x + 16, y);
    await page.mouse.up();
    await expect(confidence).toHaveValue("51");
  }

  const budget = visibleNumericInput(page, "Monthly budget");
  const beforeWheel = await budget.inputValue();
  await budget.focus();
  await budget.dispatchEvent("wheel", { deltaY: -100 });
  await expect(budget).toHaveValue(beforeWheel);
});

test("localized edits serialize canonically and native reset restores every numeric default", async ({
  page,
}) => {
  await openStory(page, "form-serialization-and-reset", "Project budget model");
  const projectBudget = visibleNumericInput(page, "Monthly operating budget");
  const contingency = visibleNumericInput(page, "Contingency target");
  const score = visibleNumericInput(page, "Review score");

  await projectBudget.fill("7000");
  await projectBudget.blur();
  await contingency.fill("25%");
  await contingency.blur();
  await score.fill("9.5");
  await score.blur();
  await expect(
    page
      .locator('[data-slot="currency-field"] [data-slot="number-field-canonical-preview"] data')
      .first(),
  ).toHaveText("7000");
  await expect(
    page
      .locator('[data-slot="percentage-field"] [data-slot="number-field-canonical-preview"] data')
      .first(),
  ).toHaveText("0.25");
  await page.getByRole("button", { name: "Preview canonical values" }).click();
  expect(JSON.parse((await page.getByTestId("submission-result").textContent()) ?? "{}")).toEqual({
    "contingency-target": "0.25",
    "monthly-budget": "7000",
    "review-score": "9.5",
  });

  await page.getByRole("button", { name: "Restore numeric defaults" }).click();
  await expect(projectBudget).toHaveValue(/EUR.*8,000\.00/u);
  await expect(contingency).toHaveValue("15%");
  await expect(score).toHaveValue("8.5");
  await page.getByRole("button", { name: "Preview canonical values" }).click();
  expect(JSON.parse((await page.getByTestId("submission-result").textContent()) ?? "{}")).toEqual({
    "contingency-target": "0.15",
    "monthly-budget": "8000",
    "review-score": "8.5",
  });
});

test("RTL and forced-colors presentations retain localized values and operable controls", async ({
  browserName,
  page,
}) => {
  await page.emulateMedia({ forcedColors: "active" });
  await openStory(page, "right-to-left", "قيم رقمية من اليمين إلى اليسار");
  const provider = page.locator('[data-slot="provider"]');
  await expect(provider).toHaveAttribute("dir", "rtl");
  await expect(provider).toHaveAttribute("lang", "ar-EG");
  await expect(visibleNumericInput(page, "الميزانية الشهرية")).toHaveCSS("direction", "rtl");
  await expect(visibleNumericInput(page, "نسبة التخصيص")).toHaveValue(
    new Intl.NumberFormat("ar-EG", {
      maximumFractionDigits: 2,
      minimumFractionDigits: 0,
      style: "percent",
    }).format(0.275),
  );
  await expect(page.locator('[data-slot="number-field-increment"]').first()).toBeEnabled();
  expect(await axeViolations(page, { ignoreColorContrast: browserName !== "chromium" })).toEqual(
    [],
  );
});

test("plain mode omits scrub, status, and canonical preview output", async ({ page }) => {
  await openStory(page, "plain-baseline", "Project budget model");
  await expect(page.locator('[data-slot="number-field-scrub"]')).toHaveCount(0);
  await expect(page.locator('[data-slot="number-field-insights"]')).toHaveCount(0);
  await expect(page.locator('[data-slot="number-field-status"]')).toHaveCount(0);
  await expect(page.locator('[data-slot="number-field-canonical-preview"]')).toHaveCount(0);
  expect(await axeViolations(page)).toEqual([]);
});

test("controlled canonical preview follows consumer state while uncontrolled input remains separate", async ({
  page,
}) => {
  await openStory(page, "controlled-and-uncontrolled", "Controlled and uncontrolled values");
  const controlled = visibleNumericInput(page, "Controlled quantity");
  await controlled.fill("36");
  await controlled.blur();
  await expect(page.getByRole("status")).toHaveText("Controlled value: 36");
  await expect(
    page
      .locator('[data-slot="number-field"] [data-slot="number-field-canonical-preview"] data')
      .first(),
  ).toHaveText("36");
  await expect(visibleNumericInput(page, "Uncontrolled quantity")).toHaveValue("12");
});

test("narrow forced-color insight rails reflow without clipping or oversized radii", async ({
  browserName,
  page,
}) => {
  await page.emulateMedia({ forcedColors: "active", reducedMotion: "reduce" });
  await page.setViewportSize({ height: 720, width: 320 });
  await openStory(page, "narrow-and-preferences", "Narrow preference specimen");
  await expect(page.locator('[data-slot="number-field-status"]')).toBeVisible();
  await expect(page.locator('[data-slot="number-field-canonical-preview"]')).toContainText("0.625");
  const radius = await page
    .locator('[data-slot="number-field-group"]')
    .evaluate((group) => Number.parseFloat(getComputedStyle(group).borderRadius));
  expect(radius).toBeLessThanOrEqual(16);
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - innerWidth);
  expect(overflow).toBeLessThanOrEqual(0);
  expect(await axeViolations(page, { ignoreColorContrast: browserName !== "chromium" })).toEqual(
    [],
  );
});
