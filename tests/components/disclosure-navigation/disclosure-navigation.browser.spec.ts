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
  await page.goto(`/iframe.html?viewMode=story&id=p2-disclosure-and-navigation--${story}`, {
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

test("workbench exposes native disclosure, selection, hierarchy, and page semantics", async ({
  page,
}, testInfo) => {
  await openStory(page, "disclosure-navigation-workbench");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(
    "Disclosure and navigation workbench",
  );
  await expect(page.getByRole("heading", { level: 3 })).toHaveCount(3);
  await expect(page.locator('[data-slot="accordion-trigger"]')).toHaveCount(3);
  await expect(page.getByRole("button", { name: "Identity and provenance" })).toHaveAttribute(
    "aria-expanded",
    "true",
  );
  await expect(page.getByRole("button", { name: "Release approval unavailable" })).toBeDisabled();
  await expect(page.getByRole("button", { name: "Show provenance details" })).toHaveAttribute(
    "aria-expanded",
    "false",
  );
  await expect(page.getByRole("tablist", { name: "Artifact sections" })).toBeVisible();
  await expect(page.getByRole("tab", { name: "Overview" })).toHaveAttribute(
    "aria-selected",
    "true",
  );
  await expect(page.getByRole("navigation", { name: "Breadcrumb" })).toBeVisible();
  await expect(page.getByRole("navigation", { name: "Pagination" })).toBeVisible();
  await expect(page.locator('[data-view="full"] [aria-current="page"]')).toHaveText("Accordion");

  const undersized = await page
    .locator(
      '[data-slot="accordion-trigger"], [data-slot="collapsible-trigger"], [data-slot="tabs-tab"], [data-slot="pagination-link"], [data-slot="pagination-current"], [data-slot="pagination-disabled"]',
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
  await page.screenshot({
    fullPage: true,
    path: testInfo.outputPath("disclosure-navigation-workbench.png"),
  });
});

test("accordion and collapsible preserve native activation and optional roving focus", async ({
  page,
}) => {
  await openStory(page, "disclosure-navigation-workbench");
  const identity = page.getByRole("button", { name: "Identity and provenance" });
  const evidence = page.getByRole("button", { name: "Independent evidence" });
  await identity.focus();
  await page.keyboard.press("ArrowDown");
  await expect(evidence).toBeFocused();
  await page.keyboard.press("End");
  await expect(evidence).toBeFocused();
  await page.keyboard.press("Home");
  await expect(identity).toBeFocused();
  await identity.press("Space");
  await expect(identity).toHaveAttribute("aria-expanded", "false");
  await evidence.press("Enter");
  await expect(evidence).toHaveAttribute("aria-expanded", "true");

  const disclosure = page.getByRole("button", { name: "Show provenance details" });
  await disclosure.focus();
  await disclosure.press("Enter");
  await expect(disclosure).toHaveAttribute("aria-expanded", "true");
  await expect(disclosure).toBeFocused();
  await disclosure.press("Space");
  await expect(disclosure).toHaveAttribute("aria-expanded", "false");
});

test("automatic and manual tabs keep focus, selection, disabled skipping, and orientation distinct", async ({
  page,
}) => {
  await openStory(page, "tab-activation");
  const automatic = page.getByRole("tablist", { name: "Artifact sections" }).first();
  const manual = page.getByRole("tablist", { name: "Artifact sections" }).last();

  await automatic.getByRole("tab", { name: "Overview" }).focus();
  await page.keyboard.press("ArrowRight");
  await expect(automatic.getByRole("tab", { name: "Evidence" })).toBeFocused();
  await expect(automatic.getByRole("tab", { name: "Evidence" })).toHaveAttribute(
    "aria-selected",
    "true",
  );
  await page.keyboard.press("ArrowRight");
  await expect(automatic.getByRole("tab", { name: "History" })).toBeFocused();
  await page.keyboard.press("Home");
  await expect(automatic.getByRole("tab", { name: "Overview" })).toBeFocused();

  await manual.getByRole("tab", { name: "Overview" }).focus();
  await page.keyboard.press("ArrowDown");
  await expect(manual.getByRole("tab", { name: "Evidence" })).toBeFocused();
  await expect(manual.getByRole("tab", { name: "Overview" })).toHaveAttribute(
    "aria-selected",
    "true",
  );
  await page.keyboard.press("Enter");
  await expect(manual.getByRole("tab", { name: "Evidence" })).toHaveAttribute(
    "aria-selected",
    "true",
  );
  expect(await axeViolations(page)).toEqual([]);
});

test("explicit RTL controls spatial tab keys independently from an English locale", async ({
  page,
}) => {
  await openStory(page, "right-to-left");
  const tabs = page.getByRole("tablist", { name: "Artifact sections" });
  await expect(page.locator('[data-slot="tabs"]')).toHaveAttribute("dir", "rtl");
  await expect(page.locator('[data-slot="provider"]')).toHaveAttribute("lang", "en-US");
  await tabs.getByRole("tab", { name: "Overview" }).focus();
  await page.keyboard.press("ArrowRight");
  await expect(tabs.getByRole("tab", { name: "History" })).toBeFocused();
  await expect(tabs.getByRole("tab", { name: "History" })).toHaveAttribute("aria-selected", "true");
  await page.keyboard.press("ArrowLeft");
  await expect(tabs.getByRole("tab", { name: "Overview" })).toBeFocused();
  expect(await axeViolations(page)).toEqual([]);
});

test("URL-state recipe keeps real safe hrefs and manual selection ownership", async ({ page }) => {
  await openStory(page, "url-state");
  const tabs = page.getByRole("tablist", { name: "URL-backed sections" });
  const overview = tabs.getByRole("tab", { name: "Overview" });
  const evidence = tabs.getByRole("tab", { name: "Evidence" });
  await expect(overview).toHaveAttribute("href", "?section=overview");
  await expect(evidence).toHaveAttribute("href", "?section=evidence");
  await overview.focus();
  await page.keyboard.press("ArrowRight");
  await expect(evidence).toBeFocused();
  await expect(overview).toHaveAttribute("aria-selected", "true");
  await expect(page.getByRole("status")).toHaveText("Selected URL section: overview");
});

test("localized breadcrumb collapse preserves the complete path and localized page names", async ({
  page,
}) => {
  await page.setViewportSize({ height: 800, width: 320 });
  await openStory(page, "localized-messages");
  const breadcrumb = page.getByRole("navigation", { name: "Navigationspfad" });
  await expect(breadcrumb.locator('[data-view="full"]')).toBeHidden();
  await expect(breadcrumb.locator('[data-view="compact"]')).toBeVisible();
  const overflow = breadcrumb.locator('summary[aria-label="2 verborgene Ebenen anzeigen"]');
  await overflow.click();
  await expect(breadcrumb.getByRole("link", { name: "Components" })).toBeVisible();
  await expect(breadcrumb.getByRole("link", { name: "Navigation" })).toBeVisible();
  await expect(breadcrumb.locator('[data-view="compact"] [aria-current="page"]')).toHaveText(
    "Accordion",
  );
  const pagination = page.getByRole("navigation", { name: "Seitennavigation" });
  await expect(pagination.getByLabel("Seite 2, aktuelle Seite")).toHaveAttribute(
    "aria-current",
    "page",
  );
  await expect(pagination.getByLabel("Zu Seite 3")).toHaveAttribute("href", "?seite=3");
  await expect(pagination.getByText("Weitere Seiten")).toBeAttached();
  expect(await axeViolations(page)).toEqual([]);
});

test("narrow width and 200 percent text use native overflow without document clipping", async ({
  page,
}) => {
  await page.setViewportSize({ height: 1000, width: 320 });
  await openStory(page, "narrow-overflow");
  await page.evaluate(() => {
    document.documentElement.style.fontSize = "200%";
  });
  const geometry = await page.evaluate(() => {
    const tabList = document.querySelector<HTMLElement>('[data-slot="tabs-list"]')!;
    const viewportWidth = document.documentElement.clientWidth;
    return {
      documentOverflow: document.documentElement.scrollWidth > viewportWidth + 1,
      nativeTabOverflow: tabList.scrollWidth > tabList.clientWidth,
      outside: [...document.body.querySelectorAll<HTMLElement>("*")]
        .filter((element) => {
          if (element.closest('[data-slot="tabs-list"]') !== null) return false;
          const bounds = element.getBoundingClientRect();
          return bounds.left < -1 || bounds.right > viewportWidth + 1;
        })
        .map((element) => ({ slot: element.dataset.slot ?? null, tag: element.tagName })),
    };
  });
  expect(geometry.documentOverflow).toBe(false);
  expect(geometry.nativeTabOverflow).toBe(true);
  expect(geometry.outside).toEqual([]);
  expect(await axeViolations(page)).toEqual([]);
});

test("forced colors and reduced motion preserve current, expanded, and focus states", async ({
  browser,
}) => {
  const context = await browser.newContext({ forcedColors: "active", reducedMotion: "reduce" });
  const page = await context.newPage();
  const failures = guardRuntime(page);
  await openStory(page, "disclosure-navigation-workbench");
  const trigger = page.getByRole("button", { name: "Identity and provenance" });
  await trigger.focus();
  const style = await trigger.evaluate((element) => {
    const computed = getComputedStyle(element);
    const indicator = element.querySelector<HTMLElement>(
      '[data-slot="accordion-trigger-indicator"]',
    )!;
    return {
      outline: computed.outlineStyle,
      transition: getComputedStyle(indicator).transitionDuration,
    };
  });
  expect(style.outline).not.toBe("none");
  expect(style.transition).toBe("0s");
  await expect(trigger).toHaveAttribute("aria-expanded", "true");
  await expect(page.locator('[data-slot="pagination-current"]')).toHaveAttribute(
    "aria-current",
    "page",
  );
  expect(await axeViolations(page)).toEqual([]);
  expect(failures).toEqual([]);
  await context.close();
});
