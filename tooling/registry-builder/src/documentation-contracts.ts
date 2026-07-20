import { existsSync, readFileSync, readdirSync } from "node:fs";
import { posix, resolve } from "node:path";

import ts from "typescript";

import type { ImplementationMatrix } from "./implementation-matrix.ts";
import type { RegistryCatalogPlan } from "./model.ts";

const GENERATED_MARKER = {
  by: "@mergora-internal/registry-builder",
  editPolicy: "do-not-edit",
} as const;

const INDEX_SCHEMA_PATH = "registry/quality/documentation-contract-index.v1.schema.json" as const;
const PASSPORT_SKELETON_PATH = "registry/generated/passport-skeletons.json" as const;

type JsonRecord = Record<string, unknown>;
type MatrixItem = ImplementationMatrix["items"][number];

export interface DocumentationContractSource {
  readonly id: string;
  readonly entryPath: string;
  readonly normalizedFiles: readonly { readonly sourcePath: string }[];
  readonly metadataPath: string;
  readonly contractPath: string;
  readonly storyPath: string | null;
}

interface StorybookModule {
  readonly importTargets: ReadonlySet<string>;
  readonly path: string;
  readonly storyExports: ReadonlySet<string>;
}

interface ValidatedStoryPointer {
  readonly status: "validated-source-export";
  readonly modulePath: string;
  readonly exportName: string;
}

interface UnavailableStoryPointer {
  readonly status: "unavailable";
  readonly modulePath: null;
  readonly exportName: null;
  readonly reason: string;
}

type RecommendedStoryPointer =
  | (ValidatedStoryPointer & {
      readonly matrixStatus: "tested";
      readonly mode: "basic-enhancements-disabled" | "recommended-enhancements-enabled";
    })
  | (UnavailableStoryPointer & {
      readonly matrixStatus: "audit-pending" | "blocked" | "declared" | "missing";
      readonly mode: "basic-enhancements-disabled" | "recommended-enhancements-enabled";
    });

function isRecord(value: unknown): value is JsonRecord {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function record(value: unknown, label: string): JsonRecord {
  if (!isRecord(value)) throw new Error(`${label} must be a JSON object.`);
  return value;
}

function nonEmptyString(value: unknown, label: string): string {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new Error(`${label} must be a non-empty string.`);
  }
  return value;
}

function repositoryPath(value: unknown, label: string): string {
  const path = nonEmptyString(value, label);
  if (
    path.includes("\\") ||
    path.startsWith("/") ||
    /^[a-z]:/iu.test(path) ||
    path.split("/").some((part) => part === "" || part === "." || part === "..")
  ) {
    throw new Error(`${label} must be a portable repository-relative path.`);
  }
  return path;
}

function workspacePath(workspaceRoot: string, path: string): string {
  return resolve(workspaceRoot, ...repositoryPath(path, "repository path").split("/"));
}

function readJsonObject(workspaceRoot: string, path: string, label: string): JsonRecord {
  const value = JSON.parse(readFileSync(workspacePath(workspaceRoot, path), "utf8")) as unknown;
  return record(value, label);
}

function assertItemId(document: JsonRecord, itemId: string, label: string): void {
  if (document.itemId !== itemId) {
    throw new Error(`${label} must belong to ${JSON.stringify(itemId)}.`);
  }
}

function filesBelow(workspaceRoot: string, relativeDirectory: string): readonly string[] {
  const absoluteDirectory = workspacePath(workspaceRoot, relativeDirectory);
  if (!existsSync(absoluteDirectory)) return [];
  return readdirSync(absoluteDirectory, { withFileTypes: true }).flatMap((entry) => {
    const child = `${relativeDirectory}/${entry.name}`;
    return entry.isDirectory() ? filesBelow(workspaceRoot, child) : [child];
  });
}

