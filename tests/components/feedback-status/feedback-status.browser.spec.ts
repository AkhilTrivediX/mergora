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
  await page.goto(`/iframe.html?viewMode=story&id=p2-feedback-status--${story}`, {
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
        await new Promise((resolvePromise) => setTimeout(resolvePromise, 50));
      }
    }
    throw new Error("Timed out waiting for the Storybook accessibility scan to finish.");
  });
}

test("workbench keeps static feedback quiet while preserving native semantics", async ({
  page,
}, testInfo) => {
  await openStory(page, "feedback-workbench");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Feedback and status workbench");
  await expect(page.getByRole("alert")).toHaveCount(0);
  await expect(page.getByRole("status")).toHaveCount(0);
  await expect(page.locator('[data-slot="alert"]')).not.toHaveAttribute("role");
  await expect(page.locator('[data-slot="callout"]')).not.toHaveAttribute("role");
  await expect(page.getByRole("complementary", { name: "Maintenance window" })).toBeVisible();
  await expect(page.locator('[data-slot="badge"][data-kind="category"]')).toHaveText("Beta");
  await expect(page.locator('[data-slot="badge"][data-kind="status"]')).toContainText("Success:");
  await expect(page.locator('[data-slot="status"]')).toContainText("Warning:");
  await expect(page.getByRole("progressbar")).toHaveCount(2);
  await expect(page.getByRole("meter")).toHaveCount(1);
  await expect(page.locator('[data-slot="spinner"]')).toHaveAttribute("aria-hidden", "true");
  const skeletons = page.locator('[data-slot="skeleton"]');
  await expect(skeletons).toHaveCount(2);
  expect(
    await skeletons.evaluateAll((elements) =>
      elements.every((element) => element.ariaHidden === "true"),
    ),
  ).toBe(true);

  const compactBadges = page.locator('[data-slot="badge"]');
  for (let index = 0; index < (await compactBadges.count()); index += 1) {
    await expect(compactBadges.nth(index)).not.toHaveAttribute("tabindex");
    await expect(compactBadges.nth(index)).not.toHaveAttribute("role", "button");
  }

  const undersized = await page
    .locator('[data-slot="banner-dismiss"], [data-slot="error-state-retry"]')
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
  await page.screenshot({ fullPage: true, path: testInfo.outputPath("feedback-workbench.png") });
});

test("complete variant story renders every feedback severity it claims", async ({ page }) => {
  await openStory(page, "feedback-variants");
  const variants = async (slot: string) =>
    page
      .locator(`[data-slot="${slot}"][data-variant]`)
      .evaluateAll((elements) =>
        [...new Set(elements.map((element) => element.getAttribute("data-variant")))].sort(),
      );

  expect(await variants("alert")).toEqual(["error", "info", "success", "warning"]);
  expect(await variants("callout")).toEqual(["info", "note", "tip", "warning"]);
  expect(await variants("banner")).toEqual(["error", "info", "success", "warning"]);
  expect(await variants("status")).toEqual(["error", "info", "neutral", "success", "warning"]);
  expect(
    await page
      .locator('[data-slot="badge"][data-kind="status"]')
      .evaluateAll((elements) =>
        [...new Set(elements.map((element) => element.getAttribute("data-variant")))].sort(),
      ),
  ).toEqual(["error", "info", "neutral", "success", "warning"]);
  await expect(page.getByRole("progressbar")).toHaveCount(2);
  await expect(page.getByRole("meter")).toHaveCount(1);
  await expect(page.locator('[data-slot="spinner"]')).toHaveCount(3);
  expect(await axeViolations(page)).toEqual([]);
});

test("live policy announces only explicit transitions through shared persistent regions", async ({
  page,
}) => {
  await openStory(page, "live-policy");
  const politeRegion = page.locator('[data-slot="sr-announcer-polite"]');
  const assertiveRegion = page.locator('[data-slot="sr-announcer-assertive"]');
  await expect(page.getByRole("alert")).toHaveCount(1);
  await expect(page.getByRole("status")).toHaveCount(1);
  await expect(politeRegion).toBeEmpty();
  await expect(assertiveRegion).toBeEmpty();

  await page.getByRole("button", { name: "Save draft" }).click();
  await expect(politeRegion).toContainText("The draft was saved locally. Event 1.");
  const visualAlert = page.locator('[data-slot="alert"]');
  await expect(visualAlert).toHaveAttribute("data-live", "polite");
  await expect(visualAlert).not.toHaveAttribute("role");
  await expect(visualAlert).not.toHaveAttribute("aria-live");
  await expect(visualAlert.getByRole("button", { name: "Review details" })).toBeVisible();
  expect(
    await visualAlert.evaluate(
      (element) => element.querySelector('[role="status"], [role="alert"], [aria-live]') !== null,
    ),
  ).toBe(false);

  await page.getByRole("button", { name: "Check publish block" }).click();
  await expect(assertiveRegion).toContainText(
    "Publishing is blocked by a digest mismatch. Event 2.",
  );
  await expect(page.locator('[data-slot="alert"]')).toHaveAttribute("data-live", "assertive");
  await expect(page.getByRole("alert")).toHaveCount(1);
  await expect(page.getByRole("status")).toHaveCount(1);
  expect(await axeViolations(page)).toEqual([]);
});

