import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import type { ReactElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import storyMeta, * as storyModule from "../../apps/storybook/src/P4FileSystemsComponentProof.stories.tsx";

const workspaceRoot = resolve(import.meta.dirname, "../..");
const storyPath = "apps/storybook/src/P4FileSystemsComponentProof.stories.tsx";
const evidencePath = "tests/storybook/files-uploads-component-stories.test.tsx";

const expectedItems = [
  {
    id: "file-trigger",
    controls: ["acceptedTypeGuidance"],
    basic: "BasicFileTrigger",
    recommended: "RecommendedFileTrigger",
  },
  {
    id: "dropzone",
    controls: ["acceptedTypeGuidance", "preflightSizeValidation"],
    basic: "BasicDropzone",
    recommended: "RecommendedDropzone",
  },
  {
    id: "upload-progress",
    controls: ["showByteContext", "announceProgress"],
    basic: "BasicUploadProgress",
    recommended: "RecommendedUploadProgress",
  },
  {
    id: "file-upload",
    controls: [
      "acceptedTypeGuidance",
      "preflightSizeValidation",
      "fileDuplicateDetection",
      "fileRejectionRecovery",
      "filePreviews",
      "fileUploadProgress",
      "fileRetryActions",
      "fileCancelActions",
      "fileRemoveActions",
      "fileReordering",
    ],
    basic: "BasicFileUpload",
    recommended: "RecommendedFileUpload",
  },
  {
    id: "avatar-upload",
    controls: [
      "avatarPreview",
      "avatarImageMetadata",
      "avatarEditAction",
      "avatarRemoveAction",
      "avatarRejectionRecovery",
      "avatarUploadProgress",
      "avatarRetryAction",
    ],
    basic: "BasicAvatarUpload",
    recommended: "RecommendedAvatarUpload",
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

describe("file and upload component-specific Storybook evidence", () => {
  it("maps all five inventory items to unique Basic and Recommended exports", () => {
    const shard = JSON.parse(
      readFileSync(
        resolve(workspaceRoot, "registry/quality/implementation-profiles/files-uploads.v1.json"),
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
        enhancementControls: expected.controls,
      });
      expect(profile.storybook.enhanced).toMatchObject({
        status: "tested",
        mode: "recommended-enhancements-enabled",
        modulePath: storyPath,
        exportName: expected.recommended,
        enhancementControls: expected.controls,
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
      expect(profile.blockers.some(({ code }) => code.includes("manual"))).toBe(true);

      const basic = story(expected.basic);
      const recommended = story(expected.recommended);
      for (const control of expected.controls) {
        expect(basic.args?.[control], `${expected.id}:${control}:basic`).toBe(false);
        expect(recommended.args?.[control], `${expected.id}:${control}:recommended`).toBe(true);
      }
      expect(basic.parameters?.controls?.include).toEqual(expected.controls);
      expect(recommended.parameters?.controls?.include).toEqual(expected.controls);
      pointers.push(expected.basic, expected.recommended);
    }

    expect(new Set(pointers).size).toBe(expectedItems.length * 2);
  });

  it("imports and renders each canonical component without an aggregate story switch", () => {
    const source = readFileSync(resolve(workspaceRoot, storyPath), "utf8");

    for (const { id, basic, recommended } of expectedItems) {
      expect(source).toContain(`registry/source/components/${id}/index.ts`);
      expect(source).toContain(`export const ${basic}: Story`);
      expect(source).toContain(`export const ${recommended}: Story`);
      expect(renderStory(basic)).toContain(`data-story-item="${id}"`);
      expect(renderStory(recommended)).toContain(`data-story-item="${id}"`);
    }
    expect(source).not.toContain("P4FileSystems.stories");
    expect(source).not.toMatch(/switch\s*\(/u);
  });

  it("removes optional UI and accessibility output when every enhancement is disabled", () => {
    const basicTrigger = renderStory("BasicFileTrigger");
    const recommendedTrigger = renderStory("RecommendedFileTrigger");
    expect(basicTrigger).not.toContain(" accept=");
    expect(basicTrigger).not.toContain("image or PDF");
    expect(recommendedTrigger).toContain('accept=".pdf,image/*"');
    expect(recommendedTrigger).toContain("image or PDF");

    const basicDropzone = renderStory("BasicDropzone");
    const recommendedDropzone = renderStory("RecommendedDropzone");
    expect(basicDropzone).not.toContain(" accept=");
    expect(basicDropzone).not.toContain("2 MiB");
    expect(recommendedDropzone).toContain('accept=".pdf,image/*"');
    expect(recommendedDropzone).toContain("2 MiB");

    const basicProgress = renderStory("BasicUploadProgress");
    const recommendedProgress = renderStory("RecommendedUploadProgress");
    expect(basicProgress).not.toContain('data-slot="upload-progress-announcement"');
    expect(basicProgress).not.toContain("KiB of");
    expect(recommendedProgress).toContain('data-slot="upload-progress-announcement"');
    expect(recommendedProgress).toContain('aria-live="polite"');
    expect(recommendedProgress).toContain("512 KiB of 2 MiB");

    const basicQueue = renderStory("BasicFileUpload");
    const recommendedQueue = renderStory("RecommendedFileUpload");
    expect(basicQueue).not.toContain('data-slot="file-upload-preview"');
    expect(basicQueue).not.toContain('data-slot="file-upload-rejections"');
    expect(basicQueue).not.toContain('data-slot="upload-progress"');
    expect(basicQueue).not.toContain(">Earlier<");
    expect(basicQueue).not.toContain(">Later<");
    expect(basicQueue).not.toContain(">Retry ");
    expect(basicQueue).not.toContain(">Cancel ");
    expect(basicQueue).not.toContain(">Remove ");
    expect(recommendedQueue).toContain('data-slot="file-upload-preview"');
    expect(recommendedQueue).toContain('data-slot="file-upload-rejections"');
    expect(recommendedQueue).toContain('data-slot="upload-progress"');
    expect(recommendedQueue).toContain(">Earlier<");
    expect(recommendedQueue).toContain(">Later<");
    expect(recommendedQueue).toContain("Retry review-notes.pdf");
    expect(recommendedQueue).toContain("Cancel interface-map.png");
    expect(recommendedQueue).toContain("Remove interface-map.png");

    const basicAvatar = renderStory("BasicAvatarUpload");
    const recommendedAvatar = renderStory("RecommendedAvatarUpload");
    expect(basicAvatar).not.toContain('data-slot="avatar-upload-preview-status"');
    expect(basicAvatar).not.toContain('data-slot="avatar-upload-metadata"');
    expect(basicAvatar).not.toContain('data-slot="avatar-upload-lifecycle"');
    expect(basicAvatar).not.toContain('data-slot="avatar-upload-rejection"');
    expect(basicAvatar).not.toContain(">Edit image<");
    expect(basicAvatar).not.toContain(">Remove image<");
    expect(basicAvatar).not.toContain(">Retry upload<");
    expect(recommendedAvatar).toContain('data-slot="avatar-upload-preview-status"');
    expect(recommendedAvatar).toContain('data-slot="avatar-upload-metadata"');
    expect(recommendedAvatar).toContain('data-slot="avatar-upload-lifecycle"');
    expect(recommendedAvatar).toContain('data-slot="avatar-upload-rejection"');
    expect(recommendedAvatar).toContain(">Edit image<");
    expect(recommendedAvatar).toContain(">Remove image<");
    expect(recommendedAvatar).toContain(">Retry upload<");
  });
});
