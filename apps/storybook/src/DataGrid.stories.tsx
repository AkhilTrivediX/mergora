import type { Meta, StoryObj } from "@storybook/react-vite";
import { StrictMode, useMemo, useState, type FormEvent, type ReactElement } from "react";

import {
  createDataGridCsv,
  DataGrid,
  type DataGridColumn,
  type DataGridColumnVisibility,
  type DataGridCsvColumn,
  type DataGridOperationStatus,
  type DataGridProps,
  type DataGridQuery,
} from "../../../registry/source/systems/data-grid/index.ts";
import "../../../registry/source/systems/data-grid/data-grid.css";
import "mergora-tokens/tokens.css";

interface LibraryRecord {
  readonly id: string;
  readonly title: string;
  readonly state: "Draft" | "Ready" | "Review";
  readonly owner: string;
}

const columns: readonly DataGridColumn<LibraryRecord>[] = [
  {
    id: "title",
    header: "Record",
    accessor: (row) => row.title,
    sortable: true,
    sizing: { default: 256, label: "Record", max: 416, min: 160, step: 16 },
    visibilityLabel: "Record",
  },
  {
    id: "state",
    header: "State",
    accessor: (row) => row.state,
    sortable: true,
    sizing: { default: 144, label: "State", max: 240, min: 112, step: 16 },
    visibilityLabel: "State",
  },
  {
    id: "owner",
    header: "Owner",
    accessor: (row) => row.owner,
    sortable: true,
    sizing: { default: 176, label: "Owner", max: 320, min: 128, step: 16 },
    visibilityLabel: "Owner",
  },
];

const csvColumns: readonly DataGridCsvColumn<LibraryRecord>[] = [
  { id: "title", header: "Record", accessor: (row) => row.title },
  { id: "state", header: "State", accessor: (row) => row.state },
  { id: "owner", header: "Owner", accessor: (row) => row.owner },
];

const rows: readonly LibraryRecord[] = [
  { id: "artifact-1", title: "Design tokens", state: "Ready", owner: "Asha" },
  { id: "artifact-2", title: "Icon exports", state: "Review", owner: "Mina" },
  { id: "artifact-3", title: "Usage notes", state: "Draft", owner: "Jon" },
  { id: "artifact-4", title: "Motion timings", state: "Ready", owner: "Leila" },
  { id: "artifact-5", title: "Keyboard map", state: "Review", owner: "Omar" },
  { id: "artifact-6", title: "Registry schema", state: "Ready", owner: "Noor" },
];

interface LibraryGridStoryArgs {
  readonly caption: string;
  readonly columnSizingEnabled: boolean;
  readonly detailRowsEnabled: boolean;
  readonly columnVisibilityEnabled: boolean;
  readonly columnVisibilityPersistenceEnabled: boolean;
  readonly csvExportEnabled: boolean;
  readonly rows: readonly LibraryRecord[];
  readonly selectionMode: "none" | "single";
  readonly showSelectionSummary: boolean;
  readonly filteringEnabled: boolean;
  readonly formSerializationEnabled: boolean;
  readonly operationMode: "client" | "manual";
  readonly operationStatusState: "off" | "idle" | "loading" | "error";
  readonly paginationEnabled: boolean;
  readonly queryAdapterEnabled: boolean;
  readonly showQuerySummary: boolean;
}

function rowSearchText(row: LibraryRecord): string {
  return `${row.title} ${row.state} ${row.owner}`;
}

function renderRecordDetail(row: LibraryRecord): ReactElement {
  return (
    <div>
      <strong>{row.title}</strong>
      <p>{`${row.state} record · maintained by ${row.owner}.`}</p>
    </div>
  );
}

function selectionProps(
  selectionMode: LibraryGridStoryArgs["selectionMode"],
  showSelectionSummary: boolean,
): Partial<DataGridProps<LibraryRecord>> {
  if (selectionMode === "none") return { selectionMode: "none" };
  return {
    defaultSelectedRowId: "artifact-2",
    getRowLabel: (row) => `Select ${row.title}`,
    ...(showSelectionSummary
      ? {
          renderSelectionSummary: (selectedRow: LibraryRecord | null) =>
            selectedRow === null
              ? "No record selected"
              : `Selected ${selectedRow.title} · ${selectedRow.state}`,
        }
      : {}),
    selectionMode: "single",
  };
}

