import { resolve } from "node:path";
import { expect, test, type Page } from "@playwright/test";

const axePath = resolve(
  import.meta.dirname,
  "../../../packages/test-utils/node_modules/axe-core/axe.min.js",
);
const diagnostics = new WeakMap<Page, string[]>();

test.beforeEach(async ({ page }) => {
  const failures: string[] = [];
  diagnostics.set(page, failures);
  page.on("console", (message) => {
    if (message.type() === "error" || message.type() === "warning") {
      failures.push(`console.${message.type()}: ${message.text()}`);
    }
  });
  page.on("pageerror", (error) => failures.push(`pageerror: ${error.message}`));
});

test.afterEach(async ({ page }) => {
  expect(diagnostics.get(page) ?? []).toEqual([]);
});

async function openStory(page: Page, storyId: string, heading: string): Promise<void> {
  await page.goto(`/iframe.html?id=${storyId}&viewMode=story`);
  await expect(page.getByRole("heading", { name: heading, level: 1 })).toBeVisible();
}

async function duplicateIds(page: Page): Promise<string[]> {
  return page.locator("[id]").evaluateAll((nodes) => {
    const ids = nodes.map((node) => node.id).filter((id) => id.length > 0);
    return [...new Set(ids.filter((id, index) => ids.indexOf(id) !== index))];
  });
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
        if (!String(error).includes("Axe is already running") || attempt === 19) throw error;
        await new Promise((resolveRetry) => setTimeout(resolveRetry, 50));
      }
    }
    return [];
  });
}

test("native semantics, field relationships, and stable accessible names hydrate without duplicate IDs", async ({
  page,
}) => {
  await openStory(page, "p2-form-controls--composition-workbench", "Native form workbench");

  const email = page.getByRole("textbox", { name: "Email address", exact: true });
  await expect(email).toHaveAttribute("type", "email");
  await expect(email).toHaveAttribute("autocomplete", "email");
  await expect(email).toHaveAttribute("inputmode", "email");
  await expect(email).toHaveAttribute("required", "");
  await expect(page.getByRole("checkbox", { name: "Keyboard review", exact: true })).toBeChecked();
  await expect(
    page.getByRole("checkbox", { name: "Screen-reader review", exact: true }),
  ).not.toBeChecked();
  await expect(page.getByRole("radio", { name: "Source", exact: true })).toBeChecked();
  await expect(
    page.getByRole("switch", { name: "Release notifications", exact: true }),
  ).toHaveAttribute("aria-checked", "true");
  await expect(page.getByRole("switch", { name: /Release notifications On/u })).toHaveCount(0);
  expect(await duplicateIds(page)).toEqual([]);
  expect(await axeViolations(page)).toEqual([]);
});

test("native FormData keeps successful controls, repeated group values, and explicit switch state", async ({
  page,
}) => {
  await openStory(page, "p2-form-controls--composition-workbench", "Native form workbench");
  await page.getByRole("textbox", { name: "Email address", exact: true }).fill("owner@example.com");
  await page.getByRole("textbox", { name: "Release notes", exact: true }).fill("Ready to verify");
  await page.getByRole("combobox", { name: "Primary region", exact: true }).selectOption("apac");
  await page.getByRole("checkbox", { name: "Screen-reader review", exact: true }).check();
  await page.getByRole("radio", { name: "Package", exact: true }).check();
  await page.getByRole("button", { name: "Submit native values" }).click();

  const entries = JSON.parse(
    (await page.getByTestId("submission-output").textContent()) ?? "[]",
  ) as Array<[string, string]>;
  expect(entries).toContainEqual(["email", "owner@example.com"]);
  expect(entries).toContainEqual(["notes", "Ready to verify"]);
  expect(entries).toContainEqual(["region", "apac"]);
  expect(entries).toContainEqual(["audit", "included"]);
  expect(entries.filter(([name]) => name === "verification")).toEqual([
    ["verification", "keyboard"],
    ["verification", "screen-reader"],
  ]);
  expect(entries).toContainEqual(["distribution", "package"]);
  expect(entries).toContainEqual(["notifications", "enabled"]);
});

