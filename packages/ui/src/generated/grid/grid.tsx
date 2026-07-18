// Generated from registry/source/components/grid/grid.tsx by @mergora-internal/source-transformer. Do not edit.
import { createElement, forwardRef, type HTMLAttributes } from "react";

import "./grid.css";

export type GridColumns = "auto" | 1 | 2 | 3 | 4 | 5 | 6;
export type GridMinimum = "compact" | "default" | "wide";
export type GridGap = "none" | "sm" | "md" | "lg";
export type GridAlign = "stretch" | "start" | "center" | "end";
export type GridElement = "div" | "section" | "ul" | "ol";
export type GridListStyle = "preserve" | "none";

export interface GridProps extends HTMLAttributes<HTMLElement> {
  readonly columns?: GridColumns;
  readonly minimum?: GridMinimum;
  readonly gap?: GridGap;
  readonly align?: GridAlign;
  readonly element?: GridElement;
  readonly listStyle?: GridListStyle;
}

function joinGridClassName(className: string | undefined): string {
  return className === undefined || className.trim().length === 0
    ? "mrg-grid"
    : `mrg-grid ${className}`;
}

export const Grid = forwardRef<HTMLElement, GridProps>(function Grid(
  {
    align = "stretch",
    className,
    columns = "auto",
    element = "div",
    gap = "md",
    listStyle = "preserve",
    minimum = "default",
    ...nativeProps
  },
  forwardedRef,
) {
  return createElement(element, {
    ...nativeProps,
    ref: forwardedRef,
    className: joinGridClassName(className),
    "data-align": align,
    "data-columns": columns,
    "data-element": element,
    "data-gap": gap,
    "data-list-style": listStyle,
    "data-minimum": minimum,
    "data-slot": "grid",
  });
});

Grid.displayName = "Grid";
