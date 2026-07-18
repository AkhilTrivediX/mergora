"use client";

import { Fragment, forwardRef, isValidElement, type HTMLAttributes, type ReactNode } from "react";

import { useMergoraContext, useMergoraMessage } from "../provider/index.js";
import "./badge.css";

export type BadgeVariant = "neutral" | "info" | "success" | "warning" | "error";

type BadgeEventHandlerKey = {
  [Key in keyof HTMLAttributes<HTMLSpanElement>]-?: Key extends `on${string}` ? Key : never;
}[keyof HTMLAttributes<HTMLSpanElement>];

type NonInteractiveBadgeAttributeKey =
  | BadgeEventHandlerKey
  | "accessKey"
  | "aria-label"
  | "aria-labelledby"
  | "children"
  | "contentEditable"
  | "dangerouslySetInnerHTML"
  | "draggable"
  | "href"
  | "role"
  | "tabIndex";

type NonInteractiveBadgeAttributes = Omit<
  HTMLAttributes<HTMLSpanElement>,
  NonInteractiveBadgeAttributeKey
>;

interface BadgeBaseProps extends NonInteractiveBadgeAttributes {
  readonly variant?: BadgeVariant;
}

export interface BadgeCategoryProps extends BadgeBaseProps {
  readonly children: ReactNode;
  readonly kind?: "category";
}

export interface BadgeStatusProps extends BadgeBaseProps {
  readonly children: ReactNode;
  readonly kind: "status";
  readonly variantLabel?: string;
}

export interface BadgeCountProps extends Omit<BadgeBaseProps, "variant"> {
  readonly count: number;
  readonly kind: "count";
  readonly label: string;
  readonly maximum?: number;
}

export type BadgeProps = BadgeCategoryProps | BadgeStatusProps | BadgeCountProps;

const NONINTERACTIVE_BADGE_PROPS = [
  "accessKey",
  "aria-label",
  "aria-labelledby",
  "contentEditable",
  "dangerouslySetInnerHTML",
  "draggable",
  "href",
  "role",
  "tabIndex",
] as const;

export function assertNonInteractiveBadgeProps(props: Readonly<Record<string, unknown>>): void {
  for (const key of Object.keys(props)) {
    if (key.startsWith("on") && props[key] !== undefined) {
      throw new Error(
        `Mergora Badge does not accept React event handler ${key}; render Badge inside a named Button or Link instead.`,
      );
    }
  }
  for (const key of NONINTERACTIVE_BADGE_PROPS) {
    if (props[key] !== undefined) {
      throw new Error(
        `Mergora Badge does not accept semantic or interactive prop ${key}; render Badge inside a named Button or Link instead.`,
      );
    }
  }
}

function hasBadgeContent(value: ReactNode): boolean {
  if (value === null || value === undefined || typeof value === "boolean") return false;
  if (typeof value === "string") return value.trim().length > 0;
  if (Array.isArray(value)) return value.some((item) => hasBadgeContent(item));
  if (isValidElement(value) && value.type === Fragment) {
    return hasBadgeContent((value.props as { readonly children?: ReactNode }).children);
  }
  return true;
}

const STATUS_VARIANT_MARKER = "\uE000mrg-badge-variant\uE001";
const STATUS_LABEL_MARKER = "\uE000mrg-badge-label\uE001";
const STATUS_MARKER_PATTERN = /(\uE000mrg-badge-(?:variant|label)\uE001)/gu;

function hasExactlyOneMarker(template: string, marker: string): boolean {
  return template.indexOf(marker) >= 0 && template.indexOf(marker) === template.lastIndexOf(marker);
}

