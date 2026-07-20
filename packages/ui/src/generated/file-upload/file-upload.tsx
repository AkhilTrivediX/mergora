// Generated from registry/source/components/file-upload/file-upload.tsx by @mergora-internal/source-transformer. Do not edit.
"use client";

import {
  forwardRef,
  useEffect,
  useId,
  useRef,
  useState,
  type HTMLAttributes,
  type ReactNode,
} from "react";

import {
  Dropzone,
  type FileRejectionReason,
  type FileSelectionResult,
  type RejectedFileSelection,
} from "../dropzone/index.js";
import { synchronizeFileInputFiles } from "../file-trigger/file-trigger.js";
import { useMergoraContext } from "../provider/index.js";
import {
  UploadProgress,
  formatUploadBytes,
  type UploadProgressStatus,
} from "../upload-progress/index.js";
import "./file-upload.css";

export type FileUploadChangeReason = "remove" | "reorder" | "reset" | "selection";
export type FileUploadDuplicatePolicy = "allow" | "reject";
export type FileUploadRejectionReason = FileRejectionReason | "duplicate";

export interface FileUploadItem {
  /** Browser File retained for native form serialization and consumer-controlled upload work. */
  readonly file: File;
  /** Stable unique queue identifier used for updates, reordering, and action callbacks. */
  readonly id: string;
  /** Optional consumer status detail displayed by the progress enhancement. */
  readonly message?: ReactNode;
  /** Percentage from zero through 100 for progress without byte totals. */
  readonly progress?: number;
  /** Upload lifecycle status rendered only when progress or relevant actions are enabled. */
  readonly status?: UploadProgressStatus;
  /** Total byte count paired with `uploadedBytes` for byte-based progress. */
  readonly totalBytes?: number;
  /** Completed byte count paired with `totalBytes` for byte-based progress. */
  readonly uploadedBytes?: number;
}

export interface FileUploadRejectedFile extends Omit<RejectedFileSelection, "reason"> {
  /** Existing queue item ID that shares the duplicate key, when rejected as a duplicate. */
  readonly duplicateOf?: string;
  /** Machine-readable reason this file did not enter the managed queue. */
  readonly reason: FileUploadRejectionReason;
}

export interface FileUploadSelectionResult {
  /** Newly created immutable queue items accepted during this selection. */
  readonly accepted: readonly FileUploadItem[];
  /** Immutable recovery records for rejected files, including optional duplicate ownership. */
  readonly rejected: readonly FileUploadRejectedFile[];
  /** Picker, paste, or drop path that produced the selection. */
  readonly source: FileSelectionResult["source"];
}

export interface FileUploadChangeDetail {
  /** Queue item affected by remove or reorder changes, when one item owns the change. */
  readonly itemId?: string;
  /** Stable reason describing selection, removal, reordering, or native form reset. */
  readonly reason: FileUploadChangeReason;
  /** Accepted and rejected selection detail supplied for `selection` changes only. */
  readonly selection?: FileUploadSelectionResult;
}

export interface FileUploadMessages {
  /** Builds the accessible cancellation action label for a queue item. */
  readonly cancel: (name: string) => string;
  /** Empty queue copy shown when no managed files remain. */
  readonly empty: string;
  /** Builds the accessible action label for moving an item later in the queue. */
  readonly moveDown: (name: string) => string;
  /** Builds the accessible action label for moving an item earlier in the queue. */
  readonly moveUp: (name: string) => string;
  /** Heading that provides the managed queue's accessible section name. */
  readonly queueLabel: string;
  /** Heading for the optional rejected-file recovery section. */
  readonly rejectedHeading: string;
  /** Builds the accessible removal action label for a queue item. */
  readonly remove: (name: string) => string;
  /** Builds the accessible retry action label for an errored queue item. */
  readonly retry: (name: string) => string;
}

export interface FileUploadProps extends Omit<
  HTMLAttributes<HTMLDivElement>,
  "children" | "defaultValue" | "form" | "onChange" | "onReset"
