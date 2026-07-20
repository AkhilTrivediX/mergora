import { resolve } from "node:path";

import { expect, test, type Page } from "@playwright/test";

const axePath = resolve(
  import.meta.dirname,
  "../../../packages/test-utils/node_modules/axe-core/axe.min.js",
);
const failures = new WeakMap<Page, string[]>();

test.beforeEach(({ page }) => {
  const messages: string[] = [];
  failures.set(page, messages);
  page.on("console", (message) => {
    if (message.type() === "warning" || message.type() === "error") {
      messages.push(`console.${message.type()}: ${message.text()}`);
    }
  });
  page.on("pageerror", (error) => messages.push(`pageerror: ${error.message}`));
});

test.afterEach(({ page }) => expect(failures.get(page) ?? []).toEqual([]));

async function openStory(page: Page, id: string): Promise<void> {
  await page.goto(`/iframe.html?viewMode=story&id=kits-workflow-operations--${id}`, {
    waitUntil: "domcontentloaded",
  });
  await expect(page.locator("[data-slot]").first()).toBeVisible();
}

async function axeViolations(page: Page): Promise<unknown[]> {
  await page.addScriptTag({ path: axePath });
  return page.evaluate(async () => {
    const axe = (
      globalThis as unknown as {
        axe: { run(target: Element): Promise<{ violations: unknown[] }> };
      }
    ).axe;
    for (let attempt = 0; attempt < 40; attempt += 1) {
      try {
        return (await axe.run(document.body)).violations;
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

test("dashboard basic and recommended modes isolate optional operational context", async ({
  page,
}) => {
  await openStory(page, "basic-admin-dashboard-shell");
  await expect(page.getByRole("main")).toBeVisible();
  await expect(page.locator('[data-slot="admin-dashboard-role-context"]')).toHaveCount(0);
  await expect(page.locator('[data-slot="admin-dashboard-notifications"]')).toHaveCount(0);
  await expect(page.getByRole("button", { name: /Monday/u })).toHaveCount(0);

  await openStory(page, "recommended-admin-dashboard-shell");
  await expect(page.locator('[data-slot="admin-dashboard-role-context"]')).toBeVisible();
  await expect(page.locator('[data-slot="admin-dashboard-notifications"]')).toBeVisible();
  await expect(page.getByRole("button", { name: /Monday/u })).toBeVisible();
  await expect(page.getByRole("table", { name: "Weekly evidence reviews data" })).toBeVisible();
  const activity = page.getByRole("link", { name: "Activity", exact: true });
  await activity.focus();
  await activity.press("Enter");
  await expect(activity).toHaveAttribute("aria-current", "page");
  const markRead = page.getByRole("button", { name: "Mark read" });
  await markRead.focus();
  await markRead.press("Enter");
  await expect(page.getByRole("button", { name: "Mark read" })).toHaveCount(0);
  expect(await axeViolations(page)).toEqual([]);
});

test("command center preserves adapter ranking, keyboard operation, and disabled output", async ({
  page,
}) => {
  await openStory(page, "basic-command-center");
  await expect(page.locator('[data-slot="command-center-result-count"]')).toHaveCount(0);
  await expect(page.getByText("Ctrl/⌘ K")).toHaveCount(0);
  const input = page.locator('[data-slot="command-palette"] input[role="combobox"]');
  await expect(input).toHaveValue("component");
  await expect(page.getByRole("option", { name: /Open component catalog/u })).toBeVisible();
  await input.press("ArrowDown");
  await input.press("Enter");

  await openStory(page, "recommended-command-center");
  await expect(page.locator('[data-slot="command-center-result-count"]')).toBeVisible();
  await page.getByRole("button", { name: /Open command center/u }).click();
  const enhancedInput = page.locator('[data-slot="command-palette"] input[role="combobox"]');
  await expect(enhancedInput).toBeFocused();
  await expect(page.getByText("Recent", { exact: true }).first()).toBeVisible();
  await expect(page.getByText("G C", { exact: true })).toBeVisible();
  await enhancedInput.dispatchEvent("compositionstart");
  await enhancedInput.press("Enter");
  await expect(page.locator('[data-slot="command-palette"] input[role="combobox"]')).toBeVisible();
  await enhancedInput.dispatchEvent("compositionend");
  expect(await axeViolations(page)).toEqual([]);
});

test("CRUD enhancements add selection and saved views while deletion stays confirmable", async ({
  page,
}) => {
  await openStory(page, "basic-crud-data-workspace");
  await expect(page.getByRole("table", { name: "Workspace records" })).toBeVisible();
  await expect(page.locator('[data-slot="crud-data-workspace-bulk-actions"]')).toHaveCount(0);
  await expect(page.getByLabel("Saved view")).toHaveCount(0);
  const basicDelete = page.getByRole("button", { name: "Delete Keyboard guidance" });
  await basicDelete.focus();
  await basicDelete.press("Enter");
  await expect(page.getByText("Confirm record deletion")).toBeVisible();
  const keepRecord = page.getByRole("button", { name: "Keep record" });
  await expect(keepRecord).toBeFocused();
  await keepRecord.press("Enter");
  await expect(page.getByText("Confirm record deletion")).toHaveCount(0);

  await openStory(page, "recommended-crud-data-workspace");
  await expect(page.locator('[data-slot="crud-data-workspace-bulk-actions"]')).toBeVisible();
  await expect(page.getByLabel("Saved view")).toBeVisible();
  const firstSelection = page.getByRole("checkbox", { name: "Select row record-guidance" });
  await firstSelection.focus();
  await firstSelection.press("Space");
  await expect(page.getByText("1 selected")).toBeVisible();
  const deleteRecord = page.getByRole("button", { name: "Delete Keyboard guidance" });
  await deleteRecord.focus();
  await deleteRecord.press("Enter");
  const confirmDelete = page.getByRole("button", { name: "Confirm delete" });
  await confirmDelete.focus();
  await confirmDelete.press("Enter");
  const undoDelete = page.getByRole("button", { name: "Undo delete" });
  await expect(undoDelete).toBeVisible();
  await undoDelete.focus();
  await undoDelete.press("Enter");
  await expect(page.getByRole("cell", { name: "Keyboard guidance", exact: true })).toBeVisible();
  expect(await axeViolations(page)).toEqual([]);
});

test("CRUD editor exposes validation recovery and returns focus", async ({ page }) => {
  await openStory(page, "crud-data-form-and-recovery");
  const trigger = page.getByRole("button", { name: "Create record" });
  await trigger.click();
  await expect(page.getByRole("dialog", { name: "Create record" })).toBeVisible();
  await page.getByLabel("Name").fill("Temporary value");
  await page.getByRole("button", { name: "Reset fields" }).click();
  await expect(page.getByLabel("Name")).toHaveValue("");
  await page.getByRole("button", { name: "Save record" }).click();
  await expect(page.getByRole("alert")).toContainText("Enter a record name and category");
  await page.getByLabel("Name").fill("Contrast review");
  await page.getByRole("button", { name: "Save record" }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(page.getByRole("cell", { name: "Contrast review", exact: true })).toBeVisible();
  await expect(trigger).toBeFocused();
});

test("narrow RTL, reduced motion, touch targets, and forced colors retain structure", async ({
  browser,
}) => {
  const context = await browser.newContext({
    forcedColors: "active",
    hasTouch: true,
    reducedMotion: "reduce",
    viewport: { height: 760, width: 320 },
  });
  const page = await context.newPage();
  const messages: string[] = [];
  failures.set(page, messages);
  page.on("console", (message) => {
    if (message.type() === "warning" || message.type() === "error") messages.push(message.text());
  });
  await openStory(page, "narrow-rtl-workflow-kits");
  await expect(page.locator('[data-slot="admin-dashboard-shell"]')).toBeVisible();
  await expect(page.locator('[data-slot="command-center"]')).toBeVisible();
  await expect(page.locator('[data-slot="crud-data-workspace"]')).toBeVisible();
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - innerWidth);
  expect(overflow).toBeLessThanOrEqual(1);
  const style = await page.locator('[data-slot="command-center"]').evaluate((element) => ({
    border: getComputedStyle(element).borderColor,
    direction: getComputedStyle(element).direction,
  }));
  expect(style.border).not.toBe("rgba(0, 0, 0, 0)");
  expect(style.direction).toBe("rtl");
  const targetHeight = await page
    .getByRole("button", { name: "Create record" })
    .evaluate((element) => element.getBoundingClientRect().height);
  expect(targetHeight).toBeGreaterThanOrEqual(44);
  expect(await axeViolations(page)).toEqual([]);
  expect(messages).toEqual([]);
  await context.close();
});
