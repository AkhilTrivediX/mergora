"use client";

import "./menubar.css";

import {
  forwardRef,
  useId,
  useRef,
  useState,
  type HTMLAttributes,
  type KeyboardEvent,
} from "react";

import { useDirection, type DirectionValue } from "../direction/index.js";
import {
  DropdownMenu,
  type DropdownMenuItem,
  type DropdownMenuSelectionMode,
} from "../dropdown-menu/index.js";

export interface MenubarMenu {
  /** Stable non-empty identifier, unique within this menubar. */
  readonly id: string;
  /** Visible top-level menu label and typeahead text. */
  readonly label: string;
  /** Accessible name for the child menu; defaults from the visible label. */
  readonly menuLabel?: string;
  /** Ordered item model rendered in this child menu. */
  readonly items: readonly DropdownMenuItem[];
  /** Removes this top-level menu from focus movement and activation. */
  readonly disabled?: boolean;
  /** Selection semantics applied to this child menu's actionable items. */
  readonly selectionMode?: DropdownMenuSelectionMode;
  /** Controlled selected identifiers for this child menu. */
  readonly selectedIds?: readonly string[];
  /** Initial selected identifiers for uncontrolled child-menu use. */
  readonly defaultSelectedIds?: readonly string[];
  /** Reports this child menu's complete selected-identifier set. */
  readonly onSelectionChange?: (ids: readonly string[]) => void;
  /** Reports the identifier of an item activated in this child menu. */
  readonly onAction?: (id: string) => void;
}

export interface MenubarProps extends Omit<HTMLAttributes<HTMLDivElement>, "children"> {
  /** Accessible name applied to the menubar composite. */
  readonly label: string;
  /** Ordered top-level menu configuration. */
  readonly menus: readonly MenubarMenu[];
  /** Direction used for logical arrow-key movement and child-menu placement. */
  readonly direction?: DirectionValue;
  /** Controlled identifier of the open top-level menu, or null when closed. */
  readonly openMenuId?: string | null;
  /** Initial open top-level menu identifier for uncontrolled use. */
  readonly defaultOpenMenuId?: string | null;
  /** Reports changes to the open top-level menu identifier. */
  readonly onOpenMenuChange?: (id: string | null) => void;
  /** Opens newly focused menus while one is active; false leaves focus movement non-activating. */
  readonly openMenuOnFocus?: boolean;
  /** Adds an associated keyboard-discovery guide; false removes its text and description id. */
  readonly keyboardGuide?: boolean;
  /** Visible guidance associated with the menubar when keyboardGuide is enabled. */
  readonly keyboardGuideText?: string;
  /** Shows child-menu selected-count rails; false removes their UI and announcement output. */
  readonly selectionSummary?: boolean;
  /** Enables second-activation confirmation for destructive items; false removes that state machine. */
  readonly confirmDestructiveActions?: boolean;
}

function validateMenus(menus: readonly MenubarMenu[], openMenuId: string | null | undefined): void {
  if (menus.length === 0) throw new Error("Mergora Menubar requires at least one menu.");
  const ids = new Set<string>();
  for (const menu of menus) {
    if (menu.id.trim().length === 0 || menu.label.trim().length === 0) {
      throw new Error("Mergora Menubar menu ids and labels must be non-empty strings.");
    }
    if (ids.has(menu.id)) {
      throw new Error(`Mergora Menubar menu ids must be unique. Duplicate: ${menu.id}.`);
    }
    ids.add(menu.id);
  }
  if (openMenuId !== undefined && openMenuId !== null && !ids.has(openMenuId)) {
    throw new Error(`Mergora Menubar openMenuId ${openMenuId} does not match a menu.`);
  }
}

function nextEnabledIndex(menus: readonly MenubarMenu[], start: number, step: 1 | -1): number {
  for (let offset = 1; offset <= menus.length; offset += 1) {
    const index = (start + step * offset + menus.length) % menus.length;
    if (!menus[index]?.disabled) return index;
  }
  return start;
}

