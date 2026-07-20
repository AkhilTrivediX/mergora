"use client";

import {
  forwardRef,
  useEffect,
  useMemo,
  useRef,
  useState,
  type HTMLAttributes,
  type ReactNode,
} from "react";

import { Progress } from "../progress/index.js";
import { useMergoraContext } from "../provider/index.js";
import "./upload-progress.css";

export type UploadProgressScope = "aggregate" | "file";
export type UploadProgressStatus =
  "cancelled" | "complete" | "error" | "paused" | "queued" | "retrying" | "uploading";

export interface UploadProgressMessages {
  /** Describes a consumer-cancelled upload. */
  readonly cancelled: string;
  /** Describes a successfully completed upload. */
  readonly complete: string;
  /** Describes an upload that requires error recovery. */
  readonly error: string;
  /** Describes an upload paused by consumer state. */
  readonly paused: string;
  /** Describes an upload waiting to start. */
  readonly queued: string;
  /** Describes an upload retry in progress. */
  readonly retrying: string;
  /** Describes an actively transferring upload. */
  readonly uploading: string;
}

export interface UploadProgressProps extends Omit<HTMLAttributes<HTMLDivElement>, "children"> {
  /** Enables thresholded private live announcements; false removes live-region output. */
  readonly announceProgress?: boolean;
  /** Sets the percentage-point interval between optional progress announcements. */
  readonly announcementStep?: number;
  /** Names the file or aggregate transfer represented by this progress region. */
  readonly label: ReactNode;
  /** Sets the numeric completion bound used by the underlying progress indicator. */
  readonly maximum?: number;
  /** Adds consumer-controlled transfer or recovery context. */
  readonly message?: ReactNode;
  /** Overrides individual localized statuses while retaining defaults for omitted entries. */
  readonly messages?: Partial<UploadProgressMessages>;
  /** Distinguishes one-file progress from an aggregate queue without changing transport state. */
  readonly scope?: UploadProgressScope;
  /** Supplies consumer-controlled upload lifecycle state. */
  readonly status?: UploadProgressStatus;
  /** Supplies total bytes for optional localized byte context. */
  readonly totalBytes?: number;
  /** Supplies completed bytes for optional localized byte context. */
  readonly uploadedBytes?: number;
  /** Supplies the current numeric completion value. */
  readonly value?: number;
}

const DEFAULT_MESSAGES: UploadProgressMessages = {
  cancelled: "Upload cancelled",
  complete: "Upload complete",
  error: "Upload failed",
  paused: "Upload paused",
  queued: "Waiting to upload",
  retrying: "Retrying upload",
  uploading: "Uploading",
};

function hasVisibleContent(value: ReactNode): boolean {
  if (value === null || value === undefined || typeof value === "boolean") return false;
  if (typeof value === "string") return value.trim().length > 0;
  if (Array.isArray(value)) return value.some(hasVisibleContent);
  return true;
}

function assertNonNegative(value: number | undefined, label: string): void {
  if (value !== undefined && (!Number.isSafeInteger(value) || value < 0)) {
    throw new RangeError(`Mergora UploadProgress ${label} must be a non-negative safe integer.`);
  }
}

export function formatUploadBytes(value: number, locale: string): string {
  assertNonNegative(value, "byte value");
  const units = ["B", "KiB", "MiB", "GiB", "TiB"] as const;
  let amount = value;
  let unit: (typeof units)[number] = units[0];
  for (const candidate of units.slice(1)) {
    if (amount < 1024) break;
    amount /= 1024;
    unit = candidate;
  }
  return `${new Intl.NumberFormat(locale, { maximumFractionDigits: amount < 10 ? 1 : 0 }).format(
    amount,
  )} ${unit}`;
}

