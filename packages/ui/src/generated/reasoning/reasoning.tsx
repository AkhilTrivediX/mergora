// Generated from registry/source/components/reasoning/reasoning.tsx by @mergora-internal/source-transformer. Do not edit.
"use client";

import "./reasoning.css";

import {
  forwardRef,
  useEffect,
  useRef,
  useState,
  type DetailsHTMLAttributes,
  type ReactNode,
} from "react";

export type ReasoningStatus = "complete" | "error" | "idle" | "streaming";

export interface ReasoningProgress {
  /** Completed integer units, constrained between zero and `total`. */
  readonly completed: number;
  /** Optional visible name for the progress measure, defaulting to `Progress`. */
  readonly label?: string;
  /** Positive integer number of units required for completion. */
  readonly total: number;
}

export interface ReasoningProps extends Omit<
  DetailsHTMLAttributes<HTMLDetailsElement>,
  "children" | "onToggle" | "open"
> {
  /** Announces a streaming-to-complete transition; false removes the live region and announcement updates. */
  readonly announceCompletion?: boolean;
  /** Reasoning detail content revealed by the native disclosure. */
  readonly children: ReactNode;
  /** Localized polite announcement used when enabled reasoning completes. */
  readonly completionAnnouncement?: string;
  /** Initial native disclosure state for uncontrolled use. */
  readonly defaultOpen?: boolean;
  /** Reports native disclosure changes for controlled or uncontrolled use. */
  readonly onOpenChange?: (open: boolean) => void;
  /** Controlled native disclosure state; omit to use `defaultOpen`. */
  readonly open?: boolean;
  /** Optional bounded progress summary; false removes its UI and associated semantics. */
  readonly progress?: false | ReasoningProgress;
  /** Current reasoning lifecycle reflected in the summary and stable state metadata. */
  readonly status?: ReasoningStatus;
  /** Required concise label rendered inside the native disclosure summary. */
  readonly summary: ReactNode;
}

export const Reasoning = forwardRef<HTMLDetailsElement, ReasoningProps>(function Reasoning(
  {
    announceCompletion = false,
    children,
    className,
    completionAnnouncement = "Reasoning summary is complete.",
    defaultOpen = false,
    onOpenChange,
    open,
    progress = false,
    status = "idle",
    summary,
    ...props
  },
  ref,
) {
  const controlled = open !== undefined;
  const [uncontrolledOpen, setUncontrolledOpen] = useState(defaultOpen);
  const currentOpen = controlled ? open : uncontrolledOpen;
  const priorStatus = useRef(status);
  const [announcement, setAnnouncement] = useState("");
  if (
    progress !== false &&
    (!Number.isSafeInteger(progress.completed) ||
      !Number.isSafeInteger(progress.total) ||
      progress.total < 1 ||
      progress.completed < 0 ||
      progress.completed > progress.total)
  ) {
    throw new RangeError("Mergora Reasoning progress must be safe integers within total.");
  }

  useEffect(() => {
    if (announceCompletion && priorStatus.current === "streaming" && status === "complete") {
      setAnnouncement(completionAnnouncement);
    }
    priorStatus.current = status;
  }, [announceCompletion, completionAnnouncement, status]);

  return (
    <details
      {...props}
      className={className === undefined ? "mrg-reasoning" : `mrg-reasoning ${className}`}
      data-slot="reasoning"
      data-status={status}
      onToggle={(event) => {
        const next = event.currentTarget.open;
        if (!controlled) setUncontrolledOpen(next);
        onOpenChange?.(next);
      }}
      open={currentOpen}
      ref={ref}
    >
      <summary data-slot="reasoning-summary">
        <span>{summary}</span>
        <span>{status}</span>
      </summary>
      {progress === false ? null : (
        <p data-slot="reasoning-progress">
          {progress.label ?? "Progress"}: {progress.completed} of {progress.total}
        </p>
      )}
      <div data-slot="reasoning-content">{children}</div>
      {announceCompletion ? (
        <span aria-live="polite" data-slot="reasoning-announcement">
          {announcement}
        </span>
      ) : null}
    </details>
  );
});

Reasoning.displayName = "Reasoning";
