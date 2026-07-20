"use client";

import "./virtual-list.css";

import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type HTMLAttributes,
  type KeyboardEvent,
  type ReactElement,
  type ReactNode,
  type UIEvent,
} from "react";

export interface VirtualListProps<TData extends object> extends Omit<
  HTMLAttributes<HTMLDivElement>,
  "children" | "onChange"
> {
  /** Ordered source models represented by the virtualized listbox. */
  readonly items: readonly TData[];
  /** Returns a stable unique identifier for an item and its active state. */
  readonly getItemId: (item: TData) => string;
  /** Renders one materialized item with its current index and active state. */
  readonly renderItem: (
    item: TData,
    state: {
      /** Whether this item currently owns the active selection treatment. */
      readonly active: boolean;
      /** Zero-based position of this item in the complete source collection. */
      readonly index: number;
    },
  ) => ReactNode;
  /** Accessible name applied to the listbox viewport. */
  readonly label: string;
  /** Fixed viewport block size in pixels used for window calculations. */
  readonly viewportHeight: number;
  /** Returns an exact pixel size for an item when rows have variable heights. */
  readonly getItemSize?: (item: TData, index: number) => number;
  /** Fallback row size used for measurement and load-more proximity; defaults to 48. */
  readonly estimatedItemSize?: number;
  /** Number of extra items materialized before and after the visible window. */
  readonly overscan?: number;
  /** Controlled active item identifier, or null when no item is active. */
  readonly activeId?: string | null;
  /** Initial active item identifier for uncontrolled use. */
  readonly defaultActiveId?: string | null;
  /** Reports keyboard or pointer changes to the active item. */
  readonly onActiveIdChange?: (
    id: string,
    detail: {
      /** Interaction channel that activated the item. */
      readonly reason: "keyboard" | "pointer";
    },
  ) => void;
  /** Marks the listbox busy and renders optional loading content. */
  readonly loading?: boolean;
  /** Visible status content rendered while loading; defaults to Loading more items. */
  readonly loadingContent?: ReactNode;
  /** Indicates that another page is available near the scroll boundary. */
  readonly hasMore?: boolean;
  /** Requests one additional page when the viewport reaches the load-more threshold. */
  readonly onLoadMore?: () => void;
  /** Adds a polite active-position summary; false removes the output entirely. */
  readonly showPositionSummary?: boolean;
}

function classes(...values: readonly (string | undefined | false)[]): string {
  return values.filter((value): value is string => Boolean(value)).join(" ");
}

