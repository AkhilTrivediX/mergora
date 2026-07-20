import { useState, type CSSProperties, type FormEvent, type ReactNode } from "react";
import type { Meta, StoryObj } from "@storybook/react-vite";

import "mergora-tokens/tokens.css";
import { AvatarUpload } from "../../../registry/source/components/avatar-upload/avatar-upload";
import {
  Dropzone,
  type FileSelectionResult,
} from "../../../registry/source/components/dropzone/dropzone";
import { FileTrigger } from "../../../registry/source/components/file-trigger/file-trigger";
import {
  FileUpload,
  type FileUploadItem,
  type FileUploadSelectionResult,
} from "../../../registry/source/components/file-upload/file-upload";
import { MergoraProvider } from "../../../registry/source/components/provider/provider";
import {
  UploadProgress,
  type UploadProgressStatus,
} from "../../../registry/source/components/upload-progress/upload-progress";

interface FileSystemsStoryArgs {
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

const canvasStyle = {
  background: "var(--mrg-semantic-color-background-canvas)",
  boxSizing: "border-box",
  color: "var(--mrg-semantic-color-foreground-primary)",
  fontFamily: "var(--mrg-semantic-font-family-prose)",
  inlineSize: "100%",
  minBlockSize: "100vh",
  padding: "clamp(1rem, 4vw, 3rem)",
} satisfies CSSProperties;

const workbenchStyle = {
  display: "grid",
  gap: "var(--mrg-semantic-space-stack-xl)",
  marginInline: "auto",
  maxInlineSize: "58rem",
  minInlineSize: 0,
} satisfies CSSProperties;

const specimenStyle = {
  borderBlockStart:
    "var(--mrg-semantic-border-width-default) solid var(--mrg-semantic-color-border-subtle)",
  display: "grid",
  gap: "var(--mrg-semantic-space-stack-md)",
  minInlineSize: 0,
  paddingBlockStart: "var(--mrg-semantic-space-inset-lg)",
} satisfies CSSProperties;

const stateRailStyle = {
  borderBlockStart:
    "var(--mrg-semantic-border-width-default) solid var(--mrg-semantic-color-border-subtle)",
  display: "grid",
} satisfies CSSProperties;

const stateRowStyle = {
  alignItems: "start",
  borderBlockEnd:
    "var(--mrg-semantic-border-width-default) solid var(--mrg-semantic-color-border-subtle)",
  display: "grid",
  gap: "var(--mrg-semantic-space-stack-md)",
  gridTemplateColumns: "minmax(8rem, 0.35fr) minmax(0, 1fr)",
  minInlineSize: 0,
  paddingBlock: "var(--mrg-semantic-space-inset-lg)",
} satisfies CSSProperties;

const outputStyle = {
  background: "var(--mrg-semantic-color-background-surface)",
  borderRadius: "var(--mrg-semantic-radius-compact)",
  display: "block",
  fontFamily: "var(--mrg-semantic-font-family-code)",
  fontSize: "var(--mrg-semantic-font-size-label)",
  minInlineSize: 0,
  overflowWrap: "anywhere",
  padding: "var(--mrg-semantic-space-inset-md)",
  whiteSpace: "pre-wrap",
} satisfies CSSProperties;

const buttonStyle = {
  background: "var(--mrg-semantic-color-action-background)",
  border: 0,
  borderRadius: "var(--mrg-semantic-radius-control)",
  color: "var(--mrg-semantic-color-action-foreground)",
  font: "inherit",
  minBlockSize: "var(--mrg-semantic-size-target-preferred)",
  minInlineSize: "var(--mrg-semantic-size-target-preferred)",
  paddingInline: "var(--mrg-semantic-space-inline-md)",
} satisfies CSSProperties;

const secondaryButtonStyle = {
  ...buttonStyle,
  background: "var(--mrg-semantic-color-background-canvas)",
  border:
    "var(--mrg-semantic-border-width-default) solid var(--mrg-semantic-color-border-interactive)",
  color: "var(--mrg-semantic-color-foreground-primary)",
} satisfies CSSProperties;

const actionRailStyle = {
  display: "flex",
  flexWrap: "wrap",
  gap: "var(--mrg-semantic-space-inline-sm)",
} satisfies CSSProperties;

function Canvas({
  children,
  direction = "ltr",
  locale = "en-US",
}: {
  readonly children: ReactNode;
  readonly direction?: "ltr" | "rtl";
  readonly locale?: string;
}) {
  return (
    <MergoraProvider direction={direction} locale={locale}>
      <main style={canvasStyle}>
        <div style={workbenchStyle}>{children}</div>
      </main>
    </MergoraProvider>
  );
}

function summarizeFiles(files: readonly File[]) {
  return files.map((file) => ({ name: file.name, size: file.size, type: file.type }));
}

function summarizeSelection(result: FileSelectionResult) {
  return {
    accepted: summarizeFiles(result.accepted),
    rejected: result.rejected.map(({ name, reason, size, type }) => ({
      name,
      reason,
      ...(size === undefined ? {} : { size }),
      ...(type === undefined ? {} : { type }),
    })),
    source: result.source,
  };
}

function NativeFileFormWorkbench({
  acceptedTypeGuidance = true,
}: {
  readonly acceptedTypeGuidance?: boolean;
}) {
  const [selection, setSelection] = useState("No files selected");
  const [submission, setSubmission] = useState("No submission yet");
  return (
    <form
      aria-label="Native file form workbench"
      onReset={() => {
        setSelection("Native reset requested");
        setSubmission("No submission yet");
      }}
      onSubmit={(event: FormEvent<HTMLFormElement>) => {
        event.preventDefault();
        const data = new FormData(event.currentTarget);
        setSubmission(
          JSON.stringify({
            disabledPresent: data.has("archived-evidence"),
            evidence: data
              .getAll("evidence")
              .filter((entry): entry is File => entry instanceof File)
              .map((file) => ({ name: file.name, size: file.size, type: file.type })),
          }),
        );
      }}
    >
      <div style={specimenStyle}>
        <FileTrigger
          {...(acceptedTypeGuidance ? { acceptedFileTypes: ["image/*", ".PDF"] } : {})}
          allowsMultiple
          description={
            acceptedTypeGuidance
              ? "Choose one or more PDF or image files. The native input remains the successful form control."
              : "Choose one or more files. The native input remains the successful form control."
          }
          label="Choose evidence files"
          name="evidence"
          onSelect={(files) => setSelection(JSON.stringify(summarizeFiles(files)))}
        />
        <output aria-live="polite" data-testid="native-selection" style={outputStyle}>
          {selection}
        </output>
        <FileTrigger
          disabled
          label="Archived file selector"
          name="archived-evidence"
          onSelect={() => setSelection("Disabled selector changed")}
        />
        <div style={actionRailStyle}>
          <button style={buttonStyle} type="submit">
            Inspect file form values
          </button>
          <button style={secondaryButtonStyle} type="reset">
            Clear native file selection
          </button>
        </div>
        <output aria-live="polite" data-testid="native-form-output" style={outputStyle}>
          {submission}
        </output>
      </div>
    </form>
  );
}

function DropzoneWorkbench({
  acceptedTypeGuidance = true,
  preflightSizeValidation = true,
}: Pick<FileSystemsStoryArgs, "acceptedTypeGuidance" | "preflightSizeValidation">) {
  const [current, setCurrent] = useState("No dropzone request yet");
  const [history, setHistory] = useState<readonly ReturnType<typeof summarizeSelection>[]>([]);
  const handleFiles = (result: FileSelectionResult) => {
    const summary = summarizeSelection(result);
    setCurrent(JSON.stringify(summary));
    setHistory((previous) => [...previous, summary]);
  };
  return (
    <section aria-labelledby="dropzone-workbench-heading" style={specimenStyle}>
      <header>
        <h2 id="dropzone-workbench-heading" style={{ margin: 0 }}>
          One classifier for picker, paste, and drop
        </h2>
        <p style={{ marginBlockEnd: 0, maxInlineSize: "68ch" }}>
          This queue accepts at most two {acceptedTypeGuidance ? "PDF or image " : ""}files
          {preflightSizeValidation ? " up to 1 KiB each" : ""}. Every active rejection stays
          explicit, and the latest asynchronous drop request owns the result.
        </p>
      </header>
      <Dropzone
        {...(acceptedTypeGuidance ? { acceptedFileTypes: ["image/*", ".pdf"] } : {})}
        description={`Drop, paste, or choose up to two ${
          acceptedTypeGuidance ? "PDF or image " : ""
        }files.${preflightSizeValidation ? " Maximum size: 1 KiB each." : ""}`}
        label="Release evidence intake"
        maxFiles={2}
        maxSizeBytes={1024}
        onFiles={handleFiles}
        validateFileSize={preflightSizeValidation}
      />
      <output aria-live="polite" data-testid="dropzone-result" style={outputStyle}>
        {current}
      </output>
      <output data-testid="dropzone-history-count" style={outputStyle}>
        Completed requests: {history.length}
      </output>
    </section>
  );
}

function UploadProgressWorkbench({
  announceProgress = true,
  showByteContext = true,
}: Pick<FileSystemsStoryArgs, "announceProgress" | "showByteContext">) {
  const [status, setStatus] = useState<UploadProgressStatus>("uploading");
  const [value, setValue] = useState(12);
  const totalBytes = 10 * 1024 * 1024;
  const uploadedBytes = Math.round((value / 100) * totalBytes);
  const update = (nextStatus: UploadProgressStatus, nextValue: number) => {
    setStatus(nextStatus);
    setValue(nextValue);
  };
  return (
    <section aria-labelledby="upload-workbench-heading" style={specimenStyle}>
      <header>
        <h2 id="upload-workbench-heading" style={{ margin: 0 }}>
          Progress that reports meaningful changes
        </h2>
        <p style={{ marginBlockEnd: 0, maxInlineSize: "68ch" }}>
          Visible byte totals update continuously. The polite announcement changes only when the
          ten-percent bucket or upload status changes.
        </p>
      </header>
      <UploadProgress
        announceProgress={announceProgress}
        announcementStep={10}
        label="design-system-audit.pdf"
        message="You can leave this page; the upload continues in the background."
        status={status}
        {...(showByteContext ? { totalBytes, uploadedBytes } : {})}
        value={value}
      />
      <div style={actionRailStyle}>
        <button style={buttonStyle} type="button" onClick={() => update("uploading", 18)}>
          Advance within bucket
        </button>
        <button style={buttonStyle} type="button" onClick={() => update("uploading", 21)}>
          Cross next bucket
        </button>
        <button style={secondaryButtonStyle} type="button" onClick={() => setStatus("paused")}>
          Pause upload
        </button>
        <button style={secondaryButtonStyle} type="button" onClick={() => setStatus("retrying")}>
          Retry upload
        </button>
        <button style={buttonStyle} type="button" onClick={() => update("complete", 100)}>
          Complete upload
        </button>
        <button style={secondaryButtonStyle} type="button" onClick={() => update("uploading", 12)}>
          Restore upload
        </button>
      </div>
    </section>
  );
}

function makeStoryFile(name: string, type: string, content = "Mergora fixture") {
  return new File([content], name, { lastModified: 1_700_000_000_000, type });
}

function summarizeUploadSelection(result: FileUploadSelectionResult) {
  return {
    accepted: result.accepted.map((item) => ({ id: item.id, name: item.file.name })),
    rejected: result.rejected.map(({ duplicateOf, name, reason }) => ({
      ...(duplicateOf === undefined ? {} : { duplicateOf }),
      name,
      reason,
    })),
    source: result.source,
  };
}

function FileUploadWorkbench({
  fileCancelActions = true,
  fileDuplicateDetection = true,
  filePreviews = true,
  fileRejectionRecovery = true,
  fileRemoveActions = true,
  fileReordering = true,
  fileRetryActions = true,
  fileUploadProgress = true,
  preflightSizeValidation = true,
}: Pick<
  FileSystemsStoryArgs,
  | "fileCancelActions"
  | "fileDuplicateDetection"
  | "filePreviews"
  | "fileRejectionRecovery"
  | "fileRemoveActions"
  | "fileReordering"
  | "fileRetryActions"
  | "fileUploadProgress"
  | "preflightSizeValidation"
>) {
  const [items, setItems] = useState<readonly FileUploadItem[]>(() => [
    {
      file: makeStoryFile("interface-notes.pdf", "application/pdf"),
      id: "interface-notes",
      message: "Connection interrupted. Retry keeps transport ownership in this story.",
      progress: 38,
      status: "error",
      totalBytes: 100,
      uploadedBytes: 38,
    },
    {
      file: makeStoryFile("component-map.png", "image/png"),
      id: "component-map",
      message: "Mock progress is controlled by the story.",
      progress: 64,
      status: "uploading",
      totalBytes: 100,
      uploadedBytes: 64,
    },
  ]);
  const [selection, setSelection] = useState("No new selection yet");
  const updateStatus = (id: string, status: UploadProgressStatus) =>
    setItems((current) => current.map((item) => (item.id === id ? { ...item, status } : item)));
  return (
    <section aria-labelledby="file-upload-workbench-heading" style={specimenStyle}>
      <header>
        <h2 id="file-upload-workbench-heading" style={{ margin: 0 }}>
          Consumer-owned upload queue
        </h2>
        <p style={{ marginBlockEnd: 0, maxInlineSize: "68ch" }}>
          Type, size, and duplicate preflight run before a queued item appears. Progress, retry,
          cancellation, and preview rendering remain ordinary consumer data and callbacks.
        </p>
      </header>
      <FileUpload
        acceptedFileTypes={["image/*", ".pdf"]}
        description="Drop, paste, or choose up to four PDF or image files. Maximum 1 KiB each."
        duplicatePolicy={fileDuplicateDetection ? "reject" : "allow"}
        items={items}
        label="Release file queue"
        maxFiles={4}
        maxSizeBytes={1024}
        onCancel={(item) => updateStatus(item.id, "cancelled")}
        onItemsChange={setItems}
        onRetry={(item) => updateStatus(item.id, "retrying")}
        onSelection={(result) => setSelection(JSON.stringify(summarizeUploadSelection(result)))}
        {...(filePreviews
          ? {
              renderPreview: (item: FileUploadItem) => (
                <span aria-label={`Preview marker for ${item.file.name}`} style={outputStyle}>
                  {item.file.type.startsWith("image/") ? "Image" : "Document"}
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
      <output aria-live="polite" data-testid="file-upload-selection" style={outputStyle}>
        {selection}
      </output>
    </section>
  );
}

function AvatarUploadWorkbench({
  avatarEditAction = true,
  avatarImageMetadata = true,
  avatarPreview = true,
  avatarRejectionRecovery = true,
  avatarRemoveAction = true,
  avatarRetryAction = true,
  avatarUploadProgress = true,
  preflightSizeValidation = true,
}: Pick<
  FileSystemsStoryArgs,
  | "avatarEditAction"
  | "avatarImageMetadata"
  | "avatarPreview"
  | "avatarRejectionRecovery"
  | "avatarRemoveAction"
  | "avatarRetryAction"
  | "avatarUploadProgress"
  | "preflightSizeValidation"
>) {
  const [file, setFile] = useState<File | null>(() =>
    makeStoryFile(
      "profile-mark.svg",
      "image/svg+xml",
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><rect width="100" height="100" fill="white"/><circle cx="50" cy="38" r="20" fill="green"/><path d="M18 94c5-26 59-26 64 0" fill="purple"/></svg>',
    ),
  );
  const [activity, setActivity] = useState("No edit or retry request yet");
  const [status, setStatus] = useState<UploadProgressStatus>("error");
  return (
    <section aria-labelledby="avatar-upload-workbench-heading" style={specimenStyle}>
      <header>
        <h2 id="avatar-upload-workbench-heading" style={{ margin: 0 }}>
          Lifecycle-safe avatar replacement
        </h2>
        <p style={{ marginBlockEnd: 0, maxInlineSize: "68ch" }}>
          Preview URLs are created only while preview is enabled and revoked after replacement. Edit
          and retry are hooks; this component never crops, uploads, or deletes server content.
        </p>
      </header>
      <AvatarUpload
        description="Choose a PNG, JPEG, WebP, or SVG image up to 1 KiB."
        label="Profile image"
        maxSizeBytes={1024}
        onEdit={(selected) => setActivity(`Edit requested for ${selected.name}`)}
        onRejected={({ file: rejected, reason }) =>
          setActivity(`${rejected.name} rejected: ${reason}`)
        }
        onRetry={(selected) => {
          setActivity(`Retry requested for ${selected.name}`);
          setStatus("retrying");
        }}
        onValueChange={(next) => setFile(next)}
        previewTransform={(selected, signal) => {
          if (signal.aborted) throw new DOMException("Aborted", "AbortError");
          return selected.slice(0, selected.size, selected.type);
        }}
        showEditAction={avatarEditAction}
        showImageMetadata={avatarImageMetadata}
        showPreview={avatarPreview}
        showRejectionRecovery={avatarRejectionRecovery}
        showRemoveAction={avatarRemoveAction}
        showRetryAction={avatarRetryAction}
        showUploadProgress={avatarUploadProgress}
        uploadMessage="The retry state is driven by the story, not an internal request."
        uploadStatus={status}
        uploadTotalBytes={100}
        uploadUploadedBytes={42}
        uploadValue={42}
        validateFileSize={preflightSizeValidation}
        value={file}
      />
      <output aria-live="polite" data-testid="avatar-upload-activity" style={outputStyle}>
        {activity}
      </output>
    </section>
  );
}

function FormSerializationWorkbench() {
  const [controlledAvatar, setControlledAvatar] = useState<File | null>(() =>
    makeStoryFile("controlled-initial.png", "image/png", "initial"),
  );
  const [dropResult, setDropResult] = useState("No dropzone request yet");
  const [queueItems, setQueueItems] = useState<readonly FileUploadItem[]>(() => [
    {
      file: makeStoryFile("queue-initial.pdf", "application/pdf", "queue"),
      id: "queue-initial",
      status: "queued",
    },
  ]);
  const [submission, setSubmission] = useState("No form submission yet");
  const readForm = (form: HTMLFormElement) => {
    const data = new FormData(form);
    return JSON.stringify(
      Object.fromEntries(
        ["evidence", "queued-files", "default-avatar", "controlled-avatar"].map((field) => [
          field,
          data
            .getAll(field)
            .filter((entry): entry is File => entry instanceof File && entry.name.length > 0)
            .map((entry) => entry.name),
        ]),
      ),
    );
  };
  return (
    <form
      aria-label="Synchronized file form"
      onSubmit={(event) => {
        event.preventDefault();
        setSubmission(readForm(event.currentTarget));
      }}
    >
      <section style={specimenStyle}>
        <Dropzone
          acceptedFileTypes={["image/*", ".pdf"]}
          description="Accepted files are synchronized into the one successful native input."
          label="Form evidence"
          maxFiles={3}
          name="evidence"
          onFiles={(result) =>
            setDropResult(
              JSON.stringify({
                accepted: result.accepted.map((file) => file.name),
                formDataSynchronized: result.formDataSynchronized,
                rejected: result.rejected.map(({ name, reason }) => ({ name, reason })),
                source: result.source,
              }),
            )
          }
          required
        />
        <FileUpload
          acceptedFileTypes={["image/*", ".pdf"]}
          items={queueItems}
          label="Synchronized upload queue"
          name="queued-files"
          onItemsChange={setQueueItems}
        />
        <AvatarUpload
          defaultValue={makeStoryFile("default-initial.png", "image/png", "default")}
          label="Default avatar"
          name="default-avatar"
          showRemoveAction
        />
        <AvatarUpload
          label="Controlled avatar"
          name="controlled-avatar"
          onValueChange={setControlledAvatar}
          showRemoveAction
          value={controlledAvatar}
        />
        <div style={actionRailStyle}>
          <button
            onClick={() =>
              setControlledAvatar(makeStoryFile("controlled-external.png", "image/png", "next"))
            }
            style={secondaryButtonStyle}
            type="button"
          >
            Replace controlled avatar externally
          </button>
          <button
            onClick={() =>
              setQueueItems([
                {
                  file: makeStoryFile("queue-external.pdf", "application/pdf", "external"),
                  id: "queue-external",
                  status: "queued",
                },
              ])
            }
            style={secondaryButtonStyle}
            type="button"
          >
            Replace controlled queue externally
          </button>
          <button style={buttonStyle} type="submit">
            Inspect synchronized FormData
          </button>
          <button style={secondaryButtonStyle} type="reset">
            Reset synchronized form
          </button>
        </div>
        <output aria-live="polite" data-testid="form-drop-result" style={outputStyle}>
          {dropResult}
        </output>
        <output aria-live="polite" data-testid="synchronized-form-output" style={outputStyle}>
          {submission}
        </output>
      </section>
    </form>
  );
}

const uploadStates = [
  ["Queued", "queued", undefined],
  ["Uploading", "uploading", 42],
  ["Paused", "paused", 42],
  ["Retrying", "retrying", undefined],
  ["Failed", "error", 42],
  ["Cancelled", "cancelled", 42],
  ["Complete", "complete", 100],
] as const satisfies readonly (readonly [string, UploadProgressStatus, number | undefined])[];

const meta = {
  args: {
    acceptedTypeGuidance: true,
    announceProgress: true,
    avatarEditAction: true,
    avatarImageMetadata: true,
    avatarPreview: true,
    avatarRejectionRecovery: true,
    avatarRemoveAction: true,
    avatarRetryAction: true,
    avatarUploadProgress: true,
    fileCancelActions: true,
    fileDuplicateDetection: true,
    filePreviews: true,
    fileRejectionRecovery: true,
    fileRemoveActions: true,
    fileReordering: true,
    fileRetryActions: true,
    fileUploadProgress: true,
    preflightSizeValidation: true,
    showByteContext: true,
  },
  argTypes: {
    acceptedTypeGuidance: {
      control: "boolean",
      description: "Adds normalized type guidance and type preflight; false omits both.",
    },
    announceProgress: {
      control: "boolean",
      description: "Adds bucketed polite announcements; false removes the live region.",
    },
    avatarEditAction: {
      control: "boolean",
      description: "Adds the consumer crop/edit hook; false removes its control and events.",
    },
    avatarImageMetadata: {
      control: "boolean",
      description: "Adds the file metadata description list; false performs no metadata output.",
    },
    avatarPreview: {
      control: "boolean",
      description: "Creates a lifecycle-owned preview URL; false creates no URL or preview status.",
    },
    avatarRejectionRecovery: {
      control: "boolean",
      description: "Adds persistent polite recovery; false removes its UI and live region.",
    },
    avatarRemoveAction: {
      control: "boolean",
      description: "Adds native selection removal; false removes its control and events.",
    },
    avatarRetryAction: {
      control: "boolean",
      description: "Adds retry only for an error lifecycle; false removes its control and events.",
    },
    avatarUploadProgress: {
      control: "boolean",
      description: "Shows consumer-owned lifecycle progress; false removes all progress output.",
    },
    fileCancelActions: {
      control: "boolean",
      description: "Adds consumer cancel callbacks for active items; false removes them.",
    },
    fileDuplicateDetection: {
      control: "boolean",
      description: "Rejects fingerprint duplicates; false skips duplicate-key work and events.",
    },
    filePreviews: {
      control: "boolean",
      description: "Calls the consumer preview renderer; false never invokes it.",
    },
    fileRejectionRecovery: {
      control: "boolean",
      description: "Adds named per-file recovery; false removes its UI and live region.",
    },
    fileRemoveActions: {
      control: "boolean",
      description: "Adds queue removal controls; false removes their UI and events.",
    },
    fileReordering: {
      control: "boolean",
      description: "Adds keyboard/touch Earlier and Later controls; false preserves fixed order.",
    },
    fileRetryActions: {
      control: "boolean",
      description: "Adds consumer retry callbacks for failed items; false removes them.",
    },
    fileUploadProgress: {
      control: "boolean",
      description: "Renders consumer-owned per-file progress; false removes progress semantics.",
    },
    preflightSizeValidation: {
      control: "boolean",
      description: "Adds client-side size rejection; false removes that classifier branch.",
    },
    showByteContext: {
      control: "boolean",
      description: "Adds locale-formatted byte context; false leaves concise percentage status.",
    },
  },
  parameters: { layout: "fullscreen" },
  title: "P4/File systems",
} satisfies Meta<FileSystemsStoryArgs>;

export default meta;
type Story = StoryObj<FileSystemsStoryArgs>;

export const BasicDefaults: Story = {
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
  render: (args) => (
    <Canvas>
      <header>
        <h1 style={{ marginBlock: 0 }}>Plain file controls</h1>
        <p style={{ marginBlockEnd: 0, maxInlineSize: "68ch" }}>
          Native selection, a concise drop alternative, and labelled progress remain useful with
          every optional Mergora enhancement removed.
        </p>
      </header>
      <div style={stateRailStyle}>
        <section aria-label="Plain file picker" style={stateRowStyle}>
          <h2 style={{ fontSize: "1rem", margin: 0 }}>Picker</h2>
          <FileTrigger
            {...(args.acceptedTypeGuidance ? { acceptedFileTypes: ["image/*", ".pdf"] } : {})}
            label="Choose files"
          />
        </section>
        <section aria-label="Plain dropzone" style={stateRowStyle}>
          <h2 style={{ fontSize: "1rem", margin: 0 }}>Dropzone</h2>
          <Dropzone
            {...(args.acceptedTypeGuidance ? { acceptedFileTypes: ["image/*", ".pdf"] } : {})}
            label="Files"
            maxSizeBytes={1}
            onFiles={() => undefined}
            validateFileSize={args.preflightSizeValidation}
          />
        </section>
        <section aria-label="Plain upload progress" style={stateRowStyle}>
          <h2 style={{ fontSize: "1rem", margin: 0 }}>Progress</h2>
          <UploadProgress
            announceProgress={args.announceProgress}
            label="File upload"
            {...(args.showByteContext
              ? { totalBytes: 10 * 1024 * 1024, uploadedBytes: 4 * 1024 * 1024 }
              : {})}
            value={40}
          />
        </section>
        <section aria-label="Plain file upload" style={stateRowStyle}>
          <h2 style={{ fontSize: "1rem", margin: 0 }}>Queue</h2>
          <FileUpload
            {...(args.acceptedTypeGuidance ? { acceptedFileTypes: ["image/*", ".pdf"] } : {})}
            duplicatePolicy={args.fileDuplicateDetection ? "reject" : "allow"}
            label="Upload files"
            maxSizeBytes={1}
            reorderable={args.fileReordering}
            showCancelActions={args.fileCancelActions}
            showProgress={args.fileUploadProgress}
            showRejectionRecovery={args.fileRejectionRecovery}
            showRemoveActions={args.fileRemoveActions}
            showRetryActions={args.fileRetryActions}
            validateFileSize={args.preflightSizeValidation}
          />
        </section>
        <section aria-label="Plain avatar upload" style={stateRowStyle}>
          <h2 style={{ fontSize: "1rem", margin: 0 }}>Avatar</h2>
          <AvatarUpload
            label="Profile image"
            onEdit={() => undefined}
            onRetry={() => undefined}
            showEditAction={args.avatarEditAction}
            showImageMetadata={args.avatarImageMetadata}
            showPreview={args.avatarPreview}
            showRejectionRecovery={args.avatarRejectionRecovery}
            showRemoveAction={args.avatarRemoveAction}
            showRetryAction={args.avatarRetryAction}
            showUploadProgress={args.avatarUploadProgress}
          />
        </section>
      </div>
    </Canvas>
  ),
};

export const RecommendedMergora: Story = {
  render: (args) => (
    <Canvas>
      <header>
        <h1 style={{ marginBlock: 0 }}>Mergora file-selection workbench</h1>
        <p style={{ marginBlockEnd: 0, maxInlineSize: "68ch" }}>
          Toggle type guidance, size preflight, byte context, and announcement cadence separately to
          inspect their exact UI and accessibility boundaries.
        </p>
      </header>
      <NativeFileFormWorkbench acceptedTypeGuidance={args.acceptedTypeGuidance} />
      <DropzoneWorkbench
        acceptedTypeGuidance={args.acceptedTypeGuidance}
        preflightSizeValidation={args.preflightSizeValidation}
      />
      <UploadProgressWorkbench
        announceProgress={args.announceProgress}
        showByteContext={args.showByteContext}
      />
      <FileUploadWorkbench
        fileCancelActions={args.fileCancelActions}
        fileDuplicateDetection={args.fileDuplicateDetection}
        filePreviews={args.filePreviews}
        fileRejectionRecovery={args.fileRejectionRecovery}
        fileRemoveActions={args.fileRemoveActions}
        fileReordering={args.fileReordering}
        fileRetryActions={args.fileRetryActions}
        fileUploadProgress={args.fileUploadProgress}
        preflightSizeValidation={args.preflightSizeValidation}
      />
      <AvatarUploadWorkbench
        avatarEditAction={args.avatarEditAction}
        avatarImageMetadata={args.avatarImageMetadata}
        avatarPreview={args.avatarPreview}
        avatarRejectionRecovery={args.avatarRejectionRecovery}
        avatarRemoveAction={args.avatarRemoveAction}
        avatarRetryAction={args.avatarRetryAction}
        avatarUploadProgress={args.avatarUploadProgress}
        preflightSizeValidation={args.preflightSizeValidation}
      />
    </Canvas>
  ),
};

export const FileUploadQueueWorkbench: Story = {
  render: (args) => (
    <Canvas>
      <h1 style={{ margin: 0 }}>File queue preflight and consumer lifecycle</h1>
      <FileUploadWorkbench
        fileCancelActions={args.fileCancelActions}
        fileDuplicateDetection={args.fileDuplicateDetection}
        filePreviews={args.filePreviews}
        fileRejectionRecovery={args.fileRejectionRecovery}
        fileRemoveActions={args.fileRemoveActions}
        fileReordering={args.fileReordering}
        fileRetryActions={args.fileRetryActions}
        fileUploadProgress={args.fileUploadProgress}
        preflightSizeValidation={args.preflightSizeValidation}
      />
    </Canvas>
  ),
};

export const AvatarUploadLifecycleWorkbench: Story = {
  render: (args) => (
    <Canvas>
      <h1 style={{ margin: 0 }}>Avatar preview and consumer lifecycle</h1>
      <AvatarUploadWorkbench
        avatarEditAction={args.avatarEditAction}
        avatarImageMetadata={args.avatarImageMetadata}
        avatarPreview={args.avatarPreview}
        avatarRejectionRecovery={args.avatarRejectionRecovery}
        avatarRemoveAction={args.avatarRemoveAction}
        avatarRetryAction={args.avatarRetryAction}
        avatarUploadProgress={args.avatarUploadProgress}
        preflightSizeValidation={args.preflightSizeValidation}
      />
    </Canvas>
  ),
};

export const FormSerializationAndReset: Story = {
  render: () => (
    <Canvas>
      <h1 style={{ margin: 0 }}>Accepted files stay synchronized with native FormData</h1>
      <FormSerializationWorkbench />
    </Canvas>
  ),
};

export const NativeFileInputAndForm: Story = {
  render: (args) => (
    <Canvas>
      <header>
        <h1 style={{ marginBlock: 0 }}>Native file selection and form reset</h1>
        <p style={{ marginBlockEnd: 0, maxInlineSize: "68ch" }}>
          A real file input owns picker, form, reset, disabled, multiple, and accepted-type behavior
          while the visible trigger keeps a preferred touch target.
        </p>
      </header>
      <NativeFileFormWorkbench acceptedTypeGuidance={args.acceptedTypeGuidance} />
    </Canvas>
  ),
};

export const PickerPasteAndDropParity: Story = {
  render: (args) => (
    <Canvas>
      <h1 style={{ margin: 0 }}>Picker, paste, and drop share one acceptance contract</h1>
      <DropzoneWorkbench
        acceptedTypeGuidance={args.acceptedTypeGuidance}
        preflightSizeValidation={args.preflightSizeValidation}
      />
    </Canvas>
  ),
};

export const UploadAnnouncementWorkbench: Story = {
  render: (args) => (
    <Canvas>
      <h1 style={{ margin: 0 }}>Upload announcements stay useful under rapid progress</h1>
      <UploadProgressWorkbench
        announceProgress={args.announceProgress}
        showByteContext={args.showByteContext}
      />
    </Canvas>
  ),
};

export const StateMatrix: Story = {
  render: () => (
    <Canvas>
      <h1 style={{ margin: 0 }}>File-system and upload adverse-state rail</h1>
      <div style={stateRailStyle}>
        <section aria-label="Directory selection" style={stateRowStyle}>
          <h2 style={{ fontSize: "1rem", margin: 0 }}>Directory</h2>
          <FileTrigger
            acceptDirectory
            allowsMultiple
            description="The browser supplies directory contents through its native picker."
            label="Choose evidence directory"
          />
        </section>
        <section aria-label="Camera capture" style={stateRowStyle}>
          <h2 style={{ fontSize: "1rem", margin: 0 }}>Capture</h2>
          <FileTrigger
            acceptedFileTypes={["image/*"]}
            capture="environment"
            description="Supported mobile browsers may offer the outward-facing camera."
            label="Capture site evidence"
          />
        </section>
        <section aria-label="Required invalid file selection" style={stateRowStyle}>
          <h2 style={{ fontSize: "1rem", margin: 0 }}>Required and invalid</h2>
          <FileTrigger
            aria-invalid="true"
            description="Choose a document before continuing."
            label="Choose required document"
            name="required-document"
            required
          />
        </section>
        <section aria-label="Disabled file selection" style={stateRowStyle}>
          <h2 style={{ fontSize: "1rem", margin: 0 }}>Disabled picker</h2>
          <FileTrigger disabled label="Archived document selector" />
        </section>
        <section aria-label="Disabled dropzone" style={stateRowStyle}>
          <h2 style={{ fontSize: "1rem", margin: 0 }}>Disabled</h2>
          <Dropzone disabled label="Archived evidence intake" onFiles={() => undefined} />
        </section>
        <section aria-label="Read-only file queue" style={stateRowStyle}>
          <h2 style={{ fontSize: "1rem", margin: 0 }}>Read-only queue</h2>
          <FileUpload
            defaultItems={[
              {
                file: makeStoryFile("approved-notes.pdf", "application/pdf"),
                id: "approved-notes",
                progress: 100,
                status: "complete",
              },
            ]}
            label="Approved files"
            readOnly
            showProgress
            showRemoveActions
          />
        </section>
        <section aria-label="Disabled avatar upload" style={stateRowStyle}>
          <h2 style={{ fontSize: "1rem", margin: 0 }}>Disabled avatar</h2>
          <AvatarUpload disabled label="Archived profile image" />
        </section>
        <section aria-label="Avatar lifecycle error" style={stateRowStyle}>
          <h2 style={{ fontSize: "1rem", margin: 0 }}>Avatar error</h2>
          <AvatarUpload
            defaultValue={makeStoryFile("profile.png", "image/png")}
            label="Profile image"
            onRetry={() => undefined}
            showImageMetadata
            showRetryAction
            showUploadProgress
            uploadMessage="The consumer can retry without losing the local selection."
            uploadStatus="error"
            uploadValue={42}
          />
        </section>
        {uploadStates.map(([label, status, value]) => (
          <section aria-label={`${label} upload`} key={status} style={stateRowStyle}>
            <h2 style={{ fontSize: "1rem", margin: 0 }}>{label}</h2>
            <UploadProgress
              label={`${label.toLocaleLowerCase("en-US")}-evidence.pdf`}
              status={status}
              {...(status === "error" ? { message: "Check your connection, then retry." } : {})}
              {...(value === undefined ? {} : { value })}
            />
          </section>
        ))}
      </div>
    </Canvas>
  ),
};

export const RightToLeftAndNarrow: Story = {
  render: () => (
    <Canvas direction="rtl" locale="ar-EG">
      <div style={{ inlineSize: "min(100%, 18rem)", marginInline: "auto", minInlineSize: 0 }}>
        <h1 style={{ marginBlockStart: 0 }}>تحميل الملفات من اليمين إلى اليسار</h1>
        <Dropzone
          acceptedFileTypes={["image/*", ".pdf"]}
          description="أسقط ملف PDF أو صورة، أو اختر ملفًا من الجهاز."
          label="أدلة الإصدار"
          messages={{ selectAction: "اختيار الملفات" }}
          onFiles={() => undefined}
        />
        <div style={{ blockSize: "var(--mrg-semantic-space-stack-lg)" }} />
        <UploadProgress
          label="تقرير-الإصدار.pdf"
          message="يمكنك مغادرة هذه الصفحة وسيستمر التحميل."
          totalBytes={10 * 1024 * 1024}
          uploadedBytes={4 * 1024 * 1024}
          value={40}
        />
        <div style={{ blockSize: "var(--mrg-semantic-space-stack-lg)" }} />
        <FileUpload
          acceptedFileTypes={["image/*", ".pdf"]}
          description="اختر ملفات من الجهاز أو الصقها."
          label="قائمة الملفات"
          showRejectionRecovery
        />
        <div style={{ blockSize: "var(--mrg-semantic-space-stack-lg)" }} />
        <AvatarUpload description="اختر صورة للمعاينة." label="صورة الملف الشخصي" showPreview />
      </div>
    </Canvas>
  ),
};
