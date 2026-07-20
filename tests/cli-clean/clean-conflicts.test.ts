import { existsSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import {
  applyInit,
  applySourceAdd,
  planInit,
  planSourceAdd,
} from "../../packages/cli/src/index.ts";
import { applyClean, planClean } from "../../packages/cli/src/clean.ts";
import { sha256 } from "../../packages/cli/src/contracts.ts";
import {
  applySemanticUpdate,
  immutableUpdateItemDigest,
  immutableUpdateRegistryIdentityDigest,
  immutableUpdateReleaseDigest,
  planSemanticUpdate,
  type ImmutableUpdateFile,
  type ImmutableUpdateItem,
  type ImmutableUpdateRegistry,
  type ImmutableUpdateRelease,
} from "../../packages/cli/src/semantic-update.ts";
import {
  basePath,
  type ManifestItem,
  type ProvenanceManifest,
} from "../../packages/cli/src/source-operations.ts";
import { createProjectFixture } from "../cli-fixtures/project-fixture.ts";

const workspaceRoot = resolve(import.meta.dirname, "../..");
const registryDirectory = resolve(workspaceRoot, "registry/generated");
const temporaryDirectories: string[] = [];

function json<T>(path: string): T {
  return JSON.parse(readFileSync(path, "utf8")) as T;
}

function fixture() {
  const project = createProjectFixture({ directoryPrefix: "mergora-clean-conflict-" });
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
  return json<ProvenanceManifest>(resolve(root, ".mergora/manifest.json"));
}

function cssFile(root: string): ManifestItem["files"][number] {
  return manifest(root).items["official:button"]!.files.find(({ target }) =>
    target.endsWith("button.css"),
  )!;
}

function conflictRelease(root: string): ImmutableUpdateRelease {
  const installed = manifest(root).items["official:button"]!;
  const files: ImmutableUpdateFile[] = installed.files.map((file) => {
    const base = readFileSync(resolve(root, basePath(file.base)));
    const binary = !(file.mediaType.startsWith("text/") || file.mediaType.includes("json"));
    let content = base.toString(binary ? "base64" : "utf8");
    if (file.logicalPath.endsWith("button.css")) {
      content = content.replace("align-items: center;", "align-items: flex-end;");
    }
    const bytes = Buffer.from(content, binary ? "base64" : "utf8");
    return {
      logicalPath: file.logicalPath,
      role: file.role,
      mediaType: file.mediaType,
      encoding: binary ? "base64" : "utf8",
      content,
      digest: sha256(bytes),
      executable: false,
    };
  });
  const itemWithoutDigest: Omit<ImmutableUpdateItem, "payloadDigest"> = {
    itemId: "button",
    kind: installed.kind,
    resolved: "0.0.2",
    payloadUrl: "https://fixture.invalid/releases/0.0.2/items/button.json",
    renderedWithTransformContextDigest: installed.transformContextDigest,
    files,
    registryDependencies: installed.registryDependencies,
    dependencies: installed.dependencies,
    contractVersion: "0.0.2",
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
  const releaseWithoutDigest: Omit<ImmutableUpdateRelease, "manifestDigest"> = {
    schemaVersion: 1,
    registry,
    release: "0.0.2",
    items: [item],
  };
  return {
    ...releaseWithoutDigest,
    manifestDigest: immutableUpdateReleaseDigest(releaseWithoutDigest),
  };
}

async function stageConflict(root: string, id: string): Promise<{ readonly target: string }> {
  const file = cssFile(root);
  const livePath = resolve(root, file.target);
  writeFileSync(
    livePath,
    readFileSync(livePath, "utf8").replace("align-items: center;", "align-items: flex-start;"),
  );
  const options = {
    projectRoot: root,
    release: conflictRelease(root),
    noInstall: true,
    conflictTransactionId: id,
  };
  const plan = planSemanticUpdate(options);
  expect(plan.conflicts).toContainEqual(expect.objectContaining({ target: file.target }));
  await expect(applySemanticUpdate(options, plan.planDigest)).resolves.toMatchObject({
    status: "conflicted",
    conflictTransactionId: id,
    liveProjectChanged: false,
  });
  return { target: file.target };
}

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0).reverse()) {
    rmSync(directory, { recursive: true, force: true });
  }
});

