// Generated from registry/source/components/notification-center/notification-center.tsx by @mergora-internal/source-transformer. Do not edit.
"use client";

import "./notification-center.css";

import { forwardRef, useId, useMemo, useState, type HTMLAttributes, type ReactNode } from "react";

import { Button } from "../button/button.js";

export type NotificationCenterFilter = "all" | "unread";
export type NotificationCenterGrouping = false | "category" | "date";

export interface NotificationCenterItem {
  /** Supplies an optional domain-neutral grouping label. */
  readonly category?: string;
  /** Supplies a valid timestamp used for display and optional date grouping. */
  readonly createdAt: Date | string;
  /** Adds supporting notification content without changing activation. */
  readonly description?: ReactNode;
  /** Provides the non-empty stable identity used by read and selection state. */
  readonly id: string;
  /** Sets the initial read state when uncontrolled read identifiers are omitted. */
  readonly read?: boolean;
  /** Presents the notification’s primary visible content. */
  readonly title: ReactNode;
}

export interface NotificationCenterVirtualWindow {
  /** Supplies the estimated row size used to preserve off-window scroll space. */
  readonly estimatedItemSize?: number;
  /** Sets the zero-based first notification rendered in the window. */
  readonly startIndex: number;
  /** Sets the maximum number of notifications rendered in the window. */
  readonly windowSize: number;
}

export interface NotificationCenterProps extends Omit<
  HTMLAttributes<HTMLElement>,
  "children" | "defaultValue" | "onChange"
> {
  /** Adds a polite output that reports successful built-in read-state changes. */
  readonly announceReadChanges?: boolean;
  /** Adds visible-item selection and mark-read or mark-unread controls. */
  readonly bulkActions?: boolean;
  /** Initial filter for uncontrolled use; defaults to `all`. */
  readonly defaultFilter?: NotificationCenterFilter;
  /** Initial read identities for uncontrolled use, overriding item-level `read` defaults. */
  readonly defaultReadIds?: readonly string[];
  /** Disables built-in filters, item controls, retry, queued reveal, and selection. */
  readonly disabled?: boolean;
  /** Content shown when the active filter has no items and no loading or error state. */
  readonly emptyContent?: ReactNode;
  /** Error content rendered in an alert region; suppresses the item list while present. */
  readonly error?: ReactNode;
  /** Controlled active filter; changes are proposed through `onFilterChange`. */
  readonly filter?: NotificationCenterFilter;
  /** Optional category or locale-aware date grouping; defaults to no group headings. */
  readonly groupBy?: NotificationCenterGrouping;
  /** Visible heading; string values also name the outer section. */
  readonly label?: ReactNode;
  /** Enables a polite pending-update queue when set to `queue`; defaults to false. */
  readonly liveUpdatePolicy?: false | "queue";
  /** Marks the section busy, shows a status message, and suppresses the item list. */
  readonly loading?: boolean;
  /** Locale used for date group labels and notification timestamps; defaults to `en-US`. */
  readonly locale?: string;
  /** Notification records with non-empty unique identities and valid timestamps. */
  readonly notifications: readonly NotificationCenterItem[];
  /** Receives each filter selected through the built-in filter controls. */
  readonly onFilterChange?: (filter: NotificationCenterFilter) => void;
  /** Converts each item title to a button and receives the activated notification. */
  readonly onOpen?: (notification: NotificationCenterItem) => void;
  /** Receives proposed controlled or committed uncontrolled read identities. */
  readonly onReadIdsChange?: (ids: readonly string[]) => void;
  /** Adds and handles the built-in retry button while `error` is present. */
  readonly onRetry?: () => void;
  /** Handles the queued-update reveal button when pending live items exist. */
  readonly onRevealPending?: () => void;
  /** Non-negative safe-integer count displayed by the queued live-update rail. */
  readonly pendingLiveCount?: number;
  /** Controlled read identities; changes are proposed through `onReadIdsChange`. */
  readonly readIds?: readonly string[];
  /** Disables built-in read mutations and bulk selection while preserving navigation. */
  readonly readOnly?: boolean;
  /** Renders a consumer-owned action area for each visible notification. */
  readonly renderAction?: (notification: NotificationCenterItem) => ReactNode;
  /** Optional bounded slice with spacers and set-position semantics; defaults to false. */
  readonly virtualWindow?: false | NotificationCenterVirtualWindow;
}

