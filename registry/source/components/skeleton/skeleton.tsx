import { forwardRef, type CSSProperties, type HTMLAttributes } from "react";

import "./skeleton.css";

export type SkeletonShape = "text" | "rectangle" | "circle";

interface SkeletonStyle extends CSSProperties {
  /** Resolved logical block size passed to the component stylesheet. */
  readonly "--mrg-skeleton-block-size": string;
  /** Resolved logical inline size passed to the component stylesheet. */
  readonly "--mrg-skeleton-inline-size": string;
}

export interface SkeletonProps extends Omit<
  HTMLAttributes<HTMLSpanElement>,
  | "aria-atomic"
  | "aria-hidden"
  | "aria-label"
  | "aria-labelledby"
  | "aria-live"
  | "children"
  | "role"
> {
  /** Reserved: Skeleton is always excluded from the accessibility tree. */
  readonly "aria-atomic"?: never;
  /** Reserved: Skeleton always renders with `aria-hidden="true"`. */
  readonly "aria-hidden"?: never;
  /** Reserved: decorative placeholders cannot expose an accessible name. */
  readonly "aria-label"?: never;
  /** Reserved: decorative placeholders cannot reference an accessible name. */
  readonly "aria-labelledby"?: never;
  /** Reserved: Skeleton never creates a live region. */
  readonly "aria-live"?: never;
  /** Enables the reduced-motion-aware decorative pulse; false leaves no animation output. */
  readonly animated?: boolean;
  /** Logical block dimension; finite non-negative numbers normalize to CSS pixels. */
  readonly blockSize?: string | number;
  /** Reserved: Skeleton is a decorative placeholder and cannot contain content. */
  readonly children?: never;
  /** Logical inline dimension; finite non-negative numbers normalize to CSS pixels. */
  readonly inlineSize?: string | number;
  /** Reserved: Skeleton is always accessibility-hidden and has no semantic role. */
  readonly role?: never;
  /** Placeholder geometry treatment; defaults to `text`. */
  readonly shape?: SkeletonShape;
}

function assertNoSkeletonSemanticOverrides(props: Readonly<Record<string, unknown>>): void {
  for (const key of [
    "aria-atomic",
    "aria-hidden",
    "aria-label",
    "aria-labelledby",
    "aria-live",
    "children",
    "role",
  ] as const) {
    if (props[key] !== undefined) {
      throw new Error(`Mergora Skeleton owns ${key} and does not accept a semantic override.`);
    }
  }
}

export function resolveSkeletonSize(value: string | number, name: string): string {
  if (typeof value === "number") {
    if (!Number.isFinite(value) || value < 0) {
      throw new RangeError(`Mergora Skeleton ${name} must be a finite non-negative size.`);
    }
    return `${value}px`;
  }
  if (value.trim().length === 0) {
    throw new Error(`Mergora Skeleton ${name} must be non-empty.`);
  }
  return value;
}

export const Skeleton = forwardRef<HTMLSpanElement, SkeletonProps>(function Skeleton(props, ref) {
  assertNoSkeletonSemanticOverrides(props as unknown as Readonly<Record<string, unknown>>);
  const {
    blockSize = "1em",
    className,
    inlineSize = "100%",
    animated = true,
    shape = "text",
    style,
    ...nativeProps
  } = props;
  if (typeof animated !== "boolean") {
    throw new Error("Mergora Skeleton animated must be a boolean when provided.");
  }
  const skeletonStyle: SkeletonStyle = {
    ...style,
    "--mrg-skeleton-block-size": resolveSkeletonSize(blockSize, "blockSize"),
    "--mrg-skeleton-inline-size": resolveSkeletonSize(inlineSize, "inlineSize"),
  };
  return (
    <span
      {...nativeProps}
      aria-hidden="true"
      className={className === undefined ? "mrg-skeleton" : `mrg-skeleton ${className}`}
      data-animated={animated || undefined}
      data-shape={shape}
      data-slot="skeleton"
      ref={ref}
      style={skeletonStyle}
    />
  );
});

Skeleton.displayName = "Skeleton";
