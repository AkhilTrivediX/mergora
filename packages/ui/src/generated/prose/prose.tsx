// Generated from registry/source/components/prose/prose.tsx by @mergora-internal/source-transformer. Do not edit.
import { createElement, forwardRef, type HTMLAttributes, type ReactNode } from "react";

import "./prose.css";

export type ProseElement = "article" | "div" | "section";
export type ProseMeasure = "prose" | "wide" | "none";
export type ProseSize = "compact" | "default" | "large";

export interface ProseProps extends HTMLAttributes<HTMLElement> {
  /** Native article, section, or div element used for the prose boundary. */
  readonly as?: ProseElement;
  /** Long-form content receiving the shared readable typography treatment. */
  readonly children?: ReactNode;
  /** Selects prose, wide, or unconstrained readable line measure. */
  readonly measure?: ProseMeasure;
  /** Selects compact, default, or large prose type density. */
  readonly size?: ProseSize;
}

export const Prose = forwardRef<HTMLElement, ProseProps>(function Prose(
  { as = "article", children, className, measure = "prose", size = "default", ...nativeProps },
  forwardedRef,
) {
  return createElement(
    as,
    {
      ...nativeProps,
      className:
        className === undefined || className.trim().length === 0
          ? "mrg-prose"
          : `mrg-prose ${className}`,
      "data-measure": measure,
      "data-size": size,
      "data-slot": "prose",
      ref: forwardedRef,
    },
    children,
  );
});

Prose.displayName = "Prose";
