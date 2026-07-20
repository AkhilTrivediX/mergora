import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import {
  validateStoryStateMatrix,
  type StoryStateMatrix,
} from "../../../packages/test-utils/src/index.ts";
import { validateSchemaDocument } from "../../../registry/schemas/index.ts";
import { AvatarUpload } from "../../../registry/source/components/avatar-upload/avatar-upload.tsx";
import { Dropzone } from "../../../registry/source/components/dropzone/dropzone.tsx";
import {
  FileTrigger,
  fileMatchesAcceptedType,
  normalizeAcceptedFileTypes,
  synchronizeFileInputFiles,
} from "../../../registry/source/components/file-trigger/file-trigger.tsx";
import {
  FileUpload,
  getFileUploadFingerprint,
} from "../../../registry/source/components/file-upload/file-upload.tsx";
import { MergoraProvider } from "../../../registry/source/components/provider/provider.tsx";
import {
  UploadProgress,
  formatUploadBytes,
} from "../../../registry/source/components/upload-progress/upload-progress.tsx";

const root = resolve(import.meta.dirname, "../../..");
const componentsRoot = resolve(root, "registry/source/components");
const itemIds = [
  "file-trigger",
  "dropzone",
  "upload-progress",
  "file-upload",
  "avatar-upload",
] as const;
const recordSuffixes = [
  "anatomy.json",
  "api.json",
  "contract.json",
  "metadata.json",
  "source.json",
  "status.json",
  "stories.json",
] as const;

function readItem(itemId: string, filename: string): string {
  return readFileSync(resolve(componentsRoot, itemId, filename), "utf8");
}

function readJson<T>(itemId: string, filename: string): T {
  return JSON.parse(readItem(itemId, filename)) as T;
}

