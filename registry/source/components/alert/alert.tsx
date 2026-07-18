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
  readonly "aria-atomic"?: never;
  readonly "aria-label"?: never;
  readonly "aria-labelledby"?: never;
  readonly "aria-live"?: never;
  readonly actions?: ReactNode;
  readonly children?: ReactNode;
  readonly description?: ReactNode;
  readonly headingLevel?: AlertHeadingLevel;
  readonly title: ReactNode;
  readonly variant?: AlertVariant;
  readonly variantLabel?: string;
  readonly role?: never;
}

type AlertAnnouncementPolicy =
  | { readonly announcement?: never; readonly live?: "off" }
  | { readonly announcement: string; readonly live: "assertive" | "polite" };

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
