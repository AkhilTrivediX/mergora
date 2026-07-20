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

async function openStory(page: Page, story: string, heading: string): Promise<void> {
  await page.goto(`/iframe.html?viewMode=story&id=p4-phone-and-masked-fields--${story}`, {
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
    for (let attempt = 0; attempt < 20; attempt += 1) {
      try {
        return (await axe.run(document.body)).violations;
      } catch (error) {
        if (!(error instanceof Error) || !error.message.includes("Axe is already running")) {
          throw error;
        }
        await new Promise((resolveDelay) => setTimeout(resolveDelay, 100));
      }
    }
    throw new Error("Timed out waiting for the Storybook axe scan to finish.");
  });
}

test("basic and recommended phone and mask modes keep serialization and extension independent", async ({
  page,
}) => {
  await openStory(page, "basic-defaults", "Canonical contact and identifier entry");
  await expect(page.locator('[data-slot="phone-field-canonical-input"]')).toHaveCount(0);
  await expect(page.locator('[data-slot="phone-field-extension"]')).toHaveCount(0);
  await expect(page.locator('[data-slot="masked-field-serialized-input"]')).toHaveCount(0);
  await page.getByRole("button", { name: "Inspect native values" }).click();
  await expect(page.getByTestId("enhancement-form-values")).toHaveText("{}");

  await openStory(page, "recommended-mergora", "Canonical contact and identifier entry");
  await expect(page.locator('[data-slot="phone-field-canonical-input"]')).toHaveValue(
    "+14155552671",
  );
  await expect(page.getByLabel("Extension")).toHaveValue("204");
  await expect(page.locator('[data-slot="masked-field-serialized-input"]')).toHaveValue("AB2048QZ");
  const phone = page.getByRole("textbox", { name: "Support phone" });
  await phone.focus();
  const focusVisual = await phone.locator("..").evaluate((node) => {
    const style = getComputedStyle(node);
    return { boxShadow: style.boxShadow, outlineStyle: style.outlineStyle };
  });
  expect(focusVisual.outlineStyle).not.toBe("none");
  expect(focusVisual.boxShadow).not.toBe("none");

  await page.getByRole("button", { name: "Inspect native values" }).click();
  await expect(page.getByTestId("enhancement-form-values")).toContainText(
    '"support-phone":"+14155552671"',
  );
  await expect(page.getByTestId("enhancement-form-values")).toContainText(
    '"support-extension":"204"',
  );
  await expect(page.getByTestId("enhancement-form-values")).toContainText(
    '"inventory-code":"AB2048QZ"',
  );

  await page.setViewportSize({ height: 720, width: 320 });
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow).toBeLessThanOrEqual(1);
  expect(await axeViolations(page)).toEqual([]);
});

test("phone formatting exposes exact E.164 and extension values without canceling paste", async ({
  page,
}) => {
  await openStory(page, "phone-workbench", "International phone values without invented metadata");
  const phone = page.getByRole("textbox", { name: "Telephone number", exact: true });
  const extension = page.getByLabel("Extension", { exact: true });
  const output = page.getByTestId("phone-value");

  await expect(phone).toHaveAttribute("type", "tel");
  await expect(phone).toHaveAttribute("autocomplete", "tel");
  await expect(phone).toHaveAccessibleDescription(/United States\s+\+1/u);
  expect(
    await phone.evaluate((element) => {
      const event = new Event("paste", { bubbles: true, cancelable: true });
      element.dispatchEvent(event);
      return event.defaultPrevented;
    }),
  ).toBe(false);

  await phone.pressSequentially("4155552671");
  await expect(phone).toHaveValue("415 555 2671");
  await expect(output).toContainText('"e164":"+14155552671"');
  await expect(output).toContainText('"status":"valid"');
  expect(await phone.evaluate((element) => (element as HTMLInputElement).selectionStart)).toBe(12);

  await extension.fill("2x4");
  await expect(extension).toHaveValue("2x4");
  expect(await extension.evaluate((element) => (element as HTMLInputElement).checkValidity())).toBe(
    false,
  );
  await extension.fill("204");
  await expect(output).toContainText('"extension":"204"');
  expect(await axeViolations(page)).toEqual([]);
});