test("native reset restores input, IME count, checkbox mixed state, groups, radio, and switch", async ({
  page,
}) => {
  await openStory(
    page,
    "p2-form-controls--disabled-and-reset",
    "Native reset and successful controls",
  );
  const workspace = page.getByRole("textbox", { name: "Workspace name", exact: true });
  const summary = page.getByRole("textbox", { name: "Summary", exact: true });
  const retained = page.getByRole("checkbox", { name: "Retain source", exact: true });
  const sync = page.getByRole("switch", { name: "Synchronize source", exact: true });
  await expect(retained).toHaveJSProperty("indeterminate", true);
  await workspace.fill("Changed");
  await summary.fill("Changed evidence");
  await retained.click();
  await page.getByRole("checkbox", { name: "Browser", exact: true }).check();
  await page.getByRole("radio", { name: "Stable", exact: true }).check();
  await sync.click();
  await expect(sync).toHaveAttribute("aria-checked", "false");

  await page.getByRole("button", { name: "Restore defaults" }).click();
  await expect(workspace).toHaveValue("Workbench");
  await expect(summary).toHaveValue("Original evidence");
  await expect(retained).toBeChecked();
  await expect(retained).toHaveJSProperty("indeterminate", true);
  await expect(page.getByRole("checkbox", { name: "Unit", exact: true })).toBeChecked();
  await expect(page.getByRole("checkbox", { name: "Browser", exact: true })).not.toBeChecked();
  await expect(page.getByRole("radio", { name: "Draft", exact: true })).toBeChecked();
  await expect(sync).toHaveAttribute("aria-checked", "true");

  await page.getByRole("button", { name: "Inspect FormData" }).click();
  const entries = JSON.parse(
    (await page.getByTestId("reset-output").textContent()) ?? "[]",
  ) as Array<[string, string]>;
  expect(entries).toContainEqual(["retained", "yes"]);
  expect(entries).toContainEqual(["gates", "unit"]);
  expect(entries).toContainEqual(["channel", "draft"]);
  expect(entries).toContainEqual(["sync", "yes"]);
  expect(entries.some(([name]) => name === "disabled-value")).toBe(false);
});

test("async failure announces a count, focuses the unique summary, and links to the real control", async ({
  page,
}) => {
  await openStory(page, "p2-form-controls--async-validation", "Async validation and error focus");
  await expect(page.locator('[data-slot="validation-summary"]')).toHaveCount(0);
  await page.getByRole("button", { name: "Validate account" }).click();
  const summary = page.locator('[data-slot="validation-summary"]');
  await expect(summary).toBeFocused();
  await expect(summary.locator('[data-slot="validation-summary-announcement"]')).toHaveText(
    "2 form errors",
  );
  const emailLink = summary.getByRole("link", { name: "Enter a valid email address." });
  await expect(emailLink).toHaveAttribute("href", "#account%3Aemail");
  await emailLink.click();
  await expect(page.getByRole("textbox", { name: "Account email", exact: true })).toBeFocused();
  expect(await duplicateIds(page)).toEqual([]);
  expect(await axeViolations(page)).toEqual([]);
});

test("checkbox-group permits then invalidates maximum overflow and handles an all-disabled group", async ({
  page,
}) => {
  await openStory(page, "p2-form-controls--composition-workbench", "Native form workbench");
  const group = page.getByRole("group", { name: "Verification paths" });
  const keyboard = page.getByRole("checkbox", { name: "Keyboard review", exact: true });
  await page.getByRole("checkbox", { name: "Screen-reader review", exact: true }).check();
  await page.getByRole("checkbox", { name: "Touch review", exact: true }).check();
  await expect(group).toHaveAttribute("aria-invalid", "true");
  await expect(keyboard).toHaveJSProperty("validationMessage", "Select no more than 2 options.");
  await keyboard.uncheck();
  await page.getByRole("checkbox", { name: "Screen-reader review", exact: true }).uncheck();
  await page.getByRole("checkbox", { name: "Touch review", exact: true }).uncheck();
  await expect(keyboard).toHaveJSProperty("validationMessage", "Select at least 1 option.");

  await openStory(page, "p2-form-controls--empty-composition", "Empty composition boundaries");
  const allDisabledForm = page.getByTestId("all-disabled-form");
  await expect(
    page.getByRole("group", { name: "Unavailable verification paths" }),
  ).not.toHaveAttribute("aria-invalid");
  await expect(allDisabledForm.locator('[data-slot="checkbox-group-error"]')).toHaveCount(0);
  expect(await allDisabledForm.evaluate((form: HTMLFormElement) => form.checkValidity())).toBe(
    true,
  );
  await expect(allDisabledForm.getByRole("checkbox")).toHaveCount(2);
  for (const checkbox of await allDisabledForm.getByRole("checkbox").all()) {
    await expect(checkbox).toBeDisabled();
  }
});

