"use client";

import {
  forwardRef,
  useEffect,
  useId,
  useRef,
  useState,
  type KeyboardEvent,
  type MouseEvent,
  type ReactNode,
} from "react";

import "./sidebar.css";

export interface SidebarItem {
  /** Replaces the anchor with a non-interactive aria-disabled navigation row. */
  readonly disabled?: boolean;
  /** Safe destination used after executable and malformed protocols are rejected. */
  readonly href: string;
  /** Optional decorative glyph hidden from assistive technology beside the text label. */
  readonly icon?: ReactNode;
  /** Non-empty identity unique across every group and addressable by currentId. */
  readonly id: string;
  /** Visible navigation copy retained when the desktop sidebar is collapsed. */
  readonly label: ReactNode;
}

export interface SidebarGroup {
  /** Initial disclosure state; omission starts the group's native details element open. */
  readonly defaultOpen?: boolean;
  /** Non-empty identity unique across group and item records in this sidebar. */
  readonly id: string;
  /** Non-empty set of navigation destinations owned by this disclosure group. */
  readonly items: readonly SidebarItem[];
  /** Visible group heading, with screen-reader text retained in collapsed desktop mode. */
  readonly label: ReactNode;
}

export interface SidebarPersistenceAdapter {
  /** Reads an optional uncontrolled collapsed preference without assuming a storage backend. */
  readonly read: () => boolean | undefined;
  /** Persists each proposed desktop collapsed state through consumer-owned storage. */
  readonly write: (collapsed: boolean) => void;
}

export function isSafeSidebarHref(href: string): boolean {
  const normalized = href.trim();
  const protocolProbe = normalized.replace(/[\p{Cc}\s]/gu, "").toLowerCase();
  return normalized.length > 0 && !/^(?:data|javascript|vbscript):/u.test(protocolProbe);
}

export interface SidebarProps extends Omit<React.ComponentPropsWithoutRef<"div">, "children"> {
  /** Localized mobile close-button text used after focus moves into the open panel. */
  readonly closeLabel?: string;
  /** Accessible name for the desktop control while the sidebar is expanded. */
  readonly collapseLabel?: string;
  /** Controlled desktop collapsed state; pair with onCollapsedChange to accept proposals. */
  readonly collapsed?: boolean;
  /** Item identity exposed as aria-current="page" in desktop and mobile navigation. */
  readonly currentId?: string;
  /** Initial desktop state for uncontrolled use before an optional persisted value is read. */
  readonly defaultCollapsed?: boolean;
  /** Initial responsive mobile-panel state for uncontrolled use. */
  readonly defaultMobileOpen?: boolean;
  /** Accessible name for the desktop control while the sidebar is collapsed. */
  readonly expandLabel?: string;
  /** Non-empty grouped model shared by desktop and logical-start mobile presentations. */
  readonly groups: readonly SidebarGroup[];
  /** Accessible name for desktop navigation; mobile navigation appends a mobile qualifier. */
  readonly label?: string;
  /** Localized trigger text used while the responsive mobile sidebar is closed. */
  readonly mobileLabel?: string;
  /** Controlled mobile-panel state with Escape close and trigger-focus restoration. */
  readonly mobileOpen?: boolean;
  /** Reports every proposed desktop collapsed state in controlled and uncontrolled modes. */
  readonly onCollapsedChange?: (collapsed: boolean) => void;
  /** Reports mobile open-state proposals from trigger, close button, navigation, or Escape. */
  readonly onMobileOpenChange?: (open: boolean) => void;
  /** Receives enabled anchor activation before mobile auto-close; preventDefault keeps it open. */
  readonly onNavigate?: (event: MouseEvent<HTMLAnchorElement>, item: SidebarItem) => void;
  /** Receives consumer persistence failures with the exact read or write operation. */
  readonly onPersistenceError?: (error: unknown, operation: "read" | "write") => void;
  /** Optional consumer-owned persistence; omission removes storage reads, writes, and failures. */
  readonly persistenceAdapter?: SidebarPersistenceAdapter;
}

