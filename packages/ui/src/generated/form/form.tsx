// Generated from registry/source/components/form/form.tsx by @mergora-internal/source-transformer. Do not edit.
import {
  Fragment,
  forwardRef,
  isValidElement,
  type FormHTMLAttributes,
  type ReactNode,
} from "react";

import "./form.css";

export type FormSubmissionStatus = {
  /** Non-empty persistent feedback rendered after the native form contents. */
  readonly message: ReactNode;
  /** Error, pending, or success state controlling semantics and visual treatment. */
  readonly state: "error" | "submitting" | "success";
};

export interface FormProps extends FormHTMLAttributes<HTMLFormElement> {
  /** Stacked or compact form spacing; defaults to `stacked`. */
  readonly layout?: "stacked" | "compact";
  /** Optional persistent submission feedback. Omit it for a plain native form. */
  readonly submissionStatus?: FormSubmissionStatus | false | null;
}

function hasAccessibleContent(value: ReactNode): boolean {
  if (value === null || value === undefined || typeof value === "boolean") return false;
  if (typeof value === "string") return value.trim().length > 0;
  if (Array.isArray(value)) return value.some(hasAccessibleContent);
  if (isValidElement<{ readonly children?: ReactNode }>(value)) {
    if (value.type === Fragment) return hasAccessibleContent(value.props.children);
    return typeof value.type === "string" ? hasAccessibleContent(value.props.children) : true;
  }
  return true;
}

export const Form = forwardRef<HTMLFormElement, FormProps>(function Form(
  {
    "aria-busy": ariaBusy,
    children,
    className,
    layout = "stacked",
    submissionStatus,
    ...nativeProps
  },
  ref,
) {
  const activeSubmissionStatus =
    submissionStatus !== null &&
    submissionStatus !== undefined &&
    submissionStatus !== false &&
    hasAccessibleContent(submissionStatus.message)
      ? submissionStatus
      : undefined;

  return (
    <form
      {...nativeProps}
      aria-busy={ariaBusy ?? (activeSubmissionStatus?.state === "submitting" || undefined)}
      className={className === undefined ? "mrg-form" : `mrg-form ${className}`}
      data-layout={layout}
      data-slot="form"
      data-submission-state={activeSubmissionStatus?.state}
      ref={ref}
    >
      {children}
      {activeSubmissionStatus === undefined ? null : (
        <output
          aria-atomic="true"
          aria-live={activeSubmissionStatus.state === "error" ? "assertive" : "polite"}
          data-slot="form-submission-status"
          data-status={activeSubmissionStatus.state}
          role={activeSubmissionStatus.state === "error" ? "alert" : "status"}
        >
          {activeSubmissionStatus.message}
        </output>
      )}
    </form>
  );
});

Form.displayName = "Form";
