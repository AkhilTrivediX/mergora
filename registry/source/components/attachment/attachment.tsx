import "./attachment.css";

import { forwardRef, type ButtonHTMLAttributes, type HTMLAttributes, type ReactNode } from "react";

export type AttachmentStatus = "error" | "processing" | "ready" | "uploaded" | "uploading";
export type AttachmentSafety = "consumer-verified" | "unverified" | "unsafe";

export interface AttachmentActionContext {
  /** Returns the attachment’s stable consumer identifier. */
  readonly id: string;
  /** Returns the attachment’s visible file name. */
  readonly name: string;
}

export interface AttachmentProps extends Omit<HTMLAttributes<HTMLDivElement>, "children"> {
  /** Provides the stable identifier passed to attachment actions. */
  readonly id: string;
  /** Presents the attachment’s file name and action context. */
  readonly name: string;
  /** Adds consumer-provided media type metadata without inferring file safety. */
  readonly mediaType?: string;
  /** Adds a locale-formatted non-negative byte size. */
  readonly sizeBytes?: number;
  /** Supplies consumer-controlled processing or upload lifecycle state. */
  readonly status?: AttachmentStatus;
  /** Overrides the visible status text without changing canonical state. */
  readonly statusLabel?: string;
  /** Supplies a consumer-controlled upload percentage from zero through one hundred. */
  readonly progress?: number;
  /** Supplies optional preview content without fetching or decoding remote data. */
  readonly preview?: ReactNode;
  /** Shows supplied preview content; false removes its UI and semantics. */
  readonly showPreview?: boolean;
  /** Shows status and progress context; false removes the status rail output. */
  readonly showStatusRail?: boolean;
  /** Shows consumer-owned safety guidance; false removes the guidance output. */
  readonly showSafetyGuidance?: boolean;
  /** Records consumer verification state without performing security scanning. */
  readonly safety?: AttachmentSafety;
  /** Supplies recovery or verification guidance for the optional safety rail. */
  readonly safetyGuidance?: ReactNode;
  /** Supplies a consumer-generated checksum without reading or hashing file bytes. */
  readonly checksum?: string;
  /** Shows the supplied checksum; false removes checksum UI and semantics. */
  readonly showChecksum?: boolean;
  /** Prevents preview, download, and removal actions. */
  readonly disabled?: boolean;
  /** Enables a consumer-owned preview action; omission removes its button. */
  readonly onPreview?: (context: AttachmentActionContext) => void;
  /** Enables a consumer-owned download action; omission removes its button. */
  readonly onDownload?: (context: AttachmentActionContext) => void;
  /** Enables a consumer-owned destructive removal action; omission removes its button. */
  readonly onRemove?: (context: AttachmentActionContext) => void;
  /** Overrides individual action labels while retaining defaults for omitted entries. */
  readonly actionLabels?: Partial<Record<"download" | "preview" | "remove", string>>;
  /** Applies native button attributes to every rendered action without changing callbacks. */
  readonly buttonProps?: Omit<ButtonHTMLAttributes<HTMLButtonElement>, "children" | "onClick">;
}

function classes(...values: readonly (false | string | undefined)[]): string {
  return values.filter((value): value is string => Boolean(value)).join(" ");
}

export function formatAttachmentSize(sizeBytes: number, locale = "en-US"): string {
  if (!Number.isFinite(sizeBytes) || sizeBytes < 0) {
    throw new RangeError("Mergora Attachment sizeBytes must be a finite non-negative number.");
  }
  if (sizeBytes < 1000) return `${Math.round(sizeBytes)} B`;
  const units = ["kB", "MB", "GB", "TB"] as const;
  let value = sizeBytes / 1000;
  let unit: (typeof units)[number] = units[0];
  for (let index = 1; index < units.length && value >= 1000; index += 1) {
    value /= 1000;
    unit = units[index]!;
  }
  return `${new Intl.NumberFormat(locale, { maximumFractionDigits: 1 }).format(value)} ${unit}`;
}

