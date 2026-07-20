import { lstatSync, readdirSync } from "node:fs";
import { posix, relative, resolve } from "node:path";

import { subset } from "semver";
import ts from "typescript";

import type { AcquiredNativeRegistryRelease } from "./acquisition-resolver.js";
import {
  assertDistributionConfigurationBinding,
  serializeDistributionProvenance,
} from "./distribution-provenance.js";
import type {
  DistributionDependencyOwnership,
  DistributionItem,
  DistributionPatchOwnership,
  DistributionProvenanceState,
  InstalledDistributionMode,
} from "./distribution-provenance.js";
import {
  type AcquiredDistributionPackageEvidence,
  manifestFromDistributionState,
} from "./distribution-operations.js";
import {
  applyDistributionModeTransaction,
  BUILT_IN_MODE_IMPORT_ADAPTER,
  planDistributionModeTransaction,
  type DistributionImportRewrite,
  type DistributionModeBaseMaterialization,
  type DistributionModeMigrationObservation,
  type DistributionModePackageIntegrityEvidence,
  type DistributionModeTargetMaterialization,
} from "./distribution-mode-migration.js";
import {
  canonicalJson,
  CLI_VERSION,
  CliError,
  portableSort,
  sha256,
  validatedProjectRoot,
} from "./contracts.js";
import { readMergoraConfig } from "./configuration.js";
import { inspectProject, type PackageManager } from "./project-inspector.js";
import {
  basePath,
  deriveAcquiredDistributionSources,
  distributionProvenanceFromManifest,
  manifestBytes,
  MANIFEST_PATH,
  readManifest,
  readProjectFile,
  type ManifestItem,
  type ProvenanceManifest,
} from "./source-operations.js";
import {
  assertValidOperationPlanV1,
  finalizeOperationPlan,
  listIncompleteTransactions,
  type OperationPlan,
  type PackageManagerRunner,
  type TransactionFaultInjector,
  type TransactionResult,
} from "./transaction-engine.js";

type Digest = `sha256:${string}`;

const QUALIFIED_ITEM = /^[a-z0-9]+(?:-[a-z0-9]+)*:[a-z0-9]+(?:-[a-z0-9]+)*$/u;
const SOURCE_EXTENSIONS = /(?:\.d)?\.(?:[cm]?ts|[cm]?tsx)$/iu;
const MAX_PROJECT_FILES = 8_192;
const IGNORED_DIRECTORIES = new Set([
  ".git",
  ".mergora",
  ".next",
  ".turbo",
  "artifacts",
  "build",
  "coverage",
  "dist",
  "node_modules",
  "test-results",
]);

export interface ProjectDistributionModeOptions {
  readonly projectRoot: string;
  readonly itemIds: readonly string[];
  readonly to: InstalledDistributionMode;
  readonly acquiredReleases: readonly AcquiredNativeRegistryRelease[];
  readonly packageEvidence: readonly AcquiredDistributionPackageEvidence[];
  readonly packageManager?: PackageManager | undefined;
  readonly noInstall?: boolean | undefined;
  readonly offline?: boolean | undefined;
  readonly packageManagerRunner?: PackageManagerRunner | undefined;
  readonly commandArguments?: readonly string[] | undefined;
  readonly faultInjector?: TransactionFaultInjector | undefined;
}

export interface ProjectDistributionModeResult {
  readonly from: InstalledDistributionMode;
  readonly to: InstalledDistributionMode;
  readonly items: readonly string[];
  readonly planDigest: Digest;
  readonly transaction: TransactionResult;
}

interface PackageDocument {
  readonly bytes: Buffer;
  readonly value: Record<string, unknown>;
}

interface BuiltProjectModeMigration {
  readonly root: string;
  readonly from: InstalledDistributionMode;
  readonly items: readonly string[];
  readonly manager: PackageManager;
  readonly materialization: {
    readonly bases: Readonly<Record<Digest, DistributionModeBaseMaterialization>>;
    readonly migration: {
      readonly currentState: DistributionProvenanceState;
      readonly proposedState: DistributionProvenanceState;
      readonly configuration: unknown;
      readonly from: InstalledDistributionMode;
      readonly to: InstalledDistributionMode;
      readonly itemIds: readonly string[];
      readonly observation: DistributionModeMigrationObservation;
      readonly currentManifestBytes: Uint8Array;
      readonly acquiredReleases: readonly AcquiredNativeRegistryRelease[];
    };
    readonly packageIntegrityEvidence: readonly DistributionModePackageIntegrityEvidence[];
    readonly proposedManifestBytes: Uint8Array;
    readonly releaseSources: Readonly<
      Record<string, "network" | "verified-cache" | "vendor" | "mirror">
    >;
    readonly targets: Readonly<Record<string, DistributionModeTargetMaterialization>>;
    readonly cliVersion: string;
  };
  readonly plan: OperationPlan;
}

function modeError(
  message: string,
  code: string,
  exitCode: 3 | 5 | 6 | 7 | 8 = 7,
  target?: string,
): CliError {
  return new CliError(message, { code, exitCode, ...(target === undefined ? {} : { target }) });
}

function packagePatch(packageName: string, version: string) {
  const normalized = packageName
    .replace(/^@/u, "")
    .replaceAll("/", "-")
    .replace(/[^a-z0-9._-]+/gu, "-")
    .replace(/[._]+/gu, "-")
    .replace(/-+/gu, "-")
    .replace(/^-|-$/gu, "");
  return {
    id: `dependency-${normalized}`,
    adapter: "package-dependency" as const,
    target: "package.json",
    semanticKey: `dependencies.${packageName}`,
    ownedValueDigest: sha256(version),
  };
}

