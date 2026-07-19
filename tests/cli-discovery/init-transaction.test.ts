import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import {
  TransactionInterruption,
  applyInit,
  listIncompleteTransactions,
  planInit,
  planRecovery,
  recoverTransaction,
  type TransactionFaultPoint,
} from "../../packages/cli/src/index.ts";
import { createProjectFixture } from "../cli-fixtures/project-fixture.ts";

const temporaryDirectories: string[] = [];

function fixture() {
  const project = createProjectFixture({ directoryPrefix: "mergora-init-transaction-" });
  temporaryDirectories.push(project.root);
  return project;
}

function transactionIds(root: string): readonly string[] {
  const directory = resolve(root, ".mergora/transactions");
  return existsSync(directory)
    ? readdirSync(directory).sort((left, right) => left.localeCompare(right, "en-US"))
    : [];
}

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

describe("durable initialization transactions", () => {
  it("stages and backs up every changed target with the manifest committed last", () => {
    const project = fixture();
    writeFileSync(resolve(project.root, ".gitignore"), "dist/\n", "utf8");

    const reviewed = planInit({ projectRoot: project.root });
    const applied = applyInit({ projectRoot: project.root }, reviewed.planDigest);

    const [transactionId] = transactionIds(project.root);
    expect(transactionId).toBeDefined();
    const transactionRoot = resolve(project.root, ".mergora/transactions", transactionId!);
    const record = JSON.parse(
      readFileSync(resolve(transactionRoot, "transaction.json"), "utf8"),
    ) as {
      state: string;
      staged: readonly {
        target: string;
        stagePath: string;
        digest: string;
      }[];
      backups: readonly { target: string; backupPath: string; digest: string | null }[];
      preconditions: { liveTargets: Record<string, string | null> };
      plan: { path: string; digest: string };
      consents: readonly { id: string; accepted: true; flag: string; planDigest: string }[];
    };
    const committedPlan = JSON.parse(
      readFileSync(resolve(transactionRoot, "plan.json"), "utf8"),
    ) as { planDigest: string };
    expect(applied.planDigest).toBe(reviewed.planDigest);
    expect(committedPlan.planDigest).toBe(reviewed.planDigest);
    expect(record.plan).toEqual({
      path: `.mergora/transactions/${transactionId!}/plan.json`,
      digest: reviewed.planDigest,
    });
    expect(record.consents).toEqual([
      {
        id: "init-project-writes",
        accepted: true,
        flag: "--yes",
        planDigest: reviewed.planDigest,
      },
    ]);
    expect(record.state).toBe("committed");
    expect(record.staged.map(({ target }) => target)).toEqual([
      ".gitignore",
      "mergora.json",
      ".mergora/manifest.json",
    ]);
    expect(record.backups.map(({ target }) => target).sort()).toEqual(
      [".gitignore", ".mergora/manifest.json", "mergora.json"].sort(),
    );
    expect(record.preconditions.liveTargets).toMatchObject({
      "mergora.json": null,
      ".mergora/manifest.json": null,
    });
    for (const staged of record.staged) {
      expect(readFileSync(resolve(project.root, ...staged.target.split("/")))).toEqual(
        readFileSync(resolve(project.root, ...staged.stagePath.split("/"))),
      );
    }

    const journal = JSON.parse(readFileSync(resolve(transactionRoot, "journal.json"), "utf8")) as {
      entries: readonly { checkpoint: string; target?: string }[];
    };
    const commits = journal.entries.filter(
      ({ checkpoint }) => checkpoint === "commit-target" || checkpoint === "manifest-committed",
    );
    expect(commits.at(-1)).toEqual({
      checkpoint: "manifest-committed",
      postconditionDigest: expect.any(String),
      preconditionDigest: undefined,
      recordDigest: expect.any(String),
      recordedAt: expect.any(String),
      sequence: expect.any(Number),
      state: "committing",
      target: ".mergora/manifest.json",
    });
  });

  it("does not create another transaction for an idempotent no-op", () => {
    const project = fixture();
    const first = planInit({ projectRoot: project.root });
    applyInit({ projectRoot: project.root }, first.planDigest);
    const before = transactionIds(project.root);
    const reviewed = planInit({ projectRoot: project.root });

    expect(reviewed.writesRequired).toBe(false);
    applyInit({ projectRoot: project.root }, reviewed.planDigest);
    expect(transactionIds(project.root)).toEqual(before);
  });

  it("requires a reviewed digest before creating files or transaction state", () => {
    const project = fixture();

    expect(() => Reflect.apply(applyInit, undefined, [{ projectRoot: project.root }])).toThrow(
      /exact reviewed plan digest/u,
    );
    expect(existsSync(resolve(project.root, "mergora.json"))).toBe(false);
    expect(existsSync(resolve(project.root, ".mergora"))).toBe(false);
    expect(transactionIds(project.root)).toEqual([]);
  });

  it("restores the exact first-run pre-state after an ordinary commit failure", () => {
    const project = fixture();
    const ignorePath = resolve(project.root, ".gitignore");
    writeFileSync(ignorePath, "dist/\n# consumer bytes\n", "utf8");
    const ignoreBefore = readFileSync(ignorePath);
    const reviewed = planInit({ projectRoot: project.root });

    expect(() =>
      applyInit(
        {
          projectRoot: project.root,
          faultInjector: (point: TransactionFaultPoint) => {
            if (point === "manifest-committed") throw new Error("ordinary init failure");
          },
        },
        reviewed.planDigest,
      ),
    ).toThrow(/ordinary init failure/u);

    expect(readFileSync(ignorePath)).toEqual(ignoreBefore);
    expect(existsSync(resolve(project.root, "mergora.json"))).toBe(false);
    expect(existsSync(resolve(project.root, ".mergora/manifest.json"))).toBe(false);
    expect(existsSync(resolve(project.root, ".mergora/.lock"))).toBe(false);
    expect(listIncompleteTransactions(project.root)).toEqual([]);
    const [transactionId] = transactionIds(project.root);
    expect(
      JSON.parse(
        readFileSync(
          resolve(project.root, ".mergora/transactions", transactionId!, "transaction.json"),
          "utf8",
        ),
      ),
    ).toMatchObject({ state: "rolled-back" });
  });

  it("recovers an interrupted first-run transaction while mergora.json is still missing", () => {
    const project = fixture();
    const ignorePath = resolve(project.root, ".gitignore");
    writeFileSync(ignorePath, "dist/\n", "utf8");
    const ignoreBefore = readFileSync(ignorePath);
    const reviewed = planInit({ projectRoot: project.root });
    let interrupted = false;

    expect(() =>
      applyInit(
        {
          projectRoot: project.root,
          faultInjector: (point: TransactionFaultPoint) => {
            if (!interrupted && point === "commit-file") {
              interrupted = true;
              throw new TransactionInterruption("interrupt first-run init");
            }
          },
        },
        reviewed.planDigest,
      ),
    ).toThrow(TransactionInterruption);
    expect(interrupted).toBe(true);
    expect(existsSync(resolve(project.root, "mergora.json"))).toBe(false);

    const [transactionId] = listIncompleteTransactions(project.root);
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
    expect(readFileSync(ignorePath)).toEqual(ignoreBefore);
    expect(existsSync(resolve(project.root, "mergora.json"))).toBe(false);
    expect(existsSync(resolve(project.root, ".mergora/manifest.json"))).toBe(false);
    expect(existsSync(resolve(project.root, ".mergora/.lock"))).toBe(false);
    expect(listIncompleteTransactions(project.root)).toEqual([]);
  });

  it("can abandon a classified pre-record orphan when the project has no config yet", () => {
    const project = fixture();
    const transactionId = `20260718T123456.789Z-${"a".repeat(32)}`;
    mkdirSync(resolve(project.root, ".mergora"), { recursive: true });
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

    const recovery = planRecovery({ root: project.root, transactionId });
    expect(recovery).toMatchObject({ action: "rollback", orphan: true });
    recoverTransaction(
      {
        root: project.root,
        transactionId,
        allowCurrentProcessLockForTesting: true,
      },
      recovery.plan.planDigest,
    );

    expect(existsSync(resolve(project.root, "mergora.json"))).toBe(false);
    expect(existsSync(resolve(project.root, ".mergora/.lock"))).toBe(false);
    expect(
      JSON.parse(
        readFileSync(
          resolve(project.root, ".mergora/transactions", transactionId, "transaction.json"),
          "utf8",
        ),
      ),
    ).toMatchObject({ state: "abandoned" });
  });
});
