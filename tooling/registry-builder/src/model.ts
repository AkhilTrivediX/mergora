export interface GeneratorCatalogDefinition {
  readonly kind: "catalog-item" | "kit";
  readonly id: string;
  readonly displayName: string;
  readonly layer: "foundation" | "component" | "system" | "kit";
  readonly category: string;
  readonly routeKind: "component" | "system" | "kit";
  readonly riskClass: 1 | 2 | 3;
  readonly trust: "core" | "labs" | "community";
  readonly implementationStatus: "unimplemented";
  readonly targetMaturity: "experimental" | "beta" | "stable" | "deprecated";
  readonly availabilityIntent: {
    readonly package: "planned" | "not-planned";
    readonly source: "planned" | "not-planned";
  };
  readonly normativeBehavior: string;
  readonly requiredEvidenceFamilies: readonly string[];
  readonly requiredStateGroups: readonly string[];
}

export interface GeneratorSchemaContracts {
  readonly catalogMetadata: string;
  readonly registryIndex: string;
  readonly registryItem: string;
  readonly accessibilityContract: string;
  readonly qualityPassport: string;
}

export interface RegistrySourcePresence {
  readonly id: string;
  readonly visibleStatus: "unreleased" | "experimental";
  readonly contractPath: string;
}

interface GeneratedMarker {
  readonly by: "@mergora-internal/registry-builder";
  readonly editPolicy: "do-not-edit";
}

export interface RegistryCatalogPlan {
  readonly schemaVersion: 1;
  readonly artifactKind: "registry-catalog-plan";
  readonly generated: GeneratedMarker;
  readonly publicationStatus: "blocked-unreleased";
  readonly maturitySemantics: "target-only-no-published-maturity";
  readonly schemaContracts: GeneratorSchemaContracts;
  readonly inventory: {
    readonly definitions: number;
    readonly catalogItems: number;
    readonly kits: number;
    readonly implementationStatus: Readonly<
      Record<"unimplemented" | "sourcePresentUnreleased", number>
    >;
    readonly layers: Readonly<Record<"foundation" | "component" | "system" | "kit", number>>;
    readonly trust: Readonly<Record<"core" | "labs" | "community", number>>;
    readonly targetMaturity: Readonly<
      Record<"experimental" | "beta" | "stable" | "deprecated", number>
    >;
  };
  readonly items: readonly (Omit<GeneratorCatalogDefinition, "implementationStatus"> & {
    readonly implementationStatus: "unimplemented" | "source-present-unreleased";
    readonly sourceAvailable: boolean;
    readonly visibleStatus: "unreleased" | "experimental" | null;
    readonly publishedMaturity: null;
  })[];
}

export interface RegistryIndexPlan {
  readonly schemaVersion: 1;
  readonly artifactKind: "registry-index-plan";
  readonly generated: GeneratedMarker;
  readonly futureReleaseSchema: string;
  readonly publishable: false;
  readonly protocolVersion: "mergora-v1";
  readonly registryIdentity: null;
  readonly release: null;
  readonly blockers: readonly [
    "release-identity-missing",
    "release-artifacts-missing",
    "quality-evidence-missing",
    "catalog-implementation-incomplete",
  ];
  readonly items: readonly {
    readonly id: string;
    readonly kind: "catalog-item" | "kit";
    readonly implementationStatus: "unimplemented" | "source-present-unreleased";
    readonly visibleStatus: "unreleased" | "experimental" | null;
    readonly version: null;
    readonly payload: null;
    readonly sourcePayload: string | null;
    readonly shadcnPayload: string | null;
    readonly contract: string | null;
    readonly passportSkeleton: string;
  }[];
}

const GENERATED_MARKER: GeneratedMarker = {
  by: "@mergora-internal/registry-builder",
  editPolicy: "do-not-edit",
};

function countBy<Value extends string>(
  values: readonly Value[],
  keys: readonly Value[],
): Record<Value, number> {
  return Object.fromEntries(
    keys.map((key) => [key, values.filter((value) => value === key).length]),
  ) as Record<Value, number>;
}

