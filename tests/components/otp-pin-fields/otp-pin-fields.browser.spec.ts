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

test.beforeEach(({ page }) => {
  guardRuntime(page);
});

test.afterEach(({ page }) => {
  expect(runtimeFailures.get(page) ?? []).toEqual([]);
});

async function openStory(page: Page, story: string, heading: string): Promise<void> {
  await page.goto(`/iframe.html?viewMode=story&id=p4-otp-pin-fields--${story}`, {
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
        if (!String(error).includes("Axe is already running") || attempt === 19) throw error;
        await new Promise((resolveRetry) => setTimeout(resolveRetry, 50));
      }
    }
    return [];
  });
}

async function pasteText(page: Page, target: Locator, value: string): Promise<void> {
  await target.focus();
  if (page.context().browser()?.browserType().name() !== "chromium") {
    await target.evaluate((element, text) => {
      const clipboardData = new DataTransfer();
      clipboardData.setData("text", text);
      const event = new ClipboardEvent("paste", {
        bubbles: true,
        cancelable: true,
        clipboardData,
      });
      if (event.clipboardData?.getData("text") !== text) {
        Object.defineProperty(event, "clipboardData", { value: clipboardData });
      }
      element.dispatchEvent(event);
    }, value);
    return;
  }
  await page.context().grantPermissions(["clipboard-read", "clipboard-write"], {
    origin: new URL(page.url()).origin,
  });
  await page.evaluate((text) => navigator.clipboard.writeText(text), value);
  await page.keyboard.press("Control+V");
}

test("basic and recommended credential modes keep grouping and completion hooks independent", async ({
  page,
}) => {
  await openStory(page, "basic-defaults", "Mergora credential fields");
  await expect(page.locator('[data-slot="otp-field-group"]')).toHaveCount(1);
  await expect(page.getByTestId("otp-completion-hook")).toHaveCount(0);
  await expect(page.getByTestId("pin-completion-hook")).toHaveCount(0);
  const basicPin = page.locator('[data-slot="pin-field-input"]');
  await expect(basicPin).toHaveAttribute("type", "password");
  await pasteText(page, basicPin, "1234");
  await expect(basicPin).toHaveValue("1234");

  await openStory(page, "recommended-mergora", "Mergora credential fields");
  await expect(page.locator('[data-slot="otp-field-group"]')).toHaveCount(2);
  const otp = page.getByRole("textbox", { name: "Verification code" });
  const pin = page.locator('[data-slot="pin-field-input"]');
  await otp.fill("123456");
  await expect(page.getByTestId("otp-completion-hook")).toHaveText("OTP completions: 1");
  await pin.fill("2468");
  await expect(page.getByTestId("pin-completion-hook")).toHaveText("PIN completions: 1");
  await page.getByRole("button", { name: "Inspect native values" }).click();
  expect(
    JSON.parse((await page.getByTestId("credential-mode-submission").textContent()) ?? "{}"),
  ).toEqual({ "access-pin": "2468", "verification-code": "123456" });
  expect(await axeViolations(page)).toEqual([]);
});

test("OTP paste, mobile and autofill hints, grouping, completion, and form semantics stay unified", async ({
  page,
}) => {
  await openStory(page, "entry-workbench", "Access proofing station");
  const otp = page.getByRole("textbox", { name: "Verification code", exact: true });
  const pin = page.locator('[data-slot="pin-field-input"]');

  await expect(otp).toHaveAttribute("autocomplete", "one-time-code");
  await expect(otp).toHaveAttribute("inputmode", "numeric");
  await expect(otp).toHaveAttribute("pattern", "[0-9]*");
  await expect(otp).toHaveAttribute("maxlength", "6");
  await expect(otp).toHaveAttribute("enterkeyhint", "done");
  await expect(pin).toHaveAttribute("type", "password");
  await expect(pin).toHaveAttribute("autocomplete", "current-password");
  await expect(pin).toHaveAttribute("inputmode", "numeric");
  await expect(page.locator('[data-slot="otp-field"] input')).toHaveCount(1);
  await expect(page.locator('[data-slot="otp-field-group"]')).toHaveCount(2);
  await expect(page.locator('[data-slot="otp-field-cell"]')).toHaveCount(6);
  await expect(page.locator('[data-slot="pin-field"]')).toHaveAttribute(
    "data-purpose",
    "reusable-secret",
  );

  await pasteText(page, otp, "12 34-56");
  await expect(otp).toHaveValue("123456");
  await expect(page.getByTestId("completion-state")).toHaveText(
    "Code length reached; the form remains unsubmitted.",
  );
  await expect(page.getByTestId("completion-count")).toHaveText("Completion notifications: 1");
  await expect(page.getByTestId("submission-result")).toHaveText("No form submission yet.");

  await otp.selectText();
  await pasteText(page, otp, "12 34-56");
  await expect(otp).toHaveValue("123456");
  await expect(page.getByTestId("completion-count")).toHaveText("Completion notifications: 1");

  await page.getByRole("button", { name: "Inspect native values" }).click();
  expect(JSON.parse((await page.getByTestId("submission-result").textContent()) ?? "{}")).toEqual({
    pin: "2468",
    verificationCode: "123456",
  });
  expect(await axeViolations(page)).toEqual([]);
});

