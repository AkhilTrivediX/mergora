import { resolve } from "node:path";
import { devices, expect, test, type ConsoleMessage, type Page } from "@playwright/test";

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
    )
      failures.push(`console.${message.type()}: ${message.text()}`);
  });
  page.on("pageerror", (error) => failures.push(`pageerror: ${error.message}`));
  return failures;
}

test.beforeEach(({ page }) => guardRuntime(page));
test.afterEach(({ page }) => expect(runtimeFailures.get(page) ?? []).toEqual([]));

async function openStory(page: Page, story: string, heading: string | RegExp): Promise<void> {
  await page.goto(`/iframe.html?viewMode=story&id=p5-advanced-collections--${story}`, {
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
      for (let attempt = 0; attempt < 20; attempt += 1) {
        try {
          return (await axe.run(document.body, runOptions)).violations;
        } catch (error) {
          if (!(error instanceof Error) || !error.message.includes("already running")) throw error;
          await new Promise((resolveDelay) => setTimeout(resolveDelay, 50));
        }
      }
      throw new Error("Axe remained busy after the Storybook accessibility pass completed.");
    },
    { ignoreColorContrast },
  );
}

test("basic stories remove every optional enhancement while recommended stories expose only the selected advantage", async ({
  page,
}) => {
  const cases = [
    ["autocomplete", "autocomplete-match-context"],
    ["command-palette", "command-palette-execution-preview"],
    ["creatable-select", "creatable-select-canonical-preview"],
    ["mention-field", "mention-field-summary"],
    ["multi-select", "multi-select-selection-summary"],
    ["tags-input", "tags-input-duplicate-recovery"],
    ["transfer-list", "transfer-list-summary"],
  ] as const;
  for (const [story, slot] of cases) {
    await openStory(page, `basic-${story}`, "Advanced collection workbench");
    await expect(page.locator(`[data-slot="${slot}"]`)).toHaveCount(0);
    await expect(page.locator('[aria-live="polite"]')).toHaveCount(0);
    await openStory(page, `recommended-${story}`, "Advanced collection workbench");
    await expect(page.locator(`[data-slot="${slot}"]`)).toHaveCount(1);
  }
  expect(await axeViolations(page)).toEqual([]);
});

test("keyboard combobox, mention, and command flows commit once with semantic state", async ({
  page,
}) => {
  await openStory(page, "recommended-autocomplete", "Advanced collection workbench");
  const autocomplete = page.getByRole("combobox", { name: "Find a catalog area" });
  await autocomplete.fill("comp");
  await autocomplete.press("ArrowDown");
  await expect(autocomplete).toHaveAttribute("aria-activedescendant", /components/u);
  await autocomplete.press("Enter");
  await expect(autocomplete).toHaveValue("Components");

  await openStory(page, "recommended-mention-field", "Advanced collection workbench");
  const note = page.getByLabel("Review note");
  await note.fill("Check @comp");
  await note.press("ArrowDown");
  await note.press("Enter");
  await expect(note).toHaveValue("Check @Components ");
  await expect(page.locator('[data-slot="mention-field-summary"]')).toContainText(
    "1 recognized mention",
  );

  await openStory(page, "basic-command-palette", "Advanced collection workbench");
  const commandSearch = page.getByRole("combobox", { name: "Search commands" });
  await commandSearch.dispatchEvent("compositionstart", { data: "evidence" });
  await commandSearch.press("Enter");
  await expect(page.getByRole("dialog")).toBeVisible();
  await commandSearch.dispatchEvent("compositionend", { data: "evidence" });
  await commandSearch.fill("evidence");
  await commandSearch.press("ArrowDown");
  await expect(commandSearch).toHaveAttribute("aria-activedescendant", /review-evidence/u);
  await commandSearch.press("Enter");
  await expect(page.getByRole("dialog")).toHaveCount(0);
  expect(await axeViolations(page)).toEqual([]);
});

test("controlled values serialize repeatedly and reset to explicit defaults", async ({ page }) => {
  await openStory(page, "controlled-and-forms", "Controlled collection form");
  const form = page.getByRole("form", { name: "Advanced collection form" });

  const multi = form.getByRole("combobox", { name: "Additional areas" });
  await multi.click();
  await form
    .locator('[data-slot="multi-select"] [role="listbox"]')
    .getByRole("option", { name: /Components/u })
    .click();

  const tags = form.getByRole("textbox", { name: "Evidence tags" });
  await tags.fill("responsive");
  await tags.press("Enter");

  const source = form.getByRole("listbox", { name: "Available" });
  await source.selectOption("components");
  await form.getByRole("button", { name: "Move selected to Included" }).click();

  await form.getByRole("button", { name: "Inspect form values" }).click();
  const submitted = JSON.parse(
    (await page.getByTestId("advanced-form-output").textContent()) ?? "[]",
  ) as string[][];
  expect(submitted).toEqual([
    ["primary", "components"],
    ["areas", "tokens"],
    ["areas", "components"],
    ["tags", "keyboard"],
    ["tags", "responsive"],
    ["scope", "evidence"],
    ["scope", "components"],
  ]);

  await form.getByRole("button", { name: "Restore defaults" }).click();
  await expect(page.getByTestId("advanced-form-output")).toHaveText("Defaults restored.");
  await expect(form.locator('input[name="areas"]')).toHaveCount(1);
  await expect(form.locator('input[name="tags"]')).toHaveCount(1);
  await expect(form.locator('input[name="scope"]')).toHaveCount(1);
  expect(await axeViolations(page)).toEqual([]);
});

