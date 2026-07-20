// Generated from registry/source/components/native-select/native-select.tsx by @mergora-internal/source-transformer. Do not edit.
"use client";

import {
  forwardRef,
  Fragment,
  isValidElement,
  useEffect,
  useId,
  type CSSProperties,
  type ReactNode,
  type SelectHTMLAttributes,
} from "react";

import { mergeFieldIdRefs, useFieldControlState } from "../field/index.js";
import "./native-select.css";

export interface NativeSelectProps extends SelectHTMLAttributes<HTMLSelectElement> {
  /** Boolean invalid fallback merged with explicit ARIA and enclosing Field state. */
  readonly invalid?: boolean;
  /** Additional class name applied to the outer NativeSelect wrapper. */
  readonly rootClassName?: string;
  /** Inline style applied to the outer NativeSelect wrapper. */
  readonly rootStyle?: CSSProperties;
  /** Optional context for the current selection, associated through aria-describedby. */
  readonly selectionContext?: ReactNode;
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
  value: SelectHTMLAttributes<HTMLSelectElement>["aria-invalid"],
): boolean {
  return value === true || value === "true" || value === "grammar" || value === "spelling";
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

export const NativeSelect = forwardRef<HTMLSelectElement, NativeSelectProps>(function NativeSelect(
  {
    "aria-describedby": ariaDescribedBy,
    "aria-errormessage": ariaErrorMessage,
    "aria-invalid": ariaInvalid,
    className,
    disabled = false,
    id,
    invalid,
    multiple = false,
    required,
    rootClassName,
    rootStyle,
    selectionContext,
    size,
    ...nativeProps
  },
  ref,
) {
  const field = useFieldControlState();
  const generatedId = useId().replaceAll(":", "");
  const resolvedAriaInvalid =
    ariaInvalid !== undefined
      ? ariaInvalid
      : invalid !== undefined
        ? invalid || undefined
        : field?.invalid || undefined;
  const resolvedInvalid = isSemanticallyInvalid(resolvedAriaInvalid);
  const resolvedId = field?.controlId ?? id;
  const listboxPresentation = multiple || (size !== undefined && size > 1);
  const hasSelectionContext = hasAccessibleContent(selectionContext);
  const selectionContextId = hasSelectionContext
    ? `${resolvedId ?? `mrg-native-select-${generatedId}`}-selection-context`
    : undefined;
  const describedBy = mergeFieldIdRefs(
    ariaDescribedBy,
    field?.descriptionId,
    resolvedInvalid ? field?.errorMessageId : undefined,
    selectionContextId,
  );
  const errorMessage = mergeFieldIdRefs(
    ariaErrorMessage,
    resolvedInvalid ? field?.errorMessageId : undefined,
  );

  useEffect(() => {
    if (isDevelopmentRuntime() && field !== null && id !== undefined && id !== field.controlId) {
      console.warn(
        `Mergora NativeSelect received id "${id}" inside Field; Field controlId "${field.controlId}" is authoritative.`,
      );
    }
  }, [field, id]);

  return (
    <span
      className={
        rootClassName === undefined ? "mrg-native-select" : `mrg-native-select ${rootClassName}`
      }
      data-disabled={disabled || undefined}
      data-invalid={resolvedInvalid || undefined}
      data-listbox={listboxPresentation || undefined}
      data-multiple={multiple || undefined}
      data-selection-context={hasSelectionContext || undefined}
      data-slot="native-select-root"
      style={rootStyle}
    >
      <select
        {...nativeProps}
        aria-describedby={describedBy}
        aria-errormessage={errorMessage}
        aria-invalid={resolvedAriaInvalid}
        className={
          className === undefined
            ? "mrg-native-select-control"
            : `mrg-native-select-control ${className}`
        }
        data-slot="native-select"
        disabled={disabled}
        id={resolvedId}
        multiple={multiple}
        ref={ref}
        required={required ?? field?.required}
        size={size}
      />
      {listboxPresentation ? null : (
        <span aria-hidden="true" data-slot="native-select-indicator">
          ▾
        </span>
      )}
      {!hasSelectionContext ? null : (
        <span data-slot="native-select-selection-context" id={selectionContextId}>
          {selectionContext}
        </span>
      )}
    </span>
  );
});

NativeSelect.displayName = "NativeSelect";
