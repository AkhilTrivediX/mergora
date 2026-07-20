"use client";

import {
  forwardRef,
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
  type HTMLAttributes,
  type ReactNode,
} from "react";

import {
  FileTrigger,
  fileMatchesAcceptedType,
  normalizeAcceptedFileTypes,
} from "../file-trigger/index.js";
import { synchronizeFileInputFiles } from "../file-trigger/file-trigger.js";
import { useMergoraContext } from "../provider/index.js";
import {
  UploadProgress,
  formatUploadBytes,
  type UploadProgressStatus,
} from "../upload-progress/index.js";
import "./avatar-upload.css";

export type AvatarUploadChangeReason = "remove" | "reset" | "selection";
export type AvatarUploadRejectionReason = "file-too-large" | "file-type";

export interface AvatarUploadChangeDetail {
  /** Identifies selection, removal, or native form reset as the value-change cause. */
  readonly reason: AvatarUploadChangeReason;
}

export interface AvatarUploadRejection {
  /** Returns the original local file so consumers can present or log recovery context. */
  readonly file: File;
  /** Identifies file type or size as the preflight rejection cause. */
  readonly reason: AvatarUploadRejectionReason;
}

export interface AvatarUploadMessages {
  /** Labels the action that opens the native image picker. */
  readonly choose: string;
  /** Labels the optional consumer-owned image editing action. */
  readonly edit: string;
  /** Explains how to recover when local size preflight rejects an image. */
  readonly fileTooLarge: string;
  /** Explains how to recover when local type preflight rejects an image. */
  readonly fileType: string;
  /** Generates preview alternative text from the selected file name. */
  readonly previewAlt: (name: string) => string;
  /** Labels the optional action that clears the selected image. */
  readonly remove: string;
  /** Labels the native picker when an image is already selected. */
  readonly replace: string;
  /** Labels the optional consumer-owned upload retry action. */
  readonly retry: string;
}

export interface AvatarUploadProps extends Omit<
  HTMLAttributes<HTMLDivElement>,
  "children" | "defaultValue" | "onChange"
> {
  /** Restricts native selection and local preflight to normalized MIME or extension tokens. */
  readonly acceptedFileTypes?: readonly string[];
  /** Sets the initial local file for uncontrolled use. */
  readonly defaultValue?: File | null;
  /** Adds visible picker guidance without changing native acceptance behavior. */
  readonly description?: ReactNode;
  /** Prevents selection, removal, editing, retry, and other actions. */
  readonly disabled?: boolean;
  /** Associates the native file input with a form elsewhere in the document. */
  readonly form?: string;
  /** Names the native file control and visible upload surface. */
  readonly label: ReactNode;
  /** Sets the local byte limit used only when file-size preflight is enabled. */
  readonly maxSizeBytes?: number;
  /** Overrides individual localized strings while retaining defaults for omitted entries. */
  readonly messages?: Partial<AvatarUploadMessages>;
  /** Makes the synchronized native file input a successful form control. */
  readonly name?: string;
  /** Enables a consumer-owned editor callback; omission removes the edit behavior. */
  readonly onEdit?: (file: File) => void;
  /** Reports local preflight rejection before the controlled or uncontrolled value changes. */
  readonly onRejected?: (rejection: AvatarUploadRejection) => void;
  /** Enables a consumer-owned retry callback without performing network requests. */
  readonly onRetry?: (file: File) => void;
  /** Reports selection, removal, and form-reset changes with their cause. */
  readonly onValueChange?: (file: File | null, detail: AvatarUploadChangeDetail) => void;
  /** Overrides generated preview text for the currently selected image. */
  readonly previewAlt?: string;
  /** Transforms preview bytes with an abort signal without changing the submitted File. */
  readonly previewTransform?: (file: File, signal: AbortSignal) => Blob | Promise<Blob>;
  /** Preserves selection and form submission while removing mutating actions. */
  readonly readOnly?: boolean;
  /** Applies native required validation to the synchronized file input. */
  readonly required?: boolean;
  /** Shows edit UI only when onEdit exists; false removes the action entirely. */
  readonly showEditAction?: boolean;
  /** Shows local file type and size metadata; false removes the metadata output. */
  readonly showImageMetadata?: boolean;
  /** Creates a local object-URL preview; false creates no preview URL or image semantics. */
  readonly showPreview?: boolean;
  /** Shows recoverable rejection text; false removes the rejection alert output. */
  readonly showRejectionRecovery?: boolean;
  /** Shows the clear action; false removes its UI and behavior. */
  readonly showRemoveAction?: boolean;
  /** Shows retry UI only when onRetry exists; false removes the action entirely. */
  readonly showRetryAction?: boolean;
  /** Shows consumer-supplied upload state; false removes progress UI and announcements. */
  readonly showUploadProgress?: boolean;
  /** Adds consumer-controlled progress context without initiating an upload. */
  readonly uploadMessage?: ReactNode;
  /** Supplies consumer-controlled upload lifecycle state. */
  readonly uploadStatus?: UploadProgressStatus;
  /** Supplies total bytes for optional progress context. */
  readonly uploadTotalBytes?: number;
  /** Supplies completed bytes for optional progress context. */
  readonly uploadUploadedBytes?: number;
  /** Supplies the current numeric value for optional progress context. */
  readonly uploadValue?: number;
  /** Enables local byte-limit preflight; false skips size rejection entirely. */
  readonly validateFileSize?: boolean;
  /** Controls the selected local file when supplied. */
  readonly value?: File | null;
}

