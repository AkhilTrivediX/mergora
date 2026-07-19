import { existsSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import {
  applyInit,
  applySourceAdd,
  planInit,
  planSourceAdd,
} from "../../packages/cli/src/index.ts";
import {
  planRollback,
  rollbackTransaction,
  type PackageManagerInvocation,
} from "../../packages/cli/src/transaction-engine.ts";
import { createProjectFixture } from "../cli-fixtures/project-fixture.ts";

const workspaceRoot = resolve(import.meta.dirname, "../..");
const registryDirectory = resolve(workspaceRoot, "registry/generated");
const temporaryDirectories: string[] = [];

function fixture() {
  const project = createProjectFixture();
  temporaryDirectories.push(project.root);
  applyInit({ projectRoot: project.root }, planInit({ projectRoot: project.root }).planDigest);
  return project;
}

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

describe("completed transaction rollback", () => {
  it("restores the exact pre-state as a new manifest-last transaction", () => {
    const project = fixture();
    const manifestPath = resolve(project.root, ".mergora/manifest.json");
    const manifestBefore = readFileSync(manifestPath);
    const addOptions = {
      projectRoot: project.root,
      itemIds: ["button"],
      registryDirectory,
      noInstall: true,
    };
    const added = applySourceAdd(addOptions, planSourceAdd(addOptions).planDigest);
    const addedTransaction = added.transaction.transactionId!;
    const addedTargets = added.transaction.written.filter((target) => target.startsWith("src/"));

    const firstPlan = planRollback({ root: project.root, transactionId: addedTransaction });
    const secondPlan = planRollback({ root: project.root, transactionId: addedTransaction });
    expect(secondPlan).toEqual(firstPlan);
    expect(firstPlan.plan).toMatchObject({ command: "rollback", conflicts: [] });
    expect(firstPlan.plan.fileOperations).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ target: ".mergora/manifest.json" }),
        expect.objectContaining({ target: expect.stringMatching(/button\.tsx$/u) }),
      ]),
    );

    const result = rollbackTransaction(
      { root: project.root, transactionId: addedTransaction, noInstall: true },
      firstPlan.plan.planDigest,
    );
    expect(result.rollbackOf).toBe(addedTransaction);
    expect(result.transaction).toMatchObject({ state: "committed" });
    expect(result.transaction.transactionId).not.toBe(addedTransaction);
    expect(readFileSync(manifestPath)).toEqual(manifestBefore);
    expect(addedTargets.every((target) => !existsSync(resolve(project.root, target)))).toBe(true);

    const rollbackJournal = JSON.parse(
      readFileSync(
        resolve(
          project.root,
          ".mergora/transactions",
          result.transaction.transactionId!,
          "journal.json",
        ),
        "utf8",
      ),
    ) as { entries: readonly { checkpoint: string; target?: string }[] };
    const commits = rollbackJournal.entries.filter(
      ({ checkpoint }) => checkpoint === "commit-target" || checkpoint === "manifest-committed",
    );
    expect(commits.at(-1)).toMatchObject({
      checkpoint: "manifest-committed",
      target: ".mergora/manifest.json",
    });
  });

  it("reports a stale live target and leaves every byte unchanged", () => {
    const project = fixture();
    const addOptions = {
      projectRoot: project.root,
      itemIds: ["button"],
      registryDirectory,
      noInstall: true,
    };
    const added = applySourceAdd(addOptions, planSourceAdd(addOptions).planDigest);
    const transactionId = added.transaction.transactionId!;
    const target = added.transaction.written.find((entry) => entry.endsWith("button.tsx"))!;
    const targetPath = resolve(project.root, target);
    writeFileSync(targetPath, `${readFileSync(targetPath, "utf8")}\n// local change\n`);
    const liveBefore = readFileSync(targetPath);
    const manifestPath = resolve(project.root, ".mergora/manifest.json");
    const manifestBefore = readFileSync(manifestPath);
    const transactionCount = readdirSync(resolve(project.root, ".mergora/transactions")).length;

    const plan = planRollback({ root: project.root, transactionId });
    expect(plan.plan.conflicts).toEqual([expect.objectContaining({ target, kind: "ownership" })]);
    expect(() =>
      rollbackTransaction({ root: project.root, transactionId }, plan.plan.planDigest),
    ).toThrow(/cannot overwrite/u);
    expect(readFileSync(targetPath)).toEqual(liveBefore);
    expect(readFileSync(manifestPath)).toEqual(manifestBefore);
    expect(readdirSync(resolve(project.root, ".mergora/transactions"))).toHaveLength(
      transactionCount,
    );
  });

  it("uses fixed frozen package-manager arguments after restoring manifests and lockfiles", () => {
    const project = fixture();
    const invocations: PackageManagerInvocation[] = [];
    const runner = (invocation: PackageManagerInvocation) => {
      invocations.push(invocation);
      return { status: 0 };
    };
    const packageBefore = readFileSync(resolve(project.root, "package.json"));
    const lockBefore = readFileSync(resolve(project.root, "pnpm-lock.yaml"));
    const addOptions = {
      projectRoot: project.root,
      itemIds: ["dialog"],
      registryDirectory,
      packageManagerRunner: runner,
    };
    const added = applySourceAdd(addOptions, planSourceAdd(addOptions).planDigest);
    expect(invocations[0]?.arguments).toContain("--no-frozen-lockfile");

    const transactionId = added.transaction.transactionId!;
    const plan = planRollback({ root: project.root, transactionId });
    expect(plan.packageManager).toBe("pnpm");
    expect(plan.installInvocation?.arguments).toContain("--frozen-lockfile");
    rollbackTransaction(
      { root: project.root, transactionId, packageManagerRunner: runner },
      plan.plan.planDigest,
    );

    expect(invocations.at(-1)).toMatchObject({
      executable: "pnpm",
      arguments: expect.arrayContaining(["install", "--ignore-scripts", "--frozen-lockfile"]),
    });
    expect(invocations.at(-1)?.arguments).not.toContain("--no-frozen-lockfile");
    expect(readFileSync(resolve(project.root, "package.json"))).toEqual(packageBefore);
    expect(readFileSync(resolve(project.root, "pnpm-lock.yaml"))).toEqual(lockBefore);
  });
});
