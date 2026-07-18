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
  await page.goto(`/iframe.html?viewMode=story&id=p2-actions-and-selection--${story}`, {
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
    return (await axe.run(document.body)).violations;
  });
}

test("actions workbench exposes native semantics, names, targets, and no axe violations", async ({
  page,
}, testInfo) => {
  await page.addInitScript(() => {
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText: async () => undefined },
    });
  });
  await openStory(page, "actions-workbench");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(
    "Actions and selection workbench",
  );
  await expect(page.locator('[data-slot="button"]')).toHaveCount(2);
  await expect(page.getByRole("button", { name: "Add evidence" })).toHaveAttribute(
    "data-slot",
    "icon-button",
  );
  await expect(page.getByRole("link", { name: /External reference/u })).toHaveAttribute(
    "target",
    "_blank",
  );
  await expect(page.getByRole("link", { name: /External reference/u })).toHaveAttribute(
    "rel",
    "noopener noreferrer",
  );

  const undersized = await page
    .locator(
      '[data-slot="button"], [data-slot="icon-button"], [data-slot="copy-button"], [data-slot="toggle"], [data-slot="toggle-group-item"], [data-slot="segmented-control-item"], [data-slot="action-menu-trigger"], [data-slot="link"][data-standalone="true"]',
    )
    .evaluateAll((elements) =>
      elements
        .map((element) => {
          const bounds = element.getBoundingClientRect();
          return {
            height: bounds.height,
            slot: element.getAttribute("data-slot"),
            width: bounds.width,
          };
        })
        .filter(({ height, width }) => height < 44 || width < 44),
    );
  expect(undersized).toEqual([]);
  expect(await axeViolations(page)).toEqual([]);
  await page.screenshot({ fullPage: true, path: testInfo.outputPath("actions-workbench.png") });
});

test("pending actions retain focus and expose replacement names", async ({ page }) => {
  await openStory(page, "pending-and-destructive");
  const publishing = page.getByRole("button", { name: "Publishing" });
  await expect(publishing).toHaveAttribute("aria-busy", "true");
  await expect(publishing).toHaveAttribute("aria-disabled", "true");
  await publishing.focus();
  await publishing.press("Enter");
  await expect(publishing).toBeFocused();
  const updating = page.getByRole("button", { name: "Updating" });
  await expect(updating).toHaveAttribute("aria-pressed", "false");
  await updating.press("Space");
  await expect(updating).toHaveAttribute("aria-pressed", "false");
});

test("clipboard success and rejection remain visible without moving focus", async ({ browser }) => {
  const successPage = await browser.newPage();
  const successFailures = guardRuntime(successPage);
  await successPage.addInitScript(() => {
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText: async () => undefined },
    });
  });
  await openStory(successPage, "clipboard-states");
  await successPage.getByRole("button", { name: "Copy install command" }).click();
  const successButton = successPage.locator('[data-slot="copy-button"]');
  await expect(successButton).toHaveAttribute("data-status", "copied");
  await expect(successButton).toContainText("Copied");
  await expect(successButton).toBeFocused();
  expect(successFailures).toEqual([]);
  await successPage.close();

  const rejectionPage = await browser.newPage();
  const rejectionFailures = guardRuntime(rejectionPage);
  await rejectionPage.addInitScript(() => {
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText: async () => Promise.reject(new Error("permission denied")) },
    });
  });
  await openStory(rejectionPage, "clipboard-states");
  await rejectionPage.getByRole("button", { name: "Copy install command" }).click();
  const rejectionButton = rejectionPage.locator('[data-slot="copy-button"]');
  await expect(rejectionButton).toHaveAttribute("data-status", "error");
  await expect(rejectionButton).toContainText("Copy failed");
  await expect(rejectionButton).toBeFocused();
  expect(rejectionFailures).toEqual([]);
  await rejectionPage.close();
});