test("banner dismissal persists, returns focus through the documented callback, and can recover", async ({
  page,
}) => {
  await page.addInitScript(() => {
    const probe = globalThis as unknown as { __mergoraBannerFirstPaint?: boolean[] };
    probe.__mergoraBannerFirstPaint = [];
    const installPaintProbe = () => {
      const capture = () => {
        const banner = document.querySelector<HTMLElement>('[data-banner-id="persistent-release"]');
        if (banner === null) return false;
        requestAnimationFrame(() => {
          const style = getComputedStyle(banner);
          probe.__mergoraBannerFirstPaint?.push(
            !banner.hidden && style.display !== "none" && style.visibility !== "hidden",
          );
        });
        return true;
      };
      if (capture()) return;
      const observer = new MutationObserver(() => {
        if (capture()) observer.disconnect();
      });
      observer.observe(document.body, { childList: true, subtree: true });
    };
    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", installPaintProbe, { once: true });
    } else {
      installPaintProbe();
    }
    if (sessionStorage.getItem("mergora-banner-test-started") === null) {
      localStorage.removeItem("mergora.story.banner.persistent-release");
      sessionStorage.setItem("mergora-banner-test-started", "true");
    }
  });
  await openStory(page, "banner-persistence");
  const banner = page.locator('[data-banner-id="persistent-release"]');
  const restore = page.getByRole("button", { name: "Restore persisted banner" });
  const dismiss = page.getByRole("button", { name: "Dismiss message" });
  await expect(banner).toBeVisible();
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          (globalThis as unknown as { __mergoraBannerFirstPaint?: boolean[] })
            .__mergoraBannerFirstPaint?.[0],
      ),
    )
    .toBe(true);
  const dismissBounds = await dismiss.boundingBox();
  expect(dismissBounds?.height ?? 0).toBeGreaterThanOrEqual(44);
  expect(dismissBounds?.width ?? 0).toBeGreaterThanOrEqual(44);
  await dismiss.click();
  await expect(banner).toBeHidden();
  await expect(restore).toBeFocused();
  expect(
    await page.evaluate(() => localStorage.getItem("mergora.story.banner.persistent-release")),
  ).toBe("dismissed");

  await page.reload({ waitUntil: "domcontentloaded" });
  await expect(page.locator('[data-banner-id="persistent-release"]')).toBeHidden();
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          (globalThis as unknown as { __mergoraBannerFirstPaint?: boolean[] })
            .__mergoraBannerFirstPaint?.[0],
      ),
    )
    .toBe(false);
  await page.getByRole("button", { name: "Restore persisted banner" }).click();
  await expect(page.locator('[data-banner-id="persistent-release"]')).toBeVisible();
  expect(
    await page.evaluate(() => localStorage.getItem("mergora.story.banner.persistent-release")),
  ).toBeNull();
  expect(await axeViolations(page)).toEqual([]);
});

test("persisted Banner server markup hydrates hidden without a visible paint or recovery", async ({
  page,
}) => {
  await openStory(page, "banner-hydration");
  const host = page.locator('[data-testid="banner-hydration-host"]');
  await expect(host).toHaveAttribute("data-hydrated", "true");
  await expect(host).toHaveAttribute("data-pre-hydration-visible", "false");
  await expect(host).toHaveAttribute("data-ever-visible", "false");
  await expect(host).not.toHaveAttribute("data-hydration-error");
  const banner = host.locator('[data-slot="banner"]');
  await expect(banner).toBeHidden();
  await expect(banner).not.toHaveAttribute("data-persistence-pending");
  expect(await axeViolations(page)).toEqual([]);
});

