import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import type { ReactElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import storyMeta, * as storyModule from "../../apps/storybook/src/P4CollectionComponentProof.stories.tsx";

const workspaceRoot = resolve(import.meta.dirname, "../..");
const storyPath = "apps/storybook/src/P4CollectionComponentProof.stories.tsx";
const evidencePath = "tests/storybook/collection-component-proof.test.tsx";
const controls = ["selectionSummary", "virtualization"] as const;

const expected = [
  { id: "listbox", basic: "BasicListbox", recommended: "RecommendedListbox" },
  { id: "select", basic: "BasicSelect", recommended: "RecommendedSelect" },
] as const;

interface Args {
  readonly selectionSummary: boolean;
  readonly virtualization: boolean;
}

interface RenderableStory {
  readonly args?: Partial<Args>;
  readonly parameters?: { readonly controls?: { readonly include?: readonly string[] } };
  readonly render?: (args: Args) => ReactElement;
}

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
  return renderToStaticMarkup(value.render!({ ...defaultArgs, ...value.args }));
}

describe("collection component-specific Storybook evidence", () => {
  it("maps Listbox and Select to unique Basic and Recommended exports", () => {
    const shard = JSON.parse(
      readFileSync(
        resolve(workspaceRoot, "registry/quality/implementation-profiles/collections.v1.json"),
        "utf8",
      ),
    ) as {
      profiles: {
        id: string;
        accessibilityEvidence: { status: string };
        maturityAssessment: { status: string };
        storybook: {
          basic: {
            modulePath: string;
            exportName: string;
            enhancementControls: string[];
            references: { location: string }[];
          };
          enhanced: {
            modulePath: string;
            exportName: string;
            enhancementControls: string[];
            references: { location: string }[];
          };
        };
      }[];
    };
    const profiles = new Map(shard.profiles.map((profile) => [profile.id, profile]));
    const pointers: string[] = [];

    for (const item of expected) {
      const profile = profiles.get(item.id)!;
      expect(profile.storybook.basic).toMatchObject({
        modulePath: storyPath,
        exportName: item.basic,
        enhancementControls: controls,
      });
      expect(profile.storybook.enhanced).toMatchObject({
        modulePath: storyPath,
        exportName: item.recommended,
        enhancementControls: controls,
      });
      expect(profile.storybook.basic.references.map(({ location }) => location)).toContain(
        evidencePath,
      );
      expect(profile.storybook.enhanced.references.map(({ location }) => location)).toContain(
        evidencePath,
      );
      expect(profile.accessibilityEvidence.status).toBe("partial");
      expect(profile.maturityAssessment.status).toBe("not-ready");

      const basic = story(item.basic);
      const recommended = story(item.recommended);
      expect(basic.args).toMatchObject({ selectionSummary: false, virtualization: false });
      expect(recommended.args).toMatchObject({ selectionSummary: true, virtualization: true });
      expect(basic.parameters?.controls?.include).toEqual(controls);
      expect(recommended.parameters?.controls?.include).toEqual(controls);
      pointers.push(item.basic, item.recommended);
    }
    expect(new Set(pointers).size).toBe(expected.length * 2);
  });

  it("directly renders both canonical components", () => {
    const source = readFileSync(resolve(workspaceRoot, storyPath), "utf8");
    for (const item of expected) {
      expect(source).toContain(`registry/source/components/${item.id}/index.ts`);
      expect(renderStory(item.basic)).toContain(`data-story-item="${item.id}"`);
      expect(renderStory(item.recommended)).toContain(`data-story-item="${item.id}"`);
    }
    expect(source).not.toContain("P4CollectionFoundation.stories");
  });

  it("removes selection context and virtualization output independently in Basic mode", () => {
    const basicListbox = renderStory("BasicListbox");
    const recommendedListbox = renderStory("RecommendedListbox");
    const basicSelect = renderStory("BasicSelect");
    const recommendedSelect = renderStory("RecommendedSelect");

    expect(basicListbox).not.toContain('data-slot="listbox-selection-summary"');
    expect(basicListbox).not.toContain('data-virtualized="true"');
    expect(recommendedListbox).toContain('data-slot="listbox-selection-summary"');
    expect(recommendedListbox).toContain('data-virtualized="true"');
    expect(basicSelect).not.toContain('data-slot="select-selection-summary"');
    expect(basicSelect).not.toContain('data-virtualized="true"');
    expect(recommendedSelect).toContain('data-slot="select-selection-summary"');
  });
});
