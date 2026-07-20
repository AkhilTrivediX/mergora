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
    if (
      message.type() === "warning" &&
      message.text().includes("Layout was forced before the page was fully loaded")
    ) {
      return;
    }
    if (message.type() === "warning" || message.type() === "error") {
      failures.push(`console.${message.type()}: ${message.text()}`);
    }
  });
  page.on("pageerror", (error) => failures.push(`pageerror: ${error.message}`));
  return failures;
}

test.beforeEach(({ page }) => guardRuntime(page));
test.afterEach(({ page }) => expect(runtimeFailures.get(page) ?? []).toEqual([]));

async function openStory(page: Page, story: string): Promise<void> {
  await page.goto(`/iframe.html?viewMode=story&id=p5-overlay-systems--${story}`, {
    waitUntil: "domcontentloaded",
  });
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
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

async function settleAnimations(page: Page): Promise<void> {
  await page.evaluate(async () => {
    await Promise.all(
      document.getAnimations().map(async (animation) => {
        try {
          await animation.finished;
        } catch {
          // A dismissed overlay cancels its finite animation; cancellation is already the settled state.
        }
      }),
    );
  });
}

test("basic mode removes every optional overlay enhancement", async ({ page }) => {
  await openStory(page, "basic-defaults");
  for (const slot of [
    "context-menu-invocation-hint",
    "drawer-swipe-handle",
    "dropdown-menu-selection-summary",
    "hover-card-pin-rail",
    "lightbox-position-summary",
    "lightbox-zoom-controls",
    "menubar-keyboard-guide",
    "toast-pause-control",
    "toast-queue-summary",
  ]) {
    await expect(page.locator(`[data-slot="${slot}"]`)).toHaveCount(0);
  }

  const trigger = page.getByRole("button", { name: "Open item actions" });
  await trigger.focus();
  await page.keyboard.press("ArrowDown");
  const menu = page.getByRole("menu", { name: "Item actions" });
  await expect(menu).toBeVisible();
  await expect(page.getByRole("menuitemcheckbox", { name: /Inspect details/u })).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(trigger).toBeFocused();

  const contextTarget = page.getByRole("button", { name: "Context target" });
  await contextTarget.focus();
  await page.keyboard.press("Shift+F10");
  await expect(page.getByRole("menu", { name: "Canvas actions" })).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(contextTarget).toBeFocused();
});

test("recommended mode exposes independent context, safety, pause, and zoom tools", async ({
  page,
}) => {
  await openStory(page, "recommended-mergora");
  await expect(page.locator('[data-slot="context-menu-invocation-hint"]')).toBeVisible();
  await expect(page.locator('[data-slot="menubar-keyboard-guide"]')).toBeVisible();
  await expect(page.locator('[data-slot="toast-pause-control"]')).toBeVisible();
  await expect(page.locator('[data-slot="toast-queue-summary"]')).toContainText("waiting");

  await page.getByRole("button", { name: "Open item actions" }).click();
  await expect(page.locator('[data-slot="dropdown-menu-selection-summary"]')).toContainText(
    "selected",
  );
  const remove = page.getByRole("menuitemcheckbox", { name: "Remove saved view" });
  await remove.click();
  await expect(page.getByRole("menuitemcheckbox", { name: "Confirm removal" })).toBeVisible();
  await page.keyboard.press("Escape");

  const preview = page.getByRole("button", { name: "Preview token" });
  await preview.click();
  await expect(page.getByRole("dialog", { name: "Semantic surface token" })).toBeVisible();
  await expect(page.locator('[data-slot="hover-card-pin-rail"]')).toBeVisible();
  await expect(page.locator('[data-slot="hover-card-pin-status"]')).toContainText("pinned");
  await page.getByRole("button", { name: "Close preview" }).click();

  const drawerTrigger = page.getByRole("button", { name: "Open detail drawer" });
  await drawerTrigger.click();
  await expect(page.getByRole("dialog", { name: "Detail drawer" })).toBeVisible();
  await page.getByRole("button", { name: "Close drawer" }).click();
  await expect(drawerTrigger).toBeFocused();

  const galleryTrigger = page.getByRole("button", { name: "Open Green geometry study" });
  await galleryTrigger.click();
  await expect(page.locator('[data-slot="lightbox-position-summary"]')).toContainText(
    "Image 1 of 2",
  );
  await expect(page.locator('[data-slot="lightbox-zoom-controls"]')).toBeVisible();
  await page.getByRole("button", { name: "Zoom in" }).click();
  await expect(page.locator('[data-slot="lightbox-zoom-value"]')).toHaveText("150%");
  await expect(page.locator('[data-slot="lightbox-pan-controls"]')).toBeVisible();
  expect(await axeViolations(page)).toEqual([]);
});

test("menubar and lightbox provide complete spatial keyboard alternatives", async ({ page }) => {
  await openStory(page, "recommended-mergora");
  const file = page.getByRole("menuitem", { name: "File" });
  await file.focus();
  await page.keyboard.press("ArrowRight");
  await expect(page.getByRole("menuitem", { name: "Edit" })).toBeFocused();
  await page.keyboard.press("ArrowDown");
  await expect(page.getByRole("menu", { name: "Edit menu" })).toBeVisible();
  await page.keyboard.press("Escape");

  const trigger = page.getByRole("button", { name: "Open Green geometry study" });
  await trigger.click();
  await expect(page.getByRole("dialog", { name: "Green geometry study" })).toBeVisible();
  await page.keyboard.press("ArrowRight");
  await expect(page.getByRole("dialog", { name: "Violet geometry study" })).toBeVisible();
  await page.keyboard.press("Home");
  await expect(page.getByRole("dialog", { name: "Green geometry study" })).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(trigger).toBeFocused();
});

test("urgent notifications expose durable recovery without over-announcing", async ({ page }) => {
  await openStory(page, "toast-priority-recovery");
  const urgent = page.getByRole("alert");
  await expect(urgent).toContainText("Update could not be sent");
  await expect(page.locator('[data-slot="toast-message"][role="status"]')).toContainText(
    "Connection is taking longer",
  );
  await page.getByRole("button", { name: "Try again" }).click();
  await expect(page.getByText("Recovery requested")).toBeVisible();
  await expect(urgent).toHaveCount(0);
  expect(await axeViolations(page)).toEqual([]);
});

test("touch press paths retain complete alternatives and target size", async ({ browser }) => {
  const context = await browser.newContext({
    hasTouch: true,
    isMobile: true,
    viewport: { height: 844, width: 390 },
  });
  const page = await context.newPage();
  const failures = guardRuntime(page);
  await openStory(page, "recommended-mergora");
  for (let index = 0; index < 2; index += 1) {
    const dismiss = page.getByRole("button", { name: "Dismiss notification" });
    if ((await dismiss.count()) > 0) await dismiss.first().tap();
  }

  const contextTarget = page.getByRole("button", { name: "Context target" });
  await contextTarget.tap();
  const canvasMenu = page.getByRole("menu", { name: "Canvas actions" });
  await expect(canvasMenu).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(canvasMenu).toBeHidden();
  await settleAnimations(page);

  const preview = page.getByRole("button", { name: "Preview token" });
  await preview.tap();
  const pinStatus = page.locator('[data-slot="hover-card-pin-status"]');
  await expect(pinStatus).toContainText("pinned");
  const closePreview = page.getByRole("button", { name: "Close preview" });
  const [statusBounds, closeBounds] = await Promise.all([
    pinStatus.boundingBox(),
    closePreview.boundingBox(),
  ]);
  expect(statusBounds).not.toBeNull();
  expect(closeBounds).not.toBeNull();
  expect(
    statusBounds!.x < closeBounds!.x + closeBounds!.width &&
      statusBounds!.x + statusBounds!.width > closeBounds!.x &&
      statusBounds!.y < closeBounds!.y + closeBounds!.height &&
      statusBounds!.y + statusBounds!.height > closeBounds!.y,
  ).toBe(false);
  await closePreview.tap();
  await expect(pinStatus).toHaveCount(0);
  await settleAnimations(page);

  await page.getByRole("button", { name: "Open detail drawer" }).tap();
  const swipeHandle = page.locator('[data-slot="drawer-swipe-handle"]');
  await expect(swipeHandle).toHaveCSS("min-width", "44px");
  await expect(swipeHandle).toHaveCSS("min-height", "44px");
  await swipeHandle.focus();
  await page.keyboard.press("Enter");
  await expect(page.getByRole("dialog", { name: "Detail drawer" })).toHaveCount(0);

  const drawerTrigger = page.getByRole("button", { name: "Open detail drawer" });
  await drawerTrigger.tap();
  await page.locator('[data-slot="drawer-swipe-handle"]').evaluate((element) => {
    const target = element as HTMLButtonElement;
    Object.defineProperty(target, "setPointerCapture", {
      configurable: true,
      value: () => undefined,
    });
    target.dispatchEvent(
      new PointerEvent("pointerdown", {
        bubbles: true,
        clientY: 100,
        pointerId: 7,
        pointerType: "touch",
      }),
    );
    target.dispatchEvent(
      new PointerEvent("pointermove", {
        bubbles: true,
        clientY: 200,
        pointerId: 7,
        pointerType: "touch",
      }),
    );
    target.dispatchEvent(
      new PointerEvent("pointerup", {
        bubbles: true,
        clientY: 200,
        pointerId: 7,
        pointerType: "touch",
      }),
    );
  });
  await expect(page.getByRole("dialog", { name: "Detail drawer" })).toHaveCount(0);
  await expect(drawerTrigger).toBeFocused();

  await page.getByRole("button", { name: "Open Green geometry study" }).tap();
  const next = page.getByRole("button", { name: "Next image" });
  await expect(next).toHaveCSS("min-width", "44px");
  await expect(next).toHaveCSS("min-height", "44px");
  const stage = page.locator('[data-slot="lightbox-stage"]');
  await stage.dispatchEvent("pointerdown", {
    clientX: 250,
    pointerId: 9,
    pointerType: "touch",
  });
  await stage.dispatchEvent("pointerup", {
    clientX: 100,
    pointerId: 9,
    pointerType: "touch",
  });
  await expect(page.getByRole("dialog", { name: "Violet geometry study" })).toBeVisible();
  await settleAnimations(page);
  expect(await axeViolations(page)).toEqual([]);
  expect(failures).toEqual([]);
  await context.close();
});

test("narrow RTL and preference modes retain boundaries without page overflow", async ({
  browser,
}) => {
  const context = await browser.newContext({
    forcedColors: "active",
    reducedMotion: "reduce",
    viewport: { height: 568, width: 320 },
  });
  const page = await context.newPage();
  const failures = guardRuntime(page);
  await openStory(page, "narrow-rtl");
  await page.getByRole("button", { name: "Dismiss notification" }).click();
  await page.getByRole("button", { name: "فتح لوحة التفاصيل" }).click();
  const dialog = page.getByRole("dialog", { name: "لوحة التفاصيل" });
  await expect(dialog).toBeVisible();
  const geometry = await dialog.evaluate((element) => {
    const bounds = element.getBoundingClientRect();
    return {
      left: bounds.left,
      right: bounds.right,
      viewport: document.documentElement.clientWidth,
      overflow: document.documentElement.scrollWidth > document.documentElement.clientWidth + 1,
    };
  });
  expect(geometry.left).toBeGreaterThanOrEqual(-1);
  expect(geometry.right).toBeLessThanOrEqual(geometry.viewport + 1);
  expect(geometry.overflow).toBe(false);
  const styles = await dialog.evaluate((element) => ({
    animation: getComputedStyle(element).animationName,
    border: getComputedStyle(element).borderStyle,
  }));
  expect(styles.animation).toBe("none");
  expect(styles.border).not.toBe("none");
  expect(await axeViolations(page)).toEqual([]);
  expect(failures).toEqual([]);
  await context.close();
});