test("OTP composition commits once and native caret editing remains available", async ({
  page,
}) => {
  await openStory(page, "entry-workbench", "Access proofing station");
  const otp = page.getByRole("textbox", { name: "Verification code", exact: true });

  await otp.dispatchEvent("compositionstart", { data: "１" });
  await otp.fill("１２3");
  await otp.dispatchEvent("compositionend", { data: "１２3" });
  await expect(otp).toHaveValue("123");

  await otp.fill("123456");
  await otp.evaluate((input: HTMLInputElement) => input.setSelectionRange(2, 2));
  await page.keyboard.press("Backspace");
  await expect(otp).toHaveValue("13456");
  expect(await otp.evaluate((input: HTMLInputElement) => input.selectionStart)).toBe(1);
});

test("controlled OTP and PIN values remain externally owned", async ({ page }) => {
  await openStory(page, "controlled-ownership", "Controlled ownership, visible at every step");
  const otp = page.getByRole("textbox", { name: "Controlled code", exact: true });
  const pin = page.getByRole("textbox", { name: "Controlled reusable PIN", exact: true });

  await expect(otp).toHaveValue("914");
  await expect(pin).toHaveValue("73");
  await page.getByRole("button", { name: "Set complete code" }).click();
  await page.getByRole("button", { name: "Set complete PIN" }).click();
  await expect(otp).toHaveValue("914205");
  await expect(pin).toHaveValue("7351");
  await expect(page.getByTestId("controlled-completions")).toHaveText(
    JSON.stringify({ otp: 0, pin: 0 }),
  );

  await otp.selectText();
  await pasteText(page, otp, "914205");
  await pin.selectText();
  await pasteText(page, pin, "7351");
  await expect(page.getByTestId("controlled-completions")).toHaveText(
    JSON.stringify({ otp: 0, pin: 0 }),
  );
  expect(JSON.parse((await page.getByTestId("controlled-values").textContent()) ?? "{}")).toEqual({
    otp: "914205",
    pin: "7351",
  });

  await otp.fill("881102");
  await pin.fill("9012");
  await expect(otp).toHaveValue("881102");
  await expect(pin).toHaveValue("9012");
  await expect(page.getByTestId("controlled-completions")).toHaveText(
    JSON.stringify({ otp: 1, pin: 1 }),
  );

  await otp.selectText();
  await pasteText(page, otp, "881102");
  await pin.selectText();
  await pasteText(page, pin, "9012");
  await expect(page.getByTestId("controlled-completions")).toHaveText(
    JSON.stringify({ otp: 1, pin: 1 }),
  );
});

test("a delayed controlled parent deduplicates the same complete candidate", async ({ page }) => {
  await openStory(page, "delayed-parent-ownership", "Delayed parent ownership");
  const otp = page.getByRole("textbox", { name: "Delayed code", exact: true });
  const pin = page.getByRole("textbox", { name: "Delayed reusable PIN", exact: true });

  for (let attempt = 0; attempt < 2; attempt += 1) {
    await otp.selectText();
    await pasteText(page, otp, "123456");
    await pin.selectText();
    await pasteText(page, pin, "7351");
  }

  await expect(otp).toHaveValue("12");
  await expect(pin).toHaveValue("7");
  await expect(page.getByTestId("delayed-candidates")).toHaveText(
    JSON.stringify({ otp: "123456", pin: "7351" }),
  );
  await expect(page.getByTestId("delayed-completions")).toHaveText(
    JSON.stringify({ otp: 1, pin: 1 }),
  );
});

