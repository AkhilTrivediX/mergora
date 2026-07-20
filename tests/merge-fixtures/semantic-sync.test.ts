import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { createConflictBundle } from "../../packages/registry/src/conflict-bundle.ts";
import { mergeCssDeclarationsThreeWay } from "../../packages/registry/src/css-merge.ts";
import { classifyBlr } from "../../packages/registry/src/file-classifier.ts";
import { mergeJsonThreeWay } from "../../packages/registry/src/json-merge.ts";
import { mergeKeepRegionsThreeWay } from "../../packages/registry/src/keep-region-merge.ts";
import { semanticConflict } from "../../packages/registry/src/merge-model.ts";
import { planExplicitMove } from "../../packages/registry/src/move-policy.ts";
import { mergeFileThreeWay } from "../../packages/registry/src/semantic-sync.ts";
import { mergePlainTextThreeWay } from "../../packages/registry/src/text-merge.ts";

const fixtures = dirname(fileURLToPath(import.meta.url));
const encoder = new TextEncoder();
const decoder = new TextDecoder();

function fixture(directory: string, name: string): string {
  return readFileSync(resolve(fixtures, directory, name), "utf8");
}

function bytes(value: string): Uint8Array {
  return encoder.encode(value);
}

describe("Semantic Sync B/L/R classifier", () => {
  const b = bytes("base");
  const l = bytes("local");
  const r = bytes("remote");

  it.each([
    [null, null, r, false, "add"],
    [b, b, r, false, "fast-forward"],
    [b, l, b, false, "keep-local"],
    [b, r, r, false, "no-op"],
    [null, r, r, false, "adopt"],
    [b, null, b, false, "local-delete"],
    [b, b, null, false, "delete"],
    [b, b, r, true, "binary-replace"],
  ] as const)(
    "classifies a raw-byte truth-table row as %s",
    (base, local, remote, binary, status) => {
      const result = classifyBlr({ base, local, remote, binary });
      expect(result.kind).toBe("resolved");
      if (result.kind === "resolved") expect(result.result.status).toBe(status);
    },
  );

  it.each([
    [null, l, r, false, "add-add"],
    [b, null, r, false, "delete-modify"],
    [b, l, null, false, "modify-delete"],
    [b, l, r, true, "binary-concurrent-change"],
  ] as const)("fails closed for %s", (base, local, remote, binary, reason) => {
    const result = classifyBlr({ base, local, remote, binary });
    expect(result.kind).toBe("conflict");
    if (result.kind === "conflict") expect(result.conflict.reason).toBe(reason);
  });

  it("records a tombstone only for an unchanged upstream file deleted locally", () => {
    const result = classifyBlr({ base: b, local: null, remote: new Uint8Array(b), binary: false });
    expect(result.kind).toBe("resolved");
    if (result.kind === "resolved") expect(result.result.tombstone).toBe(true);
  });
});

