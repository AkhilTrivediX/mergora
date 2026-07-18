// Generated from registry/source/components/segmented-control/segmented-control.tsx by @mergora-internal/source-transformer. Do not edit.
"use client";

import {
  createContext,
  forwardRef,
  useContext,
  useId,
  useMemo,
  useState,
  type FieldsetHTMLAttributes,
  type HTMLAttributes,
  type KeyboardEventHandler,
  type ReactNode,
} from "react";

import { useDirection, type DirectionValue } from "../direction/index.js";
import "./segmented-control.css";

export interface SegmentedControlProps extends Omit<
  FieldsetHTMLAttributes<HTMLFieldSetElement>,
  "defaultValue" | "onChange"
> {
  readonly label: ReactNode;
  readonly children: ReactNode;
  readonly value?: string;
  readonly defaultValue?: string;
  readonly onValueChange?: (value: string) => void;
  readonly direction?: DirectionValue;
  readonly name?: string;
}

interface SegmentedContextValue {
  readonly disabled: boolean;
  readonly name: string;
  readonly select: (value: string) => void;
  readonly selected: string | undefined;
}

const SegmentedContext = createContext<SegmentedContextValue | null>(null);

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
      value,
      ...nativeProps
    },
    ref,
  ) {
    const generatedName = useId();
    const inheritedDirection = useDirection();
    const resolvedDirection = direction ?? inheritedDirection;
    const [uncontrolledValue, setUncontrolledValue] = useState(defaultValue);
    const selected = value ?? uncontrolledValue;
    const controlled = value !== undefined;
    const context = useMemo<SegmentedContextValue>(
      () => ({
        disabled,
        name: name ?? `mrg-segment-${generatedName.replaceAll(":", "")}`,
        selected,
        select(next) {
          if (disabled) return;
          if (!controlled) setUncontrolledValue(next);
          onValueChange?.(next);
        },
      }),
      [controlled, disabled, generatedName, name, onValueChange, selected],
    );
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
          dir={resolvedDirection}
          disabled={disabled}
          ref={ref}
        >
          <legend data-slot="segmented-control-label">{label}</legend>
          <div data-slot="segmented-control-scroll" onKeyDown={handleKeyDown}>
            {children}
          </div>
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
  readonly value: string;
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
