import { createElement, forwardRef, type HTMLAttributes } from "react";

import "./grid.css";

export type GridColumns = "auto" | 1 | 2 | 3 | 4 | 5 | 6;
export type GridMinimum = "compact" | "default" | "wide";
export type GridGap = "none" | "sm" | "md" | "lg";
export type GridAlign = "stretch" | "start" | "center" | "end";
export type GridElement = "div" | "section" | "ul" | "ol";
export type GridListStyle = "preserve" | "none";

export interface GridProps extends HTMLAttributes<HTMLElement> {
  /** Uses a fixed column count or an auto-fit grid that responds to the available width. */
  readonly columns?: GridColumns;
  /** Selects the semantic minimum track width used by the auto-fit layout. */
  readonly minimum?: GridMinimum;
  /** Sets tokenized row and column space without accepting arbitrary CSS lengths. */
  readonly gap?: GridGap;
  /** Aligns grid items within their block-axis tracks. */
  readonly align?: GridAlign;
  /** Chooses a restricted semantic root element instead of unrestricted polymorphism. */
  readonly element?: GridElement;
  /** Preserves native list markers by default or removes them for application-style grids. */
  readonly listStyle?: GridListStyle;
  /** Equalizes intrinsic row tracks; false keeps content-sized rows. */
  readonly equalRows?: boolean;
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
    equalRows = false,
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
    "data-equal-rows": equalRows ? "true" : undefined,
    "data-gap": gap,
    "data-list-style": listStyle,
    "data-minimum": minimum,
    "data-slot": "grid",
  });
});

Grid.displayName = "Grid";
