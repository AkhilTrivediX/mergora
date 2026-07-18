// Generated from registry/source/components/form/form.tsx by @mergora-internal/source-transformer. Do not edit.
import { forwardRef, type FormHTMLAttributes } from "react";

import "./form.css";

export interface FormProps extends FormHTMLAttributes<HTMLFormElement> {
  readonly layout?: "stacked" | "compact";
}

export const Form = forwardRef<HTMLFormElement, FormProps>(function Form(
  { className, layout = "stacked", ...nativeProps },
  ref,
) {
  return (
    <form
      {...nativeProps}
      className={className === undefined ? "mrg-form" : `mrg-form ${className}`}
      data-layout={layout}
      data-slot="form"
      ref={ref}
    />
  );
});

Form.displayName = "Form";