> {
  /** MIME types, extensions, or wildcards accepted by the picker and shared preflight classifier. */
  readonly acceptedFileTypes?: readonly string[];
  /** Allows multiple files per selection; false limits each input path to one. */
  readonly allowsMultiple?: boolean;
  /** Initial queue for uncontrolled use; omit when providing controlled `items`. */
  readonly defaultItems?: readonly FileUploadItem[];
  /** Optional visible selection guidance linked to the nested drop surface. */
  readonly description?: ReactNode;
  /** Disables selection and all enabled queue actions without removing queue context. */
  readonly disabled?: boolean;
  /** Duplicate handling policy; `reject` runs `getDuplicateKey` before queue insertion. */
  readonly duplicatePolicy?: FileUploadDuplicatePolicy;
  /** ID of an external form that owns the native file input. */
  readonly form?: string;
  /** Produces a deterministic comparison key when duplicate rejection is enabled. */
  readonly getDuplicateKey?: (file: File) => string;
  /** Produces each new queue item's unique ID; duplicate returned IDs throw explicitly. */
  readonly getFileId?: (file: File, sequence: number) => string;
  /** Controlled queue; changes are reported without mutating this collection. */
  readonly items?: readonly FileUploadItem[];
  /** Required visible label naming the nested drop surface. */
  readonly label: ReactNode;
  /** Maximum total queue length enforced across existing and newly selected items. */
  readonly maxFiles?: number;
  /** Maximum accepted byte size when `validateFileSize` is enabled. */
  readonly maxSizeBytes?: number;
  /** Localized queue, recovery, and action copy with safe defaults for omitted entries. */
  readonly messages?: Partial<FileUploadMessages>;
  /** Native form field name used to serialize the current queue's File objects. */
  readonly name?: string;
  /** Invoked for an enabled cancel action; network cancellation remains consumer-owned. */
  readonly onCancel?: (item: FileUploadItem) => void;
  /** Reports immutable controlled or uncontrolled queue changes with a precise reason. */
  readonly onItemsChange?: (
    items: readonly FileUploadItem[],
    detail: FileUploadChangeDetail,
  ) => void;
  /** Invoked for an enabled retry action; upload and retry behavior remain consumer-owned. */
  readonly onRetry?: (item: FileUploadItem) => void;
  /** Runs after native form reset clears the queue and recovery state. */
  readonly onReset?: () => void;
  /** Receives newly accepted and rejected files independently of queue change handling. */
  readonly onSelection?: (result: FileUploadSelectionResult) => void;
  /** Prevents selection and queue mutation while retaining normal readable semantics. */
  readonly readOnly?: boolean;
  /** Renders an optional consumer-owned preview before each queue item's file metadata. */
  readonly renderPreview?: (item: FileUploadItem) => ReactNode;
  /** Adds earlier/later queue controls; false removes their UI and reorder events. */
  readonly reorderable?: boolean;
  /** Adds cancellation actions for active items when `onCancel` is supplied. */
  readonly showCancelActions?: boolean;
  /** Adds per-item progress semantics; false removes progress UI and announcements. */
  readonly showProgress?: boolean;
  /** Adds the live rejected-file recovery section; false retains no rejection UI state. */
  readonly showRejectionRecovery?: boolean;
  /** Adds queue removal controls; false removes their UI and remove events. */
  readonly showRemoveActions?: boolean;
  /** Adds retry actions for errored items when `onRetry` is supplied. */
  readonly showRetryActions?: boolean;
  /** Applies native required validation to the nested file input. */
  readonly required?: boolean;
  /** Enables byte-size preflight validation; false removes only size rejection. */
  readonly validateFileSize?: boolean;
}

const DEFAULT_MESSAGES: FileUploadMessages = {
  cancel: (name) => `Cancel ${name}`,
  empty: "No files in the queue.",
  moveDown: (name) => `Move ${name} later in the queue`,
  moveUp: (name) => `Move ${name} earlier in the queue`,
  queueLabel: "Selected files",
  rejectedHeading: "Files that need attention",
  remove: (name) => `Remove ${name}`,
  retry: (name) => `Retry ${name}`,
};

function hasVisibleContent(value: ReactNode): boolean {
  if (value === null || value === undefined || typeof value === "boolean") return false;
  if (typeof value === "string") return value.trim().length > 0;
  if (Array.isArray(value)) return value.some(hasVisibleContent);
  return true;
}

function assertMessage(value: string, label: string): string {
  if (value.trim().length === 0 || [...value].length > 512) {
    throw new RangeError(`Mergora FileUpload ${label} must contain 1 through 512 characters.`);
  }
  return value;
}

