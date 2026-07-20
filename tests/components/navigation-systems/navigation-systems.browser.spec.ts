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

async function openStory(page: Page, story: string): Promise<void> {
  await page.goto(`/iframe.html?viewMode=story&id=components-navigation-systems--${story}`, {
    waitUntil: "domcontentloaded",
  });
  await expect(page.locator("[data-slot]").first()).toBeVisible();
  await page.waitForTimeout(200);
}

async function axeViolations(page: Page): Promise<unknown[]> {
  await page.waitForTimeout(250);
  if (!(await page.evaluate(() => "axe" in globalThis))) await page.addScriptTag({ path: axePath });
  for (let attempt = 0; attempt < 10; attempt += 1) {
    try {
      return await page.evaluate(async () => {
        const axe = (
          globalThis as unknown as {
            axe: { run(target: Element): Promise<{ violations: unknown[] }> };
          }
        ).axe;
        return (await axe.run(document.body)).violations;
      });
    } catch (error) {
      if (!(error instanceof Error) || !error.message.includes("Axe is already running"))
        throw error;
      await page.waitForTimeout(250);
    }
  }
  throw new Error("Timed out waiting for the Storybook accessibility scan to finish.");
}

test("basic and recommended modes isolate every Mergora enhancement", async ({ page }) => {
  await openStory(page, "basic-defaults");
  await expect(page.locator('[data-slot="bottom-navigation-overflow"]')).toHaveCount(0);
  await expect(page.locator('[data-slot="navbar-route-status"]')).toHaveCount(0);
  await expect(page.locator('[data-slot="navigation-menu-preview"]')).toHaveCount(0);
  await expect(page.getByTestId("persistence-writes")).toHaveCount(0);
  await expect(page.locator('[data-slot="stepper-progress"]')).toHaveCount(0);
  await expect(page.locator('[data-slot="stepper-summary"]')).toHaveCount(0);
  await expect(page.locator('[data-slot="stepper-announcement"]')).toHaveCount(0);
  await expect(page.locator('[data-slot="table-of-contents-summary"]')).toHaveCount(0);
  await expect(page.locator("[data-enhanced-observer]")).toHaveCount(0);
  await expect(page.locator('[data-slot="tree-view-move-actions"]')).toHaveCount(0);
  await expect(page.locator('[data-slot="tree-view-actions"]')).toHaveCount(0);
  await expect(page.locator("[data-virtualized]")).toHaveCount(0);
  const plainSidebar = page.locator('[data-slot="sidebar"]');
  await plainSidebar.getByRole("button", { name: "Collapse sidebar" }).click();
  await expect(plainSidebar).toHaveAttribute("data-collapsed", "");
  await expect(plainSidebar.locator('[data-slot="sidebar-desktop"] summary')).toHaveCount(0);
  await expect(plainSidebar.getByRole("link", { name: "Patterns" })).toBeVisible();
  await plainSidebar.getByRole("button", { name: "Expand sidebar" }).click();
  await page.getByRole("button", { name: "Start navigation tour" }).click();
  await expect(page.locator('[data-slot="tour-progress"]')).toHaveCount(0);
  await expect(page.locator('[data-slot="tour-announcement"]')).toHaveCount(0);
  await expect(page.locator('[data-slot="tour-target-recovery"]')).toHaveCount(0);
  expect(await axeViolations(page)).toEqual([]);

  await openStory(page, "recommended-mergora");
  await expect(page.locator('[data-slot="bottom-navigation-overflow"]')).toHaveCount(1);
  await expect(page.locator('[data-slot="navbar-route-status"]')).toContainText(
    "Preparing pattern evidence",
  );
  await expect(page.getByTestId("persistence-writes")).toHaveText("Persistence writes: 0");
  await page.getByRole("button", { name: "Collapse sidebar" }).click();
  await expect(page.getByTestId("persistence-writes")).toHaveText("Persistence writes: 1");
  await expect(page.locator('[data-slot="stepper-progress"]')).toHaveAttribute("value", "2");
  await expect(page.locator('[data-slot="stepper-summary"]')).toContainText("2 steps remain");
  await expect(page.locator('[data-slot="stepper-announcement"]')).toHaveCount(1);
  await expect(page.locator('[data-slot="table-of-contents-summary"]')).toContainText(
    "Section 2 of 5",
  );
  await expect(page.locator("[data-enhanced-observer]")).toHaveCount(1);
  await expect(page.locator("[data-enhanced-move-actions]")).toHaveCount(1);
  await expect(page.locator("[data-virtualized]")).toHaveCount(1);
  await expect(page.locator('[data-slot="tree-view-actions"]')).not.toHaveCount(0);
  const qualityLink = page.getByRole("link", { name: /Quality evidence/u });
  await qualityLink.focus();
  await expect(page.locator('[data-slot="navigation-menu-preview"]')).toContainText(
    "Keyboard, browser, and parity records",
  );
  expect(await axeViolations(page)).toEqual([]);
});

