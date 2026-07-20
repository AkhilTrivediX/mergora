"use client";

import "./data-grid.css";

import {
  flexRender,
  getCoreRowModel,
  getSortedRowModel,
  useReactTable,
  type ColumnDef,
  type SortingState,
  type Updater,
} from "@tanstack/react-table";
import {
  Fragment,
  forwardRef,
  isValidElement,
  useId,
  useMemo,
  useState,
  type HTMLAttributes,
  type ReactElement,
  type ReactNode,
  type RefAttributes,
} from "react";

export type DataGridColumnAlignment = "start" | "center" | "end";
export type DataGridSelectionMode = "none" | "single";
export type DataGridSortDirection = "ascending" | "descending";

export interface DataGridSorting {
  /** Identifies the sortable column controlling the current row order. */
  readonly columnId: string;
  /** Selects ascending or descending order for the active sort column. */
  readonly direction: DataGridSortDirection;
}

export interface DataGridColumn<TData extends object> {
  /** Provides the stable TanStack column identifier used by sorting state. */
  readonly id: string;
  /** Renders the visible and accessible native column header content. */
  readonly header: ReactNode;
  /** Returns the canonical value used by default cells and sorting. */
  readonly accessor: (row: TData) => unknown;
  /** Replaces default value formatting with consumer-owned cell content. */
  readonly cell?: (value: unknown, row: TData) => ReactNode;
  /** Enables native header-button sorting for this individual column. */
  readonly sortable?: boolean;
  /** Aligns header and body cells using logical start, center, or end. */
  readonly alignment?: DataGridColumnAlignment;
  /** Applies a consumer-supplied column width to the native column definition. */
  readonly width?: string;
}

export interface DataGridSelectionChangeDetail {
  /** Identifies the native radio control as the row-selection cause. */
  readonly reason: "radio";
}

export interface DataGridSortingChangeDetail {
  /** Identifies the sortable column header as the ordering-change cause. */
  readonly reason: "header";
}

interface DataGridCommonProps<TData extends object> extends Omit<
  HTMLAttributes<HTMLDivElement>,
  "children" | "onChange"
> {
  /** Supplies canonical rows without allowing the grid to mutate consumer data. */
  readonly rows: readonly TData[];
  /** Defines native headers, accessors, optional cells, alignment, widths, and sorting. */
  readonly columns: readonly DataGridColumn<TData>[];
  /** Returns a non-empty stable row identity used by rendering and selection. */
  readonly getRowId: (row: TData) => string;
  /** Provides the native table caption and primary accessible table name. */
  readonly caption: string;
  /** Optionally names the surrounding horizontally scrollable region. */
  readonly regionLabel?: string;
  /** Replaces default empty-table content while retaining native table structure. */
  readonly emptyContent?: ReactNode;
  /** Styles the outer scroll region without replacing table semantics. */
  readonly className?: string;
}

interface DataGridSelectionDisabledProps {
  /** Controls row selection; none removes radio controls, summaries, and selection callbacks. */
  readonly selectionMode?: "none";
  /** Controls selection only in single-selection mode and is excluded when selection is disabled. */
  readonly selectedRowId?: never;
  /** Initializes uncontrolled selection and is excluded when selection is disabled. */
  readonly defaultSelectedRowId?: never;
  /** Reports radio selection and is excluded when selection is disabled. */
  readonly onSelectedRowIdChange?: never;
  /** Provides row labels for selection and is excluded when selection is disabled. */
  readonly getRowLabel?: never;
  /** Renders optional selection context and is excluded when selection is disabled. */
  readonly renderSelectionSummary?: never;
}

interface DataGridSingleSelectionBase<TData extends object> {
  /** Controls row selection; none removes radio controls, summaries, and selection callbacks. */
  readonly selectionMode: "single";
  /** Reports radio selection and is excluded when selection is disabled. */
  readonly onSelectedRowIdChange?: (rowId: string, detail: DataGridSelectionChangeDetail) => void;
  /** Provides row labels for selection and is excluded when selection is disabled. */
  readonly getRowLabel?: (row: TData) => string;
  /** Renders optional selection context and is excluded when selection is disabled. */
  readonly renderSelectionSummary?: (selectedRow: TData | null) => ReactNode;
}

interface DataGridControlledSingleSelectionProps<
  TData extends object,
> extends DataGridSingleSelectionBase<TData> {
  /** Controls selection only in single-selection mode and is excluded when selection is disabled. */
  readonly selectedRowId: string | null;
  /** Initializes uncontrolled selection and is excluded when selection is disabled. */
  readonly defaultSelectedRowId?: never;
}

