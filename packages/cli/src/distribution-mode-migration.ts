import { assertPortableRelativePath, canonicalJson, CliError, sha256 } from "./contracts.js";
import ts from "typescript";
import {
  assertAuthenticAcquiredNativeRegistryRelease,
  type AcquiredNativeRegistryRelease,
} from "./acquisition-resolver.js";
import {
  assertDistributionConfigurationBinding,
  serializeDistributionProvenance,
  type DistributionDigest,
  type DistributionPatchOwnership,
  type DistributionProvenanceState,
  type InstalledDistributionMode,
  type ValidatedDistributionProvenance,
} from "./distribution-provenance.js";
import {
  MANIFEST_PATH,
  basePath,
  deriveAcquiredDistributionSources,
  distributionProvenanceFromManifest,
  manifestBytes,
  parseManifestBytes,
  type ProvenanceManifest,
} from "./source-operations.js";
import {
  executeTransaction,
  finalizeOperationPlan,
  type PackageManagerRunner,
  type TransactionFaultInjector,
  type OperationPlan,
  type OperationPlanDependencyChange,
  type OperationPlanFile,
  type TransactionMutation,
  type TransactionRegistryPayload,
  type TransactionValidationContext,
  type TransactionValidationIssue,
  type TransactionValidationResult,
  type TransactionValidator,
  type TransactionResult,
} from "./transaction-engine.js";
import type { PackageManager } from "./project-inspector.js";
import { validateStableNpmTarballBytes } from "./vendor-reader.js";

const DIGEST = /^sha256:[a-f0-9]{64}$/u;
const QUALIFIED_ITEM = /^[a-z0-9]+(?:-[a-z0-9]+)*:[a-z0-9]+(?:-[a-z0-9]+)*$/u;
const PACKAGE_NAME = /^(?:@[a-z0-9][a-z0-9._-]*\/)?[a-z0-9][a-z0-9._-]*$/u;
const PATCH_ID = /^[a-z0-9]+(?:-[a-z0-9]+)*$/u;
const MAX_PROJECT_OBSERVATIONS = 8_192;

export const BUILT_IN_MODE_IMPORT_ADAPTER = "typescript-import-mode-v1" as const;

export interface DistributionImportRewrite {
  readonly adapter: typeof BUILT_IN_MODE_IMPORT_ADAPTER;
  readonly target: string;
  readonly before: DistributionDigest;
  readonly after: DistributionDigest;
}

export interface DistributionModeMigrationObservation {
  readonly stateDigest: DistributionDigest;
  readonly unresolvedTransactions: readonly string[];
  /** Current live digest for every source target added, removed, or checked by this migration. */
  readonly sourceFiles: Readonly<Record<string, DistributionDigest | null>>;
  /** Current project dependency range, or null when absent. */
  readonly dependencies: Readonly<Record<string, string | null>>;
  /** Current semantic value digest for structured project glue, or null when absent. */
  readonly patches: Readonly<Record<string, DistributionDigest | null>>;
  /** Current digest for each consumer source file rewritten by the built-in import adapter. */
  readonly projectFiles: Readonly<Record<string, DistributionDigest | null>>;
  readonly importRewrites: readonly DistributionImportRewrite[];
}

export interface DistributionModeMigrationOptions {
  readonly currentState: unknown;
  readonly proposedState: unknown;
  /** Parsed and revalidated mergora.json bytes/object that authorize registry and mode identity. */
  readonly configuration: unknown;
  readonly from: InstalledDistributionMode;
  readonly to: InstalledDistributionMode;
  readonly itemIds: readonly string[];
  readonly observation: DistributionModeMigrationObservation;
  /** Exact canonical current manifest used to recover persisted compiled target mappings. */
  readonly currentManifestBytes: Uint8Array;
  /** Resolver-branded exact releases for every selected release reference. */
  readonly acquiredReleases: readonly AcquiredNativeRegistryRelease[];
}

export interface DistributionModeDependencyOperation {
  readonly key: string;
  readonly operation: "add" | "change" | "remove" | "retain" | "ownership-only";
  readonly from: string | null;
  readonly to: string | null;
  readonly ownersBefore: readonly string[];
  readonly ownersAfter: readonly string[];
  readonly reason: string;
}

export interface DistributionModePatchOperation {
  readonly id: string;
  readonly target: string;
  readonly operation: "add" | "change" | "remove" | "retain" | "ownership-only";
  readonly before: DistributionDigest | null;
  readonly after: DistributionDigest | null;
  readonly ownersBefore: readonly string[];
  readonly ownersAfter: readonly string[];
  readonly reason: string;
}

export interface DistributionModeFileOperation {
  readonly operation: "add" | "delete";
  readonly target: string;
  readonly owner: string;
  readonly local: DistributionDigest | null;
  readonly proposed: DistributionDigest | null;
  readonly reason: string;
}

export interface DistributionModeMigrationPlan {
  readonly schemaVersion: 1;
  readonly command: "migrate-mode";
  readonly migrationId: "mode-source-to-package-v1" | "mode-package-to-source-v1";
  readonly from: InstalledDistributionMode;
  readonly to: InstalledDistributionMode;
  readonly items: readonly string[];
  readonly statePreconditionDigest: DistributionDigest;
  readonly proposedStateDigest: DistributionDigest;
  readonly releases: readonly {
    readonly ref: string;
    readonly identityDigest: DistributionDigest;
    readonly manifestDigest: DistributionDigest;
    readonly release: string;
  }[];
  readonly fileOperations: readonly DistributionModeFileOperation[];
  readonly dependencyOperations: readonly DistributionModeDependencyOperation[];
  readonly patchOperations: readonly DistributionModePatchOperation[];
  readonly importRewrites: readonly DistributionImportRewrite[];
  readonly validationRequirements: readonly [
    "package-integrity",
    "typescript-imports",
    "consumer-type-imports",
    "structured-patch-adapters",
    "accessibility-contracts",
  ];
  readonly manifestCommitOrder: "last";
  readonly rollbackRequired: true;
  readonly externalExecutableCodeUsed: false;
}

interface PreparedDistributionModeMigration {
  readonly migrationPlan: DistributionModeMigrationPlan;
  readonly currentState: DistributionProvenanceState;
  readonly proposedState: DistributionProvenanceState;
  readonly acquiredSourceBytes: Readonly<Record<string, Uint8Array>>;
  readonly acquiredReleases: readonly AcquiredNativeRegistryRelease[];
}

export interface DistributionModeTargetMaterialization {
  /** Exact authoritative bytes observed while planning. */
  readonly before: Uint8Array | null;
  /** Exact bytes produced by a compiled built-in adapter, or null for deletion. */
  readonly after: Uint8Array | null;
}

export interface DistributionModeBaseMaterialization {
  /** Existing immutable base bytes, or null when the blob must be added. */
  readonly before: Uint8Array | null;
  /** Exact canonical upstream bytes whose digest names the base-store target. */
  readonly content: Uint8Array;
}

export const DISTRIBUTION_MODE_VALIDATOR_IDS = {
  imports: "distribution-mode-typescript-imports-v1",
  consumerTypeImports: "distribution-mode-consumer-type-imports-v1",
  structuredPatchAdapters: "distribution-mode-structured-patch-adapters-v1",
  accessibilityContracts: "distribution-mode-accessibility-contracts-v1",
  packageIntegrity: "distribution-mode-package-integrity-v1",
} as const;

const DISTRIBUTION_MODE_VALIDATOR_LABELS = {
  imports: "type-imports",
  consumerTypeImports: "type-imports",
  structuredPatchAdapters: "parse",
  accessibilityContracts: "accessibility-contract",
  packageIntegrity: "digest",
} as const;

export interface DistributionModePackageIntegrityEvidence {
  readonly releaseRef: string;
  readonly package: string;
  readonly version: string;
  /** Immutable HTTPS tarball URL captured alongside the verified bytes. */
  readonly url: string;
  /** Exact tarball bytes; their digest is recomputed during materialization. */
  readonly bytes: Uint8Array;
}

interface DistributionModeTransactionOptions {
  readonly prepared: PreparedDistributionModeMigration;
  /** Revalidated again at materialization so a forged prepared object cannot bypass enrollment. */
  readonly configuration: unknown;
  readonly currentManifestBytes: Uint8Array;
  readonly proposedManifestBytes: Uint8Array;
  /** Aggregate file results after package, CSS/config, and import adapters have run in memory. */
  readonly targets: Readonly<Record<string, DistributionModeTargetMaterialization>>;
  /** Required for every new source file base introduced by package-to-source migration. */
  readonly bases: Readonly<Record<DistributionDigest, DistributionModeBaseMaterialization>>;
  readonly cliVersion: string;
  readonly releaseSources: Readonly<
    Record<string, "network" | "verified-cache" | "vendor" | "mirror">
  >;
  /** Exact tarball bytes for every package claim touched by the selected items. */
  readonly packageIntegrityEvidence: readonly DistributionModePackageIntegrityEvidence[];
}

interface DistributionModeTransactionBundle {
  readonly plan: OperationPlan;
  readonly mutations: readonly TransactionMutation[];
  readonly observedTargets: Readonly<Record<string, DistributionDigest | null>>;
  readonly registryPayloads: readonly TransactionRegistryPayload[];
  readonly validators: readonly TransactionValidator[];
  readonly packageManagerRequired: boolean;
}

export interface PlanDistributionModeTransactionOptions {
  readonly migration: DistributionModeMigrationOptions;
  readonly proposedManifestBytes: Uint8Array;
  /** Aggregate file results after compiled package/import adapters have run in memory. */
  readonly targets: Readonly<Record<string, DistributionModeTargetMaterialization>>;
  readonly bases: Readonly<Record<DistributionDigest, DistributionModeBaseMaterialization>>;
  readonly cliVersion: string;
  readonly releaseSources: Readonly<
    Record<string, "network" | "verified-cache" | "vendor" | "mirror">
  >;
  readonly packageIntegrityEvidence: readonly DistributionModePackageIntegrityEvidence[];
}

export interface PlanDistributionModeTransactionResult {
  /** Exact transaction plan that apply recomputes and commits. */
  readonly plan: OperationPlan;
  /** Rich mode-transition details; this has no independent consent digest. */
  readonly migrationPlan: DistributionModeMigrationPlan;
}

export interface ApplyDistributionModeTransactionOptions extends PlanDistributionModeTransactionOptions {
  readonly reviewedPlanDigest: DistributionDigest;
  readonly projectRoot: string;
  readonly packageManager: PackageManager;
  readonly noInstall?: boolean | undefined;
  readonly offline?: boolean | undefined;
  readonly packageManagerRunner?: PackageManagerRunner | undefined;
  readonly commandArguments?: readonly string[] | undefined;
  readonly faultInjector?: TransactionFaultInjector | undefined;
  /** Explicit consent corresponding to the reviewed plan's destructive mode transition. */
  readonly yes: true;
}

export interface ApplyDistributionModeTransactionResult {
  readonly transaction: TransactionResult;
  readonly provenance: ValidatedDistributionProvenance;
}

function migrationError(
  message: string,
  code: string,
  target?: string,
  exitCode: 3 | 5 | 6 | 7 | 8 = 7,
): CliError {
  return new CliError(message, {
    code,
    exitCode,
    ...(target === undefined ? {} : { target }),
  });
}

