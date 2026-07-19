import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import {
  TransactionInterruption,
  applyInit,
  applySourceAdd,
  applySourceAdopt,
  applySourceRemove,
  listIncompleteTransactions,
  loadSourceItem,
  planInit,
  planRecovery,
  planSourceAdd,
  planSourceAdopt,
  planSourceRemove,
  projectStatus,
  recoverTransaction,
  type PackageManagerRunner,
} from "../../packages/cli/src/index.ts";
import {
  formatValidationErrors,
  validateSchemaDocument,
  type SchemaKind,
} from "../../registry/schemas/index.ts";
import { createProjectFixture } from "../cli-fixtures/project-fixture.ts";
import { createAuthenticModeFixture } from "../cli-package-modes/authentic-mode-fixture.ts";

const workspaceRoot = resolve(import.meta.dirname, "../..");
const registryDirectory = resolve(workspaceRoot, "registry/generated");
const temporaryDirectories: string[] = [];

function fixture() {
  const project = createProjectFixture();
  temporaryDirectories.push(project.root);
  applyInit({ projectRoot: project.root }, planInit({ projectRoot: project.root }).planDigest);
  return project;
}

function assertSchema(kind: SchemaKind, value: unknown): void {
  const result = validateSchemaDocument(kind, value);
  expect(formatValidationErrors(result.errors)).toBe("");
  expect(result.ok).toBe(true);
}

function jsonFile(path: string): unknown {
  return JSON.parse(readFileSync(path, "utf8")) as unknown;
}

function transactionFiles(root: string, id: string) {
  const directory = resolve(root, ".mergora/transactions", id);
  return {
    record: jsonFile(resolve(directory, "transaction.json")),
    journal: jsonFile(resolve(directory, "journal.json")),
    plan: jsonFile(resolve(directory, "plan.json")),
  };
}

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