test("toolbar and toggle-group render one tab stop and repair dynamic disabled removal", async ({
  page,
}) => {
  await openStory(page, "dynamic-roving-focus");
  const toolbar = page.getByRole("toolbar", { name: "Dynamic editor actions" });
  const toggles = page.getByRole("group", { name: "Visible layers" });
  await expect(toolbar.locator('[tabindex="0"]')).toHaveCount(1);
  await expect(toggles.locator('[tabindex="0"]')).toHaveCount(1);
  await expect(toggles.locator('[aria-pressed="true"]')).toHaveCount(3);

  await toolbar.getByRole("button", { name: "Undo" }).focus();
  await page.keyboard.press("End");
  await expect(toolbar.getByRole("button", { name: "Compare" })).toBeFocused();
  await page.getByTestId("remove-compare").click();
  await expect(toolbar.locator('[tabindex="0"]')).toHaveCount(1);
  await expect(toolbar.getByRole("button", { name: "Redo" })).toHaveAttribute("tabindex", "0");
  await page.getByTestId("disable-undo").click();
  await expect(toolbar.locator('[tabindex="0"]')).toHaveCount(1);
  await expect(toolbar.getByRole("button", { name: "Redo" })).toHaveAttribute("tabindex", "0");
});

test("LTR roving maps skip disabled items and segmented arrows select", async ({ page }) => {
  await openStory(page, "roving-focus");
  const toolbar = page.getByRole("toolbar", { name: "Editor actions" });
  await expect(toolbar.locator('[data-mrg-toolbar-action="true"]')).toHaveCount(4);
  await expect(toolbar.locator('[data-mrg-toolbar-action="true"][tabindex="0"]')).toHaveCount(1);
  await expect(toolbar.getByRole("separator")).not.toHaveAttribute("tabindex");
  await expect(toolbar.getByRole("button", { name: "Redo unavailable" })).toHaveAttribute(
    "tabindex",
    "-1",
  );
  await toolbar.getByRole("button", { name: "Undo" }).focus();
  await page.keyboard.press("ArrowRight");
  await expect(toolbar.getByRole("button", { name: "Compare" })).toBeFocused();
  await page.keyboard.press("Home");
  await expect(toolbar.getByRole("button", { name: "Undo" })).toBeFocused();
  await page.keyboard.press("End");
  await expect(toolbar.getByRole("link", { name: "Router evidence" })).toBeFocused();

  const group = page.getByRole("group", { name: "Alignment" });
  await group.getByRole("button", { name: "Left" }).focus();
  await page.keyboard.press("ArrowRight");
  await expect(group.getByRole("button", { name: "Right" })).toBeFocused();
  await expect(group.getByRole("button", { name: "Left" })).toHaveAttribute("aria-pressed", "true");

  const source = page.getByRole("radio", { name: "Source" });
  await source.focus();
  await page.keyboard.press("ArrowRight");
  await expect(page.getByRole("radio", { name: "Package" })).toBeChecked();
});

test("provider locale drives Hebrew RTL action-menu typeahead", async ({ page }) => {
  await openStory(page, "localized-action-menu-typeahead");
  const trigger = page.getByRole("button", {
    name: "\u05e4\u05e2\u05d5\u05dc\u05d5\u05ea \u05e8\u05d0\u05d9\u05d4",
  });
  await expect(page.locator('[data-slot="action-menu"]')).toHaveAttribute("lang", "he-IL");
  await expect(page.locator('[data-slot="action-menu"]')).toHaveAttribute("dir", "rtl");
  await trigger.press("ArrowDown");
  await expect(
    page.getByRole("menuitem", { name: "\u05e2\u05e8\u05d9\u05db\u05ea \u05e8\u05d0\u05d9\u05d4" }),
  ).toBeFocused();
  await page.evaluate(() => {
    document.activeElement?.dispatchEvent(
      new KeyboardEvent("keydown", {
        bubbles: true,
        cancelable: true,
        code: "KeyN",
        key: "\u05de",
      }),
    );
  });
  await expect(
    page.getByRole("menuitem", { name: "\u05de\u05d7\u05d9\u05e7\u05ea \u05e8\u05d0\u05d9\u05d4" }),
  ).toBeFocused();
  expect(await axeViolations(page)).toEqual([]);
});

