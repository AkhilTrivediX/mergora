import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import ts from "typescript";
import { describe, expect, it } from "vitest";

import {
  buildPublicApiDocs,
  type PublicApiDocs,
  type PublicApiRuntimeBoundary,
} from "../../tooling/registry-builder/src/public-api-docs.ts";

const workspaceRoot = resolve(import.meta.dirname, "../..");

const families = [
  {
    id: "aspect-ratio",
    publicExports: ["AspectRatioFit", "AspectRatioPreset", "AspectRatioProps", "AspectRatioValue"],
    runtimeBoundary: "server-compatible",
  },
  {
    id: "center",
    publicExports: ["CenterAxis", "CenterMaximum", "CenterProps"],
    runtimeBoundary: "server-compatible",
  },
  {
    id: "cluster",
    publicExports: [
      "ClusterAlign",
      "ClusterGap",
      "ClusterJustify",
      "ClusterOrphan",
      "ClusterProps",
    ],
    runtimeBoundary: "server-compatible",
  },
  {
    id: "container",
    publicExports: ["ContainerGutter", "ContainerProps", "ContainerWidth"],
    runtimeBoundary: "server-compatible",
  },
  {
    id: "grid",
    publicExports: [
      "GridAlign",
      "GridColumns",
      "GridElement",
      "GridGap",
      "GridListStyle",
      "GridMinimum",
      "GridProps",
    ],
    runtimeBoundary: "server-compatible",
  },
  {
    id: "inline",
    publicExports: ["InlineAlign", "InlineGap", "InlineJustify", "InlineProps"],
    runtimeBoundary: "server-compatible",
  },
  {
    id: "resizable",
    publicExports: [
      "ResizableChangeDetails",
      "ResizableChangeReason",
      "ResizableHandleProps",
      "ResizableMessages",
      "ResizableOrientation",
      "ResizablePrimaryProps",
      "ResizableRootProps",
      "ResizableSecondaryProps",
    ],
    runtimeBoundary: "client-island",
  },
  {
    id: "scroll-area",
    publicExports: [
      "ScrollAreaOrientation",
      "ScrollAreaPadding",
      "ScrollAreaProps",
      "ScrollAreaSize",
    ],
    runtimeBoundary: "server-compatible",
  },
  {
    id: "separator",
    publicExports: ["SeparatorOrientation", "SeparatorProps", "SeparatorSpacing"],
    runtimeBoundary: "server-compatible",
  },
  {
    id: "split-pane",
    publicExports: [
      "SplitPaneChangeDetails",
      "SplitPaneChangeReason",
      "SplitPaneHandleProps",
      "SplitPaneMessages",
      "SplitPaneOrientation",
      "SplitPanePanelProps",
      "SplitPanePersistence",
      "SplitPanePersistenceAdapter",
      "SplitPaneRootProps",
      "SplitPaneStackAt",
    ],
    runtimeBoundary: "client-island",
  },
  {
    id: "stack",
    publicExports: ["StackAlign", "StackElement", "StackGap", "StackListStyle", "StackProps"],
    runtimeBoundary: "server-compatible",
  },
  {
    id: "sticky-region",
    publicExports: [
      "StickyRegionBodyProps",
      "StickyRegionContentProps",
      "StickyRegionElement",
      "StickyRegionOffset",
      "StickyRegionPosition",
      "StickyRegionRootProps",
      "StickyRegionSize",
    ],
    runtimeBoundary: "client-island",
  },
] as const satisfies readonly {
  readonly id: string;
  readonly publicExports: readonly string[];
  readonly runtimeBoundary: PublicApiRuntimeBoundary;
}[];

const supportingDeclarations = {
  resizable: [
    "ResizableChangeDetails",
    "ResizableHandleName",
    "ResizableMessages",
    "ResizableRootProps",
  ],
  "scroll-area": ["AccessibleName", "ScrollAreaBaseProps", "ScrollAreaProps"],
  "split-pane": [
    "SplitPaneChangeDetails",
    "SplitPaneHandleBaseProps",
    "SplitPaneHandleName",
    "SplitPaneMessages",
    "SplitPanePanelProps",
    "SplitPanePersistence",
    "SplitPanePersistenceAdapter",
    "SplitPaneRootProps",
  ],
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
    family.runtimeBoundary,
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

describe("layout and structure public API descriptions", () => {
  it("describes every extractor-visible public property without review placeholders", () => {
    let props = 0;
    let describedProps = 0;

    for (const family of families) {
      const docs = docsFor(family);
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

    expect(describedProps).toBe(props);
    expect(props).toBeGreaterThanOrEqual(77);
  });

  it("documents local bases, unions, and public models that older extractors could hide", () => {
    for (const [id, declarations] of Object.entries(supportingDeclarations)) {
      const source = sourceFor(id);
      const sourceFile = ts.createSourceFile(
        source.sourcePath,
        source.text,
        ts.ScriptTarget.Latest,
        true,
        ts.ScriptKind.TSX,
      );
      for (const name of declarations) {
        const declaration = sourceFile.statements.find(
          (statement) =>
            (ts.isInterfaceDeclaration(statement) || ts.isTypeAliasDeclaration(statement)) &&
            statement.name.text === name,
        );
        expect(declaration, `${id}:${name}`).toBeDefined();
        const members = propertySignatures(declaration!);
        for (const member of members) {
          expect(
            descriptionFor(sourceFile, member)?.length,
            `${id}:${name}:${member.name.getText(sourceFile)}`,
          ).toBeGreaterThanOrEqual(28);
        }
      }
    }
  });

  it("ties optional enhancements to explicit APIs and clean removal behavior", () => {
    const descriptions = new Map(
      families.flatMap((family) =>
        docsFor(family).props.map(
          (prop) => [`${family.id}:${prop.owner}.${prop.name}`, prop.description] as const,
        ),
      ),
    );

    expect(descriptions.get("grid:GridProps.equalRows")).toContain("false keeps");
    expect(descriptions.get("resizable:ResizableRootProps.showStepControls")).toContain("buttons");
    expect(descriptions.get("split-pane:SplitPaneRootProps.persistence")).toContain("omit it");
    expect(descriptions.get("sticky-region:StickyRegionRootProps.manageFocusOffset")).toContain(
      "Measures sticky content",
    );
  });
});