function LibraryGrid({
  caption,
  columnSizingEnabled,
  detailRowsEnabled,
  columnVisibilityEnabled,
  columnVisibilityPersistenceEnabled,
  csvExportEnabled,
  rows: storyRows,
  selectionMode,
  showSelectionSummary,
  filteringEnabled,
  formSerializationEnabled,
  operationMode,
  operationStatusState,
  paginationEnabled,
  queryAdapterEnabled,
  showQuerySummary,
}: LibraryGridStoryArgs): ReactElement {
  const [adapterWrites, setAdapterWrites] = useState(0);
  const [csvPreview, setCsvPreview] = useState("CSV not prepared");
  const [formData, setFormData] = useState("Not inspected");
  const [retryRequests, setRetryRequests] = useState(0);
  const columnVisibilityAdapter = useMemo(
    () =>
      columnVisibilityPersistenceEnabled
        ? {
            read: () => '[["title",true],["state",true],["owner",false]]',
            write: () => undefined,
          }
        : false,
    [columnVisibilityPersistenceEnabled],
  );
  const operationStatus: false | DataGridOperationStatus =
    operationStatusState === "off"
      ? false
      : operationStatusState === "error"
        ? {
            onRetry: () => setRetryRequests((current) => current + 1),
            state: "error",
          }
        : { state: operationStatusState };
  const grid = (
    <DataGrid<LibraryRecord>
      caption={caption}
      columnSizing={columnSizingEnabled ? { defaultWidths: { owner: 160 } } : false}
      detailRows={
        detailRowsEnabled
          ? {
              defaultExpandedRowIds: ["artifact-2"],
              getDetailLabel: (row, expanded) =>
                `${expanded ? "Hide" : "Show"} details for ${row.title}`,
              renderDetail: renderRecordDetail,
            }
          : false
      }
      columnVisibility={
        columnVisibilityEnabled
          ? columnVisibilityPersistenceEnabled
            ? { adapter: columnVisibilityAdapter, label: "Visible fields" }
            : { defaultVisibility: { owner: false }, label: "Visible fields" }
          : false
      }
      columns={columns}
      filtering={filteringEnabled ? { getRowText: rowSearchText } : false}
      getRowId={(row) => row.id}
      operationMode={operationMode}
      operationStatus={operationStatus}
      pagination={
        paginationEnabled
          ? {
              mode: "page",
              pageSizes: [2, 3, 6],
              ...(operationMode === "manual" ? { totalRows: storyRows.length } : {}),
            }
          : false
      }
      queryAdapter={
        queryAdapterEnabled ? { write: () => setAdapterWrites((current) => current + 1) } : false
      }
      rows={storyRows}
      {...(formSerializationEnabled ? { queryName: "libraryQueryControl" } : {})}
      {...(showQuerySummary ? {} : { renderQuerySummary: false as const })}
      {...(paginationEnabled
        ? {
            defaultQuery: {
              pagination: { mode: "page" as const, page: 1, pageSize: 2 },
            },
          }
        : {})}
      {...selectionProps(selectionMode, showSelectionSummary)}
      {...(formSerializationEnabled && selectionMode === "single"
        ? { selectionName: "libraryRecordControl" }
        : {})}
    />
  );
  return (
    <div style={{ display: "grid", gap: "0.75rem" }}>
      {formSerializationEnabled ? (
        <form
          onSubmit={(event) => {
            event.preventDefault();
            setFormData(JSON.stringify([...new FormData(event.currentTarget).entries()]));
          }}
          style={{ display: "grid", gap: "0.75rem" }}
        >
          {grid}
          <button type="submit">Inspect controlled FormData</button>
          <output aria-live="polite" data-story-controlled-form-data="">
            {formData}
          </output>
        </form>
      ) : (
        grid
      )}
      {csvExportEnabled ? (
        <div style={{ display: "grid", gap: "0.5rem" }}>
          <button
            type="button"
            onClick={() =>
              setCsvPreview(createDataGridCsv({ columns: csvColumns, rows: storyRows }))
            }
          >
            Prepare safe CSV
          </button>
          <output
            aria-live="polite"
            data-story-csv-preview=""
            style={{ overflowWrap: "anywhere", whiteSpace: "pre-wrap" }}
          >
            {csvPreview}
          </output>
        </div>
      ) : null}
      {queryAdapterEnabled ? (
        <output aria-live="polite" data-story-adapter-writes="">
          {adapterWrites} persisted {adapterWrites === 1 ? "change" : "changes"}
        </output>
      ) : null}
      {operationStatusState === "error" ? (
        <output aria-live="polite" data-story-operation-retries="">
          {retryRequests} retry {retryRequests === 1 ? "request" : "requests"}
        </output>
      ) : null}
    </div>
  );
}