test("mask composition defers formatting and commits once while paste remains native", async ({
  page,
}) => {
  await openStory(page, "masked-workbench", "Raw and formatted values stay inspectable");
  const input = page.getByRole("textbox", { name: "Inventory code", exact: true });
  const output = page.getByTestId("mask-value");
  const terminalCount = page.getByTestId("mask-terminal-count");

  await input.dispatchEvent("compositionstart", { data: "ab2" });
  await input.evaluate((element) => {
    const valueSetter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
    valueSetter?.call(element, "ab2");
    element.dispatchEvent(
      new InputEvent("input", {
        bubbles: true,
        data: "ab2",
        inputType: "insertCompositionText",
        isComposing: true,
      }),
    );
  });
  await expect(input).toHaveValue("ab2");
  await expect(output).toContainText('"status":"composing"');
  await expect(terminalCount).toHaveText("Terminal adapter commits: 0");

  await input.dispatchEvent("compositionend", { data: "ab2" });
  await expect(input).toHaveValue("AB-2");
  await expect(output).toContainText('"raw":"AB2"');
  await expect(terminalCount).toHaveText("Terminal adapter commits: 1");

  await openStory(page, "masked-workbench", "Raw and formatted values stay inspectable");
  const freshInput = page.getByRole("textbox", { name: "Inventory code", exact: true });
  expect(
    await freshInput.evaluate((element) => {
      const event = new Event("paste", { bubbles: true, cancelable: true });
      element.dispatchEvent(event);
      return event.defaultPrevented;
    }),
  ).toBe(false);
  await freshInput.fill("AB2048QZ");
  await expect(freshInput).toHaveValue("AB-2048-QZ");
  await expect(page.getByTestId("mask-value")).toContainText('"serialized":"AB2048QZ"');
  await expect(page.getByTestId("mask-terminal-count")).toHaveText("Terminal adapter commits: 1");
  expect(await axeViolations(page)).toEqual([]);
});

test("FormData distinguishes canonical, extension, raw, formatted, read-only, and disabled values across reset", async ({
  page,
}) => {
  await openStory(
    page,
    "form-serialization-and-reset",
    "Canonical, raw, and formatted form serialization",
  );
  const phone = page.getByLabel("Primary phone", { exact: true });
  const extension = page.getByLabel("Extension", { exact: true });
  const rawCode = page.getByLabel("Raw inventory code", { exact: true });
  const formattedCode = page.getByLabel("Formatted inventory code", { exact: true });
  const readOnlyPhone = page.getByLabel("Read-only phone", { exact: true });
  const disabledPhone = page.getByLabel("Disabled phone", { exact: true });
  const output = page.getByTestId("form-values");

  await expect(readOnlyPhone).toHaveAttribute("readonly", "");
  await expect(disabledPhone).toBeDisabled();
  await page.getByRole("button", { name: "Inspect form values" }).click();
  expect(JSON.parse((await output.textContent()) ?? "{}")).toEqual({
    disabledExtensionPresent: false,
    disabledPhonePresent: false,
    extension: "204",
    formattedCode: "CD-4096-RX",
    phone: "+919876543210",
    rawCode: "AB2048QZ",
    readOnlyExtension: "88",
    readOnlyPhone: "+12125550188",
  });

  await phone.fill("9123456780");
  await extension.fill("777");
  await rawCode.fill("EF1111GH");
  await formattedCode.fill("IJ2222KL");
  await page.getByRole("button", { name: "Inspect form values" }).click();
  expect(JSON.parse((await output.textContent()) ?? "{}")).toEqual({
    disabledExtensionPresent: false,
    disabledPhonePresent: false,
    extension: "777",
    formattedCode: "IJ-2222-KL",
    phone: "+919123456780",
    rawCode: "EF1111GH",
    readOnlyExtension: "88",
    readOnlyPhone: "+12125550188",
  });

  await page.getByRole("button", { name: "Restore defaults" }).click();
  await expect(phone).toHaveValue("987 654 3210");
  await expect(extension).toHaveValue("204");
  await expect(rawCode).toHaveValue("AB-2048-QZ");
  await expect(formattedCode).toHaveValue("CD-4096-RX");
  await page.getByRole("button", { name: "Inspect form values" }).click();
  expect(JSON.parse((await output.textContent()) ?? "{}")).toMatchObject({
    extension: "204",
    formattedCode: "CD-4096-RX",
    phone: "+919876543210",
    rawCode: "AB2048QZ",
  });
  expect(await axeViolations(page)).toEqual([]);
});