test("missing first-error targets fall back to the named summary and stable focus keys dedupe", async ({
  page,
}) => {
  await openStory(page, "p2-form-controls--audit-edges", "Form-control audit edges");
  const summary = page.getByTestId("fallback-summary");
  await expect(summary).toBeFocused();
  await expect(page.getByTestId("summary-focus-count")).toHaveText("1");

  const sameKey = page.getByRole("button", { name: "Refresh same focus key" });
  await sameKey.focus();
  await sameKey.click();
  await expect(summary).not.toBeFocused();
  await expect(page.getByTestId("summary-focus-count")).toHaveText("1");

  await page.getByRole("button", { name: "Apply new focus key" }).click();
  await expect(summary).toBeFocused();
  await expect(page.getByTestId("summary-focus-count")).toHaveText("2");
  await expect(summary).toHaveAttribute("aria-labelledby", /mrg-validation-summary-.+-heading/u);
});

test("external compounds migrate validity, serialize explicit values, and reset native state", async ({
  page,
}) => {
  await openStory(page, "p2-form-controls--audit-edges", "Form-control audit edges");
  const first = page.getByRole("checkbox", { name: "First external check", exact: true });
  const second = page.getByRole("checkbox", { name: "Second external check", exact: true });
  await expect(first).toHaveJSProperty("validationMessage", "Choose at least one external check.");
  await first.check();
  await expect(first).toHaveJSProperty("validationMessage", "");
  await page.getByRole("button", { name: "Toggle first check disabled" }).click();
  await expect(first).toBeDisabled();
  await expect(first).toHaveJSProperty("validationMessage", "");
  await expect(second).toHaveJSProperty("validationMessage", "Choose at least one external check.");
  await page.getByRole("button", { name: "Toggle first check mounted" }).click();
  await expect(first).toHaveCount(0);
  await expect(second).toHaveJSProperty("validationMessage", "Choose at least one external check.");
  await second.check();
  await expect(second).toHaveJSProperty("validationMessage", "");

  const disabledSelectedForm = page.getByTestId("disabled-selected-form");
  const disabledSelected = disabledSelectedForm.getByRole("checkbox", {
    name: "Locked disabled selection",
  });
  const availableSelection = disabledSelectedForm.getByRole("checkbox", {
    name: "Available selection",
  });
  await expect(disabledSelected).toBeChecked();
  await expect(disabledSelected).toBeDisabled();
  await expect(availableSelection).toHaveJSProperty(
    "validationMessage",
    "Select at least 1 option.",
  );
  expect(await disabledSelectedForm.evaluate((form: HTMLFormElement) => form.checkValidity())).toBe(
    false,
  );
  expect(
    await disabledSelectedForm.evaluate((form: HTMLFormElement) => [
      ...new FormData(form).entries(),
    ]),
  ).toEqual([]);
  await availableSelection.check();
  expect(await disabledSelectedForm.evaluate((form: HTMLFormElement) => form.checkValidity())).toBe(
    true,
  );

  const source = page.getByRole("radio", { name: "External source", exact: true });
  const packageRadio = page.getByRole("radio", { name: "External package", exact: true });
  await source.focus();
  await source.press("ArrowRight");
  await expect(page.getByTestId("radio-events")).toHaveText("1 clicks; 1 changes");
  await packageRadio.press("Home");
  await expect(page.getByTestId("radio-events")).toHaveText("2 clicks; 2 changes");
  await source.press("End");
  await expect(page.getByTestId("radio-events")).toHaveText("3 clicks; 3 changes");

  const controlledSource = page.getByRole("radio", { name: "Controlled source", exact: true });
  const controlledPackage = page.getByRole("radio", {
    name: "Controlled package",
    exact: true,
  });
  await controlledSource.focus();
  await controlledSource.press("ArrowRight");
  await expect(page.getByTestId("controlled-radio-events")).toHaveText("1");
  await expect(controlledSource).toBeChecked();
  await expect(controlledPackage).not.toBeChecked();

  const controlledFirst = page.getByRole("checkbox", { name: "Controlled first", exact: true });
  const controlledSecond = page.getByRole("checkbox", {
    name: "Controlled second",
    exact: true,
  });
  await controlledSecond.click();
  await expect(page.getByTestId("controlled-check-events")).toHaveText("1");
  await expect(controlledFirst).toBeChecked();
  await expect(controlledSecond).not.toBeChecked();

  const externalSwitch = page.getByRole("switch", { name: "External updates", exact: true });
  await externalSwitch.focus();
  await externalSwitch.press("Space");
  await expect(externalSwitch).toHaveAttribute("aria-checked", "false");
  await externalSwitch.press("Enter");
  await expect(externalSwitch).toHaveAttribute("aria-checked", "true");
  const disabledSwitch = page.getByRole("switch", { name: "Disabled updates", exact: true });
  await expect(disabledSwitch).toBeDisabled();
  await disabledSwitch.evaluate((node: HTMLButtonElement) => node.click());
  await expect(disabledSwitch).toHaveAttribute("aria-checked", "false");
  const preventedSwitch = page.getByRole("switch", { name: "Prevented updates", exact: true });
  await preventedSwitch.click();
  await expect(preventedSwitch).toHaveAttribute("aria-checked", "false");
  await preventedSwitch.press("Enter");
  await expect(preventedSwitch).toHaveAttribute("aria-checked", "false");
  const controlledSwitch = page.getByRole("switch", { name: "Controlled updates", exact: true });
  await controlledSwitch.click();
  await expect(page.getByTestId("controlled-switch-events")).toHaveText("1");
  await expect(controlledSwitch).toHaveAttribute("aria-checked", "false");

  const notes = page.getByRole("textbox", { name: "External notes", exact: true });
  const externalAccount = page.getByRole("textbox", { name: "External account name", exact: true });
  const externalRegions = page.getByRole("listbox", { name: "External regions", exact: true });
  const externalStandalone = page.getByRole("checkbox", {
    name: "External standalone check",
    exact: true,
  });
  await externalAccount.fill("Changed account");
  await externalRegions.selectOption(["us"]);
  await externalStandalone.uncheck();
  await notes.fill("123456789");
  const oneLineHeight = await notes.evaluate((node: HTMLTextAreaElement) => node.clientHeight);
  await notes.fill("1\n2\n3\n4\n5");
  await expect(notes).toHaveValue("1\n2\n3\n4\n5");
  expect(await notes.evaluate((node: HTMLTextAreaElement) => node.clientHeight)).toBeGreaterThan(
    oneLineHeight,
  );

  await page.getByRole("button", { name: "Submit external controls" }).click();
  await expect(page.getByTestId("external-submission")).toContainText(
    '["external-account","Changed account"]',
  );
  await expect(page.getByTestId("external-submission")).toContainText('["external-regions","us"]');
  await expect(page.getByTestId("external-submission")).not.toContainText('"external-standalone"');
  await expect(page.getByTestId("external-submission")).toContainText(
    '["external-switch","enabled"]',
  );
  await expect(page.getByTestId("external-submission")).toContainText(
    '["external-checks","second"]',
  );
  await expect(page.getByTestId("external-submission")).toContainText(
    '["external-radio","package"]',
  );
  await expect(page.getByTestId("external-submission")).toContainText(
    '["external-notes","1\\n2\\n3\\n4\\n5"]',
  );
  await externalSwitch.click();
  await page.getByRole("button", { name: "Submit external controls" }).click();
  await expect(page.getByTestId("external-submission")).toContainText(
    '["external-switch","disabled"]',
  );

  await page.getByRole("button", { name: "Toggle notes autogrow" }).click();
  await expect(notes).not.toHaveAttribute("style", /block-size|overflow-y/u);
  await notes.dispatchEvent("compositionstart", { data: "日" });
  await expect(notes).toHaveAttribute("data-composing", "true");
  await page.getByRole("button", { name: "Reset external controls" }).click();
  await expect(notes).not.toHaveAttribute("data-composing", "true");
  await expect(notes).toHaveValue("line one");
  await expect(page.locator('[data-slot="textarea-count"]')).toHaveText("8 of 200 characters");
  await expect(externalAccount).toHaveValue("Original account");
  await expect(externalRegions.locator("option:checked")).toHaveText(["Asia Pacific", "Europe"]);
  await expect(externalStandalone).toBeChecked();
  await expect(second).not.toBeChecked();
  await expect(source).toBeChecked();
  await expect(externalSwitch).toHaveAttribute("aria-checked", "true");
  await expect(controlledSwitch).toHaveAttribute("aria-checked", "false");
});

