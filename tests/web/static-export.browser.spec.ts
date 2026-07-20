import { expect, test, type APIRequestContext, type Locator, type Page } from "@playwright/test";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { MERGORA_LOCAL_DATA } from "../../apps/web/src/app/site-local-data";
import { contrastRatio, parseCssColor } from "../../apps/web/src/app/quality-lens-model";
import { resolveStorybookId } from "../../apps/web/src/app/specimen-frame-model";
import type { DocumentationContractItem } from "../../apps/web/src/app/state-lab-model";

const documentationContracts = JSON.parse(
  readFileSync(
    resolve(import.meta.dirname, "../../registry/generated/documentation-contract-index.v1.json"),
    "utf8",
  ),
) as { readonly items: readonly DocumentationContractItem[] };

const axeSource = readFileSync(
  resolve(import.meta.dirname, "../../packages/test-utils/node_modules/axe-core/axe.min.js"),
  "utf8",
);
const siteBase = "http://127.0.0.1:4184";

const criticalRoutes = [
  "/",
  "/components/",
  "/components/button/",
  "/quality/button/",
  "/studio/",
  "/docs/quick-start/",
] as const;

interface RuntimeEvidence {
  readonly consoleErrors: string[];
  readonly failedRequests: string[];
  readonly failingResponses: string[];
  readonly pageErrors: string[];
}

function collectRuntimeEvidence(page: Page): RuntimeEvidence {
  const evidence: RuntimeEvidence = {
    consoleErrors: [],
    failedRequests: [],
    failingResponses: [],
    pageErrors: [],
  };
  page.on("console", (message) => {
    if (message.type() === "error") evidence.consoleErrors.push(message.text());
  });
  page.on("pageerror", (error) => evidence.pageErrors.push(error.message));
  page.on("requestfailed", (request) => {
    evidence.failedRequests.push(`${request.url()} ${request.failure()?.errorText ?? ""}`.trim());
  });
  page.on("response", (response) => {
    if (response.status() >= 400) {
      evidence.failingResponses.push(`${String(response.status())} ${response.url()}`);
    }
  });
  return evidence;
}

async function fetchQualityLabIndex(request: APIRequestContext) {
  // The static server can briefly reset a keep-alive connection after a previous browser has
  // finished. Retrying only that transient transport error keeps this contract meaningful while
  // still surfacing missing files, non-200 responses, and repeated server failures.
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      return await request.get(`${siteBase}/quality-lab/index.json`);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const retryable = /socket hang up|ECONNRESET/i.test(message);
      if (!retryable || attempt === 2) throw error;
      await new Promise((resolveRetry) => setTimeout(resolveRetry, 125 * (attempt + 1)));
    }
  }

  throw new Error("The Quality Lab index request exhausted its retry budget.");
}

async function waitForEmbeddedNetworkIdle(iframe: Locator): Promise<void> {
  // WebKit can defer a lazy iframe indefinitely while only its outer lab is in view. Move the
  // actual preview into the load margin before requiring its exact committed URL and render phase.
  await iframe.scrollIntoViewIfNeeded();
  const source = await iframe.getAttribute("src");
  expect(source, "live specimen iframe should expose its current source").not.toBeNull();
  if (source === null) return;
  const expectedUrl = new URL(source, siteBase).href;
  // A React src update can precede the browser's navigation commit. Polling a fresh frame avoids
  // mistaking the previous document's already-idle state for completion of the requested story.
  await expect
    .poll(async () => {
      const element = await iframe.elementHandle();
      return (await element?.contentFrame())?.url();
    })
    .toBe(expectedUrl);
  const element = await iframe.elementHandle();
  const contentFrame = await element?.contentFrame();
  expect(contentFrame, "live specimen iframe should expose a content frame").not.toBeNull();
  if (contentFrame === null || contentFrame === undefined) return;
  // The pinned Storybook test runtime exposes its current render phase. Network idle alone can
  // precede loaders/afterEach completion, so fail closed until that exact render is finished.
  await expect
    .poll(() =>
      contentFrame.evaluate(() => {
        const preview = (
          globalThis as typeof globalThis & {
            readonly __STORYBOOK_PREVIEW__?: {
              readonly currentRender?: { readonly phase?: unknown };
            };
          }
        ).__STORYBOOK_PREVIEW__;
        return typeof preview?.currentRender?.phase === "string"
          ? preview.currentRender.phase
          : "missing-pinned-storybook-render-phase";
      }),
    )
    .toBe("finished");
  await contentFrame.waitForLoadState("networkidle");
}

async function seriousOrCriticalViolations(page: Page) {
  await page.addScriptTag({ content: axeSource });
  return page.evaluate(async () => {
    interface AxeViolation {
      readonly id: string;
      readonly impact: string | null;
      readonly nodes: readonly {
        readonly failureSummary?: string | undefined;
        readonly target: readonly string[];
      }[];
    }
    interface AxeRuntime {
      run(root: Document, options: object): Promise<{ readonly violations: AxeViolation[] }>;
    }
    const axe = (globalThis as unknown as { readonly axe: AxeRuntime }).axe;
    const result = await axe.run(document, { resultTypes: ["violations"] });
    return result.violations
      .filter(({ impact }) => impact === "serious" || impact === "critical")
      .map(({ id, impact, nodes }) => ({
        id,
        impact,
        targets: nodes.map(({ failureSummary, target }) => ({ failureSummary, target })),
      }));
  });
}

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (typeof value === "object" && value !== null) {
    return Object.fromEntries(
      Object.entries(value)
        .sort(([left], [right]) => left.localeCompare(right, "en-US"))
        .map(([key, child]) => [key, canonicalize(child)]),
    );
  }
  return value;
}

function machineDigest(value: unknown): string {
  return `sha256:${createHash("sha256")
    .update(JSON.stringify(canonicalize(value)))
    .digest("hex")}`;
}

