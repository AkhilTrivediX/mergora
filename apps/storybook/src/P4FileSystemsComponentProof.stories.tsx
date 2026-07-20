import type { Meta, StoryObj } from "@storybook/react-vite";
import { useState, type CSSProperties, type ReactElement, type ReactNode } from "react";

import { AvatarUpload } from "../../../registry/source/components/avatar-upload/index.ts";
import { Dropzone } from "../../../registry/source/components/dropzone/index.ts";
import {
  FileUpload,
  type FileUploadItem,
} from "../../../registry/source/components/file-upload/index.ts";
import { FileTrigger } from "../../../registry/source/components/file-trigger/index.ts";
import {
  UploadProgress,
  type UploadProgressStatus,
} from "../../../registry/source/components/upload-progress/index.ts";
import "mergora-tokens/tokens.css";

interface FileSystemsComponentProofArgs {
  readonly acceptedTypeGuidance: boolean;
  readonly announceProgress: boolean;
  readonly avatarEditAction: boolean;
  readonly avatarImageMetadata: boolean;
  readonly avatarPreview: boolean;
  readonly avatarRejectionRecovery: boolean;
  readonly avatarRemoveAction: boolean;
  readonly avatarRetryAction: boolean;
  readonly avatarUploadProgress: boolean;
  readonly fileCancelActions: boolean;
  readonly fileDuplicateDetection: boolean;
  readonly filePreviews: boolean;
  readonly fileRejectionRecovery: boolean;
  readonly fileRemoveActions: boolean;
  readonly fileReordering: boolean;
  readonly fileRetryActions: boolean;
  readonly fileUploadProgress: boolean;
  readonly preflightSizeValidation: boolean;
  readonly showByteContext: boolean;
}

const specimenStyle: CSSProperties = {
  background: "var(--mrg-semantic-color-background-canvas)",
  border: "var(--mrg-semantic-border-width-default) solid var(--mrg-semantic-color-border-strong)",
  borderRadius: "var(--mrg-semantic-radius-panel)",
  color: "var(--mrg-semantic-color-foreground-primary)",
  display: "grid",
  gap: "var(--mrg-semantic-space-stack-md)",
  inlineSize: "min(44rem, calc(100vw - 2rem))",
  maxInlineSize: "100%",
  padding: "var(--mrg-semantic-density-panel-padding)",
};

const previewStyle: CSSProperties = {
  alignItems: "center",
  background: "var(--mrg-semantic-color-background-surface-sunken)",
  borderRadius: "var(--mrg-semantic-radius-compact)",
  color: "var(--mrg-semantic-color-foreground-muted)",
  display: "inline-flex",
  fontWeight: "var(--mrg-semantic-font-weight-label)",
  minBlockSize: "var(--mrg-semantic-size-target-minimum)",
  paddingInline: "var(--mrg-semantic-density-control-padding-inline)",
};

function Specimen({
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
    <section
      aria-labelledby={`${itemId}-proof-title`}
      data-story-item={itemId}
      style={specimenStyle}
    >
      <header>
        <h2 id={`${itemId}-proof-title`} style={{ margin: 0 }}>
          {title}
        </h2>
        <p
          style={{
            color: "var(--mrg-semantic-color-foreground-muted)",
            marginBlock: "var(--mrg-semantic-space-stack-xs) 0",
            maxInlineSize: "65ch",
          }}
        >
          {description}
        </p>
      </header>
      {children}
    </section>
  );
}

function makeStoryFile(name: string, type: string, content: string): File {
  return new File([content], name, { lastModified: 1_700_000_000_000, type });
}

function FileTriggerSpecimen({
  acceptedTypeGuidance,
}: Pick<FileSystemsComponentProofArgs, "acceptedTypeGuidance">) {
  return (
    <Specimen
      description="The visible action remains one native file input, preserving picker security, keyboard activation, form participation, and reset."
      itemId="file-trigger"
      title="Native file trigger"
    >
      <FileTrigger
        {...(acceptedTypeGuidance ? { acceptedFileTypes: ["image/*", ".pdf"] } : {})}
        description={
          acceptedTypeGuidance
            ? "Choose an image or PDF note; the native picker receives the same normalized guidance."
            : "Choose a local file when you are ready."
        }
        label="Choose evidence file"
        name="evidence-file"
      />
    </Specimen>
  );
}

