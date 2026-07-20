import type { Meta, StoryObj } from "@storybook/react-vite";
import { useState, type ReactElement } from "react";

import { ActivityFeed } from "../../../registry/source/components/activity-feed/index.ts";
import { Avatar, AvatarGroup } from "../../../registry/source/components/avatar/index.ts";
import { CalendarHeatmap } from "../../../registry/source/components/calendar-heatmap/index.ts";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "../../../registry/source/components/card/index.ts";
import { Carousel } from "../../../registry/source/components/carousel/index.ts";
import { Chart } from "../../../registry/source/components/chart/index.ts";
import {
  DataTable,
  type DataTableColumn,
} from "../../../registry/source/components/data-table/index.ts";
import { Item } from "../../../registry/source/components/item/index.ts";
import { Stat } from "../../../registry/source/components/stat/index.ts";
import { Table, type TableColumn } from "../../../registry/source/components/table/index.ts";
import { Timeline } from "../../../registry/source/components/timeline/index.ts";
import { VirtualList } from "../../../registry/source/components/virtual-list/index.ts";
import "mergora-tokens/tokens.css";

type Kind =
  | "activity-feed"
  | "avatar"
  | "calendar-heatmap"
  | "card"
  | "carousel"
  | "chart"
  | "data-table"
  | "item"
  | "stat"
  | "table"
  | "timeline"
  | "virtual-list";

interface StoryProps {
  readonly kind: Kind;
  readonly direction: "ltr" | "rtl";
  readonly narrow: boolean;
  readonly showPresence: boolean;
  readonly showStatusRail: boolean;
  readonly showSelectionContext: boolean;
  readonly responsiveLabels: boolean;
  readonly queryAdapterEnabled: boolean;
  readonly showQuerySummary: boolean;
  readonly searchable: boolean;
  readonly selectable: boolean;
  readonly paginated: boolean;
  readonly showPositionSummary: boolean;
  readonly showDurations: boolean;
  readonly showComparison: boolean;
  readonly interactive: boolean;
  readonly autoplayEnabled: boolean;
  readonly announceSlide: boolean;
  readonly showSummary: boolean;
  readonly showContinuationStatus: boolean;
}

interface RecordRow {
  readonly id: string;
  readonly name: string;
  readonly state: string;
  readonly count: number;
}
const rows: readonly RecordRow[] = [
  { id: "r1", name: "Design tokens", state: "Ready", count: 18 },
  { id: "r2", name: "Icon exports", state: "Review", count: 9 },
  { id: "r3", name: "Usage notes", state: "Draft", count: 13 },
];
const columns: readonly TableColumn<RecordRow>[] = [
  { id: "name", header: "Work item", rowHeader: true, cell: (row) => row.name },
  { id: "state", header: "State", cell: (row) => row.state },
  { id: "count", header: "Checks", align: "end", cell: (row) => row.count },
];
const dataColumns: readonly DataTableColumn<RecordRow>[] = columns.map((column) => ({
  ...column,
  sortable: true,
  sortValue: (row) =>
    column.id === "count" ? row.count : column.id === "state" ? row.state : row.name,
  filterValue: (row) => `${row.name} ${row.state} ${row.count}`,
}));
const timelineEvents = [
  {
    id: "t1",
    title: "Draft saved",
    status: "Complete",
    timestamp: "2026-01-12T09:00:00Z",
    description: "The initial source was recorded.",
  },
  {
    id: "t2",
    title: "Checks started",
    status: "Running",
    timestamp: "2026-01-12T10:30:00Z",
    description: "Automated evidence is being collected.",
  },
];
const chartPoints = [
  { id: "mon", label: "Monday", value: 8 },
  { id: "tue", label: "Tuesday", value: 14 },
  { id: "wed", label: "Wednesday", value: 11 },
  { id: "thu", label: "Thursday", value: 17 },
];
const heatEntries = Array.from({ length: 21 }, (_, index) => ({
  date: `2026-02-${String(index + 1).padStart(2, "0")}`,
  value: (index * 7) % 13,
}));

const activityEvents = [
  {
    id: "a1",
    actor: "Asha",
    action: "updated the token contract",
    timestamp: "2026-02-01T09:00:00Z",
    context: "Two semantic aliases changed.",
  },
  {
    id: "a2",
    actor: "Mina",
    action: "recorded browser evidence",
    timestamp: "2026-02-01T11:30:00Z",
  },
] as const;