async function expectNativeOptionDisabled(option: Locator): Promise<void> {
  await expect
    .poll(
      () =>
        option.evaluate((element) => ({
          disabledProperty: element instanceof HTMLOptionElement ? element.disabled : undefined,
          disabledPseudoClass: element.matches(":disabled"),
          tagName: element.tagName,
        })),
      { message: "option should have native disabled semantics" },
    )
    .toEqual({
      disabledProperty: true,
      disabledPseudoClass: true,
      tagName: "OPTION",
    });
}

async function expectStudioElementTokenContrast(
  element: Locator,
  backgroundToken: string,
  foregroundToken: string,
): Promise<void> {
  const readColors = () =>
    element.evaluate(
      (target, tokens) => {
        const preview = target.closest<HTMLElement>(".studio-workbench__preview");
        if (preview === null) throw new Error("Studio preview is missing.");
        const previewStyle = getComputedStyle(preview);
        const targetStyle = getComputedStyle(target);
        const normalize = (value: string) => {
          const probe = document.createElement("span");
          probe.style.color = value;
          preview.append(probe);
          const color = getComputedStyle(probe).color;
          probe.remove();
          return color;
        };
        return {
          actualBackground: targetStyle.backgroundColor,
          actualForeground: targetStyle.color,
          expectedBackground: normalize(previewStyle.getPropertyValue(tokens.background).trim()),
          expectedForeground: normalize(previewStyle.getPropertyValue(tokens.foreground).trim()),
        };
      },
      { background: backgroundToken, foreground: foregroundToken },
    );
  await expect
    .poll(async () => {
      const colors = await readColors();
      return {
        backgroundMatches: colors.actualBackground === colors.expectedBackground,
        foregroundMatches: colors.actualForeground === colors.expectedForeground,
      };
    })
    .toEqual({ backgroundMatches: true, foregroundMatches: true });
  const colors = await readColors();
  expect(colors.actualBackground).toBe(colors.expectedBackground);
  expect(colors.actualForeground).toBe(colors.expectedForeground);
  const background = parseCssColor(colors.actualBackground);
  const foreground = parseCssColor(colors.actualForeground);
  expect(background).not.toBeNull();
  expect(foreground).not.toBeNull();
  expect(contrastRatio(foreground!, background!)).toBeGreaterThanOrEqual(4.5);
}

async function expectStudioPreviewContrast(page: Page): Promise<void> {
  const preview = page.locator(".studio-workbench__preview");
  await expectStudioElementTokenContrast(
    preview.getByRole("button", { name: "Run verification" }),
    "--mrg-component-button-primary-background",
    "--mrg-component-button-primary-foreground",
  );
  for (const name of ["Contract", "Browser"] as const) {
    await expectStudioElementTokenContrast(
      preview.getByRole("tab", { name }),
      "--studio-surface",
      "--studio-text",
    );
  }
}

test("critical static routes stay readable and quiet @a11y", async ({ page }) => {
  const evidence = collectRuntimeEvidence(page);
  for (const route of criticalRoutes) {
    const response = await page.goto(route, { waitUntil: "networkidle" });
    expect(response?.status(), route).toBe(200);
    await expect(page.locator("h1"), route).toHaveCount(1);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
      ),
      route,
    ).toBeLessThanOrEqual(1);
    expect(await seriousOrCriticalViolations(page), route).toEqual([]);
  }
  expect(evidence).toEqual({
    consoleErrors: [],
    failedRequests: [],
    failingResponses: [],
    pageErrors: [],
  });
});

test("dense API references load on demand without weakening the documentation route", async ({
  page,
}) => {
  const evidence = collectRuntimeEvidence(page);
  const response = await page.goto("/systems/data-grid/", { waitUntil: "networkidle" });

  expect(response?.status()).toBe(200);
  const control = page.getByRole("button", { name: "Load complete API reference" });
  await expect(control).toBeVisible();
  await expect(page.getByText("DataGridProps declared prop reference")).toHaveCount(0);

  await control.click();
  await expect(page.getByRole("heading", { name: "Generated source anatomy" })).toBeVisible();
  await expect(page.getByText("DataGridProps declared prop reference")).toBeVisible();
  expect(await seriousOrCriticalViolations(page)).toEqual([]);
  expect(evidence).toEqual({
    consoleErrors: [],
    failedRequests: [],
    failingResponses: [],
    pageErrors: [],
  });
});

