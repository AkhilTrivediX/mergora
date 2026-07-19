import { describe, expect, it } from "vitest";

import { canonicalJson, sha256 } from "../../packages/cli/src/contracts.ts";
import {
  assertValidOperationPlanV1,
  executeTransaction,
  finalizeOperationPlan,
  validateTransactionOverlay,
  type OperationPlan,
  type OperationPlanWithoutDigest,
} from "../../packages/cli/src/transaction-engine.ts";
import { operationPlanSchema, validateSchemaDocument } from "../../registry/schemas/index.ts";

const digest = (character: string): `sha256:${string}` => `sha256:${character.repeat(64)}`;

function canonicalInput(command: OperationPlan["command"] = "add"): OperationPlanWithoutDigest {
  return {
    schemaVersion: 1,
    command,
    cliVersion: "1.0.0",
    projectRoot: ".",
    configDigest: digest("1"),
    manifestPreconditionDigest: null,
    registries: [],
    items: [],
    fileOperations: [],
    dependencyChanges: [],
    structuredPatches: [],
    migrations: [],
    contractChanges: [],
    warnings: [],
    consentRequirements: [],
    conflicts: [],
    estimatedBytes: { download: 0, write: 0 },
    validationSuite: ["schema", "digest", "path", "collision", "ownership", "dependency"],
    rollbackAvailable: true,
  };
}

function recomputedPlan(semantic: Record<string, unknown>): OperationPlan {
  return {
    ...semantic,
    planDigest: sha256(canonicalJson(semantic)),
  } as unknown as OperationPlan;
}

describe("canonical operation-plan v1 schema boundary", () => {
  it("uses the published closed schema and preserves the exact semantic digest", () => {
    expect(operationPlanSchema).toMatchObject({
      $id: "https://akhiltrivedix.github.io/mergora/r/v1/schemas/plan-v1.schema.json",
      additionalProperties: false,
    });
    const input = canonicalInput();
    const plan = finalizeOperationPlan(input);

    expect(plan.planDigest).toBe(sha256(canonicalJson(input)));
    expect(validateSchemaDocument("operation-plan", plan)).toMatchObject({ ok: true });
    expect(() => assertValidOperationPlanV1(plan)).not.toThrow();
  });

  it("accepts clean as a canonical public operation command", () => {
    expect(() => finalizeOperationPlan(canonicalInput("clean"))).not.toThrow();
  });

  it("rejects top-level and nested planner extensions during finalization", () => {
    const topLevel = {
      ...canonicalInput(),
      plannerExtension: { unreviewed: true },
    } as unknown as OperationPlanWithoutDigest;
    expect(() => finalizeOperationPlan(topLevel)).toThrow(
      expect.objectContaining({ code: "OPERATION_PLAN_SCHEMA_INVALID" }),
    );

    const nested = {
      ...canonicalInput(),
      fileOperations: [
        {
          operation: "add",
          target: "src/example.ts",
          owner: "official:example",
          base: null,
          local: null,
          remote: digest("2"),
          proposed: digest("2"),
          mediaType: "text/typescript",
          risk: "ordinary",
          reason: "Exercise closed nested validation.",
          unreviewedNestedValue: true,
        },
      ],
    } as unknown as OperationPlanWithoutDigest;
    expect(() => finalizeOperationPlan(nested)).toThrow(
      expect.objectContaining({ code: "OPERATION_PLAN_SCHEMA_INVALID" }),
    );
  });

  it("does not echo an attacker-controlled extension name in schema errors", () => {
    const hostileProperty = "credential-shaped-private-extension";
    const invalid = {
      ...canonicalInput(),
      [hostileProperty]: true,
    } as unknown as OperationPlanWithoutDigest;

    try {
      finalizeOperationPlan(invalid);
      throw new Error("Expected schema validation to reject the hostile extension.");
    } catch (error) {
      expect(error).toMatchObject({ code: "OPERATION_PLAN_SCHEMA_INVALID" });
      expect((error as Error).message).not.toContain(hostileProperty);
    }
  });

  it("rejects a schema-invalid plan with a recomputed digest at dry-run and apply boundaries", () => {
    const invalid = recomputedPlan({
      ...canonicalInput(),
      unreviewedTopLevelValue: true,
    });

    expect(() =>
      validateTransactionOverlay({
        root: process.cwd(),
        plan: invalid,
        mutations: [],
        validators: [],
      }),
    ).toThrow(expect.objectContaining({ code: "OPERATION_PLAN_SCHEMA_INVALID" }));
    expect(() =>
      executeTransaction({
        root: process.cwd(),
        plan: invalid,
        mutations: [],
        acceptedConsents: [],
      }),
    ).toThrow(expect.objectContaining({ code: "OPERATION_PLAN_SCHEMA_INVALID" }));
  });

  it("still rejects a schema-valid plan whose exact semantic digest changed", () => {
    const plan = finalizeOperationPlan(canonicalInput());
    const tampered = { ...plan, planDigest: digest("f") };

    expect(() =>
      validateTransactionOverlay({
        root: process.cwd(),
        plan: tampered,
        mutations: [],
        validators: [],
      }),
    ).toThrow(expect.objectContaining({ code: "PLAN_DIGEST_INVALID" }));
    expect(() =>
      executeTransaction({
        root: process.cwd(),
        plan: tampered,
        mutations: [],
        acceptedConsents: [],
      }),
    ).toThrow(expect.objectContaining({ code: "PLAN_DIGEST_INVALID" }));
  });
});
