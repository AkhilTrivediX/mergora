// Generated from registry/source/components/separator/separator.tsx by @mergora-internal/source-transformer. Do not edit.
import { createElement, forwardRef, type HTMLAttributes } from "react";

import "./separator.css";

export type SeparatorOrientation = "horizontal" | "vertical";
export type SeparatorSpacing = "none" | "sm" | "md" | "lg";

export interface SeparatorProps extends Omit<
  HTMLAttributes<HTMLElement>,
  "aria-hidden" | "aria-orientation" | "children" | "role"
> {
  /** Decorative separators are removed from the accessibility tree. */
  readonly decorative?: boolean;
  /** Selects horizontal or vertical rendering and the matching accessible orientation. */
  readonly orientation?: SeparatorOrientation;
  /** Applies logical breathing room while preserving the native separator element. */
  readonly spacing?: SeparatorSpacing;
}

function joinSeparatorClassName(className: string | undefined): string {
  return className === undefined || className.trim().length === 0
    ? "mrg-separator"
    : `mrg-separator ${className}`;
}

export const Separator = forwardRef<HTMLElement, SeparatorProps>(function Separator(
  { className, decorative = true, orientation = "horizontal", spacing = "none", ...nativeProps },
  forwardedRef,
) {
  const accessibilityProps = decorative
    ? ({ "aria-hidden": true, role: "presentation" } as const)
    : orientation === "vertical"
      ? ({ "aria-orientation": "vertical", role: "separator" } as const)
      : ({} as const);

  return createElement(orientation === "horizontal" ? "hr" : "div", {
    ...nativeProps,
    ...accessibilityProps,
    ref: forwardedRef,
    className: joinSeparatorClassName(className),
    "data-decorative": decorative ? "true" : "false",
    "data-orientation": orientation,
    "data-spacing": spacing === "none" ? undefined : spacing,
    "data-slot": "separator",
  });
});

Separator.displayName = "Separator";
