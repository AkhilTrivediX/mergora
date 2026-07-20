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
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type HTMLAttributes,
  type ReactElement,
  type ReactNode,
  type RefAttributes,
} from "react";

export type DataGridColumnAlignment = "start" | "center" | "end";
export type DataGridSelectionMode = "none" | "single";
export type DataGridSortDirection = "ascending" | "descending";
export type DataGridOperationMode = "client" | "manual";
export type DataGridOperationReason = "filter" | "sort" | "page" | "page-size" | "cursor";

export interface DataGridSorting {
  /** Identifies the sortable column controlling the current row order. */
  readonly columnId: string;
  /** Selects ascending or descending order for the active sort column. */
  readonly direction: DataGridSortDirection;
}

export interface DataGridPagePaginationState {
  /** Selects numbered-page state. */
  readonly mode: "page";
  /** One-based requested page number. */
  readonly page: number;
  /** Positive number of rows requested per page. */
  readonly pageSize: number;
}

export interface DataGridCursorPaginationState {
  /** Selects opaque-cursor state for consumer-managed data. */
  readonly mode: "cursor";
  /** Opaque current-window cursor, with null representing the initial window. */
  readonly cursor: string | null;
  /** Positive number of rows requested per result window. */
  readonly pageSize: number;
}

export type DataGridPaginationState = DataGridPagePaginationState | DataGridCursorPaginationState;

export interface DataGridQuery {
  /** Current free-text filter, with an empty string representing no filter. */
  readonly filter: string;
  /** Active sort model, or null when source ordering remains unchanged. */
  readonly sorting: DataGridSorting | null;
  /** Active page or cursor state, or null when pagination is disabled. */
  readonly pagination: DataGridPaginationState | null;
}

export interface DataGridQueryChangeDetail {
  /** User operation that produced the next query. */
  readonly reason: DataGridOperationReason;
  /** Deterministic canonical serialization of the complete next query. */
  readonly serialized: string;
}

export interface DataGridQueryAdapter {
  /** Restores an initial uncontrolled query when no explicit default is supplied. */
  readonly read?: () => Partial<DataGridQuery> | string | null | undefined;
  /** Persists each committed query and its deterministic serialization. */
  readonly write: (query: DataGridQuery, detail: DataGridQueryChangeDetail) => void;
}

export interface DataGridFilteringOptions<TData extends object> {
  /** Returns localized searchable text for a complete row instead of accessor-derived text. */
  readonly getRowText?: (row: TData) => string;
}

interface DataGridPaginationOptionsBase {
  /** Positive page-size choices rendered in the optional pagination controls. */
  readonly pageSizes?: readonly number[];
  /** Total matching row count supplied by a manual operation when it is known. */
  readonly totalRows?: number;
}

export interface DataGridPagePaginationOptions extends DataGridPaginationOptionsBase {
  /** Selects numbered pagination; omitted mode also selects this default. */
  readonly mode?: "page";
}

export interface DataGridCursorPaginationOptions extends DataGridPaginationOptionsBase {
  /** Selects opaque cursor pagination, which is available only in manual operation mode. */
  readonly mode: "cursor";
  /** Cursor requested by the previous-results action; null or omission disables that action. */
  readonly previousCursor?: string | null;
  /** Cursor requested by the next-results action; null or omission disables that action. */
  readonly nextCursor?: string | null;
}

export type DataGridPaginationOptions =
  DataGridPagePaginationOptions | DataGridCursorPaginationOptions;

export type DataGridOperationStatus =
  | {
      /** Removes operation status UI while retaining the discriminated status model. */
      readonly state: "idle";
    }
  | {
      /** Marks the existing table busy without replacing its rows. */
      readonly state: "loading";
      /** Replaces the localized default loading message. */
      readonly message?: ReactNode;
    }
  | {
      /** Adds an accessible recovery rail while retaining the existing rows. */
      readonly state: "error";
      /** Replaces the localized default error message. */
      readonly message?: ReactNode;
      /** Adds a retry action; omission removes the action and its events. */
      readonly onRetry?: () => void;
    };

export interface DataGridQuerySummaryContext {
  /** Canonical query represented by the currently rendered rows and controls. */
  readonly query: DataGridQuery;
  /** Number of rows rendered in the current table body. */
  readonly visibleRowCount: number;
  /** Complete matching count, or null when a manual source has not supplied one. */
  readonly totalRowCount: number | null;
  /** Number of numbered pages, or null outside numbered pagination. */
  readonly pageCount: number | null;
}

export interface DataGridMessages {
  /** Visible and accessible label for the optional filter input. */
  readonly filterLabel: string;
  /** Optional hint displayed inside the filter input. */
  readonly filterPlaceholder: string;
  /** Names the native row-selection column. */
  readonly selectionColumnLabel: string;
  /** Produces a fallback label for each row-selection radio. */
  readonly selectRowLabel: (visibleRowIndex: number) => string;
  /** Produces the optional pagination navigation landmark name. */
  readonly paginationLabel: (caption: string) => string;
  /** Labels the numbered previous-page action. */
  readonly previousPageLabel: string;
  /** Labels the numbered next-page action. */
  readonly nextPageLabel: string;
  /** Labels the cursor previous-results action. */
  readonly previousResultsLabel: string;
  /** Labels the cursor next-results action. */
  readonly nextResultsLabel: string;
  /** Visible label for the page-size selection control. */
  readonly rowsPerPageLabel: string;
  /** Produces visible numbered-page position text. */
  readonly pageStatus: (page: number, pageCount: number) => string;
  /** Describes an opaque cursor window without exposing the cursor value. */
  readonly cursorStatus: string;
  /** Default polite text for an in-progress operation. */
  readonly loadingLabel: string;
  /** Default alert text for a failed operation. */
  readonly errorLabel: string;
  /** Label for the optional operation retry action. */
  readonly retryLabel: string;
  /** Produces the built-in optional query summary. */
  readonly querySummary: (context: DataGridQuerySummaryContext) => string;
}

export interface DataGridColumn<TData extends object> {
  /** Provides the stable TanStack column identifier used by sorting state. */
  readonly id: string;
  /** Renders the visible and accessible native column header content. */
  readonly header: ReactNode;
  /** Returns the canonical value used by default cells, filtering, and sorting. */
  readonly accessor: (row: TData) => unknown;
  /** Replaces default value formatting with consumer-owned cell content. */
  readonly cell?: (value: unknown, row: TData) => ReactNode;
  /** Enables native header-button sorting for this individual column. */
  readonly sortable?: boolean;
  /** Aligns header and body cells using logical start, center, or end. */
  readonly alignment?: DataGridColumnAlignment;
  /** Applies a consumer-supplied column width to the native column definition. */
  readonly width?: string;
  /** Enables a bounded native width control for this individual column. */
  readonly sizing?: DataGridColumnSizeOptions;
  /** Supplies localized control text when this column appears in the optional visibility panel. */
  readonly visibilityLabel?: string;
}

export interface DataGridColumnSizeOptions {
  /** Smallest permitted rendered width in CSS pixels. */
  readonly min: number;
  /** Largest permitted rendered width in CSS pixels. */
  readonly max: number;
  /** Initial uncontrolled width in CSS pixels before a map override. */
  readonly default: number;
  /** Native range increment in CSS pixels; defaults to 8. */
  readonly step?: number;
  /** Replaces the column header text in the native width-control label. */
  readonly label?: string;
}

export type DataGridColumnWidths = Readonly<{
  /** Stores a requested CSS-pixel width for each declared resizable column. */
  [columnId: string]: number;
}>;

export interface DataGridColumnSizingChangeDetail {
  /** Identifies the native range control that requested the next width. */
  readonly columnId: string;
  /** Identifies the native range control as the committed sizing-change cause. */
  readonly reason: "native-range";
  /** Reports the next validated CSS-pixel width. */
  readonly width: number;
}

export interface DataGridColumnSizingOptions {
  /** Controls declared resizable-column widths in CSS pixels. */
  readonly widths?: DataGridColumnWidths;
  /** Initializes uncontrolled declared resizable-column widths in CSS pixels. */
  readonly defaultWidths?: DataGridColumnWidths;
  /** Reports each native range request after validating the complete width map. */
  readonly onWidthsChange?: (
    widths: DataGridColumnWidths,
    detail: DataGridColumnSizingChangeDetail,
  ) => void;
}

export type DataGridExpandedRowIds = readonly string[];

export interface DataGridDetailRowsChangeDetail {
  /** Identifies the row whose native disclosure button requested a change. */
  readonly rowId: string;
  /** Identifies the native disclosure button as the committed expansion cause. */
  readonly reason: "native-button";
  /** Reports whether the named row is expanded in the next canonical row-ID list. */
  readonly expanded: boolean;
}

export interface DataGridDetailRowsOptions<TData extends object> {
  /** Controls the expanded row IDs; order is normalized to the current source-row order. */
  readonly expandedRowIds?: DataGridExpandedRowIds;
  /** Initializes uncontrolled expanded row IDs; native form reset restores this value. */
  readonly defaultExpandedRowIds?: DataGridExpandedRowIds;
  /** Reports each native disclosure request with the complete next canonical row-ID list. */
  readonly onExpandedRowIdsChange?: (
    expandedRowIds: DataGridExpandedRowIds,
    detail: DataGridDetailRowsChangeDetail,
  ) => void;
  /** Renders the consumer-owned detail content in a semantic table row. */
  readonly renderDetail: (row: TData) => ReactNode;
  /** Produces a localized native disclosure-button name for each source row. */
  readonly getDetailLabel?: (row: TData, expanded: boolean) => string;
}

export type DataGridColumnVisibility = Readonly<{
  /** Stores the visible state for a declared column ID; omitted IDs remain visible. */
  [columnId: string]: boolean;
}>;

export interface DataGridColumnVisibilityChangeDetail {
  /** Identifies the column whose visibility a native checkbox changed. */
  readonly columnId: string;
  /** Identifies the native checkbox as the committed visibility-change cause. */
  readonly reason: "native-checkbox";
  /** Deterministic canonical serialization of the complete next visibility map. */
  readonly serialized: string;
  /** Reports the requested next visible state for that column. */
  readonly visible: boolean;
}

export interface DataGridColumnVisibilityAdapter {
  /** Restores an initial uncontrolled visibility map after hydration. */
  readonly read?: () => DataGridColumnVisibility | string | null | undefined;
  /** Persists each committed checkbox change; omission means no persistence I/O. */
  readonly write: (
    visibility: DataGridColumnVisibility,
    detail: DataGridColumnVisibilityChangeDetail,
  ) => void;
}

