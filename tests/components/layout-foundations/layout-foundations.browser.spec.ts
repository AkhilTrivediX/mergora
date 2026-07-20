import { resolve } from "node:path";
import { expect, test, type Page } from "@playwright/test";

const axePath = resolve(
  import.meta.dirname,
  "../../../packages/test-utils/node_modules/axe-core/axe.min.js",
);

async function openStory(page: Page, story: string, args?: string): Promise<void> {
  const storyArgs = args === undefined ? "" : `&args=${encodeURIComponent(args)}`;
  await page.goto(
    `/iframe.html?viewMode=story&id=p2-intrinsic-layout-foundations--${story}${storyArgs}`,
    {
      waitUntil: "domcontentloaded",
    },
  );
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
    for (let attempt = 0; attempt < 20; attempt += 1) {
      try {
        return (await axe.run(document.body)).violations;
      } catch (error) {
        if (!(error instanceof Error) || !error.message.includes("Axe is already running")) {
          throw error;
        }
        await new Promise((resolveDelay) => setTimeout(resolveDelay, 50));
      }
    }
    throw new Error("Timed out waiting for the Storybook accessibility audit to finish.");
  });
}

test("layout workbench has semantic roots and no automated accessibility violations", async ({
  page,
}, testInfo) => {
  await openStory(page, "layout-workbench");
  await expect(page.locator('[data-slot="container"]')).toHaveAttribute("data-width", "wide");
  await expect(page.locator('[data-slot="stack"]').first()).toHaveAttribute("data-gap", "lg");
  await expect(page.locator('[data-slot="separator"]')).toHaveCount(1);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Intrinsic layout workbench");
  expect(await axeViolations(page)).toEqual([]);
  await page.screenshot({ fullPage: true, path: testInfo.outputPath("layout-workbench.png") });
});

test("plain and recommended stories expose independently selectable layout intelligence", async ({
  page,
}, testInfo) => {
  await openStory(page, "basic-defaults");
  await expect(page.locator('[data-slot="aspect-ratio"]')).not.toHaveAttribute("data-fit");
  await expect(page.locator('[data-slot="grid"]')).not.toHaveAttribute("data-equal-rows");
  await expect(page.locator('[data-slot="stack"]')).not.toHaveAttribute("data-separated");
  await expect(page.locator('[data-slot="container"]')).not.toHaveAttribute("data-query-container");
  expect(await axeViolations(page)).toEqual([]);

  await openStory(page, "recommended-mergora");
  await expect(page.locator('[data-slot="aspect-ratio"]')).toHaveAttribute("data-fit", "contain");
  await expect(page.locator('[data-slot="grid"]')).toHaveAttribute("data-equal-rows", "true");
  await expect(page.locator('[data-slot="stack"]').first()).toHaveAttribute(
    "data-separated",
    "true",
  );
  await expect(page.locator('[data-slot="container"]')).toHaveAttribute(
    "data-query-container",
    "true",
  );
  expect(await axeViolations(page)).toEqual([]);
  await page.screenshot({ fullPage: true, path: testInfo.outputPath("recommended-layout.png") });
});

test("basic story controls can selectively enable the layout enhancements", async ({ page }) => {
  await openStory(
    page,
    "basic-defaults",
    [
      "adaptiveWrap:true",
      "equalRows:true",
      "fillOrphan:true",
      "fitMedia:true",
      "queryContainer:true",
      "safeArea:true",
      "semanticMaximum:true",
      "separatedStack:true",
      "separatorSpacing:true",
    ].join(";"),
  );

  await expect(page.locator('[data-slot="aspect-ratio"]')).toHaveAttribute("data-fit", "contain");
  await expect(page.locator('[data-slot="grid"]')).toHaveAttribute("data-equal-rows", "true");
  await expect(page.locator('[data-slot="stack"]')).toHaveAttribute("data-separated", "true");
  await expect(page.locator('[data-slot="container"]')).toHaveAttribute(
    "data-query-container",
    "true",
  );
  await expect(page.locator('[data-slot="container"]')).toHaveAttribute("data-safe-area", "true");
  await expect(page.locator('[data-slot="center"]')).toHaveAttribute("data-maximum", "prose");
  await expect(page.locator('[data-slot="cluster"]')).toHaveAttribute("data-orphan", "fill");
  await expect(page.locator('[data-slot="separator"]')).toHaveAttribute("data-spacing", "md");
  await expect(page.locator('[data-slot="inline"]')).toHaveCSS("flex-wrap", "wrap");
  expect(await axeViolations(page)).toEqual([]);
});