export const UploadProgress = forwardRef<HTMLDivElement, UploadProgressProps>(
  function UploadProgress(
    {
      announceProgress = true,
      announcementStep = 10,
      className,
      label,
      maximum = 100,
      message,
      messages: messageOverrides,
      scope = "file",
      status = "uploading",
      totalBytes,
      uploadedBytes,
      value,
      ...nativeProps
    },
    ref,
  ) {
    if (!hasVisibleContent(label)) {
      throw new Error("Mergora UploadProgress requires a visible label.");
    }
    if (!Number.isFinite(maximum) || maximum <= 0) {
      throw new RangeError("Mergora UploadProgress maximum must be a finite number above zero.");
    }
    if (value !== undefined && (!Number.isFinite(value) || value < 0 || value > maximum)) {
      throw new RangeError("Mergora UploadProgress value must be within zero and maximum.");
    }
    if (
      announceProgress &&
      (!Number.isSafeInteger(announcementStep) || announcementStep < 1 || announcementStep > 100)
    ) {
      throw new RangeError("Mergora UploadProgress announcementStep must be from 1 through 100.");
    }
    assertNonNegative(uploadedBytes, "uploadedBytes");
    assertNonNegative(totalBytes, "totalBytes");
    if (
      (uploadedBytes === undefined) !== (totalBytes === undefined) ||
      (uploadedBytes !== undefined && totalBytes !== undefined && uploadedBytes > totalBytes)
    ) {
      throw new RangeError(
        "Mergora UploadProgress byte values must be supplied together and uploadedBytes cannot exceed totalBytes.",
      );
    }
    const { locale } = useMergoraContext();
    const messages = { ...DEFAULT_MESSAGES, ...messageOverrides };
    const percentage = value === undefined ? undefined : Math.round((value / maximum) * 100);
    const visibleValue = useMemo(() => {
      const percentText =
        percentage === undefined
          ? undefined
          : new Intl.NumberFormat(locale, { maximumFractionDigits: 0, style: "percent" }).format(
              percentage / 100,
            );
      const byteText =
        uploadedBytes === undefined || totalBytes === undefined
          ? undefined
          : `${formatUploadBytes(uploadedBytes, locale)} of ${formatUploadBytes(totalBytes, locale)}`;
      return [percentText, byteText].filter(Boolean).join(", ");
    }, [locale, percentage, totalBytes, uploadedBytes]);
    const statusText = messages[status];
    if (statusText.trim().length === 0 || statusText.length > 256) {
      throw new RangeError(
        "Mergora UploadProgress status messages must contain 1 through 256 characters.",
      );
    }
    const bucket =
      percentage === undefined
        ? undefined
        : status === "complete"
          ? 100
          : Math.floor(percentage / announcementStep) * announcementStep;
    const announcementKey = `${status}:${bucket ?? "indeterminate"}`;
    const announcementText = [statusText, visibleValue].filter(Boolean).join(": ");
    const previousKey = useRef(announcementKey);
    const [announcement, setAnnouncement] = useState(announcementText);
    useEffect(() => {
      if (!announceProgress) return;
      if (previousKey.current === announcementKey) return;
      previousKey.current = announcementKey;
      setAnnouncement(announcementText);
    }, [announceProgress, announcementKey, announcementText]);
    const progressValue =
      status === "complete"
        ? maximum
        : status === "queued" || status === "retrying"
          ? undefined
          : value;

    return (
      <div
        {...nativeProps}
        className={
          className === undefined ? "mrg-upload-progress" : `mrg-upload-progress ${className}`
        }
        data-scope={scope}
        data-slot="upload-progress"
        data-status={status}
        ref={ref}
      >
        <Progress
          formatValue={() => (visibleValue.length === 0 ? statusText : visibleValue)}
          label={label}
          maximum={maximum}
          {...(progressValue === undefined ? {} : { value: progressValue })}
        />
        <span data-slot="upload-progress-state">{statusText}</span>
        {message === undefined ? null : <span data-slot="upload-progress-message">{message}</span>}
        {announceProgress ? (
          <span
            aria-atomic="true"
            aria-live="polite"
            className="mrg-upload-progress-announcement"
            data-slot="upload-progress-announcement"
          >
            {announcement}
          </span>
        ) : null}
      </div>
    );
  },
);

UploadProgress.displayName = "UploadProgress";
