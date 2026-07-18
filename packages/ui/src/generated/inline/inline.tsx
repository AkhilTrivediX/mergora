// Generated from registry/source/components/inline/inline.tsx by @mergora-internal/source-transformer. Do not edit.
import { forwardRef, type HTMLAttributes } from "react";

import "./inline.css";

export type InlineGap = "none" | "xs" | "sm" | "md" | "lg";
export type InlineAlign = "stretch" | "start" | "center" | "end" | "baseline";
export type InlineJustify = "start" | "center" | "end" | "between";

export interface InlineProps extends HTMLAttributes<HTMLDivElement> {
  readonly gap?: InlineGap;
  readonly align?: InlineAlign;
  readonly justify?: InlineJustify;
}

function joinInlineClassName(className: string | undefined): string {
  return className === undefined || className.trim().length === 0
    ? "mrg-inline"
    : `mrg-inline ${className}`;
}

export const Inline = forwardRef<HTMLDivElement, InlineProps>(function Inline(
  { align = "center", className, gap = "sm", justify = "start", ...nativeProps },
  forwardedRef,
) {
  return (
    <div
      {...nativeProps}
      ref={forwardedRef}
      className={joinInlineClassName(className)}
      data-align={align}
      data-gap={gap}
      data-justify={justify}
      data-slot="inline"
    />
  );
});

Inline.displayName = "Inline";
