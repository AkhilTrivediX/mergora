import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const testDirectory = dirname(fileURLToPath(import.meta.url));
const repositoryRoot = resolve(testDirectory, "../../..");
const sourceDirectory = resolve(repositoryRoot, "registry/source/components/dialog");

function readSource(name: string): string {
  return readFileSync(resolve(sourceDirectory, name), "utf8");
}

function readJson(name: string): Record<string, unknown> {
  return JSON.parse(readSource(name)) as Record<string, unknown>;
}

describe("Dialog canonical contract inputs", () => {
  it("keeps metadata honest until package and evidence promotion", () => {
    const metadata = readJson("dialog.metadata.json");
    expect(metadata).toMatchObject({
      itemId: "dialog",
      riskClass: 2,
      serverBoundary: "client-island",
    });
    expect(readJson("dialog.status.json")).toMatchObject({
      distributionStatus: "not-generated",
      evidenceStatus: "incomplete",
      implementationStatus: "source-present-unreleased",
    });
  });

  it("exposes Mergora anatomy and does not leak React Aria public types", () => {
    const api = readJson("dialog.api.json");
    const serializedApi = JSON.stringify(api);
    expect(api).toMatchObject({
      entryExport: "Dialog",
      itemId: "dialog",
    });
    expect(serializedApi).not.toMatch(/ReactAria(?:Button|Dialog|Modal).*Props/u);

    const exportNames = (api.exports as { name: string }[]).map((entry) => entry.name);
    expect(exportNames).toContain("Dialog");
    expect(exportNames).toContain("DialogModality");
    expect(exportNames).toContain("DialogClose");
  });

  it("uses React Aria as the only focus and overlay engine", () => {
    const implementation = readSource("dialog.tsx");
    expect(implementation).toContain('from "react-aria-components/Modal"');
    expect(implementation).toContain("ReactAriaDialogTrigger");
    expect(implementation).toContain("ReactAriaModalOverlay");
    expect(implementation).toContain("ReactAriaModal");
    expect(implementation).toContain("ReactAriaDialog");
    expect(implementation).not.toMatch(/@radix-ui|@base-ui|headlessui|zag-js|@ark-ui/u);
  });

  it("defines semantic-token styles and explicit preference paths", () => {
    const css = readSource("dialog.css");
    expect(css).toMatch(/var\(\s*--mrg-component-dialog-background/u);
    expect(css).toContain("var(--mrg-semantic-color-focus-ring)");
    expect(css).toContain("var(--visual-viewport-height, 100dvb)");
    expect(css).toContain("padding-inline: max(");
    expect(css).toContain("env(safe-area-inset-left, 0px)");
    expect(css).toContain("env(safe-area-inset-right, 0px)");
    expect(css).toContain("@media (prefers-reduced-motion: reduce)");
    expect(css).toContain("@media (forced-colors: active)");
    expect(css).not.toMatch(/#[0-9a-f]{3,8}\b|rgba?\(|hsla?\(/iu);
    expect(css).not.toMatch(/^\s*(?:(?:margin|padding|inset)-(?:left|right)|(?:left|right):)/mu);
  });

  it("leaves browser and manual evidence empty and records promotion blockers", () => {
    const contract = readJson("dialog.contract.json");
    expect(contract).toMatchObject({
      contractStatus: "source-present-evidence-incomplete",
      evidenceRequirements: { recordedEvidence: [] },
    });
    expect(contract).not.toHaveProperty("sourceDigest");
    expect(contract).not.toHaveProperty("releaseCommit");
    expect(
      (readJson("dialog.status.json").promotionDelta as unknown[]).length,
    ).toBeGreaterThanOrEqual(4);
  });

  it("keeps story declarations synchronized with the canonical story", () => {
    const storyInput = readJson("dialog.stories.json");
    const storyFile = readFileSync(
      resolve(repositoryRoot, storyInput.canonicalStoryFile as string),
      "utf8",
    );
    for (const exportName of [
      "DialogModalPolicy",
      "DialogNonModal",
      "NestedOverlays",
      "RemovedOpener",
    ]) {
      expect(storyFile).toContain(`export const ${exportName}`);
    }
  });
});