function assertItem(item: FileUploadItem): void {
  if (!(item.file instanceof File)) throw new TypeError("Mergora FileUpload items require a File.");
  if (item.id.trim().length === 0 || item.id.length > 512) {
    throw new RangeError("Mergora FileUpload item ids must contain 1 through 512 characters.");
  }
}

function assertProgressItem(item: FileUploadItem): void {
  if (
    item.progress !== undefined &&
    (!Number.isFinite(item.progress) || item.progress < 0 || item.progress > 100)
  ) {
    throw new RangeError("Mergora FileUpload item progress must be from zero through 100.");
  }
  if ((item.uploadedBytes === undefined) !== (item.totalBytes === undefined)) {
    throw new RangeError("Mergora FileUpload byte values must be supplied together.");
  }
}

function assertItems(items: readonly FileUploadItem[]): void {
  const ids = new Set<string>();
  for (const item of items) {
    assertItem(item);
    if (ids.has(item.id))
      throw new Error(`Mergora FileUpload item id ${JSON.stringify(item.id)} is duplicated.`);
    ids.add(item.id);
  }
}

export function getFileUploadFingerprint(file: File): string {
  return `${file.name.normalize("NFC")}\u0000${file.size}\u0000${file.type}\u0000${file.lastModified}`;
}

function rejectedFromFile(
  file: File,
  reason: FileUploadRejectionReason,
  duplicateOf?: string,
): FileUploadRejectedFile {
  return Object.freeze({
    ...(duplicateOf === undefined ? {} : { duplicateOf }),
    name: file.name,
    reason,
    size: file.size,
    type: file.type,
  });
}

