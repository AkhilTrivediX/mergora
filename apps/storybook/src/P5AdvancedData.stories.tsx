import type { Meta, StoryObj } from "@storybook/react-vite";
import { useRef, useState, type FormEvent, type ReactElement } from "react";

import {
  FilterBuilder,
  type FilterBuilderFilter,
} from "../../../registry/source/components/filter-builder/index.ts";
import { Kanban, type KanbanColumn } from "../../../registry/source/components/kanban/index.ts";
import {
  createEmptyQueryGroup,
  QueryBuilder,
  type QueryBuilderGroup,
} from "../../../registry/source/components/query-builder/index.ts";
import { SortableList } from "../../../registry/source/components/sortable-list/index.ts";
import {
  TreeGrid,
  type TreeGridColumn,
  type TreeGridRow,
} from "../../../registry/source/components/tree-grid/index.ts";
import "mergora-tokens/tokens.css";

type Kind = "filter-builder" | "kanban" | "query-builder" | "sortable-list" | "tree-grid";

interface StoryProps {
  readonly kind: Kind;
  readonly showQuerySummary: boolean;
  readonly showFilterSummary: boolean;
  readonly savedFiltersEnabled: boolean;
  readonly urlAdapterEnabled: boolean;
  readonly mobileDrawerEnabled: boolean;
  readonly destinationControls: boolean;
  readonly announceMoves: boolean;
  readonly undoable: boolean;
  readonly virtualized: boolean;
  readonly showTreeSummary: boolean;
  readonly treeEditing: boolean;
  readonly showWipStatus: boolean;
  readonly mobileListAlternative: boolean;
  readonly serverAdapterEnabled: boolean;
}

const fields = [
  {
    id: "status",
    label: "Status",
    operators: [
      { id: "is", label: "is" },
      { id: "is-not", label: "is not" },
      { id: "is-set", label: "is set", requiresValue: false },
    ],
  },
  {
    id: "owner",
    label: "Owner",
    operators: [
      { id: "contains", label: "contains" },
      { id: "equals", label: "equals" },
    ],
  },
] as const;

const populatedQuery: QueryBuilderGroup = {
  id: "root",
  kind: "group",
  combinator: "and",
  children: [
    { id: "status-ready", kind: "condition", field: "status", operator: "is", value: "Ready" },
    {
      id: "people",
      kind: "group",
      combinator: "or",
      children: [
        { id: "owner-a", kind: "condition", field: "owner", operator: "contains", value: "Asha" },
        { id: "owner-b", kind: "condition", field: "owner", operator: "contains", value: "Mina" },
      ],
    },
  ],
};

const populatedFilters: readonly FilterBuilderFilter[] = [
  { id: "f-status", field: "status", operator: "is", value: "Ready" },
  { id: "f-owner", field: "owner", operator: "contains", value: "Asha" },
];

interface ListItem {
  readonly id: string;
  readonly title: string;
  readonly detail: string;
}
const listItems: readonly ListItem[] = [
  { id: "overview", title: "Overview", detail: "A concise introduction" },
  { id: "evidence", title: "Evidence", detail: "Current verification results" },
  { id: "notes", title: "Usage notes", detail: "Implementation guidance" },
  { id: "history", title: "History", detail: "Recorded changes" },
];

interface TreeRow {
  readonly name: string;
  readonly state: string;
  readonly owner: string;
}
const treeRows: readonly TreeGridRow<TreeRow>[] = [
  {
    id: "foundation",
    data: { name: "Foundation", state: "Ready", owner: "Asha" },
    children: [
      { id: "tokens", data: { name: "Semantic tokens", state: "Ready", owner: "Asha" } },
      { id: "focus", data: { name: "Focus policy", state: "Review", owner: "Mina" } },
    ],
  },
  {
    id: "components",
    data: { name: "Components", state: "In progress", owner: "Jon" },
    children: [
      { id: "fields", data: { name: "Field suite", state: "Ready", owner: "Jon" } },
      { id: "data", data: { name: "Data systems", state: "Review", owner: "Liu" }, loading: true },
    ],
  },
];
const treeColumns: readonly TreeGridColumn<TreeRow>[] = [
  { id: "name", header: "Workstream", cell: (row) => row.name },
  {
    id: "state",
    header: "State",
    cell: (row) => row.state,
    editable: true,
    editValue: (row) => row.state,
  },
  { id: "owner", header: "Owner", cell: (row) => row.owner },
];

