# Data Grid Experimental

Status: implemented D1-A source; Experimental, unreleased, and not yet the complete Risk Class 3
system.

Data Grid keeps a native semantic table and Mergora-owned row/column types while adapting TanStack
Table internally. The lightweight mode provides stable identity, sortable headers, optional native
single-row selection, an empty state, and a labelled focusable overflow region. It has no filter,
pagination, query persistence, live query summary, operation rail, or hidden form output unless a
consumer enables those capabilities.

## Basic mode

```tsx
<DataGrid
  caption="Library records"
  rows={records}
  getRowId={(record) => record.id}
  columns={columns}
/>
```

`caption`, column IDs, and row IDs must be non-empty. IDs must be unique in the current source
collection. A supplied sort must identify a column explicitly marked `sortable`. These guards fail
before row or query callbacks are consumed.

## Optional column visibility

Native column-visibility controls are off by default. Enable them only when readers benefit from
tailoring a dense semantic table; the enhancement uses a native disclosure and labelled checkboxes,
so it does not turn the default table into an ARIA grid:

```tsx
<DataGrid
  {...props}
  columnVisibility={{
    defaultVisibility: { internalNotes: false },
    label: "Visible fields",
  }}
/>
```

`visibility` controls the map, `defaultVisibility` initializes uncontrolled state, and
`onVisibilityChange` receives the complete next map plus the changed column. Omitted declared
columns remain visible. A map cannot mention unknown columns or hide every data column; the final
visible checkbox is disabled instead. Toggling a field removes its scoped header and each matching
cell together, while the caption, native table semantics, sorting, selection, query state, and form
behavior remain intact. Native form reset restores uncontrolled defaults without callbacks.

For a persisted uncontrolled preference, use the narrow adapter instead of coupling the grid to
storage or routing. It reads once after hydration, accepts the canonical `serializeDataGridColumnVisibility`
format or a plain visibility map, and writes only committed native checkbox changes. It cannot be
combined with a controlled map or `defaultVisibility`, and reset restores the adapter-derived initial
value without a write:

```tsx
<DataGrid
  {...props}
  columnVisibility={{
    label: "Visible fields",
    adapter: {
      read: () => window.sessionStorage.getItem("grid-columns"),
      write: (_visibility, detail) =>
        window.sessionStorage.setItem("grid-columns", detail.serialized),
    },
  }}
/>
```

Pass `adapter: false` (or omit `adapter`) to remove all preference reads and writes while retaining
the independently optional native disclosure. Consumers own persistence, transport, authorization,
and any storage error handling.

Set `columnVisibility={false}` or omit it to remove the disclosure, checkboxes, visibility state,
callbacks, and all related accessibility output. Give a column a localized `visibilityLabel` when
its stable ID is not suitable for checkbox text.

## Mergora query operations

Filtering, numbered pagination, deterministic persistence, a canonical hidden form value, and the
query summary are independently selectable:

```tsx
<DataGrid
  caption="Library records"
  rows={records}
  columns={columns}
  getRowId={(record) => record.id}
  filtering={{ getRowText: (record) => `${record.title} ${record.state}` }}
  pagination={{ mode: "page", pageSizes: [10, 25, 50] }}
  defaultQuery={{
    pagination: { mode: "page", page: 1, pageSize: 10 },
  }}
  queryName="libraryQuery"
  queryAdapter={{
    read: () => (typeof window === "undefined" ? null : window.location.search),
    write: (_query, detail) => history.replaceState(null, "", `?${detail.serialized}`),
  }}
/>
```

Processing order in `operationMode="client"` is filter, then sort, then page. In
`operationMode="manual"`, rows are rendered in the exact order and quantity supplied; query
controls only report requested operations. Cursor pagination is intentionally manual-only because
opaque cursors have no safe client interpretation. Manual numbered pagination requires
`pagination.totalRows` so page boundaries and disabled actions remain truthful.

`normalizeDataGridQuery`, `parseDataGridQuery`, and `serializeDataGridQuery` expose the canonical
query boundary without leaking TanStack state. Aggregate query ownership (`query`, `defaultQuery`,
`onQueryChange`, enabled filtering/pagination, a query adapter/name, or manual mode) cannot be mixed
with the legacy `sorting`, `defaultSorting`, or `onSortingChange` ownership path.