test("provider-localized built-ins use locale numbers while machine values remain stable", async ({
  page,
}) => {
  await openStory(page, "p2-form-controls--localized-defaults", "Provider-localized form defaults");
  await expect(page.getByRole("heading", { name: "Formular prüfen", level: 2 })).toBeVisible();
  await expect(page.locator('[data-slot="validation-summary-announcement"]')).toHaveText(
    "Fehler gesamt: 1",
  );
  await expect(page.locator('[data-slot="textarea-count"]')).toHaveText("4 von 1.234 Zeichen");
  await expect(page.locator('[data-slot="checkbox-group-error"]')).toHaveText(
    "Mindestens 1 auswählen.",
  );
  await expect(page.locator('[data-slot="switch-state-label"]')).toHaveText("Aus");
  await expect(page.getByRole("switch", { name: "Aktualisierungen", exact: true })).toHaveAttribute(
    "aria-checked",
    "false",
  );
  expect(await duplicateIds(page)).toEqual([]);
});

test("radio APG movement skips disabled items and mirrors horizontal arrows in RTL", async ({
  page,
}) => {
  await openStory(page, "p2-form-controls--composition-workbench", "Native form workbench");
  const source = page.getByRole("radio", { name: "Source", exact: true });
  const packageRadio = page.getByRole("radio", { name: "Package", exact: true });
  await source.focus();
  await source.press("ArrowRight");
  await expect(packageRadio).toBeFocused();
  await expect(packageRadio).toBeChecked();
  await expect(page.getByRole("radio", { name: "CDN unavailable", exact: true })).toBeDisabled();

  await openStory(page, "p2-form-controls--right-to-left", "نموذج التحقق");
  const rtlSource = page.getByRole("radio", { name: "المصدر", exact: true });
  const rtlPackage = page.getByRole("radio", { name: "الحزمة", exact: true });
  const rtlCdn = page.getByRole("radio", { name: "شبكة التوزيع", exact: true });
  await rtlSource.focus();
  await rtlSource.press("ArrowRight");
  await expect(rtlCdn).toBeFocused();
  await expect(rtlCdn).toBeChecked();
  await rtlCdn.press("ArrowLeft");
  await expect(rtlSource).toBeChecked();
  await rtlSource.press("ArrowLeft");
  await expect(rtlPackage).toBeFocused();
  await expect(rtlPackage).toBeChecked();
  const preventedGroup = page.getByRole("group", { name: "Prevented movement" });
  const protectedSource = preventedGroup.getByRole("radio", {
    name: "Protected source",
    exact: true,
  });
  await protectedSource.focus();
  await protectedSource.press("ArrowRight");
  await expect(protectedSource).toBeChecked();
  expect(await axeViolations(page)).toEqual([]);
});