interface DataGridUncontrolledSingleSelectionProps<
  TData extends object,
> extends DataGridSingleSelectionBase<TData> {
  /** Controls selection only in single-selection mode and is excluded when selection is disabled. */
  readonly selectedRowId?: never;
  /** Initializes uncontrolled selection and is excluded when selection is disabled. */
  readonly defaultSelectedRowId?: string | null;
}

export type DataGridSelectionProps<TData extends object> =
  | DataGridSelectionDisabledProps
  | DataGridControlledSingleSelectionProps<TData>
  | DataGridUncontrolledSingleSelectionProps<TData>;

interface DataGridControlledSortingProps {
  /** Controls the active sort column and direction, with null representing source order. */
  readonly sorting: DataGridSorting | null;
  /** Initializes uncontrolled sorting and is excluded when sorting is controlled. */
  readonly defaultSorting?: never;
  /** Reports sortable-header changes without mutating canonical rows. */
  readonly onSortingChange?: (
    sorting: DataGridSorting | null,
    detail: DataGridSortingChangeDetail,
  ) => void;
}

interface DataGridUncontrolledSortingProps {
  /** Controls the active sort column and direction, with null representing source order. */
  readonly sorting?: never;
  /** Initializes uncontrolled sorting and is excluded when sorting is controlled. */
  readonly defaultSorting?: DataGridSorting | null;
  /** Reports sortable-header changes without mutating canonical rows. */
  readonly onSortingChange?: (
    sorting: DataGridSorting | null,
    detail: DataGridSortingChangeDetail,
  ) => void;
}

export type DataGridSortingProps =
  DataGridControlledSortingProps | DataGridUncontrolledSortingProps;

/**
 * Runtime component props. Use DataGridSelectionProps and DataGridSortingProps when composing
 * typed adapter props; untyped/spread call sites receive the same invariants from the runtime
 * configuration guard before any selection renderer, callback, or state is consumed.
 */
export interface DataGridProps<TData extends object> extends DataGridCommonProps<TData> {
  /** Controls row selection; none removes radio controls, summaries, and selection callbacks. */
  readonly selectionMode?: DataGridSelectionMode;
  /** Controls selection only in single-selection mode and is excluded when selection is disabled. */
  readonly selectedRowId?: string | null;
  /** Initializes uncontrolled selection and is excluded when selection is disabled. */
  readonly defaultSelectedRowId?: string | null;
  /** Reports radio selection and is excluded when selection is disabled. */
  readonly onSelectedRowIdChange?: (rowId: string, detail: DataGridSelectionChangeDetail) => void;
  /** Provides row labels for selection and is excluded when selection is disabled. */
  readonly getRowLabel?: (row: TData) => string;
  /** Renders optional selection context and is excluded when selection is disabled. */
  readonly renderSelectionSummary?: (selectedRow: TData | null) => ReactNode;
  /** Controls the active sort column and direction, with null representing source order. */
  readonly sorting?: DataGridSorting | null;
  /** Initializes uncontrolled sorting and is excluded when sorting is controlled. */
  readonly defaultSorting?: DataGridSorting | null;
  /** Reports sortable-header changes without mutating canonical rows. */
  readonly onSortingChange?: (
    sorting: DataGridSorting | null,
    detail: DataGridSortingChangeDetail,
  ) => void;
}

/** @internal Shared optional-content predicate; not exported from the public item entrypoint. */
export function hasAccessibleContent(value: ReactNode): boolean {
  if (value === null || value === undefined || typeof value === "boolean") return false;
  if (typeof value === "string") return value.trim().length > 0;
  if (Array.isArray(value)) return value.some(hasAccessibleContent);
  if (isValidElement<{ readonly children?: ReactNode }>(value)) {
    if (value.type === Fragment) return hasAccessibleContent(value.props.children);
    return typeof value.type === "string" ? hasAccessibleContent(value.props.children) : true;
  }
  return true;
}

function classes(...values: readonly (string | undefined | false)[]): string {
  return values.filter((value): value is string => Boolean(value)).join(" ");
}

function formatCellValue(value: unknown): ReactNode {
  if (value === null || value === undefined) return "—";
  if (typeof value === "string" || typeof value === "number") return value;
  if (typeof value === "bigint" || typeof value === "boolean") return String(value);
  if (value instanceof Date) return value.toISOString();
  return "[value]";
}

function toTanStackSorting(value: DataGridSorting | null | undefined): SortingState {
  if (value === null || value === undefined) return [];
  return [{ id: value.columnId, desc: value.direction === "descending" }];
}

