import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";

import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import {
  validateStoryStateMatrix,
  type StoryStateMatrix,
} from "../../../packages/test-utils/src/index.ts";
import { validateSchemaDocument } from "../../../registry/schemas/index.ts";
import { MergoraProvider } from "../../../registry/source/components/provider/provider.tsx";
import {
  clampResizableValue,
  formatResizableValue,
  Resizable,
} from "../../../registry/source/components/resizable/resizable.tsx";
import { ScrollArea } from "../../../registry/source/components/scroll-area/scroll-area.tsx";
import {
  normalizeSplitPaneSizes,
  SplitPane,
} from "../../../registry/source/components/split-pane/split-pane.tsx";
import { StickyRegion } from "../../../registry/source/components/sticky-region/sticky-region.tsx";

const root = resolve(import.meta.dirname, "../../..");
const componentsRoot = resolve(root, "registry/source/components");
const itemIds = ["resizable", "scroll-area", "split-pane", "sticky-region"] as const;
const requiredRecordSuffixes = [
  "anatomy.json",
  "api.json",
  "contract.json",
  "metadata.json",
  "source.json",
  "status.json",
  "stories.json",
] as const;

function readItem(itemId: (typeof itemIds)[number], filename: string): string {
  return readFileSync(resolve(componentsRoot, itemId, filename), "utf8");
}

function readJson<T>(itemId: (typeof itemIds)[number], filename: string): T {
  return JSON.parse(readItem(itemId, filename)) as T;
}

