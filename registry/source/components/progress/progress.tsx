"use client";

import {
  Fragment,
  forwardRef,
  isValidElement,
  useId,
  type ProgressHTMLAttributes,
  type ReactNode,
} from "react";

import { useMergoraContext } from "../provider/index.js";
import "./progress.css";

export interface ProgressProps extends Omit<
  ProgressHTMLAttributes<HTMLProgressElement>,
  | "aria-label"
  | "aria-labelledby"
  | "aria-valuemax"
  | "aria-valuemin"
  | "aria-valuenow"
  | "aria-valuetext"
  | "children"
  | "className"
  | "max"
  | "role"
  | "value"
> {
  /** Class name applied to the outer labelled Progress wrapper. */
  readonly className?: string;
  /** Formats determinate visible and accessible values with the provider locale. */
  readonly formatValue?: (value: number, maximum: number, locale: string) => string;
  /** Non-empty visible content that supplies the native progress accessible name. */
  readonly label: ReactNode;
  /** Positive finite upper boundary; defaults to 100. */
  readonly maximum?: number;
  /** Shows localized value context and `aria-valuetext`; defaults to true. */
  readonly showValue?: boolean;
  /** Current determinate value; omit to preserve native indeterminate semantics. */
  readonly value?: number;
}

function hasProgressLabel(value: ReactNode): boolean {
  if (value === null || value === undefined || typeof value === "boolean") return false;
  if (typeof value === "string") return value.trim().length > 0;
  if (Array.isArray(value)) return value.some((item) => hasProgressLabel(item));
  if (isValidElement(value) && value.type === Fragment) {
    return hasProgressLabel((value.props as { readonly children?: ReactNode }).children);
  }
  return true;
}

const OWNED_PROGRESS_PROPS = [
  "aria-label",
  "aria-labelledby",
  "aria-valuemax",
  "aria-valuemin",
  "aria-valuenow",
  "aria-valuetext",
  "role",
] as const;

function assertProgressOwnedProps(props: Readonly<Record<string, unknown>>): void {
  for (const key of OWNED_PROGRESS_PROPS) {
    if (props[key] !== undefined) {
      throw new Error(
        `Mergora Progress owns ${key} through its visible label and native progress value model.`,
      );
    }
  }
}

export const Progress = forwardRef<HTMLProgressElement, ProgressProps>(function Progress(
  { className, formatValue, label, maximum = 100, showValue = true, value, ...progressProps },
  ref,
) {
  assertProgressOwnedProps(progressProps as Readonly<Record<string, unknown>>);
  if (!hasProgressLabel(label)) throw new Error("Mergora Progress requires a non-empty label.");
  if (!Number.isFinite(maximum) || maximum <= 0) {
    throw new RangeError("Mergora Progress maximum must be a finite number above zero.");
  }
  if (value !== undefined && (!Number.isFinite(value) || value < 0 || value > maximum)) {
    throw new RangeError("Mergora Progress value must be finite and within zero and maximum.");
  }
  if (typeof showValue !== "boolean") {
    throw new Error("Mergora Progress showValue must be a boolean when provided.");
  }
  const { getMessage, locale } = useMergoraContext();
  const generatedId = useId().replaceAll(":", "");
  const labelId = `mrg-progress-${generatedId}-label`;
  const formattedValue = showValue
    ? value === undefined
      ? getMessage("progress.indeterminate", "In progress")
      : (formatValue?.(value, maximum, locale) ??
        new Intl.NumberFormat(locale, {
          maximumFractionDigits: 0,
          style: "percent",
        }).format(value / maximum))
    : undefined;

  return (
    <label
      className={className === undefined ? "mrg-progress" : `mrg-progress ${className}`}
      data-indeterminate={value === undefined || undefined}
      data-slot="progress"
      data-value-visible={showValue || undefined}
    >
      <span data-slot="progress-heading">
        <span data-slot="progress-label" id={labelId}>
          {label}
        </span>
        {formattedValue === undefined ? null : (
          <span data-slot="progress-value">
            <bdi>{formattedValue}</bdi>
          </span>
        )}
      </span>
      <progress
        {...progressProps}
        {...(value === undefined ? {} : { value })}
        aria-labelledby={labelId}
        {...(formattedValue === undefined ? {} : { "aria-valuetext": formattedValue })}
        data-slot="progress-track"
        max={maximum}
        ref={ref}
      />
    </label>
  );
});

Progress.displayName = "Progress";