function compareText(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function objectValue(value: unknown, label: string): Record<string, unknown> {
  if (value === null || Array.isArray(value) || typeof value !== "object") {
    throw migrationError(
      `${label} must be an object.`,
      "MODE_MIGRATION_INPUT_INVALID",
      undefined,
      3,
    );
  }
  return value as Record<string, unknown>;
}

function exactKeys(
  value: Record<string, unknown>,
  expected: readonly string[],
  label: string,
): void {
  const keys = Object.keys(value).sort(compareText);
  const wanted = [...expected].sort(compareText);
  if (canonicalJson(keys) !== canonicalJson(wanted)) {
    throw migrationError(
      `${label} has missing or unknown fields.`,
      "MODE_MIGRATION_INPUT_INVALID",
      undefined,
      3,
    );
  }
}

function checkedDigest(value: unknown, label: string): DistributionDigest {
  if (typeof value !== "string" || !DIGEST.test(value)) {
    throw migrationError(
      `${label} must be an exact SHA-256 digest.`,
      "MODE_MIGRATION_DIGEST_INVALID",
      undefined,
      5,
    );
  }
  return value as DistributionDigest;
}

function checkedItems(value: unknown): readonly string[] {
  if (!Array.isArray(value) || value.length === 0 || value.length > 4_096) {
    throw migrationError(
      "Mode migration requires a bounded non-empty item selection.",
      "MODE_MIGRATION_ITEMS_INVALID",
      undefined,
      7,
    );
  }
  const items = value.map((item) => {
    if (typeof item !== "string" || !QUALIFIED_ITEM.test(item)) {
      throw migrationError(
        "Mode migration item IDs must be registry-qualified portable IDs.",
        "MODE_MIGRATION_ITEMS_INVALID",
        undefined,
        7,
      );
    }
    return item;
  });
  if (new Set(items).size !== items.length) {
    throw migrationError(
      "Mode migration item selection contains a duplicate.",
      "MODE_MIGRATION_ITEMS_INVALID",
      undefined,
      7,
    );
  }
  return items.sort(compareText);
}

function pathKey(value: string): string {
  return value.normalize("NFC").toLocaleLowerCase("en-US");
}

function checkedDigestRecord(
  value: unknown,
  label: string,
  keyPolicy: (key: string) => boolean,
): Readonly<Record<string, DistributionDigest | null>> {
  const source = objectValue(value, label);
  if (Object.keys(source).length > MAX_PROJECT_OBSERVATIONS) {
    throw migrationError(
      `${label} exceeds its safety bound.`,
      "MODE_MIGRATION_LIMIT_EXCEEDED",
      undefined,
      5,
    );
  }
  const entries = Object.entries(source).map(
    ([key, candidate]): readonly [string, DistributionDigest | null] => {
      if (!keyPolicy(key)) {
        throw migrationError(
          `${label} contains an invalid key.`,
          "MODE_MIGRATION_INPUT_INVALID",
          undefined,
          5,
        );
      }
      return [key, candidate === null ? null : checkedDigest(candidate, `${label}.${key}`)];
    },
  );
  return Object.fromEntries(entries.sort(([left], [right]) => compareText(left, right)));
}

function checkedDependencyObservation(value: unknown): Readonly<Record<string, string | null>> {
  const source = objectValue(value, "Mode migration dependency observations");
  if (Object.keys(source).length > MAX_PROJECT_OBSERVATIONS) {
    throw migrationError(
      "Mode migration dependency observations exceed their safety bound.",
      "MODE_MIGRATION_LIMIT_EXCEEDED",
      undefined,
      5,
    );
  }
  return Object.fromEntries(
    Object.entries(source)
      .map(([name, candidate]): readonly [string, string | null] => {
        if (!PACKAGE_NAME.test(name)) {
          throw migrationError(
            "Mode migration dependency observation has an invalid package name.",
            "MODE_MIGRATION_INPUT_INVALID",
            "package.json",
            5,
          );
        }
        if (
          candidate !== null &&
          (typeof candidate !== "string" ||
            candidate.length === 0 ||
            candidate.length > 160 ||
            candidate !== candidate.trim())
        ) {
          throw migrationError(
            `Observed dependency ${name} has an invalid range.`,
            "MODE_MIGRATION_INPUT_INVALID",
            "package.json",
            5,
          );
        }
        return [name, candidate];
      })
      .sort(([left], [right]) => compareText(left, right)),
  );
}

function checkedRewrites(
  value: unknown,
  projectFiles: Readonly<Record<string, DistributionDigest | null>>,
): readonly DistributionImportRewrite[] {
  if (!Array.isArray(value) || value.length > MAX_PROJECT_OBSERVATIONS) {
    throw migrationError(
      "Import rewrites exceed their safety bound.",
      "MODE_MIGRATION_LIMIT_EXCEEDED",
      undefined,
      5,
    );
  }
  const rewrites = value.map((candidate, index): DistributionImportRewrite => {
    const source = objectValue(candidate, `Import rewrite ${index}`);
    exactKeys(source, ["adapter", "target", "before", "after"], `Import rewrite ${index}`);
    if (source.adapter !== BUILT_IN_MODE_IMPORT_ADAPTER) {
      throw migrationError(
        "Mode migration accepts only the compiled TypeScript import adapter.",
        "MODE_MIGRATION_ADAPTER_UNTRUSTED",
        undefined,
        5,
      );
    }
    if (
      typeof source.target !== "string" ||
      source.target.length === 0 ||
      source.target.length > 512
    ) {
      throw migrationError(
        "Import rewrite target is invalid.",
        "MODE_MIGRATION_INPUT_INVALID",
        undefined,
        5,
      );
    }
    try {
      assertPortableRelativePath(source.target, "Import rewrite target");
    } catch {
      throw migrationError(
        "Import rewrite target is not a safe portable project path.",
        "MODE_MIGRATION_INPUT_INVALID",
        source.target,
        5,
      );
    }
    const before = checkedDigest(source.before, `Import rewrite ${index}.before`);
    const after = checkedDigest(source.after, `Import rewrite ${index}.after`);
    if (before === after) {
      throw migrationError(
        "No-op import rewrites must be omitted.",
        "MODE_MIGRATION_INPUT_INVALID",
        source.target,
        5,
      );
    }
    if (projectFiles[source.target] !== before) {
      throw migrationError(
        `Import rewrite precondition changed for ${source.target}.`,
        "MODE_MIGRATION_STALE",
        source.target,
        8,
      );
    }
    return { adapter: BUILT_IN_MODE_IMPORT_ADAPTER, target: source.target, before, after };
  });
  rewrites.sort((left, right) => compareText(left.target, right.target));
  const portable = rewrites.map(({ target }) => pathKey(target));
  if (new Set(portable).size !== portable.length) {
    throw migrationError(
      "Import rewrites contain a portable path collision.",
      "MODE_MIGRATION_TARGET_COLLISION",
      undefined,
      6,
    );
  }
  return rewrites;
}

function checkedObservation(value: unknown): DistributionModeMigrationObservation {
  const source = objectValue(value, "Mode migration observation");
  exactKeys(
    source,
    [
      "stateDigest",
      "unresolvedTransactions",
      "sourceFiles",
      "dependencies",
      "patches",
      "projectFiles",
      "importRewrites",
    ],
    "Mode migration observation",
  );
  if (!Array.isArray(source.unresolvedTransactions) || source.unresolvedTransactions.length > 256) {
    throw migrationError(
      "Unresolved transaction inventory is invalid.",
      "MODE_MIGRATION_INPUT_INVALID",
      undefined,
      8,
    );
  }
  const unresolvedTransactions = source.unresolvedTransactions.map((id) => {
    if (typeof id !== "string" || !/^[a-z0-9][a-z0-9-]{0,127}$/u.test(id)) {
      throw migrationError(
        "Unresolved transaction inventory contains an invalid ID.",
        "MODE_MIGRATION_INPUT_INVALID",
        undefined,
        8,
      );
    }
    return id;
  });
  if (unresolvedTransactions.length > 0) {
    throw migrationError(
      "Mode migration cannot begin while another transaction is unresolved.",
      "MODE_MIGRATION_TRANSACTION_UNRESOLVED",
      undefined,
      8,
    );
  }
  const sourceFiles = checkedDigestRecord(
    source.sourceFiles,
    "Source file observations",
    (key) => key.length > 0 && key.length <= 512,
  );
  const patches = checkedDigestRecord(source.patches, "Patch observations", (key) =>
    PATCH_ID.test(key),
  );
  const projectFiles = checkedDigestRecord(
    source.projectFiles,
    "Project file observations",
    (key) => key.length > 0 && key.length <= 512,
  );
  const dependencies = checkedDependencyObservation(source.dependencies);
  const importRewrites = checkedRewrites(source.importRewrites, projectFiles);
  const observationCount =
    Object.keys(sourceFiles).length +
    Object.keys(patches).length +
    Object.keys(projectFiles).length +
    Object.keys(dependencies).length +
    importRewrites.length;
  if (observationCount > MAX_PROJECT_OBSERVATIONS) {
    throw migrationError(
      "Mode migration observations exceed their aggregate safety bound.",
      "MODE_MIGRATION_LIMIT_EXCEEDED",
      undefined,
      5,
    );
  }
  return {
    stateDigest: checkedDigest(source.stateDigest, "Mode migration stateDigest"),
    unresolvedTransactions: [],
    sourceFiles,
    dependencies,
    patches,
    projectFiles,
    importRewrites,
  };
}

function immutableItemProjection(item: DistributionProvenanceState["items"][string]): unknown {
  return {
    registry: item.registry,
    itemId: item.itemId,
    kind: item.kind,
    requested: item.requested,
    resolved: item.resolved,
    releaseRef: item.releaseRef,
    payload: item.payload,
    direct: item.direct,
    registryDependencies: item.registryDependencies,
    contractVersion: item.contractVersion,
  };
}

function assertStateTransition(
  current: DistributionProvenanceState,
  proposed: DistributionProvenanceState,
  items: readonly string[],
  from: InstalledDistributionMode,
  to: InstalledDistributionMode,
): void {
  if (
    from === to ||
    !(["source", "package"] as const).includes(from) ||
    !(["source", "package"] as const).includes(to)
  ) {
    throw migrationError(
      "Mode migration must move between different supported modes.",
      "MODE_MIGRATION_DIRECTION_INVALID",
    );
  }
  for (const key of [
    "schemaVersion",
    "projectId",
    "configDigest",
    "defaultMode",
    "packageName",
  ] as const) {
    if (current[key] !== proposed[key]) {
      throw migrationError(
        `Mode migration cannot change project-level ${key}.`,
        "MODE_MIGRATION_SCOPE_INVALID",
        undefined,
        5,
      );
    }
  }
  if (canonicalJson(current.releases) !== canonicalJson(proposed.releases)) {
    throw migrationError(
      "Mode migration cannot change releases; acquire the exact matching release before planning.",
      "MODE_MIGRATION_RELEASE_DRIFT",
      undefined,
      5,
    );
  }
  if (canonicalJson(Object.keys(current.items)) !== canonicalJson(Object.keys(proposed.items))) {
    throw migrationError(
      "Mode migration cannot add or remove item identities.",
      "MODE_MIGRATION_SCOPE_INVALID",
      undefined,
      6,
    );
  }
  const selection = new Set(items);
  const migrationId = `mode-${from}-to-${to}-v1`;
  for (const [id, before] of Object.entries(current.items)) {
    const after = proposed.items[id]!;
    if (!selection.has(id)) {
      if (canonicalJson(before) !== canonicalJson(after)) {
        throw migrationError(
          `Unselected item ${id} changed in the proposed mode migration.`,
          "MODE_MIGRATION_SCOPE_INVALID",
          id,
          6,
        );
      }
      continue;
    }
    if (before.mode !== from || after.mode !== to) {
      throw migrationError(
        `Selected item ${id} does not move from ${from} to ${to}.`,
        "MODE_MIGRATION_DIRECTION_INVALID",
        id,
        7,
      );
    }
    if (
      canonicalJson(immutableItemProjection(before)) !==
      canonicalJson(immutableItemProjection(after))
    ) {
      throw migrationError(
        `Selected item ${id} is not pinned to the exact matching immutable release.`,
        "MODE_MIGRATION_RELEASE_DRIFT",
        id,
        5,
      );
    }
    if (after.lastMigration !== migrationId) {
      throw migrationError(
        `Selected item ${id} does not record the reviewed built-in migration ${migrationId}.`,
        "MODE_MIGRATION_PROVENANCE_INVALID",
        id,
        5,
      );
    }
  }
}

function fileOperations(
  current: DistributionProvenanceState,
  proposed: DistributionProvenanceState,
  items: readonly string[],
  observation: DistributionModeMigrationObservation,
): readonly DistributionModeFileOperation[] {
  const operations: DistributionModeFileOperation[] = [];
  const occupied = new Set<string>();
  for (const id of items) {
    const before = current.items[id]!;
    const after = proposed.items[id]!;
    for (const file of before.files) {
      const live = observation.sourceFiles[file.target];
      if (
        file.tombstone === true ||
        file.installed === null ||
        file.installed !== file.base ||
        live !== file.base
      ) {
        throw migrationError(
          `Source target ${file.target} is deleted or customized relative to its immutable base; resolve it before mode migration.`,
          "MODE_MIGRATION_SOURCE_DIRTY",
          file.target,
          6,
        );
      }
      operations.push({
        operation: "delete",
        target: file.target,
        owner: id,
        local: file.base,
        proposed: null,
        reason: "Remove only exact clean source bytes after package/import validation succeeds.",
      });
      occupied.add(pathKey(file.target));
    }
    for (const file of after.files) {
      const live = observation.sourceFiles[file.target];
      if (live !== null) {
        throw migrationError(
          `Package-to-source target ${file.target} is already occupied.`,
          "MODE_MIGRATION_TARGET_COLLISION",
          file.target,
          6,
        );
      }
      if (occupied.has(pathKey(file.target))) {
        throw migrationError(
          `Mode migration source target ${file.target} collides portably.`,
          "MODE_MIGRATION_TARGET_COLLISION",
          file.target,
          6,
        );
      }
      occupied.add(pathKey(file.target));
      if (file.installed === null || file.tombstone === true || file.installed !== file.base) {
        throw migrationError(
          `New source target ${file.target} does not provide exact canonical bytes matching its immutable base.`,
          "MODE_MIGRATION_PROVENANCE_INVALID",
          file.target,
          5,
        );
      }
      operations.push({
        operation: "add",
        target: file.target,
        owner: id,
        local: null,
        proposed: file.installed,
        reason:
          "Install the exact matching post-transform canonical source and store its immutable base.",
      });
    }
  }
  const rewriteTargets = new Set(observation.importRewrites.map(({ target }) => pathKey(target)));
  for (const operation of operations) {
    if (rewriteTargets.has(pathKey(operation.target))) {
      throw migrationError(
        `Import rewrite ${operation.target} overlaps a source ownership transition.`,
        "MODE_MIGRATION_TARGET_COLLISION",
        operation.target,
        6,
      );
    }
  }
  return operations.sort((left, right) => compareText(left.target, right.target));
}

function dependencyOperations(
  current: DistributionProvenanceState,
  proposed: DistributionProvenanceState,
  observation: DistributionModeMigrationObservation,
): readonly DistributionModeDependencyOperation[] {
  const keys = [
    ...new Set([
      ...Object.keys(current.dependencyOwnership),
      ...Object.keys(proposed.dependencyOwnership),
    ]),
  ].sort(compareText);
  const operations: DistributionModeDependencyOperation[] = [];
  for (const key of keys) {
    const before = current.dependencyOwnership[key];
    const after = proposed.dependencyOwnership[key];
    if (canonicalJson(before ?? null) === canonicalJson(after ?? null)) continue;
    const name = after?.package ?? before!.package;
    const live = observation.dependencies[name];
    if (before === undefined) {
      if (live !== null && live !== after!.range) {
        throw migrationError(
          `Dependency ${name} conflicts with exact package-mode release ${after!.range}.`,
          "MODE_MIGRATION_DEPENDENCY_CONFLICT",
          "package.json",
          7,
        );
      }
      const expectedRetention = live === null ? "remove-if-unowned" : "retain-if-unowned";
      if (after!.retention !== expectedRetention) {
        throw migrationError(
          `Dependency ${name} ownership would falsely claim a pre-existing or newly added declaration.`,
          "MODE_MIGRATION_OWNERSHIP_INVALID",
          "package.json",
          6,
        );
      }
      operations.push({
        key,
        operation: live === null ? "add" : "ownership-only",
        from: live,
        to: after!.range,
        ownersBefore: [],
        ownersAfter: after!.owners,
        reason:
          live === null
            ? "Add an exact fixed-release dependency and mark it removable only while unchanged and unowned."
            : "Use the exact compatible pre-existing dependency without claiming deletion ownership.",
      });
      continue;
    }
    if (live !== before.range) {
      throw migrationError(
        `Dependency ${name} changed after planning or is not demonstrably owned.`,
        "MODE_MIGRATION_STALE",
        "package.json",
        8,
      );
    }
    if (after === undefined) {
      operations.push({
        key,
        operation: before.retention === "remove-if-unowned" ? "remove" : "retain",
        from: before.range,
        to: before.retention === "remove-if-unowned" ? null : before.range,
        ownersBefore: before.owners,
        ownersAfter: [],
        reason:
          before.retention === "remove-if-unowned"
            ? "Remove an unchanged dependency introduced solely for the final departing Mergora owner."
            : "Retain a pre-existing dependency after its final Mergora owner leaves.",
      });
      continue;
    }
    if (before.range !== after.range) {
      if (before.retention === "retain-if-unowned") {
        throw migrationError(
          `Mode migration cannot replace pre-existing dependency ${name}.`,
          "MODE_MIGRATION_DEPENDENCY_CONFLICT",
          "package.json",
          7,
        );
      }
      operations.push({
        key,
        operation: "change",
        from: before.range,
        to: after.range,
        ownersBefore: before.owners,
        ownersAfter: after.owners,
        reason:
          "Replace an unchanged Mergora-owned dependency with the exact matching mode requirement.",
      });
    } else {
      if (before.retention !== after.retention) {
        throw migrationError(
          `Dependency ${name} retention cannot change without an ownership event.`,
          "MODE_MIGRATION_OWNERSHIP_INVALID",
          "package.json",
          6,
        );
      }
      operations.push({
        key,
        operation: "ownership-only",
        from: before.range,
        to: after.range,
        ownersBefore: before.owners,
        ownersAfter: after.owners,
        reason:
          "Update shared dependency owners without changing authoritative package.json bytes.",
      });
    }
  }
  return operations;
}

function patchProjection(value: DistributionPatchOwnership): unknown {
  return {
    id: value.id,
    adapter: value.adapter,
    target: value.target,
    semanticKey: value.semanticKey,
    ownedValueDigest: value.ownedValueDigest,
  };
}

function patchOperations(
  current: DistributionProvenanceState,
  proposed: DistributionProvenanceState,
  observation: DistributionModeMigrationObservation,
): readonly DistributionModePatchOperation[] {
  const keys = [
    ...new Set([...Object.keys(current.patchOwnership), ...Object.keys(proposed.patchOwnership)]),
  ].sort(compareText);
  const operations: DistributionModePatchOperation[] = [];
  for (const key of keys) {
    const before = current.patchOwnership[key];
    const after = proposed.patchOwnership[key];
    if (canonicalJson(before ?? null) === canonicalJson(after ?? null)) continue;
    const live = observation.patches[key];
    if (before === undefined) {
      if (live !== null && live !== after!.ownedValueDigest) {
        throw migrationError(
          `Structured patch ${key} conflicts with existing project glue.`,
          "MODE_MIGRATION_PATCH_CONFLICT",
          after!.target,
          6,
        );
      }
      const expectedRetention = live === null ? "remove-if-unowned" : "retain-if-unowned";
      if (after!.retention !== expectedRetention) {
        throw migrationError(
          `Structured patch ${key} would claim an unsafe retention policy.`,
          "MODE_MIGRATION_OWNERSHIP_INVALID",
          after!.target,
          6,
        );
      }
      operations.push({
        id: key,
        target: after!.target,
        operation: live === null ? "add" : "ownership-only",
        before: live,
        after: after!.ownedValueDigest,
        ownersBefore: [],
        ownersAfter: after!.owners,
        reason:
          live === null
            ? "Add project glue through a compiled structured adapter."
            : "Adopt equivalent project glue without claiming deletion ownership.",
      });
      continue;
    }
    if (live !== before.ownedValueDigest) {
      throw migrationError(
        `Structured patch ${key} changed after planning or is not demonstrably owned.`,
        "MODE_MIGRATION_STALE",
        before.target,
        8,
      );
    }
    if (after === undefined) {
      operations.push({
        id: key,
        target: before.target,
        operation: before.retention === "remove-if-unowned" ? "remove" : "retain",
        before: before.ownedValueDigest,
        after: before.retention === "remove-if-unowned" ? null : before.ownedValueDigest,
        ownersBefore: before.owners,
        ownersAfter: [],
        reason:
          before.retention === "remove-if-unowned"
            ? "Remove unchanged project glue after its final Mergora owner leaves."
            : "Retain pre-existing project glue after its final Mergora owner leaves.",
      });
      continue;
    }
    if (canonicalJson(patchProjection(before)) !== canonicalJson(patchProjection(after))) {
      if (before.retention === "retain-if-unowned") {
        throw migrationError(
          `Mode migration cannot replace pre-existing structured patch ${key}.`,
          "MODE_MIGRATION_PATCH_CONFLICT",
          before.target,
          6,
        );
      }
      operations.push({
        id: key,
        target: after.target,
        operation: "change",
        before: before.ownedValueDigest,
        after: after.ownedValueDigest,
        ownersBefore: before.owners,
        ownersAfter: after.owners,
        reason:
          "Change project glue only through its compiled structured adapter and exact precondition.",
      });
    } else {
      if (before.retention !== after.retention) {
        throw migrationError(
          `Structured patch ${key} retention cannot change without an ownership event.`,
          "MODE_MIGRATION_OWNERSHIP_INVALID",
          before.target,
          6,
        );
      }
      operations.push({
        id: key,
        target: after.target,
        operation: "ownership-only",
        before: before.ownedValueDigest,
        after: after.ownedValueDigest,
        ownersBefore: before.owners,
        ownersAfter: after.owners,
        reason: "Update shared patch owners without changing authoritative project bytes.",
      });
    }
  }
  return operations;
}

function authenticReleaseMap(
  current: DistributionProvenanceState,
  items: readonly string[],
  releases: readonly AcquiredNativeRegistryRelease[],
): ReadonlyMap<string, AcquiredNativeRegistryRelease> {
  const expected = [...new Set(items.map((id) => current.items[id]!.releaseRef))].sort(compareText);
  const result = new Map<string, AcquiredNativeRegistryRelease>();
  for (const release of releases) {
    assertAuthenticAcquiredNativeRegistryRelease(release);
    const ref = `${release.registry.id}@${release.release}`;
    if (result.has(ref)) {
      throw migrationError(
        `Authentic acquired release ${ref} is duplicated.`,
        "MODE_MIGRATION_ACQUIRED_RELEASE_INVALID",
        ref,
        5,
      );
    }
    result.set(ref, release);
  }
  if (canonicalJson([...result.keys()].sort(compareText)) !== canonicalJson(expected)) {
    throw migrationError(
      "Mode migration acquired releases are incomplete or out of scope.",
      "MODE_MIGRATION_ACQUIRED_RELEASE_INVALID",
      undefined,
      5,
    );
  }
  for (const ref of expected) {
    const pin = current.releases[ref]!;
    const acquired = result.get(ref)!;
    if (
      acquired.registry.id !== pin.registryId ||
      acquired.registry.origin !== pin.origin ||
      acquired.registry.trust !== pin.trust ||
      acquired.registry.identityDigest !== pin.identityDigest ||
      acquired.release !== pin.release ||
      acquired.manifestDigest !== pin.manifestDigest
    ) {
      throw migrationError(
        `Authentic acquired release ${ref} does not match persisted release provenance.`,
        "MODE_MIGRATION_ACQUIRED_RELEASE_INVALID",
        ref,
        5,
      );
    }
  }
  for (const id of items) {
    const installed = current.items[id]!;
    const acquired = result
      .get(installed.releaseRef)!
      .items.find(({ itemId }) => itemId === installed.itemId);
    if (
      acquired === undefined ||
      installed.registry !== result.get(installed.releaseRef)!.registry.id ||
      installed.resolved !== acquired.version ||
      installed.kind !== acquired.kind ||
      installed.payload.url !== acquired.payloadUrl ||
      installed.payload.digest !== acquired.payloadDigest ||
      installed.contractVersion !== acquired.contract.version ||
      canonicalJson(installed.registryDependencies) !==
        canonicalJson([...acquired.registryDependencies].sort(compareText))
    ) {
      throw migrationError(
        `Installed item ${id} does not match its authentic acquired payload and Contract identity.`,
        "MODE_MIGRATION_ACQUIRED_ITEM_INVALID",
        id,
        5,
      );
    }
  }
  return result;
}

function acquiredPackageToSourceBytes(
  current: DistributionProvenanceState,
  proposed: DistributionProvenanceState,
  items: readonly string[],
  manifest: ProvenanceManifest,
  releases: ReadonlyMap<string, AcquiredNativeRegistryRelease>,
): Readonly<Record<string, Uint8Array>> {
  const result: Record<string, Uint8Array> = {};
  const groups = new Map<string, string[]>();
  for (const id of items) {
    const ref = current.items[id]!.releaseRef;
    const group = groups.get(ref) ?? [];
    group.push(id);
    groups.set(ref, group);
  }
  for (const [ref, qualifiedIds] of groups) {
    const transformContexts = Object.fromEntries(
      qualifiedIds.map((id) => {
        const persisted = manifest.items[id];
        if (persisted === undefined) {
          throw migrationError(
            `Current manifest has no transform context for ${id}.`,
            "MODE_MIGRATION_ACQUIRED_ITEM_INVALID",
            MANIFEST_PATH,
            5,
          );
        }
        return [
          id,
          { digest: persisted.transformContextDigest, value: persisted.transformContext },
        ];
      }),
    );
    const projections = deriveAcquiredDistributionSources({
      acquiredRelease: releases.get(ref)!,
      itemIds: qualifiedIds.map((id) => id.slice(id.indexOf(":") + 1)),
      transformContexts,
    });
    for (const projection of projections) {
      const before = current.items[projection.qualifiedId]!;
      const after = proposed.items[projection.qualifiedId]!;
      if (
        canonicalJson(before.importSubpaths) !== canonicalJson(projection.packageImportSubpaths)
      ) {
        throw migrationError(
          `Installed package imports for ${projection.qualifiedId} do not match its authentic acquired payload.`,
          "MODE_MIGRATION_ACQUIRED_ITEM_INVALID",
          projection.qualifiedId,
          5,
        );
      }
      const expectedFiles = projection.files.map((file) => ({
        logicalPath: file.logicalPath,
        target: file.target,
        role: file.role,
        base: file.digest,
        installed: file.digest,
        mediaType: file.mediaType,
        executable: false as const,
      }));
      const expected = {
        registry: before.registry,
        itemId: projection.itemId,
        kind: projection.kind,
        requested: before.requested,
        resolved: projection.resolved,
        releaseRef: projection.releaseRef,
        payload: projection.payload,
        mode: "source" as const,
        direct: before.direct,
        files: expectedFiles,
        packageClaims: [] as const,
        importSubpaths: [] as const,
        registryDependencies: projection.registryDependencies,
        dependencies: projection.dependencies,
        structuredPatches: projection.structuredPatches,
        contractVersion: projection.contractVersion,
        lastMigration: "mode-package-to-source-v1",
      };
      if (canonicalJson(after) !== canonicalJson(expected)) {
        throw migrationError(
          `Proposed source item ${projection.qualifiedId} is not exactly derived from its authentic acquired payload.`,
          "MODE_MIGRATION_ACQUIRED_SOURCE_MISMATCH",
          projection.qualifiedId,
          5,
        );
      }
      for (const file of projection.files) result[file.target] = Buffer.from(file.bytes);
    }
  }
  return result;
}

function prepareDistributionModeMigration(
  options: DistributionModeMigrationOptions,
): PreparedDistributionModeMigration {
  const current = serializeDistributionProvenance(options.currentState);
  const proposed = serializeDistributionProvenance(options.proposedState);
  assertDistributionConfigurationBinding(current.state, options.configuration);
  assertDistributionConfigurationBinding(proposed.state, options.configuration);
  const items = checkedItems(options.itemIds);
  const observation = checkedObservation(options.observation);
  if (observation.stateDigest !== current.canonicalDigest) {
    throw migrationError(
      "Distribution provenance changed after observation; re-plan from current state.",
      "MODE_MIGRATION_STALE",
      undefined,
      8,
    );
  }
  assertStateTransition(current.state, proposed.state, items, options.from, options.to);
  const currentManifest = checkedManifestProjection(
    options.currentManifestBytes,
    current.canonicalDigest,
    "Current manifest",
  ).manifest;
  const acquiredReleases = authenticReleaseMap(current.state, items, options.acquiredReleases);
  const acquiredSourceBytes =
    options.from === "package" && options.to === "source"
      ? acquiredPackageToSourceBytes(
          current.state,
          proposed.state,
          items,
          currentManifest,
          acquiredReleases,
        )
      : {};
  const files = fileOperations(current.state, proposed.state, items, observation);
  const dependencies = dependencyOperations(current.state, proposed.state, observation);
  const patches = patchOperations(current.state, proposed.state, observation);
  const releaseRefs = [...new Set(items.map((id) => current.state.items[id]!.releaseRef))].sort(
    compareText,
  );
  const migrationPlan: DistributionModeMigrationPlan = {
    schemaVersion: 1 as const,
    command: "migrate-mode" as const,
    migrationId:
      `mode-${options.from}-to-${options.to}-v1` as DistributionModeMigrationPlan["migrationId"],
    from: options.from,
    to: options.to,
    items,
    statePreconditionDigest: current.canonicalDigest,
    proposedStateDigest: proposed.canonicalDigest,
    releases: releaseRefs.map((ref) => {
      const release = current.state.releases[ref]!;
      return {
        ref,
        identityDigest: release.identityDigest,
        manifestDigest: release.manifestDigest,
        release: release.release,
      };
    }),
    fileOperations: files,
    dependencyOperations: dependencies,
    patchOperations: patches,
    importRewrites: observation.importRewrites,
    validationRequirements: [
      "package-integrity",
      "typescript-imports",
      "consumer-type-imports",
      "structured-patch-adapters",
      "accessibility-contracts",
    ] as const,
    manifestCommitOrder: "last" as const,
    rollbackRequired: true as const,
    externalExecutableCodeUsed: false as const,
  };
  return {
    migrationPlan: structuredClone(migrationPlan),
    currentState: structuredClone(current.state),
    proposedState: structuredClone(proposed.state),
    acquiredSourceBytes: Object.fromEntries(
      Object.entries(acquiredSourceBytes).map(([target, bytes]) => [target, Buffer.from(bytes)]),
    ),
    acquiredReleases: [...acquiredReleases.values()],
  };
}

function assertPreparedMigrationIntegrity(prepared: PreparedDistributionModeMigration): void {
  const current = serializeDistributionProvenance(prepared.currentState);
  const proposed = serializeDistributionProvenance(prepared.proposedState);
  const plan = prepared.migrationPlan;
  if (
    current.canonicalDigest !== plan.statePreconditionDigest ||
    proposed.canonicalDigest !== plan.proposedStateDigest
  ) {
    throw migrationError(
      "Mode migration prepared state or plan digest was forged or changed.",
      "MODE_MIGRATION_PREPARED_INVALID",
      undefined,
      8,
    );
  }
  const items = checkedItems(plan.items);
  if (canonicalJson(items) !== canonicalJson(plan.items)) {
    throw migrationError(
      "Mode migration prepared item order is not canonical.",
      "MODE_MIGRATION_PREPARED_INVALID",
      undefined,
      8,
    );
  }
  assertStateTransition(current.state, proposed.state, items, plan.from, plan.to);

  const sourceFiles: Record<string, DistributionDigest | null> = {};
  for (const operation of plan.fileOperations) {
    if (Object.hasOwn(sourceFiles, operation.target)) {
      throw migrationError(
        `Mode migration prepared source target ${operation.target} is duplicated.`,
        "MODE_MIGRATION_PREPARED_INVALID",
        operation.target,
        8,
      );
    }
    sourceFiles[operation.target] = operation.local;
  }
  const dependencies: Record<string, string | null> = {};
  for (const operation of plan.dependencyOperations) {
    const [, ...parts] = operation.key.split(":");
    const name = parts.join(":");
    if (Object.hasOwn(dependencies, name) && dependencies[name] !== operation.from) {
      throw migrationError(
        `Mode migration prepared dependency ${name} has conflicting preconditions.`,
        "MODE_MIGRATION_PREPARED_INVALID",
        "package.json",
        8,
      );
    }
    dependencies[name] = operation.from;
  }
  const patches = Object.fromEntries(
    plan.patchOperations.map((operation) => [operation.id, operation.before]),
  );
  const projectFiles = Object.fromEntries(
    plan.importRewrites.map((rewrite) => [rewrite.target, rewrite.before]),
  );
  const rewrites = checkedRewrites(plan.importRewrites, projectFiles);
  const reconstructedObservation: DistributionModeMigrationObservation = {
    stateDigest: current.canonicalDigest,
    unresolvedTransactions: [],
    sourceFiles,
    dependencies,
    patches,
    projectFiles,
    importRewrites: rewrites,
  };
  const releaseRefs = [...new Set(items.map((id) => current.state.items[id]!.releaseRef))].sort(
    compareText,
  );
  const expectedPlan: DistributionModeMigrationPlan = {
    schemaVersion: 1,
    command: "migrate-mode",
    migrationId:
      `mode-${plan.from}-to-${plan.to}-v1` as DistributionModeMigrationPlan["migrationId"],
    from: plan.from,
    to: plan.to,
    items,
    statePreconditionDigest: current.canonicalDigest,
    proposedStateDigest: proposed.canonicalDigest,
    releases: releaseRefs.map((ref) => {
      const release = current.state.releases[ref]!;
      return {
        ref,
        identityDigest: release.identityDigest,
        manifestDigest: release.manifestDigest,
        release: release.release,
      };
    }),
    fileOperations: fileOperations(current.state, proposed.state, items, reconstructedObservation),
    dependencyOperations: dependencyOperations(
      current.state,
      proposed.state,
      reconstructedObservation,
    ),
    patchOperations: patchOperations(current.state, proposed.state, reconstructedObservation),
    importRewrites: rewrites,
    validationRequirements: [
      "package-integrity",
      "typescript-imports",
      "consumer-type-imports",
      "structured-patch-adapters",
      "accessibility-contracts",
    ],
    manifestCommitOrder: "last",
    rollbackRequired: true,
    externalExecutableCodeUsed: false,
  };
  if (canonicalJson(plan) !== canonicalJson(expectedPlan)) {
    throw migrationError(
      "Mode migration prepared operations do not match their fixed state transition.",
      "MODE_MIGRATION_PREPARED_INVALID",
      undefined,
      8,
    );
  }
}

function digestOrNull(value: Uint8Array | null): DistributionDigest | null {
  return value === null ? null : sha256(value);
}

function sameBytes(left: Uint8Array | null, right: Uint8Array | null): boolean {
  if (left === null || right === null) return left === right;
  return Buffer.from(left).equals(Buffer.from(right));
}

function utf8Text(bytes: Uint8Array, target: string): string {
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    throw migrationError(
      `Mode migration target ${target} is not valid UTF-8.`,
      "MODE_MIGRATION_MATERIALIZATION_INVALID",
      target,
      8,
    );
  }
}

