// Generated from registry/source/components/radio-group/radio-group.tsx by @mergora-internal/source-transformer. Do not edit.
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
  useMemo,
  useRef,
  useState,
  type FieldsetHTMLAttributes,
  type ForwardedRef,
  type InputHTMLAttributes,
  type KeyboardEventHandler,
  type ReactNode,
  type CSSProperties,
} from "react";

import { mergeFieldIdRefs } from "../field/index.js";
import "./radio-group.css";

export type RadioGroupLayout = "stacked" | "inline" | "columns";
export type RadioGroupDirection = "ltr" | "rtl";

export interface RadioGroupProps extends Omit<
  FieldsetHTMLAttributes<HTMLFieldSetElement>,
  "children" | "defaultValue" | "onChange"
> {
  /** Direct RadioGroupItem controls rendered inside the native fieldset. */
  readonly children?: ReactNode;
  /** Initial selected item value for uncontrolled use. */
  readonly defaultValue?: string;
  /** Optional persistent group help text linked to every item. */
  readonly description?: ReactNode;
  /** Keyboard direction for horizontal arrows; inherited from document direction when omitted. */
  readonly direction?: RadioGroupDirection;
  /** Optional persistent group error that marks every item invalid. */
  readonly error?: ReactNode;
  /** Non-empty visible native legend naming the radio group. */
  readonly label: ReactNode;
  /** Stacked, inline, or column visual arrangement; defaults to `stacked`. */
  readonly layout?: RadioGroupLayout;
  /** Non-empty shared native form name assigned to every radio item. */
  readonly name: string;
  /** Receives proposed controlled or committed uncontrolled selection changes. */
  readonly onValueChange?: (value: string) => void;
  /** Applies native required validation to the radio group. */
  readonly required?: boolean;
  /** Controlled selected item value; changes are proposed through `onValueChange`. */
  readonly value?: string;
}

interface RadioGroupContextValue {
  readonly ariaInvalid: InputHTMLAttributes<HTMLInputElement>["aria-invalid"];
  readonly descriptionId: string | undefined;
  readonly disabled: boolean;
  readonly errorMessageId: string | undefined;
  readonly form: string | undefined;
  readonly name: string;
  readonly required: boolean;
  readonly select: (value: string) => void;
  readonly selected: string | undefined;
}

const RadioGroupContext = createContext<RadioGroupContextValue | null>(null);

interface RadioGroupItemInspection {
  readonly value: string;
}

function inspectRadioGroupItems(children: ReactNode): readonly RadioGroupItemInspection[] {
  const items: RadioGroupItemInspection[] = [];
  Children.forEach(children, (child) => {
    if (!isValidElement<{ readonly children?: ReactNode }>(child)) return;
    if (child.type === Fragment) {
      items.push(...inspectRadioGroupItems(child.props.children));
      return;
    }
    if (child.type !== RadioGroupItem) return;
    const props = child.props as RadioGroupItemProps;
    items.push({ value: props.value });
  });
  return items;
}

