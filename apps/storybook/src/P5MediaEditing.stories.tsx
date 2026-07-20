import type { Meta, StoryObj } from "@storybook/react-vite";
import { useState, type CSSProperties, type ReactNode } from "react";

import "mergora-tokens/tokens.css";
import { Attachment } from "../../../registry/source/components/attachment/attachment";
import {
  EmojiPicker,
  type EmojiPickerItem,
} from "../../../registry/source/components/emoji-picker/emoji-picker";
import { Image } from "../../../registry/source/components/image/image";
import {
  ImageCropper,
  type ImageCropValue,
} from "../../../registry/source/components/image-cropper/image-cropper";
import { Markdown } from "../../../registry/source/components/markdown/markdown";
import { MarkdownEditor } from "../../../registry/source/components/markdown-editor/markdown-editor";
import { MediaPlayer } from "../../../registry/source/components/media-player/media-player";
import {
  RichTextEditor,
  type RichTextEditorAdapter,
} from "../../../registry/source/components/rich-text-editor/rich-text-editor";
import { SignaturePad } from "../../../registry/source/components/signature-pad/signature-pad";

const canvasStyle = {
  background: "var(--mrg-semantic-color-background-canvas)",
  boxSizing: "border-box",
  color: "var(--mrg-semantic-color-foreground-primary)",
  fontFamily: "var(--mrg-semantic-font-family-prose)",
  inlineSize: "100%",
  minBlockSize: "100vh",
  padding: "var(--mrg-semantic-space-stack-lg)",
} satisfies CSSProperties;

const workbenchStyle = {
  display: "grid",
  gap: "var(--mrg-semantic-space-stack-xl)",
  marginInline: "auto",
  maxInlineSize: "70rem",
  minInlineSize: 0,
} satisfies CSSProperties;

const specimenStyle = {
  borderBlockStart:
    "var(--mrg-semantic-border-width-strong) solid var(--mrg-semantic-color-border-strong)",
  display: "grid",
  gap: "var(--mrg-semantic-space-stack-md)",
  minInlineSize: 0,
  paddingBlockStart: "var(--mrg-semantic-space-inset-md)",
} satisfies CSSProperties;

function Canvas({
  children,
  direction = "ltr",
}: {
  readonly children: ReactNode;
  readonly direction?: "ltr" | "rtl";
}) {
  return (
    <main dir={direction} style={canvasStyle}>
      <div style={workbenchStyle}>{children}</div>
    </main>
  );
}

function Specimen({ title, children }: { readonly title: string; readonly children: ReactNode }) {
  return (
    <section style={specimenStyle}>
      <h2 style={{ margin: 0 }}>{title}</h2>
      {children}
    </section>
  );
}

