import { forwardRef, type CSSProperties, type HTMLAttributes } from "react";

import "./skeleton.css";

export type SkeletonShape = "text" | "rectangle" | "circle";

interface SkeletonStyle extends CSSProperties {
  readonly "--mrg-skeleton-block-size": string;
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
  readonly "aria-atomic"?: never;
  readonly "aria-hidden"?: never;
  readonly "aria-label"?: never;
  readonly "aria-labelledby"?: never;
  readonly "aria-live"?: never;
  readonly blockSize?: string | number;
  readonly children?: never;
  readonly inlineSize?: string | number;
  readonly role?: never;
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
    shape = "text",
    style,
    ...nativeProps
  } = props;
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
      data-shape={shape}
      data-slot="skeleton"
      ref={ref}
      style={skeletonStyle}
    />
  );
});

Skeleton.displayName = "Skeleton";
