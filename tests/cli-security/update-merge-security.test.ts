import { readFileSync, rmSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import {
  applyInit,
  applySourceAdd,
  CliError,
  immutableUpdateItemDigest,
  immutableUpdateRegistryIdentityDigest,
  immutableUpdateReleaseDigest,
  planInit,
  planSemanticUpdate,
  planSourceAdd,
  sha256,
  type ImmutableUpdateFile,
  type ImmutableUpdateItem,
  type ImmutableUpdateRegistry,
  type ImmutableUpdateRelease,
} from "../../packages/cli/src/index.ts";
import {
  mergeFileThreeWay,
  mergePlainTextThreeWay,
  type FileMergeResult,
} from "../../packages/registry/src/index.ts";
import {
  basePath,
  type ManifestItem,
  type ProvenanceManifest,
} from "../../packages/cli/src/source-operations.ts";
import { createProjectFixture } from "../cli-fixtures/project-fixture.ts";

const workspaceRoot = resolve(import.meta.dirname, "../..");
const registryDirectory = resolve(workspaceRoot, "registry/generated");
const temporaryDirectories: string[] = [];
const SECURITY_SEEDS = Object.freeze(Array.from({ length: 32 }, (_, index) => index));

type Mutable<Value> = { -readonly [Key in keyof Value]: Value[Key] };
type MutableRemoteFile = Mutable<ImmutableUpdateFile>;
type MutableRemoteItem = Omit<Mutable<ImmutableUpdateItem>, "files"> & {
  files: MutableRemoteFile[];
};
type MutableRelease = Omit<Mutable<ImmutableUpdateRelease>, "items" | "registry"> & {
  items: MutableRemoteItem[];
  registry: Mutable<ImmutableUpdateRegistry>;
};

interface ReleaseMutationContext {
  readonly installed: ManifestItem;
  readonly files: MutableRemoteFile[];
}

function fixture() {
  const project = createProjectFixture({ directoryPrefix: "mergora-security-update-" });
  temporaryDirectories.push(project.root);
  applyInit({ projectRoot: project.root }, planInit({ projectRoot: project.root }).planDigest);
  const options = {
    projectRoot: project.root,
    itemIds: ["button"],
    registryDirectory,
    noInstall: true,
  };
  applySourceAdd(options, planSourceAdd(options).planDigest);
  return project;
}

function manifest(root: string): ProvenanceManifest {
  return JSON.parse(
    readFileSync(resolve(root, ".mergora/manifest.json"), "utf8"),
  ) as ProvenanceManifest;
}

function releaseFor(
  root: string,
  mutate: (context: ReleaseMutationContext) => void = () => {},
): ImmutableUpdateRelease {
  const installed = manifest(root).items["official:button"]!;
  const files: MutableRemoteFile[] = installed.files.map((file) => {
    const bytes = readFileSync(resolve(root, basePath(file.base)));
    const binary = !(file.mediaType.startsWith("text/") || file.mediaType.includes("json"));
    return {
      logicalPath: file.logicalPath,
      role: file.role,
      mediaType: file.mediaType,
      encoding: binary ? "base64" : "utf8",
      content: bytes.toString(binary ? "base64" : "utf8"),
      digest: sha256(bytes),
      executable: false,
    };
  });
  mutate({ installed, files });
  for (const file of files) {
    const bytes = Buffer.from(file.content, file.encoding === "base64" ? "base64" : "utf8");
    file.digest = sha256(bytes);
  }
  const itemWithoutDigest: Omit<ImmutableUpdateItem, "payloadDigest"> = {
    itemId: "button",
    kind: installed.kind,
    resolved: "0.0.1",
    payloadUrl: "https://fixture.invalid/releases/0.0.1/items/button.json",
    renderedWithTransformContextDigest: installed.transformContextDigest,
    files,
    registryDependencies: installed.registryDependencies,
    dependencies: installed.dependencies,
    contractVersion: "0.0.1",
    lastMigration: null,
  };
  const item: ImmutableUpdateItem = {
    ...itemWithoutDigest,
    payloadDigest: immutableUpdateItemDigest(itemWithoutDigest),
  };
  const identity = {
    id: "official",
    protocol: "mergora-v1" as const,
    origin: "https://fixture.invalid/registry/v1",
    trust: "local-development" as const,
  };
  const registry: ImmutableUpdateRegistry = {
    ...identity,
    identityDigest: immutableUpdateRegistryIdentityDigest(identity),
    source: "verified-cache",
    evidenceTier: "not-supplied",
  };
  const withoutDigest: Omit<ImmutableUpdateRelease, "manifestDigest"> = {
    schemaVersion: 1,
    registry,
    release: "0.0.1",
    items: [item],
  };
  return { ...withoutDigest, manifestDigest: immutableUpdateReleaseDigest(withoutDigest) };
}

function cloneRelease(release: ImmutableUpdateRelease): MutableRelease {
  return structuredClone(release) as MutableRelease;
}

function rehashItem(release: MutableRelease): void {
  const item = release.items[0]!;
  const { payloadDigest: _discarded, ...withoutDigest } = item;
  item.payloadDigest = immutableUpdateItemDigest(withoutDigest);
  const { manifestDigest: _oldManifest, ...withoutManifest } = release;
  release.manifestDigest = immutableUpdateReleaseDigest(withoutManifest);
}

function errorCode(error: unknown): string | undefined {
  return error instanceof CliError ? error.code : undefined;
}

function caught(callback: () => unknown): unknown {
  try {
    callback();
  } catch (error) {
    return error;
  }
  return undefined;
}

function bytes(value: string): Uint8Array {
  return new TextEncoder().encode(value);
}

function text(value: Uint8Array | null): string | null {
  return value === null ? null : new TextDecoder().decode(value);
}

function lineEndingShape(result: FileMergeResult): unknown {
  return {
    status: result.status,
    proposed: text(result.proposed)?.replaceAll("\r\n", "\n") ?? null,
    conflictProposal: text(result.conflictProposal)?.replaceAll("\r\n", "\n") ?? null,
    conflicts: result.conflicts.map(({ id, reason }) => ({ id, reason })),
    appliedRemoteKeys: result.appliedRemoteKeys,
    preservedLocalKeys: result.preservedLocalKeys,
    tombstone: result.tombstone,
  };
}

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

describe("immutable update tamper resistance", () => {
  it("rejects each tampered digest layer before creating a transaction", () => {
    const project = fixture();
    const valid = releaseFor(project.root);

    const identity = cloneRelease(valid);
    identity.registry.origin = "https://attacker.invalid/registry/v1";

    const manifestDigest = cloneRelease(valid);
    manifestDigest.manifestDigest = `sha256:${"0".repeat(64)}`;

    const payloadDigest = cloneRelease(valid);
    payloadDigest.items[0]!.payloadDigest = `sha256:${"1".repeat(64)}`;
    const { manifestDigest: _old, ...payloadReleaseWithoutDigest } = payloadDigest;
    payloadDigest.manifestDigest = immutableUpdateReleaseDigest(payloadReleaseWithoutDigest);

    const fileDigest = cloneRelease(valid);
    fileDigest.items[0]!.files[0]!.digest = `sha256:${"2".repeat(64)}`;
    rehashItem(fileDigest);

    const fileBytes = cloneRelease(valid);
    fileBytes.items[0]!.files[0]!.content += "tampered bytes";
    rehashItem(fileBytes);

    const cases = [
      [identity, "REGISTRY_IDENTITY_MISMATCH"],
      [manifestDigest, "REGISTRY_MANIFEST_DIGEST_MISMATCH"],
      [payloadDigest, "REGISTRY_PAYLOAD_DIGEST_MISMATCH"],
      [fileDigest, "REGISTRY_PAYLOAD_DIGEST_MISMATCH"],
      [fileBytes, "REGISTRY_PAYLOAD_DIGEST_MISMATCH"],
    ] as const;
    for (const [release, expectedCode] of cases) {
      const error = caught(() =>
        planSemanticUpdate({ projectRoot: project.root, release, noInstall: true }),
      );
      expect(errorCode(error)).toBe(expectedCode);
    }
    expect(readFileSync(resolve(project.root, ".mergora/manifest.json"), "utf8")).not.toContain(
      "0.0.1",
    );
  });

  it("rejects a byte-tampered immutable base and leaves live source untouched", () => {
    const project = fixture();
    const installed = manifest(project.root).items["official:button"]!;
    const base = installed.files[0]!;
    const livePath = resolve(project.root, base.target);
    const liveBefore = readFileSync(livePath);
    writeFileSync(resolve(project.root, basePath(base.base)), "tampered immutable base\n");

    const error = caught(() =>
      planSemanticUpdate({
        projectRoot: project.root,
        release: releaseFor(project.root),
        noInstall: true,
      }),
    );

    expect(error).toBeInstanceOf(CliError);
    expect(String(error)).toMatch(/base .*corrupt|missing or corrupt/iu);
    expect(readFileSync(livePath)).toEqual(liveBefore);
  });
});

describe("deterministic unequal-overlap properties", () => {
  it("never classifies unequal overlapping generated edits as clean", () => {
    for (const seed of SECURITY_SEEDS) {
      const line = seed % 8;
      const baseLines = Array.from({ length: 8 }, (_, index) => `line-${String(index)}`);
      const localLines = [...baseLines];
      const remoteLines = [...baseLines];
      localLines[line] = `local-${String(seed)}`;
      remoteLines[line] = `remote-${String(seed)}`;

      const candidates = [
        mergeFileThreeWay({
          mediaType: "text/plain",
          base: bytes(`${baseLines.join("\n")}\n`),
          local: bytes(`${localLines.join("\n")}\n`),
          remote: bytes(`${remoteLines.join("\n")}\n`),
        }),
        mergeFileThreeWay({
          mediaType: "application/json",
          base: bytes(JSON.stringify({ value: seed, stable: true })),
          local: bytes(JSON.stringify({ value: seed + 1_000, stable: true })),
          remote: bytes(JSON.stringify({ value: seed + 2_000, stable: true })),
        }),
        mergeFileThreeWay({
          mediaType: "text/css",
          base: bytes(`.seed { order: ${String(seed)}; color: black; }\n`),
          local: bytes(`.seed { order: ${String(seed + 1_000)}; color: black; }\n`),
          remote: bytes(`.seed { order: ${String(seed + 2_000)}; color: black; }\n`),
        }),
        mergeFileThreeWay({
          mediaType: "text/typescript",
          base: bytes(`export const seed = ${String(seed)};\n`),
          local: bytes(`export const seed = ${String(seed + 1_000)};\n`),
          remote: bytes(`export const seed = ${String(seed + 2_000)};\n`),
        }),
      ];

      for (const result of candidates) {
        expect(result.status).toBe("conflict");
        expect(result.proposed).toBeNull();
        expect(result.conflicts.length).toBeGreaterThan(0);
      }
    }
  }, 10_000);

  it("returns byte-for-byte stable conflict evidence for retained seeds", () => {
    for (const seed of SECURITY_SEEDS) {
      const input = {
        mediaType: "text/plain",
        base: bytes(`seed-${String(seed)}\nbase\n`),
        local: bytes(`seed-${String(seed)}\nlocal\n`),
        remote: bytes(`seed-${String(seed)}\nremote\n`),
      };
      expect(mergeFileThreeWay(input)).toEqual(mergeFileThreeWay(input));
    }
  });
});

describe("CRLF and LF merge determinism", () => {
  it("preserves semantic results across generated LF and CRLF disjoint edits", () => {
    for (const seed of SECURITY_SEEDS) {
      const baseLines = Array.from({ length: 10 }, (_, index) => `line-${String(index)}`);
      const localLines = [...baseLines];
      const remoteLines = [...baseLines];
      localLines[seed % 5] = `local-${String(seed)}`;
      remoteLines[5 + (seed % 5)] = `remote-${String(seed)}`;
      const asInput = (ending: "\n" | "\r\n") => ({
        base: `${baseLines.join(ending)}${ending}`,
        local: `${localLines.join(ending)}${ending}`,
        remote: `${remoteLines.join(ending)}${ending}`,
      });

      const lf = mergePlainTextThreeWay(asInput("\n"));
      const crlf = mergePlainTextThreeWay(asInput("\r\n"));
      expect(crlf.status).toBe("semantic-merge");
      expect(crlf.content?.replaceAll("\r\n", "\n")).toBe(lf.content);
      expect(crlf.conflicts).toEqual(lf.conflicts);
      expect(crlf.appliedRemoteKeys).toEqual(lf.appliedRemoteKeys);
      expect(crlf.preservedLocalKeys).toEqual(lf.preservedLocalKeys);
    }
  }, 10_000);

  it.each([
    {
      mediaType: "text/plain",
      base: "alpha\nbeta\ngamma\n",
      local: "alpha\nlocal-beta\ngamma\n",
      remote: "remote-alpha\nbeta\ngamma\n",
    },
    {
      mediaType: "text/css",
      base: ".a { color: black; padding: 4px; }\n",
      local: ".a { color: purple; padding: 4px; }\n",
      remote: ".a { color: black; padding: 8px; }\n",
    },
    {
      mediaType: "application/jsonc",
      base: '{\n  "local": 1,\n  "remote": 1\n}\n',
      local: '{\n  "local": 2,\n  "remote": 1\n}\n',
      remote: '{\n  "local": 1,\n  "remote": 2\n}\n',
    },
    {
      mediaType: "text/typescript",
      base: "export const local = 1;\nexport const remote = 1;\n",
      local: "export const local = 2;\nexport const remote = 1;\n",
      remote: "export const local = 1;\nexport const remote = 2;\n",
    },
  ])("keeps $mediaType merge semantics independent of whole-file line endings", (fixture) => {
    const merge = (ending: "\n" | "\r\n") =>
      mergeFileThreeWay({
        mediaType: fixture.mediaType,
        base: bytes(fixture.base.replaceAll("\n", ending)),
        local: bytes(fixture.local.replaceAll("\n", ending)),
        remote: bytes(fixture.remote.replaceAll("\n", ending)),
      });
    const lf = merge("\n");
    const crlf = merge("\r\n");

    expect(lineEndingShape(crlf)).toEqual(lineEndingShape(lf));
    expect(crlf).toEqual(merge("\r\n"));
  });
});