function DropzoneSpecimen({
  acceptedTypeGuidance,
  preflightSizeValidation,
}: Pick<
  FileSystemsComponentProofArgs,
  "acceptedTypeGuidance" | "preflightSizeValidation"
>): ReactElement {
  const guidance = [
    acceptedTypeGuidance ? "image or PDF files" : "local files",
    preflightSizeValidation ? "up to 2 MiB each" : null,
  ]
    .filter(Boolean)
    .join(" ");
  return (
    <Specimen
      description="Picker, paste, and drop share one latest-request classifier while upload transport remains consumer-owned."
      itemId="dropzone"
      title="Multi-path file intake"
    >
      <Dropzone
        {...(acceptedTypeGuidance ? { acceptedFileTypes: ["image/*", ".pdf"] } : {})}
        description={`Choose, paste, or drop ${guidance}.`}
        label="Supporting files"
        maxFiles={4}
        {...(preflightSizeValidation ? { maxSizeBytes: 2 * 1024 * 1024 } : {})}
        onFiles={() => undefined}
        validateFileSize={preflightSizeValidation}
      />
    </Specimen>
  );
}

function UploadProgressSpecimen({
  announceProgress,
  showByteContext,
}: Pick<FileSystemsComponentProofArgs, "announceProgress" | "showByteContext">): ReactElement {
  return (
    <Specimen
      description="Consumer-owned lifecycle state stays visually stable; byte context and paced announcements are separate choices."
      itemId="upload-progress"
      title="Upload lifecycle rail"
    >
      <UploadProgress
        announceProgress={announceProgress}
        {...(announceProgress ? { announcementStep: 20 } : {})}
        label="Interface inventory"
        message="You can continue reviewing while the transfer runs."
        status="uploading"
        {...(showByteContext ? { totalBytes: 2 * 1024 * 1024, uploadedBytes: 512 * 1024 } : {})}
        value={25}
      />
    </Specimen>
  );
}

function initialQueue(): readonly FileUploadItem[] {
  return [
    {
      file: makeStoryFile("interface-map.png", "image/png", "image fixture"),
      id: "interface-map",
      message: "Transfer is consumer-controlled.",
      progress: 38,
      status: "uploading",
      totalBytes: 512,
      uploadedBytes: 194,
    },
    {
      file: makeStoryFile("review-notes.pdf", "application/pdf", "document fixture"),
      id: "review-notes",
      message: "The consumer can retry this item.",
      progress: 62,
      status: "error",
      totalBytes: 1024,
      uploadedBytes: 635,
    },
  ];
}