test("blocked Quality Passport keeps human, machine, and print evidence in parity @a11y", async ({
  page,
  request,
}) => {
  const response = await request.get(`${siteBase}/m/v1/passports/button.json`);
  expect(response.status()).toBe(200);
  const machine = (await response.json()) as {
    readonly displayName: string;
    readonly evidenceVocabulary: readonly { readonly state: string }[];
    readonly generatedDigest: string;
    readonly id: string;
    readonly links: { readonly immutableJson: null; readonly machineJson: string };
    readonly manualReview: { readonly lastReviewed: null; readonly status: string };
    readonly overall: {
      readonly aggregateState: string;
      readonly evidenceState: string;
      readonly releaseGateResult: string;
    };
    readonly publicationStatus: string;
    readonly releaseIdentity: {
      readonly evidenceDigest: null;
      readonly release: null;
      readonly sourceDigest: null;
    };
    readonly sections: readonly {
      readonly id: string;
      readonly rows: readonly {
        readonly evidenceReferences: readonly unknown[];
        readonly state: string;
      }[];
      readonly title: string;
    }[];
  };
  const { generatedDigest, ...content } = machine;
  expect(generatedDigest).toBe(machineDigest(content));
  expect(machine).toMatchObject({
    id: "button",
    links: { immutableJson: null },
    manualReview: { lastReviewed: null, status: "not-yet-verified" },
    overall: {
      aggregateState: "Blocked",
      evidenceState: "Not tested",
      releaseGateResult: "Blocked",
    },
    publicationStatus: "blocked-unreleased",
    releaseIdentity: { evidenceDigest: null, release: null, sourceDigest: null },
  });
  expect(machine.sections).toHaveLength(11);
  expect(
    machine.sections.flatMap(({ rows }) => rows).every(({ state }) => state === "Not tested"),
  ).toBe(true);
  expect(
    machine.sections
      .flatMap(({ rows }) => rows)
      .every(({ evidenceReferences }) => evidenceReferences.length === 0),
  ).toBe(true);

  await page.setViewportSize({ height: 844, width: 320 });
  await page.goto("/quality/button/", { waitUntil: "networkidle" });
  const passport = page.locator("main.passport-page");
  await expect(passport).toHaveAttribute("data-passport-id", machine.id);
  await expect(passport).toHaveAttribute("data-passport-digest", generatedDigest);
  await expect(passport).toHaveAttribute(
    "data-passport-publication-status",
    machine.publicationStatus,
  );
  await expect(page.locator("[data-passport-overall]")).toHaveAttribute(
    "data-passport-overall",
    machine.overall.releaseGateResult,
  );
  await expect(page.locator("[data-passport-machine]")).toHaveAttribute(
    "data-passport-machine",
    machine.links.machineJson,
  );
  expect(await page.locator("[data-passport-section]").count()).toBe(11);
  expect(await page.locator("[data-passport-section] h3").allTextContents()).toEqual(
    machine.sections.map(({ title }) => title),
  );
  expect(await page.locator("[data-passport-state='Not tested']").count()).toBe(11);
  expect(await page.locator("[data-passport-vocabulary-state]").allTextContents()).toEqual(
    machine.evidenceVocabulary.map(({ state }) => state),
  );
  await expect(
    page.getByText("Immutable JSON unavailable until a release passes its gates"),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    ),
  ).toBeLessThanOrEqual(1);
  expect(
    await page
      .locator(".passport-page__table-wrap")
      .first()
      .evaluate((element) => element.scrollWidth > element.clientWidth),
  ).toBe(true);
  expect(await seriousOrCriticalViolations(page)).toEqual([]);

  await page.emulateMedia({ media: "print" });
  await expect(page.locator(".passport-page__table-wrap").first()).toHaveCSS(
    "overflow-x",
    "visible",
  );
  await expect(page.locator(".passport-page__command")).toHaveCSS("white-space", "pre-wrap");
});

test("plain internal links navigate without route-tree requests", async ({ page }) => {
  const evidence = collectRuntimeEvidence(page);
  const requested: string[] = [];
  page.on("request", (request) => requested.push(request.url()));
  await page.goto("/", { waitUntil: "networkidle" });
  const installation = page.getByRole("link", { name: "Install Mergora" });
  await expect(installation).toHaveAttribute("href", "/docs/installation");
  await installation.click();
  await page.waitForURL(/\/docs\/installation\/?$/u);
  await page.waitForLoadState("networkidle");
  await expect(page.locator("h1")).toHaveText("Installation and distribution modes");
  expect(requested.filter((url) => url.includes("__next.") || url.endsWith(".txt"))).toEqual([]);
  expect(evidence).toEqual({
    consoleErrors: [],
    failedRequests: [],
    failingResponses: [],
    pageErrors: [],
  });
});

test("homepage production specimen filters, selects, and restores dialog focus @a11y", async ({
  page,
}) => {
  await page.setViewportSize({ height: 844, width: 390 });
  await page.goto("/", { waitUntil: "networkidle" });
  const specimen = page.locator(".homepage-production-specimen");
  await specimen.scrollIntoViewIfNeeded();

  await specimen.getByRole("button", { name: "Show evidence views" }).click();
  await page
    .getByRole("option")
    .filter({ hasText: /^Systems/u })
    .click();
  await expect(specimen.getByText("2 entries in this view", { exact: true })).toBeVisible();
  await expect(specimen.locator('[data-slot="data-grid-row"]')).toHaveCount(2);

  await specimen.getByRole("radio", { name: "Inspect Data Grid evidence" }).check();
  await expect(specimen.locator('[data-slot="data-grid-selection-summary"]')).toContainText(
    "Selected Data Grid. Parity verified; maturity not ready.",
  );

  const inspect = specimen.getByRole("button", { name: "Inspect selected evidence" });
  await inspect.click();
  const dialog = page.getByRole("dialog", { name: "Data Grid evidence checkpoint" });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByText("Verified", { exact: true }).first()).toBeVisible();
  await expect(dialog.getByText("Not ready", { exact: true })).toBeVisible();
  await expect(dialog.getByText("Not verified", { exact: true })).toHaveCount(0);
  await dialog.getByRole("button", { name: "Return to evidence table" }).click();
  await expect(dialog).toHaveCount(0);
  await expect(inspect).toBeFocused();

  await specimen.getByRole("button", { name: "Preview RTL" }).click();
  await expect(specimen.locator(".homepage-production-specimen__workbench")).toHaveAttribute(
    "data-direction",
    "rtl",
  );
  await specimen.getByRole("button", { name: "Touch density" }).click();
  await expect(specimen.locator(".homepage-production-specimen__workbench")).toHaveAttribute(
    "data-density",
    "touch",
  );
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    ),
  ).toBeLessThanOrEqual(1);
  expect(await seriousOrCriticalViolations(page)).toEqual([]);
});