function geometryArtwork(label: string): string {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="960" height="600" viewBox="0 0 960 600"><rect width="960" height="600" fill="white"/><rect x="80" y="70" width="800" height="460" rx="12" fill="none" stroke="#173f2a" stroke-width="12"/><circle cx="330" cy="300" r="120" fill="#26834c"/><path d="M500 430L640 160L790 430Z" fill="#553382"/><text x="480" y="570" text-anchor="middle" font-family="Arial" font-size="34" fill="#173f2a">${label}</text></svg>`;
  return `data:image/svg+xml,${encodeURIComponent(svg)}`;
}

const artwork = geometryArtwork("Crop inspection source");
const silentAudio =
  "data:audio/wav;base64,UklGRnQAAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YVAAAACAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgA==";

const emojiItems: readonly EmojiPickerItem[] = [
  {
    id: "check",
    emoji: "✅",
    label: "Check mark button",
    category: "Symbols",
    keywords: ["complete", "done"],
  },
  {
    id: "spark",
    emoji: "✨",
    label: "Sparkles",
    category: "Symbols",
    keywords: ["new", "highlight"],
  },
  {
    id: "wave",
    emoji: "👋",
    label: "Waving hand",
    category: "People",
    keywords: ["hello"],
    tones: { light: "👋🏻", medium: "👋🏽", dark: "👋🏿" },
  },
  {
    id: "focus",
    emoji: "🎯",
    label: "Direct hit",
    category: "Objects",
    keywords: ["focus", "target"],
  },
  {
    id: "tools",
    emoji: "🛠️",
    label: "Hammer and wrench",
    category: "Objects",
    keywords: ["workbench", "repair"],
  },
  {
    id: "globe",
    emoji: "🌍",
    label: "Globe showing Europe and Africa",
    category: "Travel",
    keywords: ["world", "locale"],
  },
  { id: "memo", emoji: "📝", label: "Memo", category: "Objects", keywords: ["write", "note"] },
  { id: "lock", emoji: "🔒", label: "Locked", category: "Objects", keywords: ["safe", "security"] },
  {
    id: "warning",
    emoji: "⚠️",
    label: "Warning",
    category: "Symbols",
    keywords: ["caution", "unsafe"],
  },
  {
    id: "speaker",
    emoji: "🔊",
    label: "Speaker with high volume",
    category: "Objects",
    keywords: ["audio", "sound"],
  },
];

const richTextAdapter: RichTextEditorAdapter = {
  id: "storybook-plain-text-fixture",
  version: "1.0.0",
  renderSurface: ({
    value,
    disabled,
    readOnly,
    labelledBy,
    describedBy,
    invalid,
    onValueChange,
  }) => (
    <textarea
      aria-describedby={describedBy}
      aria-invalid={invalid || undefined}
      aria-labelledby={labelledBy}
      disabled={disabled}
      readOnly={readOnly}
      style={{ boxSizing: "border-box", minBlockSize: "10rem", inlineSize: "100%" }}
      value={value}
      onChange={(event) => onValueChange(event.currentTarget.value)}
    />
  ),
};

interface MediaEditingWorkbenchProps {
  readonly attachmentChecksum?: boolean;
  readonly attachmentPreview?: boolean;
  readonly attachmentSafety?: boolean;
  readonly attachmentStatus?: boolean;
  readonly cropNumeric?: boolean;
  readonly cropPreview?: boolean;
  readonly cropThirds?: boolean;
  readonly emojiCategories?: boolean;
  readonly emojiRecents?: boolean;
  readonly emojiSearch?: boolean;
  readonly emojiSkinTones?: boolean;
  readonly emojiSummary?: boolean;
  readonly imageStatus?: boolean;
  readonly markdownBoundary?: boolean;
  readonly markdownRenderer?: boolean;
  readonly markdownStreaming?: boolean;
  readonly markdownStreamingAnnouncements?: boolean;
  readonly editorPreview?: boolean;
  readonly editorToolbar?: boolean;
  readonly editorWordCount?: boolean;
  readonly mediaChapters?: boolean;
  readonly mediaTimeAnnouncements?: boolean;
  readonly mediaTranscript?: boolean;
  readonly richAdapterBoundary?: boolean;
  readonly richSerialization?: boolean;
  readonly richStatus?: boolean;
  readonly signatureFile?: boolean;
  readonly signatureAnnouncements?: boolean;
  readonly signatureKeyboard?: boolean;
  readonly signatureLegal?: boolean;
  readonly signatureText?: boolean;
}

function MediaEditingWorkbench({
  attachmentChecksum = false,
  attachmentPreview = false,
  attachmentSafety = false,
  attachmentStatus = false,
  cropNumeric = false,
  cropPreview = false,
  cropThirds = false,
  emojiCategories = false,
  emojiRecents = false,
  emojiSearch = false,
  emojiSkinTones = false,
  emojiSummary = false,
  imageStatus = false,
  markdownBoundary = false,
  markdownRenderer = false,
  markdownStreaming = false,
  markdownStreamingAnnouncements = false,
  editorPreview = false,
  editorToolbar = false,
  editorWordCount = false,
  mediaChapters = false,
  mediaTimeAnnouncements = false,
  mediaTranscript = false,
  richAdapterBoundary = false,
  richSerialization = false,
  richStatus = false,
  signatureFile = false,
  signatureAnnouncements = false,
  signatureKeyboard = false,
  signatureLegal = false,
  signatureText = false,
}: MediaEditingWorkbenchProps) {
  const [emoji, setEmoji] = useState("check");
  const [recentEmoji, setRecentEmoji] = useState<readonly string[]>(["tools", "focus"]);
  const [crop, setCrop] = useState<ImageCropValue>({
    x: 18,
    y: 16,
    width: 62,
    height: 62,
    zoom: 1,
  });
  const [markdown, setMarkdown] = useState(
    "# Inspection note\n\nKeyboard, touch, and safe rendering remain visible concerns.",
  );
  const [richValue, setRichValue] = useState("Adapter-owned serialized value");

  return (
    <>
      <Specimen title="Attachment">
        <Attachment
          checksum="sha256:4c9f7d2b"
          id="release-notes"
          mediaType="text/markdown"
          name="release-notes.md"
          preview={<span aria-hidden="true">MD</span>}
          progress={64}
          safety="unverified"
          safetyGuidance="Scan and authorize the file before opening it."
          showChecksum={attachmentChecksum}
          showPreview={attachmentPreview}
          showSafetyGuidance={attachmentSafety}
          showStatusRail={attachmentStatus}
          sizeBytes={18420}
          status="uploading"
          statusLabel="Uploading"
          onDownload={() => undefined}
          onRemove={() => undefined}
        />
      </Specimen>
      <Specimen title="Image">
        <Image
          alt="A green circle and violet triangle inside an ink frame."
          aspectRatio="16 / 10"
          showStatusRail={imageStatus}
          src={artwork}
        />
      </Specimen>
      <Specimen title="Image cropper">
        <ImageCropper
          alt="A geometric crop inspection image."
          description="Move the crop with pointer or arrow keys. Shift plus arrow moves by ten steps."
          label="Visible crop"
          showNumericControls={cropNumeric}
          showPreview={cropPreview}
          showRuleOfThirds={cropThirds}
          src={artwork}
          value={crop}
          onValueChange={setCrop}
        />
      </Specimen>
      <Specimen title="Media player">
        <MediaPlayer
          chapters={[{ id: "opening", label: "Opening", startTime: 0 }]}
          kind="audio"
          label="Interface review recording"
          showChapterNavigation={mediaChapters}
          showTimeAnnouncements={mediaTimeAnnouncements}
          showTranscript={mediaTranscript}
          src={silentAudio}
          transcript={
            <p>The recording begins with a review of the component interaction contract.</p>
          }
        />
      </Specimen>
      <Specimen title="Markdown">
        <Markdown
          announceStreamingUpdates={markdownStreamingAnnouncements}
          showRendererBoundary={markdownBoundary}
          source={markdown}
          streaming={markdownStreaming}
          {...(markdownRenderer
            ? {
                render: ({ source }: { readonly source: string }) => (
                  <>
                    <h3>Inspection note</h3>
                    <p>{source.replace(/^# Inspection note\s*/u, "")}</p>
                  </>
                ),
              }
            : {})}
        />
      </Specimen>
      <Specimen title="Markdown editor">
        <MarkdownEditor
          description="The textarea remains the successful native form control."
          label="Release note"
          previewLayout={editorPreview ? "split" : false}
          renderPreview={(value) => <Markdown source={value} />}
          showToolbar={editorToolbar}
          showWordCount={editorWordCount}
          value={markdown}
          onValueChange={setMarkdown}
        />
      </Specimen>
      <Specimen title="Emoji picker">
        <EmojiPicker
          items={emojiItems}
          recentIds={recentEmoji}
          searchable={emojiSearch}
          showCategories={emojiCategories}
          showRecents={emojiRecents}
          showResultSummary={emojiSummary}
          showSkinToneSelector={emojiSkinTones}
          value={emoji}
          onRecentIdsChange={setRecentEmoji}
          onValueChange={setEmoji}
        />
      </Specimen>
      <Specimen title="Signature pad">
        <SignaturePad
          announceChanges={signatureAnnouncements}
          description="Draw with a pointer or use the keyboard, typed, or file path when enabled."
          enableFileAlternative={signatureFile}
          enableTextAlternative={signatureText}
          label="Approval mark"
          showKeyboardControls={signatureKeyboard}
          showLegalCaveat={signatureLegal}
        />
      </Specimen>
      <Specimen title="Rich text editor (Labs)">
        <RichTextEditor
          adapter={richTextAdapter}
          description="Labs integration shell. This fixture is intentionally not presented as a rich editor engine."
          label="Structured note"
          showAdapterBoundary={richAdapterBoundary}
          showSerializationPreview={richSerialization}
          showStatusRail={richStatus}
          value={richValue}
          onValueChange={setRichValue}
        />
      </Specimen>
    </>
  );
}

const meta = {
  title: "Components/Media editing",
  component: MediaEditingWorkbench,
  parameters: { layout: "fullscreen" },
  argTypes: {
    attachmentChecksum: { control: "boolean" },
    attachmentPreview: { control: "boolean" },
    attachmentSafety: { control: "boolean" },
    attachmentStatus: { control: "boolean" },
    cropNumeric: { control: "boolean" },
    cropPreview: { control: "boolean" },
    cropThirds: { control: "boolean" },
    emojiCategories: { control: "boolean" },
    emojiRecents: { control: "boolean" },
    emojiSearch: { control: "boolean" },
    emojiSkinTones: { control: "boolean" },
    emojiSummary: { control: "boolean" },
    imageStatus: { control: "boolean" },
    markdownBoundary: { control: "boolean" },
    markdownRenderer: { control: "boolean" },
    markdownStreaming: { control: "boolean" },
    markdownStreamingAnnouncements: { control: "boolean" },
    editorPreview: { control: "boolean" },
    editorToolbar: { control: "boolean" },
    editorWordCount: { control: "boolean" },
    mediaChapters: { control: "boolean" },
    mediaTimeAnnouncements: { control: "boolean" },
    mediaTranscript: { control: "boolean" },
    richAdapterBoundary: { control: "boolean" },
    richSerialization: { control: "boolean" },
    richStatus: { control: "boolean" },
    signatureFile: { control: "boolean" },
    signatureAnnouncements: { control: "boolean" },
    signatureKeyboard: { control: "boolean" },
    signatureLegal: { control: "boolean" },
    signatureText: { control: "boolean" },
  },
} satisfies Meta<typeof MediaEditingWorkbench>;

export default meta;
type Story = StoryObj<typeof meta>;

export const BasicDefaults: Story = {
  args: {},
  render: (args) => (
    <Canvas>
      <MediaEditingWorkbench {...args} />
    </Canvas>
  ),
};

export const RecommendedMergora: Story = {
  args: {
    attachmentChecksum: true,
    attachmentPreview: true,
    attachmentSafety: true,
    attachmentStatus: true,
    cropNumeric: true,
    cropPreview: true,
    cropThirds: true,
    emojiCategories: true,
    emojiRecents: true,
    emojiSearch: true,
    emojiSkinTones: true,
    emojiSummary: true,
    imageStatus: true,
    markdownBoundary: true,
    markdownRenderer: true,
    markdownStreaming: true,
    markdownStreamingAnnouncements: true,
    editorPreview: true,
    editorToolbar: true,
    editorWordCount: true,
    mediaChapters: true,
    mediaTimeAnnouncements: true,
    mediaTranscript: true,
    richAdapterBoundary: true,
    richSerialization: true,
    richStatus: true,
    signatureAnnouncements: true,
    signatureFile: true,
    signatureKeyboard: true,
    signatureLegal: true,
    signatureText: true,
  },
  render: (args) => (
    <Canvas>
      <MediaEditingWorkbench {...args} />
    </Canvas>
  ),
};

export const NarrowRtl: Story = {
  args: RecommendedMergora.args ?? {},
  globals: { viewport: { value: "mobile1" } },
  render: (args) => (
    <Canvas direction="rtl">
      <MediaEditingWorkbench {...args} />
    </Canvas>
  ),
};

export const StateMatrix: Story = {
  render: () => (
    <Canvas>
      <Specimen title="Disabled and read only">
        <Attachment disabled id="locked-file" name="locked-file.txt" onDownload={() => undefined} />
        <ImageCropper alt="Disabled crop source." disabled label="Disabled crop" src={artwork} />
        <ImageCropper
          alt="Read-only crop source."
          label="Read-only crop"
          readOnly
          showNumericControls
          src={artwork}
        />
        <EmojiPicker disabled items={emojiItems} />
        <MarkdownEditor disabled label="Disabled note" value="Content remains readable." />
        <SignaturePad label="Read-only mark" readOnly />
        <RichTextEditor
          adapter={richTextAdapter}
          disabled
          label="Disabled structured note"
          value="Serialized content remains readable."
        />
      </Specimen>
      <Specimen title="Invalid, loading, empty, and error">
        <Attachment
          id="failed-file"
          name="failed-file.txt"
          showStatusRail
          status="error"
          statusLabel="Upload failed. Remove the file or try again."
        />
        <MarkdownEditor
          error="Add a recovery detail before continuing."
          invalid
          label="Invalid note"
          value=""
        />
        <Markdown emptyFallback="No note has been added." source="" />
        <Image
          alt="A source intentionally rejected by policy."
          fallback="Choose a permitted image source."
          showStatusRail
          sourcePolicy={() => false}
          src="blocked:fixture"
        />
        <MediaPlayer
          kind="audio"
          label="Rejected recording"
          src="blocked:fixture"
          validateSource={() => false}
        />
        <EmojiPicker items={[]} searchable showResultSummary />
        <RichTextEditor
          adapter={richTextAdapter}
          label="Invalid structured note"
          showStatusRail
          validateSerializedValue={() => "The adapter value cannot be empty."}
          value=""
        />
      </Specimen>
    </Canvas>
  ),
};

export const FormSerializationAndReset: Story = {
  render: () => (
    <Canvas>
      <form
        id="media-editing-form"
        onSubmit={(event) => {
          event.preventDefault();
          const output = event.currentTarget.querySelector('[data-slot="form-submission-output"]');
          if (output !== null)
            output.textContent = JSON.stringify(
              Object.fromEntries(new FormData(event.currentTarget)),
            );
        }}
      >
        <MarkdownEditor
          defaultValue="Initial note"
          form="media-editing-form"
          label="Form note"
          name="note"
        />
        <ImageCropper
          alt="Form crop source."
          defaultValue={{ x: 12, y: 14, width: 64, height: 60, zoom: 1 }}
          form="media-editing-form"
          label="Form crop"
          name="crop"
          showNumericControls
          src={artwork}
        />
        <SignaturePad
          defaultValue={{ method: "text", text: "Initial mark" }}
          enableTextAlternative
          form="media-editing-form"
          label="Form signature"
          name="signature"
        />
        <RichTextEditor
          adapter={richTextAdapter}
          defaultValue="Initial structured note"
          form="media-editing-form"
          label="Form structured note"
          name="richNote"
        />
        <div style={{ display: "flex", gap: "1rem", marginBlock: "1rem" }}>
          <button type="submit">Submit example</button>
          <button type="reset">Reset example</button>
        </div>
        <output aria-live="polite" data-slot="form-submission-output">
          No form submission yet.
        </output>
      </form>
    </Canvas>
  ),
};
