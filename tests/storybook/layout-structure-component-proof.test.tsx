import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import type { ReactElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import storyMeta, * as storyModule from "../../apps/storybook/src/P2LayoutStructureComponentProof.stories.tsx";

const workspaceRoot = resolve(import.meta.dirname, "../..");
const storyPath = "apps/storybook/src/P2LayoutStructureComponentProof.stories.tsx";
const evidencePath = "tests/storybook/layout-structure-component-proof.test.tsx";

const expectedItems = [
  {
    basic: "BasicAspectRatio",
    controls: ["fitMedia"],
    id: "aspect-ratio",
    recommended: "RecommendedAspectRatio",
  },
  {
    basic: "BasicCenter",
    controls: ["semanticMaximum"],
    id: "center",
    recommended: "RecommendedCenter",
  },
  {
    basic: "BasicCluster",
    controls: ["fillOrphan"],
    id: "cluster",
    recommended: "RecommendedCluster",
  },
  {
    basic: "BasicContainer",
    controls: ["safeArea", "queryContainer"],
    id: "container",
    recommended: "RecommendedContainer",
  },
  {
    basic: "BasicGrid",
    controls: ["equalRows"],
    id: "grid",
    recommended: "RecommendedGrid",
  },
  {
    basic: "BasicInline",
    controls: ["adaptiveWrap"],
    id: "inline",
    recommended: "RecommendedInline",
  },
  {
    basic: "BasicResizable",
    controls: ["showStepControls"],
    id: "resizable",
    recommended: "RecommendedResizable",
  },
  {
    basic: "BasicScrollArea",
    controls: ["focusableScroll", "containOverscroll"],
    id: "scroll-area",
    recommended: "RecommendedScrollArea",
  },
  {
    basic: "BasicSeparator",
    controls: ["separatorSpacing"],
    id: "separator",
    recommended: "RecommendedSeparator",
  },
  {
    basic: "BasicSplitPane",
    controls: ["showStepControls", "responsiveStack"],
    id: "split-pane",
    recommended: "RecommendedSplitPane",
  },
  {
    basic: "BasicStack",
    controls: ["separatedStack"],
    id: "stack",
    recommended: "RecommendedStack",
  },
  {
    basic: "BasicStickyRegion",
    controls: ["manageFocusOffset"],
    id: "sticky-region",
    recommended: "RecommendedStickyRegion",
  },
] as const;

type Args = Record<string, boolean>;
type RenderableStory = {
  readonly args?: Partial<Args>;
  readonly parameters?: { readonly controls?: { readonly include?: readonly string[] } };
  readonly render?: (args: Args) => ReactElement;
};

const stories = storyModule as unknown as Record<string, RenderableStory>;
const defaultArgs = storyMeta.args as Args;

function story(name: string): RenderableStory {
  const value = stories[name];
  expect(value, name).toBeDefined();
  expect(value?.render, name).toBeTypeOf("function");
  return value!;
}

function renderStory(name: string): string {
  const value = story(name);
  return renderToStaticMarkup(value.render!({ ...defaultArgs, ...value.args } as Args));
}

describe("layout and structure component-specific Storybook evidence", () => {
  it("maps all 12 items to unique direct Basic and Recommended exports", () => {
    const shard = JSON.parse(
      readFileSync(
        resolve(workspaceRoot, "registry/quality/implementation-profiles/layout-structure.v1.json"),
        "utf8",
      ),
    ) as {
      profiles: {
        id: string;
        accessibilityEvidence: { status: string };
        blockers: { code: string }[];
        interactionEvidence: { status: string };
        maturityAssessment: { status: string };
        optionalEnhancements: {
          disabledBehavior: Record<"accessibility" | "behavior" | "events" | "ui", string>;
        }[];
        storybook: {
          basic: {
            enhancementControls: string[];
            exportName: string;
            mode: string;
            modulePath: string;
            references: { location: string }[];
            status: string;
          };
          enhanced: {
            enhancementControls: string[];
            exportName: string;
            mode: string;
            modulePath: string;
            references: { location: string }[];
            status: string;
          };
        };
      }[];
    };
    const profileById = new Map(shard.profiles.map((profile) => [profile.id, profile]));
    const pointers: string[] = [];

    expect([...profileById.keys()].sort()).toEqual(expectedItems.map(({ id }) => id).sort());
    for (const expected of expectedItems) {
      const profile = profileById.get(expected.id)!;
      expect(profile.storybook.basic).toMatchObject({
        enhancementControls: expected.controls,
        exportName: expected.basic,
        mode: "basic-enhancements-disabled",
        modulePath: storyPath,
        status: "tested",
      });
      expect(profile.storybook.enhanced).toMatchObject({
        enhancementControls: expected.controls,
        exportName: expected.recommended,
        mode: "recommended-enhancements-enabled",
        modulePath: storyPath,
        status: "tested",
      });
      expect(profile.storybook.basic.references.map(({ location }) => location)).toContain(
        evidencePath,
      );
      expect(profile.storybook.enhanced.references.map(({ location }) => location)).toContain(
        evidencePath,
      );
      expect(profile.interactionEvidence.status).toBe("partial");
      expect(profile.accessibilityEvidence.status).toBe("partial");
      expect(profile.blockers.map(({ code }) => code)).toContain(
        "manual-accessibility-evidence-incomplete",
      );
      expect(profile.maturityAssessment.status).toBe("not-ready");

      for (const enhancement of profile.optionalEnhancements) {
        expect(Object.keys(enhancement.disabledBehavior).sort()).toEqual([
          "accessibility",
          "behavior",
          "events",
          "ui",
        ]);
        for (const statement of Object.values(enhancement.disabledBehavior)) {
          expect(statement.trim().length).toBeGreaterThan(0);
        }
      }

      const basic = story(expected.basic);
      const recommended = story(expected.recommended);
      expect(basic.parameters?.controls?.include).toEqual(expected.controls);
      expect(recommended.parameters?.controls?.include).toEqual(expected.controls);
      for (const control of expected.controls) {
        expect(basic.args?.[control]).toBe(false);
        expect(recommended.args?.[control]).toBe(true);
      }
      pointers.push(`${storyPath}#${expected.basic}`, `${storyPath}#${expected.recommended}`);
    }

    expect(new Set(pointers).size).toBe(expectedItems.length * 2);
  });

  it("imports every canonical component directly and renders each proof shell", () => {
    const source = readFileSync(resolve(workspaceRoot, storyPath), "utf8");

    for (const { basic, id, recommended } of expectedItems) {
      expect(source).toContain(`registry/source/components/${id}/index.ts`);
      expect(source).toContain(`export const ${basic}: Story`);
      expect(source).toContain(`export const ${recommended}: Story`);
      expect(renderStory(basic)).toContain(`data-story-item="${id}"`);
      expect(renderStory(recommended)).toContain(`data-story-item="${id}"`);
    }
    expect(source).not.toContain("P2LayoutFoundations");
    expect(source).not.toContain("P2AdvancedLayout");
  });

  it("keeps every Basic enhancement off and renders each Recommended advantage", () => {
    const rendered = Object.fromEntries(
      expectedItems.map(({ basic, id, recommended }) => [
        id,
        { basic: renderStory(basic), recommended: renderStory(recommended) },
      ]),
    );

    expect(rendered["aspect-ratio"]!.basic).not.toContain("data-fit=");
    expect(rendered["aspect-ratio"]!.recommended).toContain('data-fit="contain"');

    expect(rendered.center!.basic).toContain('data-maximum="none"');
    expect(rendered.center!.recommended).toContain('data-maximum="prose"');

    expect(rendered.cluster!.basic).toContain('data-orphan="start"');
    expect(rendered.cluster!.recommended).toContain('data-orphan="fill"');

    expect(rendered.container!.basic).toContain('data-safe-area="false"');
    expect(rendered.container!.basic).not.toContain("data-query-container=");
    expect(rendered.container!.recommended).toContain('data-safe-area="true"');
    expect(rendered.container!.recommended).toContain('data-query-container="true"');

    expect(rendered.grid!.basic).not.toContain("data-equal-rows=");
    expect(rendered.grid!.recommended).toContain('data-equal-rows="true"');

    expect(rendered.inline!.basic).toContain('data-wrap="false"');
    expect(rendered.inline!.recommended).not.toContain("data-wrap=");

    expect(rendered.resizable!.basic).not.toContain("mrg-resizable__controls");
    expect(rendered.resizable!.basic).not.toContain("data-step-controls=");
    expect(rendered.resizable!.recommended).toContain("mrg-resizable__controls");
    expect(rendered.resizable!.recommended).toContain('data-step-controls="true"');

    expect(rendered["scroll-area"]!.basic).toContain('data-focusable="false"');
    expect(rendered["scroll-area"]!.basic).toContain('data-contain-overscroll="false"');
    expect(rendered["scroll-area"]!.basic).not.toContain('aria-label="Revision history"');
    expect(rendered["scroll-area"]!.recommended).toContain('data-focusable="true"');
    expect(rendered["scroll-area"]!.recommended).toContain('data-contain-overscroll="true"');
    expect(rendered["scroll-area"]!.recommended).toContain('aria-label="Revision history"');
    expect(rendered["scroll-area"]!.recommended).toContain('role="region"');
    expect(rendered["scroll-area"]!.recommended).toContain('tabindex="0"');

    expect(rendered.separator!.basic).not.toContain("data-spacing=");
    expect(rendered.separator!.recommended).toContain('data-spacing="md"');

    expect(rendered["split-pane"]!.basic).not.toContain("mrg-split-pane__controls");
    expect(rendered["split-pane"]!.basic).toContain('data-stack-at="never"');
    expect(rendered["split-pane"]!.recommended).toContain("mrg-split-pane__controls");
    expect(rendered["split-pane"]!.recommended).toContain('data-step-controls="true"');
    expect(rendered["split-pane"]!.recommended).toContain('data-stack-at="narrow"');

    expect(rendered.stack!.basic).not.toContain("data-separated=");
    expect(rendered.stack!.recommended).toContain('data-separated="true"');

    expect(rendered["sticky-region"]!.basic).not.toContain("data-manage-focus-offset=");
    expect(rendered["sticky-region"]!.basic).not.toContain("--mrg-sticky-region-size");
    expect(rendered["sticky-region"]!.recommended).toContain('data-manage-focus-offset="true"');
    expect(rendered["sticky-region"]!.recommended).toContain("--mrg-sticky-region-size:52px");
  });
});