export interface DataGridColumnVisibilityOptions {
  /** Controls visible columns by ID; every omitted declared column remains visible. */
  readonly visibility?: DataGridColumnVisibility;
  /** Initializes uncontrolled visible columns by ID; every omitted declared column remains visible. */
  readonly defaultVisibility?: DataGridColumnVisibility;
  /** Reports an explicit requested column-visibility map and the native checkbox cause. */
  readonly onVisibilityChange?: (
    visibility: DataGridColumnVisibility,
    detail: DataGridColumnVisibilityChangeDetail,
  ) => void;
  /** Restores and persists uncontrolled visibility; false removes all adapter I/O. */
  readonly adapter?: false | DataGridColumnVisibilityAdapter;
  /** Names the optional native disclosure that contains visibility checkboxes. */
  readonly label?: string;
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
  /** Enables optional controlled or uncontrolled native column-visibility controls. */
  readonly columnVisibility?: false | DataGridColumnVisibilityOptions;
  /** Enables optional controlled or uncontrolled native column-width controls. */
  readonly columnSizing?: false | DataGridColumnSizingOptions;
  /** Enables optional controlled or uncontrolled semantic detail rows. */
  readonly detailRows?: false | DataGridDetailRowsOptions<TData>;
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
  /** Supplies a stable native radio name and is excluded when selection is disabled. */
  readonly selectionName?: never;
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
  /** Supplies a stable native radio name for form serialization. */
  readonly selectionName?: string;
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
 * strictly exclusive adapter props; runtime guards preserve the same invariants for JavaScript and
 * spread-prop call sites.
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
  /** Supplies a stable native radio name for form serialization. */
  readonly selectionName?: string;
  /** Controls the active legacy sort and is excluded when aggregate query ownership is active. */
  readonly sorting?: DataGridSorting | null;
  /** Initializes uncontrolled legacy sorting and is excluded from aggregate query ownership. */
  readonly defaultSorting?: DataGridSorting | null;
  /** Reports legacy sortable-header changes and is excluded from aggregate query ownership. */
  readonly onSortingChange?: (
    sorting: DataGridSorting | null,
    detail: DataGridSortingChangeDetail,
  ) => void;
  /** Controls the complete aggregate filter, sort, and pagination query. */
  readonly query?: DataGridQuery;
  /** Initializes a partial uncontrolled aggregate query. */
  readonly defaultQuery?: Partial<DataGridQuery>;
  /** Reports every aggregate query operation and its deterministic serialization. */
  readonly onQueryChange?: (query: DataGridQuery, detail: DataGridQueryChangeDetail) => void;
  /** Adds free-text filtering; false removes its UI, processing, events, and accessibility output. */
  readonly filtering?: boolean | DataGridFilteringOptions<TData>;
  /** Adds numbered or cursor pagination; false removes the complete navigation region. */
  readonly pagination?: boolean | DataGridPaginationOptions;
  /** Chooses built-in filter/sort/page processing or consumer-managed ordered rows. */
  readonly operationMode?: DataGridOperationMode;
  /** Adds initial query restoration and committed-query persistence; false removes all adapter I/O. */
  readonly queryAdapter?: false | DataGridQueryAdapter;
  /** Adds loading or error recovery semantics while retaining current rows; false removes the rail. */
  readonly operationStatus?: false | DataGridOperationStatus;
  /** Customizes the optional query summary; false removes its UI and live-region output. */
  readonly renderQuerySummary?: false | ((context: DataGridQuerySummaryContext) => ReactNode);
  /** Adds one canonical hidden form value containing the serialized aggregate query. */
  readonly queryName?: string;
  /** Replaces individual localized labels without changing interaction structure. */
  readonly messages?: Partial<DataGridMessages>;
}

const defaultMessages: DataGridMessages = {
  filterLabel: "Filter records",
  filterPlaceholder: "",
  selectionColumnLabel: "Select row",
  selectRowLabel: (visibleRowIndex) => `Select row ${visibleRowIndex}`,
  paginationLabel: (caption) => `${caption} pagination`,
  previousPageLabel: "Previous page",
  nextPageLabel: "Next page",
  previousResultsLabel: "Previous results",
  nextResultsLabel: "Next results",
  rowsPerPageLabel: "Rows per page",
  pageStatus: (page, pageCount) => `Page ${page} of ${pageCount}`,
  cursorStatus: "Current result window",
  loadingLabel: "Loading records",
  errorLabel: "Could not load records.",
  retryLabel: "Retry loading records",
  querySummary: ({ query, visibleRowCount, totalRowCount, pageCount }) => {
    if (query.pagination?.mode === "page" && pageCount !== null && totalRowCount !== null) {
      return `${totalRowCount} records · page ${query.pagination.page} of ${pageCount}`;
    }
    if (totalRowCount !== null) return `${totalRowCount} matching records`;
    return `${visibleRowCount} records shown`;
  },
};

function resolveMessages(messages: Partial<DataGridMessages> | undefined): DataGridMessages {
  return {
    filterLabel: messages?.filterLabel ?? defaultMessages.filterLabel,
    filterPlaceholder: messages?.filterPlaceholder ?? defaultMessages.filterPlaceholder,
    selectionColumnLabel: messages?.selectionColumnLabel ?? defaultMessages.selectionColumnLabel,
    selectRowLabel: messages?.selectRowLabel ?? defaultMessages.selectRowLabel,
    paginationLabel: messages?.paginationLabel ?? defaultMessages.paginationLabel,
    previousPageLabel: messages?.previousPageLabel ?? defaultMessages.previousPageLabel,
    nextPageLabel: messages?.nextPageLabel ?? defaultMessages.nextPageLabel,
    previousResultsLabel: messages?.previousResultsLabel ?? defaultMessages.previousResultsLabel,
    nextResultsLabel: messages?.nextResultsLabel ?? defaultMessages.nextResultsLabel,
    rowsPerPageLabel: messages?.rowsPerPageLabel ?? defaultMessages.rowsPerPageLabel,
    pageStatus: messages?.pageStatus ?? defaultMessages.pageStatus,
    cursorStatus: messages?.cursorStatus ?? defaultMessages.cursorStatus,
    loadingLabel: messages?.loadingLabel ?? defaultMessages.loadingLabel,
    errorLabel: messages?.errorLabel ?? defaultMessages.errorLabel,
    retryLabel: messages?.retryLabel ?? defaultMessages.retryLabel,
    querySummary: messages?.querySummary ?? defaultMessages.querySummary,
  };
}

const defaultPageSizes = [10, 25, 50] as const;

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

function isPositiveInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value > 0;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  try {
    const prototype = Object.getPrototypeOf(value) as object | null;
    return prototype === null || Object.getPrototypeOf(prototype) === null;
  } catch {
    return false;
  }
}

function hasDefinedOwn(props: Readonly<Record<string, unknown>>, key: string): boolean {
  return Object.hasOwn(props, key) && props[key] !== undefined;
}

function normalizeSorting(value: unknown): DataGridSorting | null {
  if (typeof value !== "object" || value === null) return null;
  const candidate = value as Partial<DataGridSorting>;
  return typeof candidate.columnId === "string" &&
    candidate.columnId.trim().length > 0 &&
    (candidate.direction === "ascending" || candidate.direction === "descending")
    ? { columnId: candidate.columnId, direction: candidate.direction }
    : null;
}

/** Normalizes external, default, or parsed state into one deterministic complete query. */
export function normalizeDataGridQuery(
  value: Partial<DataGridQuery> = {},
  paginationMode: DataGridPaginationState["mode"] | null = value.pagination?.mode ?? null,
): DataGridQuery {
  const sourcePagination = value.pagination;
  const pageSize = isPositiveInteger(sourcePagination?.pageSize)
    ? sourcePagination.pageSize
    : defaultPageSizes[0];
  let pagination: DataGridPaginationState | null = null;
  if (paginationMode === "page") {
    pagination = {
      mode: "page",
      page:
        sourcePagination?.mode === "page" && isPositiveInteger(sourcePagination.page)
          ? sourcePagination.page
          : 1,
      pageSize,
    };
  } else if (paginationMode === "cursor") {
    pagination = {
      mode: "cursor",
      cursor:
        sourcePagination?.mode === "cursor" &&
        typeof sourcePagination.cursor === "string" &&
        sourcePagination.cursor.length > 0
          ? sourcePagination.cursor
          : null,
      pageSize,
    };
  }
  return {
    filter: typeof value.filter === "string" ? value.filter : "",
    sorting: normalizeSorting(value.sorting),
    pagination,
  };
}

/** Serializes query fields in a fixed order for form values and persistence adapters. */
export function serializeDataGridQuery(query: DataGridQuery): string {
  const normalized = normalizeDataGridQuery(query, query.pagination?.mode ?? null);
  const parameters = new URLSearchParams();
  if (normalized.filter !== "") parameters.set("filter", normalized.filter);
  if (normalized.sorting !== null) {
    parameters.set("sort", normalized.sorting.columnId);
    parameters.set("direction", normalized.sorting.direction);
  }
  if (normalized.pagination !== null) {
    parameters.set("pagination", normalized.pagination.mode);
    if (normalized.pagination.mode === "page") {
      parameters.set("page", String(normalized.pagination.page));
    } else if (normalized.pagination.cursor !== null) {
      parameters.set("cursor", normalized.pagination.cursor);
    }
    parameters.set("pageSize", String(normalized.pagination.pageSize));
  }
  return parameters.toString();
}

/** Parses a serialized query, safely normalizing malformed external values. */
export function parseDataGridQuery(value: string): DataGridQuery {
  const parameters = new URLSearchParams(value.startsWith("?") ? value.slice(1) : value);
  const paginationMode = parameters.get("pagination");
  const sortColumnId = parameters.get("sort");
  const sortDirection = parameters.get("direction");
  const pagination: DataGridPaginationState | null =
    paginationMode === "page"
      ? {
          mode: "page",
          page: Number(parameters.get("page") ?? 1),
          pageSize: Number(parameters.get("pageSize") ?? defaultPageSizes[0]),
        }
      : paginationMode === "cursor"
        ? {
            mode: "cursor",
            cursor: parameters.get("cursor"),
            pageSize: Number(parameters.get("pageSize") ?? defaultPageSizes[0]),
          }
        : null;
  return normalizeDataGridQuery(
    {
      filter: parameters.get("filter") ?? "",
      sorting:
        sortColumnId === null || (sortDirection !== "ascending" && sortDirection !== "descending")
          ? null
          : {
              columnId: sortColumnId,
              direction: sortDirection,
            },
      pagination,
    },
    pagination?.mode ?? null,
  );
}

