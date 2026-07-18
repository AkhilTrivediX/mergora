"use client";

import {
  Children,
  Fragment,
  createContext,
  forwardRef,
  isValidElement,
  useCallback,
  useContext,
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type FieldsetHTMLAttributes,
  type ForwardedRef,
  type ReactNode,
} from "react";

import { Checkbox, type CheckboxProps } from "../checkbox/index.js";
import { mergeFieldIdRefs } from "../field/index.js";
import { useMergoraContext, type MergoraMessage } from "../provider/index.js";
import "./checkbox-group.css";

export type CheckboxGroupLayout = "stacked" | "inline" | "columns";

export interface CheckboxGroupProps extends Omit<
  FieldsetHTMLAttributes<HTMLFieldSetElement>,
  "children" | "defaultValue" | "onChange"
> {
  readonly children?: ReactNode;
  readonly constraintMessage?: string;
  readonly defaultValue?: readonly string[];
  readonly description?: ReactNode;
  readonly error?: ReactNode;
  readonly label: ReactNode;
  readonly layout?: CheckboxGroupLayout;
  readonly maxSelected?: number;
  readonly minSelected?: number;
  readonly name: string;
  readonly nativeValidationMessage?: string;
  readonly onValueChange?: (value: readonly string[]) => void;
  readonly required?: boolean;
  readonly value?: readonly string[];
}

interface CheckboxGroupContextValue {
  readonly ariaInvalid: CheckboxProps["aria-invalid"];
  readonly errorMessageId: string | undefined;
  readonly disabled: boolean;
  readonly form: string | undefined;
  readonly itemDescribedBy: string | undefined;
  readonly name: string;
  readonly selected: ReadonlySet<string>;
  readonly toggle: (value: string, checked: boolean) => void;
}

const CheckboxGroupContext = createContext<CheckboxGroupContextValue | null>(null);
const EMPTY_VALUES: readonly string[] = [];

interface CheckboxGroupItemInspection {
  readonly disabled: boolean;
  readonly value: string;
}

function inspectCheckboxGroupItems(children: ReactNode): readonly CheckboxGroupItemInspection[] {
  const items: CheckboxGroupItemInspection[] = [];
  Children.forEach(children, (child) => {
    if (!isValidElement<{ readonly children?: ReactNode }>(child)) return;
    if (child.type === Fragment) {
      items.push(...inspectCheckboxGroupItems(child.props.children));
      return;
    }
    if (child.type !== CheckboxGroupItem) return;
    const props = child.props as CheckboxGroupItemProps;
    items.push({ disabled: Boolean(props.disabled), value: props.value });
  });
  return items;
}

