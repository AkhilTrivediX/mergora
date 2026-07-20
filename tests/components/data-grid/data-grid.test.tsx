import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import { validateSchemaDocument } from "../../../registry/schemas/index.ts";
import {
  DataGrid,
  assertDataGridConfiguration,
  type DataGridColumn,
  type DataGridProps,
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

  it("fails closed before disabled selection or contradictory controlled defaults are consumed", () => {
    for (const key of [
      "selectedRowId",
      "defaultSelectedRowId",
      "onSelectedRowIdChange",
      "getRowLabel",
      "renderSelectionSummary",
    ]) {
      expect(() =>
        assertDataGridConfiguration({ selectionMode: "none", [key]: undefined }),
      ).toThrow(new RegExp(`${key} requires selectionMode`, "u"));
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

  it("validates its component metadata and keeps the completion delta explicit", () => {
    const metadata = JSON.parse(readFileSync(resolve(directory, "component.json"), "utf8"));
    expect(validateSchemaDocument("component-metadata", metadata)).toMatchObject({ ok: true });

    const contract = JSON.parse(
      readFileSync(resolve(directory, "contract.draft.json"), "utf8"),
    ) as { status: string; completionDelta: string[]; evidence: Record<string, string> };
    expect(contract.status).toBe("experimental-unverified");
    expect(contract.completionDelta.length).toBeGreaterThanOrEqual(8);
    expect(contract.evidence).toEqual({
      automated: "pass",
      browser: "pass",
      manualAssistiveTechnology: "not-supplied",
      packageSourceParity: "not-tested",
    });
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
    expect(css).not.toContain("inset 3px");
  });
});
