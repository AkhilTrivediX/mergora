import { resolve } from "node:path";
import { expect, test, type Page } from "@playwright/test";

const axePath = resolve(
  import.meta.dirname,
  "../../../packages/test-utils/node_modules/axe-core/axe.min.js",
);
const diagnostics = new WeakMap<Page, string[]>();

function monitorPage(page: Page): string[] {
  const existing = diagnostics.get(page);
  if (existing !== undefined) return existing;
  const failures: string[] = [];
  diagnostics.set(page, failures);
  page.on("console", (message) => {
    if (message.type() === "error" || message.type() === "warning") {
      if (
        message.type() === "warning" &&
        message.text().includes("Layout was forced before the page was fully loaded") &&
        message.text().includes("chrome://juggler/content/content/main.js")
      ) {
        return;
      }
      failures.push(`console.${message.type()}: ${message.text()}`);
    }
  });
  page.on("pageerror", (error) => failures.push(`pageerror: ${error.message}`));
  return failures;
}

test.beforeEach(async ({ page }) => {
  monitorPage(page);
});

test.afterEach(async ({ page }) => {
  expect(diagnostics.get(page) ?? []).toEqual([]);
});

async function openStory(page: Page, story: string): Promise<void> {
  await page.goto(`/iframe.html?viewMode=story&id=p2-typography-content--${story}`, {
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
        await new Promise((resolveWait) => setTimeout(resolveWait, 50));
      }
    }
    throw new Error("Timed out waiting for the Storybook accessibility audit to finish.");
  });
}

async function forcedColorAxeViolations(page: Page): Promise<unknown[]> {
  await page.addScriptTag({ path: axePath });
  return page.evaluate(async () => {
    const axe = (
      globalThis as unknown as {
        axe: {
          run(target: Element): Promise<{
            violations: Array<{
              id: string;
              nodes: Array<{ target: unknown[] }>;
            }>;
          }>;
        };
      }
    ).axe;
    const probe = document.createElement("span");
    probe.style.backgroundColor = "Highlight";
    probe.style.color = "HighlightText";
    probe.style.position = "fixed";
    document.body.append(probe);
    const probeStyle = getComputedStyle(probe);
    const systemBackground = probeStyle.backgroundColor;
    const systemForeground = probeStyle.color;
    probe.remove();

    let violations:
      | Array<{
          id: string;
          nodes: Array<{ target: unknown[] }>;
        }>
      | undefined;
    for (let attempt = 0; attempt < 20; attempt += 1) {
      try {
        violations = (await axe.run(document.body)).violations;
        break;
      } catch (error) {
        if (!(error instanceof Error) || !error.message.includes("Axe is already running")) {
          throw error;
        }
        await new Promise((resolveDelay) => setTimeout(resolveDelay, 50));
      }
    }
    if (violations === undefined) {
      throw new Error("Timed out waiting for the Storybook accessibility audit to finish.");
    }
    return violations.flatMap((violation) => {
      if (violation.id !== "color-contrast") return [violation];
      const applicationOwnedNodes = violation.nodes.filter((node) => {
        const selector = node.target.length === 1 ? node.target[0] : undefined;
        if (typeof selector !== "string") return true;
        const target = document.querySelector(selector);
        const selection = target?.closest(
          '[data-highlighted="true"], [data-slot="json-tree-item"][aria-selected="true"]',
        );
        if (target === null || selection === null || selection === undefined) return true;
        return (
          getComputedStyle(selection).backgroundColor !== systemBackground ||
          getComputedStyle(target).color !== systemForeground
        );
      });
      return applicationOwnedNodes.length === 0
        ? []
        : [{ ...violation, nodes: applicationOwnedNodes }];
    });
  });
}

async function installClipboardProbe(page: Page): Promise<void> {
  await page.addInitScript(() => {
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: {
        writeText: async (value: string) => {
          (globalThis as typeof globalThis & { __mrgCopied?: string }).__mrgCopied = value;
        },
      },
    });
  });
}

