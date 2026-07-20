"use client";

import {
  forwardRef,
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
  type ClipboardEvent,
  type HTMLAttributes,
  type ReactNode,
} from "react";
import {
  DropZone as AriaDropZone,
  type DropZoneProps as AriaDropZoneProps,
} from "react-aria-components";

import {
  FileTrigger,
  fileMatchesAcceptedType,
  normalizeAcceptedFileTypes,
} from "../file-trigger/index.js";
import { synchronizeFileInputFiles } from "../file-trigger/file-trigger.js";
import "./dropzone.css";

export type FileRejectionReason =
  | "directory-not-supported"
  | "file-count"
  | "file-too-large"
  | "file-type"
  | "unreadable"
  | "unsupported-item";

export interface RejectedFileSelection {
  /** File name supplied by the browser or drop item for recovery messaging. */
  readonly name: string;
  /** Machine-readable reason the selection did not enter the accepted collection. */
  readonly reason: FileRejectionReason;
  /** File size in bytes when the rejected source exposed that metadata. */
  readonly size?: number;
  /** MIME type reported by the rejected source when that metadata is available. */
  readonly type?: string;
}

export interface FileSelectionResult {
  /** Immutable files that passed enabled count, type, and size checks. */
  readonly accepted: readonly File[];
  /** Whether accepted files were copied into the native form input when form participation is enabled. */
  readonly formDataSynchronized?: boolean;
  /** Immutable recovery records for every materialized item that was not accepted. */
  readonly rejected: readonly RejectedFileSelection[];
  /** Input path that produced this result so consumers can distinguish drop, paste, and picker use. */
  readonly source: "drop" | "paste" | "picker";
}

export interface DropzoneMessages {
  /** Live-region message used while dropped browser items are being materialized. */
  readonly busy: string;
  /** Initial and reset live-region message when no selection has been processed. */
  readonly idle: string;
  /** Recovery message announced when accepted files cannot be synchronized with the native form input. */
  readonly formSyncFailed: string;
  /** Builds the accepted and rejected count summary announced after classification. */
  readonly selected: (accepted: number, rejected: number) => string;
  /** Accessible label and visible text for the native file-picker action. */
  readonly selectAction: string;
}

export interface DropzoneProps extends Omit<
  HTMLAttributes<HTMLDivElement>,
  "children" | "form" | "onDrop" | "onPaste" | "onPasteCapture" | "onReset"
> {
  /** MIME types, extensions, or wildcards accepted by the shared file classifier and native picker. */
  readonly acceptedFileTypes?: readonly string[];
  /** Allows multiple accepted files; false limits every input path to one file. */
  readonly allowsMultiple?: boolean;
  /** Optional visible guidance linked to the drop surface through `aria-describedby`. */
  readonly description?: ReactNode;
  /** Disables drop, paste, and picker interaction without removing the component's context. */
  readonly disabled?: boolean;
  /** ID of an external form that should own the component's native file input. */
  readonly form?: string;
  /** Required visible name for the drop surface and its accessible label relationship. */
  readonly label: ReactNode;
  /** Maximum accepted-file count, bounded from one through 100 across all input paths. */
  readonly maxFiles?: number;
  /** Maximum file size in bytes when `validateFileSize` is enabled. */
  readonly maxSizeBytes?: number;
  /** Localized status and action overrides; omitted entries retain safe defaults. */
  readonly messages?: Partial<DropzoneMessages>;
  /** Native form field name; providing it enables accepted-file synchronization. */
  readonly name?: string;
  /** Receives one immutable accepted/rejected result for picker, paste, or drop selection. */
  readonly onFiles: (result: FileSelectionResult) => void;
  /** Runs after the owning native form resets and the internal status returns to idle. */
  readonly onReset?: () => void;
  /** Applies native required validation to the hidden file input used for form submission. */
  readonly required?: boolean;
  /** Enables byte-size rejection; false removes size checking while count and type checks remain. */
  readonly validateFileSize?: boolean;
}

type DropEvent = Parameters<NonNullable<AriaDropZoneProps["onDrop"]>>[0];

const DEFAULT_MESSAGES: DropzoneMessages = {
  busy: "Checking selected files.",
  formSyncFailed: "Selected files could not be added to the form. Choose them again.",
  idle: "No files selected.",
  selectAction: "Choose files",
  selected: (accepted, rejected) =>
    `${accepted} ${accepted === 1 ? "file" : "files"} ready${
      rejected === 0 ? "." : `; ${rejected} rejected.`
    }`,
};

