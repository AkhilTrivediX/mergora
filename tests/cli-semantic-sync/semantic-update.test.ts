import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { dirname, relative, resolve } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import {
  applyInit,
  applySourceAdd,
  planInit,
  planSourceAdd,
} from "../../packages/cli/src/index.ts";
import {
  applySemanticUpdate,
  diffSemanticSource,
  immutableUpdateItemDigest,
  immutableUpdateRegistryIdentityDigest,
  immutableUpdateReleaseDigest,
  planSemanticUpdate,
  type ImmutableUpdateFile,
  type ImmutableUpdateItem,
  type ImmutableUpdateMove,
  type ImmutableUpdateRegistry,
  type ImmutableUpdateRelease,
} from "../../packages/cli/src/semantic-update.ts";
import {
  basePath,
  type ManifestItem,
  type ProvenanceManifest,
} from "../../packages/cli/src/source-operations.ts";
import { sha256 } from "../../packages/cli/src/contracts.ts";
import { renderSemanticSourceDiff } from "../../packages/cli/src/semantic-diff-renderer.ts";
import { createProjectFixture } from "../cli-fixtures/project-fixture.ts";
import { formatValidationErrors, validateSchemaDocument } from "../../registry/schemas/index.ts";

const workspaceRoot = resolve(import.meta.dirname, "../..");
const registryDirectory = resolve(workspaceRoot, "registry/generated");
const temporaryDirectories: string[] = [];

function json<T>(path: string): T {
  return JSON.parse(readFileSync(path, "utf8")) as T;
}

function fixture() {
  const project = createProjectFixture({ directoryPrefix: "mergora-semantic-update-" });
  temporaryDirectories.push(project.root);
  applyInit({ projectRoot: project.root }, planInit({ projectRoot: project.root }).planDigest);
  const addOptions = {
    projectRoot: project.root,
    itemIds: ["button"],
    registryDirectory,
    noInstall: true,
  };
  applySourceAdd(addOptions, planSourceAdd(addOptions).planDigest);
  return project;
}

function manifest(root: string): ProvenanceManifest {
  return json<ProvenanceManifest>(resolve(root, ".mergora/manifest.json"));
}

type MutableRemoteFile = {
  -readonly [Key in keyof ImmutableUpdateFile]: ImmutableUpdateFile[Key];
};

interface ReleaseMutationContext {
  readonly installed: ManifestItem;
  readonly files: MutableRemoteFile[];
  readonly moves: ImmutableUpdateMove[];
}

function releaseFor(
  root: string,
  mutate: (context: ReleaseMutationContext) => void = () => {},
  version = "0.0.1",
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
  const moves: ImmutableUpdateMove[] = [];
  mutate({ installed, files, moves });
  for (const file of files) {
    const bytes = Buffer.from(file.content, file.encoding === "base64" ? "base64" : "utf8");
    file.digest = sha256(bytes);
  }
  const itemWithoutDigest: Omit<ImmutableUpdateItem, "payloadDigest"> = {
    itemId: "button",
    kind: installed.kind,
    resolved: version,
    payloadUrl: `https://fixture.invalid/releases/${version}/items/button.json`,
    renderedWithTransformContextDigest: installed.transformContextDigest,
    files,
    registryDependencies: installed.registryDependencies,
    dependencies: installed.dependencies,
    contractVersion: version,
    lastMigration: moves.at(-1)?.id ?? null,
    ...(moves.length === 0 ? {} : { moves }),
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
    release: version,
    items: [item],
  };
  return {
    ...releaseWithoutDigest,
    manifestDigest: immutableUpdateReleaseDigest(releaseWithoutDigest),
  };
}

function remoteFile(release: ImmutableUpdateRelease, suffix: string): ImmutableUpdateFile {
  return release.items[0]!.files.find(({ logicalPath }) => logicalPath.endsWith(suffix))!;
}

function installedFile(root: string, suffix: string) {
  return manifest(root).items["official:button"]!.files.find(({ target }) =>
    target.endsWith(suffix),
  )!;
}

