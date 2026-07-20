"use client";

import { forwardRef, useId, useMemo, type InputHTMLAttributes, type ReactNode } from "react";

import {
  mergeTemporalRefs,
  nativeTemporalInputProps,
  useNativeTemporalControl,
} from "../date-field/date-time-utils.js";
import "./month-picker.css";

export interface MonthPickerProps extends Omit<
  InputHTMLAttributes<HTMLInputElement>,
  "defaultValue" | "onChange" | "type" | "value"
> {
  /** Initial canonical `YYYY-MM` value for uncontrolled use and native form reset. */
  readonly defaultValue?: string;
  /** Receives the original native month-input change event after state is updated. */
  readonly onChange?: InputHTMLAttributes<HTMLInputElement>["onChange"];
  /** Reports canonical month edits and native form-reset restoration. */
  readonly onValueChange?: (value: string) => void;
  /** Custom quarter context content or renderer, falling back to quarter and year copy. */
  readonly quarterContext?: ReactNode | ((quarter: number, year: number) => ReactNode);
  /** Adds aria-described quarter context; `false` removes its UI and accessibility output. */
  readonly showQuarterContext?: boolean;
  /** Controlled canonical `YYYY-MM` value; pair with `onValueChange`. */
  readonly value?: string;
}

export const MonthPicker = forwardRef<HTMLInputElement, MonthPickerProps>(function MonthPicker(
  {
    "aria-describedby": ariaDescribedBy,
    className,
    defaultValue = "",
    onChange,
    onValueChange,
    quarterContext,
    showQuarterContext = false,
    value,
    ...nativeProps
  },
  forwardedRef,
) {
  const generatedId = useId().replaceAll(":", "");
  const control = useNativeTemporalControl({ defaultValue, onChange, onValueChange, value });
  const context = useMemo(() => {
    if (!showQuarterContext) return null;
    const match = /^(\d{4})-(\d{2})$/u.exec(control.value);
    if (match === null) return null;
    const year = Number(match[1]);
    const quarter = Math.ceil(Number(match[2]) / 3);
    return typeof quarterContext === "function"
      ? quarterContext(quarter, year)
      : (quarterContext ?? `Quarter ${quarter} of ${year}`);
  }, [control.value, quarterContext, showQuarterContext]);
  const contextId = context === null ? undefined : `mrg-month-picker-${generatedId}-quarter`;

  return (
    <span className="mrg-month-picker" data-quarter={contextId === undefined ? undefined : true}>
      <input
        {...nativeTemporalInputProps("month")}
        {...nativeProps}
        aria-describedby={[ariaDescribedBy, contextId].filter(Boolean).join(" ") || undefined}
        className={
          className === undefined
            ? "mrg-month-picker-control"
            : `mrg-month-picker-control ${className}`
        }
        data-slot="month-picker"
        onChange={control.onChange}
        ref={mergeTemporalRefs(control.inputRef, forwardedRef)}
        type="month"
        value={control.value}
      />
      {contextId === undefined ? null : (
        <span data-slot="month-picker-quarter" id={contextId}>
          {context}
        </span>
      )}
    </span>
  );
});

MonthPicker.displayName = "MonthPicker";
