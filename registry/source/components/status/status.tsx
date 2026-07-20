"use client";

import { Fragment, forwardRef, isValidElement, type HTMLAttributes, type ReactNode } from "react";

import { useMergoraMessage } from "../provider/index.js";
import "./status.css";

export type StatusVariant = "neutral" | "info" | "success" | "warning" | "error";
export type StatusLiveMode = "off" | "polite" | "assertive";

export interface StatusProps extends Omit<
  HTMLAttributes<HTMLSpanElement>,
  "aria-atomic" | "aria-label" | "aria-labelledby" | "aria-live" | "children" | "role"
> {
  /** Reserved: Status owns atomicity when an explicit live mode is enabled. */
  readonly "aria-atomic"?: never;
  /** Reserved: visible variant and consumer text provide the status content. */
  readonly "aria-label"?: never;
  /** Reserved: Status does not use an external accessible-name relationship. */
  readonly "aria-labelledby"?: never;
  /** Reserved: configure optional live behavior with `live`. */
  readonly "aria-live"?: never;
  /** Non-empty visible status content. */
  readonly children: ReactNode;
  /** Optional atomic live behavior; defaults to the static `off` mode. */
  readonly live?: StatusLiveMode;
  /** Reserved: role is derived from `live` and omitted in static mode. */
  readonly role?: never;
  /** Visual and textual status treatment; defaults to `neutral`. */
  readonly variant?: StatusVariant;
  /** Localized visible override for the formatted variant label. */
  readonly variantLabel?: string;
}

function hasStatusContent(value: ReactNode): boolean {
  if (value === null || value === undefined || typeof value === "boolean") return false;
  if (typeof value === "string") return value.trim().length > 0;
  if (Array.isArray(value)) return value.some(hasStatusContent);
  if (isValidElement(value) && value.type === Fragment) {
    return hasStatusContent((value.props as { readonly children?: ReactNode }).children);
  }
  return true;
}

function assertNoStatusSemanticOverrides(props: Readonly<Record<string, unknown>>): void {
  for (const key of [
    "aria-atomic",
    "aria-label",
    "aria-labelledby",
    "aria-live",
    "role",
  ] as const) {
    if (props[key] !== undefined) {
      throw new Error(`Mergora Status owns ${key} and does not accept a semantic override.`);
    }
  }
}

export const Status = forwardRef<HTMLSpanElement, StatusProps>(function Status(props, ref) {
  assertNoStatusSemanticOverrides(props as unknown as Readonly<Record<string, unknown>>);
  const {
    children,
    className,
    live = "off",
    variant = "neutral",
    variantLabel: variantLabelProp,
    ...nativeProps
  } = props;
  if (!hasStatusContent(children)) throw new Error("Mergora Status requires non-empty content.");
  if (variantLabelProp !== undefined && variantLabelProp.trim().length === 0) {
    throw new Error("Mergora Status variantLabel must be non-empty when provided.");
  }
  const defaultVariantLabel = useMergoraMessage(
    `status.${variant}`,
    {
      error: "Error",
      info: "Information",
      neutral: "Status",
      success: "Success",
      warning: "Warning",
    }[variant],
  );
  const formattedDefaultVariantLabel = useMergoraMessage("status.variantLabel", "{variant}:", {
    variant: defaultVariantLabel,
  });
  const role = live === "assertive" ? "alert" : live === "polite" ? "status" : undefined;
  const symbol =
    variant === "success"
      ? "✓"
      : variant === "warning"
        ? "!"
        : variant === "error"
          ? "×"
          : variant === "info"
            ? "i"
            : "•";

  return (
    <span
      {...nativeProps}
      {...(role === undefined ? {} : { "aria-atomic": true, "aria-live": live, role })}
      className={className === undefined ? "mrg-status" : `mrg-status ${className}`}
      data-live={live}
      data-slot="status"
      data-variant={variant}
      ref={ref}
    >
      <span aria-hidden="true" data-slot="status-symbol">
        {symbol}
      </span>
      <span data-slot="status-variant-label">
        {variantLabelProp ?? formattedDefaultVariantLabel}
      </span>
      <span data-slot="status-label">{children}</span>
    </span>
  );
});

Status.displayName = "Status";