`DataGridSelectionProps` and `DataGridSortingProps` are public helper unions for consumers that
compose strict controlled/uncontrolled prop fragments. Runtime guards enforce the same ownership
rules for JavaScript and spread-prop call sites using the broader `DataGridProps` surface.

Client filtering uses locale-independent Unicode casing so the same rows are rendered during server
rendering and browser hydration. Supply already localized searchable text through `getRowText`; do
not rely on the server and browser having the same host locale. Manual numbered queries are never
silently clamped: the supplied page remains the page reported to callbacks, summaries, and form
serialization even while `totalRows` changes.

Set `filtering={false}`, `pagination={false}`, `queryAdapter={false}`, `operationStatus={false}`, or
`renderQuerySummary={false}` to remove that enhancement's UI, behavior, events, and accessibility
output. `queryName` is the only query form field; it contains the deterministic complete query.
`selectionName` supplies a stable native radio-group name and selected row value. Native form reset
restores uncontrolled query, legacy sorting, and selection defaults without firing change callbacks
or persistence writes. When filtering or pagination temporarily hides a selected source row's
radio, a hidden successful control preserves the same selected value in `FormData`; a stale ID that
does not identify any source row is not submitted. A canceled native reset leaves component state
unchanged. Controlled state remains consumer-owned.

Adapter restoration runs once after hydration, never during server rendering. This keeps server and
initial browser markup identical and remains safe under React Strict Mode. A restored adapter value
becomes the uncontrolled reset baseline; adapter writes still occur only for committed user query
operations. Treat `read` and `write` as client-side persistence boundaries rather than server data
loaders.

## Loading and recovery

```tsx
<DataGrid
  {...props}
  operationMode="manual"
  operationStatus={{
    state: "error",
    message: "Records could not be refreshed.",
    onRetry: retry,
  }}
/>
```

Loading marks the labelled region busy and disables query-operation controls while retaining the
last rows. Error renders an alert and adds a retry button only when `onRetry` exists. Retry returns
focus to the grid region so a disappearing recovery action does not strand keyboard focus. All
default labels can be replaced through `messages` without changing behavior. Empty custom loading
or error content falls back to the corresponding localized default, so status and alert regions
never become silent.

`renderSelectionSummary` remains the optional Mergora selection status rail. `renderQuerySummary`
customizes the query rail; `false` removes it, while omission uses the localized built-in summary
when filtering or pagination is enabled. Empty custom content removes the live region rather than
leaving an unnamed announcement target.

## Safe CSV serialization

`createDataGridCsv` serializes the exact row model a consumer supplies, so the same utility can
export all rows, filtered rows, the current visible window, or a selected subset without giving the
component ownership of downloads, storage, or network behavior:

```tsx
const csv = createDataGridCsv({
  rows: visibleRecords,
  columns: [
    { id: "title", header: "Record", accessor: (record) => record.title },
    { id: "state", header: "State", accessor: (record) => record.state },
  ],
});
```

Column and row order are preserved. Strings, finite numbers, booleans, dates, null, and undefined
have deterministic locale-neutral output; dates use ISO 8601 and records use CRLF by default.
Commas, quotes, CR, and LF are escaped according to CSV rules. Text and headings that could be
interpreted as spreadsheet formulas are prefixed with an apostrophe by default, including values
with leading whitespace or format controls. Set `formulaProtection: false` only for a completely
trusted data set whose receiving application requires the original text byte-for-byte.

The serializer has no browser side effects. Consumers decide whether and how to expose an export
action, create a file, start a download, or send the output elsewhere. Omitting that composition
means there is no export UI, behavior, event, or accessibility output.

The component remains Experimental. Interactive ARIA grid mode, editing, virtualization, column
resize/reorder/pinning/grouping, range and bulk selection, saved views, permissions, a narrow-screen
item alternative, and complete Risk Class 3 manual evidence remain later promotion work. No
package, catalog, or Passport surface should represent D1-A as Stable.