test("component docs resolve Basic and Recommended live specimens", async ({ page, request }) => {
  const evidence = collectRuntimeEvidence(page);
  const buttonContract = documentationContracts.items.find(({ id }) => id === "button");
  expect(buttonContract, "Button documentation contract should exist").toBeDefined();
  if (buttonContract === undefined) return;
  const indexResponse = await fetchQualityLabIndex(request);
  expect(indexResponse.status()).toBe(200);
  const recommendedStoryId = resolveStorybookId(
    await indexResponse.json(),
    buttonContract.storybook.recommended,
  );
  expect(recommendedStoryId).not.toBeNull();
  if (recommendedStoryId === null) return;

  await page.goto("/components/button/", { waitUntil: "networkidle" });
  const specimen = page.locator(".specimen-frame");
  await specimen.scrollIntoViewIfNeeded();
  await specimen.getByRole("button", { exact: true, name: "Load live specimen" }).click();
  const iframe = specimen.locator("iframe");
  await expect(iframe).toBeVisible();
  const frame = page.frameLocator(".specimen-frame iframe");
  await expect(frame.getByRole("heading", { name: "Save changes" })).toBeVisible();
  await expect(
    frame.getByRole("button", { exact: true, name: "Save changes" }),
  ).not.toHaveAttribute("aria-busy");
  await waitForEmbeddedNetworkIdle(iframe);

  await specimen.getByRole("radio", { name: "Recommended Mergora" }).check();
  await expect(frame.getByRole("heading", { name: "Save changes" })).toBeVisible();
  await expect(frame.getByRole("button", { exact: true, name: "Saving changes" })).toHaveAttribute(
    "aria-busy",
    "true",
  );
  await waitForEmbeddedNetworkIdle(iframe);

  await specimen.getByLabel("Direction").selectOption("rtl");
  await expect(frame.locator("html")).toHaveAttribute("dir", "rtl");
  await waitForEmbeddedNetworkIdle(iframe);
  await specimen.getByLabel("Canvas width").selectOption("mobile");
  const bounds = await iframe.boundingBox();
  expect(bounds?.width).toBeGreaterThanOrEqual(300);
  expect(bounds?.width).toBeLessThanOrEqual(390);
  await waitForEmbeddedNetworkIdle(iframe);

  const sourceBeforeReset = await iframe.getAttribute("src");
  expect(sourceBeforeReset).not.toBeNull();
  if (sourceBeforeReset === null) return;
  const storyButtonBeforeReset = await frame
    .getByRole("button", { exact: true, name: "Saving changes" })
    .elementHandle();
  expect(storyButtonBeforeReset).not.toBeNull();
  if (storyButtonBeforeReset === null) return;
  const resetControl = specimen.getByRole("button", { exact: true, name: "Reset example" });
  await resetControl.evaluate((element) => {
    const button = element as HTMLButtonElement;
    const states: {
      readonly ariaBusy: string | null;
      readonly disabled: boolean;
      readonly label: string;
    }[] = [];
    const record = () =>
      states.push({
        ariaBusy: button.getAttribute("aria-busy"),
        disabled: button.disabled,
        label: button.textContent?.trim() ?? "",
      });
    const observer = new MutationObserver(record);
    observer.observe(button, { attributes: true, childList: true, subtree: true });
    record();
    (
      globalThis as typeof globalThis & {
        __MERGORA_RESET_EVIDENCE__?: {
          readonly observer: MutationObserver;
          readonly states: typeof states;
        };
      }
    ).__MERGORA_RESET_EVIDENCE__ = { observer, states };
  });

  await resetControl.click();
  await expect
    .poll(() => storyButtonBeforeReset.evaluate((element) => element.isConnected))
    .toBe(false);
  await expect(iframe).toHaveAttribute("src", sourceBeforeReset);
  await expect(frame.getByRole("button", { exact: true, name: "Saving changes" })).toHaveAttribute(
    "aria-busy",
    "true",
  );
  await waitForEmbeddedNetworkIdle(iframe);
  await expect(specimen.getByRole("button", { exact: true, name: "Reset example" })).toBeEnabled();
  await expect(
    specimen.getByRole("button", { exact: true, name: "Reset example" }),
  ).not.toHaveAttribute("aria-busy");
  const resetStates = await page.evaluate(() => {
    const evidence = (
      globalThis as typeof globalThis & {
        __MERGORA_RESET_EVIDENCE__?: {
          readonly observer: MutationObserver;
          readonly states: readonly {
            readonly ariaBusy: string | null;
            readonly disabled: boolean;
            readonly label: string;
          }[];
        };
      }
    ).__MERGORA_RESET_EVIDENCE__;
    evidence?.observer.disconnect();
    return evidence?.states ?? [];
  });
  expect(resetStates).toContainEqual({
    ariaBusy: "true",
    disabled: true,
    label: "Resetting example",
  });
  expect(resetStates.at(-1)).toEqual({
    ariaBusy: null,
    disabled: false,
    label: "Reset example",
  });
  const qualityLabHref = await specimen
    .getByRole("link", { name: "Open controls in Quality Lab" })
    .getAttribute("href");
  expect(qualityLabHref).not.toBeNull();
  if (qualityLabHref === null) return;
  expect(new URL(qualityLabHref, siteBase).searchParams.get("path")).toBe(
    `/story/${recommendedStoryId}`,
  );
  expect(evidence).toEqual({
    consoleErrors: [],
    failedRequests: [],
    failingResponses: [],
    pageErrors: [],
  });
});

