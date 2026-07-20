import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import ts from "typescript";
import { describe, expect, it } from "vitest";

import {
  buildPublicApiDocs,
  type PublicApiDocs,
} from "../../tooling/registry-builder/src/public-api-docs.ts";

const workspaceRoot = resolve(import.meta.dirname, "../..");

const families = [
  {
    id: "avatar",
    publicExports: ["AvatarGroupProps", "AvatarProps"],
    props: [
      "AvatarGroupProps.children",
      "AvatarGroupProps.maximum",
      "AvatarGroupProps.overflowLabel",
      "AvatarProps.alt",
      "AvatarProps.fallback",
      "AvatarProps.imageProps",
      "AvatarProps.name",
      "AvatarProps.presence",
      "AvatarProps.presenceLabel",
      "AvatarProps.showPresence",
      "AvatarProps.src",
    ],
  },
  {
    id: "badge",
    publicExports: ["BadgeCategoryProps", "BadgeCountProps", "BadgeProps", "BadgeStatusProps"],
    props: [
      "BadgeCategoryProps.children",
      "BadgeCategoryProps.kind",
      "BadgeCategoryProps.variant",
      "BadgeCountProps.count",
      "BadgeCountProps.kind",
      "BadgeCountProps.label",
      "BadgeCountProps.maximum",
      "BadgeProps.children",
      "BadgeProps.count",
      "BadgeProps.kind",
      "BadgeProps.label",
      "BadgeProps.maximum",
      "BadgeProps.variant",
      "BadgeProps.variantLabel",
      "BadgeStatusProps.children",
      "BadgeStatusProps.kind",
      "BadgeStatusProps.variant",
      "BadgeStatusProps.variantLabel",
    ],
  },
  {
    id: "card",
    publicExports: ["CardDescriptionProps", "CardProps", "CardSectionProps", "CardTitleProps"],
    props: ["CardProps.as", "CardProps.statusRail"],
  },
  {
    id: "carousel",
    publicExports: ["CarouselProps"],
    props: [
      "CarouselProps.announceSlide",
      "CarouselProps.autoplay",
      "CarouselProps.children",
      "CarouselProps.defaultIndex",
      "CarouselProps.index",
      "CarouselProps.label",
      "CarouselProps.loop",
      "CarouselProps.onIndexChange",
      "CarouselProps.slideLabels",
    ],
  },
  {
    id: "data-table",
    publicExports: ["DataTableProps"],
    props: [
      "DataTableProps.caption",
      "DataTableProps.columns",
      "DataTableProps.defaultQuery",
      "DataTableProps.defaultSelectedRowIds",
      "DataTableProps.emptyContent",
      "DataTableProps.getRowId",
      "DataTableProps.loading",
      "DataTableProps.onQueryChange",
      "DataTableProps.onSelectedRowIdsChange",
      "DataTableProps.operationMode",
      "DataTableProps.pageSizes",
      "DataTableProps.paginated",
      "DataTableProps.query",
      "DataTableProps.queryAdapter",
      "DataTableProps.renderQuerySummary",
      "DataTableProps.rows",
      "DataTableProps.searchable",
      "DataTableProps.searchLabel",
      "DataTableProps.selectable",
      "DataTableProps.selectedRowIds",
      "DataTableProps.showQuerySummary",
      "DataTableProps.totalRows",
    ],
  },
  {
    id: "empty-state",
    publicExports: ["EmptyStateProps"],
    props: [
      "EmptyStateProps.children",
      "EmptyStateProps.context",
      "EmptyStateProps.description",
      "EmptyStateProps.headingLevel",
      "EmptyStateProps.icon",
      "EmptyStateProps.primaryAction",
      "EmptyStateProps.recoverySuggestions",
      "EmptyStateProps.secondaryAction",
      "EmptyStateProps.title",
    ],
  },
  {
    id: "hover-card",
    publicExports: ["HoverCardProps"],
    props: [
      "HoverCardProps.children",
      "HoverCardProps.closeDelay",
      "HoverCardProps.closeLabel",
      "HoverCardProps.defaultOpen",
      "HoverCardProps.description",
      "HoverCardProps.disabled",
      "HoverCardProps.onOpenChange",
      "HoverCardProps.open",
      "HoverCardProps.openDelay",
      "HoverCardProps.pinnedLabel",
      "HoverCardProps.pinOnPress",
      "HoverCardProps.title",
      "HoverCardProps.trigger",
      "HoverCardProps.triggerProps",
    ],
  },
  {
    id: "item",
    publicExports: ["ItemProps"],
    props: [
      "ItemProps.actions",
      "ItemProps.as",
      "ItemProps.current",
      "ItemProps.description",
      "ItemProps.media",
      "ItemProps.renderSelectionContext",
      "ItemProps.selected",
      "ItemProps.title",
    ],
  },
  {
    id: "listbox",
    publicExports: ["ListboxProps"],
    props: [
      "ListboxProps.aria-describedby",
      "ListboxProps.aria-errormessage",
      "ListboxProps.aria-invalid",
      "ListboxProps.asyncState",
      "ListboxProps.className",
      "ListboxProps.defaultValue",
      "ListboxProps.description",
      "ListboxProps.disabled",
      "ListboxProps.entries",
      "ListboxProps.errorMessage",
      "ListboxProps.form",
      "ListboxProps.formatSelectionSummary",
      "ListboxProps.id",
      "ListboxProps.invalid",
      "ListboxProps.label",
      "ListboxProps.messages",
      "ListboxProps.name",
      "ListboxProps.onValueChange",
      "ListboxProps.readOnly",
      "ListboxProps.required",
      "ListboxProps.rootClassName",
      "ListboxProps.selectionMode",
      "ListboxProps.style",
      "ListboxProps.value",
      "ListboxProps.virtualization",
    ],
  },
  {
    id: "menubar",
    publicExports: ["MenubarProps"],
    props: [
      "MenubarProps.confirmDestructiveActions",
      "MenubarProps.defaultOpenMenuId",
      "MenubarProps.direction",
      "MenubarProps.keyboardGuide",
      "MenubarProps.keyboardGuideText",
      "MenubarProps.label",
      "MenubarProps.menus",
      "MenubarProps.onOpenMenuChange",
      "MenubarProps.openMenuId",
      "MenubarProps.openMenuOnFocus",
      "MenubarProps.selectionSummary",
    ],
  },
  {
    id: "skeleton",
    publicExports: ["SkeletonProps"],
    props: [
      "SkeletonProps.animated",
      "SkeletonProps.aria-atomic",
      "SkeletonProps.aria-hidden",
      "SkeletonProps.aria-label",
      "SkeletonProps.aria-labelledby",
      "SkeletonProps.aria-live",
      "SkeletonProps.blockSize",
      "SkeletonProps.children",
      "SkeletonProps.inlineSize",
      "SkeletonProps.role",
      "SkeletonProps.shape",
    ],
  },
  {
    id: "table",
    publicExports: ["TableProps"],
    props: [
      "TableProps.caption",
      "TableProps.columns",
      "TableProps.emptyContent",
      "TableProps.getRowId",
      "TableProps.regionLabel",
      "TableProps.responsiveLabels",
      "TableProps.rows",
    ],
  },
  {
    id: "timeline",
    publicExports: ["TimelineProps"],
    props: [
      "TimelineProps.events",
      "TimelineProps.formatDate",
      "TimelineProps.formatDuration",
      "TimelineProps.label",
      "TimelineProps.locale",
      "TimelineProps.showDurations",
    ],
  },
  {
    id: "toggle",
    publicExports: ["ToggleProps"],
    props: [
      "ToggleProps.children",
      "ToggleProps.defaultPressed",
      "ToggleProps.onPressedChange",
      "ToggleProps.pending",
      "ToggleProps.pendingLabel",
      "ToggleProps.pressed",
    ],
  },
  {
    id: "toggle-group",
    publicExports: [
      "ToggleGroupItemProps",
      "ToggleGroupMultipleProps",
      "ToggleGroupProps",
      "ToggleGroupSingleProps",
    ],
    props: [
      "ToggleGroupItemProps.value",
      "ToggleGroupMultipleProps.allowEmpty",
      "ToggleGroupMultipleProps.children",
      "ToggleGroupMultipleProps.defaultValue",
      "ToggleGroupMultipleProps.direction",
      "ToggleGroupMultipleProps.disabled",
      "ToggleGroupMultipleProps.label",
      "ToggleGroupMultipleProps.onValueChange",
      "ToggleGroupMultipleProps.orientation",
      "ToggleGroupMultipleProps.renderSelectionSummary",
      "ToggleGroupMultipleProps.type",
      "ToggleGroupMultipleProps.value",
      "ToggleGroupProps.allowEmpty",
      "ToggleGroupProps.children",
      "ToggleGroupProps.defaultValue",
      "ToggleGroupProps.direction",
      "ToggleGroupProps.disabled",
      "ToggleGroupProps.label",
      "ToggleGroupProps.onValueChange",
      "ToggleGroupProps.orientation",
      "ToggleGroupProps.renderSelectionSummary",
      "ToggleGroupProps.type",
      "ToggleGroupProps.value",
      "ToggleGroupSingleProps.allowEmpty",
      "ToggleGroupSingleProps.children",
      "ToggleGroupSingleProps.defaultValue",
      "ToggleGroupSingleProps.direction",
      "ToggleGroupSingleProps.disabled",
      "ToggleGroupSingleProps.label",
      "ToggleGroupSingleProps.onValueChange",
      "ToggleGroupSingleProps.orientation",
      "ToggleGroupSingleProps.renderSelectionSummary",
      "ToggleGroupSingleProps.type",
      "ToggleGroupSingleProps.value",
    ],
  },
  {
    id: "virtual-list",
    publicExports: ["VirtualListProps"],
    props: [
      "VirtualListProps.activeId",
      "VirtualListProps.defaultActiveId",
      "VirtualListProps.estimatedItemSize",
      "VirtualListProps.getItemId",
      "VirtualListProps.getItemSize",
      "VirtualListProps.hasMore",
      "VirtualListProps.items",
      "VirtualListProps.label",
      "VirtualListProps.loading",
      "VirtualListProps.loadingContent",
      "VirtualListProps.onActiveIdChange",
      "VirtualListProps.onLoadMore",
      "VirtualListProps.overscan",
      "VirtualListProps.renderItem",
      "VirtualListProps.showPositionSummary",
      "VirtualListProps.viewportHeight",
    ],
  },
] as const;