function selectedQualifiedItems(
  requested: readonly string[],
  state: DistributionProvenanceState,
  releases: readonly AcquiredNativeRegistryRelease[],
): readonly string[] {
  if (requested.length === 0) {
    throw modeError("Mode migration requires one or more installed items.", "ITEM_REQUIRED", 3);
  }
  const aliases = new Map<string, string>();
  for (const release of releases) {
    for (const [alias, id] of Object.entries(release.aliases)) aliases.set(alias, id);
  }
  const result = requested.map((input) => {
    if (QUALIFIED_ITEM.test(input)) return input;
    const resolved = aliases.get(input) ?? input;
    const candidates = Object.keys(state.items).filter((id) => id.endsWith(`:${resolved}`));
    if (candidates.length !== 1) {
      throw modeError(
        `Mode migration item ${input} is not one unambiguous installed identity.`,
        "MODE_MIGRATION_ITEM_INVALID",
        candidates.length === 0 ? 3 : 6,
        MANIFEST_PATH,
      );
    }
    return candidates[0]!;
  });
  const unique = portableSort([...new Set(result)]);
  if (unique.length !== requested.length) {
    throw modeError(
      "Mode migration item selection contains a duplicate.",
      "MODE_MIGRATION_ITEM_INVALID",
      3,
    );
  }
  for (const id of unique) {
    if (state.items[id] === undefined) {
      throw modeError(`Mode migration item ${id} is not installed.`, "ITEM_NOT_INSTALLED", 3, id);
    }
  }
  return unique;
}

function assertClosedModeGraph(
  state: DistributionProvenanceState,
  selectedItems: readonly string[],
): void {
  const selected = new Set(selectedItems);
  for (const [owner, item] of Object.entries(state.items)) {
    for (const dependency of item.registryDependencies) {
      if (selected.has(owner) !== selected.has(dependency)) {
        throw modeError(
          `Mode migration must select dependency edge ${owner} -> ${dependency} as one closed graph.`,
          "DISTRIBUTION_MODE_MIGRATION_GRAPH_INCOMPLETE",
          6,
          MANIFEST_PATH,
        );
      }
    }
  }
}

function releaseMap(
  releases: readonly AcquiredNativeRegistryRelease[],
): ReadonlyMap<string, AcquiredNativeRegistryRelease> {
  const result = new Map<string, AcquiredNativeRegistryRelease>();
  for (const release of releases) {
    const ref = `${release.registry.id}@${release.release}`;
    if (result.has(ref)) {
      throw modeError(
        `Mode migration acquired release ${ref} is duplicated.`,
        "MODE_MIGRATION_ACQUIRED_RELEASE_INVALID",
        5,
        ref,
      );
    }
    result.set(ref, release);
  }
  return result;
}

function sourceProjections(
  selectedItems: readonly string[],
  manifest: ProvenanceManifest,
  releases: ReadonlyMap<string, AcquiredNativeRegistryRelease>,
) {
  const result = new Map<string, ReturnType<typeof deriveAcquiredDistributionSources>[number]>();
  const groups = new Map<string, string[]>();
  for (const id of selectedItems) {
    const ref = manifest.items[id]!.releaseRef!;
    const values = groups.get(ref) ?? [];
    values.push(id);
    groups.set(ref, values);
  }
  for (const [ref, ids] of groups) {
    const release = releases.get(ref);
    if (release === undefined) {
      throw modeError(
        `Mode migration has no exact acquired release for ${ref}.`,
        "MODE_MIGRATION_ACQUIRED_RELEASE_INVALID",
        5,
        ref,
      );
    }
    const transformContexts = Object.fromEntries(
      ids.map((id) => {
        const item = manifest.items[id]!;
        return [id, { digest: item.transformContextDigest, value: item.transformContext }];
      }),
    );
    for (const projection of deriveAcquiredDistributionSources({
      acquiredRelease: release,
      itemIds: ids.map((id) => id.slice(id.indexOf(":") + 1)),
      transformContexts,
    })) {
      result.set(projection.qualifiedId, projection);
    }
  }
  return result;
}

function packageItem(
  before: DistributionItem,
  acquired: AcquiredNativeRegistryRelease,
  packageName: string,
): DistributionItem {
  const item = acquired.items.find(({ itemId }) => itemId === before.itemId);
  if (item === undefined) {
    throw modeError(
      `Acquired release is missing ${before.itemId}.`,
      "REGISTRY_ITEM_NOT_ACQUIRED",
      5,
      before.itemId,
    );
  }
  const imports = portableSort(
    [...new Set(item.importPaths)].filter((value) => value.startsWith(`${packageName}/`)),
  );
  if (imports.length === 0) {
    throw modeError(
      `Item ${before.itemId} has no reviewed ${packageName} package import.`,
      "DISTRIBUTION_IMPORT_INVALID",
      7,
      before.itemId,
    );
  }
  return {
    registry: before.registry,
    itemId: before.itemId,
    kind: before.kind,
    requested: before.requested,
    resolved: before.resolved,
    releaseRef: before.releaseRef,
    payload: before.payload,
    mode: "package",
    direct: before.direct,
    files: [],
    packageClaims: [packageName],
    importSubpaths: imports,
    registryDependencies: before.registryDependencies,
    dependencies: { runtime: { [packageName]: before.resolved }, development: {} },
    structuredPatches: [packagePatch(packageName, before.resolved)],
    contractVersion: before.contractVersion,
    lastMigration: "mode-source-to-package-v1",
  };
}

function sourceItem(
  before: DistributionItem,
  projection: ReturnType<typeof deriveAcquiredDistributionSources>[number],
): DistributionItem {
  return {
    registry: before.registry,
    itemId: projection.itemId,
    kind: projection.kind,
    requested: before.requested,
    resolved: projection.resolved,
    releaseRef: projection.releaseRef,
    payload: projection.payload,
    mode: "source",
    direct: before.direct,
    files: projection.files.map((file) => ({
      logicalPath: file.logicalPath,
      target: file.target,
      role: file.role,
      base: file.digest,
      installed: file.digest,
      mediaType: file.mediaType,
      executable: false,
    })),
    packageClaims: [],
    importSubpaths: [],
    registryDependencies: projection.registryDependencies,
    dependencies: projection.dependencies,
    structuredPatches: projection.structuredPatches.map((patch) => {
      if (patch.target === undefined) {
        throw modeError(
          `Acquired source patch ${patch.id} has no materialization target.`,
          "MODE_MIGRATION_PATCH_ADAPTER_UNSUPPORTED",
          7,
          projection.qualifiedId,
        );
      }
      return { ...patch, target: patch.target };
    }),
    contractVersion: projection.contractVersion,
    lastMigration: "mode-package-to-source-v1",
  };
}