export const Menubar = forwardRef<HTMLDivElement, MenubarProps>(function Menubar(
  {
    className,
    confirmDestructiveActions = false,
    defaultOpenMenuId = null,
    direction,
    keyboardGuide = false,
    keyboardGuideText = "Use Left and Right Arrow to move between menus. Use Down Arrow, Enter, or Space to open one.",
    label,
    menus,
    onOpenMenuChange,
    openMenuId,
    openMenuOnFocus = false,
    selectionSummary = false,
    ...nativeProps
  },
  ref,
) {
  validateMenus(menus, openMenuId);
  if (label.trim().length === 0) throw new Error("Mergora Menubar requires a non-empty label.");
  const inheritedDirection = useDirection();
  const resolvedDirection = direction ?? inheritedDirection;
  const guideId = `mrg-menubar-${useId().replaceAll(":", "")}-guide`;
  const [uncontrolledOpenId, setUncontrolledOpenId] = useState<string | null>(defaultOpenMenuId);
  const [activeIndex, setActiveIndex] = useState(() => {
    const first = menus.findIndex((menu) => !menu.disabled);
    return first < 0 ? 0 : first;
  });
  const triggerRefs = useRef(new Map<string, HTMLButtonElement>());
  const currentOpenId = openMenuId ?? uncontrolledOpenId;

  const updateOpen = (id: string | null): void => {
    if (openMenuId === undefined) setUncontrolledOpenId(id);
    onOpenMenuChange?.(id);
  };

  const focusIndex = (index: number, openAfterFocus: boolean): void => {
    setActiveIndex(index);
    const menu = menus[index];
    if (menu === undefined) return;
    triggerRefs.current.get(menu.id)?.focus({ preventScroll: true });
    if (openAfterFocus) updateOpen(menu.id);
  };

  const handleTopLevelKey = (event: KeyboardEvent<HTMLButtonElement>, index: number): void => {
    const previousKey = resolvedDirection === "rtl" ? "ArrowRight" : "ArrowLeft";
    const nextKey = resolvedDirection === "rtl" ? "ArrowLeft" : "ArrowRight";
    let next: number | null = null;
    if (event.key === previousKey) next = nextEnabledIndex(menus, index, -1);
    else if (event.key === nextKey) next = nextEnabledIndex(menus, index, 1);
    else if (event.key === "Home") next = nextEnabledIndex(menus, menus.length - 1, 1);
    else if (event.key === "End") next = nextEnabledIndex(menus, 0, -1);
    else if (/^\p{L}$/u.test(event.key)) {
      const query = event.key.toLocaleLowerCase();
      for (let offset = 1; offset <= menus.length; offset += 1) {
        const candidate = (index + offset) % menus.length;
        const menu = menus[candidate];
        if (
          menu !== undefined &&
          !menu.disabled &&
          menu.label.toLocaleLowerCase().startsWith(query)
        ) {
          next = candidate;
          break;
        }
      }
    }
    if (next === null) return;
    event.preventDefault();
    event.stopPropagation();
    focusIndex(next, currentOpenId !== null);
  };

  return (
    <div
      {...nativeProps}
      ref={ref}
      aria-describedby={keyboardGuide ? guideId : undefined}
      aria-label={label}
      className={className === undefined ? "mrg-menubar" : `mrg-menubar ${className}`}
      data-slot="menubar"
      dir={resolvedDirection}
      role="menubar"
    >
      <div className="mrg-menubar__rail" data-slot="menubar-rail">
        {menus.map((menu, index) => (
          <DropdownMenu
            ref={(node) => {
              if (node === null) triggerRefs.current.delete(menu.id);
              else triggerRefs.current.set(menu.id, node);
            }}
            {...(menu.defaultSelectedIds === undefined
              ? {}
              : { defaultSelectedIds: menu.defaultSelectedIds })}
            {...(menu.selectedIds === undefined ? {} : { selectedIds: menu.selectedIds })}
            confirmDestructiveActions={confirmDestructiveActions}
            direction={resolvedDirection}
            {...(menu.disabled === undefined ? {} : { disabled: menu.disabled })}
            items={menu.items}
            key={menu.id}
            label={menu.label}
            menuLabel={menu.menuLabel ?? `${menu.label} menu`}
            {...(menu.onAction === undefined ? {} : { onAction: menu.onAction })}
            onOpenChange={(nextOpen) => updateOpen(nextOpen ? menu.id : null)}
            {...(menu.onSelectionChange === undefined
              ? {}
              : { onSelectionChange: menu.onSelectionChange })}
            open={currentOpenId === menu.id}
            placement="start"
            selectionMode={menu.selectionMode ?? "none"}
            selectionSummary={selectionSummary}
            triggerRole="menuitem"
            triggerProps={{
              onFocus: () => {
                setActiveIndex(index);
                if (openMenuOnFocus && currentOpenId !== null && currentOpenId !== menu.id) {
                  updateOpen(menu.id);
                }
              },
              onKeyDown: (event) => handleTopLevelKey(event, index),
              tabIndex: index === activeIndex ? 0 : -1,
            }}
          />
        ))}
      </div>
      {keyboardGuide ? (
        <p className="mrg-menubar__guide" data-slot="menubar-keyboard-guide" id={guideId}>
          {keyboardGuideText}
        </p>
      ) : null}
    </div>
  );
});

Menubar.displayName = "Menubar";