function ActivityFeedSpecimen({
  showContinuationStatus,
}: {
  readonly showContinuationStatus: boolean;
}): ReactElement {
  const [complete, setComplete] = useState(false);
  const events = complete
    ? [
        ...activityEvents,
        {
          id: "a3",
          actor: "Jon",
          action: "closed the final review note",
          timestamp: "2026-02-01T13:00:00Z",
        },
      ]
    : activityEvents;
  return (
    <ActivityFeed
      label="Recent activity"
      events={events}
      hasMore={!complete}
      onLoadMore={() => setComplete(true)}
      showContinuationStatus={showContinuationStatus}
    />
  );
}

function DataDisplaySpecimen(args: StoryProps): ReactElement {
  switch (args.kind) {
    case "avatar":
      return (
        <AvatarGroup aria-label="Review participants" maximum={3}>
          <Avatar
            name="Asha Rao"
            showPresence={args.showPresence}
            presence="available"
            presenceLabel="Available"
          />
          <Avatar name="Mina Park" />
          <Avatar name="Jon Bell" />
          <Avatar name="Liu Wen" />
        </AvatarGroup>
      );
    case "card":
      return (
        <Card statusRail={args.showStatusRail ? "Verified against the current source" : undefined}>
          <CardHeader>
            <CardTitle>Release notes</CardTitle>
            <CardDescription>
              A semantically neutral surface with an explicit action region.
            </CardDescription>
          </CardHeader>
          <CardContent>Three compatibility notes are ready to review.</CardContent>
          <CardFooter>
            <button type="button">Open notes</button>
          </CardFooter>
        </Card>
      );
    case "item":
      return (
        <Item
          title="Token review"
          description="Updated a few minutes ago"
          selected
          actions={<button type="button">Open</button>}
          {...(args.showSelectionContext
            ? {
                renderSelectionContext: ({ selected }: { readonly selected: boolean }) =>
                  selected ? "Selected for the next review" : null,
              }
            : {})}
        />
      );
    case "table":
      return (
        <Table
          caption="Verification queue"
          regionLabel="Verification queue table"
          rows={rows}
          columns={columns}
          getRowId={(row) => row.id}
          responsiveLabels={args.responsiveLabels}
        />
      );
    case "data-table":
      return (
        <DataTable
          caption="Verification queue"
          rows={rows}
          columns={dataColumns}
          getRowId={(row) => row.id}
          searchable={args.searchable}
          selectable={args.selectable}
          paginated={args.paginated}
          pageSizes={[2, 3]}
          defaultQuery={{ pageSize: 2 }}
          queryAdapter={args.queryAdapterEnabled ? { write: () => undefined } : false}
          showQuerySummary={args.showQuerySummary}
        />
      );
    case "virtual-list":
      return (
        <VirtualList
          items={Array.from({ length: 100 }, (_, index) => ({
            id: `item-${index}`,
            label: `Result ${index + 1}`,
          }))}
          getItemId={(item) => item.id}
          renderItem={(item) => item.label}
          label="Search results"
          viewportHeight={240}
          getItemSize={(_, index) => (index % 3 === 0 ? 56 : 44)}
          showPositionSummary={args.showPositionSummary}
        />
      );
    case "timeline":
      return (
        <Timeline
          events={timelineEvents}
          label="Document history"
          showDurations={args.showDurations}
        />
      );
    case "stat":
      return (
        <Stat
          label="Completed checks"
          value={1284}
          context="Across the current catalog snapshot"
          comparison={args.showComparison ? { previous: 1130, label: "previous snapshot" } : false}
        />
      );
    case "chart":
      return (
        <Chart
          name="Daily checks"
          description="Completed checks during the current work week."
          points={chartPoints}
          interactive={args.interactive}
        />
      );
    case "carousel":
      return (
        <Carousel
          label="Feature tour"
          slideLabels={["Overview", "Evidence", "Next steps"]}
          autoplay={args.autoplayEnabled ? { interval: 6000 } : false}
          announceSlide={args.announceSlide}
        >
          <section>
            <h3>Overview</h3>
            <p style={{ color: "var(--mrg-semantic-color-foreground-primary)" }}>
              See the current source state.
            </p>
          </section>
          <section>
            <h3>Evidence</h3>
            <p style={{ color: "var(--mrg-semantic-color-foreground-primary)" }}>
              Inspect keyboard and browser results.
            </p>
          </section>
          <section>
            <h3>Next steps</h3>
            <p style={{ color: "var(--mrg-semantic-color-foreground-primary)" }}>
              Resolve the remaining blockers.
            </p>
          </section>
        </Carousel>
      );
    case "calendar-heatmap":
      return (
        <CalendarHeatmap
          entries={heatEntries}
          label="Daily verification activity"
          showSummary={args.showSummary}
        />
      );
    case "activity-feed":
      return <ActivityFeedSpecimen showContinuationStatus={args.showContinuationStatus} />;
  }
}

