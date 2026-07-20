import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import type { ReactElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import storyMeta, * as storyModule from "../../apps/storybook/src/P2TypographyContentComponentProof.stories.tsx";

const workspaceRoot = resolve(import.meta.dirname, "../..");
const storyPath = "apps/storybook/src/P2TypographyContentComponentProof.stories.tsx";
const evidencePath = "tests/storybook/typography-content-component-proof.test.tsx";
const fullReference =
  "registry.example.dev/releases/immutable/sha256/34bf4b27f39e2d0a468c7evidence";

const expectedItems = [
  {
    id: "blockquote",
    control: "citationContext",
    basic: "BasicBlockquote",
    recommended: "RecommendedBlockquote",
  },
  {
    id: "code",
    control: "bidiIsolation",
    basic: "BasicCode",
    recommended: "RecommendedCode",
  },
  {
    id: "code-block",
    control: "codeCopy",
    basic: "BasicCodeBlock",
    recommended: "RecommendedCodeBlock",
  },
  {
    id: "description-list",
    control: "descriptionLayout",
    basic: "BasicDescriptionList",
    recommended: "RecommendedDescriptionList",
  },
  {
    id: "diff-viewer",
    control: "diffSummary",
    basic: "BasicDiffViewer",
    recommended: "RecommendedDiffViewer",
  },
  {
    id: "heading",
    control: "headingScale",
    basic: "BasicHeading",
    recommended: "RecommendedHeading",
  },
  {
    id: "json-viewer",
    control: "jsonPath",
    basic: "BasicJsonViewer",
    recommended: "RecommendedJsonViewer",
  },
  {
    id: "kbd",
    control: "keyPlatform",
    basic: "BasicKbd",
    recommended: "RecommendedKbd",
  },
  {
    id: "prose",
    control: "proseMeasure",
    basic: "BasicProse",
    recommended: "RecommendedProse",
  },
  {
    id: "text",
    control: "textRecovery",
    basic: "BasicText",
    recommended: "RecommendedText",
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

describe("typography and content component-specific Storybook evidence", () => {
  it("maps every item to unique Basic and Recommended exports with one exact boolean control", () => {
    const shard = JSON.parse(
      readFileSync(
        resolve(
          workspaceRoot,
          "registry/quality/implementation-profiles/typography-content.v1.json",
        ),
        "utf8",
      ),
    ) as {
      profiles: {
        id: string;
        accessibilityEvidence: { status: string };
        blockers: { code: string }[];
        interactionEvidence: { status: string };
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
      expect(profile.blockers.map(({ code }) => code)).toContain(
        "manual-assistive-technology-records-missing",
      );
      expect(profile.maturityAssessment.status).toBe("not-ready");

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

  it("imports and renders every canonical item directly rather than using the aggregate story", () => {
    const source = readFileSync(resolve(workspaceRoot, storyPath), "utf8");

    for (const { id, basic, recommended } of expectedItems) {
      expect(source).toContain(`registry/source/components/${id}/index.ts`);
      expect(source).toContain(`export const ${basic}: Story`);
      expect(source).toContain(`export const ${recommended}: Story`);
    }
    expect(source).not.toContain("P2TypographyContent.stories");
    expect(source).not.toMatch(/switch\s*\(/u);
  });

  it("renders each enhancement and removes its UI, behavior, events, and accessible output when off", () => {
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

    expect(rendered.blockquote!.basic).not.toContain("blockquote-caption");
    expect(rendered.blockquote!.basic).not.toContain("standards/recovery");
    expect(rendered.blockquote!.recommended).toContain('data-slot="blockquote-caption"');
    expect(rendered.blockquote!.recommended).toContain(
      'href="https://example.com/standards/recovery"',
    );

    expect(rendered.code!.basic).toContain('data-bidi-isolated="false"');
    expect(rendered.code!.recommended).toContain('data-bidi-isolated="true"');

    expect(rendered["code-block"]!.basic).toContain('data-copyable="false"');
    expect(rendered["code-block"]!.basic).not.toContain('data-slot="code-block-copy"');
    expect(rendered["code-block"]!.basic).not.toContain('role="status"');
    expect(rendered["code-block"]!.recommended).toContain('data-copyable="true"');
    expect(rendered["code-block"]!.recommended).toContain('data-slot="code-block-copy"');
    expect(rendered["code-block"]!.recommended).toContain('role="status"');

    expect(rendered["description-list"]!.basic).toContain('data-layout="stacked"');
    expect(rendered["description-list"]!.recommended).toContain('data-layout="responsive"');

    expect(rendered["diff-viewer"]!.basic).toContain('data-show-summary="false"');
    expect(rendered["diff-viewer"]!.basic).toContain('data-copyable="false"');
    expect(rendered["diff-viewer"]!.basic).toContain('data-line-navigation="false"');
    expect(rendered["diff-viewer"]!.basic).not.toContain('data-slot="diff-summary"');
    expect(rendered["diff-viewer"]!.recommended).toContain('data-show-summary="true"');
    expect(rendered["diff-viewer"]!.recommended).toContain('data-slot="diff-summary"');

    expect(rendered.heading!.basic).toMatch(
      /<h2[^>]+data-level="2"[^>]+data-size="md"[^>]*>Verification summary<\/h2>/u,
    );
    expect(rendered.heading!.recommended).toMatch(
      /<h2[^>]+data-level="2"[^>]+data-size="lg"[^>]*>Verification summary<\/h2>/u,
    );

    expect(rendered["json-viewer"]!.basic).toContain('data-show-active-path="false"');
    expect(rendered["json-viewer"]!.basic).toContain('data-copyable="false"');
    expect(rendered["json-viewer"]!.basic).not.toContain('data-slot="json-active-path"');
    expect(rendered["json-viewer"]!.recommended).toContain('data-show-active-path="true"');
    expect(rendered["json-viewer"]!.recommended).toContain('data-slot="json-active-path"');

    expect(rendered.kbd!.basic).toContain('data-platform="generic"');
    expect(rendered.kbd!.recommended).toContain('data-platform="mac"');

    expect(rendered.prose!.basic).toContain('data-measure="none"');
    expect(rendered.prose!.recommended).toContain('data-measure="prose"');

    expect(rendered.text!.basic).toContain('data-truncate="false"');
    expect(rendered.text!.basic).not.toContain(`aria-label="${fullReference}"`);
    expect(rendered.text!.basic).not.toContain(`title="${fullReference}"`);
    expect(rendered.text!.recommended).toContain('data-truncate="true"');
    expect(rendered.text!.recommended).toContain(
      'aria-label="registry.example.dev/releases/immutable/sha256/34bf4b27f39e2d0a468c7evidence"',
    );
    expect(rendered.text!.recommended).toContain(
      'title="registry.example.dev/releases/immutable/sha256/34bf4b27f39e2d0a468c7evidence"',
    );
    expect(rendered.text!.recommended).toContain('tabindex="0"');
  });
});
