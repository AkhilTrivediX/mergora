// Generated from registry/source/components/tree-grid/tree-grid.tsx by @mergora-internal/source-transformer. Do not edit.
"use client";

import "./tree-grid.css";

import {
  useId,
  useMemo,
  useRef,
  useState,
  type FormEvent,
  type HTMLAttributes,
  type KeyboardEvent,
  type CSSProperties,
  type ReactElement,
  type ReactNode,
} from "react";

export interface TreeGridRow<TData> {
  /** Provides the stable row identifier used by expansion, selection, and focus state. */
  readonly id: string;
  /** Carries consumer data passed to label, cell, and editing callbacks. */
  readonly data: TData;
  /** Supplies ordered child rows and establishes the accessible hierarchy. */
  readonly children?: readonly TreeGridRow<TData>[];
  /** Prevents selection, expansion, focus movement, and editing for this row. */
  readonly disabled?: boolean;
  /** Marks this row’s child content as pending without assuming a loading transport. */
  readonly loading?: boolean;
  /** Presents consumer-provided row recovery context when child loading fails. */
  readonly error?: string;
}

export interface TreeGridColumn<TData> {
  /** Provides the stable column identifier used by cells and edit commits. */
  readonly id: string;
  /** Renders the column header’s visible and accessible content. */
  readonly header: ReactNode;
  /** Renders a read-only cell from the row’s consumer data. */
  readonly cell: (row: TData) => ReactNode;
  /** Enables the built-in text editor for this column when true. */
  readonly editable?: boolean;
  /** Returns the canonical starting string for the optional built-in editor. */
  readonly editValue?: (row: TData) => string;
}

export interface TreeGridFlatRow<TData> {
  /** References the canonical hierarchical row represented by this flattened entry. */
  readonly row: TreeGridRow<TData>;
  /** Reports the accessible one-based hierarchy level. */
  readonly level: number;
  /** Identifies the parent row or null for a root-level entry. */
  readonly parentId: string | null;
  /** Reports the one-based position among this row’s siblings. */
  readonly position: number;
  /** Reports the total number of siblings in this row’s level. */
  readonly setSize: number;
}

export interface TreeGridVirtualWindow {
  /** Sets the inclusive first flattened row index rendered in the current window. */
  readonly start: number;
  /** Sets the exclusive final flattened row index rendered in the current window. */
  readonly end: number;
  /** Supplies the measured or estimated row size used for scroll-space preservation. */
  readonly rowSize: number;
}

export type TreeGridSelectionMode = "none" | "single" | "multiple";
export type TreeGridChangeReason = "keyboard" | "pointer" | "edit" | "reset";

export interface TreeGridMessages {
  /** Labels the action that reveals a row’s children. */
  readonly expand: string;
  /** Labels the action that hides a row’s children. */
  readonly collapse: string;
  /** Labels the action that commits an edited cell. */
  readonly save: string;
  /** Labels the action that discards an edited cell. */
  readonly cancel: string;
  /** Describes a hierarchy containing no rows. */
  readonly empty: string;
  /** Names the optional hierarchy summary. */
  readonly summary: string;
  /** Generates selected-row count text. */
  readonly selected: (count: number) => string;
  /** Announces that the named row was expanded. */
  readonly expanded: (label: string) => string;
  /** Announces that the named row was collapsed. */
  readonly collapsed: (label: string) => string;
  /** Announces a successful edit for the named row and column. */
  readonly editSaved: (label: string, column: string) => string;
  /** Explains how to recover when an asynchronous edit rejects. */
  readonly editFailed: string;
  /** Announces the optional expansion of sibling rows. */
  readonly siblingsExpanded: (count: number) => string;
  /** Generates a private system label from the visible grid label. */
  readonly systemLabel: (label: string) => string;
  /** Generates an expansion control name from row label and state. */
  readonly toggle: (label: string, expanded: boolean) => string;
  /** Generates visible, total, and selected counts for the optional summary. */
  readonly hierarchyCounts: (visible: number, total: number, selected: number) => string;
  /** Explains horizontal scrolling when columns exceed the viewport. */
  readonly scrollHint: string;
}