test("basic defaults remove every optional inspection layer cleanly", async ({ page }) => {
  await openStory(page, "basic-defaults");
  await expect(page.locator('[data-slot="blockquote-caption"]')).toHaveCount(0);
  await expect(page.locator('[data-slot="code"][data-bidi-isolated="false"]')).toHaveCount(1);
  await expect(page.locator('[data-slot="code-block-copy"]')).toHaveCount(0);
  await expect(page.locator('[data-slot="code-block-line-number"]')).toHaveCount(0);
  await expect(page.locator('[data-slot="code-block-line"][data-highlighted="true"]')).toHaveCount(
    0,
  );
  await expect(page.locator('[data-slot="description-list"]')).toHaveAttribute(
    "data-layout",
    "stacked",
  );
  await expect(page.locator('[data-slot="diff-summary"]')).toHaveCount(0);
  await expect(page.locator('[data-slot="diff-copy"]')).toHaveCount(0);
  await expect(page.locator('[data-slot="diff-line"][tabindex]')).toHaveCount(0);
  await expect(page.locator('[data-slot="json-active-path"]')).toHaveCount(0);
  await expect(page.locator('[data-slot="json-copy-path"]')).toHaveCount(0);
  await expect(page.locator('[data-slot="json-copy-value"]')).toHaveCount(0);
  await expect(page.locator('[data-slot="text"][data-truncate="true"]')).toHaveCount(0);
  await expect(page.locator('[data-slot="prose"]')).toHaveAttribute("data-measure", "none");
  await expect(page.locator('[data-slot="kbd-chord"]')).toHaveAttribute("data-platform", "generic");
  await expect(page.getByRole("status")).toHaveCount(0);
  expect(await axeViolations(page)).toEqual([]);
});

test("recommended Mergora mode exposes independently useful inspection aids", async ({ page }) => {
  await openStory(page, "recommended-mergora");
  await expect(page.locator('[data-slot="blockquote-caption"]')).toHaveCount(1);
  await expect(page.locator('[data-slot="code"][data-bidi-isolated="true"]')).toHaveCount(1);
  await expect(page.locator('[data-slot="code-block-copy"]')).toHaveCount(1);
  await expect(page.locator('[data-slot="code-block-line-number"]')).not.toHaveCount(0);
  await expect(page.locator('[data-slot="code-block-line"][data-highlighted="true"]')).toHaveCount(
    1,
  );
  await expect(page.locator('[data-slot="diff-summary"]')).toHaveCount(1);
  await expect(page.locator('[data-slot="diff-copy"]')).toHaveCount(1);
  await expect(page.locator('[data-slot="diff-line"][tabindex]')).not.toHaveCount(0);
  await expect(page.locator('[data-slot="json-active-path"]')).toHaveText("$");
  await expect(page.locator('[data-slot="json-copy-path"]')).toHaveCount(1);
  await expect(page.locator('[data-slot="json-copy-value"]')).toHaveCount(1);
  await expect(page.locator('[data-slot="text"][data-truncate="true"]')).toHaveCount(1);
  await expect(page.locator('[data-slot="prose"]')).toHaveAttribute("data-measure", "prose");
  expect(await axeViolations(page)).toEqual([]);
});

test("controlled viewers publish row, path, and expansion state", async ({ page }) => {
  await openStory(page, "controlled-inspection");
  const rows = page.locator('[data-slot="diff-line"]');
  await rows.first().focus();
  await rows.first().press("ArrowDown");
  await expect(page.locator('[data-controlled-state="diff"]')).toHaveText("Active change row: 2");

  const evidence = page.locator('[data-path="$.evidence"]');
  await evidence.focus();
  await evidence.press("ArrowRight");
  await expect(page.locator('[data-controlled-state="json"]')).toHaveText(
    "Active value: $.evidence.automated",
  );
  expect(await axeViolations(page)).toEqual([]);
});

test("touch copy feedback and reduced motion remain bounded on a narrow screen", async ({
  browser,
}) => {
  const context = await browser.newContext({
    hasTouch: true,
    reducedMotion: "reduce",
    viewport: { height: 800, width: 360 },
  });
  const page = await context.newPage();
  const failures = monitorPage(page);
  await page.emulateMedia({ reducedMotion: "reduce" });
  await installClipboardProbe(page);
  await openStory(page, "recommended-mergora");
  expect(await page.evaluate(() => matchMedia("(prefers-reduced-motion: reduce)").matches)).toBe(
    true,
  );
  const copy = page.locator('[data-slot="code-block-copy"]');
  await copy.tap();
  await expect(copy).toHaveText("Copied");
  const reducedTransition = await copy.evaluate((element) => {
    const style = getComputedStyle(element);
    const toMilliseconds = (duration: string) =>
      duration.endsWith("ms") ? Number.parseFloat(duration) : Number.parseFloat(duration) * 1000;
    const properties = style.transitionProperty.split(",").map((value) => value.trim());
    const durations = style.transitionDuration
      .split(",")
      .map((value) => toMilliseconds(value.trim()));
    return {
      durations: properties.map((_, index) => durations[index % durations.length]),
      properties,
      reducedToken: toMilliseconds(
        style.getPropertyValue("--mrg-semantic-motion-duration-reduced").trim(),
      ),
    };
  });
  expect(reducedTransition.properties.some((property) => property.startsWith("background"))).toBe(
    true,
  );
  expect(reducedTransition.properties).toContain("color");
  expect(reducedTransition.durations).toEqual(
    reducedTransition.properties.map(() => reducedTransition.reducedToken),
  );
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1),
  ).toBe(false);
  expect(await axeViolations(page)).toEqual([]);
  expect(failures).toEqual([]);
  await context.close();
});

