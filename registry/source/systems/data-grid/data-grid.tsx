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
  forwardRef,
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
  readonly columnId: string;
  readonly direction: DataGridSortDirection;
}

export interface DataGridColumn<TData extends object> {
  readonly id: string;
  readonly header: ReactNode;
  readonly accessor: (row: TData) => unknown;
  readonly cell?: (value: unknown, row: TData) => ReactNode;
  readonly sortable?: boolean;
  readonly alignment?: DataGridColumnAlignment;
  readonly width?: string;
}

export interface DataGridSelectionChangeDetail {
  readonly reason: "radio";
}

export interface DataGridSortingChangeDetail {
  readonly reason: "header";
}

export interface DataGridProps<TData extends object> extends Omit<
  HTMLAttributes<HTMLDivElement>,
  "children" | "onChange"
> {
  readonly rows: readonly TData[];
  readonly columns: readonly DataGridColumn<TData>[];
  readonly getRowId: (row: TData) => string;
  readonly caption: string;
  readonly regionLabel?: string;
  readonly selectionMode?: DataGridSelectionMode;
  readonly selectedRowId?: string | null;
  readonly defaultSelectedRowId?: string | null;
  readonly onSelectedRowIdChange?: (rowId: string, detail: DataGridSelectionChangeDetail) => void;
  readonly getRowLabel?: (row: TData) => string;
  readonly sorting?: DataGridSorting | null;
  readonly defaultSorting?: DataGridSorting | null;
  readonly onSortingChange?: (
    sorting: DataGridSorting | null,
    detail: DataGridSortingChangeDetail,
  ) => void;
  readonly emptyContent?: ReactNode;
  readonly className?: string;
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

function DataGridInner<TData extends object>(
  {
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
    sorting,
    defaultSorting = null,
    onSortingChange,
    emptyContent = "No rows",
    className,
    ...regionProps
  }: DataGridProps<TData>,
  ref: React.ForwardedRef<HTMLDivElement>,
): ReactElement {
  const radioName = useId();
  const [uncontrolledSelection, setUncontrolledSelection] = useState<string | null>(
    defaultSelectedRowId,
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
    </div>
  );
}

export interface DataGridComponent {
  <TData extends object>(
    props: DataGridProps<TData> & RefAttributes<HTMLDivElement>,
  ): ReactElement | null;
}

export const DataGrid = forwardRef(DataGridInner) as DataGridComponent;