function hasExportModifier(node: ts.Node): boolean {
  return (
    ts.canHaveModifiers(node) &&
    (ts.getModifiers(node)?.some((modifier) => modifier.kind === ts.SyntaxKind.ExportKeyword) ??
      false)
  );
}

function normalizedModuleTarget(path: string): string {
  return path
    .replace(/\.(?:[cm]?[jt]sx?)$/u, "")
    .replace(/\/index$/u, "")
    .normalize("NFKC");
}

function parseStorybookModule(workspaceRoot: string, modulePath: string): StorybookModule {
  const path = repositoryPath(modulePath, "Storybook module path");
  if (!path.startsWith("apps/storybook/") || !/\.stories\.[jt]sx?$/u.test(path)) {
    throw new Error(`${JSON.stringify(path)} is not a Storybook story module.`);
  }
  const sourceText = readFileSync(workspacePath(workspaceRoot, path), "utf8");
  const sourceFile = ts.createSourceFile(
    path,
    sourceText,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TSX,
  );
  const parseDiagnostics = (
    sourceFile as ts.SourceFile & { readonly parseDiagnostics?: readonly ts.Diagnostic[] }
  ).parseDiagnostics;
  if (parseDiagnostics !== undefined && parseDiagnostics.length > 0) {
    throw new Error(`Storybook module ${JSON.stringify(path)} contains TypeScript parse errors.`);
  }

  const storyExports = new Set<string>();
  const importTargets = new Set<string>();
  for (const statement of sourceFile.statements) {
    if (
      ts.isImportDeclaration(statement) &&
      ts.isStringLiteral(statement.moduleSpecifier) &&
      statement.moduleSpecifier.text.startsWith(".")
    ) {
      importTargets.add(
        normalizedModuleTarget(
          posix.normalize(posix.join(posix.dirname(path), statement.moduleSpecifier.text)),
        ),
      );
    }
    if (ts.isVariableStatement(statement) && hasExportModifier(statement)) {
      for (const declaration of statement.declarationList.declarations) {
        if (ts.isIdentifier(declaration.name)) storyExports.add(declaration.name.text);
      }
    }
    if (
      (ts.isFunctionDeclaration(statement) || ts.isClassDeclaration(statement)) &&
      hasExportModifier(statement) &&
      statement.name !== undefined
    ) {
      storyExports.add(statement.name.text);
    }
    if (ts.isExportDeclaration(statement) && statement.exportClause !== undefined) {
      if (ts.isNamedExports(statement.exportClause)) {
        for (const element of statement.exportClause.elements) storyExports.add(element.name.text);
      }
    }
  }
  return { importTargets, path, storyExports };
}

function loadStorybookModules(workspaceRoot: string): ReadonlyMap<string, StorybookModule> {
  return new Map(
    filesBelow(workspaceRoot, "apps/storybook/src")
      .filter((path) => /\.stories\.[jt]sx?$/u.test(path))
      .sort((left, right) => left.localeCompare(right, "en-US"))
      .map((path) => [path, parseStorybookModule(workspaceRoot, path)]),
  );
}

function matrixStoryPointer(
  story: MatrixItem["storybook"]["basic"],
  modules: ReadonlyMap<string, StorybookModule>,
  itemId: string,
  label: "Basic" | "Recommended",
): RecommendedStoryPointer {
  const mode = story.mode;
  const expectedMode =
    label === "Basic" ? "basic-enhancements-disabled" : "recommended-enhancements-enabled";
  if (mode !== expectedMode) {
    throw new Error(`${itemId} ${label} Storybook pointer has the wrong enhancement mode.`);
  }
  if (story.status !== "tested") {
    return {
      status: "unavailable",
      matrixStatus: story.status,
      mode,
      modulePath: null,
      exportName: null,
      reason: `${label} Storybook evidence is ${story.status}; no validated pointer is published.`,
    };
  }
  const modulePath = repositoryPath(story.modulePath, `${itemId} ${label} story module`);
  const exportName = nonEmptyString(story.exportName, `${itemId} ${label} story export`);
  const module = modules.get(modulePath);
  if (module === undefined || !module.storyExports.has(exportName)) {
    throw new Error(
      `${itemId} ${label} Storybook pointer ${modulePath}#${exportName} does not resolve to a real named story export.`,
    );
  }
  return {
    status: "validated-source-export",
    matrixStatus: "tested",
    mode,
    modulePath,
    exportName,
  };
}

