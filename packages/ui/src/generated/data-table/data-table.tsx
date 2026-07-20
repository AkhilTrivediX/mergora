// Generated from registry/source/components/data-table/data-table.tsx by @mergora-internal/source-transformer. Do not edit.
"use client";

import "./data-table.css";

import { useMemo, useState, type HTMLAttributes, type ReactElement, type ReactNode } from "react";

export type DataTableSortDirection = "ascending" | "descending";
export type DataTableOperationReason = "filter" | "sort" | "page" | "page-size";

export interface DataTableSort {
  /** Stable identifier of the column currently supplying sort values. */
  readonly columnId: string;
  /** Accessible ascending or descending ordering applied to the column. */
  readonly direction: DataTableSortDirection;
}

export interface DataTableQuery {
  /** Current free-text filter value; an empty string represents no search filter. */
  readonly search: string;
  /** One-based requested page number used by client and manual operation modes. */
  readonly page: number;
  /** Positive number of result rows requested per page. */
  readonly pageSize: number;
  /** Current sort model, or null when source ordering remains unchanged. */
  readonly sort: DataTableSort | null;
}

export interface DataTableQueryAdapter {
  /** Optionally restores an initial query when no controlled or default query is supplied. */
  readonly read?: () => Partial<DataTableQuery>;
  /** Persists each committed query together with the operation that caused it. */
  readonly write: (
    query: DataTableQuery,
    detail: {
      /** User operation that produced the persisted query. */
      readonly reason: DataTableOperationReason;
    },
  ) => void;
}

export interface DataTableColumn<TData extends object> {
  /** Stable unique column identifier used by rendering and the sort query. */
  readonly id: string;
  /** Visible column-header content. */
  readonly header: ReactNode;
  /** Renders the visible body cell for a source row. */
  readonly cell: (row: TData) => ReactNode;
  /** Returns the primitive client-side sort value for this column. */
  readonly sortValue?: (row: TData) => string | number;
  /** Returns searchable plain text for a row; defaults to the rendered cell's string form. */
  readonly filterValue?: (row: TData) => string;
  /** Adds the sort control for this column and requires sortValue. */
  readonly sortable?: boolean;
  /** Logical alignment applied to this column's header and cells. */
  readonly align?: "start" | "center" | "end";
}

export interface DataTableProps<TData extends object> extends Omit<
  HTMLAttributes<HTMLDivElement>,
  "children" | "onChange"
> {
  /** Visible native caption and source for table-region labels. */
  readonly caption: string;
  /** Ordered row models, already filtered and paged when operationMode is manual. */
  readonly rows: readonly TData[];
  /** Ordered column definitions used for headers, cells, filtering, and sorting. */
  readonly columns: readonly DataTableColumn<TData>[];
  /** Returns a stable unique row identifier used by rendering and optional selection. */
  readonly getRowId: (row: TData) => string;
  /** Controlled complete query state; pair with onQueryChange and omit defaultQuery. */
  readonly query?: DataTableQuery;
  /** Initial partial query normalized for uncontrolled operation. */
  readonly defaultQuery?: Partial<DataTableQuery>;
  /** Reports every query change together with its filter, sort, page, or page-size reason. */
  readonly onQueryChange?: (
    query: DataTableQuery,
    detail: {
      /** User operation that produced the next query. */
      readonly reason: DataTableOperationReason;
    },
  ) => void;
  /** Chooses built-in client processing or consumer-managed filtering, sorting, and paging. */
  readonly operationMode?: "client" | "manual";
  /** Total remote result count used for page math in manual operation mode. */
  readonly totalRows?: number;
  /** Adds a labelled search input and client filtering; false removes both. */
  readonly searchable?: boolean;
  /** Localized visible label for the optional search input. */
  readonly searchLabel?: string;
  /** Adds a row checkbox column and selection behavior; false removes the complete column. */
  readonly selectable?: boolean;
  /** Controlled ordered row identifiers selected through the optional checkbox column. */
  readonly selectedRowIds?: readonly string[];
  /** Initial selected row identifiers when optional selection is uncontrolled. */
  readonly defaultSelectedRowIds?: readonly string[];
  /** Reports the complete ordered set of selected row identifiers. */
  readonly onSelectedRowIdsChange?: (ids: readonly string[]) => void;
  /** Adds page navigation and page-size controls; false removes the complete navigation region. */
  readonly paginated?: boolean;
  /** Positive page-size choices rendered in the optional pagination control. */
  readonly pageSizes?: readonly number[];
  /** Optional external query persistence; false removes all adapter reads and writes. */
  readonly queryAdapter?: false | DataTableQueryAdapter;
  /** Adds a polite result-and-page summary; false removes the output and announcements. */
  readonly showQuerySummary?: boolean;
  /** Custom renderer for the optional query summary with visible and total row counts. */
  readonly renderQuerySummary?: (
    query: DataTableQuery,
    visibleRows: number,
    totalRows: number,
  ) => ReactNode;
  /** Exposes table busy state and blocks pagination while a consumer operation is pending. */
  readonly loading?: boolean;
  /** Content spanning all columns when the processed result set is empty. */
  readonly emptyContent?: ReactNode;
}

