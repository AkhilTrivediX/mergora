import { resolve } from "node:path";

import { expect, test, type Page } from "@playwright/test";

const axePath = resolve(
  import.meta.dirname,
  "../../../packages/test-utils/node_modules/axe-core/axe.min.js",
);

async function openStory(page: Page, id: string): Promise<void> {
  await page.goto(`/iframe.html?viewMode=story&id=kits-onboarding-wizard--${id}`, {
    waitUntil: "domcontentloaded",
  });
  await expect(page.locator('[data-slot="onboarding-wizard"]').first()).toBeVisible();
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

test("onboarding baseline removes enhancements while recommended mode recovers validation and persists", async ({
  page,
}) => {
  await openStory(page, "basic-onboarding-wizard");
  await expect(page.locator('[data-slot="onboarding-persistence"]')).toHaveCount(0);
  await expect(page.locator('[data-slot="stepper-progress"]')).toHaveCount(0);
  await expect(page.locator('[data-slot="stepper-announcement"]')).toHaveCount(0);
  expect(await axeViolations(page)).toEqual([]);

  await openStory(page, "recommended-onboarding-wizard");
  await expect(page.locator('[data-slot="onboarding-persistence"]')).toBeVisible();
  await expect(page.locator('[data-slot="stepper-progress"]')).toBeVisible();
  await page.getByRole("textbox", { name: "Workspace name" }).fill(" ");
  await page.getByRole("button", { name: "Continue" }).click();
  await expect(page.getByRole("alert")).toContainText("Add a workspace name");
  await page.getByRole("textbox", { name: "Workspace name" }).fill("Northstar notes");
  await page.getByRole("button", { name: "Save draft" }).click();
  await expect(page.getByText("Draft saved.")).toBeVisible();
  await page.getByRole("button", { name: "Continue" }).click();
  await expect(page.getByRole("heading", { name: "Preferences" }).last()).toBeVisible();
  expect(await axeViolations(page)).toEqual([]);
});

test("uncontrolled and controlled drafts restore their declared reset snapshots", async ({
  page,
}) => {
  await openStory(page, "onboarding-form-lifecycle");
  const lifecycleName = page.getByRole("textbox", { name: "Workspace name" });
  await expect(lifecycleName).toHaveValue("Initial workspace");
  await lifecycleName.fill("Changed workspace");
  await page.getByRole("button", { name: "Reset setup" }).click();
  await expect(lifecycleName).toHaveValue("Initial workspace");

  await openStory(page, "controlled-onboarding-wizard");
  await expect(page.getByText("Controlled step: preferences")).toBeVisible();
  await page.getByRole("button", { name: "Reset setup" }).click();
  await expect(page.getByText("Controlled step: workspace")).toBeVisible();
  await expect(page.getByRole("textbox", { name: "Workspace name" })).toHaveValue("");
  expect(await axeViolations(page)).toEqual([]);
});

test("read-only onboarding cancels reset without draft or step events", async ({ page }) => {
  await openStory(page, "onboarding-state-matrix");
  const readOnlySection = page.locator('section[aria-labelledby="onboarding-readonly-heading"]');
  const form = readOnlySection.locator('[data-slot="onboarding-wizard"]');
  const workspaceName = form.getByRole("textbox", { name: "Workspace name" });
  await workspaceName.evaluate((element) => {
    (element as HTMLInputElement).value = "Preserved draft";
  });
  await expect(form.getByRole("button", { name: "Reset setup" })).toBeDisabled();
  await form.evaluate((element) => (element as HTMLFormElement).reset());
  await expect(workspaceName).toHaveValue("Preserved draft");
  await expect(page.locator('[data-slot="onboarding-readonly-events"]')).toHaveText(
    "Read-only reset events: 0; draft events: 0; step events: 0",
  );
  expect(await axeViolations(page)).toEqual([]);
});

test("narrow RTL, reduced motion, and forced colors retain every onboarding action", async ({
  browser,
}) => {
  const context = await browser.newContext({
    forcedColors: "active",
    hasTouch: true,
    reducedMotion: "reduce",
    viewport: { height: 720, width: 320 },
  });
  const page = await context.newPage();
  await openStory(page, "narrow-rtl-onboarding");
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth - innerWidth),
  ).toBeLessThanOrEqual(1);
  await expect(page.getByRole("button", { name: "Continue" })).toBeVisible();
  const touchTarget = await page.getByRole("button", { name: "Continue" }).boundingBox();
  expect(touchTarget?.height ?? 0).toBeGreaterThanOrEqual(44);
  expect(await axeViolations(page)).toEqual([]);
  await context.close();
});