function resolveStateStory(
  storyName: string,
  canonicalStoryFile: string | null,
  matrixItem: MatrixItem,
  source: DocumentationContractSource,
  modules: ReadonlyMap<string, StorybookModule>,
): ValidatedStoryPointer | UnavailableStoryPointer {
  const prioritizedPaths = [
    canonicalStoryFile,
    matrixItem.storybook.basic.modulePath,
    matrixItem.storybook.enhanced.modulePath,
  ].filter(
    (value, index, values): value is string =>
      typeof value === "string" && values.indexOf(value) === index,
  );
  for (const path of prioritizedPaths) {
    const module = modules.get(path);
    if (module?.storyExports.has(storyName) === true) {
      return {
        status: "validated-source-export",
        modulePath: path,
        exportName: storyName,
      };
    }
  }

  const sourceTargets = new Set(
    [source.entryPath, ...source.normalizedFiles.map((file) => file.sourcePath)].map(
      normalizedModuleTarget,
    ),
  );
  const associated = [...modules.values()].filter(
    (module) =>
      module.storyExports.has(storyName) &&
      [...module.importTargets].some((target) => sourceTargets.has(target)),
  );
  if (associated.length === 1) {
    return {
      status: "validated-source-export",
      modulePath: associated[0]!.path,
      exportName: storyName,
    };
  }
  return {
    status: "unavailable",
    modulePath: null,
    exportName: null,
    reason:
      associated.length === 0
        ? `Declared story ${storyName} does not resolve to an associated Storybook export.`
        : `Declared story ${storyName} is ambiguous across associated Storybook modules.`,
  };
}

function anatomyFor(workspaceRoot: string, source: DocumentationContractSource) {
  const directory = posix.dirname(source.contractPath);
  const candidates = [`${directory}/${source.id}.anatomy.json`, `${directory}/anatomy.json`].filter(
    (path) => existsSync(workspacePath(workspaceRoot, path)),
  );
  if (candidates.length > 1) {
    throw new Error(`${source.id} has more than one canonical anatomy companion.`);
  }
  if (candidates.length === 1) {
    const sourcePath = candidates[0]!;
    const document = readJsonObject(workspaceRoot, sourcePath, `${source.id} anatomy`);
    assertItemId(document, source.id, `${source.id} anatomy`);
    return {
      status: "documented" as const,
      sourceKind: "anatomy-contract" as const,
      sourcePath,
      document,
    };
  }

  const document = readJsonObject(workspaceRoot, source.metadataPath, `${source.id} metadata`);
  assertItemId(document, source.id, `${source.id} metadata`);
  if (!Array.isArray(document.slots) || document.slots.length === 0) {
    return {
      status: "unavailable" as const,
      sourceKind: null,
      sourcePath: null,
      document: null,
      reason: "No anatomy companion or metadata slot inventory is available.",
    };
  }
  return {
    status: "metadata-slots-only" as const,
    sourceKind: "component-metadata" as const,
    sourcePath: source.metadataPath,
    document,
  };
}