export const Sidebar = forwardRef<HTMLDivElement, SidebarProps>(function Sidebar(
  {
    className,
    closeLabel = "Close sidebar",
    collapseLabel = "Collapse sidebar",
    collapsed,
    currentId,
    defaultCollapsed = false,
    defaultMobileOpen = false,
    expandLabel = "Expand sidebar",
    groups,
    label = "Section navigation",
    mobileLabel = "Open sidebar",
    mobileOpen,
    onCollapsedChange,
    onMobileOpenChange,
    onNavigate,
    onPersistenceError,
    persistenceAdapter,
    ...props
  },
  ref,
) {
  if (groups.length === 0) throw new Error("Mergora Sidebar requires at least one group.");
  const ids = new Set<string>();
  const itemIds = new Set<string>();
  for (const group of groups) {
    if (group.id.trim().length === 0 || ids.has(group.id) || group.items.length === 0) {
      throw new Error("Mergora Sidebar groups require unique ids and at least one item.");
    }
    ids.add(group.id);
    for (const item of group.items) {
      if (item.id.trim().length === 0 || ids.has(item.id)) {
        throw new Error("Mergora Sidebar ids must be non-empty and unique.");
      }
      ids.add(item.id);
      itemIds.add(item.id);
      if (!isSafeSidebarHref(item.href)) {
        throw new Error("Mergora Sidebar item href uses a prohibited protocol.");
      }
    }
  }
  if (currentId !== undefined && !itemIds.has(currentId)) {
    throw new Error("Mergora Sidebar currentId must identify an item.");
  }
  const [uncontrolledCollapsed, setUncontrolledCollapsed] = useState(defaultCollapsed);
  const [uncontrolledMobileOpen, setUncontrolledMobileOpen] = useState(defaultMobileOpen);
  const [openGroupIds, setOpenGroupIds] = useState<ReadonlySet<string>>(
    () => new Set(groups.filter((group) => group.defaultOpen ?? true).map((group) => group.id)),
  );
  const resolvedCollapsed = collapsed ?? uncontrolledCollapsed;
  const resolvedMobileOpen = mobileOpen ?? uncontrolledMobileOpen;
  const instanceId = useId().replaceAll(":", "");
  const mobileId = `mrg-sidebar-mobile-${instanceId}`;
  const mobileTriggerRef = useRef<HTMLButtonElement>(null);
  const mobileCloseRef = useRef<HTMLButtonElement>(null);
  const previousMobileOpenRef = useRef(resolvedMobileOpen);
  const returnFocusOnCloseRef = useRef(false);

  useEffect(() => {
    if (persistenceAdapter === undefined || collapsed !== undefined) return;
    try {
      const persisted = persistenceAdapter.read();
      if (persisted !== undefined) setUncontrolledCollapsed(persisted);
    } catch (error) {
      onPersistenceError?.(error, "read");
    }
  }, [collapsed, onPersistenceError, persistenceAdapter]);

  useEffect(() => {
    if (resolvedMobileOpen) queueMicrotask(() => mobileCloseRef.current?.focus());
  }, [resolvedMobileOpen]);

  useEffect(() => {
    if (previousMobileOpenRef.current && !resolvedMobileOpen && returnFocusOnCloseRef.current) {
      queueMicrotask(() => mobileTriggerRef.current?.focus());
    }
    if (!previousMobileOpenRef.current && resolvedMobileOpen) {
      returnFocusOnCloseRef.current = false;
    }
    previousMobileOpenRef.current = resolvedMobileOpen;
  }, [resolvedMobileOpen]);

  const setCollapsed = (next: boolean) => {
    if (collapsed === undefined) setUncontrolledCollapsed(next);
    onCollapsedChange?.(next);
    try {
      persistenceAdapter?.write(next);
    } catch (error) {
      onPersistenceError?.(error, "write");
    }
  };
  const setMobileOpen = (next: boolean, returnFocus = false) => {
    returnFocusOnCloseRef.current = !next && returnFocus;
    if (mobileOpen === undefined) setUncontrolledMobileOpen(next);
    onMobileOpenChange?.(next);
  };
  const handleMobileKeyDown = (event: KeyboardEvent<HTMLElement>) => {
    if (event.key !== "Escape") return;
    event.preventDefault();
    setMobileOpen(false, true);
  };
  const setGroupOpen = (id: string, next: boolean) => {
    setOpenGroupIds((current) => {
      const updated = new Set(current);
      if (next) updated.add(id);
      else updated.delete(id);
      return updated;
    });
  };
  const renderGroupItems = (group: SidebarGroup, mobile: boolean) => (
    <ul>
      {group.items.map((item) => (
        <li key={item.id}>
          {item.disabled ? (
            <span
              aria-current={item.id === currentId ? "page" : undefined}
              aria-disabled="true"
              className="mrg-sidebar__link"
              data-disabled=""
            >
              {item.icon === undefined ? null : (
                <span aria-hidden="true" data-slot="sidebar-icon">
                  {item.icon}
                </span>
              )}
              <span data-slot="sidebar-item-label">{item.label}</span>
            </span>
          ) : (
            <a
              aria-current={item.id === currentId ? "page" : undefined}
              className="mrg-sidebar__link"
              href={item.href}
              onClick={(event) => {
                onNavigate?.(event, item);
                if (mobile && !event.defaultPrevented) setMobileOpen(false);
              }}
            >
              {item.icon === undefined ? null : (
                <span aria-hidden="true" data-slot="sidebar-icon">
                  {item.icon}
                </span>
              )}
              <span data-slot="sidebar-item-label">{item.label}</span>
            </a>
          )}
        </li>
      ))}
    </ul>
  );
  const navigation = (mobile: boolean) => (
    <nav aria-label={mobile ? `${label} mobile` : label}>
      {groups.map((group) => {
        if (!mobile && resolvedCollapsed) {
          const groupLabelId = `mrg-sidebar-group-${instanceId}-${group.id}`;
          return (
            <div data-slot="sidebar-group" key={group.id}>
              <span className="mrg-sidebar__visually-hidden" id={groupLabelId}>
                {group.label}
              </span>
              <div aria-labelledby={groupLabelId} role="group">
                {renderGroupItems(group, false)}
              </div>
            </div>
          );
        }
        const groupOpen = openGroupIds.has(group.id);
        return (
          <details
            data-slot="sidebar-group"
            key={group.id}
            onToggle={(event) => {
              if (event.currentTarget.open !== groupOpen) {
                setGroupOpen(group.id, event.currentTarget.open);
              }
            }}
            open={groupOpen}
          >
            <summary>
              <span data-slot="sidebar-group-label">{group.label}</span>
            </summary>
            {renderGroupItems(group, mobile)}
          </details>
        );
      })}
    </nav>
  );

  return (
    <div
      {...props}
      className={["mrg-sidebar", className].filter(Boolean).join(" ")}
      data-collapsed={resolvedCollapsed ? "" : undefined}
      data-enhanced-persistence={persistenceAdapter === undefined ? undefined : ""}
      data-slot="sidebar"
      ref={ref}
    >
      <button
        aria-controls={mobileId}
        aria-expanded={resolvedMobileOpen}
        className="mrg-sidebar__mobile-trigger"
        data-slot="sidebar-mobile-trigger"
        onClick={() => setMobileOpen(!resolvedMobileOpen, resolvedMobileOpen)}
        ref={mobileTriggerRef}
        type="button"
      >
        {resolvedMobileOpen ? closeLabel : mobileLabel}
      </button>
      <aside className="mrg-sidebar__desktop" data-slot="sidebar-desktop">
        <button
          aria-label={resolvedCollapsed ? expandLabel : collapseLabel}
          className="mrg-sidebar__collapse"
          data-slot="sidebar-collapse"
          onClick={() => setCollapsed(!resolvedCollapsed)}
          type="button"
        >
          <span aria-hidden="true">{resolvedCollapsed ? "›" : "‹"}</span>
        </button>
        {navigation(false)}
      </aside>
      <aside
        className="mrg-sidebar__mobile"
        data-slot="sidebar-mobile"
        hidden={!resolvedMobileOpen}
        id={mobileId}
        onKeyDown={handleMobileKeyDown}
      >
        <button
          className="mrg-sidebar__mobile-close"
          onClick={() => setMobileOpen(false, true)}
          ref={mobileCloseRef}
          type="button"
        >
          {closeLabel}
        </button>
        {navigation(true)}
      </aside>
    </div>
  );
});

Sidebar.displayName = "Sidebar";
