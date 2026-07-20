export interface DocsCatalogDefinition {
  readonly id: string;
  readonly displayName: string;
  readonly layer: "foundation" | "component" | "system" | "kit";
  readonly category: string;
  readonly routeKind: "component" | "system" | "kit";
  readonly riskClass: 1 | 2 | 3;
  readonly trust: "core" | "labs" | "community";
  readonly implementationStatus: "unimplemented";
  readonly targetMaturity: "experimental" | "beta" | "stable" | "deprecated";
  readonly normativeBehavior: string;
  readonly requiredEvidenceFamilies: readonly string[];
  readonly requiredStateGroups: readonly string[];
}

interface GeneratedMarker {
  readonly by: "@mergora-internal/docs-builder";
  readonly editPolicy: "do-not-edit";
}

export interface DocsArtifacts {
  readonly docs: {
    readonly schemaVersion: 1;
    readonly artifactKind: "docs-index";
    readonly generated: GeneratedMarker;
    readonly maturitySemantics: "target-only-all-items-currently-unimplemented";
    readonly items: readonly {
      readonly id: string;
      readonly displayName: string;
      readonly route: string;
      readonly routeKind: "component" | "system" | "kit";
      readonly layer: "foundation" | "component" | "system" | "kit";
      readonly category: string;
      readonly riskClass: 1 | 2 | 3;
      readonly trust: "core" | "labs" | "community";
      readonly implementationStatus: "unimplemented";
      readonly targetMaturity: "experimental" | "beta" | "stable" | "deprecated";
      readonly publishedMaturity: null;
      readonly summary: string;
      readonly sourceAvailable: false;
      readonly apiAvailable: false;
      readonly evidenceAvailable: false;
      readonly serverBoundary: "unavailable";
      readonly directions: readonly [];
      readonly locales: readonly [];
      readonly registryDependencies: readonly [];
      readonly runtimeDependencies: readonly [];
      readonly distribution: {
        readonly package: "planned";
        readonly source: "planned";
      };
    }[];
  };
  readonly search: {
    readonly schemaVersion: 1;
    readonly artifactKind: "static-search-index";
    readonly generated: GeneratedMarker;
    readonly entries: readonly {
      readonly id: string;
      readonly title: string;
      readonly route: string;
      readonly group: string;
      readonly terms: readonly string[];
      readonly summary: string;
      readonly availability: "unimplemented";
    }[];
  };
  readonly api: {
    readonly schemaVersion: 1;
    readonly artifactKind: "api-index";
    readonly generated: GeneratedMarker;
    readonly entries: readonly {
      readonly id: string;
      readonly route: string;
      readonly status: "unavailable-unimplemented";
      readonly exports: readonly [];
      readonly props: readonly [];
      readonly message: string;
    }[];
  };
  readonly navigation: {
    readonly schemaVersion: 1;
    readonly artifactKind: "navigation-graph";
    readonly generated: GeneratedMarker;
    readonly groups: readonly {
      readonly id: "components" | "systems" | "kits";
      readonly items: readonly {
        readonly id: string;
        readonly title: string;
        readonly route: string;
      }[];
    }[];
  };
}

const GENERATED_MARKER: GeneratedMarker = {
  by: "@mergora-internal/docs-builder",
  editPolicy: "do-not-edit",
};

function routeFor(definition: DocsCatalogDefinition): string {
  const prefix =
    definition.routeKind === "component"
      ? "components"
      : definition.routeKind === "system"
        ? "systems"
        : "kits";
  return `/${prefix}/${definition.id}`;
}

function searchTerms(definition: DocsCatalogDefinition): readonly string[] {
  return [
    ...definition.id.split("-"),
    ...definition.displayName.toLocaleLowerCase("en-US").split(/\s+/u),
    ...definition.category.split("-"),
    definition.layer,
  ].filter((term, index, terms) => term !== "" && terms.indexOf(term) === index);
}

export function buildDocsArtifacts(definitions: readonly DocsCatalogDefinition[]): DocsArtifacts {
  const ordered = [...definitions].sort((left, right) => left.id.localeCompare(right.id, "en-US"));
  const docsItems = ordered.map((definition) => ({
    id: definition.id,
    displayName: definition.displayName,
    route: routeFor(definition),
    routeKind: definition.routeKind,
    layer: definition.layer,
    category: definition.category,
    riskClass: definition.riskClass,
    trust: definition.trust,
    implementationStatus: definition.implementationStatus,
    targetMaturity: definition.targetMaturity,
    publishedMaturity: null,
    summary: definition.normativeBehavior,
    sourceAvailable: false as const,
    apiAvailable: false as const,
    evidenceAvailable: false as const,
    serverBoundary: "unavailable" as const,
    directions: [] as const,
    locales: [] as const,
    registryDependencies: [] as const,
    runtimeDependencies: [] as const,
    distribution: {
      package: "planned" as const,
      source: "planned" as const,
    },
  }));

  return {
    docs: {
      schemaVersion: 1,
      artifactKind: "docs-index",
      generated: GENERATED_MARKER,
      maturitySemantics: "target-only-all-items-currently-unimplemented",
      items: docsItems,
    },
    search: {
      schemaVersion: 1,
      artifactKind: "static-search-index",
      generated: GENERATED_MARKER,
      entries: ordered.map((definition) => ({
        id: definition.id,
        title: definition.displayName,
        route: routeFor(definition),
        group: definition.category,
        terms: searchTerms(definition),
        summary: definition.normativeBehavior,
        availability: "unimplemented",
      })),
    },
    api: {
      schemaVersion: 1,
      artifactKind: "api-index",
      generated: GENERATED_MARKER,
      entries: ordered.map((definition) => ({
        id: definition.id,
        route: routeFor(definition),
        status: "unavailable-unimplemented",
        exports: [] as const,
        props: [] as const,
        message:
          "API data will be generated only after canonical source and validated exports exist.",
      })),
    },
    navigation: {
      schemaVersion: 1,
      artifactKind: "navigation-graph",
      generated: GENERATED_MARKER,
      groups: (["components", "systems", "kits"] as const).map((group) => ({
        id: group,
        items: ordered
          .filter((definition) => {
            if (group === "components") return definition.routeKind === "component";
            if (group === "systems") return definition.routeKind === "system";
            return definition.routeKind === "kit";
          })
          .map((definition) => ({
            id: definition.id,
            title: definition.displayName,
            route: routeFor(definition),
          })),
      })),
    },
  };
}