function jsonObject(bytes: Uint8Array, target: string): Record<string, unknown> {
  let parsed: unknown;
  try {
    parsed = JSON.parse(utf8Text(bytes, target)) as unknown;
  } catch (error) {
    if (error instanceof CliError) throw error;
    throw migrationError(
      `Mode migration target ${target} is not valid JSON.`,
      "MODE_MIGRATION_MATERIALIZATION_INVALID",
      target,
      8,
    );
  }
  if (parsed === null || Array.isArray(parsed) || typeof parsed !== "object") {
    throw migrationError(
      `Mode migration target ${target} must contain a JSON object.`,
      "MODE_MIGRATION_MATERIALIZATION_INVALID",
      target,
      8,
    );
  }
  return parsed as Record<string, unknown>;
}

function dependencyMap(
  packageJson: Record<string, unknown>,
  scope: "runtime" | "development",
  create: boolean,
): Record<string, unknown> | undefined {
  const key = scope === "runtime" ? "dependencies" : "devDependencies";
  const value = packageJson[key];
  if (value === undefined && create) {
    const result: Record<string, unknown> = {};
    packageJson[key] = result;
    return result;
  }
  if (value === undefined) return undefined;
  if (value === null || Array.isArray(value) || typeof value !== "object") {
    throw migrationError(
      `package.json ${key} must be an object during mode migration.`,
      "MODE_MIGRATION_PACKAGE_JSON_SCOPE_INVALID",
      "package.json",
      8,
    );
  }
  return value as Record<string, unknown>;
}

