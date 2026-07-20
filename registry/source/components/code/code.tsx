import { forwardRef, type HTMLAttributes } from "react";

import "./code.css";

export interface CodeProps extends HTMLAttributes<HTMLElement> {
  /** Isolates bidirectional ordering so inline code cannot reorder surrounding prose. */
  readonly isolateBidi?: boolean;
  /** Allows long code to wrap; false preserves it on a horizontally scrollable line. */
  readonly wrap?: boolean;
}

export const Code = forwardRef<HTMLElement, CodeProps>(function Code(
  { className, isolateBidi = false, wrap = true, ...nativeProps },
  forwardedRef,
) {
  return (
    <code
      {...nativeProps}
      ref={forwardedRef}
      className={
        className === undefined || className.trim().length === 0
          ? "mrg-code"
          : `mrg-code ${className}`
      }
      data-bidi-isolated={isolateBidi ? "true" : "false"}
      data-slot="code"
      data-wrap={wrap ? "true" : "false"}
    />
  );
});

Code.displayName = "Code";
