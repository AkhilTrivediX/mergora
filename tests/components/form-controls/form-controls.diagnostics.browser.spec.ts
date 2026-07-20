import { expect, test } from "@playwright/test";

const expectedWarnings = [
  "Mergora Checkbox requires children, a Field label, aria-label, aria-labelledby, or an associated native label.",
  "Mergora CheckboxGroup requires a non-empty visible label.",
  "Mergora CheckboxGroup requires at least one direct CheckboxGroupItem.",
  "Mergora CheckboxGroup selection contains values without direct items: missing.",
  "Mergora Field expects one direct primary control; received 2. Use separate Field instances for additional controls.",
  "Mergora Field requires a non-empty visible label.",
  "Mergora Fieldset requires a non-empty visible legend.",
  'Mergora RadioGroup selection has no direct item for value "missing".',
  "Mergora RadioGroup requires a non-empty visible label.",
  "Mergora RadioGroup requires at least one direct RadioGroupItem.",
  'Mergora RadioGroupItem value "one" requires children, aria-label, or aria-labelledby.',
  "Mergora Switch requires a non-empty visible offLabel.",
  "Mergora Switch requires a non-empty visible onLabel.",
  "Mergora Switch requires children, aria-label, or aria-labelledby.",
] as const;

test("development stories emit every actionable invalid-usage diagnostic", async ({ page }) => {
  const warnings = new Set<string>();
  page.on("console", (message) => {
    if (message.type() === "warning" && message.text().startsWith("Mergora ")) {
      warnings.add(message.text());
    }
  });

  await page.goto("/iframe.html?id=p2-form-controls--invalid-usage-diagnostics&viewMode=story");
  await expect(page.locator('[data-slot="field"]')).toBeVisible();
  await expect
    .poll(() => [...warnings].sort(), { timeout: 10_000 })
    .toEqual([...expectedWarnings].sort());
});
