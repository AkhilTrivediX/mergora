import { resolve } from "node:path";

import { expect, test, type Page } from "@playwright/test";

const axePath = resolve(
  import.meta.dirname,
  "../../../packages/test-utils/node_modules/axe-core/axe.min.js",
);

async function openStory(page: Page, id: string): Promise<void> {
  await page.goto(`/iframe.html?viewMode=story&id=kits-billing-subscription-kit--${id}`, {
    waitUntil: "domcontentloaded",
  });
  await expect(page.locator('[data-slot="billing-subscription-kit"]').first()).toBeVisible();
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

test("billing enhancements are absent by default and cancellation requires acknowledgement", async ({
  page,
}) => {
  await openStory(page, "basic-billing-subscription-kit");
  await expect(page.locator('[data-slot="billing-change-preview"]')).toHaveCount(0);
  await expect(page.locator('[data-slot="billing-payment-method"]')).toHaveCount(0);
  await expect(page.locator('[data-slot="billing-cancellation"]')).toHaveCount(0);
  await expect(page.getByRole("button", { name: /^Open /u })).toHaveCount(0);
  expect(await axeViolations(page)).toEqual([]);

  await openStory(page, "recommended-billing-subscription-kit");
  await expect(page.locator('[data-slot="billing-change-preview"]')).toBeVisible();
  await expect(page.locator('[data-slot="billing-payment-method"]')).toBeVisible();
  await page.getByRole("button", { name: "Review cancellation" }).click();
  const confirm = page.getByRole("button", { name: "Request cancellation" });
  await expect(confirm).toBeDisabled();
  await page.getByRole("checkbox", { name: "I understand these effects" }).check();
  await expect(confirm).toBeEnabled();
  await confirm.click();
  await expect(page.getByText("Cancellation requested in the local fixture.")).toBeVisible();
  expect(await axeViolations(page)).toEqual([]);
});

test("uncontrolled and controlled plan selections honor native reset ownership", async ({
  page,
}) => {
  await openStory(page, "billing-form-lifecycle");
  await expect(page.getByRole("radio", { name: /Team/u })).toBeChecked();
  await page.getByRole("radio", { name: /Organization/u }).check();
  await page.getByRole("button", { name: "Reset choice" }).click();
  await expect(page.getByRole("radio", { name: /Team/u })).toBeChecked();

  await openStory(page, "controlled-billing-subscription-kit");
  await page.getByRole("radio", { name: /Team/u }).check();
  await expect(page.getByText("Selected plan ID: team")).toBeVisible();
  await page.getByRole("button", { name: "Reset choice" }).click();
  await expect(page.getByRole("radio", { name: /Starter/u })).toBeChecked();
  await expect(page.getByText("Selected plan ID: starter")).toBeVisible();
  expect(await axeViolations(page)).toEqual([]);
});

test("read-only billing cancels reset and repeated instances own their aria references", async ({
  page,
}) => {
  await openStory(page, "billing-state-matrix");
  const readOnlySection = page.locator('section[aria-labelledby="billing-empty-heading"]');
  const form = readOnlySection.locator('[data-slot="billing-subscription-kit"]');
  const team = form.getByRole("radio", { name: /Team/u });
  await team.evaluate((element) => {
    (element as HTMLInputElement).checked = true;
  });
  await expect(form.getByRole("button", { name: "Reset choice" })).toBeDisabled();
  await form.evaluate((element) => (element as HTMLFormElement).reset());
  await expect(team).toBeChecked();
  await expect(page.locator('[data-slot="billing-readonly-events"]')).toHaveText(
    "Read-only reset events: 0; selection events: 0",
  );

  const idAudit = await page.evaluate(() => {
    const root = [...document.querySelectorAll('[data-slot="billing-subscription-kit"]')];
    const ids = root.flatMap((kit) =>
      [...kit.querySelectorAll<HTMLElement>("[id]")].map((element) => element.id),
    );
    const references = root.flatMap((kit) =>
      [...kit.querySelectorAll<HTMLElement>("[aria-labelledby]")].map((element) =>
        element.getAttribute("aria-labelledby"),
      ),
    );
    return {
      ids,
      missingReferences: references.filter(
        (reference) => reference === null || document.getElementById(reference) === null,
      ),
    };
  });
  expect(new Set(idAudit.ids).size).toBe(idAudit.ids.length);
  expect(idAudit.missingReferences).toEqual([]);
  expect(await axeViolations(page)).toEqual([]);
});

test("plan choice resets natively and invoice overflow stays scoped at narrow forced colors", async ({
  browser,
  browserName,
}) => {
  const context = await browser.newContext({
    forcedColors: "active",
    hasTouch: true,
    reducedMotion: "reduce",
    viewport: { height: 720, width: 320 },
  });
  const page = await context.newPage();
  await openStory(page, "narrow-rtl-billing");
  await page.getByRole("radio", { name: /Team/u }).check();
  await page.getByRole("button", { name: "Reset choice" }).click();
  await expect(page.getByRole("radio", { name: /Starter/u })).toBeChecked();
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth - innerWidth),
  ).toBeLessThanOrEqual(1);
  const touchTarget = await page.getByRole("radio", { name: /Starter/u }).boundingBox();
  expect(touchTarget?.height ?? 0).toBeGreaterThanOrEqual(44);
  expect(await axeViolations(page, { ignoreColorContrast: browserName !== "chromium" })).toEqual(
    [],
  );
  await context.close();
});
