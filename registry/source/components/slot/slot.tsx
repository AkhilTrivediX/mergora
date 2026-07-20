import {
  Children,
  Fragment,
  cloneElement,
  forwardRef,
  isValidElement,
  type CSSProperties,
  type HTMLAttributes,
  type ReactElement,
  type ReactNode,
  type Ref,
} from "react";

import "./slot.css";

type PossibleRef<T> = Ref<T> | undefined;

function composeRefs<T>(...refs: readonly PossibleRef<T>[]): (node: T | null) => void {
  return (node) => {
    for (const ref of refs) {
      if (typeof ref === "function") ref(node);
      else if (ref !== null && ref !== undefined) {
        (ref as { current: T | null }).current = node;
      }
    }
  };
}

function joinClassNames(
  slotClassName: string | undefined,
  childClassName: string | undefined,
): string | undefined {
  const values = [slotClassName, childClassName].filter(
    (value): value is string => value !== undefined && value.trim().length > 0,
  );
  return values.length === 0 ? undefined : values.join(" ");
}

function mergeEventHandlers(
  slotHandler: ((event: unknown) => void) | undefined,
  childHandler: ((event: unknown) => void) | undefined,
): ((event: unknown) => void) | undefined {
  if (slotHandler === undefined) return childHandler;
  if (childHandler === undefined) return slotHandler;
  return (event) => {
    childHandler(event);
    if (!(event as { defaultPrevented?: boolean }).defaultPrevented) slotHandler(event);
  };
}

export interface SlotProps extends Omit<HTMLAttributes<HTMLElement>, "children"> {
  /** Exactly one non-Fragment element. The child's semantic element remains authoritative. */
  readonly children: ReactElement;
  /** Mergora part identifier; omission preserves the child's value or falls back to slot. */
  readonly "data-slot"?: string;
}

export const Slot = forwardRef<HTMLElement, SlotProps>(function Slot(
  { children, className, style, ...slotProps },
  forwardedRef,
) {
  if (Children.count(children) !== 1) {
    throw new Error(
      "Mergora Slot requires exactly one concrete React element so semantics and refs remain deterministic.",
    );
  }
  const child: ReactNode = children;
  if (!isValidElement<Record<string, unknown>>(child) || child.type === Fragment) {
    throw new Error(
      "Mergora Slot requires exactly one concrete React element so semantics and refs remain deterministic.",
    );
  }

  const childProps = child.props;
  const mergedProps: Record<string, unknown> = { ...slotProps, ...childProps };
  for (const key of new Set([...Object.keys(slotProps), ...Object.keys(childProps)])) {
    if (!/^on[A-Z]/u.test(key)) continue;
    const slotHandler = slotProps[key as keyof typeof slotProps];
    const childHandler = childProps[key];
    mergedProps[key] = mergeEventHandlers(
      typeof slotHandler === "function" ? (slotHandler as (event: unknown) => void) : undefined,
      typeof childHandler === "function" ? (childHandler as (event: unknown) => void) : undefined,
    );
  }

  mergedProps.className = joinClassNames(
    className,
    typeof childProps.className === "string" ? childProps.className : undefined,
  );
  mergedProps.style = {
    ...(style ?? {}),
    ...((childProps.style as CSSProperties | undefined) ?? {}),
  };
  for (const key of Object.keys(slotProps).filter(
    (value) => value.startsWith("data-") || value === "dir" || value === "lang",
  )) {
    mergedProps[key] = slotProps[key as keyof typeof slotProps];
  }
  mergedProps["data-slot"] = slotProps["data-slot"] ?? childProps["data-slot"] ?? "slot";

  const childRef = childProps.ref as PossibleRef<HTMLElement>;
  return cloneElement(child, {
    ...mergedProps,
    ref: composeRefs(forwardedRef, childRef),
  } as Record<string, unknown>);
});

Slot.displayName = "Slot";

export function isSlottableChild(value: ReactNode): value is ReactElement {
  return isValidElement(value) && value.type !== Fragment;
}
