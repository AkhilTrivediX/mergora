// Generated from registry/source/components/fieldset/fieldset.tsx by @mergora-internal/source-transformer. Do not edit.
"use client";

import {
  forwardRef,
  Fragment,
  isValidElement,
  useEffect,
  useId,
  type FieldsetHTMLAttributes,
  type ReactNode,
} from "react";

import { mergeFieldIdRefs } from "../field/index.js";
import "./fieldset.css";

export type FieldsetLayout = "stacked" | "columns" | "inline";

export interface FieldsetProps extends Omit<
  FieldsetHTMLAttributes<HTMLFieldSetElement>,
  "children"
> {
  /** Native fieldset content rendered after description and before status text. */
  readonly children?: ReactNode;
  /** Optional persistent group help text included in `aria-describedby`. */
  readonly description?: ReactNode;
  /** Optional persistent group error included in the invalid description chain. */
  readonly error?: ReactNode;
  /** Stacked, column, or inline visual arrangement; defaults to `stacked`. */
  readonly layout?: FieldsetLayout;
  /** Non-empty first-child native legend that names the fieldset. */
  readonly legend: ReactNode;
  /** Optional persistent context such as the current selection count. */
  readonly selectionSummary?: ReactNode;
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

export const Fieldset = forwardRef<HTMLFieldSetElement, FieldsetProps>(function Fieldset(
  {
    "aria-describedby": ariaDescribedBy,
    children,
    className,
    description,
    disabled = false,
    error,
    layout = "stacked",
    legend,
    selectionSummary,
    ...nativeProps
  },
  ref,
) {
  const generatedId = useId().replaceAll(":", "");
  const hasDescription = hasAccessibleContent(description);
  const hasError = hasAccessibleContent(error);
  const hasSelectionSummary = hasAccessibleContent(selectionSummary);
  const descriptionId = hasDescription ? `mrg-fieldset-${generatedId}-description` : undefined;
  const errorId = hasError ? `mrg-fieldset-${generatedId}-error` : undefined;
  const summaryId = hasSelectionSummary
    ? `mrg-fieldset-${generatedId}-selection-summary`
    : undefined;
  const describedBy = mergeFieldIdRefs(ariaDescribedBy, descriptionId, summaryId, errorId);
  const explicitAriaInvalid = nativeProps["aria-invalid"];
  const resolvedAriaInvalid =
    explicitAriaInvalid === undefined ? hasError || undefined : explicitAriaInvalid;
  const semanticInvalid =
    hasError ||
    explicitAriaInvalid === true ||
    explicitAriaInvalid === "true" ||
    explicitAriaInvalid === "grammar" ||
    explicitAriaInvalid === "spelling";

  useEffect(() => {
    if (isDevelopmentRuntime() && !hasAccessibleContent(legend)) {
      console.warn("Mergora Fieldset requires a non-empty visible legend.");
    }
  }, [legend]);

  return (
    <fieldset
      {...nativeProps}
      aria-describedby={describedBy}
      aria-invalid={resolvedAriaInvalid}
      className={className === undefined ? "mrg-fieldset" : `mrg-fieldset ${className}`}
      data-disabled={disabled || undefined}
      data-invalid={semanticInvalid || undefined}
      data-layout={layout}
      data-slot="fieldset"
      disabled={disabled}
      ref={ref}
    >
      <legend data-slot="fieldset-legend">{legend}</legend>
      {!hasDescription ? null : (
        <p data-slot="fieldset-description" id={descriptionId}>
          {description}
        </p>
      )}
      <div data-slot="fieldset-content">{children}</div>
      {!hasSelectionSummary ? null : (
        <p data-slot="fieldset-selection-summary" id={summaryId}>
          {selectionSummary}
        </p>
      )}
      {!hasError ? null : (
        <p data-slot="fieldset-error" id={errorId}>
          {error}
        </p>
      )}
    </fieldset>
  );
});

Fieldset.displayName = "Fieldset";
