"use client";

import { forwardRef, useState, type MouseEvent, type ReactNode } from "react";

import "./bottom-navigation.css";

export interface BottomNavigationItem {
  /** Renders the destination as a non-link disabled item. */
  readonly disabled?: boolean;
  /** Safe navigation destination for the item. */
  readonly href: string;
  /** Optional decorative icon hidden from the accessibility tree. */
  readonly icon?: ReactNode;
  /** Stable non-empty identifier, unique within the navigation. */
  readonly id: string;
  /** Visible destination name accompanying any icon. */
  readonly label: ReactNode;
}

export interface BottomNavigationOverflowOptions {
  /** Visible label for the native overflow disclosure. */
  readonly label: ReactNode;
  /** Maximum primary items retained before overflow recovery. */
  readonly maximumVisible: number;
}

export interface BottomNavigationLayout {
  /** Ordered destinations moved into the overflow disclosure. */
  readonly overflow: readonly BottomNavigationItem[];
  /** Ordered destinations retained in the primary navigation row. */
  readonly primary: readonly BottomNavigationItem[];
}

export function isSafeBottomNavigationHref(href: string): boolean {
  const normalized = href.trim();
  const protocolProbe = normalized.replace(/[\p{Cc}\s]/gu, "").toLowerCase();
  return normalized.length > 0 && !/^(?:data|javascript|vbscript):/u.test(protocolProbe);
}

function assertItems(items: readonly BottomNavigationItem[]): void {
  if (items.length === 0) throw new Error("Mergora BottomNavigation requires at least one item.");
  const ids = new Set<string>();
  for (const item of items) {
    if (item.id.trim().length === 0) {
      throw new Error("Mergora BottomNavigation item ids must be non-empty.");
    }
    if (ids.has(item.id)) throw new Error("Mergora BottomNavigation item ids must be unique.");
    ids.add(item.id);
    if (!isSafeBottomNavigationHref(item.href)) {
      throw new Error("Mergora BottomNavigation item href uses a prohibited protocol.");
    }
  }
}

export function getBottomNavigationLayout(
  items: readonly BottomNavigationItem[],
  currentId: string | undefined,
  overflow: false | BottomNavigationOverflowOptions,
): BottomNavigationLayout {
  if (overflow === false || items.length <= overflow.maximumVisible) {
    return { overflow: [], primary: items };
  }
  if (!Number.isSafeInteger(overflow.maximumVisible) || overflow.maximumVisible < 2) {
    throw new Error("Mergora BottomNavigation overflow maximumVisible must be at least two.");
  }
  const current = currentId === undefined ? undefined : items.find((item) => item.id === currentId);
  const primary = items.slice(0, overflow.maximumVisible - 1);
  if (current !== undefined && !primary.some((item) => item.id === current.id))
    primary.push(current);
  else {
    const next = items[overflow.maximumVisible - 1];
    if (next !== undefined) primary.push(next);
  }
  const primaryIds = new Set(primary.map((item) => item.id));
  return { overflow: items.filter((item) => !primaryIds.has(item.id)), primary };
}

export interface BottomNavigationProps extends Omit<
  React.ComponentPropsWithoutRef<"nav">,
  "children" | "onChange"
> {
  /** Controlled identifier of the current destination. */
  readonly currentId?: string;
  /** Initial current destination identifier for uncontrolled use. */
  readonly defaultCurrentId?: string;
  /** Non-empty ordered destination model. */
  readonly items: readonly BottomNavigationItem[];
  /** Accessible navigation name. */
  readonly label?: string;
  /** Reports current-destination changes after uncancelled navigation. */
  readonly onCurrentIdChange?: (id: string) => void;
  /** Receives link activation before current state or framework navigation commits. */
  readonly onNavigate?: (event: MouseEvent<HTMLAnchorElement>, item: BottomNavigationItem) => void;
  /** Optional bounded overflow recovery. False emits no disclosure, overflow UI, or handlers. */
  readonly overflow?: false | BottomNavigationOverflowOptions;
}

export const BottomNavigation = forwardRef<HTMLElement, BottomNavigationProps>(
  function BottomNavigation(
    {
      className,
      currentId,
      defaultCurrentId,
      items,
      label = "Primary destinations",
      onCurrentIdChange,
      onNavigate,
      overflow = false,
      ...props
    },
    ref,
  ) {
    assertItems(items);
    const [uncontrolledCurrentId, setUncontrolledCurrentId] = useState(defaultCurrentId);
    const resolvedCurrentId = currentId ?? uncontrolledCurrentId;
    if (resolvedCurrentId !== undefined && !items.some((item) => item.id === resolvedCurrentId)) {
      throw new Error("Mergora BottomNavigation currentId must identify an item.");
    }
    const layout = getBottomNavigationLayout(items, resolvedCurrentId, overflow);
    const activate = (event: MouseEvent<HTMLAnchorElement>, item: BottomNavigationItem) => {
      onNavigate?.(event, item);
      if (event.defaultPrevented) return;
      if (currentId === undefined) setUncontrolledCurrentId(item.id);
      onCurrentIdChange?.(item.id);
    };
    const renderItem = (item: BottomNavigationItem, compact = false) => (
      <li data-slot="bottom-navigation-item" key={item.id}>
        {item.disabled ? (
          <span
            aria-current={item.id === resolvedCurrentId ? "page" : undefined}
            aria-disabled="true"
            className="mrg-bottom-navigation__link"
            data-disabled=""
            data-overflow={compact ? "" : undefined}
          >
            {item.icon === undefined ? null : (
              <span aria-hidden="true" data-slot="bottom-navigation-icon">
                {item.icon}
              </span>
            )}
            <span data-slot="bottom-navigation-label">{item.label}</span>
          </span>
        ) : (
          <a
            aria-current={item.id === resolvedCurrentId ? "page" : undefined}
            className="mrg-bottom-navigation__link"
            data-overflow={compact ? "" : undefined}
            href={item.href}
            onClick={(event) => activate(event, item)}
          >
            {item.icon === undefined ? null : (
              <span aria-hidden="true" data-slot="bottom-navigation-icon">
                {item.icon}
              </span>
            )}
            <span data-slot="bottom-navigation-label">{item.label}</span>
          </a>
        )}
      </li>
    );

    return (
      <nav
        {...props}
        aria-label={label}
        className={["mrg-bottom-navigation", className].filter(Boolean).join(" ")}
        data-enhanced-overflow={overflow === false ? undefined : ""}
        data-slot="bottom-navigation"
        ref={ref}
      >
        <ul data-slot="bottom-navigation-list">
          {layout.primary.map((item) => renderItem(item))}
          {overflow === false || layout.overflow.length === 0 ? null : (
            <li data-slot="bottom-navigation-overflow">
              <details className="mrg-bottom-navigation__overflow">
                <summary>{overflow.label}</summary>
                <ul>{layout.overflow.map((item) => renderItem(item, true))}</ul>
              </details>
            </li>
          )}
        </ul>
      </nav>
    );
  },
);

BottomNavigation.displayName = "BottomNavigation";