test("controlled indeterminate stays synchronized and textarea composition commits once", async ({
  page,
}) => {
  await openStory(
    page,
    "p2-form-controls--indeterminate-checkbox",
    "Indeterminate and labelled descriptions",
  );
  const controlled = page.getByRole("checkbox", {
    name: "Controlled mixed selection",
    exact: true,
  });
  await expect(controlled).toHaveJSProperty("indeterminate", true);
  await controlled.click();
  await expect(controlled).toHaveJSProperty("indeterminate", true);
  await expect(controlled.locator("xpath=..")).toHaveAttribute("data-slot", "checkbox-label-root");
  await page.getByRole("button", { name: "Resolve controlled mixed state" }).click();
  await expect(controlled).toHaveJSProperty("indeterminate", false);

  await openStory(page, "p2-form-controls--composition-workbench", "Native form workbench");
  const textarea = page.getByRole("textbox", { name: "Release notes", exact: true });
  const count = page.locator('[data-slot="textarea-count"]');
  await expect(count).toHaveText("0 of 120 characters");
  await textarea.dispatchEvent("compositionstart", { data: "日" });
  await expect(textarea).toHaveAttribute("data-composing", "true");
  await textarea.evaluate((node) => {
    const control = node as HTMLTextAreaElement;
    control.value = "日本";
    control.dispatchEvent(
      new InputEvent("input", { bubbles: true, data: "日本", inputType: "insertCompositionText" }),
    );
  });
  await expect(count).toHaveText("0 of 120 characters");
  await textarea.dispatchEvent("compositionend", { data: "日本" });
  await expect(textarea).not.toHaveAttribute("data-composing", "true");
  await expect(count).toHaveText("2 of 120 characters");
  await textarea.fill(Array.from({ length: 12 }, (_, index) => `line ${index}`).join("\n"));
  const geometry = await textarea.evaluate((node) => {
    const control = node as HTMLTextAreaElement;
    return {
      clientHeight: control.clientHeight,
      overflowY: getComputedStyle(control).overflowY,
      scrollHeight: control.scrollHeight,
    };
  });
  expect(geometry.scrollHeight).toBeGreaterThan(geometry.clientHeight);
  expect(geometry.overflowY).toBe("auto");
});