test("RTL spatial arrows skip disabled items for pressed and radio selection", async ({ page }) => {
  await openStory(page, "right-to-left");
  const toggleGroup = page.getByRole("group", { name: "طريقة العرض" });
  await toggleGroup.getByRole("button", { name: "معاينة" }).focus();
  await page.keyboard.press("ArrowRight");
  await expect(toggleGroup.getByRole("button", { name: "الرمز" })).toBeFocused();
  await expect(toggleGroup.getByRole("button", { name: "معاينة" })).toHaveAttribute(
    "aria-pressed",
    "true",
  );

  const source = page.getByRole("radio", { name: "المصدر" });
  await source.focus();
  await page.keyboard.press("ArrowRight");
  await expect(page.getByRole("radio", { name: "الحزمة" })).toBeChecked();
  expect(await axeViolations(page)).toEqual([]);
});

test("RAC action menu anchors, skips disabled items, typeaheads, confirms, and returns focus", async ({
  page,
}) => {
  await openStory(page, "action-menu-focus");
  const trigger = page.getByRole("button", { name: "Snapshot actions" });
  await trigger.focus();
  await page.keyboard.press("ArrowDown");
  const menu = page.getByRole("menu", { name: "Snapshot actions" });
  await expect(menu).toBeVisible();
  await expect(page.getByRole("menuitem", { name: "Edit snapshot" })).toBeFocused();
  await page.keyboard.press("d");
  const destructive = page.getByRole("menuitem", { name: "Delete snapshot" });
  const descriptionId = await destructive.getAttribute("aria-describedby");
  expect(descriptionId).toMatch(/^\S+$/u);
  await expect(page.locator(`#${descriptionId}`)).toHaveText(
    "Permanently removes the current snapshot",
  );
  await expect(destructive).toBeFocused();
  await destructive.press("Enter");
  await expect(menu).toBeVisible();
  await expect(page.getByRole("menuitem", { name: "Confirm delete snapshot" })).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(menu).toBeHidden();
  await expect(trigger).toBeFocused();

  await trigger.press("ArrowDown");
  await page.keyboard.press("End");
  const confirm = page.getByRole("menuitem", { name: "Delete snapshot" });
  await confirm.press("Enter");
  await page.getByRole("menuitem", { name: "Confirm delete snapshot" }).press("Enter");
  await expect(page.getByRole("menu", { name: "Snapshot actions" })).toBeHidden();
  await expect(trigger).toBeFocused();
});

test("ActionMenu keeps locale collation while explicit RTL maps start to the physical right", async ({
  page,
}) => {
  await page.setViewportSize({ height: 480, width: 640 });
  await openStory(page, "action-menu-direction-override");
  const trigger = page.getByRole("button", { name: "Mismatch actions" });
  await expect(page.locator('[data-slot="action-menu"]')).toHaveAttribute("lang", "en-US");
  await expect(page.locator('[data-slot="action-menu"]')).toHaveAttribute("dir", "rtl");
  await trigger.click();
  const alignment = await page.evaluate(() => {
    const triggerBounds = document
      .querySelector<HTMLElement>('[data-slot="action-menu-trigger"]')!
      .getBoundingClientRect();
    const popoverBounds = document
      .querySelector<HTMLElement>('[data-slot="action-menu-popover"]')!
      .getBoundingClientRect();
    return {
      leftDelta: Math.abs(triggerBounds.left - popoverBounds.left),
      rightDelta: Math.abs(triggerBounds.right - popoverBounds.right),
    };
  });
  expect(alignment.rightDelta).toBeLessThanOrEqual(12);
  expect(alignment.leftDelta).toBeGreaterThan(24);
});

