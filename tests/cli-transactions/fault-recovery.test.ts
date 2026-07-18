import { existsSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import {
  TransactionInterruption,
  applyInit,
  applySourceAdd,
  listIncompleteTransactions,
  planRecovery,
  planSourceAdd,
  recoverTransaction,
  type TransactionFaultPoint,
} from "../../packages/cli/src/index.ts";
import { createProjectFixture } from "../cli-fixtures/project-fixture.ts";

const workspaceRoot = resolve(import.meta.dirname, "../..");
const registryDirectory = resolve(workspaceRoot, "registry/generated");
const temporaryDirectories: string[] = [];

function fixture() {
  const project = createProjectFixture();
  temporaryDirectories.push(project.root);
  applyInit({ projectRoot: project.root });
  return project;
}

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

const ordinaryFaults: readonly TransactionFaultPoint[] = [
  "lock-acquired",
  "transaction-created",
  "stage-file",
  "stage-complete",
  "validation-complete",
  "backup-file",
  "backup-complete",
  "commit-file",
  "manifest-committed",
  "post-validation-complete",
  "finalized",
];

describe("transaction fault convergence", () => {
  it.each(ordinaryFaults)("converges after interruption at %s", (fault) => {
    const project = fixture();
    const manifestPath = resolve(project.root, ".mergora/manifest.json");
    const manifestBefore = readFileSync(manifestPath);
    let injected = false;
    const options = {
      projectRoot: project.root,
      itemIds: ["button"],
      registryDirectory,
      faultInjector: (point: TransactionFaultPoint) => {
        if (!injected && point === fault) {
          injected = true;
          throw new TransactionInterruption(`interrupt ${fault}`);
        }
      },
    };
    const operation = planSourceAdd(options);
    expect(() => applySourceAdd(options, operation.planDigest)).toThrow(TransactionInterruption);
    expect(injected).toBe(true);

    const recovery = planRecovery({ root: project.root });
    const result = recoverTransaction(
      {
        root: project.root,
        transactionId: recovery.transactionId,
        allowCurrentProcessLockForTesting: true,
      },
      recovery.plan.planDigest,
    );
    expect(existsSync(resolve(project.root, ".mergora/.lock"))).toBe(false);
    expect(listIncompleteTransactions(project.root)).toEqual([]);

    const manifest = JSON.parse(readFileSync(manifestPath, "utf8")) as {
      items: Record<string, unknown>;
    };
    if (result.action === "rollback") {
      expect(readFileSync(manifestPath)).toEqual(manifestBefore);
      expect(manifest.items["official:button"]).toBeUndefined();
    } else {
      expect(result.action).toBe("finalize");
      expect(manifest.items["official:button"]).toBeDefined();
    }
  });

  it("explicit resume finishes the staged deterministic order with manifest last", () => {
    const project = fixture();
    let injected = false;
    const options = {
      projectRoot: project.root,
      itemIds: ["button"],
      registryDirectory,
      faultInjector: (point: TransactionFaultPoint) => {
        if (!injected && point === "commit-file") {
          injected = true;
          throw new TransactionInterruption("resume fixture");
        }
      },
    };
    const plan = planSourceAdd(options);
    expect(() => applySourceAdd(options, plan.planDigest)).toThrow(TransactionInterruption);
    const [transactionId] = listIncompleteTransactions(project.root);
    const recovery = planRecovery({ root: project.root, transactionId, strategy: "resume" });
    expect(recovery.action).toBe("resume");
    const recovered = recoverTransaction(
      {
        root: project.root,
        transactionId,
        strategy: "resume",
        allowCurrentProcessLockForTesting: true,
      },
      recovery.plan.planDigest,
    );
    expect(recovered.state).toBe("committed");
    const transactionRoot = resolve(project.root, ".mergora/transactions", transactionId!);
    const journal = JSON.parse(readFileSync(resolve(transactionRoot, "journal.json"), "utf8")) as {
      entries: readonly { checkpoint: string; target?: string }[];
    };
    const commits = journal.entries.filter(
      ({ checkpoint }) => checkpoint === "commit-target" || checkpoint === "manifest-committed",
    );
    expect(commits.at(-1)).toMatchObject({ target: ".mergora/manifest.json" });
  });

  it("rolls back at package-manager start and finalizes a recorded successful PM post-state", () => {
    const start = fixture();
    let runnerCalled = false;
    const startOptions = {
      projectRoot: start.root,
      itemIds: ["dialog"],
      registryDirectory,
      packageManagerRunner: () => {
        runnerCalled = true;
        return { status: 0 };
      },
      faultInjector: (point: TransactionFaultPoint) => {
        if (point === "package-manager-start") {
          throw new TransactionInterruption("before package manager");
        }
      },
    };
    const packageBefore = readFileSync(resolve(start.root, "package.json"));
    expect(() => applySourceAdd(startOptions, planSourceAdd(startOptions).planDigest)).toThrow(
      TransactionInterruption,
    );
    expect(runnerCalled).toBe(false);
    const startRecovery = planRecovery({ root: start.root });
    expect(startRecovery.action).toBe("rollback");
    recoverTransaction(
      {
        root: start.root,
        transactionId: startRecovery.transactionId,
        allowCurrentProcessLockForTesting: true,
      },
      startRecovery.plan.planDigest,
    );
    expect(readFileSync(resolve(start.root, "package.json"))).toEqual(packageBefore);

    const complete = fixture();
    const lockPath = resolve(complete.root, "pnpm-lock.yaml");
    let completedFault = false;
    const completeOptions = {
      projectRoot: complete.root,
      itemIds: ["dialog"],
      registryDirectory,
      packageManagerRunner: () => {
        writeFileSync(lockPath, "resolved lock post-state\n");
        return { status: 0 };
      },
      faultInjector: (point: TransactionFaultPoint) => {
        if (!completedFault && point === "package-manager-complete") {
          completedFault = true;
          throw new TransactionInterruption("after package manager");
        }
      },
    };
    const completePlan = planSourceAdd(completeOptions);
    expect(() => applySourceAdd(completeOptions, completePlan.planDigest)).toThrow(
      TransactionInterruption,
    );
    const completeRecovery = planRecovery({ root: complete.root });
    expect(completeRecovery.action).toBe("finalize");
    recoverTransaction(
      {
        root: complete.root,
        transactionId: completeRecovery.transactionId,
        allowCurrentProcessLockForTesting: true,
      },
      completeRecovery.plan.planDigest,
    );
    expect(readFileSync(lockPath, "utf8")).toBe("resolved lock post-state\n");
    const manifest = JSON.parse(
      readFileSync(resolve(complete.root, ".mergora/manifest.json"), "utf8"),
    ) as { items: Record<string, unknown> };
    expect(manifest.items["official:dialog"]).toBeDefined();
  });

  it("journals and converges after every per-target stage, backup, and commit boundary", () => {
    const countProject = fixture();
    const countPlan = planSourceAdd({
      projectRoot: countProject.root,
      itemIds: ["button"],
      registryDirectory,
    });
    const mutationCount = countPlan.fileOperations.filter(
      ({ local, proposed }) => local !== proposed,
    ).length;
    const sourceTargets = countPlan.fileOperations
      .filter(({ local, proposed, target }) => local !== proposed && target.startsWith("src/"))
      .map(({ target }) => target);
    expect(mutationCount).toBeGreaterThan(1);

    const boundaries = [
      { point: "stage-file", checkpoint: "stage-written", count: mutationCount },
      { point: "backup-file", checkpoint: "backup-written", count: mutationCount },
      { point: "commit-file", checkpoint: "commit-target", count: mutationCount - 1 },
    ] as const;

    for (const boundary of boundaries) {
      for (let occurrence = 1; occurrence <= boundary.count; occurrence += 1) {
        const project = fixture();
        const manifestPath = resolve(project.root, ".mergora/manifest.json");
        const manifestBefore = readFileSync(manifestPath);
        let matches = 0;
        let interruptedTarget: string | undefined;
        const options = {
          projectRoot: project.root,
          itemIds: ["button"],
          registryDirectory,
          faultInjector: (
            point: TransactionFaultPoint,
            context: { readonly target?: string | undefined },
          ) => {
            if (point !== boundary.point) return;
            matches += 1;
            if (matches !== occurrence) return;
            interruptedTarget = context.target;
            throw new TransactionInterruption(
              `interrupt ${boundary.point} occurrence ${occurrence}`,
            );
          },
        };
        const plan = planSourceAdd(options);
        expect(() => applySourceAdd(options, plan.planDigest)).toThrow(TransactionInterruption);
        expect(interruptedTarget).toBeDefined();
        const [transactionId] = listIncompleteTransactions(project.root);
        const journal = JSON.parse(
          readFileSync(
            resolve(project.root, ".mergora/transactions", transactionId!, "journal.json"),
            "utf8",
          ),
        ) as { entries: readonly { checkpoint: string; target?: string }[] };
        expect(
          journal.entries
            .filter(
              ({ checkpoint, target }) =>
                checkpoint === boundary.checkpoint && target !== undefined,
            )
            .at(-1),
        ).toMatchObject({ checkpoint: boundary.checkpoint, target: interruptedTarget });

        const recovery = planRecovery({ root: project.root, transactionId });
        expect(recovery.action).toBe("rollback");
        const result = recoverTransaction(
          {
            root: project.root,
            transactionId,
            allowCurrentProcessLockForTesting: true,
          },
          recovery.plan.planDigest,
        );
        expect(result).toMatchObject({ action: "rollback", state: "rolled-back" });
        expect(readFileSync(manifestPath)).toEqual(manifestBefore);
        expect(sourceTargets.every((target) => !existsSync(resolve(project.root, target)))).toBe(
          true,
        );
        expect(existsSync(resolve(project.root, ".mergora/.lock"))).toBe(false);
        expect(listIncompleteTransactions(project.root)).toEqual([]);
      }
    }
  }, 30_000);

  it("classifies and abandons a valid pre-mutation orphan lock without touching live files", () => {
    const project = fixture();
    const manifestPath = resolve(project.root, ".mergora/manifest.json");
    const manifestBefore = readFileSync(manifestPath);
    const transactionId = `20260718T123456.789Z-${"a".repeat(32)}`;
    writeFileSync(
      resolve(project.root, ".mergora/.lock"),
      JSON.stringify({
        schemaVersion: 1,
        transactionId,
        pid: process.pid,
        startedAt: new Date().toISOString(),
        nonce: "b".repeat(32),
      }),
    );

    expect(listIncompleteTransactions(project.root)).toEqual([transactionId]);
    const recovery = planRecovery({ root: project.root });
    expect(recovery).toMatchObject({ transactionId, action: "rollback", orphan: true });
    const result = recoverTransaction(
      {
        root: project.root,
        transactionId,
        allowCurrentProcessLockForTesting: true,
      },
      recovery.plan.planDigest,
    );
    expect(result).toMatchObject({ transactionId, action: "rollback", state: "rolled-back" });
    expect(readFileSync(manifestPath)).toEqual(manifestBefore);
    expect(existsSync(resolve(project.root, ".mergora/.lock"))).toBe(false);
    expect(listIncompleteTransactions(project.root)).toEqual([]);
    expect(
      JSON.parse(
        readFileSync(
          resolve(project.root, ".mergora/transactions", transactionId, "transaction.json"),
          "utf8",
        ),
      ),
    ).toMatchObject({ state: "abandoned" });
  });

  it("refuses a tampered journal before recovery writes or releases the lock", () => {
    const project = fixture();
    const manifestPath = resolve(project.root, ".mergora/manifest.json");
    const manifestBefore = readFileSync(manifestPath);
    let injected = false;
    const options = {
      projectRoot: project.root,
      itemIds: ["button"],
      registryDirectory,
      faultInjector: (point: TransactionFaultPoint) => {
        if (!injected && point === "commit-file") {
          injected = true;
          throw new TransactionInterruption("tampered journal fixture");
        }
      },
    };
    const plan = planSourceAdd(options);
    expect(() => applySourceAdd(options, plan.planDigest)).toThrow(TransactionInterruption);
    const [transactionId] = listIncompleteTransactions(project.root);
    const recovery = planRecovery({ root: project.root, transactionId });
    const journalPath = resolve(
      project.root,
      ".mergora/transactions",
      transactionId!,
      "journal.json",
    );
    const journal = JSON.parse(readFileSync(journalPath, "utf8")) as {
      entries: Array<{ recordDigest: string }>;
    };
    journal.entries[0]!.recordDigest = `sha256:${"0".repeat(64)}`;
    writeFileSync(journalPath, JSON.stringify(journal));
    const lockPath = resolve(project.root, ".mergora/.lock");
    const lockBefore = readFileSync(lockPath);
    const tamperedJournal = readFileSync(journalPath);

    expect(() =>
      recoverTransaction(
        {
          root: project.root,
          transactionId,
          allowCurrentProcessLockForTesting: true,
        },
        recovery.plan.planDigest,
      ),
    ).toThrow(/journal digest is invalid/u);
    expect(readFileSync(manifestPath)).toEqual(manifestBefore);
    expect(readFileSync(journalPath)).toEqual(tamperedJournal);
    expect(readFileSync(lockPath)).toEqual(lockBefore);
  });
});