function packageDocument(root: string): PackageDocument {
  const bytes = readProjectFile(root, "package.json");
  if (bytes === null) {
    throw modeError(
      "Mode migration requires package.json.",
      "PACKAGE_JSON_MISSING",
      3,
      "package.json",
    );
  }
  let value: unknown;
  try {
    value = JSON.parse(bytes.toString("utf8")) as unknown;
  } catch {
    throw modeError(
      "Mode migration requires strict JSON in package.json.",
      "PACKAGE_JSON_INVALID",
      3,
      "package.json",
    );
  }
  if (value === null || Array.isArray(value) || typeof value !== "object") {
    throw modeError(
      "Mode migration requires an object in package.json.",
      "PACKAGE_JSON_INVALID",
      3,
      "package.json",
    );
  }
  return { bytes, value: value as Record<string, unknown> };
}

function dependencySection(
  value: Record<string, unknown>,
  scope: "runtime" | "development",
  create = false,
): Record<string, unknown> | undefined {
  const key = scope === "runtime" ? "dependencies" : "devDependencies";
  const existing = value[key];
  if (existing === undefined && create) {
    const result: Record<string, unknown> = {};
    value[key] = result;
    return result;
  }
  if (existing === undefined) return undefined;
  if (existing === null || Array.isArray(existing) || typeof existing !== "object") {
    throw modeError(
      `package.json ${key} must be an object.`,
      "MODE_MIGRATION_PACKAGE_JSON_SCOPE_INVALID",
      3,
      "package.json",
    );
  }
  return existing as Record<string, unknown>;
}

function liveDependencies(value: Record<string, unknown>): Readonly<Record<string, string>> {
  const result: Record<string, string> = {};
  for (const scope of ["runtime", "development"] as const) {
    for (const [name, range] of Object.entries(dependencySection(value, scope) ?? {})) {
      if (typeof range === "string") result[`${scope}:${name}`] = range;
    }
  }
  return result;
}

function effectiveRange(
  key: string,
  ranges: readonly string[],
  previous: DistributionDependencyOwnership | undefined,
): string {
  if (
    previous !== undefined &&
    ranges.every((range) => subset(previous.range, range, { includePrerelease: true }))
  ) {
    return previous.range;
  }
  for (const candidate of [...new Set(ranges)].sort()) {
    if (ranges.every((range) => subset(candidate, range, { includePrerelease: true }))) {
      return candidate;
    }
  }
  throw modeError(
    `Mode migration cannot derive one deterministic dependency range for ${key}.`,
    "MODE_MIGRATION_DEPENDENCY_RANGE_UNRESOLVED",
    7,
    "package.json",
  );
}

function ownershipForItems(
  items: Readonly<Record<string, DistributionItem>>,
  current: DistributionProvenanceState,
  live: Readonly<Record<string, string>>,
): {
  readonly dependencies: Readonly<Record<string, DistributionDependencyOwnership>>;
  readonly patches: Readonly<Record<string, DistributionPatchOwnership>>;
} {
  const dependencyClaims = new Map<
    string,
    {
      readonly scope: "runtime" | "development";
      readonly package: string;
      owners: string[];
      ranges: string[];
    }
  >();
  const patchClaims = new Map<
    string,
    { readonly patch: DistributionItem["structuredPatches"][number]; owners: string[] }
  >();
  for (const [owner, item] of Object.entries(items)) {
    for (const scope of ["runtime", "development"] as const) {
      for (const [name, range] of Object.entries(item.dependencies[scope])) {
        const key = `${scope}:${name}`;
        const claim = dependencyClaims.get(key) ?? { scope, package: name, owners: [], ranges: [] };
        claim.owners.push(owner);
        claim.ranges.push(range);
        dependencyClaims.set(key, claim);
      }
    }
    for (const patch of item.structuredPatches) {
      const claim = patchClaims.get(patch.id);
      if (claim !== undefined && canonicalJson(claim.patch) !== canonicalJson(patch)) {
        throw modeError(
          `Mode migration finds conflicting structured patch ${patch.id}.`,
          "DISTRIBUTION_PATCH_CONFLICT",
          6,
          patch.target,
        );
      }
      const next = claim ?? { patch, owners: [] };
      next.owners.push(owner);
      patchClaims.set(patch.id, next);
    }
  }
  const dependencies: Record<string, DistributionDependencyOwnership> = {};
  for (const [key, claim] of dependencyClaims) {
    const previous = current.dependencyOwnership[key];
    dependencies[key] = {
      scope: claim.scope,
      package: claim.package,
      range: effectiveRange(key, claim.ranges, previous),
      owners: portableSort(claim.owners),
      retention:
        previous?.retention ??
        (live[key] === undefined ? "remove-if-unowned" : "retain-if-unowned"),
    };
  }
  const patches: Record<string, DistributionPatchOwnership> = {};
  for (const [id, claim] of patchClaims) {
    const previous = current.patchOwnership[id];
    const match = /^(dependencies|devDependencies)\.(.+)$/u.exec(claim.patch.semanticKey);
    const liveKey =
      match === null
        ? null
        : `${match[1] === "dependencies" ? "runtime" : "development"}:${match[2]!}`;
    patches[id] = {
      ...claim.patch,
      owners: portableSort(claim.owners),
      retention:
        previous?.retention ??
        (liveKey !== null && live[liveKey] === undefined
          ? "remove-if-unowned"
          : "retain-if-unowned"),
    };
  }
  return { dependencies, patches };
}