function semanticDependencyValue(
  packageJson: Record<string, unknown>,
  scope: "runtime" | "development",
  name: string,
): string | null {
  const value = dependencyMap(packageJson, scope, false)?.[name];
  return typeof value === "string" ? value : null;
}

function assertPackageJsonMaterialization(
  beforeBytes: Uint8Array | null,
  afterBytes: Uint8Array | null,
  dependencyChanges: readonly DistributionModeDependencyOperation[],
  patchChanges: readonly DistributionModePatchOperation[],
  current: DistributionProvenanceState,
  proposed: DistributionProvenanceState,
): void {
  if (beforeBytes === null || afterBytes === null) {
    throw migrationError(
      "Mode migration cannot add or delete package.json.",
      "MODE_MIGRATION_PACKAGE_JSON_SCOPE_INVALID",
      "package.json",
      8,
    );
  }
  const before = jsonObject(beforeBytes, "package.json");
  const after = jsonObject(afterBytes, "package.json");
  const expected = structuredClone(before);
  const operations = new Map<string, DistributionModeDependencyOperation>();
  for (const operation of dependencyChanges) {
    if (operations.has(operation.key)) {
      throw migrationError(
        `Dependency operation ${operation.key} is duplicated.`,
        "MODE_MIGRATION_PREPARED_INVALID",
        "package.json",
        8,
      );
    }
    operations.set(operation.key, operation);
    const [scopeValue, ...parts] = operation.key.split(":");
    const scope = scopeValue as "runtime" | "development";
    const name = parts.join(":");
    const actualBefore = semanticDependencyValue(before, scope, name);
    if (actualBefore !== operation.from) {
      throw migrationError(
        `Dependency ${operation.key} changed after planning.`,
        "MODE_MIGRATION_STALE",
        "package.json",
        8,
      );
    }
    const map = dependencyMap(expected, scope, operation.to !== null);
    if (operation.operation === "add" || operation.operation === "change") {
      map![name] = operation.to;
    } else if (operation.operation === "remove") {
      if (map !== undefined) delete map[name];
    }
    const actualAfter = semanticDependencyValue(after, scope, name);
    if (actualAfter !== operation.to) {
      throw migrationError(
        `Dependency ${operation.key} does not match its reviewed operation.`,
        "MODE_MIGRATION_PACKAGE_JSON_SCOPE_INVALID",
        "package.json",
        8,
      );
    }
  }
  if (canonicalJson(after) !== canonicalJson(expected)) {
    throw migrationError(
      "package.json contains changes outside the reviewed dependency operations.",
      "MODE_MIGRATION_PACKAGE_JSON_SCOPE_INVALID",
      "package.json",
      8,
    );
  }
  for (const operation of patchChanges) {
    const beforeOwnership = current.patchOwnership[operation.id];
    const afterOwnership = proposed.patchOwnership[operation.id];
    const ownership = afterOwnership ?? beforeOwnership;
    if (
      ownership === undefined ||
      ownership.adapter !== "package-dependency" ||
      ownership.target !== "package.json"
    ) {
      throw migrationError(
        `Structured patch ${operation.id} uses an unsupported mode-migration adapter.`,
        "MODE_MIGRATION_PATCH_ADAPTER_UNSUPPORTED",
        operation.target,
        7,
      );
    }
    const match = /^(dependencies|devDependencies)\.(.+)$/u.exec(ownership.semanticKey);
    if (match === null || !PACKAGE_NAME.test(match[2]!)) {
      throw migrationError(
        `Structured patch ${operation.id} has an unsupported dependency semantic key.`,
        "MODE_MIGRATION_PATCH_ADAPTER_UNSUPPORTED",
        operation.target,
        7,
      );
    }
    const scope = match[1] === "dependencies" ? "runtime" : "development";
    const name = match[2]!;
    const dependency = operations.get(`${scope}:${name}`);
    if (dependency === undefined) {
      throw migrationError(
        `Structured patch ${operation.id} is not bound to a reviewed dependency operation.`,
        "MODE_MIGRATION_PATCH_ADAPTER_UNSUPPORTED",
        operation.target,
        7,
      );
    }
    const beforeValue = semanticDependencyValue(before, scope, name);
    const afterValue = semanticDependencyValue(after, scope, name);
    if (
      (beforeValue === null ? null : sha256(beforeValue)) !== operation.before ||
      (afterValue === null ? null : sha256(afterValue)) !== operation.after
    ) {
      throw migrationError(
        `Structured patch ${operation.id} semantic precondition or result is stale.`,
        "MODE_MIGRATION_STALE",
        operation.target,
        8,
      );
    }
  }
}