interface CardData {
  readonly estimate: number;
}
const boardColumns: readonly KanbanColumn<CardData>[] = [
  {
    id: "planned",
    title: "Planned",
    cards: [
      {
        id: "c1",
        title: "Draft usage notes",
        description: "Add recovery guidance",
        data: { estimate: 2 },
      },
      {
        id: "c2",
        title: "Review empty state",
        description: "Check narrow copy",
        data: { estimate: 1 },
      },
    ],
  },
  {
    id: "active",
    title: "Active",
    wipLimit: 2,
    cards: [
      {
        id: "c3",
        title: "Verify keyboard path",
        description: "Run the complete move flow",
        data: { estimate: 3 },
      },
    ],
  },
  { id: "done", title: "Done", cards: [] },
];

function AdvancedDataStory(args: StoryProps): ReactElement {
  const [sortWindow, setSortWindow] = useState({ start: 0, end: 3, itemSize: 76 });
  const [treeWindow, setTreeWindow] = useState({ start: 0, end: 4, rowSize: 52 });
  const [kanbanWindows, setKanbanWindows] = useState<
    Record<string, { start: number; end: number }>
  >({
    planned: { start: 0, end: 1 },
    active: { start: 0, end: 1 },
    done: { start: 0, end: 0 },
  });
  switch (args.kind) {
    case "query-builder":
      return (
        <QueryBuilder
          label="Content query"
          fields={fields}
          defaultValue={args.showQuerySummary ? populatedQuery : createEmptyQueryGroup()}
          showSummary={args.showQuerySummary}
          name="query"
        />
      );
    case "filter-builder":
      return (
        <FilterBuilder
          label="Content filters"
          fields={fields}
          defaultFilters={args.showFilterSummary ? populatedFilters : []}
          showActiveSummary={args.showFilterSummary}
          savedFilters={
            args.savedFiltersEnabled
              ? [{ id: "ready", label: "Ready work", filters: populatedFilters }]
              : false
          }
          urlAdapter={args.urlAdapterEnabled ? { write: () => undefined } : false}
          mobileDrawer={args.mobileDrawerEnabled}
          name="filters"
        />
      );
    case "sortable-list":
      return (
        <SortableList
          label="Section order"
          defaultItems={listItems}
          getItemId={(item) => item.id}
          getItemLabel={(item) => item.title}
          renderItem={(item) => (
            <>
              <strong>{item.title}</strong>
              <br />
              <span>{item.detail}</span>
            </>
          )}
          showDestinationControls={args.destinationControls}
          announceMoves={args.announceMoves}
          undoable={args.undoable}
          virtualWindow={args.virtualized ? sortWindow : false}
          onVirtualWindowChange={setSortWindow}
          name="sectionOrder"
        />
      );
    case "tree-grid":
      return (
        <TreeGrid
          label="Workstream hierarchy"
          rows={treeRows}
          columns={treeColumns}
          getRowLabel={(row) => row.name}
          defaultExpandedIds={["foundation", "components"]}
          selectionMode="multiple"
          defaultSelectedIds={["tokens"]}
          showHierarchySummary={args.showTreeSummary}
          announceChanges={args.announceMoves}
          {...(args.treeEditing ? { onEditCommit: async () => undefined } : {})}
          virtualWindow={args.virtualized ? treeWindow : false}
          onVirtualWindowChange={setTreeWindow}
          name="selectedRows"
        />
      );
    case "kanban":
      return (
        <Kanban
          label="Delivery board"
          defaultColumns={boardColumns}
          showWipStatus={args.showWipStatus}
          mobileListAlternative={args.mobileListAlternative}
          announceMoves={args.announceMoves}
          undoable={args.undoable}
          serverAdapter={args.serverAdapterEnabled ? { move: async () => undefined } : false}
          virtualization={
            args.virtualized
              ? {
                  rowSize: 160,
                  getWindow: (columnId) => kanbanWindows[columnId] ?? { start: 0, end: 0 },
                  onWindowChange: (columnId, window) =>
                    setKanbanWindows((current) => ({ ...current, [columnId]: window })),
                }
              : false
          }
        />
      );
  }
}

