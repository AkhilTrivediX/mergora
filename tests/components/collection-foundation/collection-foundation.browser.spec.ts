import { resolve } from "node:path";
import {
  devices,
  expect,
  test,
  type ConsoleMessage,
  type Locator,
  type Page,
} from "@playwright/test";

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

function isFirefoxReactAriaVirtualizerAdvisory(message: string): boolean {
  return (
    message.startsWith(
      'console.warning: [JavaScript Warning: "This site appears to use a scroll-linked positioning effect.',
    ) &&
    message.includes(
      "https://firefox-source-docs.mozilla.org/performance/scroll-linked_effects.html",
    ) &&
    message.includes("p4-collection-foundation--ten-thousand-virtualized")
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

async function openStory(page: Page, story: string, heading: string | RegExp): Promise<void> {
  await page.goto(`/iframe.html?viewMode=story&id=p4-collection-foundation--${story}`, {
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
          if (!(error instanceof Error) || !error.message.includes("already running")) throw error;
          await new Promise((resolveDelay) => setTimeout(resolveDelay, 100));
        }
      }
      throw new Error("Axe remained busy for five seconds.");
    },
    { ignoreColorContrast },
  );
}

function selectRoot(page: Page, label: string): Locator {
  return page
    .locator('[data-slot="select"]')
    .filter({ has: page.locator('[data-slot="select-label"]', { hasText: label }) })
    .first();
}

function parsePairs(value: string | null): string[][] {
  return JSON.parse(value ?? "[]") as string[][];
}

async function expectAriaIdReferencesToResolve(locator: Locator): Promise<void> {
  expect(
    await locator.evaluate((element) => {
      const references = [
        element.getAttribute("aria-labelledby"),
        element.getAttribute("aria-describedby"),
      ]
        .filter((value): value is string => value !== null)
        .flatMap((value) => value.split(/\s+/u).filter(Boolean));
      return {
        references,
        unresolved: references.filter((reference) => document.getElementById(reference) === null),
      };
    }),
  ).toMatchObject({ references: expect.arrayContaining([expect.any(String)]), unresolved: [] });
}

test("Listbox and enhanced Select share sections, disabled keys, typeahead, forms, and reset", async ({
  page,
}) => {
  await openStory(page, "selection-workbench", "Shared collection and selection model");
  const form = page.getByRole("form", { name: "Collection selection workbench" });
  const teams = form.getByRole("listbox", { name: "Teams included in review" });
  const teamOptions = teams.getByRole("option");
  await expect(teamOptions).toHaveCount(5);
  await expect(teams.locator('[role="group"]')).toHaveCount(0);
  await expect(teamOptions.filter({ hasText: "Accessibility" })).toHaveAttribute(
    "aria-selected",
    "true",
  );
  await expect(teamOptions.filter({ hasText: "Frontend platform" })).toHaveAttribute(
    "aria-selected",
    "true",
  );
  await expect(teamOptions.filter({ hasText: "Archived team" })).toHaveAttribute(
    "aria-disabled",
    "true",
  );
  const accessibility = teams.getByRole("option", { name: "Accessibility", exact: true });
  await expect(accessibility).toHaveAccessibleDescription(
    "Reviews keyboard, screen-reader, speech, and switch behavior.",
  );
  await expectAriaIdReferencesToResolve(accessibility);

  await teams.focus();
  await teams.press("f");
  const frontend = teamOptions.filter({ hasText: "Frontend platform" });
  await expect(frontend).toBeFocused();
  await frontend.click();
  await expect(frontend).toHaveAttribute("aria-selected", "false");
  const release = teamOptions.filter({ hasText: "Release engineering" });
  await release.click();
  await expect(release).toHaveAttribute("aria-selected", "true");

  const controlled = form.getByRole("listbox", { name: "Controlled release target" });
  await controlled.getByRole("option", { name: "Preview" }).click();
  await expect(page.getByTestId("controlled-environment")).toHaveText("Controlled target: preview");

  const enhanced = selectRoot(page, "Default deployment environment");
  const hiddenEnhancedSelect = enhanced.locator('select[name="deployment-environment"]');
  await expect(hiddenEnhancedSelect).toHaveCount(1);
  await hiddenEnhancedSelect.selectOption("legacy", { force: true });
  await expect(hiddenEnhancedSelect).toHaveValue("production");
  await expect(enhanced.locator('[data-slot="select-value"]')).toHaveText("Production");
  await enhanced.locator('[data-slot="select-trigger"]').click();
  const preview = page.getByRole("option", { name: "Preview", exact: true }).last();
  await expect(preview).toHaveAccessibleDescription(
    "Deploys the current branch to an isolated review URL.",
  );
  await expectAriaIdReferencesToResolve(preview);
  await preview.click();
  await expect(enhanced.locator('[data-slot="select-value"]')).toHaveText("Preview");

  await form.getByRole("button", { name: "Inspect collection values" }).click();
  expect(parsePairs(await page.getByTestId("collection-form-output").textContent())).toEqual([
    ["review-team", "accessibility"],
    ["review-team", "release"],
    ["controlled-target", "preview"],
    ["deployment-environment", "preview"],
  ]);

  await form.getByRole("button", { name: "Restore collection defaults" }).click();
  await expect(teamOptions.filter({ hasText: "Accessibility" })).toHaveAttribute(
    "aria-selected",
    "true",
  );
  await expect(teamOptions.filter({ hasText: "Frontend platform" })).toHaveAttribute(
    "aria-selected",
    "true",
  );
  await expect(page.getByTestId("controlled-environment")).toHaveText("Controlled target: staging");
  await expect(enhanced.locator('[data-slot="select-value"]')).toHaveText("Production");
  expect(await axeViolations(page)).toEqual([]);
});

