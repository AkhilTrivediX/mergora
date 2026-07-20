import { resolve } from "node:path";

import { expect, test, type Page } from "@playwright/test";

const axePath = resolve(
  import.meta.dirname,
  "../../../packages/test-utils/node_modules/axe-core/axe.min.js",
);
const failures = new WeakMap<Page, string[]>();

test.beforeEach(({ page }) => {
  const messages: string[] = [];
  failures.set(page, messages);
  page.on("console", (message) => {
    const text = message.text();
    if (
      (message.type() === "warning" || message.type() === "error") &&
      !text.startsWith("Error loading story index") &&
      !text.includes("downloadable font: download failed")
    )
      messages.push(text);
  });
  page.on("pageerror", (error) => messages.push(error.message));
});
test.afterEach(({ page }) => expect(failures.get(page) ?? []).toEqual([]));

async function openStory(page: Page, id: string): Promise<void> {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    await page.goto(`/iframe.html?viewMode=story&id=${id}`, { waitUntil: "domcontentloaded" });
    try {
      await page.locator("[data-slot]").first().waitFor({ state: "visible", timeout: 10_000 });
      return;
    } catch {
      if (attempt === 2) throw new Error(`Story ${id} did not render after three attempts.`);
    }
  }
}

async function axe(page: Page): Promise<unknown[]> {
  await page.addScriptTag({ path: axePath });
  return page.evaluate(async () => {
    const runtime = (
      globalThis as unknown as {
        axe: { run(target: Element): Promise<{ violations: unknown[] }> };
      }
    ).axe;
    const target =
      document.querySelector('[data-slot="notification-center"]') ??
      document.querySelector('[data-slot="scheduler-kit"]') ??
      document.querySelector('[data-slot="file-manager"]') ??
      document.body;
    for (let attempt = 0; attempt < 4; attempt += 1) {
      try {
        return (await runtime.run(target)).violations;
      } catch (error) {
        if (
          !(error instanceof Error) ||
          !error.message.includes("already running") ||
          attempt === 3
        )
          throw error;
        await new Promise((resolveWait) => globalThis.setTimeout(resolveWait, 250));
      }
    }
    return [];
  });
}

test("basic and recommended stories isolate optional output", async ({ page }) => {
  await openStory(page, "kits-file-manager--basic-file-manager");
  await expect(page.locator('[data-slot="file-manager-conflicts"]')).toHaveCount(0);
  await openStory(page, "kits-file-manager--recommended-file-manager");
  await expect(page.locator('[data-slot="file-manager-conflicts"]')).toBeVisible();
  expect(await axe(page)).toEqual([]);

  await openStory(page, "kits-scheduler-kit--basic-scheduler-kit");
  await expect(page.locator('[data-slot="scheduler-conflicts"]')).toHaveCount(0);
  await openStory(page, "kits-scheduler-kit--recommended-scheduler-kit");
  await expect(page.locator('[data-slot="scheduler-conflicts"]')).toBeVisible();
  await expect(page.locator('[data-slot="scheduler-kit"]')).toHaveAttribute(
    "data-maturity",
    "beta",
  );

  await openStory(page, "feedback-notification-center--basic-notification-center");
  await expect(page.locator('[data-slot="notification-center-live-queue"]')).toHaveCount(0);
  await openStory(page, "feedback-notification-center--recommended-notification-center");
  await expect(page.locator('[data-slot="notification-center-live-queue"]')).toBeVisible();
});

test("keyboard paths, queued updates and axe remain usable", async ({ page }) => {
  await openStory(page, "feedback-notification-center--recommended-notification-center");
  const show = page.getByRole("button", { name: "Show new notifications" });
  await show.focus();
  await show.press("Enter");
  await expect(page.locator('[data-slot="notification-center-live-queue"]')).toHaveCount(0);
  await page.getByRole("button", { name: "Unread", exact: true }).click();
  await expect(page.getByText("Evidence refreshed")).toBeVisible();
  expect(await axe(page)).toEqual([]);
});

test("narrow RTL, forced colors and reduced motion preserve focus and reflow", async ({
  browser,
}) => {
  const context = await browser.newContext({
    forcedColors: "active",
    reducedMotion: "reduce",
    viewport: { height: 568, width: 320 },
  });
  const page = await context.newPage();
  await openStory(page, "kits-scheduler-kit--narrow-rtl-scheduler");
  const agenda = page.getByRole("button", { name: "Agenda" });
  await agenda.focus();
  const result = await agenda.evaluate((element) => ({
    duration: getComputedStyle(element).transitionDuration,
    outline: getComputedStyle(element).outlineStyle,
    overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
  }));
  expect(result.duration).toBe("0s");
  expect(result.outline).not.toBe("none");
  expect(result.overflow).toBeLessThanOrEqual(1);
  expect(await axe(page)).toEqual([]);

  for (const [story, slot] of [
    ["kits-file-manager--narrow-rtl-file-manager", "file-manager"],
    ["feedback-notification-center--narrow-rtl-notifications", "notification-center"],
  ] as const) {
    await openStory(page, story);
    const root = page.locator(`[data-slot="${slot}"]`);
    await expect(root).toBeVisible();
    const control = root.getByRole("button").first();
    await control.focus();
    const preferenceResult = await control.evaluate((element) => ({
      duration: getComputedStyle(element).transitionDuration,
      outline: getComputedStyle(element).outlineStyle,
      overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
    }));
    expect(preferenceResult.duration).toBe("0s");
    expect(preferenceResult.outline).not.toBe("none");
    expect(preferenceResult.overflow).toBeLessThanOrEqual(1);
    expect(await axe(page)).toEqual([]);
  }

  for (const story of [
    "kits-file-manager--file-manager-preferences",
    "feedback-notification-center--notification-preferences",
  ]) {
    await openStory(page, story);
    expect(await axe(page)).toEqual([]);
  }
  await context.close();
});
