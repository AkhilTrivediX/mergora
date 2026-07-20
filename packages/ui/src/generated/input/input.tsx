// Generated from registry/source/components/input/input.tsx by @mergora-internal/source-transformer. Do not edit.
"use client";

import {
  Children,
  Fragment,
  forwardRef,
  isValidElement,
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
  type ChangeEvent,
  type CSSProperties,
  type InputHTMLAttributes,
  type ReactNode,
  type Ref,
} from "react";

import { mergeFieldIdRefs, useFieldControlState } from "../field/index.js";
import "./input.css";

export interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  /** Adds an explicit value-clearing action while preserving the native input. */
  readonly clearable?: boolean;
  /** Non-empty localized accessible label for the optional clear button. */
  readonly clearLabel?: string;
  /** Decorative, non-focusable content rendered after the native input. */
  readonly endAdornment?: ReactNode;
  /** Boolean invalid fallback merged with explicit ARIA and enclosing Field state. */
  readonly invalid?: boolean;
  /** Called after the clear action dispatches the native bubbling input event. */
  readonly onClear?: () => void;
  /** Additional class name applied to the outer Input wrapper. */
  readonly rootClassName?: string;
  /** Inline style applied to the outer Input wrapper. */
  readonly rootStyle?: CSSProperties;
  /** Decorative, non-focusable content rendered before the native input. */
  readonly startAdornment?: ReactNode;
}

function assignRef<T>(ref: Ref<T> | undefined, value: T | null): void {
  if (typeof ref === "function") ref(value);
  else if (ref !== null && ref !== undefined) ref.current = value;
}