export const Attachment = forwardRef<HTMLDivElement, AttachmentProps>(function Attachment(
  {
    id,
    name,
    mediaType,
    sizeBytes,
    status = "ready",
    statusLabel = status,
    progress,
    preview,
    showPreview = false,
    showStatusRail = false,
    showSafetyGuidance = false,
    safety = "unverified",
    safetyGuidance,
    checksum,
    showChecksum = false,
    disabled = false,
    onPreview,
    onDownload,
    onRemove,
    actionLabels,
    buttonProps,
    className,
    ...props
  },
  ref,
) {
  if (id.trim().length === 0 || name.trim().length === 0) {
    throw new RangeError("Mergora Attachment id and name must not be empty.");
  }
  if (progress !== undefined && (!Number.isFinite(progress) || progress < 0 || progress > 100)) {
    throw new RangeError("Mergora Attachment progress must be between 0 and 100.");
  }
  const context = { id, name } satisfies AttachmentActionContext;
  const metadata = [
    mediaType,
    sizeBytes === undefined ? undefined : formatAttachmentSize(sizeBytes),
  ]
    .filter(Boolean)
    .join(" · ");
  const labels = {
    download: actionLabels?.download ?? "Download",
    preview: actionLabels?.preview ?? "Preview",
    remove: actionLabels?.remove ?? "Remove",
  };
  const hasActions = onPreview !== undefined || onDownload !== undefined || onRemove !== undefined;
  const action = (
    label: string,
    handler: ((context: AttachmentActionContext) => void) | undefined,
    intent?: "destructive",
  ) =>
    handler === undefined ? null : (
      <button
        {...buttonProps}
        type="button"
        className={classes("mrg-attachment__action", buttonProps?.className)}
        data-intent={intent}
        disabled={disabled || buttonProps?.disabled}
        onClick={() => handler(context)}
      >
        {label}
      </button>
    );

  return (
    <div
      {...props}
      ref={ref}
      className={classes("mrg-attachment", className)}
      data-disabled={disabled || undefined}
      data-safety={showSafetyGuidance ? safety : undefined}
      data-slot="attachment"
      data-status={status}
    >
      {showPreview ? (
        <div data-slot="attachment-preview">{preview ?? <span aria-hidden="true">FILE</span>}</div>
      ) : null}
      <div className="mrg-attachment__content" data-slot="attachment-content">
        <strong className="mrg-attachment__name" dir="auto">
          {name}
        </strong>
        {metadata.length > 0 ? (
          <span className="mrg-attachment__metadata" dir="auto">
            {metadata}
          </span>
        ) : null}
        {showStatusRail ? (
          <div
            aria-live={status === "error" ? "assertive" : "polite"}
            className="mrg-attachment__status"
            data-slot="attachment-status"
          >
            <span>{statusLabel}</span>
            {progress === undefined ? null : (
              <progress aria-label={`${name} progress`} max={100} value={progress}>
                {progress}%
              </progress>
            )}
          </div>
        ) : null}
        {showSafetyGuidance ? (
          <p className="mrg-attachment__safety" data-slot="attachment-safety">
            <strong>
              {safety === "consumer-verified"
                ? "Verified by the application."
                : safety === "unsafe"
                  ? "Do not open this file."
                  : "File contents are not verified."}
            </strong>{" "}
            {safetyGuidance}
          </p>
        ) : null}
        {showChecksum && checksum !== undefined ? (
          <code className="mrg-attachment__checksum" data-slot="attachment-checksum" dir="ltr">
            {checksum}
          </code>
        ) : null}
      </div>
      {hasActions ? (
        <div aria-label={`Actions for ${name}`} className="mrg-attachment__actions" role="group">
          {action(labels.preview, onPreview)}
          {action(labels.download, onDownload)}
          {action(labels.remove, onRemove, "destructive")}
        </div>
      ) : null}
    </div>
  );
});