const supportingModels = {
  badge: { BadgeBaseProps: 1 },
  carousel: { CarouselAutoplay: 1 },
  "data-table": {
    DataTableColumn: 7,
    DataTableQuery: 4,
    DataTableQueryAdapter: 2,
    DataTableSort: 2,
  },
  "empty-state": { EmptyStateRecoverySuggestions: 2 },
  "hover-card": { HoverCardOpenChangeDetails: 2 },
  listbox: {
    CollectionAsyncState: 5,
    CollectionItem: 7,
    CollectionLoadContext: 4,
    CollectionLoaderResult: 6,
    CollectionMessages: 5,
    CollectionPage: 2,
    CollectionSection: 5,
    CollectionSelectionSummaryContext: 4,
    CollectionVirtualizationOptions: 2,
    UseCollectionLoaderOptions: 5,
  },
  menubar: { MenubarMenu: 10 },
  skeleton: { SkeletonStyle: 2 },
  table: { TableColumn: 5 },
  timeline: { TimelineEvent: 5 },
  "toggle-group": { ToggleGroupBaseProps: 6, ToggleGroupContextValue: 5 },
} as const;

function sourceFor(id: string): { sourcePath: string; text: string } {
  const sourcePath = `registry/source/components/${id}/${id}.tsx`;
  return { sourcePath, text: readFileSync(resolve(workspaceRoot, sourcePath), "utf8") };
}

