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
  await page.goto(`/iframe.html?viewMode=story&id=p2-overlays--${story}`, {
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

async function assertViewportContained(page: Page, selector: string): Promise<void> {
  const geometry = await page.locator(selector).evaluate((element) => {
    const bounds = element.getBoundingClientRect();
    return {
      bottom: bounds.bottom,
      left: bounds.left,
      right: bounds.right,
      top: bounds.top,
      viewportHeight: document.documentElement.clientHeight,
      viewportWidth: document.documentElement.clientWidth,
    };
  });
  expect(geometry.left).toBeGreaterThanOrEqual(-1);
  expect(geometry.top).toBeGreaterThanOrEqual(-1);
  expect(geometry.right).toBeLessThanOrEqual(geometry.viewportWidth + 1);
  expect(geometry.bottom).toBeLessThanOrEqual(geometry.viewportHeight + 1);
}

async function assertMinimumTarget(page: Page, selector: string, minimum = 44): Promise<void> {
  const geometry = await page.locator(selector).evaluate((element) => {
    const bounds = element.getBoundingClientRect();
    return { height: bounds.height, width: bounds.width };
  });
  expect(geometry.height).toBeGreaterThanOrEqual(minimum);
  expect(geometry.width).toBeGreaterThanOrEqual(minimum);
}

test("modal Dialog names content, contains focus, blocks background, restores scroll and trigger", async ({
  page,
}) => {
  await openStory(page, "dialog-modal-policy");
  const trigger = page.getByRole("button", { name: "Open release review" });
  await trigger.click();
  const dialog = page.getByRole("dialog", { name: "Release review" });
  await expect(dialog).toBeVisible();
  await expect(dialog).toHaveAttribute("aria-describedby", "release-review-consequence");
  await expect(page.locator("#release-review-consequence")).toHaveCount(1);
  await expect(page.getByLabel("Candidate note")).toBeFocused();
  await expect(page.getByTestId("application-root")).toHaveAttribute("inert", "");
  await expect
    .poll(() => page.locator("html").evaluate((element) => getComputedStyle(element).overflow))
    .toBe("hidden");
  await expect(page.locator("html")).not.toHaveAttribute("data-mergora-scroll-locked", "true");
  await expect(page.locator('[data-slot="dialog-overlay"]')).toHaveAttribute("lang", "en-US");
  await expect(page.locator('[data-slot="dialog-overlay"]')).toHaveAttribute("dir", "ltr");
  await expect(page.getByRole("button", { name: "Close review dialog" })).toBeVisible();
  await expect(page.locator('[data-slot="dialog-overlay"]')).not.toHaveAttribute(
    "data-entering",
    "true",
  );
  await assertMinimumTarget(page, '[data-slot="dialog-close"]');

  await page.keyboard.press("Tab");
  await expect(page.getByRole("button", { name: "Close review dialog" })).toBeFocused();
  await page.keyboard.press("Tab");
  await expect(page.getByLabel("Candidate note")).toBeFocused();
  expect(await axeViolations(page)).toEqual([]);

  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();
  await expect(trigger).toBeFocused();
  await expect(page.getByTestId("dialog-reason")).toContainText("escape-key");
  await expect(page.getByTestId("application-root")).not.toHaveAttribute("inert", "");
  await expect
    .poll(() => page.locator("html").evaluate((element) => getComputedStyle(element).overflow))
    .not.toBe("hidden");

  await trigger.click();
  await page.mouse.click(2, 2);
  await expect(dialog).toBeHidden();
  await expect(page.getByTestId("dialog-reason")).toContainText("outside-interaction");
});

test("non-modal Dialog leaves the application operable and does not trap focus", async ({
  page,
}) => {
  await openStory(page, "dialog-non-modal");
  const trigger = page.getByRole("button", { name: "Open non-modal inspector" });
  await trigger.click();
  const dialog = page.getByRole("dialog", { name: "Candidate inspector" });
  await expect(dialog).toBeVisible();
  await expect(page.getByTestId("application-root")).not.toHaveAttribute("inert", "");
  await expect(page.locator("html")).not.toHaveAttribute("data-mergora-scroll-locked", "true");
  await expect(page.locator('[data-slot="dialog-overlay"]')).toHaveAttribute("data-modal", "false");
  await page.getByTestId("nonmodal-background").click();
  await expect(dialog).toBeHidden();
  await expect(page.getByTestId("nonmodal-background")).toBeFocused();

  await trigger.click();
  await expect(dialog).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();
  await expect(trigger).toBeFocused();
  expect(await axeViolations(page)).toEqual([]);
});

test("Alert Dialog uses least-destructive focus and explicit completed actions", async ({
  page,
}) => {
  await openStory(page, "alert-dialog-destructive");
  const trigger = page.getByRole("button", { name: "Delete release snapshot" });
  await trigger.click();
  const dialog = page.getByRole("alertdialog", { name: "Delete release snapshot?" });
  const cancel = page.getByRole("button", { name: "Keep snapshot" });
  const destroy = page.getByRole("button", { name: "Delete snapshot permanently" });
  await expect(dialog).toBeVisible();
  await expect(cancel).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(dialog).toBeVisible();
  await page.mouse.click(2, 2);
  await expect(dialog).toBeVisible();
  await destroy.dispatchEvent("pointerdown", { pointerType: "mouse" });
  await expect(page.getByRole("status")).toHaveText("No decision");
  await expect(dialog).toBeVisible();
  await destroy.click();
  await expect(dialog).toBeHidden();
  await expect(page.getByRole("status")).toHaveText("Snapshot deleted");
  await expect(trigger).toBeFocused();
  expect(await axeViolations(page)).toEqual([]);
});

test("Sheet follows each edge, keeps bounded scrolling, and adapts at 320x568", async ({
  page,
}) => {
  await page.setViewportSize({ height: 568, width: 320 });
  await openStory(page, "sheet-edges");
  await page.getByRole("button", { name: "Use start edge" }).click();
  const trigger = page.getByRole("button", { name: "Open release panel" });
  await trigger.click();
  const sheet = page.getByRole("dialog", { name: "Release details" });
  const overlay = page.locator('[data-slot="sheet-overlay"]');
  await expect(overlay).toHaveAttribute("data-side", "start");
  await expect(overlay).toHaveAttribute("data-size", "md");
  await expect(overlay).not.toHaveAttribute("data-entering", "true");
  await assertViewportContained(page, '[data-slot="sheet-content"]');
  const scroll = await page.locator('[data-slot="sheet-content"]').evaluate((element) => ({
    clientHeight: element.clientHeight,
    scrollHeight: element.scrollHeight,
  }));
  expect(scroll.scrollHeight).toBeGreaterThan(scroll.clientHeight);
  await page.getByRole("button", { name: "Close release panel" }).scrollIntoViewIfNeeded();
  await expect(page.getByRole("button", { name: "Close release panel" })).toBeVisible();
  expect(await axeViolations(page)).toEqual([]);
  await page.getByRole("button", { name: "Close release panel" }).click();
  await expect(sheet).toBeHidden();
  await expect(trigger).toBeFocused();
});

test("Popover flips at the viewport edge without creating modality", async ({ page }) => {
  await page.setViewportSize({ height: 240, width: 320 });
  await openStory(page, "popover-collision");
  const trigger = page.getByRole("button", { name: "Open edge inspector" });
  await trigger.click();
  const popover = page.locator('[data-slot="popover"]');
  await expect(page.getByRole("dialog", { name: "Edge inspector" })).toBeVisible();
  await expect(page.getByRole("dialog", { name: "Edge inspector" })).toHaveAttribute(
    "aria-describedby",
    "edge-inspector-description",
  );
  await expect(page.locator("#edge-inspector-description")).toHaveCount(1);
  await expect(page.getByTestId("application-root")).not.toHaveAttribute("inert", "");
  await expect(page.locator("html")).not.toHaveAttribute("data-mergora-scroll-locked", "true");
  await expect(popover).toHaveAttribute("data-placement", "top");
  await assertViewportContained(page, '[data-slot="popover"]');
  await expect(page.locator('[data-slot="popover-arrow"]')).toBeVisible();
  await expect(page.getByRole("button", { name: "Dismiss edge inspector" })).toBeFocused();
  await expect(popover).not.toHaveAttribute("data-entering", "true");
  expect(await axeViolations(page)).toEqual([]);
  await page.keyboard.press("Escape");
  await expect(popover).toBeHidden();
  await expect(trigger).toBeFocused();
});

test("Tooltip delay, hover persistence, describedby lifecycle, Escape, and disabled adapter work", async ({
  page,
}) => {
  await openStory(page, "tooltip-policies");
  const trigger = page.getByRole("button", { name: "Copy digest" });
  await trigger.focus();
  const tooltip = page.getByRole("tooltip", { name: /Copy the immutable release digest/u });
  await expect(tooltip).toBeVisible();
  const describedBy = await trigger.getAttribute("aria-describedby");
  expect(describedBy).toMatch(/^\S+$/u);
  await expect(page.locator(`#${describedBy}`)).toHaveAttribute("role", "tooltip");
  await page.keyboard.press("Escape");
  await expect(tooltip).toBeHidden();
  await expect(trigger).not.toHaveAttribute("aria-describedby", describedBy!);

  await trigger.hover();
  await expect(tooltip).toBeVisible();
  await tooltip.hover();
  await page.waitForTimeout(220);
  await expect(tooltip).toBeVisible();
  await page.getByRole("heading", { level: 1 }).hover();
  await expect(tooltip).toBeHidden();

  const disabled = page.getByRole("button", { name: "Publish unavailable" });
  await expect(disabled).toHaveAttribute("aria-disabled", "true");
  // Use an actual keyboard transition after the pointer-hover assertions so React Aria's
  // focus-visible modality (and therefore the keyboard tooltip path) is exercised.
  await page.keyboard.press("Tab");
  await expect(disabled).toBeFocused();
  await expect(
    page.getByRole("tooltip", { name: "Publishing requires verified provenance" }),
  ).toBeVisible();
  await expect(page.locator('[data-slot="tooltip"]')).not.toHaveAttribute("data-entering", "true");
  expect(await axeViolations(page)).toEqual([]);
  await disabled.press("Enter");
  await expect(disabled).toBeFocused();
  await expect(page.getByRole("tooltip")).toHaveCount(0);
});

test("touch pointerdown does not create a long-press-only Tooltip path", async ({ browser }) => {
  const context = await browser.newContext({
    hasTouch: true,
    isMobile: true,
    viewport: { height: 568, width: 320 },
  });
  const page = await context.newPage();
  const failures = guardRuntime(page);
  await openStory(page, "tooltip-policies");
  const trigger = page.getByRole("button", { name: "Copy digest" });
  await trigger.dispatchEvent("pointerdown", { pointerType: "touch" });
  await page.waitForTimeout(800);
  await expect(page.getByRole("tooltip")).toHaveCount(0);
  expect(failures).toEqual([]);
  await context.close();
});

test("nested Dialog, Popover, and Tooltip preserve portal context and dismiss topmost first", async ({
  page,
}) => {
  await openStory(page, "nested-overlays");
  const dialogTrigger = page.getByRole("button", { name: "פתיחת סקירת שכבות" });
  await dialogTrigger.click();
  const dialog = page.getByRole("dialog", { name: "סקירת שכבות" });
  const popoverTrigger = page.getByRole("button", { name: "פתיחת פרטי ראיה" });
  await expect(dialog).toBeVisible();
  await expect(page.locator('[data-slot="dialog-overlay"]')).toHaveAttribute("lang", "he-IL");
  await expect(page.locator('[data-slot="dialog-overlay"]')).toHaveAttribute("dir", "rtl");
  await expect(page.locator('[data-slot="dialog-overlay"]')).toHaveAttribute(
    "data-density",
    "touch",
  );

  await popoverTrigger.click();
  const popover = page.getByRole("dialog", { name: "פרטי ראיה" });
  await expect(popover).toBeVisible();
  const popoverStack = await page.evaluate(() => {
    const dialogOverlay = document.querySelector<HTMLElement>('[data-slot="dialog-overlay"]')!;
    const popoverRoot = document.querySelector<HTMLElement>('[data-slot="popover"]')!;
    const bounds = popoverRoot.getBoundingClientRect();
    const hit = document.elementFromPoint(
      bounds.left + bounds.width / 2,
      bounds.top + bounds.height / 2,
    );
    return {
      dialogZ: Number.parseInt(getComputedStyle(dialogOverlay).zIndex, 10),
      hitPopover: hit?.closest('[data-slot="popover"]') === popoverRoot,
      popoverZ: Number.parseInt(getComputedStyle(popoverRoot).zIndex, 10),
    };
  });
  expect(popoverStack.popoverZ).toBeGreaterThan(popoverStack.dialogZ);
  expect(popoverStack.hitPopover).toBe(true);
  const tooltipTrigger = page.getByRole("button", { name: "מידע על העיכול" });
  await tooltipTrigger.focus();
  const tooltip = page.getByRole("tooltip", { name: "עיכול בלתי ניתן לשינוי" });
  await expect(tooltip).toBeVisible();
  await expect(page.locator('[data-slot="tooltip"]')).toHaveAttribute("lang", "he-IL");
  await expect(page.locator('[data-slot="tooltip"]')).toHaveAttribute("dir", "rtl");
  await expect(page.locator('[data-slot="tooltip"]')).toHaveAttribute("data-density", "touch");
  const tooltipStack = await page.evaluate(() => ({
    popoverZ: Number.parseInt(
      getComputedStyle(document.querySelector<HTMLElement>('[data-slot="popover"]')!).zIndex,
      10,
    ),
    tooltipZ: Number.parseInt(
      getComputedStyle(document.querySelector<HTMLElement>('[data-slot="tooltip"]')!).zIndex,
      10,
    ),
  }));
  expect(tooltipStack.tooltipZ).toBeGreaterThan(tooltipStack.popoverZ);

  await page.keyboard.press("Escape");
  await expect(tooltip).toBeHidden();
  await expect(popover).toBeVisible();
  await expect(dialog).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(popover).toBeHidden();
  await expect(dialog).toBeVisible();

  const nestedTrigger = page.getByRole("button", { name: "Open nested modal" });
  await nestedTrigger.click();
  const nestedDialog = page.getByRole("dialog", { name: "Nested modal review" });
  await expect(nestedDialog).toBeVisible();
  await expect(dialog).toBeVisible();
  const modalStack = await page
    .locator('[data-slot="dialog-overlay"]')
    .evaluateAll((overlays) =>
      overlays.map((overlay) => Number.parseInt(getComputedStyle(overlay).zIndex, 10)),
    );
  expect(modalStack).toHaveLength(2);
  expect(modalStack[1]).toBeGreaterThan(modalStack[0]!);
  await page.keyboard.press("Escape");
  await expect(nestedDialog).toBeHidden();
  await expect(dialog).toBeVisible();
  await expect(nestedTrigger).toBeFocused();

  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();
  await expect(dialogTrigger).toBeFocused();
  expect(await axeViolations(page)).toEqual([]);
});

test("removed opener restores to the documented workflow successor", async ({ page }) => {
  await openStory(page, "removed-opener");
  await page.getByRole("button", { name: "Open transient review" }).click();
  await expect(page.getByRole("button", { name: "Open transient review" })).toHaveCount(0);
  await page.getByRole("button", { name: "Finish review" }).click();
  await expect(page.getByRole("dialog", { name: "Transient review" })).toBeHidden();
  await expect(page.getByTestId("workflow-successor")).toBeFocused();
});

test("mixed modal owners keep one stack while cleanup remains singly owned", async ({ page }) => {
  await openStory(page, "mixed-environment-ownership");
  const application = page.getByTestId("application-root");
  const nativeLayer = page.locator('[data-layer-id="native-managed-modal"]');
  await expect(application).toHaveAttribute("inert", "");
  await expect(page.locator("html")).toHaveAttribute("data-mergora-scroll-locked", "true");
  await expect(nativeLayer).toHaveAttribute("data-layer-manages-environment", "true");

  const trigger = page.getByRole("button", { name: "Open externally managed dialog" });
  await trigger.click();
  const dialog = page.getByRole("dialog", { name: "External behavior owner" });
  const externalLayer = page.locator('[data-layer-manages-environment="false"]');
  await expect(dialog).toBeVisible();
  await expect(externalLayer).toHaveAttribute("data-layer-top", "true");
  await expect(application).toHaveAttribute("inert", "");
  await expect(page.locator("html")).toHaveAttribute("data-mergora-scroll-locked", "true");

  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();
  await expect(trigger).toBeFocused();
  await expect(nativeLayer).toHaveAttribute("data-layer-top", "true");
  await expect(application).toHaveAttribute("inert", "");

  await page.keyboard.press("Escape");
  await expect(nativeLayer).toHaveCount(0);
  await expect(application).not.toHaveAttribute("inert", "");
  await expect(page.locator("html")).not.toHaveAttribute("data-mergora-scroll-locked", "true");
});

test("SSR markup hydrates cleanly before a deferred Dialog portal opens", async ({ page }) => {
  await openStory(page, "ssr-hydration");
  const host = page.getByTestId("hydration-host");
  await expect(host).toHaveAttribute("data-hydrated", "true");
  await expect(host).not.toHaveAttribute("data-hydration-error");

  const trigger = page.getByRole("button", { name: "Open hydrated dialog" });
  await trigger.click();
  const dialog = page.getByRole("dialog", { name: "Hydrated release review" });
  await expect(dialog).toBeVisible();
  await expect(page.getByRole("button", { name: "Close hydrated dialog" })).toBeFocused();
  await expect(page.locator('[data-slot="dialog-overlay"]')).not.toHaveAttribute(
    "data-entering",
    "true",
  );
  expect(await axeViolations(page)).toEqual([]);
  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();
  await expect(trigger).toBeFocused();
});

test("explicit RTL maps logical start physically while keeping the English locale", async ({
  page,
}) => {
  await page.setViewportSize({ height: 600, width: 800 });
  await openStory(page, "rtl-direction-override");
  const popoverTrigger = page.getByRole("button", { name: "Open logical start popover" });
  await popoverTrigger.click();
  const placement = await page.evaluate(() => {
    const trigger = document.querySelector<HTMLElement>('[data-slot="popover-trigger"]')!;
    const popover = document.querySelector<HTMLElement>('[data-slot="popover"]')!;
    const triggerBounds = trigger.getBoundingClientRect();
    const popoverBounds = popover.getBoundingClientRect();
    return {
      gap: Math.abs(popoverBounds.left - triggerBounds.right),
      physicalRight: popoverBounds.left >= triggerBounds.right - 1,
    };
  });
  expect(placement.physicalRight).toBe(true);
  expect(placement.gap).toBeLessThanOrEqual(16);
  await expect(page.locator('[data-slot="popover"]')).toHaveAttribute("lang", "en-US");
  await expect(page.locator('[data-slot="popover"]')).toHaveAttribute("dir", "rtl");
  await page.keyboard.press("Escape");

  await page.getByRole("button", { name: "Open logical start sheet" }).click();
  await expect(page.locator('[data-slot="sheet-overlay"]')).not.toHaveAttribute(
    "data-entering",
    "true",
  );
  const sheetBounds = await page.locator('[data-slot="sheet-content"]').boundingBox();
  expect(sheetBounds).not.toBeNull();
  expect(Math.abs(sheetBounds!.x + sheetBounds!.width - 800)).toBeLessThanOrEqual(1);
  await expect(page.locator('[data-slot="sheet-overlay"]')).toHaveAttribute("lang", "en-US");
  await expect(page.locator('[data-slot="sheet-overlay"]')).toHaveAttribute("dir", "rtl");
});

test("400% equivalent 320px long-locale reflow has no clipping and keeps focus visible", async ({
  page,
}) => {
  await page.setViewportSize({ height: 568, width: 320 });
  await openStory(page, "narrow-reflow");
  await page
    .getByRole("button", { name: "Unabhängig verifizierte Veröffentlichung öffnen" })
    .click();
  await assertViewportContained(page, '[data-slot="dialog-content"]');
  const layout = await page.evaluate(() => {
    const viewportWidth = document.documentElement.clientWidth;
    return {
      documentOverflow: document.documentElement.scrollWidth > viewportWidth + 1,
      offenders: [...document.body.querySelectorAll<HTMLElement>("*")]
        .filter((element) => {
          const bounds = element.getBoundingClientRect();
          return bounds.left < -1 || bounds.right > viewportWidth + 1;
        })
        .map((element) => element.dataset.slot ?? element.tagName.toLowerCase()),
    };
  });
  expect(layout.documentOverflow).toBe(false);
  expect(layout.offenders).toEqual([]);
  const content = page.locator('[data-slot="dialog-content"]');
  await expect(content).toBeFocused();
  await expect(page.locator('[data-slot="dialog-overlay"]')).not.toHaveAttribute(
    "data-entering",
    "true",
  );
  expect(await axeViolations(page)).toEqual([]);
});

test("200% text resize and WCAG text spacing preserve Dialog content and controls", async ({
  page,
}) => {
  await page.setViewportSize({ height: 568, width: 320 });
  await openStory(page, "narrow-reflow");
  await page.addStyleTag({
    content: `
      :root { font-size: 200% !important; }
      * { letter-spacing: 0.12em !important; line-height: 1.5 !important; word-spacing: 0.16em !important; }
      p { margin-block-end: 2em !important; }
    `,
  });
  await page
    .getByRole("button", { name: "Unabhängig verifizierte Veröffentlichung öffnen" })
    .click();

  const dialog = page.locator('[data-slot="dialog-content"]');
  await expect(dialog).toBeVisible();
  await assertViewportContained(page, '[data-slot="dialog-content"]');
  const horizontalOverflow = await page.evaluate(() => {
    const viewportWidth = document.documentElement.clientWidth;
    return {
      document: document.documentElement.scrollWidth > viewportWidth + 1,
      dialog: (() => {
        const element = document.querySelector<HTMLElement>('[data-slot="dialog-content"]')!;
        return element.scrollWidth > element.clientWidth + 1;
      })(),
    };
  });
  expect(horizontalOverflow).toEqual({ dialog: false, document: false });

  const close = page.getByRole("button", { name: "Zur Veröffentlichungsprüfung zurückkehren" });
  await close.scrollIntoViewIfNeeded();
  await expect(close).toBeVisible();
  await close.focus();
  await expect(close).toBeFocused();
  expect(await axeViolations(page)).toEqual([]);
});

test("IME composition consumes Escape before Dialog dismissal", async ({ page }) => {
  await openStory(page, "ime-escape");
  await page.getByRole("button", { name: "編集ダイアログを開く" }).click();
  const dialog = page.getByRole("dialog", { name: "候補を編集" });
  const input = page.getByLabel("候補名");
  await input.focus();
  await input.evaluate((element) => {
    element.dispatchEvent(
      new CompositionEvent("compositionstart", { bubbles: true, data: "候補" }),
    );
    element.dispatchEvent(
      new KeyboardEvent("keydown", {
        bubbles: true,
        cancelable: true,
        isComposing: true,
        key: "Escape",
      }),
    );
  });
  await expect(dialog).toBeVisible();
  await input.evaluate((element) => {
    element.dispatchEvent(new CompositionEvent("compositionend", { bubbles: true, data: "候補" }));
  });
  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();
});

test("forced colors and reduced motion retain structural boundaries and static state", async ({
  browser,
}) => {
  const context = await browser.newContext({ forcedColors: "active", reducedMotion: "reduce" });
  const page = await context.newPage();
  const failures = guardRuntime(page);
  await openStory(page, "dialog-modal-policy");
  await page.getByRole("button", { name: "Open release review" }).click();
  const styles = await page.locator('[data-slot="dialog-content"]').evaluate((element) => {
    const computed = getComputedStyle(element);
    return { border: computed.borderStyle, boxShadow: computed.boxShadow };
  });
  const animation = await page
    .locator('[data-slot="dialog-overlay"]')
    .evaluate((element) => getComputedStyle(element).animationName);
  expect(styles.border).not.toBe("none");
  expect(styles.boxShadow).toBe("none");
  expect(animation).toBe("none");
  expect(await axeViolations(page)).toEqual([]);
  expect(failures).toEqual([]);
  await context.close();
});
