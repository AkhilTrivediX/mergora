"use client";

import { forwardRef, useId, useMemo, type InputHTMLAttributes, type ReactNode } from "react";

import {
  formatCanonicalDate,
  mergeTemporalRefs,
  nativeTemporalInputProps,
  useNativeTemporalControl,
} from "./date-time-utils.js";
import "./date-field.css";

export interface DateFieldProps extends Omit<
  InputHTMLAttributes<HTMLInputElement>,
  "defaultValue" | "onChange" | "type" | "value"
> {
  /** Initial canonical `YYYY-MM-DD` value for uncontrolled use and native form reset. */
  readonly defaultValue?: string;
  /** Locale used by the built-in long-form date context formatter. */
  readonly locale?: string;
  /** Receives the original native date-input change event after internal state is updated. */
  readonly onChange?: InputHTMLAttributes<HTMLInputElement>["onChange"];
  /** Reports canonical date edits and native form-reset restoration. */
  readonly onValueChange?: (value: string) => void;
  /** Adds an aria-described date context; `false` removes its UI and accessibility output. */
  readonly showDateContext?: boolean;
  /** Custom date context content or renderer, falling back to locale-formatted context when omitted. */
  readonly dateContext?: ReactNode | ((canonicalValue: string) => ReactNode);
  /** Controlled canonical `YYYY-MM-DD` value; pair with `onValueChange`. */
  readonly value?: string;
}

function hasContent(value: ReactNode): boolean {
  return value !== null && value !== undefined && value !== false && value !== "";
}

export const DateField = forwardRef<HTMLInputElement, DateFieldProps>(function DateField(
  {
    "aria-describedby": ariaDescribedBy,
    className,
    dateContext,
    defaultValue = "",
    locale = "en-US",
    onChange,
    onValueChange,
    showDateContext = false,
    value,
    ...nativeProps
  },
  forwardedRef,
) {
  const generatedId = useId().replaceAll(":", "");
  const control = useNativeTemporalControl({ defaultValue, onChange, onValueChange, value });
  const context = useMemo(() => {
    if (!showDateContext || control.value === "") return null;
    if (typeof dateContext === "function") return dateContext(control.value);
    if (hasContent(dateContext)) return dateContext;
    return formatCanonicalDate(control.value, locale);
  }, [control.value, dateContext, locale, showDateContext]);
  const contextId = context === null ? undefined : `mrg-date-field-${generatedId}-context`;

  return (
    <span className="mrg-date-field" data-context={contextId === undefined ? undefined : true}>
      <input
        {...nativeTemporalInputProps("date")}
        {...nativeProps}
        aria-describedby={[ariaDescribedBy, contextId].filter(Boolean).join(" ") || undefined}
        className={
          className === undefined ? "mrg-date-field-control" : `mrg-date-field-control ${className}`
        }
        data-slot="date-field"
        onChange={control.onChange}
        ref={mergeTemporalRefs(control.inputRef, forwardedRef)}
        type="date"
        value={control.value}
      />
      {contextId === undefined ? null : (
        <span data-slot="date-field-context" id={contextId}>
          {context}
        </span>
      )}
    </span>
  );
});

DateField.displayName = "DateField";
