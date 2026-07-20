// Generated from registry/source/components/time-field/time-field.tsx by @mergora-internal/source-transformer. Do not edit.
"use client";

import { forwardRef, useId, useMemo, type InputHTMLAttributes, type ReactNode } from "react";

import {
  mergeTemporalRefs,
  nativeTemporalInputProps,
  useNativeTemporalControl,
} from "../date-field/date-time-utils.js";
import "./time-field.css";

export interface TimeFieldProps extends Omit<
  InputHTMLAttributes<HTMLInputElement>,
  "defaultValue" | "onChange" | "type" | "value"
> {
  /** Initial native time value for uncontrolled use and form reset. */
  readonly defaultValue?: string;
  /** Receives the original native time-input change event after state is updated. */
  readonly onChange?: InputHTMLAttributes<HTMLInputElement>["onChange"];
  /** Reports native time edits and form-reset restoration. */
  readonly onValueChange?: (value: string) => void;
  /** Adds linked time-zone context; `false` removes its UI and accessibility output. */
  readonly showTimeZoneContext?: boolean;
  /** Custom time-zone context content or renderer used when context is enabled. */
  readonly timeZoneContext?: ReactNode | ((timeZone: string) => ReactNode);
  /** Time-zone identifier shown in context, falling back to the browser-resolved zone. */
  readonly timeZone?: string | undefined;
  /** Controlled native time value; pair with `onValueChange`. */
  readonly value?: string;
}

export const TimeField = forwardRef<HTMLInputElement, TimeFieldProps>(function TimeField(
  {
    "aria-describedby": ariaDescribedBy,
    className,
    defaultValue = "",
    onChange,
    onValueChange,
    showTimeZoneContext = false,
    timeZone,
    timeZoneContext,
    value,
    ...nativeProps
  },
  forwardedRef,
) {
  const generatedId = useId().replaceAll(":", "");
  const control = useNativeTemporalControl({ defaultValue, onChange, onValueChange, value });
  const context = useMemo(() => {
    if (!showTimeZoneContext) return null;
    const resolvedZone = timeZone ?? Intl.DateTimeFormat().resolvedOptions().timeZone;
    return typeof timeZoneContext === "function"
      ? timeZoneContext(resolvedZone)
      : (timeZoneContext ?? `Time zone: ${resolvedZone}`);
  }, [showTimeZoneContext, timeZone, timeZoneContext]);
  const contextId = context === null ? undefined : `mrg-time-field-${generatedId}-zone`;

  return (
    <span className="mrg-time-field" data-time-zone={contextId === undefined ? undefined : true}>
      <input
        {...nativeTemporalInputProps("time")}
        {...nativeProps}
        aria-describedby={[ariaDescribedBy, contextId].filter(Boolean).join(" ") || undefined}
        className={
          className === undefined ? "mrg-time-field-control" : `mrg-time-field-control ${className}`
        }
        data-slot="time-field"
        onChange={control.onChange}
        ref={mergeTemporalRefs(control.inputRef, forwardedRef)}
        type="time"
        value={control.value}
      />
      {contextId === undefined ? null : (
        <span data-slot="time-field-zone" id={contextId}>
          {context}
        </span>
      )}
    </span>
  );
});

TimeField.displayName = "TimeField";
