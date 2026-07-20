import { resolve } from "node:path";

import { expect, test, type ConsoleMessage, type Page } from "@playwright/test";

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

async function openStory(page: Page, story: string, readySlot = "attachment"): Promise<void> {
  await page.goto(`/iframe.html?viewMode=story&id=components-media-editing--${story}`, {
    waitUntil: "domcontentloaded",
  });
  await expect(page.locator(`[data-slot="${readySlot}"]`).first()).toBeVisible();
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
          if (
            !(error instanceof Error) ||
            !error.message.toLowerCase().includes("axe is already running")
          )
            throw error;
          await new Promise((resolveDelay) => setTimeout(resolveDelay, 100));
        }
      }
      throw new Error("Axe remained busy for five seconds.");
    },
    { ignoreColorContrast },
  );
}

test("media editing basic mode removes every optional enhancement", async ({ page }) => {
  await openStory(page, "basic-defaults");
  for (const slot of [
    "attachment-safety",
    "attachment-status",
    "image-status",
    "image-cropper-numeric",
    "image-cropper-preview",
    "markdown-renderer-boundary",
    "markdown-editor-toolbar",
    "markdown-editor-preview",
    "media-player-chapters",
    "media-player-transcript",
    "emoji-picker-controls",
    "emoji-picker-summary",
    "signature-pad-keyboard-controls",
    "signature-pad-legal-caveat",
    "rich-text-editor-adapter-boundary",
    "rich-text-editor-serialization",
    "rich-text-editor-status",
  ])
    await expect(page.locator(`[data-slot="${slot}"]`)).toHaveCount(0);
  expect(await axeViolations(page)).toEqual([]);
});

test("recommended mode exposes bounded enhancements and grid keyboard selection", async ({
  page,
}) => {
  await openStory(page, "recommended-mergora");
  await expect(page.locator('[data-slot="attachment-safety"]')).toContainText("not verified");
  await expect(page.locator('[data-slot="markdown-editor-toolbar"]')).toHaveAttribute(
    "role",
    "toolbar",
  );
  await expect(page.locator('[data-slot="media-player-transcript"]')).toBeVisible();
  const cells = page.getByRole("gridcell");
  await cells.first().focus();
  await cells.first().press("ArrowRight");
  await expect(cells.nth(1)).toBeFocused();
  const selectedLabel = await cells.nth(1).getAttribute("aria-label");
  expect(selectedLabel).not.toBeNull();
  await cells.nth(1).press("Enter");
  await expect(page.getByRole("gridcell", { name: selectedLabel! })).toHaveAttribute(
    "aria-selected",
    "true",
  );
  expect(await axeViolations(page)).toEqual([]);
});

test("crop keyboard, Markdown shortcuts, and signature keyboard path remain operable", async ({
  page,
}) => {
  await openStory(page, "recommended-mergora");
  const crop = page.locator('[data-slot="image-cropper-area"]');
  const horizontal = page.getByLabel("Horizontal");
  const before = Number(await horizontal.inputValue());
  await crop.focus();
  await crop.press("ArrowRight");
  await expect.poll(async () => Number(await horizontal.inputValue())).toBeGreaterThan(before);

  const editor = page.getByRole("textbox", { name: "Release note" });
  await editor.evaluate((element: HTMLTextAreaElement) => element.setSelectionRange(0, 1));
  await editor.press("Control+b");
  await expect(editor).toHaveValue(/^\*\*/u);

  const canvas = page.locator('[data-slot="signature-pad-canvas"]');
  await canvas.focus();
  await canvas.press("ArrowRight");
  await canvas.press("Space");
  await expect(page.getByText("1 signature stroke")).toBeAttached();
});

