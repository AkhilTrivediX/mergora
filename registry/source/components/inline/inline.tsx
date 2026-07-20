import { forwardRef, type HTMLAttributes } from "react";

import "./inline.css";

export type InlineGap = "none" | "xs" | "sm" | "md" | "lg";
export type InlineAlign = "stretch" | "start" | "center" | "end" | "baseline";
export type InlineJustify = "start" | "center" | "end" | "between";

export interface InlineProps extends HTMLAttributes<HTMLDivElement> {
  /** Sets tokenized inline space between children without accepting arbitrary CSS lengths. */
  readonly gap?: InlineGap;
  /** Aligns children on the cross axis, including a typography-friendly baseline option. */
  readonly align?: InlineAlign;
  /** Distributes children along the logical inline axis. */
  readonly justify?: InlineJustify;
  /** Keeps the resilient wrapping baseline by default; false opts into one logical line. */
  readonly wrap?: boolean;
}

function joinInlineClassName(className: string | undefined): string {
  return className === undefined || className.trim().length === 0
    ? "mrg-inline"
    : `mrg-inline ${className}`;
}

export const Inline = forwardRef<HTMLDivElement, InlineProps>(function Inline(
  { align = "center", className, gap = "sm", justify = "start", wrap = true, ...nativeProps },
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
      data-wrap={wrap ? undefined : "false"}
    />
  );
});

Inline.displayName = "Inline";