test("RAC popover is trigger-anchored and collision-contained at a narrow viewport", async ({
  page,
}) => {
  await page.setViewportSize({ height: 240, width: 320 });
  await openStory(page, "action-menu-collision");
  const trigger = page.getByRole("button", { name: "Edge actions" });
  await trigger.click();
  const popover = page.locator('[data-slot="action-menu-popover"]');
  await expect(popover).toBeVisible();
  const geometry = await page.evaluate(() => {
    const triggerElement = document.querySelector<HTMLElement>(
      '[data-slot="action-menu-trigger"]',
    )!;
    const popoverElement = document.querySelector<HTMLElement>(
      '[data-slot="action-menu-popover"]',
    )!;
    const triggerBounds = triggerElement.getBoundingClientRect();
    const popoverBounds = popoverElement.getBoundingClientRect();
    return {
      anchoredInlineEnd: Math.abs(triggerBounds.right - popoverBounds.right),
      bottom: popoverBounds.bottom,
      left: popoverBounds.left,
      placement: popoverElement.dataset.placement,
      right: popoverBounds.right,
      top: popoverBounds.top,
    };
  });
  expect(geometry.anchoredInlineEnd).toBeLessThanOrEqual(12);
  expect(geometry.left).toBeGreaterThanOrEqual(0);
  expect(geometry.right).toBeLessThanOrEqual(320);
  expect(geometry.top).toBeGreaterThanOrEqual(0);
  expect(geometry.bottom).toBeLessThanOrEqual(240);
  expect(geometry.placement).toBe("top");
  await expect(page.locator('[data-slot="layer"]')).toHaveAttribute(
    "data-layer-dismissible",
    "false",
  );
});

test("320 CSS pixels reflow without document clipping while segmented overflow stays native", async ({
  page,
}) => {
  await page.setViewportSize({ height: 900, width: 320 });
  await openStory(page, "narrow-reflow");
  const geometry = await page.evaluate(() => {
    const scroller = document.querySelector<HTMLElement>('[data-slot="segmented-control-scroll"]')!;
    const viewportWidth = document.documentElement.clientWidth;
    return {
      documentOverflow: document.documentElement.scrollWidth > window.innerWidth + 1,
      nativeSegmentOverflow: scroller.scrollWidth > scroller.clientWidth,
      overflowElements: [...document.body.querySelectorAll<HTMLElement>("*")]
        .filter((element) => {
          if (element.closest('[data-slot="segmented-control-scroll"]') !== null) return false;
          const bounds = element.getBoundingClientRect();
          return bounds.left < -1 || bounds.right > viewportWidth + 1;
        })
        .map((element) => ({
          clientWidth: element.clientWidth,
          slot: element.dataset.slot ?? null,
          tag: element.tagName.toLowerCase(),
          width: element.getBoundingClientRect().width,
        })),
    };
  });
  expect(geometry.documentOverflow).toBe(false);
  expect(geometry.overflowElements).toEqual([]);
  expect(geometry.nativeSegmentOverflow).toBe(true);
  expect(await axeViolations(page)).toEqual([]);
});

test("forced colors and reduced motion preserve state, focus, and static feedback", async ({
  browser,
}) => {
  const context = await browser.newContext({
    forcedColors: "active",
    reducedMotion: "reduce",
  });
  const page = await context.newPage();
  const failures = guardRuntime(page);
  await openStory(page, "pending-and-destructive");
  const destructive = page.getByRole("button", { name: "Delete snapshot" }).last();
  await destructive.focus();
  const style = await destructive.evaluate((element) => {
    const computed = getComputedStyle(element);
    return {
      animation: computed.animationName,
      outline: computed.outlineStyle,
    };
  });
  expect(style.animation).toBe("none");
  expect(style.outline).not.toBe("none");
  expect(await axeViolations(page)).toEqual([]);
  expect(failures).toEqual([]);
  await context.close();
});