describe("JSON and JSONC semantic adapter", () => {
  it("matches the reviewed Data Grid golden while preserving local comments and formatting", () => {
    const result = mergeJsonThreeWay(
      {
        base: fixture("data-grid-jsonc", "base.jsonc"),
        local: fixture("data-grid-jsonc", "local.jsonc"),
        remote: fixture("data-grid-jsonc", "remote.jsonc"),
      },
      { format: "jsonc" },
    );

    expect(result.status).toBe("semantic-merge");
    expect(result.content).toBe(fixture("data-grid-jsonc", "expected.jsonc"));
    expect(result.appliedRemotePointers).toEqual(["/dataGrid/pageSize", "/dataGrid/selectionMode"]);
    expect(result.preservedLocalPointers).toEqual(["/dataGrid/density"]);
  });

  it("preserves formatting-only local JSONC bytes around an upstream value edit", () => {
    const base = '{\n  // note\n  "a": 1,\n  "b": 1\n}\n';
    const local = '{\r\n  // note\r\n  "a" : 1,\r\n\r\n  "b" : 1\r\n}\r\n';
    const remote = '{\n  // note\n  "a": 1,\n  "b": 2\n}\n';
    const result = mergeJsonThreeWay({ base, local, remote }, { format: "jsonc" });
    expect(result.status).toBe("semantic-merge");
    expect(result.content).toBe('{\r\n  // note\r\n  "a" : 1,\r\n\r\n  "b" : 2\r\n}\r\n');
  });

  it("merges disjoint property deletions and additions into parseable strict JSON", () => {
    const result = mergeJsonThreeWay(
      {
        base: '{"a":1,"b":2,"c":3}',
        local: '{"a":10,"b":2,"c":3}',
        remote: '{"a":1,"c":3,"d":4}',
      },
      { format: "json" },
    );
    expect(result.status).toBe("semantic-merge");
    expect(JSON.parse(result.content!)).toEqual({ c: 3, d: 4, a: 10 });
  });

  it("coalesces adjacent remote deletions without dropping a disjoint local value", () => {
    const result = mergeJsonThreeWay(
      {
        base: '{"a":1,"b":2,"c":3,"e":5}',
        local: '{"a":10,"b":2,"c":3,"e":5}',
        remote: '{"a":1,"e":5}',
      },
      { format: "json" },
    );
    expect(result.status).toBe("semantic-merge");
    expect(JSON.parse(result.content!)).toEqual({ a: 10, e: 5 });
  });

  it("handles a deleted trailing run and replacement of every key in a nested object", () => {
    const trailing = mergeJsonThreeWay(
      {
        base: '{"a":1,"b":2,"c":3}',
        local: '{"a":10,"b":2,"c":3}',
        remote: '{"a":1}',
      },
      { format: "json" },
    );
    expect(trailing.status).toBe("semantic-merge");
    expect(JSON.parse(trailing.content!)).toEqual({ a: 10 });

    const replacement = mergeJsonThreeWay(
      {
        base: '{"object":{"a":1},"local":1}',
        local: '{"object":{"a":1},"local":2}',
        remote: '{"object":{"d":4},"local":1}',
      },
      { format: "json" },
    );
    expect(replacement.status).toBe("semantic-merge");
    expect(JSON.parse(replacement.content!)).toEqual({ object: { d: 4 }, local: 2 });
  });

  it("treats ordered arrays and changed JSONC comments as atomic conflicts", () => {
    const arrayConflict = mergeJsonThreeWay(
      {
        base: '{"steps":["a","b"]}',
        local: '{"steps":["a","local"]}',
        remote: '{"steps":["a","remote"]}',
      },
      { format: "json" },
    );
    expect(arrayConflict).toMatchObject({ status: "conflict", content: null });
    expect(arrayConflict.conflicts[0]?.id).toBe("/steps");

    const commentConflict = mergeJsonThreeWay(
      {
        base: '{\n  // base\n  "a": 1,\n  "b": 1\n}\n',
        local: '{\n  // local\n  "a": 2,\n  "b": 1\n}\n',
        remote: '{\n  // upstream\n  "a": 1,\n  "b": 2\n}\n',
      },
      { format: "jsonc" },
    );
    expect(commentConflict.conflicts).toEqual([
      expect.objectContaining({ id: "$comments", reason: "comment-change" }),
    ]);
  });

  it("rejects duplicate keys and bounded parser inputs before proposing bytes", () => {
    expect(
      mergeJsonThreeWay(
        { base: '{"a":1}', local: '{"a":1,"a":2}', remote: '{"a":2}' },
        { format: "json" },
      ),
    ).toMatchObject({
      status: "conflict",
      content: null,
      conflicts: [expect.objectContaining({ reason: "duplicate-key" })],
    });
    expect(
      mergeJsonThreeWay(
        { base: '{"a":1}', local: '{"a":2}', remote: '{"a":3}' },
        { format: "json", maxCharacters: 3 },
      ),
    ).toMatchObject({
      status: "conflict",
      content: null,
      conflicts: expect.arrayContaining([expect.objectContaining({ reason: "input-limit" })]),
    });
  });

  it("satisfies disjoint-edit and overlapping-edit properties across deterministic generated maps", () => {
    for (let seed = 0; seed < 64; seed += 1) {
      const first = seed % 7;
      const second = (first + 1 + (seed % 5)) % 7;
      const base = Object.fromEntries(
        Array.from({ length: 7 }, (_, index) => [`k${String(index)}`, index]),
      );
      const local = { ...base, [`k${String(first)}`]: 1000 + seed };
      const remote = { ...base, [`k${String(second)}`]: 2000 + seed };
      const merged = mergeJsonThreeWay(
        {
          base: JSON.stringify(base),
          local: JSON.stringify(local),
          remote: JSON.stringify(remote),
        },
        { format: "json" },
      );
      expect(merged.status).toBe("semantic-merge");
      expect(JSON.parse(merged.content!)).toMatchObject({
        [`k${String(first)}`]: 1000 + seed,
        [`k${String(second)}`]: 2000 + seed,
      });

      const overlap = mergeJsonThreeWay(
        {
          base: JSON.stringify(base),
          local: JSON.stringify(local),
          remote: JSON.stringify({ ...base, [`k${String(first)}`]: 3000 + seed }),
        },
        { format: "json" },
      );
      expect(overlap).toMatchObject({ status: "conflict", content: null });
    }
  });
});