test("server markup hydrates without recoverable errors and preserves every generated relationship", async ({
  page,
}) => {
  await openStory(page, "p2-form-controls--hydration-identities", "SSR hydration identities");
  await expect(page.getByTestId("hydration-result")).toHaveText("hydrated");
  const host = page.getByTestId("hydration-host");
  await expect(host.getByRole("textbox", { name: "Hydrated name", exact: true })).toBeVisible();
  await expect(host.getByRole("textbox", { name: "Hydrated notes", exact: true })).toHaveValue(
    "👩‍💻",
  );
  await expect(
    host.getByRole("checkbox", { name: "Hydrated checkbox", exact: true }),
  ).toBeVisible();
  await expect(host.getByRole("group", { name: "Hydrated checks" })).toBeVisible();
  await expect(host.getByRole("group", { name: "Hydrated radios" })).toBeVisible();
  expect(await duplicateIds(page)).toEqual([]);
  const unresolvedReferences = await host
    .locator("[aria-describedby], [aria-errormessage]")
    .evaluateAll((nodes) =>
      nodes.flatMap((node) =>
        [node.getAttribute("aria-describedby"), node.getAttribute("aria-errormessage")]
          .flatMap((value) => value?.split(/\s+/u) ?? [])
          .filter((id) => id.length > 0 && document.getElementById(id) === null),
      ),
    );
  expect(unresolvedReferences).toEqual([]);
  expect(await axeViolations(page)).toEqual([]);
});

test("grapheme limits count perceived characters, preserve committed IME text, and drive native validity", async ({
  page,
}) => {
  await openStory(page, "p2-form-controls--grapheme-limits", "Grapheme-safe textarea limits");
  const textarea = page.getByRole("textbox", { name: "User-perceived characters", exact: true });
  const counters = page.locator('[data-slot="textarea-count"]');
  await expect(counters.nth(0)).toHaveText("1/2 文字");
  await expect(counters.nth(1)).toHaveText("Explicit 1/2");
  await expect(counters.nth(2)).toHaveText("1/2 文字");
  await expect(textarea.locator("xpath=..")).toHaveAttribute("data-count-unit", "grapheme");
  await expect(textarea).toHaveJSProperty("validationMessage", "");

  const controlledTextarea = page.getByRole("textbox", {
    name: "Controlled parent catch-up",
    exact: true,
  });
  await controlledTextarea.dispatchEvent("compositionstart", { data: "日" });
  await controlledTextarea.evaluate((node) => {
    const control = node as HTMLTextAreaElement;
    control.value = "日本";
    control.dispatchEvent(
      new InputEvent("input", { bubbles: true, data: "日本", inputType: "insertCompositionText" }),
    );
  });
  await expect(counters.nth(2)).toHaveText("1/2 文字");
  await controlledTextarea.dispatchEvent("compositionend", { data: "日本" });
  await expect(counters.nth(2)).toHaveText("2/2 文字");
  await page.getByRole("button", { name: "Apply controlled catch-up" }).click();
  await expect(controlledTextarea).toHaveValue("日本");
  await expect(counters.nth(2)).toHaveText("2/2 文字");

  const overLimit = `👨‍👩‍👧‍👦e\u0301🙂`;
  await textarea.dispatchEvent("compositionstart", { data: "👨‍👩‍👧‍👦" });
  await textarea.evaluate((node, value) => {
    const control = node as HTMLTextAreaElement;
    control.value = value;
    control.dispatchEvent(
      new InputEvent("input", { bubbles: true, data: value, inputType: "insertCompositionText" }),
    );
  }, overLimit);
  await expect(counters.nth(0)).toHaveText("1/2 文字");
  await expect(textarea).toHaveJSProperty("validationMessage", "");
  await textarea.dispatchEvent("compositionend", { data: overLimit });
  await expect(textarea).toHaveValue(overLimit);
  await expect(counters.nth(0)).toHaveText("3/2 文字");
  await expect(textarea).toHaveJSProperty("validationMessage", "2文字以内で入力してください。");

  await page.getByRole("button", { name: "Submit grapheme value" }).click();
  await expect(page.getByTestId("grapheme-submission")).toHaveText("No grapheme submission yet");
  const validValue = `👨‍👩‍👧‍👦e\u0301`;
  await textarea.fill(validValue);
  await expect(counters.nth(0)).toHaveText("2/2 文字");
  await expect(textarea).toHaveJSProperty("validationMessage", "");
  await page.getByRole("button", { name: "Submit grapheme value" }).click();
  const submission = JSON.parse(
    (await page.getByTestId("grapheme-submission").textContent()) ?? "[]",
  ) as Array<[string, string]>;
  expect(submission).toEqual([["grapheme-notes", validValue]]);

  await textarea.focus();
  expect(
    await textarea.evaluate((node) =>
      node.dispatchEvent(new ClipboardEvent("paste", { bubbles: true, cancelable: true })),
    ),
  ).toBe(true);
  await page.keyboard.insertText("🙂");
  await expect(textarea).toHaveValue(`${validValue}🙂`);
  await expect(textarea).toHaveJSProperty("validationMessage", "2文字以内で入力してください。");
  await page.keyboard.press("Control+z");
  await expect(textarea).toHaveValue(validValue);
  await expect(textarea).toHaveJSProperty("validationMessage", "");

  await textarea.fill(overLimit);
  await page.getByRole("button", { name: "Reset grapheme value" }).click();
  await expect(textarea).toHaveValue("👩‍💻");
  await expect(counters.nth(0)).toHaveText("1/2 文字");
  await expect(textarea).toHaveJSProperty("validationMessage", "");
});