test("duplicate recovery is opt-in, focusable, and callback-free when disabled", async ({
  page,
}) => {
  await openStory(page, "recommended-tags-input", "Advanced collection workbench");
  const enhanced = page.getByRole("textbox", { name: "Evidence tags" });
  await enhanced.fill("KEYBOARD");
  await enhanced.press("Enter");
  const remove = page.getByRole("button", { name: "Remove keyboard" });
  await expect(remove).toBeFocused();
  await expect(page.locator('[data-slot="tags-input-duplicate-recovery"]')).toContainText(
    "already included",
  );

  await openStory(page, "basic-tags-input", "Advanced collection workbench");
  const basic = page.getByRole("textbox", { name: "Evidence tags" });
  await basic.fill("KEYBOARD");
  await basic.press("Enter");
  await expect(page.locator('[data-slot="tags-input-duplicate-recovery"]')).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Remove keyboard" })).not.toBeFocused();
});

test("catalog capabilities remain independently operable across nested, bounded, pasted, entity, and transfer flows", async ({
  page,
}) => {
  await openStory(page, "catalog-capabilities", "Catalog capability evidence");

  const commandRegion = page.getByRole("region", { name: "Catalog commands" });
  const commandSearch = commandRegion.getByRole("combobox", { name: "Search commands" });
  await commandSearch.fill("catalog");
  await commandSearch.press("ArrowDown");
  await commandSearch.press("Enter");
  const childRegion = page.getByRole("region", { name: "Catalog pages" });
  await expect(childRegion.getByRole("heading", { name: "Catalog pages" })).toBeVisible();
  const childSearch = childRegion.getByRole("combobox", { name: "Search commands" });
  await childSearch.fill("components");
  await childSearch.press("ArrowDown");
  await childSearch.press("Enter");
  await expect(page.getByTestId("catalog-capability-output")).toHaveText(
    "Navigated to Open components.",
  );

  await expect(page.getByText("2 more selected")).toBeVisible();
  const boundedSelect = page.getByRole("combobox", { name: "Bounded review areas" });
  await boundedSelect.click();
  await expect(
    page.locator('[data-slot="multi-select"]').getByRole("option", { name: /Documentation/u }),
  ).toHaveAttribute("aria-disabled", "true");
  await boundedSelect.press("Escape");

  const tags = page.getByRole("textbox", { name: "Ordered evidence tags" });
  await tags.evaluate((input) => {
    const paste = new Event("paste", { bubbles: true, cancelable: true });
    Object.defineProperty(paste, "clipboardData", {
      value: { getData: (format: string) => (format === "text" ? "audit;touch" : "") },
    });
    input.dispatchEvent(paste);
  });
  await expect(page.getByRole("button", { name: "Remove audit" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Remove touch" })).toBeVisible();
  await page.getByRole("button", { name: "Move responsive earlier" }).click();
  await expect(
    page.locator('[aria-label="Ordered evidence tags values"] > li > span:first-child').first(),
  ).toHaveText("responsive");

  const create = page.getByRole("combobox", { name: "Async catalog label" });
  const createRoot = page.locator('[data-slot="creatable-select"]');
  await create.fill("Pending catalog label");
  await create.press("ArrowDown");
  await create.press("Enter");
  await expect(createRoot.locator(".mrg-creatable-select__lifecycle")).toContainText(
    "Creating Pending catalog label",
  );
  await createRoot.getByRole("button", { name: "Cancel creation" }).click();
  await expect(
    createRoot.getByRole("alert").filter({ hasText: "Creation cancelled." }),
  ).toBeVisible();
  await expect(page.getByTestId("catalog-capability-output")).toHaveText(
    "Aborted Pending catalog label.",
  );
  await create.fill("Confirmed catalog label");
  await create.press("ArrowDown");
  await create.press("Enter");
  await expect(page.getByTestId("catalog-capability-output")).toHaveText(
    "create: Confirmed catalog label.",
  );

  const mention = page.getByRole("textbox", { name: "Entity-aware note" });
  await mention.evaluate((input) => {
    input.dispatchEvent(new CompositionEvent("compositionstart", { bubbles: true, data: "#acc" }));
    const setValue = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")?.set;
    setValue?.call(input, "#acc");
    input.dispatchEvent(
      new InputEvent("input", {
        bubbles: true,
        data: "#acc",
        inputType: "insertCompositionText",
        isComposing: true,
      }),
    );
  });
  await expect(page.getByRole("option", { name: /Accessibility/u })).toHaveCount(0);
  await mention.evaluate((input) =>
    input.dispatchEvent(new CompositionEvent("compositionend", { bubbles: true, data: "#acc" })),
  );
  await expect(page.getByRole("option", { name: /Accessibility/u })).toBeVisible();
  const mentionCombobox = page.getByRole("combobox", { name: "Entity-aware note" });
  await mentionCombobox.press("ArrowDown");
  await mentionCombobox.press("Enter");
  await expect(page.getByRole("textbox", { name: "Entity-aware note" })).toHaveValue(
    "#Accessibility ",
  );

  const sourceFilter = page.getByRole("searchbox", { name: "Filter Available" });
  await sourceFilter.fill("components");
  const source = page.getByRole("listbox", { name: "Available" });
  await expect(source.getByRole("option", { name: /Components/u })).toBeVisible();
  await source.selectOption("components");
  await source.press("Alt+ArrowRight");
  await expect
    .poll(() =>
      page
        .getByRole("listbox", { name: "Included" })
        .locator("option")
        .evaluateAll((rows) => rows.map((row) => (row as HTMLOptionElement).value)),
    )
    .toEqual(["components", "evidence"]);
  expect(await axeViolations(page)).toEqual([]);
});

test("remote and async states expose busy, retry, and cancellable lifecycle semantics", async ({
  page,
}) => {
  await openStory(page, "async-remote-states", "Remote collection states");
  await expect(page.getByRole("combobox", { name: "Loading catalog areas" })).toHaveAttribute(
    "aria-busy",
    "true",
  );
  await expect(
    page.getByRole("alert").filter({ hasText: "Areas could not be loaded." }),
  ).toBeVisible();
  await expect(page.getByRole("region", { name: "Loading commands" })).toContainText(
    "Loading commands…",
  );
  await expect(page.getByLabel("Loading entity suggestions")).toHaveAttribute("aria-busy", "true");
  await expect(page.getByRole("status")).toContainText("Creating New catalog area");
  await expect(page.getByRole("button", { name: "Cancel creation" })).toBeVisible();
  expect(await axeViolations(page)).toEqual([]);
});

test("narrow RTL, forced colors, reduced motion, and coarse touch retain usable targets", async ({
  baseURL,
  browser,
  browserName,
}) => {
  if (baseURL === undefined) throw new Error("Advanced collection browser tests require baseURL.");
  const context = await browser.newContext({
    ...devices["Pixel 7"],
    baseURL,
    hasTouch: true,
    reducedMotion: "reduce",
    viewport: { height: 780, width: 320 },
  });
  const page = await context.newPage();
  const failures = guardRuntime(page);
  try {
    await openStory(page, "narrow-rtl-and-preferences", /مجموعة متقدمة/u);
    await page.emulateMedia({ forcedColors: "active", reducedMotion: "reduce" });
    const autocomplete = page.getByRole("combobox", { name: "البحث في الفهرس" });
    await autocomplete.tap();
    await autocomplete.fill("comp");
    const option = page.getByRole("option", { name: /Components/u }).first();
    await option.tap();
    await expect(autocomplete).toHaveValue("Components");

    const command = page.locator('[data-slot="command-palette"]');
    const commandSearch = command.getByRole("combobox", { name: "Search commands" });
    await commandSearch.fill("evidence");
    const reviewEvidence = command.getByRole("option", { name: /Review evidence/u });
    await reviewEvidence.tap();

    const creatable = page.locator('[data-slot="creatable-select"]');
    const createInput = creatable.getByRole("combobox", { name: "Catalog label" });
    await createInput.fill("components");
    const componentsOption = creatable.getByRole("option", { name: /Components/u });
    await componentsOption.tap();
    await expect(createInput).toHaveValue("Components");

    const mention = page.locator('[data-slot="mention-field"]');
    const mentionInput = mention.getByLabel("Review note");
    await mentionInput.fill("Review @comp");
    const mentionOption = mention.getByRole("option", { name: /Components/u });
    await mentionOption.tap();
    await expect(mentionInput).toHaveValue("Review @Components ");

    const tags = page.locator('[data-slot="tags-input"]');
    const removeResponsive = tags.getByRole("button", { name: "Remove responsive" });
    await removeResponsive.tap();
    await expect(removeResponsive).toHaveCount(0);
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth - innerWidth),
    ).toBeLessThanOrEqual(0);
    const undersized = await page
      .locator('button, input, select, [role="option"]')
      .evaluateAll((nodes) =>
        nodes
          .map((node) => {
            const box = node.getBoundingClientRect();
            return { height: box.height, width: box.width };
          })
          .filter(({ height, width }) => height > 0 && width > 0 && (height < 40 || width < 40)),
      );
    expect(undersized).toEqual([]);
    expect(await axeViolations(page, { ignoreColorContrast: browserName !== "chromium" })).toEqual(
      [],
    );
    expect(failures).toEqual([]);
  } finally {
    await context.close();
  }
});