describe("P2 advanced layout records", () => {
  it("ships every canonical companion while keeping release evidence explicitly incomplete", () => {
    for (const itemId of itemIds) {
      const files = new Set(readdirSync(resolve(componentsRoot, itemId)));
      for (const suffix of requiredRecordSuffixes) {
        expect(files, `${itemId} is missing ${itemId}.${suffix}`).toContain(`${itemId}.${suffix}`);
      }
      expect(files).toContain(`${itemId}.tsx`);
      expect(files).toContain(`${itemId}.css`);
      expect(files).toContain("README.md");
      expect(files).toContain("index.ts");

      const status = readJson<{
        distributionStatus: string;
        evidenceStatus: string;
        implementationStatus: string;
        promotionDelta: string[];
        recordedEvidence: unknown[];
        releaseStatus: string;
      }>(itemId, `${itemId}.status.json`);
      expect(status).toMatchObject({
        distributionStatus: "not-generated",
        evidenceStatus: "incomplete",
        implementationStatus: "source-present-unreleased",
        recordedEvidence: [],
        releaseStatus: "unreleased",
      });
      expect(status.promotionDelta.length).toBeGreaterThanOrEqual(8);

      const contract = readJson<{
        claim: string;
        evidenceRequirements: { recordedEvidence: unknown[] };
      }>(itemId, `${itemId}.contract.json`);
      expect(contract.claim).toContain("No Stable");
      expect(contract.evidenceRequirements.recordedEvidence).toEqual([]);
    }
  });

  it("validates metadata and the complete story-state policy", () => {
    for (const itemId of itemIds) {
      const metadata = readJson<Record<string, unknown>>(itemId, `${itemId}.metadata.json`);
      const stories = readJson<StoryStateMatrix>(itemId, `${itemId}.stories.json`);
      expect(validateSchemaDocument("component-metadata", metadata), itemId).toMatchObject({
        errors: [],
        ok: true,
      });
      expect(validateStoryStateMatrix(stories), itemId).toMatchObject({ issues: [], ok: true });
    }
  });

  it("records plain and recommended Mergora modes plus exact disabled enhancement behavior", () => {
    const storySource = readFileSync(
      resolve(root, "apps/storybook/src/P2AdvancedLayout.stories.tsx"),
      "utf8",
    );
    expect(storySource).toContain("export const BasicDefaults");
    expect(storySource).toContain("export const RecommendedMergora");
    expect(storySource).toContain("showStepControls");
    expect(storySource).toContain("manageFocusOffset");

    for (const itemId of itemIds) {
      const storyNames = readJson<StoryStateMatrix>(
        itemId,
        `${itemId}.stories.json`,
      ).states.flatMap((state) => ("story" in state ? [state.story] : []));
      expect(storyNames, `${itemId} basic story`).toContain("BasicDefaults");
      expect(storyNames, `${itemId} enhanced story`).toContain("RecommendedMergora");
      expect(readItem(itemId, "README.md")).toContain("## Mergora advantage");
      expect(readItem(itemId, `${itemId}.api.json`)).toMatch(/enhancement/iu);
    }
  });

  it("uses semantic tokens, logical edges, and tokenized reduced-motion-safe feedback", () => {
    const tokenCss = readFileSync(
      resolve(root, "packages/tokens/src/generated/tokens.css"),
      "utf8",
    );
    const tokenDeclarations = new Set(
      [...tokenCss.matchAll(/(--mrg-[a-z0-9-]+)\s*:/gu)].map((match) => match[1]),
    );

    for (const itemId of itemIds) {
      const css = readItem(itemId, `${itemId}.css`);
      const source = readItem(itemId, `${itemId}.tsx`);
      const localDeclarations = new Set(
        [...`${css}\n${source}`.matchAll(/["']?(--mrg-[a-z0-9-]+)["']?\s*:/gu)].map(
          (match) => match[1],
        ),
      );
      for (const reference of [...css.matchAll(/var\((--mrg-[a-z0-9-]+)/gu)].map(
        (match) => match[1],
      )) {
        expect(
          tokenDeclarations.has(reference) || localDeclarations.has(reference),
          `${itemId} references undeclared token ${reference}`,
        ).toBe(true);
      }
      expect(css).not.toMatch(/^\s*(?:margin|padding|inset|border)-(?:left|right)\s*:/mu);
      expect(css).not.toMatch(/#[0-9a-f]{3,8}|(?:oklch|rgb|hsl)\(/iu);
      expect(css).not.toMatch(/(?:linear|radial|conic)-gradient|backdrop-filter/iu);
      expect(css).not.toMatch(/border-radius\s*:\s*(?:1[7-9]|[2-9]\d)px/iu);
      expect(css).not.toMatch(/\b(?:animation-duration|transition-duration)\s*:\s*\d/u);
      if (/\btransition\s*:/u.test(css)) {
        expect(css).toContain("var(--mrg-semantic-motion-duration-");
        expect(css).toContain("@media (prefers-reduced-motion: reduce)");
        expect(css).toContain("var(--mrg-semantic-motion-duration-reduced)");
      }
    }
  });
});

describe("P2 advanced layout value models", () => {
  it("clamps and localizes resizable percentages deterministically", () => {
    expect(clampResizableValue(-10, 20, 80)).toBe(20);
    expect(clampResizableValue(50, 20, 80)).toBe(50);
    expect(clampResizableValue(120, 20, 80)).toBe(80);
    expect(formatResizableValue(37.5, "en-US")).toBe("37.5%");
    expect(formatResizableValue(50, "de-DE")).toContain("50");
  });

  it("normalizes multi-panel sizes and preserves declared collapsed zeros", () => {
    const normalized = normalizeSplitPaneSizes([1, 1, 2], [10, 10, 20], [70, 70, 80]);
    expect(normalized.reduce((total, value) => total + value, 0)).toBeCloseTo(100, 5);
    expect(normalized).toEqual([25, 25, 50]);

    const collapsed = normalizeSplitPaneSizes([0, 70, 30], [20, 20, 20], [80, 80, 80], [0]);
    expect(collapsed[0]).toBe(0);
    expect(collapsed.reduce((total, value) => total + value, 0)).toBeCloseTo(100, 5);
    expect(() => normalizeSplitPaneSizes([100])).toThrow(RangeError);
    expect(() => normalizeSplitPaneSizes([50, 50], [60, 60])).toThrow(RangeError);
  });
});

describe("P2 advanced layout server semantics", () => {
  it("renders ScrollArea as native overflow and only opts into a labelled tab stop explicitly", () => {
    const inert = renderToStaticMarkup(<ScrollArea>Content</ScrollArea>);
    const focusable = renderToStaticMarkup(
      <ScrollArea aria-label="Build history" focusable orientation="both">
        Content
      </ScrollArea>,
    );
    expect(inert).toContain('data-slot="scroll-area"');
    expect(inert).not.toContain("tabindex");
    expect(inert).not.toContain("role=");
    expect(focusable).toContain('aria-label="Build history"');
    expect(focusable).toContain('role="region"');
    expect(focusable).toContain('tabindex="0"');
    expect(focusable).toContain('data-orientation="both"');
  });

  it("renders Resizable with a named value-bearing separator and sibling button alternatives", () => {
    const markup = renderToStaticMarkup(
      <Resizable.Root collapsible defaultValue={40} min={20}>
        <Resizable.Primary>Source</Resizable.Primary>
        <Resizable.Handle aria-label="Resize source and preview" />
        <Resizable.Secondary>Preview</Resizable.Secondary>
      </Resizable.Root>,
    );
    expect(markup).toContain('data-slot="resizable-root"');
    expect(markup).toContain('role="separator"');
    expect(markup).toContain('aria-label="Resize source and preview"');
    expect(markup).toContain('aria-valuemin="0"');
    expect(markup).toContain('aria-valuemax="90"');
    expect(markup).toContain('aria-valuenow="40"');
    expect(markup).toContain('role="group"');
    expect(markup.match(/<button/g)?.length).toBe(3);

    const plainMarkup = renderToStaticMarkup(
      <Resizable.Root defaultValue={40} showStepControls={false}>
        <Resizable.Primary>Source</Resizable.Primary>
        <Resizable.Handle aria-label="Resize source and preview" />
        <Resizable.Secondary>Preview</Resizable.Secondary>
      </Resizable.Root>,
    );
    expect(plainMarkup).not.toContain('data-step-controls="true"');
    expect(plainMarkup).not.toContain('role="group"');
    expect(plainMarkup).not.toContain("<button");
  });

  it("renders indexed SplitPane panels, separators, named regions, and nested-safe IDs", () => {
    const markup = renderToStaticMarkup(
      <SplitPane.Root defaultValue={[30, 45, 25]} minSizes={[15, 20, 15]}>
        <SplitPane.Panel index={0} regionLabel="Navigation">
          Navigation
        </SplitPane.Panel>
        <SplitPane.Handle aria-label="Resize navigation" index={0} />
        <SplitPane.Panel index={1}>Workspace</SplitPane.Panel>
        <SplitPane.Handle aria-label="Resize inspector" index={1} />
        <SplitPane.Panel index={2} regionLabel="Inspector">
          Inspector
        </SplitPane.Panel>
      </SplitPane.Root>,
    );
    expect(markup).toContain('data-panel-count="3"');
    expect(markup.match(/role="separator"/g)?.length).toBe(2);
    expect(markup.match(/role="region"/g)?.length).toBe(2);
    expect(markup).toContain('data-stack-at="narrow"');
    expect(markup).toContain("aria-controls=");

    const plainMarkup = renderToStaticMarkup(
      <SplitPane.Root defaultValue={[40, 60]} showStepControls={false} stackAt="never">
        <SplitPane.Panel index={0}>Outline</SplitPane.Panel>
        <SplitPane.Handle aria-label="Resize outline" index={0} />
        <SplitPane.Panel index={1}>Document</SplitPane.Panel>
      </SplitPane.Root>,
    );
    expect(plainMarkup).not.toContain('data-step-controls="true"');
    expect(plainMarkup).not.toContain('role="group"');
    expect(plainMarkup).not.toContain("<button");
  });

  it("inherits stable provider messages and locale while explicit root messages win", () => {
    const markup = renderToStaticMarkup(
      <MergoraProvider
        locale="de-DE"
        messages={{
          "resizable.controls": "Größensteuerung",
          "resizable.decrease": "Bereich verkleinern",
          "splitPane.controls": "Paneelgrößen",
          "splitPane.increaseBefore": "Vorheriges Paneel vergrößern",
        }}
      >
        <Resizable.Root defaultValue={40}>
          <Resizable.Primary>Source</Resizable.Primary>
          <Resizable.Handle aria-label="Source resize" />
          <Resizable.Secondary>Preview</Resizable.Secondary>
        </Resizable.Root>
        <SplitPane.Root
          defaultValue={[40, 60]}
          messages={{ decreaseBefore: "Explizit verkleinern" }}
        >
          <SplitPane.Panel index={0}>First</SplitPane.Panel>
          <SplitPane.Handle aria-label="Panels resize" index={0} />
          <SplitPane.Panel index={1}>Second</SplitPane.Panel>
        </SplitPane.Root>
      </MergoraProvider>,
    );
    expect(markup).toContain('aria-label="Größensteuerung"');
    expect(markup).toContain('aria-label="Bereich verkleinern"');
    expect(markup).toContain('aria-label="Paneelgrößen"');
    expect(markup).toContain('aria-label="Explizit verkleinern"');
    expect(markup).toContain('aria-label="Vorheriges Paneel vergrößern"');
    expect(markup).toContain('aria-valuetext="40 %"');
  });

  it("renders StickyRegion landmarks only by explicit element choice and deterministic SSR size", () => {
    const markup = renderToStaticMarkup(
      <StickyRegion.Root contained estimatedSize={56} position="block-start">
        <StickyRegion.Content element="header">Filters</StickyRegion.Content>
        <StickyRegion.Body>
          <button type="button">Apply</button>
        </StickyRegion.Body>
      </StickyRegion.Root>,
    );
    expect(markup).toContain('data-slot="sticky-region-root"');
    expect(markup).toContain('style="--mrg-sticky-region-size:56px"');
    expect(markup).toContain("<header");
    expect(markup).toContain('data-slot="sticky-region-body"');
    expect(markup).not.toContain('tabindex="0"');

    const unmanaged = renderToStaticMarkup(
      <StickyRegion.Root estimatedSize={-1} manageFocusOffset={false}>
        <StickyRegion.Content>Header</StickyRegion.Content>
        <StickyRegion.Body>Body</StickyRegion.Body>
      </StickyRegion.Root>,
    );
    expect(unmanaged).not.toContain("data-manage-focus-offset");
    expect(unmanaged).not.toContain("--mrg-sticky-region-size");
  });
});
