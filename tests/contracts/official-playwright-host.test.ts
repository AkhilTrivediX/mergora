import { mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { relative, resolve } from "node:path";
import { pathToFileURL } from "node:url";

import { chromium } from "@playwright/test";
import { afterEach, describe, expect, it } from "vitest";

import { auditProject } from "../../packages/cli/src/audit.js";
import { sha256 } from "../../packages/cli/src/contracts.js";
import { defineContractV1, type ContractDefinitionV1 } from "../../packages/contracts/src/index.js";
import {
  createOfficialPlaywrightBrowserHostV1,
  type OfficialPlaywrightHarnessV1,
} from "../../packages/test-utils/src/index.js";

const temporaryRoots: string[] = [];

afterEach(() => {
  for (const root of temporaryRoots.splice(0)) rmSync(root, { recursive: true, force: true });
});

function consumerHtml(includeAxeViolation = false): string {
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>External Contract Audit consumer</title>
    <style>
      body { margin: 0; font: 16px system-ui; }
      main { box-sizing: border-box; inline-size: 100%; padding: 24px; }
      button { min-inline-size: 44px; min-block-size: 44px; }
      button:focus-visible { outline: 3px solid CanvasText; outline-offset: 2px; }
    </style>
  </head>
  <body>
    <main id="app">
      <button type="button" aria-pressed="false">Save changes</button>
      <div id="announcer" role="status" aria-live="polite"></div>
      ${includeAxeViolation ? '<img src="data:image/gif;base64,R0lGODlhAQABAAAAACw=" />' : ""}
    </main>
    <script>
      const button = document.querySelector("button");
      const announcer = document.querySelector("#announcer");
      button.addEventListener("click", () => {
        button.setAttribute("aria-pressed", "true");
        announcer.textContent = "Saved";
      });
    </script>
  </body>
</html>
`;
}

function createConsumer(): {
  readonly root: string;
  readonly definition: ContractDefinitionV1;
  readonly harnesses: readonly OfficialPlaywrightHarnessV1[];
  readonly htmlPath: string;
} {
  const root = mkdtempSync(resolve(tmpdir(), "mergora-playwright-audit-consumer-"));
  temporaryRoots.push(root);
  mkdirSync(resolve(root, ".mergora"), { recursive: true });
  mkdirSync(resolve(root, "src/components"), { recursive: true });
  mkdirSync(resolve(root, "dist"), { recursive: true });
  const source = `export function SaveButton() {
  return <button type="button" aria-pressed="false">Save changes</button>;
}
`;
  const payloadDigest = sha256("official-playwright-consumer-payload");
  const htmlPath = resolve(root, "dist/index.html");
  writeFileSync(resolve(root, "package.json"), '{"name":"external-audit-consumer"}\n');
  writeFileSync(resolve(root, "src/components/save-button.tsx"), source);
  writeFileSync(htmlPath, consumerHtml());
  writeFileSync(
    resolve(root, ".mergora/manifest.json"),
    `${JSON.stringify(
      {
        schemaVersion: 1,
        items: {
          "official:button": {
            registry: "official",
            itemId: "button",
            contractVersion: "1.0.0",
            payload: { digest: payloadDigest },
            files: [
              {
                logicalPath: "ui/button.tsx",
                target: "src/components/save-button.tsx",
                installed: sha256(source),
              },
            ],
            registryDependencies: [],
          },
        },
      },
      null,
      2,
    )}\n`,
  );
  const harnessId = "official-button-playwright";
  const definition = defineContractV1({
    schemaVersion: 1,
    contractVersion: "1.0.0",
    contractId: "button-contract",
    registryId: "official",
    itemId: "button",
    payloadDigest,
    conformanceClaim: "automated-evidence-only",
    limitations: [
      "This automated browser run does not replace manual assistive-technology review.",
    ],
    assertions: [
      {
        id: "a11y-name",
        mode: "a11y",
        evidenceType: "accessibility-tree",
        target: { kind: "owned-file", logicalPath: "ui/button.tsx" },
        expectedBehavior: "The customized button exposes its role, name, state, and axe result.",
        severity: "S1",
        remediationUrl: "https://example.com/contracts/button#a11y-name",
        adapter: { kind: "harness", version: "1.0.0", harnessId },
      },
      {
        id: "browser-state",
        mode: "browser",
        evidenceType: "browser-behavior",
        target: { kind: "owned-file", logicalPath: "ui/button.tsx" },
        expectedBehavior: "Activation exposes pressed state and a status announcement.",
        severity: "S2",
        remediationUrl: "https://example.com/contracts/button#browser-state",
        adapter: { kind: "harness", version: "1.0.0", harnessId },
      },
      {
        id: "keyboard-activation",
        mode: "keyboard",
        evidenceType: "keyboard-behavior",
        target: { kind: "owned-file", logicalPath: "ui/button.tsx" },
        expectedBehavior: "Enter activates once while focus remains visible and unobscured.",
        severity: "S1",
        remediationUrl: "https://example.com/contracts/button#keyboard-activation",
        adapter: { kind: "harness", version: "1.0.0", harnessId },
      },
      {
        id: "responsive-reflow",
        mode: "responsive",
        evidenceType: "responsive-geometry",
        target: { kind: "owned-file", logicalPath: "ui/button.tsx" },
        expectedBehavior: "The customized build does not overflow at 320 by 568 CSS pixels.",
        severity: "S1",
        remediationUrl: "https://example.com/contracts/button#responsive-reflow",
        adapter: { kind: "harness", version: "1.0.0", harnessId },
      },
    ],
  });
  const target = { role: "button" as const, name: "Save changes" };
  const projectPath = "src/components/save-button.tsx";
  const harnesses: readonly OfficialPlaywrightHarnessV1[] = [
    {
      harnessId,
      contracts: [
        {
          registryId: "official",
          itemId: "button",
          contractId: "button-contract",
          contractVersion: "1.0.0",
          payloadDigest,
          assertions: [
            {
              assertionId: "a11y-name",
              mode: "a11y",
              projectPath,
              applicability: "applicable",
              target,
              states: [{ name: "disabled", expected: false }],
              axe: { scopeSelector: "#app" },
            },
            {
              assertionId: "browser-state",
              mode: "browser",
              projectPath,
              applicability: "applicable",
              target,
              action: { kind: "click" },
              states: [{ name: "pressed", expected: true }],
              announcement: {
                selector: "#announcer",
                text: "Saved",
                politeness: "polite",
              },
            },
            {
              assertionId: "keyboard-activation",
              mode: "keyboard",
              projectPath,
              applicability: "applicable",
              target,
              action: { kind: "press", key: "Enter" },
              states: [{ name: "pressed", expected: true }],
              focus: { step: "after-activation", target },
              announcement: {
                selector: "#announcer",
                text: "Saved",
                politeness: "polite",
              },
            },
            {
              assertionId: "responsive-reflow",
              mode: "responsive",
              projectPath,
              applicability: "applicable",
              target,
              responsive: {
                width: 320,
                height: 568,
                rootSelector: "#app",
                maximumHorizontalOverflowPx: 1,
              },
            },
          ],
        },
      ],
    },
  ];
  return { root, definition, harnesses, htmlPath };
}

function projectSnapshot(root: string): Readonly<Record<string, string>> {
  const result: Record<string, string> = {};
  const visit = (directory: string): void => {
    for (const entry of readdirSync(directory, { withFileTypes: true }).sort((left, right) =>
      left.name.localeCompare(right.name, "en"),
    )) {
      const path = resolve(directory, entry.name);
      if (entry.isDirectory()) visit(path);
      else result[relative(root, path).replaceAll("\\", "/")] = sha256(readFileSync(path));
    }
  };
  visit(root);
  return result;
}

describe("official Playwright Contract Audit host", () => {
  it("audits an external customized consumer build with real browser and axe evidence", async () => {
    const fixture = createConsumer();
    const before = projectSnapshot(fixture.root);
    const browser = await chromium.launch({ headless: true });
    try {
      const page = await browser.newPage();
      await page.goto(pathToFileURL(fixture.htmlPath).href);
      const report = await auditProject(fixture.root, {
        definitions: [fixture.definition],
        requestedModes: ["a11y", "browser", "keyboard", "responsive"],
        officialBrowserHost: createOfficialPlaywrightBrowserHostV1({
          page,
          harnesses: fixture.harnesses,
          actionTimeoutMs: 3_000,
        }),
        runtimeTimeoutMs: 15_000,
      });

      expect(report).toMatchObject({
        state: "pass",
        recommendedExitCode: 0,
        summary: { pass: 4, fail: 0, notApplicable: 0, notRun: 0 },
      });
      expect(report.results.find(({ mode }) => mode === "a11y")).toMatchObject({
        target: { projectPath: "src/components/save-button.tsx" },
        context: { role: "button", name: "Save changes", states: [{ name: "disabled" }] },
      });
      expect(report.results.find(({ mode }) => mode === "keyboard")?.context).toMatchObject({
        keyboard: [{ key: "Enter", action: "press" }],
        focus: [{ target: "Save changes", visible: true, occluded: false }],
        announcements: [{ text: "Saved", politeness: "polite" }],
      });
      expect(report.results.find(({ mode }) => mode === "responsive")?.context).toMatchObject({
        geometry: expect.arrayContaining([
          { metric: "horizontal-overflow", value: 0, unit: "px" },
          { metric: "viewport-width", value: 320, unit: "px" },
        ]),
      });
      expect(projectSnapshot(fixture.root)).toEqual(before);
    } finally {
      await browser.close();
    }
  }, 30_000);

  it("turns a real axe violation into an actionable Contract failure without source writes", async () => {
    const fixture = createConsumer();
    writeFileSync(fixture.htmlPath, consumerHtml(true));
    const before = projectSnapshot(fixture.root);
    const browser = await chromium.launch({ headless: true });
    try {
      const page = await browser.newPage();
      await page.goto(pathToFileURL(fixture.htmlPath).href);
      const report = await auditProject(fixture.root, {
        definitions: [fixture.definition],
        requestedModes: ["a11y"],
        officialBrowserHost: createOfficialPlaywrightBrowserHostV1({
          page,
          harnesses: fixture.harnesses,
        }),
        runtimeTimeoutMs: 15_000,
      });

      expect(report).toMatchObject({ state: "fail", recommendedExitCode: 10 });
      expect(report.results[0]).toMatchObject({
        target: { projectPath: "src/components/save-button.tsx" },
        failure: { classification: "assertion-failed", code: "AUDIT_AXE_VIOLATION" },
        context: {
          axe: expect.arrayContaining([expect.objectContaining({ ruleId: "image-alt" })]),
        },
      });
      expect(projectSnapshot(fixture.root)).toEqual(before);
    } finally {
      await browser.close();
    }
  }, 30_000);
});
