// Generated from registry/source/components/file-trigger/file-trigger.tsx by @mergora-internal/source-transformer. Do not edit.
"use client";

import {
  forwardRef,
  useId,
  type ChangeEvent,
  type InputHTMLAttributes,
  type ReactNode,
} from "react";

import "./file-trigger.css";

export type FileCaptureMode = "environment" | "user";

export interface FileTriggerProps extends Omit<
  InputHTMLAttributes<HTMLInputElement>,
  "accept" | "capture" | "children" | "className" | "multiple" | "onChange" | "onSelect" | "type"
> {
  /** Enables directory selection where the browser supports the native directory attribute. */
  readonly acceptDirectory?: boolean;
  /** Sets normalized MIME or extension tokens on the native accept attribute. */
  readonly acceptedFileTypes?: readonly string[];
  /** Enables native multiple selection and preserves every selected File. */
  readonly allowsMultiple?: boolean;
  /** Requests the user- or environment-facing capture device on supported mobile browsers. */
  readonly capture?: FileCaptureMode;
  /** Styles the visible label wrapper while the native input remains visually hidden. */
  readonly className?: string;
  /** Adds visible guidance associated with the native file input. */
  readonly description?: ReactNode;
  /** Names and activates the native file input. */
  readonly label: ReactNode;
  /** Reports immutable selected Files while native input and form behavior remain intact. */
  readonly onSelect?: (files: readonly File[], event: ChangeEvent<HTMLInputElement>) => void;
}

function hasVisibleContent(value: ReactNode): boolean {
  if (value === null || value === undefined || typeof value === "boolean") return false;
  if (typeof value === "string") return value.trim().length > 0;
  if (Array.isArray(value)) return value.some(hasVisibleContent);
  return true;
}