describe("plain text and keep-region adapters", () => {
  it("matches the reviewed workflow golden and preserves CRLF L bytes", () => {
    const base = fixture("workflow-kit-text", "base.txt").replaceAll("\n", "\r\n");
    const local = fixture("workflow-kit-text", "local.txt").replaceAll("\n", "\r\n");
    const remote = fixture("workflow-kit-text", "remote.txt");
    const expected = fixture("workflow-kit-text", "expected.txt").replaceAll("\n", "\r\n");
    const result = mergePlainTextThreeWay({ base, local, remote });
    expect(result).toMatchObject({ status: "semantic-merge", conflicts: [] });
    expect(result.content).toBe(expected);
    expect(result.content).not.toMatch(/(?<!\r)\n/u);
  });

  it("preserves a no-final-newline local segment while applying a remote hunk", () => {
    const result = mergePlainTextThreeWay({
      base: "alpha\nbeta\ngamma",
      local: "alpha\nlocal-beta\ngamma",
      remote: "remote-alpha\nbeta\ngamma",
    });
    expect(result.content).toBe("remote-alpha\nlocal-beta\ngamma");
    expect(result.content?.endsWith("\n")).toBe(false);
  });

  it("conflicts instead of concatenating an EOF insertion across a local newline deletion", () => {
    const result = mergePlainTextThreeWay({
      base: "alpha\nbeta\n",
      local: "alpha\nbeta",
      remote: "alpha\nbeta\ngamma\n",
    });
    expect(result).toMatchObject({
      status: "conflict",
      content: null,
      conflicts: [expect.objectContaining({ id: "lines:eof" })],
    });
    expect(result.conflictContent).toContain("alpha\nbeta");
    expect(result.conflictContent).toContain("gamma");
  });

  it("places markers only in conflict evidence for overlapping unequal edits", () => {
    const result = mergePlainTextThreeWay({
      base: "alpha\nbeta\n",
      local: "alpha\nlocal\n",
      remote: "alpha\nremote\n",
    });
    expect(result).toMatchObject({ status: "conflict", content: null });
    expect(result.conflictContent).toContain("<<<<<<< LOCAL");
    expect(result.conflicts[0]?.reason).toBe("overlapping-text-edit");
  });

  it("merges generated disjoint line edits without losing either side", () => {
    for (let seed = 0; seed < 96; seed += 1) {
      const baseLines = Array.from({ length: 12 }, (_, index) => `line-${String(index)}`);
      const localIndex = seed % baseLines.length;
      const remoteIndex = (localIndex + 1 + (seed % 10)) % baseLines.length;
      const localLines = [...baseLines];
      const remoteLines = [...baseLines];
      localLines[localIndex] = `local-${String(seed)}`;
      remoteLines[remoteIndex] = `remote-${String(seed)}`;
      const result = mergePlainTextThreeWay({
        base: `${baseLines.join("\n")}\n`,
        local: `${localLines.join("\n")}\n`,
        remote: `${remoteLines.join("\n")}\n`,
      });
      expect(result.status).toBe("semantic-merge");
      expect(result.content).toContain(`local-${String(seed)}`);
      expect(result.content).toContain(`remote-${String(seed)}`);
    }
  });

  it("grafts an exact local Dialog policy body into an upstream-moved declaration", () => {
    const result = mergeKeepRegionsThreeWay({
      base: fixture("dialog-keep-region", "base.ts.txt"),
      local: fixture("dialog-keep-region", "local.ts.txt"),
      remote: fixture("dialog-keep-region", "remote.ts.txt"),
    });
    expect(result).toMatchObject({
      status: "semantic-merge",
      conflicts: [],
      regionIds: ["project-dialog-policy"],
    });
    expect(result.content).toBe(fixture("dialog-keep-region", "expected.ts.txt"));
  });

  it("rejects nested, removed, and concurrently changed keep regions", () => {
    const base = "// mergora:keep-start policy\nbase\n// mergora:keep-end policy\n";
    expect(
      mergeKeepRegionsThreeWay({
        base,
        local: base,
        remote: "upstream removed the region\n",
      }).conflicts[0],
    ).toMatchObject({ reason: "remote-region-removed" });
    expect(
      mergeKeepRegionsThreeWay({
        base,
        local: "// mergora:keep-start policy\nlocal\n// mergora:keep-end policy\n",
        remote: "// mergora:keep-start policy\nremote\n// mergora:keep-end policy\n",
      }).conflicts[0],
    ).toMatchObject({ reason: "concurrent-edit" });
    expect(
      mergeKeepRegionsThreeWay({
        base,
        local: base,
        remote:
          "// mergora:keep-start policy\n// mergora:keep-start nested\n// mergora:keep-end nested\n// mergora:keep-end policy\n",
      }).conflicts.some(({ reason }) => reason === "invalid-keep-region"),
    ).toBe(true);
  });
});