test("basic and recommended controls remove or add collection enhancements cleanly", async ({
  page,
}) => {
  await openStory(page, "basic-defaults", "Collection modes");
  await expect(page.locator('[data-slot="listbox-selection-summary"]')).toHaveCount(0);
  await expect(page.locator('[data-slot="select-selection-summary"]')).toHaveCount(0);
  await expect(page.locator('[data-virtualized="true"]')).toHaveCount(0);
  await page.locator('[data-slot="select-trigger"]').click();
  await expect(page.locator('[data-slot="select-listbox"]')).toBeVisible();
  await expect(page.locator('[data-slot="select-listbox"]')).not.toHaveAttribute(
    "data-virtualized",
  );
  await page.keyboard.press("Escape");
  expect(await axeViolations(page)).toEqual([]);

  await openStory(page, "recommended-mergora", "Collection modes");
  await expect(page.locator('[data-slot="listbox-selection-summary"]')).toContainText(
    "Catalog item 2",
  );
  await expect(page.locator('[data-slot="select-selection-summary"]')).toContainText(
    "Catalog item 24",
  );
  await expect(page.locator('[data-slot="listbox"][data-virtualized="true"]')).toHaveCount(1);
  await page.locator('[data-slot="select-trigger"]').click();
  await expect(page.locator('[data-slot="select-listbox"][data-virtualized="true"]')).toBeVisible();
  await page.keyboard.press("Escape");
  expect(await axeViolations(page)).toEqual([]);

  await page.goto(
    "/iframe.html?viewMode=story&id=p4-collection-foundation--recommended-mergora&args=selectionSummary:false;virtualization:false",
    { waitUntil: "domcontentloaded" },
  );
  await expect(page.getByRole("heading", { level: 1, name: "Collection modes" })).toBeVisible();
  await expect(page.locator('[data-slot$="selection-summary"]')).toHaveCount(0);
  await expect(page.locator('[data-virtualized="true"]')).toHaveCount(0);
  await page.locator('[data-slot="select-trigger"]').click();
  await expect(page.locator('[data-slot="select-listbox"]')).toBeVisible();
  await expect(page.locator('[data-slot="select-listbox"]')).not.toHaveAttribute(
    "data-virtualized",
  );
});

