// Generated from registry/source/components/tree-view/tree-view.tsx by @mergora-internal/source-transformer. Do not edit.
"use client";

import {
  forwardRef,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type FocusEvent,
  type KeyboardEvent,
  type MouseEvent,
  type ReactNode,
} from "react";

import "./tree-view.css";

export type TreeViewDirection = "ltr" | "rtl";
export type TreeViewMoveDirection = "down" | "in" | "out" | "up";
export type TreeViewSelectionMode = "multiple" | "none" | "single";

export interface TreeViewItem {
  /** Eager child records revealed when this item is expanded. */
  readonly children?: readonly TreeViewItem[];
  /** Optional visible supporting copy rendered beneath the item label. */
  readonly description?: ReactNode;
  /** Removes pointer, keyboard, selection, expansion, rename, and move interaction. */
  readonly disabled?: boolean;
  /** Declares lazily available children when no eager children array exists yet. */
  readonly hasChildren?: boolean;
  /** Non-empty identity unique across the complete recursive tree. */
  readonly id: string;
  /** Visible tree-item copy used as the fallback typeahead value when it is a string. */
  readonly label: ReactNode;
  /** Explicit non-empty typeahead and generated-control text for rich labels. */
  readonly textValue?: string;
}

export interface TreeViewFlatItem {
  /** Zero-based position among siblings, used to expose one-based aria-posinset. */
  readonly indexInParent: number;
  /** Original recursive item represented by this visible flattened row. */
  readonly item: TreeViewItem;
  /** One-based hierarchy depth exposed through aria-level and logical indentation. */
  readonly level: number;
  /** Parent identity used by backward-arrow navigation, or null for a root item. */
  readonly parentId: string | null;
  /** Sibling count exposed through aria-setsize for assistive navigation. */
  readonly setSize: number;
}

export interface TreeViewMoveActions {
  /** Returns explicit structural moves for an item; omission enables all four directions. */
  readonly getAllowedDirections?: (item: TreeViewItem) => readonly TreeViewMoveDirection[];
  /** Localized button labels keyed by each enabled structural move direction. */
  readonly labels?: Partial<Record<TreeViewMoveDirection, string>>;
  /** Receives explicit non-drag move requests without mutating the consumer's tree. */
  readonly onMove: (item: TreeViewItem, direction: TreeViewMoveDirection) => void;
}

export interface TreeViewVirtualWindow {
  /** Positive estimated row size used only for inaccessible virtual spacer geometry. */
  readonly estimatedItemSize?: number;
  /** Non-negative rows rendered before and after the requested visible window. */
  readonly overscan?: number;
  /** Zero-based first requested visible row in the fully flattened tree. */
  readonly startIndex: number;
  /** Positive number of requested visible rows before overscan is applied. */
  readonly windowSize: number;
}

export interface TreeViewLoadError {
  /** Unknown rejection value retained for consumer-owned error presentation. */
  readonly error: unknown;
  /** Tree item whose lazy child request failed. */
  readonly item: TreeViewItem;
}

export function flattenTreeItems(
  items: readonly TreeViewItem[],
  expandedIds: ReadonlySet<string>,
): readonly TreeViewFlatItem[] {
  const output: TreeViewFlatItem[] = [];
  const visit = (siblings: readonly TreeViewItem[], level: number, parentId: string | null) => {
    siblings.forEach((item, indexInParent) => {
      output.push({ indexInParent, item, level, parentId, setSize: siblings.length });
      if (expandedIds.has(item.id) && item.children !== undefined) {
        visit(item.children, level + 1, item.id);
      }
    });
  };
  visit(items, 1, null);
  return output;
}

function assertUniqueValues(values: readonly string[], name: string): void {
  if (new Set(values).size !== values.length) {
    throw new Error(`Mergora TreeView ${name} must be unique.`);
  }
}