export function normalizeDataTableQuery(value: Partial<DataTableQuery> = {}): DataTableQuery {
  const page = Number.isInteger(value.page) && (value.page ?? 0) > 0 ? value.page! : 1;
  const pageSize =
    Number.isInteger(value.pageSize) && (value.pageSize ?? 0) > 0 ? value.pageSize! : 10;
  return { search: value.search ?? "", page, pageSize, sort: value.sort ?? null };
}

export function serializeDataTableQuery(query: DataTableQuery): string {
  const parameters = new URLSearchParams();
  if (query.search !== "") parameters.set("q", query.search);
  if (query.page !== 1) parameters.set("page", String(query.page));
  if (query.pageSize !== 10) parameters.set("pageSize", String(query.pageSize));
  if (query.sort !== null) {
    parameters.set("sort", query.sort.columnId);
    parameters.set("direction", query.sort.direction);
  }
  return parameters.toString();
}

export function parseDataTableQuery(value: string): DataTableQuery {
  const parameters = new URLSearchParams(value.startsWith("?") ? value.slice(1) : value);
  const columnId = parameters.get("sort");
  const direction = parameters.get("direction");
  return normalizeDataTableQuery({
    search: parameters.get("q") ?? "",
    page: Number(parameters.get("page") ?? 1),
    pageSize: Number(parameters.get("pageSize") ?? 10),
    sort:
      columnId !== null && (direction === "ascending" || direction === "descending")
        ? { columnId, direction }
        : null,
  });
}

function classes(...values: readonly (string | undefined | false)[]): string {
  return values.filter((value): value is string => Boolean(value)).join(" ");
}

function compareValues(left: string | number, right: string | number): number {
  return typeof left === "number" && typeof right === "number"
    ? left - right
    : String(left).localeCompare(String(right), undefined, { numeric: true, sensitivity: "base" });
}

