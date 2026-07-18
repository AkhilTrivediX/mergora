// Generated from registry/source/components/scroll-area/scroll-area.tsx by @mergora-internal/source-transformer. Do not edit.
import { forwardRef, type HTMLAttributes } from "react";

import "./scroll-area.css";

export type ScrollAreaOrientation = "vertical" | "horizontal" | "both";
export type ScrollAreaSize = "sm" | "md" | "lg" | "viewport";
export type ScrollAreaPadding = "none" | "sm" | "md";

type AccessibleName =
  | { readonly "aria-label": string; readonly "aria-labelledby"?: string }
  | { readonly "aria-label"?: string; readonly "aria-labelledby": string };

interface ScrollAreaBaseProps extends Omit<
  HTMLAttributes<HTMLDivElement>,
  "aria-label" | "aria-labelledby" | "role" | "tabIndex"
> {
  /** Chooses the intended native scroll direction without replacing browser scrolling. */
  readonly orientation?: ScrollAreaOrientation;
  /** A semantic maximum block size; viewport also accounts for physical safe-area insets. */
  readonly size?: ScrollAreaSize;
  /** Keeps focused descendants clear of the scrollport edge and sticky content. */
  readonly scrollPadding?: ScrollAreaPadding;
  /** Contains scroll chaining at the region boundary. */
  readonly containOverscroll?: boolean;
}

export type ScrollAreaProps = ScrollAreaBaseProps &
  (
    | ({ readonly focusable: true } & AccessibleName)
    | {
        readonly focusable?: false;
        readonly "aria-label"?: never;
        readonly "aria-labelledby"?: never;
      }
  );

function joinScrollAreaClassName(className: string | undefined): string {
  return className === undefined || className.trim().length === 0
    ? "mrg-scroll-area"
    : `mrg-scroll-area ${className}`;
}

export const ScrollArea = forwardRef<HTMLDivElement, ScrollAreaProps>(function ScrollArea(
  {
    "aria-label": ariaLabel,
    "aria-labelledby": ariaLabelledBy,
    children,
    className,
    containOverscroll = false,
    focusable = false,
    orientation = "vertical",
    scrollPadding = "sm",
    size = "md",
    ...nativeProps
  },
  forwardedRef,
) {
  return (
    <div
      {...nativeProps}
      ref={forwardedRef}
      aria-label={focusable ? ariaLabel : undefined}
      aria-labelledby={focusable ? ariaLabelledBy : undefined}
      className={joinScrollAreaClassName(className)}
      data-contain-overscroll={containOverscroll ? "true" : "false"}
      data-focusable={focusable ? "true" : "false"}
      data-orientation={orientation}
      data-scroll-padding={scrollPadding}
      data-size={size}
      data-slot="scroll-area"
      role={focusable ? "region" : undefined}
      tabIndex={focusable ? 0 : undefined}
    >
      {children}
    </div>
  );
});

ScrollArea.displayName = "ScrollArea";