function hasVisibleContent(value: ReactNode): boolean {
  if (value === null || value === undefined || typeof value === "boolean") return false;
  if (typeof value === "string") return value.trim().length > 0;
  if (Array.isArray(value)) return value.some(hasVisibleContent);
  return true;
}

function assertBoundedInteger(value: number, label: string, maximum: number): void {
  if (!Number.isSafeInteger(value) || value < 1 || value > maximum) {
    throw new RangeError(`Mergora Dropzone ${label} must be an integer from 1 through ${maximum}.`);
  }
}

function assertMessage(value: string, label: string): string {
  if (value.trim().length === 0 || [...value].length > 512) {
    throw new RangeError(`Mergora Dropzone ${label} must contain 1 through 512 characters.`);
  }
  return value;
}

function rejectedFromFile(file: File, reason: FileRejectionReason): RejectedFileSelection {
  return Object.freeze({ name: file.name, reason, size: file.size, type: file.type });
}

function classifyFiles(
  files: readonly File[],
  source: FileSelectionResult["source"],
  acceptedFileTypes: readonly string[],
  allowsMultiple: boolean,
  maxFiles: number,
  maxSizeBytes: number,
  validateFileSize: boolean,
): FileSelectionResult {
  const accepted: File[] = [];
  const rejected: RejectedFileSelection[] = [];
  const allowedCount = allowsMultiple ? maxFiles : 1;
  for (const file of files.slice(0, 100)) {
    if (accepted.length >= allowedCount) rejected.push(rejectedFromFile(file, "file-count"));
    else if (validateFileSize && file.size > maxSizeBytes) {
      rejected.push(rejectedFromFile(file, "file-too-large"));
    } else if (!fileMatchesAcceptedType(file, acceptedFileTypes)) {
      rejected.push(rejectedFromFile(file, "file-type"));
    } else accepted.push(file);
  }
  if (files.length > 100) {
    rejected.push(
      Object.freeze({ name: `${files.length - 100} additional items`, reason: "file-count" }),
    );
  }
  return Object.freeze({
    accepted: Object.freeze(accepted),
    rejected: Object.freeze(rejected),
    source,
  });
}

