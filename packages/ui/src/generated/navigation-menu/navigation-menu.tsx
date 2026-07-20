// Generated from registry/source/components/navigation-menu/navigation-menu.tsx by @mergora-internal/source-transformer. Do not edit.
"use client";

import {
  forwardRef,
  useId,
  useRef,
  useState,
  type FocusEvent,
  type KeyboardEvent,
  type MouseEvent,
  type ReactNode,
} from "react";

import "./navigation-menu.css";

export interface NavigationMenuLinkItem {
  /** Optional visible supporting copy rendered beneath the destination label. */
  readonly description?: ReactNode;
  /** Replaces the anchor with a non-interactive aria-disabled presentation. */
  readonly disabled?: boolean;
  /** Safe anchor destination rejected when it uses a prohibited executable protocol. */
  readonly href: string;
  /** Non-empty identity unique across root links, groups, and nested links. */
  readonly id: string;
  /** Visible destination or group-trigger copy presented to navigation users. */
  readonly label: ReactNode;
  /** Discriminates a direct link; omission remains the concise link default. */
  readonly type?: "link";
}

export interface NavigationMenuGroupItem {
  /** Non-empty identity unique across root links, groups, and nested links. */
  readonly id: string;
  /** Visible destination or group-trigger copy presented to navigation users. */
  readonly label: ReactNode;
  /** Non-empty destinations revealed by this group's disclosure trigger. */
  readonly links: readonly NavigationMenuLinkItem[];
  /** Discriminates a group whose trigger controls a nested destination panel. */
  readonly type: "group";
}

export type NavigationMenuItem = NavigationMenuGroupItem | NavigationMenuLinkItem;

export interface NavigationMenuProps extends Omit<
  React.ComponentPropsWithoutRef<"nav">,
  "children"
> {
  /** Link identity exposed as aria-current="page" wherever that destination appears. */
  readonly currentId?: string;
  /** Initial expanded group for uncontrolled use; omitted values begin with every group closed. */
  readonly defaultOpenGroupId?: string;
  /** Non-empty root model kept in logical source order across wide and narrow layouts. */
  readonly items: readonly NavigationMenuItem[];
  /** Accessible name applied to the native navigation landmark. */
  readonly label?: string;
  /** Receives enabled link activation before automatic group close; preventDefault keeps it open. */
  readonly onNavigate?: (
    event: MouseEvent<HTMLAnchorElement>,
    item: NavigationMenuLinkItem,
  ) => void;
  /** Reports each proposed group identity, or null when keyboard or pointer dismissal closes it. */
  readonly onOpenGroupChange?: (id: string | null) => void;
  /** Controlled open-group identity; null closes all groups and undefined enables internal state. */
  readonly openGroupId?: string | null;
  /** Optional rich destination preview; omission removes its focus/pointer handlers and region. */
  readonly renderLinkPreview?: (item: NavigationMenuLinkItem) => ReactNode;
  /** Accessible name for the optional preview aside when preview content is rendered. */
  readonly previewLabel?: string;
}

function isGroup(item: NavigationMenuItem): item is NavigationMenuGroupItem {
  return item.type === "group";
}

export function isSafeNavigationMenuHref(href: string): boolean {
  const normalized = href.trim();
  const protocolProbe = normalized.replace(/[\p{Cc}\s]/gu, "").toLowerCase();
  return normalized.length > 0 && !/^(?:data|javascript|vbscript):/u.test(protocolProbe);
}

