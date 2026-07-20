"use client";

import {
  forwardRef,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type HTMLAttributes,
  type ReactNode,
} from "react";

import { DateField } from "../date-field/index.js";
import { addCalendarDays, inclusiveCalendarDays } from "../date-field/date-time-utils.js";
import "./date-range-picker.css";

export interface DateRangeValue {
  /** Canonical `YYYY-MM-DD` end date, or an empty string while incomplete. */
  readonly end: string;
  /** Canonical `YYYY-MM-DD` start date, or an empty string while incomplete. */
  readonly start: string;
}

export interface DateRangePreset {
  /** User-facing button label for the preset range. */
  readonly label: string;
  /** Complete or partial canonical range selected by the preset. */
  readonly value: DateRangeValue;
}

/** Identifies the ordering or inclusive-duration constraint that rejected a range. */
export type DateRangeDurationIssueReason = "maximum" | "minimum" | "order";

export interface DateRangeDurationIssue {
  /** Inclusive calendar-day count, or `null` when the dates are incomplete or out of order. */
  readonly actualDays: number | null;
  /** Configured inclusive maximum copied into the issue for recovery messaging. */
  readonly maximumDays?: number | undefined;
  /** Configured inclusive minimum copied into the issue for recovery messaging. */
  readonly minimumDays?: number | undefined;
  /** Constraint category responsible for the current invalid range. */
  readonly reason: DateRangeDurationIssueReason;
  /** Canonical range that produced the duration issue. */
  readonly value: DateRangeValue;
}

export interface DateRangePickerProps extends Omit<
  HTMLAttributes<HTMLDivElement>,
  "defaultValue" | "onChange"
> {
  /** Initial canonical range for uncontrolled use and native form reset. */
  readonly defaultValue?: DateRangeValue;
  /** Disables both native date fields and every preset action. */
  readonly disabled?: boolean;
  /** Custom inclusive-day summary content or renderer used only when the summary is enabled. */
  readonly durationSummary?: ReactNode | ((days: number, value: DateRangeValue) => ReactNode);
  /** Visible label for the end-date field. */
  readonly endLabel?: string;
  /** Native form field name used to serialize the end date. */
  readonly endName?: string;
  /** Associates both native date fields with a form by identifier. */
  readonly form?: string;
  /** Produces the linked native-validation and alert message for a duration issue. */
  readonly getDurationError?: ((issue: DateRangeDurationIssue) => string) | undefined;
  /** Latest canonical date accepted by both native date fields. */
  readonly max?: string;
  /** Positive inclusive-day maximum that constrains the end input and native validity. */
  readonly maximumDurationDays?: number | undefined;
  /** Earliest canonical date accepted by both native date fields. */
  readonly min?: string;
  /** Positive inclusive-day minimum that constrains the end input and native validity. */
  readonly minimumDurationDays?: number | undefined;
  /** Reports the active issue or `null` whenever configured duration constraints are evaluated. */
  readonly onDurationIssueChange?: ((issue: DateRangeDurationIssue | null) => void) | undefined;
  /** Reports the preset descriptor after its range has been selected. */
  readonly onPresetSelect?: (preset: DateRangePreset) => void;
  /** Reports field edits, preset selections, and native form-reset restoration. */
  readonly onValueChange?: (value: DateRangeValue) => void;
  /** Optional quick-select ranges; `false` removes their group, actions, and callbacks. */
  readonly presets?: false | readonly DateRangePreset[];
  /** Preserves focus and submission while preventing field edits and preset activation. */
  readonly readOnly?: boolean;
  /** Applies native required validation to both date fields. */
  readonly required?: boolean;
  /** Renders an inclusive calendar-day output; `false` removes the output entirely. */
  readonly showDurationSummary?: boolean;
  /** Visible label for the start-date field. */
  readonly startLabel?: string;
  /** Native form field name used to serialize the start date. */
  readonly startName?: string;
  /** Controlled canonical range; pair with `onValueChange`. */
  readonly value?: DateRangeValue;
}

const EMPTY_RANGE: DateRangeValue = Object.freeze({ end: "", start: "" });

