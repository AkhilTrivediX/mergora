import {
  closeSync,
  constants,
  existsSync,
  fstatSync,
  lstatSync,
  openSync,
  readFileSync,
} from "node:fs";
import { resolve } from "node:path";

import {
  assertNoSymlinkAncestors,
  assertPortableRelativePath,
  canonicalJson,
  CliError,
  portableSort,
  sha256,
  validatedProjectRoot,
} from "./contracts.js";
import {
  mergoraConfigAliasPrefix,
  readMergoraConfig,
  validateMergoraConfig,
  type MergoraConfig,
} from "./configuration.js";
import {
  assertAuthenticAcquiredNativeRegistryRelease,
  type AcquiredNativeFile,
  type AcquiredNativeRegistryItem,
  type AcquiredNativeRegistryRelease,
} from "./acquisition-resolver.js";
import {
  compatibleDependencyRange,
  planPackageDependencies,
  readPackageDependencies,
  type DependencyRequirement,
} from "./package-editor.js";
import {
  inspectProject,
  type PackageManager,
  type ProjectInspection,
} from "./project-inspector.js";
import {
  OFFICIAL_REGISTRY_ORIGIN,
  resolveItemAlias,
  resolveSourceDependencyClosure,
  type RegistryDataOptions,
  type SourceFileRecord,
  type SourceItemRecord,
} from "./registry-data.js";
import {
  executeTransaction,
  finalizeOperationPlan,
  validateTransactionOverlay,
  validationSuiteForTransaction,
  type ExecuteTransactionOptions,
  type OperationPlan,
  type OperationPlanDependencyChange,
  type OperationPlanFile,
  type OperationPlanItem,
  type PackageManagerRunner,
  type TransactionFaultInjector,
  type TransactionMutation,
  type TransactionRegistryPayload,
  type TransactionResult,
  type TransactionValidationContext,
  type TransactionValidationIssue,
  type TransactionValidationResult,
  type TransactionValidator,
} from "./transaction-engine.js";
import {
  createMediaParseValidator,
  transactionValidationResult,
  type TransactionMediaFile,
} from "./trusted-transaction-validators.js";
import {
  assertDistributionConfigurationBinding,
  serializeDistributionProvenance,
  validateDistributionProvenance,
  type ConfiguredDistributionMode,
  type DistributionDependencyOwnership,
  type DistributionItem,
  type DistributionPatchOwnership,
  type DistributionProvenanceState,
  type DistributionReleasePin,
  type ValidatedDistributionProvenance,
} from "./distribution-provenance.js";

const UNRELEASED_VERSION = "0.0.0-unreleased" as const;
export const MANIFEST_PATH = ".mergora/manifest.json" as const;

export interface ManifestFile {
  readonly logicalPath: string;
  readonly target: string;
  readonly role: "component" | "hook" | "lib" | "system" | "kit" | "style" | "token";
  readonly base: `sha256:${string}`;
  readonly installed: `sha256:${string}` | null;
  readonly mediaType: string;
  readonly executable: false;
  readonly tombstone?: boolean | undefined;
}

export interface ManifestPatch {
  readonly id: string;
  readonly adapter:
    | "css-import"
    | "css-source"
    | "css-token-block"
    | "package-dependency"
    | "tsconfig-path"
    | "tsconfig-include"
    | "framework-config";
  /** Required by distribution-aware manifests; legacy source manifests did not persist it. */
  readonly target?: string | undefined;
  readonly semanticKey: string;
  readonly ownedValueDigest: `sha256:${string}`;
}

export interface ManifestItem {
  readonly registry: "official";
  readonly itemId: string;
  readonly kind: "component" | "system" | "hook" | "utility" | "kit" | "theme" | "contract";
  readonly requested: string;
  readonly resolved: string;
  /** Exact immutable release key. Required once distribution provenance is attached. */
  readonly releaseRef?: string | undefined;
  readonly payload: { readonly url: string; readonly digest: `sha256:${string}` };
  readonly mode: "source" | "package";
  direct: boolean;
  readonly transformContextDigest: `sha256:${string}`;
  readonly transformContext: {
    readonly targets: Readonly<Record<string, string>>;
    readonly aliases: Readonly<Record<string, string>>;
    readonly styling: {
      readonly engine: "tailwind-v4";
      readonly tokenPreset: string;
      readonly density: "comfortable" | "compact" | "touch";
      readonly direction: "ltr" | "rtl" | "auto";
    };
  };
  readonly files: readonly ManifestFile[];
  /** Fixed-release package artifacts owned by this item in package mode only. */
  readonly packageClaims?: readonly string[] | undefined;
  /** Public package import subpaths owned by this item in package mode only. */
  readonly importSubpaths?: readonly string[] | undefined;
  readonly registryDependencies: readonly string[];
  readonly dependencies: {
    readonly runtime: Readonly<Record<string, string>>;
    readonly development: Readonly<Record<string, string>>;
  };
  structuredPatches: ManifestPatch[];
  readonly contractVersion: string;
  readonly lastMigration: string | null;
}

export interface ProvenanceManifest {
  readonly $schema: string;
  readonly schemaVersion: 1;
  readonly projectId: `sha256:${string}`;
  /** All distribution fields are either absent together (legacy source manifest) or present. */
  readonly configDigest?: `sha256:${string}` | undefined;
  readonly defaultMode?: ConfiguredDistributionMode | undefined;
  readonly packageName?: string | undefined;
  readonly toolchain: {
    readonly cli: string;
    readonly schema: string;
    readonly transformer: string;
    readonly formatter: string;
  };
  readonly releases?: Readonly<Record<string, DistributionReleasePin>> | undefined;
  items: Record<string, ManifestItem>;
  sharedTargets: Record<string, string[]>;
  dependencyOwners: Record<string, string[]>;
  readonly dependencyOwnership?:
    Readonly<Record<string, DistributionDependencyOwnership>> | undefined;
  readonly patchOwnership?: Readonly<Record<string, DistributionPatchOwnership>> | undefined;
}

const DISTRIBUTION_MANIFEST_KEYS = [
  "configDigest",
  "defaultMode",
  "packageName",
  "releases",
  "dependencyOwnership",
  "patchOwnership",
] as const;

export interface DistributionManifestProjection extends ValidatedDistributionProvenance {
  readonly manifest: ProvenanceManifest;
}

function distributionOwnershipViews(state: DistributionProvenanceState): {
  readonly dependencyOwners: Record<string, string[]>;
  readonly sharedTargets: Record<string, string[]>;
} {
  const sharedTargets = new Map<string, string[]>();
  for (const patch of Object.values(state.patchOwnership)) {
    const owners = sharedTargets.get(patch.target) ?? [];
    owners.push(patch.id);
    sharedTargets.set(patch.target, owners);
  }
  return {
    dependencyOwners: Object.fromEntries(
      Object.entries(state.dependencyOwnership).map(([key, ownership]) => [
        key,
        [...ownership.owners],
      ]),
    ),
    sharedTargets: Object.fromEntries(
      [...sharedTargets].map(([target, owners]) => [target, [...portableSort(owners)]]),
    ),
  };
}

interface MappedSourceFile {
  readonly source: SourceFileRecord;
  readonly target: string;
  readonly logicalPath: string;
  readonly role: ManifestFile["role"];
  readonly bytes: Buffer;
  readonly digest: `sha256:${string}`;
}

export interface SourceOperationOptions extends RegistryDataOptions {
  readonly projectRoot: string;
  readonly itemIds: readonly string[];
  readonly targetDirectory?: string | undefined;
  readonly noInstall?: boolean | undefined;
  readonly offline?: boolean | undefined;
  readonly packageManager?: PackageManager | undefined;
  readonly packageManagerRunner?: PackageManagerRunner | undefined;
  readonly faultInjector?: TransactionFaultInjector | undefined;
  readonly commandArguments?: readonly string[] | undefined;
}

export interface AcquiredSourceOperationOptions extends SourceOperationOptions {
  readonly acquiredRelease: AcquiredNativeRegistryRelease;
}

export interface SourceRemoveOptions extends SourceOperationOptions {
  readonly keepFiles?: boolean | undefined;
}

export type SourceOperationPlan = OperationPlan;

export interface SourceOperationResult {
  readonly mode: "source-transaction";
  readonly command: "add" | "remove" | "adopt";
  readonly items: readonly string[];
  readonly requestedItems: readonly string[];
  readonly transitiveItems: readonly string[];
  readonly retainedFiles: readonly string[];
  readonly manifest: typeof MANIFEST_PATH;
  readonly transaction: TransactionResult;
  readonly planDigest: `sha256:${string}`;
}

interface InternalSourcePlan {
  readonly root: string;
  readonly publicPlan: SourceOperationPlan;
  readonly mutations: readonly TransactionMutation[];
  readonly observedTargets: Readonly<Record<string, `sha256:${string}` | null>>;
  readonly registryPayloads: readonly TransactionRegistryPayload[];
  readonly packageManager: PackageManager;
  readonly packageManagerRequired: boolean;
  readonly resolvedItems: readonly string[];
  readonly requestedItems: readonly string[];
  readonly transitiveItems: readonly string[];
  readonly retainedFiles: readonly string[];
  readonly validators: readonly TransactionValidator[];
}

interface AcquiredSourceContext {
  readonly release: AcquiredNativeRegistryRelease;
  readonly sources: readonly SourceItemRecord[];
  readonly sourceById: ReadonlyMap<string, SourceItemRecord>;
  readonly itemById: ReadonlyMap<string, AcquiredNativeRegistryItem>;
}

export interface AcquiredDistributionSourceFile {
  readonly logicalPath: string;
  readonly target: string;
  readonly role: ManifestFile["role"];
  readonly mediaType: string;
  readonly digest: `sha256:${string}`;
  readonly bytes: Uint8Array;
}

export interface AcquiredDistributionSourceProjection {
  readonly qualifiedId: string;
  readonly releaseRef: string;
  readonly itemId: string;
  readonly kind: ManifestItem["kind"];
  readonly resolved: string;
  readonly payload: ManifestItem["payload"];
  readonly files: readonly AcquiredDistributionSourceFile[];
  readonly registryDependencies: readonly string[];
  readonly dependencies: ManifestItem["dependencies"];
  readonly structuredPatches: readonly Required<ManifestPatch>[];
  /** Exact package specifiers acquired for the inverse import rewrite. */
  readonly packageImportSubpaths: readonly string[];
  readonly contractVersion: string;
}

export interface DeriveAcquiredDistributionSourcesOptions {
  readonly acquiredRelease: AcquiredNativeRegistryRelease;
  readonly itemIds: readonly string[];
  readonly transformContexts: Readonly<
    Record<
      string,
      {
        readonly digest: `sha256:${string}`;
        readonly value: ManifestItem["transformContext"];
      }
    >
  >;
}

function objectValue(value: unknown, label: string): Record<string, unknown> {
  if (value === null || Array.isArray(value) || typeof value !== "object") {
    throw new CliError(`${label} must be an object.`, {
      code: "MANIFEST_INVALID",
      exitCode: 3,
      target: MANIFEST_PATH,
    });
  }
  return value as Record<string, unknown>;
}

function exactKeys(value: Record<string, unknown>, keys: readonly string[], label: string): void {
  const actual = Object.keys(value).sort((left, right) => left.localeCompare(right, "en-US"));
  const expected = [...keys].sort((left, right) => left.localeCompare(right, "en-US"));
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new CliError(`${label} has missing or unknown fields.`, {
      code: "MANIFEST_UNKNOWN_FIELD",
      exitCode: 3,
      target: MANIFEST_PATH,
    });
  }
}

function manifestError(message: string, code = "MANIFEST_DISTRIBUTION_INVALID"): CliError {
  return new CliError(message, { code, exitCode: 3, target: MANIFEST_PATH });
}

function distributionFieldsPresent(value: Record<string, unknown>): readonly string[] {
  return DISTRIBUTION_MANIFEST_KEYS.filter((key) => Object.hasOwn(value, key));
}

