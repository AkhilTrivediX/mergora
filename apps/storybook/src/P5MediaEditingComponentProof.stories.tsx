import type { Meta, StoryObj } from "@storybook/react-vite";
import type { CSSProperties, ReactElement, ReactNode } from "react";

import {
  Attachment,
  type AttachmentProps,
} from "../../../registry/source/components/attachment/index.ts";
import {
  EmojiPicker,
  type EmojiPickerItem,
} from "../../../registry/source/components/emoji-picker/index.ts";
import { Image } from "../../../registry/source/components/image/index.ts";
import { ImageCropper } from "../../../registry/source/components/image-cropper/index.ts";
import { Markdown } from "../../../registry/source/components/markdown/index.ts";
import { MarkdownEditor } from "../../../registry/source/components/markdown-editor/index.ts";
import { MediaPlayer } from "../../../registry/source/components/media-player/index.ts";
import {
  RichTextEditor,
  type RichTextEditorAdapter,
} from "../../../registry/source/components/rich-text-editor/index.ts";
import { SignaturePad } from "../../../registry/source/components/signature-pad/index.ts";
import "mergora-tokens/tokens.css";

interface MediaEditingProofArgs {
  readonly attachmentSafety: boolean;
  readonly cropNumeric: boolean;
  readonly editorPreview: boolean;
  readonly emojiSearch: boolean;
  readonly imageStatus: boolean;
  readonly markdownBoundary: boolean;
  readonly mediaTranscript: boolean;
  readonly richAdapterBoundary: boolean;
  readonly signatureKeyboard: boolean;
}

const frameStyle: CSSProperties = {
  background: "var(--mrg-semantic-color-background-canvas)",
  border: "var(--mrg-semantic-border-width-default) solid var(--mrg-semantic-color-border-strong)",
  borderRadius: "var(--mrg-semantic-radius-panel)",
  color: "var(--mrg-semantic-color-foreground-primary)",
  display: "grid",
  gap: "var(--mrg-semantic-space-stack-lg)",
  inlineSize: "min(44rem, calc(100vw - 2rem))",
  maxInlineSize: "100%",
  minInlineSize: 0,
  padding: "var(--mrg-semantic-density-panel-padding)",
};

const headingStyle: CSSProperties = {
  display: "grid",
  gap: "var(--mrg-semantic-space-stack-xs)",
};

const descriptionStyle: CSSProperties = {
  color: "var(--mrg-semantic-color-foreground-muted)",
  margin: 0,
  maxInlineSize: "65ch",
};

function SpecimenFrame({
  children,
  description,
  itemId,
  title,
}: {
  readonly children: ReactNode;
  readonly description: string;
  readonly itemId: string;
  readonly title: string;
}): ReactElement {
  return (
    <section aria-labelledby={`${itemId}-proof-title`} data-story-item={itemId} style={frameStyle}>
      <header style={headingStyle}>
        <h2 id={`${itemId}-proof-title`} style={{ margin: 0 }}>
          {title}
        </h2>
        <p style={descriptionStyle}>{description}</p>
      </header>
      {children}
    </section>
  );
}