interface TypeScriptModuleSpecifier {
  readonly kind: string;
  readonly start: number;
  readonly end: number;
  readonly value: string;
  readonly quote: '"' | "'";
}

function typescriptModuleSpecifiers(
  bytes: Uint8Array,
  target: string,
): readonly TypeScriptModuleSpecifier[] {
  const text = utf8Text(bytes, target);
  const scriptKind = /\.tsx$/iu.test(target) ? ts.ScriptKind.TSX : ts.ScriptKind.TS;
  const source = ts.createSourceFile(target, text, ts.ScriptTarget.Latest, true, scriptKind);
  const diagnostics = (
    source as ts.SourceFile & { readonly parseDiagnostics?: readonly ts.Diagnostic[] }
  ).parseDiagnostics;
  if ((diagnostics?.length ?? 0) > 0) {
    throw migrationError(
      `TypeScript import target ${target} does not parse.`,
      "MODE_MIGRATION_IMPORT_PARSE_FAILED",
      target,
      7,
    );
  }
  const result: TypeScriptModuleSpecifier[] = [];
  const append = (node: ts.StringLiteralLike, kind: string): void => {
    const start = node.getStart(source);
    const end = node.getEnd();
    const quote = text[start];
    if ((quote !== '"' && quote !== "'") || text[end - 1] !== quote) {
      throw migrationError(
        `TypeScript import target ${target} uses an unsupported module literal.`,
        "MODE_MIGRATION_IMPORT_REWRITE_INVALID",
        target,
        7,
      );
    }
    result.push({ kind, start, end, value: node.text, quote });
  };
  const visit = (node: ts.Node): void => {
    if (ts.isImportDeclaration(node) && ts.isStringLiteralLike(node.moduleSpecifier)) {
      append(node.moduleSpecifier, "import");
    } else if (
      ts.isExportDeclaration(node) &&
      node.moduleSpecifier !== undefined &&
      ts.isStringLiteralLike(node.moduleSpecifier)
    ) {
      append(node.moduleSpecifier, "export");
    } else if (
      ts.isImportEqualsDeclaration(node) &&
      ts.isExternalModuleReference(node.moduleReference) &&
      node.moduleReference.expression !== undefined &&
      ts.isStringLiteralLike(node.moduleReference.expression)
    ) {
      append(node.moduleReference.expression, "import-equals");
    } else if (
      ts.isCallExpression(node) &&
      node.arguments.length === 1 &&
      ts.isStringLiteralLike(node.arguments[0]!) &&
      (node.expression.kind === ts.SyntaxKind.ImportKeyword ||
        (ts.isIdentifier(node.expression) && node.expression.text === "require"))
    ) {
      append(
        node.arguments[0]!,
        node.expression.kind === ts.SyntaxKind.ImportKeyword ? "dynamic" : "require",
      );
    } else if (
      ts.isImportTypeNode(node) &&
      ts.isLiteralTypeNode(node.argument) &&
      ts.isStringLiteralLike(node.argument.literal)
    ) {
      append(node.argument.literal, "import-type");
    }
    ts.forEachChild(node, visit);
  };
  visit(source);
  return result.sort((left, right) => left.start - right.start);
}

function withoutTypeScriptExtension(value: string): string {
  return value.replace(/(?:\.d)?\.(?:[cm]?[jt]sx?)$/iu, "").replace(/\/index$/u, "");
}

function sourceImportSpecifiers(item: ProvenanceManifest["items"][string]): readonly string[] {
  const result = new Set<string>();
  for (const [key, root] of Object.entries(item.transformContext.targets)) {
    const alias = item.transformContext.aliases[key];
    if (alias === undefined) continue;
    const normalizedRoot = root.replaceAll("\\", "/").replace(/\/$/u, "");
    const normalizedAlias = alias.replace(/\/$/u, "");
    for (const file of item.files) {
      const target = file.target.replaceAll("\\", "/");
      if (target === normalizedRoot || target.startsWith(`${normalizedRoot}/`)) {
        const suffix = withoutTypeScriptExtension(target.slice(normalizedRoot.length));
        result.add(`${normalizedAlias}${suffix}`);
      }
    }
  }
  return [...result].sort(compareText);
}

function allowedImportTransitions(
  prepared: PreparedDistributionModeMigration,
  currentManifest: ProvenanceManifest,
  proposedManifest: ProvenanceManifest,
): ReadonlySet<string> {
  const result = new Set<string>();
  for (const id of prepared.migrationPlan.items) {
    const beforeItem = prepared.currentState.items[id]!;
    const afterItem = prepared.proposedState.items[id]!;
    const sourceManifest =
      prepared.migrationPlan.from === "source"
        ? currentManifest.items[id]
        : proposedManifest.items[id];
    const source = sourceImportSpecifiers(sourceManifest!);
    const packages =
      prepared.migrationPlan.from === "package"
        ? beforeItem.importSubpaths
        : afterItem.importSubpaths;
    for (const sourceSpecifier of source) {
      for (const packageSpecifier of packages) {
        const before =
          prepared.migrationPlan.from === "source" ? sourceSpecifier : packageSpecifier;
        const after = prepared.migrationPlan.to === "package" ? packageSpecifier : sourceSpecifier;
        result.add(`${before}\u0000${after}`);
      }
    }
  }
  return result;
}

function assertTypeScriptImportMaterialization(
  target: string,
  beforeBytes: Uint8Array | null,
  afterBytes: Uint8Array | null,
  allowed: ReadonlySet<string>,
): void {
  if (beforeBytes === null || afterBytes === null) {
    throw migrationError(
      `TypeScript import rewrite ${target} cannot add or delete its consumer file.`,
      "MODE_MIGRATION_IMPORT_REWRITE_INVALID",
      target,
      8,
    );
  }
  const beforeText = utf8Text(beforeBytes, target);
  const afterText = utf8Text(afterBytes, target);
  const before = typescriptModuleSpecifiers(beforeBytes, target);
  const after = typescriptModuleSpecifiers(afterBytes, target);
  if (
    before.length !== after.length ||
    before.some((specifier, index) => specifier.kind !== after[index]!.kind)
  ) {
    throw migrationError(
      `TypeScript import rewrite ${target} changed import structure.`,
      "MODE_MIGRATION_IMPORT_REWRITE_INVALID",
      target,
      8,
    );
  }
  let changed = 0;
  let cursor = 0;
  let expected = "";
  for (let index = 0; index < before.length; index += 1) {
    const previous = before[index]!;
    const next = after[index]!;
    expected += beforeText.slice(cursor, previous.start);
    if (previous.value === next.value) {
      expected += beforeText.slice(previous.start, previous.end);
    } else {
      if (previous.quote !== next.quote || !allowed.has(`${previous.value}\u0000${next.value}`)) {
        throw migrationError(
          `TypeScript import rewrite ${target} contains an unreviewed module transition.`,
          "MODE_MIGRATION_IMPORT_REWRITE_INVALID",
          target,
          8,
        );
      }
      expected += `${previous.quote}${next.value}${previous.quote}`;
      changed += 1;
    }
    cursor = previous.end;
  }
  expected += beforeText.slice(cursor);
  if (changed === 0 || expected !== afterText) {
    throw migrationError(
      `TypeScript import rewrite ${target} changed bytes outside reviewed module specifiers.`,
      "MODE_MIGRATION_IMPORT_REWRITE_INVALID",
      target,
      8,
    );
  }
}

function checkedManifestProjection(
  bytes: Uint8Array,
  expected: DistributionDigest,
  label: string,
): { readonly manifest: ProvenanceManifest; readonly bytes: Buffer } {
  const manifest = parseManifestBytes(bytes);
  const canonical = manifestBytes(manifest);
  if (!canonical.equals(Buffer.from(bytes))) {
    throw migrationError(
      `${label} must use the deterministic manifest serializer.`,
      "MODE_MIGRATION_MANIFEST_NONCANONICAL",
      MANIFEST_PATH,
      5,
    );
  }
  const distribution = distributionProvenanceFromManifest(manifest);
  if (distribution === null || distribution.canonicalDigest !== expected) {
    throw migrationError(
      `${label} is not bound to the reviewed distribution state.`,
      "MODE_MIGRATION_MANIFEST_STATE_MISMATCH",
      MANIFEST_PATH,
      8,
    );
  }
  return { manifest, bytes: canonical };
}

function assertManifestTransitionScope(
  current: ProvenanceManifest,
  proposed: ProvenanceManifest,
): void {
  if (
    current.$schema !== proposed.$schema ||
    current.schemaVersion !== proposed.schemaVersion ||
    current.projectId !== proposed.projectId ||
    canonicalJson(current.toolchain) !== canonicalJson(proposed.toolchain)
  ) {
    throw migrationError(
      "Mode migration cannot change manifest identity or toolchain provenance.",
      "MODE_MIGRATION_MANIFEST_SCOPE_INVALID",
      MANIFEST_PATH,
      5,
    );
  }
  for (const id of Object.keys(current.items)) {
    const before = current.items[id];
    const after = proposed.items[id];
    if (
      before === undefined ||
      after === undefined ||
      before.transformContextDigest !== after.transformContextDigest ||
      canonicalJson(before.transformContext) !== canonicalJson(after.transformContext)
    ) {
      throw migrationError(
        `Mode migration cannot change transform context for ${id}.`,
        "MODE_MIGRATION_MANIFEST_SCOPE_INVALID",
        MANIFEST_PATH,
        5,
      );
    }
  }
}