export const NavigationMenu = forwardRef<HTMLElement, NavigationMenuProps>(function NavigationMenu(
  {
    className,
    currentId,
    defaultOpenGroupId,
    items,
    label = "Site navigation",
    onNavigate,
    onOpenGroupChange,
    openGroupId,
    previewLabel = "Destination preview",
    renderLinkPreview,
    ...props
  },
  ref,
) {
  if (items.length === 0) throw new Error("Mergora NavigationMenu requires at least one item.");
  const ids = new Set<string>();
  const groupIds = new Set<string>();
  const linkIds = new Set<string>();
  for (const item of items) {
    if (item.id.trim().length === 0 || ids.has(item.id)) {
      throw new Error("Mergora NavigationMenu ids must be non-empty and unique.");
    }
    ids.add(item.id);
    if (isGroup(item)) {
      groupIds.add(item.id);
      if (item.links.length === 0) {
        throw new Error("Mergora NavigationMenu groups require at least one link.");
      }
      for (const link of item.links) {
        if (link.id.trim().length === 0 || ids.has(link.id)) {
          throw new Error("Mergora NavigationMenu ids must be non-empty and unique.");
        }
        ids.add(link.id);
        linkIds.add(link.id);
        if (!isSafeNavigationMenuHref(link.href)) {
          throw new Error("Mergora NavigationMenu href uses a prohibited protocol.");
        }
      }
    } else {
      linkIds.add(item.id);
      if (!isSafeNavigationMenuHref(item.href)) {
        throw new Error("Mergora NavigationMenu href uses a prohibited protocol.");
      }
    }
  }
  if (currentId !== undefined && !linkIds.has(currentId)) {
    throw new Error("Mergora NavigationMenu currentId must identify a link.");
  }
  if (defaultOpenGroupId !== undefined && !groupIds.has(defaultOpenGroupId)) {
    throw new Error("Mergora NavigationMenu defaultOpenGroupId must identify a group.");
  }
  if (openGroupId !== undefined && openGroupId !== null && !groupIds.has(openGroupId)) {
    throw new Error("Mergora NavigationMenu openGroupId must identify a group.");
  }
  const [uncontrolledOpenGroupId, setUncontrolledOpenGroupId] = useState<string | null>(
    defaultOpenGroupId ?? null,
  );
  const [previewItem, setPreviewItem] = useState<NavigationMenuLinkItem | null>(null);
  const resolvedOpenGroupId = openGroupId === undefined ? uncontrolledOpenGroupId : openGroupId;
  const instanceId = useId().replaceAll(":", "");
  const triggerRefs = useRef(new Map<string, HTMLButtonElement>());
  const setGroup = (id: string | null) => {
    if (openGroupId === undefined) setUncontrolledOpenGroupId(id);
    onOpenGroupChange?.(id);
    setPreviewItem(null);
  };
  const closeFromPanel = (event: KeyboardEvent<HTMLDivElement>, groupId: string) => {
    if (event.key !== "Escape") return;
    event.preventDefault();
    setGroup(null);
    queueMicrotask(() => triggerRefs.current.get(groupId)?.focus());
  };
  const previewEvents = (item: NavigationMenuLinkItem) =>
    renderLinkPreview === undefined
      ? {}
      : {
          onFocus: (_event: FocusEvent<HTMLAnchorElement>) => setPreviewItem(item),
          onPointerEnter: () => setPreviewItem(item),
        };
  const renderLink = (item: NavigationMenuLinkItem, previewEnabled = false) => (
    <li key={item.id}>
      {item.disabled ? (
        <span
          aria-current={item.id === currentId ? "page" : undefined}
          aria-disabled="true"
          className="mrg-navigation-menu__link"
          data-disabled=""
        >
          <span>{item.label}</span>
          {item.description === undefined ? null : <small>{item.description}</small>}
        </span>
      ) : (
        <a
          {...(previewEnabled ? previewEvents(item) : {})}
          aria-current={item.id === currentId ? "page" : undefined}
          className="mrg-navigation-menu__link"
          href={item.href}
          onClick={(event) => {
            onNavigate?.(event, item);
            if (!event.defaultPrevented) setGroup(null);
          }}
        >
          <span>{item.label}</span>
          {item.description === undefined ? null : <small>{item.description}</small>}
        </a>
      )}
    </li>
  );
  return (
    <nav
      {...props}
      aria-label={label}
      className={["mrg-navigation-menu", className].filter(Boolean).join(" ")}
      data-enhanced-preview={renderLinkPreview === undefined ? undefined : ""}
      data-slot="navigation-menu"
      ref={ref}
    >
      <ul className="mrg-navigation-menu__root" data-slot="navigation-menu-list">
        {items.map((item) => {
          if (!isGroup(item)) return renderLink(item);
          const open = item.id === resolvedOpenGroupId;
          const panelId = `mrg-navigation-menu-${instanceId}-${item.id}`;
          const previewContent =
            renderLinkPreview === undefined ||
            previewItem === null ||
            !item.links.some((link) => link.id === previewItem.id)
              ? null
              : renderLinkPreview(previewItem);
          return (
            <li data-open={open ? "" : undefined} data-slot="navigation-menu-group" key={item.id}>
              <button
                aria-controls={panelId}
                aria-expanded={open}
                className="mrg-navigation-menu__trigger"
                onClick={() => setGroup(open ? null : item.id)}
                ref={(node) => {
                  if (node === null) triggerRefs.current.delete(item.id);
                  else triggerRefs.current.set(item.id, node);
                }}
                type="button"
              >
                {item.label}
                <span aria-hidden="true">⌄</span>
              </button>
              <div
                className="mrg-navigation-menu__panel"
                data-slot="navigation-menu-panel"
                hidden={!open}
                id={panelId}
                onKeyDown={(event) => closeFromPanel(event, item.id)}
              >
                <ul>{item.links.map((link) => renderLink(link, true))}</ul>
                {previewContent === null || previewItem === null ? null : (
                  <aside
                    aria-label={previewLabel}
                    className="mrg-navigation-menu__preview"
                    data-slot="navigation-menu-preview"
                  >
                    {previewContent}
                  </aside>
                )}
              </div>
            </li>
          );
        })}
      </ul>
    </nav>
  );
});

NavigationMenu.displayName = "NavigationMenu";