function fixtureArtwork(label: string): string {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="960" height="600" viewBox="0 0 960 600"><rect width="960" height="600" fill="white"/><rect x="60" y="60" width="840" height="480" rx="12" fill="none" stroke="#173f2a" stroke-width="12"/><circle cx="330" cy="300" r="120" fill="#26834c"/><path d="M500 430L640 160L790 430Z" fill="#553382"/><text x="480" y="570" text-anchor="middle" font-family="Arial" font-size="32" fill="#173f2a">${label}</text></svg>`;
  return `data:image/svg+xml,${encodeURIComponent(svg)}`;
}

const artwork = fixtureArtwork("Media fixture");
const silentAudio =
  "data:audio/wav;base64,UklGRnQAAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YVAAAACAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgA==";

const emojiItems: readonly EmojiPickerItem[] = [
  {
    category: "Signals",
    emoji: "\u{2705}",
    id: "complete",
    keywords: ["approved", "ready"],
    label: "Check mark button",
  },
  {
    category: "Signals",
    emoji: "\u{1F3AF}",
    id: "focus",
    keywords: ["target", "precision"],
    label: "Direct hit",
  },
  {
    category: "Tools",
    emoji: "\u{1F6E0}\u{FE0F}",
    id: "tools",
    keywords: ["workbench", "repair"],
    label: "Hammer and wrench",
  },
  {
    category: "Notes",
    emoji: "\u{1F4DD}",
    id: "memo",
    keywords: ["write", "review"],
    label: "Memo",
  },
];

const richTextAdapter: RichTextEditorAdapter = {
  id: "storybook-plain-text-fixture",
  renderSurface: ({
    describedBy,
    disabled,
    invalid,
    labelledBy,
    onValueChange,
    readOnly,
    value,
  }) => (
    <textarea
      aria-describedby={describedBy}
      aria-invalid={invalid || undefined}
      aria-labelledby={labelledBy}
      disabled={disabled}
      readOnly={readOnly}
      style={{ boxSizing: "border-box", inlineSize: "100%", minBlockSize: "9rem" }}
      value={value}
      onChange={(event) => onValueChange(event.currentTarget.value)}
    />
  ),
  version: "1.0.0",
};

function AttachmentSpecimen({ safety }: { readonly safety: boolean }): ReactElement {
  const enhancementProps: Partial<AttachmentProps> = safety
    ? {
        safety: "unverified",
        safetyGuidance: "Verify the file with the application policy before opening it.",
        showSafetyGuidance: true,
      }
    : {};

  return (
    <SpecimenFrame
      description="File identity and native actions stay concise; an explicit, consumer-owned safety boundary is independently selectable."
      itemId="attachment"
      title="Attachment"
    >
      <Attachment
        id="component-notes"
        mediaType="text/markdown"
        name="component-notes.md"
        sizeBytes={18420}
        {...enhancementProps}
      />
    </SpecimenFrame>
  );
}

function EmojiPickerSpecimen({ searchable }: { readonly searchable: boolean }): ReactElement {
  return (
    <SpecimenFrame
      description="The localized ARIA grid remains dependency-free; optional search filters consumer-owned labels and keywords."
      itemId="emoji-picker"
      title="Emoji picker"
    >
      <EmojiPicker
        columns={4}
        defaultValue="complete"
        items={emojiItems}
        {...(searchable ? { defaultSearchValue: "precision", searchable: true } : {})}
      />
    </SpecimenFrame>
  );
}

function ImageSpecimen({ status }: { readonly status: boolean }): ReactElement {
  return (
    <SpecimenFrame
      description="Informative image semantics and source policy remain stable; the optional rail exposes load state without shifting the frame."
      itemId="image"
      title="Image"
    >
      <Image
        alt="A green circle and violet triangle inside a dark rectangular frame."
        aspectRatio="16 / 10"
        src={artwork}
        {...(status ? { showStatusRail: true } : {})}
      />
    </SpecimenFrame>
  );
}

function ImageCropperSpecimen({ numeric }: { readonly numeric: boolean }): ReactElement {
  return (
    <SpecimenFrame
      description="Pointer and keyboard crop movement remain primary; optional numeric controls make exact coordinates editable and inspectable."
      itemId="image-cropper"
      title="Image cropper"
    >
      <ImageCropper
        alt="Geometric crop source with a green circle and violet triangle."
        defaultValue={{ height: 58, width: 62, x: 18, y: 16, zoom: 1 }}
        description="Move the crop area with a pointer or arrow keys."
        label="Visible crop"
        src={artwork}
        {...(numeric ? { showNumericControls: true } : {})}
      />
    </SpecimenFrame>
  );
}

function MarkdownSpecimen({ boundary }: { readonly boundary: boolean }): ReactElement {
  return (
    <SpecimenFrame
      description="Consumer rendering stays explicit; the optional boundary identifies where parsing and sanitization ownership begins."
      itemId="markdown"
      title="Markdown"
    >
      <Markdown
        source="# Review note\n\nKeyboard and content-safety evidence are ready for inspection."
        render={({ source }) => (
          <>
            <h3>Review note</h3>
            <p>{source.split("\n\n").at(-1)}</p>
          </>
        )}
        {...(boundary
          ? {
              rendererBoundaryLabel:
                "Rendered by the application adapter; parsing and sanitization remain application-owned.",
              showRendererBoundary: true,
            }
          : {})}
      />
    </SpecimenFrame>
  );
}

function MarkdownEditorSpecimen({ preview }: { readonly preview: boolean }): ReactElement {
  return (
    <SpecimenFrame
      description="The successful native textarea stays authoritative; an optional split preview makes the consumer renderer visible beside editing."
      itemId="markdown-editor"
      title="Markdown editor"
    >
      <MarkdownEditor
        defaultValue="## Inspection note\n\nReview the keyboard and content-safety evidence."
        description="The textarea remains the native form control."
        label="Inspection note"
        {...(preview
          ? {
              previewLayout: "split" as const,
              renderPreview: (value: string) => <Markdown source={value} />,
            }
          : {})}
      />
    </SpecimenFrame>
  );
}

function MediaPlayerSpecimen({ transcript }: { readonly transcript: boolean }): ReactElement {
  return (
    <SpecimenFrame
      description="Native media controls remain the baseline; the transcript can be exposed as an explicit, media-described disclosure."
      itemId="media-player"
      title="Media player"
    >
      <MediaPlayer
        kind="audio"
        label="Component review recording"
        src={silentAudio}
        {...(transcript
          ? {
              showTranscript: true,
              transcript: (
                <p>The review covers focus order, reduced motion, and source ownership.</p>
              ),
            }
          : {})}
      />
    </SpecimenFrame>
  );
}

function RichTextEditorSpecimen({ boundary }: { readonly boundary: boolean }): ReactElement {
  return (
    <SpecimenFrame
      description="The application supplies the editing engine; an optional provenance boundary names the adapter and its ownership contract."
      itemId="rich-text-editor"
      title="Rich text editor (Labs)"
    >
      <RichTextEditor
        adapter={richTextAdapter}
        defaultValue="Adapter-owned serialized content"
        description="This fixture is an integration shell, not a bundled rich-text engine."
        label="Structured note"
        {...(boundary ? { showAdapterBoundary: true } : {})}
      />
    </SpecimenFrame>
  );
}

function SignaturePadSpecimen({ keyboard }: { readonly keyboard: boolean }): ReactElement {
  return (
    <SpecimenFrame
      description="The canvas already supports keyboard drawing; optional directional controls make the same action discoverable without adding another signature mode."
      itemId="signature-pad"
      title="Signature pad"
    >
      <SignaturePad
        description="Draw with a pointer or use arrow keys and Enter on the canvas."
        label="Approval mark"
        {...(keyboard ? { showKeyboardControls: true } : {})}
      />
    </SpecimenFrame>
  );
}

const onlyControl = (name: keyof MediaEditingProofArgs) => ({
  controls: { include: [name] },
});

const meta = {
  args: {
    attachmentSafety: false,
    cropNumeric: false,
    editorPreview: false,
    emojiSearch: false,
    imageStatus: false,
    markdownBoundary: false,
    mediaTranscript: false,
    richAdapterBoundary: false,
    signatureKeyboard: false,
  },
  argTypes: {
    attachmentSafety: {
      control: "boolean",
      description: "Show the consumer-owned file safety state and recovery guidance.",
    },
    cropNumeric: {
      control: "boolean",
      description:
        "Show exact crop coordinate inputs in addition to pointer and keyboard movement.",
    },
    editorPreview: {
      control: "boolean",
      description: "Show a split preview rendered by the supplied Markdown renderer.",
    },
    emojiSearch: {
      control: "boolean",
      description: "Show localized search over the consumer-supplied emoji collection.",
    },
    imageStatus: {
      control: "boolean",
      description: "Show the stable image load-state rail.",
    },
    markdownBoundary: {
      control: "boolean",
      description: "Show the consumer-renderer ownership boundary.",
    },
    mediaTranscript: {
      control: "boolean",
      description: "Expose the supplied transcript and connect it to the media element.",
    },
    richAdapterBoundary: {
      control: "boolean",
      description: "Show the rich-text adapter identity and ownership boundary.",
    },
    signatureKeyboard: {
      control: "boolean",
      description: "Show discoverable directional and mark-point controls for keyboard drawing.",
    },
  },
  parameters: { a11y: { test: "error" }, layout: "centered" },
  title: "Components/Media editing — component proof",
} satisfies Meta<MediaEditingProofArgs>;

export default meta;
type Story = StoryObj<MediaEditingProofArgs>;

export const BasicAttachment: Story = {
  args: { attachmentSafety: false },
  name: "Attachment · Basic",
  parameters: onlyControl("attachmentSafety"),
  render: (args) => <AttachmentSpecimen safety={args.attachmentSafety} />,
};

export const RecommendedAttachment: Story = {
  args: { attachmentSafety: true },
  name: "Attachment · Recommended Mergora",
  parameters: onlyControl("attachmentSafety"),
  render: (args) => <AttachmentSpecimen safety={args.attachmentSafety} />,
};

export const BasicEmojiPicker: Story = {
  args: { emojiSearch: false },
  name: "Emoji Picker · Basic",
  parameters: onlyControl("emojiSearch"),
  render: (args) => <EmojiPickerSpecimen searchable={args.emojiSearch} />,
};

export const RecommendedEmojiPicker: Story = {
  args: { emojiSearch: true },
  name: "Emoji Picker · Recommended Mergora",
  parameters: onlyControl("emojiSearch"),
  render: (args) => <EmojiPickerSpecimen searchable={args.emojiSearch} />,
};

export const BasicImage: Story = {
  args: { imageStatus: false },
  name: "Image · Basic",
  parameters: onlyControl("imageStatus"),
  render: (args) => <ImageSpecimen status={args.imageStatus} />,
};

export const RecommendedImage: Story = {
  args: { imageStatus: true },
  name: "Image · Recommended Mergora",
  parameters: onlyControl("imageStatus"),
  render: (args) => <ImageSpecimen status={args.imageStatus} />,
};

export const BasicImageCropper: Story = {
  args: { cropNumeric: false },
  name: "Image Cropper · Basic",
  parameters: onlyControl("cropNumeric"),
  render: (args) => <ImageCropperSpecimen numeric={args.cropNumeric} />,
};

export const RecommendedImageCropper: Story = {
  args: { cropNumeric: true },
  name: "Image Cropper · Recommended Mergora",
  parameters: onlyControl("cropNumeric"),
  render: (args) => <ImageCropperSpecimen numeric={args.cropNumeric} />,
};

export const BasicMarkdown: Story = {
  args: { markdownBoundary: false },
  name: "Markdown · Basic",
  parameters: onlyControl("markdownBoundary"),
  render: (args) => <MarkdownSpecimen boundary={args.markdownBoundary} />,
};

export const RecommendedMarkdown: Story = {
  args: { markdownBoundary: true },
  name: "Markdown · Recommended Mergora",
  parameters: onlyControl("markdownBoundary"),
  render: (args) => <MarkdownSpecimen boundary={args.markdownBoundary} />,
};

export const BasicMarkdownEditor: Story = {
  args: { editorPreview: false },
  name: "Markdown Editor · Basic",
  parameters: onlyControl("editorPreview"),
  render: (args) => <MarkdownEditorSpecimen preview={args.editorPreview} />,
};

export const RecommendedMarkdownEditor: Story = {
  args: { editorPreview: true },
  name: "Markdown Editor · Recommended Mergora",
  parameters: onlyControl("editorPreview"),
  render: (args) => <MarkdownEditorSpecimen preview={args.editorPreview} />,
};

export const BasicMediaPlayer: Story = {
  args: { mediaTranscript: false },
  name: "Media Player · Basic",
  parameters: onlyControl("mediaTranscript"),
  render: (args) => <MediaPlayerSpecimen transcript={args.mediaTranscript} />,
};

export const RecommendedMediaPlayer: Story = {
  args: { mediaTranscript: true },
  name: "Media Player · Recommended Mergora",
  parameters: onlyControl("mediaTranscript"),
  render: (args) => <MediaPlayerSpecimen transcript={args.mediaTranscript} />,
};

export const BasicRichTextEditor: Story = {
  args: { richAdapterBoundary: false },
  name: "Rich Text Editor · Basic",
  parameters: onlyControl("richAdapterBoundary"),
  render: (args) => <RichTextEditorSpecimen boundary={args.richAdapterBoundary} />,
};

export const RecommendedRichTextEditor: Story = {
  args: { richAdapterBoundary: true },
  name: "Rich Text Editor · Recommended Mergora",
  parameters: onlyControl("richAdapterBoundary"),
  render: (args) => <RichTextEditorSpecimen boundary={args.richAdapterBoundary} />,
};

export const BasicSignaturePad: Story = {
  args: { signatureKeyboard: false },
  name: "Signature Pad · Basic",
  parameters: onlyControl("signatureKeyboard"),
  render: (args) => <SignaturePadSpecimen keyboard={args.signatureKeyboard} />,
};

export const RecommendedSignaturePad: Story = {
  args: { signatureKeyboard: true },
  name: "Signature Pad · Recommended Mergora",
  parameters: onlyControl("signatureKeyboard"),
  render: (args) => <SignaturePadSpecimen keyboard={args.signatureKeyboard} />,
};
