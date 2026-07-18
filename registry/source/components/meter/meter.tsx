"use client";

import {
  Fragment,
  forwardRef,
  isValidElement,
  type MeterHTMLAttributes,
  type ReactNode,
} from "react";

import { useMergoraContext } from "../provider/index.js";
import "./meter.css";

export interface MeterProps extends Omit<
  MeterHTMLAttributes<HTMLMeterElement>,
  | "aria-label"
  | "aria-labelledby"
  | "aria-valuemax"
  | "aria-valuemin"
  | "aria-valuenow"
  | "aria-valuetext"
  | "children"
  | "className"
  | "high"
  | "low"
  | "max"
  | "min"
  | "optimum"
  | "role"
  | "value"
> {
  readonly className?: string;
  readonly formatValue?: (
    value: number,
    minimum: number,
    maximum: number,
    locale: string,
  ) => string;
  readonly high?: number;
  readonly label: ReactNode;
  readonly low?: number;
  readonly maximum?: number;
  readonly minimum?: number;
  readonly optimum?: number;
  readonly value: number;
}

function hasMeterLabel(value: ReactNode): boolean {
  if (value === null || value === undefined || typeof value === "boolean") return false;
  if (typeof value === "string") return value.trim().length > 0;
  if (Array.isArray(value)) return value.some((item) => hasMeterLabel(item));
  if (isValidElement(value) && value.type === Fragment) {
    return hasMeterLabel((value.props as { readonly children?: ReactNode }).children);
  }
  return true;
}

const OWNED_METER_PROPS = [
  "aria-label",
  "aria-labelledby",
  "aria-valuemax",
  "aria-valuemin",
  "aria-valuenow",
  "aria-valuetext",
  "role",
] as const;

function assertMeterOwnedProps(props: Readonly<Record<string, unknown>>): void {
  for (const key of OWNED_METER_PROPS) {
    if (props[key] !== undefined) {
      throw new Error(
        `Mergora Meter owns ${key} through its visible label and native meter value model.`,
      );
    }
  }
}

function optionalRangeValue(
  value: number | undefined,
  minimum: number,
  maximum: number,
  name: string,
) {
  if (value !== undefined && (!Number.isFinite(value) || value < minimum || value > maximum)) {
    throw new RangeError(`Mergora Meter ${name} must be finite and within minimum and maximum.`);
  }
}

export const Meter = forwardRef<HTMLMeterElement, MeterProps>(function Meter(
  {
    className,
    formatValue,
    high,
    label,
    low,
    maximum = 100,
    minimum = 0,
    optimum,
    value,
    ...meterProps
  },
  ref,
) {
  assertMeterOwnedProps(meterProps as Readonly<Record<string, unknown>>);
  if (!hasMeterLabel(label)) throw new Error("Mergora Meter requires a non-empty label.");
  if (!Number.isFinite(minimum) || !Number.isFinite(maximum) || minimum >= maximum) {
    throw new RangeError("Mergora Meter minimum must be finite and below maximum.");
  }
  if (!Number.isFinite(value) || value < minimum || value > maximum) {
    throw new RangeError("Mergora Meter value must be finite and within minimum and maximum.");
  }
  optionalRangeValue(low, minimum, maximum, "low");
  optionalRangeValue(high, minimum, maximum, "high");
  optionalRangeValue(optimum, minimum, maximum, "optimum");
  if (low !== undefined && high !== undefined && low > high) {
    throw new RangeError("Mergora Meter low must not exceed high.");
  }
  const { locale } = useMergoraContext();
  const formattedValue =
    formatValue?.(value, minimum, maximum, locale) ?? new Intl.NumberFormat(locale).format(value);

  return (
    <label
      className={className === undefined ? "mrg-meter" : `mrg-meter ${className}`}
      data-slot="meter"
    >
      <span data-slot="meter-heading">
        <span data-slot="meter-label">{label}</span>
        <span data-slot="meter-value">
          <bdi>{formattedValue}</bdi>
        </span>
      </span>
      <meter
        {...meterProps}
        {...(high === undefined ? {} : { high })}
        {...(low === undefined ? {} : { low })}
        {...(optimum === undefined ? {} : { optimum })}
        aria-valuetext={formattedValue}
        data-slot="meter-track"
        max={maximum}
        min={minimum}
        ref={ref}
        value={value}
      />
    </label>
  );
});

Meter.displayName = "Meter";