export function VirtualList<TData extends object>({
  items,
  getItemId,
  renderItem,
  label,
  viewportHeight,
  getItemSize,
  estimatedItemSize = 48,
  overscan = 2,
  activeId,
  defaultActiveId = null,
  onActiveIdChange,
  loading = false,
  loadingContent = "Loading more items",
  hasMore = false,
  onLoadMore,
  showPositionSummary = false,
  className,
  onKeyDown: consumerOnKeyDown,
  onScroll: consumerOnScroll,
  style,
  ...props
}: VirtualListProps<TData>): ReactElement {
  const [scrollTop, setScrollTop] = useState(0);
  const [internalActive, setInternalActive] = useState<string | null>(defaultActiveId);
  const currentActive = activeId === undefined ? internalActive : activeId;
  const itemRefs = useRef(new Map<string, HTMLDivElement>());
  const viewportRef = useRef<HTMLDivElement>(null);
  const requestedLength = useRef<number | null>(null);
  const measurements = useMemo(() => {
    let offset = 0;
    return items.map((item, index) => {
      const size = Math.max(1, getItemSize?.(item, index) ?? estimatedItemSize);
      const measurement = { offset, size };
      offset += size;
      return measurement;
    });
  }, [estimatedItemSize, getItemSize, items]);
  const totalSize = measurements.reduce((sum, item) => sum + item.size, 0);
  const firstVisible = Math.max(
    0,
    measurements.findIndex((item) => item.offset + item.size >= scrollTop),
  );
  const afterViewport = measurements.findIndex((item) => item.offset > scrollTop + viewportHeight);
  const lastVisible = afterViewport === -1 ? items.length - 1 : afterViewport;
  const start = Math.max(0, firstVisible - overscan);
  const end = Math.min(items.length, lastVisible + overscan + 1);

  const commitActive = (id: string, reason: "keyboard" | "pointer") => {
    if (activeId === undefined) setInternalActive(id);
    onActiveIdChange?.(id, { reason });
  };

  useEffect(() => {
    if (currentActive === null) return;
    itemRefs.current.get(currentActive)?.focus({ preventScroll: true });
  }, [currentActive, start, end]);

  useEffect(() => {
    const viewport = viewportRef.current;
    if (viewport !== null && viewport.scrollTop !== scrollTop) viewport.scrollTop = scrollTop;
  }, [scrollTop]);

  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    consumerOnKeyDown?.(event);
    if (event.defaultPrevented) return;
    if (items.length === 0) return;
    const index = Math.max(
      0,
      items.findIndex((item) => getItemId(item) === currentActive),
    );
    let nextIndex: number | null = null;
    if (event.key === "ArrowDown") nextIndex = Math.min(items.length - 1, index + 1);
    if (event.key === "ArrowUp") nextIndex = Math.max(0, index - 1);
    if (event.key === "Home") nextIndex = 0;
    if (event.key === "End") nextIndex = items.length - 1;
    if (nextIndex === null) return;
    event.preventDefault();
    const item = items[nextIndex]!;
    const measurement = measurements[nextIndex]!;
    setScrollTop(
      Math.max(0, measurement.offset - Math.max(0, (viewportHeight - measurement.size) / 2)),
    );
    commitActive(getItemId(item), "keyboard");
  };

  const handleScroll = (event: UIEvent<HTMLDivElement>) => {
    consumerOnScroll?.(event);
    if (event.defaultPrevented) return;
    const next = event.currentTarget.scrollTop;
    setScrollTop(next);
    if (
      hasMore &&
      !loading &&
      onLoadMore !== undefined &&
      next + viewportHeight >= totalSize - estimatedItemSize &&
      requestedLength.current !== items.length
    ) {
      requestedLength.current = items.length;
      onLoadMore();
    }
  };
  const activeIndex =
    currentActive === null ? -1 : items.findIndex((item) => getItemId(item) === currentActive);

  return (
    <div
      className={classes("mrg-virtual-list", className)}
      data-slot="virtual-list"
      role="region"
      aria-label={`${label} virtual list`}
    >
      <div
        {...props}
        ref={viewportRef}
        role="listbox"
        aria-label={label}
        aria-busy={loading || undefined}
        className="mrg-virtual-list__viewport"
        data-slot="virtual-list-viewport"
        style={{ ...style, blockSize: viewportHeight }}
        onKeyDown={handleKeyDown}
        onScroll={handleScroll}
      >
        <div className="mrg-virtual-list__spacer" style={{ blockSize: totalSize }}>
          {items.slice(start, end).map((item, relativeIndex) => {
            const index = start + relativeIndex;
            const id = getItemId(item);
            const active = currentActive === id;
            const measurement = measurements[index]!;
            return (
              <div
                key={id}
                ref={(node) => {
                  if (node === null) itemRefs.current.delete(id);
                  else itemRefs.current.set(id, node);
                }}
                role="option"
                aria-selected={active}
                aria-posinset={index + 1}
                aria-setsize={items.length}
                tabIndex={active || (currentActive === null && index === 0) ? 0 : -1}
                className="mrg-virtual-list__item"
                data-active={active || undefined}
                style={{
                  blockSize: measurement.size,
                  transform: `translateY(${measurement.offset}px)`,
                }}
                onClick={() => commitActive(id, "pointer")}
              >
                {renderItem(item, { active, index })}
              </div>
            );
          })}
          {loading ? (
            <div
              role="status"
              className="mrg-virtual-list__loading"
              style={{ transform: `translateY(${totalSize}px)` }}
            >
              {loadingContent}
            </div>
          ) : null}
        </div>
      </div>
      {showPositionSummary ? (
        <output
          aria-live="polite"
          className="mrg-virtual-list__summary"
          data-slot="virtual-list-position-summary"
        >
          {activeIndex < 0 ? `${items.length} items` : `Item ${activeIndex + 1} of ${items.length}`}
        </output>
      ) : null}
    </div>
  );
}