test("owned banner and error controls expose real hover, active, and focus-visible states", async ({
  page,
}) => {
  await openStory(page, "banner-interactions");
  const dismiss = page.getByRole("button", { name: "Dismiss message" });
  const baseBackground = await dismiss.evaluate((element) => getComputedStyle(element).background);
  await dismiss.hover();
  expect(await dismiss.evaluate((element) => getComputedStyle(element).background)).not.toBe(
    baseBackground,
  );
  await page.mouse.down();
  expect(await dismiss.evaluate((element) => getComputedStyle(element).boxShadow)).not.toBe("none");
  await page.mouse.move(0, 0);
  await page.mouse.up();
  await dismiss.focus();
  await page.keyboard.press("Shift+Tab");
  await page.keyboard.press("Tab");
  expect(await dismiss.evaluate((element) => getComputedStyle(element).outlineStyle)).not.toBe(
    "none",
  );

  await openStory(page, "error-interactions");
  const retry = page.getByRole("button", { name: "Try again" });
  await retry.hover();
  await expect(retry).toHaveCSS("text-decoration-line", "underline");
  await page.mouse.down();
  await expect(retry).toHaveCSS("text-decoration-style", "double");
  await page.mouse.up();
  await retry.focus();
  await page.keyboard.press("Shift+Tab");
  await page.keyboard.press("Tab");
  expect(await retry.evaluate((element) => getComputedStyle(element).outlineStyle)).not.toBe(
    "none",
  );
  const summary = page.locator('[data-slot="error-state-details"] summary');
  await summary.hover();
  await expect(summary).toHaveCSS("text-decoration-line", "underline");
  await page.getByRole("button", { name: "Report blocking error" }).click();
  const errorState = page.locator('[data-slot="error-state"]');
  const assertiveRegion = page.locator('[data-slot="sr-announcer-assertive"]');
  await expect(assertiveRegion).toHaveText("Registry request failed. Retry is available. Event 1.");
  await expect(errorState).not.toHaveAttribute("role");
  await expect(errorState).not.toHaveAttribute("aria-live");
  expect(
    await errorState.evaluate(
      (element) => element.querySelector('[role="status"], [role="alert"], [aria-live]') !== null,
    ),
  ).toBe(false);
  await expect(errorState.locator('[data-slot="error-state-retry"]')).toBeVisible();
  await expect(errorState.locator('[data-slot="error-state-details"]')).toBeVisible();
  expect(await axeViolations(page)).toEqual([]);
});

test("loading visuals stay decorative while the named region owns busy and announcement state", async ({
  page,
}) => {
  await openStory(page, "loading-states");
  const busy = page.locator('[data-slot="busy-region"]');
  const politeRegion = page.locator('[data-slot="sr-announcer-polite"]');
  await expect(busy).toHaveAttribute("aria-label", "Search results");
  await expect(busy).toHaveAttribute("aria-busy", "false");
  await expect(page.getByRole("status")).toHaveCount(1);
  await expect(politeRegion).toBeEmpty();

  await page.getByRole("button", { name: "Refresh results" }).click();
  await expect(busy).toHaveAttribute("aria-busy", "true");
  await expect(politeRegion).toHaveText("Refreshing search results");
  expect(
    await busy.evaluate(
      (element) => element.querySelector('[role="status"], [role="alert"], [aria-live]') !== null,
    ),
  ).toBe(false);
  await expect(page.locator('[data-slot="spinner"]')).toHaveAttribute("aria-hidden", "true");
  const skeletons = page.locator('[data-slot="skeleton"]');
  await expect(skeletons).toHaveCount(3);
  expect(
    await skeletons.evaluateAll((elements) =>
      elements.every((element) => element.ariaHidden === "true"),
    ),
  ).toBe(true);

  const announcementId = await politeRegion.getAttribute("data-announcement-id");
  await page.getByRole("button", { name: "Finish refresh" }).click();
  await expect(busy).toHaveAttribute("aria-busy", "false");
  await page.getByRole("button", { name: "Refresh results" }).click();
  await expect(busy).toHaveAttribute("aria-busy", "true");
  await expect(politeRegion).toHaveAttribute("data-announcement-id", announcementId ?? "1");
  expect(await axeViolations(page)).toEqual([]);
});

