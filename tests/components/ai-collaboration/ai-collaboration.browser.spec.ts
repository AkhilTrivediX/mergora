import { resolve } from "node:path";

import { expect, test, type ConsoleMessage, type Page } from "@playwright/test";

const axePath = resolve(
  import.meta.dirname,
  "../../../packages/test-utils/node_modules/axe-core/axe.min.js",
);
const failures = new WeakMap<Page, string[]>();

function isPlaywrightFirefoxLayoutWarning(message: ConsoleMessage): boolean {
  const text = message.text();
  return (
    message.type() === "warning" &&
    text.includes("Layout was forced before the page was fully loaded.") &&
    (message.location().url.startsWith("chrome://juggler/") ||
      text.includes('file: "chrome://juggler/'))
  );
}

test.beforeEach(({ page }) => {
  const messages: string[] = [];
  failures.set(page, messages);
  page.on("console", (message) => {
    if (
      (message.type() === "warning" || message.type() === "error") &&
      !isPlaywrightFirefoxLayoutWarning(message)
    ) {
      messages.push(`console.${message.type()}: ${message.text()}`);
    }
  });
  page.on("pageerror", (error) => messages.push(`pageerror: ${error.message}`));
});

test.afterEach(({ page }) => expect(failures.get(page) ?? []).toEqual([]));

async function openStory(page: Page, id: string): Promise<void> {
  await page.goto(`/iframe.html?viewMode=story&id=components-ai-and-collaboration--${id}`, {
    waitUntil: "domcontentloaded",
  });
  await expect(page.locator("[data-slot]").first()).toBeVisible();
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
      for (let attempt = 0; attempt < 40; attempt += 1) {
        try {
          return (await axe.run(document.body, runOptions)).violations;
        } catch (error) {
          if (!(error instanceof Error) || !error.message.includes("Axe is already running")) {
            throw error;
          }
          await new Promise((resolveDelay) => setTimeout(resolveDelay, 50));
        }
      }
      throw new Error("Axe did not become available after the Storybook accessibility check.");
    },
    { ignoreColorContrast },
  );
}

test("every basic and recommended story isolates its selected enhancement output", async ({
  page,
}) => {
  const cases = [
    ["message", '[data-slot="message-role-context"]'],
    ["chat-composer", '[data-slot="chat-composer-attachments"]'],
    ["prompt-suggestions", '[data-slot="prompt-suggestion"] small'],
    ["citation", '[data-slot="citation-source-detail"]'],
    ["tool-call", '[data-slot="tool-call-details"]'],
    ["streaming-text", '[data-slot="streaming-text-cursor"]'],
    ["collaboration-presence", '[data-slot="collaboration-presence-summary"]'],
    ["audit-log", '[data-slot="audit-log-filters"]'],
    ["ai-chat-workspace", '[data-slot="chat-composer-attachments"]'],
  ] as const;

  for (const [story, selector] of cases) {
    await openStory(page, `basic-${story}`);
    await expect(page.locator(selector)).toHaveCount(0);
    await openStory(page, `recommended-${story}`);
    await expect(page.locator(selector).first()).toBeVisible();
  }

  await openStory(page, "basic-comment-thread");
  await page.getByRole("textbox", { name: "Reply" }).fill("@m");
  await expect(page.locator('[data-slot="comment-thread-mentions"]')).toHaveCount(0);
  await openStory(page, "recommended-comment-thread");
  await page.getByRole("textbox", { name: "Reply" }).fill("@m");
  await expect(page.locator('[data-slot="comment-thread-mentions"]')).toBeVisible();

  await openStory(page, "basic-chat-composer");
  await expect(page.locator('[data-slot="chat-composer-budget"]')).toHaveCount(0);
  await expect(page.locator('[data-slot="chat-composer-shortcut"]')).toHaveCount(0);
  await openStory(page, "recommended-chat-composer");
  await expect(page.locator('[data-slot="chat-composer-budget"]')).toBeVisible();
  await expect(page.locator('[data-slot="chat-composer-shortcut"]')).toBeVisible();
  expect(await axeViolations(page)).toEqual([]);
});