function FileUploadSpecimen({
  acceptedTypeGuidance,
  fileCancelActions,
  fileDuplicateDetection,
  filePreviews,
  fileRejectionRecovery,
  fileRemoveActions,
  fileReordering,
  fileRetryActions,
  fileUploadProgress,
  preflightSizeValidation,
}: Pick<
  FileSystemsComponentProofArgs,
  | "acceptedTypeGuidance"
  | "fileCancelActions"
  | "fileDuplicateDetection"
  | "filePreviews"
  | "fileRejectionRecovery"
  | "fileRemoveActions"
  | "fileReordering"
  | "fileRetryActions"
  | "fileUploadProgress"
  | "preflightSizeValidation"
>): ReactElement {
  const [items, setItems] = useState<readonly FileUploadItem[]>(initialQueue);
  const updateStatus = (id: string, status: UploadProgressStatus): void =>
    setItems((current) => current.map((item) => (item.id === id ? { ...item, status } : item)));
  const description = [
    acceptedTypeGuidance ? "Images and PDF notes" : "Files",
    preflightSizeValidation ? "must be no larger than 2 MiB" : "remain consumer-owned",
    fileDuplicateDetection ? "and exact duplicates are rejected" : null,
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <Specimen
      description="Preflight, recovery, previews, lifecycle actions, and accessible ordering stay independently selectable around a native-backed queue."
      itemId="file-upload"
      title="Inspectable upload queue"
    >
      <FileUpload
        {...(acceptedTypeGuidance ? { acceptedFileTypes: ["image/*", ".pdf"] } : {})}
        description={`${description}.`}
        duplicatePolicy={fileDuplicateDetection ? "reject" : "allow"}
        items={items}
        label="Review files"
        maxFiles={4}
        {...(preflightSizeValidation ? { maxSizeBytes: 2 * 1024 * 1024 } : {})}
        {...(fileCancelActions
          ? { onCancel: (item: FileUploadItem) => updateStatus(item.id, "cancelled") }
          : {})}
        onItemsChange={setItems}
        {...(fileRetryActions
          ? { onRetry: (item: FileUploadItem) => updateStatus(item.id, "retrying") }
          : {})}
        {...(filePreviews
          ? {
              renderPreview: (item: FileUploadItem) => (
                <span style={previewStyle}>
                  {item.file.type.startsWith("image/") ? "Image preview" : "Document preview"}
                </span>
              ),
            }
          : {})}
        reorderable={fileReordering}
        showCancelActions={fileCancelActions}
        showProgress={fileUploadProgress}
        showRejectionRecovery={fileRejectionRecovery}
        showRemoveActions={fileRemoveActions}
        showRetryActions={fileRetryActions}
        validateFileSize={preflightSizeValidation}
      />
    </Specimen>
  );
}

function AvatarUploadSpecimen({
  avatarEditAction,
  avatarImageMetadata,
  avatarPreview,
  avatarRejectionRecovery,
  avatarRemoveAction,
  avatarRetryAction,
  avatarUploadProgress,
}: Pick<
  FileSystemsComponentProofArgs,
  | "avatarEditAction"
  | "avatarImageMetadata"
  | "avatarPreview"
  | "avatarRejectionRecovery"
  | "avatarRemoveAction"
  | "avatarRetryAction"
  | "avatarUploadProgress"
>): ReactElement {
  const [file, setFile] = useState<File | null>(() =>
    makeStoryFile(
      "profile-mark.svg",
      "image/svg+xml",
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 40 40"><circle cx="20" cy="20" r="16" fill="#14733b"/></svg>',
    ),
  );
  const [status, setStatus] = useState<UploadProgressStatus>("error");

  return (
    <Specimen
      description="Preview ownership, metadata, editing, removal, rejection recovery, progress, and retry integrate without taking over cropping or network work."
      itemId="avatar-upload"
      title="Avatar replacement lifecycle"
    >
      <AvatarUpload
        description="Choose a profile image from this device."
        label="Profile image"
        {...(avatarEditAction ? { onEdit: () => undefined } : {})}
        {...(avatarRetryAction ? { onRetry: () => setStatus("retrying") } : {})}
        onValueChange={setFile}
        {...(avatarPreview
          ? {
              previewTransform: (selected: File, signal: AbortSignal) => {
                if (signal.aborted) throw new DOMException("Aborted", "AbortError");
                return selected.slice(0, selected.size, selected.type);
              },
            }
          : {})}
        showEditAction={avatarEditAction}
        showImageMetadata={avatarImageMetadata}
        showPreview={avatarPreview}
        showRejectionRecovery={avatarRejectionRecovery}
        showRemoveAction={avatarRemoveAction}
        showRetryAction={avatarRetryAction}
        showUploadProgress={avatarUploadProgress}
        uploadMessage="Server retry remains controlled by the surrounding product."
        uploadStatus={status}
        uploadTotalBytes={1024}
        uploadUploadedBytes={640}
        uploadValue={62}
        value={file}
      />
    </Specimen>
  );
}