test("dynamic pages retain uncontrolled selection and external form state until explicit replacement", async ({
  page,
}) => {
  await openStory(page, "dynamic-selection-integrity", "Dynamic collection selection integrity");
  const listbox = page.getByRole("listbox", { name: "Page-owned reviewer" });
  const release = listbox.getByRole("option", { name: "Release engineering", exact: true });
  await expect(release).toHaveAttribute("aria-selected", "true");

  await page.getByRole("button", { name: "Show next collection page" }).click();
  await expect(page.getByTestId("dynamic-page-count")).toHaveText("Page records: 4");
  await expect(release).toHaveAttribute("aria-selected", "true");
  await expect(page.getByTestId("dynamic-selection-callback")).toHaveText(
    "No selection callback yet.",
  );
  await page.getByRole("button", { name: "Inspect retained value" }).click();
  expect(parsePairs(await page.getByTestId("dynamic-form-output").textContent())).toEqual([
    ["dynamic-reviewer", "release"],
  ]);

  await listbox.getByRole("option", { name: "Accessibility", exact: true }).click();
  await expect(release).toHaveCount(0);
  await expect(page.getByTestId("dynamic-selection-callback")).toHaveText(
    "Selection callback: accessibility",
  );
  await page.getByRole("button", { name: "Inspect retained value" }).click();
  expect(parsePairs(await page.getByTestId("dynamic-form-output").textContent())).toEqual([
    ["dynamic-reviewer", "accessibility"],
  ]);

  await page.getByRole("button", { name: "Restore retained default" }).click();
  const restoredRelease = listbox.getByRole("option", {
    name: "Release engineering",
    exact: true,
  });
  await expect(restoredRelease).toHaveAttribute("aria-selected", "true");
  await page.getByRole("button", { name: "Inspect retained value" }).click();
  expect(parsePairs(await page.getByTestId("dynamic-form-output").textContent())).toEqual([
    ["dynamic-reviewer", "release"],
  ]);
  expect(await axeViolations(page)).toEqual([]);
});

test("async failure retries, paginates, rejects a late stale completion, and honors cancel", async ({
  page,
}) => {
  await openStory(
    page,
    "async-failure-and-pagination",
    "Async failure, retry, cancellation, and pagination",
  );
  await expect(page.getByRole("alert").first()).toContainText("prepared catalog request failed");
  await page.getByRole("button", { name: "Retry loading options" }).first().click();
  await expect(page.getByTestId("remote-count")).toHaveText("Loaded options: 24; requests: 2");
  const listbox = page.getByRole("listbox", { name: "Remote release records" });
  await expect(listbox.getByRole("option")).toHaveCount(24);
  await expect(listbox.getByRole("option").first()).toContainText("request 2");

  await page.getByRole("button", { name: "Load more options" }).first().click();
  await expect(page.getByTestId("remote-count")).toHaveText("Loaded options: 48; requests: 3");
  await expect(listbox.getByRole("option")).toHaveCount(48);

  const restart = page.getByRole("button", { name: "Restart remote request" });
  await restart.click();
  await restart.click();
  await expect(page.getByTestId("remote-count")).toHaveText("Loaded options: 24; requests: 5");
  await expect(listbox.getByRole("option").first()).toContainText("request 5");
  await page.waitForTimeout(360);
  await expect(listbox.getByRole("option").first()).toContainText("request 5");

  await restart.click();
  await page.getByRole("button", { name: "Cancel remote request" }).click();
  await expect(page.getByTestId("remote-count")).toHaveText("Loaded options: 24; requests: 6");
  await page.waitForTimeout(360);
  await expect(listbox.getByRole("option").first()).toContainText("request 5");
  await expect(listbox).not.toHaveAttribute("aria-busy", "true");
  expect(await axeViolations(page)).toEqual([]);
});