test("group invalid tokens remain exact while visual state, errors, and native controls stay synchronized", async ({
  page,
}) => {
  await openStory(page, "p2-form-controls--state-matrix", "Form-control state matrix");
  const checkboxGroup = page.getByRole("group", { name: "Invalid required checks" });
  const radioGroup = page.getByRole("group", { name: "Invalid required radios" });
  await expect(checkboxGroup).toHaveAttribute("aria-invalid", "grammar");
  await expect(radioGroup).toHaveAttribute("aria-invalid", "spelling");
  for (const checkbox of await checkboxGroup.getByRole("checkbox").all()) {
    await expect(checkbox).toHaveAttribute("aria-invalid", "grammar");
  }
  for (const radio of await radioGroup.getByRole("radio").all()) {
    await expect(radio).toHaveAttribute("aria-invalid", "spelling");
  }
  await expect(page.getByRole("textbox", { name: "Invalid required text" })).toHaveAttribute(
    "aria-invalid",
    "spelling",
  );
  await expect(
    page.getByRole("textbox", { name: "Invalid grapheme-limited notes" }),
  ).toHaveAttribute("aria-invalid", "grammar");
  await expect(page.getByRole("combobox", { name: "Invalid region" })).toHaveAttribute(
    "aria-invalid",
    "spelling",
  );
  expect(await axeViolations(page)).toEqual([]);
});

test("coarse-pointer controls expose 44 CSS pixel activation geometry", async ({ browser }) => {
  const context = await browser.newContext({
    hasTouch: true,
    isMobile: true,
    viewport: { width: 390, height: 844 },
  });
  const touchPage = await context.newPage();
  const failures: string[] = [];
  touchPage.on("console", (message) => {
    const text = message.text();
    const isPlaywrightFirefoxLayoutDiagnostic = text.includes(
      "chrome://juggler/content/content/main.js",
    );
    if (
      !isPlaywrightFirefoxLayoutDiagnostic &&
      (message.type() === "warning" || message.type() === "error")
    ) {
      failures.push(text);
    }
  });
  touchPage.on("pageerror", (error) => failures.push(error.message));
  await openStory(touchPage, "p2-form-controls--composition-workbench", "Native form workbench");
  const undersized = await touchPage
    .locator(
      '[data-slot="input"], [data-slot="textarea"], [data-slot="native-select"], [data-slot="checkbox-label-root"], [data-slot="radio-group-item-label-root"], [data-slot="switch"]',
    )
    .evaluateAll((nodes) =>
      nodes
        .map((node) => {
          const rect = node.getBoundingClientRect();
          return { height: rect.height, slot: (node as HTMLElement).dataset.slot };
        })
        .filter(({ height }) => height < 44),
    );
  expect(undersized).toEqual([]);
  expect(await axeViolations(touchPage)).toEqual([]);
  expect(failures).toEqual([]);
  await context.close();
});

