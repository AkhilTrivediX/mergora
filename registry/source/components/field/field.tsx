"use client";

import {
  Children,
  Fragment,
  createContext,
  forwardRef,
  isValidElement,
  useContext,
  useEffect,
  useId,
  type HTMLAttributes,
  type ReactNode,
} from "react";

import "./field.css";

export type FieldLayout = "stacked" | "inline";

export interface FieldProps extends Omit<HTMLAttributes<HTMLDivElement>, "children"> {
  /** One primary labelled control rendered inside the Field control slot. */
  readonly children: ReactNode;
  /** Optional label-aligned recovery action; empty or omitted content removes the action slot. */
  readonly contextualAction?: ReactNode;
  /** Stable ID assigned to the primary control; generated when omitted. */
  readonly controlId?: string;
  /** Optional persistent help content linked to the primary control. */
  readonly description?: ReactNode;
  /** Optional persistent error content that marks the Field context invalid. */
  readonly error?: ReactNode;
  /** Non-empty visible label associated with the primary control. */
  readonly label: ReactNode;
  /** Stacked or inline visual arrangement; defaults to `stacked`. */
  readonly layout?: FieldLayout;
  /** Visible localized optional marker shown only when `required` is false. */
  readonly optionalLabel?: ReactNode;
  /** Supplies required state to integrated controls; defaults to false. */
  readonly required?: boolean;
  /** Decorative visible required marker; defaults to an asterisk. */
  readonly requiredIndicator?: ReactNode;
}

export interface FieldControlState {
  /** Authoritative native id assigned to the integrated primary control. */
  readonly controlId: string;
  /** Id of visible label content naming the primary control. */
  readonly labelId: string;
  /** Id of persistent help content, or undefined when no description renders. */
  readonly descriptionId: string | undefined;
  /** Space-separated description and error ids for aria-describedby. */
  readonly describedBy: string | undefined;
  /** Id of persistent error content, or undefined when no error renders. */
  readonly errorMessageId: string | undefined;
  /** Whether error content currently marks the integrated control invalid. */
  readonly invalid: boolean;
  /** Required state inherited by integrated field controls. */
  readonly required: boolean;
}

const FieldContext = createContext<FieldControlState | null>(null);

interface ProcessLike {
  /** Optional runtime environment used only to gate development diagnostics. */
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

function countConcreteChildren(value: ReactNode): number {
  let count = 0;
  Children.forEach(value, (child) => {
    if (isValidElement<{ readonly children?: ReactNode }>(child) && child.type === Fragment) {
      count += countConcreteChildren(child.props.children);
    } else if (child !== null && child !== undefined && typeof child !== "boolean") {
      count += 1;
    }
  });
  return count;
}

export function mergeFieldIdRefs(...values: ReadonlyArray<string | undefined>): string | undefined {
  const ids = new Set<string>();
  for (const value of values) {
    for (const id of value?.trim().split(/\s+/u) ?? []) {
      if (id.length > 0) ids.add(id);
    }
  }
  return ids.size > 0 ? [...ids].join(" ") : undefined;
}

export function useFieldControlState(): FieldControlState | null {
  return useContext(FieldContext);
}

export const Field = forwardRef<HTMLDivElement, FieldProps>(function Field(
  {
    children,
    className,
    contextualAction,
    controlId,
    description,
    error,
    label,
    layout = "stacked",
    optionalLabel,
    required = false,
    requiredIndicator = "*",
    ...nativeProps
  },
  ref,
) {
  const generatedId = useId();
  if (controlId !== undefined && controlId.trim().length === 0) {
    throw new RangeError("Mergora Field controlId must not be empty or whitespace-only.");
  }
  const idStem = controlId ?? `mrg-field-${generatedId.replaceAll(":", "")}`;
  const labelId = `${idStem}-label`;
  const hasDescription = hasAccessibleContent(description);
  const hasError = hasAccessibleContent(error);
  const hasContextualAction = hasAccessibleContent(contextualAction);
  const descriptionId = hasDescription ? `${idStem}-description` : undefined;
  const errorId = hasError ? `${idStem}-error` : undefined;
  const invalid = hasError;
  const directControlCount = countConcreteChildren(children);

  useEffect(() => {
    if (!isDevelopmentRuntime()) return;
    if (!hasAccessibleContent(label)) {
      console.warn("Mergora Field requires a non-empty visible label.");
    }
    if (directControlCount !== 1) {
      console.warn(
        `Mergora Field expects one direct primary control; received ${directControlCount}. Use separate Field instances for additional controls.`,
      );
    }
  }, [directControlCount, label]);
  const context: FieldControlState = {
    controlId: idStem,
    labelId,
    descriptionId,
    describedBy: mergeFieldIdRefs(descriptionId, errorId),
    errorMessageId: errorId,
    invalid,
    required,
  };

  return (
    <FieldContext.Provider value={context}>
      <div
        {...nativeProps}
        className={className === undefined ? "mrg-field" : `mrg-field ${className}`}
        data-contextual-action={hasContextualAction || undefined}
        data-invalid={invalid || undefined}
        data-layout={layout}
        data-required={required || undefined}
        data-slot="field"
        ref={ref}
      >
        <label data-slot="field-label" htmlFor={idStem} id={labelId}>
          <span>{label}</span>
          {required ? (
            <span aria-hidden="true" data-slot="field-required-indicator">
              {requiredIndicator}
            </span>
          ) : optionalLabel === undefined ? null : (
            <span data-slot="field-optional-label">{optionalLabel}</span>
          )}
        </label>
        {!hasContextualAction ? null : (
          <div data-slot="field-contextual-action">{contextualAction}</div>
        )}
        {!hasDescription ? null : (
          <p data-slot="field-description" id={descriptionId}>
            {description}
          </p>
        )}
        <div data-slot="field-control">{children}</div>
        {!hasError ? null : (
          <p data-slot="field-error" id={errorId}>
            {error}
          </p>
        )}
      </div>
    </FieldContext.Provider>
  );
});

Field.displayName = "Field";
