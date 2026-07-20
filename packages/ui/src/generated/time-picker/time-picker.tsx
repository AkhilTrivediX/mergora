// Generated from registry/source/components/time-picker/time-picker.tsx by @mergora-internal/source-transformer. Do not edit.
"use client";

import { forwardRef, type HTMLAttributes, type InputHTMLAttributes, type Ref } from "react";

import { useNativeTemporalControl } from "../date-field/date-time-utils.js";
import { TimeField } from "../time-field/index.js";
import "./time-picker.css";

export interface TimePickerInterval {
  /** User-facing button label for the available time. */
  readonly label: string;
  /** Native time value selected by the interval action. */
  readonly value: string;
}

export interface TimePickerProps extends Omit<
  HTMLAttributes<HTMLDivElement>,
  "defaultValue" | "onChange"
> {
  /** Initial native time value for uncontrolled use and form reset. */
  readonly defaultValue?: string;
  /** Disables the native time field and every interval action. */
  readonly disabled?: boolean;
  /** Associates the native time field with a form by identifier. */
  readonly form?: string;
  /** Accessible name applied to the native time field. */
  readonly inputLabel?: string;
  /** Ref to the underlying native time input for focus and validity integration. */
  readonly inputRef?: Ref<HTMLInputElement>;
  /** Optional aria-pressed quick selections; `false` removes their group and callbacks. */
  readonly intervals?: false | readonly TimePickerInterval[];
  /** Latest time accepted by native input validation. */
  readonly max?: string;
  /** Earliest time accepted by native input validation. */
  readonly min?: string;
  /** Native form field name used to serialize the selected time. */
  readonly name?: string;
  /** Receives the original native time-input change event after state is updated. */
  readonly onChange?: InputHTMLAttributes<HTMLInputElement>["onChange"];
  /** Reports the interval descriptor after its time has been selected. */
  readonly onIntervalSelect?: (interval: TimePickerInterval) => void;
  /** Reports native edits, interval selections, and form-reset restoration. */
  readonly onValueChange?: (value: string) => void;
  /** Preserves native focus and submission while preventing edits and interval activation. */
  readonly readOnly?: boolean;
  /** Applies native required validation to the time field. */
  readonly required?: boolean;
  /** Adds linked time-zone context; `false` removes its UI and accessibility output. */
  readonly showTimeZoneContext?: boolean;
  /** Time-zone identifier shown in context, falling back to the browser-resolved zone. */
  readonly timeZone?: string | undefined;
  /** Controlled native time value; pair with `onValueChange`. */
  readonly value?: string;
}

export const TimePicker = forwardRef<HTMLDivElement, TimePickerProps>(function TimePicker(
  {
    className,
    defaultValue = "",
    disabled = false,
    form,
    inputLabel = "Choose time",
    inputRef,
    intervals = false,
    max,
    min,
    name,
    onChange,
    onIntervalSelect,
    onValueChange,
    readOnly = false,
    required = false,
    showTimeZoneContext = false,
    timeZone,
    value,
    ...nativeProps
  },
  ref,
) {
  const control = useNativeTemporalControl({ defaultValue, onChange, onValueChange, value });
  const enabledIntervals = intervals === false ? [] : intervals;
  return (
    <div
      {...nativeProps}
      className={className === undefined ? "mrg-time-picker" : `mrg-time-picker ${className}`}
      data-intervals={enabledIntervals.length > 0 || undefined}
      data-slot="time-picker"
      ref={ref}
    >
      <TimeField
        aria-label={inputLabel}
        defaultValue={defaultValue}
        disabled={disabled}
        form={form}
        max={max}
        min={min}
        name={name}
        onChange={onChange}
        onValueChange={control.setValue}
        readOnly={readOnly}
        ref={inputRef}
        required={required}
        showTimeZoneContext={showTimeZoneContext}
        timeZone={timeZone}
        value={control.value}
      />
      {enabledIntervals.length === 0 ? null : (
        <div aria-label="Available times" data-slot="time-picker-intervals" role="group">
          {enabledIntervals.map((interval) => (
            <button
              aria-pressed={control.value === interval.value}
              disabled={disabled || readOnly}
              key={`${interval.label}-${interval.value}`}
              onClick={() => {
                control.setValue(interval.value);
                onIntervalSelect?.(interval);
              }}
              type="button"
            >
              {interval.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
});

TimePicker.displayName = "TimePicker";
