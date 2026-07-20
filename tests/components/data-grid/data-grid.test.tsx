import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import { validateSchemaDocument } from "../../../registry/schemas/index.ts";
import {
  DataGrid,
  assertDataGridConfiguration,
  normalizeDataGridQuery,
  parseDataGridQuery,
  serializeDataGridQuery,
  type DataGridColumn,
  type DataGridProps,
  type DataGridQuery,
  type DataGridSelectionProps,
  type DataGridSortingProps,
} from "../../../registry/source/systems/data-grid/data-grid.tsx";

interface Row {
  readonly id: string;
  readonly name: string;
  readonly score: number;
}

const columns: readonly DataGridColumn<Row>[] = [
  { id: "name", header: "Name", accessor: (row) => row.name, sortable: true },
  { id: "score", header: "Score", accessor: (row) => row.score, sortable: true },
];

const _invalidDisabledSelection = {
  selectedRowId: "a",
  selectionMode: "none",
  // @ts-expect-error Selection-disabled adapter props cannot consume controlled selection.
} satisfies DataGridSelectionProps<Row>;

const _invalidControlledSelection = {
  defaultSelectedRowId: "a",
  selectedRowId: "a",
  selectionMode: "single",
  // @ts-expect-error Controlled adapter props cannot also declare an uncontrolled default.
} satisfies DataGridSelectionProps<Row>;

const _invalidControlledSorting = {
  defaultSorting: { columnId: "name", direction: "descending" },
  sorting: { columnId: "name", direction: "ascending" },
  // @ts-expect-error Controlled sorting adapter props cannot also declare an uncontrolled default.
} satisfies DataGridSortingProps;

const directory = resolve(
  dirname(fileURLToPath(import.meta.url)),
  "../../../registry/source/systems/data-grid",
);

