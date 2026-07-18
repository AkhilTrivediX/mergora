import { resolve } from "node:path";

import { expect, test, type BrowserContext, type Page } from "@playwright/test";

const axePath = resolve(
  import.meta.dirname,
  "../../../packages/test-utils/node_modules/axe-core/axe.min.js",
);

async function openStory(context: BrowserContext, id: string): Promise<Page> {
  const page = await context.newPage();
  await page.goto(`/iframe.html?viewMode=story&id=${id}`, { waitUntil: "domcontentloaded" });
  return page;
}

async function buttonAxeViolations(page: Page): Promise<unknown[]> {
  await page.addScriptTag({ path: axePath });
  return page.evaluate(async () => {
    const axe = (
      globalThis as unknown as {
        axe: { run(target: Element): Promise<{ violations: unknown[] }> };
      }
    ).axe;
    const target = document.querySelector('[data-slot="button"]');
    if (target === null) throw new Error("Button story did not render its root slot.");
    return (await axe.run(target)).violations;
  });
}

test("Button browser contract smoke", async ({ browser }) => {
  const context = await browser.newContext({ viewport: { height: 568, width: 320 } });

  const defaultPage = await openStory(context, "components-button--default");
  const defaultButton = defaultPage.getByRole("button", { name: "Save changes" });
  await defaultButton.focus();
  const defaultStyle = await defaultButton.evaluate((element) => {
    const style = getComputedStyle(element);
    return {
      background: style.backgroundColor,
      minBlockSize: style.minBlockSize,
      outlineStyle: style.outlineStyle,
      outlineWidth: style.outlineWidth,
    };
  });
  expect(defaultStyle.minBlockSize).toBe("44px");
  expect(defaultStyle.background).not.toBe("rgba(0, 0, 0, 0)");
  expect(defaultStyle.outlineStyle).toBe("solid");
  expect(defaultStyle.outlineWidth).not.toBe("0px");

  expect(await buttonAxeViolations(defaultPage)).toEqual([]);

  const pendingPage = await openStory(context, "components-button--pending");
  const pendingButton = pendingPage.getByRole("button", { name: "Publishing release" });
  await pendingButton.focus();
  const pendingResult = await pendingButton.evaluate((element) => {
    const button = element as HTMLButtonElement;
    let capturedEvent: Event | undefined;
    button.addEventListener(
      "click",
      (event) => {
        capturedEvent = event;
      },
      { once: true },
    );
    button.click();
    return {
      active: document.activeElement === button,
      ariaBusy: button.getAttribute("aria-busy"),
      ariaDisabled: button.getAttribute("aria-disabled"),
      defaultPrevented: capturedEvent?.defaultPrevented ?? false,
      disabled: button.hasAttribute("disabled"),
    };
  });
  expect(pendingResult).toEqual({
    active: true,
    ariaBusy: "true",
    ariaDisabled: "true",
    defaultPrevented: true,
    disabled: false,
  });
  expect(await buttonAxeViolations(pendingPage)).toEqual([]);

  const iconPage = await openStory(context, "components-button--icon-only-named");
  await expect(iconPage.getByRole("button", { name: "Add row" })).toBeVisible();
  expect(await buttonAxeViolations(iconPage)).toEqual([]);

  const rtlPage = await openStory(context, "components-button--right-to-left");
  const rtlDirection = await rtlPage
    .getByRole("button", { exact: true, name: "حفظ التغييرات" })
    .evaluate((element) => getComputedStyle(element).direction);
  expect(rtlDirection).toBe("rtl");

  const narrowPage = await openStory(context, "components-button--narrow-long-label");
  const narrowLayout = await narrowPage.getByRole("button").evaluate((element) => ({
    clipped: element.scrollHeight > element.clientHeight + 1,
    documentOverflow: document.documentElement.scrollWidth > innerWidth + 1,
    width: element.getBoundingClientRect().width,
  }));
  expect(narrowLayout.clipped).toBe(false);
  expect(narrowLayout.documentOverflow).toBe(false);
  expect(narrowLayout.width).toBeLessThanOrEqual(240);
  await context.close();

  const reducedContext = await browser.newContext({ reducedMotion: "reduce" });
  const reducedPage = await openStory(reducedContext, "components-button--pending");
  const animationName = await reducedPage
    .locator('[data-slot="button-pending-indicator"]')
    .evaluate((element) => getComputedStyle(element).animationName);
  expect(animationName).toBe("none");
  await reducedContext.close();

  const forcedContext = await browser.newContext({ forcedColors: "active" });
  const forcedPage = await openStory(forcedContext, "components-button--default");
  const forcedButton = forcedPage.getByRole("button", { name: "Save changes" });
  await forcedButton.focus();
  const forcedStyle = await forcedButton.evaluate((element) => {
    const style = getComputedStyle(element);
    return {
      borderStyle: style.borderStyle,
      outlineStyle: style.outlineStyle,
      outlineWidth: style.outlineWidth,
    };
  });
  expect(forcedStyle.borderStyle).toBe("solid");
  expect(forcedStyle.outlineStyle).toBe("solid");
  expect(forcedStyle.outlineWidth).not.toBe("0px");
  await forcedContext.close();
});
