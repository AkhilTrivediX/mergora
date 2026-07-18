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
    return (await axe.run(document.body)).violations;
  });
}

test("nested providers retain locale while overriding direction, density, and messages", async ({
  page,
}) => {
  await openStory(page, "nested-provider-and-direction");
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
  expect(await axeViolations(page)).toEqual([]);
});

test("focus treatment and reveal-on-focus content survive narrow and forced-color modes", async ({
  browser,
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
  await page.keyboard.press("Tab");
  const skipLink = page.getByRole("link", { name: "Skip to primary action" });
  await expect(skipLink).toBeFocused();
  await expect(skipLink).toBeVisible();
  await page.keyboard.press("Tab");
  const primary = page.getByRole("button", { name: "Standard indicator" });
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
  await reducedContext.close();
});

test("announcement queues separate polite and assertive updates and can clear", async ({
  page,
}) => {
  await openStory(page, "announcement-queue");
  const polite = page.locator('[data-slot="sr-announcer-polite"]');
  const assertive = page.locator('[data-slot="sr-announcer-assertive"]');
  await page.getByRole("button", { name: "Queue polite update" }).click();
  await expect(polite).toHaveText("Draft saved");
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