function proposedState(
  current: DistributionProvenanceState,
  selectedItems: readonly string[],
  to: InstalledDistributionMode,
  manifest: ProvenanceManifest,
  releases: readonly AcquiredNativeRegistryRelease[],
  live: Readonly<Record<string, string>>,
): DistributionProvenanceState {
  const acquired = releaseMap(releases);
  const projections = sourceProjections(selectedItems, manifest, acquired);
  const selected = new Set(selectedItems);
  const items = Object.fromEntries(
    Object.entries(current.items).map(([id, item]): readonly [string, DistributionItem] => {
      if (!selected.has(id)) return [id, structuredClone(item)];
      const release = acquired.get(item.releaseRef);
      if (release === undefined) {
        throw modeError(
          `Mode migration has no acquired release for ${item.releaseRef}.`,
          "MODE_MIGRATION_ACQUIRED_RELEASE_INVALID",
          5,
          item.releaseRef,
        );
      }
      return [
        id,
        to === "package"
          ? packageItem(item, release, current.packageName)
          : sourceItem(item, projections.get(id)!),
      ];
    }),
  );
  const ownership = ownershipForItems(items, current, live);
  return serializeDistributionProvenance({
    ...current,
    items,
    dependencyOwnership: ownership.dependencies,
    patchOwnership: ownership.patches,
  }).state;
}

function materializedPackageJson(
  document: PackageDocument,
  current: DistributionProvenanceState,
  proposed: DistributionProvenanceState,
): Buffer {
  const next = structuredClone(document.value);
  const keys = portableSort([
    ...new Set([
      ...Object.keys(current.dependencyOwnership),
      ...Object.keys(proposed.dependencyOwnership),
    ]),
  ]);
  for (const key of keys) {
    const separator = key.indexOf(":");
    const scope = key.slice(0, separator) as "runtime" | "development";
    const name = key.slice(separator + 1);
    const before = current.dependencyOwnership[key];
    const after = proposed.dependencyOwnership[key];
    const source = dependencySection(document.value, scope)?.[name];
    const live = typeof source === "string" ? source : null;
    if (before !== undefined && live !== before.range) {
      throw modeError(
        `Dependency ${name} changed after its ownership record.`,
        "MODE_MIGRATION_STALE",
        8,
        "package.json",
      );
    }
    if (before === undefined && after !== undefined && live !== null && live !== after.range) {
      throw modeError(
        `Dependency ${name} conflicts with the required mode range.`,
        "MODE_MIGRATION_DEPENDENCY_CONFLICT",
        7,
        "package.json",
      );
    }
    const target = dependencySection(next, scope, after !== undefined);
    if (after !== undefined) {
      target![name] = after.range;
    } else if (before?.retention === "remove-if-unowned") {
      delete target?.[name];
    }
  }
  return Buffer.from(`${JSON.stringify(next, null, 2)}\n`);
}

interface SourceSpecifierCandidate {
  readonly mediaType: string;
  readonly role: string;
  readonly specifier: string;
  readonly target: string;
}

interface ModuleSpecifierLiteral {
  readonly end: number;
  readonly quote: '"' | "'";
  readonly start: number;
  readonly value: string;
}

interface ImportMaterialization {
  readonly rewrites: readonly DistributionImportRewrite[];
  readonly targets: Readonly<Record<string, DistributionModeTargetMaterialization>>;
}

function withoutTypeScriptExtension(value: string): string {
  return value.replace(/(?:\.d)?\.(?:[cm]?[jt]sx?)$/iu, "").replace(/\/index$/u, "");
}

function sourceSpecifierCandidates(item: ManifestItem): readonly SourceSpecifierCandidate[] {
  const result = new Map<string, SourceSpecifierCandidate>();
  for (const file of item.files) {
    for (const [key, root] of Object.entries(item.transformContext.targets)) {
      const alias = item.transformContext.aliases[key];
      if (alias === undefined) continue;
      const normalizedRoot = root.replaceAll("\\", "/").replace(/\/$/u, "");
      const target = file.target.replaceAll("\\", "/");
      if (target !== normalizedRoot && !target.startsWith(`${normalizedRoot}/`)) continue;
      const specifier = `${alias.replace(/\/$/u, "")}${withoutTypeScriptExtension(
        target.slice(normalizedRoot.length),
      )}`;
      const candidate = { mediaType: file.mediaType, role: file.role, specifier, target };
      const previous = result.get(specifier);
      if (
        previous === undefined ||
        candidate.target.length < previous.target.length ||
        (candidate.target.length === previous.target.length &&
          candidate.target.localeCompare(previous.target, "en-US") < 0)
      ) {
        result.set(specifier, candidate);
      }
    }
  }
  return [...result.values()].sort((left, right) =>
    left.specifier.localeCompare(right.specifier, "en-US"),
  );
}

function preferredSourceSpecifier(
  item: ManifestItem,
  itemId: string,
): {
  readonly primary: string;
  readonly allTypeScript: readonly string[];
  readonly unsupported: readonly string[];
} {
  const candidates = sourceSpecifierCandidates(item);
  const typeScript = candidates.filter(({ mediaType }) => /typescript/u.test(mediaType));
  if (typeScript.length === 0) {
    throw modeError(
      `Mode migration cannot derive a TypeScript source import for ${itemId}.`,
      "MODE_MIGRATION_IMPORT_MAPPING_UNAVAILABLE",
      7,
      itemId,
    );
  }
  const ranked = [...typeScript].sort((left, right) => {
    const score = (candidate: SourceSpecifierCandidate): number => {
      const stem = withoutTypeScriptExtension(candidate.target);
      if (/\/index$/u.test(withoutTypeScriptExtension(candidate.target))) return 0;
      if (candidate.specifier.endsWith(`/${itemId}`)) return 1;
      if (candidate.role === "component") return 2;
      if (stem.endsWith(`/${itemId}/${itemId}`)) return 3;
      return 4;
    };
    return (
      score(left) - score(right) ||
      left.specifier.length - right.specifier.length ||
      left.specifier.localeCompare(right.specifier, "en-US")
    );
  });
  return {
    primary: ranked[0]!.specifier,
    allTypeScript: portableSort([...new Set(typeScript.map(({ specifier }) => specifier))]),
    unsupported: portableSort([
      ...new Set(
        candidates
          .filter(({ mediaType }) => !/typescript/u.test(mediaType))
          .map(({ specifier }) => specifier),
      ),
    ]),
  };
}

