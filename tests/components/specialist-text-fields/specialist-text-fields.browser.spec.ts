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
  await page.goto(`/iframe.html?viewMode=story&id=p4-specialist-text-fields--${story}`, {
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

test("password reveal, rules, paste, and Caps Lock remain explicit and keyboard-safe", async ({
  page,
}) => {
  await openStory(page, "rule-and-reveal-workbench", "Policy status and explicit revelation");
  const password = page.getByLabel("New password", { exact: true });
  const reveal = page.locator('[data-slot="password-field-reveal"]');

  await expect(password).toHaveAttribute("type", "password");
  await expect(reveal).toHaveAttribute("aria-pressed", "false");
  await expect(page.getByRole("list", { name: "Password requirements" })).toContainText("Met:");
  await reveal.click();
  await expect(password).toHaveAttribute("type", "text");
  await expect(reveal).toHaveAttribute("aria-pressed", "true");
  await expect(reveal).toHaveAccessibleName("Hide password");
  await expect(password).toBeFocused();

  await password.fill("");
  await password.pressSequentially("Pasted-safe-value-2026");
  await expect(password).toHaveValue("Pasted-safe-value-2026");
  expect(
    await password.evaluate((element) => {
      const event = new Event("paste", { bubbles: true, cancelable: true });
      element.dispatchEvent(event);
      return event.defaultPrevented;
    }),
  ).toBe(false);
  await password.evaluate((element) => {
    const event = new KeyboardEvent("keydown", { bubbles: true, key: "A" });
    Object.defineProperty(event, "getModifierState", {
      value: (modifier: string) => modifier === "CapsLock",
    });
    element.dispatchEvent(event);
  });
  await expect(page.getByRole("status")).toHaveText("Caps Lock is on");
  expect(await axeViolations(page)).toEqual([]);
});

test("search clearing is non-submit, restores focus, and native Enter submits current text", async ({
  page,
}) => {
  await openStory(page, "search-workbench", "Search with current-result context");
  const query = page.getByRole("searchbox", { name: "Catalog query" });
  const clear = page.getByRole("button", { name: "Clear search" });
  const submitted = page.getByTestId("search-submission");

  await expect(query).toHaveAttribute("aria-controls", "catalog-results");
  await expect(query).toHaveAttribute("aria-describedby", /search-status/u);
  await expect(page.locator('[data-slot="search-field-status"]')).toContainText(
    "1 result available",
  );
  await clear.click();
  await expect(query).toHaveValue("");
  await expect(query).toBeFocused();
  await expect(submitted).toHaveText("No search submitted");

  await query.fill("passport");
  await query.press("Enter");
  await expect(submitted).toHaveText("Submitted query: passport");
  await expect(page.getByRole("list", { name: "Catalog results" })).toContainText(
    "Quality Passport",
  );
  expect(await axeViolations(page)).toEqual([]);
});

test("search clear stays unavailable during composition and result states remain associated", async ({
  page,
}) => {
  await openStory(page, "search-workbench", "Search with current-result context");
  const query = page.getByRole("searchbox", { name: "Catalog query" });
  const clear = page.getByRole("button", { name: "Clear search" });

  await query.dispatchEvent("compositionstart", { data: "契" });
  await expect(clear).toBeDisabled();
  await expect(query).toHaveValue("contract");
  await query.dispatchEvent("compositionend", { data: "契約" });
  await expect(clear).toBeEnabled();

  await openStory(page, "result-state-matrix", "Result-state association");
  const loading = page.getByRole("region", { name: "Loading" });
  const error = page.getByRole("region", { name: "Error" });
  await expect(loading.locator('[data-slot="search-field"]')).toHaveAttribute("aria-busy", "true");
  await expect(loading.getByRole("status")).toHaveText("Searching the component catalog…");
  await expect(error.getByRole("alert")).toHaveText(
    "Search is unavailable. Check your connection and try again.",
  );
  await expect(error.getByRole("searchbox", { name: "Error query" })).toHaveAttribute(
    "aria-errormessage",
    /search-status/u,
  );
  expect(await axeViolations(page)).toEqual([]);

  await openStory(page, "state-matrix", "Specialist field state rail");
  expect(await axeViolations(page)).toEqual([]);
});

test("uncontrolled native reset restores values and conceals credentials", async ({ page }) => {
  await openStory(page, "form-serialization-and-reset", "Native form serialization and reset");
  const password = page.getByLabel("Account password", { exact: true });
  const query = page.getByRole("searchbox", { name: "Documentation query" });

  await password.fill("Changed!2027");
  await page.getByRole("button", { name: "Show password" }).click();
  await query.fill("semantic sync");
  await page.getByRole("button", { name: "Inspect native values" }).click();
  expect(JSON.parse((await page.getByTestId("form-submission").textContent()) ?? "{}")).toEqual({
    passwordLength: 12,
    query: "semantic sync",
  });

  await page.getByRole("button", { name: "Restore defaults" }).click();
  await expect(password).toHaveValue("Workbench!2026");
  await expect(password).toHaveAttribute("type", "password");
  await expect(query).toHaveValue("accessibility");
  await page.getByRole("button", { name: "Inspect native values" }).click();
  expect(JSON.parse((await page.getByTestId("form-submission").textContent()) ?? "{}")).toEqual({
    passwordLength: 14,
    query: "accessibility",
  });
});

test("mobile RTL and forced colors retain labels, direction, and operable targets", async ({
  page,
}) => {
  await page.setViewportSize({ height: 720, width: 320 });
  await page.emulateMedia({ forcedColors: "active" });
  await openStory(page, "right-to-left", "حقول متخصصة من اليمين إلى اليسار");
  const provider = page.locator('[data-slot="provider"]');
  const password = page.getByLabel("كلمة المرور", { exact: true });
  const search = page.getByRole("searchbox", { name: "البحث في المكوّنات" });
  await expect(provider).toHaveAttribute("dir", "rtl");
  await expect(provider).toHaveAttribute("lang", "ar-EG");
  await expect(password).toHaveCSS("direction", "rtl");
  await expect(search).toHaveCSS("direction", "rtl");

  const undersized = await page
    .locator(
      '[data-slot="password-field-reveal"], [data-slot="search-field-clear"], [data-slot="search-field-submit"]',
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
