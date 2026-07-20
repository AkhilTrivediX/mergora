// Generated from registry/source/components/stat/stat.tsx by @mergora-internal/source-transformer. Do not edit.
import "./stat.css";

import { forwardRef, type HTMLAttributes, type ReactNode } from "react";

export interface StatComparison {
  /** Supplies the finite prior value used to calculate directional change. */
  readonly previous: number;
  /** Names the prior period or reference used in the comparison sentence. */
  readonly label: string;
}

export interface StatProps extends Omit<HTMLAttributes<HTMLDListElement>, "children"> {
  /** Names the statistic through native description-list semantics. */
  readonly label: ReactNode;
  /** Supplies the canonical numeric statistic. */
  readonly value: number;
  /** Overrides the runtime locale used for values and percentages. */
  readonly locale?: string;
  /** Customizes locale-aware value formatting without changing the canonical number. */
  readonly formatOptions?: Intl.NumberFormatOptions;
  /** Adds optional domain-neutral explanation after the value and comparison. */
  readonly context?: ReactNode;
  /** Adds directional change context; false removes comparison UI and calculation. */
  readonly comparison?: false | StatComparison;
}

function classes(...values: readonly (string | undefined | false)[]): string {
  return values.filter((value): value is string => Boolean(value)).join(" ");
}

export function getStatChange(
  value: number,
  previous: number,
): {
  readonly direction: "increase" | "decrease" | "unchanged" | "unavailable";
  readonly ratio: number | null;
} {
  if (!Number.isFinite(value) || !Number.isFinite(previous) || previous === 0)
    return { direction: "unavailable", ratio: null };
  const ratio = (value - previous) / Math.abs(previous);
  return { direction: ratio > 0 ? "increase" : ratio < 0 ? "decrease" : "unchanged", ratio };
}

export const Stat = forwardRef<HTMLDListElement, StatProps>(function Stat(
  { label, value, locale, formatOptions, context, comparison = false, className, ...props },
  ref,
) {
  const formatter = new Intl.NumberFormat(locale, formatOptions);
  const change = comparison === false ? null : getStatChange(value, comparison.previous);
  const percentFormatter = new Intl.NumberFormat(locale, {
    style: "percent",
    maximumFractionDigits: 1,
  });
  const changeText =
    change === null
      ? null
      : change.ratio === null
        ? `Comparison unavailable for ${comparison === false ? "previous value" : comparison.label}`
        : `${change.direction === "increase" ? "↑" : change.direction === "decrease" ? "↓" : "→"} ${percentFormatter.format(Math.abs(change.ratio))} ${change.direction} compared with ${comparison === false ? "previous value" : comparison.label}`;
  return (
    <dl
      {...props}
      ref={ref}
      className={classes("mrg-stat", className)}
      data-slot="stat"
      data-change={change?.direction}
    >
      <dt className="mrg-stat__label">{label}</dt>
      <dd className="mrg-stat__value">{formatter.format(value)}</dd>
      {changeText ? (
        <dd className="mrg-stat__change" data-slot="stat-comparison">
          {changeText}
        </dd>
      ) : null}
      {context ? <dd className="mrg-stat__context">{context}</dd> : null}
    </dl>
  );
});