describe("binary, move, media, and conflict bundle policies", () => {
  it("dispatches JSON and the existing CSS tracer through one byte-oriented entry point", () => {
    const json = mergeFileThreeWay({
      mediaType: "application/json",
      base: bytes('{"local":1,"remote":1}'),
      local: bytes('{"local":2,"remote":1}'),
      remote: bytes('{"local":1,"remote":2}'),
    });
    expect(json.status).toBe("semantic-merge");
    expect(JSON.parse(decoder.decode(json.proposed!))).toEqual({ local: 2, remote: 2 });

    const css = mergeFileThreeWay({
      mediaType: "text/css",
      base: bytes(".button { color: CanvasText; padding: 4px; }\n"),
      local: bytes(".button { color: rebeccapurple; padding: 4px; }\n"),
      remote: bytes(".button { color: CanvasText; padding: 8px; }\n"),
    });
    expect(css.status).toBe("semantic-merge");
    expect(decoder.decode(css.proposed!)).toContain("color: rebeccapurple");
    expect(decoder.decode(css.proposed!)).toContain("padding: 8px");
  });

  it("extends the CSS tracer with fail-closed comment, cascade-order, and at-rule policies", () => {
    const comment = mergeCssDeclarationsThreeWay({
      base: "/* base */\n.a { color: black; }\n",
      local: "/* local */\n.a { color: purple; }\n",
      remote: "/* upstream */\n.a { color: blue; }\n",
    });
    expect(comment.conflicts[0]).toMatchObject({ reason: "comment-change" });

    const order = mergeCssDeclarationsThreeWay({
      base: ".a { color: black; }\n.b { color: gray; }\n",
      local: ".a { color: purple; }\n.b { color: gray; }\n",
      remote: ".b { color: silver; }\n.a { color: black; }\n",
    });
    expect(order.conflicts[0]).toMatchObject({ reason: "cascade-order-change" });

    const atRule = mergeCssDeclarationsThreeWay({
      base: '@import "base.css";\n.a { color: black; }\n',
      local: '@import "base.css";\n.a { color: purple; }\n',
      remote: '@import "remote.css";\n.a { color: black; }\n',
    });
    expect(atRule.conflicts[0]).toMatchObject({ reason: "unsupported-structure-change" });
  });

  it("never text-merges concurrently changed binary data", () => {
    const result = mergeFileThreeWay({
      mediaType: "image/png",
      base: new Uint8Array([0, 1, 2]),
      local: new Uint8Array([0, 1, 3]),
      remote: new Uint8Array([0, 1, 4]),
    });
    expect(result).toMatchObject({
      status: "conflict",
      proposed: null,
      conflicts: [expect.objectContaining({ reason: "binary-concurrent-change" })],
    });
  });

  it("plans only explicit collision-free moves and flags case-only temporary renames", () => {
    expect(
      planExplicitMove({
        oldTarget: "src/Dialog.tsx",
        newTarget: "src/dialog.tsx",
        base: bytes("base"),
        localOld: bytes("base"),
        remoteNew: bytes("remote"),
        existingNew: null,
      }),
    ).toMatchObject({ status: "move", deleteOld: true, requiresTemporaryRename: true });

    expect(
      planExplicitMove({
        oldTarget: "src/old.ts",
        newTarget: "src/new.ts",
        base: bytes("base"),
        localOld: bytes("custom"),
        remoteNew: bytes("remote"),
        existingNew: null,
      }),
    ).toMatchObject({ status: "merge-required", local: bytes("custom") });

    expect(
      planExplicitMove({
        oldTarget: "src/old.ts",
        newTarget: "src/new.ts",
        base: bytes("base"),
        localOld: bytes("base"),
        remoteNew: bytes("remote"),
        existingNew: bytes("unrelated"),
      }),
    ).toMatchObject({
      status: "conflict",
      conflicts: [expect.objectContaining({ reason: "move-collision" })],
    });
  });

  it("fails closed for unsupported structured text and invalid UTF-8", () => {
    expect(
      mergeFileThreeWay({
        mediaType: "text/x-rust",
        base: bytes("export const value = 1;"),
        local: bytes("export const value = 2;"),
        remote: bytes("export const value = 3;"),
      }),
    ).toMatchObject({
      status: "conflict",
      conflicts: [expect.objectContaining({ reason: "unsupported-media-adapter" })],
    });
    expect(
      mergeFileThreeWay({
        mediaType: "text/plain",
        base: bytes("base"),
        local: new Uint8Array([0xff]),
        remote: bytes("remote"),
      }),
    ).toMatchObject({
      status: "conflict",
      conflicts: [expect.objectContaining({ reason: "utf8-decode" })],
    });
  });

  it("round-trips an existing UTF-8 BOM during a clean plain-text merge", () => {
    const bom = "\uFEFF";
    const result = mergeFileThreeWay({
      mediaType: "text/plain",
      base: bytes(`${bom}alpha\nbeta\n`),
      local: bytes(`${bom}alpha\nlocal-beta\n`),
      remote: bytes(`${bom}remote-alpha\nbeta\n`),
    });
    expect(result.status).toBe("semantic-merge");
    expect([...result.proposed!.slice(0, 3)]).toEqual([0xef, 0xbb, 0xbf]);
    expect(decoder.decode(result.proposed!)).toBe("remote-alpha\nlocal-beta\n");
  });

  it("creates detached byte-exact conflict evidence with deterministic SHA-256 metadata", async () => {
    const base = bytes("base\r\n");
    const local = bytes("محلي without final newline");
    const remote = bytes("remote\n");
    const proposed = bytes(
      "<<<<<<< LOCAL\nمحلي without final newline\n=======\nremote\n>>>>>>> REMOTE\n",
    );
    const bundle = await createConflictBundle({
      target: "src/components/dialog-policy.txt",
      owner: "official:dialog",
      mediaType: "text/plain",
      base,
      local,
      remote,
      proposed,
      conflicts: [
        semanticConflict("lines:1-1", "overlapping-text-edit", "Both sides changed line one."),
      ],
    });

    base.fill(0);
    local.fill(0);
    remote.fill(0);
    proposed.fill(0);
    expect(decoder.decode(bundle.files.base!)).toBe("base\r\n");
    expect(decoder.decode(bundle.files.local!)).toBe("محلي without final newline");
    expect(decoder.decode(bundle.files.remote!)).toBe("remote\n");
    expect(decoder.decode(bundle.files.proposed!)).toContain("<<<<<<< LOCAL");
    expect(bundle.metadata.digests.base).toMatch(/^sha256:[a-f0-9]{64}$/u);
    expect(bundle.metadata.originalLivePreconditionDigest).toBe(bundle.metadata.digests.local);
    expect(bundle.metadata.semanticUnitIds).toEqual(["lines:1-1"]);
  });

  it("rejects absolute bundle targets and bounded bundle overflow", async () => {
    const conflict = semanticConflict("$file", "concurrent-edit", "test");
    await expect(
      createConflictBundle({
        target: "C:/secret.txt",
        owner: "official:test",
        mediaType: "text/plain",
        base: bytes("a"),
        local: bytes("b"),
        remote: bytes("c"),
        proposed: null,
        conflicts: [conflict],
      }),
    ).rejects.toThrow(/project-relative/u);
    await expect(
      createConflictBundle({
        target: "src/test.txt",
        owner: "official:test",
        mediaType: "text/plain",
        base: bytes("aa"),
        local: bytes("bb"),
        remote: bytes("cc"),
        proposed: null,
        conflicts: [conflict],
        maxBundleBytes: 5,
      }),
    ).rejects.toThrow(/bounded byte/u);
  });
});