export function DataTable<TData extends object>({
  caption,
  rows,
  columns,
  getRowId,
  query: controlledQuery,
  defaultQuery,
  onQueryChange,
  operationMode = "client",
  totalRows,
  searchable = false,
  searchLabel = "Filter rows",
  selectable = false,
  selectedRowIds,
  defaultSelectedRowIds = [],
  onSelectedRowIdsChange,
  paginated = false,
  pageSizes = [10, 25, 50],
  queryAdapter = false,
  showQuerySummary = false,
  renderQuerySummary,
  loading = false,
  emptyContent = "No matching rows",
  className,
  ...props
}: DataTableProps<TData>): ReactElement {
  const invalidSortable = columns.find(
    (column) => column.sortable && column.sortValue === undefined,
  );
  if (invalidSortable !== undefined) {
    throw new Error(
      `Mergora DataTable sortable column ${JSON.stringify(invalidSortable.id)} requires sortValue.`,
    );
  }
  if (controlledQuery !== undefined && defaultQuery !== undefined) {
    throw new Error("Mergora DataTable controlled query cannot be combined with defaultQuery.");
  }
  if (selectedRowIds !== undefined && defaultSelectedRowIds.length > 0) {
    throw new Error(
      "Mergora DataTable controlled selection cannot be combined with defaultSelectedRowIds.",
    );
  }
  const [internalQuery, setInternalQuery] = useState<DataTableQuery>(() =>
    controlledQuery === undefined
      ? normalizeDataTableQuery(
          defaultQuery ?? (queryAdapter === false ? undefined : queryAdapter.read?.()),
        )
      : normalizeDataTableQuery(),
  );
  const [internalSelected, setInternalSelected] =
    useState<readonly string[]>(defaultSelectedRowIds);
  const query = controlledQuery ?? internalQuery;
  const selected = selectedRowIds ?? internalSelected;

  const commitQuery = (next: DataTableQuery, reason: DataTableOperationReason) => {
    if (controlledQuery === undefined) setInternalQuery(next);
    onQueryChange?.(next, { reason });
    if (queryAdapter !== false) queryAdapter.write(next, { reason });
  };

  const filteredAndSortedRows = useMemo(() => {
    if (operationMode === "manual") return [...rows];
    let next = [...rows];
    if (searchable && query.search.trim() !== "") {
      const term = query.search.toLocaleLowerCase();
      next = next.filter((row) =>
        columns.some((column) =>
          (column.filterValue?.(row) ?? String(column.cell(row)))
            .toLocaleLowerCase()
            .includes(term),
        ),
      );
    }
    if (query.sort !== null) {
      const column = columns.find((candidate) => candidate.id === query.sort?.columnId);
      if (column?.sortValue !== undefined) {
        const factor = query.sort.direction === "ascending" ? 1 : -1;
        next.sort(
          (left, right) =>
            factor * compareValues(column.sortValue!(left), column.sortValue!(right)),
        );
      }
    }
    return next;
  }, [columns, operationMode, query.search, query.sort, rows, searchable]);
  const resultCount =
    operationMode === "manual" ? (totalRows ?? rows.length) : filteredAndSortedRows.length;
  const pageCount = Math.max(1, Math.ceil(resultCount / query.pageSize));
  const effectivePage = Math.min(query.page, pageCount);
  const effectiveQuery = effectivePage === query.page ? query : { ...query, page: effectivePage };
  const processedRows =
    operationMode === "manual" || !paginated
      ? filteredAndSortedRows
      : filteredAndSortedRows.slice(
          (effectivePage - 1) * query.pageSize,
          effectivePage * query.pageSize,
        );
  const summary = showQuerySummary
    ? (renderQuerySummary?.(effectiveQuery, processedRows.length, resultCount) ??
      `${resultCount} rows · page ${effectivePage} of ${pageCount}`)
    : null;

  const updateSelection = (id: string, checked: boolean) => {
    const next = checked
      ? [...new Set([...selected, id])]
      : selected.filter((candidate) => candidate !== id);
    if (selectedRowIds === undefined) setInternalSelected(next);
    onSelectedRowIdsChange?.(next);
  };

  return (
    <div
      {...props}
      role="region"
      aria-label={`${caption} data table`}
      className={classes("mrg-data-table", className)}
      data-slot="data-table"
      aria-busy={loading || undefined}
    >
      {searchable ? (
        <label className="mrg-data-table__search">
          <span>{searchLabel}</span>
          <input
            value={query.search}
            type="search"
            onChange={(event) =>
              commitQuery({ ...query, search: event.currentTarget.value, page: 1 }, "filter")
            }
          />
        </label>
      ) : null}
      <div
        role="region"
        aria-label={`${caption}: scrollable table`}
        tabIndex={0}
        className="mrg-data-table__region"
      >
        <table>
          <caption>{caption}</caption>
          <thead>
            <tr>
              {selectable ? (
                <th scope="col">
                  <span className="mrg-data-table__visually-hidden">Select row</span>
                </th>
              ) : null}
              {columns.map((column) => {
                const direction =
                  query.sort?.columnId === column.id ? query.sort.direction : undefined;
                return (
                  <th
                    key={column.id}
                    scope="col"
                    aria-sort={direction}
                    data-align={column.align ?? "start"}
                  >
                    {column.sortable ? (
                      <button
                        type="button"
                        onClick={() =>
                          commitQuery(
                            {
                              ...query,
                              page: 1,
                              sort: {
                                columnId: column.id,
                                direction: direction === "ascending" ? "descending" : "ascending",
                              },
                            },
                            "sort",
                          )
                        }
                      >
                        <span>{column.header}</span>
                        <span aria-hidden="true">
                          {direction === "ascending" ? "↑" : direction === "descending" ? "↓" : "↕"}
                        </span>
                      </button>
                    ) : (
                      column.header
                    )}
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {processedRows.length === 0 ? (
              <tr>
                <td
                  colSpan={columns.length + (selectable ? 1 : 0)}
                  className="mrg-data-table__empty"
                >
                  {loading ? "Loading rows" : emptyContent}
                </td>
              </tr>
            ) : (
              processedRows.map((row) => {
                const id = getRowId(row);
                const checked = selected.includes(id);
                return (
                  <tr key={id} data-selected={checked || undefined}>
                    {selectable ? (
                      <td>
                        <input
                          aria-label={`Select row ${id}`}
                          type="checkbox"
                          checked={checked}
                          onChange={(event) => updateSelection(id, event.currentTarget.checked)}
                        />
                      </td>
                    ) : null}
                    {columns.map((column) => (
                      <td key={column.id} data-align={column.align ?? "start"}>
                        {column.cell(row)}
                      </td>
                    ))}
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
      {paginated ? (
        <nav
          aria-label={`${caption} pages`}
          className="mrg-data-table__pagination"
          data-page-clamped={effectivePage !== query.page || undefined}
        >
          <button
            type="button"
            disabled={effectivePage <= 1 || loading}
            onClick={() => commitQuery({ ...query, page: effectivePage - 1 }, "page")}
          >
            Previous
          </button>
          <span>
            Page {effectivePage} of {pageCount}
          </span>
          <button
            type="button"
            disabled={effectivePage >= pageCount || loading}
            onClick={() => commitQuery({ ...query, page: effectivePage + 1 }, "page")}
          >
            Next
          </button>
          <label>
            <span>Rows</span>
            <select
              value={query.pageSize}
              onChange={(event) =>
                commitQuery(
                  { ...query, page: 1, pageSize: Number(event.currentTarget.value) },
                  "page-size",
                )
              }
            >
              {pageSizes.map((size) => (
                <option key={size} value={size}>
                  {size}
                </option>
              ))}
            </select>
          </label>
        </nav>
      ) : null}
      {showQuerySummary ? (
        <output
          aria-live="polite"
          className="mrg-data-table__summary"
          data-slot="data-table-query-summary"
        >
          {summary}
        </output>
      ) : null}
    </div>
  );
}