const disabled = {
  showQuerySummary: false,
  showFilterSummary: false,
  savedFiltersEnabled: false,
  urlAdapterEnabled: false,
  mobileDrawerEnabled: false,
  destinationControls: false,
  announceMoves: false,
  undoable: false,
  virtualized: false,
  showTreeSummary: false,
  treeEditing: false,
  showWipStatus: false,
  mobileListAlternative: false,
  serverAdapterEnabled: false,
} as const;

const meta = {
  title: "Systems/Advanced Data",
  component: AdvancedDataStory,
  parameters: { layout: "padded", a11y: { test: "error" } },
  argTypes: {
    kind: {
      control: "select",
      options: ["query-builder", "filter-builder", "sortable-list", "tree-grid", "kanban"],
    },
    showQuerySummary: { control: "boolean" },
    showFilterSummary: { control: "boolean" },
    savedFiltersEnabled: { control: "boolean" },
    urlAdapterEnabled: { control: "boolean" },
    mobileDrawerEnabled: { control: "boolean" },
    destinationControls: { control: "boolean" },
    announceMoves: { control: "boolean" },
    undoable: { control: "boolean" },
    virtualized: { control: "boolean" },
    showTreeSummary: { control: "boolean" },
    treeEditing: { control: "boolean" },
    showWipStatus: { control: "boolean" },
    mobileListAlternative: { control: "boolean" },
    serverAdapterEnabled: { control: "boolean" },
  },
} satisfies Meta<typeof AdvancedDataStory>;

export default meta;
type Story = StoryObj<typeof meta>;

export const BasicQueryBuilder: Story = {
  args: { ...disabled, kind: "query-builder" },
  name: "Query Builder · basic",
};
export const RecommendedQueryBuilder: Story = {
  args: { ...disabled, kind: "query-builder", showQuerySummary: true },
  name: "Query Builder · Recommended Mergora",
};
export const BasicFilterBuilder: Story = {
  args: { ...disabled, kind: "filter-builder" },
  name: "Filter Builder · basic",
};
export const RecommendedFilterBuilder: Story = {
  args: {
    ...disabled,
    kind: "filter-builder",
    showFilterSummary: true,
    savedFiltersEnabled: true,
    urlAdapterEnabled: true,
    mobileDrawerEnabled: true,
  },
  name: "Filter Builder · Recommended Mergora",
};
export const BasicSortableList: Story = {
  args: { ...disabled, kind: "sortable-list" },
  name: "Sortable List · basic",
};
export const RecommendedSortableList: Story = {
  args: {
    ...disabled,
    kind: "sortable-list",
    destinationControls: true,
    announceMoves: true,
    undoable: true,
  },
  name: "Sortable List · Recommended Mergora",
};
export const BasicTreeGrid: Story = {
  args: { ...disabled, kind: "tree-grid" },
  name: "Tree Grid · basic",
};
export const RecommendedTreeGrid: Story = {
  args: {
    ...disabled,
    kind: "tree-grid",
    showTreeSummary: true,
    announceMoves: true,
    treeEditing: true,
  },
  name: "Tree Grid · Recommended Mergora",
};
export const BasicKanban: Story = {
  args: { ...disabled, kind: "kanban" },
  name: "Kanban · basic Beta",
};
export const RecommendedKanban: Story = {
  args: {
    ...disabled,
    kind: "kanban",
    showWipStatus: true,
    mobileListAlternative: true,
    announceMoves: true,
    undoable: true,
    serverAdapterEnabled: true,
  },
  name: "Kanban · Recommended Mergora Beta",
};

function ControlledFormStory(): ReactElement {
  const [query, setQuery] = useState(populatedQuery);
  const [filters, setFilters] = useState(populatedFilters);
  const [submission, setSubmission] = useState("Nothing submitted yet.");
  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const parameters = new URLSearchParams();
    for (const [key, value] of new FormData(event.currentTarget)) {
      parameters.append(key, typeof value === "string" ? value : value.name);
    }
    setSubmission(parameters.toString());
  };
  return (
    <form
      onSubmit={submit}
      onReset={() => {
        setQuery(populatedQuery);
        setFilters(populatedFilters);
      }}
      style={{ display: "grid", gap: "2rem" }}
    >
      <QueryBuilder
        label="Controlled query"
        fields={fields}
        value={query}
        onValueChange={setQuery}
        name="query"
        showSummary
      />
      <FilterBuilder
        label="Controlled filters"
        fields={fields}
        filters={filters}
        onFiltersChange={setFilters}
        name="filters"
        showActiveSummary
      />
      <div>
        <button type="submit">Submit</button> <button type="reset">Reset</button>
      </div>
      <output aria-live="polite" data-slot="advanced-data-form-result">
        {submission}
      </output>
    </form>
  );
}