function importTransitionMap(
  selectedItems: readonly string[],
  current: DistributionProvenanceState,
  proposed: DistributionProvenanceState,
  currentManifest: ProvenanceManifest,
  proposedManifest: ProvenanceManifest,
  from: InstalledDistributionMode,
): {
  readonly transitions: ReadonlyMap<string, string>;
  readonly unsupported: ReadonlySet<string>;
} {
  const transitions = new Map<string, string>();
  const unsupported = new Set<string>();
  const add = (before: string, after: string, owner: string): void => {
    const previous = transitions.get(before);
    if (previous !== undefined && previous !== after) {
      throw modeError(
        `Mode migration import ${before} is ambiguous across ${owner}.`,
        "MODE_MIGRATION_IMPORT_MAPPING_AMBIGUOUS",
        7,
        owner,
      );
    }
    transitions.set(before, after);
  };
  for (const id of selectedItems) {
    const before = current.items[id]!;
    const after = proposed.items[id]!;
    const sourceManifest = (from === "source" ? currentManifest : proposedManifest).items[id];
    if (sourceManifest === undefined) {
      throw modeError(
        `Mode migration manifest has no transform context for ${id}.`,
        "MODE_MIGRATION_IMPORT_MAPPING_UNAVAILABLE",
        7,
        MANIFEST_PATH,
      );
    }
    const source = preferredSourceSpecifier(sourceManifest, before.itemId);
    const packages = portableSort([
      ...new Set((from === "source" ? after : before).importSubpaths),
    ]);
    if (packages.length !== 1) {
      throw modeError(
        `Mode migration requires one unambiguous package import for ${id}.`,
        "MODE_MIGRATION_IMPORT_MAPPING_AMBIGUOUS",
        7,
        id,
      );
    }
    if (from === "source") {
      for (const specifier of source.allTypeScript) add(specifier, packages[0]!, id);
      for (const specifier of source.unsupported) unsupported.add(specifier);
    } else {
      add(packages[0]!, source.primary, id);
    }
  }
  return { transitions, unsupported };
}

function moduleSpecifierLiterals(bytes: Buffer, target: string): readonly ModuleSpecifierLiteral[] {
  let text: string;
  try {
    text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    throw modeError(
      `TypeScript consumer ${target} is not valid UTF-8.`,
      "MODE_MIGRATION_IMPORT_PARSE_FAILED",
      7,
      target,
    );
  }
  const source = ts.createSourceFile(
    target,
    text,
    ts.ScriptTarget.Latest,
    true,
    /\.tsx$/iu.test(target) ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
  );
  const diagnostics = (
    source as ts.SourceFile & { readonly parseDiagnostics?: readonly ts.Diagnostic[] }
  ).parseDiagnostics;
  if ((diagnostics?.length ?? 0) > 0) {
    throw modeError(
      `TypeScript consumer ${target} does not parse, so its imports cannot be rewritten safely.`,
      "MODE_MIGRATION_IMPORT_PARSE_FAILED",
      7,
      target,
    );
  }
  const result: ModuleSpecifierLiteral[] = [];
  const append = (node: ts.StringLiteralLike): void => {
    const start = node.getStart(source);
    const end = node.getEnd();
    const quote = text[start];
    if ((quote !== '"' && quote !== "'") || text[end - 1] !== quote) {
      throw modeError(
        `TypeScript consumer ${target} uses an unsupported module literal.`,
        "MODE_MIGRATION_IMPORT_REWRITE_INVALID",
        7,
        target,
      );
    }
    result.push({ end, quote, start, value: node.text });
  };
  const visit = (node: ts.Node): void => {
    if (ts.isImportDeclaration(node) && ts.isStringLiteralLike(node.moduleSpecifier)) {
      append(node.moduleSpecifier);
    } else if (
      ts.isExportDeclaration(node) &&
      node.moduleSpecifier !== undefined &&
      ts.isStringLiteralLike(node.moduleSpecifier)
    ) {
      append(node.moduleSpecifier);
    } else if (
      ts.isImportEqualsDeclaration(node) &&
      ts.isExternalModuleReference(node.moduleReference) &&
      node.moduleReference.expression !== undefined &&
      ts.isStringLiteralLike(node.moduleReference.expression)
    ) {
      append(node.moduleReference.expression);
    } else if (
      ts.isCallExpression(node) &&
      node.arguments.length === 1 &&
      ts.isStringLiteralLike(node.arguments[0]!) &&
      (node.expression.kind === ts.SyntaxKind.ImportKeyword ||
        (ts.isIdentifier(node.expression) && node.expression.text === "require"))
    ) {
      append(node.arguments[0]!);
    } else if (
      ts.isImportTypeNode(node) &&
      ts.isLiteralTypeNode(node.argument) &&
      ts.isStringLiteralLike(node.argument.literal)
    ) {
      append(node.argument.literal);
    }
    ts.forEachChild(node, visit);
  };
  visit(source);
  return result.sort((left, right) => left.start - right.start);
}

function projectTypeScriptFiles(root: string, excluded: ReadonlySet<string>): readonly string[] {
  const pending = [root];
  const result: string[] = [];
  while (pending.length > 0) {
    const directory = pending.pop()!;
    for (const entry of readdirSync(directory).sort((left, right) =>
      left.localeCompare(right, "en-US"),
    )) {
      if (IGNORED_DIRECTORIES.has(entry)) continue;
      const absolute = resolve(directory, entry);
      const stat = lstatSync(absolute);
      if (stat.isSymbolicLink()) continue;
      if (stat.isDirectory()) {
        pending.push(absolute);
        continue;
      }
      if (!stat.isFile()) continue;
      const target = relative(root, absolute).replaceAll("\\", "/");
      if (!SOURCE_EXTENSIONS.test(target) || excluded.has(target.toLocaleLowerCase("en-US"))) {
        continue;
      }
      result.push(target);
      if (result.length > MAX_PROJECT_FILES) {
        throw modeError(
          "Mode migration project TypeScript inventory exceeds its safety bound.",
          "MODE_MIGRATION_LIMIT_EXCEEDED",
          5,
        );
      }
    }
  }
  return portableSort(result);
}

