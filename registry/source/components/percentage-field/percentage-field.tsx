"use client";

import { forwardRef } from "react";

import { NumericFieldBase, type NumberFieldProps } from "../number-field/number-field.js";
import "./percentage-field.css";

export type PercentageFieldFormatOptions = Omit<
  Intl.NumberFormatOptions,
  "maximumFractionDigits" | "style"
>;

export interface PercentageFieldProps extends Omit<
  NumberFieldProps,
  "formatOptions" | "precision"
> {
  readonly formatOptions?: PercentageFieldFormatOptions;
  /** Maximum fraction digits in the displayed percentage. */
  readonly precision?: number;
}

/**
 * PercentageField uses fractional canonical values: 0.125 is displayed as 12.5% and serialized
 * as 0.125. This deliberately matches Intl percent semantics and avoids an ambiguous hidden scale.
 */
export const PercentageField = forwardRef<HTMLDivElement, PercentageFieldProps>(
  function PercentageField(
    { formatOptions, maxValue = 1, minValue = 0, precision = 2, step = 0.01, ...numberFieldProps },
    ref,
  ) {
    return (
      <NumericFieldBase
        {...numberFieldProps}
        formatOptions={{
          minimumFractionDigits: 0,
          ...formatOptions,
          maximumFractionDigits: precision,
          style: "percent",
        }}
        kind="percentage"
        maxValue={maxValue}
        minValue={minValue}
        precision={precision}
        ref={ref}
        step={step}
        valueScale="fraction"
      />
    );
  },
);

PercentageField.displayName = "PercentageField";