test("State Lab resolves exact state pointers and keeps URL controls deterministic", async ({
  page,
  request,
}) => {
  const buttonContract = documentationContracts.items.find(({ id }) => id === "button");
  const disabledState = buttonContract?.stateApplicability.states.find(
    ({ id }) => id === "disabled",
  );
  const emptyState = buttonContract?.stateApplicability.states.find(({ id }) => id === "empty");
  expect(disabledState?.story).not.toBeNull();
  if (disabledState?.story === null || disabledState?.story === undefined) return;
  const indexResponse = await fetchQualityLabIndex(request);
  expect(indexResponse.status()).toBe(200);
  const expectedStoryId = resolveStorybookId(await indexResponse.json(), disabledState.story);
  expect(expectedStoryId).not.toBeNull();

  await page.goto(
    "/components/button/?labItem=button&labStory=state&labState=disabled&labTheme=dark&labContrast=forced-colors&labDensity=touch&labDirection=rtl&labMotion=reduced&labViewport=narrow",
    { waitUntil: "networkidle" },
  );
  const lab = page.locator(".state-lab");
  await lab.scrollIntoViewIfNeeded();
  await expect(lab).toHaveAttribute("data-state-inventory-status", "available");
  await expect(lab).toHaveAttribute("data-selected-story", "state:disabled");
  await expect(lab.getByLabel("Direction")).toHaveValue("rtl");
  await expect(lab.getByLabel("Motion")).toHaveValue("reduced");
  await expect(lab.getByLabel("Canvas width")).toHaveValue("narrow");
  await expect(lab.locator("#state-lab-state-disabled")).toHaveAttribute(
    "data-story-status",
    "validated-source-export",
  );
  await expect(lab.locator("#state-lab-state-disabled code")).toHaveText(
    `${disabledState.story.modulePath}#${disabledState.story.exportName}`,
  );

  const iframe = lab.locator("iframe");
  await expect(iframe).toHaveAttribute("src", new RegExp(`id=${expectedStoryId}`, "u"));
  await expect(iframe).toHaveAttribute(
    "sandbox",
    "allow-forms allow-modals allow-same-origin allow-scripts",
  );
  await waitForEmbeddedNetworkIdle(iframe);

  await lab.getByLabel("Theme").selectOption("light");
  await expect(page).toHaveURL(/labTheme=light/u);
  await lab.getByRole("button", { name: "Reset State Lab" }).click();
  await expect(lab).toHaveAttribute("data-selected-story", "basic");
  await expect(page).toHaveURL(/labStory=basic/u);
  await expect(page).toHaveURL(/labDirection=ltr/u);

  await lab.getByRole("link", { exact: true, name: "Empty" }).click();
  await expect(lab).toHaveAttribute("data-selected-story", "state:empty");
  await expect(lab.getByText("Preview unavailable", { exact: true })).toBeVisible();
  await expect(
    lab
      .locator(".state-lab__preview-status")
      .getByText(emptyState?.rationale ?? "missing rationale", { exact: true }),
  ).toBeVisible();
  await expect(lab.locator("iframe")).toHaveCount(0);

  await page.goto("/systems/combobox/#state-lab", { waitUntil: "networkidle" });
  const unavailableLab = page.locator(".state-lab");
  await expect(unavailableLab).toHaveAttribute("data-state-inventory-status", "unavailable");
  await expect(
    unavailableLab.getByText("State inventory unavailable", { exact: true }),
  ).toBeVisible();
  await expect(unavailableLab.locator(".state-lab__inventory > ul")).toHaveCount(0);
});

test("State Lab retains static state evidence without scripts", async ({ browser }) => {
  const context = await browser.newContext({
    javaScriptEnabled: false,
    reducedMotion: "reduce",
    viewport: { height: 844, width: 320 },
  });
  const page = await context.newPage();
  await page.goto(`${siteBase}/components/button/#state-lab`, { waitUntil: "load" });
  const lab = page.locator(".state-lab");
  await expect(lab).toHaveAttribute("data-state-inventory-status", "available");
  await expect(lab.locator("#state-lab-state-disabled code")).toContainText(
    "apps/storybook/src/Button.stories.tsx#Disabled",
  );
  await expect(lab.locator("#state-lab-state-empty p")).toContainText(
    "An unnamed empty button is invalid usage",
  );
  await expect(lab.locator("#state-lab-state-disabled a")).toHaveAttribute(
    "href",
    /labState=disabled/u,
  );
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    ),
  ).toBeLessThanOrEqual(1);
  await context.close();
});

test("global search loads on intent, ranks results, and restores focus @a11y", async ({ page }) => {
  const searchRequests: string[] = [];
  page.on("request", (request) => {
    if (new URL(request.url()).pathname.endsWith("/search-index.json")) {
      searchRequests.push(request.url());
    }
  });
  await page.goto("/components/", { waitUntil: "networkidle" });
  expect(searchRequests).toEqual([]);

  const catalogSearch = page.getByRole("searchbox", { name: "Search this catalog" });
  await catalogSearch.focus();
  await page.keyboard.press("Control+K");
  await expect(page.getByRole("dialog", { name: "Search Mergora" })).toHaveCount(0);
  expect(searchRequests).toEqual([]);

  await page.evaluate(() => {
    window.dispatchEvent(
      new KeyboardEvent("keydown", {
        bubbles: true,
        ctrlKey: true,
        isComposing: true,
        key: "k",
      }),
    );
  });
  await expect(page.getByRole("dialog", { name: "Search Mergora" })).toHaveCount(0);
  expect(searchRequests).toEqual([]);

  await page.getByRole("button", { name: "Open Menu and Preferences" }).click();
  const shellDrawer = page.getByRole("dialog", { name: "Navigation and preferences" });
  const trigger = shellDrawer.getByRole("button", { name: "Search catalog" });
  await trigger.click();
  const dialog = page.getByRole("dialog", { name: "Search Mergora" });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole("combobox")).toBeFocused();
  await expect.poll(() => searchRequests.length).toBe(1);
  expect(new URL(searchRequests[0]!).searchParams.get("v")).toMatch(/^sha256:[0-9a-f]{64}$/u);
  await page.keyboard.press("Escape");
  await expect(dialog).toHaveCount(0);
  await expect(trigger).toBeFocused();

  await page.keyboard.press("Control+K");
  await expect(dialog).toBeVisible();
  const searchbox = dialog.getByRole("combobox", {
    name: "Search components, APIs, docs, and tools",
  });
  await searchbox.fill("a query that cannot match the catalog");
  await expect(
    dialog.getByRole("option", { name: /Browse the full component catalog/u }),
  ).toBeVisible();
  await expect(page.locator(".site-visually-hidden")).toHaveText(
    "No matching result. Recovery options are available.",
  );
  expect(await seriousOrCriticalViolations(page)).toEqual([]);

  await searchbox.fill("slider");
  const slider = dialog
    .getByRole("option")
    .filter({ hasText: /^Slider/u })
    .first();
  await expect(slider).toBeVisible();
  await slider.click();
  await page.waitForURL(/\/components\/slider\/?$/u);
  await expect(page.locator("h1")).toContainText("Slider");
  expect(searchRequests).toHaveLength(1);
});