test("responsive disclosures close with Escape and restore their own triggers", async ({
  page,
}) => {
  await page.setViewportSize({ height: 900, width: 320 });
  await openStory(page, "basic-defaults");

  const navbarTrigger = page.getByRole("button", { name: "Open navigation" });
  await navbarTrigger.click();
  const navbarPanel = page.locator('[data-slot="navbar-mobile"]');
  await expect(navbarPanel).toBeVisible();
  await navbarPanel.getByRole("link", { name: "Patterns" }).focus();
  await page.keyboard.press("Escape");
  await expect(navbarPanel).toBeHidden();
  await expect(navbarTrigger).toBeFocused();

  const sidebarTrigger = page.getByRole("button", { name: "Open sidebar" });
  await sidebarTrigger.click();
  const sidebarPanel = page.locator('[data-slot="sidebar-mobile"]');
  await expect(sidebarPanel).toBeVisible();
  await expect(sidebarPanel.getByRole("button", { name: "Close sidebar" })).toBeFocused();
  const sidebarGroup = sidebarPanel.locator('[data-slot="sidebar-group"]').first();
  await sidebarGroup.locator("summary").click();
  await expect(sidebarGroup).not.toHaveAttribute("open", "");
  await sidebarGroup.locator("summary").click();
  await expect(sidebarGroup).toHaveAttribute("open", "");
  await page.keyboard.press("Escape");
  await expect(sidebarPanel).toBeHidden();
  await expect(sidebarTrigger).toBeFocused();

  const menuTrigger = page.getByRole("button", { name: "Library" });
  await expect(menuTrigger).toHaveAttribute("aria-expanded", "true");
  const menuPanel = page.locator('[data-slot="navigation-menu-panel"]');
  await menuPanel.getByRole("link", { name: /Components/u }).focus();
  await page.keyboard.press("Escape");
  await expect(menuPanel).toBeHidden();
  await expect(menuTrigger).toBeFocused();
  expect(await axeViolations(page)).toEqual([]);
});

test("step, current-section, and bottom-destination state stay synchronized", async ({ page }) => {
  await openStory(page, "recommended-mergora");
  const stepper = page.locator('[data-slot="stepper"]');
  await stepper.getByRole("button", { name: /Verify/u }).click();
  await expect(stepper.locator('[aria-current="step"]')).toContainText("Verify");
  await expect(stepper.locator('[data-slot="stepper-progress"]')).toHaveAttribute("value", "3");
  await expect(stepper.locator('[data-slot="stepper-summary"]')).toContainText("1 steps remain");
  await expect(stepper.locator('[data-slot="stepper-announcement"]')).toContainText(
    "Step 3 of 4: Verify",
  );

  const toc = page.locator('[data-slot="table-of-contents"]');
  await toc.getByRole("link", { name: "Evidence" }).click();
  await expect(toc.locator('[aria-current="location"]')).toHaveText("Evidence");
  await expect(toc.locator('[data-slot="table-of-contents-summary"]')).toHaveText("Section 4 of 5");

  const bottom = page.locator('[data-slot="bottom-navigation"]');
  await bottom.getByRole("link", { name: "Patterns" }).click();
  await expect(bottom.locator('[aria-current="page"]')).toContainText("Patterns");
  expect(await axeViolations(page)).toEqual([]);
});

test("tour stays non-modal, routes once, recovers a missing target, and remains skippable", async ({
  page,
}) => {
  await openStory(page, "recommended-mergora");
  const trigger = page.getByRole("button", { name: "Start navigation tour" });
  await trigger.click();
  const panel = page.getByRole("region", { name: "Inspect a live specimen" });
  await expect(panel).toBeVisible();
  await expect(panel.locator('[data-slot="tour-progress"]')).toHaveText("1 / 2");
  await expect(panel.locator('[data-slot="tour-announcement"]')).toContainText("Step 1 of 2");
  await expect(page.locator("[aria-modal=true], [inert]")).toHaveCount(0);
  await expect(page.getByRole("link", { name: "Overview" }).first()).toBeVisible();

  await page.getByRole("link", { name: "Overview" }).first().focus();
  await page.keyboard.press("Escape");
  await expect(page.locator('[data-slot="tour-panel"]')).toHaveCount(0);
  await expect(trigger).toBeFocused();
  await trigger.click();

  await panel.getByRole("button", { name: "Next" }).click();
  await expect(page.getByTestId("tour-route-output")).toHaveText(
    "Route requested: /quality/evidence",
  );
  await expect(page.locator('[data-slot="tour-target-recovery"]')).toContainText("not mounted yet");
  await page.getByRole("button", { name: "Check target again" }).click();
  await expect(page.getByTestId("tour-route-output")).toHaveText("Target retry requested");
  await page.getByRole("button", { name: "Skip tour" }).click();
  await expect(page.locator('[data-slot="tour-panel"]')).toHaveCount(0);
  await expect(trigger).toBeFocused();
  expect(await axeViolations(page)).toEqual([]);
});

