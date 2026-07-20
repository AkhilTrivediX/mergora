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

import { useMergoraContext } from "../provider/index.js";
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
  /** Reserved: announcement atomicity belongs to the shared announcer. */
  readonly "aria-atomic"?: never;
  /** Reserved: ErrorState links its generated description and optional details. */
  readonly "aria-describedby"?: never;
  /** Reserved: the visible title names the error section. */
  readonly "aria-label"?: never;
  /** Reserved: ErrorState links its generated title to the section. */
  readonly "aria-labelledby"?: never;
  /** Reserved: opt into announcements with `live` and `announcement` instead. */
  readonly "aria-live"?: never;
  /** Alternative recovery controls rendered after the native retry action. */
  readonly actions?: ReactNode;
  /** Non-empty visible explanation linked to the named section. */
  readonly description: ReactNode;
  /** Native heading level used for `title`; defaults to 2. */
  readonly headingLevel?: ErrorStateHeadingLevel;
  /** Reserved: the visible section stays non-live while the shared announcer owns roles. */
  readonly role?: never;
  /** Explicitly safe diagnostic content revealed through native `details`. */
  readonly technicalDetails?: ReactNode;
  /** Localized visible label for the technical-details disclosure. */
  readonly technicalDetailsLabel?: string;
  /** Non-empty visible heading that names the error section. */
  readonly title: ReactNode;
}

type ErrorStateAnnouncementPolicy =
  | {
      /** Disabled when `live` is `off`, so no announcement copy or effect is emitted. */
      readonly announcement?: never;
      /** Keeps the ErrorState static and non-live; this is the default mode. */
      readonly live?: "off";
    }
  | {
      /** Concise non-empty summary enqueued through the nearest shared announcer. */
      readonly announcement: string;
      /** Politeness used by the shared announcer for this summary. */
      readonly live: "assertive" | "polite";
    };

export type RecoverableErrorStateProps = ErrorStateBaseProps &
  ErrorStateAnnouncementPolicy & {
    /** Native retry callback invoked by the rendered retry button. */
    readonly onRetry: () => void;
    /** Enables the retry control and requires `onRetry`. */
    readonly recoverable: true;
    /** Localized visible label for the retry button. */
    readonly retryLabel?: string;
  };

export type UnrecoverableErrorStateProps = ErrorStateBaseProps &
  ErrorStateAnnouncementPolicy & {
    /** Unavailable when `recoverable` is false or omitted. */
    readonly onRetry?: never;
    /** Omits retry UI and behavior; this is the default mode. */
    readonly recoverable?: false;
    /** Unavailable when no retry button is rendered. */
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

  const { getMessage } = useMergoraContext();
  const defaultErrorLabel = getMessage("errorState.label", "Error");
  const retryLabel = recoverable
    ? (retryLabelProp ?? getMessage("errorState.retry", "Try again"))
    : undefined;
  const detailsLabel = hasErrorStateContent(technicalDetails)
    ? (technicalDetailsLabelProp ?? getMessage("errorState.details", "Technical details"))
    : undefined;
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
                {retryLabel}
              </button>
            ) : null}
            {hasErrorStateContent(actions) ? actions : null}
          </div>
        ) : null}
        {hasErrorStateContent(technicalDetails) ? (
          <details data-slot="error-state-details">
            <summary>{detailsLabel}</summary>
            <div data-slot="error-state-technical-content">{technicalDetails}</div>
          </details>
        ) : null}
      </section>
    </>
  );
});

ErrorState.displayName = "ErrorState";
