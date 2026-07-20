import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import type { ReactElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import storyMeta, * as storyModule from "../../apps/storybook/src/P5MediaEditingComponentProof.stories.tsx";

const workspaceRoot = resolve(import.meta.dirname, "../..");
const storyPath = "apps/storybook/src/P5MediaEditingComponentProof.stories.tsx";
const evidencePath = "tests/storybook/media-editing-component-proof.test.tsx";

const expectedItems = [
  {
    apiNames: ["showSafetyGuidance", "safety", "safetyGuidance"],
    basic: "BasicAttachment",
    control: "attachmentSafety",
    id: "attachment",
    recommended: "RecommendedAttachment",
  },
  {
    apiNames: ["searchable", "searchValue", "defaultSearchValue", "onSearchValueChange"],
    basic: "BasicEmojiPicker",
    control: "emojiSearch",
    id: "emoji-picker",
    recommended: "RecommendedEmojiPicker",
  },
  {
    apiNames: [
      "showStatusRail",
      "loadingLabel",
      "errorLabel",
      "rejectedLabel",
      "onLoadStateChange",
    ],
    basic: "BasicImage",
    control: "imageStatus",
    id: "image",
    recommended: "RecommendedImage",
  },
  {
    apiNames: ["showNumericControls"],
    basic: "BasicImageCropper",
    control: "cropNumeric",
    id: "image-cropper",
    recommended: "RecommendedImageCropper",
  },
  {
    apiNames: ["showRendererBoundary", "rendererBoundaryLabel"],
    basic: "BasicMarkdown",
    control: "markdownBoundary",
    id: "markdown",
    recommended: "RecommendedMarkdown",
  },
  {
    apiNames: ["previewLayout", "renderPreview"],
    basic: "BasicMarkdownEditor",
    control: "editorPreview",
    id: "markdown-editor",
    recommended: "RecommendedMarkdownEditor",
  },
  {
    apiNames: ["showTranscript", "transcript"],
    basic: "BasicMediaPlayer",
    control: "mediaTranscript",
    id: "media-player",
    recommended: "RecommendedMediaPlayer",
  },
  {
    apiNames: ["showAdapterBoundary"],
    basic: "BasicRichTextEditor",
    control: "richAdapterBoundary",
    id: "rich-text-editor",
    recommended: "RecommendedRichTextEditor",
  },
  {
    apiNames: ["showKeyboardControls"],
    basic: "BasicSignaturePad",
    control: "signatureKeyboard",
    id: "signature-pad",
    recommended: "RecommendedSignaturePad",
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

describe("media and editing component-specific Storybook evidence", () => {
  it("maps every item to unique Basic and Recommended exports with one exact enhancement control", () => {
    const shard = JSON.parse(
      readFileSync(
        resolve(workspaceRoot, "registry/quality/implementation-profiles/media-editing.v1.json"),
        "utf8",
      ),
    ) as {
      profiles: {
        id: string;
        accessibilityEvidence: { status: string };
        blockers: { code: string }[];
        maturityAssessment: { status: string };
        optionalEnhancements: { api: { names: string[] } }[];
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
        enhancementControls: [expected.control],
        exportName: expected.basic,
        mode: "basic-enhancements-disabled",
        modulePath: storyPath,
        status: "tested",
      });
      expect(profile.storybook.enhanced).toMatchObject({
        enhancementControls: [expected.control],
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
      expect(profile.optionalEnhancements[0]?.api.names).toEqual(expected.apiNames);
      expect(profile.accessibilityEvidence.status).toBe("partial");
      expect(profile.blockers.length).toBeGreaterThan(0);
      expect(["not-ready", "experimental-candidate"]).toContain(profile.maturityAssessment.status);

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

  it("imports every canonical item directly instead of routing through the aggregate story", () => {
    const source = readFileSync(resolve(workspaceRoot, storyPath), "utf8");

    for (const { id, basic, recommended } of expectedItems) {
      expect(source).toContain(`registry/source/components/${id}/index.ts`);
      expect(source).toContain(`export const ${basic}: Story`);
      expect(source).toContain(`export const ${recommended}: Story`);
    }
    expect(source).not.toContain("MediaEditingWorkbench");
    expect(source).not.toMatch(/switch\s*\(/u);
  });

  it("renders each direct contract and cleanly removes enhancement UI and semantics when off", () => {
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

    expect(rendered.attachment!.basic).not.toContain('data-slot="attachment-safety"');
    expect(rendered.attachment!.basic).not.toContain("data-safety=");
    expect(rendered.attachment!.recommended).toContain('data-slot="attachment-safety"');
    expect(rendered.attachment!.recommended).toContain('data-safety="unverified"');

    expect(rendered["emoji-picker"]!.basic).not.toContain('type="search"');
    expect(rendered["emoji-picker"]!.basic).not.toContain('data-slot="emoji-picker-controls"');
    expect(rendered["emoji-picker"]!.recommended).toContain('type="search"');
    expect(rendered["emoji-picker"]!.recommended).toContain("Search emoji");

    expect(rendered.image!.basic).not.toContain('data-slot="image-status"');
    expect(rendered.image!.basic).not.toContain("aria-live=");
    expect(rendered.image!.recommended).toContain('data-slot="image-status"');
    expect(rendered.image!.recommended).toContain('aria-live="polite"');

    expect(rendered["image-cropper"]!.basic).not.toContain('data-slot="image-cropper-numeric"');
    expect(rendered["image-cropper"]!.recommended).toContain('data-slot="image-cropper-numeric"');
    expect(rendered["image-cropper"]!.recommended).toContain("Crop coordinates in percent");

    expect(rendered.markdown!.basic).not.toContain('data-slot="markdown-renderer-boundary"');
    expect(rendered.markdown!.recommended).toContain('data-slot="markdown-renderer-boundary"');
    expect(rendered.markdown!.recommended).toContain("sanitization remain application-owned");

    expect(rendered["markdown-editor"]!.basic).toContain('data-layout="write"');
    expect(rendered["markdown-editor"]!.basic).not.toContain('data-slot="markdown-editor-preview"');
    expect(rendered["markdown-editor"]!.recommended).toContain('data-layout="split"');
    expect(rendered["markdown-editor"]!.recommended).toContain(
      'data-slot="markdown-editor-preview"',
    );
    expect(rendered["markdown-editor"]!.recommended).toContain('role="region"');

    expect(rendered["media-player"]!.basic).not.toContain('data-slot="media-player-transcript"');
    expect(rendered["media-player"]!.basic).not.toContain("aria-describedby=");
    expect(rendered["media-player"]!.recommended).toContain('data-slot="media-player-transcript"');
    expect(rendered["media-player"]!.recommended).toMatch(
      /<audio[^>]+aria-describedby="[^"]+-transcript"/u,
    );

    expect(rendered["rich-text-editor"]!.basic).not.toContain(
      'data-slot="rich-text-editor-adapter-boundary"',
    );
    expect(rendered["rich-text-editor"]!.recommended).toContain(
      'data-slot="rich-text-editor-adapter-boundary"',
    );
    expect(rendered["rich-text-editor"]!.recommended).toContain(
      "storybook-plain-text-fixture@1.0.0",
    );

    expect(rendered["signature-pad"]!.basic).not.toContain(
      'data-slot="signature-pad-keyboard-controls"',
    );
    expect(rendered["signature-pad"]!.basic).not.toContain("Keyboard pen controls");
    expect(rendered["signature-pad"]!.recommended).toContain(
      'data-slot="signature-pad-keyboard-controls"',
    );
    expect(rendered["signature-pad"]!.recommended).toContain("Keyboard pen controls");
  });
});