export const Dropzone = forwardRef<HTMLDivElement, DropzoneProps>(function Dropzone(
  {
    acceptedFileTypes,
    allowsMultiple = true,
    className,
    description,
    disabled = false,
    form,
    id,
    label,
    maxFiles = 20,
    maxSizeBytes = 100 * 1024 * 1024,
    messages: messageOverrides,
    name,
    onFiles,
    onReset,
    required = false,
    validateFileSize = true,
    ...nativeProps
  },
  ref,
) {
  if (!hasVisibleContent(label)) throw new Error("Mergora Dropzone requires a visible label.");
  assertBoundedInteger(maxFiles, "maxFiles", 100);
  if (validateFileSize) {
    assertBoundedInteger(maxSizeBytes, "maxSizeBytes", 2 * 1024 * 1024 * 1024);
  }
  const accepted = normalizeAcceptedFileTypes(acceptedFileTypes);
  const messages = { ...DEFAULT_MESSAGES, ...messageOverrides };
  assertMessage(messages.busy, "busy message");
  assertMessage(messages.idle, "idle message");
  assertMessage(messages.selectAction, "selectAction");
  const generatedId = useId().replaceAll(":", "");
  const resolvedId = id ?? `mrg-dropzone-${generatedId}`;
  const labelId = `${resolvedId}-label`;
  const descriptionId = description === undefined ? undefined : `${resolvedId}-description`;
  const statusId = `${resolvedId}-status`;
  const requestSequence = useRef(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState(messages.idle);
  const participatesInForm = form !== undefined || name !== undefined || required;

  useEffect(() => {
    const input = inputRef.current;
    const owner = input?.form;
    if (owner === null || owner === undefined) return;
    const handleReset = () => {
      requestSequence.current += 1;
      setBusy(false);
      setStatus(messages.idle);
      onReset?.();
    };
    owner.addEventListener("reset", handleReset);
    return () => owner.removeEventListener("reset", handleReset);
  }, [messages.idle, onReset]);

  const finalize = useCallback(
    (result: FileSelectionResult): FileSelectionResult => {
      if (!participatesInForm) return result;
      const input = inputRef.current;
      let synchronized = false;
      if (input !== null) {
        try {
          synchronizeFileInputFiles(input, result.accepted);
          synchronized = true;
        } catch {
          synchronized = false;
        }
      }
      if (!synchronized) setStatus(messages.formSyncFailed);
      return Object.freeze({ ...result, formDataSynchronized: synchronized });
    },
    [messages.formSyncFailed, participatesInForm],
  );

  const publish = useCallback(
    (files: readonly File[], source: FileSelectionResult["source"]) => {
      requestSequence.current += 1;
      const result = classifyFiles(
        files,
        source,
        accepted,
        allowsMultiple,
        maxFiles,
        maxSizeBytes,
        validateFileSize,
      );
      const finalized = finalize(result);
      setBusy(false);
      if (finalized.formDataSynchronized !== false) {
        setStatus(
          assertMessage(
            messages.selected(result.accepted.length, result.rejected.length),
            "selected summary",
          ),
        );
      }
      onFiles(finalized);
    },
    [
      accepted,
      allowsMultiple,
      finalize,
      maxFiles,
      maxSizeBytes,
      messages,
      onFiles,
      validateFileSize,
    ],
  );

  const handleDrop = useCallback(
    (event: DropEvent) => {
      const sequence = ++requestSequence.current;
      setBusy(true);
      setStatus(messages.busy);
      void Promise.all(
        event.items.slice(0, 100).map(async (item): Promise<File | RejectedFileSelection> => {
          if (item.kind === "directory") {
            return Object.freeze({ name: item.name, reason: "directory-not-supported" });
          }
          if (item.kind !== "file") {
            return Object.freeze({ name: "Non-file item", reason: "unsupported-item" });
          }
          try {
            return await item.getFile();
          } catch {
            return Object.freeze({ name: item.name, reason: "unreadable", type: item.type });
          }
        }),
      ).then((items) => {
        if (sequence !== requestSequence.current) return;
        const files = items.filter((item): item is File => item instanceof File);
        const preRejected = items.filter(
          (item): item is RejectedFileSelection => !(item instanceof File),
        );
        const classified = classifyFiles(
          files,
          "drop",
          accepted,
          allowsMultiple,
          maxFiles,
          maxSizeBytes,
          validateFileSize,
        );
        const rejected = Object.freeze([...preRejected, ...classified.rejected]);
        const result = Object.freeze({ ...classified, rejected });
        const finalized = finalize(result);
        setBusy(false);
        if (finalized.formDataSynchronized !== false) {
          setStatus(
            assertMessage(
              messages.selected(result.accepted.length, result.rejected.length),
              "selected summary",
            ),
          );
        }
        onFiles(finalized);
      });
    },
    [
      accepted,
      allowsMultiple,
      finalize,
      maxFiles,
      maxSizeBytes,
      messages,
      onFiles,
      validateFileSize,
    ],
  );

  const handlePaste = (event: ClipboardEvent<HTMLDivElement>): void => {
    if (disabled || event.clipboardData.files.length === 0) return;
    event.preventDefault();
    event.stopPropagation();
    publish(Object.freeze(Array.from(event.clipboardData.files)), "paste");
  };

  return (
    <div
      {...nativeProps}
      className={className === undefined ? "mrg-dropzone" : `mrg-dropzone ${className}`}
      data-busy={busy ? "true" : undefined}
      data-disabled={disabled ? "true" : undefined}
      data-slot="dropzone"
      id={resolvedId}
      onPasteCapture={handlePaste}
    >
      <AriaDropZone
        aria-describedby={[descriptionId, statusId].filter(Boolean).join(" ")}
        aria-labelledby={labelId}
        className="mrg-dropzone-surface"
        getDropOperation={() => (disabled ? "cancel" : "copy")}
        isDisabled={disabled || busy}
        onDrop={handleDrop}
        ref={ref}
      >
        <span data-slot="dropzone-label" id={labelId}>
          {label}
        </span>
        {description === undefined ? null : (
          <span data-slot="dropzone-description" id={descriptionId}>
            {description}
          </span>
        )}
        <FileTrigger
          {...(accepted.length === 0 ? {} : { acceptedFileTypes: accepted })}
          allowsMultiple={allowsMultiple}
          disabled={disabled || busy}
          form={form}
          label={messages.selectAction}
          name={name}
          onSelect={(files) => publish(files, "picker")}
          ref={inputRef}
          required={required}
        />
        <span aria-atomic="true" aria-live="polite" data-slot="dropzone-status" id={statusId}>
          {status}
        </span>
      </AriaDropZone>
    </div>
  );
});

Dropzone.displayName = "Dropzone";