test("crop and signature pointer capture survives movement, cancels cleanly, and stores normalized vectors", async ({
  page,
}) => {
  await openStory(page, "recommended-mergora");

  const crop = page.locator('[data-slot="image-cropper-area"]');
  await crop.scrollIntoViewIfNeeded();
  const cropBounds = await crop.boundingBox();
  expect(cropBounds).not.toBeNull();
  if (cropBounds === null) return;
  await crop.evaluate((element) => {
    element.addEventListener(
      "gotpointercapture",
      (event) =>
        element.setAttribute(
          "data-test-captured-pointer",
          String((event as PointerEvent).pointerId),
        ),
      { once: true },
    );
  });
  const cropInput = page.locator('[data-slot="image-cropper-input"]');
  const initialCrop = JSON.parse(await cropInput.inputValue()) as { x: number; y: number };
  await page.mouse.move(cropBounds.x + cropBounds.width / 2, cropBounds.y + cropBounds.height / 2);
  await page.mouse.down();
  await page.mouse.move(
    cropBounds.x + cropBounds.width / 2 + 28,
    cropBounds.y + cropBounds.height / 2 + 18,
    { steps: 6 },
  );
  const capturedCropPointer = await crop.getAttribute("data-test-captured-pointer");
  expect(capturedCropPointer).not.toBeNull();
  const cropPointerId = Number(capturedCropPointer);
  expect(Number.isSafeInteger(cropPointerId)).toBe(true);
  expect(
    await crop.evaluate(
      (element, pointerId) => element.hasPointerCapture(pointerId),
      cropPointerId,
    ),
  ).toBe(true);
  const movedCrop = JSON.parse(await cropInput.inputValue()) as { x: number; y: number };
  expect(movedCrop.x).toBeGreaterThan(initialCrop.x);
  expect(movedCrop.y).toBeGreaterThan(initialCrop.y);
  await crop.dispatchEvent("pointercancel", {
    button: 0,
    isPrimary: true,
    pointerId: cropPointerId,
    pointerType: "mouse",
  });
  await page.mouse.move(cropBounds.x + cropBounds.width - 2, cropBounds.y + cropBounds.height - 2, {
    steps: 3,
  });
  await page.mouse.up();
  expect(JSON.parse(await cropInput.inputValue())).toEqual(movedCrop);
  expect(
    await crop.evaluate(
      (element, pointerId) => element.hasPointerCapture(pointerId),
      cropPointerId,
    ),
  ).toBe(false);

  const canvas = page.locator('[data-slot="signature-pad-canvas"]');
  await canvas.scrollIntoViewIfNeeded();
  const canvasBounds = await canvas.boundingBox();
  expect(canvasBounds).not.toBeNull();
  if (canvasBounds === null) return;
  await canvas.evaluate((element) => {
    element.addEventListener(
      "gotpointercapture",
      (event) =>
        element.setAttribute(
          "data-test-captured-pointer",
          String((event as PointerEvent).pointerId),
        ),
      { once: true },
    );
  });
  await page.mouse.move(canvasBounds.x + 24, canvasBounds.y + 24);
  await page.mouse.down();
  await page.mouse.move(canvasBounds.x + canvasBounds.width / 2, canvasBounds.y + 54, {
    steps: 8,
  });
  const capturedSignaturePointer = await canvas.getAttribute("data-test-captured-pointer");
  expect(capturedSignaturePointer).not.toBeNull();
  const signaturePointerId = Number(capturedSignaturePointer);
  expect(Number.isSafeInteger(signaturePointerId)).toBe(true);
  expect(
    await canvas.evaluate(
      (element, pointerId) => element.hasPointerCapture(pointerId),
      signaturePointerId,
    ),
  ).toBe(true);
  await canvas.dispatchEvent("pointercancel", {
    button: 0,
    isPrimary: true,
    pointerId: signaturePointerId,
    pointerType: "mouse",
  });
  await page.mouse.up();
  expect(
    await canvas.evaluate(
      (element, pointerId) => element.hasPointerCapture(pointerId),
      signaturePointerId,
    ),
  ).toBe(false);
  const signature = JSON.parse(
    await page.locator('[data-slot="signature-pad-input"]').inputValue(),
  ) as { method: string; strokes: { x: number; y: number }[][] };
  expect(signature.method).toBe("draw");
  expect(signature.strokes).toHaveLength(1);
  expect(signature.strokes[0]!.length).toBeGreaterThan(1);
  for (const point of signature.strokes[0]!) {
    expect(point.x).toBeGreaterThanOrEqual(0);
    expect(point.x).toBeLessThanOrEqual(1);
    expect(point.y).toBeGreaterThanOrEqual(0);
    expect(point.y).toBeLessThanOrEqual(1);
  }
  await expect(page.getByText("1 signature stroke")).toBeAttached();
  expect(await axeViolations(page)).toEqual([]);
});

test("native form submission and reset preserve canonical values", async ({ page }) => {
  await openStory(page, "form-serialization-and-reset", "markdown-editor");
  const note = page.getByRole("textbox", { name: "Form note" });
  const signature = page.getByRole("textbox", { name: "Typed signature" });
  const cropHorizontal = page.getByLabel("Horizontal");
  await note.fill("Changed note");
  await signature.fill("Changed mark");
  await cropHorizontal.fill("24");
  await page.getByRole("button", { name: "Submit example" }).click();
  const submission = page.locator("form > output");
  await expect(submission).toContainText('"note":"Changed note"');
  await expect(submission).toContainText('"richNote":"Initial structured note"');
  await expect(submission).toContainText("Changed mark");
  await page.getByRole("button", { name: "Reset example" }).click();
  await expect(note).toHaveValue("Initial note");
  await expect(signature).toHaveValue("Initial mark");
  await expect(cropHorizontal).toHaveValue("12");
});

test("disabled, read-only, invalid, empty, and rejected states retain semantics", async ({
  page,
}) => {
  await openStory(page, "state-matrix");
  await expect(page.locator('[data-slot="attachment"][data-disabled="true"]')).toBeVisible();
  await expect(page.locator('[data-slot="image-cropper"][data-readonly="true"]')).toBeVisible();
  await expect(page.getByRole("alert")).toHaveCount(3);
  await expect(page.getByText("No emoji match", { exact: false })).toBeVisible();
  expect(await axeViolations(page)).toEqual([]);
});

test("forced colors, reduced motion, RTL, and narrow reflow retain evidence", async ({
  browser,
  browserName,
}) => {
  const context = await browser.newContext({
    forcedColors: "active",
    reducedMotion: "reduce",
    viewport: { width: 320, height: 900 },
  });
  const page = await context.newPage();
  const failures = guardRuntime(page);
  await openStory(page, "narrow-rtl");
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= document.documentElement.clientWidth,
    ),
  ).toBe(true);
  const first = page.getByRole("gridcell").first();
  const second = page.getByRole("gridcell").nth(1);
  await first.focus();
  await first.press("ArrowLeft");
  await expect(second).toBeFocused();
  const evidence = await page.locator('[data-slot="markdown-editor"]').evaluate((element) => ({
    border: getComputedStyle(element.querySelector("textarea")!).borderColor,
    transition: getComputedStyle(element.querySelector("textarea")!).transitionDuration,
  }));
  expect(evidence.border).not.toBe("rgba(0, 0, 0, 0)");
  expect(evidence.transition === "0s" || evidence.transition === "").toBe(true);
  expect(await axeViolations(page, { ignoreColorContrast: browserName !== "chromium" })).toEqual(
    [],
  );
  expect(failures).toEqual([]);
  await context.close();
});
