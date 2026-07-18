import { existsSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { relative, resolve } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import {
  applyInit,
  applySourceAdd,
  listIncompleteTransactions,
  planRecovery,
  planSourceAdd,
  recoverTransaction,
  sha256,
  TransactionInterruption,
  type TransactionFaultPoint,
} from "../../packages/cli/src/index.ts";
import { basePath, type ProvenanceManifest } from "../../packages/cli/src/source-operations.ts";
import { createProjectFixture } from "../cli-fixtures/project-fixture.ts";

const workspaceRoot = resolve(import.meta.dirname, "../..");
const registryDirectory = resolve(workspaceRoot, "registry/generated");
const temporaryDirectories: string[] = [];

const FAULT_POINT_SET: Readonly<Record<TransactionFaultPoint, true>> = {
  "lock-acquired": true,
  "transaction-created": true,
  "stage-file": true,
  "stage-complete": true,
  "validation-complete": true,
  "backup-file": true,
  "backup-complete": true,
  "commit-file": true,
  "manifest-committed": true,
  "package-manager-start": true,
  "package-manager-complete": true,
  "post-validation-complete": true,
  finalized: true,
};
const FAULT_POINTS = Object.keys(FAULT_POINT_SET) as TransactionFaultPoint[];

function fixture() {
  const project = createProjectFixture({ directoryPrefix: "mergora-security-fault-" });
  temporaryDirectories.push(project.root);
  applyInit({ projectRoot: project.root });
  return project;
}

function authoritativeInventory(root: string): Readonly<Record<string, string>> {
  const result: Record<string, string> = {};
  const visit = (directory: string): void => {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const path = resolve(directory, entry.name);
      const key = relative(root, path).replaceAll("\\", "/");
      if (key === ".mergora/transactions" || key === ".mergora/.lock") continue;
      if (entry.isDirectory()) visit(path);
      else if (entry.isFile()) result[key] = sha256(readFileSync(path));
    }
  };
  visit(root);
  return result;
}

function readManifest(root: string): ProvenanceManifest {
  return JSON.parse(
    readFileSync(resolve(root, ".mergora/manifest.json"), "utf8"),
  ) as ProvenanceManifest;
}

function expectCommittedStateValid(root: string, itemId: string): void {
  expect(() => JSON.parse(readFileSync(resolve(root, "mergora.json"), "utf8"))).not.toThrow();
  expect(() => JSON.parse(readFileSync(resolve(root, "package.json"), "utf8"))).not.toThrow();
  const current = readManifest(root);
  const item = current.items[`official:${itemId}`];
  expect(item).toBeDefined();
  for (const file of item!.files) {
    if (file.installed === null) {
      expect(existsSync(resolve(root, file.target))).toBe(false);
    } else {
      expect(sha256(readFileSync(resolve(root, file.target)))).toBe(file.installed);
    }
    expect(sha256(readFileSync(resolve(root, basePath(file.base))))).toBe(file.base);
  }
}

function expectManifestCommittedLast(root: string, transactionId: string): void {
  const journal = JSON.parse(
    readFileSync(resolve(root, ".mergora/transactions", transactionId, "journal.json"), "utf8"),
  ) as {
    entries: readonly {
      readonly checkpoint: string;
      readonly sequence: number;
      readonly target?: string;
    }[];
  };
  const commits = journal.entries.filter(({ checkpoint }) =>
    ["commit-target", "manifest-committed"].includes(checkpoint),
  );
  const manifestCommit = commits.find(({ checkpoint }) => checkpoint === "manifest-committed");
  if (manifestCommit !== undefined) {
    expect(manifestCommit.target).toBe(".mergora/manifest.json");
    expect(manifestCommit.sequence).toBe(Math.max(...commits.map(({ sequence }) => sequence)));
  }
}

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

describe("transaction lifecycle fault matrix", () => {
  it.each(FAULT_POINTS)(
    "converges to a byte-valid pre-state or post-state at %s",
    (point) => {
      const project = fixture();
      const itemId = point.startsWith("package-manager-") ? "dialog" : "button";
      const before = authoritativeInventory(project.root);
      let injected = false;
      let packageManagerCalls = 0;
      const options = {
        projectRoot: project.root,
        itemIds: [itemId],
        registryDirectory,
        packageManagerRunner: () => {
          packageManagerCalls += 1;
          writeFileSync(resolve(project.root, "pnpm-lock.yaml"), "pnpm-security-post-state\n");
          return { status: 0 };
        },
        faultInjector: (candidate: TransactionFaultPoint) => {
          if (!injected && candidate === point) {
            injected = true;
            throw new TransactionInterruption(`security fault at ${point}`);
          }
        },
      };
      const operation = planSourceAdd(options);

      expect(() => applySourceAdd(options, operation.planDigest)).toThrow(TransactionInterruption);
      expect(injected).toBe(true);
      const [transactionId] = listIncompleteTransactions(project.root);
      expect(transactionId).toBeDefined();
      const recovery = planRecovery({ root: project.root, transactionId });
      const result = recoverTransaction(
        {
          root: project.root,
          transactionId,
          allowCurrentProcessLockForTesting: true,
          packageManagerRunner: () => ({ status: 0 }),
        },
        recovery.plan.planDigest,
      );

      expect(result.action).toBe(recovery.action);
      expect(existsSync(resolve(project.root, ".mergora/.lock"))).toBe(false);
      expect(listIncompleteTransactions(project.root)).toEqual([]);
      expectManifestCommittedLast(project.root, transactionId!);
      if (result.action === "rollback") {
        expect(authoritativeInventory(project.root)).toEqual(before);
        expect(readManifest(project.root).items[`official:${itemId}`]).toBeUndefined();
      } else {
        expectCommittedStateValid(project.root, itemId);
      }
      if (point === "package-manager-start") expect(packageManagerCalls).toBe(0);
      if (point === "package-manager-complete") expect(packageManagerCalls).toBe(1);
    },
    30_000,
  );

  it("records every non-manifest commit before the provenance manifest on success", () => {
    const project = fixture();
    const observed: Array<{ readonly point: TransactionFaultPoint; readonly target?: string }> = [];
    const options = {
      projectRoot: project.root,
      itemIds: ["button"],
      registryDirectory,
      noInstall: true,
      faultInjector: (
        point: TransactionFaultPoint,
        context: { readonly target?: string | undefined },
      ) => {
        if (point === "commit-file" || point === "manifest-committed") {
          observed.push({
            point,
            ...(context.target === undefined ? {} : { target: context.target }),
          });
        }
      },
    };
    const result = applySourceAdd(options, planSourceAdd(options).planDigest);

    expect(observed.length).toBeGreaterThan(1);
    expect(observed.at(-1)).toEqual({
      point: "manifest-committed",
      target: ".mergora/manifest.json",
    });
    expectManifestCommittedLast(project.root, result.transaction.transactionId!);
    expectCommittedStateValid(project.root, "button");
  });
});