function getTextValue(item: TreeViewItem): string {
  if (item.textValue !== undefined) return item.textValue.trim();
  return typeof item.label === "string" ? item.label.trim() : "";
}

export interface TreeViewProps extends Omit<
  React.ComponentPropsWithoutRef<"div">,
  "children" | "onChange"
> {
  /** Controlled roving-focus identity for a visible enabled item. */
  readonly activeId?: string;
  /** Initial roving-focus identity for uncontrolled use, defaulting to the first enabled row. */
  readonly defaultActiveId?: string;
  /** Initial unique expanded identities for uncontrolled disclosure state. */
  readonly defaultExpandedIds?: readonly string[];
  /** Initial unique selected identities for uncontrolled selection state. */
  readonly defaultSelectedIds?: readonly string[];
  /** Sets native direction and reverses horizontal expand/parent arrow keys for RTL. */
  readonly direction?: TreeViewDirection;
  /** Controlled expanded identities; pair with onExpandedIdsChange to accept proposals. */
  readonly expandedIds?: readonly string[];
  /** Non-empty recursive model supporting arrows, Home/End, typeahead, and sibling expansion. */
  readonly items: readonly TreeViewItem[];
  /** Required accessible name applied to the native tree composite. */
  readonly label: string;
  /** Formats a visible alert for lazy-load failure; omission uses safe item text. */
  readonly loadErrorLabel?: (detail: TreeViewLoadError) => ReactNode;
  /** Formats visible polite loading status for an expanded lazy item. */
  readonly loadingLabel?: (item: TreeViewItem) => ReactNode;
  /** Optional explicit non-drag structural actions. False emits no buttons or move callbacks. */
  readonly moveActions?: false | TreeViewMoveActions;
  /** Reports roving-focus changes from keyboard, focus, pointer, or virtual navigation. */
  readonly onActiveIdChange?: (id: string) => void;
  /** Reports proposed expanded identity arrays in controlled and uncontrolled modes. */
  readonly onExpandedIdsChange?: (ids: readonly string[]) => void;
  /** Consumer-owned lazy child request invoked only for expanded unresolved branches. */
  readonly onLoadChildren?: (item: TreeViewItem) => Promise<void> | void;
  /** Enables F2 inline rename and receives non-empty commits before focus restoration. */
  readonly onRename?: (item: TreeViewItem, nextLabel: string) => void;
  /** Reports selection proposals from pointer, Enter/Space, or multiple-mode Ctrl+A. */
  readonly onSelectedIdsChange?: (ids: readonly string[]) => void;
  /** Required with virtualization to request a window containing the next keyboard target. */
  readonly onVirtualWindowChange?: (startIndex: number, activeIndex: number) => void;
  /** Adds consumer actions to each row; omission emits no action container. */
  readonly renderActions?: (item: TreeViewItem) => ReactNode;
  /** Controlled selected identities constrained by the active selection mode. */
  readonly selectedIds?: readonly string[];
  /** Controls aria-selected and selection behavior; none removes both from rows. */
  readonly selectionMode?: TreeViewSelectionMode;
  /** Bounded consumer-owned window, or false to render all rows without virtual spacers. */
  readonly virtualWindow?: false | TreeViewVirtualWindow;
}