function DataDisplayStory(args: StoryProps): ReactElement {
  return (
    <section
      aria-label={`${args.kind} specimen`}
      data-testid={`data-display-${args.kind}`}
      data-kind={args.kind}
      dir={args.direction}
      style={args.narrow ? { inlineSize: 320, maxInlineSize: "100%" } : undefined}
    >
      <DataDisplaySpecimen {...args} />
    </section>
  );
}

const disabled = {
  direction: "ltr",
  narrow: false,
  showPresence: false,
  showStatusRail: false,
  showSelectionContext: false,
  responsiveLabels: false,
  queryAdapterEnabled: false,
  showQuerySummary: false,
  searchable: false,
  selectable: false,
  paginated: false,
  showPositionSummary: false,
  showDurations: false,
  showComparison: false,
  interactive: false,
  autoplayEnabled: false,
  announceSlide: false,
  showSummary: false,
  showContinuationStatus: false,
} as const;

const meta = {
  title: "Components/Data Display",
  component: DataDisplayStory,
  parameters: { layout: "padded", a11y: { test: "error" } },
  argTypes: {
    kind: {
      control: "select",
      options: [
        "avatar",
        "card",
        "item",
        "table",
        "data-table",
        "virtual-list",
        "timeline",
        "stat",
        "chart",
        "carousel",
        "calendar-heatmap",
        "activity-feed",
      ],
    },
    direction: { control: "inline-radio", options: ["ltr", "rtl"] },
    narrow: { control: "boolean" },
    showPresence: { control: "boolean" },
    showStatusRail: { control: "boolean" },
    showSelectionContext: { control: "boolean" },
    responsiveLabels: { control: "boolean" },
    queryAdapterEnabled: { control: "boolean" },
    showQuerySummary: { control: "boolean" },
    searchable: { control: "boolean" },
    selectable: { control: "boolean" },
    paginated: { control: "boolean" },
    showPositionSummary: { control: "boolean" },
    showDurations: { control: "boolean" },
    showComparison: { control: "boolean" },
    interactive: { control: "boolean" },
    autoplayEnabled: { control: "boolean" },
    announceSlide: { control: "boolean" },
    showSummary: { control: "boolean" },
    showContinuationStatus: { control: "boolean" },
  },
} satisfies Meta<typeof DataDisplayStory>;

export default meta;
type Story = StoryObj<typeof meta>;

export const BasicAvatar: Story = { args: { ...disabled, kind: "avatar" }, name: "Avatar · basic" };
export const RecommendedAvatar: Story = {
  args: { ...disabled, kind: "avatar", showPresence: true },
  name: "Avatar · Recommended Mergora",
};
export const BasicCard: Story = { args: { ...disabled, kind: "card" }, name: "Card · basic" };
export const RecommendedCard: Story = {
  args: { ...disabled, kind: "card", showStatusRail: true },
  name: "Card · Recommended Mergora",
};
export const BasicItem: Story = { args: { ...disabled, kind: "item" }, name: "Item · basic" };
export const RecommendedItem: Story = {
  args: { ...disabled, kind: "item", showSelectionContext: true },
  name: "Item · Recommended Mergora",
};
export const BasicTable: Story = { args: { ...disabled, kind: "table" }, name: "Table · basic" };
export const RecommendedTable: Story = {
  args: { ...disabled, kind: "table", responsiveLabels: true },
  name: "Table · Recommended Mergora",
};
export const BasicDataTable: Story = {
  args: { ...disabled, kind: "data-table" },
  name: "Data Table · basic",
};
export const RecommendedDataTable: Story = {
  args: {
    ...disabled,
    kind: "data-table",
    queryAdapterEnabled: true,
    showQuerySummary: true,
    searchable: true,
    selectable: true,
    paginated: true,
  },
  name: "Data Table · Recommended Mergora",
};
export const BasicVirtualList: Story = {
  args: { ...disabled, kind: "virtual-list" },
  name: "Virtual List · basic",
};
export const RecommendedVirtualList: Story = {
  args: { ...disabled, kind: "virtual-list", showPositionSummary: true },
  name: "Virtual List · Recommended Mergora",
};
export const BasicTimeline: Story = {
  args: { ...disabled, kind: "timeline" },
  name: "Timeline · basic",
};
export const RecommendedTimeline: Story = {
  args: { ...disabled, kind: "timeline", showDurations: true },
  name: "Timeline · Recommended Mergora",
};
export const BasicStat: Story = { args: { ...disabled, kind: "stat" }, name: "Stat · basic" };
export const RecommendedStat: Story = {
  args: { ...disabled, kind: "stat", showComparison: true },
  name: "Stat · Recommended Mergora",
};
export const BasicChart: Story = { args: { ...disabled, kind: "chart" }, name: "Chart · basic" };
export const RecommendedChart: Story = {
  args: { ...disabled, kind: "chart", interactive: true },
  name: "Chart · Recommended Mergora",
};
export const BasicCarousel: Story = {
  args: { ...disabled, kind: "carousel" },
  name: "Carousel · basic",
};
export const RecommendedCarousel: Story = {
  args: { ...disabled, kind: "carousel", autoplayEnabled: true, announceSlide: true },
  name: "Carousel · Recommended Mergora",
};
export const BasicCalendarHeatmap: Story = {
  args: { ...disabled, kind: "calendar-heatmap" },
  name: "Calendar Heatmap · basic",
};
export const RecommendedCalendarHeatmap: Story = {
  args: { ...disabled, kind: "calendar-heatmap", showSummary: true },
  name: "Calendar Heatmap · Recommended Mergora",
};
export const BasicActivityFeed: Story = {
  args: { ...disabled, kind: "activity-feed" },
  name: "Activity Feed · basic",
};
export const RecommendedActivityFeed: Story = {
  args: { ...disabled, kind: "activity-feed", showContinuationStatus: true },
  name: "Activity Feed · Recommended Mergora",
};

