"use client";

import {
  Fragment,
  forwardRef,
  isValidElement,
  useId,
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
  /** Class name applied to the outer labelled Meter wrapper. */
  readonly className?: string;
  /** Formats visible and accessible values with the active provider locale. */
  readonly formatValue?: (
    value: number,
    minimum: number,
    maximum: number,
    locale: string,
  ) => string;
  /** Optional upper boundary within the inclusive meter range. */
  readonly high?: number;
  /** Non-empty visible content that supplies the native meter's accessible name. */
  readonly label: ReactNode;
  /** Optional lower boundary within the inclusive meter range. */
  readonly low?: number;
  /** Finite upper range boundary; defaults to 100 and must exceed `minimum`. */
  readonly maximum?: number;
  /** Finite lower range boundary; defaults to 0 and must precede `maximum`. */
  readonly minimum?: number;
  /** Optional optimum point within the inclusive meter range. */
  readonly optimum?: number;
  /** Shows configured boundaries and links them as threshold context; defaults to false. */
  readonly showThresholdSummary?: boolean;
  /** Finite current value within the inclusive minimum and maximum range. */
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
    showThresholdSummary = false,
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
  if (typeof showThresholdSummary !== "boolean") {
    throw new Error("Mergora Meter showThresholdSummary must be a boolean when provided.");
  }
  const { getMessage, locale } = useMergoraContext();
  const formatMeterValue = (candidate: number) =>
    formatValue?.(candidate, minimum, maximum, locale) ??
    new Intl.NumberFormat(locale).format(candidate);
  const formattedValue = formatMeterValue(value);
  const generatedId = useId().replaceAll(":", "");
  const summaryId = `mrg-meter-${generatedId}-thresholds`;
  const thresholdItems = showThresholdSummary
    ? [
        low === undefined ? null : { id: "low", label: getMessage("meter.low", "Low"), value: low },
        high === undefined
          ? null
          : { id: "high", label: getMessage("meter.high", "High"), value: high },
        optimum === undefined
          ? null
          : { id: "optimum", label: getMessage("meter.optimum", "Optimum"), value: optimum },
      ].filter(
        (
          item,
        ): item is {
          readonly id: "high" | "low" | "optimum";
          readonly label: string;
          readonly value: number;
        } => item !== null,
      )
    : [];
  const consumerDescribedBy = meterProps["aria-describedby"];
  const describedBy = [consumerDescribedBy, thresholdItems.length === 0 ? undefined : summaryId]
    .filter((part): part is string => typeof part === "string" && part.trim().length > 0)
    .join(" ");

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
      {thresholdItems.length === 0 ? null : (
        <span data-slot="meter-thresholds" id={summaryId}>
          {thresholdItems.map((item) => (
            <span data-slot="meter-threshold" key={item.id}>
              <span data-slot="meter-threshold-label">{item.label}</span>{" "}
              <bdi>{formatMeterValue(item.value)}</bdi>
            </span>
          ))}
        </span>
      )}
      <meter
        {...meterProps}
        {...(high === undefined ? {} : { high })}
        {...(low === undefined ? {} : { low })}
        {...(optimum === undefined ? {} : { optimum })}
        {...(describedBy.length === 0 ? {} : { "aria-describedby": describedBy })}
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
