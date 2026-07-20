import { existsSync, readFileSync } from "node:fs";
import { dirname, parse, resolve } from "node:path";
import { pathToFileURL } from "node:url";

import { assertHonestGeneratedArtifact, canonicalJsonFile } from "./canonical.ts";
import { type GeneratedFile, syncGeneratedFiles } from "./files.ts";
import {
  buildImplementationMatrix,
  loadImplementationProfileShards,
  loadMergoraSignaturePolicy,
} from "./implementation-matrix.ts";
import {
  buildRegistryPlans,
  type GeneratorCatalogDefinition,
  type GeneratorSchemaContracts,
} from "./model.ts";
import { buildBlockedReleaseProtocolPlan } from "./release-protocol.ts";
import {
  buildChangelogInputs,
  buildShadcnRegistry,
  buildShadcnSourceItem,
  buildSourceViews,
  buildUnreleasedNativeSourceItem,
  buildVerticalSliceApi,
  type PayloadCanonicalSource,
} from "./source-payloads.ts";
import { buildPublicApiDocs } from "./public-api-docs.ts";
import { buildDocumentationContractIndex } from "./documentation-contracts.ts";

interface CatalogModule {
  readonly catalogDefinitions: readonly GeneratorCatalogDefinition[];
  readonly assertValidCatalogDefinitions: (
    definitions: readonly GeneratorCatalogDefinition[],
  ) => void;
}

interface SchemaModule {
  readonly SCHEMA_REGISTRY: Readonly<
    Record<string, { readonly $id?: string; readonly $schema?: string }>
  >;
  readonly aggregateEvidenceState: (context: string, state: string) => string;
  readonly validateSchemaDocument: (
    kind: string,
    value: unknown,
  ) => { readonly ok: boolean; readonly errors: readonly unknown[] };
}

interface SourceSnapshotSource extends PayloadCanonicalSource {
  readonly packageEntryPath: string;
  readonly stylePath: string;
}

interface SourceTransformerModule {
  readonly createSourceTransformationSnapshot: (
    workspaceRoot: string,
    definitions: readonly GeneratorCatalogDefinition[],
  ) => {
    readonly plan: unknown;
    readonly sources: readonly SourceSnapshotSource[];
    readonly files: readonly GeneratedFile[];
  };
}

interface PackageBuilderModule {
  readonly buildPackageExportPlan: (
    definitions: readonly GeneratorCatalogDefinition[],
    packageMap: unknown,
    sources: readonly SourceSnapshotSource[],
  ) => unknown;
  readonly buildUiPackageManifest: (
    packageMap: unknown,
    definitions: readonly GeneratorCatalogDefinition[],
    sources: readonly SourceSnapshotSource[],
  ) => unknown;
  readonly buildUiPackageIndex: (
    definitions: readonly GeneratorCatalogDefinition[],
    sources: readonly SourceSnapshotSource[],
  ) => string;
}

interface PublicPackageMap {
  readonly cli: {
    readonly bin: string;
    readonly package: string;
  };
  readonly public: {
    readonly ui: string;
  };
}

interface DocsBuilderModule {
  readonly buildDocsArtifacts: (definitions: readonly GeneratorCatalogDefinition[]) => {
    readonly docs: unknown;
    readonly search: unknown;
    readonly api: unknown;
    readonly navigation: unknown;
  };
}

interface PassportBuilderModule {
  readonly buildQualityPassportSkeletons: (
    definitions: readonly GeneratorCatalogDefinition[],
    targetSchema: string,
  ) => unknown;
}

const JSON_SCHEMA_DIALECT = "https://json-schema.org/draft/2020-12/schema";

async function importWorkspaceModule<Module>(
  workspaceRoot: string,
  relativePath: string,
): Promise<Module> {
  const moduleUrl = pathToFileURL(resolve(workspaceRoot, ...relativePath.split("/"))).href;
  return (await import(moduleUrl)) as Module;
}