function ControlledSelectionExample(): ReactElement {
  const [selectedRowId, setSelectedRowId] = useState<string | null>("artifact-1");
  return (
    <DataGrid<LibraryRecord>
      caption="Controlled library records"
      columns={columns}
      getRowId={(row) => row.id}
      getRowLabel={(row) => `Select ${row.title}`}
      onSelectedRowIdChange={setSelectedRowId}
      renderSelectionSummary={(selectedRow) =>
        selectedRow === null ? "No record selected" : `Controlled selection · ${selectedRow.title}`
      }
      rows={rows}
      selectedRowId={selectedRowId}
      selectionMode="single"
    />
  );
}

function ControlledColumnVisibilityExample(): ReactElement {
  const [visibility, setVisibility] = useState<DataGridColumnVisibility>({ owner: false });
  const [lastChange, setLastChange] = useState("initial");
  return (
    <div style={{ display: "grid", gap: "0.75rem" }}>
      <DataGrid<LibraryRecord>
        caption="Controlled library records"
        columnVisibility={{
          label: "Visible fields",
          onVisibilityChange: (next, detail) => {
            setVisibility(next);
            setLastChange(`${detail.columnId}:${detail.visible ? "visible" : "hidden"}`);
          },
          visibility,
        }}
        columns={columns}
        getRowId={(row) => row.id}
        rows={rows}
      />
      <output aria-live="polite" data-story-controlled-column-visibility="">
        {lastChange}
      </output>
    </div>
  );
}

function ControlledColumnSizingExample(): ReactElement {
  const [widths, setWidths] = useState<Record<string, number>>({
    owner: 192,
    state: 144,
    title: 256,
  });
  const [lastChange, setLastChange] = useState("initial");
  return (
    <div style={{ display: "grid", gap: "0.75rem" }}>
      <DataGrid<LibraryRecord>
        caption="Controlled library record widths"
        columnSizing={{
          onWidthsChange: (next, detail) => {
            setWidths(next);
            setLastChange(`${detail.columnId}:${detail.width}px`);
          },
          widths,
        }}
        columns={columns}
        getRowId={(row) => row.id}
        rows={rows}
      />
      <output aria-live="polite" data-story-controlled-column-sizing="">
        {lastChange}
      </output>
    </div>
  );
}

function ControlledDetailRowsExample(): ReactElement {
  const [expandedRowIds, setExpandedRowIds] = useState<readonly string[]>(["artifact-2"]);
  const [lastChange, setLastChange] = useState("initial");
  return (
    <div style={{ display: "grid", gap: "0.75rem" }}>
      <DataGrid<LibraryRecord>
        caption="Controlled library record details"
        columns={columns}
        detailRows={{
          expandedRowIds,
          getDetailLabel: (row, expanded) =>
            `${expanded ? "Hide" : "Show"} details for ${row.title}`,
          onExpandedRowIdsChange: (next, detail) => {
            setExpandedRowIds(next);
            setLastChange(`${detail.rowId}:${detail.expanded ? "expanded" : "collapsed"}`);
          },
          renderDetail: renderRecordDetail,
        }}
        getRowId={(row) => row.id}
        rows={rows}
      />
      <output aria-live="polite" data-story-controlled-detail-rows="">
        {lastChange}
      </output>
    </div>
  );
}

function ColumnVisibilityAdapterHydrationExample(): ReactElement {
  const [reads, setReads] = useState(0);
  const [write, setWrite] = useState("no persisted changes");
  const adapter = useMemo(
    () => ({
      read: () => {
        setReads((current) => current + 1);
        return '[["title",true],["state",true],["owner",false]]';
      },
      write: (_visibility: DataGridColumnVisibility, detail: { readonly serialized: string }) => {
        setWrite(detail.serialized);
      },
    }),
    [],
  );
  return (
    <div style={{ display: "grid", gap: "0.75rem" }}>
      <StrictMode>
        <DataGrid<LibraryRecord>
          caption="Persisted visible library fields"
          columnVisibility={{ adapter, label: "Visible fields" }}
          columns={columns}
          getRowId={(row) => row.id}
          rows={rows}
        />
      </StrictMode>
      <output aria-live="polite" data-story-column-visibility-adapter="">
        {reads} hydration {reads === 1 ? "read" : "reads"} · {write}
      </output>
    </div>
  );
}