test("delayed controlled ownership applies the adapter caret only with its matching render", async ({
  page,
}) => {
  await openStory(
    page,
    "delayed-controlled-caret",
    "Caret mapping survives delayed controlled ownership",
  );
  const input = page.getByLabel("Delayed inventory code", { exact: true });
  await input.focus();
  await input.evaluate((element) => (element as HTMLInputElement).setSelectionRange(3, 4, "none"));
  await input.press("3");
  await expect(page.getByTestId("delayed-mask-state")).toHaveText("Parent update pending");
  await expect(input).toHaveValue("AB-3048-QZ");
  await expect(page.getByTestId("delayed-mask-state")).toHaveText("Rendered: AB-3048-QZ");
  expect(
    await input.evaluate((element) => ({
      end: (element as HTMLInputElement).selectionEnd,
      start: (element as HTMLInputElement).selectionStart,
    })),
  ).toEqual({ end: 4, start: 4 });
  expect(await axeViolations(page)).toEqual([]);
});

test("invalid recovery, narrow RTL, forced colors, reduced motion, and preferred targets remain operable", async ({
  page,
}) => {
  await openStory(page, "state-matrix", "Phone and mask adverse-state rail");
  const invalidPhone = page.getByLabel("Escalation line", { exact: true });
  const invalidMask = page.getByLabel("Inventory code", { exact: true });
  await expect(invalidPhone).toHaveValue("call-me");
  await expect(invalidPhone).toHaveAttribute("aria-invalid", "true");
  await expect(invalidPhone).toHaveAccessibleDescription(/unsupported text remains available/u);
  await expect(invalidMask).toHaveValue("AB_wrong");
  await invalidMask.fill("AB2048QZ");
  await expect(invalidMask).toHaveValue("AB-2048-QZ");
  await expect(invalidMask).not.toHaveAttribute("aria-invalid", "true");
  expect(await axeViolations(page)).toEqual([]);

  await page.setViewportSize({ height: 568, width: 320 });
  await page.emulateMedia({ forcedColors: "active", reducedMotion: "reduce" });
  await openStory(
    page,
    "right-to-left-and-narrow",
    "Ø¥Ø¯Ø®Ø§Ù„ Ø¶ÙŠÙ‘Ù‚ Ù…Ù† Ø§Ù„ÙŠÙ…ÙŠÙ† Ø¥Ù„Ù‰ Ø§Ù„ÙŠØ³Ø§Ø±",
  );
  const provider = page.locator('[data-slot="provider"]');
  const phone = page.getByLabel("Ø±Ù‚Ù… Ø§Ù„Ù‡Ø§ØªÙ", { exact: true });
  const mask = page.getByLabel("Ø±Ù…Ø² Ø§Ù„Ù…Ø®Ø²ÙˆÙ†", { exact: true });
  await expect(provider).toHaveAttribute("dir", "rtl");
  await expect(provider).toHaveAttribute("lang", "ar-EG");
  await expect(phone).toHaveCSS("direction", "ltr");
  await expect(mask).toHaveCSS("direction", "ltr");
  const undersized = await page
    .locator(
      '[data-slot="phone-field-input"], [data-slot="phone-field-extension-input"], [data-slot="masked-field-input"]',
    )
    .evaluateAll((controls) =>
      controls
        .map((control) => {
          const bounds = control.getBoundingClientRect();
          return { height: bounds.height, width: bounds.width };
        })
        .filter(({ height, width }) => height < 44 || width < 44),
    );
  expect(undersized).toEqual([]);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= document.documentElement.clientWidth,
    ),
  ).toBe(true);
  expect(await axeViolations(page)).toEqual([]);
});