describe("transactional source ownership", () => {
  it("rejects package-owned remove and adopt before planning any source mutation", async () => {
    const project = fixture();
    const config = jsonFile(resolve(project.root, "mergora.json")) as Record<string, unknown>;
    const mode = await createAuthenticModeFixture(project.root, config, "package-to-source");
    writeFileSync(resolve(project.root, ".mergora/manifest.json"), mode.currentManifest);
    writeFileSync(resolve(project.root, "package.json"), mode.packageBefore);
    const transactionRoot = resolve(project.root, ".mergora/transactions");
    const transactionsBefore = readdirSync(transactionRoot).sort();
    const manifestBefore = readFileSync(resolve(project.root, ".mergora/manifest.json"));
    const options = { projectRoot: project.root, itemIds: ["button"], registryDirectory };

    expect(() => planSourceRemove(options)).toThrowError(
      expect.objectContaining({ code: "DISTRIBUTION_MODE_MIGRATION_REQUIRED" }),
    );
    expect(() => planSourceAdopt(options)).toThrowError(
      expect.objectContaining({ code: "DISTRIBUTION_MODE_MIGRATION_REQUIRED" }),
    );
    expect(readdirSync(transactionRoot).sort()).toEqual(transactionsBefore);
    expect(readFileSync(resolve(project.root, ".mergora/manifest.json"))).toEqual(manifestBefore);
    expect(existsSync(resolve(project.root, mode.sourceTarget))).toBe(false);
  });

  it("plans complete closure with explicit direct/transitive ownership reasons", () => {
    const project = fixture();
    const plan = planSourceAdd({
      projectRoot: project.root,
      itemIds: ["provider"],
      registryDirectory,
    });
    expect(plan.items).toEqual([
      expect.objectContaining({ id: "official:direction", direct: false }),
      expect.objectContaining({ id: "official:provider", direct: true }),
      expect.objectContaining({ id: "official:slot", direct: false }),
    ]);
    expect(
      plan.fileOperations
        .filter(({ owner }) => owner !== "official:provider")
        .every(({ reason }) => reason.includes("Transitive registry dependency")),
    ).toBe(true);
    expect(
      plan.fileOperations
        .filter(({ owner }) => owner === "official:provider")
        .every(({ reason }) => reason.includes("Directly requested")),
    ).toBe(true);
  });

  it("rejects invalid proposed source during read-only planning before transaction metadata", () => {
    const project = fixture();
    const fixtureRegistry = resolve(project.root, "invalid-source-registry");
    const fixtureItems = resolve(fixtureRegistry, "native-source-items");
    mkdirSync(fixtureItems, { recursive: true });
    const button = jsonFile(resolve(registryDirectory, "native-source-items/button.json")) as {
      files: { content: string; mediaType: string }[];
    };
    const script = button.files.find(({ mediaType }) => mediaType.includes("typescript"))!;
    script.content = "export const = ;\n";
    writeFileSync(resolve(fixtureItems, "button.json"), `${JSON.stringify(button)}\n`);
    const transactionRoot = resolve(project.root, ".mergora/transactions");
    const transactionsBefore = readdirSync(transactionRoot).sort();

    expect(() =>
      planSourceAdd({
        projectRoot: project.root,
        itemIds: ["button"],
        registryDirectory: fixtureRegistry,
      }),
    ).toThrowError(
      expect.objectContaining({ code: "TRANSACTION_STAGED_VALIDATION_FAILED", exitCode: 8 }),
    );
    expect(readdirSync(transactionRoot).sort()).toEqual(transactionsBefore);
    expect(existsSync(resolve(project.root, "src/components/mergora/button.tsx"))).toBe(false);
  });

  it("requires a type-level reviewed plan digest and rejects a stale one before writes", () => {
    const project = fixture();
    const options = { projectRoot: project.root, itemIds: ["button"], registryDirectory };
    const transactionRoot = resolve(project.root, ".mergora/transactions");
    const transactionsBefore = readdirSync(transactionRoot).sort();

    expect(() => applySourceAdd(options, `sha256:${"0".repeat(64)}`)).toThrowError(
      expect.objectContaining({ code: "PLAN_PRECONDITION_STALE", exitCode: 8 }),
    );
    expect(readdirSync(transactionRoot).sort()).toEqual(transactionsBefore);
    expect(existsSync(resolve(project.root, "src/components/mergora/button.tsx"))).toBe(false);
  });

  it("adds and removes exact source idempotently with schema-valid manifest-last records", () => {
    const project = fixture();
    const options = { projectRoot: project.root, itemIds: ["button"], registryDirectory };
    const firstPlan = planSourceAdd(options);
    const secondPlan = planSourceAdd(options);

    expect(secondPlan).toEqual(firstPlan);
    assertSchema("operation-plan", firstPlan);
    const result = applySourceAdd(options, firstPlan.planDigest);
    expect(result.transaction.state).toBe("committed");
    expect(result.transaction.transactionId).toMatch(
      /^[0-9]{8}T[0-9]{6}\.[0-9]{3}Z-[0-9a-f]{32}$/u,
    );
    const transactionId = result.transaction.transactionId!;
    const artifacts = transactionFiles(project.root, transactionId);
    assertSchema("transaction", artifacts.record);
    assertSchema("transaction-journal", artifacts.journal);
    assertSchema("operation-plan", artifacts.plan);

    const manifestPath = resolve(project.root, ".mergora/manifest.json");
    const manifest = jsonFile(manifestPath) as {
      items: Record<string, { files: readonly { target: string; base: string }[] }>;
    };
    assertSchema("manifest", manifest);
    const item = manifest.items["official:button"]!;
    expect(item.files).toHaveLength(4);
    for (const file of item.files) {
      const hexadecimal = file.base.slice("sha256:".length);
      expect(readFileSync(resolve(project.root, file.target))).toEqual(
        readFileSync(
          resolve(
            project.root,
            `.mergora/bases/sha256/${hexadecimal.slice(0, 2)}/${hexadecimal.slice(2)}.blob`,
          ),
        ),
      );
    }
    expect(projectStatus(project.root).items[0]?.status).toBe("clean");

    const journal = artifacts.journal as {
      entries: readonly { checkpoint: string; target?: string }[];
    };
    const liveCommits = journal.entries.filter(
      ({ checkpoint }) => checkpoint === "commit-target" || checkpoint === "manifest-committed",
    );
    expect(liveCommits.at(-1)).toMatchObject({
      checkpoint: "manifest-committed",
      target: ".mergora/manifest.json",
    });

    const manifestBytes = readFileSync(manifestPath);
    const noOp = applySourceAdd(options, planSourceAdd(options).planDigest);
    expect(noOp.transaction.state).toBe("no-op");
    expect(readFileSync(manifestPath)).toEqual(manifestBytes);

    const removePlan = planSourceRemove(options);
    assertSchema("operation-plan", removePlan);
    const removed = applySourceRemove(options, removePlan.planDigest);
    expect(removed.transaction.state).toBe("committed");
    expect(item.files.every(({ target }) => !existsSync(resolve(project.root, target)))).toBe(true);
    expect(
      Object.keys((jsonFile(manifestPath) as { items: Record<string, unknown> }).items),
    ).toEqual([]);
  });

  it("preserves registry source bytes exactly in live files and content-addressed bases", () => {
    const project = fixture();
    const registryFixture = resolve(project.root, "registry-fixture");
    mkdirSync(resolve(registryFixture, "items"), { recursive: true });
    const payload = JSON.parse(
      readFileSync(resolve(registryDirectory, "native-source-items/button.json"), "utf8"),
    ) as { files: Array<{ content: string }> };
    for (const file of payload.files) {
      file.content = file.content.replaceAll("\n", "\r\n");
    }
    writeFileSync(resolve(registryFixture, "items/button.json"), JSON.stringify(payload));

    const options = {
      projectRoot: project.root,
      itemIds: ["button"],
      registryDirectory: registryFixture,
    };
    applySourceAdd(options, planSourceAdd(options).planDigest);
    const manifest = jsonFile(resolve(project.root, ".mergora/manifest.json")) as {
      items: Record<string, { files: readonly { target: string; base: string }[] }>;
    };
    const files = manifest.items["official:button"]!.files;
    for (const file of files) {
      const hexadecimal = file.base.slice("sha256:".length);
      const live = readFileSync(resolve(project.root, file.target));
      const base = readFileSync(
        resolve(
          project.root,
          `.mergora/bases/sha256/${hexadecimal.slice(0, 2)}/${hexadecimal.slice(2)}.blob`,
        ),
      );
      expect(live).toEqual(base);
    }
    const typescript = readFileSync(
      resolve(project.root, files.find(({ target }) => target.endsWith("button.tsx"))!.target),
      "utf8",
    );
    expect(typescript).toContain("\r\n");
    expect(typescript.replaceAll("\r\n", "")).not.toContain("\n");
  });

  it("adopts exact bytes without touching source and refuses divergent unknown ancestry", () => {
    const exact = fixture();
    const source = loadSourceItem("button", { registryDirectory });
    for (const file of source.files) {
      const target = resolve(
        exact.root,
        "src/components/mergora/button",
        file.targetPath.split("/").at(-1)!,
      );
      mkdirSync(dirname(target), { recursive: true });
      writeFileSync(target, file.content);
    }
    const sourceBefore = source.files.map((file) =>
      readFileSync(
        resolve(exact.root, "src/components/mergora/button", file.targetPath.split("/").at(-1)!),
      ),
    );
    const options = { projectRoot: exact.root, itemIds: ["button"], registryDirectory };
    const adopted = applySourceAdopt(options, planSourceAdopt(options).planDigest);
    expect(adopted.transaction.state).toBe("committed");
    source.files.forEach((file, index) => {
      expect(
        readFileSync(
          resolve(exact.root, "src/components/mergora/button", file.targetPath.split("/").at(-1)!),
        ),
      ).toEqual(sourceBefore[index]);
    });

    const divergent = fixture();
    for (const [index, file] of source.files.entries()) {
      const target = resolve(
        divergent.root,
        "src/components/mergora/button",
        file.targetPath.split("/").at(-1)!,
      );
      mkdirSync(dirname(target), { recursive: true });
      writeFileSync(target, index === 0 ? `${file.content}// local fork\n` : file.content);
    }
    const manifestPath = resolve(divergent.root, ".mergora/manifest.json");
    const manifestBefore = readFileSync(manifestPath);
    const divergentOptions = {
      projectRoot: divergent.root,
      itemIds: ["button"],
      registryDirectory,
    };
    const plan = planSourceAdopt(divergentOptions);
    expect(plan.conflicts).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ kind: "ownership", reason: expect.stringContaining("unknown") }),
      ]),
    );
    expect(plan.fileOperations).toEqual(
      expect.arrayContaining([expect.objectContaining({ operation: "conflict", base: null })]),
    );
    expect(() => applySourceAdopt(divergentOptions, plan.planDigest)).toThrow(/conflict/u);
    expect(readFileSync(manifestPath)).toEqual(manifestBefore);
    expect(existsSync(resolve(divergent.root, ".mergora/bases"))).toBe(false);
  });

  it("restores authoritative bytes after package-manager failure", () => {
    const project = fixture();
    const packagePath = resolve(project.root, "package.json");
    const manifestPath = resolve(project.root, ".mergora/manifest.json");
    const lockPath = resolve(project.root, "pnpm-lock.yaml");
    const before = [packagePath, manifestPath, lockPath].map((path) => readFileSync(path));
    const runner: PackageManagerRunner = () => {
      writeFileSync(lockPath, "partial lock mutation\n");
      return { status: 1 };
    };
    const options = {
      projectRoot: project.root,
      itemIds: ["dialog"],
      registryDirectory,
      packageManagerRunner: runner,
    };
    const plan = planSourceAdd(options);
    expect(() => applySourceAdd(options, plan.planDigest)).toThrow(/will be restored/u);
    expect([packagePath, manifestPath, lockPath].map((path) => readFileSync(path))).toEqual(before);
    const dialog = loadSourceItem("dialog", { registryDirectory });
    expect(
      dialog.files.every(
        (file) =>
          !existsSync(
            resolve(
              project.root,
              "src/components/mergora/dialog",
              file.targetPath.split("/").at(-1)!,
            ),
          ),
      ),
    ).toBe(true);
    const transactionDirectory = resolve(project.root, ".mergora/transactions");
    const ids = readdirSync(transactionDirectory, { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map(({ name }) => name)
      .filter((id) => {
        const transactionPlan = jsonFile(resolve(transactionDirectory, id, "plan.json")) as {
          command?: unknown;
        };
        return transactionPlan.command === "add";
      });
    expect(ids).toHaveLength(1);
    expect((transactionFiles(project.root, ids[0]!).record as { state: string }).state).toBe(
      "rolled-back",
    );
  });

  it("recovers an interrupted partial commit conservatively and byte-identically", () => {
    const project = fixture();
    const manifestPath = resolve(project.root, ".mergora/manifest.json");
    const manifestBefore = readFileSync(manifestPath);
    const options = {
      projectRoot: project.root,
      itemIds: ["button"],
      registryDirectory,
      faultInjector: (point: string) => {
        if (point === "commit-file") throw new TransactionInterruption("simulated crash");
      },
    };
    const plan = planSourceAdd(options);
    expect(() => applySourceAdd(options, plan.planDigest)).toThrow(TransactionInterruption);
    const [transactionId] = listIncompleteTransactions(project.root);
    expect(transactionId).toBeDefined();
    expect(existsSync(resolve(project.root, ".mergora/.lock"))).toBe(true);

    const recovery = planRecovery({ root: project.root, transactionId });
    expect(recovery.action).toBe("rollback");
    const result = recoverTransaction(
      { root: project.root, transactionId, allowCurrentProcessLockForTesting: true },
      recovery.plan.planDigest,
    );
    expect(result).toMatchObject({ action: "rollback", state: "rolled-back" });
    expect(readFileSync(manifestPath)).toEqual(manifestBefore);
    expect(existsSync(resolve(project.root, "src/components/mergora/button"))).toBe(false);
    expect(existsSync(resolve(project.root, ".mergora/.lock"))).toBe(false);
    expect(listIncompleteTransactions(project.root)).toEqual([]);
  });

  it("refuses customized or missing-base removal and --keep-files detaches without deletion", () => {
    const project = fixture();
    const addOptions = { projectRoot: project.root, itemIds: ["button"], registryDirectory };
    applySourceAdd(addOptions, planSourceAdd(addOptions).planDigest);
    const manifestPath = resolve(project.root, ".mergora/manifest.json");
    const manifest = jsonFile(manifestPath) as {
      items: Record<string, { files: readonly { target: string; base: string }[] }>;
    };
    const file = manifest.items["official:button"]!.files[0]!;
    const targetPath = resolve(project.root, file.target);
    writeFileSync(targetPath, "// local customization\n");
    const customized = readFileSync(targetPath);
    const manifestBefore = readFileSync(manifestPath);

    const conflictPlan = planSourceRemove(addOptions);
    expect(conflictPlan.conflicts).toEqual(
      expect.arrayContaining([expect.objectContaining({ kind: "modify-delete" })]),
    );
    expect(() => applySourceRemove(addOptions, conflictPlan.planDigest)).toThrow(/conflict/u);
    expect(readFileSync(targetPath)).toEqual(customized);
    expect(readFileSync(manifestPath)).toEqual(manifestBefore);

    const keepOptions = { ...addOptions, keepFiles: true };
    const keepPlan = planSourceRemove(keepOptions);
    expect(keepPlan.conflicts).toEqual([]);
    expect(
      keepPlan.fileOperations
        .filter(({ target }) => target.startsWith("src/"))
        .every(({ operation }) => operation === "keep-local"),
    ).toBe(true);
    expect(keepPlan.fileOperations).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          operation: "structured-patch",
          target: ".mergora/manifest.json",
        }),
      ]),
    );
    const detached = applySourceRemove(keepOptions, keepPlan.planDigest);
    expect(detached.retainedFiles).toContain(file.target);
    expect(readFileSync(targetPath)).toEqual(customized);
    expect(
      Object.keys((jsonFile(manifestPath) as { items: Record<string, unknown> }).items),
    ).toEqual([]);

    const missingBase = fixture();
    const missingOptions = {
      projectRoot: missingBase.root,
      itemIds: ["button"],
      registryDirectory,
    };
    applySourceAdd(missingOptions, planSourceAdd(missingOptions).planDigest);
    const missingManifest = jsonFile(resolve(missingBase.root, ".mergora/manifest.json")) as {
      items: Record<string, { files: readonly { base: string }[] }>;
    };
    const base = missingManifest.items["official:button"]!.files[0]!.base;
    const hexadecimal = base.slice("sha256:".length);
    rmSync(
      resolve(
        missingBase.root,
        `.mergora/bases/sha256/${hexadecimal.slice(0, 2)}/${hexadecimal.slice(2)}.blob`,
      ),
    );
    expect(planSourceRemove(missingOptions).conflicts[0]?.reason).toContain("base is missing");
  });

  it("prunes provenance for an already locally deleted owned target", () => {
    const project = fixture();
    const options = { projectRoot: project.root, itemIds: ["button"], registryDirectory };
    applySourceAdd(options, planSourceAdd(options).planDigest);
    const manifestPath = resolve(project.root, ".mergora/manifest.json");
    const manifest = jsonFile(manifestPath) as {
      items: Record<string, { files: readonly { target: string }[] }>;
    };
    const missingTarget = manifest.items["official:button"]!.files[0]!.target;
    rmSync(resolve(project.root, missingTarget));

    const removal = planSourceRemove(options);
    expect(removal.conflicts).toEqual([]);
    expect(removal.fileOperations).toContainEqual(
      expect.objectContaining({
        operation: "local-delete",
        target: missingTarget,
        local: null,
        proposed: null,
      }),
    );
    applySourceRemove(options, removal.planDigest);
    expect(existsSync(resolve(project.root, missingTarget))).toBe(false);
    expect(
      Object.keys((jsonFile(manifestPath) as { items: Record<string, unknown> }).items),
    ).toEqual([]);
  });

  it("removes only the last dependency owner and retains user-modified declarations", () => {
    const project = fixture();
    const options = {
      projectRoot: project.root,
      itemIds: ["dialog"],
      registryDirectory,
      noInstall: true,
    };
    applySourceAdd(options, planSourceAdd(options).planDigest);
    const removal = planSourceRemove(options);
    expect(removal.dependencyChanges).toEqual([
      expect.objectContaining({
        package: "react-aria-components",
        operation: "remove",
        owners: ["official:dialog"],
      }),
    ]);
    applySourceRemove(options, removal.planDigest);
    expect(
      (
        jsonFile(resolve(project.root, "package.json")) as {
          dependencies: Record<string, string>;
        }
      ).dependencies["react-aria-components"],
    ).toBeUndefined();

    const modified = fixture();
    const modifiedOptions = { ...options, projectRoot: modified.root };
    applySourceAdd(modifiedOptions, planSourceAdd(modifiedOptions).planDigest);
    const packagePath = resolve(modified.root, "package.json");
    const document = jsonFile(packagePath) as { dependencies: Record<string, string> };
    document.dependencies["react-aria-components"] = "^1.19.0";
    writeFileSync(packagePath, `${JSON.stringify(document, null, 2)}\n`);
    const conflict = planSourceRemove(modifiedOptions);
    expect(conflict.conflicts).toEqual(
      expect.arrayContaining([expect.objectContaining({ kind: "structured-patch" })]),
    );
    expect(() => applySourceRemove(modifiedOptions, conflict.planDigest)).toThrow(/conflict/u);
    expect(
      (jsonFile(packagePath) as { dependencies: Record<string, string> }).dependencies[
        "react-aria-components"
      ],
    ).toBe("^1.19.0");
  }, 10_000);
});
