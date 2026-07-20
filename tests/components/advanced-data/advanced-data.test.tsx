import { readFileSync, readdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import {
  FilterBuilder,
  parseFilters,
  serializeFilters,
  type FilterBuilderFilter,
} from "../../../registry/source/components/filter-builder/filter-builder.tsx";
import {
  Kanban,
  moveKanbanCard,
  type KanbanColumn,
} from "../../../registry/source/components/kanban/kanban.tsx";
import {
  createEmptyQueryGroup,
  formatQuerySummary,
  parseQuery,
  QueryBuilder,
  serializeQuery,
  type QueryBuilderGroup,
} from "../../../registry/source/components/query-builder/query-builder.tsx";
import {
  moveSortableItem,
  SortableList,
} from "../../../registry/source/components/sortable-list/sortable-list.tsx";
import {
  flattenTreeGridRows,
  TreeGrid,
  type TreeGridColumn,
  type TreeGridRow,
} from "../../../registry/source/components/tree-grid/tree-grid.tsx";
import {
  assertImplementationProfileShard,
  loadMergoraSignaturePolicy,
} from "../../../tooling/registry-builder/src/index.ts";

const workspaceRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
const ids = ["filter-builder", "kanban", "query-builder", "sortable-list", "tree-grid"] as const;
const fields = [
  {
    id: "status",
    label: "Status",
    operators: [
      { id: "is", label: "is" },
      { id: "set", label: "is set", requiresValue: false },
    ],
  },
  { id: "owner", label: "Owner", operators: [{ id: "contains", label: "contains" }] },
] as const;
const query: QueryBuilderGroup = {
  id: "root",
  kind: "group",
  combinator: "and",
  children: [
    { id: "one", kind: "condition", field: "status", operator: "is", value: "Ready" },
    {
      id: "nested",
      kind: "group",
      combinator: "or",
      children: [
        { id: "two", kind: "condition", field: "owner", operator: "contains", value: "ليلى" },
      ],
    },
  ],
};
const filters: readonly FilterBuilderFilter[] = [
  { id: "f-one", field: "status", operator: "is", value: "Ready & reviewed" },
  { id: "f-two", field: "owner", operator: "contains", value: "李" },
];
interface TreeData {
  readonly name: string;
  readonly state: string;
}
const treeRows: readonly TreeGridRow<TreeData>[] = [
  {
    id: "parent",
    data: { name: "Parent", state: "Ready" },
    children: [
      { id: "child-one", data: { name: "Child one", state: "Ready" } },
      { id: "child-two", data: { name: "Child two", state: "Review" } },
    ],
  },
];
const treeColumns: readonly TreeGridColumn<TreeData>[] = [
  { id: "name", header: "Name", cell: (row) => row.name },
  { id: "state", header: "State", cell: (row) => row.state, editable: true },
];
interface CardData {
  readonly weight: number;
}
const board: readonly KanbanColumn<CardData>[] = [
  {
    id: "one",
    title: "One",
    cards: [
      { id: "a", title: "A", data: { weight: 1 } },
      { id: "b", title: "B", data: { weight: 2 } },
    ],
  },
  { id: "two", title: "Two", wipLimit: 2, cards: [] },
];

describe("advanced-data canonical family", () => {
  it("round-trips bounded query and filter serialization without losing Unicode", () => {
    expect(parseQuery(serializeQuery(query))).toEqual(query);
    expect(formatQuerySummary(query, fields)).toContain("ليلى");
    expect(parseQuery(serializeQuery(createEmptyQueryGroup("empty")))).toEqual(
      createEmptyQueryGroup("empty"),
    );
    expect(parseFilters(serializeFilters(filters))).toEqual(filters);
    expect(() =>
      parseFilters("filter=duplicate%1Fstatus%1Fis%1Fa&filter=duplicate%1Fstatus%1Fis%1Fb"),
    ).toThrow(/invalid serialized filter/u);
    expect(() => parseQuery('{"kind":"condition"}')).toThrow(/root|condition/u);
  });

  it("provides deterministic pure reorder and hierarchy helpers", () => {
    expect(moveSortableItem(["a", "b", "c"], 0, 2)).toEqual(["b", "c", "a"]);
    expect(moveSortableItem(["a", "b"], -1, 1)).toEqual(["a", "b"]);
    expect(
      moveKanbanCard(board, {
        cardId: "a",
        fromColumnId: "one",
        fromIndex: 0,
        toColumnId: "two",
        toIndex: 0,
      }),
    ).toMatchObject([
      { id: "one", cards: [{ id: "b" }] },
      { id: "two", cards: [{ id: "a" }] },
    ]);
    const collapsed = flattenTreeGridRows(treeRows, new Set());
    const expanded = flattenTreeGridRows(treeRows, new Set(["parent"]));
    expect(collapsed.map((entry) => entry.row.id)).toEqual(["parent"]);
    expect(expanded.map((entry) => entry.row.id)).toEqual(["parent", "child-one", "child-two"]);
    expect(expanded[1]).toMatchObject({ level: 2, parentId: "parent", position: 1, setSize: 2 });
  });

  it("removes every optional enhancement from basic server output", () => {
    const querySummary = vi.fn(() => "summary");
    const filterSummary = vi.fn(() => "filter summary");
    const urlRead = vi.fn(() => "");
    const urlWrite = vi.fn();
    const basic = renderToStaticMarkup(
      <>
        <QueryBuilder
          label="Query"
          fields={fields}
          defaultValue={query}
          showSummary={false}
          renderSummary={querySummary}
        />
        <FilterBuilder
          label="Filters"
          fields={fields}
          defaultFilters={filters}
          showActiveSummary={false}
          renderFilterSummary={filterSummary}
          savedFilters={false}
          urlAdapter={false}
          mobileDrawer={false}
        />
        <SortableList
          label="Order"
          defaultItems={["One", "Two"]}
          getItemId={(item) => item}
          getItemLabel={(item) => item}
          renderItem={(item) => item}
          showDestinationControls={false}
          announceMoves={false}
          undoable={false}
          virtualWindow={false}
        />
        <TreeGrid
          label="Tree"
          rows={treeRows}
          columns={treeColumns}
          getRowLabel={(row) => row.name}
          showHierarchySummary={false}
          announceChanges={false}
          virtualWindow={false}
        />
        <Kanban
          label="Board"
          defaultColumns={board}
          showWipStatus={false}
          mobileListAlternative={false}
          announceMoves={false}
          undoable={false}
          serverAdapter={false}
          virtualization={false}
        />
      </>,
    );
    expect(basic).not.toContain("query-builder-summary");
    expect(basic).not.toContain("filter-builder-summary");
    expect(basic).not.toContain("filter-builder__saved");
    expect(basic).not.toContain("filter-builder__drawer");
    expect(basic).not.toContain("sortable-list-announcer");
    expect(basic).not.toContain("Move to position");
    expect(basic).not.toContain("tree-grid-summary");
    expect(basic).not.toContain("tree-grid-announcer");
    expect(basic).not.toContain("kanban-wip-status");
    expect(basic).not.toContain("Kanban presentation");
    expect(basic).not.toContain("kanban-announcer");
    expect(querySummary).not.toHaveBeenCalled();
    expect(filterSummary).not.toHaveBeenCalled();
    expect(urlRead).not.toHaveBeenCalled();
    expect(urlWrite).not.toHaveBeenCalled();
  });

  it("renders independently selected Mergora advantages and native fallbacks", () => {
    const html = renderToStaticMarkup(
      <>
        <QueryBuilder label="Query" fields={fields} defaultValue={query} showSummary />
        <FilterBuilder
          label="Filters"
          fields={fields}
          defaultFilters={filters}
          showActiveSummary
          savedFilters={[{ id: "saved", label: "Saved", filters }]}
          mobileDrawer
        />
        <SortableList
          label="Order"
          defaultItems={["One", "Two"]}
          getItemId={(item) => item}
          getItemLabel={(item) => item}
          renderItem={(item) => item}
          showDestinationControls
          announceMoves
          undoable
        />
        <TreeGrid
          label="Tree"
          rows={treeRows}
          columns={treeColumns}
          getRowLabel={(row) => row.name}
          defaultExpandedIds={["parent"]}
          selectionMode="multiple"
          showHierarchySummary
          announceChanges
          onEditCommit={() => undefined}
        />
        <Kanban
          label="Board"
          defaultColumns={board}
          showWipStatus
          mobileListAlternative
          announceMoves
          undoable
          serverAdapter={{ move: async () => undefined }}
        />
      </>,
    );
    expect(html).toContain("query-builder-summary");
    expect(html).toContain("filter-builder-summary");
    expect(html).toContain("Apply saved filter");
    expect(html).toContain("filter-builder__drawer");
    expect(html).toContain("Move to position");
    expect(html).toContain("sortable-list-announcer");
    expect(html).toContain('role="treegrid"');
    expect(html).toContain('aria-level="2"');
    expect(html).toContain("tree-grid-summary");
    expect(html).toContain("tree-grid-announcer");
    expect(html).toContain("kanban-wip-status");
    expect(html).toContain("Mobile list view");
    expect(html).toContain("kanban-announcer");
    expect(html).toContain('data-maturity="beta"');
  });

  it("fails closed when controlled and uncontrolled ownership are mixed", () => {
    expect(() =>
      renderToStaticMarkup(
        <QueryBuilder
          label="Query"
          fields={fields}
          value={query}
          defaultValue={createEmptyQueryGroup()}
        />,
      ),
    ).toThrow(/controlled value cannot be combined/u);
    expect(() =>
      renderToStaticMarkup(
        <FilterBuilder label="Filters" fields={fields} filters={filters} defaultFilters={[]} />,
      ),
    ).toThrow(/controlled filters cannot be combined/u);
    expect(() =>
      renderToStaticMarkup(
        <SortableList
          label="Order"
          items={["One"]}
          defaultItems={["Two"]}
          getItemId={(item) => item}
          getItemLabel={(item) => item}
          renderItem={(item) => item}
        />,
      ),
    ).toThrow(/controlled items cannot be combined/u);
    expect(() =>
      renderToStaticMarkup(
        <TreeGrid
          label="Tree"
          rows={treeRows}
          columns={treeColumns}
          getRowLabel={(row) => row.name}
          expandedIds={[]}
          defaultExpandedIds={[]}
        />,
      ),
    ).toThrow(/controlled expansion cannot be combined/u);
    expect(() =>
      renderToStaticMarkup(<Kanban label="Board" columns={board} defaultColumns={board} />),
    ).toThrow(/controlled columns cannot be combined/u);
  });

  it("rejects malformed schemas, identities, and virtual windows before rendering", () => {
    expect(() => parseQuery("x".repeat(65_537))).toThrow(/supported size/u);
    expect(() =>
      renderToStaticMarkup(
        <FilterBuilder
          label="Filters"
          fields={[{ id: "", label: "Invalid", operators: [{ id: "is", label: "is" }] }]}
        />,
      ),
    ).toThrow(/unique fields/u);
    expect(() =>
      renderToStaticMarkup(
        <SortableList
          label="Order"
          defaultItems={["One"]}
          getItemId={(item) => item}
          getItemLabel={(item) => item}
          renderItem={(item) => item}
          virtualWindow={{ start: 0, end: 1, itemSize: 0 }}
          onVirtualWindowChange={() => undefined}
        />,
      ),
    ).toThrow(/positive itemSize/u);
    expect(() =>
      renderToStaticMarkup(
        <TreeGrid
          label="Tree"
          rows={treeRows}
          columns={treeColumns}
          getRowLabel={(row) => row.name}
          virtualWindow={{ start: 2, end: 1, rowSize: 48 }}
          onVirtualWindowChange={() => undefined}
        />,
      ),
    ).toThrow(/bounded integer indexes/u);
    expect(() =>
      renderToStaticMarkup(
        <Kanban
          label="Board"
          defaultColumns={[{ id: "invalid", title: "Invalid", wipLimit: -1, cards: [] }]}
        />,
      ),
    ).toThrow(/non-negative integer WIP/u);
  });

  it("owns exact canonical companion sets and a valid complete profile shard", () => {
    for (const id of ids) {
      const directory = resolve(workspaceRoot, `registry/source/components/${id}`);
      expect(readdirSync(directory).sort()).toEqual(
        [
          "README.md",
          "index.ts",
          `${id}-css.d.ts`,
          `${id}.anatomy.json`,
          `${id}.api.json`,
          `${id}.contract.json`,
          `${id}.css`,
          `${id}.metadata.json`,
          `${id}.source.json`,
          `${id}.status.json`,
          `${id}.stories.json`,
          `${id}.tsx`,
        ].sort(),
      );
      const source = JSON.parse(readFileSync(resolve(directory, `${id}.source.json`), "utf8"));
      const api = JSON.parse(readFileSync(resolve(directory, `${id}.api.json`), "utf8"));
      const runtime = readFileSync(resolve(directory, `${id}.tsx`), "utf8");
      const runtimeExports = [
        ...runtime.matchAll(
          /^export\s+(?:declare\s+)?(?:abstract\s+)?(?:async\s+)?(?:class|const|enum|function|interface|let|namespace|type|var)\s+([A-Za-z_$][\w$]*)/gmu,
        ),
      ]
        .map((match) => match[1]!)
        .sort((left, right) => left.localeCompare(right, "en-US"));
      const apiExports = api.exports
        .map((entry: { readonly name: string }) => entry.name)
        .sort((left: string, right: string) => left.localeCompare(right, "en-US"));
      expect(source).toMatchObject({ id, outputRole: "system" });
      expect(api.itemId).toBe(id);
      expect(apiExports).toEqual(runtimeExports);
      expect(apiExports).toContain(api.entryExport);
    }
    const profile = JSON.parse(
      readFileSync(
        resolve(workspaceRoot, "registry/quality/implementation-profiles/advanced-data.v1.json"),
        "utf8",
      ),
    );
    expect(() =>
      assertImplementationProfileShard(
        profile,
        loadMergoraSignaturePolicy(workspaceRoot),
        workspaceRoot,
      ),
    ).not.toThrow();
    expect(profile.auditPendingIds).toEqual([]);
    expect(profile.profiles).toHaveLength(6);
  });

  it("uses declared semantic tokens and preference fallbacks without banned styling", () => {
    const tokenCss = readFileSync(
      resolve(workspaceRoot, "packages/tokens/src/generated/tokens.css"),
      "utf8",
    );
    for (const id of ids) {
      const css = readFileSync(
        resolve(workspaceRoot, `registry/source/components/${id}/${id}.css`),
        "utf8",
      );
      const references = [...css.matchAll(/var\((--mrg-semantic-[a-z0-9-]+)/gu)].map(
        (match) => match[1]!,
      );
      expect(references.length, id).toBeGreaterThan(10);
      expect(
        references.every((reference) => tokenCss.includes(`${reference}:`)),
        id,
      ).toBe(true);
      expect(css, id).toContain("@media (forced-colors: active)");
      expect(css, id).toContain("@media (prefers-reduced-motion: reduce)");
      expect(css, id).not.toMatch(
        /(?:gradient\(|backdrop-filter|border-radius:\s*(?:2[0-9]|[3-9][0-9])px)/u,
      );
    }
  });
});