describe("P4 file-system registry records", () => {
  it("ships the canonical twelve source files for every item", () => {
    for (const itemId of itemIds) {
      expect(readdirSync(resolve(componentsRoot, itemId)).sort(), itemId).toEqual(
        [
          "README.md",
          "index.ts",
          `${itemId}-css.d.ts`,
          `${itemId}.anatomy.json`,
          `${itemId}.api.json`,
          `${itemId}.contract.json`,
          `${itemId}.css`,
          `${itemId}.metadata.json`,
          `${itemId}.source.json`,
          `${itemId}.status.json`,
          `${itemId}.stories.json`,
          `${itemId}.tsx`,
        ].sort(),
      );
    }
  });

  it("validates metadata and the complete required story-state policy", () => {
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

  it("binds every file-system state record to a real Storybook export", () => {
    const storySource = readFileSync(
      resolve(root, "apps/storybook/src/P4FileSystems.stories.tsx"),
      "utf8",
    );
    const storyExports = new Set(
      [...storySource.matchAll(/^export const ([A-Za-z0-9_]+)\b/gmu)].map((match) => match[1]),
    );

    for (const itemId of itemIds) {
      const stories = readJson<StoryStateMatrix>(itemId, `${itemId}.stories.json`);
      for (const state of stories.states) {
        if (!("story" in state)) continue;
        expect(storyExports, `${itemId}/${state.id} -> ${state.story}`).toContain(state.story);
      }
    }

    expect(storySource).toContain("export const BasicDefaults");
    expect(storySource).toContain("export const RecommendedMergora");
  });

  it("keeps source dependencies exact and makes no release or evidence claim", () => {
    const dependencies = {
      "avatar-upload": ["file-trigger", "provider", "upload-progress"],
      dropzone: ["file-trigger"],
      "file-trigger": [],
      "file-upload": ["dropzone", "file-trigger", "provider", "upload-progress"],
      "upload-progress": ["progress", "provider"],
    } satisfies Readonly<Record<(typeof itemIds)[number], readonly string[]>>;
    for (const itemId of itemIds) {
      const source = readJson<Record<string, unknown>>(itemId, `${itemId}.source.json`);
      expect(Object.keys(source).sort(), itemId).toEqual([
        "declaredImports",
        "entryPath",
        "id",
        "itemDependencies",
        "outputRole",
      ]);
      expect(source).toMatchObject({
        entryPath: `registry/source/components/${itemId}/${itemId}.tsx`,
        id: itemId,
        itemDependencies: dependencies[itemId],
        outputRole: "component",
      });
      const records = recordSuffixes
        .map((suffix) => readItem(itemId, `${itemId}.${suffix}`))
        .join("\n");
      expect(records).not.toMatch(/"(?:maturity|publishedMaturity)"\s*:\s*"stable"/iu);
      expect(records).not.toMatch(/"recordedEvidence"\s*:\s*\[[^\]]+\]/u);
      expect(readJson(itemId, `${itemId}.status.json`)).toMatchObject({
        distributionStatus: "not-generated",
        evidenceStatus: "incomplete",
        implementationStatus: "source-present-unreleased",
        releaseStatus: "unreleased",
      });
    }
  });

  it("uses semantic tokens, logical layout, responsive reflow, and preference fallbacks", () => {
    for (const itemId of itemIds) {
      const css = readItem(itemId, `${itemId}.css`);
      expect(css, itemId).not.toMatch(/#[\da-f]{3,8}\b|\brgba?\(|\bhsla?\(/iu);
      expect(css, itemId).not.toMatch(/\b(?:left|right)-(?:width|color|style|radius)\s*:/u);
      expect(css, itemId).toContain("@media (prefers-reduced-motion: reduce)");
      expect(css, itemId).toContain("@media (forced-colors: active)");
    }
    expect(readItem("file-trigger", "file-trigger.css")).toContain(
      "var(--mrg-semantic-size-target-preferred)",
    );
    expect(readItem("dropzone", "dropzone.css")).toContain("@media (max-width: 30rem)");
    for (const itemId of ["file-trigger", "dropzone", "file-upload", "avatar-upload"] as const) {
      const css = readItem(itemId, `${itemId}.css`);
      expect(css, itemId).toContain("var(--mrg-component-focus-indicator-color)");
      expect(css, itemId).toContain("var(--mrg-component-focus-indicator-contrast-background)");
      expect(css, itemId).toContain("box-shadow: none");
      expect(css, itemId).toContain("outline-color: Highlight");
    }
  });
});

describe("FileTrigger acceptance and native SSR contract", () => {
  it("normalizes, sorts, freezes, and validates accepted-type tokens", () => {
    const normalized = normalizeAcceptedFileTypes([" IMAGE/* ", ".PDF", "application/json"]);
    expect(normalized).toEqual([".pdf", "application/json", "image/*"]);
    expect(Object.isFrozen(normalized)).toBe(true);
    expect(normalizeAcceptedFileTypes(undefined)).toEqual([]);
    expect(() => normalizeAcceptedFileTypes([])).toThrow(/between 1 and 32/u);
    expect(() => normalizeAcceptedFileTypes([".PDF", ".pdf"])).toThrow(/unique/u);
    expect(() => normalizeAcceptedFileTypes(["image"])).toThrow(/invalid/u);
    expect(() => normalizeAcceptedFileTypes(["image/png,text/plain"])).toThrow(/invalid/u);
  });

  it("classifies normalized extensions, exact MIME, wildcard MIME, and empty acceptance", () => {
    const pdf = new File(["pdf"], "Résumé.PDF", { type: "application/pdf" });
    const png = new File(["png"], "preview.bin", { type: "image/png" });
    const text = new File(["text"], "notes.txt", { type: "text/plain" });
    expect(fileMatchesAcceptedType(pdf, [".pdf"])).toBe(true);
    expect(fileMatchesAcceptedType(pdf, ["application/pdf"])).toBe(true);
    expect(fileMatchesAcceptedType(png, ["image/*"])).toBe(true);
    expect(fileMatchesAcceptedType(text, [".pdf", "image/*"])).toBe(false);
    expect(fileMatchesAcceptedType(text, [])).toBe(true);
  });

  it("fails closed before native file synchronization when the target is invalid or unsupported", () => {
    const textInput = { multiple: false, type: "text", value: "unsafe" } as HTMLInputElement;
    expect(() => synchronizeFileInputFiles(textInput, [])).toThrow(/type=file/u);
    expect(textInput.value).toBe("");

    const fileInput = { multiple: false, type: "file", value: "unsafe" } as HTMLInputElement;
    expect(() =>
      synchronizeFileInputFiles(fileInput, [new File(["a"], "a.txt"), new File(["b"], "b.txt")]),
    ).toThrow(/multiple/u);
    expect(fileInput.value).toBe("");
    expect(() => synchronizeFileInputFiles(fileInput, ["not-a-file" as unknown as File])).toThrow(
      /real File/u,
    );
    expect(() => synchronizeFileInputFiles(fileInput, [new File(["a"], "a.txt")])).toThrow(
      /cannot synchronize/u,
    );
    expect(fileInput.value).toBe("");
  });

  it("renders one labeled native file input with form, directory, capture, and description data", () => {
    const markup = renderToStaticMarkup(
      <form>
        <FileTrigger
          acceptDirectory
          acceptedFileTypes={["IMAGE/*", ".PDF"]}
          allowsMultiple
          description="Release evidence"
          id="evidence-input"
          label="Choose evidence"
          name="evidence"
          required
        />
        <FileTrigger capture="environment" id="camera-input" label="Capture evidence" />
      </form>,
    );
    expect(markup).toContain('<label data-slot="file-trigger-label" for="evidence-input">');
    expect(markup).toContain('type="file"');
    expect(markup).toContain('name="evidence"');
    expect(markup).toContain('accept=".pdf,image/*"');
    expect(markup).toContain('capture="environment"');
    expect(markup).toContain('multiple=""');
    expect(markup).toContain('required=""');
    expect(markup).toContain('directory=""');
    expect(markup).toContain('webkitdirectory=""');
    expect(markup).toContain('aria-describedby="evidence-input-description"');
  });

  it("rejects invisible labels and whitespace-only native identifiers", () => {
    expect(() => renderToStaticMarkup(<FileTrigger label=" " />)).toThrow(/visible label/u);
    expect(() => renderToStaticMarkup(<FileTrigger id=" " label="Files" />)).toThrow(/id/u);
    expect(() => renderToStaticMarkup(<FileTrigger label="Files" name=" " />)).toThrow(/name/u);
    expect(() => renderToStaticMarkup(<FileTrigger acceptDirectory label="Directory" />)).toThrow(
      /requires allowsMultiple/u,
    );
    expect(() =>
      renderToStaticMarkup(
        <FileTrigger acceptDirectory allowsMultiple capture="environment" label="Directory" />,
      ),
    ).toThrow(/cannot combine/u);
  });
});

describe("FileUpload and AvatarUpload SSR contracts", () => {
  it("keeps both composite defaults lightweight and enhancement output absent", () => {
    const file = new File(["pdf"], "notes.pdf", {
      lastModified: 1_700_000_000_000,
      type: "application/pdf",
    });
    const queue = renderToStaticMarkup(
      <FileUpload defaultItems={[{ file, id: "notes" }]} label="Upload files" />,
    );
    expect(queue).toContain('data-slot="file-upload"');
    expect(queue).toContain("notes.pdf");
    expect(queue).not.toContain("file-upload-preview");
    expect(queue).not.toContain("upload-progress");
    expect(queue).not.toContain("file-upload-rejections");
    expect(queue).not.toContain("file-upload-actions");

    const avatar = renderToStaticMarkup(
      <AvatarUpload defaultValue={file} label="Profile image" name="avatar" />,
    );
    expect(avatar).toContain('data-slot="avatar-upload"');
    expect(avatar).toContain('name="avatar"');
    expect(avatar).toContain('accept="image/*"');
    expect(avatar).not.toContain("avatar-upload-preview-status");
    expect(avatar).not.toContain("avatar-upload-metadata");
    expect(avatar).not.toContain("avatar-upload-lifecycle");
    expect(avatar).not.toContain("avatar-upload-rejection");
  });

  it("renders independently enabled queue and avatar enhancement surfaces", () => {
    const file = new File(["image"], "profile.png", {
      lastModified: 1_700_000_000_000,
      type: "image/png",
    });
    const queue = renderToStaticMarkup(
      <FileUpload
        defaultItems={[
          {
            file,
            id: "profile",
            progress: 40,
            status: "error",
            totalBytes: 10,
            uploadedBytes: 4,
          },
        ]}
        label="Upload files"
        onRetry={() => undefined}
        renderPreview={() => <span>Image preview</span>}
        reorderable
        showProgress
        showRejectionRecovery
        showRetryActions
      />,
    );
    expect(queue).toContain("Image preview");
    expect(queue).toContain("<progress");
    expect(queue).toContain('aria-live="polite"');
    expect(queue).toContain("Retry profile.png");
    expect(queue).toContain("Move profile.png earlier");

    const avatar = renderToStaticMarkup(
      <AvatarUpload
        defaultValue={file}
        label="Profile image"
        onEdit={() => undefined}
        onRetry={() => undefined}
        showEditAction
        showImageMetadata
        showRejectionRecovery
        showRemoveAction
        showRetryAction
        showUploadProgress
        uploadStatus="error"
        uploadValue={40}
      />,
    );
    expect(avatar).toContain("avatar-upload-metadata");
    expect(avatar).toContain("Edit image");
    expect(avatar).toContain("Remove image");
    expect(avatar).toContain("<progress");
    expect(avatar).toContain("Retry upload");
  });

  it("uses a stable duplicate fingerprint and validates component-specific contracts", () => {
    const first = new File(["x"], "same.png", {
      lastModified: 12,
      type: "image/png",
    });
    const second = new File(["x"], "same.png", {
      lastModified: 12,
      type: "image/png",
    });
    expect(getFileUploadFingerprint(first)).toBe(getFileUploadFingerprint(second));
    expect(() =>
      renderToStaticMarkup(
        <FileUpload
          defaultItems={[
            { file: first, id: "same" },
            { file: second, id: "same" },
          ]}
          label="Files"
        />,
      ),
    ).toThrow(/duplicated/u);
    expect(() => renderToStaticMarkup(<AvatarUpload label="Avatar" previewAlt=" " />)).toThrow(
      /preview alt/u,
    );
    expect(() => renderToStaticMarkup(<AvatarUpload label="Avatar" showEditAction />)).toThrow(
      /requires onEdit/u,
    );
    expect(() =>
      renderToStaticMarkup(<AvatarUpload label="Avatar" maxSizeBytes={0} validateFileSize />),
    ).toThrow(/maxSizeBytes/u);
  });
});

describe("Dropzone and UploadProgress SSR contracts", () => {
  it("renders the shared picker classifier surface with explicit description and live status", () => {
    const markup = renderToStaticMarkup(
      <Dropzone
        acceptedFileTypes={["image/*", ".pdf"]}
        description="Maximum two files"
        label="Evidence intake"
        maxFiles={2}
        maxSizeBytes={1024}
        onFiles={() => undefined}
      />,
    );
    expect(markup).toContain('data-slot="dropzone"');
    expect(markup).toContain('data-slot="dropzone-label"');
    expect(markup).toContain('data-slot="file-trigger-control"');
    expect(markup).toContain('accept=".pdf,image/*"');
    expect(markup).toContain('aria-live="polite"');
    expect(markup).toContain("No files selected.");
  });

  it("forwards native form association to the one internal file input", () => {
    const markup = renderToStaticMarkup(
      <Dropzone
        form="release-form"
        label="Evidence intake"
        name="evidence"
        onFiles={() => undefined}
        required
      />,
    );
    expect(markup).toContain('name="evidence"');
    expect(markup).toContain('form="release-form"');
    expect(markup).toContain('required=""');
    expect(markup.match(/type="file"/gu)).toHaveLength(1);
  });

  it("validates dropzone bounds and visible localized actions", () => {
    const base = { label: "Evidence", onFiles: () => undefined } as const;
    expect(() => renderToStaticMarkup(<Dropzone {...base} maxFiles={0} />)).toThrow(/maxFiles/u);
    expect(() => renderToStaticMarkup(<Dropzone {...base} maxSizeBytes={0} />)).toThrow(
      /maxSizeBytes/u,
    );
    expect(() =>
      renderToStaticMarkup(<Dropzone {...base} messages={{ selectAction: " " }} />),
    ).toThrow(/selectAction/u);
    expect(() =>
      renderToStaticMarkup(<Dropzone {...base} maxSizeBytes={0} validateFileSize={false} />),
    ).not.toThrow();
  });

  it("formats IEC byte units deterministically across thresholds and locales", () => {
    expect(formatUploadBytes(0, "en-US")).toBe("0 B");
    expect(formatUploadBytes(1023, "en-US")).toBe("1,023 B");
    expect(formatUploadBytes(1024, "en-US")).toBe("1 KiB");
    expect(formatUploadBytes(1536, "en-US")).toBe("1.5 KiB");
    expect(formatUploadBytes(10 * 1024, "en-US")).toBe("10 KiB");
    expect(formatUploadBytes(1024 * 1024, "de-DE")).toBe("1 MiB");
    expect(() => formatUploadBytes(-1, "en-US")).toThrow(/non-negative/u);
  });

  it("renders determinate bytes, complete coercion, and indeterminate queue semantics", () => {
    const determinate = renderToStaticMarkup(
      <MergoraProvider locale="en-US">
        <UploadProgress
          label="evidence.pdf"
          totalBytes={10 * 1024 * 1024}
          uploadedBytes={4 * 1024 * 1024}
          value={40}
        />
      </MergoraProvider>,
    );
    expect(determinate).toContain('value="40"');
    expect(determinate).toContain("40%, 4 MiB of 10 MiB");
    expect(determinate).toContain("Uploading: 40%, 4 MiB of 10 MiB");

    const quiet = renderToStaticMarkup(
      <UploadProgress
        announceProgress={false}
        announcementStep={0}
        label="Quiet upload"
        value={40}
      />,
    );
    expect(quiet).not.toContain("upload-progress-announcement");
    expect(quiet).not.toContain('aria-live="polite"');

    const queued = renderToStaticMarkup(
      <UploadProgress label="Queued evidence" status="queued" value={42} />,
    );
    expect(queued).not.toMatch(/<progress[^>]+value=/u);
    expect(queued).toContain("Waiting to upload");

    const complete = renderToStaticMarkup(
      <UploadProgress label="Complete evidence" maximum={200} status="complete" value={130} />,
    );
    expect(complete).toMatch(/<progress[^>]+value="200"/u);
  });

  it("rejects invalid progress ranges, byte pairs, announcement steps, and messages", () => {
    expect(() => renderToStaticMarkup(<UploadProgress label=" " />)).toThrow(/visible label/u);
    expect(() => renderToStaticMarkup(<UploadProgress label="Upload" maximum={0} />)).toThrow(
      /maximum/u,
    );
    expect(() => renderToStaticMarkup(<UploadProgress label="Upload" value={101} />)).toThrow(
      /within zero and maximum/u,
    );
    expect(() =>
      renderToStaticMarkup(<UploadProgress announcementStep={0} label="Upload" />),
    ).toThrow(/announcementStep/u);
    expect(() => renderToStaticMarkup(<UploadProgress label="Upload" uploadedBytes={1} />)).toThrow(
      /supplied together/u,
    );
    expect(() =>
      renderToStaticMarkup(<UploadProgress label="Upload" totalBytes={1} uploadedBytes={2} />),
    ).toThrow(/cannot exceed/u);
    expect(() =>
      renderToStaticMarkup(
        <UploadProgress label="Upload" messages={{ error: " " }} status="error" />,
      ),
    ).toThrow(/status messages/u);
  });
});