function validateNonBlank(value: string, name: string): void {
  if (value.trim().length === 0) {
    throw new RangeError(`Mergora CheckboxGroup ${name} must not be empty or whitespace-only.`);
  }
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

function isSemanticallyInvalid(value: CheckboxProps["aria-invalid"]): boolean {
  return value === true || value === "true" || value === "grammar" || value === "spelling";
}

const defaultMinimumMessage: MergoraMessage = ({ locale, values }) => {
  const minimum = Number(values.minimum ?? 0);
  const number = new Intl.NumberFormat(locale).format(minimum);
  const noun = new Intl.PluralRules(locale).select(minimum) === "one" ? "option" : "options";
  return `Select at least ${number} ${noun}.`;
};

const defaultMaximumMessage: MergoraMessage = ({ locale, values }) => {
  const maximum = Number(values.maximum ?? 0);
  const number = new Intl.NumberFormat(locale).format(maximum);
  const noun = new Intl.PluralRules(locale).select(maximum) === "one" ? "option" : "options";
  return `Select no more than ${number} ${noun}.`;
};

export function getCheckboxGroupConstraint(
  count: number,
  minimum: number,
  maximum: number | undefined,
): "minimum" | "maximum" | null {
  if (count < minimum) return "minimum";
  if (maximum !== undefined && count > maximum) return "maximum";
  return null;
}

function setForwardedRef<T>(ref: ForwardedRef<T>, value: T | null): void {
  if (typeof ref === "function") ref(value);
  else if (ref !== null) ref.current = value;
}

export const CheckboxGroup = forwardRef<HTMLFieldSetElement, CheckboxGroupProps>(
  function CheckboxGroup(
    {
      "aria-describedby": ariaDescribedBy,
      children,
      className,
      constraintMessage,
      defaultValue = EMPTY_VALUES,
      description,
      disabled = false,
      error,
      form,
      label,
      layout = "stacked",
      maxSelected,
      minSelected = 0,
      name,
      nativeValidationMessage,
      onValueChange,
      required = false,
      value,
      ...nativeProps
    },
    forwardedRef,
  ) {
    const generatedId = useId().replaceAll(":", "");
    const { getMessage } = useMergoraContext();
    const rootRef = useRef<HTMLFieldSetElement | null>(null);
    const defaultSelection = useMemo(() => [...new Set(defaultValue)], [defaultValue]);
    const [uncontrolledValue, setUncontrolledValue] = useState<readonly string[]>(defaultSelection);
    const controlled = value !== undefined;
    const selectedValues = controlled ? [...new Set(value)] : uncontrolledValue;
    validateNonBlank(name, "name");
    const itemInspection = inspectCheckboxGroupItems(children);
    const itemValues = new Set<string>();
    for (const item of itemInspection) {
      validateNonBlank(item.value, "item value");
      if (itemValues.has(item.value)) {
        throw new RangeError(
          `Mergora CheckboxGroup received duplicate item value "${item.value}".`,
        );
      }
      itemValues.add(item.value);
    }
    if (!Number.isFinite(minSelected) || !Number.isInteger(minSelected) || minSelected < 0) {
      throw new RangeError(
        "Mergora CheckboxGroup minSelected must be a non-negative finite integer.",
      );
    }
    if (
      maxSelected !== undefined &&
      (!Number.isFinite(maxSelected) || !Number.isInteger(maxSelected) || maxSelected < 0)
    ) {
      throw new RangeError(
        "Mergora CheckboxGroup maxSelected must be a non-negative finite integer.",
      );
    }
    const minimum = Math.max(required ? 1 : 0, minSelected);
    const maximum = maxSelected;
    if (maximum !== undefined && minimum > maximum) {
      throw new RangeError("Mergora CheckboxGroup minimum selection cannot exceed maxSelected.");
    }
    const constraintsActive = !disabled && itemInspection.some((item) => !item.disabled);
    const selectedSet = new Set(selectedValues);
    const enabledSelectedCount = itemInspection.filter(
      (item) => !item.disabled && selectedSet.has(item.value),
    ).length;
    const constraint = constraintsActive
      ? getCheckboxGroupConstraint(enabledSelectedCount, minimum, maximum)
      : null;
    const hasDescription = hasAccessibleContent(description);
    const hasError = hasAccessibleContent(error);
    const descriptionId = hasDescription
      ? `mrg-checkbox-group-${generatedId}-description`
      : undefined;
    const localizedConstraintMessage =
      constraint === null
        ? undefined
        : constraint === "minimum"
          ? getMessage("checkboxGroup.minimum", defaultMinimumMessage, { minimum })
          : getMessage("checkboxGroup.maximum", defaultMaximumMessage, {
              maximum: maximum ?? 0,
            });
    const effectiveError =
      (hasError ? error : undefined) ??
      (constraint === null ? undefined : (constraintMessage ?? localizedConstraintMessage));
    const errorId =
      effectiveError === undefined || effectiveError === null
        ? undefined
        : `mrg-checkbox-group-${generatedId}-error`;
    const computedInvalid = errorId !== undefined;
    const explicitAriaInvalid = nativeProps["aria-invalid"];
    const resolvedAriaInvalid =
      explicitAriaInvalid === undefined ? computedInvalid || undefined : explicitAriaInvalid;
    const explicitSemanticInvalid =
      explicitAriaInvalid === true ||
      explicitAriaInvalid === "true" ||
      explicitAriaInvalid === "grammar" ||
      explicitAriaInvalid === "spelling";
    const invalid = computedInvalid || explicitSemanticInvalid;
    const nativeMessage =
      constraint === null
        ? ""
        : (nativeValidationMessage ?? constraintMessage ?? localizedConstraintMessage ?? "");
    const describedBy = mergeFieldIdRefs(ariaDescribedBy, descriptionId, errorId);
    const itemDescribedBy = mergeFieldIdRefs(ariaDescribedBy, descriptionId, errorId);

    useEffect(() => {
      if (!isDevelopmentRuntime()) return;
      if (!hasAccessibleContent(label)) {
        console.warn("Mergora CheckboxGroup requires a non-empty visible label.");
      }
      if (itemInspection.length === 0) {
        console.warn("Mergora CheckboxGroup requires at least one direct CheckboxGroupItem.");
      }
      const unknownValues = selectedValues.filter((itemValue) => !itemValues.has(itemValue));
      if (unknownValues.length > 0) {
        console.warn(
          `Mergora CheckboxGroup selection contains values without direct items: ${unknownValues.join(", ")}.`,
        );
      }
    }, [itemInspection.length, label, selectedValues]);

    useLayoutEffect(() => {
      const anchor = rootRef.current?.querySelector<HTMLInputElement>(
        '[data-slot="checkbox-input"]:not(:disabled)',
      );
      anchor?.setCustomValidity(nativeMessage);
      return () => anchor?.setCustomValidity("");
    });

    useEffect(() => {
      const form = rootRef.current?.querySelector<HTMLInputElement>(
        '[data-slot="checkbox-input"]',
      )?.form;
      if (form === null || form === undefined) return;
      let timer: ReturnType<typeof setTimeout> | undefined;
      const handleReset = () => {
        timer = setTimeout(() => {
          if (!controlled) setUncontrolledValue(defaultSelection);
        }, 0);
      };
      form.addEventListener("reset", handleReset);
      return () => {
        form.removeEventListener("reset", handleReset);
        if (timer !== undefined) clearTimeout(timer);
      };
    }, [controlled, defaultSelection, form]);

    const toggle = useCallback(
      (itemValue: string, checked: boolean) => {
        const next = new Set(selectedValues);
        if (checked) next.add(itemValue);
        else next.delete(itemValue);
        const ordered = [...next];
        if (!controlled) setUncontrolledValue(ordered);
        onValueChange?.(ordered);
      },
      [controlled, onValueChange, selectedValues],
    );
    const context = useMemo<CheckboxGroupContextValue>(
      () => ({
        ariaInvalid: resolvedAriaInvalid,
        disabled,
        errorMessageId: errorId,
        form,
        itemDescribedBy,
        name,
        selected: new Set(selectedValues),
        toggle,
      }),
      [disabled, errorId, form, itemDescribedBy, name, resolvedAriaInvalid, selectedValues, toggle],
    );
    const assignRoot = useCallback(
      (node: HTMLFieldSetElement | null) => {
        rootRef.current = node;
        setForwardedRef(forwardedRef, node);
      },
      [forwardedRef],
    );

    return (
      <CheckboxGroupContext.Provider value={context}>
        <fieldset
          {...nativeProps}
          aria-describedby={describedBy}
          aria-invalid={resolvedAriaInvalid}
          className={
            className === undefined ? "mrg-checkbox-group" : `mrg-checkbox-group ${className}`
          }
          data-disabled={disabled || undefined}
          data-invalid={invalid || undefined}
          data-layout={layout}
          data-slot="checkbox-group"
          disabled={disabled}
          form={form}
          ref={assignRoot}
        >
          <legend data-slot="checkbox-group-label">{label}</legend>
          {!hasDescription ? null : (
            <p data-slot="checkbox-group-description" id={descriptionId}>
              {description}
            </p>
          )}
          <div data-slot="checkbox-group-items">{children}</div>
          {effectiveError === undefined || effectiveError === null ? null : (
            <p data-slot="checkbox-group-error" id={errorId}>
              {effectiveError}
            </p>
          )}
        </fieldset>
      </CheckboxGroupContext.Provider>
    );
  },
);

CheckboxGroup.displayName = "CheckboxGroup";

export interface CheckboxGroupItemProps extends Omit<
  CheckboxProps,
  | "checked"
  | "defaultChecked"
  | "defaultIndeterminate"
  | "indeterminate"
  | "name"
  | "onCheckedChange"
> {
  readonly value: string;
}

export const CheckboxGroupItem = forwardRef<HTMLInputElement, CheckboxGroupItemProps>(
  function CheckboxGroupItem(
    {
      "aria-describedby": ariaDescribedBy,
      "aria-invalid": ariaInvalid,
      disabled = false,
      invalid,
      value,
      ...checkboxProps
    },
    ref,
  ) {
    const context = useContext(CheckboxGroupContext);
    if (context === null) {
      throw new Error("Mergora CheckboxGroupItem requires a CheckboxGroup ancestor.");
    }
    validateNonBlank(value, "item value");
    const resolvedAriaInvalid =
      ariaInvalid !== undefined
        ? ariaInvalid
        : invalid !== undefined
          ? invalid || undefined
          : context.ariaInvalid;
    const semanticInvalid = isSemanticallyInvalid(resolvedAriaInvalid);
    return (
      <Checkbox
        {...checkboxProps}
        aria-describedby={mergeFieldIdRefs(ariaDescribedBy, context.itemDescribedBy)}
        aria-errormessage={mergeFieldIdRefs(
          checkboxProps["aria-errormessage"],
          semanticInvalid ? context.errorMessageId : undefined,
        )}
        aria-invalid={resolvedAriaInvalid}
        checked={context.selected.has(value)}
        disabled={context.disabled || disabled}
        form={checkboxProps.form ?? context.form}
        name={context.name}
        onCheckedChange={(checked) => context.toggle(value, checked)}
        ref={ref}
        value={value}
      />
    );
  },
);

CheckboxGroupItem.displayName = "CheckboxGroupItem";

export const CheckboxGroupParts = { Root: CheckboxGroup, Item: CheckboxGroupItem } as const;