function assertDurationBounds(minimum: number | undefined, maximum: number | undefined): void {
  for (const [label, value] of [
    ["minimumDurationDays", minimum],
    ["maximumDurationDays", maximum],
  ] as const) {
    if (value !== undefined && (!Number.isSafeInteger(value) || value < 1)) {
      throw new RangeError(`Mergora DateRangePicker ${label} must be a positive safe integer.`);
    }
  }
  if (minimum !== undefined && maximum !== undefined && minimum > maximum) {
    throw new RangeError(
      "Mergora DateRangePicker minimumDurationDays must not exceed maximumDurationDays.",
    );
  }
}

function durationIssue(
  value: DateRangeValue,
  minimum: number | undefined,
  maximum: number | undefined,
): DateRangeDurationIssue | null {
  if (minimum === undefined && maximum === undefined) return null;
  if (value.start === "" || value.end === "") return null;
  const actualDays = inclusiveCalendarDays(value.start, value.end);
  if (actualDays === null) {
    return { actualDays, maximumDays: maximum, minimumDays: minimum, reason: "order", value };
  }
  if (minimum !== undefined && actualDays < minimum) {
    return { actualDays, maximumDays: maximum, minimumDays: minimum, reason: "minimum", value };
  }
  if (maximum !== undefined && actualDays > maximum) {
    return { actualDays, maximumDays: maximum, minimumDays: minimum, reason: "maximum", value };
  }
  return null;
}

function defaultDurationError(issue: DateRangeDurationIssue): string {
  if (issue.reason === "order") return "Choose an end date on or after the start date.";
  if (issue.reason === "minimum") {
    return `Choose a range of at least ${issue.minimumDays} calendar days.`;
  }
  return `Choose a range of no more than ${issue.maximumDays} calendar days.`;
}

function laterDate(left: string | undefined, right: string | undefined): string | undefined {
  if (left === undefined || left === "") return right;
  if (right === undefined || right === "") return left;
  return left > right ? left : right;
}

function earlierDate(left: string | undefined, right: string | undefined): string | undefined {
  if (left === undefined || left === "") return right;
  if (right === undefined || right === "") return left;
  return left < right ? left : right;
}

