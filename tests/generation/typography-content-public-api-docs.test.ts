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
    id: "blockquote",
    publicExports: ["BlockquoteProps"],
    props: [
      "BlockquoteProps.attribution",
      "BlockquoteProps.children",
      "BlockquoteProps.citeUrl",
      "BlockquoteProps.sourceTitle",
    ],
  },
  {
    id: "code",
    publicExports: ["CodeProps"],
    props: ["CodeProps.isolateBidi", "CodeProps.wrap"],
  },
  {
    id: "code-block",
    publicExports: ["CodeBlockProps"],
    props: [
      "CodeBlockProps.code",
      "CodeBlockProps.copiedLabel",
      "CodeBlockProps.copyable",
      "CodeBlockProps.copyErrorLabel",
      "CodeBlockProps.copyLabel",
      "CodeBlockProps.filename",
      "CodeBlockProps.highlightedLines",
      "CodeBlockProps.label",
      "CodeBlockProps.language",
      "CodeBlockProps.onCopyComplete",
      "CodeBlockProps.renderLine",
      "CodeBlockProps.showLineNumbers",
      "CodeBlockProps.wrap",
    ],
  },
  {
    id: "description-list",
    publicExports: ["DescriptionDetailsProps", "DescriptionListProps", "DescriptionTermProps"],
    props: ["DescriptionListProps.density", "DescriptionListProps.layout"],
  },
  {
    id: "diff-viewer",
    publicExports: ["DiffViewerProps"],
    props: [
      "DiffViewerProps.activeLine",
      "DiffViewerProps.copiedLabel",
      "DiffViewerProps.copyable",
      "DiffViewerProps.copyErrorLabel",
      "DiffViewerProps.copyLabel",
      "DiffViewerProps.defaultActiveLine",
      "DiffViewerProps.label",
      "DiffViewerProps.lineNavigation",
      "DiffViewerProps.lines",
      "DiffViewerProps.mode",
      "DiffViewerProps.onActiveLineChange",
      "DiffViewerProps.showSummary",
      "DiffViewerProps.wrap",
    ],
  },
  { id: "heading", publicExports: ["HeadingProps"], props: [] },
  {
    id: "json-viewer",
    publicExports: ["JsonViewerProps"],
    props: [
      "JsonViewerProps.activePath",
      "JsonViewerProps.copiedPathLabel",
      "JsonViewerProps.copiedValueLabel",
      "JsonViewerProps.copyable",
      "JsonViewerProps.copyErrorLabel",
      "JsonViewerProps.copyPathLabel",
      "JsonViewerProps.copyValueLabel",
      "JsonViewerProps.defaultActivePath",
      "JsonViewerProps.defaultExpandedDepth",
      "JsonViewerProps.expandedPaths",
      "JsonViewerProps.label",
      "JsonViewerProps.onActivePathChange",
      "JsonViewerProps.onExpandedPathsChange",
      "JsonViewerProps.showActivePath",
      "JsonViewerProps.value",
    ],
  },
  {
    id: "kbd",
    publicExports: ["KbdChordProps", "KbdProps"],
    props: [
      "KbdChordProps.keys",
      "KbdChordProps.label",
      "KbdChordProps.platform",
      "KbdChordProps.separator",
      "KbdProps.spokenLabel",
    ],
  },
  {
    id: "prose",
    publicExports: ["ProseProps"],
    props: ["ProseProps.as", "ProseProps.children", "ProseProps.measure", "ProseProps.size"],
  },
  {
    id: "text",
    publicExports: ["TextProps"],
    props: [
      "TextProps.as",
      "TextProps.children",
      "TextProps.fullValue",
      "TextProps.size",
      "TextProps.tone",
      "TextProps.truncate",
      "TextProps.weight",
    ],
  },
] as const;

const supportingModels = {
  "diff-viewer": { DiffLine: 7 },
  heading: { HeadingBaseProps: 2, HeadingProps: 4 },
  "json-viewer": { JsonTreeNode: 9 },
  kbd: { KbdKey: 2 },
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

describe("typography and content public API descriptions", () => {
  it("describes a deterministic recursive inventory without review placeholders", () => {
    let props = 0;
    let describedProps = 0;

    for (const family of families) {
      const docs = docsFor(family);
      const propNames = docs.props.map((prop) => `${prop.owner}.${prop.name}`);
      expect(propNames, `${family.id} ordering`).toEqual(
        [...propNames].sort((left, right) => left.localeCompare(right, "en-US")),
      );
      expect(propNames, `${family.id} curated inventory`).toEqual(
        expect.arrayContaining([...family.props]),
      );
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
    expect(props).toBeGreaterThanOrEqual(65);
  });

  it("documents public/supporting models hidden by the Props-only extractor", () => {
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

  it("ties high-risk claims to implemented semantics and enhancement removal", () => {
    const descriptions = new Map(
      families.flatMap((family) =>
        docsFor(family).props.map(
          (prop) => [`${family.id}:${prop.owner}.${prop.name}`, prop.description] as const,
        ),
      ),
    );

    expect(descriptions.get("blockquote:BlockquoteProps.citeUrl")).toContain("blockquote cite");
    expect(descriptions.get("code:CodeProps.isolateBidi")).toContain("bidirectional");
    expect(descriptions.get("code-block:CodeBlockProps.copyable")).toContain("private live status");
    expect(descriptions.get("diff-viewer:DiffViewerProps.lineNavigation")).toContain("Home/End");
    expect(descriptions.get("json-viewer:JsonViewerProps.expandedPaths")).toContain("Controlled");
    expect(descriptions.get("kbd:KbdChordProps.separator")).toContain("Aria-hidden");
    expect(descriptions.get("text:TextProps.truncate")).toContain("accessible full value");
  });
});