function hasInputValue(value: InputHTMLAttributes<HTMLInputElement>["value"]): boolean {
  if (value === undefined || value === null) return false;
  return Array.isArray(value) ? value.length > 0 : String(value).length > 0;
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

function isSemanticallyInvalid(
  value: InputHTMLAttributes<HTMLInputElement>["aria-invalid"],
): boolean {
  return value === true || value === "true" || value === "grammar" || value === "spelling";
}

const interactiveAdornmentTags = new Set([
  "button",
  "details",
  "input",
  "select",
  "summary",
  "textarea",
]);

const clearableInputTypes = new Set([
  "date",
  "datetime-local",
  "email",
  "file",
  "month",
  "number",
  "password",
  "search",
  "tel",
  "text",
  "time",
  "url",
  "week",
]);

function assertDecorativeAdornment(value: ReactNode, name: string): void {
  Children.forEach(value, (child) => {
    if (!isValidElement<Record<string, unknown>>(child)) return;
    if (child.type === Fragment) {
      assertDecorativeAdornment(child.props.children as ReactNode, name);
      return;
    }
    if (typeof child.type === "string") {
      const tag = child.type;
      const role = child.props.role;
      const interactiveRole =
        typeof role === "string" &&
        [
          "button",
          "checkbox",
          "combobox",
          "link",
          "menuitem",
          "radio",
          "switch",
          "textbox",
        ].includes(role);
      const hasInteractiveHandler = Object.entries(child.props).some(
        ([propName, propValue]) =>
          typeof propValue === "function" &&
          /^(?:onClick|onKey|onMouse|onPointer|onTouch)/u.test(propName),
      );
      const interactive =
        interactiveAdornmentTags.has(tag) ||
        (tag === "a" && child.props.href !== undefined) ||
        child.props.tabIndex !== undefined ||
        child.props.contentEditable === true ||
        child.props.contentEditable === "true" ||
        hasInteractiveHandler ||
        interactiveRole;
      if (interactive) {
        throw new Error(
          `Mergora Input ${name} is aria-hidden and must contain decorative, non-focusable content only.`,
        );
      }
    }
    assertDecorativeAdornment(child.props.children as ReactNode, name);
  });
}

export const Input = forwardRef<HTMLInputElement, InputProps>(function Input(
  {
    "aria-describedby": ariaDescribedBy,
    "aria-errormessage": ariaErrorMessage,
    "aria-invalid": ariaInvalid,
    className,
    clearable = false,
    clearLabel = "Clear value",
    defaultValue,
    disabled = false,
    endAdornment,
    form,
    id,
    invalid,
    onChange,
    onClear,
    readOnly = false,
    required,
    rootClassName,
    rootStyle,
    startAdornment,
    type = "text",
    value,
    ...nativeProps
  },
  forwardedRef,
) {
  const field = useFieldControlState();
  const generatedId = useId().replaceAll(":", "");
  const inputRef = useRef<HTMLInputElement | null>(null);
  const resetTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const controlled = value !== undefined;
  const [uncontrolledHasValue, setUncontrolledHasValue] = useState(() =>
    hasInputValue(defaultValue),
  );
  const valuePresent = controlled ? hasInputValue(value) : uncontrolledHasValue;
  if (clearable && !clearableInputTypes.has(type)) {
    throw new RangeError(`Mergora Input clearable is not supported for type="${type}".`);
  }
  if (clearable && clearLabel.trim().length === 0) {
    throw new RangeError("Mergora Input clearLabel must not be empty or whitespace-only.");
  }
  assertDecorativeAdornment(startAdornment, "startAdornment");
  assertDecorativeAdornment(endAdornment, "endAdornment");
  const resolvedAriaInvalid =
    ariaInvalid !== undefined
      ? ariaInvalid
      : invalid !== undefined
        ? invalid || undefined
        : field?.invalid || undefined;
  const resolvedInvalid = isSemanticallyInvalid(resolvedAriaInvalid);
  const resolvedRequired = required ?? field?.required;
  const resolvedId = field?.controlId ?? id ?? (clearable ? `mrg-input-${generatedId}` : undefined);
  const describedBy = mergeFieldIdRefs(
    ariaDescribedBy,
    field?.descriptionId,
    resolvedInvalid ? field?.errorMessageId : undefined,
  );
  const errorMessage = mergeFieldIdRefs(
    ariaErrorMessage,
    resolvedInvalid ? field?.errorMessageId : undefined,
  );
  const setInputRef = useCallback(
    (node: HTMLInputElement | null) => {
      inputRef.current = node;
      assignRef(forwardedRef, node);
    },
    [forwardedRef],
  );

  useEffect(() => {
    const input = inputRef.current;
    if (!clearable || controlled || input === null || input.form === null) return;
    const ownedForm = input.form;
    const handleReset = (event: Event) => {
      if (resetTimer.current !== null) clearTimeout(resetTimer.current);
      resetTimer.current = setTimeout(() => {
        if (!event.defaultPrevented) setUncontrolledHasValue(input.value.length > 0);
      }, 0);
    };
    ownedForm.addEventListener("reset", handleReset);
    return () => {
      ownedForm.removeEventListener("reset", handleReset);
      if (resetTimer.current !== null) clearTimeout(resetTimer.current);
    };
  }, [clearable, controlled, form]);

  useEffect(() => {
    if (isDevelopmentRuntime() && field !== null && id !== undefined && id !== field.controlId) {
      console.warn(
        `Mergora Input received id "${id}" inside Field; Field controlId "${field.controlId}" is authoritative.`,
      );
    }
  }, [field, id]);

  const clear = (): void => {
    const input = inputRef.current;
    if (input === null || disabled || readOnly || !valuePresent) return;
    const valueSetter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
    valueSetter?.call(input, "");
    if (!controlled) setUncontrolledHasValue(false);
    input.dispatchEvent(new Event("input", { bubbles: true }));
    onClear?.();
    input.focus({ preventScroll: true });
  };

  return (
    <span
      className={rootClassName === undefined ? "mrg-input" : `mrg-input ${rootClassName}`}
      data-clearable={clearable || undefined}
      data-disabled={disabled || undefined}
      data-empty={clearable && !valuePresent ? "true" : undefined}
      data-invalid={resolvedInvalid || undefined}
      data-slot="input-root"
      style={rootStyle}
    >
      {startAdornment === undefined || startAdornment === null ? null : (
        <span aria-hidden="true" data-slot="input-start-adornment">
          {startAdornment}
        </span>
      )}
      <input
        {...nativeProps}
        aria-describedby={describedBy}
        aria-errormessage={errorMessage}
        aria-invalid={resolvedAriaInvalid}
        className={className === undefined ? "mrg-input-control" : `mrg-input-control ${className}`}
        data-slot="input"
        defaultValue={defaultValue}
        disabled={disabled}
        form={form}
        id={resolvedId}
        onChange={
          clearable
            ? (event: ChangeEvent<HTMLInputElement>) => {
                if (!controlled) setUncontrolledHasValue(event.currentTarget.value.length > 0);
                onChange?.(event);
              }
            : onChange
        }
        readOnly={readOnly}
        ref={clearable ? setInputRef : forwardedRef}
        required={resolvedRequired}
        type={type}
        value={value}
      />
      {endAdornment === undefined || endAdornment === null ? null : (
        <span aria-hidden="true" data-slot="input-end-adornment">
          {endAdornment}
        </span>
      )}
      {!clearable ? null : (
        <button
          aria-controls={resolvedId}
          aria-label={clearLabel}
          className="mrg-input-clear"
          data-slot="input-clear"
          disabled={disabled || readOnly || !valuePresent}
          onClick={clear}
          type="button"
        >
          <span aria-hidden="true">×</span>
        </button>
      )}
    </span>
  );
});

Input.displayName = "Input";
