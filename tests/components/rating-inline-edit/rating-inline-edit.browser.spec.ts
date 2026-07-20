import { resolve } from "node:path";
import { expect, test, type Locator, type Page } from "@playwright/test";

const axePath = resolve(
  import.meta.dirname,
  "../../../packages/test-utils/node_modules/axe-core/axe.min.js",
);
const runtimeFailures = new WeakMap<Page, string[]>();

test.use({ hasTouch: true });

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
  await page.goto(`/iframe.html?viewMode=story&id=p4-rating-and-inline-edit--${story}`, {
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

function radio(page: Page | Locator, name: string): Locator {
  return page.getByRole("radio", { exact: true, name });
}

test("basic and recommended review modes keep clear and save-on-blur behavior independent", async ({
  page,
}) => {
  await openStory(page, "basic-defaults", "Mergora review controls");
  const basicGroup = page.getByRole("group", { name: "Documentation quality" });
  await expect(basicGroup.getByRole("radio")).toHaveCount(5);
  await expect(basicGroup.getByRole("radio", { name: "No rating" })).toHaveCount(0);
  await page.getByRole("button", { name: "Edit Review note" }).click();
  const basicEditor = page.getByRole("textbox", { name: "Review note" });
  await basicEditor.fill("Draft remains explicit");
  await page.getByRole("heading", { name: "Mergora review controls" }).click();
  await expect(basicEditor).toBeVisible();
  await expect(basicEditor).toHaveValue("Draft remains explicit");

  await openStory(page, "recommended-mergora", "Mergora review controls");
  const enhancedGroup = page.getByRole("group", { name: "Documentation quality" });
  await expect(enhancedGroup.getByRole("radio")).toHaveCount(6);
  await expect(enhancedGroup.getByRole("radio", { name: "No rating" })).toBeVisible();
  await page.getByRole("button", { name: "Edit Review note" }).click();
  const enhancedEditor = page.getByRole("textbox", { name: "Review note" });
  await enhancedEditor.fill("Saved when focus leaves");
  await page.getByRole("heading", { name: "Mergora review controls" }).click();
  await expect(page.getByText("Saved when focus leaves", { exact: true })).toBeVisible();
  await expect(page.getByTestId("inline-mode-saved-value")).toHaveText(
    "Saved inline value: Saved when focus leaves",
  );
  expect(await axeViolations(page)).toEqual([]);
});

test("editable ratings keep radio, keyboard, touch, controlled, form, and reset state aligned", async ({
  page,
}) => {
  await openStory(page, "rating-workbench", "Rating selection workbench");
  const form = page.getByRole("form", { name: "Rating selection workbench" });
  const qualityGroup = form.getByRole("group", { name: "Implementation quality" });
  const fourth = radio(qualityGroup, "4 out of 5");
  const fifth = radio(qualityGroup, "5 out of 5");
  const clear = radio(qualityGroup, "No rating");
  await expect(qualityGroup.getByRole("radio")).toHaveCount(6);
  await expect(fourth).toBeChecked();
  await fourth.focus();
  await fourth.press("ArrowRight");
  await expect(fifth).toBeChecked();
  await fifth.press("Home");
  await expect(clear).toBeChecked();

  await form.getByRole("button", { name: "Inspect rating values" }).click();
  expect(JSON.parse((await page.getByTestId("rating-form-output").textContent()) ?? "{}")).toEqual({
    "documentation-clarity": "3",
    "implementation-quality": "",
  });

  const controlledGroup = form.getByRole("group", { name: "Documentation clarity" });
  await radio(controlledGroup, "5 out of 5").click();
  await expect(page.getByTestId("controlled-rating-output")).toHaveText("Controlled rating: 5");
  await expect(radio(controlledGroup, "5 out of 5")).toBeChecked();

  const touchTarget = radio(qualityGroup, "2 out of 5").locator("..");
  const bounds = await touchTarget.boundingBox();
  expect(bounds).not.toBeNull();
  if (bounds !== null) {
    expect(bounds.width).toBeGreaterThanOrEqual(44);
    expect(bounds.height).toBeGreaterThanOrEqual(44);
    await touchTarget.tap();
    await expect(radio(qualityGroup, "2 out of 5")).toBeChecked();
  }

  await form.getByRole("button", { name: "Restore rating defaults" }).click();
  await expect(fourth).toBeChecked();
  await expect(radio(controlledGroup, "5 out of 5")).toBeChecked();
  expect(await axeViolations(page)).toEqual([]);
});

test("required, invalid, disabled, empty, and fractional read-only ratings stay semantically distinct", async ({
  page,
}) => {
  await openStory(page, "rating-state-matrix", "Rating state rail");
  const form = page.getByRole("form", { name: "Rating state samples" });
  const requiredSection = page.getByRole("region", { name: "Required empty rating" });
  const requiredGroup = requiredSection.getByRole("group", { name: /Release confidence/u });
  await expect(requiredGroup.getByRole("radio")).toHaveCount(5);
  for (const input of await requiredGroup.getByRole("radio").all()) {
    await expect(input).toHaveAttribute("required", "");
    await expect(input).toHaveAttribute("aria-invalid", "true");
  }
  const readOnlySection = page.getByRole("region", { name: "Read-only fractional rating" });
  await expect(readOnlySection.getByText("4.5 out of 5")).toBeVisible();
  await expect(readOnlySection.getByRole("radio")).toHaveCount(0);
  const emptySection = page.getByRole("region", { name: "Read-only empty rating" });
  await expect(emptySection.getByText("No rating")).toBeVisible();
  await expect(emptySection.locator('input[name="first-review"]')).toHaveCount(0);
  const disabledSection = page.getByRole("region", { name: "Disabled rating" });
  await expect(disabledSection.getByRole("radio").first()).toBeDisabled();
  const formValues = await form.evaluate((node) =>
    Object.fromEntries(
      [...new FormData(node as HTMLFormElement).entries()].map(([name, entry]) => [
        name,
        String(entry),
      ]),
    ),
  );
  expect(formValues).toEqual({
    "review-average": "4.5",
    "verification-result": "2",
  });
  expect(await axeViolations(page)).toEqual([]);
});

test("Inline Edit preserves drafts, separates input and textarea keys, and restores focus", async ({
  page,
}) => {
  await openStory(page, "inline-edit-workbench", "Explicit view and edit transitions");
  const editFeature = page.getByRole("button", { name: "Edit feature name" });
  await editFeature.click();
  const feature = page.getByRole("textbox", { name: "Feature name" });
  await expect(feature).toBeFocused();
  await feature.fill("Contract Audit");
  await feature.press("Escape");
  await expect(page.getByText("Quality Passport", { exact: true })).toBeVisible();
  await expect(editFeature).toBeFocused();

  await editFeature.click();
  await feature.fill("Contract Audit");
  await feature.press("Enter");
  await expect(page.getByText("Contract Audit", { exact: true })).toBeVisible();
  await expect(page.getByRole("status").filter({ hasText: "Changes saved." })).toBeVisible();
  await expect(editFeature).toBeFocused();

  await editFeature.click();
  await feature.fill("IME-safe title");
  await feature.dispatchEvent("compositionstart", { data: "あ" });
  await feature.press("Enter");
  await expect(feature).toBeVisible();
  await expect(feature).toHaveValue("IME-safe title");
  await feature.dispatchEvent("compositionend", { data: "あ" });
  await feature.press("Enter");
  await expect(page.getByText("IME-safe title", { exact: true })).toBeVisible();

  const editNote = page.getByRole("button", { name: "Edit evidence note" });
  await editNote.click();
  const note = page.getByRole("textbox", { name: "Evidence note" });
  await note.fill("First line");
  await note.press("Enter");
  await expect(note).toBeVisible();
  await expect(note).toHaveValue("First line\n");
  await note.press("Control+Enter");
  await expect(page.getByText("First line", { exact: true })).toBeVisible();
  await expect(editNote).toBeFocused();

  await editFeature.click();
  await feature.fill("Draft retained after blur");
  await editNote.click();
  await expect(feature).toHaveValue("Draft retained after blur");
  expect(await axeViolations(page)).toEqual([]);
});

test("async failure retains the draft, blocks duplicate saves, recovers, and rejects stale controlled commits", async ({
  page,
}) => {
  await openStory(page, "async-failure-and-recovery", "Async failure and recovery");
  await page.getByRole("button", { name: "Edit product summary" }).click();
  const summary = page.getByRole("textbox", { name: "Product summary" });
  await summary.fill("fail this prepared save");
  const actions = summary.locator("xpath=following-sibling::*[@data-slot='inline-edit-actions']");
  const save = actions.getByRole("button", { name: "Save" });
  await save.click();
  const pendingSave = actions.getByRole("button", { name: "Saving changes" });
  await expect(pendingSave).toHaveAttribute("aria-disabled", "true");
  await pendingSave.click({ force: true });
  await expect(page.getByTestId("save-attempts")).toHaveText("Save attempts: 1");
  await expect(page.getByRole("alert")).toHaveText(
    "The prepared save failed. Your draft is still available.",
  );
  await expect(summary).toHaveValue("fail this prepared save");
  await expect(summary).toBeFocused();

  await summary.fill("Recovered evidence summary");
  await actions.getByRole("button", { name: "Save" }).click();
  await expect(page.getByText("Recovered evidence summary", { exact: true })).toBeVisible();
  await expect(page.getByTestId("save-attempts")).toHaveText("Save attempts: 2");
  await expect(page.getByTestId("saved-values")).toContainText("Recovered evidence summary");

  await page.getByRole("button", { name: "Edit controlled title" }).click();
  const controlled = page.getByRole("textbox", { name: "Controlled title" });
  await controlled.fill("Local draft title");
  await page.getByRole("button", { name: "Apply external update" }).click();
  await expect(controlled).toHaveValue("Local draft title");
  await controlled
    .locator("xpath=following-sibling::*[@data-slot='inline-edit-actions']")
    .getByRole("button", { name: "Save" })
    .click();
  await expect(page.getByRole("alert")).toContainText("changed while you were editing");
  await expect(controlled).toHaveValue("Local draft title");
  await expect(page.getByTestId("server-value")).toHaveText(
    "Server value: Externally revised title",
  );
  expect(await axeViolations(page)).toEqual([]);
});

test("FormData uses only saved Inline Edit values and native reset restores the default", async ({
  page,
}) => {
  await openStory(page, "form-serialization-and-reset", "Saved-value serialization and reset");
  const form = page.getByRole("form", { name: "Inline Edit form workbench" });
  await form.getByRole("button", { name: "Inspect saved values" }).click();
  expect(JSON.parse((await page.getByTestId("inline-form-output").textContent()) ?? "{}")).toEqual({
    "display-name": "Akhil",
    "release-owner": "Published by the release pipeline",
  });

  await form.getByRole("button", { name: "Edit display name" }).click();
  const editor = form.getByRole("textbox", { name: "Display name" });
  await editor.fill("Unsaved draft");
  await form.getByRole("button", { name: "Inspect saved values" }).click();
  expect(
    JSON.parse((await page.getByTestId("inline-form-output").textContent()) ?? "{}"),
  ).toMatchObject({ "display-name": "Akhil" });
  await editor
    .locator("xpath=following-sibling::*[@data-slot='inline-edit-actions']")
    .getByRole("button", { name: "Save" })
    .click();
  await form.getByRole("button", { name: "Inspect saved values" }).click();
  expect(
    JSON.parse((await page.getByTestId("inline-form-output").textContent()) ?? "{}"),
  ).toMatchObject({ "display-name": "Unsaved draft" });

  await form.getByRole("button", { name: "Restore saved defaults" }).click();
  await expect(form.getByText("Akhil", { exact: true })).toBeVisible();
  await form.getByRole("button", { name: "Inspect saved values" }).click();
  expect(
    JSON.parse((await page.getByTestId("inline-form-output").textContent()) ?? "{}"),
  ).toMatchObject({ "display-name": "Akhil" });
  await expect(form.locator('input[name="release-owner"]')).toHaveValue(
    "Published by the release pipeline",
  );
  await expect(form.locator('input[name="disabled-note"]')).toBeDisabled();
  expect(await axeViolations(page)).toEqual([]);
});

test("RTL, forced colors, reduced motion, narrow reflow, and touch targets remain operable", async ({
  page,
}) => {
  await page.emulateMedia({ forcedColors: "active", reducedMotion: "reduce" });
  await openStory(page, "right-to-left", "اختبار الاتجاه من اليمين إلى اليسار");
  const rtlGroup = page.getByRole("group", { name: "جودة التوثيق" });
  const third = radio(rtlGroup, "٣ من ٥");
  const fourth = radio(rtlGroup, "٤ من ٥");
  await expect(third).toBeChecked();
  await third.focus();
  await third.press("ArrowLeft");
  await expect(fourth).toBeChecked();
  await fourth.press("ArrowRight");
  await expect(third).toBeChecked();
  await page.getByRole("button", { name: "تعديل الوصف" }).click();
  const rtlEditor = page.getByRole("textbox", { name: "الوصف" });
  await rtlEditor.fill("وصف محدث");
  await rtlEditor.press("Enter");
  await expect(page.getByText("وصف محدث", { exact: true })).toBeVisible();
  expect(await axeViolations(page)).toEqual([]);

  await page.setViewportSize({ height: 720, width: 320 });
  await openStory(page, "narrow-touch", "Narrow touch specimen");
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - innerWidth);
  expect(overflow).toBeLessThanOrEqual(0);
  const undersized = await page
    .locator('[data-slot="rating-option"], [data-slot="rating-clear"], [data-slot="button"]')
    .evaluateAll((targets) =>
      targets
        .map((target) => {
          const box = target.getBoundingClientRect();
          return { height: box.height, slot: target.getAttribute("data-slot"), width: box.width };
        })
        .filter(({ height, width }) => height < 44 || width < 44),
    );
  expect(undersized).toEqual([]);
  await page.getByRole("button", { name: "Edit mobile note" }).click();
  await expect(page.getByRole("textbox", { name: "Mobile note" })).toBeVisible();
  expect(await axeViolations(page)).toEqual([]);
});