interface GroupedNotifications {
  readonly id: string;
  readonly label: string;
  readonly notifications: readonly NotificationCenterItem[];
}

function toDate(value: Date | string): Date {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.valueOf())) {
    throw new RangeError("Mergora NotificationCenter timestamps must be valid dates.");
  }
  return date;
}

export function groupNotifications(
  notifications: readonly NotificationCenterItem[],
  groupBy: NotificationCenterGrouping,
  locale = "en-US",
): readonly GroupedNotifications[] {
  if (groupBy === false) {
    return [{ id: "all", label: "Notifications", notifications }];
  }
  const groups = new Map<string, { label: string; notifications: NotificationCenterItem[] }>();
  for (const notification of notifications) {
    const date = toDate(notification.createdAt);
    const id =
      groupBy === "category"
        ? (notification.category?.trim() ?? "") || "uncategorized"
        : date.toISOString().slice(0, 10);
    const label =
      groupBy === "category"
        ? (notification.category?.trim() ?? "") || "Other"
        : new Intl.DateTimeFormat(locale, { dateStyle: "long" }).format(date);
    const current = groups.get(id) ?? { label, notifications: [] };
    current.notifications.push(notification);
    groups.set(id, current);
  }
  return [...groups].map(([id, group]) => ({ id, ...group }));
}

function assertIdentities(notifications: readonly NotificationCenterItem[]): void {
  const ids = notifications.map((notification) => notification.id);
  if (ids.some((id) => id.trim().length === 0) || new Set(ids).size !== ids.length) {
    throw new Error("Mergora NotificationCenter notification ids must be non-empty and unique.");
  }
}

function assertVirtualWindow(
  virtualWindow: false | NotificationCenterVirtualWindow,
  length: number,
): void {
  if (virtualWindow === false) return;
  if (
    !Number.isSafeInteger(virtualWindow.startIndex) ||
    virtualWindow.startIndex < 0 ||
    !Number.isSafeInteger(virtualWindow.windowSize) ||
    virtualWindow.windowSize < 1 ||
    (virtualWindow.estimatedItemSize !== undefined && virtualWindow.estimatedItemSize <= 0) ||
    (length > 0 && virtualWindow.startIndex >= length)
  ) {
    throw new RangeError(
      "Mergora NotificationCenter virtualWindow requires a bounded start, size, and item estimate.",
    );
  }
}