function semanticInteractionContractFor(
  workspaceRoot: string,
  source: DocumentationContractSource,
) {
  const document = readJsonObject(workspaceRoot, source.contractPath, `${source.id} contract`);
  assertItemId(document, source.id, `${source.id} contract`);
  const isDraft = source.contractPath.endsWith(".draft.json");
  if (isDraft) {
    const sourceStatus = nonEmptyString(document.status, `${source.id} draft contract status`);
    return {
      status: "draft-unavailable" as const,
      sourcePath: source.contractPath,
      contractVersion: null,
      sourceStatus,
      claim: null,
      semantics: null,
      document: null,
      recordedEvidence: [] as const,
      reason:
        "The canonical source marks this contract as a draft; it is referenced but not exposed as an authoritative semantic or interaction contract.",
    };
  }

  const evidenceRequirements = record(
    document.evidenceRequirements,
    `${source.id} contract evidenceRequirements`,
  );
  if (!Array.isArray(evidenceRequirements.recordedEvidence)) {
    throw new Error(`${source.id} contract must expose recordedEvidence as an array.`);
  }
  if (!Object.hasOwn(document, "semantics")) {
    throw new Error(`${source.id} contract must declare its semantics.`);
  }
  return {
    status: "source-contract-unreleased" as const,
    sourcePath: source.contractPath,
    contractVersion: nonEmptyString(document.contractVersion, `${source.id} contract version`),
    sourceStatus: nonEmptyString(document.contractStatus, `${source.id} contract status`),
    claim: nonEmptyString(document.claim, `${source.id} contract claim`),
    semantics: document.semantics,
    document,
    recordedEvidence: evidenceRequirements.recordedEvidence,
  };
}

function stateApplicabilityFor(
  workspaceRoot: string,
  source: DocumentationContractSource,
  matrixItem: MatrixItem,
  modules: ReadonlyMap<string, StorybookModule>,
) {
  if (source.storyPath === null) {
    return {
      status: "unavailable" as const,
      sourcePath: null,
      reason: "Canonical source does not provide a state-applicability companion.",
      states: [] as const,
    };
  }
  const document = readJsonObject(workspaceRoot, source.storyPath, `${source.id} story contract`);
  assertItemId(document, source.id, `${source.id} story contract`);
  if (!Array.isArray(document.states)) {
    return {
      status: "coverage-only-unavailable" as const,
      sourcePath: source.storyPath,
      reason:
        "The canonical story companion records coverage examples but does not declare state applicability and rationales.",
      states: [] as const,
    };
  }

  const canonicalStoryFile =
    document.canonicalStoryFile === undefined
      ? null
      : repositoryPath(document.canonicalStoryFile, `${source.id} canonical story file`);
  const seen = new Set<string>();
  const states = document.states.map((value, index) => {
    const state = record(value, `${source.id} story contract state ${index}`);
    const id = nonEmptyString(state.id, `${source.id} state id`);
    if (seen.has(id)) throw new Error(`${source.id} state contract duplicates ${id}.`);
    seen.add(id);
    const applicability = record(state.applicability, `${source.id}/${id} applicability`);
    const status = applicability.status;
    if (status === "not-applicable") {
      return {
        id,
        applicability: "not-applicable" as const,
        rationale: nonEmptyString(
          applicability.reason,
          `${source.id}/${id} not-applicable rationale`,
        ),
        story: null,
      };
    }
    if (status !== "applicable") {
      throw new Error(`${source.id}/${id} has an unsupported applicability status.`);
    }
    const storyName = nonEmptyString(state.story, `${source.id}/${id} story`);
    return {
      id,
      applicability: "applicable" as const,
      rationale: null,
      story: resolveStateStory(storyName, canonicalStoryFile, matrixItem, source, modules),
    };
  });
  return {
    status: "available" as const,
    sourcePath: source.storyPath,
    reason: null,
    states: states.sort((left, right) => left.id.localeCompare(right.id, "en-US")),
  };
}

function passportRows(passports: unknown): ReadonlyMap<string, JsonRecord> {
  const root = record(passports, "passport skeletons");
  if (!Array.isArray(root.items)) throw new Error("Passport skeletons must contain items.");
  const rows = new Map<string, JsonRecord>();
  for (const [index, value] of root.items.entries()) {
    const row = record(value, `passport skeleton ${index}`);
    const itemId = nonEmptyString(row.itemId, `passport skeleton ${index} itemId`);
    if (rows.has(itemId)) throw new Error(`Passport skeletons duplicate ${itemId}.`);
    rows.set(itemId, row);
  }
  return rows;
}

