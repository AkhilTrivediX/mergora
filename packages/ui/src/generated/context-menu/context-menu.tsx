// Generated from registry/source/components/context-menu/context-menu.tsx by @mergora-internal/source-transformer. Do not edit.
"use client";

import "./context-menu.css";

import {
  forwardRef,
  useId,
  useRef,
  useState,
  type ButtonHTMLAttributes,
  type HTMLAttributes,
  type KeyboardEvent,
  type MouseEvent,
  type PointerEvent,
  type ReactNode,
} from "react";

import {
  DropdownMenu,
  type DropdownMenuItem,
  type DropdownMenuSelectionMode,
} from "../dropdown-menu/index.js";

export type ContextMenuOpenReason = "contextmenu" | "keyboard" | "press" | "dismiss";

export interface ContextMenuOpenChangeDetails {
  /** Interaction channel that opened or dismissed the context menu. */
  readonly reason: ContextMenuOpenReason;
}

export interface ContextMenuProps extends Omit<
  HTMLAttributes<HTMLSpanElement>,
  "children" | "defaultValue" | "onChange"
> {
  /** Visible content of the native context-menu target button. */
  readonly children: ReactNode;
  /** Accessible name applied to the opened menu. */
  readonly menuLabel: string;
  /** Ordered menu model, including nested menus and separators. */
  readonly items: readonly DropdownMenuItem[];
  /** Controlled open state; pair with onOpenChange. */
  readonly open?: boolean;
  /** Initial open state for uncontrolled use. */
  readonly defaultOpen?: boolean;
  /** Reports open-state changes with their pointer, keyboard, press, or dismissal reason. */
  readonly onOpenChange?: (open: boolean, details: ContextMenuOpenChangeDetails) => void;
  /** Reports the identifier of an activated menu item. */
  readonly onAction?: (id: string) => void;
  /** Selection semantics applied to actionable menu items. */
  readonly selectionMode?: DropdownMenuSelectionMode;
  /** Controlled identifiers selected in single or multiple selection mode. */
  readonly selectedIds?: readonly string[];
  /** Initial selected identifiers for uncontrolled use. */
  readonly defaultSelectedIds?: readonly string[];
  /** Reports the complete selected-identifier set after a selection change. */
  readonly onSelectionChange?: (ids: readonly string[]) => void;
  /** Disables the target and all supported menu invocation paths. */
  readonly disabled?: boolean;
  /** Shows and describes the complete pointer and keyboard invocation map. */
  readonly showInvocationHint?: boolean;
  /** Visible and associated guidance used when showInvocationHint is enabled. */
  readonly invocationHint?: ReactNode;
  /** Shows a selected-count rail when selection semantics are enabled. */
  readonly selectionSummary?: boolean;
  /** Requires a second activation for destructive items configured with confirmation copy. */
  readonly confirmDestructiveActions?: boolean;
  /** Additional target-button props; owned invocation and ARIA attributes remain internal. */
  readonly triggerProps?: Omit<
    ButtonHTMLAttributes<HTMLButtonElement>,
    | "aria-describedby"
    | "aria-expanded"
    | "aria-haspopup"
    | "children"
    | "disabled"
    | "onClick"
    | "onContextMenu"
    | "onKeyDown"
  >;
}

export const ContextMenu = forwardRef<HTMLButtonElement, ContextMenuProps>(function ContextMenu(
  {
    children,
    className,
    confirmDestructiveActions = false,
    defaultOpen = false,
    defaultSelectedIds,
    disabled = false,
    invocationHint = "Right-click, press Shift+F10, use the Menu key, or press the target.",
    items,
    menuLabel,
    onAction,
    onOpenChange,
    onSelectionChange,
    open,
    selectedIds,
    selectionMode = "none",
    selectionSummary = false,
    showInvocationHint = false,
    triggerProps,
    ...nativeProps
  },
  ref,
) {
  const hintId = `mrg-context-menu-${useId().replaceAll(":", "")}-hint`;
  const [uncontrolledOpen, setUncontrolledOpen] = useState(defaultOpen);
  const pendingReason = useRef<ContextMenuOpenReason | null>(null);
  const isOpen = open ?? uncontrolledOpen;

  const updateOpen = (next: boolean, reason?: ContextMenuOpenReason): void => {
    if (open === undefined) setUncontrolledOpen(next);
    const resolvedReason = reason ?? pendingReason.current ?? (next ? "press" : "dismiss");
    pendingReason.current = null;
    onOpenChange?.(next, { reason: resolvedReason });
  };

  const handleContextMenu = (event: MouseEvent<HTMLButtonElement>): void => {
    if (disabled) return;
    event.preventDefault();
    pendingReason.current = "contextmenu";
    updateOpen(true, "contextmenu");
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLButtonElement>): void => {
    if (disabled) return;
    if ((event.key === "F10" && event.shiftKey) || event.key === "ContextMenu") {
      event.preventDefault();
      event.stopPropagation();
      pendingReason.current = "keyboard";
      updateOpen(true, "keyboard");
      return;
    }
    if (event.key === "Enter" || event.key === " ") pendingReason.current = "press";
  };

  const handlePointerDown = (_event: PointerEvent<HTMLButtonElement>): void => {
    pendingReason.current = "press";
  };

  return (
    <span
      {...nativeProps}
      className={className === undefined ? "mrg-context-menu" : `mrg-context-menu ${className}`}
      data-slot="context-menu"
    >
      <DropdownMenu
        ref={ref}
        {...(defaultSelectedIds === undefined ? {} : { defaultSelectedIds })}
        {...(selectedIds === undefined ? {} : { selectedIds })}
        confirmDestructiveActions={confirmDestructiveActions}
        disabled={disabled}
        items={items}
        label={children}
        menuLabel={menuLabel}
        {...(onAction === undefined ? {} : { onAction })}
        onOpenChange={(next) => updateOpen(next)}
        {...(onSelectionChange === undefined ? {} : { onSelectionChange })}
        open={isOpen}
        selectionMode={selectionMode}
        selectionSummary={selectionSummary}
        triggerProps={{
          ...triggerProps,
          ...(showInvocationHint ? { "aria-describedby": hintId } : {}),
          className:
            triggerProps?.className === undefined
              ? "mrg-context-menu__target"
              : `mrg-context-menu__target ${triggerProps.className}`,
          onContextMenu: handleContextMenu,
          onKeyDown: handleKeyDown,
          onPointerDown: handlePointerDown,
        }}
      />
      {showInvocationHint ? (
        <span
          className="mrg-context-menu__hint"
          data-slot="context-menu-invocation-hint"
          id={hintId}
        >
          {invocationHint}
        </span>
      ) : null}
    </span>
  );
});

ContextMenu.displayName = "ContextMenu";
