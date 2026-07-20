import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { gzipSync } from "node:zlib";

import { describe, expect, it } from "vitest";

// @ts-expect-error The executable ESM helper intentionally has no declaration output.
import { canonicalPackedContentDigest } from "../../scripts/lib/packed-content-digest.mjs";

const root = process.cwd();
const packedRoot = join(root, "tests", "packed-consumers");

function text(path: string): string {
  return readFileSync(join(root, path), "utf8");
}

const packageMap = JSON.parse(text("config/public-packages.json")) as {
  selectionStatus: string;
  selectionTier: string;
  cli: { package: string; bin: string };
  public: {
    contracts: string;
    mcp: string;
    registry: string;
    schema: string;
    tokens: string;
    ui: string;
  };
};
const sharedRepresentativeIds = [
  "button",
  "dialog",
  "combobox",
  "date-picker",
  "file-upload",
  "data-grid",
] as const;
const sourceOnlyWorkflowKitId = "admin-dashboard-shell";
const packedSourceRequestIds = [...sharedRepresentativeIds, sourceOnlyWorkflowKitId];

function expectedPackedSourceFileCount(): number {
  const visited = new Set<string>();
  let count = 0;
  const visit = (id: string): void => {
    if (visited.has(id)) return;
    visited.add(id);
    const payload = JSON.parse(text(`registry/generated/native-source-items/${id}.json`)) as {
      files: readonly unknown[];
      registryDependencies: readonly string[];
    };
    for (const dependency of payload.registryDependencies) visit(dependency);
    count += payload.files.length;
  };
  for (const id of packedSourceRequestIds) visit(id);
  return count;
}

function tarEntry(path: string, content: string): Buffer {
  const body = Buffer.from(content);
  const header = Buffer.alloc(512);
  header.write(path, 0, 100, "utf8");
  header.write("0000644\0", 100, 8, "ascii");
  header.write("0000000\0", 108, 8, "ascii");
  header.write("0000000\0", 116, 8, "ascii");
  header.write(`${body.length.toString(8).padStart(11, "0")}\0`, 124, 12, "ascii");
  header.write("00000000000\0", 136, 12, "ascii");
  header.fill(0x20, 148, 156);
  header.write("0", 156, 1, "ascii");
  header.write("ustar\0", 257, 6, "ascii");
  header.write("00", 263, 2, "ascii");
  const checksum = [...header].reduce((sum, byte) => sum + byte, 0);
  header.write(`${checksum.toString(8).padStart(6, "0")}\0 `, 148, 8, "ascii");
  const padding = Buffer.alloc((512 - (body.length % 512)) % 512);
  return Buffer.concat([header, body, padding]);
}

function packedFixture(entries: ReadonlyArray<readonly [string, string]>): Buffer {
  return gzipSync(
    Buffer.concat([
      ...entries.map(([path, content]) => tarEntry(path, content)),
      Buffer.alloc(1024),
    ]),
  );
}