test("message-list and reasoning basic and recommended stories prove exact enhancement isolation", async ({
  page,
}) => {
  await openStory(page, "basic-message-list");
  await expect(page.locator('[data-slot="message-list-announcement"]')).toHaveCount(0);
  await expect(page.locator('[data-slot="message-list-follow"]')).toHaveCount(0);
  await expect(page.locator('[data-slot="message-list-items"] > li')).toHaveCount(18);
  await openStory(page, "recommended-message-list");
  await expect(page.locator('[data-slot="message-list-announcement"]')).toHaveCount(1);
  await expect(page.locator('[data-slot="message-list"]')).toHaveAttribute(
    "data-following",
    "true",
  );
  expect(await page.locator('[data-slot="message-list-items"] > li').count()).toBeLessThan(18);

  await openStory(page, "basic-reasoning");
  await expect(page.locator('[data-slot="reasoning-progress"]')).toHaveCount(0);
  await expect(page.locator('[data-slot="reasoning-announcement"]')).toHaveCount(0);
  await openStory(page, "recommended-reasoning");
  await expect(page.locator('[data-slot="reasoning-progress"]')).toContainText("Checks: 2 of 4");
  await expect(page.locator('[data-slot="reasoning-announcement"]')).toHaveCount(1);
  expect(await axeViolations(page)).toEqual([]);
});

test("selection suggestions use roving listbox navigation", async ({ page }) => {
  await openStory(page, "recommended-prompt-suggestions");
  const first = page.getByRole("option", { name: /Summarize/u });
  const second = page.getByRole("option", { name: /Compare/u });
  await first.focus();
  await first.press("ArrowDown");
  await expect(second).toBeFocused();
  await second.press("Enter");
  await expect(second).toHaveAttribute("aria-selected", "true");
  expect(await axeViolations(page)).toEqual([]);
});

test("composer shortcuts are IME-safe and native reset restores the default", async ({ page }) => {
  await openStory(page, "recommended-chat-composer");
  const editor = page.getByRole("textbox", { name: "Message" });
  await editor.fill("Composed text");
  await editor.dispatchEvent("compositionstart");
  await editor.press("Control+Enter");
  await expect(page.getByText("Submitted message: Composed text")).toHaveCount(0);
  await editor.dispatchEvent("compositionend");
  await editor.press("Control+Enter");
  await expect(page.getByText("Submitted message: Composed text")).toBeVisible();

  await openStory(page, "form-lifecycle");
  const lifecycle = page.getByRole("textbox", { name: "Message" });
  await lifecycle.fill("Changed draft");
  await page.getByRole("button", { name: "Reset draft" }).click();
  await expect(lifecycle).toHaveValue("Draft retained by native reset");
});

test("failed optimistic comments retain explicit retry and discard recovery", async ({ page }) => {
  await openStory(page, "optimistic-error-recovery");
  await page.getByRole("button", { name: "Post reply" }).click();
  await expect(page.getByText("Not posted")).toBeVisible();
  await expect(page.getByRole("button", { name: "Retry" })).toBeVisible();
  await page.getByRole("button", { name: "Discard" }).click();
  await expect(page.getByText("Not posted")).toHaveCount(0);
});

test("unsafe citations never enter the link or tab order", async ({ page }) => {
  await openStory(page, "state-matrix");
  const unavailable = page.getByLabel("Citation 2 is unavailable");
  await expect(unavailable).toBeVisible();
  await expect(unavailable.locator("xpath=ancestor-or-self::a")).toHaveCount(0);
  expect(await axeViolations(page)).toEqual([]);
});

test("workspace composes public conversation, streaming, citation, tool and composer paths", async ({
  page,
}) => {
  await openStory(page, "recommended-ai-chat-workspace");
  await expect(page.getByRole("complementary", { name: "Conversations" })).toBeVisible();
  await expect(page.getByRole("main")).toBeVisible();
  await expect(page.getByRole("textbox", { name: "Message" })).toBeVisible();
  await expect(page.getByRole("button", { name: /Summarize/u })).toBeVisible();
  await page.getByRole("button", { name: /Summarize/u }).click();
  await expect(page.getByRole("textbox", { name: "Message" })).toHaveValue(
    "Summarize the current evidence",
  );
  expect(await axeViolations(page)).toEqual([]);
});

