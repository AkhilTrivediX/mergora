import { existsSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { relative, resolve, sep } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import {
  CLI_VERSION,
  CliError,
  applyInit,
  canonicalJson,
  planInit,
  sha256,
} from "../../packages/cli/src/index.ts";
import {
  TransactionInterruption,
  executeTransaction,
  finalizeOperationPlan,
  planRecovery,
  recoverTransaction,
  validateTransactionOverlay,
  validationSuiteForTransaction,
  type OperationPlan,
  type TransactionMutation,
  type TransactionValidationResult,
  type TransactionValidator,
} from "../../packages/cli/src/transaction-engine.ts";
import { formatValidationErrors, validateSchemaDocument } from "../../registry/schemas/index.ts";
import { createProjectFixture } from "../cli-fixtures/project-fixture.ts";

const temporaryDirectories: string[] = [];
const target = "src/validator-target.ts";
const originalBytes = Buffer.from('export const validatorState = "original";\n');
const proposedBytes = Buffer.from('export const validatorState = "proposed";\n');

function fixture() {
  const project = createProjectFixture({ directoryPrefix: "mergora-transaction-validator-" });
  temporaryDirectories.push(project.root);
  applyInit({ projectRoot: project.root }, planInit({ projectRoot: project.root }).planDigest);
  writeFileSync(resolve(project.root, target), originalBytes);
  return project;
}

function canonicalFileDigest(root: string, file: string): `sha256:${string}` {
  return sha256(canonicalJson(JSON.parse(readFileSync(resolve(root, file), "utf8")) as unknown));
}

function transactionPlan(
  root: string,
  validators: readonly TransactionValidator[],
  writeBytes = proposedBytes.byteLength,
  consentRequirements: OperationPlan["consentRequirements"] = [],
): OperationPlan {
  return finalizeOperationPlan({
    schemaVersion: 1,
    command: "update",
    cliVersion: CLI_VERSION,
    projectRoot: ".",
    configDigest: canonicalFileDigest(root, "mergora.json"),
    manifestPreconditionDigest: canonicalFileDigest(root, ".mergora/manifest.json"),
    registries: [],
    items: [],
    fileOperations: [
      {
        operation: "fast-forward",
        target,
        owner: "test:transaction-validator",
        base: sha256(originalBytes),
        local: sha256(originalBytes),
        remote: sha256(proposedBytes),
        proposed: sha256(proposedBytes),
        mediaType: "text/typescript",
        risk: "ordinary",
        reason: "Exercise registered transaction validation.",
      },
    ],
    dependencyChanges: [],
    structuredPatches: [],
    migrations: [],
    contractChanges: [],
    warnings: [],
    consentRequirements,
    conflicts: [],
    estimatedBytes: { download: 0, write: writeBytes },
    validationSuite: validationSuiteForTransaction(validators),
    rollbackAvailable: true,
  });
}

function onlyTransactionRecord(root: string): {
  readonly transactionId: string;
  readonly state: string;
  readonly backups: readonly unknown[];
  readonly consents: readonly {
    readonly id: string;
    readonly accepted: boolean;
    readonly flag: string;
    readonly planDigest: `sha256:${string}`;
  }[];
  readonly validations: readonly {
    readonly id: string;
    readonly state: string;
    readonly summary: string;
  }[];
} {
  const directory = resolve(root, ".mergora/transactions");
  const ids = readdirSync(directory, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map(({ name }) => name)
    .filter((id) => {
      const plan = JSON.parse(readFileSync(resolve(directory, id, "plan.json"), "utf8")) as {
        readonly command?: unknown;
      };
      return plan.command === "update";
    });
  expect(ids).toHaveLength(1);
  return JSON.parse(
    readFileSync(resolve(directory, ids[0]!, "transaction.json"), "utf8"),
  ) as ReturnType<typeof onlyTransactionRecord>;
}

function catchError(action: () => void): unknown {
  try {
    action();
  } catch (error) {
    return error;
  }
  throw new Error("Expected the transaction to fail.");
}

function byteInventory(root: string): Readonly<Record<string, string>> {
  const inventory: Record<string, string> = {};
  const visit = (directory: string): void => {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const path = resolve(directory, entry.name);
      const portable = relative(root, path).split(sep).join("/");
      if (portable === ".mergora/transactions" || portable.startsWith(".mergora/transactions/")) {
        continue;
      }
      if (entry.isDirectory()) visit(path);
      else if (entry.isFile()) inventory[portable] = readFileSync(path).toString("hex");
    }
  };
  visit(root);
  return Object.fromEntries(
    Object.entries(inventory).sort(([left], [right]) => left.localeCompare(right, "en-US")),
  );
}

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

describe("transaction consent binding", () => {
  const consentRequirements = [
    {
      id: "reviewed-update",
      flag: "--yes",
      reason: "Commit the reviewed update transaction.",
    },
  ] as const;

  it("rejects missing consent before even no-op transaction metadata can be written", () => {
    const project = fixture();
    const plan = transactionPlan(project.root, [], 0, consentRequirements);
    const transactionRoot = resolve(project.root, ".mergora/transactions");
    const transactionsBefore = readdirSync(transactionRoot).sort();

    const error = catchError(() =>
      executeTransaction({
        root: project.root,
        plan,
        mutations: [],
        acceptedConsents: [],
      }),
    );

    expect(error).toMatchObject({ code: "CONSENT_REQUIRED", exitCode: 12 });
    expect(readdirSync(transactionRoot).sort()).toEqual(transactionsBefore);
    expect(readFileSync(resolve(project.root, target))).toEqual(originalBytes);
  });

  it("rejects unexpected, duplicate, and stale acceptances before changing live bytes", () => {
    const cases = [
      {
        acceptedConsents: [
          { id: "reviewed-update", planDigest: "current" },
          { id: "unexpected-update", planDigest: "current" },
        ],
        code: "TRANSACTION_CONSENT_UNEXPECTED",
      },
      {
        acceptedConsents: [
          { id: "reviewed-update", planDigest: "current" },
          { id: "reviewed-update", planDigest: "current" },
        ],
        code: "TRANSACTION_CONSENT_INVALID",
      },
      {
        acceptedConsents: [{ id: "reviewed-update", planDigest: `sha256:${"0".repeat(64)}` }],
        code: "PLAN_PRECONDITION_STALE",
      },
    ] as const;

    for (const testCase of cases) {
      const project = fixture();
      const plan = transactionPlan(project.root, [], proposedBytes.byteLength, consentRequirements);
      const transactionRoot = resolve(project.root, ".mergora/transactions");
      const transactionsBefore = readdirSync(transactionRoot).sort();
      const acceptedConsents = testCase.acceptedConsents.map(({ id, planDigest }) => ({
        id,
        planDigest: planDigest === "current" ? plan.planDigest : planDigest,
      }));

      const error = catchError(() =>
        executeTransaction({
          root: project.root,
          plan,
          mutations: [{ target, content: proposedBytes, beforeDigest: sha256(originalBytes) }],
          acceptedConsents,
        }),
      );

      expect(error).toMatchObject({ code: testCase.code });
      expect(readdirSync(transactionRoot).sort()).toEqual(transactionsBefore);
      expect(readFileSync(resolve(project.root, target))).toEqual(originalBytes);
    }
  });

  it("records only the verified plan-bound acceptance after a successful commit", () => {
    const project = fixture();
    const plan = transactionPlan(project.root, [], proposedBytes.byteLength, consentRequirements);

    const result = executeTransaction({
      root: project.root,
      plan,
      mutations: [{ target, content: proposedBytes, beforeDigest: sha256(originalBytes) }],
      acceptedConsents: [{ id: "reviewed-update", planDigest: plan.planDigest }],
    });

    expect(result.state).toBe("committed");
    expect(readFileSync(resolve(project.root, target))).toEqual(proposedBytes);
    expect(onlyTransactionRecord(project.root).consents).toEqual([
      {
        id: "reviewed-update",
        accepted: true,
        flag: "--yes",
        planDigest: plan.planDigest,
      },
    ]);
    const journal = JSON.parse(
      readFileSync(
        resolve(project.root, `.mergora/transactions/${result.transactionId!}/journal.json`),
        "utf8",
      ),
    ) as { readonly entries: readonly { readonly checkpoint: string }[] };
    expect(journal.entries.map(({ checkpoint }) => checkpoint)).toContain("consent-recorded");
  });
});

describe("registered transaction validators", () => {
  it("rejects a claimed non-built-in label with no fixed validator before transaction writes", () => {
    const project = fixture();
    const claimed: TransactionValidator = {
      id: "claimed-parse",
      label: "parse",
      validateStagedOverlay: () => ({ state: "pass", summary: "Parse passed." }),
      validatePostCommit: () => ({ state: "pass", summary: "Parse passed." }),
    };
    const plan = transactionPlan(project.root, [claimed]);
    const transactionRoot = resolve(project.root, ".mergora/transactions");
    const transactionsBefore = readdirSync(transactionRoot).sort();

    const error = catchError(() =>
      executeTransaction({
        root: project.root,
        plan,
        mutations: [{ target, content: proposedBytes, beforeDigest: sha256(originalBytes) }],
        acceptedConsents: [],
        validators: [],
      }),
    );

    expect(error).toMatchObject({ code: "TRANSACTION_VALIDATOR_REQUIRED", exitCode: 8 });
    expect(readdirSync(transactionRoot).sort()).toEqual(transactionsBefore);
    expect(readFileSync(resolve(project.root, target))).toEqual(originalBytes);
  });

  it("continues rejecting a supplied validator label absent from the reviewed plan", () => {
    const project = fixture();
    const plan = transactionPlan(project.root, []);
    const validator: TransactionValidator = {
      id: "unreviewed-parse",
      label: "parse",
      validateStagedOverlay: () => ({ state: "pass", summary: "Parse passed." }),
      validatePostCommit: () => ({ state: "pass", summary: "Parse passed." }),
    };
    const transactionRoot = resolve(project.root, ".mergora/transactions");
    const transactionsBefore = readdirSync(transactionRoot).sort();

    const error = catchError(() =>
      executeTransaction({
        root: project.root,
        plan,
        mutations: [{ target, content: proposedBytes, beforeDigest: sha256(originalBytes) }],
        acceptedConsents: [],
        validators: [validator],
      }),
    );

    expect(error).toMatchObject({ code: "TRANSACTION_VALIDATOR_PLAN_MISMATCH", exitCode: 8 });
    expect(readdirSync(transactionRoot).sort()).toEqual(transactionsBefore);
    expect(readFileSync(resolve(project.root, target))).toEqual(originalBytes);
  });

  it.each([
    { target: "package.json", manifest: false },
    { target: ".mergora/manifest.json", manifest: true },
  ] as const)(
    "read-only overlay validation rejects malformed proposed $target bytes",
    ({ target: malformedTarget, manifest }) => {
      const project = fixture();
      const before = readFileSync(resolve(project.root, malformedTarget));
      const malformed = Buffer.from("{\n");
      const template = transactionPlan(project.root, []);
      const { planDigest: _planDigest, ...semantic } = template;
      const plan = finalizeOperationPlan({
        ...semantic,
        fileOperations: [
          {
            operation: "structured-patch",
            target: malformedTarget,
            owner: "test:malformed-overlay",
            base: sha256(before),
            local: sha256(before),
            remote: sha256(malformed),
            proposed: sha256(malformed),
            mediaType: "application/json",
            risk: "review-required",
            reason: "Exercise read-only built-in structured validation.",
          },
        ],
        estimatedBytes: { download: 0, write: malformed.byteLength },
      });
      const transactionRoot = resolve(project.root, ".mergora/transactions");
      const transactionsBefore = readdirSync(transactionRoot).sort();

      const error = catchError(() =>
        validateTransactionOverlay({
          root: project.root,
          plan,
          mutations: [
            {
              target: malformedTarget,
              content: malformed,
              beforeDigest: sha256(before),
              ...(manifest ? { manifest: true } : {}),
            },
          ],
          validators: [],
        }),
      );

      expect(error).toMatchObject({
        code: manifest ? "TRANSACTION_PROVENANCE_INVALID" : "TRANSACTION_STAGE_INVALID",
      });
      expect(readdirSync(transactionRoot).sort()).toEqual(transactionsBefore);
      expect(readFileSync(resolve(project.root, malformedTarget))).toEqual(before);
    },
  );

  it("rejects the staged overlay before backups or authoritative writes", () => {
    const project = fixture();
    let stagedBytes: Buffer | null = null;
    let postCommitCalled = false;
    const validators: readonly TransactionValidator[] = [
      {
        id: "staged-guard",
        label: "parse",
        validateStagedOverlay: (context) => {
          stagedBytes = context.readFile(target);
          return {
            state: "fail",
            summary: "The staged artifact failed the focused guard.",
            issues: [
              {
                code: "FOCUSED_GUARD_FAILED",
                target,
                message: "The proposed artifact is intentionally rejected.",
              },
            ],
          };
        },
        validatePostCommit: () => {
          postCommitCalled = true;
          return { state: "pass", summary: "The post-commit guard passed." };
        },
      },
    ];
    const plan = transactionPlan(project.root, validators);
    const error = catchError(() =>
      executeTransaction({
        root: project.root,
        plan,
        mutations: [{ target, content: proposedBytes, beforeDigest: sha256(originalBytes) }],
        acceptedConsents: [],
        validators,
      }),
    );

    expect(error).toMatchObject({ code: "TRANSACTION_STAGED_VALIDATION_FAILED", target });
    expect(stagedBytes).toEqual(proposedBytes);
    expect(postCommitCalled).toBe(false);
    expect(readFileSync(resolve(project.root, target))).toEqual(originalBytes);
    expect(existsSync(resolve(project.root, ".mergora/.lock"))).toBe(false);
    const record = onlyTransactionRecord(project.root);
    expect(record).toMatchObject({ state: "rolled-back", backups: [] });
    expect(record.validations.map(({ id, state }) => ({ id, state }))).toEqual([
      { id: "validator-registration-staged-guard", state: "pass" },
      { id: "path", state: "pass" },
      { id: "digest", state: "pass" },
      { id: "collision", state: "pass" },
      { id: "provenance", state: "pass" },
      { id: "staged-overlay-staged-guard", state: "fail" },
    ]);
  });

  it("restores exact live and provenance bytes when post-commit validation fails", () => {
    const project = fixture();
    const manifestPath = resolve(project.root, ".mergora/manifest.json");
    const manifestBefore = readFileSync(manifestPath);
    const manifest = JSON.parse(manifestBefore.toString("utf8")) as {
      toolchain: Record<string, string>;
    };
    const manifestAfter = Buffer.from(
      `${JSON.stringify(
        { ...manifest, toolchain: { ...manifest.toolchain, formatter: "mergora@2" } },
        null,
        2,
      )}\n`,
    );
    const inventoryBefore = byteInventory(project.root);
    let postCommitObserved = false;
    const validate = (phase: "staged-overlay" | "post-commit"): TransactionValidationResult => {
      if (phase === "post-commit") {
        postCommitObserved = true;
        return {
          state: "fail",
          summary: "The committed provenance view failed its focused guard.",
          issues: [
            {
              code: "POST_COMMIT_GUARD_FAILED",
              target: ".mergora/manifest.json",
              message: "The proposed provenance is intentionally rejected.",
            },
          ],
        };
      }
      return { state: "pass", summary: "The staged provenance view passed." };
    };
    const validators: readonly TransactionValidator[] = [
      {
        id: "post-commit-guard",
        label: "accessibility-contract",
        validateStagedOverlay: (context) => {
          expect(context.readFile(target)).toEqual(proposedBytes);
          expect(
            JSON.parse(context.readFile(".mergora/manifest.json")!.toString("utf8")),
          ).toMatchObject({ toolchain: { formatter: "mergora@2" } });
          return validate(context.phase);
        },
        validatePostCommit: (context) => {
          expect(context.readFile(target)).toEqual(proposedBytes);
          expect(
            JSON.parse(context.readFile(".mergora/manifest.json")!.toString("utf8")),
          ).toMatchObject({ toolchain: { formatter: "mergora@2" } });
          return validate(context.phase);
        },
      },
    ];
    const plan = transactionPlan(
      project.root,
      validators,
      proposedBytes.byteLength + manifestAfter.byteLength,
    );
    const mutations: readonly TransactionMutation[] = [
      { target, content: proposedBytes, beforeDigest: sha256(originalBytes) },
      {
        target: ".mergora/manifest.json",
        content: manifestAfter,
        beforeDigest: sha256(manifestBefore),
        manifest: true,
      },
    ];
    const error = catchError(() =>
      executeTransaction({
        root: project.root,
        plan,
        mutations,
        acceptedConsents: [],
        validators,
      }),
    );

    expect(error).toMatchObject({
      code: "TRANSACTION_POST_VALIDATION_FAILED",
      target: ".mergora/manifest.json",
    });
    expect(postCommitObserved).toBe(true);
    expect(byteInventory(project.root)).toEqual(inventoryBefore);
    expect(readFileSync(manifestPath)).toEqual(manifestBefore);
    const record = onlyTransactionRecord(project.root);
    expect(record.state).toBe("rolled-back");
    expect(record.validations).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: "staged-overlay-post-commit-guard", state: "pass" }),
        expect.objectContaining({ id: "post-commit-post-commit-guard", state: "fail" }),
      ]),
    );
  });

  it("runs callbacks in deterministic id order and returns isolated read buffers", () => {
    const project = fixture();
    const calls: string[] = [];
    let isolatedReads = true;
    const validator = (id: string, label: TransactionValidator["label"]): TransactionValidator => {
      const validate = (phase: "staged-overlay" | "post-commit") => {
        calls.push(`${phase}:${id}`);
        const first = contextBytes(phase);
        first.fill(0);
        isolatedReads &&= contextBytes(phase).equals(proposedBytes);
        return { state: "pass" as const, summary: `${id} passed ${phase}.` };
      };
      let activeRead: ((target: string) => Buffer | null) | null = null;
      const contextBytes = (_phase: string): Buffer => activeRead!(target)!;
      return {
        id,
        label,
        validateStagedOverlay: (context) => {
          activeRead = context.readFile;
          return validate(context.phase);
        },
        validatePostCommit: (context) => {
          activeRead = context.readFile;
          return validate(context.phase);
        },
      };
    };
    const validators = [validator("zeta-check", "type-imports"), validator("alpha-check", "parse")];
    const plan = transactionPlan(project.root, validators);
    const result = executeTransaction({
      root: project.root,
      plan,
      mutations: [{ target, content: proposedBytes, beforeDigest: sha256(originalBytes) }],
      acceptedConsents: [],
      validators,
    });

    expect(result.state).toBe("committed");
    expect(calls).toEqual([
      "staged-overlay:alpha-check",
      "staged-overlay:zeta-check",
      "post-commit:alpha-check",
      "post-commit:zeta-check",
    ]);
    expect(isolatedReads).toBe(true);
    const record = onlyTransactionRecord(project.root);
    const schema = validateSchemaDocument("transaction", record);
    expect(formatValidationErrors(schema.errors)).toBe("");
    expect(schema.ok).toBe(true);
    expect(
      record.validations
        .map(({ id }) => id)
        .filter((id) => id.startsWith("staged-overlay-") || id.startsWith("post-commit-")),
    ).toEqual([
      "staged-overlay-alpha-check",
      "staged-overlay-zeta-check",
      "post-commit-alpha-check",
      "post-commit-zeta-check",
    ]);
  });

  it("isolates execution from closed-over plan mutation and deeply freezes the public snapshot", () => {
    const project = fixture();
    const planReference: { current: OperationPlan | null } = { current: null };
    let nestedMutationBlocked = false;
    let snapshotWasDistinct = false;
    const validators: readonly TransactionValidator[] = [
      {
        id: "immutable-plan",
        label: "parse",
        validateStagedOverlay: (context) => {
          const closedOverPlan = planReference.current!;
          snapshotWasDistinct = context.plan !== closedOverPlan;
          try {
            (context.plan.fileOperations[0] as { target: string }).target =
              "src/context-plan-tamper.ts";
          } catch {
            nestedMutationBlocked = true;
          }
          (closedOverPlan.fileOperations[0] as { target: string }).target =
            "src/closed-over-plan-tamper.ts";
          return { state: "pass", summary: "The immutable-plan guard passed." };
        },
        validatePostCommit: (context) => ({
          state: context.plan.fileOperations[0]?.target === target ? "pass" : "fail",
          summary: "The post-commit immutable-plan guard completed.",
        }),
      },
    ];
    const plan = transactionPlan(project.root, validators);
    planReference.current = plan;
    const result = executeTransaction({
      root: project.root,
      plan,
      mutations: [{ target, content: proposedBytes, beforeDigest: sha256(originalBytes) }],
      acceptedConsents: [],
      validators,
    });

    expect(result.state).toBe("committed");
    expect(snapshotWasDistinct).toBe(true);
    expect(nestedMutationBlocked).toBe(true);
    expect(readFileSync(resolve(project.root, target))).toEqual(proposedBytes);
    const recordedPlan = JSON.parse(
      readFileSync(
        resolve(project.root, ".mergora/transactions", result.transactionId!, "plan.json"),
        "utf8",
      ),
    ) as OperationPlan;
    expect(recordedPlan.fileOperations[0]?.target).toBe(target);
  });

  it.each(["returned result", "CliError"] as const)(
    "redacts callback-controlled text from a %s",
    (failureMode) => {
      const project = fixture();
      const secret = "validator-secret-7ce646c0";
      const absoluteSecretPath = resolve(project.root, secret, "private.ts");
      const validators: readonly TransactionValidator[] = [
        {
          id: "redaction-guard",
          label: "parse",
          validateStagedOverlay: () => {
            if (failureMode === "CliError") {
              throw new CliError(
                `Do not expose ${secret}, --token=${secret}, or ${absoluteSecretPath}.`,
                { code: "SENSITIVE_VALIDATOR_FAILURE", exitCode: 8, target },
              );
            }
            return {
              state: "fail",
              summary: `Do not persist ${secret} or --token=${secret}.`,
              issues: [
                {
                  code: "SENSITIVE_VALIDATOR_FAILURE",
                  target,
                  message: `Do not print ${secret}, ${absoluteSecretPath}, or --token=${secret}.`,
                },
              ],
            };
          },
          validatePostCommit: () => ({
            state: "pass",
            summary: "The post-commit redaction guard passed.",
          }),
        },
      ];
      const plan = transactionPlan(project.root, validators);
      const error = catchError(() =>
        executeTransaction({
          root: project.root,
          plan,
          mutations: [{ target, content: proposedBytes, beforeDigest: sha256(originalBytes) }],
          acceptedConsents: [],
          validators,
        }),
      );
      const record = onlyTransactionRecord(project.root);
      const recordText = JSON.stringify(record);

      expect(error).toMatchObject({ code: "TRANSACTION_STAGED_VALIDATION_FAILED" });
      expect((error as Error).message).not.toContain(secret);
      expect((error as Error).message).not.toContain(absoluteSecretPath);
      expect(recordText).not.toContain(secret);
      expect(recordText).not.toContain(absoluteSecretPath);
      expect(record.validations).toContainEqual({
        id: "staged-overlay-redaction-guard",
        state: "fail",
        summary: "Validator redaction-guard failed staged-overlay validation.",
      });
    },
  );

  it("forces rollback when recovery cannot rehydrate pending callback code", () => {
    const project = fixture();
    const validators: readonly TransactionValidator[] = [
      {
        id: "recovery-guard",
        label: "parse",
        validateStagedOverlay: () => ({
          state: "pass",
          summary: "The staged recovery guard passed.",
        }),
        validatePostCommit: () => ({
          state: "pass",
          summary: "The post-commit recovery guard passed.",
        }),
      },
    ];
    const plan = transactionPlan(project.root, validators);
    let interrupted = false;

    expect(() =>
      executeTransaction({
        root: project.root,
        plan,
        mutations: [{ target, content: proposedBytes, beforeDigest: sha256(originalBytes) }],
        acceptedConsents: [],
        validators,
        faultInjector: (point) => {
          if (!interrupted && point === "commit-file") {
            interrupted = true;
            throw new TransactionInterruption("Interrupt before registered post-validation.");
          }
        },
      }),
    ).toThrow(TransactionInterruption);
    expect(interrupted).toBe(true);
    expect(readFileSync(resolve(project.root, target))).toEqual(proposedBytes);

    const recovery = planRecovery({ root: project.root, strategy: "resume" });
    expect(recovery.action).toBe("rollback");
    expect(
      recoverTransaction(
        {
          root: project.root,
          strategy: "resume",
          allowCurrentProcessLockForTesting: true,
        },
        recovery.plan.planDigest,
      ),
    ).toMatchObject({ action: "rollback", state: "rolled-back" });
    expect(readFileSync(resolve(project.root, target))).toEqual(originalBytes);
    expect(onlyTransactionRecord(project.root).validations).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: "validator-registration-recovery-guard", state: "pass" }),
        expect.objectContaining({ id: "staged-overlay-recovery-guard", state: "pass" }),
      ]),
    );
  });

  it("fails closed when a callback attempts an unsafe overlay read", () => {
    const project = fixture();
    const validators: readonly TransactionValidator[] = [
      {
        id: "unsafe-read",
        label: "path",
        validateStagedOverlay: (context) => {
          context.readFile("../outside-project.ts");
          return { state: "pass", summary: "The unsafe read unexpectedly succeeded." };
        },
        validatePostCommit: () => ({ state: "pass", summary: "The post phase passed." }),
      },
    ];
    const plan = transactionPlan(project.root, validators);
    const error = catchError(() =>
      executeTransaction({
        root: project.root,
        plan,
        mutations: [{ target, content: proposedBytes, beforeDigest: sha256(originalBytes) }],
        acceptedConsents: [],
        validators,
      }),
    );

    expect(error).toMatchObject({ code: "TRANSACTION_STAGED_VALIDATION_FAILED", target: "." });
    expect(readFileSync(resolve(project.root, target))).toEqual(originalBytes);
    expect(onlyTransactionRecord(project.root)).toMatchObject({
      state: "rolled-back",
      backups: [],
    });
  });
});
