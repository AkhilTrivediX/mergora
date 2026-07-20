import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import {
  Attachment,
  formatAttachmentSize,
} from "../../../registry/source/components/attachment/attachment.tsx";
import {
  EmojiPicker,
  filterEmojiItems,
  type EmojiPickerItem,
} from "../../../registry/source/components/emoji-picker/emoji-picker.tsx";
import { Image } from "../../../registry/source/components/image/image.tsx";
import {
  ImageCropper,
  normalizeImageCropValue,
} from "../../../registry/source/components/image-cropper/image-cropper.tsx";
import { Markdown } from "../../../registry/source/components/markdown/markdown.tsx";
import {
  MarkdownEditor,
  countMarkdownWords,
} from "../../../registry/source/components/markdown-editor/markdown-editor.tsx";
import {
  MediaPlayer,
  defaultMediaSourcePolicy,
  formatMediaTime,
} from "../../../registry/source/components/media-player/media-player.tsx";
import { RichTextEditor } from "../../../registry/source/components/rich-text-editor/rich-text-editor.tsx";
import {
  SignaturePad,
  serializeSignatureValue,
} from "../../../registry/source/components/signature-pad/signature-pad.tsx";
import {
  assertImplementationProfileShard,
  loadMergoraSignaturePolicy,
} from "../../../tooling/registry-builder/src/index.ts";

const workspaceRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
const ids = [
  "attachment",
  "emoji-picker",
  "image",
  "image-cropper",
  "markdown",
  "markdown-editor",
  "media-player",
  "rich-text-editor",
  "signature-pad",
] as const;
const emojiItems: readonly EmojiPickerItem[] = [
  { id: "wave", emoji: "👋", label: "Waving hand", category: "People", keywords: ["hello"] },
  { id: "check", emoji: "✅", label: "Check mark", category: "Symbols", keywords: ["done"] },
];