describe("Data Grid Experimental canonical source", () => {
  it("normalizes and deterministically round-trips page and cursor queries", () => {
    expect(normalizeDataGridQuery()).toEqual({
      filter: "",
      pagination: null,
      sorting: null,
    });
    expect(serializeDataGridQuery(normalizeDataGridQuery())).toBe("");

    const pageQuery: DataGridQuery = {
      filter: "Ready & review",
      sorting: { columnId: "score", direction: "descending" },
      pagination: { mode: "page", page: 2, pageSize: 25 },
    };
    const serializedPage =
      "filter=Ready+%26+review&sort=score&direction=descending&pagination=page&page=2&pageSize=25";
    expect(serializeDataGridQuery(pageQuery)).toBe(serializedPage);
    expect(parseDataGridQuery(serializedPage)).toEqual(pageQuery);

    const cursorQuery: DataGridQuery = {
      filter: "",
      sorting: null,
      pagination: { mode: "cursor", cursor: "opaque:next", pageSize: 50 },
    };
    const serializedCursor = "pagination=cursor&cursor=opaque%3Anext&pageSize=50";
    expect(serializeDataGridQuery(cursorQuery)).toBe(serializedCursor);
    expect(parseDataGridQuery(`?${serializedCursor}`)).toEqual(cursorQuery);
    expect(parseDataGridQuery("pagination=page&page=-2&pageSize=0")).toEqual({
      filter: "",
      sorting: null,
      pagination: { mode: "page", page: 1, pageSize: 10 },
    });
  });

  it("renders native table semantics, sorting controls, caption, and labelled selection", () => {
    const html = renderToStaticMarkup(
      <DataGrid
        caption="Scores"
        rows={[{ id: "a", name: "Asha", score: 9 }]}
        columns={columns}
        getRowId={(row) => row.id}
        selectionMode="single"
        getRowLabel={(row) => `Select ${row.name}`}
      />,
    );
    expect(html).toContain('data-maturity="experimental"');
    expect(html).toContain("<table");
    expect(html).toContain("<caption>Scores</caption>");
    expect(html).toContain('scope="col"');
    expect(html).toContain('aria-label="Select Asha"');
    expect(html).toContain('type="radio"');
  });

  it("processes client rows in filter, sort, then page order and serializes the effective query", () => {
    const query: DataGridQuery = {
      filter: "review",
      sorting: { columnId: "score", direction: "descending" },
      pagination: { mode: "page", page: 2, pageSize: 1 },
    };
    const html = renderToStaticMarkup(
      <DataGrid
        caption="Scores"
        rows={[
          { id: "a", name: "Asha review", score: 9 },
          { id: "b", name: "Bao ready", score: 100 },
          { id: "c", name: "Cleo review", score: 12 },
        ]}
        columns={columns}
        filtering
        getRowId={(row) => row.id}
        pagination={{ pageSizes: [1, 2] }}
        query={query}
        queryName="scoreQuery"
      />,
    );
    expect(html).toContain("Asha review");
    expect(html).not.toContain("Bao ready");
    expect(html).not.toContain("Cleo review");
    expect(html).toContain("2 records · page 2 of 2");
    expect(html).toContain('data-slot="data-grid-filter-input"');
    expect(html).toContain('data-slot="data-grid-pagination"');
    expect(html).toContain('data-slot="data-grid-query-summary"');
    expect(html).toContain('data-slot="data-grid-query-input"');
    expect(html).toContain('name="scoreQuery"');
    expect(html).toContain(
      'value="filter=review&amp;sort=score&amp;direction=descending&amp;pagination=page&amp;page=2&amp;pageSize=1"',
    );
  });

  it("uses locale-independent casing for deterministic server and client filtering", () => {
    const localeLowerCase = vi
      .spyOn(String.prototype, "toLocaleLowerCase")
      .mockImplementation(function localeSpecificLowerCase(this: string): string {
        return this.toString().replaceAll("I", "ı").toLowerCase();
      });
    try {
      const html = renderToStaticMarkup(
        <DataGrid
          caption="Records"
          columns={columns}
          filtering
          getRowId={(row) => row.id}
          query={{ filter: "i", pagination: null, sorting: null }}
          rows={[{ id: "i", name: "I", score: 1 }]}
        />,
      );
      expect(html).toContain(">I<");
      expect(localeLowerCase).not.toHaveBeenCalled();
    } finally {
      localeLowerCase.mockRestore();
    }
  });

  it("defers uncontrolled adapter restoration until after server rendering", () => {
    const read = vi.fn(
      () => "filter=review&sort=score&direction=descending&pagination=page&page=2&pageSize=1",
    );
    const write = vi.fn();
    const html = renderToStaticMarkup(
      <DataGrid
        caption="Scores"
        rows={[
          { id: "a", name: "Asha review", score: 9 },
          { id: "b", name: "Bao ready", score: 100 },
          { id: "c", name: "Cleo review", score: 12 },
        ]}
        columns={columns}
        filtering
        getRowId={(row) => row.id}
        pagination={{ pageSizes: [1, 2] }}
        queryAdapter={{ read, write }}
      />,
    );
    expect(read).not.toHaveBeenCalled();
    expect(write).not.toHaveBeenCalled();
    expect(html).toContain("Asha review");
    expect(html).toContain("Bao ready");
    expect(html).toContain("Cleo review");
  });

  it("keeps manual rows in consumer order and quantity for page and cursor operations", () => {
    const pageHtml = renderToStaticMarkup(
      <DataGrid
        caption="Scores"
        rows={[
          { id: "a", name: "First source row", score: 1 },
          { id: "b", name: "Second source row", score: 2 },
        ]}
        columns={columns}
        filtering
        getRowId={(row) => row.id}
        operationMode="manual"
        pagination={{ mode: "page", pageSizes: [1], totalRows: 20 }}
        query={{
          filter: "does not match",
          sorting: { columnId: "score", direction: "descending" },
          pagination: { mode: "page", page: 4, pageSize: 1 },
        }}
      />,
    );
    expect(pageHtml.indexOf("First source row")).toBeLessThan(
      pageHtml.indexOf("Second source row"),
    );
    expect(pageHtml).toContain("First source row");
    expect(pageHtml).toContain("Second source row");

    const cursorHtml = renderToStaticMarkup(
      <DataGrid
        caption="Scores"
        rows={[
          { id: "a", name: "First source row", score: 1 },
          { id: "b", name: "Second source row", score: 2 },
        ]}
        columns={columns}
        getRowId={(row) => row.id}
        operationMode="manual"
        pagination={{ mode: "cursor", nextCursor: "next", pageSizes: [2] }}
        query={{
          filter: "",
          sorting: null,
          pagination: { mode: "cursor", cursor: "current", pageSize: 2 },
        }}
      />,
    );
    expect(cursorHtml).toContain("First source row");
    expect(cursorHtml).toContain("Second source row");
    expect(cursorHtml).toContain("Current result window");
    expect(cursorHtml).not.toContain("Page 1 of");
  });

  it("preserves a consumer-owned manual page in summaries and form serialization", () => {
    const html = renderToStaticMarkup(
      <DataGrid
        caption="Scores"
        columns={columns}
        getRowId={(row) => row.id}
        operationMode="manual"
        pagination={{ mode: "page", pageSizes: [10], totalRows: 30 }}
        query={{
          filter: "",
          pagination: { mode: "page", page: 10, pageSize: 10 },
          sorting: null,
        }}
        queryName="scoreQuery"
        rows={[{ id: "page-10", name: "Consumer page ten", score: 10 }]}
      />,
    );
    expect(html).toContain("Consumer page ten");
    expect(html).toContain("30 records · page 10 of 3");
    expect(html).toContain('value="pagination=page&amp;page=10&amp;pageSize=10"');
  });

  it("renders the explicit empty state across the full column count", () => {
    const html = renderToStaticMarkup(
      <DataGrid
        caption="Scores"
        rows={[]}
        columns={columns}
        getRowId={(row) => row.id}
        emptyContent="No scores"
      />,
    );
    expect(html).toMatch(/col[Ss]pan="2"/u);
    expect(html).toContain("No scores");
  });

  it("removes disabled and empty optional selection-summary output from SSR", () => {
    const basic = renderToStaticMarkup(
      <DataGrid
        caption="Scores"
        rows={[{ id: "a", name: "Asha", score: 9 }]}
        columns={columns}
        getRowId={(row) => row.id}
      />,
    );
    expect(basic).not.toContain("data-grid-selection-summary");
    expect(basic).not.toContain('aria-live="polite"');
    for (const emptyContent of [null, false, "   ", <></>, <span key="empty" />]) {
      const emptyRenderer = vi.fn(() => emptyContent);
      const empty = renderToStaticMarkup(
        <DataGrid
          caption="Scores"
          rows={[{ id: "a", name: "Asha", score: 9 }]}
          columns={columns}
          defaultSelectedRowId="a"
          getRowId={(row) => row.id}
          renderSelectionSummary={emptyRenderer}
          selectionMode="single"
        />,
      );
      expect(empty).not.toContain("data-grid-selection-summary");
      expect(empty).not.toContain('aria-live="polite"');
      expect(emptyRenderer).toHaveBeenCalledOnce();
    }

    const enhancedRenderer = vi.fn((selectedRow: Row | null) =>
      selectedRow === null ? "No score selected" : `Selected ${selectedRow.name}`,
    );
    const enhanced = renderToStaticMarkup(
      <DataGrid
        caption="Scores"
        rows={[{ id: "a", name: "Asha", score: 9 }]}
        columns={columns}
        defaultSelectedRowId="a"
        getRowId={(row) => row.id}
        renderSelectionSummary={enhancedRenderer}
        selectionMode="single"
      />,
    );
    expect(enhanced).toContain('data-slot="data-grid-selection-summary"');
    expect(enhanced).toContain('aria-live="polite"');
    expect(enhanced).toContain("Selected Asha");
    expect(enhancedRenderer).toHaveBeenCalledOnce();
  });

  it("retains selected-row form serialization when filtering or paging hides its radio", () => {
    const html = renderToStaticMarkup(
      <form>
        <DataGrid
          caption="Scores"
          columns={columns}
          filtering
          getRowId={(row) => row.id}
          pagination={{ pageSizes: [1] }}
          query={{
            filter: "",
            pagination: { mode: "page", page: 2, pageSize: 1 },
            sorting: null,
          }}
          renderSelectionSummary={(selectedRow) =>
            selectedRow === null ? "No score selected" : `Selected ${selectedRow.name}`
          }
          rows={[
            { id: "a", name: "Asha", score: 9 },
            { id: "b", name: "Bao", score: 10 },
          ]}
          selectedRowId="a"
          selectionMode="single"
          selectionName="scoreSelection"
        />
      </form>,
    );
    expect(html).toContain("Selected Asha");
    expect(html).toContain("Bao");
    expect(html).not.toContain(">Asha<");
    expect(html).toContain('data-slot="data-grid-selection-input"');
    expect(html).toContain('name="scoreSelection"');
    expect(html).toContain('type="hidden"');
    expect(html).toContain('value="a"');

    const staleSelection = renderToStaticMarkup(
      <DataGrid
        caption="Scores"
        columns={columns}
        getRowId={(row) => row.id}
        renderSelectionSummary={(selectedRow) =>
          selectedRow === null ? "No score selected" : `Selected ${selectedRow.name}`
        }
        rows={[{ id: "a", name: "Asha", score: 9 }]}
        selectedRowId="missing"
        selectionMode="single"
        selectionName="scoreSelection"
      />,
    );
    expect(staleSelection).toContain("No score selected");
    expect(staleSelection).not.toContain('data-slot="data-grid-selection-input"');
    expect(staleSelection).not.toContain("checked");
  });

  it("removes disabled query enhancements and retains rows during loading and errors", () => {
    const basic = renderToStaticMarkup(
      <DataGrid
        caption="Scores"
        rows={[
          { id: "a", name: "Asha", score: 9 },
          { id: "b", name: "Bao", score: 10 },
        ]}
        columns={columns}
        filtering={false}
        getRowId={(row) => row.id}
        operationStatus={false}
        pagination={false}
        query={{
          filter: "does not match",
          sorting: null,
          pagination: { mode: "page", page: 2, pageSize: 1 },
        }}
        queryAdapter={false}
        renderQuerySummary={false}
      />,
    );
    expect(basic).toContain("Asha");
    expect(basic).toContain("Bao");
    expect(basic).not.toContain("data-grid-filter");
    expect(basic).not.toContain("data-grid-pagination");
    expect(basic).not.toContain("data-grid-query-summary");
    expect(basic).not.toContain("data-grid-operation-status");
    expect(basic).not.toContain("aria-busy");

    const loading = renderToStaticMarkup(
      <DataGrid
        caption="Scores"
        rows={[{ id: "a", name: "Retained row", score: 9 }]}
        columns={columns}
        getRowId={(row) => row.id}
        operationStatus={{ state: "loading" }}
      />,
    );
    expect(loading).toContain('aria-busy="true"');
    expect(loading).toContain('role="status"');
    expect(loading).toContain("Loading records");
    expect(loading).toContain("Retained row");

    const retry = vi.fn();
    const error = renderToStaticMarkup(
      <DataGrid
        caption="Scores"
        rows={[{ id: "a", name: "Retained row", score: 9 }]}
        columns={columns}
        getRowId={(row) => row.id}
        operationStatus={{ state: "error", onRetry: retry }}
      />,
    );
    expect(error).not.toContain("aria-busy");
    expect(error).toContain('role="alert"');
    expect(error).toContain("Could not load records.");
    expect(error).toContain("Retry loading records");
    expect(error).toContain("Retained row");
    expect(retry).not.toHaveBeenCalled();

    const emptyCustomMessages = renderToStaticMarkup(
      <DataGrid
        caption="Scores"
        columns={columns}
        getRowId={(row) => row.id}
        operationStatus={{ message: false, state: "error" }}
        rows={[{ id: "a", name: "Retained row", score: 9 }]}
      />,
    );
    expect(emptyCustomMessages).toContain('role="alert"');
    expect(emptyCustomMessages).toContain("Could not load records.");
  });

  it("fails closed before disabled selection or contradictory controlled defaults are consumed", () => {
    const selectionOnlyValues = {
      defaultSelectedRowId: "a",
      getRowLabel: () => "Asha",
      onSelectedRowIdChange: () => undefined,
      renderSelectionSummary: () => "Asha",
      selectedRowId: "a",
      selectionName: "scoreSelection",
    } as const;
    for (const [key, value] of Object.entries(selectionOnlyValues)) {
      expect(() => assertDataGridConfiguration({ selectionMode: "none", [key]: value })).toThrow(
        new RegExp(`${key} requires selectionMode`, "u"),
      );
    }

    expect(() =>
      assertDataGridConfiguration({
        defaultSelectedRowId: "a",
        selectedRowId: "a",
        selectionMode: "single",
      }),
    ).toThrow(/controlled selection cannot be combined/u);
    expect(() =>
      assertDataGridConfiguration({
        defaultSorting: null,
        sorting: null,
      }),
    ).toThrow(/controlled sorting cannot be combined/u);

    const summary = vi.fn(() => "Should not render");
    const invalidProps = {
      caption: "Scores",
      rows: [{ id: "a", name: "Asha", score: 9 }],
      columns,
      getRowId: (row: Row) => row.id,
      renderSelectionSummary: summary,
      selectionMode: "none",
    } as unknown as DataGridProps<Row>;
    expect(() => renderToStaticMarkup(<DataGrid {...invalidProps} />)).toThrow(
      /renderSelectionSummary requires selectionMode/u,
    );
    expect(summary).not.toHaveBeenCalled();
  });

  it("treats explicit undefined as omission and rejects non-plain option objects", () => {
    expect(() =>
      assertDataGridConfiguration({
        defaultQuery: undefined,
        filtering: undefined,
        messages: undefined,
        operationMode: undefined,
        operationStatus: undefined,
        pagination: undefined,
        query: undefined,
        queryAdapter: undefined,
        queryName: undefined,
        renderQuerySummary: undefined,
        selectedRowId: undefined,
        selectionMode: "none",
        selectionName: undefined,
        sorting: undefined,
      }),
    ).not.toThrow();
    expect(() =>
      assertDataGridConfiguration({ messages: { filterLabel: undefined } }),
    ).not.toThrow();

    for (const invalid of [
      { filtering: [] },
      { pagination: new Date() },
      { messages: [] },
      { operationStatus: [] },
      { queryAdapter: Object.assign(new (class Adapter {})(), { write: () => undefined }) },
      { defaultQuery: [] },
    ]) {
      expect(() => assertDataGridConfiguration(invalid)).toThrow(/Mergora DataGrid/u);
    }
  });

  it("fails closed for contradictory query ownership, unsafe operations, and unstable identity", () => {
    expect(() =>
      assertDataGridConfiguration({
        defaultSorting: null,
        filtering: true,
      }),
    ).toThrow(/aggregate query ownership cannot be combined with legacy defaultSorting/u);
    expect(() =>
      assertDataGridConfiguration({
        defaultQuery: {},
        query: { filter: "", pagination: null, sorting: null },
      }),
    ).toThrow(/controlled query cannot be combined with defaultQuery/u);
    expect(() =>
      assertDataGridConfiguration({
        query: { filter: 4, pagination: null, sorting: null },
      }),
    ).toThrow(/query.filter must be a string/u);
    expect(() =>
      assertDataGridConfiguration({
        pagination: { mode: "offset" },
      }),
    ).toThrow(/pagination.mode must be/u);
    expect(() =>
      assertDataGridConfiguration({
        queryAdapter: { read: () => null },
      }),
    ).toThrow(/queryAdapter.write must be a function/u);
    expect(() =>
      assertDataGridConfiguration({
        operationStatus: { onRetry: () => undefined, state: "loading" },
      }),
    ).toThrow(/onRetry requires the error state/u);

    const baseProps = {
      caption: "Scores",
      rows: [{ id: "a", name: "Asha", score: 9 }],
      columns,
      getRowId: (row: Row) => row.id,
    };
    expect(() =>
      renderToStaticMarkup(
        <DataGrid
          {...baseProps}
          operationMode="manual"
          pagination={{ mode: "page", pageSizes: [10] }}
        />,
      ),
    ).toThrow(/manual page pagination requires pagination.totalRows/u);
    expect(() =>
      renderToStaticMarkup(
        <DataGrid {...baseProps} pagination={{ mode: "cursor", pageSizes: [10] }} />,
      ),
    ).toThrow(/cursor pagination requires operationMode/u);
    expect(() =>
      renderToStaticMarkup(
        <DataGrid
          {...baseProps}
          rows={[
            { id: "duplicate", name: "Asha", score: 9 },
            { id: "duplicate", name: "Bao", score: 10 },
          ]}
        />,
      ),
    ).toThrow(/row ids must be unique/u);
    expect(() =>
      renderToStaticMarkup(<DataGrid {...baseProps} columns={[...columns, columns[0]!]} />),
    ).toThrow(/column ids must be unique/u);
    expect(() =>
      renderToStaticMarkup(
        <DataGrid
          {...baseProps}
          defaultSorting={{ columnId: "missing", direction: "ascending" }}
        />,
      ),
    ).toThrow(/must identify a sortable column/u);
  });

  it("validates its component metadata and keeps the completion delta explicit", () => {
    const metadata = JSON.parse(
      readFileSync(resolve(directory, "data-grid.metadata.json"), "utf8"),
    );
    expect(validateSchemaDocument("component-metadata", metadata)).toMatchObject({ ok: true });

    const contract = JSON.parse(
      readFileSync(resolve(directory, "data-grid.contract.json"), "utf8"),
    ) as {
      claim: string;
      contractStatus: string;
      evidenceRequirements: { manual: string[]; recordedEvidence: string[] };
    };
    expect(contract.contractStatus).toBe("source-present-unreleased");
    expect(contract.claim).toMatch(/Experimental/u);
    expect(contract.evidenceRequirements.manual.length).toBeGreaterThanOrEqual(8);
    expect(contract.evidenceRequirements.recordedEvidence).toEqual([]);
  });

  it("references only declared semantic/component tokens and includes forced colors", () => {
    const css = readFileSync(resolve(directory, "data-grid.css"), "utf8");
    const tokenCss = readFileSync(
      resolve(directory, "../../../../packages/tokens/src/generated/tokens.css"),
      "utf8",
    );
    const references = [...css.matchAll(/var\((--mrg-[a-z0-9-]+)/gu)].map((match) => match[1]!);
    expect(references.length).toBeGreaterThan(10);
    expect(references.every((reference) => tokenCss.includes(`${reference}:`))).toBe(true);
    expect(css).toContain("--mrg-component-focus-indicator-contrast-background");
    expect(css).toMatch(
      /box-shadow:\s*0 0 0 var\(--mrg-component-focus-indicator-width\)\s+var\(--mrg-component-focus-indicator-contrast-background\);/u,
    );
    expect(css).toMatch(
      /outline:\s*var\(--mrg-component-focus-indicator-width\) solid\s+var\(--mrg-component-focus-indicator-color\);/u,
    );
    expect(css).toContain("@media (forced-colors: active)");
    expect(css).toMatch(
      /@media \(forced-colors: active\)[\s\S]*box-shadow:\s*none;[\s\S]*outline-color:\s*Highlight;/u,
    );
    expect(css).not.toMatch(
      /box-shadow:\s*0 0 0 var\(--mrg-semantic-border-width-default\)\s+var\(--mrg-component-focus-indicator-contrast-background\)/u,
    );
    expect(css).toContain("@media (prefers-reduced-motion: reduce)");
    expect(css).toContain("@media (pointer: coarse)");
    expect(css).toContain("--mrg-semantic-size-target-preferred");
    expect(css).not.toContain("inset 3px");
  });
});
