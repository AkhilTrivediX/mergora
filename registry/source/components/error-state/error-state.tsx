"use client";

import {
  Fragment,
  forwardRef,
  isValidElement,
  useEffect,
  useId,
  type HTMLAttributes,
  type ReactNode,
} from "react";

import { useMergoraMessage } from "../provider/index.js";
import { useAnnouncer } from "../sr-announcer/index.js";
import "./error-state.css";

export type ErrorStateHeadingLevel = 1 | 2 | 3 | 4 | 5 | 6;
export type ErrorStateLiveMode = "off" | "polite" | "assertive";

interface ErrorStateBaseProps extends Omit<
  HTMLAttributes<HTMLElement>,
  | "aria-atomic"
  | "aria-describedby"
  | "aria-label"
  | "aria-labelledby"
  | "aria-live"
  | "children"
  | "role"
  | "title"
> {
  readonly "aria-atomic"?: never;
  readonly "aria-describedby"?: never;
  readonly "aria-label"?: never;
  readonly "aria-labelledby"?: never;
  readonly "aria-live"?: never;
  readonly actions?: ReactNode;
  readonly description: ReactNode;
  readonly headingLevel?: ErrorStateHeadingLevel;
  readonly role?: never;
  readonly technicalDetails?: ReactNode;
  readonly technicalDetailsLabel?: string;
  readonly title: ReactNode;
}

type ErrorStateAnnouncementPolicy =
  | { readonly announcement?: never; readonly live?: "off" }
  | { readonly announcement: string; readonly live: "assertive" | "polite" };

export type RecoverableErrorStateProps = ErrorStateBaseProps &
  ErrorStateAnnouncementPolicy & {
    readonly onRetry: () => void;
    readonly recoverable: true;
    readonly retryLabel?: string;
  };

export type UnrecoverableErrorStateProps = ErrorStateBaseProps &
  ErrorStateAnnouncementPolicy & {
    readonly onRetry?: never;
    readonly recoverable?: false;
    readonly retryLabel?: never;
  };

export type ErrorStateProps = RecoverableErrorStateProps | UnrecoverableErrorStateProps;

function hasErrorStateContent(value: ReactNode): boolean {
  if (value === null || value === undefined || typeof value === "boolean") return false;
  if (typeof value === "string") return value.trim().length > 0;
  if (Array.isArray(value)) return value.some(hasErrorStateContent);
  if (isValidElement(value) && value.type === Fragment) {
    return hasErrorStateContent((value.props as { readonly children?: ReactNode }).children);
  }
  return true;
}

function assertNoErrorStateSemanticOverrides(props: Readonly<Record<string, unknown>>): void {
  for (const key of [
    "aria-atomic",
    "aria-describedby",
    "aria-label",
    "aria-labelledby",
    "aria-live",
    "role",
  ] as const) {
    if (props[key] !== undefined) {
      throw new Error(`Mergora ErrorState owns ${key} and does not accept a semantic override.`);
    }
  }
}

function ErrorStateAnnouncement({
  message,
  priority,
}: {
  readonly message: string;
  readonly priority: "assertive" | "polite";
}) {
  const { announce } = useAnnouncer();
  useEffect(() => {
    announce(message, {
      dedupeKey: `error-state:${priority}:${message}`,
      priority,
    });
  }, [announce, message, priority]);
  return null;
}

