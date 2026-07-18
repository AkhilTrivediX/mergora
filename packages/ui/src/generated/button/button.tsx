// Generated from registry/source/components/button/button.tsx by @mergora-internal/source-transformer. Do not edit.
import {
  forwardRef,
  type ButtonHTMLAttributes,
  type MouseEventHandler,
  type ReactNode,
} from "react";

import {
  inspectButtonAccessibleName,
  reportButtonNameDiagnostic,
  runButtonActivation,
} from "./button-state.js";
import "./button.css";

export type ButtonVariant = "primary" | "secondary" | "quiet" | "destructive";
export type ButtonSize = "small" | "medium" | "large";

export interface ButtonOwnProps {
  /** Visual intent. This does not change the native button role. */
  readonly variant?: ButtonVariant;
  /** Intrinsic minimum size. Touch input raises every size to at least 44 CSS pixels. */
  readonly size?: ButtonSize;
  /** Keeps the button focusable while exposing busy/disabled semantics and blocking activation. */
  readonly pending?: boolean;
  /** Visible replacement text while pending. When omitted, the original children remain visible. */
  readonly pendingLabel?: string;
}

export interface ButtonProps
  extends ButtonOwnProps, Omit<ButtonHTMLAttributes<HTMLButtonElement>, keyof ButtonOwnProps> {
  readonly children?: ReactNode;
}

function joinClassNames(componentClassName: string, consumerClassName: string | undefined): string {
  return consumerClassName === undefined || consumerClassName.trim().length === 0
    ? componentClassName
    : `${componentClassName} ${consumerClassName}`;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  {
    "aria-busy": ariaBusy,
    "aria-disabled": ariaDisabled,
    "aria-label": ariaLabel,
    "aria-labelledby": ariaLabelledBy,
    children,
    className,
    disabled = false,
    onClick,
    pending = false,
    pendingLabel,
    size = "medium",
    type = "button",
    variant = "primary",
    ...nativeProps
  },
  ref,
) {
  reportButtonNameDiagnostic(
    inspectButtonAccessibleName({
      ariaLabel,
      ariaLabelledBy,
      children,
      title: nativeProps.title,
    }),
  );

  const handleClick: MouseEventHandler<HTMLButtonElement> | undefined =
    pending || onClick !== undefined
      ? (event) => {
          runButtonActivation(pending, event, onClick);
        }
      : undefined;
  const usablePendingLabel =
    pendingLabel !== undefined && pendingLabel.trim().length > 0 ? pendingLabel : undefined;
  const pendingLabelIsVisible = pending && usablePendingLabel !== undefined;
  const renderedAriaLabel =
    pendingLabelIsVisible && ariaLabel !== undefined ? usablePendingLabel : ariaLabel;
  const renderedAriaLabelledBy = pendingLabelIsVisible ? undefined : ariaLabelledBy;

  return (
    <button
      {...nativeProps}
      aria-busy={pending ? true : ariaBusy}
      aria-disabled={pending ? true : ariaDisabled}
      aria-label={renderedAriaLabel}
      aria-labelledby={renderedAriaLabelledBy}
      className={joinClassNames("mrg-button", className)}
      data-disabled={disabled ? "true" : undefined}
      data-pending={pending ? "true" : undefined}
      data-size={size}
      data-slot="button"
      data-variant={variant}
      disabled={disabled}
      onClick={handleClick}
      ref={ref}
      type={type}
    >
      {pending ? <span aria-hidden="true" data-slot="button-pending-indicator" /> : null}
      <span data-slot="button-label">{pendingLabelIsVisible ? usablePendingLabel : children}</span>
    </button>
  );
});

Button.displayName = "Button";
Object.defineProperty(Button, Symbol.for("mergora-ui/toolbar-action"), { value: true });
