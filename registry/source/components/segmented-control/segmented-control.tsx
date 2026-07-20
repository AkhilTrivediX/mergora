"use client";

import {
  createContext,
  forwardRef,
  useContext,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type FieldsetHTMLAttributes,
  type HTMLAttributes,
  type KeyboardEventHandler,
  type ReactNode,
  type Ref,
} from "react";

import { useDirection, type DirectionValue } from "../direction/index.js";
import "./segmented-control.css";

export interface SegmentedControlProps extends Omit<
  FieldsetHTMLAttributes<HTMLFieldSetElement>,
  "defaultValue" | "onChange"
> {
  /** Localizable legend content that names the native radio group. */
  readonly label: ReactNode;
  /** Rendered choices; each item's localizable child content labels its native radio. */
  readonly children: ReactNode;
  /** Controlled selected item value. */
  readonly value?: string;
  /** Initial selected item value when the component is uncontrolled. */
  readonly defaultValue?: string;
  /** Called with the newly selected item value after native activation. */
  readonly onValueChange?: (value: string) => void;
  /** Overrides inherited text direction for spatial arrow-key navigation. */
  readonly direction?: DirectionValue;
  /** Native radio-group form name; a stable component-local name is generated when omitted. */
  readonly name?: string;
  /** Applies native required validation to the radio choices. */
  readonly required?: boolean;
  /** Renders optional locale-sensitive live summary content. Omit it to remove the output node. */
  readonly renderSelectionSummary?: (value: string | undefined) => ReactNode;
}

interface SegmentedContextValue {
  readonly disabled: boolean;
  readonly name: string;
  readonly required: boolean;
  readonly select: (value: string) => void;
  readonly selected: string | undefined;
}

const SegmentedContext = createContext<SegmentedContextValue | null>(null);

function composeRefs<T>(...refs: readonly (Ref<T> | undefined)[]): (node: T | null) => void {
  return (node) => {
    for (const ref of refs) {
      if (typeof ref === "function") ref(node);
      else if (ref !== null && ref !== undefined) ref.current = node;
    }
  };
}

function enabledInputs(root: HTMLElement): HTMLInputElement[] {
  return [
    ...root.querySelectorAll<HTMLInputElement>('[data-slot="segmented-control-input"]'),
  ].filter((input) => !input.disabled);
}

export function resolveSegmentedIndex(input: {
  readonly current: number;
  readonly direction: DirectionValue;
  readonly itemCount: number;
  readonly key: string;
}): number | null {
  const { current, direction, itemCount, key } = input;
  if (itemCount === 0) return null;
  if (key === "Home") return 0;
  if (key === "End") return itemCount - 1;
  let delta = 0;
  if (key === "ArrowRight" || key === "ArrowDown") {
    delta = key === "ArrowRight" && direction === "rtl" ? -1 : 1;
  } else if (key === "ArrowLeft" || key === "ArrowUp") {
    delta = key === "ArrowLeft" && direction === "rtl" ? 1 : -1;
  }
  return delta === 0 ? null : (current + delta + itemCount) % itemCount;
}

export const SegmentedControl = forwardRef<HTMLFieldSetElement, SegmentedControlProps>(
  function SegmentedControl(
    {
      children,
      className,
      defaultValue,
      direction,
      disabled = false,
      label,
      name,
      onValueChange,
      renderSelectionSummary,
      required = false,
      value,
      ...nativeProps
    },
    ref,
  ) {
    const generatedName = useId();
    const inheritedDirection = useDirection();
    const resolvedDirection = direction ?? inheritedDirection;
    const rootRef = useRef<HTMLFieldSetElement | null>(null);
    const [uncontrolledValue, setUncontrolledValue] = useState(defaultValue);
    const selected = value ?? uncontrolledValue;
    const controlled = value !== undefined;
    const context = useMemo<SegmentedContextValue>(
      () => ({
        disabled,
        name: name ?? `mrg-segment-${generatedName.replaceAll(":", "")}`,
        required,
        selected,
        select(next) {
          if (disabled) return;
          if (!controlled) setUncontrolledValue(next);
          onValueChange?.(next);
        },
      }),
      [controlled, disabled, generatedName, name, onValueChange, required, selected],
    );
    useEffect(() => {
      const form = rootRef.current?.form;
      if (controlled || form === null || form === undefined) return;
      const restoreDefault = (): void => setUncontrolledValue(defaultValue);
      form.addEventListener("reset", restoreDefault);
      return () => form.removeEventListener("reset", restoreDefault);
    }, [controlled, defaultValue]);
    const handleKeyDown: KeyboardEventHandler<HTMLDivElement> = (event) => {
      if (!(event.target instanceof HTMLInputElement)) return;
      const inputs = enabledInputs(event.currentTarget);
      const current = inputs.indexOf(event.target);
      if (current < 0) return;
      const next = resolveSegmentedIndex({
        current,
        direction: resolvedDirection,
        itemCount: inputs.length,
        key: event.key,
      });
      if (next === null) return;
      event.preventDefault();
      const target = inputs[next];
      if (target === undefined) return;
      target.focus();
      target.click();
    };

    return (
      <SegmentedContext.Provider value={context}>
        <fieldset
          {...nativeProps}
          className={
            className === undefined ? "mrg-segmented-control" : `mrg-segmented-control ${className}`
          }
          data-slot="segmented-control"
          data-with-summary={renderSelectionSummary === undefined ? undefined : "true"}
          dir={resolvedDirection}
          disabled={disabled}
          ref={composeRefs(ref, rootRef)}
        >
          <legend data-slot="segmented-control-label">{label}</legend>
          <div data-slot="segmented-control-scroll" onKeyDown={handleKeyDown}>
            {children}
          </div>
          {renderSelectionSummary === undefined ? null : (
            <output aria-live="polite" data-slot="segmented-control-summary">
              {renderSelectionSummary(selected)}
            </output>
          )}
        </fieldset>
      </SegmentedContext.Provider>
    );
  },
);

SegmentedControl.displayName = "SegmentedControl";

export interface SegmentedControlItemProps extends Omit<
  HTMLAttributes<HTMLLabelElement>,
  "onChange"
> {
  /** Stable selection and submitted value for this native radio choice. */
  readonly value: string;
  /** Disables this choice and removes it from arrow-key navigation. */
  readonly disabled?: boolean;
}

export const SegmentedControlItem = forwardRef<HTMLLabelElement, SegmentedControlItemProps>(
  function SegmentedControlItem(
    { children, className, disabled = false, value, ...nativeProps },
    ref,
  ) {
    const context = useContext(SegmentedContext);
    if (context === null) {
      throw new Error("Mergora SegmentedControl.Item requires a SegmentedControl ancestor.");
    }
    const resolvedDisabled = context.disabled || disabled;
    const checked = context.selected === value;
    return (
      <label
        {...nativeProps}
        className={
          className === undefined
            ? "mrg-segmented-control-item"
            : `mrg-segmented-control-item ${className}`
        }
        data-disabled={resolvedDisabled || undefined}
        data-slot="segmented-control-item"
        data-state={checked ? "checked" : "unchecked"}
        ref={ref}
      >
        <input
          checked={checked}
          data-slot="segmented-control-input"
          disabled={resolvedDisabled}
          name={context.name}
          onChange={() => context.select(value)}
          required={context.required}
          type="radio"
          value={value}
        />
        <span data-slot="segmented-control-text">{children}</span>
      </label>
    );
  },
);

SegmentedControlItem.displayName = "SegmentedControl.Item";

export const SegmentedControlParts = {
  Root: SegmentedControl,
  Item: SegmentedControlItem,
} as const;
