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
} from "../button/button-state.js";
import type { ButtonVariant } from "../button/button.js";
import "./icon-button.css";

export type IconButtonSize = "medium" | "large";

export interface IconButtonProps extends Omit<
  ButtonHTMLAttributes<HTMLButtonElement>,
  "aria-label" | "children"
> {
  /** A required, localizable accessible name. Empty strings receive the Button diagnostic. */
  readonly label: string;
  /** Decorative icon content. SVG icons should use aria-hidden=true. */
  readonly children: ReactNode;
  /** Optional native tooltip text; this never replaces the required accessible name. */
  readonly tooltip?: string;
  readonly pending?: boolean;
  readonly pendingLabel?: string;
  readonly size?: IconButtonSize;
  readonly variant?: ButtonVariant;
}

function joinClassName(className: string | undefined): string {
  return className === undefined || className.trim().length === 0
    ? "mrg-icon-button"
    : `mrg-icon-button ${className}`;
}

export const IconButton = forwardRef<HTMLButtonElement, IconButtonProps>(function IconButton(
  {
    children,
    className,
    disabled = false,
    label,
    onClick,
    pending = false,
    pendingLabel,
    size = "medium",
    title,
    tooltip,
    type = "button",
    variant = "secondary",
    ...nativeProps
  },
  ref,
) {
  reportButtonNameDiagnostic(inspectButtonAccessibleName({ ariaLabel: label }));
  const usablePendingLabel = pendingLabel?.trim() ? pendingLabel : undefined;
  const accessibleLabel = pending && usablePendingLabel !== undefined ? usablePendingLabel : label;
  const handleClick: MouseEventHandler<HTMLButtonElement> | undefined =
    pending || onClick !== undefined
      ? (event) => {
          runButtonActivation(pending, event, onClick);
        }
      : undefined;

  return (
    <button
      {...nativeProps}
      aria-busy={pending || undefined}
      aria-disabled={pending || nativeProps["aria-disabled"]}
      aria-label={accessibleLabel}
      className={joinClassName(className)}
      data-disabled={disabled || undefined}
      data-pending={pending || undefined}
      data-size={size}
      data-slot="icon-button"
      data-variant={variant}
      disabled={disabled}
      onClick={handleClick}
      ref={ref}
      title={tooltip ?? title}
      type={type}
    >
      {pending ? (
        <span aria-hidden="true" data-slot="icon-button-pending-indicator" />
      ) : (
        <span aria-hidden="true" data-slot="icon-button-icon">
          {children}
        </span>
      )}
    </button>
  );
});

IconButton.displayName = "IconButton";
Object.defineProperty(IconButton, Symbol.for("mergora-ui/toolbar-action"), { value: true });