function targetMaterializations(
  options: DistributionModeTransactionOptions,
  currentManifest: ProvenanceManifest,
  proposedManifest: ProvenanceManifest,
): Readonly<Record<string, DistributionModeTargetMaterialization>> {
  const required = new Set<string>();
  for (const operation of options.prepared.migrationPlan.fileOperations)
    required.add(operation.target);
  for (const rewrite of options.prepared.migrationPlan.importRewrites) required.add(rewrite.target);
  if (
    options.prepared.migrationPlan.dependencyOperations.length > 0 ||
    options.prepared.migrationPlan.patchOperations.length > 0
  ) {
    required.add("package.json");
  }
  for (const operation of options.prepared.migrationPlan.patchOperations) {
    const ownership =
      options.prepared.proposedState.patchOwnership[operation.id] ??
      options.prepared.currentState.patchOwnership[operation.id];
    if (
      ownership === undefined ||
      ownership.adapter !== "package-dependency" ||
      operation.target !== "package.json"
    ) {
      throw migrationError(
        `Structured patch ${operation.id} uses an unsupported mode-migration adapter.`,
        "MODE_MIGRATION_PATCH_ADAPTER_UNSUPPORTED",
        operation.target,
        7,
      );
    }
  }
  const supplied = Object.keys(options.targets).sort(compareText);
  const expected = [...required].sort(compareText);
  if (canonicalJson(supplied) !== canonicalJson(expected)) {
    throw migrationError(
      "Mode migration target bytes are incomplete or exceed the reviewed scope.",
      "MODE_MIGRATION_MATERIALIZATION_SCOPE_INVALID",
      undefined,
      8,
    );
  }
  const portable = new Set<string>();
  const result: Record<string, DistributionModeTargetMaterialization> = {};
  for (const target of supplied) {
    assertPortableRelativePath(target, "Mode migration target");
    if (target === MANIFEST_PATH || target.startsWith(".mergora/bases/")) {
      throw migrationError(
        `Mode migration target ${target} is reserved for provenance materialization.`,
        "MODE_MIGRATION_MATERIALIZATION_SCOPE_INVALID",
        target,
        5,
      );
    }
    const key = pathKey(target);
    if (portable.has(key)) {
      throw migrationError(
        "Mode migration target materialization contains a portable collision.",
        "MODE_MIGRATION_TARGET_COLLISION",
        target,
        6,
      );
    }
    portable.add(key);
    const candidate = options.targets[target]!;
    if (sameBytes(candidate.before, candidate.after) && target !== "package.json") {
      throw migrationError(
        `Mode migration target ${target} is an unreviewed no-op.`,
        "MODE_MIGRATION_MATERIALIZATION_INVALID",
        target,
        8,
      );
    }
    result[target] = {
      before: candidate.before === null ? null : Buffer.from(candidate.before),
      after: candidate.after === null ? null : Buffer.from(candidate.after),
    };
  }
  for (const operation of options.prepared.migrationPlan.fileOperations) {
    const value = result[operation.target]!;
    if (
      digestOrNull(value.before) !== operation.local ||
      digestOrNull(value.after) !== operation.proposed
    ) {
      throw migrationError(
        `Mode migration source bytes for ${operation.target} do not match the reviewed digests.`,
        "MODE_MIGRATION_MATERIALIZATION_DIGEST_MISMATCH",
        operation.target,
        8,
      );
    }
    const acquired = options.prepared.acquiredSourceBytes[operation.target];
    if (
      operation.operation === "add" &&
      (acquired === undefined ||
        value.after === null ||
        !Buffer.from(value.after).equals(Buffer.from(acquired)))
    ) {
      throw migrationError(
        `Mode migration source bytes for ${operation.target} are not the authentic acquired payload bytes.`,
        "MODE_MIGRATION_ACQUIRED_SOURCE_MISMATCH",
        operation.target,
        5,
      );
    }
  }
  for (const rewrite of options.prepared.migrationPlan.importRewrites) {
    const value = result[rewrite.target]!;
    if (
      digestOrNull(value.before) !== rewrite.before ||
      digestOrNull(value.after) !== rewrite.after
    ) {
      throw migrationError(
        `Mode migration import bytes for ${rewrite.target} do not match the compiled rewrite.`,
        "MODE_MIGRATION_MATERIALIZATION_DIGEST_MISMATCH",
        rewrite.target,
        8,
      );
    }
  }
  if (required.has("package.json")) {
    const packageJson = result["package.json"]!;
    assertPackageJsonMaterialization(
      packageJson.before,
      packageJson.after,
      options.prepared.migrationPlan.dependencyOperations,
      options.prepared.migrationPlan.patchOperations,
      options.prepared.currentState,
      options.prepared.proposedState,
    );
  }
  const allowedImports = allowedImportTransitions(
    options.prepared,
    currentManifest,
    proposedManifest,
  );
  for (const rewrite of options.prepared.migrationPlan.importRewrites) {
    const value = result[rewrite.target]!;
    assertTypeScriptImportMaterialization(
      rewrite.target,
      value.before,
      value.after,
      allowedImports,
    );
  }
  return result;
}

function baseMaterializations(
  options: DistributionModeTransactionOptions,
): Readonly<
  Record<DistributionDigest, DistributionModeBaseMaterialization & { readonly target: string }>
> {
  const required = new Set<DistributionDigest>();
  for (const operation of options.prepared.migrationPlan.fileOperations) {
    if (operation.operation !== "add") continue;
    const item = options.prepared.proposedState.items[operation.owner]!;
    const file = item.files.find(({ target }) => target === operation.target);
    if (file === undefined) {
      throw migrationError(
        `Mode migration source base for ${operation.target} is absent from provenance.`,
        "MODE_MIGRATION_PROVENANCE_INVALID",
        operation.target,
        5,
      );
    }
    required.add(file.base);
  }
  const supplied = Object.keys(options.bases).sort(compareText) as DistributionDigest[];
  const expected = [...required].sort(compareText);
  if (canonicalJson(supplied) !== canonicalJson(expected)) {
    throw migrationError(
      "Mode migration base bytes are incomplete or exceed the reviewed source transition.",
      "MODE_MIGRATION_BASE_SCOPE_INVALID",
      undefined,
      8,
    );
  }
  const result: Record<
    DistributionDigest,
    DistributionModeBaseMaterialization & { readonly target: string }
  > = {};
  for (const digest of supplied) {
    if (!DIGEST.test(digest)) {
      throw migrationError(
        "Mode migration base key is not an exact digest.",
        "MODE_MIGRATION_DIGEST_INVALID",
        undefined,
        5,
      );
    }
    const value = options.bases[digest]!;
    if (
      sha256(value.content) !== digest ||
      (value.before !== null && sha256(value.before) !== digest)
    ) {
      throw migrationError(
        `Mode migration immutable base ${digest} failed digest verification.`,
        "MODE_MIGRATION_BASE_DIGEST_MISMATCH",
        basePath(digest),
        5,
      );
    }
    result[digest] = {
      before: value.before === null ? null : Buffer.from(value.before),
      content: Buffer.from(value.content),
      target: basePath(digest),
    };
  }
  return result;
}

function packageIntegrityPayloads(
  prepared: PreparedDistributionModeMigration,
  packageIntegrityEvidence: readonly DistributionModePackageIntegrityEvidence[],
): readonly TransactionRegistryPayload[] {
  const claims = new Map<
    string,
    {
      readonly releaseRef: string;
      readonly package: string;
      readonly registry: string;
      readonly release: string;
      readonly version: string;
      readonly digest: DistributionDigest;
      readonly url: string;
      readonly integrity: `sha512-${string}`;
      readonly license: string;
      readonly bytes: number;
    }
  >();
  const acquiredByRef = new Map<string, AcquiredNativeRegistryRelease>();
  for (const acquired of prepared.acquiredReleases) {
    assertAuthenticAcquiredNativeRegistryRelease(acquired);
    acquiredByRef.set(`${acquired.registry.id}@${acquired.release}`, acquired);
  }
  for (const id of prepared.migrationPlan.items) {
    const before = prepared.currentState.items[id]!;
    const after = prepared.proposedState.items[id]!;
    for (const name of [...before.packageClaims, ...after.packageClaims]) {
      const releaseRef = before.releaseRef;
      const release = prepared.currentState.releases[releaseRef]!;
      const artifact = release.packages[name];
      const acquired = acquiredByRef.get(releaseRef);
      const inventory = acquired?.npmPackageInventory?.entries.find(
        (candidate) => candidate.package === name,
      );
      if (
        artifact === undefined ||
        acquired === undefined ||
        inventory === undefined ||
        inventory.disposition !== "include" ||
        inventory.version !== artifact.version ||
        inventory.digest !== artifact.tarballDigest
      ) {
        throw migrationError(
          `Selected package claim ${name} has no exact included npm inventory entry in authentic release ${releaseRef}.`,
          "MODE_MIGRATION_PACKAGE_INTEGRITY_INVALID",
          name,
          5,
        );
      }
      claims.set(`${releaseRef}\u0000${name}`, {
        releaseRef,
        package: name,
        registry: release.registryId,
        release: release.release,
        version: artifact.version,
        digest: artifact.tarballDigest,
        url: inventory.url,
        integrity: inventory.integrity,
        license: inventory.license,
        bytes: inventory.bytes,
      });
    }
  }
  const evidence = new Map<string, DistributionModePackageIntegrityEvidence>();
  for (const entry of packageIntegrityEvidence) {
    const key = `${entry.releaseRef}\u0000${entry.package}`;
    if (evidence.has(key)) {
      throw migrationError(
        `Package integrity evidence ${entry.releaseRef}:${entry.package} is duplicated.`,
        "MODE_MIGRATION_PACKAGE_INTEGRITY_INVALID",
        entry.package,
        5,
      );
    }
    evidence.set(key, entry);
  }
  const expectedKeys = [...claims.keys()].sort(compareText);
  const suppliedKeys = [...evidence.keys()].sort(compareText);
  if (canonicalJson(expectedKeys) !== canonicalJson(suppliedKeys)) {
    throw migrationError(
      "Mode migration package integrity evidence is incomplete or out of scope.",
      "MODE_MIGRATION_PACKAGE_INTEGRITY_INVALID",
      undefined,
      5,
    );
  }
  const urls = new Set<string>();
  return expectedKeys.map((key) => {
    const claim = claims.get(key)!;
    const entry = evidence.get(key)!;
    let url: URL;
    try {
      url = new URL(entry.url);
    } catch {
      throw migrationError(
        `Package integrity URL for ${entry.package} is invalid.`,
        "MODE_MIGRATION_PACKAGE_INTEGRITY_INVALID",
        entry.package,
        5,
      );
    }
    if (
      entry.releaseRef !== claim.releaseRef ||
      entry.package !== claim.package ||
      entry.version !== claim.version ||
      entry.url !== claim.url ||
      entry.bytes.byteLength !== claim.bytes ||
      url.protocol !== "https:" ||
      url.username !== "" ||
      url.password !== "" ||
      url.search !== "" ||
      url.hash !== "" ||
      urls.has(url.href)
    ) {
      throw migrationError(
        `Package integrity evidence for ${entry.package}@${entry.version} does not match the selected fixed release.`,
        "MODE_MIGRATION_PACKAGE_INTEGRITY_INVALID",
        entry.package,
        5,
      );
    }
    try {
      validateStableNpmTarballBytes(
        {
          package: claim.package,
          version: claim.version,
          url: claim.url,
          digest: claim.digest,
          integrity: claim.integrity,
          license: claim.license,
          bytes: claim.bytes,
        },
        entry.bytes,
        claim.bytes,
      );
    } catch (error) {
      throw migrationError(
        error instanceof Error
          ? `Package integrity evidence for ${entry.package}@${entry.version} failed archive validation: ${error.message}`
          : `Package integrity evidence for ${entry.package}@${entry.version} failed archive validation.`,
        "MODE_MIGRATION_PACKAGE_INTEGRITY_INVALID",
        entry.package,
        5,
      );
    }
    urls.add(url.href);
    return {
      registry: claim.registry,
      release: claim.release,
      url: url.href,
      digest: claim.digest,
    };
  });
}

function packageDependencyValue(
  bytes: Buffer | null,
  scope: "runtime" | "development",
  name: string,
): string | null {
  if (bytes === null) return null;
  let value: unknown;
  try {
    value = JSON.parse(bytes.toString("utf8")) as unknown;
  } catch {
    return null;
  }
  if (value === null || Array.isArray(value) || typeof value !== "object") return null;
  const map = (value as Record<string, unknown>)[
    scope === "runtime" ? "dependencies" : "devDependencies"
  ];
  if (map === null || Array.isArray(map) || typeof map !== "object") return null;
  const candidate = (map as Record<string, unknown>)[name];
  return typeof candidate === "string" ? candidate : null;
}

function validationResult(
  summary: string,
  issues: readonly TransactionValidationIssue[],
): TransactionValidationResult {
  return issues.length === 0 ? { state: "pass", summary } : { state: "fail", summary, issues };
}

