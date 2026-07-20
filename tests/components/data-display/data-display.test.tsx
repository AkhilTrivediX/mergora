import { readFileSync, readdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import { ActivityFeed } from "../../../registry/source/components/activity-feed/activity-feed.tsx";
import { Avatar } from "../../../registry/source/components/avatar/avatar.tsx";
import { CalendarHeatmap } from "../../../registry/source/components/calendar-heatmap/calendar-heatmap.tsx";
import { Card } from "../../../registry/source/components/card/card.tsx";
import { Carousel } from "../../../registry/source/components/carousel/carousel.tsx";
import { Chart } from "../../../registry/source/components/chart/chart.tsx";
import {
  DataTable,
  parseDataTableQuery,
  serializeDataTableQuery,
  type DataTableColumn,
} from "../../../registry/source/components/data-table/data-table.tsx";
import { Item } from "../../../registry/source/components/item/item.tsx";
import { Stat, getStatChange } from "../../../registry/source/components/stat/stat.tsx";
import { Table, type TableColumn } from "../../../registry/source/components/table/table.tsx";
import { Timeline } from "../../../registry/source/components/timeline/timeline.tsx";
import { VirtualList } from "../../../registry/source/components/virtual-list/virtual-list.tsx";
import {
  assertImplementationProfileShard,
  loadMergoraSignaturePolicy,
} from "../../../tooling/registry-builder/src/index.ts";

const workspaceRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
const ids = [
  "activity-feed",
  "avatar",
  "calendar-heatmap",
  "card",
  "carousel",
  "chart",
  "data-table",
  "item",
  "stat",
  "table",
  "timeline",
  "virtual-list",
] as const;
interface Row {
  readonly id: string;
  readonly name: string;
  readonly score: number;
}
const rows: readonly Row[] = [
  { id: "one", name: "First", score: 8 },
  { id: "two", name: "Second", score: 13 },
];
const tableColumns: readonly TableColumn<Row>[] = [
  { id: "name", header: "Name", rowHeader: true, cell: (row) => row.name },
  { id: "score", header: "Score", cell: (row) => row.score },
];
const dataColumns: readonly DataTableColumn<Row>[] = tableColumns.map((column) => ({
  ...column,
  sortable: true,
  sortValue: (row) => (column.id === "score" ? row.score : row.name),
  filterValue: (row) => row.name,
}));

describe("data-display canonical family", () => {
  it("keeps simple component enhancements absent by default", () => {
    const duration = vi.fn(() => "duration context");
    const html = renderToStaticMarkup(
      <>
        <Avatar name="Asha Rao" />
        <Card>Plain content</Card>
        <Item title="Item" />
        <Table
          caption="Rows"
          regionLabel="Rows table"
          rows={rows}
          columns={tableColumns}
          getRowId={(row) => row.id}
          responsiveLabels={false}
        />
        <Timeline
          label="History"
          events={[
            { id: "a", title: "Saved", timestamp: new Date(0) },
            { id: "b", title: "Checked", timestamp: new Date(60_000) },
          ]}
          showDurations={false}
          formatDuration={duration}
        />
        <Stat label="Checks" value={12} comparison={false} />
      </>,
    );
    expect(html).not.toContain("avatar-presence");
    expect(html).not.toContain("card-status");
    expect(html).not.toContain("item-selection-context");
    expect(html).not.toContain("data-responsive-labels");
    expect(html).not.toContain("timeline-duration");
    expect(html).not.toContain("stat-comparison");
    expect(duration).not.toHaveBeenCalled();
  });

  it("renders useful text-backed enhancements when selected", () => {
    const context = vi.fn(() => "Selected for review");
    const duration = vi.fn(() => "One minute later");
    const html = renderToStaticMarkup(
      <>
        <Avatar name="Asha Rao" showPresence presence="available" presenceLabel="Available" />
        <Card statusRail="Verified">Content</Card>
        <Item title="Item" selected renderSelectionContext={context} />
        <Table
          caption="Rows"
          regionLabel="Rows table"
          rows={rows}
          columns={tableColumns}
          getRowId={(row) => row.id}
          responsiveLabels
        />
        <Timeline
          label="History"
          events={[
            { id: "a", title: "Saved", timestamp: new Date(0) },
            { id: "b", title: "Checked", timestamp: new Date(60_000) },
          ]}
          showDurations
          formatDuration={duration}
        />
        <Stat label="Checks" value={12} comparison={{ previous: 10, label: "prior run" }} />
      </>,
    );
    expect(html).toContain("avatar-presence");
    expect(html).toContain("Available");
    expect(html).toContain('role="img"');
    expect(html).toContain("card-status");
    expect(html).toContain("Selected for review");
    expect(html).toContain('data-responsive-labels="true"');
    expect(html).toContain("One minute later");
    expect(html).toContain("increase compared with prior run");
    expect(context).toHaveBeenCalledOnce();
    expect(duration).toHaveBeenCalledOnce();
  });

  it("keeps data-table controls, adapters, selection, and summaries independently off", () => {
    const read = vi.fn(() => ({ search: "First" }));
    const write = vi.fn();
    const summary = vi.fn(() => "Query summary");
    const basic = renderToStaticMarkup(
      <DataTable
        caption="Rows"
        rows={rows}
        columns={dataColumns}
        getRowId={(row) => row.id}
        searchable={false}
        selectable={false}
        paginated={false}
        queryAdapter={false}
        showQuerySummary={false}
        renderQuerySummary={summary}
      />,
    );
    expect(basic).not.toContain('type="search"');
    expect(basic).not.toContain('type="checkbox"');
    expect(basic).not.toContain("data-table__pagination");
    expect(basic).not.toContain("data-table-query-summary");
    expect(read).not.toHaveBeenCalled();
    expect(write).not.toHaveBeenCalled();
    expect(summary).not.toHaveBeenCalled();

    const enhanced = renderToStaticMarkup(
      <DataTable
        caption="Rows"
        rows={rows}
        columns={dataColumns}
        getRowId={(row) => row.id}
        searchable
        selectable
        paginated
        queryAdapter={{ read, write }}
        showQuerySummary
        renderQuerySummary={summary}
      />,
    );
    expect(enhanced).toContain('type="search"');
    expect(enhanced).toContain('type="checkbox"');
    expect(enhanced).toContain("Previous");
    expect(enhanced).toContain("data-table-query-summary");
    expect(read).toHaveBeenCalledOnce();
    expect(write).not.toHaveBeenCalled();
    expect(summary).toHaveBeenCalledOnce();
  });

  it("provides deterministic consumer-owned URL query helpers", () => {
    const query = {
      search: "open source",
      page: 3,
      pageSize: 25,
      sort: { columnId: "name", direction: "descending" as const },
    };
    const serialized = serializeDataTableQuery(query);
    expect(serialized).toBe("q=open+source&page=3&pageSize=25&sort=name&direction=descending");
    expect(parseDataTableQuery(serialized)).toEqual(query);
    expect(getStatChange(12, 10)).toMatchObject({ direction: "increase", ratio: 0.2 });
    expect(getStatChange(4, 0)).toEqual({ direction: "unavailable", ratio: null });
    expect(() =>
      renderToStaticMarkup(
        <DataTable
          caption="Rows"
          rows={rows}
          columns={[{ id: "name", header: "Name", cell: (row: Row) => row.name, sortable: true }]}
          getRowId={(row) => row.id}
        />,
      ),
    ).toThrow(/sortable column.*requires sortValue/u);
    const clamped = renderToStaticMarkup(
      <DataTable
        caption="Rows"
        rows={rows}
        columns={dataColumns}
        getRowId={(row) => row.id}
        paginated
        query={{ search: "", page: 99, pageSize: 1, sort: null }}
      />,
    );
    expect(clamped).toContain("Page 2 of 2");
    expect(clamped).toContain('data-page-clamped="true"');
  });

  it("removes composite live and interaction enhancements from basic SSR", () => {
    const points = [
      { id: "a", label: "A", value: 2 },
      { id: "b", label: "B", value: 5 },
    ];
    const entries = [{ date: "2024-01-01", value: 2 }];
    const basic = renderToStaticMarkup(
      <>
        <VirtualList
          items={rows}
          getItemId={(row) => row.id}
          renderItem={(row) => row.name}
          label="Rows"
          viewportHeight={100}
          showPositionSummary={false}
        />
        <Chart name="Chart" description="Values" points={points} interactive={false} />
        <Carousel label="Slides" autoplay={false} announceSlide={false}>
          <p>One</p>
          <p>Two</p>
        </Carousel>
        <CalendarHeatmap label="Activity" entries={entries} showSummary={false} />
        <ActivityFeed label="Feed" events={[]} showContinuationStatus={false} />
      </>,
    );
    expect(basic).not.toContain("virtual-list-position-summary");
    expect(basic).not.toContain("data-interactive");
    expect(basic).not.toContain("Pause rotation");
    expect(basic).not.toContain("carousel-announcement");
    expect(basic).not.toContain("calendar-heatmap-summary");
    expect(basic).not.toContain("activity-feed-continuation-status");
  });

  it("renders composite enhancements with native fallback semantics", () => {
    const points = [
      { id: "a", label: "A", value: 2 },
      { id: "b", label: "B", value: 5 },
    ];
    const entries = [{ date: "2024-01-01", value: 2 }];
    const html = renderToStaticMarkup(
      <>
        <VirtualList
          items={rows}
          getItemId={(row) => row.id}
          renderItem={(row) => row.name}
          label="Rows"
          viewportHeight={100}
          showPositionSummary
        />
        <Chart name="Chart" description="Values" points={points} interactive />
        <Carousel label="Slides" autoplay={{ interval: 5000 }} announceSlide>
          <p>One</p>
          <p>Two</p>
        </Carousel>
        <CalendarHeatmap label="Activity" entries={entries} showSummary />
        <ActivityFeed label="Feed" events={[]} hasMore showContinuationStatus />
      </>,
    );
    expect(html).toContain('aria-posinset="1"');
    expect(html).toContain("virtual-list-position-summary");
    expect(html).toContain('aria-pressed="false"');
    expect(html).toContain("View chart data");
    expect(html).toContain("Pause rotation");
    expect(html).toContain('aria-live="off"');
    expect(html).toContain("carousel-announcement");
    expect(html).toContain('role="gridcell"');
    expect(html).toContain('role="row"');
    expect(html).toContain("View values as a table");
    expect(html).toContain("calendar-heatmap-summary");
    expect(html).toContain("activity-feed-continuation-status");
    const error = renderToStaticMarkup(
      <ActivityFeed label="Feed" events={[]} emptyContent="No events" loadError="Could not load" />,
    );
    expect(error).toContain("Could not load");
    expect(error).not.toContain("No events");
  });

  it("owns exact canonical companion sets and validates the implementation profile", () => {
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
      expect(source).toMatchObject({ id, outputRole: "component" });
      expect(api.itemId).toBe(id);
      const apiExports = api.exports
        .map((entry: { readonly name: string }) => entry.name)
        .sort((left: string, right: string) => left.localeCompare(right, "en-US"));
      expect(apiExports).toEqual(runtimeExports);
      expect(apiExports).toContain(api.entryExport);
    }
    const profile = JSON.parse(
      readFileSync(
        resolve(workspaceRoot, "registry/quality/implementation-profiles/data-display.v1.json"),
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
    expect(profile.profiles).toHaveLength(ids.length);
    for (const item of profile.profiles) {
      expect(ids, item.id).toContain(item.id);
      expect(item.mergoraAdvantage.status, item.id).toBe("evidence-backed");
      expect(item.visualSignature.status, item.id).toBe("evidence-backed");
      expect(
        item.optionalEnhancements.every(
          (enhancement: { readonly status: string }) => enhancement.status === "evidence-backed",
        ),
        item.id,
      ).toBe(true);
      expect(item.storybook.basic.status, item.id).toBe("tested");
      expect(item.storybook.enhanced.status, item.id).toBe("tested");
      expect(item.accessibilityEvidence.status, item.id).toBe("partial");
      expect(item.interactionEvidence.status, item.id).toBe("verified");
      expect(item.maturityAssessment.status, item.id).toBe("not-ready");
      expect(
        item.blockers.map((blocker: { readonly code: string }) => blocker.code),
        item.id,
      ).toEqual(["manual-assistive-technology-records-missing"]);
    }
  });

  it("uses only declared semantic tokens and supplies forced-colors and reduced-motion evidence", () => {
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
      expect(references.length, id).toBeGreaterThan(5);
      expect(
        references.every((reference) => tokenCss.includes(`${reference}:`)),
        id,
      ).toBe(true);
      expect(css, id).toContain("@media (forced-colors: active)");
      expect(css, id).not.toMatch(
        /(?:gradient\(|backdrop-filter|border-radius:\s*(?:2[0-9]|[3-9][0-9])px)/u,
      );
    }
    for (const id of ["carousel", "item", "virtual-list"]) {
      expect(
        readFileSync(resolve(workspaceRoot, `registry/source/components/${id}/${id}.css`), "utf8"),
      ).toContain("@media (prefers-reduced-motion: reduce)");
    }
    expect(
      readFileSync(
        resolve(workspaceRoot, "registry/source/components/carousel/carousel.css"),
        "utf8",
      ).match(/@keyframes mrg-carousel-enter[\s\S]*?\n\s*\}/u)?.[0],
    ).not.toContain("opacity");
  });

  it("promotes data-table controls to the preferred target size for coarse pointers", () => {
    const css = readFileSync(
      resolve(workspaceRoot, "registry/source/components/data-table/data-table.css"),
      "utf8",
    );
    expect(css).toMatch(
      /@media \(pointer: coarse\) \{[\s\S]*?\.mrg-data-table button \{[\s\S]*?min-block-size:\s*var\(--mrg-semantic-size-target-preferred\)/u,
    );
  });
});