test("typography workbench preserves native structure and a sequential heading outline", async ({
  page,
}, testInfo) => {
  await openStory(page, "typography-workbench");
  await expect(page.getByRole("heading", { level: 1 })).toHaveCount(1);
  await expect(page.getByRole("heading", { level: 2 })).toHaveCount(3);
  await expect(page.getByRole("heading", { level: 3 })).toHaveCount(2);
  await expect(page.locator("blockquote")).toHaveCount(1);
  await expect(page.locator("figcaption cite a")).toHaveAttribute(
    "href",
    "https://example.com/contracts/source",
  );
  await expect(page.locator("dl > dt")).toHaveCount(3);
  await expect(page.locator("dl > dd")).toHaveCount(3);
  await expect(page.locator("kbd")).toHaveCount(3);

  const outline = await page
    .locator("h1, h2, h3, h4, h5, h6")
    .evaluateAll((headings) => headings.map((heading) => Number(heading.tagName.slice(1))));
  outline.slice(1).forEach((level, index) => {
    expect(level - (outline[index] ?? level)).toBeLessThanOrEqual(1);
  });

  const truncated = page.locator('[data-slot="text"][data-truncate="true"]');
  await truncated.focus();
  await expect(truncated).toBeFocused();
  await expect(truncated).toHaveAttribute(
    "aria-label",
    "registry.example.dev/releases/immutable/sha256/34bf4b27f39evidence",
  );
  await expect(truncated).toHaveCSS("white-space", "normal");
  expect(await axeViolations(page)).toEqual([]);
  await page.screenshot({ fullPage: true, path: testInfo.outputPath("typography-workbench.png") });
});

test("copy controls retain focus and announce exact code, diff, path, and value results", async ({
  page,
}) => {
  await installClipboardProbe(page);
  await openStory(page, "interactive-viewers");

  const codeCopy = page.locator('[data-slot="code-block-copy"]');
  await codeCopy.focus();
  await codeCopy.press("Enter");
  await expect(codeCopy).toBeFocused();
  await expect(codeCopy).toHaveText("Copied");
  expect(
    await page.evaluate(
      () => (globalThis as typeof globalThis & { __mrgCopied?: string }).__mrgCopied,
    ),
  ).toContain("export function SaveAction");
  await expect(page.getByRole("status").first()).toHaveText("Copied");

  const diffCopy = page.locator('[data-slot="diff-copy"]');
  await diffCopy.focus();
  await diffCopy.press("Enter");
  await expect(diffCopy).toBeFocused();
  expect(
    await page.evaluate(
      () => (globalThis as typeof globalThis & { __mrgCopied?: string }).__mrgCopied,
    ),
  ).toContain("+export const mode = 'provenance-aware';");

  const root = page.locator('[data-slot="json-tree-item"][data-path="$"]');
  await root.focus();
  await root.press("ArrowRight");
  await expect(page.locator('[data-path="$.component"]')).toBeFocused();
  await page.locator('[data-path="$.component"]').press("ArrowDown");
  const evidence = page.locator('[data-path="$.evidence"]');
  await expect(evidence).toBeFocused();
  await evidence.press("ArrowLeft");
  await expect(evidence).toHaveAttribute("aria-expanded", "false");
  await evidence.press("ArrowRight");
  await expect(evidence).toHaveAttribute("aria-expanded", "true");
  await evidence.press("ArrowRight");
  await expect(page.locator('[data-path="$.evidence.automated"]')).toBeFocused();

  const copyPath = page.getByRole("button", { name: "Copy selected path" });
  await copyPath.focus();
  await copyPath.press("Enter");
  await expect(copyPath).toBeFocused();
  expect(
    await page.evaluate(
      () => (globalThis as typeof globalThis & { __mrgCopied?: string }).__mrgCopied,
    ),
  ).toBe("$.evidence.automated");
  await expect(page.getByRole("status").last()).toHaveText("Path copied");

  const copyValue = page.getByRole("button", { name: "Copy selected value" });
  await copyValue.focus();
  await copyValue.press("Enter");
  await expect(copyValue).toBeFocused();
  expect(
    await page.evaluate(
      () => (globalThis as typeof globalThis & { __mrgCopied?: string }).__mrgCopied,
    ),
  ).toContain('"keyboard"');
  expect(await axeViolations(page)).toEqual([]);
});