const onlyControls = (names: readonly (keyof FileSystemsComponentProofArgs)[]) => ({
  controls: { include: names },
});

const meta = {
  args: {
    acceptedTypeGuidance: false,
    announceProgress: false,
    avatarEditAction: false,
    avatarImageMetadata: false,
    avatarPreview: false,
    avatarRejectionRecovery: false,
    avatarRemoveAction: false,
    avatarRetryAction: false,
    avatarUploadProgress: false,
    fileCancelActions: false,
    fileDuplicateDetection: false,
    filePreviews: false,
    fileRejectionRecovery: false,
    fileRemoveActions: false,
    fileReordering: false,
    fileRetryActions: false,
    fileUploadProgress: false,
    preflightSizeValidation: false,
    showByteContext: false,
  },
  argTypes: {
    acceptedTypeGuidance: {
      control: "boolean",
      description: "Apply normalized native picker guidance and matching type preflight.",
    },
    announceProgress: {
      control: "boolean",
      description: "Add bucketed polite progress announcements.",
    },
    avatarEditAction: {
      control: "boolean",
      description: "Expose the consumer-owned image editing action.",
    },
    avatarImageMetadata: {
      control: "boolean",
      description: "Render the selected image's localized metadata.",
    },
    avatarPreview: {
      control: "boolean",
      description: "Create and revoke a lifecycle-owned image preview URL.",
    },
    avatarRejectionRecovery: {
      control: "boolean",
      description: "Render persistent polite recovery for rejected images.",
    },
    avatarRemoveAction: {
      control: "boolean",
      description: "Expose native selection removal.",
    },
    avatarRetryAction: {
      control: "boolean",
      description: "Expose the consumer-owned retry action for a failed transfer.",
    },
    avatarUploadProgress: {
      control: "boolean",
      description: "Render consumer-owned upload lifecycle progress.",
    },
    fileCancelActions: {
      control: "boolean",
      description: "Expose consumer cancel actions for active queue items.",
    },
    fileDuplicateDetection: {
      control: "boolean",
      description: "Reject files with an identical deterministic fingerprint.",
    },
    filePreviews: {
      control: "boolean",
      description: "Invoke the consumer preview renderer for each queue item.",
    },
    fileRejectionRecovery: {
      control: "boolean",
      description: "Render named, polite recovery for rejected queue files.",
    },
    fileRemoveActions: {
      control: "boolean",
      description: "Expose queue removal controls.",
    },
    fileReordering: {
      control: "boolean",
      description: "Expose named earlier and later controls for queue order.",
    },
    fileRetryActions: {
      control: "boolean",
      description: "Expose consumer retry actions for failed queue items.",
    },
    fileUploadProgress: {
      control: "boolean",
      description: "Render consumer-owned per-file progress and lifecycle states.",
    },
    preflightSizeValidation: {
      control: "boolean",
      description: "Reject oversized files before consumer upload transport begins.",
    },
    showByteContext: {
      control: "boolean",
      description: "Add locale-aware transferred and total byte context.",
    },
  },
  parameters: { a11y: { test: "error" }, layout: "centered" },
  title: "P4/File systems — component proof",
} satisfies Meta<FileSystemsComponentProofArgs>;

export default meta;
type Story = StoryObj<FileSystemsComponentProofArgs>;

const fileTriggerControls = ["acceptedTypeGuidance"] as const;
const dropzoneControls = ["acceptedTypeGuidance", "preflightSizeValidation"] as const;
const uploadProgressControls = ["showByteContext", "announceProgress"] as const;
const fileUploadControls = [
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
] as const;
const avatarUploadControls = [
  "avatarPreview",
  "avatarImageMetadata",
  "avatarEditAction",
  "avatarRemoveAction",
  "avatarRejectionRecovery",
  "avatarUploadProgress",
  "avatarRetryAction",
] as const;

