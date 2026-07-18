// Generated from registry/source/components/code/code.tsx by @mergora-internal/source-transformer. Do not edit.
import { forwardRef, type HTMLAttributes } from "react";

import "./code.css";

export interface CodeProps extends HTMLAttributes<HTMLElement> {
  readonly wrap?: boolean;
}

export const Code = forwardRef<HTMLElement, CodeProps>(function Code(
  { className, wrap = true, ...nativeProps },
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
      data-slot="code"
      data-wrap={wrap ? "true" : "false"}
    />
  );
});

Code.displayName = "Code";
