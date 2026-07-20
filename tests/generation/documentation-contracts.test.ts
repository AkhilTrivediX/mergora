import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { catalogDefinitions } from "../../registry/definitions/index.ts";
import { buildQualityPassportSkeletons } from "../../tooling/passport-builder/src/index.ts";
import {
  assertDocumentationContractIndex,
  buildDocumentationContractIndex,
} from "../../tooling/registry-builder/src/documentation-contracts.ts";
import {
  buildImplementationMatrix,
  loadImplementationProfileShards,
  loadMergoraSignaturePolicy,
} from "../../tooling/registry-builder/src/implementation-matrix.ts";
import {
  assertHonestGeneratedArtifact,
  canonicalJsonFile,
} from "../../tooling/registry-builder/src/index.ts";
import { buildRegistryPlans } from "../../tooling/registry-builder/src/model.ts";
import { createSourceTransformationSnapshot } from "../../tooling/source-transformer/src/index.ts";

const workspaceRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
const targetPassportSchema =
  "https://akhiltrivedix.github.io/mergora/r/v1/schemas/passport-v1.schema.json";
const schemaContracts = {
  catalogMetadata: "https://example.invalid/catalog-metadata.schema.json",
  registryIndex: "https://example.invalid/registry-index.schema.json",
  registryItem: "https://example.invalid/registry-item.schema.json",
  accessibilityContract: "https://example.invalid/accessibility-contract.schema.json",
  qualityPassport: targetPassportSchema,
} as const;

type Schema = boolean | Record<string, unknown>;

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function jsonEqual(left: unknown, right: unknown): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

function pointer(document: unknown, reference: string): unknown {
  if (!reference.startsWith("#/")) return undefined;
  let current = document;
  for (const encoded of reference.slice(2).split("/")) {
    const key = encoded.replaceAll("~1", "/").replaceAll("~0", "~");
    if (!isRecord(current) || !Object.hasOwn(current, key)) return undefined;
    current = current[key];
  }
  return current;
}

function typeMatches(type: string, value: unknown): boolean {
  if (type === "null") return value === null;
  if (type === "array") return Array.isArray(value);
  if (type === "object") return isRecord(value);
  if (type === "integer") return typeof value === "number" && Number.isInteger(value);
  return typeof value === type;
}

function validates(schema: Schema, value: unknown, root: Record<string, unknown>): boolean {
  if (schema === true) return true;
  if (schema === false) return false;
  if (typeof schema.$ref === "string") {
    const target = pointer(root, schema.$ref);
    return (typeof target === "boolean" || isRecord(target)) && validates(target, value, root);
  }
  if (Array.isArray(schema.oneOf)) {
    return (
      schema.oneOf.filter(
        (candidate) =>
          (typeof candidate === "boolean" || isRecord(candidate)) &&
          validates(candidate, value, root),
      ).length === 1
    );
  }
  if (
    Array.isArray(schema.allOf) &&
    !schema.allOf.every(
      (candidate) =>
        (typeof candidate === "boolean" || isRecord(candidate)) &&
        validates(candidate, value, root),
    )
  ) {
    return false;
  }
  if (Object.hasOwn(schema, "const") && !jsonEqual(schema.const, value)) return false;
  if (Array.isArray(schema.enum) && !schema.enum.some((entry) => jsonEqual(entry, value))) {
    return false;
  }
  if (typeof schema.type === "string" && !typeMatches(schema.type, value)) return false;

  if (isRecord(value)) {
    const required = Array.isArray(schema.required) ? schema.required : [];
    if (!required.every((key) => typeof key === "string" && Object.hasOwn(value, key))) {
      return false;
    }
    const properties = isRecord(schema.properties) ? schema.properties : {};
    if (
      schema.additionalProperties === false &&
      Object.keys(value).some((key) => !Object.hasOwn(properties, key))
    ) {
      return false;
    }
    for (const [key, propertySchema] of Object.entries(properties)) {
      if (
        Object.hasOwn(value, key) &&
        (typeof propertySchema === "boolean" || isRecord(propertySchema)) &&
        !validates(propertySchema, value[key], root)
      ) {
        return false;
      }
    }
  }
  if (Array.isArray(value)) {
    if (typeof schema.minItems === "number" && value.length < schema.minItems) return false;
    if (typeof schema.items === "boolean" || isRecord(schema.items)) {
      if (!value.every((entry) => validates(schema.items as Schema, entry, root))) return false;
    }
  }
  if (typeof value === "string") {
    if (typeof schema.minLength === "number" && value.length < schema.minLength) return false;
    if (typeof schema.pattern === "string" && !new RegExp(schema.pattern, "u").test(value)) {
      return false;
    }
  }
  if (typeof value === "number" && typeof schema.minimum === "number" && value < schema.minimum) {
    return false;
  }
  return true;
}

function fixture(excludedSourceIds: readonly string[] = []) {
  const excluded = new Set(excludedSourceIds);
  const sources = createSourceTransformationSnapshot(
    workspaceRoot,
    catalogDefinitions,
  ).sources.filter((source) => !excluded.has(source.id));
  const signaturePolicy = loadMergoraSignaturePolicy(workspaceRoot);
  const profiles = loadImplementationProfileShards(workspaceRoot, signaturePolicy);
  const matrix = buildImplementationMatrix(catalogDefinitions, sources, profiles, signaturePolicy);
  const passports = buildQualityPassportSkeletons(catalogDefinitions, targetPassportSchema);
  const catalog = buildRegistryPlans(catalogDefinitions, schemaContracts, sources).catalog;
  return buildDocumentationContractIndex(workspaceRoot, catalog, sources, matrix, passports);
}

