import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import ts from "typescript";
import { describe, expect, it } from "vitest";

import { buildPublicApiDocs } from "../../tooling/registry-builder/src/public-api-docs.ts";

const workspaceRoot = resolve(import.meta.dirname, "../..");
const families = [
  {
    id: "activity-feed",
    publicExports: ["ActivityFeed", "ActivityFeedEvent", "ActivityFeedProps"],
    sourcePath: "registry/source/components/activity-feed/activity-feed.tsx",
  },
  {
    id: "calendar-heatmap",
    publicExports: ["CalendarHeatmap", "CalendarHeatmapEntry", "CalendarHeatmapProps"],
    sourcePath: "registry/source/components/calendar-heatmap/calendar-heatmap.tsx",
  },
  {
    id: "chart",
    publicExports: ["Chart", "ChartPoint", "ChartProps"],
    sourcePath: "registry/source/components/chart/chart.tsx",
  },
  {
    id: "data-grid",
    publicExports: [
      "DataGrid",
      "DataGridColumn",
      "DataGridColumnAlignment",
      "DataGridColumnVisibility",
      "DataGridColumnVisibilityChangeDetail",
      "DataGridColumnVisibilityOptions",
      "DataGridCsvColumn",
      "DataGridCsvDelimiter",
      "DataGridCsvFormulaProtection",
      "DataGridCsvNewline",
      "DataGridCsvOptions",
      "DataGridCsvValue",
      "DataGridCursorPaginationOptions",
      "DataGridCursorPaginationState",
      "DataGridFilteringOptions",
      "DataGridMessages",
      "DataGridOperationMode",
      "DataGridOperationReason",
      "DataGridOperationStatus",
      "DataGridPagePaginationOptions",
      "DataGridPagePaginationState",
      "DataGridPaginationOptions",
      "DataGridPaginationState",
      "DataGridProps",
      "DataGridQuery",
      "DataGridQueryAdapter",
      "DataGridQueryChangeDetail",
      "DataGridQuerySummaryContext",
      "DataGridSelectionChangeDetail",
      "DataGridSelectionMode",
      "DataGridSelectionProps",
      "DataGridSortDirection",
      "DataGridSorting",
      "DataGridSortingChangeDetail",
      "DataGridSortingProps",
      "createDataGridCsv",
      "normalizeDataGridQuery",
      "parseDataGridQuery",
      "serializeDataGridQuery",
    ],
    sourcePaths: [
      "registry/source/systems/data-grid/data-grid.tsx",
      "registry/source/systems/data-grid/data-grid-csv.ts",
    ],
  },
  {
    id: "stat",
    publicExports: ["Stat", "StatComparison", "StatProps", "getStatChange"],
    sourcePath: "registry/source/components/stat/stat.tsx",
  },
] as const;

function sourcesFor(
  family: (typeof families)[number],
): readonly { sourcePath: string; text: string }[] {
  const sourcePaths = "sourcePaths" in family ? family.sourcePaths : [family.sourcePath];
  return sourcePaths.map((sourcePath) => ({
    sourcePath,
    text: readFileSync(resolve(workspaceRoot, sourcePath), "utf8"),
  }));
}

function docsFor(family: (typeof families)[number]) {
  return buildPublicApiDocs(
    {
      id: family.id,
      normalizedFiles: sourcesFor(family).map((source) => ({
        content: source.text,
        mediaType: "text/typescript-jsx",
        sourcePath: source.sourcePath,
      })),
      publicExports: family.publicExports,
    },
    "client-island",
  );
}

function descriptionFor(sourceFile: ts.SourceFile, node: ts.Node): string | null {
  const comments = ts.getLeadingCommentRanges(sourceFile.text, node.getFullStart()) ?? [];
  const comment = [...comments]
    .reverse()
    .find(
      (candidate) =>
        candidate.kind === ts.SyntaxKind.MultiLineCommentTrivia &&
        sourceFile.text.slice(candidate.pos, candidate.pos + 3) === "/**",
    );
  if (comment === undefined) return null;
  return sourceFile.text
    .slice(comment.pos + 3, comment.end - 2)
    .split(/\r?\n/gu)
    .map((line) => line.replace(/^\s*\*?\s?/u, ""))
    .join(" ")
    .replace(/\s+/gu, " ")
    .trim();
}

describe("expanded data-display public API descriptions", () => {
  it("describes every recursive row without review placeholders", () => {
    let props = 0;
    for (const family of families) {
      const docs = docsFor(family);
      expect(
        docs.props
          .filter((prop) => prop.description === null)
          .map((prop) => `${prop.owner}.${prop.name}`),
        family.id,
      ).toEqual([]);
      expect(docs.summary.describedProps, family.id).toBe(docs.summary.props);
      for (const prop of docs.props) {
        const key = `${family.id}:${prop.owner}.${prop.name}`;
        expect(prop.description?.length, key).toBeGreaterThanOrEqual(28);
        expect(prop.localizationBehavior, key).not.toBe("review-required");
        expect(prop.semanticContract, key).not.toBe("review-required");
      }
      props += docs.summary.props;
    }
    expect(props).toBeGreaterThanOrEqual(75);
  });

  it("documents every exported event, entry, point, and comparison model", () => {
    for (const family of families) {
      for (const source of sourcesFor(family)) {
        const sourceFile = ts.createSourceFile(
          source.sourcePath,
          source.text,
          ts.ScriptTarget.Latest,
          true,
          ts.ScriptKind.TSX,
        );
        for (const declaration of sourceFile.statements.filter(
          (statement): statement is ts.InterfaceDeclaration =>
            ts.isInterfaceDeclaration(statement) &&
            statement.modifiers?.some(
              (modifier) => modifier.kind === ts.SyntaxKind.ExportKeyword,
            ) === true,
        )) {
          for (const member of declaration.members.filter(ts.isPropertySignature)) {
            expect(
              descriptionFor(sourceFile, member)?.length,
              `${family.id}:${declaration.name.text}:${member.name.getText(sourceFile)}`,
            ).toBeGreaterThanOrEqual(28);
          }
        }
      }
    }
  });

  it("keeps summaries, interaction, and comparisons independently removable", () => {
    const descriptions = new Map(
      families.flatMap((family) =>
        docsFor(family).props.map(
          (prop) => [`${family.id}:${prop.owner}.${prop.name}`, prop.description] as const,
        ),
      ),
    );
    expect(descriptions.get("activity-feed:ActivityFeedProps.showContinuationStatus")).toContain(
      "removes its live output",
    );
    expect(descriptions.get("calendar-heatmap:CalendarHeatmapProps.showSummary")).toContain(
      "removes its output and computation",
    );
    expect(descriptions.get("chart:ChartProps.interactive")).toContain("removes their UI");
    expect(descriptions.get("stat:StatProps.comparison")).toContain("removes comparison UI");
    expect(descriptions.get("data-grid:DataGridProps.filtering")).toContain(
      "removes its UI, processing, events, and accessibility output",
    );
    expect(descriptions.get("data-grid:DataGridProps.pagination")).toContain(
      "removes the complete navigation region",
    );
    expect(descriptions.get("data-grid:DataGridProps.queryAdapter")).toContain(
      "removes all adapter I/O",
    );
    expect(descriptions.get("data-grid:DataGridProps.operationStatus")).toContain(
      "false removes the rail",
    );
    expect(descriptions.get("data-grid:DataGridProps.renderQuerySummary")).toContain(
      "false removes its UI and live-region output",
    );
    expect(descriptions.get("data-grid:DataGridProps.selectionMode")).toContain(
      "none removes radio controls, summaries, and selection callbacks",
    );
  });
});