function passportAssociation(itemId: string, passport: JsonRecord) {
  if (passport.publishable !== false || passport.skeleton !== true) {
    throw new Error(`${itemId} passport association must remain a non-publishable skeleton.`);
  }
  const overall = record(passport.overall, `${itemId} passport overall`);
  if (overall.state !== "blocked" || overall.aggregateState !== "blocked") {
    throw new Error(`${itemId} passport skeleton must remain blocked.`);
  }
  const passportId = nonEmptyString(passport.passportId, `${itemId} passportId`);
  if (passportId !== `${itemId}-passport-skeleton`) {
    throw new Error(`${itemId} Passport-skeleton association has drifted.`);
  }
  return {
    artifactPath: PASSPORT_SKELETON_PATH,
    itemId,
    passportId,
    skeleton: true as const,
    publishable: false as const,
    overallState: "blocked" as const,
  };
}

export function assertDocumentationContractIndex(value: unknown): void {
  const index = record(value, "documentation contract index");
  if (
    index.schemaVersion !== 1 ||
    index.artifactKind !== "documentation-contract-index" ||
    index.indexSchema !== INDEX_SCHEMA_PATH ||
    index.authority !== "registry/generated/catalog.json" ||
    index.publicationStatus !== "blocked-unreleased"
  ) {
    throw new Error("Documentation contract index header does not match schema version 1.");
  }
  const inventory = record(index.inventory, "documentation contract index inventory");
  if (!Array.isArray(index.items)) throw new Error("Documentation contract index needs items.");
  const ids = index.items.map((value, itemIndex) =>
    nonEmptyString(
      record(value, `documentation item ${itemIndex}`).id,
      `documentation item ${itemIndex} id`,
    ),
  );
  if (new Set(ids).size !== ids.length || ids.some((id, index) => id !== [...ids].sort()[index])) {
    throw new Error("Documentation contract index items must have unique lexical ids.");
  }
  if (inventory.items !== ids.length) {
    throw new Error("Documentation contract index inventory count does not match its items.");
  }
}

