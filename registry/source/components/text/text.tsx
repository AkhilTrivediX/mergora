import { createElement, forwardRef, type HTMLAttributes, type ReactNode } from "react";

import "./text.css";

export type TextElement = "div" | "em" | "p" | "small" | "span" | "strong";
export type TextSize = "xs" | "sm" | "md" | "lg";
export type TextWeight = "regular" | "medium" | "semibold" | "strong";
export type TextTone = "primary" | "muted" | "success" | "warning" | "danger";

export interface TextProps extends HTMLAttributes<HTMLElement> {
  readonly as?: TextElement;
  readonly children?: ReactNode;
  readonly fullValue?: string;
  readonly size?: TextSize;
  readonly tone?: TextTone;
  readonly truncate?: boolean;
  readonly weight?: TextWeight;
}

function classNames(className: string | undefined): string {
  return className === undefined || className.trim().length === 0
    ? "mrg-text"
    : `mrg-text ${className}`;
}

function readableValue(children: ReactNode, fullValue: string | undefined): string | undefined {
  if (fullValue !== undefined) return fullValue;
  if (typeof children === "string" || typeof children === "number") return String(children);
  return undefined;
}

export const Text = forwardRef<HTMLElement, TextProps>(function Text(
  {
    as = "span",
    children,
    className,
    fullValue,
    size = "md",
    tone = "primary",
    truncate = false,
    weight = "regular",
    ...nativeProps
  },
  forwardedRef,
) {
  const accessibleValue = readableValue(children, fullValue);
  if (truncate && accessibleValue === undefined) {
    throw new TypeError("Text requires fullValue when truncating non-text children.");
  }

  return createElement(
    as,
    {
      ...nativeProps,
      ...(truncate
        ? {
            "aria-label": nativeProps["aria-label"] ?? accessibleValue,
            tabIndex: nativeProps.tabIndex ?? 0,
            title: nativeProps.title ?? accessibleValue,
          }
        : {}),
      className: classNames(className),
      "data-size": size,
      "data-slot": "text",
      "data-tone": tone,
      "data-truncate": truncate ? "true" : "false",
      "data-weight": weight,
      ref: forwardedRef,
    },
    children,
  );
});

Text.displayName = "Text";