export interface TreeGridProps<TData> extends Omit<
  HTMLAttributes<HTMLDivElement>,
  "children" | "onChange"
> {
  /** Names the tree grid for visible and assistive-technology context. */
  readonly label: string;
  /** Supplies the canonical hierarchical row collection. */
  readonly rows: readonly TreeGridRow<TData>[];
  /** Defines ordered columns, cell renderers, and optional editing behavior. */
  readonly columns: readonly TreeGridColumn<TData>[];
  /** Returns a human-readable row label for controls, recovery, and announcements. */
  readonly getRowLabel: (row: TData) => string;
  /** Controls the expanded row identifiers when supplied. */
  readonly expandedIds?: readonly string[];
  /** Sets initial expanded row identifiers for uncontrolled use. */
  readonly defaultExpandedIds?: readonly string[];
  /** Reports controlled or uncontrolled expansion changes with their cause. */
  readonly onExpandedIdsChange?: (
    ids: readonly string[],
    detail: { readonly rowId: string; readonly reason: TreeGridChangeReason },
  ) => void;
  /** Controls the selected row identifiers when supplied. */
  readonly selectedIds?: readonly string[];
  /** Sets initial selected row identifiers for uncontrolled use. */
  readonly defaultSelectedIds?: readonly string[];
  /** Reports controlled or uncontrolled selection changes with their cause. */
  readonly onSelectedIdsChange?: (
    ids: readonly string[],
    detail: { readonly rowId: string; readonly reason: TreeGridChangeReason },
  ) => void;
  /** Controls the row participating in roving keyboard focus. */
  readonly activeRowId?: string;
  /** Sets the initial roving-focus row for uncontrolled use. */
  readonly defaultActiveRowId?: string;
  /** Reports roving-focus changes without changing selection. */
  readonly onActiveRowIdChange?: (id: string) => void;
  /** Enables no, single, or multiple row selection semantics. */
  readonly selectionMode?: TreeGridSelectionMode;
  /** Commits a canonical edited string and may reject asynchronously for recovery. */
  readonly onEditCommit?: (detail: {
    /** Identifies the edited row. */
    readonly rowId: string;
    /** Identifies the edited column. */
    readonly columnId: string;
    /** Supplies the canonical edited value. */
    readonly value: string;
  }) => void | Promise<void>;
  /** Enables consumer-controlled windowing; false renders every visible flattened row. */
  readonly virtualWindow?: false | TreeGridVirtualWindow;
  /** Requests a new render window without owning consumer scroll state. */
  readonly onVirtualWindowChange?: (window: TreeGridVirtualWindow) => void;
  /** Shows visible, total, and selected counts; false removes the summary semantics. */
  readonly showHierarchySummary?: boolean;
  /** Enables private live expansion, selection, and edit announcements. */
  readonly announceChanges?: boolean;
  /** Serializes selected stable identifiers for native form submission. */
  readonly name?: string;
  /** Prevents expansion, selection, focus movement, editing, and window requests. */
  readonly disabled?: boolean;
  /** Preserves state and form submission while removing mutating controls. */
  readonly readOnly?: boolean;
  /** Overrides individual localized strings while retaining defaults for omitted entries. */
  readonly messages?: Partial<TreeGridMessages>;
}

const defaultMessages: TreeGridMessages = {
  expand: "Expand row",
  collapse: "Collapse row",
  save: "Save",
  cancel: "Cancel",
  empty: "No rows available.",
  summary: "Hierarchy summary",
  selected: (count) => `${count} selected`,
  expanded: (label) => `${label} expanded.`,
  collapsed: (label) => `${label} collapsed.`,
  editSaved: (label, column) => `${column} for ${label} saved.`,
  editFailed: "The edit could not be saved. Review the value and try again.",
  siblingsExpanded: (count) => `${count} sibling rows expanded.`,
  systemLabel: (label) => `${label} system`,
  toggle: (label, expanded) => `${expanded ? "Collapse" : "Expand"}: ${label}`,
  hierarchyCounts: (visible, total, selected) =>
    `${visible} visible of ${total} rows · ${selected} selected`,
  scrollHint: "Scroll horizontally to inspect every column.",
};

function classes(...values: readonly (string | false | undefined)[]): string {
  return values.filter((value): value is string => Boolean(value)).join(" ");
}

