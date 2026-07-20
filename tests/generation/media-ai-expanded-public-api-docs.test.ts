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
  { id: "image-cropper", publicExports: ["ImageCropperProps"], props: 19, supporting: 5 },
  { id: "markdown", publicExports: ["MarkdownProps"], props: 8, supporting: 2 },
  {
    id: "markdown-editor",
    publicExports: ["MarkdownEditorProps"],
    props: 22,
    supporting: 2,
  },
  { id: "media-player", publicExports: ["MediaPlayerProps"], props: 15, supporting: 9 },
  { id: "audit-log", publicExports: ["AuditLogProps"], props: 7, supporting: 17 },
  { id: "chat-composer", publicExports: ["ChatComposerProps"], props: 21, supporting: 5 },
  { id: "citation", publicExports: ["CitationProps"], props: 6, supporting: 0 },
  {
    id: "collaboration-presence",
    publicExports: ["CollaborationPresenceProps"],
    props: 4,
    supporting: 8,
  },
  { id: "comment-thread", publicExports: ["CommentThreadProps"], props: 12, supporting: 8 },
  { id: "message-list", publicExports: ["MessageListProps"], props: 12, supporting: 3 },
  {
    id: "prompt-suggestions",
    publicExports: ["PromptSuggestionsProps"],
    props: 8,
    supporting: 5,
  },
] as const;

function sourceFor(id: string): { sourcePath: string; text: string; sourceFile: ts.SourceFile } {
  const sourcePath = `registry/source/components/${id}/${id}.tsx`;
  const text = readFileSync(resolve(workspaceRoot, sourcePath), "utf8");
  return {
    sourceFile: ts.createSourceFile(
      sourcePath,
      text,
      ts.ScriptTarget.Latest,
      true,
      ts.ScriptKind.TSX,
    ),
    sourcePath,
    text,
  };
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

function structuredProperties(
  sourceFile: ts.SourceFile,
  visibility: "exported" | "private",
): readonly ts.PropertySignature[] {
  const properties: ts.PropertySignature[] = [];
  const visit = (node: ts.Node): void => {
    if (ts.isPropertySignature(node)) properties.push(node);
    ts.forEachChild(node, visit);
  };
  for (const statement of sourceFile.statements) {
    if (!ts.isInterfaceDeclaration(statement) && !ts.isTypeAliasDeclaration(statement)) continue;
    if (statement.name.text.endsWith("Props")) continue;
    const exported =
      statement.modifiers?.some((modifier) => modifier.kind === ts.SyntaxKind.ExportKeyword) ??
      false;
    if ((visibility === "exported") === exported) visit(statement);
  }
  return properties;
}

describe("expanded media and AI public API descriptions", () => {
  it("describes the exact extractor-visible inventory without review placeholders", () => {
    let props = 0;
    let describedProps = 0;

    for (const family of families) {
      const docs = docsFor(family);
      expect(
        docs.groups.map((group) => group.name),
        family.id,
      ).toEqual(family.publicExports);
      expect(docs.summary.props, family.id).toBe(family.props);
      expect(docs.summary.describedProps, family.id).toBe(family.props);
      for (const prop of docs.props) {
        const key = `${family.id}:${prop.owner}.${prop.name}`;
        expect(prop.description?.length, key).toBeGreaterThanOrEqual(28);
        expect(prop.localizationBehavior, key).not.toBe("review-required");
        expect(prop.semanticContract, key).not.toBe("review-required");
      }
      props += docs.summary.props;
      describedProps += docs.summary.describedProps;
    }

    expect({ describedProps, props }).toEqual({ describedProps: 134, props: 134 });
  });

  it("documents every exported structured value, adapter, event, and message field", () => {
    let propertyCount = 0;
    for (const family of families) {
      const source = sourceFor(family.id);
      const properties = structuredProperties(source.sourceFile, "exported");
      expect(properties, family.id).toHaveLength(family.supporting);
      for (const property of properties) {
        const key = `${family.id}:${property.name.getText(source.sourceFile)}`;
        expect(descriptionFor(source.sourceFile, property)?.length, key).toBeGreaterThanOrEqual(28);
      }
      propertyCount += properties.length;
    }
    expect(propertyCount).toBe(64);
  });

  it("documents the private optimistic reply model that defines visible recovery state", () => {
    const source = sourceFor("comment-thread");
    const properties = structuredProperties(source.sourceFile, "private").filter((property) => {
      let node: ts.Node | undefined = property.parent;
      while (node !== undefined && !ts.isInterfaceDeclaration(node)) node = node.parent;
      return ts.isInterfaceDeclaration(node) && node.name.text === "OptimisticReply";
    });
    expect(properties).toHaveLength(3);
    for (const property of properties) {
      expect(descriptionFor(source.sourceFile, property)?.length).toBeGreaterThanOrEqual(28);
    }
  });

  it("ties clean opt-outs and ownership boundaries to implemented behavior", () => {
    const descriptions = new Map(
      families.flatMap((family) =>
        docsFor(family).props.map(
          (prop) => [`${family.id}:${prop.owner}.${prop.name}`, prop.description] as const,
        ),
      ),
    );

    expect(descriptions.get("image-cropper:ImageCropperProps.showNumericControls")).toContain(
      "removes their UI",
    );
    expect(descriptions.get("markdown:MarkdownProps.announceStreamingUpdates")).toContain(
      "removes the live region",
    );
    expect(descriptions.get("markdown-editor:MarkdownEditorProps.uploadAdapter")).toContain(
      "performs no upload or network work",
    );
    expect(descriptions.get("media-player:MediaPlayerProps.showTranscript")).toContain(
      "removes both semantics",
    );
    expect(descriptions.get("audit-log:AuditLogProps.exportCsv")).toContain(
      "removes export generation and events",
    );
    expect(descriptions.get("chat-composer:ChatComposerProps.readOnly")).toContain(
      "retaining readable values",
    );
    expect(descriptions.get("citation:CitationProps.showSourceDetail")).toContain(
      "removes the detail semantics",
    );
    expect(
      descriptions.get("collaboration-presence:CollaborationPresenceProps.stalePolicy"),
    ).toContain("without clock work");
    expect(descriptions.get("comment-thread:CommentThreadProps.onReply")).toContain(
      "consumer-owned network/storage",
    );
    expect(descriptions.get("message-list:MessageListProps.followOutput")).toContain(
      "fully user-controlled",
    );
    expect(descriptions.get("prompt-suggestions:PromptSuggestionsProps.selectionMode")).toContain(
      "removes selection accessibility output",
    );
  });
});