describe("documentation contract index", () => {
  it("joins every catalog item deterministically without promoting draft or missing evidence", () => {
    const first = fixture();
    const second = fixture();
    expect(() => assertHonestGeneratedArtifact(first)).not.toThrow();
    expect(canonicalJsonFile(second)).toBe(canonicalJsonFile(first));
    expect(first.inventory).toEqual({
      items: 178,
      anatomy: { documented: 177, metadataSlotsOnly: 1, unavailable: 0 },
      semanticInteractionContracts: {
        sourceContractUnreleased: 177,
        draftUnavailable: 1,
        unavailable: 0,
      },
      stateApplicability: {
        available: 168,
        coverageOnlyUnavailable: 9,
        unavailable: 1,
      },
      recordedEvidence: { itemsWithRecords: 0, records: 0 },
    });
    expect(first.items.map((item) => item.id)).toEqual(
      [...first.items.map((item) => item.id)].sort(),
    );
    expect(
      first.items.every(
        (item) =>
          item.semanticInteractionContract.recordedEvidence.length === 0 &&
          item.passportSkeleton.publishable === false &&
          item.passportSkeleton.overallState === "blocked",
      ),
    ).toBe(true);
  });

  it("validates Basic, Recommended, and applicable state pointers against real exports", () => {
    const index = fixture();
    expect(
      index.items.every(
        (item) =>
          item.storybook.basic.status === "validated-source-export" &&
          item.storybook.recommended.status === "validated-source-export",
      ),
    ).toBe(true);
    const states = index.items.flatMap((item) =>
      item.stateApplicability.status === "available" ? item.stateApplicability.states : [],
    );
    const applicable = states.filter((state) => state.applicability === "applicable");
    expect(applicable).toHaveLength(1730);
    expect(applicable.every((state) => state.story?.status === "validated-source-export")).toBe(
      true,
    );
    expect(
      states
        .filter((state) => state.applicability === "not-applicable")
        .every((state) => typeof state.rationale === "string" && state.rationale.length > 0),
    ).toBe(true);

    const button = index.items.find((item) => item.id === "button")!;
    const buttonHover =
      button.stateApplicability.status === "available"
        ? button.stateApplicability.states.find((state) => state.id === "hover")
        : undefined;
    expect(buttonHover?.story).toEqual({
      status: "validated-source-export",
      modulePath: "apps/storybook/src/Button.stories.tsx",
      exportName: "VariantRail",
    });
  });

  it("keeps the Combobox draft and state gaps explicitly unavailable", () => {
    const index = fixture();
    const item = index.items.find((candidate) => candidate.id === "combobox")!;
    expect(item.anatomy.status).toBe("metadata-slots-only");
    expect(item.semanticInteractionContract).toMatchObject({
      status: "draft-unavailable",
      contractVersion: null,
      claim: null,
      semantics: null,
      document: null,
      recordedEvidence: [],
    });
    expect(item.stateApplicability).toMatchObject({
      status: "unavailable",
      sourcePath: null,
      states: [],
    });
  });

  it("publishes the Experimental Data Grid source contract without promoting maturity", () => {
    const index = fixture();
    const item = index.items.find((candidate) => candidate.id === "data-grid")!;
    expect(item.implementationStatus).toBe("source-present-unreleased");
    expect(item.anatomy).toMatchObject({
      status: "documented",
      sourcePath: "registry/source/systems/data-grid/data-grid.anatomy.json",
    });
    expect(item.semanticInteractionContract).toMatchObject({
      status: "source-contract-unreleased",
      sourcePath: "registry/source/systems/data-grid/data-grid.contract.json",
      contractVersion: "0.2.0",
      sourceStatus: "source-present-unreleased",
      recordedEvidence: [],
    });
    expect(item.stateApplicability).toMatchObject({
      status: "available",
      sourcePath: "registry/source/systems/data-grid/data-grid.stories.json",
    });
    expect(
      item.stateApplicability.status === "available"
        ? item.stateApplicability.states.find((state) => state.id === "loading")?.story
        : null,
    ).toEqual({
      status: "validated-source-export",
      modulePath: "apps/storybook/src/DataGrid.stories.tsx",
      exportName: "LoadingAndErrorRecovery",
    });
  });

  it("keeps newly planned items in the authority without inventing source contracts", () => {
    const index = fixture(["button"]);
    const button = index.items.find((item) => item.id === "button")!;
    expect(button).toMatchObject({
      implementationStatus: "unimplemented",
      anatomy: { status: "unavailable", sourcePath: null, document: null },
      semanticInteractionContract: {
        status: "unavailable",
        sourcePath: null,
        document: null,
        recordedEvidence: [],
      },
      stateApplicability: { status: "unavailable", sourcePath: null, states: [] },
    });
    expect(index.inventory.semanticInteractionContracts.unavailable).toBe(1);
  });

  it("satisfies its strict draft-2020-12 schema and rejects structural drift", () => {
    const index = fixture();
    const schema = JSON.parse(
      readFileSync(
        resolve(workspaceRoot, "registry/quality/documentation-contract-index.v1.schema.json"),
        "utf8",
      ),
    ) as Record<string, unknown>;
    expect(schema.$schema).toBe("https://json-schema.org/draft/2020-12/schema");
    expect(validates(schema, index, schema)).toBe(true);
    expect(() => assertDocumentationContractIndex(index)).not.toThrow();

    const extraProperty = structuredClone(index) as unknown as Record<string, unknown>;
    extraProperty.fabricatedEvidence = true;
    expect(validates(schema, extraProperty, schema)).toBe(false);

    const wrongInventory = structuredClone(index) as unknown as {
      inventory: { items: number };
    };
    wrongInventory.inventory.items = 1;
    expect(() => assertDocumentationContractIndex(wrongInventory)).toThrow(/inventory count/u);
  });
});