export function findWorkspaceRoot(start: string): string {
  let candidate = resolve(start);
  const filesystemRoot = parse(candidate).root;
  while (true) {
    if (
      existsSync(resolve(candidate, "package.json")) &&
      existsSync(resolve(candidate, "registry", "definitions", "catalog.ts")) &&
      existsSync(resolve(candidate, "config", "public-packages.json"))
    ) {
      return candidate;
    }
    if (candidate === filesystemRoot) {
      throw new Error("Could not locate the Mergora workspace root.");
    }
    candidate = dirname(candidate);
  }
}

function schemaId(schemas: SchemaModule["SCHEMA_REGISTRY"], kind: string): string {
  const schema = schemas[kind];
  if (schema?.$schema !== JSON_SCHEMA_DIALECT || schema.$id === undefined) {
    throw new Error(
      `Required ${JSON.stringify(kind)} schema is missing a draft-2020-12 dialect or stable id.`,
    );
  }
  return schema.$id;
}

function generatedFile(path: string, value: unknown): GeneratedFile {
  assertHonestGeneratedArtifact(value);
  return { path, content: canonicalJsonFile(value) };
}

function prettyGeneratedJsonFile(path: string, value: unknown): GeneratedFile {
  assertHonestGeneratedArtifact(value);
  return { path, content: `${JSON.stringify(value, null, 2)}\n` };
}

