// Generated from registry/source/components/toggle/toggle.tsx by @mergora-internal/source-transformer. Do not edit.
"use client";

import {
  forwardRef,
  useState,
  type ButtonHTMLAttributes,
  type MouseEventHandler,
  type ReactNode,
} from "react";

import {
  inspectButtonAccessibleName,
  reportButtonNameDiagnostic,
  runButtonActivation,
} from "../button/button-state.js";
import "./toggle.css";

export interface ToggleProps extends Omit<
  ButtonHTMLAttributes<HTMLButtonElement>,
  "aria-pressed" | "children"
> {
  /** Visible button label content and the default accessible-name source. */
  readonly children: ReactNode;
  /** Controlled pressed state reflected through aria-pressed and data-state. */
  readonly pressed?: boolean;
  /** Initial pressed state when the component is uncontrolled. */
  readonly defaultPressed?: boolean;
  /** Called with the next pressed state after a non-cancelled activation. */
  readonly onPressedChange?: (pressed: boolean) => void;
  /** Keeps the toggle focusable but busy and blocks activation; false removes pending output. */
  readonly pending?: boolean;
  /** Localizable visible and accessible label used while pending when non-empty. */
  readonly pendingLabel?: string;
}

export const Toggle = forwardRef<HTMLButtonElement, ToggleProps>(function Toggle(
  {
    "aria-label": ariaLabel,
    "aria-labelledby": ariaLabelledBy,
    children,
    className,
    defaultPressed = false,
    disabled = false,
    onClick,
    onPressedChange,
    pending = false,
    pendingLabel,
    pressed,
    title,
    type = "button",
    ...nativeProps
  },
  ref,
) {
  const [uncontrolledPressed, setUncontrolledPressed] = useState(defaultPressed);
  const isControlled = pressed !== undefined;
  const resolvedPressed = pressed ?? uncontrolledPressed;
  reportButtonNameDiagnostic(
    inspectButtonAccessibleName({
      ariaLabel,
      ariaLabelledBy,
      children,
      title,
    }),
  );
  const handleClick: MouseEventHandler<HTMLButtonElement> = (event) => {
    const result = runButtonActivation(pending, event, onClick);
    if (result === "prevented-pending" || event.defaultPrevented) return;
    const next = !resolvedPressed;
    if (!isControlled) setUncontrolledPressed(next);
    onPressedChange?.(next);
  };
  const usablePendingLabel = pendingLabel?.trim() ? pendingLabel : undefined;
  const pendingLabelIsVisible = pending && usablePendingLabel !== undefined;
  const visibleLabel = pendingLabelIsVisible ? usablePendingLabel : children;
  const renderedAriaLabel =
    pendingLabelIsVisible && ariaLabel !== undefined ? usablePendingLabel : ariaLabel;
  const renderedAriaLabelledBy = pendingLabelIsVisible ? undefined : ariaLabelledBy;

  return (
    <button
      {...nativeProps}
      aria-busy={pending || undefined}
      aria-disabled={pending || nativeProps["aria-disabled"]}
      aria-label={renderedAriaLabel}
      aria-labelledby={renderedAriaLabelledBy}
      aria-pressed={resolvedPressed}
      className={className === undefined ? "mrg-toggle" : `mrg-toggle ${className}`}
      data-pending={pending || undefined}
      data-slot="toggle"
      data-state={resolvedPressed ? "on" : "off"}
      disabled={disabled}
      onClick={handleClick}
      ref={ref}
      title={title}
      type={type}
    >
      {pending ? <span aria-hidden="true" data-slot="toggle-pending-indicator" /> : null}
      <span data-slot="toggle-label">{visibleLabel}</span>
    </button>
  );
});

Toggle.displayName = "Toggle";
Object.defineProperty(Toggle, Symbol.for("mergora-ui/toolbar-action"), { value: true });
