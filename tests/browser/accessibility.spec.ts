import { persistJsonEvidence } from "./support/evidence.ts";
import { test, expect, loadFixture } from "./support/test.ts";

test("@a11y axe scans default and modal states without waivers", async ({
  browser,
  page,
}, testInfo) => {
  await loadFixture(page);

  const defaultScan = await page.evaluate(() => window.__mergoraEvidence.runAxe());
  expect(defaultScan.assessment.state).toBe("pass");
  expect(defaultScan.result.violations).toEqual([]);

  await page.getByRole("button", { name: "Open merge review" }).click();
  const dialog = page.getByRole("dialog", { name: "Review merge result" });
  await expect(dialog).toBeVisible();
  await page.locator("[data-slot='dialog-overlay']").evaluate(async (overlay) => {
    await Promise.all(
      overlay.getAnimations({ subtree: true }).map((animation) => animation.finished),
    );
  });
  const dialogScan = await page.evaluate(() => window.__mergoraEvidence.runAxe());
  expect(dialogScan.result.violations).toEqual([]);
  expect(dialogScan.assessment.state).toBe("pass");

  const evidence = await persistJsonEvidence(`axe/${testInfo.project.name}/p1-tracer.json`, {
    schemaVersion: 1,
    kind: "automated-axe-run",
    browser: testInfo.project.name,
    browserVersion: browser.version(),
    states: { default: defaultScan, dialogOpen: dialogScan },
    limitations: [
      "Incomplete axe checks remain manual-review inputs rather than automated passes.",
      "Automated axe output does not establish WCAG conformance or manual AT support.",
    ],
  });
  await testInfo.attach("axe-evidence-reference", {
    body: JSON.stringify(evidence, null, 2),
    contentType: "application/json",
  });
});

test("@browser @a11y forced-colors keeps visible system focus", async ({ page }) => {
  await page.emulateMedia({ forcedColors: "active" });
  await loadFixture(page);

  expect(await page.evaluate(() => matchMedia("(forced-colors: active)").matches)).toBe(true);
  const button = page.getByRole("button", { name: "Run evidence check" });
  await button.focus();
  const focusStyle = await button.evaluate((element) => {
    const style = getComputedStyle(element);
    return {
      forcedColorAdjust: style.getPropertyValue("forced-color-adjust"),
      outlineStyle: style.outlineStyle,
      outlineWidth: style.outlineWidth,
      supportsForcedColorAdjust: CSS.supports("forced-color-adjust", "auto"),
    };
  });
  if (focusStyle.supportsForcedColorAdjust) {
    expect(focusStyle.forcedColorAdjust).toBe("auto");
  } else {
    expect(focusStyle.forcedColorAdjust).toBe("");
  }
  expect(focusStyle.outlineStyle).not.toBe("none");
  expect(Number.parseFloat(focusStyle.outlineWidth)).toBeGreaterThanOrEqual(2);
});