test("empty and error states expose recovery, safe details, and stable retry focus", async ({
  page,
}) => {
  await openStory(page, "recovery-states");
  await expect(page.locator('[data-slot="empty-state"]')).toHaveAttribute(
    "data-context",
    "first-use",
  );
  await expect(page.getByRole("button", { name: "Create theme" })).toBeVisible();
  const retry = page.getByRole("button", { name: "Try again" });
  const retryBounds = await retry.boundingBox();
  expect(retryBounds?.height ?? 0).toBeGreaterThanOrEqual(44);
  expect(retryBounds?.width ?? 0).toBeGreaterThanOrEqual(44);
  await retry.click();
  await expect(retry).toBeFocused();
  await expect(page.getByText("Retry attempts: 1")).toBeVisible();
  const details = page.locator('[data-slot="error-state-details"]');
  await expect(details).not.toHaveAttribute("open");
  await expect(page.getByText("Request ID: public-example-7a1c")).not.toBeVisible();
  await details.getByText("Technical details").click();
  await expect(details).toHaveAttribute("open");
  await expect(page.getByText("Request ID: public-example-7a1c")).toBeVisible();
  await expect(page.locator("body")).not.toContainText("Error:");
  expect(await axeViolations(page)).toEqual([]);
});

test("localized messages, numbers, names, and recovery copy stay synchronized", async ({
  page,
}) => {
  await openStory(page, "localized-messages");
  await expect(page.locator('[data-slot="provider"]')).toHaveAttribute("lang", "de-DE");
  await expect(page.locator('[data-slot="alert-variant-label"]')).toHaveText("Warnung");
  await expect(page.locator('[data-slot="callout-variant-label"]')).toHaveText("Tipp");
  await expect(page.getByRole("button", { name: "Meldung schließen" })).toBeVisible();
  await expect(page.locator('[data-slot="badge-status-label"]')).toContainText("Erfolg");
  const countBadge = page.locator('[data-slot="badge"][data-kind="count"]');
  await expect(countBadge.locator(".mrg-badge__sr-only")).toHaveText("Prüfkommentare: 1.234");
  await expect(countBadge.locator("bdi")).toHaveText("99+");
  await expect(page.locator('[data-slot="status-variant-label"]')).toHaveText("Warnung:");
  await expect(page.locator('[data-slot="progress-value"]')).toHaveText("In Bearbeitung");
  await expect(page.getByRole("button", { name: "Erneut versuchen" })).toBeVisible();
  await expect(page.getByText("Technische Details")).toBeVisible();
  await expect(page.locator("body")).not.toContainText(/(?:alert|banner|badge|status)\.[a-z]/u);
  expect(await axeViolations(page)).toEqual([]);
});

test("RTL direction is independent from locale and isolates numeric user content", async ({
  page,
}) => {
  await openStory(page, "right-to-left");
  await expect(page.locator('[data-slot="provider"]')).toHaveAttribute("dir", "rtl");
  await expect(page.locator('[data-slot="provider"]')).toHaveAttribute("lang", "en-US");
  await expect(page.locator('[data-slot="badge"] bdi')).toHaveText("99+");
  await expect(page.locator('[data-slot="progress-value"] bdi')).toHaveText("72%");
  await expect(page.locator('[data-slot="status-symbol"]')).toHaveAttribute("aria-hidden", "true");
  expect(await axeViolations(page)).toEqual([]);
});

test("a genuine Arabic locale controls digits, direction, and formatter-owned punctuation", async ({
  page,
}) => {
  await openStory(page, "localized-right-to-left");
  const provider = page.locator('[data-slot="provider"]');
  await expect(provider).toHaveAttribute("dir", "rtl");
  await expect(provider).toHaveAttribute("lang", "ar-EG");
  await expect(page.locator('[data-slot="badge"][data-kind="status"]')).toHaveText(
    "نجاح — تم النشر",
  );
  await expect(page.locator('[data-slot="status-variant-label"]')).toHaveText("تحذير —");
  await expect(page.locator('[data-slot="badge"] bdi')).toContainText("٩٩");
  await expect(page.locator('[data-slot="progress-value"] bdi')).toContainText("٧٢");
  expect(await axeViolations(page)).toEqual([]);
});