const DEFAULT_ACCEPTED_FILE_TYPES = Object.freeze(["image/*"]);

const DEFAULT_MESSAGES: AvatarUploadMessages = {
  choose: "Choose image",
  edit: "Edit image",
  fileTooLarge: "This image is larger than the allowed size. Choose a smaller image.",
  fileType: "Choose a supported image file.",
  previewAlt: (name) => `Preview of ${name}`,
  remove: "Remove image",
  replace: "Replace image",
  retry: "Retry upload",
};

function hasVisibleContent(value: ReactNode): boolean {
  if (value === null || value === undefined || typeof value === "boolean") return false;
  if (typeof value === "string") return value.trim().length > 0;
  if (Array.isArray(value)) return value.some(hasVisibleContent);
  return true;
}

function assertMessage(value: string, label: string): string {
  if (value.trim().length === 0 || [...value].length > 512) {
    throw new RangeError(`Mergora AvatarUpload ${label} must contain 1 through 512 characters.`);
  }
  return value;
}

export const AvatarUpload = forwardRef<HTMLDivElement, AvatarUploadProps>(function AvatarUpload(
  {
    acceptedFileTypes = DEFAULT_ACCEPTED_FILE_TYPES,
    className,
    defaultValue = null,
    description,
    disabled = false,
    form,
    id,
    label,
    maxSizeBytes = 10 * 1024 * 1024,
    messages: messageOverrides,
    name,
    onEdit,
    onRejected,
    onRetry,
    onValueChange,
    previewAlt,
    previewTransform,
    readOnly = false,
    required = false,
    showEditAction = false,
    showImageMetadata = false,
    showPreview = false,
    showRejectionRecovery = false,
    showRemoveAction = false,
    showRetryAction = false,
    showUploadProgress = false,
    uploadMessage,
    uploadStatus = "queued",
    uploadTotalBytes,
    uploadUploadedBytes,
    uploadValue,
    validateFileSize = false,
    value,
    ...nativeProps
  },
  ref,
) {
  if (!hasVisibleContent(label)) throw new Error("Mergora AvatarUpload requires a visible label.");
  if (value !== undefined && defaultValue !== null) {
    throw new Error("Mergora AvatarUpload cannot combine value with defaultValue.");
  }
  if (validateFileSize && (!Number.isSafeInteger(maxSizeBytes) || maxSizeBytes < 1)) {
    throw new RangeError("Mergora AvatarUpload maxSizeBytes must be a positive safe integer.");
  }
  if (showEditAction && onEdit === undefined) {
    throw new Error("Mergora AvatarUpload showEditAction requires onEdit.");
  }
  if (showRetryAction && onRetry === undefined) {
    throw new Error("Mergora AvatarUpload showRetryAction requires onRetry.");
  }
  if (previewAlt !== undefined) assertMessage(previewAlt, "preview alt text");
  const accepted = normalizeAcceptedFileTypes(acceptedFileTypes);
  const messages = { ...DEFAULT_MESSAGES, ...messageOverrides };
  assertMessage(messages.choose, "choose label");
  assertMessage(messages.edit, "edit label");
  assertMessage(messages.fileTooLarge, "file-too-large message");
  assertMessage(messages.fileType, "file-type message");
  assertMessage(messages.remove, "remove label");
  assertMessage(messages.replace, "replace label");
  assertMessage(messages.retry, "retry label");
  const [internalValue, setInternalValue] = useState<File | null>(defaultValue);
  const [rejection, setRejection] = useState<string | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [previewError, setPreviewError] = useState(false);
  const [formSyncError, setFormSyncError] = useState(false);
  const currentValue = value === undefined ? internalValue : value;
  const controlled = value !== undefined;
  const inputRef = useRef<HTMLInputElement>(null);
  const generatedId = useId().replaceAll(":", "");
  const resolvedId = id ?? `mrg-avatar-upload-${generatedId}`;
  const rejectionId = showRejectionRecovery ? `${resolvedId}-rejection` : undefined;
  const formSyncErrorId = formSyncError ? `${resolvedId}-form-sync-error` : undefined;
  const { locale } = useMergoraContext();
  const participatesInForm = form !== undefined || name !== undefined || required;

  const commit = useCallback(
    (next: File | null, reason: AvatarUploadChangeReason): void => {
      if (!controlled) setInternalValue(next);
      onValueChange?.(next, Object.freeze({ reason }));
    },
    [controlled, onValueChange],
  );

  useEffect(() => {
    const owner = inputRef.current?.form;
    if (owner === null || owner === undefined) return;
    const handleReset = () => {
      commit(null, "reset");
      if (showRejectionRecovery) setRejection(null);
    };
    owner.addEventListener("reset", handleReset);
    return () => owner.removeEventListener("reset", handleReset);
  }, [commit, showRejectionRecovery]);

  useEffect(() => {
    if (!participatesInForm) {
      setFormSyncError(false);
      return;
    }
    const input = inputRef.current;
    if (input === null) {
      setFormSyncError(true);
      return;
    }
    try {
      synchronizeFileInputFiles(input, currentValue === null ? [] : [currentValue]);
      input.setCustomValidity("");
      setFormSyncError(false);
    } catch {
      input.setCustomValidity("Selected image could not be added to the form. Choose it again.");
      setFormSyncError(true);
    }
  }, [currentValue, participatesInForm]);

  useEffect(() => {
    if (!showPreview || currentValue === null) {
      setPreviewUrl(null);
      setPreviewError(false);
      return;
    }
    const controller = new AbortController();
    let ownedUrl: string | undefined;
    setPreviewUrl(null);
    setPreviewError(false);
    void Promise.resolve(previewTransform?.(currentValue, controller.signal) ?? currentValue)
      .then((blob) => {
        if (controller.signal.aborted) return;
        if (!(blob instanceof Blob)) {
          throw new TypeError("Mergora AvatarUpload previewTransform must return a Blob.");
        }
        ownedUrl = URL.createObjectURL(blob);
        setPreviewUrl(ownedUrl);
      })
      .catch(() => {
        if (!controller.signal.aborted) setPreviewError(true);
      });
    return () => {
      controller.abort();
      if (ownedUrl !== undefined) URL.revokeObjectURL(ownedUrl);
    };
  }, [currentValue, previewTransform, showPreview]);

  const reject = (file: File, reason: AvatarUploadRejectionReason, message: string): void => {
    const input = inputRef.current;
    if (input !== null) {
      input.value = "";
      input.setCustomValidity(message);
    }
    if (showRejectionRecovery) setRejection(message);
    onRejected?.(Object.freeze({ file, reason }));
  };

  const handleSelection = (files: readonly File[]): void => {
    const file = files[0];
    if (file === undefined) return;
    if (!fileMatchesAcceptedType(file, accepted)) {
      reject(file, "file-type", messages.fileType);
      return;
    }
    if (validateFileSize && file.size > maxSizeBytes) {
      reject(file, "file-too-large", messages.fileTooLarge);
      return;
    }
    inputRef.current?.setCustomValidity("");
    if (showRejectionRecovery) setRejection(null);
    commit(file, "selection");
  };

  const remove = (): void => {
    if (inputRef.current !== null) {
      inputRef.current.value = "";
      inputRef.current.setCustomValidity("");
    }
    if (showRejectionRecovery) setRejection(null);
    commit(null, "remove");
  };

  const resolvedPreviewAlt =
    currentValue === null
      ? ""
      : assertMessage(previewAlt ?? messages.previewAlt(currentValue.name), "preview alt text");

  return (
    <div
      {...nativeProps}
      aria-disabled={disabled || undefined}
      aria-readonly={readOnly || undefined}
      className={className === undefined ? "mrg-avatar-upload" : `mrg-avatar-upload ${className}`}
      data-disabled={disabled ? "true" : undefined}
      data-readonly={readOnly ? "true" : undefined}
      data-slot="avatar-upload"
      id={resolvedId}
      ref={ref}
    >
      {formSyncError ? (
        <p data-slot="avatar-upload-form-error" id={formSyncErrorId} role="alert">
          Selected image could not be added to the form. Choose it again.
        </p>
      ) : null}
      <div data-slot="avatar-upload-intake">
        <div
          data-empty={currentValue === null ? "true" : undefined}
          data-slot="avatar-upload-visual"
        >
          {showPreview && currentValue !== null ? (
            previewUrl === null ? (
              <span aria-live="polite" data-slot="avatar-upload-preview-status">
                {previewError ? "Preview unavailable." : "Preparing preview."}
              </span>
            ) : (
              <img alt={resolvedPreviewAlt} data-slot="avatar-upload-preview" src={previewUrl} />
            )
          ) : (
            <span aria-hidden="true" data-slot="avatar-upload-placeholder">
              {currentValue === null ? "Add" : "Ready"}
            </span>
          )}
        </div>
        <div data-slot="avatar-upload-controls">
          <strong data-slot="avatar-upload-label">{label}</strong>
          <FileTrigger
            acceptedFileTypes={accepted}
            description={description}
            disabled={disabled || readOnly}
            form={form}
            label={currentValue === null ? messages.choose : messages.replace}
            name={name}
            onSelect={handleSelection}
            ref={inputRef}
            required={required}
          />
          {currentValue !== null && (showEditAction || showRemoveAction) ? (
            <div data-slot="avatar-upload-actions">
              {showEditAction ? (
                <button
                  disabled={disabled || readOnly}
                  onClick={() => onEdit?.(currentValue)}
                  type="button"
                >
                  {messages.edit}
                </button>
              ) : null}
              {showRemoveAction ? (
                <button disabled={disabled || readOnly} onClick={remove} type="button">
                  {messages.remove}
                </button>
              ) : null}
            </div>
          ) : null}
        </div>
      </div>
      {showImageMetadata && currentValue !== null ? (
        <dl data-slot="avatar-upload-metadata">
          <div>
            <dt>File</dt>
            <dd>{currentValue.name}</dd>
          </div>
          <div>
            <dt>Size</dt>
            <dd>{formatUploadBytes(currentValue.size, locale)}</dd>
          </div>
          <div>
            <dt>Type</dt>
            <dd>{currentValue.type.length === 0 ? "Unknown" : currentValue.type}</dd>
          </div>
        </dl>
      ) : null}
      {showUploadProgress && currentValue !== null ? (
        <div data-slot="avatar-upload-lifecycle">
          <UploadProgress
            label={currentValue.name}
            message={uploadMessage}
            status={uploadStatus}
            {...(uploadTotalBytes === undefined || uploadUploadedBytes === undefined
              ? {}
              : { totalBytes: uploadTotalBytes, uploadedBytes: uploadUploadedBytes })}
            {...(uploadValue === undefined ? {} : { value: uploadValue })}
          />
          {showRetryAction && uploadStatus === "error" ? (
            <button
              disabled={disabled || readOnly}
              onClick={() => onRetry?.(currentValue)}
              type="button"
            >
              {messages.retry}
            </button>
          ) : null}
        </div>
      ) : null}
      {showRejectionRecovery ? (
        <p aria-live="polite" data-slot="avatar-upload-rejection" id={rejectionId}>
          {rejection ?? "Choose an image when you are ready."}
        </p>
      ) : null}
    </div>
  );
});

AvatarUpload.displayName = "AvatarUpload";