test("320px/400%-equivalent reflow, 200% text, forced colors, authentication, paste, and RTL remain usable", async ({
  page,
}) => {
  await page.setViewportSize({ width: 320, height: 568 });
  await openStory(page, "p2-form-controls--narrow-reflow", "320 CSS pixel form reflow");
  const narrowOverflow = await page.evaluate(() => ({
    clientWidth: document.documentElement.clientWidth,
    offenders: [...document.querySelectorAll<HTMLElement>("body *")]
      .filter((node) => node.getBoundingClientRect().right > document.documentElement.clientWidth)
      .map((node) => ({
        className: node.className,
        right: node.getBoundingClientRect().right,
        slot: node.dataset.slot,
        tagName: node.tagName,
      })),
    scrollWidth: document.documentElement.scrollWidth,
  }));
  expect(narrowOverflow).toEqual({ clientWidth: 320, offenders: [], scrollWidth: 320 });
  expect(await axeViolations(page)).toEqual([]);

  await page.addStyleTag({
    content: `
      p, label, legend, button, input, textarea, select {
        letter-spacing: 0.12em !important;
        line-height: 1.5 !important;
        word-spacing: 0.16em !important;
      }
      p { margin-block-end: 2em !important; }
    `,
  });
  const textSpacingOverflow = await page.evaluate(() => ({
    clientWidth: document.documentElement.clientWidth,
    offenders: [...document.querySelectorAll<HTMLElement>("body *")]
      .filter((node) => node.getBoundingClientRect().right > document.documentElement.clientWidth)
      .map((node) => node.dataset.slot ?? node.tagName),
    scrollWidth: document.documentElement.scrollWidth,
  }));
  expect(textSpacingOverflow).toEqual({ clientWidth: 320, offenders: [], scrollWidth: 320 });

  await page.setViewportSize({ width: 640, height: 900 });
  await openStory(page, "p2-form-controls--narrow-reflow", "320 CSS pixel form reflow");
  await page.evaluate(() => {
    document.documentElement.style.fontSize = "200%";
  });
  const doubledTextOverflow = await page.evaluate(() => ({
    clientWidth: document.documentElement.clientWidth,
    offenders: [...document.querySelectorAll<HTMLElement>("body *")]
      .filter((node) => node.getBoundingClientRect().right > document.documentElement.clientWidth)
      .map((node) => node.dataset.slot ?? node.tagName),
    scrollWidth: document.documentElement.scrollWidth,
  }));
  expect(doubledTextOverflow).toEqual({ clientWidth: 640, offenders: [], scrollWidth: 640 });

  await page.emulateMedia({ forcedColors: "active", reducedMotion: "reduce" });
  await openStory(
    page,
    "p2-form-controls--authentication-and-mobile",
    "Accessible authentication inputs",
  );
  const username = page.getByRole("textbox", { name: "Username", exact: true });
  const password = page.getByRole("textbox", { name: "Password", exact: true });
  const telephone = page.getByRole("textbox", { name: "Mobile number", exact: true });
  await expect(username).toHaveAttribute("autocomplete", "username");
  await expect(password).toHaveAttribute("autocomplete", "current-password");
  await expect(telephone).toHaveAttribute("inputmode", "tel");
  expect(
    await password.evaluate((node) =>
      node.dispatchEvent(new Event("paste", { bubbles: true, cancelable: true })),
    ),
  ).toBe(true);
  await username.focus();
  expect(
    await username.evaluate((node) => getComputedStyle(node.parentElement!).outlineStyle),
  ).not.toBe("none");
  expect(await axeViolations(page)).toEqual([]);

  await openStory(page, "p2-form-controls--composition-workbench", "Native form workbench");
  const missingForcedColorBoundaries = await page
    .locator(
      '[data-slot="input-root"], [data-slot="textarea-root"], [data-slot="native-select-root"], [data-slot="checkbox-indicator"], [data-slot="radio-group-indicator"], [data-slot="switch-track"]',
    )
    .evaluateAll((nodes) =>
      nodes
        .map((node) => {
          const style = getComputedStyle(node);
          return {
            borderStyle: style.borderStyle,
            borderWidth: style.borderWidth,
            slot: (node as HTMLElement).dataset.slot,
          };
        })
        .filter(({ borderStyle, borderWidth }) => borderStyle === "none" || borderWidth === "0px"),
    );
  expect(missingForcedColorBoundaries).toEqual([]);
  expect(await axeViolations(page)).toEqual([]);

  await openStory(page, "p2-form-controls--empty-composition", "Empty composition boundaries");
  const summaries = page.locator('[data-slot="validation-summary"]');
  await expect(summaries).toHaveCount(2);
  await expect(summaries.locator('[data-slot="validation-summary-announcement"]')).toHaveText([
    "",
    "",
  ]);
  expect(await duplicateIds(page)).toEqual([]);
  expect(await axeViolations(page)).toEqual([]);

  await openStory(page, "p2-form-controls--right-to-left", "نموذج التحقق");
  await expect(page.locator("main")).toHaveAttribute("dir", "rtl");
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= document.documentElement.clientWidth,
    ),
  ).toBe(true);
  expect(await axeViolations(page)).toEqual([]);
});
