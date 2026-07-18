"use client";

import {
  Children,
  Fragment,
  createContext,
  forwardRef,
  isValidElement,
  useContext,
  useMemo,
  useRef,
  useState,
  type ButtonHTMLAttributes,
  type HTMLAttributes,
  type KeyboardEventHandler,
  type MouseEventHandler,
  type ReactNode,
  type Ref,
} from "react";

import { useDirection, type DirectionValue } from "../direction/index.js";
import "./toggle-group.css";

export type ToggleGroupOrientation = "horizontal" | "vertical";

interface ToggleGroupBaseProps extends Omit<
  HTMLAttributes<HTMLDivElement>,
  "aria-label" | "defaultValue" | "onChange"
> {
  readonly label: string;
  readonly children: ReactNode;
  readonly disabled?: boolean;
  readonly orientation?: ToggleGroupOrientation;
  readonly direction?: DirectionValue;
}

export interface ToggleGroupSingleProps extends ToggleGroupBaseProps {
  readonly type: "single";
  readonly value?: string | null;
  readonly defaultValue?: string | null;
  readonly onValueChange?: (value: string | null) => void;
  readonly allowEmpty?: boolean;
}

export interface ToggleGroupMultipleProps extends ToggleGroupBaseProps {
  readonly type: "multiple";
  readonly value?: readonly string[];
  readonly defaultValue?: readonly string[];
  readonly onValueChange?: (value: readonly string[]) => void;
  readonly allowEmpty?: true;
}

export type ToggleGroupProps = ToggleGroupSingleProps | ToggleGroupMultipleProps;

interface ToggleGroupContextValue {
  readonly disabled: boolean;
  readonly selected: ReadonlySet<string>;
  readonly tabStopValue: string | null;
  readonly setTabStop: (value: string) => void;
  readonly toggle: (value: string) => void;
}

const ToggleGroupContext = createContext<ToggleGroupContextValue | null>(null);

function composeRefs<T>(...refs: readonly (Ref<T> | undefined)[]): (node: T | null) => void {
  return (node) => {
    for (const ref of refs) {
      if (typeof ref === "function") ref(node);
      else if (ref !== null && ref !== undefined) ref.current = node;
    }
  };
}

function enabledItems(root: HTMLElement): HTMLButtonElement[] {
  return [...root.querySelectorAll<HTMLButtonElement>('[data-slot="toggle-group-item"]')].filter(
    (item) => !item.disabled && item.getAttribute("aria-disabled") !== "true",
  );
}

function collectItemDescriptors(
  children: ReactNode,
  result: { readonly disabled: boolean; readonly value: string }[] = [],
): { readonly disabled: boolean; readonly value: string }[] {
  Children.forEach(children, (child) => {
    if (!isValidElement<Record<string, unknown>>(child)) return;
    if (child.type === Fragment) {
      collectItemDescriptors(child.props.children as ReactNode, result);
      return;
    }
    if (child.type === ToggleGroupItem && typeof child.props.value === "string") {
      result.push({ disabled: child.props.disabled === true, value: child.props.value });
    }
  });
  return result;
}

export function resolveToggleGroupIndex(input: {
  readonly current: number;
  readonly direction: DirectionValue;
  readonly itemCount: number;
  readonly key: string;
  readonly orientation: ToggleGroupOrientation;
}): number | null {
  const { current, direction, itemCount, key, orientation } = input;
  if (itemCount === 0) return null;
  if (key === "Home") return 0;
  if (key === "End") return itemCount - 1;
  let delta = 0;
  if (orientation === "vertical") {
    if (key === "ArrowDown") delta = 1;
    else if (key === "ArrowUp") delta = -1;
  } else if (key === "ArrowRight") {
    delta = direction === "rtl" ? -1 : 1;
  } else if (key === "ArrowLeft") {
    delta = direction === "rtl" ? 1 : -1;
  }
  return delta === 0 ? null : (current + delta + itemCount) % itemCount;
}