function fromTanStackSorting(value: SortingState): DataGridSorting | null {
  const first = value[0];
  if (first === undefined) return null;
  return { columnId: first.id, direction: first.desc ? "descending" : "ascending" };
}

function resolveUpdater<T>(updater: Updater<T>, previous: T): T {
  return typeof updater === "function" ? (updater as (value: T) => T)(previous) : updater;
}

function sameSorting(left: DataGridSorting | null, right: DataGridSorting | null): boolean {
  return (
    left === right ||
    (left !== null &&
      right !== null &&
      left.columnId === right.columnId &&
      left.direction === right.direction)
  );
}

const selectionOnlyKeys = [
  "selectedRowId",
  "defaultSelectedRowId",
  "onSelectedRowIdChange",
  "getRowLabel",
  "renderSelectionSummary",
] as const;

/** @internal Runtime guard for untyped JavaScript and spread-prop call sites. */
export function assertDataGridConfiguration(props: Readonly<Record<string, unknown>>): void {
  const selectionMode = props.selectionMode ?? "none";
  if (selectionMode !== "none" && selectionMode !== "single") {
    throw new RangeError('Mergora DataGrid selectionMode must be "none" or "single".');
  }
  if (selectionMode === "none") {
    const conflictingKey = selectionOnlyKeys.find((key) => Object.hasOwn(props, key));
    if (conflictingKey !== undefined) {
      throw new Error(
        `Mergora DataGrid ${conflictingKey} requires selectionMode="single"; selectionMode="none" owns no selection state, callbacks, or accessibility output.`,
      );
    }
  } else if (
    Object.hasOwn(props, "selectedRowId") &&
    Object.hasOwn(props, "defaultSelectedRowId")
  ) {
    throw new Error(
      "Mergora DataGrid controlled selection cannot be combined with defaultSelectedRowId.",
    );
  }
  if (Object.hasOwn(props, "sorting") && Object.hasOwn(props, "defaultSorting")) {
    throw new Error("Mergora DataGrid controlled sorting cannot be combined with defaultSorting.");
  }
}

