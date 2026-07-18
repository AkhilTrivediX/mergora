import type { Meta, StoryObj } from "@storybook/react-vite";

import {
  DataGrid,
  type DataGridColumn,
  type DataGridProps,
} from "../../../registry/source/systems/data-grid/index.ts";
import "../../../registry/source/systems/data-grid/data-grid.css";
import "mergora-tokens/tokens.css";

interface Incident {
  readonly id: string;
  readonly title: string;
  readonly priority: "Low" | "Medium" | "High";
  readonly owner: string;
}

const columns: readonly DataGridColumn<Incident>[] = [
  { id: "title", header: "Incident", accessor: (row) => row.title, sortable: true },
  { id: "priority", header: "Priority", accessor: (row) => row.priority, sortable: true },
  { id: "owner", header: "Owner", accessor: (row) => row.owner, sortable: true },
];

const rows: readonly Incident[] = [
  { id: "inc-17", title: "Checkout latency", priority: "High", owner: "Asha" },
  { id: "inc-21", title: "Export retry", priority: "Medium", owner: "Mina" },
  { id: "inc-24", title: "Profile image", priority: "Low", owner: "Jon" },
];

function IncidentGrid(props: DataGridProps<Incident>): React.ReactElement {
  return <DataGrid<Incident> {...props} />;
}

const meta = {
  title: "P1 tracer/Data Grid (Experimental)",
  component: IncidentGrid,
  parameters: { layout: "padded", a11y: { test: "error" } },
} satisfies Meta<typeof IncidentGrid>;

export default meta;
type Story = StoryObj<typeof meta>;

export const SemanticTable: Story = {
  args: {
    caption: "Open incidents",
    rows,
    columns,
    getRowId: (row) => row.id,
    selectionMode: "single",
    defaultSelectedRowId: "inc-21",
    getRowLabel: (row) => `Select ${row.title}`,
  },
};

export const Empty: Story = {
  args: {
    caption: "Open incidents",
    rows: [],
    columns,
    getRowId: (row) => row.id,
    emptyContent: "No open incidents",
  },
};