export const TreeView = forwardRef<HTMLDivElement, TreeViewProps>(function TreeView(
  {
    activeId,
    className,
    defaultActiveId,
    defaultExpandedIds = [],
    defaultSelectedIds = [],
    direction = "ltr",
    expandedIds,
    items,
    label,
    loadErrorLabel = ({ item }) => `Could not load ${getTextValue(item) || "item"}.`,
    loadingLabel = (item) => `Loading ${getTextValue(item) || "item"}.`,
    moveActions = false,
    onActiveIdChange,
    onExpandedIdsChange,
    onLoadChildren,
    onRename,
    onSelectedIdsChange,
    onVirtualWindowChange,
    renderActions,
    selectedIds,
    selectionMode = "single",
    virtualWindow = false,
    ...props
  },
  ref,
) {
  if (items.length === 0) throw new Error("Mergora TreeView requires at least one item.");
  const itemMap = new Map<string, TreeViewItem>();
  const validateItems = (siblings: readonly TreeViewItem[]) => {
    for (const item of siblings) {
      if (item.id.trim().length === 0 || itemMap.has(item.id)) {
        throw new Error("Mergora TreeView item ids must be non-empty and unique.");
      }
      if (item.textValue !== undefined && item.textValue.trim().length === 0) {
        throw new Error("Mergora TreeView textValue must be non-empty when supplied.");
      }
      itemMap.set(item.id, item);
      if (item.children !== undefined) validateItems(item.children);
    }
  };
  validateItems(items);
  assertUniqueValues(defaultExpandedIds, "defaultExpandedIds");
  assertUniqueValues(defaultSelectedIds, "defaultSelectedIds");
  if (expandedIds !== undefined) assertUniqueValues(expandedIds, "expandedIds");
  if (selectedIds !== undefined) assertUniqueValues(selectedIds, "selectedIds");
  if (
    selectionMode === "none" &&
    (defaultSelectedIds.length > 0 || (selectedIds?.length ?? 0) > 0)
  ) {
    throw new Error("Mergora TreeView selection ids require single or multiple selection mode.");
  }
  if (
    selectionMode === "single" &&
    (defaultSelectedIds.length > 1 || (selectedIds?.length ?? 0) > 1)
  ) {
    throw new Error("Mergora TreeView single selection accepts at most one selected id.");
  }
  for (const id of [
    ...defaultExpandedIds,
    ...defaultSelectedIds,
    ...(expandedIds ?? []),
    ...(selectedIds ?? []),
  ]) {
    if (!itemMap.has(id)) throw new Error("Mergora TreeView state ids must identify items.");
  }
  if (virtualWindow !== false) {
    if (
      !Number.isSafeInteger(virtualWindow.startIndex) ||
      virtualWindow.startIndex < 0 ||
      !Number.isSafeInteger(virtualWindow.windowSize) ||
      virtualWindow.windowSize < 1 ||
      (virtualWindow.overscan !== undefined &&
        (!Number.isSafeInteger(virtualWindow.overscan) || virtualWindow.overscan < 0)) ||
      (virtualWindow.estimatedItemSize !== undefined && virtualWindow.estimatedItemSize <= 0)
    ) {
      throw new Error("Mergora TreeView virtualWindow requires bounded positive integers.");
    }
    if (onVirtualWindowChange === undefined) {
      throw new Error(
        "Mergora TreeView virtualWindow requires onVirtualWindowChange to keep keyboard focus in range.",
      );
    }
  }

  const [uncontrolledExpandedIds, setUncontrolledExpandedIds] = useState(defaultExpandedIds);
  const [uncontrolledSelectedIds, setUncontrolledSelectedIds] = useState(defaultSelectedIds);
  const resolvedExpandedIds = expandedIds ?? uncontrolledExpandedIds;
  const resolvedSelectedIds = selectedIds ?? uncontrolledSelectedIds;
  const expandedSet = useMemo(() => new Set(resolvedExpandedIds), [resolvedExpandedIds]);
  const flatItems = useMemo(() => flattenTreeItems(items, expandedSet), [expandedSet, items]);
  const firstEnabledId = flatItems.find(({ item }) => !item.disabled)?.item.id;
  const [uncontrolledActiveId, setUncontrolledActiveId] = useState(
    defaultActiveId ?? firstEnabledId,
  );
  const resolvedActiveId = activeId ?? uncontrolledActiveId ?? firstEnabledId;
  if (resolvedActiveId === undefined || !itemMap.has(resolvedActiveId)) {
    throw new Error("Mergora TreeView activeId must identify an item.");
  }

  const [loadingIds, setLoadingIds] = useState<ReadonlySet<string>>(() => new Set());
  const [loadErrors, setLoadErrors] = useState<ReadonlyMap<string, unknown>>(() => new Map());
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const itemRefs = useRef(new Map<string, HTMLDivElement>());
  const typeaheadRef = useRef<{
    query: string;
    timer: ReturnType<typeof globalThis.setTimeout> | undefined;
  }>({ query: "", timer: undefined });
  const selectedSet = useMemo(() => new Set(resolvedSelectedIds), [resolvedSelectedIds]);

  const overscan = virtualWindow === false ? 0 : (virtualWindow.overscan ?? 2);
  const visibleStart =
    virtualWindow === false ? 0 : Math.max(0, virtualWindow.startIndex - overscan);
  const visibleEnd =
    virtualWindow === false
      ? flatItems.length
      : Math.min(flatItems.length, virtualWindow.startIndex + virtualWindow.windowSize + overscan);
  const renderedItems = flatItems.slice(visibleStart, visibleEnd);
  const estimatedItemSize = virtualWindow === false ? 0 : (virtualWindow.estimatedItemSize ?? 48);
  const activeFlatItem = flatItems.find(({ item }) => item.id === resolvedActiveId);
  if (activeFlatItem === undefined || activeFlatItem.item.disabled) {
    throw new Error("Mergora TreeView activeId must identify a visible, enabled item.");
  }
  if (
    virtualWindow !== false &&
    (virtualWindow.startIndex >= flatItems.length ||
      !renderedItems.some(({ item }) => item.id === resolvedActiveId))
  ) {
    throw new Error(
      "Mergora TreeView virtualWindow must include the active item in its rendered range.",
    );
  }
  const pendingFocusIdRef = useRef<string | null>(null);
  const renameResolutionRef = useRef<string | null>(null);

  const setActive = (id: string, focus = true) => {
    if (id !== resolvedActiveId) {
      if (activeId === undefined) setUncontrolledActiveId(id);
      onActiveIdChange?.(id);
    }
    const nextIndex = flatItems.findIndex(({ item }) => item.id === id);
    if (virtualWindow !== false && nextIndex >= 0) {
      const outside = nextIndex < visibleStart || nextIndex >= visibleEnd;
      if (outside) {
        const requestedStart = Math.max(0, nextIndex - Math.floor(virtualWindow.windowSize / 2));
        onVirtualWindowChange?.(requestedStart, nextIndex);
      }
    }
    if (focus) {
      pendingFocusIdRef.current = id;
      queueMicrotask(() => {
        const node = itemRefs.current.get(id);
        if (node !== undefined) {
          pendingFocusIdRef.current = null;
          node.focus();
        }
      });
    }
  };
  const setExpanded = (next: readonly string[]) => {
    if (expandedIds === undefined) setUncontrolledExpandedIds(next);
    onExpandedIdsChange?.(next);
  };
  const setSelected = (next: readonly string[]) => {
    if (selectedIds === undefined) setUncontrolledSelectedIds(next);
    onSelectedIdsChange?.(next);
  };
  const requestExpansion = async (flatItem: TreeViewFlatItem, expand: boolean) => {
    const item = flatItem.item;
    const hasChildren = item.hasChildren === true || (item.children?.length ?? 0) > 0;
    if (!hasChildren || item.disabled) return;
    const next = expand
      ? [...new Set([...resolvedExpandedIds, item.id])]
      : resolvedExpandedIds.filter((id) => id !== item.id);
    setExpanded(next);
    if (!expand || item.children !== undefined || onLoadChildren === undefined) return;
    setLoadingIds((current) => new Set([...current, item.id]));
    setLoadErrors((current) => {
      const updated = new Map(current);
      updated.delete(item.id);
      return updated;
    });
    try {
      await onLoadChildren(item);
    } catch (error) {
      setLoadErrors((current) => new Map([...current, [item.id, error]]));
    } finally {
      setLoadingIds((current) => {
        const updated = new Set(current);
        updated.delete(item.id);
        return updated;
      });
    }
  };
  const toggleSelection = (item: TreeViewItem) => {
    if (item.disabled || selectionMode === "none") return;
    if (selectionMode === "single") setSelected([item.id]);
    else if (selectedSet.has(item.id))
      setSelected(resolvedSelectedIds.filter((id) => id !== item.id));
    else setSelected([...resolvedSelectedIds, item.id]);
  };
  const enabledFlatItems = flatItems.filter(({ item }) => !item.disabled);
  const moveActive = (offset: -1 | 1) => {
    const index = enabledFlatItems.findIndex(({ item }) => item.id === resolvedActiveId);
    const next = enabledFlatItems[index + offset];
    if (next !== undefined) setActive(next.item.id);
  };
  const handleTypeahead = (key: string) => {
    if (typeaheadRef.current.timer !== undefined) {
      globalThis.clearTimeout(typeaheadRef.current.timer);
    }
    const query = `${typeaheadRef.current.query}${key.toLocaleLowerCase()}`;
    typeaheadRef.current.query = query;
    typeaheadRef.current.timer = globalThis.setTimeout(() => {
      typeaheadRef.current.query = "";
    }, 500);
    const startIndex = enabledFlatItems.findIndex(({ item }) => item.id === resolvedActiveId);
    const ordered = [
      ...enabledFlatItems.slice(startIndex + 1),
      ...enabledFlatItems.slice(0, startIndex + 1),
    ];
    const match = ordered.find(({ item }) =>
      getTextValue(item).toLocaleLowerCase().startsWith(query),
    );
    if (match !== undefined) setActive(match.item.id);
  };
  const handleTreeItemKeyDown = (
    event: KeyboardEvent<HTMLDivElement>,
    flatItem: TreeViewFlatItem,
  ) => {
    if (event.target !== event.currentTarget) return;
    const item = flatItem.item;
    const index = flatItems.findIndex(({ item: candidate }) => candidate.id === item.id);
    const forwardKey = direction === "rtl" ? "ArrowLeft" : "ArrowRight";
    const backwardKey = direction === "rtl" ? "ArrowRight" : "ArrowLeft";
    if (event.key === "ArrowDown") {
      event.preventDefault();
      moveActive(1);
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      moveActive(-1);
    } else if (event.key === "Home") {
      event.preventDefault();
      const first = enabledFlatItems[0];
      if (first !== undefined) setActive(first.item.id);
    } else if (event.key === "End") {
      event.preventDefault();
      const last = enabledFlatItems.at(-1);
      if (last !== undefined) setActive(last.item.id);
    } else if (event.key === forwardKey) {
      event.preventDefault();
      const hasChildren = item.hasChildren === true || (item.children?.length ?? 0) > 0;
      if (hasChildren && !expandedSet.has(item.id)) void requestExpansion(flatItem, true);
      else {
        const next = flatItems[index + 1];
        if (next?.parentId === item.id) setActive(next.item.id);
      }
    } else if (event.key === backwardKey) {
      event.preventDefault();
      if (expandedSet.has(item.id)) void requestExpansion(flatItem, false);
      else if (flatItem.parentId !== null) setActive(flatItem.parentId);
    } else if (event.key === "*" && flatItem.parentId !== undefined) {
      event.preventDefault();
      const expandableSiblings = flatItems
        .filter(
          (candidate) =>
            candidate.parentId === flatItem.parentId &&
            (candidate.item.hasChildren === true || (candidate.item.children?.length ?? 0) > 0),
        )
        .map(({ item: candidate }) => candidate.id);
      setExpanded([...new Set([...resolvedExpandedIds, ...expandableSiblings])]);
    } else if (
      (event.key === "a" || event.key === "A") &&
      event.ctrlKey &&
      selectionMode === "multiple"
    ) {
      event.preventDefault();
      setSelected(enabledFlatItems.map(({ item: candidate }) => candidate.id));
    } else if (event.key === " " || event.key === "Enter") {
      event.preventDefault();
      toggleSelection(item);
    } else if (event.key === "F2" && onRename !== undefined && !item.disabled) {
      event.preventDefault();
      renameResolutionRef.current = null;
      setRenamingId(item.id);
    } else if (event.key.length === 1 && !event.altKey && !event.ctrlKey && !event.metaKey) {
      handleTypeahead(event.key);
    }
  };

  useEffect(
    () => () => {
      if (typeaheadRef.current.timer !== undefined) {
        globalThis.clearTimeout(typeaheadRef.current.timer);
      }
    },
    [],
  );

  useEffect(() => {
    const pendingId = pendingFocusIdRef.current;
    if (pendingId === null) return;
    const node = itemRefs.current.get(pendingId);
    if (node !== undefined) {
      pendingFocusIdRef.current = null;
      node.focus();
    }
  }, [renderedItems]);

  const renderFlatItem = (flatItem: TreeViewFlatItem) => {
    const item = flatItem.item;
    const hasChildren = item.hasChildren === true || (item.children?.length ?? 0) > 0;
    const expanded = hasChildren && expandedSet.has(item.id);
    const selected = selectedSet.has(item.id);
    const loading = loadingIds.has(item.id);
    const loadError = loadErrors.get(item.id);
    const depthStyle = { "--_mrg-tree-level": flatItem.level - 1 } as CSSProperties;
    const finishRename = (value: string, commit: boolean) => {
      if (renameResolutionRef.current === item.id) return;
      renameResolutionRef.current = item.id;
      const next = value.trim();
      if (commit && next.length > 0 && next !== getTextValue(item)) onRename?.(item, next);
      setRenamingId(null);
      queueMicrotask(() => {
        if (renameResolutionRef.current === item.id) renameResolutionRef.current = null;
        itemRefs.current.get(item.id)?.focus();
      });
    };
    const allowedMoveDirections =
      moveActions === false || item.disabled
        ? []
        : [
            ...new Set(
              moveActions.getAllowedDirections?.(item) ?? (["up", "down", "in", "out"] as const),
            ),
          ];
    return (
      <div
        aria-busy={loading || undefined}
        aria-disabled={item.disabled || undefined}
        aria-expanded={hasChildren ? expanded : undefined}
        aria-level={flatItem.level}
        aria-posinset={flatItem.indexInParent + 1}
        aria-selected={selectionMode === "none" ? undefined : selected}
        aria-setsize={flatItem.setSize}
        className="mrg-tree-view__item"
        data-active={item.id === resolvedActiveId ? "" : undefined}
        data-item-id={item.id}
        data-loading={loading ? "" : undefined}
        data-selected={selected ? "" : undefined}
        data-slot="tree-view-item"
        key={item.id}
        onClick={(event: MouseEvent<HTMLDivElement>) => {
          if (
            event.target !== event.currentTarget &&
            event.target instanceof Element &&
            event.target.closest("a, button, input, select, textarea, [role='button']")
          ) {
            return;
          }
          if (!item.disabled) {
            setActive(item.id);
            toggleSelection(item);
          }
        }}
        onFocus={(event: FocusEvent<HTMLDivElement>) => {
          if (event.target === event.currentTarget && !item.disabled) setActive(item.id, false);
        }}
        onKeyDown={(event) => handleTreeItemKeyDown(event, flatItem)}
        ref={(node) => {
          if (node === null) itemRefs.current.delete(item.id);
          else itemRefs.current.set(item.id, node);
        }}
        role="treeitem"
        style={depthStyle}
        tabIndex={item.id === resolvedActiveId && !item.disabled ? 0 : -1}
      >
        <span className="mrg-tree-view__row" data-slot="tree-view-row">
          {hasChildren ? (
            <button
              aria-label={`${expanded ? "Collapse" : "Expand"} ${getTextValue(item) || "item"}`}
              className="mrg-tree-view__expander"
              onClick={(event) => {
                event.stopPropagation();
                setActive(item.id, false);
                void requestExpansion(flatItem, !expanded);
              }}
              tabIndex={-1}
              type="button"
            >
              <span aria-hidden="true">{expanded ? "−" : "+"}</span>
            </button>
          ) : (
            <span aria-hidden="true" className="mrg-tree-view__leaf">
              ·
            </span>
          )}
          {renamingId === item.id ? (
            <input
              aria-label={`Rename ${getTextValue(item) || "item"}`}
              autoFocus
              defaultValue={getTextValue(item)}
              onBlur={(event) => finishRename(event.currentTarget.value, true)}
              onClick={(event) => event.stopPropagation()}
              onKeyDown={(event) => {
                event.stopPropagation();
                if (event.key === "Enter") finishRename(event.currentTarget.value, true);
                else if (event.key === "Escape") {
                  event.preventDefault();
                  finishRename(event.currentTarget.value, false);
                }
              }}
            />
          ) : (
            <span className="mrg-tree-view__copy">
              <span data-slot="tree-view-label">{item.label}</span>
              {item.description === undefined ? null : <small>{item.description}</small>}
            </span>
          )}
          {renderActions === undefined ? null : (
            <span className="mrg-tree-view__actions" data-slot="tree-view-actions">
              {renderActions(item)}
            </span>
          )}
          {moveActions === false || allowedMoveDirections.length === 0 ? null : (
            <span
              aria-label={`Move ${getTextValue(item) || "item"}`}
              className="mrg-tree-view__move-actions"
              data-slot="tree-view-move-actions"
              role="group"
            >
              {allowedMoveDirections.map((moveDirection) => (
                <button
                  key={moveDirection}
                  onClick={(event) => {
                    event.stopPropagation();
                    moveActions.onMove(item, moveDirection);
                  }}
                  type="button"
                >
                  {moveActions.labels?.[moveDirection] ?? `Move ${moveDirection}`}
                </button>
              ))}
            </span>
          )}
        </span>
        {loading ? (
          <span
            className="mrg-tree-view__load-status"
            data-slot="tree-view-load-status"
            role="status"
          >
            {loadingLabel(item)}
          </span>
        ) : null}
        {loadError === undefined ? null : (
          <span className="mrg-tree-view__load-error" data-slot="tree-view-load-error" role="alert">
            {loadErrorLabel({ error: loadError, item })}
          </span>
        )}
      </div>
    );
  };

  return (
    <div
      {...props}
      aria-busy={loadingIds.size > 0 || undefined}
      aria-label={label}
      aria-multiselectable={selectionMode === "multiple" || undefined}
      className={["mrg-tree-view", className].filter(Boolean).join(" ")}
      data-enhanced-move-actions={moveActions === false ? undefined : ""}
      data-slot="tree-view"
      data-total-items={flatItems.length}
      data-virtualized={virtualWindow === false ? undefined : ""}
      dir={direction}
      ref={ref}
      role="tree"
    >
      {virtualWindow === false || visibleStart === 0 ? null : (
        <div
          aria-hidden="true"
          data-slot="tree-view-virtual-spacer-start"
          style={{ blockSize: visibleStart * estimatedItemSize }}
        />
      )}
      {renderedItems.map(renderFlatItem)}
      {virtualWindow === false || visibleEnd >= flatItems.length ? null : (
        <div
          aria-hidden="true"
          data-slot="tree-view-virtual-spacer-end"
          style={{ blockSize: (flatItems.length - visibleEnd) * estimatedItemSize }}
        />
      )}
    </div>
  );
});

TreeView.displayName = "TreeView";