test("tree implements APG movement, multiselect, lazy loading, rename, and non-drag actions", async ({
  page,
}) => {
  await openStory(page, "basic-defaults");
  let tree = page.getByRole("tree", { name: "Component source tree" });
  const workspace = tree.locator('[data-item-id="workspace"]');
  await workspace.focus();
  await page.keyboard.press("ArrowRight");
  await expect(tree.locator('[data-item-id="overview-file"]')).toBeFocused();
  await page.keyboard.press("ArrowDown");
  await expect(tree.locator('[data-item-id="components-folder"]')).toBeFocused();
  await page.keyboard.press("ArrowRight");
  const buttonItem = tree.locator('[data-item-id="button-file"]');
  await expect(buttonItem).toBeFocused();
  await page.keyboard.press("Space");
  await expect(buttonItem).toHaveAttribute("aria-selected", "false");
  await page.keyboard.press("Space");
  await expect(buttonItem).toHaveAttribute("aria-selected", "true");
  await page.keyboard.press("Control+a");
  await expect(tree.locator('[role="treeitem"][aria-selected="true"]')).toHaveCount(6);

  await openStory(page, "recommended-mergora");
  tree = page.getByRole("tree", { name: "Component source tree" });
  const componentItem = tree.locator('[data-item-id="components-folder"]');
  await componentItem.focus();
  await page.keyboard.press("F2");
  let rename = tree.getByRole("textbox", { name: "Rename Components" });
  await rename.fill("Discard this draft");
  await rename.press("Escape");
  await expect(componentItem).toContainText("Components");
  await componentItem.focus();
  await page.keyboard.press("F2");
  rename = tree.getByRole("textbox", { name: "Rename Components" });
  await rename.fill("Building blocks");
  await rename.press("Enter");
  await expect(tree.locator('[data-item-id="components-folder"]')).toContainText("Building blocks");
  await expect(page.getByTestId("tree-activity")).toContainText("Renamed components-folder");
  const overviewMoveGroup = tree.getByRole("group", { name: "Move Overview" });
  await overviewMoveGroup.getByRole("button", { name: "Move down" }).click();
  await expect(page.getByTestId("tree-activity")).toHaveText("Move overview-file down requested");
  await componentItem.focus();
  await page.keyboard.press("End");
  await expect(tree.locator('[data-item-id="evidence-folder"]')).toBeFocused();
  await expect(tree.locator('[data-slot="tree-view-virtual-spacer-start"]')).toBeVisible();

  await openStory(page, "state-matrix");
  tree = page.getByRole("tree", { name: "Component source tree" });
  const evidence = tree.locator('[data-item-id="evidence-folder"]');
  await evidence.getByRole("button", { name: "Expand Evidence" }).click();
  await expect(evidence.locator('[data-slot="tree-view-load-status"]')).toContainText(
    "Loading Evidence",
  );
  await expect(tree.locator('[data-item-id="keyboard-record"]')).toContainText("Keyboard.json");
  await expect(page.getByTestId("tree-activity")).toHaveText("Loaded evidence children");
  expect(await axeViolations(page)).toEqual([]);
});

test("narrow RTL, forced colors, reduced motion, and touch targets preserve access", async ({
  page,
}) => {
  await page.setViewportSize({ height: 900, width: 320 });
  await page.emulateMedia({ forcedColors: "active", reducedMotion: "reduce" });
  await openStory(page, "keyboard-and-responsive");
  await expect(page.locator("main")).toHaveAttribute("dir", "rtl");
  const tree = page.getByRole("tree", { name: "Component source tree" });
  await expect(tree).toHaveAttribute("dir", "rtl");
  await tree.locator('[data-item-id="workspace"]').focus();
  await page.keyboard.press("ArrowLeft");
  await expect(tree.locator('[data-item-id="overview-file"]')).toBeFocused();

  const bottomLink = page.locator('[data-slot="bottom-navigation"] a').first();
  await bottomLink.focus();
  expect(await bottomLink.evaluate((element) => getComputedStyle(element).outlineStyle)).not.toBe(
    "none",
  );
  const undersized = await page
    .locator(
      '[data-slot="bottom-navigation"] a, [data-slot="navbar-toggle"], [data-slot="sidebar-mobile-trigger"], [data-slot="stepper"] button, [data-slot="tree-view"] button',
    )
    .evaluateAll((elements) =>
      elements
        .filter((element) => getComputedStyle(element).display !== "none")
        .map((element) => {
          const bounds = element.getBoundingClientRect();
          return { height: bounds.height, width: bounds.width };
        })
        .filter(({ height, width }) => height < 44 || width < 44),
    );
  expect(undersized).toEqual([]);
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth - innerWidth),
  ).toBeLessThanOrEqual(0);
  expect(await axeViolations(page)).toEqual([]);
});
