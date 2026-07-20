// Generated from registry/source/components/year-picker/year-picker.tsx by @mergora-internal/source-transformer. Do not edit.
"use client";

import {
  forwardRef,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type ReactNode,
  type SelectHTMLAttributes,
} from "react";

import { mergeTemporalRefs } from "../date-field/date-time-utils.js";
import "./year-picker.css";

export interface YearPickerVisibleRange {
  /** Inclusive last year rendered in the current controlled window. */
  readonly endYear: number;
  /** Inclusive first year rendered in the current controlled window. */
  readonly startYear: number;
}

/** Direction requested by a year-window navigation action. */
export type YearPickerWindowDirection = "next" | "previous";

export interface YearPickerProps extends Omit<
  SelectHTMLAttributes<HTMLSelectElement>,
  "defaultValue" | "onChange" | "value"
> {
  /** Initial selected year, or `null`, for uncontrolled use and native form reset. */
  readonly defaultValue?: number | null;
  /** Inclusive safe-integer upper bound for available years. */
  readonly maxYear?: number;
  /** Inclusive safe-integer lower bound for available years. */
  readonly minYear?: number;
  /** Accessible label for the button requesting a later visible window. */
  readonly nextWindowLabel?: string;
  /** Receives the original native select change event after internal state is updated. */
  readonly onChange?: SelectHTMLAttributes<HTMLSelectElement>["onChange"];
  /** Requests the next controlled window and reports its navigation direction. */
  readonly onVisibleRangeChange?:
    ((range: YearPickerVisibleRange, direction: YearPickerWindowDirection) => void) | undefined;
  /** Reports year selection changes and native form-reset restoration. */
  readonly onValueChange?: (value: number | null) => void;
  /** Accessible label for the button requesting an earlier visible window. */
  readonly previousWindowLabel?: string;
  /** Custom available-range context or renderer used only when the summary is enabled. */
  readonly rangeSummary?: ReactNode | ((minimum: number, maximum: number) => ReactNode);
  /** Adds aria-described range context; `false` removes its UI and accessibility output. */
  readonly showRangeSummary?: boolean;
  /** Controlled selected year, or `null`; pair with `onValueChange`. */
  readonly value?: number | null;
  /** Controlled subset of years plus navigation, or `false` to render the complete bounded list. */
  readonly visibleRange?: false | YearPickerVisibleRange;
  /** Accessible name for the previous/next window navigation group. */
  readonly windowGroupLabel?: string;
}

function assertYearRange(
  minimum: number,
  maximum: number,
  visibleRange: false | YearPickerVisibleRange,
): void {
  if (!Number.isSafeInteger(minimum) || !Number.isSafeInteger(maximum) || maximum < minimum) {
    throw new RangeError(
      "Mergora YearPicker requires an integer minYear not greater than maxYear.",
    );
  }
  if (visibleRange === false && maximum - minimum > 5000) {
    throw new RangeError(
      "Mergora YearPicker supports at most 5,001 years in one native collection.",
    );
  }
  if (
    visibleRange !== false &&
    (!Number.isSafeInteger(visibleRange.startYear) ||
      !Number.isSafeInteger(visibleRange.endYear) ||
      visibleRange.endYear < visibleRange.startYear ||
      visibleRange.startYear < minimum ||
      visibleRange.endYear > maximum)
  ) {
    throw new RangeError(
      "Mergora YearPicker visibleRange must be an ordered safe-integer range inside minYear and maxYear.",
    );
  }
  if (visibleRange !== false && visibleRange.endYear - visibleRange.startYear > 5000) {
    throw new RangeError(
      "Mergora YearPicker visibleRange supports at most 5,001 years in one native collection.",
    );
  }
}

function nextVisibleRange(
  current: YearPickerVisibleRange,
  direction: YearPickerWindowDirection,
  minimum: number,
  maximum: number,
): YearPickerVisibleRange {
  const width = current.endYear - current.startYear;
  if (direction === "previous") {
    const startYear = Math.max(minimum, current.startYear - width - 1);
    return { endYear: Math.min(maximum, startYear + width), startYear };
  }
  const endYear = Math.min(maximum, current.endYear + width + 1);
  return { endYear, startYear: Math.max(minimum, endYear - width) };
}

