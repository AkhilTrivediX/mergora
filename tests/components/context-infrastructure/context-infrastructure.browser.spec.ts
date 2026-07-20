import { resolve } from "node:path";
import { expect, test, type Page } from "@playwright/test";

const axePath = resolve(
  import.meta.dirname,
  "../../../packages/test-utils/node_modules/axe-core/axe.min.js",
);
const storyPrefix = "foundation-context-infrastructure";
const diagnostics = new WeakMap<Page, string[]>();

test.beforeEach(async ({ page }) => {
  const failures: string[] = [];
  diagnostics.set(page, failures);
  page.on("console", (message) => {
    if (message.type() === "error" || message.type() === "warning") {
      failures.push(`console.${message.type()}: ${message.text()}`);
    }
  });
  page.on("pageerror", (error) => failures.push(`pageerror: ${error.message}`));
});

test.afterEach(async ({ page }) => {
  expect(diagnostics.get(page) ?? []).toEqual([]);
});

async function openStory(page: Page, story: string): Promise<void> {
  await page.goto(`/iframe.html?viewMode=story&id=${storyPrefix}--${story}`, {
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

test("basic defaults remove every optional foundation enhancement cleanly", async ({ page }) => {
  await openStory(page, "basic-defaults");
  const provider = page.locator('[data-slot="provider"]');
  const direction = page.locator('[data-slot="direction-boundary"]');
  const focus = page.getByRole("button", { name: "Review changes" });

  await expect(provider).toHaveAttribute("data-density", "comfortable");
  await expect(direction).not.toHaveAttribute("data-bidi-isolate", "true");
  await expect(focus).toHaveAttribute("data-focus-ring-contrast", "standard");
  await expect(
    page.getByRole("link", { name: "Jump to the primary workbench action" }),
  ).toHaveCount(0);
  await page.getByRole("button", { name: "Composed action" }).click();
  await expect(page.getByText(/Slot orchestration events:/u)).toHaveCount(0);
  await expect(page.getByText(/Client-ready events:/u)).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Repeat intentionally" })).toHaveCount(0);
  await page.getByRole("button", { name: "Queue polite update" }).click();
  await page.getByRole("button", { name: "Queue polite update" }).click();
  await expect(page.locator('[data-slot="sr-announcer-polite"]')).toHaveAttribute(
    "data-announcement-id",
    "1",
  );
  await expect(page.locator('[data-slot="layer-application"]')).not.toHaveAttribute("inert", "");
  expect(await axeViolations(page)).toEqual([]);
});

test("recommended foundation mode composes Mergora enhancements independently", async ({
  page,
}) => {
  await openStory(page, "recommended-mergora");
  const provider = page.locator('[data-slot="provider"]');
  const direction = page.locator('[data-slot="direction-boundary"]');
  const focus = page.getByRole("button", { name: "Review changes" });

  await expect(provider).toHaveAttribute("data-density", "touch");
  await expect(direction).toHaveAttribute("data-bidi-isolate", "true");
  await expect
    .poll(() => direction.evaluate((element) => getComputedStyle(element).unicodeBidi))
    .toBe("isolate");
  await expect(focus).toHaveAttribute("data-focus-ring-contrast", "strong");
  await expect(
    page.getByRole("link", { name: "Jump to the primary workbench action" }),
  ).toHaveCount(1);
  await page.getByRole("button", { name: "Composed action" }).click();
  await expect(page.getByText("Slot orchestration events: 1")).toBeVisible();
  await expect(page.getByText("Client-ready events: 1")).toBeVisible();
  await expect(page.getByRole("button", { name: "Repeat intentionally" })).toBeVisible();
  await page.getByRole("button", { name: "Queue polite update" }).click();
  await page.getByRole("button", { name: "Queue polite update" }).click();
  await expect(page.locator('[data-slot="sr-announcer-polite"]')).toHaveAttribute(
    "data-announcement-id",
    "2",
  );
  await expect(page.locator('[data-slot="layer-application"]')).toHaveAttribute("inert", "");
  await expect(page.locator('[data-slot="portal-context"]')).toHaveAttribute("lang", "en-GB");
  expect(await axeViolations(page)).toEqual([]);
});

test("nested providers retain locale while overriding direction, density, and messages", async ({
  page,
}) => {
  await openStory(page, "nested-provider-and-direction");
  await page.evaluate(() => {
    document.documentElement.dataset.density = "touch";
  });
  const outer = page.locator('[data-slot="provider"]').first();
  const nested = page.getByRole("region", { name: "Nested Arabic direction" });
  await expect(nested).toHaveAttribute("dir", "rtl");
  await expect(nested).toHaveAttribute("lang", "de-DE");
  await expect(nested).toHaveAttribute("data-density", "compact");
  await expect(nested.locator("dd")).toHaveText([
    "de-DE",
    "rtl",
    "Europe/Berlin",
    "compact",
    "حفظ",
  ]);
  await expect
    .poll(() =>
      outer.evaluate((element) =>
        getComputedStyle(element).getPropertyValue("--mrg-semantic-density-control-height").trim(),
      ),
    )
    .toBe("40px");
  await expect
    .poll(() =>
      nested.evaluate((element) =>
        getComputedStyle(element).getPropertyValue("--mrg-semantic-density-control-height").trim(),
      ),
    )
    .toBe("32px");
  expect(await axeViolations(page)).toEqual([]);
});

test("standard and strong focus modes retain distinct two-layer geometry", async ({
  browserName,
  page,
}) => {
  await openStory(page, "focus-and-hidden-content");
  const standard = page.getByRole("button", { name: "Standard indicator" });
  if (browserName === "webkit") {
    // Safari's button tab stops follow the host Full Keyboard Access preference, which the
    // headless browser does not expose. Direct focus still exercises the authored focus contract.
    await standard.focus();
  } else {
    await page.keyboard.press("Tab");
    await page.keyboard.press("Tab");
  }
  await expect(standard).toBeFocused();
  await expect
    .poll(() =>
      standard.evaluate((element) => {
        const style = getComputedStyle(element);
        return {
          shadow: style.boxShadow === "none" ? "none" : "present",
          offset: style.outlineOffset,
          width: style.outlineWidth,
        };
      }),
    )
    .toEqual({ offset: "2px", shadow: "present", width: "2px" });

  const strong = page.getByRole("link", { name: "Strong indicator" });
  if (browserName === "webkit") await strong.focus();
  else await page.keyboard.press("Tab");
  await expect(strong).toBeFocused();
  await expect
    .poll(() =>
      strong.evaluate((element) => {
        const style = getComputedStyle(element);
        return {
          shadow: style.boxShadow === "none" ? "none" : "present",
          offset: style.outlineOffset,
          width: style.outlineWidth,
        };
      }),
    )
    .toEqual({ offset: "3px", shadow: "present", width: "3px" });
});

test("focus treatment and reveal-on-focus content survive narrow and forced-color modes", async ({
  browser,
  browserName,
}) => {
  const context = await browser.newContext({
    forcedColors: "active",
    viewport: { height: 700, width: 320 },
  });
  const page = await context.newPage();
  const failures: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error" || message.type() === "warning") failures.push(message.text());
  });
  page.on("pageerror", (error) => failures.push(error.message));
  await openStory(page, "focus-and-hidden-content");
  const skipLink = page.getByRole("link", { name: "Skip to primary action" });
  if (browserName === "webkit") await skipLink.focus();
  else await page.keyboard.press("Tab");
  await expect(skipLink).toBeFocused();
  await expect(skipLink).toBeVisible();
  const primary = page.getByRole("button", { name: "Standard indicator" });
  if (browserName === "webkit") await primary.focus();
  else await page.keyboard.press("Tab");
  await expect(primary).toBeFocused();
  const geometry = await page.evaluate(() => ({
    overflow: document.documentElement.scrollWidth > window.innerWidth + 1,
    outline: getComputedStyle(document.activeElement as Element).outlineStyle,
  }));
  expect(geometry).toEqual({ outline: "solid", overflow: false });
  expect(await axeViolations(page)).toEqual([]);
  expect(failures).toEqual([]);
  await context.close();
});

test("portal hydration retains direction, locale, density, and valid list structure", async ({
  page,
}) => {
  await openStory(page, "portal-and-client-boundary");
  await expect(page.getByText("Client content is ready")).toBeVisible();
  const portal = page.locator('[data-slot="portal-context"]');
  await expect(portal).toHaveAttribute("dir", "rtl");
  await expect(portal).toHaveAttribute("lang", "he-IL");
  await expect(portal).toHaveAttribute("data-density", "touch");
  await expect(portal).toContainText("Context retained in the portal.");
  await expect
    .poll(() =>
      page
        .locator('[data-slot="provider"]')
        .evaluate((element) =>
          getComputedStyle(element)
            .getPropertyValue("--mrg-semantic-density-control-height")
            .trim(),
        ),
    )
    .toBe("48px");
  expect(await axeViolations(page)).toEqual([]);
});

test("Presence cancels an interrupted exit and honors reduced motion", async ({
  browser,
  page,
}) => {
  await openStory(page, "presence-lifecycle");
  await page.getByRole("button", { name: "Hide details" }).click();
  await expect(page.getByText(/Lifecycle: exiting/u)).toBeVisible();
  await page.getByRole("button", { name: "Show details" }).click();
  await expect(page.getByText(/Lifecycle: entered/u)).toBeVisible();
  await page.waitForTimeout(250);
  await expect(page.getByText(/The content starts visible/u)).toBeVisible();

  const reducedContext = await browser.newContext({ reducedMotion: "reduce" });
  const reducedPage = await reducedContext.newPage();
  await openStory(reducedPage, "presence-lifecycle");
  await reducedPage.getByRole("button", { name: "Hide details" }).click();
  await expect(reducedPage.getByText(/The content starts visible/u)).toHaveCount(0);
  await openStory(reducedPage, "nested-provider-and-direction");
  const motionBoundary = reducedPage.locator('[data-slot="provider"]').first();
  await expect
    .poll(() =>
      motionBoundary.evaluate((element) =>
        getComputedStyle(element)
          .getPropertyValue("--mrg-semantic-motion-duration-feedback")
          .trim(),
      ),
    )
    .toBe("1ms");
  await motionBoundary.evaluate((element) => {
    element.setAttribute("data-reduced-motion", "no-preference");
  });
  await expect
    .poll(() =>
      motionBoundary.evaluate((element) =>
        getComputedStyle(element)
          .getPropertyValue("--mrg-semantic-motion-duration-feedback")
          .trim(),
      ),
    )
    .toBe("80ms");
  await reducedContext.close();
});

test("announcement queues separate polite and assertive updates and can clear", async ({
  page,
}) => {
  await openStory(page, "announcement-queue");
  const polite = page.locator('[data-slot="sr-announcer-polite"]');
  const assertive = page.locator('[data-slot="sr-announcer-assertive"]');
  await page.getByRole("button", { name: "Queue polite update" }).click();
  await expect(polite).toHaveText("Workspace saved");
  await page.getByRole("button", { name: "Queue urgent error" }).click();
  await expect(assertive).toHaveText("Connection lost");
  await page.getByRole("button", { name: "Clear queue" }).click();
  await expect(polite).toBeEmpty();
  await expect(assertive).toBeEmpty();
});

test("only the top layer owns Escape and modal inertness is restored", async ({ page }) => {
  await openStory(page, "nested-layer-stack");
  const application = page.locator('[data-slot="layer-application"]');
  await expect(application).toHaveAttribute("inert", "");
  await page.keyboard.press("Escape");
  await expect(page.getByRole("region", { name: "Upper layer" })).toBeVisible();
  await expect(page.getByRole("region", { name: "Lower layer" })).toBeVisible();
  await page.getByRole("button", { name: "Close upper layer" }).click();
  await expect(page.getByRole("region", { name: "Upper layer" })).toHaveCount(0);
  await expect(application).toHaveAttribute("inert", "");
  await page.keyboard.press("Escape");
  await expect(page.getByRole("region", { name: "Lower layer" })).toHaveCount(0);
  await expect(application).not.toHaveAttribute("inert", "");
});