export const FileUpload = forwardRef<HTMLDivElement, FileUploadProps>(function FileUpload(
  {
    acceptedFileTypes,
    allowsMultiple = true,
    className,
    defaultItems = [],
    description,
    disabled = false,
    duplicatePolicy = "allow",
    form,
    getDuplicateKey = getFileUploadFingerprint,
    getFileId,
    id,
    items,
    label,
    maxFiles = 20,
    maxSizeBytes = 100 * 1024 * 1024,
    messages: messageOverrides,
    name,
    onCancel,
    onItemsChange,
    onRetry,
    onReset,
    onSelection,
    readOnly = false,
    required = false,
    renderPreview,
    reorderable = false,
    showCancelActions = false,
    showProgress = false,
    showRejectionRecovery = false,
    showRemoveActions = false,
    showRetryActions = false,
    validateFileSize = false,
    ...nativeProps
  },
  ref,
) {
  if (!hasVisibleContent(label)) throw new Error("Mergora FileUpload requires a visible label.");
  if (items !== undefined && defaultItems.length > 0) {
    throw new Error("Mergora FileUpload cannot combine items with defaultItems.");
  }
  if (duplicatePolicy !== "allow" && duplicatePolicy !== "reject") {
    throw new TypeError("Mergora FileUpload duplicatePolicy must be allow or reject.");
  }
  const [internalItems, setInternalItems] = useState<readonly FileUploadItem[]>(() => {
    assertItems(defaultItems);
    return Object.freeze([...defaultItems]);
  });
  const [rejections, setRejections] = useState<readonly FileUploadRejectedFile[]>([]);
  const [formSyncError, setFormSyncError] = useState(false);
  const currentItems = items ?? internalItems;
  assertItems(currentItems);
  if (showProgress) {
    for (const item of currentItems) assertProgressItem(item);
  }
  const controlled = items !== undefined;
  const messages = { ...DEFAULT_MESSAGES, ...messageOverrides };
  assertMessage(messages.empty, "empty message");
  assertMessage(messages.queueLabel, "queue label");
  assertMessage(messages.rejectedHeading, "rejected heading");
  const generatedId = useId().replaceAll(":", "");
  const resolvedId = id ?? `mrg-file-upload-${generatedId}`;
  const queueId = `${resolvedId}-queue`;
  const rejectionId = showRejectionRecovery ? `${resolvedId}-rejections` : undefined;
  const formSyncErrorId = formSyncError ? `${resolvedId}-form-sync-error` : undefined;
  const { locale } = useMergoraContext();
  const rootRef = useRef<HTMLDivElement>(null);
  const sequenceRef = useRef(0);
  const participatesInForm = form !== undefined || name !== undefined || required;

  useEffect(() => {
    if (!participatesInForm) {
      setFormSyncError(false);
      return;
    }
    const input = rootRef.current?.querySelector<HTMLInputElement>('input[type="file"]');
    if (input === null || input === undefined) {
      setFormSyncError(true);
      return;
    }
    try {
      synchronizeFileInputFiles(
        input,
        currentItems.map((item) => item.file),
      );
      input.setCustomValidity("");
      setFormSyncError(false);
    } catch {
      input.setCustomValidity("Selected files could not be added to the form. Choose them again.");
      setFormSyncError(true);
    }
  }, [currentItems, participatesInForm]);

  const commit = (next: readonly FileUploadItem[], detail: FileUploadChangeDetail): void => {
    const frozen = Object.freeze([...next]);
    if (!controlled) setInternalItems(frozen);
    onItemsChange?.(frozen, Object.freeze(detail));
  };

  const handleFiles = (result: FileSelectionResult): void => {
    const accepted: FileUploadItem[] = [];
    const rejected: FileUploadRejectedFile[] = result.rejected.map((entry) =>
      Object.freeze({ ...entry }),
    );
    const duplicateOwners = new Map<string, string>();
    if (duplicatePolicy === "reject") {
      for (const item of currentItems) duplicateOwners.set(getDuplicateKey(item.file), item.id);
    }
    const itemIds = new Set(currentItems.map((item) => item.id));
    for (const file of result.accepted) {
      if (currentItems.length + accepted.length >= maxFiles) {
        rejected.push(rejectedFromFile(file, "file-count"));
        continue;
      }
      if (duplicatePolicy === "reject") {
        const key = getDuplicateKey(file);
        const owner = duplicateOwners.get(key);
        if (owner !== undefined) {
          rejected.push(rejectedFromFile(file, "duplicate", owner));
          continue;
        }
      }
      let sequence = ++sequenceRef.current;
      let itemId =
        getFileId?.(file, sequence) ?? `${getFileUploadFingerprint(file)}\u0000${sequence}`;
      while (getFileId === undefined && itemIds.has(itemId)) {
        sequence = ++sequenceRef.current;
        itemId = `${getFileUploadFingerprint(file)}\u0000${sequence}`;
      }
      if (itemIds.has(itemId)) {
        throw new Error(
          `Mergora FileUpload generated duplicate item id ${JSON.stringify(itemId)}.`,
        );
      }
      const item = Object.freeze({ file, id: itemId, status: "queued" as const });
      assertItem(item);
      accepted.push(item);
      itemIds.add(item.id);
      if (duplicatePolicy === "reject") duplicateOwners.set(getDuplicateKey(file), item.id);
    }
    const selection = Object.freeze({
      accepted: Object.freeze(accepted),
      rejected: Object.freeze(rejected),
      source: result.source,
    });
    const next = [...currentItems, ...accepted];
    commit(next, { reason: "selection", selection });
    if (showRejectionRecovery) setRejections(selection.rejected);
    onSelection?.(selection);
  };

  const remove = (item: FileUploadItem): void => {
    commit(
      currentItems.filter((candidate) => candidate.id !== item.id),
      { itemId: item.id, reason: "remove" },
    );
  };

  const move = (index: number, offset: -1 | 1): void => {
    const destination = index + offset;
    if (destination < 0 || destination >= currentItems.length) return;
    const next = [...currentItems];
    const [item] = next.splice(index, 1);
    if (item === undefined) return;
    next.splice(destination, 0, item);
    commit(next, { itemId: item.id, reason: "reorder" });
  };

  const handleReset = (): void => {
    commit([], { reason: "reset" });
    if (showRejectionRecovery) setRejections([]);
    setFormSyncError(false);
    onReset?.();
  };

  return (
    <div
      {...nativeProps}
      aria-disabled={disabled || undefined}
      aria-describedby={[rejectionId, formSyncErrorId].filter(Boolean).join(" ") || undefined}
      className={className === undefined ? "mrg-file-upload" : `mrg-file-upload ${className}`}
      data-disabled={disabled ? "true" : undefined}
      data-readonly={readOnly ? "true" : undefined}
      data-slot="file-upload"
      id={resolvedId}
      ref={(node) => {
        rootRef.current = node;
        if (typeof ref === "function") ref(node);
        else if (ref !== null) ref.current = node;
      }}
    >
      <Dropzone
        {...(acceptedFileTypes === undefined ? {} : { acceptedFileTypes })}
        allowsMultiple={allowsMultiple}
        description={description}
        disabled={disabled || readOnly}
        label={label}
        maxFiles={maxFiles}
        maxSizeBytes={maxSizeBytes}
        onFiles={handleFiles}
        onReset={handleReset}
        required={required}
        validateFileSize={validateFileSize}
        {...(form === undefined ? {} : { form })}
        {...(name === undefined ? {} : { name })}
      />
      {formSyncError ? (
        <p data-slot="file-upload-form-error" id={formSyncErrorId} role="alert">
          Selected files could not be added to the form. Choose them again.
        </p>
      ) : null}
      <section aria-labelledby={`${queueId}-heading`} data-slot="file-upload-queue">
        <h2 data-slot="file-upload-queue-heading" id={`${queueId}-heading`}>
          {messages.queueLabel}
        </h2>
        {currentItems.length === 0 ? (
          <p data-slot="file-upload-empty">{messages.empty}</p>
        ) : (
          <ol data-slot="file-upload-items" id={queueId}>
            {currentItems.map((item, index) => {
              const status = item.status ?? "queued";
              return (
                <li data-slot="file-upload-item" data-status={status} key={item.id}>
                  {renderPreview === undefined ? null : (
                    <div data-slot="file-upload-preview">{renderPreview(item)}</div>
                  )}
                  <div data-slot="file-upload-file">
                    <strong>{item.file.name}</strong>
                    <span>
                      {formatUploadBytes(item.file.size, locale)}
                      {item.file.type.length === 0 ? "" : ` · ${item.file.type}`}
                    </span>
                  </div>
                  {showProgress ? (
                    <UploadProgress
                      announceProgress
                      label={item.file.name}
                      message={item.message}
                      status={status}
                      {...(item.totalBytes === undefined || item.uploadedBytes === undefined
                        ? {}
                        : { totalBytes: item.totalBytes, uploadedBytes: item.uploadedBytes })}
                      {...(item.progress === undefined ? {} : { value: item.progress })}
                    />
                  ) : null}
                  {reorderable || showCancelActions || showRemoveActions || showRetryActions ? (
                    <div data-slot="file-upload-actions">
                      {reorderable ? (
                        <>
                          <button
                            aria-label={assertMessage(
                              messages.moveUp(item.file.name),
                              "move-up label",
                            )}
                            disabled={disabled || readOnly || index === 0}
                            onClick={() => move(index, -1)}
                            type="button"
                          >
                            Earlier
                          </button>
                          <button
                            aria-label={assertMessage(
                              messages.moveDown(item.file.name),
                              "move-down label",
                            )}
                            disabled={disabled || readOnly || index === currentItems.length - 1}
                            onClick={() => move(index, 1)}
                            type="button"
                          >
                            Later
                          </button>
                        </>
                      ) : null}
                      {showRetryActions && status === "error" && onRetry !== undefined ? (
                        <button
                          disabled={disabled || readOnly}
                          onClick={() => onRetry(item)}
                          type="button"
                        >
                          {assertMessage(messages.retry(item.file.name), "retry label")}
                        </button>
                      ) : null}
                      {showCancelActions &&
                      ["queued", "retrying", "uploading"].includes(status) &&
                      onCancel !== undefined ? (
                        <button
                          disabled={disabled || readOnly}
                          onClick={() => onCancel(item)}
                          type="button"
                        >
                          {assertMessage(messages.cancel(item.file.name), "cancel label")}
                        </button>
                      ) : null}
                      {showRemoveActions ? (
                        <button
                          disabled={disabled || readOnly}
                          onClick={() => remove(item)}
                          type="button"
                        >
                          {assertMessage(messages.remove(item.file.name), "remove label")}
                        </button>
                      ) : null}
                    </div>
                  ) : null}
                </li>
              );
            })}
          </ol>
        )}
      </section>
      {showRejectionRecovery ? (
        <section aria-live="polite" data-slot="file-upload-rejections" id={rejectionId}>
          <h3>{messages.rejectedHeading}</h3>
          {rejections.length === 0 ? (
            <p>No files need attention.</p>
          ) : (
            <ul>
              {rejections.map((rejection, index) => (
                <li key={`${rejection.name}-${rejection.reason}-${index}`}>
                  <strong>{rejection.name}</strong>: {rejection.reason}
                </li>
              ))}
            </ul>
          )}
        </section>
      ) : null}
    </div>
  );
});

FileUpload.displayName = "FileUpload";