export const DateRangePicker = forwardRef<HTMLDivElement, DateRangePickerProps>(
  function DateRangePicker(
    {
      className,
      defaultValue = EMPTY_RANGE,
      disabled = false,
      durationSummary,
      endLabel = "End date",
      endName,
      form,
      getDurationError = defaultDurationError,
      max,
      maximumDurationDays,
      min,
      minimumDurationDays,
      onDurationIssueChange,
      onPresetSelect,
      onValueChange,
      presets = false,
      readOnly = false,
      required = false,
      showDurationSummary = false,
      startLabel = "Start date",
      startName,
      value,
      ...nativeProps
    },
    ref,
  ) {
    assertDurationBounds(minimumDurationDays, maximumDurationDays);
    const controlled = value !== undefined;
    const [uncontrolledValue, setUncontrolledValue] = useState(defaultValue);
    const selected = controlled ? value : uncontrolledValue;
    const startInput = useRef<HTMLInputElement | null>(null);
    const endInput = useRef<HTMLInputElement | null>(null);
    const generatedId = useId().replaceAll(":", "");
    const latest = useRef(selected);
    latest.current = selected;
    const enabledPresets = presets === false ? [] : presets;
    const days = useMemo(
      () => (showDurationSummary ? inclusiveCalendarDays(selected.start, selected.end) : null),
      [selected, showDurationSummary],
    );
    const issue = useMemo(
      () => durationIssue(selected, minimumDurationDays, maximumDurationDays),
      [maximumDurationDays, minimumDurationDays, selected],
    );
    const issueMessage =
      issue === null ? null : getDurationError(issue).trim() || defaultDurationError(issue);
    const issueId = issueMessage === null ? undefined : `mrg-date-range-${generatedId}-duration`;
    const constraintMinimum =
      selected.start === "" || minimumDurationDays === undefined
        ? undefined
        : addCalendarDays(selected.start, minimumDurationDays - 1);
    const constraintMaximum =
      selected.start === "" || maximumDurationDays === undefined
        ? undefined
        : addCalendarDays(selected.start, maximumDurationDays - 1);
    const endMinimum = laterDate(selected.start || min, constraintMinimum);
    const endMaximum = earlierDate(max, constraintMaximum);
    const publish = (next: DateRangeValue) => {
      if (next.start === selected.start && next.end === selected.end) return;
      if (!controlled) setUncontrolledValue(next);
      onValueChange?.(next);
    };
    const summary =
      days === null
        ? null
        : typeof durationSummary === "function"
          ? durationSummary(days, selected)
          : (durationSummary ?? `${days} calendar ${days === 1 ? "day" : "days"}`);

    useEffect(() => {
      const owner = startInput.current?.form;
      if (owner === null || owner === undefined) return;
      let timer: ReturnType<typeof setTimeout> | undefined;
      const handleReset = (event: Event) => {
        timer = setTimeout(() => {
          if (
            event.defaultPrevented ||
            (latest.current.start === defaultValue.start && latest.current.end === defaultValue.end)
          ) {
            return;
          }
          if (!controlled) setUncontrolledValue(defaultValue);
          onValueChange?.(defaultValue);
        }, 0);
      };
      owner.addEventListener("reset", handleReset);
      return () => {
        owner.removeEventListener("reset", handleReset);
        if (timer !== undefined) clearTimeout(timer);
      };
    }, [controlled, defaultValue, onValueChange]);

    useEffect(() => {
      endInput.current?.setCustomValidity(issueMessage ?? "");
      if (minimumDurationDays !== undefined || maximumDurationDays !== undefined) {
        onDurationIssueChange?.(issue);
      }
    }, [issue, issueMessage, maximumDurationDays, minimumDurationDays, onDurationIssueChange]);

    return (
      <div
        {...nativeProps}
        className={
          className === undefined ? "mrg-date-range-picker" : `mrg-date-range-picker ${className}`
        }
        data-duration={summary === null ? undefined : true}
        data-duration-invalid={issue === null ? undefined : true}
        data-presets={enabledPresets.length > 0 || undefined}
        data-slot="date-range-picker"
        ref={ref}
      >
        <div data-slot="date-range-picker-fields">
          <label>
            <span>{startLabel}</span>
            <DateField
              defaultValue={selected.start}
              disabled={disabled}
              form={form}
              max={selected.end || max}
              min={min}
              name={startName}
              onValueChange={(start) =>
                publish({
                  end: selected.end !== "" && start > selected.end ? "" : selected.end,
                  start,
                })
              }
              readOnly={readOnly}
              ref={startInput}
              required={required}
              value={selected.start}
            />
          </label>
          <label>
            <span>{endLabel}</span>
            <DateField
              aria-describedby={issueId}
              aria-invalid={issue === null ? undefined : true}
              defaultValue={selected.end}
              disabled={disabled}
              form={form}
              max={endMaximum}
              min={endMinimum}
              name={endName}
              onValueChange={(end) => publish({ end, start: selected.start })}
              readOnly={readOnly}
              ref={endInput}
              required={required}
              value={selected.end}
            />
          </label>
        </div>
        {enabledPresets.length === 0 ? null : (
          <div aria-label="Date range presets" data-slot="date-range-picker-presets" role="group">
            {enabledPresets.map((preset) => (
              <button
                disabled={disabled || readOnly}
                key={preset.label}
                onClick={() => {
                  publish(preset.value);
                  onPresetSelect?.(preset);
                }}
                type="button"
              >
                {preset.label}
              </button>
            ))}
          </div>
        )}
        {summary === null ? null : (
          <output data-slot="date-range-picker-duration">{summary}</output>
        )}
        {issueMessage === null ? null : (
          <p data-slot="date-range-picker-duration-error" id={issueId} role="alert">
            {issueMessage}
          </p>
        )}
      </div>
    );
  },
);

DateRangePicker.displayName = "DateRangePicker";