test("clipboard fallback removes temporary controls when the legacy copy command throws", async ({
  page,
}) => {
  await page.addInitScript(() => {
    Object.defineProperty(navigator, "clipboard", { configurable: true, value: undefined });
    Object.defineProperty(Document.prototype, "execCommand", {
      configurable: true,
      value: () => {
        throw new Error("Injected clipboard failure");
      },
    });
  });
  await openStory(page, "copy-and-failure-states");

  const cases = [
    ["Copy code", "Command could not be copied"],
    ["Copy diff", "Change set could not be copied"],
    ["Copy selected path", "JSON selection could not be copied"],
    ["Copy selected value", "JSON selection could not be copied"],
  ] as const;
  for (const [buttonName, status] of cases) {
    await page.getByRole("button", { name: buttonName }).click();
    await expect(page.getByRole("status").filter({ hasText: status })).toHaveCount(1);
    await expect(page.locator("body > textarea")).toHaveCount(0);
  }
});

test("diff rows expose non-color meaning and the complete vertical keyboard model", async ({
  page,
}) => {
  await openStory(page, "interactive-viewers");
  const rows = page.locator('[data-slot="diff-line"]');
  await expect(rows).toHaveCount(5);
  await expect(rows.nth(1)).toHaveAttribute("aria-label", /^Removed line/u);
  await expect(rows.nth(2)).toHaveAttribute("aria-label", /^Added line/u);
  await expect(rows.nth(3)).toHaveAttribute("aria-label", /^Changed line/u);
  await expect(rows.nth(1).locator('[data-slot="diff-marker"]')).toContainText("−");
  await expect(rows.nth(2).locator('[data-slot="diff-marker"]')).toContainText("+");
  await expect(rows.nth(3).locator('[data-slot="diff-marker"]')).toContainText("~");

  await rows.first().focus();
  await rows.first().press("End");
  await expect(rows.last()).toBeFocused();
  await rows.last().press("Home");
  await expect(rows.first()).toBeFocused();
  await rows.first().press("PageDown");
  await expect(rows.last()).toBeFocused();
  await rows.last().press("ArrowUp");
  await expect(rows.nth(3)).toBeFocused();
});

test("320 CSS pixel long-content specimen confines overflow to owned scrollers", async ({
  browser,
}) => {
  const page = await browser.newPage({ viewport: { height: 960, width: 320 } });
  const failures = monitorPage(page);
  await openStory(page, "narrow-and-long-content");
  const geometry = await page.evaluate(() => {
    const ownedScrollers = new Set(["code-block-scroll", "diff-scroll", "json-tree"]);
    const overflows = [...document.querySelectorAll<HTMLElement>("[data-slot]")]
      .filter(
        (element) =>
          element.scrollWidth > element.clientWidth + 1 &&
          !ownedScrollers.has(element.dataset.slot ?? "") &&
          !element.closest('[data-slot="diff-scroll"]'),
      )
      .map((element) => element.dataset.slot);
    return {
      documentOverflow: document.documentElement.scrollWidth > window.innerWidth + 1,
      overflows,
    };
  });
  expect(geometry).toEqual({ documentOverflow: false, overflows: [] });
  await expect(page.locator('[data-slot="diff-scroll"]')).toHaveCSS("overflow-x", "auto");
  expect(await axeViolations(page)).toEqual([]);
  expect(failures).toEqual([]);
  await page.close();
});