test("global search rejects stale bytes and exposes a bounded retry path", async ({ page }) => {
  let attempts = 0;
  await page.route(/\/search-index\.json(?:\?.*)?$/u, async (route) => {
    attempts += 1;
    if (attempts === 1) {
      const original = await route.fetch();
      const body = (await original.json()) as Record<string, unknown>;
      await route.fulfill({
        json: { ...body, digest: `sha256:${"0".repeat(64)}` },
        response: original,
      });
      return;
    }
    await route.continue();
  });
  await page.goto("/", { waitUntil: "networkidle" });
  await page.keyboard.press("Control+K");
  const dialog = page.getByRole("dialog", { name: "Search Mergora" });
  await expect(dialog.getByRole("alert")).toContainText(
    "The search index failed its integrity check. Retry after refreshing the page.",
  );
  await dialog.getByRole("button", { name: "Retry" }).click();
  await expect(dialog.getByRole("alert")).toHaveCount(0);
  await dialog.getByRole("combobox").fill("slider");
  await expect(
    dialog
      .getByRole("option")
      .filter({ hasText: /^Slider/u })
      .first(),
  ).toBeVisible();
  expect(attempts).toBe(2);
});

test("mobile navigation contains focus and keeps preferences and reset local @a11y", async ({
  browser,
}) => {
  test.slow();
  const context = await browser.newContext({
    colorScheme: "light",
    reducedMotion: "reduce",
    viewport: { height: 568, width: 320 },
  });
  const page = await context.newPage();
  await page.goto(`${siteBase}/components/`, { waitUntil: "networkidle" });
  const trigger = page.getByRole("button", { name: "Open Menu and Preferences" });
  await trigger.click();

  const drawer = page.getByRole("dialog", { name: "Navigation and preferences" });
  await expect(drawer).toBeVisible();
  await expect(page.locator("#site-application-root")).toHaveAttribute("inert", "");
  await expect(page.locator("html")).toHaveAttribute("data-site-drawer-open", "true");
  expect(
    await drawer.evaluate((node) => node.contains(document.activeElement)),
    "modal focus should start inside the drawer",
  ).toBe(true);
  await expect(drawer.getByRole("link", { exact: true, name: "Components" })).toHaveAttribute(
    "aria-current",
    "page",
  );
  expect(await page.evaluate(() => getComputedStyle(document.documentElement).overflow)).toBe(
    "hidden",
  );

  await drawer.getByLabel("Site theme").selectOption("dark");
  await drawer.getByLabel("Interface density").selectOption("compact");
  await drawer.getByLabel("Layout direction").selectOption("rtl");
  await drawer.getByLabel("Motion").selectOption("reduced");
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await expect(page.locator("html")).toHaveAttribute("data-density", "compact");
  await expect(page.locator("html")).toHaveAttribute("dir", "rtl");
  await expect(page.locator("html")).toHaveAttribute("data-motion", "reduced");
  expect(await drawer.evaluate((node) => getComputedStyle(node).direction)).toBe("rtl");

  for (let index = 0; index < 24; index += 1) {
    await page.keyboard.press("Tab");
    expect(
      await drawer.evaluate((node) => node.contains(document.activeElement)),
      `focus escaped the modal after tab ${String(index + 1)}`,
    ).toBe(true);
  }
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    ),
  ).toBeLessThanOrEqual(1);
  expect(await seriousOrCriticalViolations(page)).toEqual([]);

  await page.keyboard.press("Escape");
  await expect(drawer).toHaveCount(0);
  await expect(trigger).toBeFocused();
  await expect(page.locator("#site-application-root")).not.toHaveAttribute("inert", "");
  await expect(page.locator("html")).not.toHaveAttribute("data-site-drawer-open", "true");

  await page.evaluate(() => window.localStorage.setItem("unrelated.product.key", "keep"));
  await page.reload({ waitUntil: "networkidle" });
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await expect(page.locator("html")).toHaveAttribute("data-density", "compact");
  await expect(page.locator("html")).toHaveAttribute("dir", "rtl");
  await expect(page.locator("html")).toHaveAttribute("data-motion", "reduced");

  await page.getByRole("button", { name: "Open Menu and Preferences" }).click();
  const restoredDrawer = page.getByRole("dialog", { name: "Navigation and preferences" });
  await restoredDrawer.getByRole("button", { name: "Review local data reset" }).click();
  const reset = restoredDrawer.getByRole("group", { name: "Confirm local data reset" });
  await expect(reset.locator("code")).toHaveCount(MERGORA_LOCAL_DATA.length);
  for (const { key } of MERGORA_LOCAL_DATA) await expect(reset.getByText(key)).toBeVisible();
  await reset.getByRole("button", { name: "Clear listed local data" }).click();
  await expect(restoredDrawer.getByRole("status")).toContainText(
    `${String(MERGORA_LOCAL_DATA.length)} documented local keys were cleared`,
  );
  expect(
    await page.evaluate(
      (keys) => keys.map((key) => window.localStorage.getItem(key)),
      MERGORA_LOCAL_DATA.map(({ key }) => key),
    ),
  ).toEqual(MERGORA_LOCAL_DATA.map(() => null));
  expect(await page.evaluate(() => window.localStorage.getItem("unrelated.product.key"))).toBe(
    "keep",
  );
  await page.keyboard.press("Escape");
  await page.setViewportSize({ height: 800, width: 1280 });
  await expect(page.getByRole("navigation", { name: "Primary" })).toBeVisible();
  await expect(page.getByText("Preferences", { exact: true })).toBeVisible();
  await expect(page.getByText("Menu", { exact: true })).toBeHidden();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    ),
  ).toBeLessThanOrEqual(1);
  await context.close();
});

