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
  { id: "dropzone", publicExports: ["DropzoneProps"], props: 14 },
  { id: "emoji-picker", publicExports: ["EmojiPickerProps"], props: 24 },
  { id: "file-upload", publicExports: ["FileUploadProps"], props: 30 },
  { id: "image", publicExports: ["ImageProps"], props: 13 },
  { id: "kanban", publicExports: ["KanbanProps"], props: 14 },
  { id: "message", publicExports: ["MessageProps"], props: 9 },
  { id: "reasoning", publicExports: ["ReasoningProps"], props: 9 },
  { id: "rich-text-editor", publicExports: ["RichTextEditorProps"], props: 17 },
  { id: "signature-pad", publicExports: ["SignaturePadProps"], props: 18 },
  { id: "streaming-text", publicExports: ["StreamingTextProps"], props: 6 },
  { id: "tool-call", publicExports: ["ToolCallProps"], props: 12 },
] as const;

const supportingModels = {
  dropzone: {
    DropzoneMessages: 5,
    FileSelectionResult: 4,
    RejectedFileSelection: 4,
  },
  "emoji-picker": { EmojiPickerItem: 6, EmojiPickerMessages: 10 },
  "file-upload": {
    FileUploadChangeDetail: 3,
    FileUploadItem: 7,
    FileUploadMessages: 8,
    FileUploadRejectedFile: 2,
    FileUploadSelectionResult: 3,
  },
  image: { ImageAlternative: 4 },
  kanban: {
    KanbanCard: 5,
    KanbanColumn: 4,
    KanbanMessages: 22,
    KanbanMove: 5,
    KanbanMovePermission: 2,
    KanbanServerAdapter: 2,
    KanbanVirtualization: 3,
    KanbanVirtualWindow: 2,
  },
  reasoning: { ReasoningProgress: 3 },
  "rich-text-editor": { RichTextEditorAdapter: 3, RichTextEditorSurfaceContext: 7 },
  "signature-pad": {
    DrawnSignatureValue: 2,
    SignaturePoint: 2,
    TypedSignatureValue: 2,
  },
  "streaming-text": { StreamingTextSegment: 2 },
  "tool-call": { ToolCallDetails: 4 },
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

describe("files, media, editing, and AI public API descriptions", () => {
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

    expect({ describedProps, props }).toEqual({ describedProps: 166, props: 166 });
  });

  it("documents the supporting public models hidden by the Props-only extractor", () => {
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
          const key = `${id}:${name}:${member.name.getText(sourceFile)}`;
          expect(descriptionFor(sourceFile, member)?.length, key).toBeGreaterThanOrEqual(28);
        }
      }
    }
  });

  it("ties optional enhancement claims to clean disabled behavior", () => {
    const descriptions = new Map(
      families.flatMap((family) =>
        docsFor(family).props.map(
          (prop) => [`${family.id}:${prop.owner}.${prop.name}`, prop.description] as const,
        ),
      ),
    );

    expect(descriptions.get("dropzone:DropzoneProps.validateFileSize")).toContain(
      "removes size checking",
    );
    expect(descriptions.get("emoji-picker:EmojiPickerProps.searchable")).toContain(
      "removes its UI",
    );
    expect(descriptions.get("file-upload:FileUploadProps.showProgress")).toContain(
      "removes progress UI",
    );
    expect(descriptions.get("image:ImageProps.showStatusRail")).toContain("announcements");
    expect(descriptions.get("kanban:KanbanProps.virtualization")).toContain("renders every card");
    expect(descriptions.get("reasoning:ReasoningProps.announceCompletion")).toContain(
      "removes the live region",
    );
    expect(
      descriptions.get("rich-text-editor:RichTextEditorProps.showSerializationPreview"),
    ).toContain("removes it completely");
    expect(descriptions.get("signature-pad:SignaturePadProps.enableFileAlternative")).toContain(
      "removes its control",
    );
    expect(descriptions.get("streaming-text:StreamingTextProps.announceUpdates")).toContain(
      "removes the live region",
    );
    expect(descriptions.get("tool-call:ToolCallProps.showDetails")).toContain(
      "removes the disclosure",
    );
  });
});
