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
    id: "filter-builder",
    publicExports: [
      "FilterBuilderChangeReason",
      "FilterBuilderField",
      "FilterBuilderFilter",
      "FilterBuilderMessages",
      "FilterBuilderOperator",
      "FilterBuilderProps",
      "FilterBuilderSavedFilter",
      "FilterBuilderUrlAdapter",
    ],
  },
  {
    id: "query-builder",
    publicExports: [
      "QueryBuilderChangeReason",
      "QueryBuilderCondition",
      "QueryBuilderField",
      "QueryBuilderGroup",
      "QueryBuilderMessages",
      "QueryBuilderNode",
      "QueryBuilderOperator",
      "QueryBuilderProps",
      "QueryBuilderValueEditorProps",
    ],
  },
  {
    id: "sortable-list",
    publicExports: [
      "SortableListChangeReason",
      "SortableListMessages",
      "SortableListMoveDetail",
      "SortableListProps",
      "SortableListVirtualWindow",
    ],
  },
  {
    id: "tree-grid",
    publicExports: [
      "TreeGridChangeReason",
      "TreeGridColumn",
      "TreeGridFlatRow",
      "TreeGridMessages",
      "TreeGridProps",
      "TreeGridRow",
      "TreeGridSelectionMode",
      "TreeGridVirtualWindow",
    ],
  },
] as const;

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

describe("advanced data public API descriptions", () => {
  it("describes every extractor-visible property without review placeholders", () => {
    let props = 0;
    let describedProps = 0;

    for (const family of families) {
      const docs = docsFor(family);
      expect(
        docs.props
          .filter((prop) => prop.description === null)
          .map((prop) => `${prop.owner}.${prop.name}`),
        family.id,
      ).toEqual([]);
      for (const prop of docs.props) {
        const key = `${family.id}:${prop.owner}.${prop.name}`;
        expect(prop.description?.length, key).toBeGreaterThanOrEqual(28);
        expect(prop.localizationBehavior, key).not.toBe("review-required");
        expect(prop.semanticContract, key).not.toBe("review-required");
      }
      expect(docs.summary.describedProps, family.id).toBe(docs.summary.props);
      props += docs.summary.props;
      describedProps += docs.summary.describedProps;
    }

    expect(describedProps).toBe(props);
    expect(props).toBeGreaterThanOrEqual(70);
  });

  it("documents every member of exported structured models and message contracts", () => {
    for (const family of families) {
      const source = sourceFor(family.id);
      const sourceFile = ts.createSourceFile(
        source.sourcePath,
        source.text,
        ts.ScriptTarget.Latest,
        true,
        ts.ScriptKind.TSX,
      );
      const exportedInterfaces = sourceFile.statements.filter(
        (statement): statement is ts.InterfaceDeclaration =>
          ts.isInterfaceDeclaration(statement) &&
          statement.modifiers?.some((modifier) => modifier.kind === ts.SyntaxKind.ExportKeyword) ===
            true,
      );
      expect(exportedInterfaces.length, family.id).toBeGreaterThan(0);
      for (const declaration of exportedInterfaces) {
        for (const member of declaration.members.filter(ts.isPropertySignature)) {
          expect(
            descriptionFor(sourceFile, member)?.length,
            `${family.id}:${declaration.name.text}:${member.name.getText(sourceFile)}`,
          ).toBeGreaterThanOrEqual(28);
        }
      }
    }
  });

  it("makes optional enhancements independently removable", () => {
    const descriptions = new Map(
      families.flatMap((family) =>
        docsFor(family).props.map(
          (prop) => [`${family.id}:${prop.owner}.${prop.name}`, prop.description] as const,
        ),
      ),
    );

    expect(descriptions.get("filter-builder:FilterBuilderProps.urlAdapter")).toContain(
      "removes all adapter reads and writes",
    );
    expect(descriptions.get("query-builder:QueryBuilderProps.showSummary")).toContain(
      "removes its UI and semantics",
    );
    expect(descriptions.get("sortable-list:SortableListProps.undoable")).toContain(
      "removes undo UI and state",
    );
    expect(descriptions.get("tree-grid:TreeGridProps.virtualWindow")).toContain(
      "renders every visible",
    );
  });
});