function asRecord(value: unknown, label: string): Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${label} must be a generated object.`);
  }
  return value as Record<string, unknown>;
}

function asRecords(value: unknown, label: string): readonly Record<string, unknown>[] {
  if (!Array.isArray(value)) throw new Error(`${label} must be a generated array.`);
  return value.map((entry, index) => asRecord(entry, `${label}/${index}`));
}

function overlaySourceAwareDocs(
  workspaceRoot: string,
  docs: ReturnType<DocsBuilderModule["buildDocsArtifacts"]>,
  definitions: readonly GeneratorCatalogDefinition[],
  sources: readonly SourceSnapshotSource[],
  publicUiPackage: string,
) {
  const sourceById = new Map(sources.map((source) => [source.id, source]));
  const packageIntentById = new Map(
    definitions.map((definition) => [definition.id, definition.availabilityIntent.package]),
  );
  const metadataById = new Map(
    sources.map((source) => {
      const metadata = asRecord(
        JSON.parse(readFileSync(resolve(workspaceRoot, source.metadataPath), "utf8")),
        `${source.id}/metadata`,
      );
      const serverBoundary = metadata.serverBoundary;
      const directions = metadata.directions;
      const locales = metadata.locales;
      if (
        (serverBoundary !== "server-compatible" &&
          serverBoundary !== "client-island" &&
          serverBoundary !== "client-only") ||
        !Array.isArray(directions) ||
        !directions.every((value) => value === "ltr" || value === "rtl") ||
        !Array.isArray(locales) ||
        !locales.every((value) => typeof value === "string" && value.length > 0)
      ) {
        throw new Error(`${source.id} metadata cannot populate the generated discovery graph.`);
      }
      return [
        source.id,
        {
          serverBoundary,
          directions: [...new Set(directions)].sort(),
          locales: [...new Set(locales)].sort(),
        },
      ] as const;
    }),
  );
  const docsIndex = asRecord(docs.docs, "docs-index");
  const searchIndex = asRecord(docs.search, "search-index");
  const apiIndex = asRecord(docs.api, "api-index");

  return {
    docs: {
      ...docsIndex,
      maturitySemantics: "target-only-no-published-maturity",
      items: asRecords(docsIndex.items, "docs-index/items").map((item) => {
        const source = typeof item.id === "string" ? sourceById.get(item.id) : undefined;
        const metadata = typeof item.id === "string" ? metadataById.get(item.id) : undefined;
        const packagePlanned =
          typeof item.id === "string" && packageIntentById.get(item.id) === "planned";
        return source === undefined
          ? item
          : {
              ...item,
              implementationStatus: "source-present-unreleased",
              sourceAvailable: true,
              apiAvailable: true,
              evidenceAvailable: false,
              publishedMaturity: null,
              visibleStatus: source.visibleStatus,
              serverBoundary: metadata?.serverBoundary,
              directions: metadata?.directions,
              locales: metadata?.locales,
              fileTargets: source.normalizedFiles
                .map(
                  (file) =>
                    `components/ui/mergora/${source.id}/${file.sourcePath.split("/").at(-1)!}`,
                )
                .sort(),
              packageImport: packagePlanned ? `${publicUiPackage}/${source.id}` : null,
              packageStyleImport: packagePlanned ? `${publicUiPackage}/${source.id}.css` : null,
              registryDependencies: [...source.itemDependencies].sort(),
              runtimeDependencies: [...source.runtimeDependencies].sort(),
              distribution: {
                package: packagePlanned ? "generated-unreleased" : "not-planned",
                source: "generated-unreleased",
              },
            };
      }),
    },
    search: {
      ...searchIndex,
      entries: asRecords(searchIndex.entries, "search-index/entries").map((entry) => {
        const source = typeof entry.id === "string" ? sourceById.get(entry.id) : undefined;
        return source === undefined
          ? entry
          : {
              ...entry,
              availability: "source-present-unreleased",
              visibleStatus: source.visibleStatus,
            };
      }),
    },
    api: {
      ...apiIndex,
      entries: asRecords(apiIndex.entries, "api-index/entries").map((entry) => {
        const source = typeof entry.id === "string" ? sourceById.get(entry.id) : undefined;
        const metadata = typeof entry.id === "string" ? metadataById.get(entry.id) : undefined;
        return source === undefined
          ? entry
          : {
              ...entry,
              status: "source-present-unreleased",
              visibleStatus: source.visibleStatus,
              exports: [...source.publicExports].sort(),
              ...buildPublicApiDocs(source, metadata?.serverBoundary ?? "server-compatible"),
              message:
                "Public exports and declared prop surfaces are generated from canonical source. Curated descriptions and semantic review remain explicit per prop.",
            };
      }),
    },
    navigation: docs.navigation,
  };
}

function overlaySourceAwarePassports(
  passports: unknown,
  sources: readonly SourceSnapshotSource[],
): unknown {
  const sourceIds = new Set(sources.map((source) => source.id));
  const root = asRecord(passports, "passport-skeletons");
  return {
    ...root,
    items: asRecords(root.items, "passport-skeletons/items").map((item) => {
      if (typeof item.itemId !== "string" || !sourceIds.has(item.itemId)) return item;
      const missingInputs = Array.isArray(item.missingInputs)
        ? item.missingInputs.filter((input) => input !== "canonical-source" && input !== "contract")
        : item.missingInputs;
      return {
        ...item,
        implementationStatus: "source-present-unreleased",
        overall: {
          state: "blocked",
          aggregateState: "blocked",
          explanation:
            "Canonical source and a draft contract exist; release identity, required automated/manual evidence, and packed-consumer evidence remain incomplete.",
        },
        missingInputs,
      };
    }),
  };
}

export async function createGenerationSnapshot(
  workspaceRoot: string,
): Promise<readonly GeneratedFile[]> {
  const [catalogModule, schemaModule, sourceModule, packageModule, docsModule, passportModule] =
    await Promise.all([
      importWorkspaceModule<CatalogModule>(workspaceRoot, "registry/definitions/index.ts"),
      importWorkspaceModule<SchemaModule>(workspaceRoot, "registry/schemas/index.ts"),
      importWorkspaceModule<SourceTransformerModule>(
        workspaceRoot,
        "tooling/source-transformer/src/index.ts",
      ),
      importWorkspaceModule<PackageBuilderModule>(
        workspaceRoot,
        "tooling/package-builder/src/index.ts",
      ),
      importWorkspaceModule<DocsBuilderModule>(workspaceRoot, "tooling/docs-builder/src/index.ts"),
      importWorkspaceModule<PassportBuilderModule>(
        workspaceRoot,
        "tooling/passport-builder/src/index.ts",
      ),
    ]);

  catalogModule.assertValidCatalogDefinitions(catalogModule.catalogDefinitions);
  const definitions = catalogModule.catalogDefinitions;
  const packageMap = JSON.parse(
    readFileSync(resolve(workspaceRoot, "config", "public-packages.json"), "utf8"),
  ) as PublicPackageMap;
  const schemaContracts: GeneratorSchemaContracts = {
    catalogMetadata: schemaId(schemaModule.SCHEMA_REGISTRY, "catalog-metadata"),
    registryIndex: schemaId(schemaModule.SCHEMA_REGISTRY, "registry-index"),
    registryItem: schemaId(schemaModule.SCHEMA_REGISTRY, "registry-item"),
    accessibilityContract: schemaId(schemaModule.SCHEMA_REGISTRY, "accessibility-contract"),
    qualityPassport: schemaId(schemaModule.SCHEMA_REGISTRY, "quality-passport"),
  };
  if (
    schemaModule.aggregateEvidenceState("passport", "blocked-upstream") !== "blocked" ||
    schemaModule.aggregateEvidenceState("release-gate", "blocked") !== "blocked"
  ) {
    throw new Error("Evidence-state mapping does not preserve blocked Passport skeletons.");
  }

  const source = sourceModule.createSourceTransformationSnapshot(workspaceRoot, definitions);
  const signaturePolicy = loadMergoraSignaturePolicy(workspaceRoot);
  const implementationProfiles = loadImplementationProfileShards(workspaceRoot, signaturePolicy);
  const implementationMatrix = buildImplementationMatrix(
    definitions,
    source.sources,
    implementationProfiles,
    signaturePolicy,
  );
  const registry = buildRegistryPlans(definitions, schemaContracts, source.sources);
  const releaseProtocolPlan = buildBlockedReleaseProtocolPlan({
    catalogDefinitions: definitions.length,
    sourceItemIds: source.sources.map((item) => item.id),
    schemaContracts: {
      catalog: schemaContracts.registryIndex,
      item: schemaContracts.registryItem,
      releaseManifest: schemaId(schemaModule.SCHEMA_REGISTRY, "release-manifest"),
      latestAlias: schemaId(schemaModule.SCHEMA_REGISTRY, "latest-alias"),
    },
  });
  if (!schemaModule.validateSchemaDocument("release-protocol-plan", releaseProtocolPlan).ok) {
    throw new Error("Blocked release-protocol plan does not satisfy its versioned schema.");
  }
  const packageExports = packageModule.buildPackageExportPlan(
    definitions,
    packageMap,
    source.sources,
  );
  const packageManifest = packageModule.buildUiPackageManifest(
    packageMap,
    definitions,
    source.sources,
  );
  const packagePlannedIds = new Set(
    definitions
      .filter((definition) => definition.availabilityIntent.package === "planned")
      .map((definition) => definition.id),
  );
  const packageSourcePaths = new Set(
    source.sources
      .filter((item) => packagePlannedIds.has(item.id))
      .flatMap((item) => item.normalizedFiles.map((file) => file.packagePath)),
  );
  const allSourcePaths = new Set(
    source.sources.flatMap((item) => item.normalizedFiles.map((file) => file.packagePath)),
  );
  for (const file of source.files) {
    if (!allSourcePaths.has(file.path)) {
      throw new Error(
        `Source transformer emitted unowned package file ${JSON.stringify(file.path)}.`,
      );
    }
  }
  const plannedPackageSourceFiles = source.files.filter((file) =>
    packageSourcePaths.has(file.path),
  );
  const docs = overlaySourceAwareDocs(
    workspaceRoot,
    docsModule.buildDocsArtifacts(definitions),
    definitions,
    source.sources,
    packageMap.public.ui,
  );
  const passports = overlaySourceAwarePassports(
    passportModule.buildQualityPassportSkeletons(definitions, schemaContracts.qualityPassport),
    source.sources,
  );
  const documentationContractIndex = buildDocumentationContractIndex(
    workspaceRoot,
    registry.catalog,
    source.sources,
    implementationMatrix,
    passports,
  );

  const artifactValues: readonly (readonly [string, unknown])[] = [
    ["registry/generated/catalog.json", registry.catalog],
    ["registry/generated/documentation-contract-index.v1.json", documentationContractIndex],
    ["registry/generated/implementation-matrix.v1.json", implementationMatrix],
    ["registry/generated/index-plan.json", registry.index],
    ["registry/generated/release-protocol/plan.json", releaseProtocolPlan],
    ["registry/generated/package-export-plan.json", packageExports],
    ["registry/generated/passport-skeletons.json", passports],
    ["registry/generated/source-transform-plan.json", source.plan],
    ["registry/generated/changelog-inputs.json", buildChangelogInputs(source.sources)],
    ["registry/generated/shadcn/registry.json", buildShadcnRegistry(source.sources)],
    ["content/generated/api-index.json", docs.api],
    ["content/generated/docs-index.json", docs.docs],
    ["content/generated/navigation.json", docs.navigation],
    ["content/generated/search-index.json", docs.search],
    ["content/generated/source-views.json", buildSourceViews(source.sources)],
    [
      "content/generated/vertical-slice-api.json",
      buildVerticalSliceApi(source.sources, packageMap.public.ui),
    ],
    ...source.sources.flatMap(
      (item) =>
        [
          [
            `registry/generated/native-source-items/${item.id}.json`,
            buildUnreleasedNativeSourceItem(
              item,
              schemaContracts.registryItem,
              packageMap.public.ui,
            ),
          ],
          [`registry/generated/shadcn/${item.id}.json`, buildShadcnSourceItem(item)],
        ] as const,
    ),
  ];
  const planningFiles = artifactValues.map(([path, value]) => generatedFile(path, value));
  const packageFiles: readonly GeneratedFile[] = [
    ...plannedPackageSourceFiles,
    {
      path: "packages/cli/src/generated-public-package-map.ts",
      content: [
        "// Generated from config/public-packages.json by @mergora-internal/registry-builder. Do not edit.",
        `export const PUBLIC_CLI_PACKAGE = ${JSON.stringify(packageMap.cli.package)} as const;`,
        `export const PUBLIC_CLI_BIN = ${JSON.stringify(packageMap.cli.bin)} as const;`,
        `export const PUBLIC_UI_PACKAGE = ${JSON.stringify(packageMap.public.ui)} as const;`,
        "",
      ].join("\n"),
    },
    {
      path: "packages/ui/src/index.ts",
      content: packageModule.buildUiPackageIndex(definitions, source.sources),
    },
    prettyGeneratedJsonFile("packages/ui/package.json", packageManifest),
  ];
  const files = [...planningFiles, ...packageFiles].sort((left, right) =>
    left.path.localeCompare(right.path, "en-US"),
  );
  const manifest = {
    schemaVersion: 1,
    artifactKind: "generation-artifact-manifest",
    generated: {
      by: "@mergora-internal/registry-builder",
      editPolicy: "do-not-edit",
    },
    inputs: {
      catalogDefinitions: definitions.length,
      canonicalSources: source.sources.length,
      implementationProfileShards: implementationProfiles.length,
      packageMap: "config/public-packages.json",
      schemaContracts,
    },
    artifacts: files.map((file) => file.path).sort(),
  } as const;

  return [generatedFile("registry/generated/artifact-manifest.json", manifest), ...files].sort(
    (left, right) => left.path.localeCompare(right.path, "en-US"),
  );
}

export async function runWorkspaceGeneration(workspaceRoot: string, mode: "write" | "check") {
  const files = await createGenerationSnapshot(workspaceRoot);
  return syncGeneratedFiles(workspaceRoot, files, mode);
}