export const NotificationCenter = forwardRef<HTMLElement, NotificationCenterProps>(
  function NotificationCenter(
    {
      announceReadChanges = false,
      bulkActions = false,
      className,
      defaultFilter = "all",
      defaultReadIds,
      disabled = false,
      emptyContent = "No notifications match this view.",
      error,
      filter,
      groupBy = false,
      label = "Notifications",
      liveUpdatePolicy = false,
      loading = false,
      locale = "en-US",
      notifications,
      onFilterChange,
      onOpen,
      onReadIdsChange,
      onRetry,
      onRevealPending,
      pendingLiveCount = 0,
      readIds,
      readOnly = false,
      renderAction,
      virtualWindow = false,
      ...props
    },
    ref,
  ) {
    assertIdentities(notifications);
    if (filter !== undefined && defaultFilter !== "all") {
      throw new Error(
        "Mergora NotificationCenter controlled filter cannot be combined with defaultFilter.",
      );
    }
    if (readIds !== undefined && defaultReadIds !== undefined) {
      throw new Error(
        "Mergora NotificationCenter controlled readIds cannot be combined with defaultReadIds.",
      );
    }
    if (!Number.isSafeInteger(pendingLiveCount) || pendingLiveCount < 0) {
      throw new RangeError("Mergora NotificationCenter pendingLiveCount must be non-negative.");
    }
    if (liveUpdatePolicy === "queue" && pendingLiveCount > 0 && onRevealPending === undefined) {
      throw new Error(
        "Mergora NotificationCenter queued live updates require onRevealPending when updates exist.",
      );
    }
    const allIds = useMemo(
      () => new Set(notifications.map((notification) => notification.id)),
      [notifications],
    );
    const instanceId = `mrg-notification-center-${useId().replaceAll(":", "")}`;
    const [localFilter, setLocalFilter] = useState(defaultFilter);
    const [localReadIds, setLocalReadIds] = useState<readonly string[]>(
      defaultReadIds ??
        notifications.filter((notification) => notification.read).map(({ id }) => id),
    );
    const [selectedIds, setSelectedIds] = useState<readonly string[]>([]);
    const [announcement, setAnnouncement] = useState("");
    const resolvedFilter = filter ?? localFilter;
    const resolvedReadIds = (readIds ?? localReadIds).filter((id) => allIds.has(id));
    const readSet = useMemo(() => new Set(resolvedReadIds), [resolvedReadIds]);
    const filtered = notifications.filter(
      (notification) => resolvedFilter === "all" || !readSet.has(notification.id),
    );
    assertVirtualWindow(virtualWindow, filtered.length);
    const visible =
      virtualWindow === false
        ? filtered
        : filtered.slice(
            virtualWindow.startIndex,
            virtualWindow.startIndex + virtualWindow.windowSize,
          );
    const positionById = new Map(
      filtered.map((notification, index) => [notification.id, index + 1]),
    );
    const groups = groupNotifications(visible, groupBy, locale);
    const selectedSet = new Set(selectedIds.filter((id) => visible.some((item) => item.id === id)));

    const setFilter = (next: NotificationCenterFilter): void => {
      if (disabled) return;
      if (filter === undefined) setLocalFilter(next);
      onFilterChange?.(next);
    };
    const setRead = (ids: readonly string[], read: boolean): void => {
      if (disabled || readOnly) return;
      const next = read
        ? [...new Set([...resolvedReadIds, ...ids])]
        : resolvedReadIds.filter((id) => !ids.includes(id));
      if (readIds === undefined) setLocalReadIds(next);
      onReadIdsChange?.(next);
      if (announceReadChanges) {
        setAnnouncement(
          `${ids.length} notification${ids.length === 1 ? "" : "s"} marked ${read ? "read" : "unread"}.`,
        );
      }
    };

    return (
      <section
        {...props}
        aria-busy={loading || undefined}
        aria-label={typeof label === "string" ? label : "Notifications"}
        className={
          className === undefined
            ? "mrg-notification-center"
            : `mrg-notification-center ${className}`
        }
        data-slot="notification-center"
        ref={ref}
      >
        <header data-slot="notification-center-header">
          <div>
            <h2>{label}</h2>
            <p>
              {notifications.length - readSet.size} unread of {notifications.length}
            </p>
          </div>
          <div aria-label="Notification filter" data-slot="notification-center-filter" role="group">
            <Button
              aria-pressed={resolvedFilter === "all"}
              disabled={disabled}
              onClick={() => setFilter("all")}
              variant="secondary"
            >
              All
            </Button>
            <Button
              aria-pressed={resolvedFilter === "unread"}
              disabled={disabled}
              onClick={() => setFilter("unread")}
              variant="secondary"
            >
              Unread
            </Button>
          </div>
        </header>

        {liveUpdatePolicy === "queue" && pendingLiveCount > 0 ? (
          <aside aria-live="polite" data-slot="notification-center-live-queue">
            <span>
              {pendingLiveCount} new notification{pendingLiveCount === 1 ? "" : "s"} waiting
            </span>
            <Button disabled={disabled} onClick={onRevealPending} variant="secondary">
              Show new notifications
            </Button>
          </aside>
        ) : null}

        {bulkActions ? (
          <div data-slot="notification-center-bulk">
            <label>
              <input
                checked={visible.length > 0 && selectedSet.size === visible.length}
                disabled={disabled || readOnly || visible.length === 0}
                onChange={(event) =>
                  setSelectedIds(event.currentTarget.checked ? visible.map(({ id }) => id) : [])
                }
                type="checkbox"
              />
              Select visible notifications
            </label>
            <div data-slot="notification-center-actions">
              <Button
                disabled={disabled || readOnly || selectedSet.size === 0}
                onClick={() => setRead([...selectedSet], true)}
                variant="secondary"
              >
                Mark selected read
              </Button>
              <Button
                disabled={disabled || readOnly || selectedSet.size === 0}
                onClick={() => setRead([...selectedSet], false)}
                variant="secondary"
              >
                Mark selected unread
              </Button>
            </div>
          </div>
        ) : null}

        {error === undefined ? null : (
          <div data-slot="notification-center-error" role="alert">
            <span>{error}</span>
            {onRetry === undefined ? null : (
              <Button disabled={disabled} onClick={onRetry} variant="secondary">
                Retry
              </Button>
            )}
          </div>
        )}
        {loading ? (
          <div data-slot="notification-center-loading" role="status">
            Loading notifications...
          </div>
        ) : null}
        {!loading && error === undefined && filtered.length === 0 ? (
          <div data-slot="notification-center-empty">{emptyContent}</div>
        ) : null}

        {!loading && error === undefined && filtered.length > 0 ? (
          <div data-slot="notification-center-groups">
            {virtualWindow === false || virtualWindow.startIndex === 0 ? null : (
              <div
                aria-hidden="true"
                data-slot="notification-center-virtual-before"
                style={{
                  blockSize: virtualWindow.startIndex * (virtualWindow.estimatedItemSize ?? 88),
                }}
              />
            )}
            {groups.map((group, groupIndex) => {
              const headingId = `${instanceId}-group-${String(groupIndex)}`;
              return (
                <section
                  aria-label={groupBy === false ? "Notification items" : undefined}
                  aria-labelledby={groupBy === false ? undefined : headingId}
                  key={group.id}
                >
                  {groupBy === false ? null : <h3 id={headingId}>{group.label}</h3>}
                  <ol aria-label={groupBy === false ? "Notification items" : undefined}>
                    {group.notifications.map((notification) => {
                      const read = readSet.has(notification.id);
                      const date = toDate(notification.createdAt);
                      const position = positionById.get(notification.id)!;
                      return (
                        <li
                          aria-posinset={virtualWindow === false ? undefined : position}
                          aria-setsize={virtualWindow === false ? undefined : filtered.length}
                          data-read={read || undefined}
                          key={notification.id}
                        >
                          <article>
                            {bulkActions ? (
                              <label data-slot="notification-center-select">
                                <input
                                  aria-label={`Select ${typeof notification.title === "string" ? notification.title : "notification"}`}
                                  checked={selectedSet.has(notification.id)}
                                  disabled={disabled || readOnly}
                                  onChange={(event) =>
                                    setSelectedIds((current) =>
                                      event.currentTarget.checked
                                        ? [...new Set([...current, notification.id])]
                                        : current.filter((id) => id !== notification.id),
                                    )
                                  }
                                  type="checkbox"
                                />
                              </label>
                            ) : null}
                            <span aria-hidden="true" data-slot="notification-center-mark" />
                            <div data-slot="notification-center-copy">
                              {onOpen === undefined ? (
                                <strong>{notification.title}</strong>
                              ) : (
                                <button
                                  disabled={disabled}
                                  onClick={() => onOpen(notification)}
                                  type="button"
                                >
                                  {notification.title}
                                </button>
                              )}
                              {notification.description === undefined ? null : (
                                <p>{notification.description}</p>
                              )}
                              <time dateTime={date.toISOString()}>
                                {new Intl.DateTimeFormat(locale, {
                                  dateStyle: "medium",
                                  timeStyle: "short",
                                }).format(date)}
                              </time>
                            </div>
                            <div data-slot="notification-center-actions">
                              <Button
                                disabled={disabled || readOnly}
                                onClick={() => setRead([notification.id], !read)}
                                variant="quiet"
                              >
                                Mark {read ? "unread" : "read"}
                              </Button>
                              {renderAction?.(notification)}
                            </div>
                          </article>
                        </li>
                      );
                    })}
                  </ol>
                </section>
              );
            })}
            {virtualWindow === false ||
            virtualWindow.startIndex + virtualWindow.windowSize >= filtered.length ? null : (
              <div
                aria-hidden="true"
                data-slot="notification-center-virtual-after"
                style={{
                  blockSize:
                    (filtered.length - virtualWindow.startIndex - virtualWindow.windowSize) *
                    (virtualWindow.estimatedItemSize ?? 88),
                }}
              />
            )}
          </div>
        ) : null}

        {announceReadChanges ? (
          <output aria-live="polite" data-slot="notification-center-announcer">
            {announcement}
          </output>
        ) : null}
      </section>
    );
  },
);

NotificationCenter.displayName = "NotificationCenter";