function normalizedModuleIdentity(target: string): string {
  return withoutTypeScriptExtension(target.replaceAll("\\", "/"));
}

function relativeImportIdentity(consumer: string, specifier: string): string | null {
  if (!specifier.startsWith("./") && !specifier.startsWith("../")) return null;
  return normalizedModuleIdentity(
    posix.resolve("/", posix.dirname(consumer), specifier).replace(/^\//u, ""),
  );
}

function rewriteProjectImports(
  root: string,
  selectedSourceTargets: readonly string[],
  transitions: ReadonlyMap<string, string>,
  unsupported: ReadonlySet<string>,
): ImportMaterialization {
  const excluded = new Set(
    selectedSourceTargets.map((target) => target.toLocaleLowerCase("en-US")),
  );
  const sourceIdentities = new Set(selectedSourceTargets.map(normalizedModuleIdentity));
  const rewrites: DistributionImportRewrite[] = [];
  const targets: Record<string, DistributionModeTargetMaterialization> = {};
  for (const target of projectTypeScriptFiles(root, excluded)) {
    const before = readProjectFile(root, target)!;
    const literals = moduleSpecifierLiterals(before, target);
    const replacements: { readonly end: number; readonly start: number; readonly value: string }[] =
      [];
    for (const literal of literals) {
      if (unsupported.has(literal.value)) {
        throw modeError(
          `TypeScript consumer ${target} imports a source-only non-TypeScript asset that has no exact package-mode mapping.`,
          "MODE_MIGRATION_IMPORT_MAPPING_UNAVAILABLE",
          7,
          target,
        );
      }
      const relativeIdentity = relativeImportIdentity(target, literal.value);
      if (relativeIdentity !== null && sourceIdentities.has(relativeIdentity)) {
        throw modeError(
          `TypeScript consumer ${target} uses a relative Mergora source import; migrate it to the configured alias before changing modes.`,
          "MODE_MIGRATION_IMPORT_MAPPING_UNAVAILABLE",
          7,
          target,
        );
      }
      const replacement = transitions.get(literal.value);
      if (replacement !== undefined) {
        replacements.push({
          end: literal.end,
          start: literal.start,
          value: `${literal.quote}${replacement}${literal.quote}`,
        });
      }
    }
    if (replacements.length === 0) continue;
    let text = before.toString("utf8");
    for (const replacement of replacements.sort((left, right) => right.start - left.start)) {
      text = `${text.slice(0, replacement.start)}${replacement.value}${text.slice(replacement.end)}`;
    }
    const after = Buffer.from(text);
    const rewrite: DistributionImportRewrite = {
      adapter: BUILT_IN_MODE_IMPORT_ADAPTER,
      target,
      before: sha256(before),
      after: sha256(after),
    };
    rewrites.push(rewrite);
    targets[target] = { before, after };
  }
  return {
    rewrites: rewrites.sort((left, right) => left.target.localeCompare(right.target, "en-US")),
    targets,
  };
}

function dependencyObservations(
  current: DistributionProvenanceState,
  proposed: DistributionProvenanceState,
  document: PackageDocument,
): Readonly<Record<string, string | null>> {
  const result: Record<string, string | null> = {};
  const keys = portableSort([
    ...new Set([
      ...Object.keys(current.dependencyOwnership),
      ...Object.keys(proposed.dependencyOwnership),
    ]),
  ]);
  for (const key of keys) {
    const before = current.dependencyOwnership[key];
    const after = proposed.dependencyOwnership[key];
    if (canonicalJson(before ?? null) === canonicalJson(after ?? null)) continue;
    const ownership = after ?? before!;
    const live = dependencySection(document.value, ownership.scope)?.[ownership.package];
    const value = typeof live === "string" ? live : null;
    if (Object.hasOwn(result, ownership.package) && result[ownership.package] !== value) {
      throw modeError(
        `Mode migration cannot observe ${ownership.package} in more than one dependency scope.`,
        "MODE_MIGRATION_DEPENDENCY_AMBIGUOUS",
        7,
        "package.json",
      );
    }
    result[ownership.package] = value;
  }
  return result;
}

function semanticPatchValue(
  ownership: DistributionPatchOwnership,
  document: PackageDocument,
): Digest | null {
  if (ownership.adapter !== "package-dependency" || ownership.target !== "package.json") {
    throw modeError(
      `Mode migration does not have a compiled adapter for structured patch ${ownership.id}.`,
      "MODE_MIGRATION_PATCH_ADAPTER_UNSUPPORTED",
      7,
      ownership.target,
    );
  }
  const match = /^(dependencies|devDependencies)\.(.+)$/u.exec(ownership.semanticKey);
  if (match === null) {
    throw modeError(
      `Mode migration structured patch ${ownership.id} has an unsupported semantic key.`,
      "MODE_MIGRATION_PATCH_ADAPTER_UNSUPPORTED",
      7,
      ownership.target,
    );
  }
  const section = document.value[match[1]!];
  if (section === null || Array.isArray(section) || typeof section !== "object") return null;
  const value = (section as Record<string, unknown>)[match[2]!];
  return typeof value === "string" ? sha256(value) : null;
}

function patchObservations(
  current: DistributionProvenanceState,
  proposed: DistributionProvenanceState,
  document: PackageDocument,
): Readonly<Record<string, Digest | null>> {
  const result: Record<string, Digest | null> = {};
  const ids = portableSort([
    ...new Set([...Object.keys(current.patchOwnership), ...Object.keys(proposed.patchOwnership)]),
  ]);
  for (const id of ids) {
    const before = current.patchOwnership[id];
    const after = proposed.patchOwnership[id];
    if (canonicalJson(before ?? null) === canonicalJson(after ?? null)) continue;
    result[id] = semanticPatchValue(after ?? before!, document);
  }
  return result;
}

function selectedSourceTargets(
  selectedItems: readonly string[],
  current: DistributionProvenanceState,
  proposed: DistributionProvenanceState,
): readonly string[] {
  return portableSort([
    ...new Set(
      selectedItems.flatMap((id) => [
        ...current.items[id]!.files.map(({ target }) => target),
        ...proposed.items[id]!.files.map(({ target }) => target),
      ]),
    ),
  ]);
}

function sourceMaterializations(
  root: string,
  selectedItems: readonly string[],
  current: DistributionProvenanceState,
  proposed: DistributionProvenanceState,
  projections: ReadonlyMap<string, ReturnType<typeof deriveAcquiredDistributionSources>[number]>,
): {
  readonly bases: Readonly<Record<Digest, DistributionModeBaseMaterialization>>;
  readonly observations: Readonly<Record<string, Digest | null>>;
  readonly targets: Readonly<Record<string, DistributionModeTargetMaterialization>>;
} {
  const bases: Record<Digest, DistributionModeBaseMaterialization> = {};
  const observations: Record<string, Digest | null> = {};
  const targets: Record<string, DistributionModeTargetMaterialization> = {};
  const addTarget = (target: string, before: Buffer | null, after: Buffer | null): void => {
    if (Object.hasOwn(targets, target)) {
      throw modeError(
        `Mode migration source target ${target} is owned more than once.`,
        "MODE_MIGRATION_TARGET_COLLISION",
        6,
        target,
      );
    }
    observations[target] = before === null ? null : sha256(before);
    targets[target] = { before, after };
  };
  for (const id of selectedItems) {
    const beforeItem = current.items[id]!;
    const afterItem = proposed.items[id]!;
    for (const file of beforeItem.files) {
      addTarget(file.target, readProjectFile(root, file.target), null);
    }
    if (afterItem.files.length === 0) continue;
    const projection = projections.get(id);
    if (projection === undefined) {
      throw modeError(
        `Mode migration has no acquired source projection for ${id}.`,
        "MODE_MIGRATION_ACQUIRED_SOURCE_MISMATCH",
        5,
        id,
      );
    }
    for (const file of afterItem.files) {
      const acquired = projection.files.find(({ target }) => target === file.target);
      if (acquired === undefined || acquired.digest !== file.base) {
        throw modeError(
          `Mode migration acquired source bytes do not match ${file.target}.`,
          "MODE_MIGRATION_ACQUIRED_SOURCE_MISMATCH",
          5,
          file.target,
        );
      }
      const content = Buffer.from(acquired.bytes);
      addTarget(file.target, readProjectFile(root, file.target), content);
      const existingBase = readProjectFile(root, basePath(file.base));
      if (existingBase !== null && sha256(existingBase) !== file.base) {
        throw modeError(
          `Immutable base ${file.base} is occupied by different bytes.`,
          "MODE_MIGRATION_BASE_COLLISION",
          6,
          basePath(file.base),
        );
      }
      bases[file.base] = { before: existingBase, content };
    }
  }
  return { bases, observations, targets };
}

function packageIntegrityEvidence(
  selectedItems: readonly string[],
  current: DistributionProvenanceState,
  releases: ReadonlyMap<string, AcquiredNativeRegistryRelease>,
  evidenceValues: readonly AcquiredDistributionPackageEvidence[],
): readonly DistributionModePackageIntegrityEvidence[] {
  const expectedRefs = portableSort([
    ...new Set(selectedItems.map((id) => current.items[id]!.releaseRef)),
  ]);
  const evidence = new Map<string, AcquiredDistributionPackageEvidence>();
  for (const value of evidenceValues) {
    const ref = `${value.release.registry.id}@${value.release.release}`;
    if (evidence.has(ref)) {
      throw modeError(
        `Mode migration package evidence for ${ref} is duplicated.`,
        "MODE_MIGRATION_PACKAGE_INTEGRITY_INVALID",
        5,
        ref,
      );
    }
    evidence.set(ref, value);
  }
  if (canonicalJson(portableSort([...evidence.keys()])) !== canonicalJson(expectedRefs)) {
    throw modeError(
      "Mode migration package evidence is incomplete or out of scope.",
      "MODE_MIGRATION_PACKAGE_INTEGRITY_INVALID",
      5,
    );
  }
  return expectedRefs.map((releaseRef) => {
    const acquired = releases.get(releaseRef)!;
    const value = evidence.get(releaseRef)!;
    if (value.release !== acquired || value.artifact.package !== current.packageName) {
      throw modeError(
        `Mode migration package evidence for ${releaseRef} is not bound to its acquired release.`,
        "MODE_MIGRATION_PACKAGE_INTEGRITY_INVALID",
        5,
        releaseRef,
      );
    }
    return {
      releaseRef,
      package: value.artifact.package,
      version: value.artifact.version,
      url: value.artifact.url,
      bytes: Uint8Array.from(value.artifact.bytes),
    };
  });
}

function mergeTargetMaterializations(
  ...records: readonly Readonly<Record<string, DistributionModeTargetMaterialization>>[]
): Readonly<Record<string, DistributionModeTargetMaterialization>> {
  const result: Record<string, DistributionModeTargetMaterialization> = {};
  for (const record of records) {
    for (const [target, value] of Object.entries(record)) {
      if (Object.hasOwn(result, target)) {
        throw modeError(
          `Mode migration target ${target} has overlapping materializations.`,
          "MODE_MIGRATION_TARGET_COLLISION",
          6,
          target,
        );
      }
      result[target] = value;
    }
  }
  return result;
}

function buildProjectDistributionModeMigration(
  options: ProjectDistributionModeOptions,
): BuiltProjectModeMigration {
  const root = validatedProjectRoot(options.projectRoot);
  const config = readMergoraConfig(root);
  if (config === null) {
    throw modeError("Mergora is not initialized; run mergora init first.", "CONFIG_MISSING", 3);
  }
  const manifest = readManifest(root);
  const distribution = distributionProvenanceFromManifest(manifest.value);
  if (distribution === null) {
    throw modeError(
      "Mode migration requires retention-aware distribution provenance.",
      "MANIFEST_DISTRIBUTION_REQUIRED",
      7,
      MANIFEST_PATH,
    );
  }
  assertDistributionConfigurationBinding(distribution.state, config);
  const selectedItems = selectedQualifiedItems(
    options.itemIds,
    distribution.state,
    options.acquiredReleases,
  );
  assertClosedModeGraph(distribution.state, selectedItems);
  const from = distribution.state.items[selectedItems[0]!]!.mode;
  if (
    from === options.to ||
    selectedItems.some((id) => distribution.state.items[id]!.mode !== from)
  ) {
    throw modeError(
      `Mode migration selection must move uniformly to ${options.to}.`,
      "MODE_MIGRATION_DIRECTION_INVALID",
      7,
      MANIFEST_PATH,
    );
  }
  const acquired = releaseMap(options.acquiredReleases);
  const document = packageDocument(root);
  const live = liveDependencies(document.value);
  const proposed = proposedState(
    distribution.state,
    selectedItems,
    options.to,
    manifest.value,
    options.acquiredReleases,
    live,
  );
  const proposedManifest = manifestFromDistributionState(
    manifest.value,
    config,
    proposed,
    manifest.value.toolchain.formatter,
  );
  const projections = sourceProjections(selectedItems, manifest.value, acquired);
  const sourceTargets = selectedSourceTargets(selectedItems, distribution.state, proposed);
  const imports = importTransitionMap(
    selectedItems,
    distribution.state,
    proposed,
    manifest.value,
    proposedManifest,
    from,
  );
  const importMaterialization = rewriteProjectImports(
    root,
    sourceTargets,
    imports.transitions,
    imports.unsupported,
  );
  const sources = sourceMaterializations(
    root,
    selectedItems,
    distribution.state,
    proposed,
    projections,
  );
  const dependencyObservation = dependencyObservations(distribution.state, proposed, document);
  const patchObservation = patchObservations(distribution.state, proposed, document);
  const packageChanges =
    canonicalJson(distribution.state.dependencyOwnership) !==
      canonicalJson(proposed.dependencyOwnership) ||
    canonicalJson(distribution.state.patchOwnership) !== canonicalJson(proposed.patchOwnership);
  const packageTargets = packageChanges
    ? {
        "package.json": {
          before: document.bytes,
          after: materializedPackageJson(document, distribution.state, proposed),
        },
      }
    : {};
  const rawPackageEvidence = packageIntegrityEvidence(
    selectedItems,
    distribution.state,
    acquired,
    options.packageEvidence,
  );
  const releaseRefs = portableSort([
    ...new Set(selectedItems.map((id) => distribution.state.items[id]!.releaseRef)),
  ]);
  const migration = {
    currentState: distribution.state,
    proposedState: proposed,
    configuration: config,
    from,
    to: options.to,
    itemIds: selectedItems,
    observation: {
      stateDigest: distribution.canonicalDigest,
      unresolvedTransactions: listIncompleteTransactions(root),
      sourceFiles: sources.observations,
      dependencies: dependencyObservation,
      patches: patchObservation,
      projectFiles: Object.fromEntries(
        importMaterialization.rewrites.map(({ target, before }) => [target, before]),
      ),
      importRewrites: importMaterialization.rewrites,
    },
    currentManifestBytes: manifest.bytes,
    acquiredReleases: options.acquiredReleases,
  } satisfies BuiltProjectModeMigration["materialization"]["migration"];
  const materialization = {
    migration,
    proposedManifestBytes: manifestBytes(proposedManifest),
    targets: mergeTargetMaterializations(
      sources.targets,
      importMaterialization.targets,
      packageTargets,
    ),
    bases: sources.bases,
    cliVersion: CLI_VERSION,
    releaseSources: Object.fromEntries(releaseRefs.map((ref) => [ref, acquired.get(ref)!.source])),
    packageIntegrityEvidence: rawPackageEvidence,
  } satisfies BuiltProjectModeMigration["materialization"];
  const reviewed = planDistributionModeTransaction(materialization);
  const { planDigest: _reviewedDigest, ...semantic } = reviewed.plan;
  const plan = finalizeOperationPlan(semantic);
  if (plan.planDigest !== reviewed.plan.planDigest) {
    throw modeError(
      "Mode migration canonical plan changed across its public boundary.",
      "OPERATION_PLAN_DIGEST_MISMATCH",
      8,
    );
  }
  const manager = inspectProject(root, { packageManager: options.packageManager }).packageManager;
  return { root, from, items: selectedItems, manager, materialization, plan };
}

/** Plans a complete project-level source/package migration through the canonical transaction. */
export function planProjectDistributionModeMigration(
  options: ProjectDistributionModeOptions,
): OperationPlan {
  return buildProjectDistributionModeMigration(options).plan;
}

/** Recomputes and applies the exact reviewed project-level distribution-mode migration. */
export function applyProjectDistributionModeMigration(
  options: ProjectDistributionModeOptions,
  expectedPlanDigest: string,
): ProjectDistributionModeResult {
  const built = buildProjectDistributionModeMigration(options);
  assertValidOperationPlanV1(built.plan);
  if (built.plan.planDigest !== expectedPlanDigest) {
    throw modeError(
      "Mode migration plan changed before apply; review and confirm the fresh digest.",
      "PLAN_PRECONDITION_STALE",
      8,
    );
  }
  const applied = applyDistributionModeTransaction({
    ...built.materialization,
    projectRoot: built.root,
    packageManager: built.manager,
    noInstall: options.noInstall,
    offline: options.offline,
    packageManagerRunner: options.packageManagerRunner,
    commandArguments: options.commandArguments,
    faultInjector: options.faultInjector,
    reviewedPlanDigest: built.plan.planDigest,
    yes: true,
  });
  return {
    from: built.from,
    to: options.to,
    items: built.items,
    planDigest: built.plan.planDigest,
    transaction: applied.transaction,
  };
}