function distributionTransactionValidators(
  proposedState: DistributionProvenanceState,
  exactTargets: Readonly<Record<string, DistributionModeTargetMaterialization>>,
  bases: Readonly<
    Record<DistributionDigest, DistributionModeBaseMaterialization & { readonly target: string }>
  >,
  dependencyOperations: readonly DistributionModeDependencyOperation[],
): readonly TransactionValidator[] {
  const validateManifest = (context: TransactionValidationContext): TransactionValidationResult => {
    const issues: TransactionValidationIssue[] = [];
    const bytes = context.readFile(MANIFEST_PATH);
    if (bytes === null) {
      issues.push({
        code: "MODE_MIGRATION_MANIFEST_MISSING",
        target: MANIFEST_PATH,
        message: "The proposed distribution manifest is missing.",
      });
    } else {
      try {
        const manifest = parseManifestBytes(bytes);
        const distribution = distributionProvenanceFromManifest(manifest);
        if (
          distribution === null ||
          distribution.canonicalDigest !== sha256(canonicalJson(proposedState))
        ) {
          issues.push({
            code: "MODE_MIGRATION_MANIFEST_STATE_MISMATCH",
            target: MANIFEST_PATH,
            message: "The proposed manifest does not match reviewed distribution provenance.",
          });
        }
      } catch (error) {
        issues.push({
          code: "MODE_MIGRATION_MANIFEST_INVALID",
          target: MANIFEST_PATH,
          message: error instanceof Error ? error.message : "The proposed manifest is invalid.",
        });
      }
    }
    return validationResult(
      `Validated distribution provenance in the ${context.phase} view.`,
      issues,
    );
  };
  const validateDigests = (context: TransactionValidationContext): TransactionValidationResult => {
    const issues: TransactionValidationIssue[] = [];
    for (const [target, materialization] of Object.entries(exactTargets)) {
      const actual = digestOrNull(context.readFile(target));
      const expected = digestOrNull(materialization.after);
      if (actual !== expected) {
        issues.push({
          code: "MODE_MIGRATION_TARGET_DIGEST_MISMATCH",
          target,
          message: `Expected ${String(expected)}, received ${String(actual)}.`,
        });
      }
    }
    for (const value of Object.values(bases)) {
      if (digestOrNull(context.readFile(value.target)) !== sha256(value.content)) {
        issues.push({
          code: "MODE_MIGRATION_BASE_DIGEST_MISMATCH",
          target: value.target,
          message: "The immutable source base is missing or corrupt.",
        });
      }
    }
    return validationResult(
      `Validated exact source, import, adapter, and base digests in the ${context.phase} view.`,
      issues,
    );
  };
  const validateDependencies = (
    context: TransactionValidationContext,
  ): TransactionValidationResult => {
    const issues: TransactionValidationIssue[] = [];
    const packageBytes = context.readFile("package.json");
    for (const ownership of Object.values(proposedState.dependencyOwnership)) {
      const actual = packageDependencyValue(packageBytes, ownership.scope, ownership.package);
      if (actual !== ownership.range) {
        issues.push({
          code: "MODE_MIGRATION_DEPENDENCY_MISMATCH",
          target: "package.json",
          message: `${ownership.scope} dependency ${ownership.package} is not ${ownership.range}.`,
        });
      }
    }
    for (const operation of dependencyOperations) {
      if (operation.operation !== "retain" && operation.operation !== "remove") continue;
      const [scope, ...packageParts] = operation.key.split(":");
      const name = packageParts.join(":");
      const actual = packageDependencyValue(packageBytes, scope as "runtime" | "development", name);
      const expected = operation.operation === "retain" ? operation.to : null;
      if (actual !== expected) {
        issues.push({
          code: "MODE_MIGRATION_DEPENDENCY_RETENTION_MISMATCH",
          target: "package.json",
          message: `${operation.key} did not apply its reviewed ${operation.operation} policy.`,
        });
      }
    }
    return validationResult(
      `Validated dependency ownership and retention in the ${context.phase} view.`,
      issues,
    );
  };
  return [
    {
      id: "distribution-mode-digests-v1",
      label: "digest",
      validateStagedOverlay: validateDigests,
      validatePostCommit: validateDigests,
    },
    {
      id: "distribution-mode-manifest-v1",
      label: "ownership",
      validateStagedOverlay: validateManifest,
      validatePostCommit: validateManifest,
    },
    {
      id: "distribution-mode-package-v1",
      label: "dependency",
      validateStagedOverlay: validateDependencies,
      validatePostCommit: validateDependencies,
    },
  ];
}

function validatorIssue(
  error: unknown,
  fallbackCode: string,
  fallbackTarget: string,
): TransactionValidationIssue {
  return {
    code: error instanceof CliError ? error.code : fallbackCode,
    target: error instanceof CliError && error.target !== undefined ? error.target : fallbackTarget,
    message: error instanceof Error ? error.message : "Mode migration validation failed.",
  };
}

function fixedDistributionModeValidators(
  prepared: PreparedDistributionModeMigration,
  currentManifest: ProvenanceManifest,
  proposedManifest: ProvenanceManifest,
  exactTargets: Readonly<Record<string, DistributionModeTargetMaterialization>>,
  packageIntegrityEvidence: readonly DistributionModePackageIntegrityEvidence[],
  expectedPackagePayloads: readonly TransactionRegistryPayload[],
): readonly TransactionValidator[] {
  const reviewed: PreparedDistributionModeMigration = {
    ...structuredClone(prepared),
    acquiredReleases: prepared.acquiredReleases,
  };
  const allowedImports = allowedImportTransitions(reviewed, currentManifest, proposedManifest);
  const importRewrites = reviewed.migrationPlan.importRewrites;

  const validateImports = (context: TransactionValidationContext): TransactionValidationResult => {
    const issues: TransactionValidationIssue[] = [];
    for (const rewrite of importRewrites) {
      try {
        assertTypeScriptImportMaterialization(
          rewrite.target,
          exactTargets[rewrite.target]!.before,
          context.readFile(rewrite.target),
          allowedImports,
        );
      } catch (error) {
        issues.push(
          validatorIssue(error, "MODE_MIGRATION_IMPORT_VALIDATION_FAILED", rewrite.target),
        );
      }
    }
    return validationResult(
      `Revalidated reviewed TypeScript module substitutions in the ${context.phase} view.`,
      issues,
    );
  };

  const validateConsumerTypes = (
    context: TransactionValidationContext,
  ): TransactionValidationResult => {
    const issues: TransactionValidationIssue[] = [];
    const targets = new Set(importRewrites.map(({ target }) => target));
    for (const id of reviewed.migrationPlan.items) {
      for (const file of reviewed.proposedState.items[id]!.files) {
        if (/typescript/u.test(file.mediaType)) targets.add(file.target);
      }
    }
    for (const target of [...targets].sort(compareText)) {
      const actual = context.readFile(target);
      if (actual === null) {
        issues.push({
          code: "MODE_MIGRATION_CONSUMER_TYPE_TARGET_MISSING",
          target,
          message: "A reviewed TypeScript consumer or source target is missing.",
        });
        continue;
      }
      try {
        const actualSpecifiers = typescriptModuleSpecifiers(actual, target).map(
          ({ kind, value }) => ({
            kind,
            value,
          }),
        );
        const expectedBytes = exactTargets[target]?.after;
        if (expectedBytes !== undefined && expectedBytes !== null) {
          const expectedSpecifiers = typescriptModuleSpecifiers(expectedBytes, target).map(
            ({ kind, value }) => ({ kind, value }),
          );
          if (canonicalJson(actualSpecifiers) !== canonicalJson(expectedSpecifiers)) {
            issues.push({
              code: "MODE_MIGRATION_CONSUMER_IMPORT_INVARIANT_FAILED",
              target,
              message: "Consumer import kinds or module identities differ from reviewed output.",
            });
          }
        }
      } catch (error) {
        issues.push(validatorIssue(error, "MODE_MIGRATION_CONSUMER_TYPE_PARSE_FAILED", target));
      }
    }
    return validationResult(
      `Parsed consumer imports and TypeScript source invariants in the ${context.phase} view.`,
      issues,
    );
  };

  const validateStructuredPatches = (
    context: TransactionValidationContext,
  ): TransactionValidationResult => {
    const issues: TransactionValidationIssue[] = [];
    if (
      reviewed.migrationPlan.dependencyOperations.length > 0 ||
      reviewed.migrationPlan.patchOperations.length > 0
    ) {
      try {
        assertPackageJsonMaterialization(
          exactTargets["package.json"]!.before,
          context.readFile("package.json"),
          reviewed.migrationPlan.dependencyOperations,
          reviewed.migrationPlan.patchOperations,
          reviewed.currentState,
          reviewed.proposedState,
        );
      } catch (error) {
        issues.push(
          validatorIssue(error, "MODE_MIGRATION_PATCH_VALIDATION_FAILED", "package.json"),
        );
      }
    }
    return validationResult(
      `Revalidated compiled structured-patch semantics in the ${context.phase} view.`,
      issues,
    );
  };

  const validateContracts = (
    context: TransactionValidationContext,
  ): TransactionValidationResult => {
    const issues: TransactionValidationIssue[] = [];
    const bytes = context.readFile(MANIFEST_PATH);
    if (bytes === null) {
      issues.push({
        code: "MODE_MIGRATION_CONTRACT_MANIFEST_MISSING",
        target: MANIFEST_PATH,
        message: "Contract parity requires the proposed distribution manifest.",
      });
    } else {
      try {
        const manifest = parseManifestBytes(bytes);
        const actual = distributionProvenanceFromManifest(manifest);
        if (actual === null) {
          throw migrationError(
            "Contract parity requires distribution provenance.",
            "MODE_MIGRATION_CONTRACT_PARITY_FAILED",
            MANIFEST_PATH,
            8,
          );
        }
        for (const id of reviewed.migrationPlan.items) {
          const before = reviewed.currentState.items[id]!;
          const after = reviewed.proposedState.items[id]!;
          const live = actual.state.items[id];
          if (
            live === undefined ||
            before.contractVersion !== after.contractVersion ||
            after.contractVersion !== live.contractVersion ||
            before.kind !== after.kind ||
            after.kind !== live.kind ||
            before.releaseRef !== after.releaseRef ||
            after.releaseRef !== live.releaseRef ||
            before.payload.digest !== after.payload.digest ||
            after.payload.digest !== live.payload.digest ||
            before.resolved !== after.resolved ||
            after.resolved !== live.resolved
          ) {
            issues.push({
              code: "MODE_MIGRATION_CONTRACT_PARITY_FAILED",
              target: id,
              message:
                "Accessibility Contract identity, release, kind, payload, or version changed across the mode transition.",
            });
          }
        }
      } catch (error) {
        issues.push(validatorIssue(error, "MODE_MIGRATION_CONTRACT_PARITY_FAILED", MANIFEST_PATH));
      }
    }
    return validationResult(
      `Revalidated accessibility Contract identity parity in the ${context.phase} view.`,
      issues,
    );
  };

  const validatePackageIntegrity = (
    context: TransactionValidationContext,
  ): TransactionValidationResult => {
    const issues: TransactionValidationIssue[] = [];
    try {
      const actualPayloads = packageIntegrityPayloads(reviewed, packageIntegrityEvidence);
      if (canonicalJson(actualPayloads) !== canonicalJson(expectedPackagePayloads)) {
        throw migrationError(
          "Package tarball evidence changed after transaction materialization.",
          "MODE_MIGRATION_PACKAGE_INTEGRITY_INVALID",
          undefined,
          5,
        );
      }
      for (const release of reviewed.migrationPlan.releases) {
        const pinned = reviewed.currentState.releases[release.ref]!;
        const planRegistry = context.plan.registries.find(
          (candidate) => candidate.id === pinned.registryId && candidate.release === pinned.release,
        );
        if (
          planRegistry === undefined ||
          planRegistry.identityDigest !== pinned.identityDigest ||
          planRegistry.manifestDigest !== pinned.manifestDigest ||
          planRegistry.trust !== pinned.trust
        ) {
          throw migrationError(
            `Package evidence release ${release.ref} is not bound to transaction registry provenance.`,
            "MODE_MIGRATION_PACKAGE_INTEGRITY_INVALID",
            release.ref,
            5,
          );
        }
      }
    } catch (error) {
      issues.push(
        validatorIssue(error, "MODE_MIGRATION_PACKAGE_INTEGRITY_INVALID", "package.json"),
      );
    }
    return validationResult(
      `Rehashed exact package tarballs and registry bindings in the ${context.phase} view.`,
      issues,
    );
  };

  return [
    {
      id: DISTRIBUTION_MODE_VALIDATOR_IDS.imports,
      label: DISTRIBUTION_MODE_VALIDATOR_LABELS.imports,
      validateStagedOverlay: validateImports,
      validatePostCommit: validateImports,
    },
    {
      id: DISTRIBUTION_MODE_VALIDATOR_IDS.consumerTypeImports,
      label: DISTRIBUTION_MODE_VALIDATOR_LABELS.consumerTypeImports,
      validateStagedOverlay: validateConsumerTypes,
      validatePostCommit: validateConsumerTypes,
    },
    {
      id: DISTRIBUTION_MODE_VALIDATOR_IDS.structuredPatchAdapters,
      label: DISTRIBUTION_MODE_VALIDATOR_LABELS.structuredPatchAdapters,
      validateStagedOverlay: validateStructuredPatches,
      validatePostCommit: validateStructuredPatches,
    },
    {
      id: DISTRIBUTION_MODE_VALIDATOR_IDS.accessibilityContracts,
      label: DISTRIBUTION_MODE_VALIDATOR_LABELS.accessibilityContracts,
      validateStagedOverlay: validateContracts,
      validatePostCommit: validateContracts,
    },
    {
      id: DISTRIBUTION_MODE_VALIDATOR_IDS.packageIntegrity,
      label: DISTRIBUTION_MODE_VALIDATOR_LABELS.packageIntegrity,
      validateStagedOverlay: validatePackageIntegrity,
      validatePostCommit: validatePackageIntegrity,
    },
  ];
}

