// Generated from registry/source/components/visually-hidden/visually-hidden.tsx by @mergora-internal/source-transformer. Do not edit.
import {
  forwardRef,
  type AnchorHTMLAttributes,
  type HTMLAttributes,
  type ReactElement,
  type Ref,
} from "react";

import "./visually-hidden.css";

interface VisuallyHiddenOwnProps {
  /** Reveals the hidden content when it receives keyboard focus, for skip links and similar controls. */
  readonly revealOnFocus?: boolean;
}

/** Valid native props follow the selected element. The default element is span. */
export type VisuallyHiddenProps = VisuallyHiddenOwnProps &
  (
    | ({
        /** Selects the native span, div, or anchor contract; span is the default. */
        readonly as?: "span";
      } & HTMLAttributes<HTMLSpanElement>)
    | ({
        /** Selects the native span, div, or anchor contract; span is the default. */
        readonly as: "div";
      } & HTMLAttributes<HTMLDivElement>)
    | ({
        /** Selects the native span, div, or anchor contract; span is the default. */
        readonly as: "a";
      } & AnchorHTMLAttributes<HTMLAnchorElement>)
  );

function joinClassNames(className: string | undefined): string {
  return className === undefined || className.trim().length === 0
    ? "mrg-visually-hidden"
    : `mrg-visually-hidden ${className}`;
}

export const VisuallyHidden = forwardRef<HTMLElement, VisuallyHiddenProps>(function VisuallyHidden(
  { as = "span", className, revealOnFocus = false, ...nativeProps },
  ref,
): ReactElement {
  const sharedProps = {
    className: joinClassNames(className),
    "data-reveal-on-focus": revealOnFocus ? "true" : undefined,
    "data-slot": "visually-hidden",
  };
  if (as === "a") {
    return (
      <a
        {...(nativeProps as AnchorHTMLAttributes<HTMLAnchorElement>)}
        {...sharedProps}
        ref={ref as Ref<HTMLAnchorElement>}
      />
    );
  }
  if (as === "div") {
    return (
      <div
        {...(nativeProps as HTMLAttributes<HTMLDivElement>)}
        {...sharedProps}
        ref={ref as Ref<HTMLDivElement>}
      />
    );
  }
  return (
    <span
      {...(nativeProps as HTMLAttributes<HTMLSpanElement>)}
      {...sharedProps}
      ref={ref as Ref<HTMLSpanElement>}
    />
  );
});

VisuallyHidden.displayName = "VisuallyHidden";