function distributionItemProjection(item: ManifestItem, qualifiedId: string): DistributionItem {
  if (
    item.releaseRef === undefined ||
    item.packageClaims === undefined ||
    item.importSubpaths === undefined
  ) {
    throw manifestError(
      `Distribution-aware manifest item ${qualifiedId} is missing release or mode ownership fields.`,
      "MANIFEST_DISTRIBUTION_INCOMPLETE",
    );
  }
  const patches = item.structuredPatches.map((patch) => {
    if (patch.target === undefined) {
      throw manifestError(
        `Distribution-aware manifest patch ${patch.id} is missing its owned target.`,
        "MANIFEST_DISTRIBUTION_INCOMPLETE",
      );
    }
    return {
      id: patch.id,
      adapter: patch.adapter,
      target: patch.target,
      semanticKey: patch.semanticKey,
      ownedValueDigest: patch.ownedValueDigest,
    };
  });
  const common = {
    registry: item.registry,
    itemId: item.itemId,
    kind: item.kind,
    requested: item.requested,
    resolved: item.resolved,
    releaseRef: item.releaseRef,
    payload: item.payload,
    direct: item.direct,
    registryDependencies: item.registryDependencies,
    dependencies: item.dependencies,
    structuredPatches: patches,
    contractVersion: item.contractVersion,
    lastMigration: item.lastMigration,
  };
  if (item.mode === "source") {
    if (item.packageClaims.length !== 0 || item.importSubpaths.length !== 0) {
      throw manifestError(
        `Source manifest item ${qualifiedId} cannot claim package ownership.`,
        "MANIFEST_DISTRIBUTION_OWNERSHIP_MISMATCH",
      );
    }
    return {
      ...common,
      mode: "source",
      files: item.files,
      packageClaims: [],
      importSubpaths: [],
    };
  }
  if (item.files.length !== 0) {
    throw manifestError(
      `Package manifest item ${qualifiedId} cannot own copied source files.`,
      "MANIFEST_DISTRIBUTION_OWNERSHIP_MISMATCH",
    );
  }
  return {
    ...common,
    mode: "package",
    files: [],
    packageClaims: item.packageClaims,
    importSubpaths: item.importSubpaths,
  };
}

/**
 * Projects the actual persisted manifest into the strict distribution ownership core. Legacy
 * source-only v1 manifests return null; a partial or future distribution extension fails closed.
 */
export function distributionProvenanceFromManifest(
  manifest: ProvenanceManifest,
): DistributionManifestProjection | null {
  const source = manifest as unknown as Record<string, unknown>;
  const present = distributionFieldsPresent(source);
  if (present.length === 0) return null;
  if (present.length !== DISTRIBUTION_MANIFEST_KEYS.length) {
    throw manifestError(
      "The distribution manifest extension is partial or from an unsupported schema.",
      "MANIFEST_DISTRIBUTION_INCOMPLETE",
    );
  }
  const validated = serializeDistributionProvenance({
    schemaVersion: 1,
    projectId: manifest.projectId,
    configDigest: manifest.configDigest,
    defaultMode: manifest.defaultMode,
    packageName: manifest.packageName,
    releases: manifest.releases,
    items: Object.fromEntries(
      Object.entries(manifest.items).map(([id, item]) => [
        id,
        distributionItemProjection(item, id),
      ]),
    ),
    dependencyOwnership: manifest.dependencyOwnership,
    patchOwnership: manifest.patchOwnership,
  });
  const views = distributionOwnershipViews(validated.state);
  if (
    canonicalJson(normalizedStringArrayRecord(manifest.dependencyOwners)) !==
      canonicalJson(normalizedStringArrayRecord(views.dependencyOwners)) ||
    canonicalJson(normalizedStringArrayRecord(manifest.sharedTargets)) !==
      canonicalJson(normalizedStringArrayRecord(views.sharedTargets))
  ) {
    throw manifestError(
      "Legacy and retention-aware manifest ownership views disagree.",
      "MANIFEST_DISTRIBUTION_OWNERSHIP_MISMATCH",
    );
  }
  return { ...validated, manifest };
}

function normalizedStringArrayRecord(
  value: Readonly<Record<string, readonly string[]>>,
): Record<string, readonly string[]> {
  return Object.fromEntries(
    Object.entries(value)
      .sort(([left], [right]) => left.localeCompare(right, "en-US"))
      .map(([key, entries]) => [key, [...portableSort(entries)]]),
  );
}

function legacyItemProjection(item: ManifestItem): unknown {
  return {
    registry: item.registry,
    itemId: item.itemId,
    kind: item.kind,
    requested: item.requested,
    resolved: item.resolved,
    payload: item.payload,
    mode: item.mode,
    direct: item.direct,
    files: item.files,
    registryDependencies: item.registryDependencies,
    dependencies: item.dependencies,
    structuredPatches: item.structuredPatches.map(({ target: _target, ...patch }) => patch),
    contractVersion: item.contractVersion,
    lastMigration: item.lastMigration,
  };
}

function legacyDistributionProjection(item: DistributionItem): unknown {
  return {
    registry: item.registry,
    itemId: item.itemId,
    kind: item.kind,
    requested: item.requested,
    resolved: item.resolved,
    payload: item.payload,
    mode: item.mode,
    direct: item.direct,
    files: item.files,
    registryDependencies: item.registryDependencies,
    dependencies: item.dependencies,
    structuredPatches: item.structuredPatches.map(({ target: _target, ...patch }) => patch),
    contractVersion: item.contractVersion,
    lastMigration: item.lastMigration,
  };
}

/**
 * Deterministically attaches exact distribution provenance to a compatible legacy source
 * manifest. It never changes installed source, mode, dependencies, patches, or item identity.
 */
export function migrateLegacyManifestToDistribution(
  manifest: ProvenanceManifest,
  proposedState: unknown,
  configuration: unknown,
): ProvenanceManifest {
  const state = validateDistributionProvenance(proposedState);
  assertDistributionConfigurationBinding(state, configuration);
  const existing = distributionProvenanceFromManifest(manifest);
  if (existing !== null) {
    if (existing.canonicalDigest !== sha256(canonicalJson(state))) {
      throw manifestError(
        "The manifest already has different distribution provenance.",
        "MANIFEST_DISTRIBUTION_MIGRATION_CONFLICT",
      );
    }
    return normalizedManifest(manifest);
  }
  if (state.projectId !== manifest.projectId) {
    throw manifestError(
      "Distribution provenance belongs to a different project.",
      "MANIFEST_DISTRIBUTION_PROJECT_MISMATCH",
    );
  }
  const currentIds = Object.keys(manifest.items).sort((left, right) =>
    left.localeCompare(right, "en-US"),
  );
  const proposedIds = Object.keys(state.items).sort((left, right) =>
    left.localeCompare(right, "en-US"),
  );
  if (canonicalJson(currentIds) !== canonicalJson(proposedIds)) {
    throw manifestError(
      "Distribution attachment cannot add, remove, or infer installed items.",
      "MANIFEST_DISTRIBUTION_MIGRATION_CONFLICT",
    );
  }
  const legacyDependencyOwners = normalizedStringArrayRecord(manifest.dependencyOwners);
  const legacySharedTargets = normalizedStringArrayRecord(manifest.sharedTargets);
  const proposedViews = distributionOwnershipViews(state);
  if (
    canonicalJson(legacyDependencyOwners) !==
      canonicalJson(normalizedStringArrayRecord(proposedViews.dependencyOwners)) ||
    canonicalJson(legacySharedTargets) !==
      canonicalJson(normalizedStringArrayRecord(proposedViews.sharedTargets))
  ) {
    throw manifestError(
      "Distribution attachment must preserve every legacy dependency owner and patch target.",
      "MANIFEST_DISTRIBUTION_OWNERSHIP_MISMATCH",
    );
  }
  if (
    Object.values(state.dependencyOwnership).some(
      ({ retention }) => retention !== "retain-if-unowned",
    ) ||
    Object.values(state.patchOwnership).some(({ retention }) => retention !== "retain-if-unowned")
  ) {
    throw manifestError(
      "Legacy provenance cannot prove Mergora created a dependency or patch, so attachment must retain every value after its final owner leaves.",
      "MANIFEST_DISTRIBUTION_RETENTION_UNPROVABLE",
    );
  }
  const items = Object.fromEntries(
    currentIds.map((id): readonly [string, ManifestItem] => {
      const current = manifest.items[id]!;
      const proposed = state.items[id]!;
      if (
        current.mode !== "source" ||
        proposed.mode !== "source" ||
        canonicalJson(legacyItemProjection(current)) !==
          canonicalJson(legacyDistributionProjection(proposed))
      ) {
        throw manifestError(
          `Distribution attachment would change legacy item ${id}; use a reviewed transaction instead.`,
          "MANIFEST_DISTRIBUTION_MIGRATION_CONFLICT",
        );
      }
      return [
        id,
        {
          ...current,
          releaseRef: proposed.releaseRef,
          packageClaims: [],
          importSubpaths: [],
          structuredPatches: proposed.structuredPatches.map((patch) => ({ ...patch })),
        },
      ];
    }),
  );
  const migrated: ProvenanceManifest = {
    ...structuredClone(manifest),
    configDigest: state.configDigest,
    defaultMode: state.defaultMode,
    packageName: state.packageName,
    releases: state.releases,
    items,
    ...distributionOwnershipViews(state),
    dependencyOwnership: state.dependencyOwnership,
    patchOwnership: state.patchOwnership,
  };
  distributionProvenanceFromManifest(migrated);
  return normalizedManifest(migrated);
}

