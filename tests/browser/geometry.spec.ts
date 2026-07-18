import { createPlaywrightGeometryAdapter } from "../../packages/test-utils/src/adapters/geometry.ts";
import { runGeometryContract } from "../../packages/test-utils/src/runtime-contracts.ts";
import { test, expect, loadFixture } from "./support/test.ts";

test("@browser 320px reflow and 200% text keep gated targets visible", async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 568 });
  await loadFixture(page, "/?density=touch");

  await page.addStyleTag({
    content: `
      html { font-size: 200%; }
      * { line-height: 1.5 !important; letter-spacing: 0.12em !important; word-spacing: 0.16em !important; }
      p { margin-block-end: 2em !important; }
  `,
  });
  const primaryButton = page.getByRole("button", { name: "Run evidence check" });
  await primaryButton.focus();
  await primaryButton.scrollIntoViewIfNeeded();
  await expect(primaryButton).toBeFocused();
  await page.evaluate(() => new Promise<void>((resolve) => requestAnimationFrame(() => resolve())));

  const geometry = await runGeometryContract(createPlaywrightGeometryAdapter(), {
    page,
    rootSelector: "body",
    focusSelector: "[data-evidence-item='button'] [data-slot='button']:first-of-type",
    targets: [
      {
        id: "button-primary",
        selector: "[data-evidence-item='button'] [data-slot='button']:first-of-type",
        minimumWidth: 44,
        minimumHeight: 44,
        touch: true,
      },
      {
        id: "dialog-trigger",
        selector: "[data-slot='dialog-trigger']",
        minimumWidth: 44,
        minimumHeight: 44,
        touch: true,
      },
      {
        id: "combobox-trigger",
        selector: "[data-slot='combobox-trigger']",
        minimumWidth: 44,
        minimumHeight: 44,
        touch: true,
      },
      {
        id: "data-grid-scroller",
        selector: "[data-slot='data-grid-region']",
        minimumWidth: 24,
        minimumHeight: 24,
        touch: false,
      },
    ],
    overlays: [],
  });
  expect(geometry.assessment).toEqual({ state: "pass", issues: [] });

  const scopedGridOverflow = await page
    .locator("[data-slot='data-grid-region']")
    .evaluate((element) => element.scrollWidth > element.clientWidth);
  expect(scopedGridOverflow).toBe(true);
  expect(geometry.measurement.horizontalOverflowPx).toBeLessThanOrEqual(1);
});

test("@browser 400% reflow-equivalent dialog remains operable at 320x256", async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 256 });
  await loadFixture(page, "/?density=touch");
  await page.getByRole("button", { name: "Open merge review" }).click();
  const close = page.getByRole("button", { name: "Close merge review" });
  await expect(close).toBeFocused();

  const geometry = await runGeometryContract(createPlaywrightGeometryAdapter(), {
    page,
    rootSelector: "body",
    focusSelector: "[data-slot='dialog-close']",
    targets: [
      {
        id: "dialog-close",
        selector: "[data-slot='dialog-close']",
        minimumWidth: 44,
        minimumHeight: 44,
        touch: true,
      },
    ],
    overlays: [{ id: "dialog-content", selector: "[data-slot='dialog-content']" }],
  });
  expect(geometry.assessment).toEqual({ state: "pass", issues: [] });
});