export const ToggleGroup = forwardRef<HTMLDivElement, ToggleGroupProps>(
  function ToggleGroup(props, forwardedRef) {
    const {
      children,
      className,
      direction,
      disabled = false,
      label,
      onKeyDown,
      orientation = "horizontal",
      type,
      value: _value,
      defaultValue: _defaultValue,
      onValueChange: _onValueChange,
      allowEmpty: _allowEmpty,
      ...nativeProps
    } = props;
    const inheritedDirection = useDirection();
    const resolvedDirection = direction ?? inheritedDirection;
    const rootRef = useRef<HTMLDivElement | null>(null);
    const controlled = props.value !== undefined;
    const defaultValues =
      type === "single"
        ? props.defaultValue === undefined || props.defaultValue === null
          ? []
          : [props.defaultValue]
        : [...(props.defaultValue ?? [])];
    const [uncontrolledValues, setUncontrolledValues] = useState<readonly string[]>(defaultValues);
    const values =
      type === "single"
        ? props.value === undefined
          ? uncontrolledValues
          : props.value === null
            ? []
            : [props.value]
        : props.value === undefined
          ? uncontrolledValues
          : props.value;
    const selected = useMemo(() => new Set(values), [values]);
    const itemDescriptors = collectItemDescriptors(children);
    const enabledValues = itemDescriptors
      .filter((item) => !disabled && !item.disabled)
      .map((item) => item.value);
    const [requestedTabStop, setRequestedTabStop] = useState<string | null>(null);
    const tabStopValue =
      requestedTabStop !== null && enabledValues.includes(requestedTabStop)
        ? requestedTabStop
        : (enabledValues.find((value) => selected.has(value)) ?? enabledValues[0] ?? null);

    const context = useMemo<ToggleGroupContextValue>(
      () => ({
        disabled,
        selected,
        tabStopValue,
        setTabStop: setRequestedTabStop,
        toggle(itemValue) {
          if (disabled) return;
          if (type === "single") {
            const next = selected.has(itemValue) && props.allowEmpty ? null : itemValue;
            if (!controlled) setUncontrolledValues(next === null ? [] : [next]);
            props.onValueChange?.(next);
          } else {
            const next = selected.has(itemValue)
              ? values.filter((value) => value !== itemValue)
              : [...values, itemValue];
            if (!controlled) setUncontrolledValues(next);
            props.onValueChange?.(next);
          }
        },
      }),
      [controlled, disabled, props, selected, tabStopValue, type, values],
    );

    const handleKeyDown: KeyboardEventHandler<HTMLDivElement> = (event) => {
      onKeyDown?.(event);
      if (event.defaultPrevented || !(event.target instanceof HTMLButtonElement)) return;
      const items = enabledItems(event.currentTarget);
      const current = items.indexOf(event.target);
      if (current < 0) return;
      const next = resolveToggleGroupIndex({
        current,
        direction: resolvedDirection,
        itemCount: items.length,
        key: event.key,
        orientation,
      });
      if (next === null) return;
      event.preventDefault();
      const target = items[next];
      if (target === undefined) return;
      const targetValue = target.dataset.value;
      if (targetValue !== undefined) setRequestedTabStop(targetValue);
      target.focus();
    };

    return (
      <ToggleGroupContext.Provider value={context}>
        <div
          {...nativeProps}
          aria-disabled={disabled || undefined}
          aria-label={label}
          className={className === undefined ? "mrg-toggle-group" : `mrg-toggle-group ${className}`}
          data-orientation={orientation}
          data-selection-mode={type}
          data-slot="toggle-group"
          dir={resolvedDirection}
          onKeyDown={handleKeyDown}
          ref={composeRefs(forwardedRef, rootRef)}
          role="group"
        >
          {children}
        </div>
      </ToggleGroupContext.Provider>
    );
  },
);

ToggleGroup.displayName = "ToggleGroup";

export interface ToggleGroupItemProps extends Omit<
  ButtonHTMLAttributes<HTMLButtonElement>,
  "aria-pressed" | "value"
> {
  readonly value: string;
}

export const ToggleGroupItem = forwardRef<HTMLButtonElement, ToggleGroupItemProps>(
  function ToggleGroupItem(
    {
      children,
      className,
      disabled = false,
      onClick,
      onFocus,
      type = "button",
      value,
      ...nativeProps
    },
    ref,
  ) {
    const context = useContext(ToggleGroupContext);
    if (context === null) {
      throw new Error("Mergora ToggleGroup.Item requires a ToggleGroup ancestor.");
    }
    const selected = context.selected.has(value);
    const resolvedDisabled = context.disabled || disabled;
    const handleClick: MouseEventHandler<HTMLButtonElement> = (event) => {
      onClick?.(event);
      if (!event.defaultPrevented && !resolvedDisabled) context.toggle(value);
    };
    return (
      <button
        {...nativeProps}
        aria-pressed={selected}
        className={
          className === undefined ? "mrg-toggle-group-item" : `mrg-toggle-group-item ${className}`
        }
        data-slot="toggle-group-item"
        data-state={selected ? "on" : "off"}
        data-value={value}
        disabled={resolvedDisabled}
        onClick={handleClick}
        onFocus={(event) => {
          context.setTabStop(value);
          onFocus?.(event);
        }}
        ref={ref}
        tabIndex={context.tabStopValue === value ? 0 : -1}
        type={type}
      >
        {children}
      </button>
    );
  },
);

ToggleGroupItem.displayName = "ToggleGroup.Item";

export const ToggleGroupParts = { Root: ToggleGroup, Item: ToggleGroupItem } as const;