const initialControlledQuery: DataGridQuery = {
  filter: "",
  pagination: { mode: "page", page: 1, pageSize: 2 },
  sorting: null,
};

function ControlledQueryExample(): ReactElement {
  const [query, setQuery] = useState<DataGridQuery>(initialControlledQuery);
  const [reason, setReason] = useState("initial");
  const sort =
    query.sorting === null ? "none" : `${query.sorting.columnId}:${query.sorting.direction}`;
  return (
    <div style={{ display: "grid", gap: "0.75rem" }}>
      <DataGrid<LibraryRecord>
        caption="Controlled library records"
        columns={columns}
        filtering={{ getRowText: rowSearchText }}
        getRowId={(row) => row.id}
        onQueryChange={(next, detail) => {
          setQuery(next);
          setReason(detail.reason);
        }}
        pagination={{ pageSizes: [2, 3, 6] }}
        query={query}
        rows={rows}
      />
      <output aria-live="polite" data-story-controlled-query="">
        filter={query.filter || "none"} · sort={sort} · reason={reason}
      </output>
    </div>
  );
}

function manualPageRows(page: number): readonly LibraryRecord[] {
  return [
    {
      id: `remote-${page}-1`,
      title: `Remote record ${page}1`,
      state: "Ready",
      owner: "Remote source",
    },
    {
      id: `remote-${page}-2`,
      title: `Remote record ${page}2`,
      state: "Review",
      owner: "Remote source",
    },
  ];
}

function ManualPageExample(): ReactElement {
  const [query, setQuery] = useState<DataGridQuery>({
    filter: "",
    pagination: { mode: "page", page: 2, pageSize: 1 },
    sorting: null,
  });
  const page = query.pagination?.mode === "page" ? query.pagination.page : 1;
  return (
    <div style={{ display: "grid", gap: "0.75rem" }}>
      <DataGrid<LibraryRecord>
        caption="Library records"
        columns={columns}
        getRowId={(row) => row.id}
        onQueryChange={setQuery}
        operationMode="manual"
        pagination={{ mode: "page", pageSizes: [1], totalRows: 6 }}
        query={query}
        rows={manualPageRows(page)}
      />
      <output aria-live="polite" data-story-manual-request="">
        Requested page {page}
      </output>
    </div>
  );
}

function ManualCursorExample(): ReactElement {
  const [query, setQuery] = useState<DataGridQuery>({
    filter: "",
    pagination: { cursor: "opaque-alpha", mode: "cursor", pageSize: 2 },
    sorting: null,
  });
  const cursor = query.pagination?.mode === "cursor" ? query.pagination.cursor : null;
  const alpha = cursor !== "opaque-beta";
  const cursorRows = useMemo<readonly LibraryRecord[]>(
    () =>
      alpha
        ? [
            { id: "cursor-a-1", title: "Cursor record A1", state: "Ready", owner: "Source A" },
            { id: "cursor-a-2", title: "Cursor record A2", state: "Review", owner: "Source A" },
          ]
        : [
            { id: "cursor-b-1", title: "Cursor record B1", state: "Ready", owner: "Source B" },
            { id: "cursor-b-2", title: "Cursor record B2", state: "Draft", owner: "Source B" },
          ],
    [alpha],
  );
  return (
    <div style={{ display: "grid", gap: "0.75rem" }}>
      <DataGrid<LibraryRecord>
        caption="Library records"
        columns={columns}
        getRowId={(row) => row.id}
        messages={{ cursorStatus: alpha ? "Batch alpha" : "Batch beta" }}
        onQueryChange={setQuery}
        operationMode="manual"
        pagination={{
          mode: "cursor",
          nextCursor: alpha ? "opaque-beta" : null,
          pageSizes: [2],
          previousCursor: alpha ? null : "opaque-alpha",
          totalRows: 4,
        }}
        query={query}
        rows={cursorRows}
      />
      <output aria-live="polite" data-story-manual-request="">
        Requested cursor {alpha ? "alpha" : "beta"}
      </output>
    </div>
  );
}

