// Generated from registry/source/components/sticky-region/sticky-region.tsx by @mergora-internal/source-transformer. Do not edit.
"use client";

import {
  createContext,
  createElement,
  forwardRef,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type CSSProperties,
  type HTMLAttributes,
  type ReactNode,
} from "react";

import "./sticky-region.css";

export type StickyRegionPosition = "block-start" | "block-end";
export type StickyRegionOffset = "none" | "sm" | "md" | "lg";
export type StickyRegionSize = "sm" | "md" | "lg" | "viewport";
export type StickyRegionElement = "div" | "header" | "footer";

interface StickyRegionContextValue {
  readonly position: StickyRegionPosition;
  readonly setContentNode: (node: HTMLElement | null) => void;
}

const StickyRegionContext = createContext<StickyRegionContextValue | null>(null);

function useStickyRegionContext(part: string): StickyRegionContextValue {
  const context = useContext(StickyRegionContext);
  if (context === null) {
    throw new Error(`Mergora StickyRegion.${part} must be rendered inside StickyRegion.Root.`);
  }
  return context;
}

function joinClassName(base: string, className: string | undefined): string {
  return className === undefined || className.trim().length === 0 ? base : `${base} ${className}`;
}

export interface StickyRegionRootProps extends HTMLAttributes<HTMLDivElement> {
  /** Provides sticky content and the associated body within one measurement context. */
  readonly children?: ReactNode;
  /** Pins content to the logical start or end edge, so the behavior follows writing mode. */
  readonly position?: StickyRegionPosition;
  /** Adds tokenized distance from the selected sticky edge. */
  readonly offset?: StickyRegionOffset;
  /** Includes the corresponding physical safe-area inset when enabled. */
  readonly safeArea?: boolean;
  /** Makes the root its own native scroll container; page mode leaves scrolling to an ancestor. */
  readonly contained?: boolean;
  /** Applies a semantic maximum block size when contained scrolling is enabled. */
  readonly size?: StickyRegionSize;
  /** Server-rendered focus offset before ResizeObserver measures localized content. */
  readonly estimatedSize?: number;
  /** Measures sticky content and reserves focus/scroll clearance for obscured descendants. */
  readonly manageFocusOffset?: boolean;
}

export const StickyRegionRoot = forwardRef<HTMLDivElement, StickyRegionRootProps>(
  function StickyRegionRoot(
    {
      children,
      className,
      contained = false,
      estimatedSize = 44,
      manageFocusOffset = true,
      offset = "none",
      position = "block-start",
      safeArea = true,
      size = "md",
      style,
      ...nativeProps
    },
    forwardedRef,
  ) {
    if (manageFocusOffset && (!Number.isFinite(estimatedSize) || estimatedSize < 0)) {
      throw new RangeError("Mergora StickyRegion estimatedSize must be a non-negative number.");
    }
    const [contentNode, setContentNode] = useState<HTMLElement | null>(null);
    const [measuredSize, setMeasuredSize] = useState(estimatedSize);

    useEffect(() => {
      if (!manageFocusOffset || contentNode === null) return;
      const measure = () => {
        const nextSize = contentNode.getBoundingClientRect().height;
        if (Number.isFinite(nextSize) && nextSize >= 0) setMeasuredSize(nextSize);
      };
      measure();
      const Observer = globalThis.ResizeObserver;
      if (Observer === undefined) return;
      const observer = new Observer(measure);
      observer.observe(contentNode);
      return () => observer.disconnect();
    }, [contentNode, manageFocusOffset]);

    const setMeasuredContentNode = useCallback(
      (node: HTMLElement | null) => {
        if (manageFocusOffset) setContentNode(node);
      },
      [manageFocusOffset],
    );
    const context = useMemo<StickyRegionContextValue>(
      () => ({ position, setContentNode: setMeasuredContentNode }),
      [position, setMeasuredContentNode],
    );
    const rootStyle = manageFocusOffset
      ? ({ ...style, "--mrg-sticky-region-size": `${measuredSize}px` } as CSSProperties)
      : style;

    return (
      <StickyRegionContext.Provider value={context}>
        <div
          {...nativeProps}
          ref={forwardedRef}
          className={joinClassName("mrg-sticky-region", className)}
          data-contained={contained ? "true" : "false"}
          data-manage-focus-offset={manageFocusOffset ? "true" : undefined}
          data-offset={offset}
          data-position={position}
          data-safe-area={safeArea ? "true" : "false"}
          data-size={size}
          data-slot="sticky-region-root"
          style={rootStyle}
        >
          {children}
        </div>
      </StickyRegionContext.Provider>
    );
  },
);

StickyRegionRoot.displayName = "StickyRegion.Root";

export interface StickyRegionContentProps extends HTMLAttributes<HTMLElement> {
  /** Selects a restricted semantic element for the measured sticky content. */
  readonly element?: StickyRegionElement;
}

export const StickyRegionContent = forwardRef<HTMLElement, StickyRegionContentProps>(
  function StickyRegionContent({ className, element = "div", ...nativeProps }, forwardedRef) {
    const context = useStickyRegionContext("Content");
    const setRef = useCallback(
      (node: HTMLElement | null) => {
        context.setContentNode(node);
        if (typeof forwardedRef === "function") forwardedRef(node);
        else if (forwardedRef !== null) forwardedRef.current = node;
      },
      [context, forwardedRef],
    );
    return createElement(element, {
      ...nativeProps,
      ref: setRef,
      className: joinClassName("mrg-sticky-region__content", className),
      "data-element": element,
      "data-position": context.position,
      "data-slot": "sticky-region-content",
    });
  },
);

StickyRegionContent.displayName = "StickyRegion.Content";

export type StickyRegionBodyProps = HTMLAttributes<HTMLDivElement>;

export const StickyRegionBody = forwardRef<HTMLDivElement, StickyRegionBodyProps>(
  function StickyRegionBody({ className, ...nativeProps }, forwardedRef) {
    const context = useStickyRegionContext("Body");
    return (
      <div
        {...nativeProps}
        ref={forwardedRef}
        className={joinClassName("mrg-sticky-region__body", className)}
        data-position={context.position}
        data-slot="sticky-region-body"
      />
    );
  },
);

StickyRegionBody.displayName = "StickyRegion.Body";

export const StickyRegion = Object.freeze({
  Body: StickyRegionBody,
  Content: StickyRegionContent,
  Root: StickyRegionRoot,
});