test("site theme follows system preference and preserves explicit overrides", async ({ page }) => {
  await page.emulateMedia({ colorScheme: "dark" });
  await page.goto("/", { waitUntil: "networkidle" });
  await page.getByRole("button", { name: "Open Menu and Preferences" }).click();
  const shellDrawer = page.getByRole("dialog", { name: "Navigation and preferences" });
  const theme = shellDrawer.getByLabel("Site theme");

  await expect(theme).toHaveValue("system");
  await expect(page.locator("html")).not.toHaveAttribute("data-theme");
  await expect(page.locator("html")).toHaveAttribute("data-theme-preference", "system");

  await theme.selectOption("light");
  await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
  await expect(page.locator("html")).toHaveAttribute("data-theme-preference", "light");
  expect(await page.evaluate(() => window.localStorage.getItem("mergora.site.theme.v1"))).toBe(
    "light",
  );

  await page.reload({ waitUntil: "networkidle" });
  await page.getByRole("button", { name: "Open Menu and Preferences" }).click();
  await expect(theme).toHaveValue("light");
  await expect(page.locator("html")).toHaveAttribute("data-theme", "light");

  await theme.selectOption("system");
  await expect(page.locator("html")).not.toHaveAttribute("data-theme");
  await page.emulateMedia({ colorScheme: "light" });
  await expect(page.locator("html")).toHaveAttribute("data-theme-preference", "system");

  await page.goto("/studio/", { waitUntil: "networkidle" });
  const studio = page.locator(".studio-workbench__controls");
  await expect(page.locator("html")).not.toHaveAttribute("data-theme");
  await studio.getByLabel("Token category").selectOption("shape");
  await studio.getByLabel(/Surface radius/u).fill("9");
  await expect(page.locator("html")).not.toHaveAttribute("data-theme");
  await studio.getByLabel("Theme").selectOption("dark");
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  expect(await page.evaluate(() => window.localStorage.getItem("mergora.site.theme.v1"))).toBe(
    "dark",
  );
  await page.evaluate(async () => {
    await Promise.all(
      document.getAnimations().map((animation) => animation.finished.catch(() => undefined)),
    );
  });
  expect(await seriousOrCriticalViolations(page)).toEqual([]);
});