function docsFor(family: (typeof families)[number]): PublicApiDocs {
  const source = sourceFor(family.id);
  return buildPublicApiDocs(
    {
      id: family.id,
      normalizedFiles: [
        {
          content: source.text,
          mediaType: "text/typescript-jsx",
          sourcePath: source.sourcePath,
        },
      ],
      publicExports: family.publicExports,
    },
    "client-island",
  );
}

function propertySignatures(node: ts.Node): readonly ts.PropertySignature[] {
  if (ts.isInterfaceDeclaration(node) || ts.isTypeLiteralNode(node)) {
    return node.members.filter(ts.isPropertySignature);
  }
  if (ts.isTypeAliasDeclaration(node) || ts.isParenthesizedTypeNode(node)) {
    return propertySignatures(node.type);
  }
  if (ts.isIntersectionTypeNode(node) || ts.isUnionTypeNode(node)) {
    return node.types.flatMap((member) => propertySignatures(member));
  }
  return [];
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

describe("collections and data-display public API descriptions", () => {
  it("describes every extractor-visible prop without review placeholders", () => {
    let props = 0;
    let describedProps = 0;

    for (const family of families) {
      const docs = docsFor(family);
      expect(
        docs.props.map((prop) => `${prop.owner}.${prop.name}`),
        family.id,
      ).toEqual(family.props);
      expect(docs.summary.describedProps, family.id).toBe(docs.summary.props);
      for (const prop of docs.props) {
        const key = `${family.id}:${prop.owner}.${prop.name}`;
        expect(prop.description?.length, key).toBeGreaterThanOrEqual(28);
        expect(prop.localizationBehavior, key).not.toBe("review-required");
        expect(prop.semanticContract, key).not.toBe("review-required");
      }
      props += docs.summary.props;
      describedProps += docs.summary.describedProps;
    }

    expect({ describedProps, props }).toEqual({ describedProps: 209, props: 209 });
  });

  it("documents public and supporting models hidden by the Props-only extractor", () => {
    for (const [id, declarations] of Object.entries(supportingModels)) {
      const source = sourceFor(id);
      const sourceFile = ts.createSourceFile(
        source.sourcePath,
        source.text,
        ts.ScriptTarget.Latest,
        true,
        ts.ScriptKind.TSX,
      );
      for (const [name, expectedCount] of Object.entries(declarations)) {
        const declaration = sourceFile.statements.find(
          (statement) =>
            (ts.isInterfaceDeclaration(statement) || ts.isTypeAliasDeclaration(statement)) &&
            statement.name.text === name,
        );
        expect(declaration, `${id}:${name}`).toBeDefined();
        const members = propertySignatures(declaration!);
        expect(members, `${id}:${name}`).toHaveLength(expectedCount);
        for (const member of members) {
          const description = descriptionFor(sourceFile, member);
          expect(
            description?.length,
            `${id}:${name}:${member.name.getText(sourceFile)}`,
          ).toBeGreaterThanOrEqual(28);
        }
      }
    }
  });

  it("records independent enhancement removal and accessible state semantics", () => {
    const descriptions = new Map(
      families.flatMap((family) =>
        docsFor(family).props.map(
          (prop) => [`${family.id}:${prop.owner}.${prop.name}`, prop.description] as const,
        ),
      ),
    );

    expect(descriptions.get("avatar:AvatarProps.showPresence")).toContain("removes");
    expect(descriptions.get("carousel:CarouselProps.autoplay")).toContain("pause control");
    expect(descriptions.get("data-table:DataTableProps.queryAdapter")).toContain("all adapter");
    expect(descriptions.get("hover-card:HoverCardProps.pinOnPress")).toContain("announcement");
    expect(descriptions.get("listbox:ListboxProps.formatSelectionSummary")).toContain(
      "aria-describedby",
    );
    expect(descriptions.get("menubar:MenubarProps.keyboardGuide")).toContain("description id");
    expect(descriptions.get("table:TableProps.responsiveLabels")).toContain("data-label");
    expect(descriptions.get("timeline:TimelineProps.showDurations")).toContain("removes");
    expect(descriptions.get("virtual-list:VirtualListProps.showPositionSummary")).toContain(
      "removes",
    );
  });
});
