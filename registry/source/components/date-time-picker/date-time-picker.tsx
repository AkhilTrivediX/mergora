"use client";

import { forwardRef, type HTMLAttributes, type InputHTMLAttributes, type Ref } from "react";

import {
  DateTimeField,
  type DateTimeAmbiguityPolicy,
  type DateTimeWallTimeAdapter,
  type DateTimeWallTimeStatus,
} from "../date-time-field/index.js";
import { useNativeTemporalControl } from "../date-field/date-time-utils.js";
import "./date-time-picker.css";

export interface DateTimePickerPreset {
  /** User-facing button label for the preset local date and time. */
  readonly label: string;
  /** Native `datetime-local` value selected by the preset. */
  readonly value: string;
}

export interface DateTimePickerProps extends Omit<
  HTMLAttributes<HTMLDivElement>,
  "defaultValue" | "onChange"
> {
  /** Chooses the earlier or later occurrence of repeated wall time, or rejects it. */
  readonly ambiguityPolicy?: DateTimeAmbiguityPolicy;
  /** Initial native local date-time value for uncontrolled use and form reset. */
  readonly defaultValue?: string;
  /** Disables the native date-time field and every preset action. */
  readonly disabled?: boolean;
  /** Associates the local and resolved native fields with a form by identifier. */
  readonly form?: string;
  /** Accessible name applied to the native date-time field. */
  readonly inputLabel?: string;
  /** Ref to the underlying native datetime-local input for focus and validity integration. */
  readonly inputRef?: Ref<HTMLInputElement>;
  /** Produces the linked live status and native custom-validity message for a resolution. */
  readonly getWallTimeMessage?: ((status: DateTimeWallTimeStatus) => string) | undefined;
  /** Latest local date-time accepted by native input validation. */
  readonly max?: string;
  /** Earliest local date-time accepted by native input validation. */
  readonly min?: string;
  /** Native form field name used to serialize the local date-time value. */
  readonly name?: string;
  /** Receives the original native datetime-local change event after state is updated. */
  readonly onChange?: InputHTMLAttributes<HTMLInputElement>["onChange"];
  /** Reports the preset descriptor after its local date-time has been selected. */
  readonly onPresetSelect?: (preset: DateTimePickerPreset) => void;
  /** Reports native edits, preset selections, and form-reset restoration. */
  readonly onValueChange?: (value: string) => void;
  /** Reports normalized wall-time status, including `null` for an empty enabled field. */
  readonly onWallTimeResolutionChange?:
    ((status: DateTimeWallTimeStatus | null) => void) | undefined;
  /** Optional quick selections; `false` removes their group, actions, and callbacks. */
  readonly presets?: false | readonly DateTimePickerPreset[];
  /** Preserves native focus and submission while preventing edits and preset activation. */
  readonly readOnly?: boolean;
  /** Native form field name for the hidden resolved instant, present only while resolution is valid. */
  readonly resolvedName?: string | undefined;
  /** Applies native required validation to the local date-time field. */
  readonly required?: boolean;
  /** Adds linked time-zone context; `false` removes its UI and accessibility output. */
  readonly showTimeZoneContext?: boolean;
  /** Explicit time zone for context and required wall-time adapter resolution. */
  readonly timeZone?: string | undefined;
  /** Controlled native local date-time value; pair with `onValueChange`. */
  readonly value?: string;
  /** Optional wall-time resolver; `false` removes validation, status, callbacks, and resolved output. */
  readonly wallTimeAdapter?: false | DateTimeWallTimeAdapter;
}

export const DateTimePicker = forwardRef<HTMLDivElement, DateTimePickerProps>(
  function DateTimePicker(
    {
      ambiguityPolicy = "reject",
      className,
      defaultValue = "",
      disabled = false,
      form,
      inputLabel = "Choose date and time",
      inputRef,
      getWallTimeMessage,
      max,
      min,
      name,
      onChange,
      onPresetSelect,
      onValueChange,
      onWallTimeResolutionChange,
      presets = false,
      readOnly = false,
      resolvedName,
      required = false,
      showTimeZoneContext = false,
      timeZone,
      value,
      wallTimeAdapter = false,
      ...nativeProps
    },
    ref,
  ) {
    const control = useNativeTemporalControl({ defaultValue, onChange, onValueChange, value });
    const enabledPresets = presets === false ? [] : presets;
    return (
      <div
        {...nativeProps}
        className={
          className === undefined ? "mrg-date-time-picker" : `mrg-date-time-picker ${className}`
        }
        data-presets={enabledPresets.length > 0 || undefined}
        data-slot="date-time-picker"
        ref={ref}
      >
        <DateTimeField
          ambiguityPolicy={ambiguityPolicy}
          aria-label={inputLabel}
          defaultValue={defaultValue}
          disabled={disabled}
          form={form}
          getWallTimeMessage={getWallTimeMessage}
          max={max}
          min={min}
          name={name}
          onChange={onChange}
          onValueChange={control.setValue}
          onWallTimeResolutionChange={onWallTimeResolutionChange}
          readOnly={readOnly}
          ref={inputRef}
          resolvedName={resolvedName}
          required={required}
          showTimeZoneContext={showTimeZoneContext}
          timeZone={timeZone}
          value={control.value}
          wallTimeAdapter={wallTimeAdapter}
        />
        {enabledPresets.length === 0 ? null : (
          <div aria-label="Date and time presets" data-slot="date-time-picker-presets" role="group">
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
  },
);

DateTimePicker.displayName = "DateTimePicker";