test("PIN paste policy allows native paste by default and announces an explicit block", async ({
  page,
}) => {
  await openStory(page, "paste-policy-workbench", "Paste policy is an explicit tradeoff");
  const allowed = page.getByRole("textbox", { name: "Paste allowed PIN", exact: true });
  const blocked = page.locator('[data-slot="pin-field-input"]').nth(1);

  await pasteText(page, allowed, "73-51");
  await expect(allowed).toHaveValue("7351");

  await pasteText(page, blocked, "2048");
  await expect(blocked).toHaveValue("");
  await expect(page.getByRole("status")).toHaveText("Pasting is disabled for this PIN field.");
  await expect(blocked).toHaveAttribute("aria-describedby", /paste-status/u);
  expect(await axeViolations(page)).toEqual([]);
});

test("uncontrolled native reset restores the code and reusable PIN defaults", async ({ page }) => {
  await openStory(page, "form-serialization-and-reset", "Access proofing station");
  const otp = page.getByRole("textbox", { name: "Verification code", exact: true });
  const pin = page.locator('[data-slot="pin-field-input"]');

  await otp.fill("731904");
  await pin.fill("9157");
  await page.getByRole("button", { name: "Restore credential defaults" }).click();
  await expect(otp).toHaveValue("");
  await expect(pin).toHaveValue("2468");
  await otp.fill("123456");
  await page.getByRole("button", { name: "Inspect native values" }).click();
  expect(JSON.parse((await page.getByTestId("submission-result").textContent()) ?? "{}")).toEqual({
    pin: "2468",
    verificationCode: "123456",
  });
});

test("RTL, forced colors, narrow reflow, and preferred touch geometry stay usable", async ({
  page,
}) => {
  await page.setViewportSize({ height: 760, width: 320 });
  await page.emulateMedia({ forcedColors: "active", reducedMotion: "reduce" });
  await openStory(page, "right-to-left", "إدخال رموز الاعتماد من اليمين إلى اليسار");
  const provider = page.locator('[data-slot="provider"]');
  const otp = page.getByRole("textbox", { name: "رمز التحقق", exact: true });
  const pin = page.locator('[data-slot="pin-field-input"]');

  await expect(provider).toHaveAttribute("dir", "rtl");
  await expect(provider).toHaveAttribute("lang", "ar-EG");
  await expect(otp).toHaveCSS("direction", "ltr");
  await expect(pin).toHaveCSS("direction", "ltr");

  const undersized = await page
    .locator('[data-slot="otp-field-input"], [data-slot="pin-field-input"]')
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

test("read-only OTP and PIN paste remains a native no-op", async ({ page }) => {
  await openStory(page, "state-rail", "Credential field state rail");
  const otp = page.getByLabel("Archived code", { exact: true });
  const pin = page.getByLabel("Archived reusable PIN", { exact: true });

  await expect(otp).toHaveAttribute("readonly", "");
  await expect(pin).toHaveAttribute("readonly", "");
  await pasteText(page, otp, "123456");
  await pasteText(page, pin, "9012");
  await expect(otp).toHaveValue("731904");
  await expect(pin).toHaveValue("5284");
});

test("disabled, read-only, error, secure, and visible states remain named and axe-clean", async ({
  page,
}) => {
  await openStory(page, "state-rail", "Credential field state rail");
  await expect(page.getByRole("textbox", { name: "Archived code" })).toHaveAttribute(
    "readonly",
    "",
  );
  await expect(page.getByRole("textbox", { name: "Expired code" })).toBeDisabled();
  await expect(page.getByLabel("Archived reusable PIN", { exact: true })).toHaveAttribute(
    "readonly",
    "",
  );
  await expect(page.getByLabel("Unavailable reusable PIN", { exact: true })).toBeDisabled();
  await expect(page.getByRole("textbox", { name: "Expired verification code" })).toHaveAttribute(
    "aria-invalid",
    "true",
  );
  await expect(
    page.getByRole("region", { name: "Secure reusable PIN" }).locator("input"),
  ).toHaveAttribute("type", "password");
  await expect(page.getByRole("textbox", { name: "Visible reusable PIN" })).toHaveAttribute(
    "type",
    "text",
  );
  await expect(
    page.getByRole("region", { name: "Invalid reusable PIN" }).locator("input"),
  ).toHaveAttribute("aria-errormessage", /error/u);
  expect(await axeViolations(page)).toEqual([]);
});
