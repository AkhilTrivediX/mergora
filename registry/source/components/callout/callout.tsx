"use client";

import {
  Fragment,
  forwardRef,
  isValidElement,
  useId,
  type HTMLAttributes,
  type ReactNode,
  type Ref,
} from "react";

import { useMergoraMessage } from "../provider/index.js";
import "./callout.css";

export type CalloutVariant = "note" | "info" | "tip" | "warning";
export type CalloutHeadingLevel = 1 | 2 | 3 | 4 | 5 | 6;

export interface CalloutProps extends Omit<
  HTMLAttributes<HTMLElement>,
  "aria-atomic" | "aria-label" | "aria-labelledby" | "aria-live" | "children" | "role" | "title"
> {
  readonly "aria-atomic"?: never;
  readonly "aria-label"?: never;
  readonly "aria-labelledby"?: never;
  readonly "aria-live"?: never;
  readonly children: ReactNode;
  readonly headingLevel?: CalloutHeadingLevel;
  readonly landmarkLabel?: string;
  readonly title: ReactNode;
  readonly variant?: CalloutVariant;
  readonly variantLabel?: string;
  readonly role?: never;
}

function hasCalloutContent(value: ReactNode): boolean {
  if (value === null || value === undefined || typeof value === "boolean") return false;
  if (typeof value === "string") return value.trim().length > 0;
  if (Array.isArray(value)) return value.some(hasCalloutContent);
  if (isValidElement(value) && value.type === Fragment) {
    return hasCalloutContent((value.props as { readonly children?: ReactNode }).children);
  }
  return true;
}

function assertNoCalloutSemanticOverrides(props: Readonly<Record<string, unknown>>): void {
  for (const key of [
    "aria-atomic",
    "aria-label",
    "aria-labelledby",
    "aria-live",
    "role",
  ] as const) {
    if (props[key] !== undefined) {
      throw new Error(`Mergora Callout owns ${key} and does not accept a semantic override.`);
    }
  }
}

export const Callout = forwardRef<HTMLElement, CalloutProps>(function Callout(props, ref) {
  assertNoCalloutSemanticOverrides(props as unknown as Readonly<Record<string, unknown>>);
  const {
    children,
    className,
    headingLevel = 2,
    landmarkLabel,
    title,
    variant = "note",
    variantLabel: variantLabelProp,
    ...nativeProps
  } = props;
  if (!hasCalloutContent(title) || !hasCalloutContent(children)) {
    throw new Error("Mergora Callout requires non-empty title and content.");
  }
  if (landmarkLabel !== undefined && landmarkLabel.trim().length === 0) {
    throw new Error("Mergora Callout landmarkLabel must be non-empty when provided.");
  }
  if (variantLabelProp !== undefined && variantLabelProp.trim().length === 0) {
    throw new Error("Mergora Callout variantLabel must be non-empty when provided.");
  }
  const defaultVariantLabel = useMergoraMessage(
    `callout.${variant}`,
    {
      info: "Information",
      note: "Note",
      tip: "Tip",
      warning: "Warning",
    }[variant],
  );
  const reactId = useId();
  const titleId = `mrg-callout-${reactId.replaceAll(":", "")}-title`;
  const Heading = `h${headingLevel}` as const;
  const Root = landmarkLabel === undefined ? "div" : "aside";
  const rootRef = ref as Ref<HTMLDivElement> & Ref<HTMLElement>;

  return (
    <Root
      {...nativeProps}
      {...(landmarkLabel === undefined ? {} : { "aria-label": landmarkLabel })}
      className={className === undefined ? "mrg-callout" : `mrg-callout ${className}`}
      data-landmark={landmarkLabel === undefined ? "false" : "true"}
      data-slot="callout"
      data-variant={variant}
      ref={rootRef}
    >
      <span aria-hidden="true" data-slot="callout-icon">
        {variant === "tip" ? "★" : variant === "warning" ? "!" : variant === "info" ? "i" : "•"}
      </span>
      <div data-slot="callout-content">
        <span data-slot="callout-variant-label">{variantLabelProp ?? defaultVariantLabel}</span>
        <Heading data-slot="callout-title" id={titleId}>
          {title}
        </Heading>
        <div data-slot="callout-body">{children}</div>
      </div>
    </Root>
  );
});

Callout.displayName = "Callout";