export const ErrorState = forwardRef<HTMLElement, ErrorStateProps>(function ErrorState(props, ref) {
  assertNoErrorStateSemanticOverrides(props as unknown as Readonly<Record<string, unknown>>);
  const {
    actions,
    announcement,
    className,
    description,
    headingLevel = 2,
    live = "off",
    onRetry,
    recoverable = false,
    retryLabel: retryLabelProp,
    technicalDetails,
    technicalDetailsLabel: technicalDetailsLabelProp,
    title,
    ...nativeProps
  } = props;

  if (!hasErrorStateContent(title) || !hasErrorStateContent(description)) {
    throw new Error("Mergora ErrorState requires non-empty title and description.");
  }
  if (![1, 2, 3, 4, 5, 6].includes(headingLevel)) {
    throw new Error("Mergora ErrorState headingLevel must be an integer from 1 through 6.");
  }
  if (!(["off", "polite", "assertive"] as const).includes(live)) {
    throw new Error("Mergora ErrorState live must be off, polite, or assertive.");
  }
  if (typeof recoverable !== "boolean") {
    throw new Error("Mergora ErrorState recoverable must be a boolean when provided.");
  }
  if (technicalDetails !== undefined && !hasErrorStateContent(technicalDetails)) {
    throw new Error("Mergora ErrorState technicalDetails must be non-empty when provided.");
  }
  if (
    technicalDetailsLabelProp !== undefined &&
    (typeof technicalDetailsLabelProp !== "string" || technicalDetailsLabelProp.trim().length === 0)
  ) {
    throw new Error("Mergora ErrorState technicalDetailsLabel must be non-empty when provided.");
  }
  if (recoverable && typeof onRetry !== "function") {
    throw new Error("Mergora ErrorState recoverable mode requires an onRetry callback.");
  }
  if (!recoverable && (onRetry !== undefined || retryLabelProp !== undefined)) {
    throw new Error("Mergora ErrorState retry props require recoverable mode.");
  }
  if (
    retryLabelProp !== undefined &&
    (typeof retryLabelProp !== "string" || retryLabelProp.trim().length === 0)
  ) {
    throw new Error("Mergora ErrorState retryLabel must be non-empty when provided.");
  }
  if (live !== "off" && (typeof announcement !== "string" || announcement.trim().length === 0)) {
    throw new Error("Mergora ErrorState live modes require a concise non-empty announcement.");
  }
  if (live === "off" && announcement !== undefined) {
    throw new Error("Mergora ErrorState announcement requires polite or assertive live mode.");
  }

  const defaultErrorLabel = useMergoraMessage("errorState.label", "Error");
  const defaultRetryLabel = useMergoraMessage("errorState.retry", "Try again");
  const defaultDetailsLabel = useMergoraMessage("errorState.details", "Technical details");
  const reactId = useId();
  const titleId = `mrg-error-state-${reactId.replaceAll(":", "")}-title`;
  const descriptionId = `mrg-error-state-${reactId.replaceAll(":", "")}-description`;
  const Heading = `h${headingLevel}` as const;

  return (
    <>
      {live === "off" || announcement === undefined ? null : (
        <ErrorStateAnnouncement message={announcement.trim()} priority={live} />
      )}
      <section
        {...nativeProps}
        aria-describedby={descriptionId}
        aria-labelledby={titleId}
        className={className === undefined ? "mrg-error-state" : `mrg-error-state ${className}`}
        data-live={live}
        data-recoverable={recoverable}
        data-slot="error-state"
        ref={ref}
      >
        <span aria-hidden="true" data-slot="error-state-icon">
          ×
        </span>
        <span data-slot="error-state-label">{defaultErrorLabel}</span>
        <Heading data-slot="error-state-title" id={titleId}>
          {title}
        </Heading>
        <div data-slot="error-state-description" id={descriptionId}>
          {description}
        </div>
        {recoverable || hasErrorStateContent(actions) ? (
          <div data-slot="error-state-actions">
            {recoverable ? (
              <button data-slot="error-state-retry" onClick={onRetry} type="button">
                {retryLabelProp ?? defaultRetryLabel}
              </button>
            ) : null}
            {hasErrorStateContent(actions) ? actions : null}
          </div>
        ) : null}
        {hasErrorStateContent(technicalDetails) ? (
          <details data-slot="error-state-details">
            <summary>{technicalDetailsLabelProp ?? defaultDetailsLabel}</summary>
            <div data-slot="error-state-technical-content">{technicalDetails}</div>
          </details>
        ) : null}
      </section>
    </>
  );
});

ErrorState.displayName = "ErrorState";