test("container queries reflow 240 and 320 pixel banners inside a wide page", async ({ page }) => {
  await page.setViewportSize({ height: 900, width: 1280 });
  await openStory(page, "contained-layout");
  const geometry = await page.locator("[data-contained-width]").evaluateAll((containers) =>
    containers.map((container) => {
      const bounds = container.getBoundingClientRect();
      const outside = [...container.querySelectorAll<HTMLElement>("*")]
        .filter((element) => {
          const style = getComputedStyle(element);
          if (style.display === "none" || style.visibility === "hidden") return false;
          const child = element.getBoundingClientRect();
          return child.left < bounds.left - 1 || child.right > bounds.right + 1;
        })
        .map((element) => ({
          slot: element.dataset.slot ?? null,
          tag: element.tagName,
        }));
      const banner = container.querySelector<HTMLElement>('[data-slot="banner"]');
      const layout = banner?.querySelector<HTMLElement>('[data-slot="banner-layout"]');
      const content = banner?.querySelector<HTMLElement>('[data-slot="banner-content"]');
      const actions = banner?.querySelector<HTMLElement>('[data-slot="banner-actions"]');
      return {
        actionCount: actions?.querySelectorAll("button, a").length ?? 0,
        actionOnOwnRow:
          actions !== null &&
          actions !== undefined &&
          content !== null &&
          content !== undefined &&
          actions.getBoundingClientRect().top >= content.getBoundingClientRect().bottom - 1,
        containerWidth: Math.round(bounds.width),
        documentOverflow:
          document.documentElement.scrollWidth > document.documentElement.clientWidth + 1,
        gridColumns:
          layout === null || layout === undefined
            ? null
            : getComputedStyle(layout).gridTemplateColumns,
        outside,
      };
    }),
  );
  expect(geometry.map(({ containerWidth }) => containerWidth)).toEqual([240, 320]);
  for (const result of geometry) {
    expect(result.actionCount).toBe(1);
    expect(result.actionOnOwnRow).toBe(true);
    expect(result.documentOverflow).toBe(false);
    expect(result.outside).toEqual([]);
    expect(result.gridColumns?.split(" ")).toHaveLength(2);
  }
  expect(await axeViolations(page)).toEqual([]);
});

test("320 CSS pixels and 200 percent text reflow without clipping or document overflow", async ({
  page,
}) => {
  await page.setViewportSize({ height: 1000, width: 320 });
  await openStory(page, "narrow-layout");
  await page.evaluate(() => {
    document.documentElement.style.fontSize = "200%";
    document.body.style.letterSpacing = "0.12em";
    document.body.style.lineHeight = "1.5";
    document.body.style.wordSpacing = "0.16em";
  });
  const geometry = await page.evaluate(() => {
    const viewportWidth = document.documentElement.clientWidth;
    return {
      documentOverflow: document.documentElement.scrollWidth > viewportWidth + 1,
      outside: [...document.body.querySelectorAll<HTMLElement>("*")]
        .filter((element) => {
          const style = getComputedStyle(element);
          if (style.display === "none" || style.visibility === "hidden") return false;
          const bounds = element.getBoundingClientRect();
          return bounds.left < -1 || bounds.right > viewportWidth + 1;
        })
        .map((element) => ({
          left: element.getBoundingClientRect().left,
          right: element.getBoundingClientRect().right,
          slot: element.dataset.slot ?? null,
          tag: element.tagName,
        })),
    };
  });
  expect(geometry, JSON.stringify(geometry, null, 2)).toEqual({
    documentOverflow: false,
    outside: [],
  });
  await expect(page.getByRole("button", { name: "Clear all catalog filters" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Try again" })).toBeVisible();
  expect(await axeViolations(page)).toEqual([]);
});

test("forced colors and reduced motion preserve focus and non-color status cues", async ({
  browser,
}) => {
  const context = await browser.newContext({ forcedColors: "active", reducedMotion: "reduce" });
  const page = await context.newPage();
  const failures = guardRuntime(page);
  await openStory(page, "feedback-workbench");
  const retry = page.getByRole("button", { name: "Try again" });
  await retry.focus();
  const styles = await page.evaluate(() => {
    const retryButton = document.querySelector<HTMLElement>('[data-slot="error-state-retry"]')!;
    const spinner = document.querySelector<HTMLElement>('[data-slot="spinner"]')!;
    const skeleton = document.querySelector<HTMLElement>('[data-slot="skeleton"]')!;
    return {
      outline: getComputedStyle(retryButton).outlineStyle,
      skeletonAnimation: getComputedStyle(skeleton).animationDuration,
      spinnerAnimation: getComputedStyle(spinner).animationDuration,
    };
  });
  expect(styles.outline).not.toBe("none");
  expect(styles.spinnerAnimation).toBe("0s");
  expect(styles.skeletonAnimation).toBe("0s");
  await expect(page.locator('[data-slot="status-variant-label"]')).toHaveText("Warning:");
  await expect(page.locator('[data-slot="status-symbol"]')).toHaveText("!");
  expect(await axeViolations(page)).toEqual([]);
  expect(failures).toEqual([]);
  await context.close();
});