test("the 10,000-record Listbox keeps a bounded DOM window and complete virtual ARIA positions", async ({
  browserName,
  page,
}) => {
  await openStory(page, "ten-thousand-virtualized", "Ten thousand virtualized options");
  const listbox = page.getByRole("listbox", { name: "Ten thousand release records" });
  const options = listbox.getByRole("option");
  const renderedCount = await options.count();
  expect(renderedCount).toBeGreaterThan(0);
  expect(renderedCount).toBeLessThan(200);
  await expect(page.locator('[data-slot="listbox-selection-summary"]')).toContainText(
    "Record 9,000",
  );
  await expect(listbox.getByRole("option", { name: "Record 9,000", exact: true })).toHaveCount(0);

  await listbox.focus();
  await listbox.press("End");
  const last = listbox.getByRole("option", { name: "Record 10,000", exact: true });
  await expect(last).toBeVisible();
  await expect(last).toBeFocused();
  await expect(last).toHaveAttribute("aria-posinset", "10000");
  await expect(last).toHaveAttribute("aria-setsize", "10000");
  expect(await options.count()).toBeLessThan(200);
  expect(await axeViolations(page)).toEqual([]);

  // React Aria's bounded virtualizer must update its window after Firefox scrolls to End. Firefox
  // reports that intentional behavior as a page-level advisory even though focus, ARIA positions,
  // and the bounded DOM window above remain correct. Keep the exception local and exact so every
  // other warning or error still fails the runtime guard.
  await page.waitForTimeout(100);
  const messages = runtimeFailures.get(page) ?? [];
  const advisories = messages.filter(isFirefoxReactAriaVirtualizerAdvisory);
  expect(messages.filter((message) => !isFirefoxReactAriaVirtualizerAdvisory(message))).toEqual([]);
  if (browserName === "firefox") expect(advisories.length).toBeLessThanOrEqual(1);
  else expect(advisories).toEqual([]);
  messages.length = 0;
});

test("native and enhanced single Select serialize and restore their own platform defaults", async ({
  page,
}) => {
  await openStory(page, "native-form-and-reset", "Native and enhanced form parity");
  const form = page.getByRole("form", { name: "Native and enhanced Select parity" });
  const native = form.getByLabel("Platform release channel");
  await expect(native).toHaveJSProperty("multiple", false);
  await expect(native).toHaveAttribute("required", "");
  await expect(native).toHaveValue("stable");
  await native.selectOption("preview");

  const enhanced = selectRoot(page, "Enhanced release environment");
  await enhanced.locator('[data-slot="select-trigger"]').click();
  await page
    .locator('[data-slot="select-popover"]')
    .getByRole("option", { name: "Production", exact: true })
    .click();
  await form.getByRole("button", { name: "Inspect Select values" }).click();
  expect(parsePairs(await page.getByTestId("select-form-output").textContent())).toEqual([
    ["platform-channel", "preview"],
    ["enhanced-environment", "production"],
  ]);

  await form.getByRole("button", { name: "Restore Select defaults" }).click();
  await expect(native).toHaveValue("stable");
  await expect(enhanced.locator('[data-slot="select-value"]')).toHaveText("Staging");
  expect(await axeViolations(page)).toEqual([]);
});

test("required, invalid, read-only, disabled, and empty states remain semantically distinct", async ({
  page,
}) => {
  await openStory(page, "adverse-state-matrix", "Collection adverse-state rail");
  const invalidListbox = page.getByRole("listbox", { name: "Owning team" });
  await expect(invalidListbox).toHaveAttribute("aria-invalid", "true");
  await expect(invalidListbox).toHaveAttribute("aria-required", "true");
  await expect(
    page.getByRole("alert").filter({ hasText: "Choose one team before continuing." }),
  ).toBeVisible();

  const readOnly = page.getByRole("listbox", { name: "Approved team" });
  await expect(readOnly).toHaveAttribute("aria-readonly", "true");
  await expect(readOnly.getByRole("option", { name: "Release engineering" })).toHaveAttribute(
    "aria-selected",
    "true",
  );
  await readOnly.getByRole("option", { name: "Accessibility" }).click();
  await expect(readOnly.getByRole("option", { name: "Release engineering" })).toHaveAttribute(
    "aria-selected",
    "true",
  );

  const disabled = page.getByRole("listbox", { name: "Archived owner" });
  await expect(disabled).toHaveAttribute("aria-disabled", "true");
  await expect(disabled.getByRole("option").first()).toHaveAttribute("aria-disabled", "true");
  await expect(selectRoot(page, "Release environment")).toHaveAttribute("data-invalid", "true");
  await expect(selectRoot(page, "No matching environment").locator("button")).toBeEnabled();
  await expect(selectRoot(page, "Locked channel").locator("button")).toBeDisabled();
  expect(await axeViolations(page)).toEqual([]);
});

