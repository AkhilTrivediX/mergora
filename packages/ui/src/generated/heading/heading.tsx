// Generated from registry/source/components/heading/heading.tsx by @mergora-internal/source-transformer. Do not edit.
import { createElement, forwardRef, type HTMLAttributes, type ReactNode } from "react";

import "./heading.css";

export type HeadingLevel = 1 | 2 | 3 | 4 | 5 | 6;
export type HeadingElement = "h1" | "h2" | "h3" | "h4" | "h5" | "h6";
export type HeadingSize = "display" | "lg" | "md" | "sm";

interface HeadingBaseProps extends HTMLAttributes<HTMLHeadingElement> {
  /** Heading content rendered by the selected native heading element. */
  readonly children?: ReactNode;
  /** Visual scale independent from the required semantic heading level. */
  readonly size?: HeadingSize;
}

export type HeadingProps = HeadingBaseProps &
  (
    | {
        /** Semantic level used to select the corresponding native h1 through h6 element. */
        readonly level: HeadingLevel;
        /** Mutually exclusive with level so the semantic element has one source of truth. */
        readonly as?: never;
      }
    | {
        /** Explicit native h1 through h6 element used as the semantic source of truth. */
        readonly as: HeadingElement;
        /** Mutually exclusive with as so the semantic element has one source of truth. */
        readonly level?: never;
      }
  );

const levelsByElement: Readonly<Record<HeadingElement, HeadingLevel>> = {
  h1: 1,
  h2: 2,
  h3: 3,
  h4: 4,
  h5: 5,
  h6: 6,
};

function classNames(className: string | undefined): string {
  return className === undefined || className.trim().length === 0
    ? "mrg-heading"
    : `mrg-heading ${className}`;
}

export const Heading = forwardRef<HTMLHeadingElement, HeadingProps>(function Heading(
  { as, children, className, level, size, ...nativeProps },
  forwardedRef,
) {
  const element = as ?? (`h${String(level)}` as HeadingElement);
  const semanticLevel = levelsByElement[element];
  const visualSize = size ?? (semanticLevel === 1 ? "lg" : semanticLevel === 2 ? "md" : "sm");

  return createElement(
    element,
    {
      ...nativeProps,
      className: classNames(className),
      "data-level": String(semanticLevel),
      "data-size": visualSize,
      "data-slot": "heading",
      ref: forwardedRef,
    },
    children,
  );
});

Heading.displayName = "Heading";