export function validateManifestDocument(raw: unknown): ProvenanceManifest {
  const manifest = objectValue(raw, "The provenance manifest");
  const distributionFields = distributionFieldsPresent(manifest);
  if (
    distributionFields.length !== 0 &&
    distributionFields.length !== DISTRIBUTION_MANIFEST_KEYS.length
  ) {
    throw manifestError(
      "The distribution manifest extension is partial or unsupported.",
      "MANIFEST_DISTRIBUTION_INCOMPLETE",
    );
  }
  exactKeys(
    manifest,
    [
      "$schema",
      "schemaVersion",
      "projectId",
      "toolchain",
      "items",
      "sharedTargets",
      "dependencyOwners",
      ...distributionFields,
    ],
    "The provenance manifest",
  );
  if (
    manifest.schemaVersion !== 1 ||
    typeof manifest.$schema !== "string" ||
    !manifest.$schema.endsWith("/manifest-v1.schema.json") ||
    (distributionFields.length === DISTRIBUTION_MANIFEST_KEYS.length &&
      manifest.$schema !==
        "https://akhiltrivedix.github.io/mergora/r/v1/schemas/manifest-v1.schema.json") ||
    typeof manifest.projectId !== "string" ||
    !/^sha256:[a-f0-9]{64}$/u.test(manifest.projectId)
  ) {
    throw new CliError("The provenance manifest schema identity is unsupported.", {
      code: "MANIFEST_SCHEMA_INVALID",
      exitCode: 3,
      target: MANIFEST_PATH,
    });
  }
  const toolchain = objectValue(manifest.toolchain, "Manifest toolchain");
  exactKeys(toolchain, ["cli", "schema", "transformer", "formatter"], "Manifest toolchain");
  const semver =
    /^(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)(?:-[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?(?:\+[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?$/u;
  if (
    !semver.test(String(toolchain.cli)) ||
    !semver.test(String(toolchain.schema)) ||
    !semver.test(String(toolchain.transformer)) ||
    typeof toolchain.formatter !== "string" ||
    toolchain.formatter.length === 0 ||
    toolchain.formatter.length > 160 ||
    /^(?:[A-Za-z]:[\\/]|[\\/]{1,2})/u.test(toolchain.formatter) ||
    toolchain.formatter.includes("\\")
  ) {
    throw manifestError(
      "Manifest toolchain metadata must use portable version identities.",
      "MANIFEST_TOOLCHAIN_INVALID",
    );
  }
  const items = objectValue(manifest.items, "Manifest items");
  objectValue(manifest.sharedTargets, "Manifest sharedTargets");
  objectValue(manifest.dependencyOwners, "Manifest dependencyOwners");
  for (const [qualifiedId, rawItem] of Object.entries(items)) {
    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*:[a-z0-9]+(?:-[a-z0-9]+)*$/u.test(qualifiedId)) {
      throw new CliError("The provenance manifest contains an invalid item identity.", {
        code: "MANIFEST_ITEM_INVALID",
        exitCode: 3,
        target: MANIFEST_PATH,
      });
    }
    const item = objectValue(rawItem, `Manifest item ${qualifiedId}`);
    if (distributionFields.length === DISTRIBUTION_MANIFEST_KEYS.length) {
      exactKeys(
        item,
        [
          "registry",
          "itemId",
          "kind",
          "requested",
          "resolved",
          "releaseRef",
          "payload",
          "mode",
          "direct",
          "transformContextDigest",
          "transformContext",
          "files",
          "packageClaims",
          "importSubpaths",
          "registryDependencies",
          "dependencies",
          "structuredPatches",
          "contractVersion",
          "lastMigration",
        ],
        `Manifest item ${qualifiedId}`,
      );
      const transform = objectValue(
        item.transformContext,
        `Manifest item ${qualifiedId} transform context`,
      );
      if (
        typeof item.transformContextDigest !== "string" ||
        !/^sha256:[a-f0-9]{64}$/u.test(item.transformContextDigest) ||
        sha256(canonicalJson(transform)) !== item.transformContextDigest
      ) {
        throw manifestError(
          `Manifest item ${qualifiedId} transform context digest is invalid.`,
          "MANIFEST_DISTRIBUTION_TRANSFORM_INVALID",
        );
      }
      exactKeys(
        transform,
        ["targets", "aliases", "styling"],
        `Manifest item ${qualifiedId} transform context`,
      );
      const targets = objectValue(
        transform.targets,
        `Manifest item ${qualifiedId} transform targets`,
      );
      const transformKeys = new Set([
        "components",
        "hooks",
        "lib",
        "systems",
        "kits",
        "styles",
        "tokens",
      ]);
      for (const [key, target] of Object.entries(targets)) {
        if (!transformKeys.has(key)) {
          throw manifestError(
            `Manifest item ${qualifiedId} has an unknown transform target.`,
            "MANIFEST_DISTRIBUTION_TRANSFORM_INVALID",
          );
        }
        if (typeof target !== "string") {
          throw manifestError(
            `Manifest item ${qualifiedId} has a non-string transform target.`,
            "MANIFEST_DISTRIBUTION_TRANSFORM_INVALID",
          );
        }
        assertPortableRelativePath(target, "Manifest transform target");
      }
      const aliases = objectValue(
        transform.aliases,
        `Manifest item ${qualifiedId} transform aliases`,
      );
      for (const [key, alias] of Object.entries(aliases)) {
        if (
          !transformKeys.has(key) ||
          typeof alias !== "string" ||
          alias.length === 0 ||
          alias.length > 256 ||
          alias !== alias.trim() ||
          /^(?:[A-Za-z]:[\\/]|[\\/]{1,2})/u.test(alias) ||
          alias.includes("\\") ||
          [...alias].some((character) => {
            const point = character.codePointAt(0)!;
            return point <= 31 || point === 127;
          })
        ) {
          throw manifestError(
            `Manifest item ${qualifiedId} has an unsafe transform alias.`,
            "MANIFEST_DISTRIBUTION_TRANSFORM_INVALID",
          );
        }
      }
      const styling = objectValue(
        transform.styling,
        `Manifest item ${qualifiedId} transform styling`,
      );
      exactKeys(
        styling,
        ["engine", "tokenPreset", "density", "direction"],
        `Manifest item ${qualifiedId} transform styling`,
      );
      if (
        styling.engine !== "tailwind-v4" ||
        typeof styling.tokenPreset !== "string" ||
        styling.tokenPreset.length === 0 ||
        styling.tokenPreset.length > 128 ||
        !["comfortable", "compact", "touch"].includes(String(styling.density)) ||
        !["ltr", "rtl", "auto"].includes(String(styling.direction))
      ) {
        throw manifestError(
          `Manifest item ${qualifiedId} has an invalid transform styling context.`,
          "MANIFEST_DISTRIBUTION_TRANSFORM_INVALID",
        );
      }
      if (!Array.isArray(item.structuredPatches)) {
        throw manifestError(
          `Manifest item ${qualifiedId} patches must be an array.`,
          "MANIFEST_DISTRIBUTION_TRANSFORM_INVALID",
        );
      }
      for (const [index, rawPatch] of item.structuredPatches.entries()) {
        exactKeys(
          objectValue(rawPatch, `Manifest patch ${index} for ${qualifiedId}`),
          ["id", "adapter", "target", "semanticKey", "ownedValueDigest"],
          `Manifest patch ${index} for ${qualifiedId}`,
        );
      }
    } else {
      exactKeys(
        item,
        [
          "registry",
          "itemId",
          "kind",
          "requested",
          "resolved",
          "payload",
          "mode",
          "direct",
          "transformContextDigest",
          "transformContext",
          "files",
          "registryDependencies",
          "dependencies",
          "structuredPatches",
          "contractVersion",
          "lastMigration",
        ],
        `Manifest item ${qualifiedId}`,
      );
    }
    if (
      !Array.isArray(item.files) ||
      !Array.isArray(item.registryDependencies) ||
      !Array.isArray(item.structuredPatches) ||
      typeof item.itemId !== "string" ||
      (item.mode !== "source" &&
        !(
          distributionFields.length === DISTRIBUTION_MANIFEST_KEYS.length && item.mode === "package"
        )) ||
      typeof item.direct !== "boolean"
    ) {
      throw new CliError(`Manifest item ${qualifiedId} is invalid.`, {
        code: "MANIFEST_ITEM_INVALID",
        exitCode: 3,
        target: MANIFEST_PATH,
      });
    }
    for (const rawFile of item.files) {
      const file = objectValue(rawFile, `Manifest file for ${qualifiedId}`);
      if (
        typeof file.target !== "string" ||
        typeof file.base !== "string" ||
        !/^sha256:[a-f0-9]{64}$/u.test(file.base)
      ) {
        throw new CliError(`Manifest file for ${qualifiedId} is invalid.`, {
          code: "MANIFEST_FILE_INVALID",
          exitCode: 3,
          target: MANIFEST_PATH,
        });
      }
      assertPortableRelativePath(file.target, "Manifest target");
    }
  }
  const value = manifest as unknown as ProvenanceManifest;
  distributionProvenanceFromManifest(value);
  return value;
}

export function parseManifestBytes(bytes: Uint8Array): ProvenanceManifest {
  let raw: unknown;
  try {
    raw = JSON.parse(Buffer.from(bytes).toString("utf8")) as unknown;
  } catch {
    throw new CliError("The provenance manifest is not valid JSON.", {
      code: "MANIFEST_INVALID_JSON",
      exitCode: 3,
      target: MANIFEST_PATH,
    });
  }
  return validateManifestDocument(raw);
}

export function readManifest(root: string): {
  readonly value: ProvenanceManifest;
  readonly bytes: Buffer;
} {
  const bytes = readRequiredProjectFile(root, MANIFEST_PATH, "The provenance manifest is missing.");
  const value = parseManifestBytes(bytes);
  return { value, bytes };
}

export function readProjectFile(root: string, target: string): Buffer | null {
  assertPortableRelativePath(target, "Project target");
  assertNoSymlinkAncestors(root, target);
  const path = resolve(root, ...target.split("/"));
  if (!existsSync(path)) return null;
  const bytes = readRequiredProjectFile(root, target, `Project target ${target} is unavailable.`);
  return bytes;
}

function readRequiredProjectFile(root: string, target: string, message: string): Buffer {
  assertPortableRelativePath(target, "Project target");
  assertNoSymlinkAncestors(root, target);
  const path = resolve(root, ...target.split("/"));
  if (!existsSync(path)) {
    throw new CliError(message, { code: "PROJECT_FILE_MISSING", exitCode: 3, target });
  }
  const metadata = lstatSync(path);
  if (metadata.isSymbolicLink() || !metadata.isFile()) {
    throw new CliError(`Project target ${JSON.stringify(target)} is not a regular file.`, {
      code: "PROJECT_FILE_UNSAFE",
      exitCode: 5,
      target,
    });
  }
  let descriptor: number | null = null;
  try {
    descriptor = openSync(
      path,
      process.platform === "win32" ? constants.O_RDONLY : constants.O_RDONLY | constants.O_NOFOLLOW,
    );
    const opened = fstatSync(descriptor);
    const current = lstatSync(path);
    if (
      !opened.isFile() ||
      current.isSymbolicLink() ||
      !current.isFile() ||
      opened.dev !== current.dev ||
      opened.ino !== current.ino
    ) {
      throw new CliError(`Project target ${JSON.stringify(target)} changed during inspection.`, {
        code: "PROJECT_FILE_UNSAFE",
        exitCode: 5,
        target,
      });
    }
    return readFileSync(descriptor);
  } finally {
    if (descriptor !== null) closeSync(descriptor);
  }
}

function cloneManifest(manifest: ProvenanceManifest): ProvenanceManifest {
  return structuredClone(manifest);
}

function sortedRecord<T>(record: Readonly<Record<string, T>>): Record<string, T> {
  return Object.fromEntries(
    Object.entries(record).sort(([left], [right]) => left.localeCompare(right, "en-US")),
  );
}

export function normalizedManifest(manifest: ProvenanceManifest): ProvenanceManifest {
  const items: Record<string, ManifestItem> = Object.fromEntries(
    Object.entries(manifest.items)
      .sort(([left], [right]) => left.localeCompare(right, "en-US"))
      .map(([id, item]) => [
        id,
        {
          ...item,
          files: [...item.files].sort((left, right) =>
            left.target.localeCompare(right.target, "en-US"),
          ),
          registryDependencies: portableSort(item.registryDependencies),
          dependencies: {
            runtime: sortedRecord(item.dependencies.runtime),
            development: sortedRecord(item.dependencies.development),
          },
          structuredPatches: [...item.structuredPatches].sort((left, right) =>
            left.id.localeCompare(right.id, "en-US"),
          ),
          ...(item.releaseRef === undefined ? {} : { releaseRef: item.releaseRef }),
          ...(item.packageClaims === undefined
            ? {}
            : { packageClaims: [...portableSort(item.packageClaims)] }),
          ...(item.importSubpaths === undefined
            ? {}
            : { importSubpaths: [...portableSort(item.importSubpaths)] }),
        },
      ]),
  );
  const normalized: ProvenanceManifest = {
    $schema: manifest.$schema,
    schemaVersion: 1,
    projectId: manifest.projectId,
    toolchain: manifest.toolchain,
    items,
    sharedTargets: Object.fromEntries(
      Object.entries(manifest.sharedTargets)
        .sort(([left], [right]) => left.localeCompare(right, "en-US"))
        .map(([target, owners]) => [target, [...portableSort(owners)]]),
    ),
    dependencyOwners: Object.fromEntries(
      Object.entries(manifest.dependencyOwners)
        .sort(([left], [right]) => left.localeCompare(right, "en-US"))
        .map(([dependency, owners]) => [dependency, [...portableSort(owners)]]),
    ),
  };
  const distribution = distributionProvenanceFromManifest(manifest);
  if (distribution === null) return normalized;
  const distributionItems = Object.fromEntries(
    Object.entries(items).map(([id, item]) => {
      const projected = distribution.state.items[id]!;
      return [
        id,
        {
          ...item,
          releaseRef: projected.releaseRef,
          mode: projected.mode,
          files: projected.files,
          packageClaims: projected.packageClaims,
          importSubpaths: projected.importSubpaths,
          registryDependencies: projected.registryDependencies,
          dependencies: projected.dependencies,
          structuredPatches: projected.structuredPatches.map((patch) => ({ ...patch })),
        },
      ];
    }),
  );
  return {
    $schema: normalized.$schema,
    schemaVersion: 1,
    projectId: normalized.projectId,
    configDigest: distribution.state.configDigest,
    defaultMode: distribution.state.defaultMode,
    packageName: distribution.state.packageName,
    toolchain: normalized.toolchain,
    releases: distribution.state.releases,
    items: distributionItems,
    sharedTargets: normalized.sharedTargets,
    dependencyOwners: normalized.dependencyOwners,
    dependencyOwnership: distribution.state.dependencyOwnership,
    patchOwnership: distribution.state.patchOwnership,
  };
}

export function manifestBytes(manifest: ProvenanceManifest): Buffer {
  return Buffer.from(`${JSON.stringify(normalizedManifest(manifest), null, 2)}\n`);
}

export function digestOrNull(bytes: Uint8Array | null): `sha256:${string}` | null {
  return bytes === null ? null : sha256(bytes);
}

export function basePath(digest: `sha256:${string}`): string {
  const hexadecimal = digest.slice("sha256:".length);
  return `.mergora/bases/sha256/${hexadecimal.slice(0, 2)}/${hexadecimal.slice(2)}.blob`;
}

function qualified(itemId: string): string {
  return `official:${itemId}`;
}

function payloadUrl(itemId: string): string {
  return `${OFFICIAL_REGISTRY_ORIGIN}/releases/${UNRELEASED_VERSION}/items/${itemId}.json`;
}

function acquiredSourceContext(release: AcquiredNativeRegistryRelease): AcquiredSourceContext {
  if (release.registry.id !== "official") {
    throw new CliError(
      "Source ownership currently supports acquired releases in the official namespace only.",
      { code: "SOURCE_REGISTRY_NAMESPACE_UNSUPPORTED", exitCode: 7 },
    );
  }
  const items = release.items.map((item): SourceItemRecord => {
    if (
      item.structuredPatches.length > 0 ||
      item.migrations.length > 0 ||
      Object.keys(item.dependencies.development).length > 0
    ) {
      throw new CliError(
        `Acquired item ${item.itemId} requires a declarative patch, migration, or development-dependency adapter that source add does not yet implement.`,
        { code: "SOURCE_ACQUIRED_ADAPTER_UNSUPPORTED", exitCode: 7, target: item.itemId },
      );
    }
    const files = item.files.map((file): SourceFileRecord => {
      if (
        file.encoding !== "utf8" ||
        file.targetRole === "contract" ||
        file.targetRole === "example" ||
        file.transformPipeline.some(({ adapter }) => adapter !== "none" && adapter !== "target-map")
      ) {
        throw new CliError(
          `Acquired file ${file.logicalPath} needs an unsupported binary, role, or transform adapter.`,
          { code: "SOURCE_ACQUIRED_ADAPTER_UNSUPPORTED", exitCode: 7, target: file.logicalPath },
        );
      }
      const bytes = Buffer.from(file.content, "utf8");
      if (bytes.byteLength !== file.bytes || sha256(bytes) !== file.digest) {
        throw new CliError(`Acquired file ${file.logicalPath} changed after verification.`, {
          code: "REGISTRY_ITEM_DIGEST_INVALID",
          exitCode: 5,
          target: file.logicalPath,
        });
      }
      return {
        content: file.content,
        executable: false,
        logicalPath: file.logicalPath,
        mediaType: file.mediaType,
        targetPath: file.logicalPath,
        targetRole: file.targetRole,
      };
    });
    const installDependencies = Object.fromEntries(
      Object.entries(item.dependencies.runtime).filter(
        ([name]) => name !== "react" && name !== "react-dom",
      ),
    );
    return {
      itemId: item.itemId,
      title: item.title,
      description: item.description,
      kind: item.kind,
      visibleStatus: item.maturity,
      implementationStatus: "released",
      files,
      registryDependencies: item.registryDependencies.map((dependency) =>
        dependency.slice("official:".length),
      ),
      runtimeDependencies: item.dependencies.runtime,
      installDependencies,
      blockers: [],
      packageImport: item.importPaths[0] ?? null,
      packageStyleImport: null,
      associations: { contract: item.contract.id, passport: item.passport.id },
      payloadDigest: item.payloadDigest,
    };
  });
  return {
    release,
    sources: items,
    sourceById: new Map(items.map((item) => [item.itemId, item])),
    itemById: new Map(release.items.map((item) => [item.itemId, item])),
  };
}

function acquiredAlias(input: string, context: AcquiredSourceContext): string {
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/u.test(input)) {
    throw new CliError(`Item reference ${JSON.stringify(input)} is invalid.`, {
      code: "ITEM_REFERENCE_INVALID",
      exitCode: 2,
    });
  }
  return context.release.aliases[input] ?? input;
}

function acquiredClosure(
  requested: readonly string[],
  context: AcquiredSourceContext,
): readonly SourceItemRecord[] {
  const result: SourceItemRecord[] = [];
  const visited = new Set<string>();
  const active = new Set<string>();
  const visit = (input: string): void => {
    const id = acquiredAlias(input, context);
    if (active.has(id)) {
      throw new CliError(`Acquired source dependency cycle includes ${id}.`, {
        code: "ITEM_DEPENDENCY_CYCLE",
        exitCode: 5,
      });
    }
    if (visited.has(id)) return;
    const item = context.sourceById.get(id);
    if (item === undefined) {
      throw new CliError(
        `Acquired release did not include source item ${JSON.stringify(input)} in its verified closure.`,
        { code: "REGISTRY_ITEM_NOT_ACQUIRED", exitCode: 4, target: id },
      );
    }
    active.add(id);
    item.registryDependencies.forEach(visit);
    active.delete(id);
    visited.add(id);
    result.push(item);
  };
  [...new Set(requested)].sort((left, right) => left.localeCompare(right, "en-US")).forEach(visit);
  return result;
}

function acquiredDistributionRole(file: AcquiredNativeFile): ManifestFile["role"] {
  if (
    !(["component", "hook", "lib", "system", "kit", "style", "token"] as const).includes(
      file.targetRole as never,
    )
  ) {
    throw new CliError(
      `Acquired file ${file.logicalPath} has no supported distribution source role.`,
      { code: "SOURCE_ACQUIRED_ADAPTER_UNSUPPORTED", exitCode: 7, target: file.logicalPath },
    );
  }
  return file.targetRole as ManifestFile["role"];
}

function acquiredDistributionTarget(
  itemId: string,
  file: AcquiredNativeFile,
  context: ManifestItem["transformContext"],
): string {
  const role = acquiredDistributionRole(file);
  const targetKey =
    role === "hook"
      ? "hooks"
      : role === "lib"
        ? "lib"
        : role === "system"
          ? "systems"
          : role === "kit"
            ? "kits"
            : role === "style"
              ? "styles"
              : role === "token"
                ? "tokens"
                : "components";
  const root = context.targets[targetKey];
  if (root === undefined) {
    throw new CliError(`Transform context has no target for acquired ${role} files.`, {
      code: "SOURCE_ACQUIRED_TARGET_INVALID",
      exitCode: 5,
      target: file.logicalPath,
    });
  }
  assertSourceRoot(root);
  const sourceSegments = file.logicalPath.split("/");
  const relativeSegments =
    sourceSegments[1] === itemId ? sourceSegments.slice(2) : sourceSegments.slice(1);
  if (relativeSegments.length === 0) {
    throw new CliError(`Acquired file ${file.logicalPath} has no target-relative path.`, {
      code: "SOURCE_ACQUIRED_TARGET_INVALID",
      exitCode: 5,
      target: file.logicalPath,
    });
  }
  const target = `${root}/${itemId}/${relativeSegments.join("/")}`;
  assertPortableRelativePath(target, "Acquired distribution source target");
  return target;
}

/**
 * Derives exact package-to-source materialization only from a resolver-branded release and the
 * persisted compiled transform context. Unsupported transforms and project glue fail closed.
 */
export function deriveAcquiredDistributionSources(
  options: DeriveAcquiredDistributionSourcesOptions,
): readonly AcquiredDistributionSourceProjection[] {
  assertAuthenticAcquiredNativeRegistryRelease(options.acquiredRelease);
  const context = acquiredSourceContext(options.acquiredRelease);
  const selected = [...new Set(options.itemIds)].sort((left, right) =>
    left.localeCompare(right, "en-US"),
  );
  const expectedContexts = selected.map((id) => qualified(acquiredAlias(id, context)));
  if (
    canonicalJson(Object.keys(options.transformContexts).sort()) !==
    canonicalJson([...expectedContexts].sort())
  ) {
    throw new CliError("Acquired distribution transform contexts are incomplete or out of scope.", {
      code: "SOURCE_ACQUIRED_TARGET_INVALID",
      exitCode: 5,
      target: MANIFEST_PATH,
    });
  }
  const targets = new Set<string>();
  return selected.map((input): AcquiredDistributionSourceProjection => {
    const itemId = acquiredAlias(input, context);
    const qualifiedId = qualified(itemId);
    const acquired = context.itemById.get(itemId);
    if (acquired === undefined) {
      throw new CliError(`Authentic release did not acquire item ${itemId}.`, {
        code: "REGISTRY_ITEM_NOT_ACQUIRED",
        exitCode: 4,
        target: itemId,
      });
    }
    const transform = options.transformContexts[qualifiedId]!;
    if (sha256(canonicalJson(transform.value)) !== transform.digest) {
      throw new CliError(`Compiled transform context for ${qualifiedId} changed.`, {
        code: "SOURCE_ACQUIRED_TARGET_INVALID",
        exitCode: 5,
        target: MANIFEST_PATH,
      });
    }
    const files = acquired.files
      .map((file): AcquiredDistributionSourceFile => {
        const bytes = Buffer.from(file.content, file.encoding === "utf8" ? "utf8" : "base64");
        if (
          file.executable !== false ||
          file.transformPipeline.some(
            ({ adapter }) => adapter !== "none" && adapter !== "target-map",
          ) ||
          bytes.byteLength !== file.bytes ||
          sha256(bytes) !== file.digest
        ) {
          throw new CliError(
            `Acquired source ${file.logicalPath} requires an unsupported transform or changed after verification.`,
            {
              code: "SOURCE_ACQUIRED_ADAPTER_UNSUPPORTED",
              exitCode: 7,
              target: file.logicalPath,
            },
          );
        }
        const target = acquiredDistributionTarget(itemId, file, transform.value);
        const portable = target.normalize("NFC").toLocaleLowerCase("en-US");
        if (targets.has(portable)) {
          throw new CliError(`Acquired distribution source target ${target} collides.`, {
            code: "SOURCE_TARGET_COLLISION",
            exitCode: 5,
            target,
          });
        }
        targets.add(portable);
        return {
          logicalPath: file.logicalPath,
          target,
          role: acquiredDistributionRole(file),
          mediaType: file.mediaType,
          digest: file.digest,
          bytes,
        };
      })
      .sort((left, right) => left.target.localeCompare(right.target, "en-US"));
    const dependencies = {
      runtime: sortedRecord(acquired.dependencies.runtime),
      development: sortedRecord(acquired.dependencies.development),
    };
    const structuredPatches = Object.entries(acquired.dependencies.runtime)
      .filter(([name]) => name !== "react" && name !== "react-dom")
      .map(([name, range]): Required<ManifestPatch> => ({
        id: dependencyPatchId(name),
        adapter: "package-dependency",
        target: "package.json",
        semanticKey: `dependencies.${name}`,
        ownedValueDigest: sha256(range),
      }))
      .sort((left, right) => left.id.localeCompare(right.id, "en-US"));
    return {
      qualifiedId,
      releaseRef: `${options.acquiredRelease.registry.id}@${options.acquiredRelease.release}`,
      itemId,
      kind: acquired.kind,
      resolved: acquired.version,
      payload: { url: acquired.payloadUrl, digest: acquired.payloadDigest },
      files,
      registryDependencies: [...acquired.registryDependencies].sort(),
      dependencies,
      structuredPatches,
      packageImportSubpaths: [...acquired.importPaths].sort((left, right) =>
        left.localeCompare(right, "en-US"),
      ),
      contractVersion: acquired.contract.version,
    };
  });
}

function assertSourceRoot(value: string): string {
  const segments = assertPortableRelativePath(value, "Source target root");
  if (
    segments.some((segment) => {
      const portable = segment.normalize("NFC").toLocaleLowerCase("en-US");
      return portable === ".mergora" || portable === "node_modules";
    })
  ) {
    throw new CliError(
      "Source targets cannot overlap Mergora transaction/provenance data or dependency caches.",
      { code: "SOURCE_TARGET_RESERVED", exitCode: 5, target: value },
    );
  }
  return value;
}

function itemRoot(
  item: SourceItemRecord,
  config: MergoraConfig,
  targetDirectory: string | undefined,
): string {
  if (targetDirectory !== undefined) {
    return assertSourceRoot(targetDirectory);
  }
  return assertSourceRoot(
    item.kind === "system" ? config.targets.systems : config.targets.components,
  );
}

function mapFiles(
  item: SourceItemRecord,
  config: MergoraConfig,
  targetDirectory: string | undefined,
  acquired?: AcquiredSourceContext | undefined,
): readonly MappedSourceFile[] {
  const root = itemRoot(item, config, targetDirectory);
  const mapped = item.files
    .map((source) => {
      const bytes = Buffer.from(source.content);
      const role = (
        ["component", "hook", "lib", "system", "kit", "style", "token"] as const
      ).includes(source.targetRole as never)
        ? (source.targetRole as ManifestFile["role"])
        : item.kind === "system"
          ? "system"
          : "component";
      const acquiredRoot =
        targetDirectory ??
        (role === "hook"
          ? config.targets.hooks
          : role === "lib"
            ? config.targets.lib
            : role === "system"
              ? config.targets.systems
              : role === "kit"
                ? config.targets.kits
                : role === "style"
                  ? config.targets.styles
                  : role === "token"
                    ? config.targets.tokens
                    : config.targets.components);
      const sourceSegments = source.logicalPath.split("/");
      const relativeSegments =
        acquired !== undefined && sourceSegments[1] === item.itemId
          ? sourceSegments.slice(2)
          : acquired !== undefined
            ? sourceSegments.slice(1)
            : [source.targetPath.split("/").at(-1)!];
      if (relativeSegments.length === 0) {
        throw new CliError(`Acquired file ${source.logicalPath} has no target-relative path.`, {
          code: "SOURCE_ACQUIRED_TARGET_INVALID",
          exitCode: 5,
          target: source.logicalPath,
        });
      }
      const target = `${
        acquired === undefined ? root : assertSourceRoot(acquiredRoot)
      }/${item.itemId}/${relativeSegments.join("/")}`;
      assertPortableRelativePath(target, "Rendered source target");
      const logicalRoot =
        role === "system"
          ? "systems"
          : role === "hook"
            ? "hooks"
            : role === "lib"
              ? "lib"
              : role === "kit"
                ? "kits"
                : role === "token"
                  ? "tokens"
                  : "ui";
      return {
        source,
        target,
        logicalPath:
          acquired === undefined
            ? `${logicalRoot}/${item.itemId}/${relativeSegments.at(-1)!}`
            : source.logicalPath,
        role,
        bytes,
        digest: sha256(bytes),
      } satisfies MappedSourceFile;
    })
    .sort((left, right) => left.target.localeCompare(right.target, "en-US"));
  const targets = new Set<string>();
  for (const file of mapped) {
    const key = file.target.normalize("NFC").toLocaleLowerCase("en-US");
    if (targets.has(key)) {
      throw new CliError(`Source item ${item.itemId} maps more than one file to ${file.target}.`, {
        code: "SOURCE_TARGET_COLLISION",
        exitCode: 5,
        target: file.target,
      });
    }
    targets.add(key);
  }
  return mapped;
}

function transformContext(
  config: MergoraConfig,
  targetDirectory?: string | undefined,
  acquired = false,
) {
  const targets = {
    ...config.targets,
    ...(targetDirectory === undefined
      ? {}
      : acquired
        ? {
            components: targetDirectory,
            hooks: targetDirectory,
            lib: targetDirectory,
            systems: targetDirectory,
            kits: targetDirectory,
            styles: targetDirectory,
            tokens: targetDirectory,
          }
        : { components: targetDirectory, systems: targetDirectory }),
  };
  return {
    targets: sortedRecord(targets),
    aliases: sortedRecord(config.aliases),
    styling: {
      engine: "tailwind-v4" as const,
      tokenPreset: config.styling.tokenPreset,
      density: config.styling.density,
      direction: config.styling.direction,
    },
  };
}

function manifestItem(
  source: SourceItemRecord,
  files: readonly MappedSourceFile[],
  config: MergoraConfig,
  direct: boolean,
  installedDigests?: Readonly<Record<string, `sha256:${string}`>>,
  targetDirectory?: string | undefined,
  acquired?: AcquiredSourceContext | undefined,
): ManifestItem {
  const context = transformContext(config, targetDirectory, acquired !== undefined);
  const acquiredItem = acquired?.itemById.get(source.itemId);
  const kind = (
    ["component", "system", "hook", "utility", "kit", "theme", "contract"] as const
  ).includes(source.kind as never)
    ? (source.kind as ManifestItem["kind"])
    : "component";
  const resolved = acquired?.release.release ?? UNRELEASED_VERSION;
  return {
    registry: "official",
    itemId: source.itemId,
    kind,
    requested: `=${resolved}`,
    resolved,
    payload: {
      url: acquiredItem?.payloadUrl ?? payloadUrl(source.itemId),
      digest: source.payloadDigest,
    },
    mode: "source",
    direct,
    transformContextDigest: sha256(canonicalJson(context)),
    transformContext: context,
    files: files.map((file) => ({
      logicalPath: file.logicalPath,
      target: file.target,
      role: file.role,
      base: file.digest,
      installed: installedDigests?.[file.target] ?? file.digest,
      mediaType: file.source.mediaType,
      executable: false,
    })),
    registryDependencies: source.registryDependencies
      .map(qualified)
      .sort((left, right) => left.localeCompare(right, "en-US")),
    dependencies: {
      runtime: sortedRecord(source.runtimeDependencies),
      development: {},
    },
    structuredPatches: [],
    contractVersion: acquiredItem?.contract.version ?? UNRELEASED_VERSION,
    lastMigration: null,
  };
}

function dependencyPatchId(name: string): string {
  const normalized = name
    .replace(/^@/u, "")
    .replaceAll("/", "-")
    .replace(/[^a-z0-9._-]+/gu, "-")
    .replace(/[._]+/gu, "-")
    .replace(/-+/gu, "-")
    .replace(/^-|-$/gu, "");
  return `dependency-${normalized}`;
}

function packagePatch(item: ManifestItem, name: string, range: string): ManifestPatch {
  return {
    id: dependencyPatchId(name),
    adapter: "package-dependency",
    target: "package.json",
    semanticKey: `dependencies.${name}`,
    ownedValueDigest: sha256(range),
  };
}

function dependencyOwners(items: Readonly<Record<string, ManifestItem>>): Record<string, string[]> {
  const owners: Record<string, string[]> = {};
  for (const [itemId, item] of Object.entries(items)) {
    for (const name of Object.keys(item.dependencies.runtime)) {
      if (name === "react" || name === "react-dom") continue;
      const key = `runtime:${name}`;
      (owners[key] ??= []).push(itemId);
    }
  }
  return Object.fromEntries(
    Object.entries(owners)
      .sort(([left], [right]) => left.localeCompare(right, "en-US"))
      .map(([key, values]) => [key, [...portableSort(values)]]),
  );
}

function rebuildSharedTargets(manifest: ProvenanceManifest): void {
  const patchIds = Object.values(manifest.items)
    .flatMap((item) => item.structuredPatches)
    .filter(({ adapter }) => adapter === "package-dependency")
    .map(({ id }) => id);
  manifest.sharedTargets =
    patchIds.length === 0 ? {} : { "package.json": portableSort(patchIds) as string[] };
  manifest.dependencyOwners = dependencyOwners(manifest.items);
}

function registryPlan(
  items: readonly SourceItemRecord[],
  acquired?: AcquiredSourceContext | undefined,
): OperationPlan["registries"] {
  if (items.length === 0) return [];
  if (acquired !== undefined) {
    const evidenceTiers = acquired.release.items.map(
      (item) =>
        acquired.release.catalog.find(({ id }) => id === item.itemId)?.quality.tier ??
        "not-supplied",
    );
    const evidenceTier: OperationPlan["registries"][number]["evidenceTier"] = evidenceTiers.every(
      (tier) => tier === "complete",
    )
      ? "complete"
      : evidenceTiers.some((tier) => tier === "complete" || tier === "partial")
        ? "partial"
        : "not-supplied";
    return [
      {
        id: acquired.release.registry.id,
        identityDigest: acquired.release.registry.identityDigest,
        release: acquired.release.release,
        manifestDigest: acquired.release.manifestDigest,
        source: acquired.release.source,
        trust: acquired.release.registry.trust,
        evidenceTier,
      },
    ];
  }
  const identity = {
    id: "official",
    protocol: "mergora-v1",
    origin: OFFICIAL_REGISTRY_ORIGIN,
    trust: "official",
  };
  return [
    {
      id: "official",
      identityDigest: sha256(canonicalJson(identity)),
      release: UNRELEASED_VERSION,
      manifestDigest: sha256(
        canonicalJson(
          items
            .map(({ itemId, payloadDigest }) => ({ itemId, payloadDigest }))
            .sort((left, right) => left.itemId.localeCompare(right.itemId, "en-US")),
        ),
      ),
      source: "verified-cache",
      trust: "official",
      evidenceTier: "not-supplied",
    },
  ];
}

function registryPayloads(
  items: readonly SourceItemRecord[],
  acquired?: AcquiredSourceContext | undefined,
): readonly TransactionRegistryPayload[] {
  return items
    .map((item) => {
      const acquiredItem = acquired?.itemById.get(item.itemId);
      return {
        registry: acquired?.release.registry.id ?? "official",
        release: acquired?.release.release ?? UNRELEASED_VERSION,
        url: acquiredItem?.payloadUrl ?? payloadUrl(item.itemId),
        digest: item.payloadDigest,
      };
    })
    .sort((left, right) => left.url.localeCompare(right.url, "en-US"));
}

function sourcePlanItems(
  items: readonly SourceItemRecord[],
  directIds: ReadonlySet<string>,
  from: Readonly<Record<string, ManifestItem>>,
  removing: ReadonlySet<string> = new Set(),
  acquired?: AcquiredSourceContext | undefined,
): readonly OperationPlanItem[] {
  const resolved = acquired?.release.release ?? UNRELEASED_VERSION;
  return items
    .map((item) => ({
      id: qualified(item.itemId),
      direct: directIds.has(item.itemId),
      requested: `=${resolved}`,
      fromVersion: from[qualified(item.itemId)]?.resolved ?? null,
      toVersion: removing.has(qualified(item.itemId)) ? null : resolved,
      mode: "source" as const,
    }))
    .sort((left, right) => left.id.localeCompare(right.id, "en-US"));
}

function readConfiguredOwnership(options: SourceOperationOptions) {
  const root = validatedProjectRoot(options.projectRoot);
  const config = readMergoraConfig(root);
  if (config === null) {
    throw new CliError("Mergora is not initialized; run mergora init before this operation.", {
      code: "CONFIG_MISSING",
      exitCode: 3,
      target: "mergora.json",
    });
  }
  const manifest = readManifest(root);
  return { root, config, manifest };
}

function readConfiguredProject(
  options: SourceOperationOptions,
  configured = readConfiguredOwnership(options),
) {
  const { root, config, manifest } = configured;
  const inspection = inspectProject(root, {
    framework: config.project.framework,
    sourceRoot: config.project.sourceRoot,
    globalCss: config.styling.globalCss,
    aliasPrefix: mergoraConfigAliasPrefix(config),
    packageManager: options.packageManager,
  });
  return { root, config, manifest, inspection };
}

function requestedCanonicalIds(
  options: SourceOperationOptions,
  acquired?: AcquiredSourceContext | undefined,
): readonly string[] {
  if (options.itemIds.length === 0) {
    throw new CliError(
      `${options.itemIds.length === 0 ? "Operation" : "Command"} requires an item.`,
      {
        code: "ITEM_REQUIRED",
        exitCode: 2,
      },
    );
  }
  return [
    ...new Set(
      options.itemIds.map((id) =>
        acquired === undefined ? resolveItemAlias(id, options) : acquiredAlias(id, acquired),
      ),
    ),
  ].sort((left, right) => left.localeCompare(right, "en-US"));
}

function mutation(
  root: string,
  target: string,
  content: Buffer | null,
  manifest = false,
): TransactionMutation {
  return {
    target,
    content,
    beforeDigest: digestOrNull(readProjectFile(root, target)),
    ...(manifest ? { manifest: true } : {}),
  };
}

function sourceProjectValidator(
  expectedConfig: MergoraConfig,
  expectedManifest: ProvenanceManifest,
): TransactionValidator {
  const expectedConfigDocument = canonicalJson(expectedConfig);
  const expectedContexts = Object.fromEntries(
    Object.entries(expectedManifest.items).map(([id, item]) => [
      id,
      {
        digest: item.transformContextDigest,
        document: canonicalJson(item.transformContext),
      },
    ]),
  );
  const validate = (context: TransactionValidationContext): TransactionValidationResult => {
    const issues: TransactionValidationIssue[] = [];
    const configBytes = context.readFile("mergora.json");
    if (configBytes === null) {
      issues.push({
        code: "CONFIG_MISSING",
        target: "mergora.json",
        message: "The transaction view has no project configuration.",
      });
    } else {
      try {
        const raw = JSON.parse(configBytes.toString("utf8")) as unknown;
        const config = validateMergoraConfig(raw);
        if (
          canonicalJson(config) !== expectedConfigDocument ||
          sha256(canonicalJson(raw)) !== context.plan.configDigest
        ) {
          issues.push({
            code: "PROJECT_CONFIG_MISMATCH",
            target: "mergora.json",
            message: "The project configuration differs from the exact reviewed transform input.",
          });
        }
      } catch (error) {
        issues.push({
          code: error instanceof CliError ? error.code : "CONFIG_INVALID_JSON",
          target: "mergora.json",
          message: "The project configuration does not satisfy the reviewed schema.",
        });
      }
    }

    const manifestBytes = context.readFile(MANIFEST_PATH);
    if (manifestBytes === null) {
      issues.push({
        code: "MANIFEST_MISSING",
        target: MANIFEST_PATH,
        message: "The source ownership manifest is missing from the transaction view.",
      });
    } else {
      try {
        const manifest = parseManifestBytes(manifestBytes);
        for (const [id, expected] of Object.entries(expectedContexts)) {
          const item = manifest.items[id];
          if (
            item === undefined ||
            item.transformContextDigest !== expected.digest ||
            sha256(canonicalJson(item.transformContext)) !== expected.digest ||
            canonicalJson(item.transformContext) !== expected.document
          ) {
            issues.push({
              code: "TRANSFORM_CONTEXT_MISMATCH",
              target: MANIFEST_PATH,
              message: `Transform context for ${id} differs from the reviewed project mapping.`,
            });
          }
        }
        const actualIds = Object.keys(manifest.items).sort();
        const expectedIds = Object.keys(expectedContexts).sort();
        if (canonicalJson(actualIds) !== canonicalJson(expectedIds)) {
          issues.push({
            code: "MANIFEST_ITEM_SET_MISMATCH",
            target: MANIFEST_PATH,
            message: "The source ownership item set differs from the reviewed post-state.",
          });
        }
      } catch (error) {
        issues.push({
          code: error instanceof CliError ? error.code : "MANIFEST_INVALID",
          target: MANIFEST_PATH,
          message: "The source ownership manifest does not satisfy the reviewed schema.",
        });
      }
    }
    return transactionValidationResult(
      `Validated exact project configuration and transform contexts in the ${context.phase} view.`,
      `Project configuration or transform-context validation failed in the ${context.phase} view.`,
      issues,
    );
  };
  return {
    id: "source-project-context",
    label: "project-configured",
    validateStagedOverlay: validate,
    validatePostCommit: validate,
  };
}

function sourceTransactionValidators(input: {
  readonly config: MergoraConfig;
  readonly manifest: ProvenanceManifest;
  readonly mutations: readonly TransactionMutation[];
  readonly fileOperations: readonly OperationPlanFile[];
}): readonly TransactionValidator[] {
  const mediaByTarget = new Map(
    input.fileOperations.map(({ target, mediaType }) => [target, mediaType]),
  );
  const files: TransactionMediaFile[] = input.mutations
    .filter(({ content }) => content !== null)
    .map(({ target }) => ({
      target,
      mediaType:
        target === MANIFEST_PATH || target === "package.json" || target === "mergora.json"
          ? "application/json"
          : (mediaByTarget.get(target) ?? "application/octet-stream"),
    }));
  return [
    createMediaParseValidator("source-media-parse", files),
    sourceProjectValidator(input.config, normalizedManifest(input.manifest)),
  ];
}

function validateSourcePlanOverlay(internal: InternalSourcePlan): InternalSourcePlan {
  validateTransactionOverlay({
    root: internal.root,
    plan: internal.publicPlan,
    mutations: internal.mutations,
    observedTargets: internal.observedTargets,
    validators: internal.validators,
  });
  return internal;
}

function operationPlan(
  command: "add" | "remove" | "adopt",
  context: {
    readonly configDigest: `sha256:${string}`;
    readonly manifestDigest: `sha256:${string}`;
    readonly items: readonly OperationPlanItem[];
    readonly sources: readonly SourceItemRecord[];
    readonly fileOperations: readonly OperationPlanFile[];
    readonly dependencyChanges: readonly OperationPlanDependencyChange[];
    readonly warnings: readonly string[];
    readonly conflicts: OperationPlan["conflicts"];
    readonly mutations: readonly TransactionMutation[];
    readonly structuredPatches?: OperationPlan["structuredPatches"] | undefined;
    readonly acquired?: AcquiredSourceContext | undefined;
    readonly validators: readonly TransactionValidator[];
  },
): OperationPlan {
  const files = [...context.fileOperations];
  const representedTargets = new Set(files.map(({ target }) => target));
  for (const mutation of context.mutations) {
    if (representedTargets.has(mutation.target)) continue;
    const proposed = digestOrNull(mutation.content);
    const matchingSource = files.find(
      (file) => file.remote === proposed || file.base === proposed || file.proposed === proposed,
    );
    const patchOwner = context.structuredPatches?.find(
      ({ target }) => target === mutation.target,
    )?.owner;
    const owner = matchingSource?.owner ?? patchOwner ?? context.items[0]?.id;
    if (owner === undefined) {
      throw new CliError(`Transaction metadata target ${mutation.target} has no item owner.`, {
        code: "PLAN_OWNER_MISSING",
        exitCode: 8,
        target: mutation.target,
      });
    }
    const direct = context.items.find(({ id }) => id === owner)?.direct === true;
    const metadataKind =
      mutation.target === MANIFEST_PATH
        ? "provenance manifest"
        : mutation.target.startsWith(".mergora/bases/")
          ? "immutable raw-byte base"
          : mutation.target === "package.json"
            ? "dependency declaration"
            : "structured project metadata";
    files.push({
      operation:
        mutation.content === null
          ? "delete"
          : mutation.beforeDigest === null
            ? "add"
            : "structured-patch",
      target: mutation.target,
      owner,
      base: mutation.beforeDigest,
      local: mutation.beforeDigest,
      remote: proposed,
      proposed,
      mediaType: mutation.target.endsWith(".json")
        ? "application/json"
        : mutation.target.endsWith(".blob")
          ? "application/octet-stream"
          : "text/plain",
      risk: mutation.content === null ? "destructive" : "ordinary",
      reason: `${direct ? "Directly requested" : "Transitive registry dependency"} ${metadataKind} required for recoverable ownership.`,
    });
    representedTargets.add(mutation.target);
  }
  return finalizeOperationPlan({
    schemaVersion: 1,
    command,
    cliVersion: "0.0.0",
    projectRoot: ".",
    configDigest: context.configDigest,
    manifestPreconditionDigest: context.manifestDigest,
    registries: registryPlan(context.sources, context.acquired),
    items: context.items,
    fileOperations: files.sort((left, right) => left.target.localeCompare(right.target, "en-US")),
    dependencyChanges: [...context.dependencyChanges].sort((left, right) =>
      left.package.localeCompare(right.package, "en-US"),
    ),
    structuredPatches: context.structuredPatches ?? [],
    migrations: [],
    contractChanges: [],
    warnings: context.warnings,
    consentRequirements: [
      {
        id: `${command}-source`,
        flag: "--yes",
        reason: `${command} changes source ownership or committed provenance.`,
      },
    ],
    conflicts: context.conflicts,
    estimatedBytes: {
      download: context.acquired?.release.acquiredBytes ?? 0,
      write: context.mutations.reduce(
        (total, entry) => total + (entry.content?.byteLength ?? 0),
        0,
      ),
    },
    validationSuite: validationSuiteForTransaction(context.validators),
    rollbackAvailable: true,
  });
}

function packageExecutionWarnings(
  options: SourceOperationOptions,
  manager: PackageManager,
  required: boolean,
): readonly string[] {
  if (!required) return [];
  if (options.noInstall === true) {
    return [
      `Dependency metadata will change, but --no-install will skip the detected ${manager} install and lockfile mutation.`,
    ];
  }
  return [
    `Dependency metadata changes will invoke detected ${manager} with lifecycle scripts disabled${options.offline === true ? " and offline resolution required" : ""}.`,
  ];
}

function assertPackageManagerTransactionScope(
  inspection: ProjectInspection,
  required: boolean,
  noInstall: boolean | undefined,
): void {
  if (
    required &&
    noInstall !== true &&
    inspection.packageManagerEvidence.some((entry) => entry.startsWith("workspace-lockfile:"))
  ) {
    throw new CliError(
      "The authoritative package-manager lockfile is outside the selected project root; use --no-install and run the workspace-root install separately.",
      { code: "PACKAGE_MANAGER_WORKSPACE_TRANSACTION_UNSUPPORTED", exitCode: 7 },
    );
  }
}

function validateExistingInstall(
  existing: ManifestItem,
  source: SourceItemRecord,
  config: MergoraConfig,
  targetDirectory?: string | undefined,
  acquired?: AcquiredSourceContext | undefined,
): void {
  const expectedContext = sha256(
    canonicalJson(transformContext(config, targetDirectory, acquired !== undefined)),
  );
  if (
    existing.payload.digest !== source.payloadDigest ||
    existing.resolved !== (acquired?.release.release ?? UNRELEASED_VERSION) ||
    existing.transformContextDigest !== expectedContext
  ) {
    throw new CliError(
      `Installed item ${source.itemId} has a different release or transform context; use the update planner.`,
      { code: "ITEM_UPDATE_REQUIRED", exitCode: 7, target: MANIFEST_PATH },
    );
  }
}

function dependencyRequirements(
  items: readonly SourceItemRecord[],
): Record<string, DependencyRequirement> {
  const requirements: Record<string, { range: string; owners: string[] }> = {};
  for (const item of items) {
    for (const [name, range] of Object.entries(item.installDependencies)) {
      const owner = qualified(item.itemId);
      const existing = requirements[name];
      if (existing !== undefined && existing.range !== range) {
        throw new CliError(`Registry items require incompatible ranges for ${name}.`, {
          code: "DEPENDENCY_REQUIREMENT_CONFLICT",
          exitCode: 7,
          target: "package.json",
        });
      }
      const requirement = (requirements[name] ??= { range, owners: [] });
      requirement.owners.push(owner);
    }
  }
  return Object.fromEntries(
    Object.entries(requirements).map(([name, requirement]) => [
      name,
      { range: requirement.range, owners: portableSort(requirement.owners) },
    ]),
  );
}

function addInternal(
  options: SourceOperationOptions,
  acquired?: AcquiredSourceContext | undefined,
): InternalSourcePlan {
  if (options.targetDirectory !== undefined) {
    assertPortableRelativePath(options.targetDirectory, "Source target root");
  }
  const project = readConfiguredProject(options);
  const requested = requestedCanonicalIds(options, acquired);
  const sources =
    acquired === undefined
      ? resolveSourceDependencyClosure(requested, options)
      : acquiredClosure(requested, acquired);
  const direct = new Set(requested);
  const nextManifest = cloneManifest(project.manifest.value);
  const mutations: TransactionMutation[] = [];
  const observedTargets: Record<string, `sha256:${string}` | null> = {};
  const fileOperations: OperationPlanFile[] = [];
  const conflicts: OperationPlan["conflicts"][number][] = [];
  const plannedBaseTargets = new Set<string>();
  const claimedTargets = new Map<string, string>();
  for (const [owner, item] of Object.entries(nextManifest.items)) {
    for (const file of item.files) claimedTargets.set(file.target, owner);
  }
  for (const source of sources) {
    const id = qualified(source.itemId);
    const existing = nextManifest.items[id];
    const files = mapFiles(source, project.config, options.targetDirectory, acquired);
    if (existing !== undefined) {
      if (existing.mode !== "source") {
        throw new CliError(
          `Installed item ${source.itemId} is package-owned; use an explicit mode migration before source add.`,
          {
            code: "DISTRIBUTION_MIXED_OWNERSHIP_CONFLICT",
            exitCode: 6,
            target: MANIFEST_PATH,
          },
        );
      }
      validateExistingInstall(existing, source, project.config, options.targetDirectory, acquired);
      if (direct.has(source.itemId)) existing.direct = true;
      for (const file of existing.files) {
        const local = digestOrNull(readProjectFile(project.root, file.target));
        const baseTarget = basePath(file.base);
        const baseBytes = readProjectFile(project.root, baseTarget);
        if (baseBytes === null || sha256(baseBytes) !== file.base) {
          throw new CliError(`Immutable base ${baseTarget} is missing or corrupt.`, {
            code: "BASE_DIGEST_MISMATCH",
            exitCode: 3,
            target: baseTarget,
          });
        }
        observedTargets[file.target] = local;
        observedTargets[baseTarget] = file.base;
        fileOperations.push({
          operation: "no-op",
          target: file.target,
          owner: id,
          base: file.base,
          local,
          remote: file.base,
          proposed: local,
          mediaType: file.mediaType,
          risk: "ordinary",
          reason: "The exact release and transform context are already installed.",
        });
      }
      continue;
    }
    const entry = manifestItem(
      source,
      files,
      project.config,
      direct.has(source.itemId),
      undefined,
      options.targetDirectory,
      acquired,
    );
    nextManifest.items[id] = entry;
    for (const file of files) {
      const owner = claimedTargets.get(file.target);
      const localBytes = readProjectFile(project.root, file.target);
      const local = digestOrNull(localBytes);
      observedTargets[file.target] = local;
      if (owner !== undefined || localBytes !== null) {
        conflicts.push({
          target: file.target,
          kind: "add-add",
          reason:
            owner === undefined
              ? "A local file exists without Mergora provenance; use adopt after verifying its upstream relationship."
              : `The target is already owned by ${owner}.`,
        });
        fileOperations.push({
          operation: "conflict",
          target: file.target,
          owner: id,
          base: null,
          local,
          remote: file.digest,
          proposed: null,
          mediaType: file.source.mediaType,
          risk: "conflict",
          reason: "Unproven local source cannot be overwritten.",
        });
        continue;
      }
      mutations.push(mutation(project.root, file.target, file.bytes));
      fileOperations.push({
        operation: "add",
        target: file.target,
        owner: id,
        base: null,
        local: null,
        remote: file.digest,
        proposed: file.digest,
        mediaType: file.source.mediaType,
        risk: "ordinary",
        reason: direct.has(source.itemId)
          ? "Directly requested canonical source."
          : `Transitive registry dependency required by ${requested.map(qualified).join(", ")}.`,
      });
      const baseTarget = basePath(file.digest);
      const baseBytes = readProjectFile(project.root, baseTarget);
      if (baseBytes !== null && sha256(baseBytes) !== file.digest) {
        throw new CliError(`Immutable base ${baseTarget} is corrupt.`, {
          code: "BASE_DIGEST_MISMATCH",
          exitCode: 3,
          target: baseTarget,
        });
      }
      observedTargets[baseTarget] = digestOrNull(baseBytes);
      if (baseBytes === null && !plannedBaseTargets.has(baseTarget)) {
        mutations.push(mutation(project.root, baseTarget, file.bytes));
        plannedBaseTargets.add(baseTarget);
      }
    }
  }

  const requirements = dependencyRequirements(sources);
  const packagePlan = planPackageDependencies(resolve(project.root, "package.json"), requirements);
  assertPackageManagerTransactionScope(
    project.inspection,
    packagePlan.after !== packagePlan.before,
    options.noInstall,
  );
  for (const change of packagePlan.changes) {
    if (change.operation !== "add") continue;
    const owner = change.owners[0]!;
    nextManifest.items[owner]!.structuredPatches.push(
      packagePatch(nextManifest.items[owner]!, change.package, change.to!),
    );
  }
  rebuildSharedTargets(nextManifest);
  if (packagePlan.after !== packagePlan.before) {
    mutations.push(mutation(project.root, "package.json", Buffer.from(packagePlan.after)));
  }
  const nextManifestBytes = manifestBytes(nextManifest);
  if (!nextManifestBytes.equals(project.manifest.bytes)) {
    mutations.push(mutation(project.root, MANIFEST_PATH, nextManifestBytes, true));
  }
  const blockedByConflict = conflicts.length > 0;
  const transactionMutations = blockedByConflict ? [] : mutations;
  const transactionFileOperations = blockedByConflict
    ? fileOperations.map((operation): OperationPlanFile =>
        operation.operation === "add"
          ? {
              ...operation,
              operation: "conflict",
              proposed: null,
              risk: "conflict",
              reason:
                "The source add is blocked by another ownership conflict; no partial files will be staged.",
            }
          : operation,
      )
    : fileOperations;
  const validators = sourceTransactionValidators({
    config: project.config,
    manifest: blockedByConflict ? project.manifest.value : nextManifest,
    mutations: transactionMutations,
    fileOperations: transactionFileOperations,
  });
  const plan = operationPlan("add", {
    configDigest: sha256(canonicalJson(project.config)),
    manifestDigest: sha256(canonicalJson(project.manifest.value)),
    items: sourcePlanItems(
      sources,
      direct,
      project.manifest.value.items,
      new Set<string>(),
      acquired,
    ),
    sources,
    fileOperations: transactionFileOperations,
    dependencyChanges: packagePlan.changes,
    structuredPatches: packagePlan.changes.map((change) => ({
      id: dependencyPatchId(change.package),
      adapter: "package-dependency" as const,
      semanticKey: `dependencies.${change.package}`,
      target: "package.json",
      owner: change.owners[0]!,
      operation: "add" as const,
    })),
    warnings: [
      acquired === undefined
        ? "The bundled source payloads are unreleased; provenance records their exact digest and provisional 0.0.0-unreleased identity without claiming Stable evidence."
        : `The native ${acquired.release.release} release was acquired from ${acquired.release.artifactSources.join(", ")} evidence and every payload remains bound to its exact release digest.`,
      ...packageExecutionWarnings(
        options,
        project.inspection.packageManager,
        packagePlan.after !== packagePlan.before,
      ),
    ],
    conflicts,
    mutations: transactionMutations,
    acquired,
    validators,
  });
  return validateSourcePlanOverlay({
    root: project.root,
    publicPlan: plan,
    mutations: transactionMutations,
    observedTargets,
    registryPayloads: registryPayloads(sources, acquired),
    packageManager: project.inspection.packageManager,
    packageManagerRequired: packagePlan.after !== packagePlan.before,
    resolvedItems: sources.map(({ itemId }) => itemId),
    requestedItems: requested,
    transitiveItems: sources.map(({ itemId }) => itemId).filter((id) => !direct.has(id)),
    retainedFiles: [],
    validators,
  });
}

function sourceForManifestItem(item: ManifestItem, options: RegistryDataOptions): SourceItemRecord {
  const source = resolveSourceDependencyClosure([item.itemId], options).find(
    ({ itemId }) => itemId === item.itemId,
  );
  if (source === undefined || source.payloadDigest !== item.payload.digest) {
    throw new CliError(`Installed payload for ${item.itemId} is unavailable or has changed.`, {
      code: "INSTALLED_PAYLOAD_UNAVAILABLE",
      exitCode: 5,
      target: MANIFEST_PATH,
    });
  }
  return source;
}

function remainingItemIdsAfterRemoval(
  items: Readonly<Record<string, ManifestItem>>,
  requested: ReadonlySet<string>,
): ReadonlySet<string> {
  const keep = new Set<string>();
  const visit = (id: string): void => {
    if (keep.has(id)) return;
    const item = items[id];
    if (item === undefined) return;
    keep.add(id);
    for (const dependency of item.registryDependencies) visit(dependency);
  };
  for (const [id, item] of Object.entries(items)) {
    if (item.direct && !requested.has(id)) visit(id);
  }
  return keep;
}

function assertSourceCommandOwnership(
  manifest: ProvenanceManifest,
  requestedIds: readonly string[],
  command: "remove" | "adopt",
): void {
  for (const itemId of requestedIds) {
    const installed = manifest.items[qualified(itemId)];
    if (installed?.mode === "package") {
      throw new CliError(
        `Installed item ${itemId} is package-owned; run the explicit package-to-source distribution migration before source ${command}.`,
        {
          code: "DISTRIBUTION_MODE_MIGRATION_REQUIRED",
          exitCode: 6,
          target: MANIFEST_PATH,
        },
      );
    }
  }
}

function removeInternal(options: SourceRemoveOptions): InternalSourcePlan {
  const configured = readConfiguredOwnership(options);
  const requestedIds = requestedCanonicalIds(options);
  const requestedQualified = new Set(requestedIds.map(qualified));
  const keep = remainingItemIdsAfterRemoval(configured.manifest.value.items, requestedQualified);
  const removed = new Set(
    Object.keys(configured.manifest.value.items).filter((id) => !keep.has(id)),
  );
  assertSourceCommandOwnership(
    configured.manifest.value,
    [...removed].map((id) => id.slice("official:".length)),
    "remove",
  );
  const project = readConfiguredProject(options, configured);
  const nextManifest = cloneManifest(project.manifest.value);
  for (const id of keep) {
    if (requestedQualified.has(id)) nextManifest.items[id]!.direct = false;
  }
  for (const id of removed) delete nextManifest.items[id];
  const sources = Object.values(project.manifest.value.items).map((item) =>
    sourceForManifestItem(item, options),
  );
  const fileOperations: OperationPlanFile[] = [];
  const conflicts: OperationPlan["conflicts"][number][] = [];
  const mutations: TransactionMutation[] = [];
  const observedTargets: Record<string, `sha256:${string}` | null> = {};
  const retainedFiles: string[] = [];
  for (const id of portableSort([...removed])) {
    const item = project.manifest.value.items[id]!;
    for (const file of item.files) {
      const localBytes = readProjectFile(project.root, file.target);
      const local = digestOrNull(localBytes);
      observedTargets[file.target] = local;
      const baseBytes = readProjectFile(project.root, basePath(file.base));
      const baseValid = baseBytes !== null && sha256(baseBytes) === file.base;
      observedTargets[basePath(file.base)] = digestOrNull(baseBytes);
      if (options.keepFiles === true) {
        retainedFiles.push(file.target);
        fileOperations.push({
          operation: "keep-local",
          target: file.target,
          owner: id,
          base: file.base,
          local,
          remote: null,
          proposed: local,
          mediaType: file.mediaType,
          risk: "review-required",
          reason: "--keep-files detaches ownership and retains the live file unchanged.",
        });
      } else if (localBytes === null) {
        fileOperations.push({
          operation: "local-delete",
          target: file.target,
          owner: id,
          base: file.base,
          local: null,
          remote: null,
          proposed: null,
          mediaType: file.mediaType,
          risk: "ordinary",
          reason: "The owned target is already locally deleted; only provenance is pruned.",
        });
      } else if (!baseValid || local !== file.base) {
        retainedFiles.push(file.target);
        conflicts.push({
          target: file.target,
          kind: "modify-delete",
          reason: !baseValid
            ? "The immutable base is missing or corrupt, so ownership-safe deletion cannot be proven."
            : "The owned target is locally customized and will not be deleted.",
        });
        fileOperations.push({
          operation: "conflict",
          target: file.target,
          owner: id,
          base: file.base,
          local,
          remote: null,
          proposed: local,
          mediaType: file.mediaType,
          risk: "conflict",
          reason: "Removal cannot discard customized or unprovable bytes.",
        });
      } else {
        mutations.push(mutation(project.root, file.target, null));
        fileOperations.push({
          operation: "delete",
          target: file.target,
          owner: id,
          base: file.base,
          local,
          remote: null,
          proposed: null,
          mediaType: file.mediaType,
          risk: "destructive",
          reason: "The live bytes exactly match the immutable owned base.",
        });
      }
    }
  }

  const currentDependencies = readPackageDependencies(resolve(project.root, "package.json"));
  const removals: Record<string, readonly string[]> = {};
  const nextOwners = dependencyOwners(nextManifest.items);
  for (const [key, owners] of Object.entries(project.manifest.value.dependencyOwners)) {
    if (!key.startsWith("runtime:")) continue;
    const name = key.slice("runtime:".length);
    if ((nextOwners[key]?.length ?? 0) > 0) continue;
    const patchOwner = owners
      .map((owner) => project.manifest.value.items[owner])
      .find((item) =>
        item?.structuredPatches.some(
          (patch) =>
            patch.adapter === "package-dependency" && patch.semanticKey === `dependencies.${name}`,
        ),
      );
    const patch = patchOwner?.structuredPatches.find(
      (candidate) =>
        candidate.adapter === "package-dependency" &&
        candidate.semanticKey === `dependencies.${name}`,
    );
    if (patch === undefined) continue;
    const current = currentDependencies[name];
    if (current !== undefined && sha256(current) !== patch.ownedValueDigest) {
      conflicts.push({
        target: "package.json",
        kind: "structured-patch",
        reason: `Dependency ${name} no longer matches its Mergora-owned value and will be retained.`,
      });
      retainedFiles.push("package.json");
      continue;
    }
    removals[name] = owners;
  }
  for (const [key, owners] of Object.entries(nextOwners)) {
    const name = key.slice("runtime:".length);
    const currentPatchOwner = Object.entries(project.manifest.value.items).find(([, item]) =>
      item.structuredPatches.some(
        (patch) =>
          patch.adapter === "package-dependency" && patch.semanticKey === `dependencies.${name}`,
      ),
    );
    if (currentPatchOwner === undefined || nextManifest.items[currentPatchOwner[0]] !== undefined)
      continue;
    const patch = currentPatchOwner[1].structuredPatches.find(
      (candidate) => candidate.semanticKey === `dependencies.${name}`,
    )!;
    nextManifest.items[owners[0]!]!.structuredPatches.push(patch);
  }
  rebuildSharedTargets(nextManifest);
  const packagePlan = planPackageDependencies(resolve(project.root, "package.json"), {}, removals);
  assertPackageManagerTransactionScope(
    project.inspection,
    packagePlan.after !== packagePlan.before,
    options.noInstall,
  );
  if (packagePlan.after !== packagePlan.before) {
    mutations.push(mutation(project.root, "package.json", Buffer.from(packagePlan.after)));
  }
  const nextManifestBytes = manifestBytes(nextManifest);
  if (!nextManifestBytes.equals(project.manifest.bytes)) {
    mutations.push(mutation(project.root, MANIFEST_PATH, nextManifestBytes, true));
  }

  const direct = new Set(
    Object.values(project.manifest.value.items)
      .filter(({ direct: isDirect }) => isDirect)
      .map(({ itemId }) => itemId),
  );
  const warnings: string[] = [];
  for (const requested of requestedIds) {
    if (project.manifest.value.items[qualified(requested)] === undefined) {
      warnings.push(`Item ${requested} is not installed; removal is a no-op for that request.`);
    } else if (keep.has(qualified(requested))) {
      warnings.push(`Item ${requested} remains as a transitive dependency of another direct item.`);
    }
  }
  if (options.keepFiles === true) {
    warnings.push("--keep-files detaches provenance and retains every owned source target.");
  }
  warnings.push(
    ...packageExecutionWarnings(
      options,
      project.inspection.packageManager,
      packagePlan.after !== packagePlan.before,
    ),
  );
  const itemsForPlan = sources.filter(
    (source) =>
      removed.has(qualified(source.itemId)) || requestedQualified.has(qualified(source.itemId)),
  );
  const validators = sourceTransactionValidators({
    config: project.config,
    manifest: nextManifest,
    mutations,
    fileOperations,
  });
  const plan = operationPlan("remove", {
    configDigest: sha256(canonicalJson(project.config)),
    manifestDigest: sha256(canonicalJson(project.manifest.value)),
    items: sourcePlanItems(itemsForPlan, direct, project.manifest.value.items, removed),
    sources: itemsForPlan,
    fileOperations,
    dependencyChanges: packagePlan.changes,
    structuredPatches: packagePlan.changes.map((change) => ({
      id: dependencyPatchId(change.package),
      adapter: "package-dependency" as const,
      semanticKey: `dependencies.${change.package}`,
      target: "package.json",
      owner: change.owners[0]!,
      operation: "remove" as const,
    })),
    warnings,
    conflicts,
    mutations,
    validators,
  });
  return validateSourcePlanOverlay({
    root: project.root,
    publicPlan: plan,
    mutations,
    observedTargets,
    registryPayloads: registryPayloads(itemsForPlan),
    packageManager: project.inspection.packageManager,
    packageManagerRequired: packagePlan.after !== packagePlan.before,
    resolvedItems: portableSort([...removed].map((id) => id.slice("official:".length))),
    requestedItems: requestedIds,
    transitiveItems: portableSort(
      [...removed]
        .map((id) => id.slice("official:".length))
        .filter((id) => !requestedIds.includes(id)),
    ),
    retainedFiles: portableSort(retainedFiles),
    validators,
  });
}

function adoptInternal(options: SourceOperationOptions): InternalSourcePlan {
  if (options.targetDirectory !== undefined) {
    assertPortableRelativePath(options.targetDirectory, "Source target root");
  }
  const configured = readConfiguredOwnership(options);
  const requested = requestedCanonicalIds(options);
  assertSourceCommandOwnership(configured.manifest.value, requested, "adopt");
  const sources = resolveSourceDependencyClosure(requested, options);
  assertSourceCommandOwnership(
    configured.manifest.value,
    sources.map(({ itemId }) => itemId),
    "adopt",
  );
  const project = readConfiguredProject(options, configured);
  const direct = new Set(requested);
  const nextManifest = cloneManifest(project.manifest.value);
  const mutations: TransactionMutation[] = [];
  const observedTargets: Record<string, `sha256:${string}` | null> = {};
  const fileOperations: OperationPlanFile[] = [];
  const conflicts: OperationPlan["conflicts"][number][] = [];
  const plannedBaseTargets = new Set<string>();
  const packageDependencies = readPackageDependencies(resolve(project.root, "package.json"));
  for (const source of sources) {
    const id = qualified(source.itemId);
    const existing = nextManifest.items[id];
    if (existing !== undefined) {
      validateExistingInstall(existing, source, project.config, options.targetDirectory);
      if (direct.has(source.itemId)) existing.direct = true;
      continue;
    }
    for (const [name, required] of Object.entries(source.installDependencies)) {
      const current = packageDependencies[name];
      if (current === undefined || !compatibleDependencyRange(current, required)) {
        throw new CliError(
          `Adoption requires existing compatible dependency ${name}@${required}; it does not invent dependency ownership.`,
          { code: "ADOPT_DEPENDENCY_UNPROVEN", exitCode: 7, target: "package.json" },
        );
      }
    }
    const files = mapFiles(source, project.config, options.targetDirectory);
    const installed: Record<string, `sha256:${string}`> = {};
    for (const file of files) {
      const localBytes = readProjectFile(project.root, file.target);
      if (localBytes === null) {
        conflicts.push({
          target: file.target,
          kind: "ownership",
          reason:
            "The exact configured target is missing, so this item relationship cannot be adopted.",
        });
        continue;
      }
      const local = sha256(localBytes);
      if (local !== file.digest) {
        conflicts.push({
          target: file.target,
          kind: "ownership",
          reason:
            "The local bytes do not exactly match the explicit bundled payload. Their upstream base is unknown and v1 provenance cannot represent that relationship honestly.",
        });
        fileOperations.push({
          operation: "conflict",
          target: file.target,
          owner: id,
          base: null,
          local,
          remote: file.digest,
          proposed: local,
          mediaType: file.source.mediaType,
          risk: "conflict",
          reason:
            "Divergent bytes cannot be attributed to the current bundled base without cryptographic proof.",
        });
        continue;
      }
      installed[file.target] = local;
      observedTargets[file.target] = local;
      fileOperations.push({
        operation: "no-op",
        target: file.target,
        owner: id,
        base: file.digest,
        local,
        remote: file.digest,
        proposed: local,
        mediaType: file.source.mediaType,
        risk: "ordinary",
        reason:
          "The existing bytes exactly match the explicit upstream payload and transform mapping.",
      });
      const baseTarget = basePath(file.digest);
      const baseBytes = readProjectFile(project.root, baseTarget);
      if (baseBytes !== null && sha256(baseBytes) !== file.digest) {
        throw new CliError(`Immutable base ${baseTarget} is corrupt.`, {
          code: "BASE_DIGEST_MISMATCH",
          exitCode: 3,
          target: baseTarget,
        });
      }
      observedTargets[baseTarget] = digestOrNull(baseBytes);
      if (baseBytes === null && !plannedBaseTargets.has(baseTarget)) {
        mutations.push(mutation(project.root, baseTarget, file.bytes));
        plannedBaseTargets.add(baseTarget);
      }
    }
    if (conflicts.some(({ target }) => files.some((file) => file.target === target))) continue;
    nextManifest.items[id] = manifestItem(
      source,
      files,
      project.config,
      direct.has(source.itemId),
      installed,
      options.targetDirectory,
    );
  }
  rebuildSharedTargets(nextManifest);
  const nextManifestBytes = manifestBytes(nextManifest);
  if (!nextManifestBytes.equals(project.manifest.bytes)) {
    mutations.push(mutation(project.root, MANIFEST_PATH, nextManifestBytes, true));
  }
  const validators = sourceTransactionValidators({
    config: project.config,
    manifest: nextManifest,
    mutations,
    fileOperations,
  });
  const plan = operationPlan("adopt", {
    configDigest: sha256(canonicalJson(project.config)),
    manifestDigest: sha256(canonicalJson(project.manifest.value)),
    items: sourcePlanItems(sources, direct, project.manifest.value.items),
    sources,
    fileOperations,
    dependencyChanges: [],
    warnings: [
      "Adoption never changes live source and records provenance only for exact bundled-payload byte matches.",
      "A divergent, path-only, or ambiguous relationship is refused because v1 cannot represent an unknown base honestly.",
    ],
    conflicts,
    mutations,
    validators,
  });
  return validateSourcePlanOverlay({
    root: project.root,
    publicPlan: plan,
    mutations,
    observedTargets,
    registryPayloads: registryPayloads(sources),
    packageManager: project.inspection.packageManager,
    packageManagerRequired: false,
    resolvedItems: sources.map(({ itemId }) => itemId),
    requestedItems: requested,
    transitiveItems: sources.map(({ itemId }) => itemId).filter((id) => !direct.has(id)),
    retainedFiles: [],
    validators,
  });
}

function executeSourceOperation(
  command: "add" | "remove" | "adopt",
  internal: InternalSourcePlan,
  options: SourceOperationOptions,
  expectedPlanDigest: string,
): SourceOperationResult {
  if (expectedPlanDigest !== internal.publicPlan.planDigest) {
    throw new CliError("Operation plan changed before apply; review a fresh plan.", {
      code: "PLAN_PRECONDITION_STALE",
      exitCode: 8,
    });
  }
  const transaction = executeTransaction({
    root: internal.root,
    plan: internal.publicPlan,
    mutations: internal.mutations,
    acceptedConsents: internal.publicPlan.consentRequirements.map(({ id }) => ({
      id,
      planDigest: internal.publicPlan.planDigest,
    })),
    observedTargets: internal.observedTargets,
    registryPayloads: internal.registryPayloads,
    packageManager: internal.packageManager,
    packageManagerRequired: internal.packageManagerRequired,
    noInstall: options.noInstall,
    offline: options.offline,
    packageManagerRunner: options.packageManagerRunner,
    commandArguments: options.commandArguments,
    faultInjector: options.faultInjector,
    validators: internal.validators,
  } satisfies ExecuteTransactionOptions);
  return {
    mode: "source-transaction",
    command,
    items: internal.resolvedItems,
    requestedItems: internal.requestedItems,
    transitiveItems: internal.transitiveItems,
    retainedFiles: internal.retainedFiles,
    manifest: MANIFEST_PATH,
    transaction,
    planDigest: internal.publicPlan.planDigest,
  };
}

export function planSourceAdd(options: SourceOperationOptions): SourceOperationPlan {
  return addInternal(options).publicPlan;
}

export function applySourceAdd(
  options: SourceOperationOptions,
  expectedPlanDigest: string,
): SourceOperationResult {
  return executeSourceOperation("add", addInternal(options), options, expectedPlanDigest);
}

export function planAcquiredSourceAdd(
  options: AcquiredSourceOperationOptions,
): SourceOperationPlan {
  const acquired = acquiredSourceContext(options.acquiredRelease);
  return addInternal(options, acquired).publicPlan;
}

export function applyAcquiredSourceAdd(
  options: AcquiredSourceOperationOptions,
  expectedPlanDigest: string,
): SourceOperationResult {
  const acquired = acquiredSourceContext(options.acquiredRelease);
  return executeSourceOperation("add", addInternal(options, acquired), options, expectedPlanDigest);
}

export function planSourceRemove(options: SourceRemoveOptions): SourceOperationPlan {
  return removeInternal(options).publicPlan;
}

export function applySourceRemove(
  options: SourceRemoveOptions,
  expectedPlanDigest: string,
): SourceOperationResult {
  return executeSourceOperation("remove", removeInternal(options), options, expectedPlanDigest);
}

export function planSourceAdopt(options: SourceOperationOptions): SourceOperationPlan {
  return adoptInternal(options).publicPlan;
}

export function applySourceAdopt(
  options: SourceOperationOptions,
  expectedPlanDigest: string,
): SourceOperationResult {
  return executeSourceOperation("adopt", adoptInternal(options), options, expectedPlanDigest);
}