export const ControlledAndForm: Story = {
  args: { ...disabled, kind: "query-builder" },
  render: () => <ControlledFormStory />,
};

export const StateMatrix: Story = {
  args: { ...disabled, kind: "query-builder" },
  render: () => (
    <div style={{ display: "grid", gap: "2rem" }}>
      <QueryBuilder
        label="Invalid query"
        fields={fields}
        defaultValue={{
          ...populatedQuery,
          children: [
            { id: "invalid", kind: "condition", field: "status", operator: "is", value: "" },
          ],
        }}
      />
      <QueryBuilder
        label="Read-only query"
        fields={fields}
        defaultValue={populatedQuery}
        readOnly
        showSummary
      />
      <FilterBuilder
        label="Disabled filters"
        fields={fields}
        defaultFilters={populatedFilters}
        disabled
      />
      <SortableList
        label="Empty order"
        defaultItems={[]}
        getItemId={(item: ListItem) => item.id}
        getItemLabel={(item) => item.title}
        renderItem={(item) => item.title}
      />
      <TreeGrid
        label="Empty hierarchy"
        rows={[]}
        columns={treeColumns}
        getRowLabel={(row) => row.name}
      />
      <Kanban
        label="Empty board"
        defaultColumns={[{ id: "empty", title: "Empty", cards: [] }]}
        disabled
        showWipStatus
      />
    </div>
  ),
};

function ServerRecoveryStory(): ReactElement {
  const attempts = useRef(0);
  return (
    <Kanban
      label="Recoverable delivery board"
      defaultColumns={boardColumns}
      announceMoves
      showWipStatus
      undoable
      serverAdapter={{
        move: async () => {
          attempts.current += 1;
          if (attempts.current === 1) throw new Error("The board could not be saved.");
        },
      }}
    />
  );
}

export const ServerRecovery: Story = {
  args: { ...disabled, kind: "kanban" },
  render: () => <ServerRecoveryStory />,
};

export const VirtualizedWindows: Story = {
  args: { ...disabled, kind: "sortable-list", virtualized: true },
  render: () => (
    <div style={{ display: "grid", gap: "2rem" }}>
      <AdvancedDataStory {...disabled} kind="sortable-list" virtualized />
      <AdvancedDataStory {...disabled} kind="tree-grid" virtualized showTreeSummary />
      <AdvancedDataStory {...disabled} kind="kanban" virtualized showWipStatus />
    </div>
  ),
};

export const NarrowAndRtl: Story = {
  args: { ...disabled, kind: "kanban" },
  render: () => (
    <div dir="rtl" style={{ inlineSize: 320, maxInlineSize: "100%", display: "grid", gap: "2rem" }}>
      <AdvancedDataStory
        {...disabled}
        kind="filter-builder"
        showFilterSummary
        mobileDrawerEnabled
      />
      <AdvancedDataStory {...disabled} kind="sortable-list" destinationControls />
      <AdvancedDataStory {...disabled} kind="tree-grid" showTreeSummary />
      <AdvancedDataStory {...disabled} kind="kanban" showWipStatus mobileListAlternative />
    </div>
  ),
};

export const KeyboardAndPreferences: Story = {
  args: { ...disabled, kind: "sortable-list", announceMoves: true, destinationControls: true },
  render: (args) => (
    <div style={{ display: "grid", gap: "2rem" }}>
      <p>
        Use Tab to reach move handles. Space picks up, arrows move, Enter drops, and Escape restores
        the original order. Forced colors and reduced motion are inherited from the operating
        system.
      </p>
      <AdvancedDataStory {...args} kind="sortable-list" />
      <AdvancedDataStory {...args} kind="tree-grid" showTreeSummary announceMoves />
      <AdvancedDataStory
        {...args}
        kind="kanban"
        showWipStatus
        mobileListAlternative
        announceMoves
      />
    </div>
  ),
};
