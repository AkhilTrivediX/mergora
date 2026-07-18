// Generated from registry/source/components/button-group/button-group.tsx by @mergora-internal/source-transformer. Do not edit.
"use client";

import {
  Children,
  Fragment,
  cloneElement,
  forwardRef,
  isValidElement,
  useState,
  type FocusEventHandler,
  type HTMLAttributes,
  type KeyboardEventHandler,
  type ReactElement,
  type ReactNode,
} from "react";

import { useDirection, type DirectionValue } from "../direction/index.js";
import "./button-group.css";

export type ButtonGroupMode = "group" | "toolbar";
export type ButtonGroupOrientation = "horizontal" | "vertical";

const toolbarActionMarker = Symbol.for("mergora-ui/toolbar-action");

interface ProcessLike {
  readonly env?: { readonly NODE_ENV?: string };
}

declare const process: ProcessLike | undefined;

function isProductionRuntime(): boolean {
  const viteProduction = (
    import.meta as ImportMeta & { readonly env?: { readonly PROD?: boolean } }
  ).env?.PROD;
  if (viteProduction === true) return true;
  return typeof process !== "undefined" && process.env?.NODE_ENV === "production";
}

/**
 * Opts a custom component into toolbar roving focus. The component must forward
 * tabIndex and data attributes to exactly one native button or anchor root.
 */
export function markButtonGroupAction<Component extends object>(component: Component): Component {
  Object.defineProperty(component, toolbarActionMarker, { value: true });
  return component;
}

export interface ButtonGroupProps extends Omit<HTMLAttributes<HTMLDivElement>, "aria-label"> {
  readonly label: string;
  readonly children: ReactNode;
  readonly mode?: ButtonGroupMode;
  readonly orientation?: ButtonGroupOrientation;
  readonly wrap?: boolean;
  readonly direction?: DirectionValue;
}

function enabledToolbarItems(root: HTMLElement): HTMLElement[] {
  return [...root.querySelectorAll<HTMLElement>('[data-mrg-toolbar-action="true"]')].filter(
    (item) =>
      item.matches("button, a[href]") &&
      !item.matches(":disabled") &&
      item.getAttribute("aria-disabled") !== "true" &&
      !item.hasAttribute("hidden") &&
      item.closest("[inert]") === null,
  );
}

function flattenToolbarChildren(
  children: ReactNode,
  result: ReactElement<Record<string, unknown>>[] = [],
): ReactElement<Record<string, unknown>>[] {
  Children.forEach(children, (child) => {
    if (!isValidElement<Record<string, unknown>>(child)) return;
    if (child.type === Fragment) {
      flattenToolbarChildren(child.props.children as ReactNode, result);
    } else {
      result.push(child);
    }
  });
  return result;
}

function isToolbarChildDisabled(child: ReactElement<Record<string, unknown>>): boolean {
  return (
    child.props.disabled === true ||
    child.props["aria-disabled"] === true ||
    child.props["aria-disabled"] === "true"
  );
}

function hasToolbarActionMarker(type: unknown): boolean {
  return (
    (typeof type === "function" || (typeof type === "object" && type !== null)) &&
    Reflect.get(type, toolbarActionMarker) === true
  );
}

function isManagedToolbarChild(child: ReactElement<Record<string, unknown>>): boolean {
  if (child.type === "button") return true;
  if (child.type === "a")
    return typeof child.props.href === "string" && child.props.href.length > 0;
  return hasToolbarActionMarker(child.type);
}

function mayRenderFocusableContent(child: ReactElement<Record<string, unknown>>): boolean {
  if (typeof child.type !== "string") return true;
  if (
    ["button", "iframe", "input", "select", "summary", "textarea"].includes(child.type) ||
    (child.type === "a" && typeof child.props.href === "string") ||
    ((child.type === "audio" || child.type === "video") && child.props.controls === true) ||
    child.props.contentEditable === true ||
    (typeof child.props.tabIndex === "number" && child.props.tabIndex >= 0)
  ) {
    return true;
  }

  let unsafeDescendant = false;
  Children.forEach(child.props.children as ReactNode, (descendant) => {
    if (!unsafeDescendant && isValidElement<Record<string, unknown>>(descendant)) {
      unsafeDescendant = isManagedToolbarChild(descendant) || mayRenderFocusableContent(descendant);
    }
  });
  return unsafeDescendant;
}

