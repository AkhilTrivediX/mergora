import type { Meta, StoryObj } from "@storybook/react-vite";
import { useState } from "react";

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

interface IncidentGridStoryProps extends Omit<DataGridProps<Incident>, "renderSelectionSummary"> {
  readonly showSelectionSummary?: boolean;
}

function IncidentGrid({
  showSelectionSummary = false,
  ...props
}: IncidentGridStoryProps): React.ReactElement {
  return (
    <DataGrid<Incident>
      {...props}
      {...(showSelectionSummary
        ? {
            renderSelectionSummary: (selectedRow: Incident | null) =>
              selectedRow === null
                ? "No incident selected"
                : `Selected ${selectedRow.title} · ${selectedRow.priority} priority`,
          }
        : {})}
    />
  );
}

function ControlledIncidentGrid(): React.ReactElement {
  const [selectedRowId, setSelectedRowId] = useState<string | null>("inc-17");
  return (
    <DataGrid<Incident>
      caption="Controlled open incidents"
      columns={columns}
      getRowId={(row) => row.id}
      getRowLabel={(row) => `Select ${row.title}`}
      onSelectedRowIdChange={setSelectedRowId}
      renderSelectionSummary={(selectedRow) =>
        selectedRow === null
          ? "No incident selected"
          : `Controlled selection · ${selectedRow.title}`
      }
      rows={rows}
      selectedRowId={selectedRowId}
      selectionMode="single"
    />
  );
}

const meta = {
  argTypes: {
    selectionMode: { control: "inline-radio", options: ["none", "single"] },
    showSelectionSummary: { control: "boolean" },
  },
  title: "Components/Data Grid (Experimental)",
  component: IncidentGrid,
  parameters: { layout: "padded", a11y: { test: "error" } },
} satisfies Meta<typeof IncidentGrid>;

export default meta;
type Story = StoryObj<typeof meta>;

export const BasicDefaults: Story = {
  args: {
    caption: "Open incidents",
    rows,
    columns,
    getRowId: (row) => row.id,
    selectionMode: "none",
    showSelectionSummary: false,
  },
  name: "Basic · enhancements disabled",
};

export const RecommendedMergora: Story = {
  args: {
    caption: "Open incidents",
    rows,
    columns,
    getRowId: (row) => row.id,
    selectionMode: "single",
    defaultSelectedRowId: "inc-21",
    getRowLabel: (row) => `Select ${row.title}`,
    showSelectionSummary: true,
  },
  name: "Recommended Mergora",
};

export const ControlledSelection: Story = {
  args: {
    caption: "Controlled open incidents",
    columns,
    getRowId: (row) => row.id,
    rows,
  },
  render: () => <ControlledIncidentGrid />,
};

export const SemanticTable: Story = {
  args: {
    caption: "Open incidents",
    rows,
    columns,
    getRowId: (row) => row.id,
    selectionMode: "single",
    defaultSelectedRowId: "inc-21",
    getRowLabel: (row) => `Select ${row.title}`,
    showSelectionSummary: true,
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

export const NarrowAndRtl: Story = {
  args: {
    caption: "Open incidents",
    rows,
    columns,
    getRowId: (row) => row.id,
  },
  render: () => (
    <div dir="rtl" style={{ inlineSize: 320, maxInlineSize: "100%" }}>
      <IncidentGrid
        caption="Open incidents"
        rows={rows}
        columns={columns}
        getRowId={(row) => row.id}
        selectionMode="single"
        defaultSelectedRowId="inc-21"
        getRowLabel={(row) => `Select ${row.title}`}
        showSelectionSummary
      />
    </div>
  ),
};