function assertCanonicalDefinitions(definitions: readonly GeneratorCatalogDefinition[]): void {
  const identities = new Map<string, string>();
  for (const definition of definitions) {
    const normalized = definition.id.normalize("NFKC").toLocaleLowerCase("en-US");
    const prior = identities.get(normalized);
    if (prior !== undefined) {
      throw new Error(
        `Catalog id ${JSON.stringify(definition.id)} collides with ${JSON.stringify(prior)} after Unicode/case normalization.`,
      );
    }
    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/u.test(definition.id)) {
      throw new Error(
        `Catalog id ${JSON.stringify(definition.id)} is not lowercase ASCII kebab-case.`,
      );
    }
    if (definition.implementationStatus !== "unimplemented") {
      throw new Error(
        `Canonical catalog seed cannot claim implemented status for ${JSON.stringify(definition.id)}.`,
      );
    }
    identities.set(normalized, definition.id);
  }
}

function sourcePresenceMap(
  definitions: readonly GeneratorCatalogDefinition[],
  sources: readonly RegistrySourcePresence[],
): ReadonlyMap<string, RegistrySourcePresence> {
  const ids = new Set(definitions.map((definition) => definition.id));
  const result = new Map<string, RegistrySourcePresence>();
  for (const source of sources) {
    if (!ids.has(source.id)) {
      throw new Error(`Source presence ${JSON.stringify(source.id)} has no catalog definition.`);
    }
    if (result.has(source.id)) {
      throw new Error(`Source presence ${JSON.stringify(source.id)} is declared more than once.`);
    }
    result.set(source.id, source);
  }
  return result;
}

export function buildRegistryPlans(
  definitions: readonly GeneratorCatalogDefinition[],
  schemaContracts: GeneratorSchemaContracts,
  sources: readonly RegistrySourcePresence[] = [],
): { readonly catalog: RegistryCatalogPlan; readonly index: RegistryIndexPlan } {
  assertCanonicalDefinitions(definitions);
  const sourceById = sourcePresenceMap(definitions, sources);
  const ordered = [...definitions].sort((left, right) => left.id.localeCompare(right.id, "en-US"));
  const items = ordered.map((definition) => {
    const source = sourceById.get(definition.id);
    return {
      ...definition,
      implementationStatus:
        source === undefined ? ("unimplemented" as const) : ("source-present-unreleased" as const),
      sourceAvailable: source !== undefined,
      visibleStatus: source?.visibleStatus ?? null,
      publishedMaturity: null,
    };
  });

  return {
    catalog: {
      schemaVersion: 1,
      artifactKind: "registry-catalog-plan",
      generated: GENERATED_MARKER,
      publicationStatus: "blocked-unreleased",
      maturitySemantics: "target-only-no-published-maturity",
      schemaContracts,
      inventory: {
        definitions: ordered.length,
        catalogItems: ordered.filter((definition) => definition.kind === "catalog-item").length,
        kits: ordered.filter((definition) => definition.kind === "kit").length,
        implementationStatus: {
          unimplemented: ordered.length - sourceById.size,
          sourcePresentUnreleased: sourceById.size,
        },
        layers: countBy(
          ordered.map((definition) => definition.layer),
          ["foundation", "component", "system", "kit"],
        ),
        trust: countBy(
          ordered.map((definition) => definition.trust),
          ["core", "labs", "community"],
        ),
        targetMaturity: countBy(
          ordered.map((definition) => definition.targetMaturity),
          ["experimental", "beta", "stable", "deprecated"],
        ),
      },
      items,
    },
    index: {
      schemaVersion: 1,
      artifactKind: "registry-index-plan",
      generated: GENERATED_MARKER,
      futureReleaseSchema: schemaContracts.registryIndex,
      publishable: false,
      protocolVersion: "mergora-v1",
      registryIdentity: null,
      release: null,
      blockers: [
        "release-identity-missing",
        "release-artifacts-missing",
        "quality-evidence-missing",
        "catalog-implementation-incomplete",
      ],
      items: ordered.map((definition) => {
        const source = sourceById.get(definition.id);
        return {
          id: definition.id,
          kind: definition.kind,
          implementationStatus:
            source === undefined
              ? ("unimplemented" as const)
              : ("source-present-unreleased" as const),
          visibleStatus: source?.visibleStatus ?? null,
          version: null,
          payload: null,
          sourcePayload:
            source === undefined
              ? null
              : `registry/generated/native-source-items/${definition.id}.json`,
          shadcnPayload:
            source === undefined ? null : `registry/generated/shadcn/${definition.id}.json`,
          contract: source?.contractPath ?? null,
          passportSkeleton: `${definition.id}-passport-skeleton`,
        };
      }),
    },
  };
}
