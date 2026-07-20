import { describe, expect, it } from "vitest";

import { mergeFileThreeWay } from "../../packages/registry/src/semantic-sync.ts";
import { mergeStructuredSourceThreeWay } from "../../packages/registry/src/structured-source-merge.ts";

const encoder = new TextEncoder();
const decoder = new TextDecoder();

function bytes(value: string): Uint8Array {
  return encoder.encode(value);
}

describe("TypeScript and JavaScript structured-source Semantic Sync", () => {
  it("merges disjoint import, declaration, and JSX attribute edits", () => {
    const base = [
      'import { Button } from "./button";',
      'import { helper } from "./helper";',
      "",
      "// consumer-facing card",
      "export const Card = () => (",
      '  <Button size="sm" tone="neutral">',
      "    {helper()}",
      "  </Button>",
      ");",
      "",
      "export const count = 1;",
      "",
    ].join("\n");
    const local = base
      .replace("{ Button }", "{ Button, type ButtonProps }")
      .replace("// consumer-facing card", "// consumer-facing card (keep this wording)")
      .replace('size="sm"', 'size="lg"');
    const remote = base
      .replace('tone="neutral"', 'tone="accent"')
      .replace("count = 1", "count = 2");

    const result = mergeFileThreeWay({
      mediaType: "text/tsx",
      base: bytes(base),
      local: bytes(local),
      remote: bytes(remote),
    });

    expect(result.status).toBe("semantic-merge");
    const output = decoder.decode(result.proposed!);
    expect(output).toContain('import { Button, type ButtonProps } from "./button";');
    expect(output).toContain("// consumer-facing card (keep this wording)");
    expect(output).toContain('<Button size="lg" tone="accent">');
    expect(output).toContain("export const count = 2;");
    expect(result.appliedRemoteKeys).toContain("unit:variable:Card/jsx:Button#0/attr:tone");
    expect(result.preservedLocalKeys).toContain("unit:variable:Card/jsx:Button#0/attr:size");
  });

  it("preserves a BOM, CRLF layout, comments, and no-final-newline local bytes", () => {
    const bom = "\uFEFF";
    const base = `${bom}// exact local header\r\nexport const localValue = 1;\r\n\r\n// remote value\r\nexport const remoteValue = 1;`;
    const local = base.replace("localValue = 1", "localValue  =  2");
    const remote = base.replace("remoteValue = 1", "remoteValue = 2");
    const result = mergeFileThreeWay({
      mediaType: "application/typescript",
      base: bytes(base),
      local: bytes(local),
      remote: bytes(remote),
    });

    expect(result.status).toBe("semantic-merge");
    expect([...result.proposed!.slice(0, 3)]).toEqual([0xef, 0xbb, 0xbf]);
    expect(decoder.decode(result.proposed!)).toBe(
      "// exact local header\r\nexport const localValue  =  2;\r\n\r\n// remote value\r\nexport const remoteValue = 2;",
    );
    expect(decoder.decode(result.proposed!).endsWith("\n")).toBe(false);
  });

  it("dispatches JavaScript and keeps unrelated local declaration bytes", () => {
    const result = mergeFileThreeWay({
      mediaType: "application/javascript",
      base: bytes("export const local = 1;\nexport function remote() { return 1; }\n"),
      local: bytes("export const local   = 2;\nexport function remote() { return 1; }\n"),
      remote: bytes("export const local = 1;\nexport function remote() { return 2; }\n"),
    });
    expect(result.status).toBe("semantic-merge");
    expect(decoder.decode(result.proposed!)).toBe(
      "export const local   = 2;\nexport function remote() { return 2; }\n",
    );
  });

  it("merges a JSX attribute addition with a disjoint existing-attribute edit", () => {
    const result = mergeFileThreeWay({
      mediaType: "text/tsx",
      base: bytes('export const View = () => <Box size="sm" />;\n'),
      local: bytes('export const View = () => <Box size="lg" />;\n'),
      remote: bytes('export const View = () => <Box size="sm" tone="loud" />;\n'),
    });
    expect(result.status).toBe("semantic-merge");
    expect(decoder.decode(result.proposed!)).toBe(
      'export const View = () => <Box size="lg" tone="loud" />;\n',
    );
  });

  it("grafts a valid local keep region into changed upstream structure", () => {
    const base = [
      "export function policy() {",
      "  // mergora:keep-start project-policy",
      '  return "base";',
      "  // mergora:keep-end project-policy",
      "}",
      "",
    ].join("\n");
    const local = base.replace('return "base"', 'return "consumer"');
    const remote = base.replace(
      "export function policy() {",
      "export function policy() {\n  const enabled = true;",
    );
    const result = mergeFileThreeWay({
      mediaType: "text/typescript",
      base: bytes(base),
      local: bytes(local),
      remote: bytes(remote),
    });

    expect(result.status).toBe("semantic-merge");
    expect(decoder.decode(result.proposed!)).toContain("const enabled = true;");
    expect(decoder.decode(result.proposed!)).toContain('return "consumer";');
  });

  it("fails closed for a concurrent edit to one semantic unit", () => {
    const result = mergeFileThreeWay({
      mediaType: "text/typescript",
      base: bytes("export const value = 1;\n"),
      local: bytes("export const value = 2;\n"),
      remote: bytes("export const value = 3;\n"),
    });
    expect(result).toMatchObject({
      status: "conflict",
      proposed: null,
      conflicts: [
        expect.objectContaining({ id: "unit:variable:value", reason: "concurrent-edit" }),
      ],
    });
  });

  it("rejects recovered parses and ambiguous top-level unit keys", () => {
    const invalid = mergeStructuredSourceThreeWay(
      {
        base: "export const value = 1;\n",
        local: "export const value = ;\n",
        remote: "export const value = 2;\n",
      },
      { kind: "typescript" },
    );
    expect(invalid).toMatchObject({
      status: "conflict",
      conflicts: [expect.objectContaining({ reason: "parse-error" })],
    });

    const duplicateBase = 'import { a } from "pkg";\nimport { b } from "pkg";\n';
    const ambiguous = mergeStructuredSourceThreeWay(
      {
        base: duplicateBase,
        local: `${duplicateBase}export const local = true;\n`,
        remote: `${duplicateBase}export const remote = true;\n`,
      },
      { kind: "typescript" },
    );
    expect(ambiguous).toMatchObject({
      status: "conflict",
      conflicts: expect.arrayContaining([
        expect.objectContaining({ id: '$base:unit:import:"pkg"', reason: "parse-error" }),
      ]),
    });
  });

  it("enforces character and AST-depth budgets before proposing output", () => {
    const tooLarge = mergeStructuredSourceThreeWay(
      { base: "const a = 1;", local: "const a = 2;", remote: "const a = 3;" },
      { kind: "typescript", maxCharacters: 5 },
    );
    expect(tooLarge).toMatchObject({
      status: "conflict",
      conflicts: [expect.objectContaining({ reason: "input-limit" })],
    });

    const deep = mergeStructuredSourceThreeWay(
      {
        base: "export const value = one(two(three(1)));",
        local: "export const value = one(two(three(2)));",
        remote: "export const value = one(two(three(3)));",
      },
      { kind: "typescript", maxAstDepth: 3 },
    );
    expect(deep).toMatchObject({
      status: "conflict",
      conflicts: expect.arrayContaining([expect.objectContaining({ reason: "input-limit" })]),
    });
  });

  it("returns byte-for-byte deterministic proposals and conflicts", () => {
    const input = {
      mediaType: "text/tsx",
      base: bytes('export const View = () => <Box size="sm" tone="quiet" />;\n'),
      local: bytes('export const View = () => <Box size="lg" tone="quiet" />;\n'),
      remote: bytes('export const View = () => <Box size="sm" tone="loud" />;\n'),
    } as const;
    const results = Array.from({ length: 20 }, () => mergeFileThreeWay(input));
    expect(results.every(({ status }) => status === "semantic-merge")).toBe(true);
    expect(results.map(({ proposed }) => [...proposed!])).toEqual(
      Array.from({ length: 20 }, () => [...results[0]!.proposed!]),
    );
    expect(results.map(({ appliedRemoteKeys }) => appliedRemoteKeys)).toEqual(
      Array.from({ length: 20 }, () => results[0]!.appliedRemoteKeys),
    );
  });
});
