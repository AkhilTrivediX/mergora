import { resolve } from "node:path";

import { expect, test, type Page } from "@playwright/test";

const axePath = resolve(
  import.meta.dirname,
  "../../../packages/test-utils/node_modules/axe-core/axe.min.js",
);

async function openStory(page: Page, id: string): Promise<void> {
  await page.goto(`/iframe.html?viewMode=story&id=kits-authentication-kit--${id}`, {
    waitUntil: "domcontentloaded",
  });
  await expect(page.locator('[data-slot="authentication-kit"]').first()).toBeVisible();
}

async function axeViolations(page: Page): Promise<unknown[]> {
  await page.addScriptTag({ path: axePath });
  return page.evaluate(async () => {
    const axe = (globalThis as unknown as { axe: { run(): Promise<{ violations: unknown[] }> } })
      .axe;
    for (let attempt = 0; attempt < 40; attempt += 1) {
      try {
        return (await axe.run()).violations;
      } catch (error) {
        if (!(error instanceof Error) || !error.message.includes("Axe is already running")) {
          throw error;
        }
        await new Promise((resolveDelay) => setTimeout(resolveDelay, 50));
      }
    }
    throw new Error("Axe did not become available after the Storybook accessibility check.");
  });
}

test("basic and recommended authentication modes keep enhancements independently removable", async ({
  page,
}) => {
  await openStory(page, "basic-authentication-kit");
  await expect(page.locator('[data-slot="authentication-flow-navigation"]')).toHaveCount(0);
  await expect(page.locator('[data-slot="authentication-security-context"]')).toHaveCount(0);
  await expect(page.locator('[data-slot="authentication-rate-limit-recovery"]')).toHaveCount(0);
  expect(await axeViolations(page)).toEqual([]);

  await openStory(page, "recommended-authentication-kit");
  await expect(page.getByRole("navigation", { name: "Account access options" })).toBeVisible();
  await expect(page.locator('[data-slot="authentication-security-context"]')).toBeVisible();
  await page.getByRole("button", { name: "Verification code" }).click();
  await expect(page.getByRole("textbox", { name: "Verification code" })).toBeVisible();
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.getByRole("textbox", { name: "Email address" }).fill("reader@example.test");
  await page.locator('input[name="password"]').fill("local-fixture");
  await page.getByRole("button", { name: "Sign in", exact: true }).last().click();
  await expect(page.locator('[data-slot="authentication-rate-limit-recovery"]')).toContainText(
    "Another attempt",
  );
  await expect(page.getByText("Recovery-ready callbacks: 1")).toBeVisible({ timeout: 5000 });
  expect(await axeViolations(page)).toEqual([]);
});

test("uncontrolled native reset and controlled flow ownership remain deterministic", async ({
  page,
}) => {
  await openStory(page, "authentication-form-lifecycle");
  const email = page.getByRole("textbox", { name: "Email address" });
  const password = page.locator('input[name="password"]');
  await email.fill("reader@example.test");
  await password.fill("local-fixture");
  await page.getByRole("button", { name: "Clear form" }).click();
  await expect(email).toHaveValue("");
  await expect(password).toHaveValue("");

  await openStory(page, "controlled-authentication-kit");
  await expect(page.getByText("Controlled flow: mfa")).toBeVisible();
  await page.getByRole("button", { name: "Recovery code" }).click();
  await expect(page.getByText("Controlled flow: recovery-code")).toBeVisible();
  await page.getByRole("button", { name: "Clear form" }).click();
  await expect(page.getByText("Controlled flow: recovery-code")).toBeVisible();
  expect(await axeViolations(page)).toEqual([]);
});

test("read-only authentication cancels reset without mutating native values", async ({ page }) => {
  await openStory(page, "authentication-state-matrix");
  const readOnlySection = page.locator(
    'section[aria-labelledby="authentication-readonly-heading"]',
  );
  const form = readOnlySection.locator("form");
  const email = form.getByRole("textbox", { name: "Email address" });
  await email.evaluate((element) => {
    (element as HTMLInputElement).value = "preserve@example.test";
  });
  await expect(form.getByRole("button", { name: "Clear form" })).toBeDisabled();
  await form.evaluate((element) => (element as HTMLFormElement).reset());
  await expect(email).toHaveValue("preserve@example.test");
  expect(await axeViolations(page)).toEqual([]);
});

test("narrow RTL, reduced motion, and forced colors preserve the authentication path", async ({
  browser,
}) => {
  const context = await browser.newContext({
    forcedColors: "active",
    hasTouch: true,
    reducedMotion: "reduce",
    viewport: { height: 720, width: 320 },
  });
  const page = await context.newPage();
  await openStory(page, "narrow-rtl-authentication");
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth - innerWidth),
  ).toBeLessThanOrEqual(1);
  await expect(page.locator('[data-slot="authentication-kit"]')).toHaveCSS("direction", "rtl");
  const touchTarget = await page
    .locator('[data-slot="authentication-flow-navigation"] button')
    .first()
    .boundingBox();
  expect(touchTarget?.height ?? 0).toBeGreaterThanOrEqual(44);
  expect(await axeViolations(page)).toEqual([]);
  await context.close();
});