/**
 * Binds a reviewed pure mode migration to the shared manifest-last transaction engine. The caller
 * supplies bytes produced by compiled adapters; this function revalidates their exact semantic
 * scope, constructs every fixed runtime validator internally, and never touches the live project.
 */
function materializeDistributionModeTransaction(
  options: DistributionModeTransactionOptions,
): DistributionModeTransactionBundle {
  assertPreparedMigrationIntegrity(options.prepared);
  assertDistributionConfigurationBinding(options.prepared.currentState, options.configuration);
  assertDistributionConfigurationBinding(options.prepared.proposedState, options.configuration);
  const current = checkedManifestProjection(
    options.currentManifestBytes,
    options.prepared.migrationPlan.statePreconditionDigest,
    "Current manifest",
  );
  const proposed = checkedManifestProjection(
    options.proposedManifestBytes,
    options.prepared.migrationPlan.proposedStateDigest,
    "Proposed manifest",
  );
  assertManifestTransitionScope(current.manifest, proposed.manifest);
  const targets = targetMaterializations(options, current.manifest, proposed.manifest);
  const bases = baseMaterializations(options);
  const mutations: TransactionMutation[] = [];
  const observedTargets: Record<string, DistributionDigest | null> = {};
  for (const [target, value] of Object.entries(targets)) {
    const beforeDigest = digestOrNull(value.before);
    observedTargets[target] = beforeDigest;
    if (!sameBytes(value.before, value.after)) {
      mutations.push({ target, content: value.after, beforeDigest });
    }
  }
  for (const value of Object.values(bases)) {
    const beforeDigest = digestOrNull(value.before);
    observedTargets[value.target] = beforeDigest;
    if (value.before === null) {
      mutations.push({ target: value.target, content: value.content, beforeDigest: null });
    }
  }
  const manifestBeforeDigest = sha256(current.bytes);
  observedTargets[MANIFEST_PATH] = manifestBeforeDigest;
  mutations.push({
    target: MANIFEST_PATH,
    content: proposed.bytes,
    beforeDigest: manifestBeforeDigest,
    manifest: true,
  });
  const releaseRefs = options.prepared.migrationPlan.releases.map(({ ref }) => ref);
  const sourceKeys = Object.keys(options.releaseSources).sort(compareText);
  if (canonicalJson(sourceKeys) !== canonicalJson([...releaseRefs].sort(compareText))) {
    throw migrationError(
      "Mode migration release-source evidence is incomplete or out of scope.",
      "MODE_MIGRATION_RELEASE_SOURCE_INVALID",
      undefined,
      5,
    );
  }
  const registryPayloads: TransactionRegistryPayload[] = releaseRefs.map((ref) => {
    const release = options.prepared.currentState.releases[ref]!;
    return {
      registry: release.registryId,
      release: release.release,
      url: release.manifestUrl,
      digest: release.manifestDigest,
    };
  });
  const packagePayloads = packageIntegrityPayloads(
    options.prepared,
    options.packageIntegrityEvidence,
  );
  registryPayloads.push(...packagePayloads);
  const selectedOwner = options.prepared.migrationPlan.items[0]!;
  const fileOperations: OperationPlanFile[] = options.prepared.migrationPlan.fileOperations.map(
    (operation) => ({
      operation: operation.operation,
      target: operation.target,
      owner: operation.owner,
      base: operation.local,
      local: operation.local,
      remote: operation.proposed,
      proposed: operation.proposed,
      mediaType: "application/octet-stream",
      risk: operation.operation === "delete" ? "destructive" : "ordinary",
      reason: operation.reason,
    }),
  );
  for (const rewrite of options.prepared.migrationPlan.importRewrites) {
    fileOperations.push({
      operation: "semantic-merge",
      target: rewrite.target,
      owner: selectedOwner,
      base: rewrite.before,
      local: rewrite.before,
      remote: rewrite.after,
      proposed: rewrite.after,
      mediaType: "text/typescript",
      risk: "review-required",
      reason: "Apply only the reviewed compiled TypeScript import-mode rewrite.",
    });
  }
  const represented = new Set(fileOperations.map(({ target }) => target));
  for (const [target, value] of Object.entries(targets)) {
    if (represented.has(target)) continue;
    fileOperations.push({
      operation: "structured-patch",
      target,
      owner: selectedOwner,
      base: digestOrNull(value.before),
      local: digestOrNull(value.before),
      remote: digestOrNull(value.after),
      proposed: digestOrNull(value.after),
      mediaType: target === "package.json" ? "application/json" : "application/octet-stream",
      risk: "review-required",
      reason: "Commit aggregate bytes produced by compiled dependency/config patch adapters.",
    });
  }
  fileOperations.sort((left, right) => compareText(left.target, right.target));
  const dependencyChanges: OperationPlanDependencyChange[] =
    options.prepared.migrationPlan.dependencyOperations
      .filter(({ operation }) => ["add", "change", "remove"].includes(operation))
      .map((operation) => {
        const [scope, ...packageParts] = operation.key.split(":");
        return {
          scope: scope as "runtime" | "development",
          package: packageParts.join(":"),
          operation: operation.operation as "add" | "change" | "remove",
          from: operation.from,
          to: operation.to,
          owners: operation.operation === "remove" ? operation.ownersBefore : operation.ownersAfter,
        };
      });
  const plan = finalizeOperationPlan({
    schemaVersion: 1,
    command: "migrate",
    cliVersion: options.cliVersion,
    projectRoot: ".",
    configDigest: options.prepared.proposedState.configDigest,
    manifestPreconditionDigest: sha256(canonicalJson(current.manifest)),
    registries: releaseRefs.map((ref) => {
      const release = options.prepared.currentState.releases[ref]!;
      return {
        id: release.registryId,
        identityDigest: release.identityDigest,
        release: release.release,
        manifestDigest: release.manifestDigest,
        source: options.releaseSources[ref]!,
        trust: release.trust,
        evidenceTier: "partial" as const,
      };
    }),
    items: options.prepared.migrationPlan.items.map((id) => {
      const before = options.prepared.currentState.items[id]!;
      const after = options.prepared.proposedState.items[id]!;
      return {
        id,
        direct: before.direct,
        requested: before.requested,
        fromVersion: before.resolved,
        toVersion: after.resolved,
        mode: after.mode,
      };
    }),
    fileOperations,
    dependencyChanges,
    structuredPatches: options.prepared.migrationPlan.patchOperations.map((operation) => ({
      id: operation.id,
      adapter:
        options.prepared.proposedState.patchOwnership[operation.id]?.adapter ??
        options.prepared.currentState.patchOwnership[operation.id]!.adapter,
      semanticKey:
        options.prepared.proposedState.patchOwnership[operation.id]?.semanticKey ??
        options.prepared.currentState.patchOwnership[operation.id]!.semanticKey,
      target: operation.target,
      owner: operation.ownersAfter[0] ?? operation.ownersBefore[0] ?? selectedOwner,
      operation:
        operation.operation === "ownership-only" || operation.operation === "retain"
          ? "no-op"
          : operation.operation,
    })),
    migrations: [
      {
        id: options.prepared.migrationPlan.migrationId,
        adapter: "mode-source-package-v1",
        phase: "proposed",
      },
    ],
    contractChanges: [],
    warnings: [
      "Package/source ownership changes remain pinned to one exact release group.",
      "Compiled import, structured-patch, consumer type/import, accessibility Contract, and package-integrity validators are bound before execution.",
    ],
    consentRequirements: [
      {
        id: options.prepared.migrationPlan.migrationId,
        flag: "--yes",
        reason:
          "Change source/package ownership, imports, dependency metadata, and portable provenance in one reviewed transaction.",
      },
    ],
    conflicts: [],
    estimatedBytes: {
      download: 0,
      write: mutations.reduce((total, mutation) => total + (mutation.content?.byteLength ?? 0), 0),
    },
    validationSuite: [
      "schema",
      "parse",
      "digest",
      "path",
      "collision",
      "ownership",
      "dependency",
      "type-imports",
      "accessibility-contract",
    ],
    rollbackAvailable: true,
  });
  return {
    plan,
    mutations,
    observedTargets,
    registryPayloads,
    validators: [
      ...distributionTransactionValidators(
        options.prepared.proposedState,
        targets,
        bases,
        options.prepared.migrationPlan.dependencyOperations,
      ),
      ...fixedDistributionModeValidators(
        options.prepared,
        current.manifest,
        proposed.manifest,
        targets,
        options.packageIntegrityEvidence,
        packagePayloads,
      ),
    ],
    packageManagerRequired: dependencyChanges.length > 0,
  };
}

function reviewedTransactionBundle(options: PlanDistributionModeTransactionOptions): {
  readonly prepared: PreparedDistributionModeMigration;
  readonly bundle: DistributionModeTransactionBundle;
} {
  const prepared = prepareDistributionModeMigration(options.migration);
  const bundle = materializeDistributionModeTransaction({
    prepared,
    configuration: options.migration.configuration,
    currentManifestBytes: options.migration.currentManifestBytes,
    proposedManifestBytes: options.proposedManifestBytes,
    targets: options.targets,
    bases: options.bases,
    cliVersion: options.cliVersion,
    releaseSources: options.releaseSources,
    packageIntegrityEvidence: options.packageIntegrityEvidence,
  });
  return { prepared, bundle };
}

/** Returns the exact transaction plan that apply will recompute; validators remain private. */
export function planDistributionModeTransaction(
  options: PlanDistributionModeTransactionOptions,
): PlanDistributionModeTransactionResult {
  const { prepared, bundle } = reviewedTransactionBundle(options);
  return {
    plan: structuredClone(bundle.plan),
    migrationPlan: structuredClone(prepared.migrationPlan),
  };
}

/**
 * Recomputes the reviewed plan, binds every mutation and fixed validator, and executes the shared
 * transaction engine. Callers cannot obtain or replace the internal transaction bundle.
 */
export function applyDistributionModeTransaction(
  options: ApplyDistributionModeTransactionOptions,
): ApplyDistributionModeTransactionResult {
  if (options.yes !== true) {
    throw migrationError(
      "Mode migration requires explicit --yes consent for the reviewed plan.",
      "MODE_MIGRATION_CONSENT_REQUIRED",
      undefined,
      7,
    );
  }
  const { prepared, bundle } = reviewedTransactionBundle(options);
  if (
    !DIGEST.test(options.reviewedPlanDigest) ||
    options.reviewedPlanDigest !== bundle.plan.planDigest
  ) {
    throw migrationError(
      "Mode migration plan changed before apply; review a fresh plan.",
      "PLAN_PRECONDITION_STALE",
      undefined,
      8,
    );
  }
  const transaction = executeTransaction({
    root: options.projectRoot,
    plan: bundle.plan,
    mutations: bundle.mutations,
    acceptedConsents: bundle.plan.consentRequirements.map(({ id }) => ({
      id,
      planDigest: bundle.plan.planDigest,
    })),
    observedTargets: bundle.observedTargets,
    registryPayloads: bundle.registryPayloads,
    packageManager: options.packageManager,
    packageManagerRequired: bundle.packageManagerRequired,
    noInstall: options.noInstall,
    offline: options.offline,
    packageManagerRunner: options.packageManagerRunner,
    commandArguments: options.commandArguments,
    faultInjector: options.faultInjector,
    validators: bundle.validators,
  });
  return {
    transaction,
    provenance: serializeDistributionProvenance(prepared.proposedState),
  };
}
