import { forwardRef, type CSSProperties, type HTMLAttributes } from "react";

import "./aspect-ratio.css";

export type AspectRatioPreset = "square" | "video" | "portrait" | "wide";
export type AspectRatioValue = AspectRatioPreset | readonly [width: number, height: number];
export type AspectRatioFit = "none" | "contain" | "cover";

export interface AspectRatioProps extends HTMLAttributes<HTMLDivElement> {
  /** Opts direct media children into bounded fitting without replacing their native semantics. */
  readonly fit?: AspectRatioFit;
  /** Selects a named media ratio or a positive width-and-height tuple; video is the default. */
  readonly ratio?: AspectRatioValue;
}

interface AspectRatioStyle extends CSSProperties {
  "--mrg-aspect-ratio": number;
  "--mrg-aspect-ratio-fallback": string;
}

const PRESET_DIMENSIONS = {
  portrait: [3, 4],
  square: [1, 1],
  video: [16, 9],
  wide: [21, 9],
} as const satisfies Record<AspectRatioPreset, readonly [number, number]>;

export function resolveAspectRatio(ratio: AspectRatioValue): {
  readonly native: number;
  readonly fallback: string;
} {
  const dimensions = typeof ratio === "string" ? PRESET_DIMENSIONS[ratio] : ratio;
  const [width, height] = dimensions;
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) {
    throw new RangeError("Mergora AspectRatio requires finite width and height values above zero.");
  }
  return { native: width / height, fallback: `${(height / width) * 100}%` };
}

function joinAspectRatioClassName(className: string | undefined): string {
  return className === undefined || className.trim().length === 0
    ? "mrg-aspect-ratio"
    : `mrg-aspect-ratio ${className}`;
}

export const AspectRatio = forwardRef<HTMLDivElement, AspectRatioProps>(function AspectRatio(
  { className, fit = "none", ratio = "video", style, ...nativeProps },
  forwardedRef,
) {
  const resolved = resolveAspectRatio(ratio);
  const mergedStyle: AspectRatioStyle = {
    ...style,
    "--mrg-aspect-ratio": resolved.native,
    "--mrg-aspect-ratio-fallback": resolved.fallback,
  };

  return (
    <div
      {...nativeProps}
      ref={forwardedRef}
      className={joinAspectRatioClassName(className)}
      data-fit={fit === "none" ? undefined : fit}
      data-ratio={typeof ratio === "string" ? ratio : "custom"}
      data-slot="aspect-ratio"
      style={mergedStyle}
    />
  );
});

AspectRatio.displayName = "AspectRatio";
