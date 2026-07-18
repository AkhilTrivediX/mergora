"use client";

import {
  forwardRef,
  Fragment,
  useCallback,
  useEffect,
  useRef,
  useState,
  isValidElement,
  type ButtonHTMLAttributes,
  type ForwardedRef,
  type MouseEventHandler,
  type ReactNode,
} from "react";

import { useMergoraMessage } from "../provider/index.js";
import "./switch.css";

export interface SwitchProps extends Omit<
  ButtonHTMLAttributes<HTMLButtonElement>,
  "aria-checked" | "children" | "defaultValue" | "name" | "role" | "type" | "value"
> {
  readonly children: ReactNode;
  readonly defaultValue?: boolean;
  readonly name?: string;
  readonly offLabel?: ReactNode;
  readonly offValue?: string;
  readonly onLabel?: ReactNode;
  readonly onValue?: string;
  readonly onValueChange?: (value: boolean) => void;
  readonly value?: boolean;
}

function setForwardedRef<T>(ref: ForwardedRef<T>, value: T | null): void {
  if (typeof ref === "function") ref(value);
  else if (ref !== null) ref.current = value;
}

interface ProcessLike {
  readonly env?: { readonly NODE_ENV?: string };
}

function isDevelopmentRuntime(): boolean {
  const viteProduction = (
    import.meta as ImportMeta & { readonly env?: { readonly PROD?: boolean } }
  ).env?.PROD;
  const runtime = globalThis as typeof globalThis & { readonly process?: ProcessLike };
  return viteProduction !== true && runtime.process?.env?.NODE_ENV !== "production";
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

function validateOptionalNonBlank(value: string | undefined, name: string): void {
  if (value !== undefined && value.trim().length === 0) {
    throw new RangeError(`Mergora Switch ${name} must not be empty or whitespace-only.`);
  }
}

export const Switch = forwardRef<HTMLButtonElement, SwitchProps>(function Switch(
  {
    "aria-label": ariaLabel,
    "aria-labelledby": ariaLabelledBy,
    children,
    className,
    defaultValue = false,
    disabled = false,
    form,
    name,
    offLabel: offLabelProp,
    offValue = "off",
    onClick,
    onLabel: onLabelProp,
    onValue = "on",
    onValueChange,
    value,
    ...nativeProps
  },
  forwardedRef,
) {
  const defaultOffLabel = useMergoraMessage("switch.off", "Off");
  const defaultOnLabel = useMergoraMessage("switch.on", "On");
  const offLabel = offLabelProp === undefined ? defaultOffLabel : offLabelProp;
  const onLabel = onLabelProp === undefined ? defaultOnLabel : onLabelProp;
  validateOptionalNonBlank(name, "name");
  validateOptionalNonBlank(form, "form");
  if (onValue === offValue) {
    throw new RangeError("Mergora Switch onValue and offValue must be distinct.");
  }
  const buttonRef = useRef<HTMLButtonElement | null>(null);
  const controlled = value !== undefined;
  const [uncontrolledValue, setUncontrolledValue] = useState(defaultValue);
  const resolvedValue = value ?? uncontrolledValue;

  useEffect(() => {
    const ownerForm = buttonRef.current?.form;
    if (ownerForm === null || ownerForm === undefined) return;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const handleReset = () => {
      timer = setTimeout(() => {
        if (!controlled) setUncontrolledValue(defaultValue);
      }, 0);
    };
    ownerForm.addEventListener("reset", handleReset);
    return () => {
      ownerForm.removeEventListener("reset", handleReset);
      if (timer !== undefined) clearTimeout(timer);
    };
  }, [controlled, defaultValue, form]);

  useEffect(() => {
    if (
      isDevelopmentRuntime() &&
      !hasAccessibleContent(children) &&
      (ariaLabel === undefined || ariaLabel.trim().length === 0) &&
      (ariaLabelledBy === undefined || ariaLabelledBy.trim().length === 0)
    ) {
      console.warn("Mergora Switch requires children, aria-label, or aria-labelledby.");
    }
    if (isDevelopmentRuntime() && !hasAccessibleContent(onLabel)) {
      console.warn("Mergora Switch requires a non-empty visible onLabel.");
    }
    if (isDevelopmentRuntime() && !hasAccessibleContent(offLabel)) {
      console.warn("Mergora Switch requires a non-empty visible offLabel.");
    }
  }, [ariaLabel, ariaLabelledBy, children, offLabel, onLabel]);

  const assignButton = useCallback(
    (node: HTMLButtonElement | null) => {
      buttonRef.current = node;
      setForwardedRef(forwardedRef, node);
    },
    [forwardedRef],
  );
  const handleClick: MouseEventHandler<HTMLButtonElement> = (event) => {
    onClick?.(event);
    if (event.defaultPrevented) return;
    const next = !resolvedValue;
    if (!controlled) setUncontrolledValue(next);
    onValueChange?.(next);
  };

  return (
    <span data-disabled={disabled || undefined} data-slot="switch-root">
      <button
        {...nativeProps}
        aria-label={ariaLabel}
        aria-labelledby={ariaLabelledBy}
        aria-checked={resolvedValue}
        className={className === undefined ? "mrg-switch" : `mrg-switch ${className}`}
        data-slot="switch"
        data-state={resolvedValue ? "on" : "off"}
        disabled={disabled}
        form={form}
        onClick={handleClick}
        ref={assignButton}
        role="switch"
        type="button"
      >
        <span aria-hidden="true" data-slot="switch-track">
          <span data-slot="switch-thumb" />
        </span>
        <span data-slot="switch-content">
          <span data-slot="switch-label">{children}</span>
          <span aria-hidden="true" data-slot="switch-state-label">
            {resolvedValue ? onLabel : offLabel}
          </span>
        </span>
      </button>
      {name === undefined ? null : (
        <input
          data-slot="switch-form-value"
          disabled={disabled}
          form={form}
          name={name}
          readOnly
          type="hidden"
          value={resolvedValue ? onValue : offValue}
        />
      )}
    </span>
  );
});

Switch.displayName = "Switch";