function ControlledGallery(): ReactElement {
  const [slide, setSlide] = useState(1);
  const [date, setDate] = useState<string | null>(heatEntries[4]!.date);
  const [point, setPoint] = useState<string | null>(chartPoints[1]!.id);
  return (
    <div style={{ display: "grid", gap: "2rem" }}>
      <Carousel label="Controlled tour" index={slide} onIndexChange={setSlide}>
        <p>First controlled slide</p>
        <p>Second controlled slide</p>
        <p>Third controlled slide</p>
      </Carousel>
      <CalendarHeatmap
        entries={heatEntries}
        label="Controlled activity"
        selectedDate={date}
        onSelectedDateChange={setDate}
        showSummary
      />
      <Chart
        name="Controlled chart"
        description="Keyboard selection is controlled by the story."
        points={chartPoints}
        interactive
        activePointId={point}
        onActivePointChange={(next) => setPoint(next.id)}
      />
    </div>
  );
}

export const ControlledExamples: Story = {
  args: { ...disabled, kind: "carousel" },
  render: () => <ControlledGallery />,
};
export const LoadingEmptyAndError: Story = {
  args: { ...disabled, kind: "activity-feed" },
  render: () => (
    <div style={{ display: "grid", gap: "2rem" }}>
      <DataTable
        caption="Loading table"
        rows={[]}
        columns={dataColumns}
        getRowId={(row) => row.id}
        loading
      />
      <VirtualList
        items={[]}
        getItemId={(item: RecordRow) => item.id}
        renderItem={(item) => item.name}
        label="Loading results"
        viewportHeight={160}
        loading
      />
      <Chart name="Empty chart" description="No samples have been recorded." points={[]} />
      <ActivityFeed
        label="Interrupted activity"
        events={[]}
        loadError="Activity could not be loaded."
        onRetry={() => undefined}
        showContinuationStatus
      />
    </div>
  ),
};
export const NarrowAndRtl: Story = {
  args: { ...disabled, kind: "table" },
  render: () => (
    <div dir="rtl" style={{ inlineSize: 320, maxInlineSize: "100%" }}>
      <DataDisplayStory {...disabled} direction="rtl" kind="table" narrow responsiveLabels />
      <DataDisplayStory {...disabled} direction="rtl" kind="timeline" narrow showDurations />
      <DataDisplayStory {...disabled} direction="rtl" kind="calendar-heatmap" narrow showSummary />
      <DataDisplayStory {...disabled} direction="rtl" kind="carousel" narrow />
    </div>
  ),
};
export const KeyboardAndPreferences: Story = {
  args: { ...disabled, kind: "carousel", announceSlide: true },
  render: (args) => (
    <div style={{ display: "grid", gap: "2rem" }}>
      <p>
        Use Tab, arrow keys, Home, and End. System forced-colors and reduced-motion preferences are
        honored by the component styles.
      </p>
      <DataDisplayStory {...args} kind="carousel" />
      <DataDisplayStory {...args} kind="chart" interactive />
      <DataDisplayStory {...args} kind="virtual-list" showPositionSummary />
    </div>
  ),
};