function renderUnmanagedToolbarChild(
  child: ReactElement<Record<string, unknown>>,
  index: number,
): ReactElement {
  const key = child.key ?? `toolbar-item-${index}`;
  if (!mayRenderFocusableContent(child)) return cloneElement(child, { key });

  if (!isProductionRuntime()) {
    console.warn(
      `[Mergora ButtonGroup] Toolbar child ${index + 1} is not one concrete native or Mergora action. Its subtree is inert and excluded from roving focus.`,
    );
  }
  return (
    <span data-slot="button-group-unmanaged" inert key={key}>
      {child}
    </span>
  );
}

export function resolveToolbarIndex(input: {
  readonly current: number;
  readonly direction: DirectionValue;
  readonly itemCount: number;
  readonly key: string;
  readonly orientation: ButtonGroupOrientation;
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

export const ButtonGroup = forwardRef<HTMLDivElement, ButtonGroupProps>(function ButtonGroup(
  {
    children,
    className,
    direction,
    label,
    mode = "group",
    onFocus,
    onKeyDown,
    orientation = "horizontal",
    wrap = true,
    ...nativeProps
  },
  forwardedRef,
) {
  const inheritedDirection = useDirection();
  const resolvedDirection = direction ?? inheritedDirection;
  const [requestedTabStop, setRequestedTabStop] = useState(0);
  const toolbarChildren = mode === "toolbar" ? flattenToolbarChildren(children) : [];
  const enabledChildIndexes = toolbarChildren
    .map((child, index) =>
      isManagedToolbarChild(child) && !isToolbarChildDisabled(child) ? index : -1,
    )
    .filter((index) => index >= 0);
  const resolvedTabStop = Math.min(requestedTabStop, Math.max(0, enabledChildIndexes.length - 1));
  let enabledOrdinal = -1;
  const renderedChildren =
    mode === "toolbar"
      ? toolbarChildren.map((child, index) => {
          if (!isManagedToolbarChild(child)) return renderUnmanagedToolbarChild(child, index);
          const disabled = isToolbarChildDisabled(child);
          if (!disabled) enabledOrdinal += 1;
          return cloneElement(child, {
            "data-mrg-toolbar-action": "true",
            key: child.key ?? `toolbar-item-${index}`,
            tabIndex: !disabled && enabledOrdinal === resolvedTabStop ? 0 : -1,
          });
        })
      : children;

  const handleFocus: FocusEventHandler<HTMLDivElement> = (event) => {
    if (mode === "toolbar" && event.target instanceof HTMLElement) {
      const items = enabledToolbarItems(event.currentTarget);
      const index = items.indexOf(event.target);
      if (index >= 0) setRequestedTabStop(index);
    }
    onFocus?.(event);
  };
  const handleKeyDown: KeyboardEventHandler<HTMLDivElement> = (event) => {
    onKeyDown?.(event);
    if (event.defaultPrevented || mode !== "toolbar" || !(event.target instanceof HTMLElement)) {
      return;
    }
    const items = enabledToolbarItems(event.currentTarget);
    const current = items.indexOf(event.target);
    if (current < 0) return;
    const next = resolveToolbarIndex({
      current,
      direction: resolvedDirection,
      itemCount: items.length,
      key: event.key,
      orientation,
    });
    if (next === null) return;
    event.preventDefault();
    setRequestedTabStop(next);
    items[next]?.focus();
  };

  return (
    <div
      {...nativeProps}
      aria-label={label}
      aria-orientation={mode === "toolbar" ? orientation : undefined}
      className={className === undefined ? "mrg-button-group" : `mrg-button-group ${className}`}
      data-mode={mode}
      data-orientation={orientation}
      data-slot="button-group"
      data-wrap={wrap ? "true" : "false"}
      dir={resolvedDirection}
      onFocus={handleFocus}
      onKeyDown={handleKeyDown}
      ref={forwardedRef}
      role={mode}
    >
      {renderedChildren}
    </div>
  );
});

ButtonGroup.displayName = "ButtonGroup";