export const YearPicker = forwardRef<HTMLSelectElement, YearPickerProps>(function YearPicker(
  {
    "aria-describedby": ariaDescribedBy,
    "aria-label": ariaLabel = "Choose year",
    className,
    defaultValue = null,
    disabled = false,
    maxYear = new Date().getFullYear() + 50,
    minYear = new Date().getFullYear() - 50,
    nextWindowLabel = "Show later years",
    onChange,
    onVisibleRangeChange,
    onValueChange,
    previousWindowLabel = "Show earlier years",
    rangeSummary,
    required = false,
    showRangeSummary = false,
    value,
    visibleRange = false,
    windowGroupLabel = "Year range navigation",
    ...nativeProps
  },
  forwardedRef,
) {
  assertYearRange(minYear, maxYear, visibleRange);
  const controlled = value !== undefined;
  const [uncontrolledValue, setUncontrolledValue] = useState(defaultValue);
  const selected = controlled ? value : uncontrolledValue;
  const select = useRef<HTMLSelectElement | null>(null);
  const latest = useRef(selected);
  latest.current = selected;
  const generatedId = useId().replaceAll(":", "");
  const renderedRange =
    visibleRange === false ? { endYear: maxYear, startYear: minYear } : visibleRange;
  const windowed = visibleRange !== false;
  const years = useMemo(() => {
    const withinWindow = Array.from(
      { length: renderedRange.endYear - renderedRange.startYear + 1 },
      (_, index) => renderedRange.startYear + index,
    );
    return selected !== null &&
      selected >= minYear &&
      selected <= maxYear &&
      (selected < renderedRange.startYear || selected > renderedRange.endYear)
      ? [...withinWindow, selected].sort((left, right) => left - right)
      : withinWindow;
  }, [maxYear, minYear, renderedRange.endYear, renderedRange.startYear, selected]);
  const summary = showRangeSummary
    ? typeof rangeSummary === "function"
      ? rangeSummary(minYear, maxYear)
      : (rangeSummary ??
        (windowed
          ? `Showing ${renderedRange.startYear} through ${renderedRange.endYear} from ${minYear} through ${maxYear}`
          : `${years.length} years available, ${minYear} through ${maxYear}`))
    : null;
  const summaryId = summary === null ? undefined : `mrg-year-picker-${generatedId}-range`;

  useEffect(() => {
    const form = select.current?.form;
    if (form === null || form === undefined) return;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const handleReset = (event: Event) => {
      timer = setTimeout(() => {
        if (event.defaultPrevented || latest.current === defaultValue) return;
        if (!controlled) setUncontrolledValue(defaultValue);
        onValueChange?.(defaultValue);
      }, 0);
    };
    form.addEventListener("reset", handleReset);
    return () => {
      form.removeEventListener("reset", handleReset);
      if (timer !== undefined) clearTimeout(timer);
    };
  }, [controlled, defaultValue, onValueChange]);

  return (
    <span
      className="mrg-year-picker"
      data-range-summary={summaryId === undefined ? undefined : true}
      data-windowed={windowed || undefined}
    >
      <select
        {...nativeProps}
        aria-describedby={[ariaDescribedBy, summaryId].filter(Boolean).join(" ") || undefined}
        aria-label={ariaLabel}
        className={
          className === undefined
            ? "mrg-year-picker-control"
            : `mrg-year-picker-control ${className}`
        }
        data-slot="year-picker"
        disabled={disabled}
        onChange={(event) => {
          const next = event.currentTarget.value === "" ? null : Number(event.currentTarget.value);
          if (!controlled) setUncontrolledValue(next);
          onChange?.(event);
          onValueChange?.(next);
        }}
        ref={mergeTemporalRefs((node) => {
          select.current = node;
        }, forwardedRef)}
        required={required}
        value={selected ?? ""}
      >
        <option value="">Select a year</option>
        {years.map((year) => (
          <option key={year} value={year}>
            {year}
          </option>
        ))}
      </select>
      {visibleRange === false ? null : (
        <span aria-label={windowGroupLabel} data-slot="year-picker-window" role="group">
          <button
            aria-label={previousWindowLabel}
            data-slot="year-picker-window-previous"
            disabled={
              disabled || onVisibleRangeChange === undefined || visibleRange.startYear === minYear
            }
            onClick={() =>
              onVisibleRangeChange?.(
                nextVisibleRange(visibleRange, "previous", minYear, maxYear),
                "previous",
              )
            }
            type="button"
          >
            <span aria-hidden="true">{"\u2039"}</span>
          </button>
          <span aria-live="polite" data-slot="year-picker-window-label">
            {visibleRange.startYear}
            {"\u2013"}
            {visibleRange.endYear}
          </span>
          <button
            aria-label={nextWindowLabel}
            data-slot="year-picker-window-next"
            disabled={
              disabled || onVisibleRangeChange === undefined || visibleRange.endYear === maxYear
            }
            onClick={() =>
              onVisibleRangeChange?.(
                nextVisibleRange(visibleRange, "next", minYear, maxYear),
                "next",
              )
            }
            type="button"
          >
            <span aria-hidden="true">{"\u203a"}</span>
          </button>
        </span>
      )}
      {summaryId === undefined ? null : (
        <span data-slot="year-picker-range" id={summaryId}>
          {summary}
        </span>
      )}
    </span>
  );
});

YearPicker.displayName = "YearPicker";