test("touch follows message output and toggles reasoning while reduced motion remains direct", async ({
  browser,
  page: fixturePage,
}) => {
  await openStory(fixturePage, "recommended-message-list");
  const baseURL = new URL(fixturePage.url()).origin;
  const context = await browser.newContext({
    baseURL,
    hasTouch: true,
    reducedMotion: "reduce",
    viewport: { height: 720, width: 320 },
  });
  const page = await context.newPage();
  const messages: string[] = [];
  failures.set(page, messages);
  page.on("console", (message) => {
    if (
      (message.type() === "warning" || message.type() === "error") &&
      !isPlaywrightFirefoxLayoutWarning(message)
    )
      messages.push(message.text());
  });
  page.on("pageerror", (error) => messages.push(`pageerror: ${error.message}`));

  await openStory(page, "recommended-message-list");
  const preferences = await page.evaluate(() => ({
    coarse: matchMedia("(pointer: coarse)").matches,
    reduced: matchMedia("(prefers-reduced-motion: reduce)").matches,
  }));
  expect(preferences.coarse).toBe(true);
  expect(preferences.reduced).toBe(true);
  const viewport = page.locator('[data-slot="message-list-viewport"]');
  expect(await viewport.evaluate((element) => getComputedStyle(element).scrollBehavior)).toBe(
    "auto",
  );
  await viewport.evaluate((element) => {
    element.scrollTop = 0;
    element.dispatchEvent(new Event("scroll", { bubbles: true }));
  });
  const follow = page.locator('[data-slot="message-list-follow"]');
  await expect(follow).toBeVisible();
  expect((await follow.boundingBox())?.height ?? 0).toBeGreaterThanOrEqual(44);
  await follow.tap();
  await expect(page.locator('[data-slot="message-list"]')).toHaveAttribute(
    "data-following",
    "true",
  );
  await expect(follow).toHaveCount(0);

  await openStory(page, "recommended-reasoning");
  const reasoning = page.locator('[data-slot="reasoning"]');
  const summary = page.locator('[data-slot="reasoning-summary"]');
  const reasoningTransitionSeconds = Number.parseFloat(
    await page
      .locator('[data-slot="reasoning-content"]')
      .evaluate((element) => getComputedStyle(element).transitionDuration),
  );
  expect(reasoningTransitionSeconds).toBeLessThanOrEqual(0.001);
  await expect(reasoning).toHaveAttribute("open", "");
  await summary.tap();
  await expect(reasoning).not.toHaveAttribute("open", "");
  await summary.tap();
  await expect(reasoning).toHaveAttribute("open", "");
  expect(await axeViolations(page)).toEqual([]);
  expect(messages).toEqual([]);
  await context.close();
});

test("narrow RTL, reduced motion and forced colors retain readable structure", async ({
  browser,
  browserName,
}) => {
  const context = await browser.newContext({
    forcedColors: "active",
    reducedMotion: "reduce",
    viewport: { height: 720, width: 320 },
  });
  const page = await context.newPage();
  const messages: string[] = [];
  failures.set(page, messages);
  page.on("console", (message) => {
    if (
      (message.type() === "warning" || message.type() === "error") &&
      !isPlaywrightFirefoxLayoutWarning(message)
    )
      messages.push(message.text());
  });
  await openStory(page, "narrow-rtl-preferences");
  await expect(page.locator('[data-slot="message"]').first()).toHaveAttribute(
    "data-message-role",
    "assistant",
  );
  await expect(page.locator('[data-slot="chat-composer"]').first()).toBeVisible();
  await expect(page.locator('[data-slot="audit-log"]')).toBeVisible();
  await expect(page.locator('[data-slot="ai-chat-workspace"]')).toBeVisible();
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - innerWidth);
  expect(overflow).toBeLessThanOrEqual(1);
  const style = await page
    .locator('[data-slot="message"]')
    .first()
    .evaluate((element) => ({
      border: getComputedStyle(element).borderColor,
      direction: getComputedStyle(element).direction,
    }));
  expect(style.border).not.toBe("rgba(0, 0, 0, 0)");
  expect(style.direction).toBe("rtl");
  const animationName = await page
    .locator('[data-slot="streaming-text-cursor"]')
    .evaluate((element) => getComputedStyle(element).animationName);
  expect(animationName).toBe("none");
  expect(await axeViolations(page, { ignoreColorContrast: browserName !== "chromium" })).toEqual(
    [],
  );
  expect(messages).toEqual([]);
  await context.close();
});
