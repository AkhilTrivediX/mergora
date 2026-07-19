import { existsSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { relative, resolve } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import {
  TransactionInterruption,
  applyInit,
  applySourceAdd,
  planInit,
  planSourceAdd,
} from "../../packages/cli/src/index.ts";
import { sha256 } from "../../packages/cli/src/contracts.ts";
import {
  applySemanticResolution,
  applySemanticResolveChoice,
  applySemanticUpdate,
  immutableUpdateItemDigest,
  immutableUpdateRegistryIdentityDigest,
  immutableUpdateReleaseDigest,
  listSemanticResolutions,
  planSemanticResolveApply,
  planSemanticResolveChoice,
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
import { formatValidationErrors, validateSchemaDocument } from "../../registry/schemas/index.ts";

const workspaceRoot = resolve(import.meta.dirname, "../..");
const registryDirectory = resolve(workspaceRoot, "registry/generated");
const temporaryDirectories: string[] = [];

function json<T>(path: string): T {
  return JSON.parse(readFileSync(path, "utf8")) as T;
}

function fixture() {
  const project = createProjectFixture({ directoryPrefix: "mergora-semantic-resolve-" });
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

function conflictRelease(
  root: string,
  version = "0.0.2",
  declarationConflict = false,
): ImmutableUpdateRelease {
  const installed = manifest(root).items["official:button"]!;
  const files: ImmutableUpdateFile[] = installed.files.map((file) => {
    const bytes = readFileSync(resolve(root, basePath(file.base)));
    const binary = !(file.mediaType.startsWith("text/") || file.mediaType.includes("json"));
    let content = bytes.toString(binary ? "base64" : "utf8");
    if (file.logicalPath.endsWith("button.css")) {
      content = content.replace("align-items: center;", "align-items: flex-end;");
    } else if (declarationConflict && file.logicalPath.endsWith("button-css.d.ts")) {
      content = content.replace('declare module "*.css";', 'declare module "*.upstream";');
    }
    const nextBytes = Buffer.from(content, binary ? "base64" : "utf8");
    return {
      logicalPath: file.logicalPath,
      role: file.role,
      mediaType: file.mediaType,
      encoding: binary ? "base64" : "utf8",
      content,
      digest: sha256(nextBytes),
      executable: false,
    };
  });
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
    release: version,
    items: [item],
  };
  return { ...withoutDigest, manifestDigest: immutableUpdateReleaseDigest(withoutDigest) };
}

function cssFile(root: string): ManifestItem["files"][number] {
  return manifest(root).items["official:button"]!.files.find(({ target }) =>
    target.endsWith("button.css"),
  )!;
}

function makeLocalConflict(root: string): { readonly target: string; readonly bytes: Buffer } {
  const file = cssFile(root);
  const path = resolve(root, file.target);
  const text = readFileSync(path, "utf8").replace(
    "align-items: center;",
    "align-items: flex-start;",
  );
  writeFileSync(path, text);
  return { target: file.target, bytes: Buffer.from(text) };
}

function makeLocalDeclarationConflict(root: string): {
  readonly target: string;
  readonly bytes: Buffer;
} {
  const file = manifest(root).items["official:button"]!.files.find(({ target }) =>
    target.endsWith("button-css.d.ts"),
  )!;
  const path = resolve(root, file.target);
  const text = readFileSync(path, "utf8").replace(
    'declare module "*.css";',
    'declare module "*.local";',
  );
  writeFileSync(path, text);
  return { target: file.target, bytes: Buffer.from(text) };
}

function authoritativeInventory(root: string): Readonly<Record<string, string>> {
  const output: Record<string, string> = {};
  const visit = (directory: string): void => {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const path = resolve(directory, entry.name);
      const key = relative(root, path).replaceAll("\\", "/");
      if (key === ".mergora/transactions" || key.startsWith(".mergora/transactions/")) continue;
      if (entry.isDirectory()) visit(path);
      else if (entry.isFile()) output[key] = sha256(readFileSync(path));
    }
  };
  visit(root);
  return output;
}

function directoryInventory(root: string): Readonly<Record<string, string>> {
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

function conflictKey(root: string, id: string): string {
  return readdirSync(resolve(root, ".mergora/transactions", id, "conflicts"))[0]!;
}

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

describe("Semantic Sync conflict and explicit resolution", () => {
  it("creates a complete local-only bundle and leaves every authoritative byte unchanged", async () => {
    const project = fixture();
    const local = makeLocalConflict(project.root);
    const release = conflictRelease(project.root);
    const id = "20260718T120000.000Z-00000000000000000000000000000001";
    const options = {
      projectRoot: project.root,
      release,
      noInstall: true,
      conflictTransactionId: id,
    };
    const plan = planSemanticUpdate(options);
    expect(plan.conflicts).toContainEqual(expect.objectContaining({ target: local.target }));
    const before = authoritativeInventory(project.root);
    const result = await applySemanticUpdate(options, plan.planDigest);
    expect(result).toMatchObject({
      status: "conflicted",
      conflictTransactionId: id,
      liveProjectChanged: false,
    });
    expect(result.planDigest).toBe(plan.planDigest);
    expect(authoritativeInventory(project.root)).toEqual(before);
    const root = resolve(project.root, ".mergora/transactions", id);
    const key = conflictKey(project.root, id);
    for (const name of ["base", "local", "remote", "proposed", "conflict.json"]) {
      expect(existsSync(resolve(root, "conflicts", key, name))).toBe(true);
    }
    expect(readFileSync(resolve(root, "README.md"), "utf8")).toContain(
      "live project, provenance manifest, package metadata, and base store are unchanged",
    );
    expect(json(resolve(root, "conflicts", key, "conflict.json"))).toMatchObject({
      target: local.target,
      originalLivePreconditionDigest: sha256(local.bytes),
      safeResolutionChoices: ["keep-local", "take-upstream", "manual"],
    });
    expect(
      listSemanticResolutions({ projectRoot: project.root, transactionId: id }).unresolved,
    ).toEqual([expect.objectContaining({ target: local.target })]);
  });

  it("publishes a conflict tree only after every staged artifact verifies", async () => {
    const project = fixture();
    makeLocalConflict(project.root);
    const release = conflictRelease(project.root);
    const id = "20260718T120000.100Z-00000000000000000000000000000011";
    let stagedFiles = 0;
    const options = {
      projectRoot: project.root,
      release,
      noInstall: true,
      conflictTransactionId: id,
      faultInjector: (point: string) => {
        if (point === "stage-file" && ++stagedFiles === 4) {
          throw new Error("interrupt conflict artifact staging");
        }
      },
    };
    const plan = planSemanticUpdate(options);
    const before = authoritativeInventory(project.root);

    await expect(applySemanticUpdate(options, plan.planDigest)).rejects.toThrow(
      /interrupt conflict artifact staging/u,
    );
    expect(existsSync(resolve(project.root, ".mergora/transactions", id))).toBe(false);
    expect(
      readdirSync(resolve(project.root, ".mergora/transactions")).filter((name) =>
        name.includes(id),
      ),
    ).toEqual([]);
    expect(authoritativeInventory(project.root)).toEqual(before);

    const retry = {
      projectRoot: project.root,
      release,
      noInstall: true,
      conflictTransactionId: id,
    };
    expect(planSemanticUpdate(retry).planDigest).toBe(plan.planDigest);
    await expect(applySemanticUpdate(retry, plan.planDigest)).resolves.toMatchObject({
      status: "conflicted",
      conflictTransactionId: id,
    });
  });

  it("rolls back an interrupted multi-target resolve-choice journal", async () => {
    const project = fixture();
    const css = makeLocalConflict(project.root);
    const declaration = makeLocalDeclarationConflict(project.root);
    const release = conflictRelease(project.root, "0.0.2", true);
    const id = "20260718T120000.200Z-00000000000000000000000000000012";
    const updateOptions = {
      projectRoot: project.root,
      release,
      noInstall: true,
      conflictTransactionId: id,
    };
    const updatePlan = planSemanticUpdate(updateOptions);
    expect(updatePlan.conflicts.map(({ target }) => target)).toEqual(
      expect.arrayContaining([css.target, declaration.target]),
    );
    await applySemanticUpdate(updateOptions, updatePlan.planDigest);

    let committedFiles = 0;
    const interruptedChoice = {
      projectRoot: project.root,
      transactionId: id,
      choice: "take-upstream" as const,
      targets: [css.target, declaration.target],
      faultInjector: (point: string) => {
        if (point === "commit-file" && ++committedFiles === 1) {
          throw new Error("interrupt resolve-choice swap");
        }
      },
    };
    const choicePlan = planSemanticResolveChoice(interruptedChoice);
    expect(choicePlan.changes).toHaveLength(2);
    const conflictRoot = resolve(project.root, ".mergora/transactions", id);
    const before = directoryInventory(conflictRoot);

    expect(() => applySemanticResolveChoice(interruptedChoice, choicePlan.planDigest)).toThrow(
      /interrupt resolve-choice swap/u,
    );
    expect(directoryInventory(conflictRoot)).toEqual(before);
    expect(
      readdirSync(resolve(project.root, ".mergora/transactions")).some((name) =>
        name.includes(`mergora-resolve-choice-${id}`),
      ),
    ).toBe(false);
    expect(
      listSemanticResolutions({ projectRoot: project.root, transactionId: id }).unresolved,
    ).toHaveLength(2);

    const retry = {
      projectRoot: project.root,
      transactionId: id,
      choice: "take-upstream" as const,
      targets: [css.target, declaration.target],
    };
    expect(planSemanticResolveChoice(retry).planDigest).toBe(choicePlan.planDigest);
    let interruptedFiles = 0;
    const interrupted = {
      ...retry,
      faultInjector: (point: string) => {
        if (point === "commit-file" && ++interruptedFiles === 1) {
          throw new TransactionInterruption("simulate resolve-choice process interruption");
        }
      },
    };
    expect(() => applySemanticResolveChoice(interrupted, choicePlan.planDigest)).toThrow(
      TransactionInterruption,
    );
    expect(
      readdirSync(resolve(project.root, ".mergora/transactions")).some((name) =>
        name.includes(`mergora-resolve-choice-${id}`),
      ),
    ).toBe(true);
    expect(
      listSemanticResolutions({ projectRoot: project.root, transactionId: id }).unresolved,
    ).toHaveLength(2);
    expect(directoryInventory(conflictRoot)).toEqual(before);
    expect(
      readdirSync(resolve(project.root, ".mergora/transactions")).some((name) =>
        name.includes(`mergora-resolve-choice-${id}`),
      ),
    ).toBe(false);
    expect(applySemanticResolveChoice(retry, choicePlan.planDigest).planDigest).toBe(
      choicePlan.planDigest,
    );
    expect(
      listSemanticResolutions({ projectRoot: project.root, transactionId: id }).resolved,
    ).toHaveLength(2);
  });

  it("records take-local, commits through the transaction engine, and advances R provenance", async () => {
    const project = fixture();
    const local = makeLocalConflict(project.root);
    const release = conflictRelease(project.root);
    const remoteCss = release.items[0]!.files.find(({ logicalPath }) =>
      logicalPath.endsWith("button.css"),
    )!;
    const id = "20260718T120001.000Z-00000000000000000000000000000002";
    const updateOptions = {
      projectRoot: project.root,
      release,
      noInstall: true,
      conflictTransactionId: id,
    };
    await applySemanticUpdate(updateOptions, planSemanticUpdate(updateOptions).planDigest);

    const choiceOptions = {
      projectRoot: project.root,
      transactionId: id,
      choice: "take-local" as const,
      targets: [local.target],
    };
    const choice = planSemanticResolveChoice(choiceOptions);
    expect(planSemanticResolveChoice(choiceOptions)).toEqual(choice);
    const beforeChoice = directoryInventory(project.root);
    expect(() => Reflect.apply(applySemanticResolveChoice, undefined, [choiceOptions])).toThrow(
      /exact reviewed plan digest/iu,
    );
    expect(() => applySemanticResolveChoice(choiceOptions, sha256("stale-choice"))).toThrow(
      /plan changed before apply/iu,
    );
    expect(directoryInventory(project.root)).toEqual(beforeChoice);
    applySemanticResolveChoice(choiceOptions, choice.planDigest);
    expect(listSemanticResolutions({ projectRoot: project.root, transactionId: id })).toMatchObject(
      {
        unresolved: [],
        resolved: [{ target: local.target, resolution: "take-local" }],
      },
    );

    const applyOptions = { projectRoot: project.root, transactionId: id, noInstall: true };
    const plan = planSemanticResolveApply(applyOptions);
    expect(planSemanticResolveApply(applyOptions)).toEqual(plan);
    const schema = validateSchemaDocument("operation-plan", plan);
    expect(formatValidationErrors(schema.errors)).toBe("");
    expect(schema.ok).toBe(true);
    expect(plan.command).toBe("resolve");
    expect(plan.conflicts).toEqual([]);
    const beforeApply = directoryInventory(project.root);
    expect(() => Reflect.apply(applySemanticResolution, undefined, [applyOptions])).toThrow(
      /exact reviewed plan digest/iu,
    );
    expect(() => applySemanticResolution(applyOptions, sha256("stale-resolution"))).toThrow(
      /plan changed before apply/iu,
    );
    expect(directoryInventory(project.root)).toEqual(beforeApply);
    const result = applySemanticResolution(applyOptions, plan.planDigest);
    expect(result.planDigest).toBe(plan.planDigest);
    expect(result.transaction.state).toBe("committed");
    expect(
      json<{ planDigest: string }>(
        resolve(
          project.root,
          ".mergora/transactions",
          result.transaction.transactionId!,
          "plan.json",
        ),
      ).planDigest,
    ).toBe(plan.planDigest);
    expect(result.decisions).toEqual([
      expect.objectContaining({ target: local.target, resolution: "take-local" }),
    ]);
    expect(readFileSync(resolve(project.root, local.target))).toEqual(local.bytes);
    const next = cssFile(project.root);
    expect(next.base).toBe(remoteCss.digest);
    expect(next.installed).toBe(sha256(local.bytes));
    expect(readFileSync(resolve(project.root, basePath(next.base)))).toEqual(
      Buffer.from(remoteCss.content, "utf8"),
    );
    expect(manifest(project.root).items["official:button"]!.resolved).toBe("0.0.2");
    expect(listSemanticResolutions({ projectRoot: project.root, transactionId: id }).state).toBe(
      "resolved",
    );
  });

  it("refuses stale live bytes before accepting or applying any resolution", async () => {
    const project = fixture();
    const local = makeLocalConflict(project.root);
    const id = "20260718T120002.000Z-00000000000000000000000000000003";
    const updateOptions = {
      projectRoot: project.root,
      release: conflictRelease(project.root),
      noInstall: true,
      conflictTransactionId: id,
    };
    await applySemanticUpdate(updateOptions, planSemanticUpdate(updateOptions).planDigest);
    writeFileSync(
      resolve(project.root, local.target),
      `${local.bytes.toString("utf8")}\n/* later */\n`,
    );
    const live = readFileSync(resolve(project.root, local.target));
    expect(() =>
      planSemanticResolveChoice({
        projectRoot: project.root,
        transactionId: id,
        choice: "take-upstream",
        targets: [local.target],
      }),
    ).toThrow(/changed after conflict creation/iu);
    expect(() =>
      planSemanticResolveApply({ projectRoot: project.root, transactionId: id, noInstall: true }),
    ).toThrow(/changed after conflict creation/iu);
    expect(readFileSync(resolve(project.root, local.target))).toEqual(live);
  });

  it("validates manual markers and supports reset without touching the live target", async () => {
    const project = fixture();
    const local = makeLocalConflict(project.root);
    const id = "20260718T120003.000Z-00000000000000000000000000000004";
    const updateOptions = {
      projectRoot: project.root,
      release: conflictRelease(project.root),
      noInstall: true,
      conflictTransactionId: id,
    };
    await applySemanticUpdate(updateOptions, planSemanticUpdate(updateOptions).planDigest);
    const key = conflictKey(project.root, id);
    const proposed = resolve(
      project.root,
      ".mergora/transactions",
      id,
      "conflicts",
      key,
      "proposed",
    );
    writeFileSync(proposed, "<<<<<<< local\n=======\n>>>>>>> upstream\n");
    expect(() =>
      planSemanticResolveChoice({
        projectRoot: project.root,
        transactionId: id,
        choice: "resolved",
        targets: [local.target],
      }),
    ).toThrow(/conflict markers/iu);

    writeFileSync(proposed, "{");
    expect(() =>
      planSemanticResolveChoice({
        projectRoot: project.root,
        transactionId: id,
        choice: "resolved",
        targets: [local.target],
      }),
    ).toThrow(/media adapter|parse/iu);

    // Restore the recorded proposal before applying another recorded choice.
    writeFileSync(proposed, local.bytes);
    const upstream = {
      projectRoot: project.root,
      transactionId: id,
      choice: "take-upstream" as const,
      targets: [local.target],
    };
    applySemanticResolveChoice(upstream, planSemanticResolveChoice(upstream).planDigest);
    const reset = { ...upstream, choice: "reset" as const };
    applySemanticResolveChoice(reset, planSemanticResolveChoice(reset).planDigest);
    expect(
      listSemanticResolutions({ projectRoot: project.root, transactionId: id }).unresolved,
    ).toEqual([expect.objectContaining({ target: local.target })]);
    expect(readFileSync(resolve(project.root, local.target))).toEqual(local.bytes);
  });

  it("detects conflict snapshot corruption before listing or resolving", async () => {
    const project = fixture();
    makeLocalConflict(project.root);
    const id = "20260718T120004.000Z-00000000000000000000000000000005";
    const updateOptions = {
      projectRoot: project.root,
      release: conflictRelease(project.root),
      noInstall: true,
      conflictTransactionId: id,
    };
    await applySemanticUpdate(updateOptions, planSemanticUpdate(updateOptions).planDigest);
    const snapshotRoot = resolve(project.root, ".mergora/transactions", id, "snapshots");
    const key = readdirSync(snapshotRoot)[0]!;
    writeFileSync(resolve(snapshotRoot, key, "remote"), "corrupt");
    expect(() => listSemanticResolutions({ projectRoot: project.root, transactionId: id })).toThrow(
      /digest verification/iu,
    );
  });
});