function DataGridInner<TData extends object>(
  props: DataGridProps<TData>,
  ref: React.ForwardedRef<HTMLDivElement>,
): ReactElement {
  assertDataGridConfiguration(props as unknown as Readonly<Record<string, unknown>>);
  const {
    rows,
    columns,
    getRowId,
    caption,
    regionLabel,
    selectionMode = "none",
    selectedRowId,
    defaultSelectedRowId = null,
    onSelectedRowIdChange,
    getRowLabel,
    renderSelectionSummary,
    sorting,
    defaultSorting = null,
    onSortingChange,
    emptyContent = "No rows",
    className,
    ...regionProps
  } = props;
  const radioName = useId();
  const [uncontrolledSelection, setUncontrolledSelection] = useState<string | null>(
    selectionMode === "single" ? defaultSelectedRowId : null,
  );
  const [uncontrolledSorting, setUncontrolledSorting] = useState<DataGridSorting | null>(
    defaultSorting,
  );
  const currentSelection = selectedRowId === undefined ? uncontrolledSelection : selectedRowId;
  const currentSorting = sorting === undefined ? uncontrolledSorting : sorting;
  const data = useMemo(() => [...rows], [rows]);
  const tanStackSorting = useMemo(
    () => toTanStackSorting(currentSorting),
    [currentSorting?.columnId, currentSorting?.direction],
  );
  const tableState = useMemo(() => ({ sorting: tanStackSorting }), [tanStackSorting]);

  const columnDefinitions = useMemo<ColumnDef<TData, unknown>[]>(
    () =>
      columns.map((column) => ({
        id: column.id,
        accessorFn: column.accessor,
        header: () => column.header,
        cell: (context) =>
          column.cell === undefined
            ? formatCellValue(context.getValue())
            : column.cell(context.getValue(), context.row.original),
        enableSorting: column.sortable ?? false,
        meta: { alignment: column.alignment ?? "start", width: column.width },
      })),
    [columns],
  );

  const table = useReactTable({
    data,
    columns: columnDefinitions,
    getRowId,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    state: tableState,
    onSortingChange: (updater) => {
      const next = fromTanStackSorting(resolveUpdater(updater, tanStackSorting));
      if (sameSorting(currentSorting, next)) return;
      if (sorting === undefined) setUncontrolledSorting(next);
      onSortingChange?.(next, { reason: "header" });
    },
  });

  const visibleRows = table.getRowModel().rows;
  const visibleColumns = table.getVisibleLeafColumns();
  const columnCount = visibleColumns.length + (selectionMode === "single" ? 1 : 0);
  const selectionSummary =
    selectionMode === "single" && renderSelectionSummary !== undefined
      ? renderSelectionSummary(
          currentSelection === null
            ? null
            : (data.find((row) => getRowId(row) === currentSelection) ?? null),
        )
      : undefined;
  const hasSelectionSummary = hasAccessibleContent(selectionSummary);

  return (
    <div
      {...regionProps}
      ref={ref}
      role="region"
      aria-label={regionLabel ?? `${caption}: scrollable table`}
      tabIndex={0}
      data-slot="data-grid-region"
      data-maturity="experimental"
      className={classes("mrg-data-grid", className)}
    >
      <table data-slot="data-grid-table" className="mrg-data-grid__table">
        <caption>{caption}</caption>
        <thead data-slot="data-grid-header">
          {table.getHeaderGroups().map((headerGroup) => (
            <tr key={headerGroup.id} data-slot="data-grid-header-row">
              {selectionMode === "single" ? (
                <th scope="col" className="mrg-data-grid__selection-heading">
                  <span className="mrg-data-grid__visually-hidden">Select row</span>
                </th>
              ) : null}
              {headerGroup.headers.map((header) => {
                const sorted = header.column.getIsSorted();
                const meta = header.column.columnDef.meta as
                  { alignment?: DataGridColumnAlignment; width?: string } | undefined;
                return (
                  <th
                    key={header.id}
                    scope="col"
                    aria-sort={
                      sorted === "asc" ? "ascending" : sorted === "desc" ? "descending" : undefined
                    }
                    data-slot="data-grid-column-header"
                    data-align={meta?.alignment ?? "start"}
                    style={meta?.width === undefined ? undefined : { inlineSize: meta.width }}
                  >
                    {header.column.getCanSort() ? (
                      <button
                        type="button"
                        className="mrg-data-grid__sort"
                        onClick={header.column.getToggleSortingHandler()}
                        data-sorted={sorted || undefined}
                      >
                        <span>
                          {flexRender(header.column.columnDef.header, header.getContext())}
                        </span>
                        <span aria-hidden="true" className="mrg-data-grid__sort-indicator">
                          {sorted === "asc" ? "↑" : sorted === "desc" ? "↓" : "↕"}
                        </span>
                      </button>
                    ) : (
                      flexRender(header.column.columnDef.header, header.getContext())
                    )}
                  </th>
                );
              })}
            </tr>
          ))}
        </thead>
        <tbody data-slot="data-grid-body">
          {visibleRows.length === 0 ? (
            <tr data-slot="data-grid-empty-row">
              <td colSpan={columnCount} className="mrg-data-grid__empty">
                {emptyContent}
              </td>
            </tr>
          ) : (
            visibleRows.map((row) => {
              const rowId = row.id;
              const selected = currentSelection === rowId;
              return (
                <tr key={rowId} data-slot="data-grid-row" data-selected={selected || undefined}>
                  {selectionMode === "single" ? (
                    <td
                      data-slot="data-grid-selection-cell"
                      className="mrg-data-grid__selection-cell"
                    >
                      <input
                        type="radio"
                        name={radioName}
                        value={rowId}
                        checked={selected}
                        aria-label={getRowLabel?.(row.original) ?? `Select row ${row.index + 1}`}
                        onChange={() => {
                          if (selectedRowId === undefined) setUncontrolledSelection(rowId);
                          onSelectedRowIdChange?.(rowId, { reason: "radio" });
                        }}
                      />
                    </td>
                  ) : null}
                  {row.getVisibleCells().map((cell) => {
                    const meta = cell.column.columnDef.meta as
                      { alignment?: DataGridColumnAlignment } | undefined;
                    return (
                      <td
                        key={cell.id}
                        data-slot="data-grid-cell"
                        data-align={meta?.alignment ?? "start"}
                      >
                        {flexRender(cell.column.columnDef.cell, cell.getContext())}
                      </td>
                    );
                  })}
                </tr>
              );
            })
          )}
        </tbody>
      </table>
      {hasSelectionSummary ? (
        <output
          aria-live="polite"
          className="mrg-data-grid__selection-summary"
          data-slot="data-grid-selection-summary"
        >
          {selectionSummary}
        </output>
      ) : null}
    </div>
  );
}

export interface DataGridComponent {
  <TData extends object>(
    props: DataGridProps<TData> & RefAttributes<HTMLDivElement>,
  ): ReactElement | null;
}

export const DataGrid = forwardRef(DataGridInner) as DataGridComponent;