function renderStatusContent(template: string, variantLabel: string, children: ReactNode) {
  const safeTemplate =
    hasExactlyOneMarker(template, STATUS_VARIANT_MARKER) &&
    hasExactlyOneMarker(template, STATUS_LABEL_MARKER)
      ? template
      : `${STATUS_VARIANT_MARKER}: ${STATUS_LABEL_MARKER}`;

  return safeTemplate.split(STATUS_MARKER_PATTERN).map((part, index) => {
    if (part === STATUS_VARIANT_MARKER) {
      return (
        <span data-slot="badge-status-label" key={`variant-${index}`}>
          {variantLabel}
        </span>
      );
    }
    if (part === STATUS_LABEL_MARKER) {
      return (
        <span data-slot="badge-label" key={`label-${index}`}>
          {children}
        </span>
      );
    }
    return part;
  });
}

export const Badge = forwardRef<HTMLSpanElement, BadgeProps>(function Badge(props, ref) {
  assertNonInteractiveBadgeProps(props as unknown as Readonly<Record<string, unknown>>);
  const { locale, getMessage } = useMergoraContext();
  const statusNeutral = useMergoraMessage("badge.neutral", "Status");
  const statusInfo = useMergoraMessage("badge.info", "Information");
  const statusSuccess = useMergoraMessage("badge.success", "Success");
  const statusWarning = useMergoraMessage("badge.warning", "Warning");
  const statusError = useMergoraMessage("badge.error", "Error");
  const statusTemplate = getMessage("badge.status", "{variant}: {label}", {
    label: STATUS_LABEL_MARKER,
    variant: STATUS_VARIANT_MARKER,
  });

  if (props.kind === "count") {
    const { className, count, kind, label, maximum = 99, ...nativeProps } = props;
    if (!Number.isFinite(count) || !Number.isInteger(count) || count < 0) {
      throw new RangeError("Mergora Badge count must be a non-negative finite integer.");
    }
    if (!Number.isFinite(maximum) || !Number.isInteger(maximum) || maximum < 1) {
      throw new RangeError("Mergora Badge maximum must be a positive finite integer.");
    }
    if (label.trim().length === 0) throw new Error("Mergora Badge count label must be non-empty.");
    const formattedCount = new Intl.NumberFormat(locale).format(count);
    const formattedMaximum = new Intl.NumberFormat(locale).format(maximum);
    const accessibleLabel = getMessage("badge.count", "{label}: {count}", {
      count: formattedCount,
      label,
    });
    return (
      <span
        {...nativeProps}
        className={className === undefined ? "mrg-badge" : `mrg-badge ${className}`}
        data-kind={kind}
        data-overflow={count > maximum || undefined}
        data-slot="badge"
        ref={ref}
      >
        <span className="mrg-badge__sr-only">{accessibleLabel}</span>
        <span aria-hidden="true">
          <bdi>{count > maximum ? `${formattedMaximum}+` : formattedCount}</bdi>
        </span>
      </span>
    );
  }

  const { children, className, kind = "category", variant = "neutral", ...remainingProps } = props;
  const { variantLabel: _variantLabel, ...nativeProps } =
    remainingProps as typeof remainingProps & {
      readonly variantLabel?: string;
    };
  void _variantLabel;
  if (!hasBadgeContent(children)) throw new Error("Mergora Badge requires non-empty content.");
  const variantLabelProp = props.kind === "status" ? props.variantLabel : undefined;
  if (variantLabelProp !== undefined && variantLabelProp.trim().length === 0) {
    throw new Error("Mergora Badge variantLabel must be non-empty when provided.");
  }
  const defaultLabel = {
    error: statusError,
    info: statusInfo,
    neutral: statusNeutral,
    success: statusSuccess,
    warning: statusWarning,
  }[variant];
  const resolvedVariantLabel = variantLabelProp ?? defaultLabel;
  return (
    <span
      {...nativeProps}
      className={className === undefined ? "mrg-badge" : `mrg-badge ${className}`}
      data-kind={kind}
      data-slot="badge"
      data-variant={variant}
      ref={ref}
    >
      {kind === "status" ? (
        renderStatusContent(statusTemplate, resolvedVariantLabel, children)
      ) : (
        <span data-slot="badge-label">{children}</span>
      )}
    </span>
  );
});

Badge.displayName = "Badge";