function formatCellValue(value: unknown): ReactNode {
  if (value === null || value === undefined) return "—";
  if (typeof value === "string" || typeof value === "number") return value;
  if (typeof value === "bigint" || typeof value === "boolean") return String(value);
  if (value instanceof Date) return value.toISOString();
  return "[value]";
}

function formatFilterValue(value: unknown): string {
  if (value === null || value === undefined) return "";
  if (
    typeof value === "string" ||
    typeof value === "number" ||
    typeof value === "bigint" ||
    typeof value === "boolean"
  ) {
    return String(value);
  }
  if (value instanceof Date) return value.toISOString();
  return "";
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

function samePagination(
  left: DataGridPaginationState | null,
  right: DataGridPaginationState | null,
): boolean {
  if (left === right) return true;
  if (left === null || right === null || left.mode !== right.mode) return false;
  if (left.pageSize !== right.pageSize) return false;
  return left.mode === "page" && right.mode === "page"
    ? left.page === right.page
    : left.mode === "cursor" && right.mode === "cursor" && left.cursor === right.cursor;
}

function sameQuery(left: DataGridQuery, right: DataGridQuery): boolean {
  return (
    left.filter === right.filter &&
    sameSorting(left.sorting, right.sorting) &&
    samePagination(left.pagination, right.pagination)
  );
}

function sameColumnVisibility(
  left: DataGridColumnVisibility,
  right: DataGridColumnVisibility,
): boolean {
  const leftEntries = Object.entries(left);
  const rightEntries = Object.entries(right);
  return (
    leftEntries.length === rightEntries.length &&
    leftEntries.every(([columnId, visible]) => right[columnId] === visible)
  );
}

function resolveColumnVisibility<TData extends object>(
  columns: readonly DataGridColumn<TData>[],
  requested: DataGridColumnVisibility | undefined,
): DataGridColumnVisibility {
  return Object.fromEntries(columns.map((column) => [column.id, requested?.[column.id] ?? true]));
}

function sizingColumns<TData extends object>(
  columns: readonly DataGridColumn<TData>[],
): readonly DataGridColumn<TData>[] {
  return columns.filter((column) => column.sizing !== undefined);
}

function resolveColumnWidths<TData extends object>(
  columns: readonly DataGridColumn<TData>[],
  requested: DataGridColumnWidths | undefined,
): DataGridColumnWidths {
  return Object.fromEntries(
    sizingColumns(columns).map((column) => [
      column.id,
      requested?.[column.id] ?? column.sizing!.default,
    ]),
  );
}

function sameColumnWidths(left: DataGridColumnWidths, right: DataGridColumnWidths): boolean {
  const leftEntries = Object.entries(left);
  return (
    leftEntries.length === Object.keys(right).length &&
    leftEntries.every(([columnId, width]) => right[columnId] === width)
  );
}

function resolveExpandedRowIds(
  rowIds: readonly string[],
  requested: DataGridExpandedRowIds | undefined,
): DataGridExpandedRowIds {
  const requestedIds = new Set(requested ?? []);
  return rowIds.filter((rowId) => requestedIds.has(rowId));
}

function sameExpandedRowIds(left: DataGridExpandedRowIds, right: DataGridExpandedRowIds): boolean {
  return left.length === right.length && left.every((rowId, index) => right[index] === rowId);
}

function assertExpandedRowIds(
  rowIds: readonly string[],
  requested: DataGridExpandedRowIds | undefined,
  label: string,
): void {
  if (requested === undefined) return;
  const knownRowIds = new Set(rowIds);
  const uniqueRowIds = new Set<string>();
  for (const rowId of requested) {
    if (typeof rowId !== "string" || rowId.trim().length === 0 || !knownRowIds.has(rowId)) {
      throw new Error(`Mergora DataGrid ${label} contains an unknown non-empty row ID.`);
    }
    if (uniqueRowIds.has(rowId)) {
      throw new Error(`Mergora DataGrid ${label} must not contain duplicate row IDs.`);
    }
    uniqueRowIds.add(rowId);
  }
}

function assertColumnWidths<TData extends object>(
  columns: readonly DataGridColumn<TData>[],
  requested: DataGridColumnWidths | undefined,
  label: string,
): void {
  if (requested === undefined) return;
  const sizingById = new Map(
    sizingColumns(columns).map((column) => [column.id, column.sizing!] as const),
  );
  for (const [columnId, width] of Object.entries(requested)) {
    const sizing = sizingById.get(columnId);
    if (sizing === undefined) {
      throw new Error(
        `Mergora DataGrid ${label} contains non-resizable column ${JSON.stringify(columnId)}.`,
      );
    }
    if (!Number.isFinite(width) || width < sizing.min || width > sizing.max) {
      throw new RangeError(
        `Mergora DataGrid ${label}.${columnId} must be a finite width from ${sizing.min} to ${sizing.max}.`,
      );
    }
    const step = sizing.step ?? 8;
    if (Math.abs((width - sizing.min) / step - Math.round((width - sizing.min) / step)) > 1e-8) {
      throw new RangeError(
        `Mergora DataGrid ${label}.${columnId} must align to its ${step}px step.`,
      );
    }
  }
}

/** Serializes declared column visibility in declaration order for deterministic persistence adapters. */
export function serializeDataGridColumnVisibility<TData extends object>(
  columns: readonly DataGridColumn<TData>[],
  visibility: DataGridColumnVisibility,
): string {
  return JSON.stringify(columns.map((column) => [column.id, visibility[column.id] ?? true]));
}

/** Parses a deterministic column-visibility adapter value without performing any I/O. */
export function parseDataGridColumnVisibility(serialized: string): DataGridColumnVisibility {
  let parsed: unknown;
  try {
    parsed = JSON.parse(serialized);
  } catch {
    throw new Error("Mergora DataGrid columnVisibility.adapter.read() returned invalid JSON.");
  }
  if (!Array.isArray(parsed)) {
    throw new TypeError(
      "Mergora DataGrid columnVisibility.adapter.read() JSON must be an array of [columnId, visible] pairs.",
    );
  }
  const visibility: Record<string, boolean> = {};
  for (const entry of parsed) {
    if (
      !Array.isArray(entry) ||
      entry.length !== 2 ||
      typeof entry[0] !== "string" ||
      typeof entry[1] !== "boolean" ||
      hasDefinedOwn(visibility, entry[0])
    ) {
      throw new TypeError(
        "Mergora DataGrid columnVisibility.adapter.read() JSON must contain unique [columnId, visible] pairs.",
      );
    }
    visibility[entry[0]] = entry[1];
  }
  return visibility;
}

function assertColumnVisibility<TData extends object>(
  columns: readonly DataGridColumn<TData>[],
  requested: DataGridColumnVisibility | undefined,
  label: string,
): void {
  if (requested === undefined) return;
  const knownColumnIds = new Set(columns.map((column) => column.id));
  for (const [columnId, visible] of Object.entries(requested)) {
    if (!knownColumnIds.has(columnId)) {
      throw new Error(
        `Mergora DataGrid ${label} contains unknown column ${JSON.stringify(columnId)}.`,
      );
    }
    if (typeof visible !== "boolean") {
      throw new TypeError(`Mergora DataGrid ${label}.${columnId} must be a boolean.`);
    }
  }
  if (!Object.values(resolveColumnVisibility(columns, requested)).some(Boolean)) {
    throw new Error(`Mergora DataGrid ${label} must keep at least one column visible.`);
  }
}

function resetPagination(
  pagination: DataGridPaginationState | null,
): DataGridPaginationState | null {
  if (pagination?.mode === "page") return { ...pagination, page: 1 };
  if (pagination?.mode === "cursor") return { ...pagination, cursor: null };
  return null;
}

const selectionOnlyKeys = [
  "selectedRowId",
  "defaultSelectedRowId",
  "onSelectedRowIdChange",
  "getRowLabel",
  "renderSelectionSummary",
  "selectionName",
] as const;

const legacySortingKeys = ["sorting", "defaultSorting", "onSortingChange"] as const;

function hasAggregateQueryOwnership(props: Readonly<Record<string, unknown>>): boolean {
  return (
    hasDefinedOwn(props, "query") ||
    hasDefinedOwn(props, "defaultQuery") ||
    hasDefinedOwn(props, "onQueryChange") ||
    (hasDefinedOwn(props, "queryAdapter") && props.queryAdapter !== false) ||
    hasDefinedOwn(props, "queryName") ||
    props.filtering === true ||
    (typeof props.filtering === "object" && props.filtering !== null) ||
    props.pagination === true ||
    (typeof props.pagination === "object" && props.pagination !== null) ||
    props.operationMode === "manual"
  );
}

function assertPartialQuery(value: unknown, label: string, complete = false): void {
  if (!isPlainObject(value)) {
    throw new TypeError(`Mergora DataGrid ${label} must be a plain query object.`);
  }
  const candidate = value as Record<string, unknown>;
  if (complete && (!Object.hasOwn(candidate, "filter") || candidate.filter === undefined)) {
    throw new Error(`Mergora DataGrid ${label} requires filter.`);
  }
  if (candidate.filter !== undefined && typeof candidate.filter !== "string") {
    throw new TypeError(`Mergora DataGrid ${label}.filter must be a string.`);
  }
  if (complete && (!Object.hasOwn(candidate, "sorting") || candidate.sorting === undefined)) {
    throw new Error(`Mergora DataGrid ${label} requires sorting.`);
  }
  if (candidate.sorting !== undefined && candidate.sorting !== null) {
    const sorting = candidate.sorting;
    if (
      !isPlainObject(sorting) ||
      typeof sorting.columnId !== "string" ||
      sorting.columnId.trim().length === 0 ||
      (sorting.direction !== "ascending" && sorting.direction !== "descending")
    ) {
      throw new Error(`Mergora DataGrid ${label}.sorting is invalid.`);
    }
  }
  if (complete && (!Object.hasOwn(candidate, "pagination") || candidate.pagination === undefined)) {
    throw new Error(`Mergora DataGrid ${label} requires pagination.`);
  }
  if (candidate.pagination !== undefined && candidate.pagination !== null) {
    const pagination = candidate.pagination;
    if (
      !isPlainObject(pagination) ||
      (pagination.mode !== "page" && pagination.mode !== "cursor") ||
      !isPositiveInteger(pagination.pageSize)
    ) {
      throw new Error(`Mergora DataGrid ${label}.pagination is invalid.`);
    }
    if (pagination.mode === "page" && !isPositiveInteger(pagination.page)) {
      throw new Error(`Mergora DataGrid ${label}.pagination.page must be a positive integer.`);
    }
    if (
      pagination.mode === "cursor" &&
      pagination.cursor !== null &&
      (typeof pagination.cursor !== "string" || pagination.cursor.length === 0)
    ) {
      throw new Error(
        `Mergora DataGrid ${label}.pagination.cursor must be null or a non-empty string.`,
      );
    }
  }
}

/** @internal Runtime guard for untyped JavaScript and spread-prop call sites. */
export function assertDataGridConfiguration(props: Readonly<Record<string, unknown>>): void {
  if (
    props.columnVisibility !== undefined &&
    props.columnVisibility !== false &&
    !isPlainObject(props.columnVisibility)
  ) {
    throw new TypeError("Mergora DataGrid columnVisibility must be false or an options object.");
  }
  if (isPlainObject(props.columnVisibility)) {
    const columnVisibility = props.columnVisibility;
    if (columnVisibility.visibility !== undefined && !isPlainObject(columnVisibility.visibility)) {
      throw new TypeError("Mergora DataGrid columnVisibility.visibility must be a plain object.");
    }
    if (
      columnVisibility.defaultVisibility !== undefined &&
      !isPlainObject(columnVisibility.defaultVisibility)
    ) {
      throw new TypeError(
        "Mergora DataGrid columnVisibility.defaultVisibility must be a plain object.",
      );
    }
    if (
      hasDefinedOwn(columnVisibility, "visibility") &&
      hasDefinedOwn(columnVisibility, "defaultVisibility")
    ) {
      throw new Error(
        "Mergora DataGrid controlled column visibility cannot be combined with defaultVisibility.",
      );
    }
    if (
      columnVisibility.onVisibilityChange !== undefined &&
      typeof columnVisibility.onVisibilityChange !== "function"
    ) {
      throw new TypeError(
        "Mergora DataGrid columnVisibility.onVisibilityChange must be a function when supplied.",
      );
    }
    if (
      columnVisibility.adapter !== undefined &&
      columnVisibility.adapter !== false &&
      !isPlainObject(columnVisibility.adapter)
    ) {
      throw new TypeError(
        "Mergora DataGrid columnVisibility.adapter must be false or an adapter object.",
      );
    }
    if (isPlainObject(columnVisibility.adapter)) {
      const adapter = columnVisibility.adapter;
      if (typeof adapter.write !== "function") {
        throw new TypeError("Mergora DataGrid columnVisibility.adapter.write must be a function.");
      }
      if (adapter.read !== undefined && typeof adapter.read !== "function") {
        throw new TypeError(
          "Mergora DataGrid columnVisibility.adapter.read must be a function when supplied.",
        );
      }
      if (
        hasDefinedOwn(columnVisibility, "visibility") ||
        hasDefinedOwn(columnVisibility, "defaultVisibility")
      ) {
        throw new Error(
          "Mergora DataGrid columnVisibility.adapter owns uncontrolled restoration and cannot be combined with visibility or defaultVisibility.",
        );
      }
    }
    if (
      columnVisibility.label !== undefined &&
      (typeof columnVisibility.label !== "string" || columnVisibility.label.trim().length === 0)
    ) {
      throw new Error(
        "Mergora DataGrid columnVisibility.label must be a non-empty string when supplied.",
      );
    }
  }
  if (
    props.columnSizing !== undefined &&
    props.columnSizing !== false &&
    !isPlainObject(props.columnSizing)
  ) {
    throw new TypeError("Mergora DataGrid columnSizing must be false or an options object.");
  }
  if (isPlainObject(props.columnSizing)) {
    const columnSizing = props.columnSizing;
    if (columnSizing.widths !== undefined && !isPlainObject(columnSizing.widths)) {
      throw new TypeError("Mergora DataGrid columnSizing.widths must be a plain object.");
    }
    if (columnSizing.defaultWidths !== undefined && !isPlainObject(columnSizing.defaultWidths)) {
      throw new TypeError("Mergora DataGrid columnSizing.defaultWidths must be a plain object.");
    }
    if (hasDefinedOwn(columnSizing, "widths") && hasDefinedOwn(columnSizing, "defaultWidths")) {
      throw new Error(
        "Mergora DataGrid controlled column sizing cannot be combined with defaultWidths.",
      );
    }
    if (
      columnSizing.onWidthsChange !== undefined &&
      typeof columnSizing.onWidthsChange !== "function"
    ) {
      throw new TypeError(
        "Mergora DataGrid columnSizing.onWidthsChange must be a function when supplied.",
      );
    }
  }
  if (
    props.detailRows !== undefined &&
    props.detailRows !== false &&
    !isPlainObject(props.detailRows)
  ) {
    throw new TypeError("Mergora DataGrid detailRows must be false or an options object.");
  }
  if (isPlainObject(props.detailRows)) {
    const detailRows = props.detailRows;
    if (typeof detailRows.renderDetail !== "function") {
      throw new TypeError("Mergora DataGrid detailRows.renderDetail must be a function.");
    }
    if (detailRows.expandedRowIds !== undefined && !Array.isArray(detailRows.expandedRowIds)) {
      throw new TypeError("Mergora DataGrid detailRows.expandedRowIds must be an array.");
    }
    if (
      detailRows.defaultExpandedRowIds !== undefined &&
      !Array.isArray(detailRows.defaultExpandedRowIds)
    ) {
      throw new TypeError("Mergora DataGrid detailRows.defaultExpandedRowIds must be an array.");
    }
    if (
      hasDefinedOwn(detailRows, "expandedRowIds") &&
      hasDefinedOwn(detailRows, "defaultExpandedRowIds")
    ) {
      throw new Error(
        "Mergora DataGrid controlled detail rows cannot be combined with defaultExpandedRowIds.",
      );
    }
    if (
      detailRows.onExpandedRowIdsChange !== undefined &&
      typeof detailRows.onExpandedRowIdsChange !== "function"
    ) {
      throw new TypeError(
        "Mergora DataGrid detailRows.onExpandedRowIdsChange must be a function when supplied.",
      );
    }
    if (
      detailRows.getDetailLabel !== undefined &&
      typeof detailRows.getDetailLabel !== "function"
    ) {
      throw new TypeError(
        "Mergora DataGrid detailRows.getDetailLabel must be a function when supplied.",
      );
    }
  }
  if (
    props.operationMode !== undefined &&
    props.operationMode !== "client" &&
    props.operationMode !== "manual"
  ) {
    throw new RangeError('Mergora DataGrid operationMode must be "client" or "manual".');
  }
  if (
    props.filtering !== undefined &&
    typeof props.filtering !== "boolean" &&
    !isPlainObject(props.filtering)
  ) {
    throw new TypeError("Mergora DataGrid filtering must be a boolean or options object.");
  }
  if (isPlainObject(props.filtering)) {
    const filtering = props.filtering;
    if (filtering.getRowText !== undefined && typeof filtering.getRowText !== "function") {
      throw new TypeError(
        "Mergora DataGrid filtering.getRowText must be a function when supplied.",
      );
    }
  }
  if (
    props.pagination !== undefined &&
    typeof props.pagination !== "boolean" &&
    !isPlainObject(props.pagination)
  ) {
    throw new TypeError("Mergora DataGrid pagination must be a boolean or options object.");
  }
  if (isPlainObject(props.pagination)) {
    const pagination = props.pagination;
    if (
      pagination.mode !== undefined &&
      pagination.mode !== "page" &&
      pagination.mode !== "cursor"
    ) {
      throw new RangeError('Mergora DataGrid pagination.mode must be "page" or "cursor".');
    }
    if (pagination.pageSizes !== undefined && !Array.isArray(pagination.pageSizes)) {
      throw new TypeError("Mergora DataGrid pagination.pageSizes must be an array when supplied.");
    }
  }
  if (
    props.queryAdapter !== undefined &&
    props.queryAdapter !== false &&
    !isPlainObject(props.queryAdapter)
  ) {
    throw new TypeError("Mergora DataGrid queryAdapter must be false or an adapter object.");
  }
  if (isPlainObject(props.queryAdapter)) {
    const adapter = props.queryAdapter;
    if (typeof adapter.write !== "function") {
      throw new TypeError("Mergora DataGrid queryAdapter.write must be a function.");
    }
    if (adapter.read !== undefined && typeof adapter.read !== "function") {
      throw new TypeError("Mergora DataGrid queryAdapter.read must be a function when supplied.");
    }
  }
  if (props.messages !== undefined && !isPlainObject(props.messages)) {
    throw new TypeError("Mergora DataGrid messages must be an object when supplied.");
  }
  if (isPlainObject(props.messages)) {
    const messages = props.messages;
    for (const key of [
      "filterLabel",
      "selectionColumnLabel",
      "previousPageLabel",
      "nextPageLabel",
      "previousResultsLabel",
      "nextResultsLabel",
      "rowsPerPageLabel",
      "cursorStatus",
      "loadingLabel",
      "errorLabel",
      "retryLabel",
    ]) {
      if (
        messages[key] !== undefined &&
        (typeof messages[key] !== "string" || messages[key].trim().length === 0)
      ) {
        throw new Error(`Mergora DataGrid messages.${key} must be a non-empty string.`);
      }
    }
    if (
      messages.filterPlaceholder !== undefined &&
      typeof messages.filterPlaceholder !== "string"
    ) {
      throw new TypeError("Mergora DataGrid messages.filterPlaceholder must be a string.");
    }
    for (const key of ["selectRowLabel", "paginationLabel", "pageStatus", "querySummary"]) {
      if (messages[key] !== undefined && typeof messages[key] !== "function") {
        throw new TypeError(`Mergora DataGrid messages.${key} must be a function.`);
      }
    }
  }
  if (
    props.operationStatus !== undefined &&
    props.operationStatus !== false &&
    !isPlainObject(props.operationStatus)
  ) {
    throw new TypeError("Mergora DataGrid operationStatus must be false or a status object.");
  }
  if (isPlainObject(props.operationStatus)) {
    const status = props.operationStatus;
    if (status.state !== "idle" && status.state !== "loading" && status.state !== "error") {
      throw new RangeError(
        'Mergora DataGrid operationStatus.state must be "idle", "loading", or "error".',
      );
    }
    if (status.onRetry !== undefined && status.state !== "error") {
      throw new Error("Mergora DataGrid operationStatus.onRetry requires the error state.");
    }
    if (status.onRetry !== undefined && typeof status.onRetry !== "function") {
      throw new TypeError("Mergora DataGrid operationStatus.onRetry must be a function.");
    }
  }
  if (
    props.renderQuerySummary !== undefined &&
    props.renderQuerySummary !== false &&
    typeof props.renderQuerySummary !== "function"
  ) {
    throw new TypeError("Mergora DataGrid renderQuerySummary must be false or a function.");
  }
  const selectionMode = props.selectionMode ?? "none";
  if (selectionMode !== "none" && selectionMode !== "single") {
    throw new RangeError('Mergora DataGrid selectionMode must be "none" or "single".');
  }
  if (selectionMode === "none") {
    const conflictingKey = selectionOnlyKeys.find((key) => hasDefinedOwn(props, key));
    if (conflictingKey !== undefined) {
      throw new Error(
        `Mergora DataGrid ${conflictingKey} requires selectionMode="single"; selectionMode="none" owns no selection state, callbacks, or accessibility output.`,
      );
    }
  } else if (
    hasDefinedOwn(props, "selectedRowId") &&
    hasDefinedOwn(props, "defaultSelectedRowId")
  ) {
    throw new Error(
      "Mergora DataGrid controlled selection cannot be combined with defaultSelectedRowId.",
    );
  }
  if (hasDefinedOwn(props, "sorting") && hasDefinedOwn(props, "defaultSorting")) {
    throw new Error("Mergora DataGrid controlled sorting cannot be combined with defaultSorting.");
  }
  if (hasDefinedOwn(props, "query") && hasDefinedOwn(props, "defaultQuery")) {
    throw new Error("Mergora DataGrid controlled query cannot be combined with defaultQuery.");
  }
  if (hasAggregateQueryOwnership(props)) {
    const legacyKey = legacySortingKeys.find((key) => hasDefinedOwn(props, key));
    if (legacyKey !== undefined) {
      throw new Error(
        `Mergora DataGrid aggregate query ownership cannot be combined with legacy ${legacyKey}.`,
      );
    }
  }
  if (props.query !== undefined) assertPartialQuery(props.query, "query", true);
  if (props.defaultQuery !== undefined) assertPartialQuery(props.defaultQuery, "defaultQuery");
  if (props.queryName !== undefined) {
    if (typeof props.queryName !== "string" || props.queryName.trim().length === 0) {
      throw new Error("Mergora DataGrid queryName must be a non-empty string when supplied.");
    }
  }
  if (props.selectionName !== undefined) {
    if (typeof props.selectionName !== "string" || props.selectionName.trim().length === 0) {
      throw new Error("Mergora DataGrid selectionName must be a non-empty string when supplied.");
    }
  }
}

function resolvePaginationOptions(
  pagination: DataGridProps<object>["pagination"],
): DataGridPaginationOptions | null {
  if (pagination === undefined || pagination === false) return null;
  return pagination === true ? { mode: "page" } : pagination;
}

function assertSortingColumn<TData extends object>(
  columns: readonly DataGridColumn<TData>[],
  sorting: DataGridSorting | null | undefined,
): void {
  if (sorting === undefined || sorting === null) return;
  const sortableColumn = columns.find(
    (column) => column.id === sorting.columnId && column.sortable === true,
  );
  if (sortableColumn === undefined) {
    throw new Error(
      `Mergora DataGrid sorting column ${JSON.stringify(sorting.columnId)} must identify a sortable column.`,
    );
  }
}

function validateIdentityAndOperations<TData extends object>(
  props: DataGridProps<TData>,
  pagination: DataGridPaginationOptions | null,
): readonly string[] {
  if (props.caption.trim().length === 0) {
    throw new Error("Mergora DataGrid caption must be a non-empty string.");
  }
  if (props.regionLabel !== undefined && props.regionLabel.trim().length === 0) {
    throw new Error("Mergora DataGrid regionLabel must be non-empty when supplied.");
  }
  const columnIds = new Set<string>();
  for (const column of props.columns) {
    if (column.id.trim().length === 0) {
      throw new Error("Mergora DataGrid column ids must be non-empty strings.");
    }
    if (columnIds.has(column.id)) {
      throw new Error(`Mergora DataGrid column ids must be unique. Duplicate: ${column.id}.`);
    }
    columnIds.add(column.id);
    if (
      column.visibilityLabel !== undefined &&
      (typeof column.visibilityLabel !== "string" || column.visibilityLabel.trim().length === 0)
    ) {
      throw new Error(
        `Mergora DataGrid column ${JSON.stringify(column.id)} visibilityLabel must be a non-empty string when supplied.`,
      );
    }
    if (column.sizing !== undefined) {
      const { default: defaultWidth, label, max, min, step = 8 } = column.sizing;
      if (
        !Number.isFinite(min) ||
        !Number.isFinite(max) ||
        !Number.isFinite(defaultWidth) ||
        !Number.isFinite(step) ||
        min <= 0 ||
        max < min ||
        defaultWidth < min ||
        defaultWidth > max ||
        step <= 0
      ) {
        throw new RangeError(
          `Mergora DataGrid column ${JSON.stringify(column.id)} sizing requires positive finite min, max, default, and step values with default in range.`,
        );
      }
      if (Math.abs((defaultWidth - min) / step - Math.round((defaultWidth - min) / step)) > 1e-8) {
        throw new RangeError(
          `Mergora DataGrid column ${JSON.stringify(column.id)} sizing.default must align to its ${step}px step.`,
        );
      }
      if (label !== undefined && (typeof label !== "string" || label.trim().length === 0)) {
        throw new Error(
          `Mergora DataGrid column ${JSON.stringify(column.id)} sizing.label must be non-empty when supplied.`,
        );
      }
    }
  }
  if (props.columnVisibility !== undefined && props.columnVisibility !== false) {
    assertColumnVisibility(
      props.columns,
      props.columnVisibility.visibility,
      "columnVisibility.visibility",
    );
    assertColumnVisibility(
      props.columns,
      props.columnVisibility.defaultVisibility,
      "columnVisibility.defaultVisibility",
    );
  }
  if (props.columnSizing !== undefined && props.columnSizing !== false) {
    if (sizingColumns(props.columns).length === 0) {
      throw new Error("Mergora DataGrid columnSizing requires at least one column with sizing.");
    }
    assertColumnWidths(props.columns, props.columnSizing.widths, "columnSizing.widths");
    assertColumnWidths(
      props.columns,
      props.columnSizing.defaultWidths,
      "columnSizing.defaultWidths",
    );
  }
  const rowIds = props.rows.map((row) => props.getRowId(row));
  const uniqueRowIds = new Set<string>();
  for (const rowId of rowIds) {
    if (typeof rowId !== "string" || rowId.trim().length === 0) {
      throw new Error("Mergora DataGrid row ids must be non-empty strings.");
    }
    if (uniqueRowIds.has(rowId)) {
      throw new Error(`Mergora DataGrid row ids must be unique. Duplicate: ${rowId}.`);
    }
    uniqueRowIds.add(rowId);
  }
  if (props.detailRows !== undefined && props.detailRows !== false) {
    assertExpandedRowIds(rowIds, props.detailRows.expandedRowIds, "detailRows.expandedRowIds");
    assertExpandedRowIds(
      rowIds,
      props.detailRows.defaultExpandedRowIds,
      "detailRows.defaultExpandedRowIds",
    );
  }
  assertSortingColumn(
    props.columns,
    props.query?.sorting ?? props.defaultQuery?.sorting ?? props.sorting ?? props.defaultSorting,
  );
  const operationMode = props.operationMode ?? "client";
  if (pagination?.mode === "cursor" && operationMode !== "manual") {
    throw new Error('Mergora DataGrid cursor pagination requires operationMode="manual".');
  }
  if (pagination?.totalRows !== undefined) {
    if (!Number.isInteger(pagination.totalRows) || pagination.totalRows < 0) {
      throw new Error("Mergora DataGrid pagination totalRows must be a non-negative integer.");
    }
    if (operationMode !== "manual") {
      throw new Error("Mergora DataGrid pagination totalRows is owned by manual operation mode.");
    }
  }
  if (
    operationMode === "manual" &&
    pagination?.mode === "page" &&
    pagination.totalRows === undefined
  ) {
    throw new Error("Mergora DataGrid manual page pagination requires pagination.totalRows.");
  }
  if (pagination?.pageSizes !== undefined) {
    const uniquePageSizes = new Set<number>();
    for (const size of pagination.pageSizes) {
      if (!isPositiveInteger(size)) {
        throw new Error("Mergora DataGrid pagination pageSizes must be positive integers.");
      }
      if (uniquePageSizes.has(size)) {
        throw new Error("Mergora DataGrid pagination pageSizes must be unique.");
      }
      uniquePageSizes.add(size);
    }
    if (pagination.pageSizes.length === 0) {
      throw new Error("Mergora DataGrid pagination pageSizes cannot be empty.");
    }
  }
  if (pagination?.mode === "cursor") {
    for (const [name, cursor] of [
      ["previousCursor", pagination.previousCursor],
      ["nextCursor", pagination.nextCursor],
    ] as const) {
      if (
        cursor !== undefined &&
        cursor !== null &&
        (typeof cursor !== "string" || cursor.length === 0)
      ) {
        throw new Error(
          `Mergora DataGrid pagination.${name} must be a non-empty string when supplied.`,
        );
      }
    }
  }
  return rowIds;
}

function restoreFocus(element: HTMLElement, fallback: HTMLDivElement | null): void {
  queueMicrotask(() => {
    const document = element.ownerDocument;
    const activeElement = document.activeElement;
    if (
      activeElement !== element &&
      activeElement !== document.body &&
      activeElement !== document.documentElement
    ) {
      return;
    }
    if (element.isConnected && !element.matches(":disabled")) {
      element.focus({ preventScroll: true });
      if (document.activeElement === element) return;
    }
    if (fallback?.isConnected) fallback.focus({ preventScroll: true });
  });
}

function DataGridInner<TData extends object>(
  props: DataGridProps<TData>,
  ref: React.ForwardedRef<HTMLDivElement>,
): ReactElement {
  assertDataGridConfiguration(props as unknown as Readonly<Record<string, unknown>>);
  const paginationOptions = resolvePaginationOptions(
    props.pagination as DataGridProps<object>["pagination"],
  );
  const rowIds = validateIdentityAndOperations(props, paginationOptions);
  const {
    rows,
    columns,
    getRowId: _getRowId,
    caption,
    regionLabel,
    columnVisibility = false,
    columnSizing = false,
    detailRows = false,
    selectionMode = "none",
    selectedRowId,
    defaultSelectedRowId = null,
    onSelectedRowIdChange,
    getRowLabel,
    renderSelectionSummary,
    selectionName,
    sorting,
    defaultSorting = null,
    onSortingChange,
    query: controlledQuery,
    defaultQuery,
    onQueryChange,
    filtering = false,
    pagination: _pagination,
    operationMode = "client",
    queryAdapter = false,
    operationStatus = false,
    renderQuerySummary,
    queryName,
    messages,
    emptyContent = "No rows",
    className,
    ...regionProps
  } = props;
  const generatedRadioName = useId();
  const regionRef = useRef<HTMLDivElement | null>(null);
  const filteringOptions = typeof filtering === "object" ? filtering : undefined;
  const filteringEnabled = filtering === true || filteringOptions !== undefined;
  const aggregateQueryOwnership = hasAggregateQueryOwnership(
    props as unknown as Readonly<Record<string, unknown>>,
  );
  const resolvedMessages = resolveMessages(messages);
  const paginationMode = paginationOptions?.mode ?? (paginationOptions === null ? null : "page");
  const initialQueryRef = useRef<DataGridQuery | null>(null);
  if (initialQueryRef.current === null) {
    initialQueryRef.current = normalizeDataGridQuery(defaultQuery, paginationMode);
  }
  const adapterReadRef = useRef(false);
  const columnVisibilityOptions = columnVisibility === false ? null : columnVisibility;
  const columnSizingOptions = columnSizing === false ? null : columnSizing;
  const detailRowsOptions = detailRows === false ? null : detailRows;
  const columnVisibilityAdapterReadRef = useRef(false);
  const initialColumnVisibilityRef = useRef<DataGridColumnVisibility | null>(null);
  if (initialColumnVisibilityRef.current === null) {
    initialColumnVisibilityRef.current = resolveColumnVisibility(
      columns,
      columnVisibilityOptions?.defaultVisibility,
    );
  }
  const initialColumnWidthsRef = useRef<DataGridColumnWidths | null>(null);
  if (initialColumnWidthsRef.current === null) {
    initialColumnWidthsRef.current =
      columnSizingOptions === null
        ? {}
        : resolveColumnWidths(columns, columnSizingOptions.defaultWidths);
  }
  const initialExpandedRowIdsRef = useRef<DataGridExpandedRowIds | null>(null);
  if (initialExpandedRowIdsRef.current === null) {
    initialExpandedRowIdsRef.current =
      detailRowsOptions === null
        ? []
        : resolveExpandedRowIds(rowIds, detailRowsOptions.defaultExpandedRowIds);
  }
  const [uncontrolledSelection, setUncontrolledSelection] = useState<string | null>(
    selectionMode === "single" ? defaultSelectedRowId : null,
  );
  const [uncontrolledSorting, setUncontrolledSorting] = useState<DataGridSorting | null>(
    defaultSorting,
  );
  const [uncontrolledQuery, setUncontrolledQuery] = useState<DataGridQuery>(
    initialQueryRef.current,
  );
  const [uncontrolledColumnVisibility, setUncontrolledColumnVisibility] =
    useState<DataGridColumnVisibility>(initialColumnVisibilityRef.current);
  const [uncontrolledColumnWidths, setUncontrolledColumnWidths] = useState<DataGridColumnWidths>(
    initialColumnWidthsRef.current,
  );
  const [uncontrolledExpandedRowIds, setUncontrolledExpandedRowIds] =
    useState<DataGridExpandedRowIds>(initialExpandedRowIdsRef.current);

  useEffect(() => {
    if (
      adapterReadRef.current ||
      !aggregateQueryOwnership ||
      defaultQuery !== undefined ||
      controlledQuery !== undefined ||
      queryAdapter === false ||
      queryAdapter.read === undefined
    ) {
      return;
    }
    adapterReadRef.current = true;
    const adapterInitialValue = queryAdapter.read();
    if (isPlainObject(adapterInitialValue)) {
      assertPartialQuery(adapterInitialValue, "queryAdapter.read() result");
    } else if (
      adapterInitialValue !== undefined &&
      adapterInitialValue !== null &&
      typeof adapterInitialValue !== "string"
    ) {
      throw new TypeError(
        "Mergora DataGrid queryAdapter.read() must return a plain query object, string, null, or undefined.",
      );
    }
    const restoredQuery = normalizeDataGridQuery(
      typeof adapterInitialValue === "string"
        ? parseDataGridQuery(adapterInitialValue)
        : (adapterInitialValue ?? undefined),
      paginationMode,
    );
    assertSortingColumn(columns, restoredQuery.sorting);
    initialQueryRef.current = restoredQuery;
    setUncontrolledQuery((current) =>
      sameQuery(current, restoredQuery) ? current : restoredQuery,
    );
  }, [
    aggregateQueryOwnership,
    columns,
    controlledQuery,
    defaultQuery,
    paginationMode,
    queryAdapter,
  ]);

  useEffect(() => {
    const adapter = columnVisibilityOptions?.adapter;
    if (
      columnVisibilityAdapterReadRef.current ||
      adapter === undefined ||
      adapter === false ||
      adapter.read === undefined
    ) {
      return;
    }
    columnVisibilityAdapterReadRef.current = true;
    const adapterInitialValue = adapter.read();
    if (isPlainObject(adapterInitialValue)) {
      assertColumnVisibility(
        columns,
        adapterInitialValue,
        "columnVisibility.adapter.read() result",
      );
    } else if (
      adapterInitialValue !== undefined &&
      adapterInitialValue !== null &&
      typeof adapterInitialValue !== "string"
    ) {
      throw new TypeError(
        "Mergora DataGrid columnVisibility.adapter.read() must return a plain visibility object, string, null, or undefined.",
      );
    }
    const restoredVisibility = resolveColumnVisibility(
      columns,
      typeof adapterInitialValue === "string"
        ? parseDataGridColumnVisibility(adapterInitialValue)
        : (adapterInitialValue ?? undefined),
    );
    assertColumnVisibility(columns, restoredVisibility, "columnVisibility.adapter.read() result");
    initialColumnVisibilityRef.current = restoredVisibility;
    setUncontrolledColumnVisibility((current) =>
      sameColumnVisibility(current, restoredVisibility) ? current : restoredVisibility,
    );
  }, [columnVisibilityOptions?.adapter, columns]);

  const currentSelection = selectedRowId === undefined ? uncontrolledSelection : selectedRowId;
  const currentColumnVisibility = resolveColumnVisibility(
    columns,
    columnVisibilityOptions?.visibility ?? uncontrolledColumnVisibility,
  );
  const currentColumnWidths =
    columnSizingOptions === null
      ? {}
      : resolveColumnWidths(columns, columnSizingOptions.widths ?? uncontrolledColumnWidths);
  const currentExpandedRowIds =
    detailRowsOptions === null
      ? []
      : resolveExpandedRowIds(
          rowIds,
          detailRowsOptions.expandedRowIds ?? uncontrolledExpandedRowIds,
        );
  const sourceQuery = controlledQuery ?? uncontrolledQuery;
  if (
    paginationMode !== null &&
    sourceQuery.pagination !== null &&
    sourceQuery.pagination.mode !== paginationMode
  ) {
    throw new Error(
      `Mergora DataGrid query pagination mode ${JSON.stringify(sourceQuery.pagination.mode)} does not match pagination mode ${JSON.stringify(paginationMode)}.`,
    );
  }
  const normalizedAggregateQuery = normalizeDataGridQuery(sourceQuery, paginationMode);
  assertSortingColumn(columns, normalizedAggregateQuery.sorting);
  const currentLegacySorting = sorting === undefined ? uncontrolledSorting : sorting;
  const currentQuery: DataGridQuery = aggregateQueryOwnership
    ? {
        filter: filteringEnabled ? normalizedAggregateQuery.filter : "",
        sorting: normalizedAggregateQuery.sorting,
        pagination: paginationOptions === null ? null : normalizedAggregateQuery.pagination,
      }
    : { filter: "", sorting: currentLegacySorting, pagination: null };
  const isLoading = operationStatus !== false && operationStatus.state === "loading";
  const radioName = selectionName ?? `mrg-data-grid-${generatedRadioName}`;
  const rowIdByRow = useMemo(
    () => new Map(rows.map((row, index) => [row, rowIds[index]!] as const)),
    [rowIds, rows],
  );
  const filteredRows = useMemo(() => {
    if (operationMode === "manual" || !filteringEnabled || currentQuery.filter.trim() === "") {
      return [...rows];
    }
    const term = currentQuery.filter.toLowerCase();
    return rows.filter((row) => {
      const searchableText =
        filteringOptions?.getRowText?.(row) ??
        columns.map((column) => formatFilterValue(column.accessor(row))).join(" ");
      return searchableText.toLowerCase().includes(term);
    });
  }, [columns, currentQuery.filter, filteringEnabled, filteringOptions, operationMode, rows]);
  const tanStackSorting = useMemo(
    () => toTanStackSorting(currentQuery.sorting),
    [currentQuery.sorting?.columnId, currentQuery.sorting?.direction],
  );
  const tableState = useMemo(
    () => ({ columnVisibility: currentColumnVisibility, sorting: tanStackSorting }),
    [currentColumnVisibility, tanStackSorting],
  );

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
        meta: {
          alignment: column.alignment ?? "start",
          width:
            columnSizingOptions !== null && column.sizing !== undefined
              ? `${currentColumnWidths[column.id]}px`
              : column.width,
          sizing: column.sizing,
        },
      })),
    [columnSizingOptions, columns, currentColumnWidths],
  );

  const commitQuery = (nextValue: DataGridQuery, reason: DataGridOperationReason): void => {
    const next = normalizeDataGridQuery(nextValue, paginationMode);
    if (sameQuery(currentQuery, next)) return;
    if (controlledQuery === undefined) setUncontrolledQuery(next);
    const detail = { reason, serialized: serializeDataGridQuery(next) } as const;
    onQueryChange?.(next, detail);
    if (queryAdapter !== false) queryAdapter.write(next, detail);
  };

  const table = useReactTable({
    data: filteredRows,
    columns: columnDefinitions,
    getRowId: (row) => rowIdByRow.get(row)!,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    manualSorting: operationMode === "manual",
    state: tableState,
    onSortingChange: (updater) => {
      const next = fromTanStackSorting(resolveUpdater(updater, tanStackSorting));
      if (sameSorting(currentQuery.sorting, next)) return;
      if (aggregateQueryOwnership) {
        commitQuery(
          { ...currentQuery, sorting: next, pagination: resetPagination(currentQuery.pagination) },
          "sort",
        );
      } else {
        if (sorting === undefined) setUncontrolledSorting(next);
        onSortingChange?.(next, { reason: "header" });
      }
    },
    onColumnVisibilityChange: (updater) => {
      if (columnVisibilityOptions === null) return;
      const next = resolveColumnVisibility(
        columns,
        resolveUpdater(updater, currentColumnVisibility),
      );
      if (sameColumnVisibility(currentColumnVisibility, next)) return;
      if (columnVisibilityOptions.visibility === undefined) {
        setUncontrolledColumnVisibility(next);
      }
      const changedColumn = columns.find(
        (column) => currentColumnVisibility[column.id] !== next[column.id],
      );
      if (changedColumn !== undefined) {
        const detail = {
          columnId: changedColumn.id,
          reason: "native-checkbox",
          serialized: serializeDataGridColumnVisibility(columns, next),
          visible: next[changedColumn.id]!,
        } as const;
        columnVisibilityOptions.onVisibilityChange?.(next, detail);
        if (
          columnVisibilityOptions.adapter !== undefined &&
          columnVisibilityOptions.adapter !== false
        ) {
          columnVisibilityOptions.adapter.write(next, detail);
        }
      }
    },
  });

  const sortedRows = table.getRowModel().rows;
  const requestedPagination = currentQuery.pagination;
  const totalRowCount =
    operationMode === "client"
      ? sortedRows.length
      : paginationOptions?.totalRows === undefined
        ? null
        : paginationOptions.totalRows;
  const pageCount =
    requestedPagination?.mode === "page"
      ? Math.max(1, Math.ceil((totalRowCount ?? 0) / requestedPagination.pageSize))
      : null;
  const effectivePagination: DataGridPaginationState | null =
    operationMode === "client" && requestedPagination?.mode === "page" && pageCount !== null
      ? { ...requestedPagination, page: Math.min(requestedPagination.page, pageCount) }
      : requestedPagination;
  const effectiveQuery =
    effectivePagination === currentQuery.pagination
      ? currentQuery
      : { ...currentQuery, pagination: effectivePagination };
  const visibleRows =
    operationMode === "client" && effectivePagination?.mode === "page"
      ? sortedRows.slice(
          (effectivePagination.page - 1) * effectivePagination.pageSize,
          effectivePagination.page * effectivePagination.pageSize,
        )
      : sortedRows;
  const visibleColumns = table.getVisibleLeafColumns();
  const columnCount =
    visibleColumns.length +
    (selectionMode === "single" ? 1 : 0) +
    (detailRowsOptions === null ? 0 : 1);
  const selectedSourceRow =
    currentSelection === null
      ? null
      : (rows.find((row) => rowIdByRow.get(row) === currentSelection) ?? null);
  const hasVisibleSelection =
    selectedSourceRow !== null && visibleRows.some((row) => row.id === currentSelection);
  const selectionSummary =
    selectionMode === "single" && renderSelectionSummary !== undefined
      ? renderSelectionSummary(selectedSourceRow)
      : undefined;
  const hasSelectionSummary = hasAccessibleContent(selectionSummary);
  const querySummaryContext: DataGridQuerySummaryContext = {
    query: effectiveQuery,
    visibleRowCount: visibleRows.length,
    totalRowCount,
    pageCount,
  };
  const querySummaryEnabled =
    aggregateQueryOwnership &&
    (filteringEnabled || paginationOptions !== null) &&
    renderQuerySummary !== false;
  const querySummary = querySummaryEnabled
    ? typeof renderQuerySummary === "function"
      ? renderQuerySummary(querySummaryContext)
      : resolvedMessages.querySummary(querySummaryContext)
    : undefined;
  const hasQuerySummary = hasAccessibleContent(querySummary);
  const operationMessage =
    operationStatus !== false && operationStatus.state !== "idle"
      ? hasAccessibleContent(operationStatus.message)
        ? operationStatus.message
        : operationStatus.state === "loading"
          ? resolvedMessages.loadingLabel
          : resolvedMessages.errorLabel
      : undefined;
  const pageSizes = useMemo(() => {
    const configured = paginationOptions?.pageSizes ?? defaultPageSizes;
    const currentSize = effectivePagination?.pageSize;
    return [...new Set(currentSize === undefined ? configured : [...configured, currentSize])].sort(
      (left, right) => left - right,
    );
  }, [effectivePagination?.pageSize, paginationOptions?.pageSizes]);
  const cursorPaginationOptions = paginationOptions?.mode === "cursor" ? paginationOptions : null;

  useEffect(() => {
    const node = regionRef.current;
    const form = node?.closest("form");
    if (form === null || form === undefined) return;
    const handleReset = (event: Event): void => {
      setTimeout(() => {
        if (event.defaultPrevented || node?.isConnected !== true) return;
        if (selectedRowId === undefined && selectionMode === "single") {
          setUncontrolledSelection(defaultSelectedRowId);
        }
        if (aggregateQueryOwnership && controlledQuery === undefined) {
          setUncontrolledQuery(initialQueryRef.current!);
        }
        if (!aggregateQueryOwnership && sorting === undefined) {
          setUncontrolledSorting(defaultSorting);
        }
        if (columnVisibilityOptions !== null && columnVisibilityOptions.visibility === undefined) {
          setUncontrolledColumnVisibility(initialColumnVisibilityRef.current!);
        }
        if (columnSizingOptions !== null && columnSizingOptions.widths === undefined) {
          setUncontrolledColumnWidths(initialColumnWidthsRef.current!);
        }
        if (detailRowsOptions !== null && detailRowsOptions.expandedRowIds === undefined) {
          setUncontrolledExpandedRowIds(initialExpandedRowIdsRef.current!);
        }
      }, 0);
    };
    form.addEventListener("reset", handleReset);
    return () => form.removeEventListener("reset", handleReset);
  }, [
    aggregateQueryOwnership,
    controlledQuery,
    defaultSelectedRowId,
    defaultSorting,
    columnVisibilityOptions?.visibility,
    columnSizingOptions?.widths,
    detailRowsOptions?.expandedRowIds,
    selectedRowId,
    selectionMode,
    sorting,
  ]);

  const setRegionRef = (node: HTMLDivElement | null): void => {
    regionRef.current = node;
    if (typeof ref === "function") ref(node);
    else if (ref !== null) ref.current = node;
  };

  const setColumnVisible = (columnId: string, visible: boolean): void => {
    table.setColumnVisibility({ ...currentColumnVisibility, [columnId]: visible });
  };

  const setColumnWidth = (columnId: string, width: number): void => {
    if (columnSizingOptions === null) return;
    const next = { ...currentColumnWidths, [columnId]: width };
    assertColumnWidths(columns, next, "columnSizing requested widths");
    if (sameColumnWidths(currentColumnWidths, next)) return;
    if (columnSizingOptions.widths === undefined) setUncontrolledColumnWidths(next);
    columnSizingOptions.onWidthsChange?.(next, {
      columnId,
      reason: "native-range",
      width,
    });
  };

  const setRowExpanded = (rowId: string, expanded: boolean): void => {
    if (detailRowsOptions === null) return;
    const next = resolveExpandedRowIds(
      rowIds,
      expanded
        ? [...currentExpandedRowIds, rowId]
        : currentExpandedRowIds.filter((expandedRowId) => expandedRowId !== rowId),
    );
    if (sameExpandedRowIds(currentExpandedRowIds, next)) return;
    if (detailRowsOptions.expandedRowIds === undefined) setUncontrolledExpandedRowIds(next);
    detailRowsOptions.onExpandedRowIdsChange?.(next, {
      expanded,
      reason: "native-button",
      rowId,
    });
  };

  return (
    <div
      {...regionProps}
      ref={setRegionRef}
      role="region"
      aria-busy={isLoading || undefined}
      aria-label={regionLabel ?? `${caption}: scrollable table`}
      tabIndex={0}
      data-operation={operationStatus === false ? undefined : operationStatus.state}
      data-slot="data-grid-region"
      data-maturity="experimental"
      className={classes("mrg-data-grid", className)}
    >
      {filteringEnabled ? (
        <label className="mrg-data-grid__filter" data-slot="data-grid-filter">
          <span>{resolvedMessages.filterLabel}</span>
          <input
            data-slot="data-grid-filter-input"
            disabled={isLoading}
            placeholder={resolvedMessages.filterPlaceholder || undefined}
            type="search"
            value={effectiveQuery.filter}
            onChange={(event) =>
              commitQuery(
                {
                  ...effectiveQuery,
                  filter: event.currentTarget.value,
                  pagination: resetPagination(effectiveQuery.pagination),
                },
                "filter",
              )
            }
          />
        </label>
      ) : null}
      {columnVisibilityOptions !== null ? (
        <details
          className="mrg-data-grid__column-visibility"
          data-slot="data-grid-column-visibility"
        >
          <summary data-slot="data-grid-column-visibility-trigger">
            {columnVisibilityOptions.label ?? "Columns"}
          </summary>
          <div data-slot="data-grid-column-visibility-options">
            {columns.map((column) => {
              const visible = currentColumnVisibility[column.id] ?? true;
              const preventLastVisibleColumn = visible && visibleColumns.length <= 1;
              return (
                <label key={column.id} className="mrg-data-grid__column-visibility-option">
                  <input
                    checked={visible}
                    disabled={isLoading || preventLastVisibleColumn}
                    type="checkbox"
                    onChange={(event) => setColumnVisible(column.id, event.currentTarget.checked)}
                  />
                  <span>{column.visibilityLabel ?? column.id}</span>
                </label>
              );
            })}
          </div>
        </details>
      ) : null}
      <table data-slot="data-grid-table" className="mrg-data-grid__table">
        <caption>{caption}</caption>
        <colgroup>
          {detailRowsOptions !== null ? <col /> : null}
          {selectionMode === "single" ? <col /> : null}
          {visibleColumns.map((column) => {
            const meta = column.columnDef.meta as { width?: string } | undefined;
            return (
              <col
                key={column.id}
                style={meta?.width === undefined ? undefined : { inlineSize: meta.width }}
              />
            );
          })}
        </colgroup>
        <thead data-slot="data-grid-header">
          {table.getHeaderGroups().map((headerGroup) => (
            <tr key={headerGroup.id} data-slot="data-grid-header-row">
              {detailRowsOptions !== null ? (
                <th scope="col" data-slot="data-grid-detail-heading">
                  <span className="mrg-data-grid__visually-hidden">Details</span>
                </th>
              ) : null}
              {selectionMode === "single" ? (
                <th scope="col" className="mrg-data-grid__selection-heading">
                  <span className="mrg-data-grid__visually-hidden">
                    {resolvedMessages.selectionColumnLabel}
                  </span>
                </th>
              ) : null}
              {headerGroup.headers.map((header) => {
                const sorted = header.column.getIsSorted();
                const meta = header.column.columnDef.meta as
                  | {
                      alignment?: DataGridColumnAlignment;
                      sizing?: DataGridColumnSizeOptions;
                      width?: string;
                    }
                  | undefined;
                const sizingControlEnabled =
                  columnSizingOptions !== null && meta?.sizing !== undefined;
                const sizing = meta?.sizing;
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
                        data-slot="data-grid-sort"
                        disabled={isLoading}
                        onClick={(event) => {
                          header.column.getToggleSortingHandler()?.(event);
                          restoreFocus(event.currentTarget, regionRef.current);
                        }}
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
                    {sizingControlEnabled && sizing !== undefined ? (
                      <label
                        data-slot="data-grid-column-sizing-control"
                        data-column-id={header.column.id}
                      >
                        <span className="mrg-data-grid__visually-hidden">
                          {`Adjust ${sizing.label ?? header.column.id} width`}
                        </span>
                        <input
                          aria-label={`Adjust ${sizing.label ?? header.column.id} width`}
                          data-slot="data-grid-column-sizing-input"
                          disabled={isLoading}
                          max={sizing.max}
                          min={sizing.min}
                          step={sizing.step ?? 8}
                          style={{
                            minBlockSize: "var(--mrg-semantic-size-target-preferred)",
                            minInlineSize: "var(--mrg-semantic-size-target-preferred)",
                          }}
                          type="range"
                          value={currentColumnWidths[header.column.id]}
                          onChange={(event) =>
                            setColumnWidth(header.column.id, Number(event.currentTarget.value))
                          }
                        />
                      </label>
                    ) : null}
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
            visibleRows.map((row, visibleIndex) => {
              const rowId = row.id;
              const selected = currentSelection === rowId;
              const expanded = currentExpandedRowIds.includes(rowId);
              const detailId = `mrg-data-grid-detail-${generatedRadioName}-${rowId}`;
              const detailLabel =
                detailRowsOptions?.getDetailLabel?.(row.original, expanded) ??
                `${expanded ? "Hide" : "Show"} details for ${rowId}`;
              return (
                <Fragment key={rowId}>
                  <tr
                    data-slot="data-grid-row"
                    data-expanded={expanded || undefined}
                    data-selected={selected || undefined}
                  >
                    {detailRowsOptions !== null ? (
                      <td data-slot="data-grid-detail-action-cell">
                        <button
                          aria-controls={detailId}
                          aria-expanded={expanded}
                          data-slot="data-grid-detail-trigger"
                          disabled={isLoading}
                          style={{
                            minBlockSize: "var(--mrg-semantic-size-target-preferred)",
                            minInlineSize: "var(--mrg-semantic-size-target-preferred)",
                          }}
                          type="button"
                          onClick={() => setRowExpanded(rowId, !expanded)}
                        >
                          {detailLabel}
                        </button>
                      </td>
                    ) : null}
                    {selectionMode === "single" ? (
                      <td
                        data-slot="data-grid-selection-cell"
                        className="mrg-data-grid__selection-cell"
                      >
                        <label className="mrg-data-grid__selection-control">
                          <input
                            type="radio"
                            name={radioName}
                            value={rowId}
                            checked={selected}
                            aria-label={
                              getRowLabel?.(row.original) ??
                              resolvedMessages.selectRowLabel(visibleIndex + 1)
                            }
                            onChange={() => {
                              if (selectedRowId === undefined) setUncontrolledSelection(rowId);
                              onSelectedRowIdChange?.(rowId, { reason: "radio" });
                            }}
                          />
                        </label>
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
                  {detailRowsOptions !== null && expanded ? (
                    <tr data-slot="data-grid-detail-row">
                      <td colSpan={columnCount} data-slot="data-grid-detail-content" id={detailId}>
                        {detailRowsOptions.renderDetail(row.original)}
                      </td>
                    </tr>
                  ) : null}
                </Fragment>
              );
            })
          )}
        </tbody>
      </table>
      {paginationOptions !== null && effectivePagination !== null ? (
        <nav
          aria-label={resolvedMessages.paginationLabel(caption)}
          className="mrg-data-grid__pagination"
          data-slot="data-grid-pagination"
          data-mode={effectivePagination.mode}
        >
          {effectivePagination.mode === "page" ? (
            <>
              <button
                type="button"
                disabled={effectivePagination.page <= 1 || isLoading}
                onClick={(event) => {
                  commitQuery(
                    {
                      ...effectiveQuery,
                      pagination: { ...effectivePagination, page: effectivePagination.page - 1 },
                    },
                    "page",
                  );
                  restoreFocus(event.currentTarget, regionRef.current);
                }}
              >
                {resolvedMessages.previousPageLabel}
              </button>
              <span data-slot="data-grid-page-status">
                {resolvedMessages.pageStatus(effectivePagination.page, pageCount ?? 1)}
              </span>
              <button
                type="button"
                disabled={effectivePagination.page >= (pageCount ?? 1) || isLoading}
                onClick={(event) => {
                  commitQuery(
                    {
                      ...effectiveQuery,
                      pagination: { ...effectivePagination, page: effectivePagination.page + 1 },
                    },
                    "page",
                  );
                  restoreFocus(event.currentTarget, regionRef.current);
                }}
              >
                {resolvedMessages.nextPageLabel}
              </button>
            </>
          ) : (
            <>
              <button
                type="button"
                disabled={cursorPaginationOptions?.previousCursor == null || isLoading}
                onClick={(event) => {
                  if (cursorPaginationOptions?.previousCursor == null) return;
                  commitQuery(
                    {
                      ...effectiveQuery,
                      pagination: {
                        ...effectivePagination,
                        cursor: cursorPaginationOptions.previousCursor,
                      },
                    },
                    "cursor",
                  );
                  restoreFocus(event.currentTarget, regionRef.current);
                }}
              >
                {resolvedMessages.previousResultsLabel}
              </button>
              <span data-slot="data-grid-cursor-status">{resolvedMessages.cursorStatus}</span>
              <button
                type="button"
                disabled={cursorPaginationOptions?.nextCursor == null || isLoading}
                onClick={(event) => {
                  if (cursorPaginationOptions?.nextCursor == null) return;
                  commitQuery(
                    {
                      ...effectiveQuery,
                      pagination: {
                        ...effectivePagination,
                        cursor: cursorPaginationOptions.nextCursor,
                      },
                    },
                    "cursor",
                  );
                  restoreFocus(event.currentTarget, regionRef.current);
                }}
              >
                {resolvedMessages.nextResultsLabel}
              </button>
            </>
          )}
          <label className="mrg-data-grid__page-size">
            <span>{resolvedMessages.rowsPerPageLabel}</span>
            <select
              disabled={isLoading}
              value={effectivePagination.pageSize}
              onChange={(event) => {
                const pageSize = Number(event.currentTarget.value);
                commitQuery(
                  {
                    ...effectiveQuery,
                    pagination:
                      effectivePagination.mode === "page"
                        ? { mode: "page", page: 1, pageSize }
                        : { mode: "cursor", cursor: null, pageSize },
                  },
                  "page-size",
                );
              }}
            >
              {pageSizes.map((pageSize) => (
                <option key={pageSize} value={pageSize}>
                  {pageSize}
                </option>
              ))}
            </select>
          </label>
        </nav>
      ) : null}
      {operationStatus !== false && operationStatus.state !== "idle" ? (
        <div
          className="mrg-data-grid__operation-status"
          data-slot="data-grid-operation-status"
          data-state={operationStatus.state}
          role={operationStatus.state === "error" ? "alert" : "status"}
        >
          <span>{operationMessage}</span>
          {operationStatus.state === "error" && operationStatus.onRetry !== undefined ? (
            <button
              type="button"
              onClick={() => {
                operationStatus.onRetry?.();
                queueMicrotask(() => regionRef.current?.focus({ preventScroll: true }));
              }}
            >
              {resolvedMessages.retryLabel}
            </button>
          ) : null}
        </div>
      ) : null}
      {hasSelectionSummary ? (
        <output
          aria-live="polite"
          className="mrg-data-grid__selection-summary"
          data-slot="data-grid-selection-summary"
        >
          {selectionSummary}
        </output>
      ) : null}
      {hasQuerySummary ? (
        <output
          aria-live="polite"
          className="mrg-data-grid__query-summary"
          data-slot="data-grid-query-summary"
        >
          {querySummary}
        </output>
      ) : null}
      {selectionMode === "single" && selectedSourceRow !== null && !hasVisibleSelection ? (
        <input
          data-slot="data-grid-selection-input"
          name={radioName}
          type="hidden"
          value={rowIdByRow.get(selectedSourceRow)!}
        />
      ) : null}
      {queryName === undefined ? null : (
        <input
          data-slot="data-grid-query-input"
          name={queryName}
          type="hidden"
          value={serializeDataGridQuery(effectiveQuery)}
        />
      )}
    </div>
  );
}

export interface DataGridComponent {
  <TData extends object>(
    props: DataGridProps<TData> & RefAttributes<HTMLDivElement>,
  ): ReactElement | null;
}

export const DataGrid = forwardRef(DataGridInner) as DataGridComponent;