export const BasicFileTrigger: Story = {
  args: { acceptedTypeGuidance: false },
  name: "File Trigger · Basic",
  parameters: onlyControls(fileTriggerControls),
  render: (args) => <FileTriggerSpecimen acceptedTypeGuidance={args.acceptedTypeGuidance} />,
};

export const RecommendedFileTrigger: Story = {
  args: { acceptedTypeGuidance: true },
  name: "File Trigger · Recommended Mergora",
  parameters: onlyControls(fileTriggerControls),
  render: (args) => <FileTriggerSpecimen acceptedTypeGuidance={args.acceptedTypeGuidance} />,
};

export const BasicDropzone: Story = {
  args: { acceptedTypeGuidance: false, preflightSizeValidation: false },
  name: "Dropzone · Basic",
  parameters: onlyControls(dropzoneControls),
  render: (args) => (
    <DropzoneSpecimen
      acceptedTypeGuidance={args.acceptedTypeGuidance}
      preflightSizeValidation={args.preflightSizeValidation}
    />
  ),
};

export const RecommendedDropzone: Story = {
  args: { acceptedTypeGuidance: true, preflightSizeValidation: true },
  name: "Dropzone · Recommended Mergora",
  parameters: onlyControls(dropzoneControls),
  render: (args) => (
    <DropzoneSpecimen
      acceptedTypeGuidance={args.acceptedTypeGuidance}
      preflightSizeValidation={args.preflightSizeValidation}
    />
  ),
};

export const BasicUploadProgress: Story = {
  args: { announceProgress: false, showByteContext: false },
  name: "Upload Progress · Basic",
  parameters: onlyControls(uploadProgressControls),
  render: (args) => (
    <UploadProgressSpecimen
      announceProgress={args.announceProgress}
      showByteContext={args.showByteContext}
    />
  ),
};

export const RecommendedUploadProgress: Story = {
  args: { announceProgress: true, showByteContext: true },
  name: "Upload Progress · Recommended Mergora",
  parameters: onlyControls(uploadProgressControls),
  render: (args) => (
    <UploadProgressSpecimen
      announceProgress={args.announceProgress}
      showByteContext={args.showByteContext}
    />
  ),
};

const basicFileUploadArgs = Object.fromEntries(
  fileUploadControls.map((control) => [control, false]),
) as Pick<FileSystemsComponentProofArgs, (typeof fileUploadControls)[number]>;
const recommendedFileUploadArgs = Object.fromEntries(
  fileUploadControls.map((control) => [control, true]),
) as Pick<FileSystemsComponentProofArgs, (typeof fileUploadControls)[number]>;

export const BasicFileUpload: Story = {
  args: basicFileUploadArgs,
  name: "File Upload · Basic",
  parameters: onlyControls(fileUploadControls),
  render: (args) => <FileUploadSpecimen {...args} />,
};

export const RecommendedFileUpload: Story = {
  args: recommendedFileUploadArgs,
  name: "File Upload · Recommended Mergora",
  parameters: onlyControls(fileUploadControls),
  render: (args) => <FileUploadSpecimen {...args} />,
};

const basicAvatarUploadArgs = Object.fromEntries(
  avatarUploadControls.map((control) => [control, false]),
) as Pick<FileSystemsComponentProofArgs, (typeof avatarUploadControls)[number]>;
const recommendedAvatarUploadArgs = Object.fromEntries(
  avatarUploadControls.map((control) => [control, true]),
) as Pick<FileSystemsComponentProofArgs, (typeof avatarUploadControls)[number]>;

export const BasicAvatarUpload: Story = {
  args: basicAvatarUploadArgs,
  name: "Avatar Upload · Basic",
  parameters: onlyControls(avatarUploadControls),
  render: (args) => <AvatarUploadSpecimen {...args} />,
};

export const RecommendedAvatarUpload: Story = {
  args: recommendedAvatarUploadArgs,
  name: "Avatar Upload · Recommended Mergora",
  parameters: onlyControls(avatarUploadControls),
  render: (args) => <AvatarUploadSpecimen {...args} />,
};
