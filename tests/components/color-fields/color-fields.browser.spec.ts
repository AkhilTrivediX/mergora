import { resolve } from "node:path";
import { expect, test, type Locator, type Page } from "@playwright/test";

const axePath = resolve(
  import.meta.dirname,
  "../../../packages/test-utils/node_modules/axe-core/axe.min.js",
);
const runtimeFailures = new WeakMap<Page, string[]>();

test.use({
  hasTouch: true,
  permissions: ["clipboard-read", "clipboard-write"],
});

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

async function openStory(page: Page, story: string, heading: string): Promise<void> {
  await page.goto(`/iframe.html?viewMode=story&id=p4-color-fields--${story}`, {
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
    return (await axe.run(document.body)).violations;
  });
}

function colorText(page: Page, label: string): Locator {
  return page.getByRole("textbox", { exact: true, name: label });
}

test("production workbench exposes named alternatives, 44px targets, canonical form data, and reset", async ({
  page,
}) => {
  await openStory(page, "production-workbench", "Brand color workbench");
  const editor = colorText(page, "Primary brand color");
  await expect(editor).toHaveValue("#2f7a57cc");
  await expect(editor).toHaveAttribute("required", "");

  await expect(page.getByRole("slider", { name: "Saturation and brightness" })).toBeVisible();
  for (const label of ["Hue", "Saturation", "Brightness", "Opacity"]) {
    await expect(page.getByRole("slider", { exact: true, name: label })).toBeVisible();
  }
  await expect(page.getByRole("option", { name: /^Color swatch 1:/u })).toBeVisible();

  const undersized = await page
    .locator(
      '[data-slot="color-field-input"], [data-slot="color-picker-slider-track"], [data-slot="color-picker-swatch-item"]',
    )
    .evaluateAll((controls) =>
      controls
        .map((control) => {
          const bounds = control.getBoundingClientRect();
          return {
            height: bounds.height,
            slot: control.getAttribute("data-slot"),
            width: bounds.width,
          };
        })
        .filter(({ height, width }) => height < 44 || width < 44),
    );
  expect(undersized).toEqual([]);

  await page.getByRole("button", { name: "Preview canonical value" }).click();
  expect(JSON.parse((await page.getByTestId("color-submission").textContent()) ?? "{}")).toEqual({
    "brand-color": "#2f7a57cc",
  });

  await editor.fill("rgba(10, 20, 30, 0.5)");
  await editor.press("Enter");
  await expect(editor).toHaveValue("#0a141e80");
  await page.getByRole("button", { name: "Preview canonical value" }).click();
  expect(JSON.parse((await page.getByTestId("color-submission").textContent()) ?? "{}")).toEqual({
    "brand-color": "#0a141e80",
  });

  await page.evaluate(() => {
    const form = document.querySelector('form[aria-label="Brand color settings"]');
    form?.addEventListener("reset", (event) => event.preventDefault(), { once: true });
  });
  await page.getByRole("button", { name: "Restore color default" }).click();
  await page.waitForTimeout(25);
  await expect(editor).toHaveValue("#0a141e80");

  await page.getByRole("button", { name: "Restore color default" }).click();
  await expect(editor).toHaveValue("#2f7a57cc");
  expect(await axeViolations(page)).toEqual([]);
});

test("invalid, incomplete, IME, paste, and editor-key paths preserve the last valid color", async ({
  context,
  page,
}) => {
  await openStory(page, "validation-and-recovery", "Invalid and incomplete text recovery");
  const editor = colorText(page, "Text color");
  const hidden = page.locator('input[type="hidden"][name="text-color"]');
  await expect(editor).toHaveValue("#533a7e");
  await expect(hidden).toHaveValue("#533a7e");

  await editor.fill("#abcd");
  await editor.press("Enter");
  await expect(editor).toHaveAttribute("aria-invalid", "true");
  await expect(page.getByText("This field accepts opaque colors only.")).toBeVisible();
  await expect(hidden).toHaveValue("#533a7e");
  await editor.press("Escape");
  await expect(editor).toHaveValue("#533a7e");
  await expect(editor).not.toHaveAttribute("aria-invalid", "true");

  await editor.dispatchEvent("compositionstart");
  await editor.fill("rgb(10, 20, 30)");
  await editor.press("Enter");
  await expect(hidden).toHaveValue("#533a7e");
  await editor.dispatchEvent("compositionend");
  await editor.press("Enter");
  await expect(editor).toHaveValue("#0a141e");
  await expect(hidden).toHaveValue("#0a141e");

  await context.grantPermissions(["clipboard-read", "clipboard-write"], {
    origin: "http://127.0.0.1:8147",
  });
  await page.evaluate(() => navigator.clipboard.writeText("hsl(210, 50%, 40%)"));
  await editor.focus();
  await editor.press("Control+A");
  await editor.press("Control+V");
  await editor.press("Enter");
  await expect(editor).toHaveValue("#336699");
  await expect(hidden).toHaveValue("#336699");
  expect(await axeViolations(page)).toEqual([]);
});

