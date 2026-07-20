// Generated from registry/source/components/alert/alert.tsx by @mergora-internal/source-transformer. Do not edit.
"use client";

import {
  Fragment,
  forwardRef,
  isValidElement,
  useEffect,
  type HTMLAttributes,
  type ReactNode,
} from "react";

import { useMergoraMessage } from "../provider/index.js";
import { useAnnouncer } from "../sr-announcer/index.js";
import "./alert.css";

export type AlertVariant = "info" | "success" | "warning" | "error";
export type AlertLiveMode = "off" | "polite" | "assertive";
export type AlertHeadingLevel = 1 | 2 | 3 | 4 | 5 | 6;

interface AlertBaseProps extends Omit<
  HTMLAttributes<HTMLDivElement>,
  "aria-atomic" | "aria-label" | "aria-labelledby" | "aria-live" | "children" | "role" | "title"
> {
  /** Reserved: Alert owns announcement atomicity through the shared announcer. */
  readonly "aria-atomic"?: never;
  /** Reserved: the visible title and content provide the Alert's name and context. */
  readonly "aria-label"?: never;
  /** Reserved: Alert owns the relationships for its visible heading and content. */
  readonly "aria-labelledby"?: never;
  /** Reserved: opt into announcements with `live` and `announcement` instead. */
  readonly "aria-live"?: never;
  /** Action controls rendered after the visible alert content and outside live regions. */
  readonly actions?: ReactNode;
  /** Additional visible alert body content; required when `description` is empty. */
  readonly children?: ReactNode;
  /** Concise visible explanation; required when `children` is empty. */
  readonly description?: ReactNode;
  /** Native heading level used for `title`; defaults to 2. */
  readonly headingLevel?: AlertHeadingLevel;
  /** Non-empty visible heading for the alert. */
  readonly title: ReactNode;
  /** Visual and textual severity treatment; defaults to `info`. */
  readonly variant?: AlertVariant;
  /** Localized visible override for the selected variant label. */
  readonly variantLabel?: string;
  /** Reserved: the visible Alert stays non-live while the shared announcer owns roles. */
  readonly role?: never;
}

type AlertAnnouncementPolicy =
  | {
      /** Disabled when `live` is `off`, so no announcement copy or effect is emitted. */
      readonly announcement?: never;
      /** Keeps the Alert static and non-live; this is the default mode. */
      readonly live?: "off";
    }
  | {
      /** Concise non-empty summary enqueued through the nearest shared announcer. */
      readonly announcement: string;
      /** Politeness used by the shared announcer for this summary. */
      readonly live: "assertive" | "polite";
    };

export type AlertProps = AlertBaseProps & AlertAnnouncementPolicy;

function hasContent(value: ReactNode): boolean {
  if (value === null || value === undefined || typeof value === "boolean") return false;
  if (typeof value === "string") return value.trim().length > 0;
  if (Array.isArray(value)) return value.some(hasContent);
  if (isValidElement(value) && value.type === Fragment) {
    return hasContent((value.props as { readonly children?: ReactNode }).children);
  }
  return true;
}

function assertNoAlertSemanticOverrides(props: Readonly<Record<string, unknown>>): void {
  for (const key of [
    "aria-atomic",
    "aria-label",
    "aria-labelledby",
    "aria-live",
    "role",
  ] as const) {
    if (props[key] !== undefined) {
      throw new Error(`Mergora Alert owns ${key} and does not accept a semantic override.`);
    }
  }
}

function AlertAnnouncement({
  message,
  priority,
}: {
  readonly message: string;
  readonly priority: "assertive" | "polite";
}) {
  const { announce } = useAnnouncer();
  useEffect(() => {
    announce(message, {
      dedupeKey: `alert:${priority}:${message}`,
      priority,
    });
  }, [announce, message, priority]);
  return null;
}

export const Alert = forwardRef<HTMLDivElement, AlertProps>(function Alert(props, ref) {
  assertNoAlertSemanticOverrides(props as unknown as Readonly<Record<string, unknown>>);
  const {
    actions,
    announcement,
    children,
    className,
    description,
    headingLevel = 2,
    live = "off",
    title,
    variant = "info",
    variantLabel: variantLabelProp,
    ...nativeProps
  } = props;
  if (!hasContent(title)) throw new Error("Mergora Alert requires a non-empty title.");
  if (!hasContent(description) && !hasContent(children)) {
    throw new Error("Mergora Alert requires a description or child content.");
  }
  if (variantLabelProp !== undefined && variantLabelProp.trim().length === 0) {
    throw new Error("Mergora Alert variantLabel must be non-empty when provided.");
  }
  if (live !== "off" && (announcement === undefined || announcement.trim().length === 0)) {
    throw new Error("Mergora Alert live modes require a concise non-empty announcement.");
  }
  if (live === "off" && announcement !== undefined) {
    throw new Error("Mergora Alert announcement requires polite or assertive live mode.");
  }
  const defaultVariantLabel = useMergoraMessage(
    `alert.${variant}`,
    {
      error: "Error",
      info: "Information",
      success: "Success",
      warning: "Warning",
    }[variant],
  );
  const variantLabel = variantLabelProp ?? defaultVariantLabel;
  const Heading = `h${headingLevel}` as const;

  return (
    <div
      {...nativeProps}
      className={className === undefined ? "mrg-alert" : `mrg-alert ${className}`}
      data-live={live}
      data-slot="alert"
      data-variant={variant}
      ref={ref}
    >
      {live === "off" || announcement === undefined ? null : (
        <AlertAnnouncement message={announcement.trim()} priority={live} />
      )}
      <span aria-hidden="true" data-slot="alert-icon">
        {variant === "success"
          ? "✓"
          : variant === "warning"
            ? "!"
            : variant === "error"
              ? "×"
              : "i"}
      </span>
      <div data-slot="alert-content">
        <span data-slot="alert-variant-label">{variantLabel}</span>
        <Heading data-slot="alert-title">{title}</Heading>
        {hasContent(description) ? <div data-slot="alert-description">{description}</div> : null}
        {hasContent(children) ? <div data-slot="alert-body">{children}</div> : null}
        {hasContent(actions) ? <div data-slot="alert-actions">{actions}</div> : null}
      </div>
    </div>
  );
});

Alert.displayName = "Alert";
