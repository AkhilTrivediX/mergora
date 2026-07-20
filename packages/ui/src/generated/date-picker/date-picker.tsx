// Generated from registry/source/components/date-picker/date-picker.tsx by @mergora-internal/source-transformer. Do not edit.
"use client";

import { forwardRef, type HTMLAttributes, type InputHTMLAttributes, type Ref } from "react";

import { DateField } from "../date-field/index.js";
import { useNativeTemporalControl } from "../date-field/date-time-utils.js";
import "./date-picker.css";

export interface DatePickerPreset {
  /** User-facing button label for the preset date. */
  readonly label: string;
  /** Canonical `YYYY-MM-DD` date selected by the preset. */
  readonly value: string;
}

export interface DatePickerProps extends Omit<
  HTMLAttributes<HTMLDivElement>,
  "defaultValue" | "onChange"
> {
  /** Initial canonical `YYYY-MM-DD` value for uncontrolled use and native form reset. */
  readonly defaultValue?: string;
  /** Disables the native date field and every preset action. */
  readonly disabled?: boolean;
  /** Associates the native date field with a form by identifier. */
  readonly form?: string;
  /** Accessible name applied to the native date field. */
  readonly inputLabel?: string;
  /** Ref to the underlying native date input for focus and validity integration. */
  readonly inputRef?: Ref<HTMLInputElement>;
  /** Latest canonical date accepted by native input validation. */
  readonly max?: string;
  /** Earliest canonical date accepted by native input validation. */
  readonly min?: string;
  /** Native form field name used to serialize the canonical date. */
  readonly name?: string;
  /** Receives the original native date-input change event after internal state is updated. */
  readonly onChange?: InputHTMLAttributes<HTMLInputElement>["onChange"];
  /** Reports the preset descriptor after its value has been selected. */
  readonly onPresetSelect?: (preset: DatePickerPreset) => void;
  /** Reports native edits, preset selections, and form-reset restoration. */
  readonly onValueChange?: (value: string) => void;
  /** Optional quick-select dates; `false` removes their group, actions, and callbacks. */
  readonly presets?: false | readonly DatePickerPreset[];
  /** Preserves native focus and submission while preventing edits and preset activation. */
  readonly readOnly?: boolean;
  /** Applies native required validation to the date field. */
  readonly required?: boolean;
  /** Adds the DateField locale context; `false` removes its UI and described-by link. */
  readonly showDateContext?: boolean;
  /** Controlled canonical `YYYY-MM-DD` value; pair with `onValueChange`. */
  readonly value?: string;
}

export const DatePicker = forwardRef<HTMLDivElement, DatePickerProps>(function DatePicker(
  {
    className,
    defaultValue = "",
    disabled = false,
    form,
    inputLabel = "Choose date",
    inputRef,
    max,
    min,
    name,
    onChange,
    onPresetSelect,
    onValueChange,
    presets = false,
    readOnly = false,
    required = false,
    showDateContext = false,
    value,
    ...nativeProps
  },
  ref,
) {
  const control = useNativeTemporalControl({ defaultValue, onChange, onValueChange, value });
  const enabledPresets = presets === false ? [] : presets;
  return (
    <div
      {...nativeProps}
      className={className === undefined ? "mrg-date-picker" : `mrg-date-picker ${className}`}
      data-presets={enabledPresets.length > 0 || undefined}
      data-slot="date-picker"
      ref={ref}
    >
      <DateField
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
        showDateContext={showDateContext}
        value={control.value}
      />
      {enabledPresets.length === 0 ? null : (
        <div aria-label="Date presets" data-slot="date-picker-presets" role="group">
          {enabledPresets.map((preset) => (
            <button
              disabled={disabled || readOnly}
              key={`${preset.label}-${preset.value}`}
              onClick={() => {
                control.setValue(preset.value);
                onPresetSelect?.(preset);
              }}
              type="button"
            >
              {preset.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
});

DatePicker.displayName = "DatePicker";
