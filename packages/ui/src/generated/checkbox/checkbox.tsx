// Generated from registry/source/components/checkbox/checkbox.tsx by @mergora-internal/source-transformer. Do not edit.
"use client";

import {
  forwardRef,
  Fragment,
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  isValidElement,
  type ChangeEventHandler,
  type CSSProperties,
  type ForwardedRef,
  type InputHTMLAttributes,
  type ReactNode,
} from "react";

import { mergeFieldIdRefs, useFieldControlState } from "../field/index.js";
import "./checkbox.css";

export interface CheckboxProps extends Omit<
  InputHTMLAttributes<HTMLInputElement>,
  "children" | "type"
> {
  readonly children?: ReactNode;
  readonly defaultIndeterminate?: boolean;
  readonly description?: ReactNode;
  readonly indeterminate?: boolean;
  readonly invalid?: boolean;
  readonly onCheckedChange?: (checked: boolean) => void;
  readonly rootClassName?: string;
  readonly rootStyle?: CSSProperties;
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

function isSemanticallyInvalid(
  value: InputHTMLAttributes<HTMLInputElement>["aria-invalid"],
): boolean {
  return value === true || value === "true" || value === "grammar" || value === "spelling";
}

function setForwardedRef<T>(ref: ForwardedRef<T>, value: T | null): void {
  if (typeof ref === "function") ref(value);
  else if (ref !== null) ref.current = value;
}

export const Checkbox = forwardRef<HTMLInputElement, CheckboxProps>(function Checkbox(
  {
    "aria-label": ariaLabel,
    "aria-labelledby": ariaLabelledBy,
    "aria-describedby": ariaDescribedBy,
    "aria-errormessage": ariaErrorMessage,
    "aria-invalid": ariaInvalid,
    checked,
    children,
    className,
    defaultChecked = false,
    defaultIndeterminate = false,
    description,
    disabled = false,
    form,
    id,
    indeterminate,
    invalid,
    onChange,
    onCheckedChange,
    required,
    rootClassName,
    rootStyle,
    value = "on",
    ...nativeProps
  },
  forwardedRef,
) {
  const field = useFieldControlState();
  const generatedId = useId().replaceAll(":", "");
  const inputRef = useRef<HTMLInputElement | null>(null);
  const controlledChecked = checked !== undefined;
  const controlledIndeterminate = indeterminate !== undefined;
  const [uncontrolledChecked, setUncontrolledChecked] = useState(Boolean(defaultChecked));
  const [uncontrolledIndeterminate, setUncontrolledIndeterminate] = useState(defaultIndeterminate);
  const [indeterminateRevision, setIndeterminateRevision] = useState(0);
  const resolvedChecked = controlledChecked ? Boolean(checked) : uncontrolledChecked;
  const resolvedIndeterminate = indeterminate ?? uncontrolledIndeterminate;
  const resolvedAriaInvalid =
    ariaInvalid !== undefined
      ? ariaInvalid
      : invalid !== undefined
        ? invalid || undefined
        : field?.invalid || undefined;
  const resolvedInvalid = isSemanticallyInvalid(resolvedAriaInvalid);
  const resolvedId = field?.controlId ?? id;
  const hasDescription = hasAccessibleContent(description);
  const descriptionId = hasDescription ? `mrg-checkbox-${generatedId}-description` : undefined;
  const describedBy = mergeFieldIdRefs(
    ariaDescribedBy,
    field?.descriptionId,
    resolvedInvalid ? field?.errorMessageId : undefined,
    descriptionId,
  );
  const errorMessage = mergeFieldIdRefs(
    ariaErrorMessage,
    resolvedInvalid ? field?.errorMessageId : undefined,
  );

  useLayoutEffect(() => {
    if (inputRef.current !== null) inputRef.current.indeterminate = resolvedIndeterminate;
  }, [indeterminateRevision, resolvedIndeterminate]);

  useEffect(() => {
    const form = inputRef.current?.form;
    if (form === null || form === undefined) return;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const handleReset = () => {
      timer = setTimeout(() => {
        if (!controlledChecked) setUncontrolledChecked(Boolean(defaultChecked));
        if (!controlledIndeterminate) setUncontrolledIndeterminate(defaultIndeterminate);
      }, 0);
    };
    form.addEventListener("reset", handleReset);
    return () => {
      form.removeEventListener("reset", handleReset);
      if (timer !== undefined) clearTimeout(timer);
    };
  }, [controlledChecked, controlledIndeterminate, defaultChecked, defaultIndeterminate, form]);

  useEffect(() => {
    if (!isDevelopmentRuntime()) return;
    if (field !== null && id !== undefined && id !== field.controlId) {
      console.warn(
        `Mergora Checkbox received id "${id}" inside Field; Field controlId "${field.controlId}" is authoritative.`,
      );
    }
    const input = inputRef.current;
    const internalLabel = input?.closest<HTMLLabelElement>('[data-slot="checkbox-label-root"]');
    const hasExternalNativeLabel = [...(input?.labels ?? [])].some(
      (label) =>
        label !== internalLabel &&
        (label.textContent?.trim().length !== 0 ||
          (label.getAttribute("aria-label")?.trim().length ?? 0) > 0 ||
          (label.getAttribute("aria-labelledby")?.trim().length ?? 0) > 0),
    );
    if (
      !hasAccessibleContent(children) &&
      field === null &&
      (ariaLabel === undefined || ariaLabel.trim().length === 0) &&
      (ariaLabelledBy === undefined || ariaLabelledBy.trim().length === 0) &&
      !hasExternalNativeLabel
    ) {
      console.warn(
        "Mergora Checkbox requires children, a Field label, aria-label, aria-labelledby, or an associated native label.",
      );
    }
  }, [ariaLabel, ariaLabelledBy, children, field, id]);

  const assignInput = useCallback(
    (node: HTMLInputElement | null) => {
      inputRef.current = node;
      setForwardedRef(forwardedRef, node);
    },
    [forwardedRef],
  );
  const handleChange: ChangeEventHandler<HTMLInputElement> = (event) => {
    if (!controlledChecked) setUncontrolledChecked(event.currentTarget.checked);
    if (!controlledIndeterminate) setUncontrolledIndeterminate(false);
    else setIndeterminateRevision((revision) => revision + 1);
    onCheckedChange?.(event.currentTarget.checked);
    onChange?.(event);
  };

  return (
    <span
      className={rootClassName === undefined ? "mrg-checkbox" : `mrg-checkbox ${rootClassName}`}
      data-disabled={disabled || undefined}
      data-invalid={resolvedInvalid || undefined}
      data-slot="checkbox"
      data-state={
        resolvedIndeterminate ? "indeterminate" : resolvedChecked ? "checked" : "unchecked"
      }
      style={rootStyle}
    >
      <label data-slot="checkbox-label-root">
        <input
          {...nativeProps}
          aria-label={ariaLabel}
          aria-labelledby={ariaLabelledBy}
          aria-describedby={describedBy}
          aria-errormessage={errorMessage}
          aria-invalid={resolvedAriaInvalid}
          checked={checked}
          className={className}
          data-slot="checkbox-input"
          defaultChecked={controlledChecked ? undefined : defaultChecked}
          disabled={disabled}
          form={form}
          id={resolvedId}
          onChange={handleChange}
          ref={assignInput}
          required={required ?? field?.required}
          type="checkbox"
          value={value}
        />
        <span aria-hidden="true" data-slot="checkbox-indicator" />
        {children === undefined || children === null ? null : (
          <span data-slot="checkbox-label">{children}</span>
        )}
      </label>
      {!hasDescription ? null : (
        <span data-slot="checkbox-description" id={descriptionId}>
          {description}
        </span>
      )}
    </span>
  );
});

Checkbox.displayName = "Checkbox";
