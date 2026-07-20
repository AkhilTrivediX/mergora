"use client";

import "./streaming-text.css";

import { forwardRef, useEffect, useMemo, useRef, useState, type HTMLAttributes } from "react";

export type StreamingTextStatus = "complete" | "error" | "idle" | "streaming";

export interface StreamingTextSegment {
  /** Stable unique identifier preserving streamed segment identity across renders. */
  readonly id: string;
  /** Text appended in collection order to form the rendered and announced response. */
  readonly text: string;
}

export interface StreamingTextProps extends Omit<HTMLAttributes<HTMLDivElement>, "children"> {
  /** Adds throttled polite announcements; false removes the live region and timer work. */
  readonly announceUpdates?: boolean;
  /** Non-negative debounce delay in milliseconds before publishing a streamed update. */
  readonly announcementDelay?: number;
  /** Builds announcement copy from the full accumulated text and current lifecycle status. */
  readonly getAnnouncement?: (text: string, status: StreamingTextStatus) => string;
  /** Ordered immutable text segments with non-empty unique identifiers. */
  readonly segments: readonly StreamingTextSegment[];
  /** Shows a decorative cursor only while status is `streaming`; false removes it. */
  readonly showCursor?: boolean;
  /** Current stream lifecycle exposed as stable state metadata and announcement context. */
  readonly status?: StreamingTextStatus;
}

export function appendStreamingTextSegment(
  segments: readonly StreamingTextSegment[],
  segment: StreamingTextSegment,
): readonly StreamingTextSegment[] {
  if (segment.id.trim() === "") {
    throw new TypeError("Mergora StreamingText segment ids must not be empty.");
  }
  if (segments.some((entry) => entry.id === segment.id)) {
    throw new RangeError(
      `Mergora StreamingText segment id ${JSON.stringify(segment.id)} is not unique.`,
    );
  }
  return [...segments, segment];
}

function defaultAnnouncement(text: string, status: StreamingTextStatus): string {
  if (status === "complete") return `Response complete. ${text}`;
  if (status === "error") return "Response interrupted.";
  return text;
}

export const StreamingText = forwardRef<HTMLDivElement, StreamingTextProps>(function StreamingText(
  {
    announceUpdates = false,
    announcementDelay = 700,
    className,
    getAnnouncement = defaultAnnouncement,
    segments,
    showCursor = false,
    status = "idle",
    ...props
  },
  ref,
) {
  if (!Number.isFinite(announcementDelay) || announcementDelay < 0) {
    throw new RangeError("Mergora StreamingText announcementDelay must be a non-negative number.");
  }
  const ids = new Set<string>();
  for (const segment of segments) {
    if (segment.id.trim() === "" || ids.has(segment.id)) {
      throw new RangeError("Mergora StreamingText requires non-empty, unique segment ids.");
    }
    ids.add(segment.id);
  }
  const text = useMemo(() => segments.map((segment) => segment.text).join(""), [segments]);
  const [announcement, setAnnouncement] = useState("");
  const lastAnnounced = useRef("");

  useEffect(() => {
    if (!announceUpdates || text === "" || text === lastAnnounced.current) return;
    const timer = setTimeout(() => {
      lastAnnounced.current = text;
      setAnnouncement(getAnnouncement(text, status));
    }, announcementDelay);
    return () => clearTimeout(timer);
  }, [announceUpdates, announcementDelay, getAnnouncement, status, text]);

  return (
    <div
      {...props}
      className={className === undefined ? "mrg-streaming-text" : `mrg-streaming-text ${className}`}
      data-slot="streaming-text"
      data-status={status}
      ref={ref}
    >
      <div data-slot="streaming-text-content">
        {segments.map((segment) => (
          <span data-segment-id={segment.id} data-slot="streaming-text-segment" key={segment.id}>
            {segment.text}
          </span>
        ))}
        {showCursor && status === "streaming" ? (
          <span aria-hidden="true" data-slot="streaming-text-cursor" />
        ) : null}
      </div>
      {announceUpdates ? (
        <span aria-atomic="true" aria-live="polite" data-slot="streaming-text-announcement">
          {announcement}
        </span>
      ) : null}
    </div>
  );
});

StreamingText.displayName = "StreamingText";