describe("media-editing canonical family", () => {
  it("keeps every optional enhancement absent from basic output", () => {
    const attachmentAction = vi.fn();
    const imageStatus = vi.fn();
    const emojiRecent = vi.fn();
    const html = renderToStaticMarkup(
      <>
        <Attachment id="file" name="notes.md" onDownload={attachmentAction} />
        <Image alt="Geometric test artwork" src="fixture.png" onLoadStateChange={imageStatus} />
        <ImageCropper alt="Crop source" label="Crop" src="fixture.png" />
        <Markdown source="# Literal" />
        <MarkdownEditor label="Note" />
        <MediaPlayer kind="audio" label="Recording" src="fixture.wav" transcript="Text" />
        <EmojiPicker items={emojiItems} onRecentIdsChange={emojiRecent} />
        <SignaturePad label="Mark" />
        <RichTextEditor
          adapter={{
            id: "fixture",
            version: "1.0.0",
            renderSurface: () => <textarea aria-label="Fixture" />,
          }}
          label="Structured note"
        />
      </>,
    );
    expect(html).not.toContain("attachment-preview");
    expect(html).not.toContain("attachment-status");
    expect(html).not.toContain("attachment-safety");
    expect(html).not.toContain("image-status");
    expect(html).not.toContain("image-cropper-numeric");
    expect(html).not.toContain("image-cropper-preview");
    expect(html).not.toContain("markdown-renderer-boundary");
    expect(html).not.toContain("markdown-editor-toolbar");
    expect(html).not.toContain("markdown-editor-preview");
    expect(html).not.toContain("media-player-transcript");
    expect(html).not.toContain("media-player-chapters");
    expect(html).not.toContain("emoji-picker-controls");
    expect(html).not.toContain("emoji-picker-summary");
    expect(html).not.toContain("signature-pad-keyboard-controls");
    expect(html).not.toContain("signature-pad-legal-caveat");
    expect(html).not.toContain("rich-text-editor-adapter-boundary");
    expect(html).not.toContain("rich-text-editor-serialization");
    expect(attachmentAction).not.toHaveBeenCalled();
    expect(imageStatus).not.toHaveBeenCalled();
    expect(emojiRecent).not.toHaveBeenCalled();
  });

  it("renders useful independently selected enhancements with explicit semantics", () => {
    const html = renderToStaticMarkup(
      <>
        <Attachment
          id="file"
          name="notes.md"
          preview="MD"
          progress={50}
          showPreview
          showSafetyGuidance
          showStatusRail
        />
        <Image alt="Geometric test artwork" showStatusRail src="fixture.png" />
        <ImageCropper
          alt="Crop source"
          label="Crop"
          showNumericControls
          showPreview
          showRuleOfThirds
          src="fixture.png"
        />
        <Markdown
          announceStreamingUpdates
          render={({ source }) => <p>{source}</p>}
          showRendererBoundary
          source="Rendered"
          streaming
        />
        <MarkdownEditor label="Note" previewLayout="split" showToolbar showWordCount />
        <MediaPlayer
          chapters={[{ id: "start", label: "Start", startTime: 0 }]}
          kind="audio"
          label="Recording"
          showChapterNavigation
          showTimeAnnouncements
          showTranscript
          src="fixture.wav"
          transcript="Text"
        />
        <EmojiPicker
          items={emojiItems}
          recentIds={["check"]}
          searchable
          showCategories
          showRecents
          showResultSummary
          showSkinToneSelector
        />
        <SignaturePad
          enableFileAlternative
          enableTextAlternative
          label="Mark"
          showKeyboardControls
          showLegalCaveat
        />
        <RichTextEditor
          adapter={{
            id: "fixture",
            version: "1.0.0",
            renderSurface: () => <textarea aria-label="Fixture" />,
          }}
          label="Structured note"
          showAdapterBoundary
          showSerializationPreview
          showStatusRail
        />
      </>,
    );
    [
      "attachment-safety",
      "image-status",
      "image-cropper-numeric",
      "image-cropper-preview",
      "markdown-renderer-boundary",
      "markdown-editor-toolbar",
      "markdown-editor-preview",
      "media-player-transcript",
      "media-player-chapters",
      "emoji-picker-controls",
      "emoji-picker-summary",
      "signature-pad-keyboard-controls",
      "signature-pad-legal-caveat",
      "rich-text-editor-adapter-boundary",
      "rich-text-editor-serialization",
      "rich-text-editor-status",
    ].forEach((slot) => expect(html).toContain(slot));
    expect(html).toContain('role="grid"');
    expect(html).toContain('role="toolbar"');
    expect(html).toContain("File contents are not verified");
  });

  it("normalizes domain helpers deterministically across locale and boundary inputs", () => {
    expect(formatAttachmentSize(18420, "en-US")).toBe("18.4 kB");
    expect(() => formatAttachmentSize(-1)).toThrow(/non-negative/u);
    expect(formatMediaTime(65)).toBe("1:05");
    expect(defaultMediaSourcePolicy("javascript:alert(1)")).toBe(false);
    expect(defaultMediaSourcePolicy(" fixture.wav ")).toBe(true);
    expect(countMarkdownWords("One 二 three’s")).toBe(3);
    expect(filterEmojiItems(emojiItems, "DONE", "", "en-US").map((item) => item.id)).toEqual([
      "check",
    ]);
    expect(normalizeImageCropValue({ x: 99, y: -4, width: 80, height: 80, zoom: 9 })).toEqual({
      x: 20,
      y: 0,
      width: 80,
      height: 80,
      zoom: 4,
    });
    expect(serializeSignatureValue({ method: "text", text: "Asha" })).toBe(
      '{"method":"text","text":"Asha"}',
    );
  });

  it("preserves controlled filters, exact renderer output, and disabled form behavior", () => {
    const adapterChange = vi.fn();
    const html = renderToStaticMarkup(
      <>
        <EmojiPicker items={emojiItems} searchable searchValue="no-match" showResultSummary />
        <Markdown render={() => null} source="must not leak" />
        <ImageCropper alt="Crop source" disabled label="Crop" name="crop" src="fixture.png" />
        <RichTextEditor
          adapter={{
            id: "fixture",
            version: "1.0.0",
            renderSurface: (context) => {
              context.onValueChange("ignored while disabled");
              return <textarea aria-label="Fixture" disabled />;
            },
          }}
          disabled
          label="Structured note"
          name="rich"
          onValueChange={adapterChange}
        />
        <SignaturePad disabled label="Mark" name="signature" />
      </>,
    );
    expect(html).toContain("0 emoji available");
    expect(html).not.toContain("must not leak");
    expect(html).toContain('data-slot="image-cropper-input" disabled=""');
    expect(html).toContain('data-slot="rich-text-editor-input" disabled=""');
    expect(html).toContain('data-slot="signature-pad-input" disabled=""');
    expect(adapterChange).not.toHaveBeenCalled();
  });

  it("validates media chapters and exposes native required recovery for drawn signatures", () => {
    expect(() =>
      renderToStaticMarkup(
        <MediaPlayer
          chapters={[{ id: "broken", label: "Broken", startTime: -1 }]}
          kind="audio"
          label="Recording"
          src="fixture.wav"
        />,
      ),
    ).toThrow(/non-negative start times/u);
    const signature = renderToStaticMarkup(<SignaturePad label="Mark" required />);
    expect(signature).toContain('aria-label="Signature completion"');
    expect(signature).toContain('required=""');
  });

  it("keeps source/docs free of unsafe rendering claims, gradients, large radii, and hard-coded salary examples", () => {
    for (const id of ids) {
      const directory = resolve(workspaceRoot, "registry/source/components", id);
      const source = readFileSync(resolve(directory, `${id}.tsx`), "utf8");
      const css = readFileSync(resolve(directory, `${id}.css`), "utf8");
      const readme = readFileSync(resolve(directory, "README.md"), "utf8");
      expect(source).not.toContain("dangerouslySetInnerHTML");
      expect(`${source}\n${css}\n${readme}`).not.toMatch(/salary|compensation|recruitment/iu);
      expect(css).not.toMatch(/(?:linear|radial|conic)-gradient/iu);
      expect(css).not.toMatch(/border-radius:\s*(?:1[7-9]|[2-9]\d)px/iu);
      expect(readme).toMatch(/source present|source-present|Labs source present/iu);
    }
  });

  it("validates the complete implementation profile shard", () => {
    const policy = loadMergoraSignaturePolicy(workspaceRoot);
    const shard = JSON.parse(
      readFileSync(
        resolve(workspaceRoot, "registry/quality/implementation-profiles/media-editing.v1.json"),
        "utf8",
      ),
    );
    expect(() => assertImplementationProfileShard(shard, policy)).not.toThrow();
    expect(shard.auditPendingIds).toEqual([]);
    expect(shard.profiles.map((profile: { id: string }) => profile.id).sort()).toEqual(
      [...ids].sort(),
    );
  });
});