export function buildDocumentationContractIndex(
  workspaceRoot: string,
  catalog: RegistryCatalogPlan,
  sources: readonly DocumentationContractSource[],
  implementationMatrix: ImplementationMatrix,
  passports: unknown,
) {
  const schema = readJsonObject(workspaceRoot, INDEX_SCHEMA_PATH, "documentation index schema");
  if (
    schema.$schema !== "https://json-schema.org/draft/2020-12/schema" ||
    typeof schema.$id !== "string"
  ) {
    throw new Error("Documentation contract index schema must use draft 2020-12 and a stable id.");
  }
  if (
    catalog.artifactKind !== "registry-catalog-plan" ||
    catalog.publicationStatus !== "blocked-unreleased" ||
    catalog.inventory.definitions !== catalog.items.length
  ) {
    throw new Error("Documentation contract authority must be the generated catalog plan.");
  }
  const sourceById = new Map(sources.map((source) => [source.id, source]));
  const matrixById = new Map(implementationMatrix.items.map((item) => [item.id, item]));
  const passportById = passportRows(passports);
  if (sourceById.size !== sources.length || matrixById.size !== implementationMatrix.items.length) {
    throw new Error("Documentation contract inputs contain duplicate catalog identities.");
  }
  const modules = loadStorybookModules(workspaceRoot);

  const items = [...catalog.items]
    .sort((left, right) => left.id.localeCompare(right.id, "en-US"))
    .map((catalogItem) => {
      const source = sourceById.get(catalogItem.id);
      const matrixItem = matrixById.get(catalogItem.id);
      const passport = passportById.get(catalogItem.id);
      if (matrixItem === undefined || passport === undefined) {
        throw new Error(
          `${catalogItem.id} is missing implementation-matrix or Passport-skeleton input.`,
        );
      }
      if (matrixItem.storybook.stateContractPath !== (source?.storyPath ?? null)) {
        throw new Error(`${catalogItem.id} state-contract association has drifted.`);
      }
      if (matrixItem.implementationStatus !== catalogItem.implementationStatus) {
        throw new Error(`${catalogItem.id} implementation status has drifted from the catalog.`);
      }
      const basic = matrixStoryPointer(
        matrixItem.storybook.basic,
        modules,
        catalogItem.id,
        "Basic",
      );
      const recommended = matrixStoryPointer(
        matrixItem.storybook.enhanced,
        modules,
        catalogItem.id,
        "Recommended",
      );
      return {
        id: catalogItem.id,
        displayName: catalogItem.displayName,
        family: catalogItem.category,
        layer: catalogItem.layer,
        kind: catalogItem.kind,
        implementationStatus: catalogItem.implementationStatus,
        anatomy:
          source === undefined
            ? {
                status: "unavailable" as const,
                sourceKind: null,
                sourcePath: null,
                document: null,
                reason: "Canonical source and an anatomy companion are not available.",
              }
            : anatomyFor(workspaceRoot, source),
        semanticInteractionContract:
          source === undefined
            ? {
                status: "unavailable" as const,
                sourcePath: null,
                contractVersion: null,
                sourceStatus: null,
                claim: null,
                semantics: null,
                document: null,
                recordedEvidence: [] as const,
                reason: "Canonical semantic and interaction source is not available.",
              }
            : semanticInteractionContractFor(workspaceRoot, source),
        stateApplicability:
          source === undefined
            ? {
                status: "unavailable" as const,
                sourcePath: null,
                reason: "Canonical source does not provide a state-applicability companion.",
                states: [] as const,
              }
            : stateApplicabilityFor(workspaceRoot, source, matrixItem, modules),
        storybook: { basic, recommended },
        passportSkeleton: passportAssociation(catalogItem.id, passport),
      };
    });

  const recordedEvidence = items.flatMap(
    (item) => item.semanticInteractionContract.recordedEvidence,
  );
  const value = {
    schemaVersion: 1,
    artifactKind: "documentation-contract-index",
    generated: GENERATED_MARKER,
    authority: "registry/generated/catalog.json",
    indexSchema: INDEX_SCHEMA_PATH,
    publicationStatus: "blocked-unreleased",
    inventory: {
      items: items.length,
      anatomy: {
        documented: items.filter((item) => item.anatomy.status === "documented").length,
        metadataSlotsOnly: items.filter((item) => item.anatomy.status === "metadata-slots-only")
          .length,
        unavailable: items.filter((item) => item.anatomy.status === "unavailable").length,
      },
      semanticInteractionContracts: {
        sourceContractUnreleased: items.filter(
          (item) => item.semanticInteractionContract.status === "source-contract-unreleased",
        ).length,
        draftUnavailable: items.filter(
          (item) => item.semanticInteractionContract.status === "draft-unavailable",
        ).length,
        unavailable: items.filter(
          (item) => item.semanticInteractionContract.status === "unavailable",
        ).length,
      },
      stateApplicability: {
        available: items.filter((item) => item.stateApplicability.status === "available").length,
        coverageOnlyUnavailable: items.filter(
          (item) => item.stateApplicability.status === "coverage-only-unavailable",
        ).length,
        unavailable: items.filter((item) => item.stateApplicability.status === "unavailable")
          .length,
      },
      recordedEvidence: {
        itemsWithRecords: items.filter(
          (item) => item.semanticInteractionContract.recordedEvidence.length > 0,
        ).length,
        records: recordedEvidence.length,
      },
    },
    items,
  } as const;
  assertDocumentationContractIndex(value);
  return value;
}
