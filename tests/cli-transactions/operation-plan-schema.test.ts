import { readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

import * as ts from "typescript";
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

const cliSourceRoot = resolve(import.meta.dirname, "../../packages/cli/src");

interface PublicBoundary {
  readonly name: string;
  readonly source: string;
}

const publicOperationPlanners = [
  { name: "planInit", source: "configuration.ts" },
  { name: "planDoctorFix", source: "configuration.ts" },
  { name: "planProjectCreate", source: "project-create.ts" },
  { name: "planSourceAdd", source: "source-operations.ts" },
  { name: "planAcquiredSourceAdd", source: "source-operations.ts" },
  { name: "planSourceRemove", source: "source-operations.ts" },
  { name: "planSourceAdopt", source: "source-operations.ts" },
  { name: "planShadcnAdoption", source: "shadcn-adoption.ts" },
  { name: "planSemanticUpdate", source: "semantic-update.ts" },
  { name: "planAcquiredSemanticUpdate", source: "semantic-update.ts" },
  { name: "planSemanticResolveChoice", source: "semantic-update.ts" },
  { name: "planSemanticResolveApply", source: "semantic-update.ts" },
  { name: "planRecovery", source: "transaction-engine.ts" },
  { name: "planRollback", source: "transaction-engine.ts" },
  { name: "planThemeApply", source: "theme.ts" },
  { name: "planThemeImport", source: "theme.ts" },
  { name: "planMigration", source: "migrate.ts" },
  { name: "planDistributionModeTransaction", source: "distribution-mode-migration.ts" },
  { name: "planProjectDistributionModeMigration", source: "distribution-mode-command.ts" },
  { name: "planPackageDistributionAdd", source: "distribution-operations.ts" },
  { name: "planPackageDistributionRemove", source: "distribution-operations.ts" },
  { name: "planPackageDistributionUpdate", source: "distribution-operations.ts" },
  { name: "planClean", source: "clean.ts" },
  { name: "planRegistryEnrollment", source: "registry-management.ts" },
  { name: "planRegistryRemoval", source: "registry-management.ts" },
  { name: "planVendor", source: "vendor.ts" },
  { name: "planStableVendor", source: "vendor.ts" },
] as const satisfies readonly PublicBoundary[];

const publicOperationMutators = [
  { name: "applyInit", source: "configuration.ts" },
  { name: "applyDoctorFix", source: "configuration.ts" },
  { name: "applyProjectCreate", source: "project-create.ts" },
  { name: "applySourceAdd", source: "source-operations.ts" },
  { name: "applyAcquiredSourceAdd", source: "source-operations.ts" },
  { name: "applySourceRemove", source: "source-operations.ts" },
  { name: "applySourceAdopt", source: "source-operations.ts" },
  { name: "applyShadcnAdoption", source: "shadcn-adoption.ts" },
  { name: "applySemanticUpdate", source: "semantic-update.ts" },
  { name: "applyAcquiredSemanticUpdate", source: "semantic-update.ts" },
  { name: "applySemanticResolveChoice", source: "semantic-update.ts" },
  { name: "applySemanticResolution", source: "semantic-update.ts" },
  { name: "recoverTransaction", source: "transaction-engine.ts" },
  { name: "rollbackTransaction", source: "transaction-engine.ts" },
  { name: "applyTheme", source: "theme.ts" },
  { name: "importTheme", source: "theme.ts" },
  { name: "applyMigration", source: "migrate.ts" },
  { name: "applyDistributionModeTransaction", source: "distribution-mode-migration.ts" },
  { name: "applyProjectDistributionModeMigration", source: "distribution-mode-command.ts" },
  { name: "applyPackageDistributionAdd", source: "distribution-operations.ts" },
  { name: "applyPackageDistributionRemove", source: "distribution-operations.ts" },
  { name: "applyPackageDistributionUpdate", source: "distribution-operations.ts" },
  { name: "applyClean", source: "clean.ts" },
  { name: "applyRegistryConfigPlan", source: "registry-management.ts" },
  { name: "applyVendor", source: "vendor.ts" },
  { name: "applyStableVendor", source: "vendor.ts" },
] as const satisfies readonly PublicBoundary[];

function cliSourceFiles(): readonly string[] {
  return readdirSync(cliSourceRoot)
    .filter((entry) => entry.endsWith(".ts"))
    .sort((left, right) => left.localeCompare(right, "en-US"));
}

function sourceText(source: string): string {
  return readFileSync(resolve(cliSourceRoot, source), "utf8");
}

function exportedFunctionNames(pattern: RegExp): readonly string[] {
  return cliSourceFiles()
    .flatMap((source) => [...sourceText(source).matchAll(pattern)].map((match) => match[1]!))
    .sort((left, right) => left.localeCompare(right, "en-US"));
}

function functionCallGraph(source: string): ReadonlyMap<string, ReadonlySet<string>> {
  const path = resolve(cliSourceRoot, source);
  const syntax = ts.createSourceFile(
    path,
    readFileSync(path, "utf8"),
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TS,
  );
  const graph = new Map<string, ReadonlySet<string>>();
  const callsIn = (body: ts.Node): ReadonlySet<string> => {
    const calls = new Set<string>();
    const visit = (node: ts.Node): void => {
      if (ts.isCallExpression(node) && ts.isIdentifier(node.expression)) {
        calls.add(node.expression.text);
      }
      ts.forEachChild(node, visit);
    };
    visit(body);
    return calls;
  };
  for (const statement of syntax.statements) {
    if (ts.isFunctionDeclaration(statement) && statement.name !== undefined && statement.body) {
      graph.set(statement.name.text, callsIn(statement.body));
      continue;
    }
    if (!ts.isVariableStatement(statement)) continue;
    for (const declaration of statement.declarationList.declarations) {
      if (
        ts.isIdentifier(declaration.name) &&
        declaration.initializer !== undefined &&
        (ts.isArrowFunction(declaration.initializer) ||
          ts.isFunctionExpression(declaration.initializer))
      ) {
        graph.set(declaration.name.text, callsIn(declaration.initializer.body));
      }
    }
  }
  return graph;
}

function reachesBoundary(boundary: PublicBoundary, sinks: ReadonlySet<string>): boolean {
  const graph = functionCallGraph(boundary.source);
  const visited = new Set<string>();
  const visit = (name: string): boolean => {
    if (visited.has(name)) return false;
    visited.add(name);
    const calls = graph.get(name);
    if (calls === undefined) return false;
    if ([...calls].some((call) => sinks.has(call))) return true;
    return [...calls].some((call) => graph.has(call) && visit(call));
  };
  return visit(boundary.name);
}

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
      $id: "https://mergora.vercel.app/r/v1/schemas/plan-v1.schema.json",
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

  it("enumerates every exported material planner and requires the canonical finalizer", () => {
    const discovered = exportedFunctionNames(
      /^export\s+(?:async\s+)?function\s+(plan[A-Z][A-Za-z0-9]*)\s*\(/gmu,
    );
    const expected = [
      ...publicOperationPlanners.map(({ name }) => name),
      // This is an in-memory package.json diff helper, not a material operation planner.
      "planOwnedPackageDependencyChange",
      "planPackageDependencies",
    ].sort((left, right) => left.localeCompare(right, "en-US"));
    expect(discovered).toEqual(expected);
    for (const boundary of publicOperationPlanners) {
      expect(
        reachesBoundary(boundary, new Set(["finalizeOperationPlan"])),
        `${boundary.name} must reach finalizeOperationPlan`,
      ).toBe(true);
    }
  });

  it("enumerates every public mutation boundary and requires canonical validation", () => {
    const discovered = exportedFunctionNames(
      /^export\s+(?:async\s+)?function\s+((?:apply[A-Z][A-Za-z0-9]*|importTheme|recoverTransaction|rollbackTransaction))\s*\(/gmu,
    );
    const expected = publicOperationMutators
      .map(({ name }) => name)
      .sort((left, right) => left.localeCompare(right, "en-US"));
    expect(discovered).toEqual(expected);
    const validatedSinks = new Set([
      "assertValidOperationPlanV1",
      "executeTransaction",
      "finalizeOperationPlan",
      "validateTransactionOverlay",
    ]);
    for (const boundary of publicOperationMutators) {
      expect(
        reachesBoundary(boundary, validatedSinks),
        `${boundary.name} must reach a canonical plan validation boundary`,
      ).toBe(true);
    }
  });

  it("keeps the canonical finalizer as the only computed plan-digest constructor", () => {
    const constructors = cliSourceFiles().flatMap((source) =>
      [...sourceText(source).matchAll(/\bplanDigest\s*:\s*(?:digest|sha256)\s*\(/gu)].map(
        () => source,
      ),
    );
    expect(constructors).toEqual(["transaction-engine.ts"]);
  });
});