test("320 CSS pixel specimen reflows without document or component clipping", async ({
  browser,
}) => {
  const page = await browser.newPage({ viewport: { height: 900, width: 320 } });
  await openStory(page, "narrow-reflow");

  const geometry = await page.locator('[data-slot="container"]').evaluate((container) => {
    const slotted = [...document.querySelectorAll<HTMLElement>("[data-slot]")];
    return {
      containerWidth: container.getBoundingClientRect().width,
      documentOverflow: document.documentElement.scrollWidth > window.innerWidth + 1,
      overflowingSlots: slotted
        .filter((element) => element.scrollWidth > element.clientWidth + 1)
        .map((element) => element.dataset.slot),
    };
  });

  expect(geometry.containerWidth).toBeLessThanOrEqual(320);
  expect(geometry.documentOverflow).toBe(false);
  expect(geometry.overflowingSlots).toEqual([]);
  expect(await axeViolations(page)).toEqual([]);
  await page.close();
});

test("auto-fit grid collapses intrinsically while fixed semantics stay absent", async ({
  page,
}) => {
  await page.setViewportSize({ height: 800, width: 1100 });
  await openStory(page, "auto-fit-grid");
  const wideColumns = await page
    .locator('[data-slot="grid"] > *')
    .evaluateAll(
      (items) => new Set(items.map((item) => Math.round(item.getBoundingClientRect().x))).size,
    );
  expect(wideColumns).toBeGreaterThan(1);
  await expect(page.locator('[data-slot="grid"]')).not.toHaveAttribute("role", "grid");

  await page.setViewportSize({ height: 1000, width: 320 });
  const narrowColumns = await page
    .locator('[data-slot="grid"] > *')
    .evaluateAll(
      (items) => new Set(items.map((item) => Math.round(item.getBoundingClientRect().x))).size,
    );
  expect(narrowColumns).toBe(1);
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1),
  ).toBe(false);
});

test("RTL keeps logical order and focus targets visible", async ({ page }) => {
  await openStory(page, "right-to-left");
  const container = page.locator('[data-slot="container"]');
  await expect(container).toHaveCSS("direction", "rtl");
  const firstAction = page.getByRole("button", { name: "تشغيل الفحوصات" });
  await firstAction.focus();
  const focus = await firstAction.evaluate((element) => {
    const bounds = element.getBoundingClientRect();
    const style = getComputedStyle(element);
    return {
      inViewport: bounds.left >= 0 && bounds.right <= window.innerWidth,
      outlineStyle: style.outlineStyle,
      outlineWidth: style.outlineWidth,
    };
  });
  expect(focus.inViewport).toBe(true);
  expect(focus.outlineStyle).not.toBe("none");
  expect(focus.outlineWidth).not.toBe("0px");
});

test("aspect presets and separator modes retain their geometry and semantics", async ({ page }) => {
  await openStory(page, "aspect-ratios");
  const ratios = await page.locator('[data-slot="aspect-ratio"]').evaluateAll((items) =>
    items.map((item) => {
      const bounds = item.getBoundingClientRect();
      return { id: item.getAttribute("data-ratio"), ratio: bounds.width / bounds.height };
    }),
  );
  expect(ratios.find((entry) => entry.id === "square")?.ratio).toBeCloseTo(1, 1);
  expect(ratios.find((entry) => entry.id === "video")?.ratio).toBeCloseTo(16 / 9, 1);
  expect(ratios.find((entry) => entry.id === "portrait")?.ratio).toBeCloseTo(3 / 4, 1);
  expect(ratios.find((entry) => entry.id === "custom")?.ratio).toBeCloseTo(5 / 3, 1);

  await openStory(page, "separator-modes");
  const semanticHorizontal = page.locator('hr[data-decorative="false"]');
  const semanticVertical = page.locator(
    'div[data-slot="separator"][role="separator"][aria-orientation="vertical"]',
  );
  const decorativeVertical = page.locator(
    'div[data-slot="separator"][role="presentation"][aria-hidden="true"]',
  );
  await expect(semanticHorizontal).toHaveCount(1);
  await expect(semanticVertical).toHaveCount(1);
  await expect(decorativeVertical).toHaveCount(1);
});

test("separator stays visible in forced colors", async ({ browser }) => {
  const context = await browser.newContext({ forcedColors: "active" });
  const page = await context.newPage();
  await openStory(page, "separator-modes");
  const style = await page
    .locator('[data-slot="separator"]')
    .first()
    .evaluate((element) => getComputedStyle(element).backgroundColor);
  expect(style).not.toBe("rgba(0, 0, 0, 0)");
  await context.close();
});