function LoadingAndErrorExample(): ReactElement {
  const [status, setStatus] = useState<DataGridOperationStatus>({
    message: "Refreshing records",
    state: "loading",
  });
  const retry = (): void => {
    setStatus({ message: "Refreshing records", state: "loading" });
    window.setTimeout(() => setStatus({ state: "idle" }), 150);
  };
  return (
    <div style={{ display: "grid", gap: "0.75rem" }}>
      <button
        type="button"
        onClick={() =>
          setStatus({
            message: "Records could not be refreshed",
            onRetry: retry,
            state: "error",
          })
        }
      >
        Show recoverable error
      </button>
      <DataGrid<LibraryRecord>
        caption="Library records"
        columns={columns}
        filtering={{ getRowText: rowSearchText }}
        getRowId={(row) => row.id}
        operationStatus={status}
        pagination={{ pageSizes: [2, 3, 6] }}
        defaultQuery={{ pagination: { mode: "page", page: 1, pageSize: 2 } }}
        rows={rows}
      />
    </div>
  );
}

function AdapterHydrationExample(): ReactElement {
  const [reads, setReads] = useState(0);
  const adapter = useMemo(
    () => ({
      read: () => {
        setReads((current) => current + 1);
        return "filter=Review";
      },
      write: () => undefined,
    }),
    [],
  );
  return (
    <div style={{ display: "grid", gap: "0.75rem" }}>
      <StrictMode>
        <DataGrid<LibraryRecord>
          caption="Hydrated library records"
          columns={columns}
          filtering={{ getRowText: rowSearchText }}
          getRowId={(row) => row.id}
          queryAdapter={adapter}
          rows={rows}
        />
      </StrictMode>
      <output aria-live="polite" data-story-adapter-reads="">
        {reads} hydration {reads === 1 ? "read" : "reads"}
      </output>
    </div>
  );
}

function FormSerializationExample(): ReactElement {
  const [submission, setSubmission] = useState("Not inspected");
  const [queryChanges, setQueryChanges] = useState(0);
  const [selectionChanges, setSelectionChanges] = useState(0);
  const [adapterWrites, setAdapterWrites] = useState(0);
  const inspect = (event: FormEvent<HTMLFormElement>): void => {
    event.preventDefault();
    setSubmission(JSON.stringify([...new FormData(event.currentTarget).entries()]));
  };
  return (
    <form onSubmit={inspect} style={{ display: "grid", gap: "0.75rem" }}>
      <DataGrid<LibraryRecord>
        caption="Library records"
        columnSizing={{ defaultWidths: { title: 256 } }}
        columns={columns}
        detailRows={{
          defaultExpandedRowIds: ["artifact-1"],
          getDetailLabel: (row, expanded) =>
            `${expanded ? "Hide" : "Show"} details for ${row.title}`,
          renderDetail: renderRecordDetail,
        }}
        columnVisibility={{ defaultVisibility: { owner: false }, label: "Visible fields" }}
        defaultSelectedRowId="artifact-1"
        filtering={{ getRowText: rowSearchText }}
        getRowId={(row) => row.id}
        getRowLabel={(row) => `Select ${row.title}`}
        onQueryChange={() => setQueryChanges((current) => current + 1)}
        onSelectedRowIdChange={() => setSelectionChanges((current) => current + 1)}
        queryAdapter={{ write: () => setAdapterWrites((current) => current + 1) }}
        queryName="libraryQuery"
        rows={rows}
        selectionMode="single"
        selectionName="libraryRecord"
      />
      <div style={{ display: "flex", flexWrap: "wrap", gap: "0.5rem" }}>
        <button type="submit">Inspect FormData</button>
        <button type="reset">Reset records form</button>
      </div>
      <output aria-live="polite" data-story-form-data="">
        {submission}
      </output>
      <output aria-live="polite" data-story-form-events="">
        {queryChanges} query changes · {selectionChanges} selection changes · {adapterWrites}{" "}
        adapter writes
      </output>
    </form>
  );
}