test("responsive description pairs switch intrinsically without changing dl semantics", async ({
  page,
}) => {
  await page.setViewportSize({ height: 800, width: 1100 });
  await openStory(page, "description-layouts");
  const list = page.locator('dl[data-layout-probe="true"]');
  await expect(list.locator(":scope > dt")).toHaveCount(2);
  await expect(list.locator(":scope > dd")).toHaveCount(2);
  const wide = await list
    .locator(":scope > dt, :scope > dd")
    .evaluateAll((items) => items.map((item) => Math.round(item.getBoundingClientRect().top)));
  expect(wide[0]).toBe(wide[1]);
  expect(wide[2]).toBe(wide[3]);

  await page.setViewportSize({ height: 900, width: 320 });
  const narrow = await list
    .locator(":scope > dt, :scope > dd")
    .evaluateAll((items) => items.map((item) => Math.round(item.getBoundingClientRect().top)));
  expect(narrow[1]).toBeGreaterThan(narrow[0] ?? 0);
  expect(narrow[2]).toBeGreaterThan(narrow[1] ?? 0);
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1),
  ).toBe(false);
  expect(await axeViolations(page)).toEqual([]);
});

test("split mode, RTL, and forced colors preserve structure, markers, and focus", async ({
  browser,
  page,
}) => {
  await openStory(page, "right-to-left");
  await expect(page.locator('[data-slot="provider"]')).toHaveAttribute("lang", "ar-EG");
  await expect(page.locator('[data-slot="provider"]')).toHaveAttribute("dir", "rtl");
  await expect(page.locator("main")).toHaveCSS("direction", "rtl");
  await expect(page.getByRole("button", { name: "نسخ الفروق" })).toHaveCount(1);
  await expect(page.getByRole("button", { name: "نسخ المسار المحدد" })).toHaveCount(1);
  await expect(page.getByRole("button", { name: "نسخ القيمة المحددة" })).toHaveCount(1);
  await expect(page.getByRole("tree", { name: "شجرة استجابة السجل" })).toHaveCount(1);
  await expect(page.getByRole("group", { name: "Control زائد Enter" })).toHaveCount(1);
  await expect(page.getByRole("button", { name: "Copy diff" })).toHaveCount(0);
  await expect(page.locator('[data-slot="diff-viewer"]')).toHaveAttribute("data-mode", "split");
  await expect(page.locator('[data-slot="diff-old-content"]')).toHaveCount(5);
  await expect(page.locator('[data-slot="diff-new-content"]')).toHaveCount(5);
  expect(await axeViolations(page)).toEqual([]);

  const context = await browser.newContext({ forcedColors: "active" });
  const forcedPage = await context.newPage();
  const forcedFailures = monitorPage(forcedPage);
  await openStory(forcedPage, "interactive-viewers");
  const added = forcedPage.locator('[data-slot="diff-line"][data-kind="added"]');
  await expect(added).toHaveCount(1);
  await expect(added.locator('[data-slot="diff-marker"]')).toContainText("+");
  await added.focus();
  const outline = await added.evaluate((element) => getComputedStyle(element).outlineStyle);
  expect(outline).not.toBe("none");
  await expect(
    forcedPage.locator('[data-slot="json-tree-item"][aria-selected="true"]'),
  ).toHaveCount(1);
  const systemSelection = await forcedPage.evaluate(() => {
    const probe = document.createElement("span");
    probe.style.backgroundColor = "Highlight";
    probe.style.color = "HighlightText";
    probe.style.position = "fixed";
    document.body.append(probe);
    const probeStyle = getComputedStyle(probe);
    const expected = {
      background: probeStyle.backgroundColor,
      foreground: probeStyle.color,
    };
    probe.remove();
    const highlighted = document.querySelector<HTMLElement>('[data-highlighted="true"]')!;
    const selected = document.querySelector<HTMLElement>(
      '[data-slot="json-tree-item"][aria-selected="true"]',
    )!;
    return {
      active: matchMedia("(forced-colors: active)").matches,
      expected,
      highlighted: {
        background: getComputedStyle(highlighted).backgroundColor,
        foreground: getComputedStyle(highlighted).color,
      },
      selected: {
        background: getComputedStyle(selected).backgroundColor,
        foreground: getComputedStyle(selected).color,
      },
    };
  });
  expect(systemSelection).toEqual({
    active: true,
    expected: systemSelection.expected,
    highlighted: systemSelection.expected,
    selected: systemSelection.expected,
  });
  // Axe treats each emulated OS Highlight/HighlightText palette as an authored color pair. Drop
  // only nodes proven above to inherit that exact system pair; every application-owned node/rule
  // remains strict.
  expect(await forcedColorAxeViolations(forcedPage)).toEqual([]);
  expect(forcedFailures).toEqual([]);
  await context.close();
});