export function flattenTreeGridRows<TData>(
  rows: readonly TreeGridRow<TData>[],
  expandedIds: ReadonlySet<string>,
): readonly TreeGridFlatRow<TData>[] {
  const result: TreeGridFlatRow<TData>[] = [];
  const visit = (
    siblings: readonly TreeGridRow<TData>[],
    level: number,
    parentId: string | null,
  ) => {
    siblings.forEach((row, index) => {
      result.push({ row, level, parentId, position: index + 1, setSize: siblings.length });
      if (row.children && row.children.length > 0 && expandedIds.has(row.id)) {
        visit(row.children, level + 1, row.id);
      }
    });
  };
  visit(rows, 1, null);
  return result;
}

function allTreeGridIds<TData>(rows: readonly TreeGridRow<TData>[]): readonly string[] {
  return rows.flatMap((row) => [row.id, ...allTreeGridIds(row.children ?? [])]);
}

export function TreeGrid<TData>({
  label,
  rows,
  columns,
  getRowLabel,
  expandedIds: controlledExpanded,
  defaultExpandedIds: defaultExpandedIdsProp,
  onExpandedIdsChange,
  selectedIds: controlledSelected,
  defaultSelectedIds: defaultSelectedIdsProp,
  onSelectedIdsChange,
  activeRowId: controlledActive,
  defaultActiveRowId: defaultActiveRowIdProp,
  onActiveRowIdChange,
  selectionMode = "none",
  onEditCommit,
  virtualWindow = false,
  onVirtualWindowChange,
  showHierarchySummary = false,
  announceChanges = false,
  name,
  disabled = false,
  readOnly = false,
  messages: messageOverrides,
  className,
  onReset,
  ...props
}: TreeGridProps<TData>): ReactElement {
  const defaultExpandedIds = defaultExpandedIdsProp ?? [];
  const defaultSelectedIds = defaultSelectedIdsProp ?? [];
  const defaultActiveRowId = defaultActiveRowIdProp;
  if (columns.length === 0) throw new Error("Mergora TreeGrid requires at least one column.");
  if (new Set(columns.map((column) => column.id)).size !== columns.length) {
    throw new Error("Mergora TreeGrid column IDs must be unique.");
  }
  if (controlledExpanded !== undefined && defaultExpandedIdsProp !== undefined) {
    throw new Error(
      "Mergora TreeGrid controlled expansion cannot be combined with defaultExpandedIds.",
    );
  }
  if (controlledSelected !== undefined && defaultSelectedIdsProp !== undefined) {
    throw new Error(
      "Mergora TreeGrid controlled selection cannot be combined with defaultSelectedIds.",
    );
  }
  if (controlledActive !== undefined && defaultActiveRowIdProp !== undefined) {
    throw new Error(
      "Mergora TreeGrid controlled active row cannot be combined with defaultActiveRowId.",
    );
  }
  const allIds = allTreeGridIds(rows);
  if (new Set(allIds).size !== allIds.length) {
    throw new Error("Mergora TreeGrid row IDs must be unique.");
  }
  if (virtualWindow !== false && onVirtualWindowChange === undefined) {
    throw new Error("Mergora TreeGrid virtualWindow requires onVirtualWindowChange.");
  }
  if (
    virtualWindow !== false &&
    (!Number.isInteger(virtualWindow.start) ||
      !Number.isInteger(virtualWindow.end) ||
      !Number.isFinite(virtualWindow.rowSize) ||
      virtualWindow.start < 0 ||
      virtualWindow.end < virtualWindow.start ||
      virtualWindow.rowSize <= 0)
  ) {
    throw new Error(
      "Mergora TreeGrid virtualWindow requires bounded integer indexes and a positive rowSize.",
    );
  }
  const messages = { ...defaultMessages, ...messageOverrides };
  const summaryId = `${useId().replaceAll(":", "")}-summary`;
  const [internalExpanded, setInternalExpanded] = useState<readonly string[]>(defaultExpandedIds);
  const [internalSelected, setInternalSelected] = useState<readonly string[]>(defaultSelectedIds);
  const [internalActive, setInternalActive] = useState(defaultActiveRowId ?? rows[0]?.id ?? "");
  const [activeColumn, setActiveColumn] = useState(0);
  const [editing, setEditing] = useState<{ rowId: string; columnId: string; value: string } | null>(
    null,
  );
  const [saving, setSaving] = useState(false);
  const [editError, setEditError] = useState("");
  const [announcement, setAnnouncement] = useState("");
  const cells = useRef(new Map<string, HTMLDivElement>());
  const typeahead = useRef({ value: "", at: 0 });
  const expanded = controlledExpanded ?? internalExpanded;
  const selected = controlledSelected ?? internalSelected;
  const active = controlledActive ?? internalActive;
  const flatRows = useMemo(() => flattenTreeGridRows(rows, new Set(expanded)), [expanded, rows]);
  const visibleStart = virtualWindow === false ? 0 : Math.max(0, virtualWindow.start);
  const visibleEnd =
    virtualWindow === false ? flatRows.length : Math.min(flatRows.length, virtualWindow.end);
  const visibleRows = flatRows.slice(visibleStart, visibleEnd);
  const tabbableRowId = visibleRows.some((entry) => entry.row.id === active)
    ? active
    : (visibleRows[0]?.row.id ?? "");

  const announce = (message: string) => {
    if (announceChanges) setAnnouncement(message);
  };
  const setActive = (rowId: string, columnIndex: number) => {
    if (controlledActive === undefined) setInternalActive(rowId);
    setActiveColumn(columnIndex);
    onActiveRowIdChange?.(rowId);
    const rowIndex = flatRows.findIndex((entry) => entry.row.id === rowId);
    if (virtualWindow !== false && (rowIndex < visibleStart || rowIndex >= visibleEnd)) {
      const size = Math.max(1, visibleEnd - visibleStart);
      const start = Math.max(0, Math.min(rowIndex, flatRows.length - size));
      onVirtualWindowChange?.({
        ...virtualWindow,
        start,
        end: Math.min(flatRows.length, start + size),
      });
    }
    queueMicrotask(() => cells.current.get(`${rowId}:${columnIndex}`)?.focus());
  };
  const toggleExpanded = (entry: TreeGridFlatRow<TData>, reason: TreeGridChangeReason) => {
    if (!entry.row.children?.length || entry.row.disabled || disabled) return;
    const next = expanded.includes(entry.row.id)
      ? expanded.filter((id) => id !== entry.row.id)
      : [...expanded, entry.row.id];
    if (controlledExpanded === undefined) setInternalExpanded(next);
    onExpandedIdsChange?.(next, { rowId: entry.row.id, reason });
    announce(
      next.includes(entry.row.id)
        ? messages.expanded(getRowLabel(entry.row.data))
        : messages.collapsed(getRowLabel(entry.row.data)),
    );
  };
  const toggleSelected = (entry: TreeGridFlatRow<TData>, reason: TreeGridChangeReason) => {
    if (selectionMode === "none" || entry.row.disabled || disabled || readOnly) return;
    const next =
      selectionMode === "single"
        ? selected.includes(entry.row.id)
          ? []
          : [entry.row.id]
        : selected.includes(entry.row.id)
          ? selected.filter((id) => id !== entry.row.id)
          : [...selected, entry.row.id];
    if (controlledSelected === undefined) setInternalSelected(next);
    onSelectedIdsChange?.(next, { rowId: entry.row.id, reason });
    announce(messages.selected(next.length));
  };
  const beginEdit = (entry: TreeGridFlatRow<TData>, columnIndex: number) => {
    const column = columns[columnIndex];
    if (
      !column?.editable ||
      onEditCommit === undefined ||
      disabled ||
      readOnly ||
      entry.row.disabled
    )
      return;
    setEditError("");
    setEditing({
      rowId: entry.row.id,
      columnId: column.id,
      value: column.editValue?.(entry.row.data) ?? String(column.cell(entry.row.data) ?? ""),
    });
    queueMicrotask(() => {
      const input = document.querySelector<HTMLInputElement>(
        `[data-tree-grid-editor="${CSS.escape(entry.row.id)}:${CSS.escape(column.id)}"]`,
      );
      input?.focus();
      input?.select();
    });
  };
  const saveEdit = async () => {
    if (editing === null || onEditCommit === undefined) return;
    const entry = flatRows.find((candidate) => candidate.row.id === editing.rowId);
    const column = columns.find((candidate) => candidate.id === editing.columnId);
    setSaving(true);
    setEditError("");
    try {
      await onEditCommit(editing);
      setEditing(null);
      if (entry && column)
        announce(messages.editSaved(getRowLabel(entry.row.data), String(column.header)));
      const columnIndex = columns.findIndex((candidate) => candidate.id === editing.columnId);
      setActive(editing.rowId, Math.max(0, columnIndex));
    } catch (error) {
      setEditError(error instanceof Error ? error.message : messages.editFailed);
    } finally {
      setSaving(false);
    }
  };
  const onCellKeyDown = (
    event: KeyboardEvent<HTMLDivElement>,
    entry: TreeGridFlatRow<TData>,
    rowIndex: number,
    columnIndex: number,
  ) => {
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      const destination = Math.max(
        0,
        Math.min(flatRows.length - 1, rowIndex + (event.key === "ArrowDown" ? 1 : -1)),
      );
      setActive(flatRows[destination]!.row.id, columnIndex);
      return;
    }
    if (event.key === "PageDown" || event.key === "PageUp") {
      event.preventDefault();
      const pageSize = virtualWindow === false ? 10 : Math.max(1, visibleEnd - visibleStart);
      const destination = Math.max(
        0,
        Math.min(flatRows.length - 1, rowIndex + (event.key === "PageDown" ? pageSize : -pageSize)),
      );
      setActive(flatRows[destination]!.row.id, columnIndex);
      return;
    }
    if (event.key === "Home" || event.key === "End") {
      event.preventDefault();
      if (event.ctrlKey) {
        const destinationRow = event.key === "Home" ? 0 : flatRows.length - 1;
        const destinationColumn = event.key === "Home" ? 0 : columns.length - 1;
        setActive(flatRows[destinationRow]!.row.id, destinationColumn);
      } else {
        setActive(entry.row.id, event.key === "Home" ? 0 : columns.length - 1);
      }
      return;
    }
    const direction = getComputedStyle(event.currentTarget).direction;
    const forward = direction === "rtl" ? "ArrowLeft" : "ArrowRight";
    const backward = direction === "rtl" ? "ArrowRight" : "ArrowLeft";
    if (event.key === forward) {
      event.preventDefault();
      if (columnIndex === 0 && entry.row.children?.length) {
        if (!expanded.includes(entry.row.id)) {
          toggleExpanded(entry, "keyboard");
        } else {
          setActive(entry.row.children[0]!.id, 0);
        }
      } else if (columnIndex < columns.length - 1) {
        setActive(entry.row.id, columnIndex + 1);
      }
      return;
    }
    if (event.key === backward) {
      event.preventDefault();
      if (columnIndex > 0) {
        setActive(entry.row.id, columnIndex - 1);
      } else if (entry.row.children?.length && expanded.includes(entry.row.id)) {
        toggleExpanded(entry, "keyboard");
      } else if (entry.parentId) {
        setActive(entry.parentId, 0);
      }
      return;
    }
    if (event.key === " " || event.key === "Enter") {
      event.preventDefault();
      toggleSelected(entry, "keyboard");
      return;
    }
    if (event.key === "*" && columnIndex === 0) {
      event.preventDefault();
      const siblingIds = flatRows
        .filter(
          (candidate) =>
            candidate.parentId === entry.parentId &&
            candidate.row.children !== undefined &&
            candidate.row.children.length > 0,
        )
        .map((candidate) => candidate.row.id);
      const next = [...new Set([...expanded, ...siblingIds])];
      if (controlledExpanded === undefined) setInternalExpanded(next);
      onExpandedIdsChange?.(next, { rowId: entry.row.id, reason: "keyboard" });
      announce(messages.siblingsExpanded(siblingIds.length));
      return;
    }
    if (event.key.toLocaleLowerCase() === "a" && event.ctrlKey && selectionMode === "multiple") {
      event.preventDefault();
      const next = flatRows
        .filter((candidate) => !candidate.row.disabled)
        .map((candidate) => candidate.row.id);
      if (controlledSelected === undefined) setInternalSelected(next);
      onSelectedIdsChange?.(next, { rowId: entry.row.id, reason: "keyboard" });
      announce(messages.selected(next.length));
      return;
    }
    if (event.key === "F2") {
      event.preventDefault();
      beginEdit(entry, columnIndex);
      return;
    }
    if (
      event.key.length === 1 &&
      !event.altKey &&
      !event.ctrlKey &&
      !event.metaKey &&
      !/\s/u.test(event.key)
    ) {
      const now = Date.now();
      const nextQuery =
        `${now - typeahead.current.at > 700 ? "" : typeahead.current.value}${event.key}`.toLocaleLowerCase();
      typeahead.current = { value: nextQuery, at: now };
      const ordered = [...flatRows.slice(rowIndex + 1), ...flatRows.slice(0, rowIndex + 1)];
      const match = ordered.find((candidate) =>
        getRowLabel(candidate.row.data).toLocaleLowerCase().startsWith(nextQuery),
      );
      if (match) {
        event.preventDefault();
        setActive(match.row.id, columnIndex);
      }
    }
  };

  const handleReset = (event: FormEvent<HTMLDivElement>) => {
    onReset?.(event);
    if (event.defaultPrevented) return;
    if (controlledExpanded === undefined) {
      setInternalExpanded(defaultExpandedIds);
      onExpandedIdsChange?.(defaultExpandedIds, { rowId: "", reason: "reset" });
    }
    if (controlledSelected === undefined) {
      setInternalSelected(defaultSelectedIds);
      onSelectedIdsChange?.(defaultSelectedIds, { rowId: "", reason: "reset" });
    }
    if (controlledActive === undefined) {
      setInternalActive(defaultActiveRowId ?? rows[0]?.id ?? "");
    }
    setEditing(null);
  };

  return (
    <div
      {...props}
      className={classes("mrg-tree-grid", className)}
      data-slot="tree-grid"
      role="region"
      aria-label={messages.systemLabel(label)}
      aria-disabled={disabled || undefined}
      onReset={handleReset}
    >
      <p className="mrg-tree-grid__scroll-hint">{messages.scrollHint}</p>
      <div
        role="treegrid"
        aria-label={label}
        aria-describedby={showHierarchySummary ? summaryId : undefined}
        aria-rowcount={flatRows.length + 1}
        aria-colcount={columns.length}
        aria-multiselectable={selectionMode === "multiple" || undefined}
        aria-readonly={readOnly || undefined}
        aria-busy={saving || undefined}
        className="mrg-tree-grid__viewport"
        style={{ "--mrg-tree-grid-columns": columns.length } as CSSProperties}
      >
        <div role="row" className="mrg-tree-grid__header" aria-rowindex={1}>
          {columns.map((column) => (
            <div key={column.id} role="columnheader">
              {column.header}
            </div>
          ))}
        </div>
        {flatRows.length === 0 ? (
          <div className="mrg-tree-grid__empty">{messages.empty}</div>
        ) : null}
        {virtualWindow !== false && visibleStart > 0 ? (
          <div aria-hidden="true" style={{ blockSize: visibleStart * virtualWindow.rowSize }} />
        ) : null}
        {visibleRows.map((entry, visibleIndex) => {
          const rowIndex = visibleStart + visibleIndex;
          const isExpanded = expanded.includes(entry.row.id);
          const isSelected = selected.includes(entry.row.id);
          return (
            <div
              key={entry.row.id}
              role="row"
              aria-rowindex={rowIndex + 2}
              aria-level={entry.level}
              aria-posinset={entry.position}
              aria-setsize={entry.setSize}
              aria-expanded={entry.row.children?.length ? isExpanded : undefined}
              aria-selected={selectionMode === "none" ? undefined : isSelected}
              aria-disabled={entry.row.disabled || undefined}
              aria-busy={entry.row.loading || undefined}
              data-slot="tree-grid-row"
              data-selected={isSelected || undefined}
              data-active={tabbableRowId === entry.row.id || undefined}
            >
              {columns.map((column, columnIndex) => {
                const isEditing = editing?.rowId === entry.row.id && editing.columnId === column.id;
                return (
                  <div
                    key={column.id}
                    ref={(element) => {
                      const key = `${entry.row.id}:${columnIndex}`;
                      if (element) cells.current.set(key, element);
                      else cells.current.delete(key);
                    }}
                    role="gridcell"
                    tabIndex={
                      tabbableRowId === entry.row.id && activeColumn === columnIndex ? 0 : -1
                    }
                    data-slot="tree-grid-cell"
                    data-column={column.id}
                    onFocus={() => {
                      if (controlledActive === undefined) setInternalActive(entry.row.id);
                      setActiveColumn(columnIndex);
                      onActiveRowIdChange?.(entry.row.id);
                    }}
                    onKeyDown={(event) => onCellKeyDown(event, entry, rowIndex, columnIndex)}
                  >
                    {columnIndex === 0 ? (
                      <span
                        className="mrg-tree-grid__tree-cell"
                        style={{ "--mrg-tree-grid-level": entry.level } as CSSProperties}
                      >
                        {entry.row.children?.length ? (
                          <button
                            type="button"
                            tabIndex={-1}
                            disabled={disabled || entry.row.disabled}
                            aria-label={messages.toggle(getRowLabel(entry.row.data), isExpanded)}
                            onClick={() => toggleExpanded(entry, "pointer")}
                          >
                            <span aria-hidden="true">{isExpanded ? "−" : "+"}</span>
                          </button>
                        ) : (
                          <span className="mrg-tree-grid__leaf" aria-hidden="true">
                            •
                          </span>
                        )}
                        <span>{column.cell(entry.row.data)}</span>
                      </span>
                    ) : isEditing ? (
                      <span className="mrg-tree-grid__editor">
                        <input
                          data-tree-grid-editor={`${entry.row.id}:${column.id}`}
                          value={editing.value}
                          disabled={saving}
                          aria-invalid={editError !== "" || undefined}
                          onChange={(event) =>
                            setEditing({ ...editing, value: event.currentTarget.value })
                          }
                          onKeyDown={(event) => {
                            if (event.key === "Enter") {
                              event.preventDefault();
                              void saveEdit();
                            }
                            if (event.key === "Escape") {
                              event.preventDefault();
                              setEditing(null);
                              setEditError("");
                              setActive(entry.row.id, columnIndex);
                            }
                          }}
                        />
                        <button type="button" disabled={saving} onClick={() => void saveEdit()}>
                          {messages.save}
                        </button>
                        <button
                          type="button"
                          disabled={saving}
                          onClick={() => {
                            setEditing(null);
                            setEditError("");
                            setActive(entry.row.id, columnIndex);
                          }}
                        >
                          {messages.cancel}
                        </button>
                      </span>
                    ) : (
                      <span onDoubleClick={() => beginEdit(entry, columnIndex)}>
                        {column.cell(entry.row.data)}
                      </span>
                    )}
                    {columnIndex === 0 && entry.row.error ? (
                      <span className="mrg-tree-grid__error">{entry.row.error}</span>
                    ) : null}
                  </div>
                );
              })}
            </div>
          );
        })}
        {virtualWindow !== false && visibleEnd < flatRows.length ? (
          <div
            aria-hidden="true"
            style={{ blockSize: (flatRows.length - visibleEnd) * virtualWindow.rowSize }}
          />
        ) : null}
      </div>
      {editError ? (
        <div role="alert" className="mrg-tree-grid__edit-error">
          {editError}
        </div>
      ) : null}
      {name
        ? selected.map((id) => (
            <input key={id} type="hidden" name={name} value={id} disabled={disabled} />
          ))
        : null}
      {showHierarchySummary ? (
        <output id={summaryId} className="mrg-tree-grid__summary" data-slot="tree-grid-summary">
          <strong>{messages.summary}</strong>
          <span>{messages.hierarchyCounts(flatRows.length, allIds.length, selected.length)}</span>
        </output>
      ) : null}
      {announceChanges ? (
        <div
          role="status"
          aria-live="polite"
          className="mrg-tree-grid__visually-hidden"
          data-slot="tree-grid-announcer"
        >
          {announcement}
        </div>
      ) : null}
    </div>
  );
}
