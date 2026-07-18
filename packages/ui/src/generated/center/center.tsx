// Generated from registry/source/components/center/center.tsx by @mergora-internal/source-transformer. Do not edit.
import { forwardRef, type HTMLAttributes } from "react";

import "./center.css";

export type CenterAxis = "inline" | "block" | "both";
export type CenterMaximum = "none" | "prose" | "content";

export interface CenterProps extends HTMLAttributes<HTMLDivElement> {
  readonly axis?: CenterAxis;
  /** Constrains direct children with a semantic max while preserving a 100% narrow bound. */
  readonly maximum?: CenterMaximum;
  readonly text?: "start" | "center";
}

function joinCenterClassName(className: string | undefined): string {
  return className === undefined || className.trim().length === 0
    ? "mrg-center"
    : `mrg-center ${className}`;
}

export const Center = forwardRef<HTMLDivElement, CenterProps>(function Center(
  { axis = "both", className, maximum = "none", text = "start", ...nativeProps },
  forwardedRef,
) {
  return (
    <div
      {...nativeProps}
      ref={forwardedRef}
      className={joinCenterClassName(className)}
      data-axis={axis}
      data-maximum={maximum}
      data-slot="center"
      data-text={text}
    />
  );
});

Center.displayName = "Center";
