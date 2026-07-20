// Generated from registry/source/components/direction/direction.tsx by @mergora-internal/source-transformer. Do not edit.
"use client";

import {
  createContext,
  forwardRef,
  useContext,
  type HTMLAttributes,
  type PropsWithChildren,
  type ReactElement,
} from "react";

import "./direction.css";

export type DirectionValue = "ltr" | "rtl";
export type LogicalSide = "start" | "end";
export type PhysicalSide = "left" | "right";

const DirectionContext = createContext<DirectionValue>("ltr");

export interface DirectionProviderProps extends PropsWithChildren {
  /** Direction inherited by Mergora descendants, including React portals. */
  readonly direction: DirectionValue;
}

export function DirectionProvider({ children, direction }: DirectionProviderProps): ReactElement {
  return <DirectionContext.Provider value={direction}>{children}</DirectionContext.Provider>;
}

export interface DirectionBoundaryProps extends HTMLAttributes<HTMLDivElement> {
  /** Native bidi direction for this DOM subtree. */
  readonly direction: DirectionValue;
  /** Isolates the subtree's bidi ordering from surrounding text without changing semantics. */
  readonly isolate?: boolean;
}

export const DirectionBoundary = forwardRef<HTMLDivElement, DirectionBoundaryProps>(
  function DirectionBoundary({ children, direction, isolate = false, ...nativeProps }, ref) {
    return (
      <DirectionProvider direction={direction}>
        <div
          {...nativeProps}
          ref={ref}
          dir={direction}
          data-bidi-isolate={isolate ? "true" : undefined}
          data-direction={direction}
          data-slot="direction-boundary"
        >
          {children}
        </div>
      </DirectionProvider>
    );
  },
);

DirectionBoundary.displayName = "Direction.Boundary";

export function useDirection(): DirectionValue {
  return useContext(DirectionContext);
}

export function resolveLogicalSide(side: LogicalSide, direction: DirectionValue): PhysicalSide {
  if (side === "start") return direction === "rtl" ? "right" : "left";
  return direction === "rtl" ? "left" : "right";
}

export const Direction = {
  Provider: DirectionProvider,
  Boundary: DirectionBoundary,
} as const;
