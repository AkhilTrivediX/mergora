import { resolve } from "node:path";

import { expect, test, type Page } from "@playwright/test";

const axePath = resolve(
  import.meta.dirname,
  "../../../packages/test-utils/node_modules/axe-core/axe.min.js",
);

async function openStory(page: Page, id: string): Promise<void> {
  await page.goto(`/iframe.html?viewMode=story&id=kits-settings-workspace--${id}`, {
    waitUntil: "domcontentloaded",
  });
  await expect(page.locator('[data-slot="settings-workspace"]').first()).toBeVisible();
}

async function axeViolations(page: Page): Promise<unknown[]> {
  await page.addScriptTag({ path: axePath });
  return page.evaluate(async () => {
    const axe = (globalThis as unknown as { axe: { run(): Promise<{ violations: unknown[] }> } })
      .axe;
    for (let attempt = 0; attempt < 40; attempt += 1) {
      try {
        return (await axe.run()).violations;
      } catch (error) {
        if (!(error instanceof Error) || !error.message.includes("Axe is already running")) {
          throw error;
        }
        await new Promise((resolveDelay) => setTimeout(resolveDelay, 50));
      }
    }
    throw new Error("Axe did not become available after the Storybook accessibility check.");
  });
}

test("settings protection is absent by default and recommended mode gates navigation and destruction", async ({
  page,
}) => {
  await openStory(page, "basic-settings-workspace");
  await expect(page.locator('[data-slot="settings-unsaved-prompt"]')).toHaveCount(0);
  await expect(page.locator('[data-slot="settings-destructive"]')).toHaveCount(0);
  expect(await axeViolations(page)).toEqual([]);

  await openStory(page, "recommended-settings-workspace");
  await page.getByRole("textbox", { name: "Display name" }).fill("Mina Park");
  const preferencesTrigger = page.getByRole("button", { name: /Preferences/u });
  await preferencesTrigger.click();
  const prompt = page.getByRole("alertdialog", { name: "Keep unsaved changes?" });
  await expect(prompt).toBeFocused();
  await page.getByRole("button", { name: "Stay here" }).click();
  await expect(preferencesTrigger).toBeFocused();
  await preferencesTrigger.click();
  await expect(prompt).toBeFocused();
  await page.getByRole("button", { name: "Discard and continue" }).click();
  await expect(preferencesTrigger).toBeFocused();
  await expect(preferencesTrigger).toHaveAttribute("aria-current", "page");
  await expect(page.getByRole("heading", { name: "Preferences" }).last()).toBeVisible();
  await page.getByRole("button", { name: "Review account removal" }).click();
  const confirm = page.getByRole("button", { name: "Confirm account removal" });
  await expect(confirm).toBeDisabled();
  await page.getByRole("textbox", { name: "Confirmation text" }).fill("REMOVE");
  await expect(confirm).toBeEnabled();
  expect(await axeViolations(page)).toEqual([]);
});

test("uncontrolled and controlled dirty state reconcile with native reset", async ({ page }) => {
  await openStory(page, "settings-form-lifecycle");
  const lifecycleValue = page.getByRole("textbox", { name: "Profile value" });
  await expect(lifecycleValue).toHaveValue("Readable setting");
  await lifecycleValue.fill("Changed setting");
  await expect(page.locator('[data-slot="settings-workspace"]')).toHaveAttribute(
    "data-dirty",
    "true",
  );
  await page.getByRole("button", { name: "Reset section" }).click();
  await expect(lifecycleValue).toHaveValue("Readable setting");
  await expect(page.locator('[data-slot="settings-workspace"]')).not.toHaveAttribute(
    "data-dirty",
    "true",
  );

  await openStory(page, "controlled-settings-workspace");
  const controlledValue = page.getByRole("textbox", { name: "Preferences note" });
  await controlledValue.fill("Changed controlled value");
  await expect(page.getByText(/dirty: yes/u)).toBeVisible();
  await page.getByRole("button", { name: "Reset section" }).click();
  await expect(page.getByText(/dirty: no/u)).toBeVisible();
  await expect(controlledValue).toHaveValue("Controlled example");
  expect(await axeViolations(page)).toEqual([]);
});

test("read-only settings cancel reset and repeated instances own their dialog labels", async ({
  page,
}) => {
  await openStory(page, "settings-state-matrix");
  const workspaces = page.locator('[data-slot="settings-workspace"]');
  const readOnlyWorkspace = workspaces.nth(1);
  const readOnlyValue = readOnlyWorkspace.getByRole("textbox", { name: "Profile value" });
  await readOnlyValue.evaluate((element) => {
    (element as HTMLInputElement).value = "Preserved setting";
  });
  await expect(readOnlyWorkspace.getByRole("button", { name: "Reset section" })).toBeDisabled();
  await readOnlyWorkspace.evaluate((element) => (element as HTMLFormElement).reset());
  await expect(readOnlyValue).toHaveValue("Preserved setting");
  await expect(readOnlyWorkspace).toHaveAttribute("data-dirty", "true");
  await expect(page.locator('[data-slot="settings-readonly-events"]')).toHaveText(
    "Read-only reset events: 0; dirty events: 0",
  );

  await readOnlyWorkspace.getByRole("button", { name: /Preferences/u }).click();
  await workspaces
    .nth(2)
    .getByRole("button", { name: /Preferences/u })
    .click();
  await expect(page.getByRole("alertdialog", { name: /keep unsaved changes/iu })).toHaveCount(2);
  const idAudit = await page.evaluate(() => {
    const root = [...document.querySelectorAll('[data-slot="settings-workspace"]')];
    const ids = root.flatMap((workspace) =>
      [...workspace.querySelectorAll<HTMLElement>("[id]")].map((element) => element.id),
    );
    const references = root.flatMap((workspace) =>
      [...workspace.querySelectorAll<HTMLElement>("[aria-labelledby]")].map((element) =>
        element.getAttribute("aria-labelledby"),
      ),
    );
    return {
      ids,
      missingReferences: references.filter(
        (reference) => reference === null || document.getElementById(reference) === null,
      ),
    };
  });
  expect(new Set(idAudit.ids).size).toBe(idAudit.ids.length);
  expect(idAudit.missingReferences).toEqual([]);
  expect(await axeViolations(page)).toEqual([]);
});

test("narrow RTL, reduced motion, and forced colors preserve settings navigation", async ({
  browser,
}) => {
  const context = await browser.newContext({
    forcedColors: "active",
    hasTouch: true,
    reducedMotion: "reduce",
    viewport: { height: 720, width: 320 },
  });
  const page = await context.newPage();
  await openStory(page, "narrow-rtl-settings");
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth - innerWidth),
  ).toBeLessThanOrEqual(1);
  await expect(page.getByRole("navigation", { name: "Settings sections" })).toBeVisible();
  const touchTarget = await page
    .locator('[data-slot="settings-navigation"] button')
    .first()
    .boundingBox();
  expect(touchTarget?.height ?? 0).toBeGreaterThanOrEqual(44);
  expect(await axeViolations(page)).toEqual([]);
  await context.close();
});