test("catalog filtering and install basket remain understandable", async ({ page }) => {
  await page.goto("/components/", { waitUntil: "networkidle" });
  const results = page.locator("#install-basket output");
  const initial = Number.parseInt((await results.textContent()) ?? "0", 10);
  await page.getByRole("searchbox", { name: "Search this catalog" }).fill("slider");
  await expect(results).not.toHaveText(`${String(initial)} results`);
  await expect(results).toContainText(/results?/u);
  await expect(page).toHaveURL(/\?q=slider$/u);
  const filtered = Number.parseInt((await results.textContent()) ?? "0", 10);
  expect(filtered).toBeGreaterThan(0);
  expect(filtered).toBeLessThan(initial);
  const layer = page.getByLabel("Layer");
  await layer.selectOption("component");
  await expect(page).toHaveURL(/layer=component/u);
  await page.goBack();
  await expect(layer).toHaveValue("all");
  await expect(page.getByRole("searchbox", { name: "Search this catalog" })).toHaveValue("slider");
  const add = page.getByRole("button", { name: "Add to install" }).first();
  await add.click();
  const remove = page.getByRole("button", { name: "Remove from install" }).first();
  await expect(remove).toHaveAttribute("aria-pressed", "true");
  await expect(page.locator(".site-basket-link")).toHaveAttribute(
    "aria-label",
    "Install basket, 1 item",
  );
  await expect(page.locator("#install-basket span")).toContainText("1 direct");
  await expectNativeOptionDisabled(
    page.getByLabel("Distribution mode").locator('option[value="package"]'),
  );
  await expect(
    page.getByText(/Package mode requires an exact verified release file/u),
  ).toBeVisible();
  await page.getByLabel("Package manager").selectOption("npm");
  await page.getByLabel("Framework profile").selectOption("vite-react");
  await expect(page.locator(".catalog-browser__plan-command code")).toContainText(
    "npx --yes mergora@0.0.0",
  );
  await expect(page.locator(".catalog-browser__plan-command code")).toContainText(
    "--mode source --package-manager npm --plan",
  );
  await expect(page.locator(".catalog-browser__plan-command code")).not.toContainText(
    "--framework",
  );
  await page.getByRole("button", { name: "Create checked share link" }).click();
  await expect(page).toHaveURL(/#basket\.v2\.[A-Za-z0-9_-]+\.[0-9a-f]{8}$/u);
  await page.evaluate(() => window.localStorage.removeItem("mergora.install-basket.v2"));
  await page.reload({ waitUntil: "networkidle" });
  await expect(
    page.getByText("The checked install basket from this link has been restored."),
  ).toBeVisible();
  await expect(page.getByLabel("Distribution mode")).toHaveValue("source");
  await expect(page.getByLabel("Package manager")).toHaveValue("npm");
  await expect(page.locator("#install-basket span")).toContainText("1 direct");
  await page.evaluate(() => {
    const last = window.location.hash.at(-1);
    window.location.hash = `${window.location.hash.slice(0, -1)}${last === "0" ? "1" : "0"}`;
  });
  await page.reload({ waitUntil: "networkidle" });
  await expect(page.getByText(/install-basket link is invalid/u)).toBeVisible();
  await expect(page.locator("#install-basket span")).toContainText("1 direct");
});

test("source-only kits cannot produce a misleading package plan", async ({ page }) => {
  await page.goto("/kits/", { waitUntil: "networkidle" });
  const mode = page.getByLabel("Distribution mode");
  await expectNativeOptionDisabled(mode.locator('option[value="package"]'));
  await page.getByRole("searchbox", { name: "Search this catalog" }).fill("authentication kit");

  const kit = page
    .locator(".catalog-browser__results > li")
    .filter({ has: page.getByRole("heading", { name: "Authentication Kit" }) });
  await expect(kit.getByText("Source only", { exact: true })).toBeVisible();
  await kit.getByRole("button", { name: "Add to install" }).click();

  await expect(mode).toHaveValue("source");
  await expect(mode.locator('option[value="package"]')).toHaveAttribute("disabled", "");
  await expect(page.locator(".catalog-browser__plan-command code")).toContainText(
    "add authentication-kit --mode source",
  );
});

test("Studio shares checked state and recovers invalid fragments", async ({ page }) => {
  await page.goto("/studio/", { waitUntil: "networkidle" });
  const controls = page.locator(".studio-workbench__controls");
  await expectStudioPreviewContrast(page);
  await controls.getByLabel("Theme").selectOption("enhanced");
  await expectStudioPreviewContrast(page);
  await controls.getByLabel("Token category").selectOption("shape");
  await controls.getByLabel(/Surface radius/u).fill("12");
  await controls.getByRole("button", { name: "Share checked state" }).click();
  await expect(page).toHaveURL(/#studio\.v2\.[A-Za-z0-9_-]+\.[0-9a-f]{8}$/u);
  await page.evaluate(() => {
    window.location.hash = "invalid";
  });
  await expect(page.locator(".studio-workbench__recovery")).toContainText(
    "Safe defaults were restored",
  );
  await expect(controls.getByLabel("Theme")).toHaveValue("light");
  await expect(controls.getByLabel(/Surface radius/u)).toHaveValue("8");

  await controls.getByLabel("Token category").selectOption("color");
  const actionBackground = controls.getByRole("textbox", { name: "Action background" });
  await actionBackground.fill("#ffffff");
  await actionBackground.blur();
  await expect(page.getByText(/below the 4\.5:1 threshold/u)).toBeVisible();
  await expect(page.getByRole("button", { name: "Copy export" })).toBeDisabled();
  await controls.getByRole("button", { name: "Reset Action background" }).click();
  await expect(page.getByRole("button", { name: "Copy export" })).toBeEnabled();

  await controls.getByLabel("Token category").selectOption("shape");
  await controls.getByLabel("Motion preference").selectOption("reduced");
  await expect(page.getByText(/remains spatially significant in reduced mode/u)).toBeVisible();
  await expect(page.getByRole("button", { name: "Copy export" })).toBeDisabled();
  await page.getByLabel("Acknowledge the listed custom-preset warnings in export metadata").check();
  await expect(page.getByRole("button", { name: "Copy export" })).toBeEnabled();

  await controls.getByLabel("Token category").selectOption("context");
  await controls.getByLabel("Viewport").selectOption("narrow");
  await controls.getByLabel("Direction").selectOption("rtl");
  await controls.getByLabel("Locale").selectOption("ar-EG");
  await controls.getByLabel(/Forced-colors simulation/u).check();
  const preview = page.locator(".studio-workbench__preview");
  await expect(preview).toHaveAttribute("dir", "rtl");
  await expect(preview).toHaveAttribute("lang", "ar-EG");
  await expect(preview).toHaveAttribute("data-viewport", "narrow");
  await expect(preview).toHaveAttribute("data-forced-colors", "true");
  expect(await seriousOrCriticalViolations(page)).toEqual([]);
});

test("Quality Lens layers evidence without taking over the specimen", async ({ page }) => {
  await page.goto("/", { waitUntil: "networkidle" });
  const trigger = page.getByRole("button", { name: "Open Quality Lens" });
  await trigger.click();
  await expect(page.getByRole("group", { name: "Inspection layers" })).toBeVisible();
  await expect(page.getByLabel("Focus order")).toBeChecked();
  await expect(page.getByLabel("Accessible names")).not.toBeChecked();
  await expect(page.locator(".quality-lens__evidence li")).not.toHaveCount(0);
  const marker = page.locator(".quality-lens__marker > button").first();
  await marker.click();
  await expect(page.locator(".quality-lens__evidence li[data-selected='true']")).toBeFocused();
  await page.getByLabel("Accessible names").check();
  await page.getByLabel("Dynamic state").check();
  await expect(page).toHaveURL(/lens=focus-order%2Caccessible-names%2Cdynamic-state/u);
  await page.getByRole("button", { name: "Run action trace" }).click();
  await expect(page.locator("[data-lens-id='operation-details']")).toHaveAttribute("open", "");
  await expect(page.locator("[data-lens-id='operation-status']")).toContainText(
    "Prepared trace complete",
  );
  expect(await seriousOrCriticalViolations(page)).toEqual([]);
  await page.getByRole("button", { name: "Reset Lens" }).click();
  await expect(page.getByRole("button", { name: "Open Quality Lens" })).toBeFocused();
  await expect(page).not.toHaveURL(/lens=/u);

  await page.goto("/?lens=contrast%2Cunknown", { waitUntil: "networkidle" });
  await expect(page.getByText(/Unknown Lens modes were ignored: unknown/u)).toBeVisible();
  await expect(page.getByLabel("Contrast")).toBeChecked();
});

test("preferences, RTL, and no-script output preserve access", async ({ browser, browserName }) => {
  test.skip(browserName !== "chromium", "Chromium provides deterministic forced-colors emulation.");
  const preferenceContext = await browser.newContext({
    forcedColors: "active",
    reducedMotion: "reduce",
    viewport: { height: 844, width: 390 },
  });
  const preferencePage = await preferenceContext.newPage();
  await preferencePage.goto(`${siteBase}/components/`, { waitUntil: "networkidle" });
  await preferencePage.evaluate(() => document.documentElement.setAttribute("dir", "rtl"));
  expect(
    await preferencePage.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    ),
  ).toBeLessThanOrEqual(1);
  await expect(preferencePage.locator("h1")).toHaveCount(1);
  await preferenceContext.close();

  const noScriptContext = await browser.newContext({
    javaScriptEnabled: false,
    viewport: { height: 844, width: 390 },
  });
  const noScriptPage = await noScriptContext.newPage();
  await noScriptPage.goto(`${siteBase}/components/`, { waitUntil: "load" });
  await expect(noScriptPage.locator("h1")).toHaveCount(1);
  await expect(noScriptPage.locator(".site-shell-drawer-trigger")).toBeHidden();
  const noScriptNavigation = noScriptPage.locator(".site-no-script-navigation");
  await expect(noScriptNavigation).toBeVisible();
  await noScriptNavigation.locator("summary").click();
  await expect(
    noScriptNavigation.getByRole("link", { exact: true, name: "Components" }),
  ).toBeVisible();
  expect(await noScriptPage.locator("a[href]").count()).toBeGreaterThan(5);
  expect(
    await noScriptPage.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    ),
  ).toBeLessThanOrEqual(1);
  await noScriptContext.close();
});
