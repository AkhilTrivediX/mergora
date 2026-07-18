"use client";

import {
  Children,
  Fragment,
  forwardRef,
  isValidElement,
  useEffect,
  type CSSProperties,
  type InputHTMLAttributes,
  type ReactNode,
} from "react";

import { mergeFieldIdRefs, useFieldControlState } from "../field/index.js";
import "./input.css";

export interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  readonly endAdornment?: ReactNode;
  readonly invalid?: boolean;
  readonly rootClassName?: string;
  readonly rootStyle?: CSSProperties;
  readonly startAdornment?: ReactNode;
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
    disabled = false,
    endAdornment,
    id,
    invalid,
    required,
    rootClassName,
    rootStyle,
    startAdornment,
    type = "text",
    ...nativeProps
  },
  ref,
) {
  const field = useFieldControlState();
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
  const resolvedId = field?.controlId ?? id;
  const describedBy = mergeFieldIdRefs(
    ariaDescribedBy,
    field?.descriptionId,
    resolvedInvalid ? field?.errorMessageId : undefined,
  );
  const errorMessage = mergeFieldIdRefs(
    ariaErrorMessage,
    resolvedInvalid ? field?.errorMessageId : undefined,
  );

  useEffect(() => {
    if (isDevelopmentRuntime() && field !== null && id !== undefined && id !== field.controlId) {
      console.warn(
        `Mergora Input received id "${id}" inside Field; Field controlId "${field.controlId}" is authoritative.`,
      );
    }
  }, [field, id]);

  return (
    <span
      className={rootClassName === undefined ? "mrg-input" : `mrg-input ${rootClassName}`}
      data-disabled={disabled || undefined}
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
        disabled={disabled}
        id={resolvedId}
        ref={ref}
        required={resolvedRequired}
        type={type}
      />
      {endAdornment === undefined || endAdornment === null ? null : (
        <span aria-hidden="true" data-slot="input-end-adornment">
          {endAdornment}
        </span>
      )}
    </span>
  );
});

Input.displayName = "Input";
