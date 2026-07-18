import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { validateSchemaDocument } from "../../../registry/schemas/index.ts";
import { DataGrid, type DataGridColumn } from "../../../registry/source/systems/data-grid/index.ts";

interface Row {
  readonly id: string;
  readonly name: string;
  readonly score: number;
}

const columns: readonly DataGridColumn<Row>[] = [
  { id: "name", header: "Name", accessor: (row) => row.name, sortable: true },
  { id: "score", header: "Score", accessor: (row) => row.score, sortable: true },
];

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

  it("validates its component metadata and keeps the completion delta explicit", () => {
    const metadata = JSON.parse(readFileSync(resolve(directory, "component.json"), "utf8"));
    expect(validateSchemaDocument("component-metadata", metadata)).toMatchObject({ ok: true });

    const contract = JSON.parse(
      readFileSync(resolve(directory, "contract.draft.json"), "utf8"),
    ) as { status: string; completionDelta: string[]; evidence: Record<string, string> };
    expect(contract.status).toBe("experimental-unverified");
    expect(contract.completionDelta.length).toBeGreaterThanOrEqual(8);
    expect(Object.values(contract.evidence)).not.toContain("pass");
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
    expect(css).toContain("@media (forced-colors: active)");
  });
});
