import { createElement, forwardRef, type HTMLAttributes } from "react";

import "./separator.css";

export type SeparatorOrientation = "horizontal" | "vertical";

export interface SeparatorProps extends Omit<
  HTMLAttributes<HTMLElement>,
  "aria-hidden" | "aria-orientation" | "children" | "role"
> {
  /** Decorative separators are removed from the accessibility tree. */
  readonly decorative?: boolean;
  readonly orientation?: SeparatorOrientation;
}

function joinSeparatorClassName(className: string | undefined): string {
  return className === undefined || className.trim().length === 0
    ? "mrg-separator"
    : `mrg-separator ${className}`;
}

export const Separator = forwardRef<HTMLElement, SeparatorProps>(function Separator(
  { className, decorative = true, orientation = "horizontal", ...nativeProps },
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
    "data-slot": "separator",
  });
});

Separator.displayName = "Separator";