test("German expansion and Arabic RTL survive 320px, forced colors, reduced motion, and touch", async ({
  browserName,
  page,
}) => {
  await page.setViewportSize({ height: 780, width: 320 });
  await openStory(page, "german-expansion", "Lange deutsche Sammlungsbezeichnungen");
  const germanSelect = page.locator('[data-slot="select"]').first();
  const germanTrigger = germanSelect.locator('[data-slot="select-trigger"]');
  await germanTrigger.click();
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth - innerWidth),
  ).toBeLessThanOrEqual(0);
  expect(await axeViolations(page)).toEqual([]);
  await page.keyboard.press("Escape");
  await expect(page.locator('[data-slot="select-popover"]')).toBeHidden();
  await expect(germanTrigger).toBeFocused();

  await page.emulateMedia({ forcedColors: "active", reducedMotion: "reduce" });
  await openStory(page, "right-to-left-and-narrow", /مجموعة خيارات/u);
  const provider = page.locator('[data-slot="provider"]');
  await expect(provider).toHaveAttribute("dir", "rtl");
  await expect(provider).toHaveAttribute("lang", "ar-EG");
  const rtlListbox = page.getByRole("listbox").first();
  const rtlOptions = rtlListbox.getByRole("option");
  await rtlOptions.first().click();
  await expect(rtlOptions.first()).toHaveAttribute("aria-selected", "true");

  const enhanced = page.locator('[data-slot="select"][data-presentation="enhanced"]');
  await enhanced.locator('[data-slot="select-trigger"]').click();
  await page.locator('[data-slot="select-popover"]').getByRole("option").nth(1).click();
  const native = page.locator('[data-slot="select"][data-presentation="native"] select');
  await native.selectOption("cairo");
  await expect(native).toHaveValue("cairo");

  const undersized = await page
    .locator(
      '[data-slot="listbox-item"], [data-slot="select-trigger"], [data-slot="native-select"]',
    )
    .evaluateAll((targets) =>
      targets
        .map((target) => {
          const box = target.getBoundingClientRect();
          return { height: box.height, slot: target.getAttribute("data-slot"), width: box.width };
        })
        .filter(({ height, width }) => height < 44 || width < 44),
    );
  expect(undersized).toEqual([]);
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth - innerWidth),
  ).toBeLessThanOrEqual(0);
  expect(await axeViolations(page, { ignoreColorContrast: browserName !== "chromium" })).toEqual(
    [],
  );
});

test("coarse-pointer touch opens and commits an enhanced Select without keyboard synthesis", async ({
  baseURL,
  browser,
}) => {
  if (baseURL === undefined) throw new Error("The collection browser suite requires a base URL.");
  const context = await browser.newContext({
    ...devices["Pixel 7"],
    baseURL,
    hasTouch: true,
  });
  const touchPage = await context.newPage();
  const failures = guardRuntime(touchPage);
  try {
    await openStory(touchPage, "native-form-and-reset", "Native and enhanced form parity");
    expect(await touchPage.evaluate(() => matchMedia("(pointer: coarse)").matches)).toBe(true);
    const enhanced = selectRoot(touchPage, "Enhanced release environment");
    await enhanced.locator('[data-slot="select-trigger"]').tap();
    await touchPage
      .locator('[data-slot="select-popover"]')
      .getByRole("option", { name: "Production", exact: true })
      .tap();
    await expect(enhanced.locator('[data-slot="select-value"]')).toHaveText("Production");
    expect(failures).toEqual([]);
  } finally {
    await context.close();
  }
});
