import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import type { ReactElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import storyMeta, * as storyModule from "../../apps/storybook/src/P2ActionsSelectionComponentProof.stories.tsx";

const workspaceRoot = resolve(import.meta.dirname, "../..");
const storyPath = "apps/storybook/src/P2ActionsSelectionComponentProof.stories.tsx";
const evidencePath = "tests/storybook/actions-selection-component-proof.test.tsx";

const expectedItems = [
  {
    id: "action-menu",
    control: "destructiveConfirmation",
    basic: "BasicActionMenu",
    recommended: "RecommendedActionMenu",
  },
  {
    id: "button",
    control: "pendingFeedback",
    basic: "BasicButton",
    recommended: "RecommendedButton",
  },
  {
    id: "button-group",
    control: "toolbarDiscovery",
    basic: "BasicButtonGroup",
    recommended: "RecommendedButtonGroup",
  },
  {
    id: "copy-button",
    control: "clipboardFallback",
    basic: "BasicCopyButton",
    recommended: "RecommendedCopyButton",
  },
  {
    id: "icon-button",
    control: "iconTooltip",
    basic: "BasicIconButton",
    recommended: "RecommendedIconButton",
  },
  {
    id: "link",
    control: "externalContext",
    basic: "BasicLink",
    recommended: "RecommendedLink",
  },
  {
    id: "segmented-control",
    control: "selectionSummaries",
    basic: "BasicSegmentedControl",
    recommended: "RecommendedSegmentedControl",
  },
  {
    id: "toggle",
    control: "pendingFeedback",
    basic: "BasicToggle",
    recommended: "RecommendedToggle",
  },
  {
    id: "toggle-group",
    control: "selectionSummaries",
    basic: "BasicToggleGroup",
    recommended: "RecommendedToggleGroup",
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

describe("actions and selection component-specific Storybook evidence", () => {
  it("maps every canonical item to unique Basic and Recommended exports with one exact control", () => {
    const shard = JSON.parse(
      readFileSync(
        resolve(
          workspaceRoot,
          "registry/quality/implementation-profiles/actions-selection.v1.json",
        ),
        "utf8",
      ),
    ) as {
      profiles: {
        id: string;
        accessibilityEvidence: { status: string };
        interactionEvidence: { status: string };
        blockers: { code: string }[];
        maturityAssessment: { status: string };
        storybook: {
          basic: {
            status: string;
            mode: string;
            modulePath: string;
            exportName: string;
            enhancementControls: string[];
            references: { location: string }[];
          };
          enhanced: {
            status: string;
            mode: string;
            modulePath: string;
            exportName: string;
            enhancementControls: string[];
            references: { location: string }[];
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
        status: "tested",
        mode: "basic-enhancements-disabled",
        modulePath: storyPath,
        exportName: expected.basic,
        enhancementControls: [expected.control],
      });
      expect(profile.storybook.enhanced).toMatchObject({
        status: "tested",
        mode: "recommended-enhancements-enabled",
        modulePath: storyPath,
        exportName: expected.recommended,
        enhancementControls: [expected.control],
      });
      expect(profile.storybook.basic.references.map(({ location }) => location)).toContain(
        evidencePath,
      );
      expect(profile.storybook.enhanced.references.map(({ location }) => location)).toContain(
        evidencePath,
      );
      expect(profile.interactionEvidence.status).toBe("verified");
      expect(profile.accessibilityEvidence.status).toBe("partial");
      expect(profile.maturityAssessment.status).toBe("not-ready");
      expect(profile.blockers.map(({ code }) => code)).toContain(
        "manual-assistive-technology-records-missing",
      );

      const basic = story(expected.basic);
      const recommended = story(expected.recommended);
      expect(basic.args?.[expected.control]).toBe(false);
      expect(recommended.args?.[expected.control]).toBe(true);
      expect(basic.parameters?.controls?.include).toEqual([expected.control]);
      expect(recommended.parameters?.controls?.include).toEqual([expected.control]);
      pointers.push(expected.basic, expected.recommended);
    }

    expect(new Set(pointers).size).toBe(expectedItems.length * 2);
  });

  it("imports and renders every canonical item directly", () => {
    const source = readFileSync(resolve(workspaceRoot, storyPath), "utf8");

    for (const { id, basic, recommended } of expectedItems) {
      expect(source).toContain(`registry/source/components/${id}/index.ts`);
      expect(source).toContain(`export const ${basic}: Story`);
      expect(source).toContain(`export const ${recommended}: Story`);
    }
    expect(source).not.toContain("P2ActionsSelection.stories");
    expect(source).not.toMatch(/switch\s*\(/u);
    expect(source).toContain("confirmDestructiveActions={confirmDestructiveActions}");
    expect(source).toContain("allowFallback={allowFallback}");
  });

  it("keeps enhancement-off UI and accessibility output absent in static rendering", () => {
    const rendered = Object.fromEntries(
      expectedItems.map(({ id, basic, recommended }) => [
        id,
        { basic: renderStory(basic), recommended: renderStory(recommended) },
      ]),
    );

    for (const { id } of expectedItems) {
      expect(rendered[id]!.basic).toContain(`data-story-item="${id}"`);
      expect(rendered[id]!.recommended).toContain(`data-story-item="${id}"`);
    }

    expect(rendered["action-menu"]!.basic).not.toContain("Confirm delete snapshot");
    expect(rendered.button!.basic).not.toContain('data-pending="true"');
    expect(rendered.button!.basic).not.toContain('aria-busy="true"');
    expect(rendered.button!.recommended).toContain('data-pending="true"');
    expect(rendered.button!.recommended).toContain('aria-busy="true"');
    expect(rendered["button-group"]!.basic).toContain('role="group"');
    expect(rendered["button-group"]!.basic).not.toContain("Use Left and Right Arrow");
    expect(rendered["button-group"]!.recommended).toContain('role="toolbar"');
    expect(rendered["button-group"]!.recommended).toContain("Use Left and Right Arrow");
    expect(rendered["copy-button"]!.basic).toContain('data-slot="copy-button"');
    expect(rendered["copy-button"]!.recommended).toContain('data-slot="copy-button"');
    expect(rendered["icon-button"]!.basic).not.toContain(
      'title="Add a comparison after the selected result"',
    );
    expect(rendered["icon-button"]!.recommended).toContain(
      'title="Add a comparison after the selected result"',
    );
    expect(rendered.link!.basic).not.toContain('data-external-context="true"');
    expect(rendered.link!.basic).not.toContain("New tab");
    expect(rendered.link!.recommended).toContain('data-external-context="true"');
    expect(rendered.link!.recommended).toContain("New tab");
    expect(rendered["segmented-control"]!.basic).not.toContain(
      'data-slot="segmented-control-summary"',
    );
    expect(rendered["segmented-control"]!.recommended).toContain(
      'data-slot="segmented-control-summary"',
    );
    expect(rendered.toggle!.basic).not.toContain('data-pending="true"');
    expect(rendered.toggle!.basic).not.toContain('aria-busy="true"');
    expect(rendered.toggle!.recommended).toContain('data-pending="true"');
    expect(rendered.toggle!.recommended).toContain('aria-busy="true"');
    expect(rendered["toggle-group"]!.basic).not.toContain('data-slot="toggle-group-summary"');
    expect(rendered["toggle-group"]!.recommended).toContain('data-slot="toggle-group-summary"');
  });
});
