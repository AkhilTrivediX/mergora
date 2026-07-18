import { test, expect, loadFixture } from "./support/test.ts";

test("@browser @a11y canonical tracers expose semantic, keyboard, and pointer behavior", async ({
  page,
}) => {
  await loadFixture(page);

  const semanticButton = await page.evaluate(() =>
    window.__mergoraEvidence.query({
      kind: "role",
      role: "button",
      options: { name: "Run evidence check" },
    }),
  );
  expect(semanticButton).toEqual({
    dataSlot: "button",
    tagName: "button",
    text: "Run evidence check",
  });

  const evidenceButton = page.getByRole("button", { name: "Run evidence check" });
  await expect(evidenceButton).toMatchAriaSnapshot(`- button "Run evidence check"`);
  await evidenceButton.click();
  await expect(page.getByText("Evidence checks run: 1")).toBeVisible();

  const dialogTrigger = page.getByRole("button", { name: "Open merge review" });
  await dialogTrigger.focus();
  await page.keyboard.press("Enter");
  const dialog = page.getByRole("dialog", { name: "Review merge result" });
  await expect(dialog).toBeVisible();
  await expect(dialog).toMatchAriaSnapshot(`
    - dialog "Review merge result":
      - heading "Review merge result" [level=2]
      - paragraph: The local color edit and upstream focus fix are both preserved.
      - button "Close merge review"
  `);
  expect(
    await page.evaluate(() =>
      document.activeElement instanceof HTMLElement
        ? (document.activeElement.getAttribute("data-slot") ?? document.activeElement.tagName)
        : "none",
    ),
  ).toBe("dialog-close");
  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();
  await expect(dialogTrigger).toBeFocused();

  const explicitTrigger = page.getByRole("button", { name: "Open explicit focus review" });
  await explicitTrigger.focus();
  await page.keyboard.press("Enter");
  await expect(page.getByRole("dialog", { name: "Explicit focus review" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Close explicit focus review" })).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(explicitTrigger).toBeFocused();

  const combobox = page.getByRole("combobox", { name: "Deployment region" });
  await expect(combobox).toHaveValue("Berlin");
  await combobox.fill("Tok");
  const tokyoOption = page.getByRole("option", { name: "Tokyo" });
  await expect(tokyoOption).toBeVisible();
  await combobox.press("ArrowDown");
  await expect(tokyoOption).toHaveAttribute("data-focused");
  await combobox.press("Enter");
  await expect(combobox).toHaveValue("Tokyo");

  const prioritySort = page.getByRole("button", { name: "Priority" });
  await prioritySort.click();
  await expect(page.getByRole("columnheader", { name: /Priority/u })).toHaveAttribute(
    "aria-sort",
    "descending",
  );
  await expect(page.locator("[data-slot='data-grid-row']").first()).toContainText("INC-106");
  await page.getByRole("radio", { name: "Select incident INC-104" }).check();
  await expect(page.getByRole("radio", { name: "Select incident INC-104" })).toBeChecked();
  await expect(page.getByRole("region", { name: /Active incidents/u })).toHaveAttribute(
    "data-maturity",
    "experimental",
  );
});

test("@browser @a11y reduced motion and RTL preserve operation", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await loadFixture(page, "/?dir=rtl&density=touch");

  await expect(page.locator("html")).toHaveAttribute("dir", "rtl");
  expect(
    await page
      .locator("[data-slot='button-pending-indicator']")
      .evaluate((element) => getComputedStyle(element).animationName),
  ).toBe("none");

  await page.getByRole("button", { name: "Show options" }).click();
  const popover = page.locator("[data-slot='combobox-popover']");
  await expect(popover).toBeVisible();
  expect(await popover.evaluate((element) => getComputedStyle(element).animationName)).toBe("none");
  await page.getByRole("option", { name: "Mumbai" }).click();
  await expect(page.getByRole("combobox", { name: "Deployment region" })).toHaveValue("Mumbai");

  await page.getByRole("button", { name: "Incident" }).click();
  await expect(page.getByRole("columnheader", { name: /Incident/u })).toHaveAttribute(
    "aria-sort",
    "ascending",
  );
});
