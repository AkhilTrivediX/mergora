import { createElement, forwardRef, type HTMLAttributes } from "react";

import "./stack.css";

export type StackGap = "none" | "xs" | "sm" | "md" | "lg";
export type StackAlign = "stretch" | "start" | "center" | "end";
export type StackElement = "div" | "section" | "ul" | "ol";
export type StackListStyle = "preserve" | "none";

export interface StackProps extends HTMLAttributes<HTMLElement> {
  /** A restricted native element set keeps layout separate from arbitrary polymorphism. */
  readonly element?: StackElement;
  readonly gap?: StackGap;
  readonly align?: StackAlign;
  /** Applies only to ul/ol roots; preserve keeps native markers and indentation. */
  readonly listStyle?: StackListStyle;
}

function joinStackClassName(className: string | undefined): string {
  return className === undefined || className.trim().length === 0
    ? "mrg-stack"
    : `mrg-stack ${className}`;
}

export const Stack = forwardRef<HTMLElement, StackProps>(function Stack(
  {
    align = "stretch",
    className,
    element = "div",
    gap = "md",
    listStyle = "preserve",
    ...nativeProps
  },
  forwardedRef,
) {
  return createElement(element, {
    ...nativeProps,
    ref: forwardedRef,
    className: joinStackClassName(className),
    "data-align": align,
    "data-element": element,
    "data-gap": gap,
    "data-list-style": listStyle,
    "data-slot": "stack",
  });
});

Stack.displayName = "Stack";