function validateNonBlank(value: string, name: string): void {
  if (value.trim().length === 0) {
    throw new RangeError(`Mergora RadioGroup ${name} must not be empty or whitespace-only.`);
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

function isSemanticallyInvalid(
  value: InputHTMLAttributes<HTMLInputElement>["aria-invalid"],
): boolean {
  return value === true || value === "true" || value === "grammar" || value === "spelling";
}

export function resolveRadioGroupIndex(input: {
  readonly current: number;
  readonly direction: RadioGroupDirection;
  readonly itemCount: number;
  readonly key: string;
}): number | null {
  const { current, direction, itemCount, key } = input;
  if (itemCount <= 0 || current < 0) return null;
  if (key === "Home") return 0;
  if (key === "End") return itemCount - 1;
  let delta = 0;
  if (key === "ArrowDown") delta = 1;
  else if (key === "ArrowUp") delta = -1;
  else if (key === "ArrowRight") delta = direction === "rtl" ? -1 : 1;
  else if (key === "ArrowLeft") delta = direction === "rtl" ? 1 : -1;
  return delta === 0 ? null : (current + delta + itemCount) % itemCount;
}

function setForwardedRef<T>(ref: ForwardedRef<T>, value: T | null): void {
  if (typeof ref === "function") ref(value);
  else if (ref !== null) ref.current = value;
}

export const RadioGroup = forwardRef<HTMLFieldSetElement, RadioGroupProps>(function RadioGroup(
  {
    "aria-describedby": ariaDescribedBy,
    children,
    className,
    defaultValue,
    description,
    direction,
    disabled = false,
    error,
    form,
    label,
    layout = "stacked",
    name,
    onValueChange,
    required = false,
    value,
    ...nativeProps
  },
  forwardedRef,
) {
  const generatedId = useId().replaceAll(":", "");
  const rootRef = useRef<HTMLFieldSetElement | null>(null);
  const controlled = value !== undefined;
  const [uncontrolledValue, setUncontrolledValue] = useState(defaultValue);
  const selected = controlled ? value : uncontrolledValue;
  validateNonBlank(name, "name");
  const itemInspection = inspectRadioGroupItems(children);
  const itemValues = new Set<string>();
  for (const item of itemInspection) {
    validateNonBlank(item.value, "item value");
    if (itemValues.has(item.value)) {
      throw new RangeError(`Mergora RadioGroup received duplicate item value "${item.value}".`);
    }
    itemValues.add(item.value);
  }
  const hasDescription = hasAccessibleContent(description);
  const hasError = hasAccessibleContent(error);
  const descriptionId = hasDescription ? `mrg-radio-group-${generatedId}-description` : undefined;
  const errorId = hasError ? `mrg-radio-group-${generatedId}-error` : undefined;
  const describedBy = mergeFieldIdRefs(ariaDescribedBy, descriptionId, errorId);
  const explicitAriaInvalid = nativeProps["aria-invalid"];
  const resolvedAriaInvalid =
    explicitAriaInvalid === undefined ? hasError || undefined : explicitAriaInvalid;
  const invalid = hasError || isSemanticallyInvalid(explicitAriaInvalid);

  useEffect(() => {
    if (!isDevelopmentRuntime()) return;
    if (!hasAccessibleContent(label)) {
      console.warn("Mergora RadioGroup requires a non-empty visible label.");
    }
    if (itemInspection.length === 0) {
      console.warn("Mergora RadioGroup requires at least one direct RadioGroupItem.");
    }
    if (selected !== undefined && !itemValues.has(selected)) {
      console.warn(`Mergora RadioGroup selection has no direct item for value "${selected}".`);
    }
  }, [itemInspection.length, label, selected]);

  useEffect(() => {
    const form = rootRef.current?.querySelector<HTMLInputElement>(
      '[data-slot="radio-group-input"]',
    )?.form;
    if (form === null || form === undefined) return;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const handleReset = () => {
      timer = setTimeout(() => {
        if (!controlled) setUncontrolledValue(defaultValue);
      }, 0);
    };
    form.addEventListener("reset", handleReset);
    return () => {
      form.removeEventListener("reset", handleReset);
      if (timer !== undefined) clearTimeout(timer);
    };
  }, [controlled, defaultValue, form]);

  const select = useCallback(
    (next: string) => {
      if (disabled || next === selected) return;
      if (!controlled) setUncontrolledValue(next);
      onValueChange?.(next);
    },
    [controlled, disabled, onValueChange, selected],
  );
  const context = useMemo<RadioGroupContextValue>(
    () => ({
      ariaInvalid: resolvedAriaInvalid,
      descriptionId,
      disabled,
      errorMessageId: errorId,
      form,
      name,
      required,
      select,
      selected,
    }),
    [descriptionId, disabled, errorId, form, name, required, resolvedAriaInvalid, select, selected],
  );
  const assignRoot = useCallback(
    (node: HTMLFieldSetElement | null) => {
      rootRef.current = node;
      setForwardedRef(forwardedRef, node);
    },
    [forwardedRef],
  );
  const handleKeyDown: KeyboardEventHandler<HTMLDivElement> = (event) => {
    if (event.defaultPrevented) return;
    if (!(event.target instanceof HTMLInputElement)) return;
    const inputs = [
      ...event.currentTarget.querySelectorAll<HTMLInputElement>(
        '[data-slot="radio-group-input"]:not(:disabled)',
      ),
    ];
    const current = inputs.indexOf(event.target);
    const inheritedDirection = window.getComputedStyle(event.currentTarget).direction;
    const resolvedDirection: RadioGroupDirection =
      direction ?? (inheritedDirection === "rtl" ? "rtl" : "ltr");
    const next = resolveRadioGroupIndex({
      current,
      direction: resolvedDirection,
      itemCount: inputs.length,
      key: event.key,
    });
    if (next === null) return;
    const target = inputs[next];
    if (target === undefined) return;
    event.preventDefault();
    target.focus();
    target.click();
  };

  return (
    <RadioGroupContext.Provider value={context}>
      <fieldset
        {...nativeProps}
        aria-describedby={describedBy}
        aria-invalid={resolvedAriaInvalid}
        className={className === undefined ? "mrg-radio-group" : `mrg-radio-group ${className}`}
        data-disabled={disabled || undefined}
        data-invalid={invalid || undefined}
        data-layout={layout}
        data-slot="radio-group"
        dir={direction}
        disabled={disabled}
        form={form}
        ref={assignRoot}
      >
        <legend data-slot="radio-group-label">{label}</legend>
        {!hasDescription ? null : (
          <p data-slot="radio-group-description" id={descriptionId}>
            {description}
          </p>
        )}
        <div data-slot="radio-group-items" onKeyDown={handleKeyDown}>
          {children}
        </div>
        {!hasError ? null : (
          <p data-slot="radio-group-error" id={errorId}>
            {error}
          </p>
        )}
      </fieldset>
    </RadioGroupContext.Provider>
  );
});

RadioGroup.displayName = "RadioGroup";

export interface RadioGroupItemProps extends Omit<
  InputHTMLAttributes<HTMLInputElement>,
  "checked" | "children" | "defaultChecked" | "name" | "onChange" | "required" | "type"
> {
  /** Non-empty visible item label; use an explicit accessible name when needed. */
  readonly children: ReactNode;
  /** Optional persistent item help text linked to its native radio. */
  readonly description?: ReactNode;
  /** Additional class name applied to the outer RadioGroupItem wrapper. */
  readonly rootClassName?: string;
  /** Inline style applied to the outer RadioGroupItem wrapper. */
  readonly rootStyle?: CSSProperties;
  /** Non-empty unique native value identifying this direct group item. */
  readonly value: string;
  /** Plain or bordered-card visual treatment without proxy-control semantics. */
  readonly variant?: "plain" | "card";
}

export const RadioGroupItem = forwardRef<HTMLInputElement, RadioGroupItemProps>(
  function RadioGroupItem(
    {
      "aria-describedby": ariaDescribedBy,
      "aria-errormessage": ariaErrorMessage,
      "aria-invalid": ariaInvalid,
      "aria-label": ariaLabel,
      "aria-labelledby": ariaLabelledBy,
      children,
      className,
      description,
      disabled = false,
      form,
      rootClassName,
      rootStyle,
      style,
      value,
      variant = "plain",
      ...nativeProps
    },
    ref,
  ) {
    const context = useContext(RadioGroupContext);
    if (context === null) throw new Error("Mergora RadioGroupItem requires a RadioGroup ancestor.");
    validateNonBlank(value, "item value");
    const generatedId = useId().replaceAll(":", "");
    const hasDescription = hasAccessibleContent(description);
    const descriptionId = hasDescription ? `mrg-radio-item-${generatedId}-description` : undefined;
    const resolvedDisabled = context.disabled || disabled;
    const checked = context.selected === value;
    const resolvedAriaInvalid = ariaInvalid === undefined ? context.ariaInvalid : ariaInvalid;
    const semanticInvalid = isSemanticallyInvalid(resolvedAriaInvalid);
    const errorMessage = mergeFieldIdRefs(
      ariaErrorMessage,
      semanticInvalid ? context.errorMessageId : undefined,
    );

    useEffect(() => {
      if (
        isDevelopmentRuntime() &&
        !hasAccessibleContent(children) &&
        (ariaLabel === undefined || ariaLabel.trim().length === 0) &&
        (ariaLabelledBy === undefined || ariaLabelledBy.trim().length === 0)
      ) {
        console.warn(
          `Mergora RadioGroupItem value "${value}" requires children, aria-label, or aria-labelledby.`,
        );
      }
    }, [ariaLabel, ariaLabelledBy, children, value]);
    return (
      <div
        className={
          rootClassName === undefined
            ? "mrg-radio-group-item"
            : `mrg-radio-group-item ${rootClassName}`
        }
        data-disabled={resolvedDisabled || undefined}
        data-invalid={semanticInvalid || undefined}
        data-slot="radio-group-item"
        data-state={checked ? "checked" : "unchecked"}
        data-variant={variant}
        style={rootStyle}
      >
        <label data-slot="radio-group-item-label-root">
          <input
            {...nativeProps}
            aria-label={ariaLabel}
            aria-labelledby={ariaLabelledBy}
            aria-describedby={mergeFieldIdRefs(
              ariaDescribedBy,
              context.descriptionId,
              semanticInvalid ? context.errorMessageId : undefined,
              descriptionId,
            )}
            aria-errormessage={errorMessage}
            aria-invalid={resolvedAriaInvalid}
            checked={checked}
            className={className}
            data-slot="radio-group-input"
            disabled={resolvedDisabled}
            form={form ?? context.form}
            name={context.name}
            onChange={() => context.select(value)}
            ref={ref}
            required={context.required}
            style={style}
            type="radio"
            value={value}
          />
          <span aria-hidden="true" data-slot="radio-group-indicator" />
          <span data-slot="radio-group-item-label">{children}</span>
        </label>
        {!hasDescription ? null : (
          <span data-slot="radio-group-item-description" id={descriptionId}>
            {description}
          </span>
        )}
      </div>
    );
  },
);

RadioGroupItem.displayName = "RadioGroupItem";

export const RadioGroupParts = { Root: RadioGroup, Item: RadioGroupItem } as const;