describe("P1 packed consumer proof", () => {
  it("locks the verified approved unscoped package tier", () => {
    expect(packageMap).toMatchObject({
      selectionStatus: "verified",
      selectionTier: "approved-unscoped",
      cli: { package: "mergora", bin: "mergora" },
      public: {
        contracts: "mergora-contracts",
        mcp: "mergora-mcp",
        registry: "mergora-registry",
        schema: "mergora-schema",
        tokens: "mergora-tokens",
        ui: "mergora-ui",
      },
    });
  });

  it("locks the complete current Next/Vite source/package matrix", () => {
    const matrix = JSON.parse(text("tests/packed-consumers/matrix.json")) as {
      packageManager: string;
      consumers: Array<{ id: string; framework: string; mode: string }>;
    };

    expect(matrix.packageManager).toBe("pnpm@11.14.0");
    expect(matrix.consumers).toEqual([
      { id: "next-package", framework: "next", mode: "package" },
      { id: "vite-package", framework: "vite", mode: "package" },
      { id: "next-source", framework: "next", mode: "source" },
      { id: "vite-source", framework: "vite", mode: "source" },
    ]);
  });

  it("uses public UI subpaths in package mode and CLI-owned files in source mode", () => {
    const packageFixtures = [
      text("tests/packed-consumers/fixtures/next/package/src/app/showcase.tsx"),
      text("tests/packed-consumers/fixtures/vite/package/src/App.tsx"),
    ];
    for (const fixture of packageFixtures) {
      for (const itemId of sharedRepresentativeIds) {
        expect(fixture).toContain(`from "${packageMap.public.ui}/${itemId}"`);
      }
      expect(fixture).not.toContain(`${packageMap.public.ui}/${sourceOnlyWorkflowKitId}`);
      expect(fixture).toContain('data-consumer-mode="package"');
    }

    const sourceFixtures = [
      text("tests/packed-consumers/fixtures/next/source/src/app/showcase.tsx"),
      text("tests/packed-consumers/fixtures/vite/source/src/App.tsx"),
    ];
    for (const fixture of sourceFixtures) {
      for (const itemId of packedSourceRequestIds) {
        expect(fixture).toContain(`components/${itemId}`);
      }
      expect(fixture).not.toContain(`${packageMap.public.ui}/`);
      expect(fixture).toContain('data-consumer-mode="source"');
    }
  });

  it("keeps the external runner fail closed", () => {
    const runner = text("scripts/verify-p1-consumers.mjs");
    expect(runner).toContain('"--offline", "--frozen-lockfile"');
    expect(runner).toContain("Packed consumer evidence is missing");
    expect(runner).toContain("Consumer lockfile contains a workspace-only protocol");
    expect(runner).toContain(
      "const packedSourceRequestIds = [...sharedRepresentativeIds, sourceOnlyWorkflowKitId]",
    );
    expect(runner).toContain('${packedSourceRequestIds.join(" ")}');
    expect(runner).toContain("const packedCli = join(");
    expect(runner).toContain("process.execPath");
    expect(runner).toContain("verifyCustomizedSourceLifecycle");
    expect(runner).toContain("verifyOverlappingUpdateAndResolution");
    expect(runner).toContain("verifyOfflineVendor");
    expect(runner).toContain("verifyStaticContractAudit");
    expect(runner).toContain("verifyOwnershipRemoveAndRollback");
    expect(runner).toContain("verifyInterruptedRecovery");
    expect(runner).toContain("verifyMigrationAndShadcnAdoption");
    expect(runner).toContain("verifySourceOnlyPackageRejection");
    expect(runner).toContain("verifyProductionRuntime");
    expect(existsSync(packedRoot)).toBe(true);
  });

  it("normalizes packed manifest key order without hiding file or value changes", () => {
    const first = packedFixture([
      ["package/package.json", '{"name":"mergora","dependencies":{"a":"1","b":"2"}}'],
      ["package/dist/index.js", "export const value = 1;\n"],
    ]);
    const reordered = packedFixture([
      ["package/dist/index.js", "export const value = 1;\n"],
      ["package/package.json", '{"dependencies":{"b":"2","a":"1"},"name":"mergora"}'],
    ]);
    const changedManifestValue = packedFixture([
      ["package/package.json", '{"name":"mergora","dependencies":{"a":"1","b":"3"}}'],
      ["package/dist/index.js", "export const value = 1;\n"],
    ]);
    const changedFileValue = packedFixture([
      ["package/package.json", '{"name":"mergora","dependencies":{"a":"1","b":"2"}}'],
      ["package/dist/index.js", "export const value = 2;\n"],
    ]);

    const digest = canonicalPackedContentDigest(first);
    expect(canonicalPackedContentDigest(reordered)).toBe(digest);
    expect(canonicalPackedContentDigest(changedManifestValue)).not.toBe(digest);
    expect(canonicalPackedContentDigest(changedFileValue)).not.toBe(digest);
  });

  it("tracks path-free digest evidence for every exact tarball and consumer", () => {
    const evidencePath = join(packedRoot, "evidence.json");
    expect(existsSync(evidencePath)).toBe(true);
    const source = readFileSync(evidencePath, "utf8");
    const evidence = JSON.parse(source) as {
      artifactDigestAlgorithm: string;
      artifactKind: string;
      artifacts: Array<{ name: string; sha256: string }>;
      consumers: Array<{
        id: string;
        mode: string;
        result: string;
        publicCliLifecycle: null | {
          contractAudit: { assertions: number; networkUsed: boolean; state: string };
          interruptedRecovery: { injectedAt: string; recovery: string };
          migrationAndAdoption: { adoption: string; migration: string };
          overlappingUpdate: {
            conflictPacket: string;
            liveProjectDuringConflict: string;
            resolution: string;
          };
          ownershipAndRollback: { removal: string; rollback: string };
          vendor: { networkUsed: boolean; provenance: string; verification: string };
        };
        runtime: { hydrated: boolean; sourceOnlyWorkflowKit: string };
        sourceInstall: null | { files: number };
        sourceLifecycle: null | { guardedRemoval: string; status: string; update: string };
        sourceOnlyPackageRejection: null | { import: string; packageFiles: string };
      }>;
      publicationStatus: string;
    };

    expect(evidence.artifactKind).toBe("p1-packed-consumer-evidence");
    expect(evidence.artifactDigestAlgorithm).toBe("sha256-canonical-tar-content-v1");
    expect(evidence.publicationStatus).toBe("unreleased");
    expect(evidence.artifacts.map(({ name }) => name)).toEqual(
      [
        packageMap.public.contracts,
        packageMap.public.mcp,
        packageMap.public.registry,
        packageMap.public.schema,
        packageMap.public.tokens,
        packageMap.public.ui,
        packageMap.cli.package,
      ].sort((left, right) => left.localeCompare(right, "en-US")),
    );
    expect(evidence.artifacts.every(({ sha256 }) => /^[a-f0-9]{64}$/u.test(sha256))).toBe(true);
    expect(evidence.consumers.map(({ id }) => id)).toEqual([
      "next-package",
      "next-source",
      "vite-package",
      "vite-source",
    ]);
    expect(evidence.consumers.every(({ result }) => result === "passed")).toBe(true);
    expect(evidence.consumers.every(({ runtime }) => runtime.hydrated)).toBe(true);
    expect(
      evidence.consumers
        .filter(({ sourceInstall }) => sourceInstall !== null)
        .every(({ sourceInstall }) => sourceInstall?.files === expectedPackedSourceFileCount()),
    ).toBe(true);
    expect(
      evidence.consumers
        .filter(({ mode }) => mode === "source")
        .every(
          ({ runtime, sourceLifecycle }) =>
            runtime.sourceOnlyWorkflowKit === "rendered" &&
            sourceLifecycle?.status === "locally-modified" &&
            sourceLifecycle.guardedRemoval === "conflict-preserved-live-source" &&
            sourceLifecycle.update ===
              "disjoint-upstream-change-merged-local-customization-preserved",
        ),
    ).toBe(true);
    expect(
      evidence.consumers
        .filter(({ mode }) => mode === "package")
        .every(
          ({ runtime, sourceOnlyPackageRejection }) =>
            runtime.sourceOnlyWorkflowKit === "absent" &&
            sourceOnlyPackageRejection?.import === "rejected-not-exported" &&
            sourceOnlyPackageRejection.packageFiles === "absent",
        ),
    ).toBe(true);
    const lifecycleConsumers = evidence.consumers.filter(
      ({ publicCliLifecycle }) => publicCliLifecycle !== null,
    );
    expect(lifecycleConsumers).toHaveLength(1);
    expect(lifecycleConsumers[0]).toMatchObject({
      id: "next-source",
      publicCliLifecycle: {
        contractAudit: { assertions: 1, networkUsed: false, state: "pass" },
        interruptedRecovery: {
          injectedAt: "commit-file",
          recovery: "rollback-byte-identical",
        },
        migrationAndAdoption: {
          adoption: "exact-shadcn-v1-source-preserved",
          migration: "built-in-settings-transaction",
        },
        overlappingUpdate: {
          conflictPacket: "complete-local-only",
          liveProjectDuringConflict: "byte-identical",
          resolution: "explicit-take-local-committed",
        },
        ownershipAndRollback: {
          removal: "direct-ownership-detached-dependent-owned-files-retained",
          rollback: "byte-identical-restore",
        },
        vendor: {
          networkUsed: false,
          provenance: "unreleased-local",
          verification: "valid-offline",
        },
      },
    });
    expect(
      evidence.consumers
        .filter(({ id }) => id !== "next-source")
        .every(({ publicCliLifecycle }) => publicCliLifecycle === null),
    ).toBe(true);
    expect(source).not.toMatch(/(?:[A-Z]:[\\/]|AppData|Temp|workspace:|catalog:|link:)/u);
  });
});