const meta = {
  argTypes: {
    caption: { control: "text" },
    columnSizingEnabled: { control: "boolean" },
    detailRowsEnabled: { control: "boolean" },
    columnVisibilityEnabled: { control: "boolean" },
    columnVisibilityPersistenceEnabled: { control: "boolean" },
    csvExportEnabled: { control: "boolean" },
    filteringEnabled: { control: "boolean" },
    formSerializationEnabled: { control: "boolean" },
    operationMode: { control: "inline-radio", options: ["client", "manual"] },
    operationStatusState: {
      control: "inline-radio",
      options: ["off", "idle", "loading", "error"],
    },
    paginationEnabled: { control: "boolean" },
    queryAdapterEnabled: { control: "boolean" },
    rows: { control: false },
    selectionMode: { control: "inline-radio", options: ["none", "single"] },
    showQuerySummary: { control: "boolean" },
    showSelectionSummary: { control: "boolean" },
  },
  args: {
    caption: "Library records",
    columnSizingEnabled: false,
    detailRowsEnabled: false,
    columnVisibilityEnabled: false,
    columnVisibilityPersistenceEnabled: false,
    csvExportEnabled: false,
    filteringEnabled: false,
    formSerializationEnabled: false,
    operationMode: "client",
    operationStatusState: "off",
    paginationEnabled: false,
    queryAdapterEnabled: false,
    rows,
    selectionMode: "none",
    showQuerySummary: false,
    showSelectionSummary: false,
  },
  component: LibraryGrid,
  parameters: { layout: "padded", a11y: { test: "error" } },
  title: "Components/Data Grid (Experimental)",
} satisfies Meta<typeof LibraryGrid>;

export default meta;
type Story = StoryObj<typeof meta>;

export const BasicDefaults: Story = {
  name: "Basic · enhancements disabled",
};

export const RecommendedMergora: Story = {
  args: {
    columnSizingEnabled: true,
    detailRowsEnabled: true,
    columnVisibilityEnabled: true,
    columnVisibilityPersistenceEnabled: true,
    csvExportEnabled: true,
    filteringEnabled: true,
    paginationEnabled: true,
    queryAdapterEnabled: true,
    selectionMode: "single",
    showQuerySummary: true,
    showSelectionSummary: true,
  },
  name: "Recommended Mergora",
};

export const ControlledSelection: Story = {
  render: () => <ControlledSelectionExample />,
};

export const ControlledColumnVisibility: Story = {
  render: () => <ControlledColumnVisibilityExample />,
};

export const ControlledColumnSizing: Story = {
  render: () => <ControlledColumnSizingExample />,
};

export const ControlledDetailRows: Story = {
  render: () => <ControlledDetailRowsExample />,
};

export const ColumnVisibilityAdapterHydration: Story = {
  render: () => <ColumnVisibilityAdapterHydrationExample />,
};

export const SemanticTable: Story = {
  args: {
    selectionMode: "single",
    showSelectionSummary: true,
  },
};

export const ClientFilterAndPage: Story = {
  args: {
    filteringEnabled: true,
    paginationEnabled: true,
    showQuerySummary: true,
  },
};

export const ControlledQuery: Story = {
  render: () => <ControlledQueryExample />,
};

export const ManualPage: Story = {
  render: () => <ManualPageExample />,
};

export const ManualCursor: Story = {
  render: () => <ManualCursorExample />,
};

export const LoadingAndErrorRecovery: Story = {
  render: () => <LoadingAndErrorExample />,
};

export const AdapterHydration: Story = {
  render: () => <AdapterHydrationExample />,
};

export const FormSerializationAndReset: Story = {
  render: () => <FormSerializationExample />,
};

export const Empty: Story = {
  args: { rows: [] },
  render: (args) => (
    <DataGrid<LibraryRecord>
      caption={args.caption}
      columns={columns}
      emptyContent="No library records are available"
      getRowId={(row) => row.id}
      rows={[]}
    />
  ),
};

export const NarrowAndRtl: Story = {
  render: () => (
    <div dir="rtl" style={{ inlineSize: 320, maxInlineSize: "100%" }}>
      <LibraryGrid
        caption="Library records"
        columnSizingEnabled
        detailRowsEnabled
        columnVisibilityEnabled
        columnVisibilityPersistenceEnabled={false}
        csvExportEnabled={false}
        filteringEnabled
        formSerializationEnabled={false}
        operationMode="client"
        operationStatusState="off"
        paginationEnabled
        queryAdapterEnabled={false}
        rows={rows}
        selectionMode="single"
        showQuerySummary
        showSelectionSummary
      />
    </div>
  ),
};

export const KeyboardAndPreferences: Story = {
  args: {
    selectionMode: "single",
    showSelectionSummary: true,
  },
};