test("named channel sliders, swatches, mouse, and touch update the same picker value", async ({
  page,
}) => {
  await openStory(page, "keyboard-and-pointer-parity", "Keyboard, pointer, and touch parity");
  const editor = colorText(page, "Interface accent");
  const initial = await editor.inputValue();

  const opacity = page.getByRole("slider", { exact: true, name: "Opacity" });
  await opacity.press("Home");
  await expect(editor).toHaveValue(/00$/u);
  await opacity.press("End");
  await expect(editor).toHaveValue(/ff$/u);

  const hue = page.getByRole("slider", { exact: true, name: "Hue" });
  const beforeHue = await editor.inputValue();
  await hue.press("ArrowRight");
  await expect(editor).not.toHaveValue(beforeHue);

  const swatch = page.getByRole("option", { name: /^Color swatch 2:/u });
  await swatch.click();
  await expect(swatch).toHaveAttribute("data-selected", "true");
  await expect(editor).toHaveValue("#315b96ff");

  const area = page.locator('[data-slot="color-picker-area"]');
  const bounds = await area.boundingBox();
  expect(bounds).not.toBeNull();
  if (bounds !== null) {
    await page.mouse.click(bounds.x + bounds.width * 0.8, bounds.y + bounds.height * 0.25);
    const afterMouse = await editor.inputValue();
    expect(afterMouse).not.toBe(initial);
    await page.touchscreen.tap(bounds.x + bounds.width * 0.2, bounds.y + bounds.height * 0.75);
    await expect(editor).not.toHaveValue(afterMouse);
  }
});

test("a controlled owner receives requests without visual drift until it accepts one", async ({
  page,
}) => {
  await openStory(page, "controlled-ownership", "Controlled color ownership");
  const editor = colorText(page, "Parent-owned color");
  const committed = page.getByTestId("committed-color");
  const requested = page.getByTestId("requested-color");
  await expect(editor).toHaveValue("#533a7eff");
  await expect(committed).toContainText("#533a7eff");
  await expect(requested).toContainText("none");

  await page.getByRole("slider", { exact: true, name: "Hue" }).press("ArrowRight");
  await expect(editor).toHaveValue("#533a7eff");
  await expect(committed).toContainText("#533a7eff");
  await expect(requested).not.toContainText("none");

  const requestedValue = ((await requested.textContent()) ?? "").match(/#[\da-f]{8}/u)?.[0];
  expect(requestedValue).toBeDefined();
  await page.getByRole("button", { name: "Apply requested color" }).click();
  if (requestedValue !== undefined) await expect(editor).toHaveValue(requestedValue);
  await expect(requested).toContainText("none");
});

test("delayed controlled text commits preserve the normalized draft and dedupe repeated Enter", async ({
  page,
}) => {
  await openStory(page, "delayed-controlled-text", "Delayed controlled text commit");
  const editor = colorText(page, "Reviewed color");
  const field = page.locator('[data-slot="color-field"]');
  const hidden = page.locator('input[type="hidden"][name="reviewed-color"]');
  await expect(editor).toHaveValue("#533a7e");
  await expect(hidden).toHaveValue("#533a7e");

  await editor.fill("rgb(10, 20, 30)");
  await editor.press("Enter");
  await expect(editor).toHaveValue("#0a141e");
  await expect(field).toHaveAttribute("data-pending", "true");
  await expect(hidden).toHaveValue("#533a7e");
  await expect(page.getByTestId("requested-text-color")).toContainText("#0a141e");
  await expect(page.getByTestId("text-request-count")).toContainText("Requests: 1");

  await editor.press("Enter");
  await expect(page.getByTestId("text-request-count")).toContainText("Requests: 1");
  await expect(editor).toHaveValue("#0a141e");
  await page.getByRole("button", { name: "Accept text request" }).click();
  await expect(field).not.toHaveAttribute("data-pending", "true");
  await expect(editor).toHaveValue("#0a141e");
  await expect(hidden).toHaveValue("#0a141e");
});

test("disabled/read-only states, RTL, forced colors, reduced motion, and 320px reflow remain operable", async ({
  page,
}) => {
  await openStory(page, "adverse-state-matrix", "Adverse state matrix");
  await expect(colorText(page, "Unavailable color")).toBeDisabled();
  await expect(colorText(page, "Audited color")).toHaveAttribute("readonly", "");
  const disabledPicker = page
    .getByRole("group", { name: "Color picker controls" })
    .filter({ has: colorText(page, "Unavailable color") });
  await expect(disabledPicker.getByRole("slider", { name: "Hue" })).toBeDisabled();

  await page.setViewportSize({ height: 568, width: 320 });
  await page.emulateMedia({ forcedColors: "active", reducedMotion: "reduce" });
  await openStory(page, "right-to-left-and-narrow", "اختيار اللون من اليمين إلى اليسار");
  const provider = page.locator('[data-slot="provider"]');
  await expect(provider).toHaveAttribute("dir", "rtl");
  await expect(provider).toHaveAttribute("lang", "ar-EG");
  for (const label of ["درجة اللون", "التشبع", "السطوع", "العتامة"]) {
    await expect(page.getByRole("slider", { exact: true, name: label })).toBeVisible();
  }
  const area = page.locator('[data-slot="color-picker-area"]');
  await expect(area).toHaveCSS("forced-color-adjust", "auto");
  const overflow = await page.evaluate(() => ({
    body: document.body.scrollWidth - document.body.clientWidth,
    document: document.documentElement.scrollWidth - document.documentElement.clientWidth,
  }));
  expect(overflow.body).toBeLessThanOrEqual(0);
  expect(overflow.document).toBeLessThanOrEqual(0);
  expect(await axeViolations(page)).toEqual([]);
});