export function normalizeAcceptedFileTypes(
  acceptedFileTypes: readonly string[] | undefined,
): readonly string[] {
  if (acceptedFileTypes === undefined) return [];
  if (acceptedFileTypes.length === 0 || acceptedFileTypes.length > 32) {
    throw new RangeError("Mergora file acceptance requires between 1 and 32 type tokens.");
  }
  const normalized = acceptedFileTypes.map((entry) => entry.trim().toLocaleLowerCase("en-US"));
  for (const entry of normalized) {
    if (
      entry.length === 0 ||
      entry.length > 128 ||
      entry.includes(",") ||
      (!/^\.[a-z0-9][a-z0-9._+-]*$/u.test(entry) &&
        !/^[a-z0-9][a-z0-9!#$&^_.+-]*\/(?:\*|[a-z0-9][a-z0-9!#$&^_.+-]*)$/u.test(entry))
    ) {
      throw new TypeError(`Mergora file acceptance token ${JSON.stringify(entry)} is invalid.`);
    }
  }
  const unique = [...new Set(normalized)].sort((left, right) => left.localeCompare(right, "en-US"));
  if (unique.length !== normalized.length) {
    throw new TypeError("Mergora file acceptance tokens must be unique after normalization.");
  }
  return Object.freeze(unique);
}

export function fileMatchesAcceptedType(file: File, acceptedFileTypes: readonly string[]): boolean {
  if (acceptedFileTypes.length === 0) return true;
  const name = file.name.normalize("NFC").toLocaleLowerCase("en-US");
  const type = file.type.trim().toLocaleLowerCase("en-US");
  return acceptedFileTypes.some((accepted) => {
    if (accepted.startsWith(".")) return name.endsWith(accepted);
    if (accepted.endsWith("/*")) return type.startsWith(accepted.slice(0, -1));
    return type === accepted;
  });
}

export function synchronizeFileInputFiles(input: HTMLInputElement, files: readonly File[]): void {
  const clear = (): void => {
    input.value = "";
  };
  if (input.type !== "file") {
    clear();
    throw new TypeError("Mergora file synchronization requires an input with type=file.");
  }
  if (files.length > 100) {
    clear();
    throw new RangeError("Mergora file synchronization accepts at most 100 files.");
  }
  if (!input.multiple && files.length > 1) {
    clear();
    throw new RangeError("Mergora cannot synchronize multiple files into a single-file input.");
  }
  for (const file of files) {
    if (!(file instanceof File)) {
      clear();
      throw new TypeError("Mergora file synchronization accepts only real File objects.");
    }
  }
  if (files.length === 0) {
    clear();
    return;
  }
  if (typeof DataTransfer !== "function") {
    clear();
    throw new Error("This browser cannot synchronize selected files into native FormData.");
  }
  try {
    const transfer = new DataTransfer();
    for (const file of files) transfer.items.add(file);
    input.files = transfer.files;
    const synchronizedFiles = input.files;
    if (
      synchronizedFiles === null ||
      synchronizedFiles.length !== files.length ||
      files.some((file, index) => {
        const synchronized = synchronizedFiles.item(index);
        return (
          synchronized === null ||
          synchronized.name !== file.name ||
          synchronized.size !== file.size ||
          synchronized.type !== file.type ||
          synchronized.lastModified !== file.lastModified
        );
      })
    ) {
      throw new Error("The browser returned an incomplete synchronized FileList.");
    }
  } catch (error) {
    clear();
    throw new Error("Mergora could not synchronize selected files into native FormData.", {
      cause: error,
    });
  }
}

export const FileTrigger = forwardRef<HTMLInputElement, FileTriggerProps>(function FileTrigger(
  {
    acceptDirectory = false,
    acceptedFileTypes,
    allowsMultiple = false,
    capture,
    className,
    description,
    disabled = false,
    id,
    label,
    onSelect,
    ...inputProps
  },
  ref,
) {
  if (!hasVisibleContent(label)) throw new Error("Mergora FileTrigger requires a visible label.");
  if (id !== undefined && id.trim().length === 0) {
    throw new RangeError("Mergora FileTrigger id must not be empty or whitespace-only.");
  }
  if (inputProps.name !== undefined && inputProps.name.trim().length === 0) {
    throw new RangeError("Mergora FileTrigger name must not be empty or whitespace-only.");
  }
  if (acceptDirectory && !allowsMultiple) {
    throw new Error("Mergora FileTrigger directory selection requires allowsMultiple.");
  }
  if (acceptDirectory && capture !== undefined) {
    throw new Error("Mergora FileTrigger cannot combine directory selection with camera capture.");
  }
  const accepted = normalizeAcceptedFileTypes(acceptedFileTypes);
  const generatedId = useId().replaceAll(":", "");
  const resolvedId = id ?? `mrg-file-trigger-${generatedId}`;
  const descriptionId = description === undefined ? undefined : `${resolvedId}-description`;
  const directoryProps = acceptDirectory
    ? ({ directory: "", webkitdirectory: "" } as Record<string, string>)
    : {};

  return (
    <span
      className={className === undefined ? "mrg-file-trigger" : `mrg-file-trigger ${className}`}
      data-disabled={disabled ? "true" : undefined}
      data-slot="file-trigger"
    >
      <label data-slot="file-trigger-label" htmlFor={resolvedId}>
        <span data-slot="file-trigger-action">{label}</span>
        <input
          {...inputProps}
          {...directoryProps}
          accept={accepted.length === 0 ? undefined : accepted.join(",")}
          aria-describedby={descriptionId}
          capture={capture}
          data-slot="file-trigger-control"
          disabled={disabled}
          id={resolvedId}
          multiple={allowsMultiple}
          onChange={(event) =>
            onSelect?.(Object.freeze(Array.from(event.currentTarget.files ?? [])), event)
          }
          ref={ref}
          type="file"
        />
      </label>
      {description === undefined ? null : (
        <span data-slot="file-trigger-description" id={descriptionId}>
          {description}
        </span>
      )}
    </span>
  );
});

FileTrigger.displayName = "FileTrigger";