describe("cleanup of Semantic Sync conflict packets", () => {
  it("preserves an active packet and removes it only after exact live preconditions become stale", async () => {
    const project = fixture();
    const id = "20260718T150000.000Z-10000000000000000000000000000001";
    const { target } = await stageConflict(project.root, id);
    const conflictRoot = resolve(project.root, ".mergora/transactions", id);
    const livePath = resolve(project.root, target);
    const manifestBefore = readFileSync(resolve(project.root, ".mergora/manifest.json"));
    const packageBefore = readFileSync(resolve(project.root, "package.json"));
    const liveBefore = readFileSync(livePath);
    const options = { projectRoot: project.root, conflicts: true };

    const active = planClean(options);
    expect(active.warnings).toEqual(
      expect.arrayContaining([expect.stringContaining(`active conflict IDs: ${id}`)]),
    );
    expect(
      active.fileOperations.filter(({ owner }) => owner === "official:clean-conflicts"),
    ).toEqual([]);
    expect(active.fileOperations.some(({ operation }) => operation === "delete")).toBe(false);
    expect(applyClean(options, active.planDigest).status).toBe("no-op");
    expect(existsSync(conflictRoot)).toBe(true);
    expect(readFileSync(livePath)).toEqual(liveBefore);

    const changedLive = Buffer.concat([
      liveBefore,
      Buffer.from("\n/* changed after conflict */\n"),
    ]);
    writeFileSync(livePath, changedLive);
    const stale = planClean(options);
    expect(stale.warnings).toEqual(
      expect.arrayContaining([expect.stringContaining("active conflict IDs: none")]),
    );
    expect(stale.fileOperations).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          owner: "official:clean-conflicts",
          operation: "delete",
          target: `.mergora/transactions/${id}`,
        }),
      ]),
    );
    expect(applyClean(options, stale.planDigest).deleted).toEqual([`.mergora/transactions/${id}`]);
    expect(existsSync(conflictRoot)).toBe(false);
    expect(readFileSync(livePath)).toEqual(changedLive);
    expect(readFileSync(resolve(project.root, ".mergora/manifest.json"))).toEqual(manifestBefore);
    expect(readFileSync(resolve(project.root, "package.json"))).toEqual(packageBefore);
  });

  it("refuses a conflict packet whose immutable snapshots were tampered", async () => {
    const project = fixture();
    const id = "20260718T150001.000Z-10000000000000000000000000000002";
    await stageConflict(project.root, id);
    const snapshotsRoot = resolve(project.root, ".mergora/transactions", id, "snapshots");
    const key = readdirSync(snapshotsRoot)[0]!;
    const snapshot = resolve(snapshotsRoot, key, "base");
    writeFileSync(snapshot, Buffer.concat([readFileSync(snapshot), Buffer.from("tampered")]));

    expect(() => planClean({ projectRoot: project.root, conflicts: true })).toThrow(
      /snapshot.*digest|tamper|corrupt/iu,
    );
    expect(existsSync(resolve(project.root, ".mergora/transactions", id))).toBe(true);
  });

  it("never treats an unknown credential artifact inside a stale packet as cleanup data", async () => {
    const project = fixture();
    const id = "20260718T150002.000Z-10000000000000000000000000000003";
    const { target } = await stageConflict(project.root, id);
    const conflictRoot = resolve(project.root, ".mergora/transactions", id);
    writeFileSync(resolve(project.root, target), "stale live content\n");
    const credentialPath = resolve(conflictRoot, "credentials.json");
    writeFileSync(credentialPath, '{"token":"must-not-delete"}\n');

    expect(() => planClean({ projectRoot: project.root, conflicts: true })).toThrow(
      /unknown or missing artifact/iu,
    );
    expect(readFileSync(credentialPath, "utf8")).toContain("must-not-delete");
    expect(existsSync(conflictRoot)).toBe(true);
  });
});