function inventory(root: string): Readonly<Record<string, string>> {
  const output: Record<string, string> = {};
  const visit = (directory: string): void => {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const path = resolve(directory, entry.name);
      const key = relative(root, path).replaceAll("\\", "/");
      if (entry.isDirectory()) visit(path);
      else if (entry.isFile()) output[key] = sha256(readFileSync(path));
    }
  };
  visit(root);
  return output;
}

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

describe("Semantic Sync update planning and apply", () => {
  it("requires an exact reviewed digest before creating transaction state or writing files", async () => {
    const project = fixture();
    const release = releaseFor(project.root, ({ files }) => {
      const file = files.find(({ logicalPath }) => logicalPath.endsWith("button-css.d.ts"))!;
      file.content += 'declare module "*.reviewed";\n';
    });
    const options = { projectRoot: project.root, release, noInstall: true };
    const before = inventory(project.root);

    await expect(Reflect.apply(applySemanticUpdate, undefined, [options])).rejects.toMatchObject({
      code: "PLAN_PRECONDITION_REQUIRED",
    });
    await expect(applySemanticUpdate(options, sha256("stale-semantic-plan"))).rejects.toMatchObject(
      {
        code: "PLAN_PRECONDITION_STALE",
      },
    );
    expect(inventory(project.root)).toEqual(before);
  });

  it("fast-forwards clean files and stores exact R as base with exact live provenance", async () => {
    const project = fixture();
    const release = releaseFor(project.root, ({ files }) => {
      const file = files.find(({ logicalPath }) => logicalPath.endsWith("button-css.d.ts"))!;
      file.content += 'declare module "*.svg";\n';
    });
    const options = {
      projectRoot: project.root,
      itemIds: ["button"],
      release,
      noInstall: true,
    };
    const firstPlan = planSemanticUpdate(options);
    expect(planSemanticUpdate(options)).toEqual(firstPlan);
    const schema = validateSchemaDocument("operation-plan", firstPlan);
    expect(formatValidationErrors(schema.errors)).toBe("");
    expect(schema.ok).toBe(true);
    expect(firstPlan.registries[0]).toMatchObject({
      release: "0.0.1",
      trust: "local-development",
    });
    expect(firstPlan.fileOperations).toContainEqual(
      expect.objectContaining({
        target: expect.stringMatching(/button-css\.d\.ts$/u),
        operation: "fast-forward",
      }),
    );

    const result = await applySemanticUpdate(options, firstPlan.planDigest);
    expect(result.status).toBe("committed");
    const file = installedFile(project.root, "button-css.d.ts");
    const remote = remoteFile(release, "button-css.d.ts");
    const expected = Buffer.from(remote.content, "utf8");
    expect(readFileSync(resolve(project.root, file.target))).toEqual(expected);
    expect(readFileSync(resolve(project.root, basePath(file.base)))).toEqual(expected);
    expect(file.base).toBe(remote.digest);
    expect(file.installed).toBe(remote.digest);
    expect(manifest(project.root).items["official:button"]!.resolved).toBe("0.0.1");
  });

  it("keeps local-only edits while advancing verified release provenance", async () => {
    const project = fixture();
    const file = installedFile(project.root, "button-css.d.ts");
    const path = resolve(project.root, file.target);
    const local = Buffer.from(`${readFileSync(path, "utf8")}declare module "*.project";\n`);
    writeFileSync(path, local);
    const release = releaseFor(project.root);
    const plan = planSemanticUpdate({ projectRoot: project.root, release, noInstall: true });
    expect(plan.fileOperations).toContainEqual(
      expect.objectContaining({ target: file.target, operation: "keep-local" }),
    );
    await applySemanticUpdate(
      { projectRoot: project.root, release, noInstall: true },
      plan.planDigest,
    );
    const next = installedFile(project.root, "button-css.d.ts");
    expect(readFileSync(path)).toEqual(local);
    expect(next.installed).toBe(sha256(local));
    expect(next.base).toBe(remoteFile(release, "button-css.d.ts").digest);
  });

  it("semantically merges disjoint CSS edits without normalizing the whole file", async () => {
    const project = fixture();
    const file = installedFile(project.root, "button.css");
    const path = resolve(project.root, file.target);
    const local = readFileSync(path, "utf8").replace(
      "align-items: center;",
      "align-items: flex-start;",
    );
    writeFileSync(path, local);
    const release = releaseFor(project.root, ({ files }) => {
      const css = files.find(({ logicalPath }) => logicalPath.endsWith("button.css"))!;
      css.content = css.content.replace(
        "font-size: var(--mrg-semantic-font-size-label);",
        "font-size: var(--mrg-semantic-font-size-body);",
      );
    });
    const options = { projectRoot: project.root, release, noInstall: true };
    const plan = planSemanticUpdate(options);
    expect(plan.fileOperations).toContainEqual(
      expect.objectContaining({ target: file.target, operation: "semantic-merge" }),
    );
    await applySemanticUpdate(options, plan.planDigest);
    const merged = readFileSync(path, "utf8");
    expect(merged).toContain("align-items: flex-start;");
    expect(merged).toContain("font-size: var(--mrg-semantic-font-size-body);");
    const next = installedFile(project.root, "button.css");
    expect(next.base).toBe(remoteFile(release, "button.css").digest);
    expect(next.installed).toBe(sha256(merged));
  });

  it("applies an explicit logical-path move and advances exact provenance", async () => {
    const project = fixture();
    const installed = installedFile(project.root, "button-css.d.ts");
    const oldPath = resolve(project.root, installed.target);
    const destinationLogicalPath = installed.logicalPath.replace(
      "button-css.d.ts",
      "button-styles.d.ts",
    );
    const release = releaseFor(project.root, ({ files, moves }) => {
      const declaration = files.find(({ logicalPath }) => logicalPath === installed.logicalPath)!;
      declaration.logicalPath = destinationLogicalPath;
      declaration.content += 'declare module "*.theme.css";\n';
      moves.push({
        id: "move-button-style-declaration",
        fromLogicalPath: installed.logicalPath,
        toLogicalPath: destinationLogicalPath,
      });
    });
    const options = { projectRoot: project.root, release, noInstall: true };
    const plan = planSemanticUpdate(options);
    const destination = installed.target.replace("button-css.d.ts", "button-styles.d.ts");
    expect(plan.migrations).toContainEqual({
      id: "move-button-style-declaration",
      adapter: "rename-file",
      phase: "remote",
    });
    expect(plan.fileOperations).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ target: installed.target, operation: "delete" }),
        expect.objectContaining({ target: destination, operation: "fast-forward" }),
      ]),
    );
    await applySemanticUpdate(options, plan.planDigest);
    expect(existsSync(oldPath)).toBe(false);
    expect(readFileSync(resolve(project.root, destination), "utf8")).toContain(
      'declare module "*.theme.css";',
    );
    expect(manifest(project.root).items["official:button"]).toMatchObject({
      lastMigration: "move-button-style-declaration",
      files: expect.arrayContaining([
        expect.objectContaining({ logicalPath: destinationLogicalPath, target: destination }),
      ]),
    });
  });

  it("fails closed when an explicit move destination is occupied", () => {
    const project = fixture();
    const installed = installedFile(project.root, "button-css.d.ts");
    const destinationLogicalPath = installed.logicalPath.replace(
      "button-css.d.ts",
      "button-styles.d.ts",
    );
    const destination = installed.target.replace("button-css.d.ts", "button-styles.d.ts");
    mkdirSync(dirname(resolve(project.root, destination)), { recursive: true });
    writeFileSync(resolve(project.root, destination), "consumer-owned\n");
    const before = inventory(project.root);
    const release = releaseFor(project.root, ({ files, moves }) => {
      files.find(({ logicalPath }) => logicalPath === installed.logicalPath)!.logicalPath =
        destinationLogicalPath;
      moves.push({
        id: "move-button-style-declaration",
        fromLogicalPath: installed.logicalPath,
        toLogicalPath: destinationLogicalPath,
      });
    });
    expect(() =>
      planSemanticUpdate({ projectRoot: project.root, release, noInstall: true }),
    ).toThrow(/occupied path/iu);
    expect(inventory(project.root)).toEqual(before);
  });

  it("handles upstream deletion and an intentional local tombstone in one transaction", async () => {
    const project = fixture();
    const upstreamDeleted = installedFile(project.root, "button-css.d.ts");
    const locallyDeleted = installedFile(project.root, "button-state.ts");
    unlinkSync(resolve(project.root, locallyDeleted.target));
    const release = releaseFor(project.root, ({ files }) => {
      files.splice(
        files.findIndex(({ logicalPath }) => logicalPath === upstreamDeleted.logicalPath),
        1,
      );
    });
    const options = { projectRoot: project.root, release, noInstall: true };
    const plan = planSemanticUpdate(options);
    expect(plan.fileOperations).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ target: upstreamDeleted.target, operation: "delete" }),
        expect.objectContaining({ target: locallyDeleted.target, operation: "local-delete" }),
      ]),
    );
    await applySemanticUpdate(options, plan.planDigest);
    const files = manifest(project.root).items["official:button"]!.files;
    expect(existsSync(resolve(project.root, upstreamDeleted.target))).toBe(false);
    expect(files.some(({ logicalPath }) => logicalPath === upstreamDeleted.logicalPath)).toBe(
      false,
    );
    expect(
      files.find(({ logicalPath }) => logicalPath === locallyDeleted.logicalPath),
    ).toMatchObject({
      installed: null,
      tombstone: true,
    });
  });

  it("reports local and planned structured diff data without writing any byte", () => {
    const project = fixture();
    const file = installedFile(project.root, "button-css.d.ts");
    writeFileSync(resolve(project.root, file.target), 'declare module "*.local";\n');
    const before = inventory(project.root);
    const local = diffSemanticSource({ projectRoot: project.root, itemIds: ["button"] });
    expect(local).toMatchObject({ hasDifferences: true, targetRelease: null });
    expect(local.nameOnly).toContain(file.target);
    expect(local.files.find(({ target }) => target === file.target)).toMatchObject({
      localChange: "modified",
      planned: null,
    });
    const unified = renderSemanticSourceDiff(project.root, local, {
      contextLines: 0,
      format: "unified",
    });
    expect(unified).toContain(`--- a/${file.target}`);
    expect(unified).toContain('-declare module "*.css";');
    expect(unified).toContain('+declare module "*.local";');
    expect(unified).toContain("@@ -1,1 +1,1 @@");
    const sideBySide = renderSemanticSourceDiff(project.root, local, {
      contextLines: 0,
      format: "side-by-side",
    });
    expect(sideBySide).toContain(`=== ${file.target} ===`);
    expect(sideBySide).toContain('declare module "*.local";');
    const release = releaseFor(project.root);
    const planned = diffSemanticSource({ projectRoot: project.root, release });
    expect(planned.files.find(({ target }) => target === file.target)?.planned).toMatchObject({
      status: "keep-local",
    });
    expect(inventory(project.root)).toEqual(before);
  });

  it("fails closed for corrupt immutable B and unsafe remote logical paths", () => {
    const corrupt = fixture();
    const file = installedFile(corrupt.root, "button-css.d.ts");
    writeFileSync(resolve(corrupt.root, basePath(file.base)), "corrupt");
    expect(() =>
      planSemanticUpdate({
        projectRoot: corrupt.root,
        release: releaseFor(corrupt.root),
        noInstall: true,
      }),
    ).toThrow(/base .*corrupt|missing or corrupt/iu);

    const unsafe = fixture();
    const release = releaseFor(unsafe.root, ({ files }) => {
      files[0]!.logicalPath = "../outside.ts";
    });
    const before = inventory(unsafe.root);
    expect(() =>
      planSemanticUpdate({ projectRoot: unsafe.root, release, noInstall: true }),
    ).toThrow(/portable|unsafe path/iu);
    expect(inventory(unsafe.root)).toEqual(before);
    expect(statSync(unsafe.root).isDirectory()).toBe(true);

    const reusedVersion = fixture();
    const mismatched = releaseFor(
      reusedVersion.root,
      ({ files }) => {
        files[0]!.content += "// changed under a reused immutable version\n";
      },
      "0.0.0-unreleased",
    );
    expect(() =>
      planSemanticUpdate({ projectRoot: reusedVersion.root, release: mismatched, noInstall: true }),
    ).toThrow(/different bytes.*immutable payload/iu);
  });
});
