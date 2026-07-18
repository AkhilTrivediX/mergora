import { catalogDefinitions, EXPECTED_INVENTORY } from "./catalog.ts";
import type { CatalogDefinition, CatalogLayer, RouteKind, TargetMaturity } from "./types.ts";

export type CatalogValidationCode =
  | "duplicate-normalized-id"
  | "invalid-id"
  | "inventory-count"
  | "layer-count"
  | "kind-layer-mismatch"
  | "route-layer-mismatch"
  | "empty-field"
  | "duplicate-requirement"
  | "implementation-status"
  | "target-maturity"
  | "trust-tier"
  | "availability-intent"
  | "presence-contract";

export interface CatalogValidationIssue {
  readonly code: CatalogValidationCode;
  readonly id?: string;
  readonly message: string;
}

export interface CatalogValidationOptions {
  readonly enforceExpectedInventory?: boolean;
}

const EXPECTED_ROUTE_BY_LAYER: Readonly<Record<CatalogLayer, RouteKind>> = {
  foundation: "component",
  component: "component",
  system: "system",
  kit: "kit",
};

const TARGET_MATURITY_EXCEPTIONS: Readonly<Record<string, TargetMaturity>> = {
  kanban: "beta",
  "rich-text-editor": "experimental",
  "scheduler-kit": "beta",
};

export function normalizeCatalogId(id: string): string {
  return id.normalize("NFKC").toLocaleLowerCase("en-US");
}

function hasDuplicates(values: readonly string[]): boolean {
  return new Set(values).size !== values.length;
}

export function validateCatalogDefinitions(
  definitions: readonly CatalogDefinition[] = catalogDefinitions,
  options: CatalogValidationOptions = {},
): readonly CatalogValidationIssue[] {
  const issues: CatalogValidationIssue[] = [];
  const normalizedIds = new Map<string, string>();

  for (const definition of definitions) {
    const normalizedId = normalizeCatalogId(definition.id);
    const previousId = normalizedIds.get(normalizedId);

    if (previousId !== undefined) {
      issues.push({
        code: "duplicate-normalized-id",
        id: definition.id,
        message: `ID ${JSON.stringify(definition.id)} collides with ${JSON.stringify(previousId)} after NFKC normalization and case folding.`,
      });
    } else {
      normalizedIds.set(normalizedId, definition.id);
    }

    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(definition.id)) {
      issues.push({
        code: "invalid-id",
        id: definition.id,
        message: "IDs must use lowercase ASCII kebab-case after collision checks are applied.",
      });
    }

    if (definition.displayName.trim() === "" || definition.normativeBehavior.trim() === "") {
      issues.push({
        code: "empty-field",
        id: definition.id,
        message: "Display name and normative behavior must both be non-empty.",
      });
    }

    if (
      definition.requiredEvidenceFamilies.length === 0 ||
      definition.requiredStateGroups.length === 0
    ) {
      issues.push({
        code: "empty-field",
        id: definition.id,
        message: "Every definition must identify at least one evidence family and state group.",
      });
    }

    if (
      hasDuplicates(definition.requiredEvidenceFamilies) ||
      hasDuplicates(definition.requiredStateGroups)
    ) {
      issues.push({
        code: "duplicate-requirement",
        id: definition.id,
        message: "Evidence families and state groups must not contain duplicate values.",
      });
    }

    if (definition.implementationStatus !== "unimplemented") {
      issues.push({
        code: "implementation-status",
        id: definition.id,
        message:
          "The canonical seed is pre-implementation and must not imply that an entry has been built.",
      });
    }

    const expectedKind = definition.layer === "kit" ? "kit" : "catalog-item";
    if (definition.kind !== expectedKind) {
      issues.push({
        code: "kind-layer-mismatch",
        id: definition.id,
        message: `Layer ${definition.layer} requires kind ${expectedKind}.`,
      });
    }

    const expectedRoute = EXPECTED_ROUTE_BY_LAYER[definition.layer];
    if (definition.routeKind !== expectedRoute) {
      issues.push({
        code: "route-layer-mismatch",
        id: definition.id,
        message: `Layer ${definition.layer} requires route kind ${expectedRoute}.`,
      });
    }

    const expectedMaturity = TARGET_MATURITY_EXCEPTIONS[definition.id] ?? "stable";
    if (definition.targetMaturity !== expectedMaturity) {
      issues.push({
        code: "target-maturity",
        id: definition.id,
        message: `Target maturity must be ${expectedMaturity}; current implementation status remains unimplemented.`,
      });
    }

    const expectedTrust = definition.id === "rich-text-editor" ? "labs" : "core";
    if (definition.trust !== expectedTrust) {
      issues.push({
        code: "trust-tier",
        id: definition.id,
        message: `Seed trust tier must be ${expectedTrust}.`,
      });
    }

    const expectedPackageIntent = definition.kind === "kit" ? "not-planned" : "planned";
    if (
      definition.availabilityIntent.package !== expectedPackageIntent ||
      definition.availabilityIntent.source !== "planned"
    ) {
      issues.push({
        code: "availability-intent",
        id: definition.id,
        message: `Expected package=${expectedPackageIntent} and source=planned availability intent.`,
      });
    }
  }

  const foundationPresence = definitions.find((definition) => definition.id === "presence");
  const collaborationPresence = definitions.find(
    (definition) => definition.id === "collaboration-presence",
  );
  if (
    foundationPresence?.category !== "foundation-utilities" ||
    collaborationPresence?.category !== "ai-collaboration"
  ) {
    issues.push({
      code: "presence-contract",
      message:
        "Keep foundation `presence` for lifecycle behavior and `collaboration-presence` for avatar/status presence; they are not interchangeable contracts.",
    });
  }

  if (options.enforceExpectedInventory !== false) {
    const itemCount = definitions.filter((definition) => definition.kind === "catalog-item").length;
    const kitCount = definitions.filter((definition) => definition.kind === "kit").length;

    if (
      definitions.length !== EXPECTED_INVENTORY.definitions ||
      itemCount !== EXPECTED_INVENTORY.catalogItems ||
      kitCount !== EXPECTED_INVENTORY.kits
    ) {
      issues.push({
        code: "inventory-count",
        message: `Expected ${EXPECTED_INVENTORY.catalogItems} catalog items plus ${EXPECTED_INVENTORY.kits} kits (${EXPECTED_INVENTORY.definitions} total); received ${itemCount} plus ${kitCount} (${definitions.length} total).`,
      });
    }

    for (const [layer, expectedCount] of Object.entries(EXPECTED_INVENTORY.layers)) {
      const actualCount = definitions.filter((definition) => definition.layer === layer).length;
      if (actualCount !== expectedCount) {
        issues.push({
          code: "layer-count",
          message: `Expected ${expectedCount} ${layer} definitions; received ${actualCount}.`,
        });
      }
    }
  }

  return issues;
}

export function assertValidCatalogDefinitions(
  definitions: readonly CatalogDefinition[] = catalogDefinitions,
  options: CatalogValidationOptions = {},
): void {
  const issues = validateCatalogDefinitions(definitions, options);
  if (issues.length === 0) return;

  const detail = issues
    .map((issue) => `${issue.code}${issue.id ? `:${issue.id}` : ""}: ${issue.message}`)
    .join("\n");
  throw new Error(`Catalog definition validation failed:\n${detail}`);
}
