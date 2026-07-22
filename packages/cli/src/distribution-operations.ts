import { resolve } from "node:path";

import {
  acquiredRegistryBindingDigest,
  assertAuthenticAcquiredNativeRegistryRelease,
  type AcquiredNativeNpmPackageArtifact,
  type AcquiredNativeRegistryItem,
  type AcquiredNativeRegistryRelease,
} from "./acquisition-resolver.js";
import {
  canonicalJson,
  CLI_VERSION,
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
  assertDistributionConfigurationBinding,
  resolveRequestedDistributionMode,
  serializeDistributionProvenance,
  type DistributionDependencyOwnership,
  type DistributionItem,
  type DistributionPatchOwnership,
  type DistributionProvenanceState,
  type DistributionReleasePin,
  type InstalledDistributionMode,
} from "./distribution-provenance.js";
import {
  planOwnedPackageDependencyChange,
  planPackageDependencies,
  type DependencyRequirement,
  type PackageDependencyPlan,
} from "./package-editor.js";
import {
  inspectProject,
  type PackageManager,
  type ProjectInspection,
} from "./project-inspector.js";
import {
  basePath,
  distributionProvenanceFromManifest,
  manifestBytes,
  MANIFEST_PATH,
  parseManifestBytes,
  readManifest,
  readProjectFile,
  type ManifestItem,
  type ProvenanceManifest,
} from "./source-operations.js";
import {
  executeTransaction,
  finalizeOperationPlan,
  validateTransactionOverlay,
  validationSuiteForTransaction,
  type ExecuteTransactionOptions,
  type OperationPlan,
  type OperationPlanDependencyChange,
  type OperationPlanFile,
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
} from "./trusted-transaction-validators.js";
import {
  validateStableNpmTarballBytes,
  type StableVendorNpmTarballDescriptor,
  type StableVendorNpmTarballReader,
} from "./vendor-reader.js";
import { acquireStableNpmTarballInventory, type StableNpmTarballFetcher } from "./vendor.js";

type Digest = `sha256:${string}`;

const PACKAGE_EVIDENCE = new WeakSet<object>();

export interface DistributionPackageArtifactEvidence {
  readonly package: string;
  readonly version: string;
  readonly url: string;
  readonly digest: Digest;
  readonly integrity: `sha512-${string}`;
  readonly license: string;
  readonly bytes: Uint8Array;
  readonly source: "network" | "mirror" | "verified-cache" | "vendor";
}

export interface AcquiredDistributionPackageEvidence {
  readonly release: AcquiredNativeRegistryRelease;
  readonly artifact: DistributionPackageArtifactEvidence;
}

export interface AcquireDistributionPackageEvidenceOptions {
  readonly projectRoot: string;
  readonly acquiredRelease: AcquiredNativeRegistryRelease;
  readonly offline?: boolean | undefined;
  readonly fetcher?: StableNpmTarballFetcher | undefined;
  readonly vendorReader?: StableVendorNpmTarballReader | undefined;
}

export interface DistributionAddRouteOptions {
  readonly projectRoot: string;
  readonly explicitMode?: InstalledDistributionMode | undefined;
}

export interface DistributionUpdateRouteOptions {
  readonly projectRoot: string;
  readonly itemIds?: readonly string[] | undefined;
  readonly registryId?: string | undefined;
  readonly explicitMode?: InstalledDistributionMode | undefined;
}

export interface DistributionUpdateRoute {
  readonly mode: InstalledDistributionMode;
  readonly qualifiedItemIds: readonly string[];
  readonly itemIds: readonly string[];
}

export interface DistributionRemoveRouteOptions {
  readonly projectRoot: string;
  readonly itemIds: readonly string[];
  readonly registryId?: string | undefined;
  readonly explicitMode?: InstalledDistributionMode | undefined;
}

interface PackageDistributionOperationOptions {
  readonly projectRoot: string;
  readonly itemIds: readonly string[];
  readonly acquiredRelease: AcquiredNativeRegistryRelease;
  readonly packageEvidence: AcquiredDistributionPackageEvidence;
  readonly distributionMode?: InstalledDistributionMode | undefined;
  readonly noFormat?: boolean | undefined;
  /** Includes verified Contract metadata; Stable native items include it by default. */
  readonly withContracts?: boolean | undefined;
  /** Materializes only exact project-side examples; package internals stay archive-owned. */
  readonly withExamples?: boolean | undefined;
  readonly noInstall?: boolean | undefined;
  readonly offline?: boolean | undefined;
  readonly packageManager?: PackageManager | undefined;
  readonly packageManagerRunner?: PackageManagerRunner | undefined;
  readonly commandArguments?: readonly string[] | undefined;
  readonly faultInjector?: TransactionFaultInjector | undefined;
}

export type PackageDistributionAddOptions = PackageDistributionOperationOptions;
export type PackageDistributionUpdateOptions = PackageDistributionOperationOptions;

export interface PackageDistributionRemoveOptions {
  readonly projectRoot: string;
  readonly itemIds: readonly string[];
  readonly keepFiles?: boolean | undefined;
  readonly noInstall?: boolean | undefined;
  readonly offline?: boolean | undefined;
  readonly packageManager?: PackageManager | undefined;
  readonly packageManagerRunner?: PackageManagerRunner | undefined;
  readonly commandArguments?: readonly string[] | undefined;
  readonly faultInjector?: TransactionFaultInjector | undefined;
}

export interface PackageDistributionResult {
  readonly mode: "package-transaction";
  readonly command: "add" | "remove" | "update";
  readonly items: readonly string[];
  readonly requestedItems: readonly string[];
  readonly manifest: typeof MANIFEST_PATH;
  readonly transaction: TransactionResult;
  readonly planDigest: Digest;
}

interface PackageProject {
  readonly root: string;
  readonly config: MergoraConfig;
  readonly manifest: ReturnType<typeof readManifest>;
  readonly distribution: ReturnType<typeof distributionProvenanceFromManifest>;
  readonly inspection: ProjectInspection;
}

interface InternalPackagePlan {
  readonly root: string;
  readonly plan: OperationPlan;
  readonly mutations: readonly TransactionMutation[];
  readonly observedTargets: Readonly<Record<string, Digest | null>>;
  readonly registryPayloads: readonly TransactionRegistryPayload[];
  readonly validators: readonly TransactionValidator[];
  readonly packageManager: PackageManager;
  readonly packageManagerRequired: boolean;
  readonly itemIds: readonly string[];
  readonly requestedItems: readonly string[];
}

function distributionError(
  message: string,
  code: string,
  exitCode: 3 | 4 | 5 | 6 | 7 | 8 = 7,
  target?: string,
): CliError {
  return new CliError(message, { code, exitCode, ...(target === undefined ? {} : { target }) });
}

function includedPackage(
  release: AcquiredNativeRegistryRelease,
  packageName: string,
): Extract<AcquiredNativeNpmPackageArtifact, { disposition: "include" }> {
  const inventory = release.npmPackageInventory;
  if (inventory === null) {
    throw distributionError(
      `Native release ${release.release} omits the exact npm inventory required for package mode.`,
      "DISTRIBUTION_PACKAGE_INVENTORY_REQUIRED",
      7,
    );
  }
  const entry = inventory.entries.find(
    (candidate) => candidate.package === packageName && candidate.disposition === "include",
  );
  if (entry === undefined || entry.disposition !== "include" || entry.version !== release.release) {
    throw distributionError(
      `Native release ${release.release} does not include ${packageName} in its fixed package group.`,
      "DISTRIBUTION_PACKAGE_INVENTORY_REQUIRED",
      7,
      packageName,
    );
  }
  return entry;
}

function descriptorFor(
  entry: Extract<AcquiredNativeNpmPackageArtifact, { disposition: "include" }>,
): StableVendorNpmTarballDescriptor {
  return {
    package: entry.package,
    version: entry.version,
    url: entry.url,
    bytes: entry.bytes,
    digest: entry.digest,
    integrity: entry.integrity,
    license: entry.license,
  };
}

/** Acquires and rehashes the exact package archive through trusted transport/vendor readers. */
export async function acquireDistributionPackageEvidence(
  options: AcquireDistributionPackageEvidenceOptions,
): Promise<AcquiredDistributionPackageEvidence> {
  assertAuthenticAcquiredNativeRegistryRelease(options.acquiredRelease);
  const root = validatedProjectRoot(options.projectRoot);
  const config = readMergoraConfig(root);
  if (config === null) {
    throw distributionError(
      "Mergora is not initialized; run mergora init first.",
      "CONFIG_MISSING",
      3,
    );
  }
  const entry = includedPackage(options.acquiredRelease, config.distribution.packageName);
  const descriptor = descriptorFor(entry);
  let bytes: Uint8Array | null = null;
  let source: DistributionPackageArtifactEvidence["source"] | null = null;
  if (options.vendorReader !== undefined) {
    bytes = await options.vendorReader({ ...descriptor, maxBytes: descriptor.bytes });
    if (bytes !== null) source = "vendor";
  }
  if (bytes === null) {
    if (options.offline === true) {
      throw distributionError(
        `Offline package mode requires exact vendored ${descriptor.package}@${descriptor.version} bytes.`,
        "DISTRIBUTION_PACKAGE_OFFLINE_MISSING",
        4,
        descriptor.package,
      );
    }
    const acquired = await acquireStableNpmTarballInventory({
      release: options.acquiredRelease.release,
      inventory: {
        allowedLicenses: options.acquiredRelease.npmPackageInventory!.allowedLicenses,
        entries: [entry],
      },
      fetcher: options.fetcher,
    });
    const artifact = acquired.artifacts[0];
    bytes = artifact?.content ?? null;
    source = acquired.sources[0] ?? null;
  }
  if (bytes === null || source === null) {
    throw distributionError(
      `Exact package evidence for ${descriptor.package}@${descriptor.version} is unavailable.`,
      "DISTRIBUTION_PACKAGE_EVIDENCE_MISSING",
      4,
      descriptor.package,
    );
  }
  validateStableNpmTarballBytes(descriptor, bytes, descriptor.bytes);
  const evidence: AcquiredDistributionPackageEvidence = {
    release: options.acquiredRelease,
    artifact: {
      ...descriptor,
      bytes: Uint8Array.from(bytes),
      source,
    },
  };
  PACKAGE_EVIDENCE.add(evidence);
  return evidence;
}

function assertAuthenticPackageEvidence(
  evidence: AcquiredDistributionPackageEvidence,
  release: AcquiredNativeRegistryRelease,
  packageName: string,
): DistributionPackageArtifactEvidence {
  if (!PACKAGE_EVIDENCE.has(evidence) || evidence.release !== release) {
    throw distributionError(
      "Package operations require authentic in-process acquisition evidence; serialized or caller-invented bytes are rejected.",
      "DISTRIBUTION_PACKAGE_EVIDENCE_UNAUTHENTIC",
      5,
    );
  }
  const expected = includedPackage(release, packageName);
  const artifact = evidence.artifact;
  if (
    artifact.package !== expected.package ||
    artifact.version !== expected.version ||
    artifact.url !== expected.url ||
    artifact.digest !== expected.digest ||
    artifact.integrity !== expected.integrity ||
    artifact.license !== expected.license ||
    artifact.bytes.byteLength !== expected.bytes
  ) {
    throw distributionError(
      "Package evidence no longer matches the exact acquired release inventory.",
      "DISTRIBUTION_PACKAGE_EVIDENCE_MISMATCH",
      5,
      packageName,
    );
  }
  validateStableNpmTarballBytes(descriptorFor(expected), artifact.bytes, expected.bytes);
  return artifact;
}

function configuredRoot(projectRoot: string): {
  readonly root: string;
  readonly config: MergoraConfig;
} {
  const root = validatedProjectRoot(projectRoot);
  const config = readMergoraConfig(root);
  if (config === null) {
    throw distributionError(
      "Mergora is not initialized; run mergora init first.",
      "CONFIG_MISSING",
      3,
    );
  }
  return { root, config };
}

export function resolveDistributionAddMode(
  options: DistributionAddRouteOptions,
): InstalledDistributionMode {
  const { config } = configuredRoot(options.projectRoot);
  return resolveRequestedDistributionMode(config.distribution.defaultMode, options.explicitMode);
}

function qualify(value: string, registryId: string): string {
  const separator = value.indexOf(":");
  const itemId = separator === -1 ? value : value.slice(separator + 1);
  if (
    !/^[a-z0-9]+(?:-[a-z0-9]+)*$/u.test(itemId) ||
    (separator !== -1 &&
      (value.slice(0, separator) !== registryId || value.indexOf(":", separator + 1) !== -1))
  ) {
    throw distributionError(
      `Item ${JSON.stringify(value)} is outside the selected ${registryId} registry.`,
      "ITEM_REGISTRY_MISMATCH",
      5,
      value,
    );
  }
  return `${registryId}:${itemId}`;
}

/** Routes update strictly by persisted item mode; mixed-mode selections require narrower plans. */
export function resolveDistributionUpdateRoute(
  options: DistributionUpdateRouteOptions,
): DistributionUpdateRoute {
  const { root, config } = configuredRoot(options.projectRoot);
  const manifest = readManifest(root).value;
  const registryId = options.registryId ?? "official";
  const qualified =
    options.itemIds === undefined || options.itemIds.length === 0
      ? Object.keys(manifest.items).filter((id) => id.startsWith(`${registryId}:`))
      : [...new Set(options.itemIds.map((item) => qualify(item, registryId)))];
  qualified.sort((left, right) => left.localeCompare(right, "en-US"));
  if (qualified.length === 0) {
    throw distributionError("No installed items match the update selection.", "ITEM_REQUIRED", 3);
  }
  const modes = new Set<InstalledDistributionMode>();
  for (const id of qualified) {
    const item = manifest.items[id];
    if (item === undefined) {
      throw distributionError(
        `Item ${id} is not installed.`,
        "ITEM_NOT_INSTALLED",
        3,
        MANIFEST_PATH,
      );
    }
    modes.add(item.mode);
  }
  if (modes.size !== 1) {
    throw distributionError(
      "One update plan cannot combine source Semantic Sync and package semver ownership; select one persisted mode at a time.",
      "DISTRIBUTION_MIXED_UPDATE_UNSUPPORTED",
      7,
      MANIFEST_PATH,
    );
  }
  const mode = [...modes][0]!;
  if (options.explicitMode !== undefined && options.explicitMode !== mode) {
    throw distributionError(
      `Selected items are persisted in ${mode} mode; use an explicit reviewed mode migration before --mode ${options.explicitMode}.`,
      "DISTRIBUTION_MODE_MIGRATION_REQUIRED",
      6,
      MANIFEST_PATH,
    );
  }
  if (mode === "package") {
    const distribution = distributionProvenanceFromManifest(manifest);
    if (distribution === null) {
      throw distributionError(
        "Package-installed items lack distribution provenance.",
        "MANIFEST_DISTRIBUTION_INCOMPLETE",
        3,
        MANIFEST_PATH,
      );
    }
    assertDistributionConfigurationBinding(distribution.state, config);
  }
  return {
    mode,
    qualifiedItemIds: qualified,
    itemIds: qualified.map((id) => id.slice(registryId.length + 1)),
  };
}

export function resolveDistributionRemoveMode(
  options: DistributionRemoveRouteOptions,
): InstalledDistributionMode {
  const { root, config } = configuredRoot(options.projectRoot);
  const manifest = readManifest(root).value;
  const registryId = options.registryId ?? "official";
  const installedModes = new Set<InstalledDistributionMode>();
  for (const item of options.itemIds) {
    const qualified = qualify(item, registryId);
    const installed = manifest.items[qualified];
    if (installed !== undefined) installedModes.add(installed.mode);
  }
  if (installedModes.size > 1) {
    throw distributionError(
      "One removal plan cannot combine source and package ownership; select one persisted mode at a time.",
      "DISTRIBUTION_MIXED_UPDATE_UNSUPPORTED",
      7,
      MANIFEST_PATH,
    );
  }
  const mode =
    [...installedModes][0] ??
    resolveRequestedDistributionMode(config.distribution.defaultMode, options.explicitMode);
  if (options.explicitMode !== undefined && options.explicitMode !== mode) {
    throw distributionError(
      `Selected items are persisted in ${mode} mode; use an explicit reviewed migration before --mode ${options.explicitMode}.`,
      "DISTRIBUTION_MODE_MIGRATION_REQUIRED",
      6,
      MANIFEST_PATH,
    );
  }
  return mode;
}

function readPackageProject(
  options: PackageDistributionOperationOptions | PackageDistributionRemoveOptions,
): PackageProject {
  const { root, config } = configuredRoot(options.projectRoot);
  const manifest = readManifest(root);
  const distribution = distributionProvenanceFromManifest(manifest.value);
  if (distribution !== null) assertDistributionConfigurationBinding(distribution.state, config);
  const inspection = inspectProject(root, {
    framework: config.project.framework,
    sourceRoot: config.project.sourceRoot,
    globalCss: config.styling.globalCss,
    aliasPrefix: mergoraConfigAliasPrefix(config),
    packageManager: options.packageManager,
  });
  return { root, config, manifest, distribution, inspection };
}

function transformContext(config: MergoraConfig): ManifestItem["transformContext"] {
  return {
    targets: Object.fromEntries(
      Object.entries(config.targets).sort(([left], [right]) => left.localeCompare(right, "en-US")),
    ),
    aliases: Object.fromEntries(
      Object.entries(config.aliases).sort(([left], [right]) => left.localeCompare(right, "en-US")),
    ),
    styling: {
      engine: "tailwind-v4",
      tokenPreset: config.styling.tokenPreset,
      density: config.styling.density,
      direction: config.styling.direction,
    },
  };
}

function releasePin(
  release: AcquiredNativeRegistryRelease,
  artifact: DistributionPackageArtifactEvidence,
): DistributionReleasePin {
  return {
    registryId: release.registry.id,
    origin: release.registry.origin,
    trust: release.registry.trust,
    identityDigest: acquiredRegistryBindingDigest(release.registry),
    release: release.release,
    manifestUrl: `${release.registry.origin}/releases/${release.release}/manifest.json`,
    manifestDigest: release.manifestDigest,
    packages: {
      [artifact.package]: {
        name: artifact.package,
        version: artifact.version,
        tarballDigest: artifact.digest,
      },
    },
  };
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

function packageImports(item: AcquiredNativeRegistryItem, packageName: string): readonly string[] {
  const imports = [...new Set(item.importPaths)].filter((value) =>
    value.startsWith(`${packageName}/`),
  );
  imports.sort((left, right) => left.localeCompare(right, "en-US"));
  if (imports.length === 0) {
    throw distributionError(
      `Item ${item.itemId} has no reviewed public ${packageName} subpath.`,
      "DISTRIBUTION_IMPORT_INVALID",
      7,
      item.itemId,
    );
  }
  return imports;
}

interface PackageAuxiliaryArtifact {
  readonly file: ManifestItem["files"][number];
  readonly bytes: Buffer;
}

function packageAuxiliaryArtifacts(options: {
  readonly item: AcquiredNativeRegistryItem;
  readonly registryId: string;
  readonly includeContract: boolean;
  readonly includeExamples: boolean;
}): readonly PackageAuxiliaryArtifact[] {
  const artifacts: PackageAuxiliaryArtifact[] = [];
  if (options.includeContract) {
    const document = options.item.contractDocument;
    if (document === undefined) {
      throw distributionError(
        `Acquired release is missing the selected Contract for ${options.item.itemId}.`,
        "REGISTRY_CONTRACT_MISSING",
        5,
        options.item.itemId,
      );
    }
    const bytes = Buffer.from(document.content, "utf8");
    if (sha256(bytes) !== document.digest) {
      throw distributionError(
        `Verified Contract for ${options.item.itemId} changed before package planning.`,
        "REGISTRY_CONTRACT_INVALID",
        5,
        options.item.itemId,
      );
    }
    artifacts.push({
      bytes,
      file: {
        logicalPath: `contracts/${options.registryId}/${options.item.itemId}.json`,
        target: `.mergora/contracts/${options.registryId}--${options.item.itemId}.json`,
        role: "contract",
        base: document.digest,
        installed: document.digest,
        mediaType: "application/json",
        executable: false,
      },
    });
  }
  if (options.includeExamples) {
    const declared = new Set(options.item.examples);
    const examples = options.item.files.filter(({ targetRole }) => targetRole === "example");
    if (
      options.item.examples.some(
        (logicalPath) => examples.filter((file) => file.logicalPath === logicalPath).length !== 1,
      ) ||
      examples.some((file) => !declared.has(file.logicalPath))
    ) {
      throw distributionError(
        `Acquired item ${options.item.itemId} does not bind every declared example to exactly one example file.`,
        "REGISTRY_EXAMPLE_MISSING",
        5,
        options.item.itemId,
      );
    }
    for (const example of examples) {
      if (
        !example.logicalPath.startsWith("examples/") ||
        example.logicalPath.split("/").length < 2 ||
        example.transformPipeline.some(
          ({ adapter }) => adapter !== "none" && adapter !== "target-map",
        )
      ) {
        throw distributionError(
          `Example ${example.logicalPath} has an unsafe target or unsupported transform.`,
          "SOURCE_ACQUIRED_TARGET_INVALID",
          5,
          example.logicalPath,
        );
      }
      const bytes = Buffer.from(example.content, example.encoding === "utf8" ? "utf8" : "base64");
      if (bytes.byteLength !== example.bytes || sha256(bytes) !== example.digest) {
        throw distributionError(
          `Example ${example.logicalPath} changed after verification.`,
          "REGISTRY_ITEM_DIGEST_INVALID",
          5,
          example.logicalPath,
        );
      }
      artifacts.push({
        bytes,
        file: {
          logicalPath: example.logicalPath,
          target: example.logicalPath,
          role: "example",
          base: example.digest,
          installed: example.digest,
          mediaType: example.mediaType,
          executable: false,
        },
      });
    }
  }
  const targets = new Set<string>();
  for (const { file } of artifacts) {
    const target = file.target.normalize("NFC").toLocaleLowerCase("en-US");
    if (targets.has(target)) {
      throw distributionError(
        `Selected auxiliary target ${file.target} collides.`,
        "SOURCE_TARGET_COLLISION",
        5,
        file.target,
      );
    }
    targets.add(target);
  }
  return artifacts.sort((left, right) =>
    left.file.target.localeCompare(right.file.target, "en-US"),
  );
}

function packageItem(options: {
  readonly item: AcquiredNativeRegistryItem;
  readonly release: AcquiredNativeRegistryRelease;
  readonly packageName: string;
  readonly direct: boolean;
  readonly auxiliaryFiles: readonly ManifestItem["files"][number][];
  readonly previous?: DistributionItem | undefined;
}): DistributionItem {
  const { item, release, packageName } = options;
  return {
    registry: release.registry.id,
    itemId: item.itemId,
    kind: item.kind,
    requested: `=${release.release}`,
    resolved: release.release,
    releaseRef: `${release.registry.id}@${release.release}`,
    payload: { url: item.payloadUrl, digest: item.payloadDigest },
    mode: "package",
    direct: options.direct,
    files: options.auxiliaryFiles,
    packageClaims: [packageName],
    importSubpaths: packageImports(item, packageName),
    registryDependencies: portableSort(item.registryDependencies),
    dependencies: { runtime: { [packageName]: release.release }, development: {} },
    structuredPatches: [packagePatch(packageName, release.release)],
    contractVersion: item.contract.version,
    lastMigration: options.previous?.lastMigration ?? null,
  };
}

function ownershipViews(state: DistributionProvenanceState): {
  readonly dependencyOwners: Record<string, string[]>;
  readonly sharedTargets: Record<string, string[]>;
} {
  const targets = new Map<string, string[]>();
  for (const patch of Object.values(state.patchOwnership)) {
    const ids = targets.get(patch.target) ?? [];
    ids.push(patch.id);
    targets.set(patch.target, ids);
  }
  return {
    dependencyOwners: Object.fromEntries(
      Object.entries(state.dependencyOwnership).map(([key, value]) => [key, [...value.owners]]),
    ),
    sharedTargets: Object.fromEntries(
      [...targets].map(([target, ids]) => [target, [...portableSort(ids)]]),
    ),
  };
}

export function manifestFromDistributionState(
  current: ProvenanceManifest,
  config: MergoraConfig,
  state: DistributionProvenanceState,
  formatter: string,
): ProvenanceManifest {
  const context = transformContext(config);
  const items = Object.fromEntries(
    Object.entries(state.items).map(([id, item]) => {
      const installed = current.items[id];
      const itemContext = installed?.transformContext ?? context;
      return [
        id,
        {
          ...item,
          transformContext: itemContext,
          transformContextDigest: sha256(canonicalJson(itemContext)),
          structuredPatches: item.structuredPatches.map((patch) => ({ ...patch })),
        },
      ];
    }),
  ) as Record<string, ManifestItem>;
  return {
    $schema: "https://mergora.vercel.app/r/v1/schemas/manifest-v1.schema.json",
    schemaVersion: 1,
    projectId: state.projectId,
    configDigest: state.configDigest,
    defaultMode: state.defaultMode,
    packageName: state.packageName,
    toolchain: { ...current.toolchain, formatter },
    releases: state.releases,
    items,
    ...ownershipViews(state),
    dependencyOwnership: state.dependencyOwnership,
    patchOwnership: state.patchOwnership,
  };
}

function requestedIds(
  itemIds: readonly string[],
  release: AcquiredNativeRegistryRelease,
): readonly string[] {
  if (itemIds.length === 0) {
    throw distributionError("Package operation requires an item.", "ITEM_REQUIRED", 3);
  }
  const selected = [...new Set(itemIds.map((value) => release.aliases[value] ?? value))];
  selected.sort((left, right) => left.localeCompare(right, "en-US"));
  const available = new Set(release.items.map(({ itemId }) => itemId));
  for (const id of selected) {
    if (!available.has(id)) {
      throw distributionError(
        `Acquired release ${release.release} does not include ${id}.`,
        "REGISTRY_ITEM_NOT_ACQUIRED",
        4,
        id,
      );
    }
  }
  return selected;
}

function initialState(project: PackageProject): DistributionProvenanceState {
  if (project.distribution !== null) return structuredClone(project.distribution.state);
  if (Object.keys(project.manifest.value.items).length !== 0) {
    throw distributionError(
      "Legacy source ownership must be attached through an explicit reviewed provenance migration before package enrollment.",
      "DISTRIBUTION_LEGACY_MIGRATION_REQUIRED",
      6,
      MANIFEST_PATH,
    );
  }
  return {
    schemaVersion: 1,
    projectId: project.manifest.value.projectId,
    configDigest: sha256(canonicalJson(project.config)),
    defaultMode: project.config.distribution.defaultMode,
    packageName: project.config.distribution.packageName,
    releases: {},
    items: {},
    dependencyOwnership: {},
    patchOwnership: {},
  };
}

function updatePackageOwnership(options: {
  readonly state: DistributionProvenanceState;
  readonly packageName: string;
  readonly version: string;
  readonly dependencyExisted: boolean;
}): DistributionProvenanceState {
  const packageOwners = Object.entries(options.state.items)
    .filter(
      ([, item]) => item.mode === "package" && item.packageClaims.includes(options.packageName),
    )
    .map(([id]) => id)
    .sort((left, right) => left.localeCompare(right, "en-US"));
  const dependencyKey = `runtime:${options.packageName}`;
  const patch = packagePatch(options.packageName, options.version);
  const previousDependency = options.state.dependencyOwnership[dependencyKey];
  const previousPatch = options.state.patchOwnership[patch.id];
  const dependencyOwnership: Record<string, DistributionDependencyOwnership> = {
    ...options.state.dependencyOwnership,
    [dependencyKey]: {
      scope: "runtime",
      package: options.packageName,
      range: options.version,
      owners: packageOwners,
      retention:
        previousDependency?.retention ??
        (options.dependencyExisted ? "retain-if-unowned" : "remove-if-unowned"),
    },
  };
  const patchOwnership: Record<string, DistributionPatchOwnership> = {
    ...options.state.patchOwnership,
    [patch.id]: {
      ...patch,
      owners: packageOwners,
      retention:
        previousPatch?.retention ??
        (options.dependencyExisted ? "retain-if-unowned" : "remove-if-unowned"),
    },
  };
  return { ...options.state, dependencyOwnership, patchOwnership };
}

function assertPackageManagerScope(
  inspection: ProjectInspection,
  changed: boolean,
  noInstall: boolean | undefined,
): void {
  if (
    changed &&
    noInstall !== true &&
    inspection.packageManagerEvidence.some((entry) => entry.startsWith("workspace-lockfile:"))
  ) {
    throw distributionError(
      "The authoritative lockfile is outside the selected project; use --no-install and run the workspace-root install separately.",
      "PACKAGE_MANAGER_WORKSPACE_TRANSACTION_UNSUPPORTED",
      7,
    );
  }
}

function packagePlanFor(
  command: "add" | "update",
  project: PackageProject,
  state: DistributionProvenanceState,
  targetVersion: string,
): PackageDependencyPlan {
  const packageName = project.config.distribution.packageName;
  const owners = Object.entries(state.items)
    .filter(([, item]) => item.mode === "package" && item.packageClaims.includes(packageName))
    .map(([id]) => id)
    .sort((left, right) => left.localeCompare(right, "en-US"));
  const existing = project.distribution?.state.dependencyOwnership[`runtime:${packageName}`];
  const live = JSON.parse(readProjectFile(project.root, "package.json")!.toString("utf8")) as {
    dependencies?: Record<string, unknown>;
  };
  const liveRange = live.dependencies?.[packageName];
  if (command === "update" && existing !== undefined && existing.range !== targetVersion) {
    if (typeof liveRange !== "string" || liveRange !== existing.range) {
      throw distributionError(
        `Package dependency ${packageName} no longer equals its exact owned ${existing.range} value.`,
        "DEPENDENCY_OWNERSHIP_PRECONDITION_FAILED",
        6,
        "package.json",
      );
    }
    return planOwnedPackageDependencyChange(
      resolve(project.root, "package.json"),
      packageName,
      existing.range,
      targetVersion,
      owners,
    );
  }
  if (liveRange !== undefined && liveRange !== targetVersion) {
    throw distributionError(
      `Package mode requires exact ${packageName}@${targetVersion}; the existing declaration is user-owned or incompatible.`,
      "DEPENDENCY_RANGE_CONFLICT",
      7,
      "package.json",
    );
  }
  const requirements: Record<string, DependencyRequirement> = {
    [packageName]: { range: targetVersion, owners },
  };
  return planPackageDependencies(resolve(project.root, "package.json"), requirements);
}

function distributionValidator(options: {
  readonly expectedConfig: MergoraConfig;
  readonly expectedManifestDigest: Digest;
  readonly packageName: string;
  readonly version: string;
  readonly artifact: DistributionPackageArtifactEvidence;
}): TransactionValidator {
  const validate = (context: TransactionValidationContext): TransactionValidationResult => {
    const issues: TransactionValidationIssue[] = [];
    try {
      const configBytes = context.readFile("mergora.json");
      if (configBytes === null) throw new Error("missing config");
      const config = validateMergoraConfig(JSON.parse(configBytes.toString("utf8")) as unknown);
      if (canonicalJson(config) !== canonicalJson(options.expectedConfig)) {
        throw new Error("config changed");
      }
    } catch {
      issues.push({
        code: "DISTRIBUTION_CONFIG_BINDING_INVALID",
        target: "mergora.json",
        message: "Project configuration differs from the exact reviewed distribution input.",
      });
    }
    try {
      const bytes = context.readFile(MANIFEST_PATH);
      if (bytes === null) throw new Error("missing manifest");
      const manifest = parseManifestBytes(bytes);
      const projected = distributionProvenanceFromManifest(manifest);
      if (projected === null || projected.canonicalDigest !== options.expectedManifestDigest) {
        throw new Error("manifest changed");
      }
      assertDistributionConfigurationBinding(projected.state, options.expectedConfig);
    } catch {
      issues.push({
        code: "DISTRIBUTION_PROVENANCE_MISMATCH",
        target: MANIFEST_PATH,
        message: "Package/source provenance differs from the reviewed exact post-state.",
      });
    }
    try {
      const bytes = context.readFile("package.json");
      if (bytes === null) throw new Error("missing package.json");
      const value = JSON.parse(bytes.toString("utf8")) as {
        dependencies?: Record<string, unknown>;
      };
      if (value.dependencies?.[options.packageName] !== options.version) {
        throw new Error("dependency changed");
      }
    } catch {
      issues.push({
        code: "DISTRIBUTION_PACKAGE_DEPENDENCY_MISMATCH",
        target: "package.json",
        message: "The exact reviewed package dependency is absent or changed.",
      });
    }
    try {
      validateStableNpmTarballBytes(
        {
          package: options.artifact.package,
          version: options.artifact.version,
          url: options.artifact.url,
          bytes: options.artifact.bytes.byteLength,
          digest: options.artifact.digest,
          integrity: options.artifact.integrity,
          license: options.artifact.license,
        },
        options.artifact.bytes,
        options.artifact.bytes.byteLength,
      );
    } catch {
      issues.push({
        code: "DISTRIBUTION_PACKAGE_INTEGRITY_INVALID",
        target: options.packageName,
        message: "Exact package archive evidence failed fixed digest/archive validation.",
      });
    }
    return transactionValidationResult(
      `Validated exact package provenance, dependency, configuration, and archive integrity in the ${context.phase} view.`,
      `Package distribution validation failed in the ${context.phase} view.`,
      issues,
    );
  };
  return {
    id: "package-distribution-provenance-v1",
    label: "ownership",
    validateStagedOverlay: validate,
    validatePostCommit: validate,
  };
}

function distributionRemovalValidator(options: {
  readonly expectedConfig: MergoraConfig;
  readonly expectedManifestDigest: Digest;
  readonly expectedDistributionDigest: Digest | null;
  readonly packageName: string;
  readonly expectedVersion: string | null;
}): TransactionValidator {
  const validate = (context: TransactionValidationContext): TransactionValidationResult => {
    const issues: TransactionValidationIssue[] = [];
    try {
      const configBytes = context.readFile("mergora.json");
      if (configBytes === null) throw new Error("missing config");
      const config = validateMergoraConfig(JSON.parse(configBytes.toString("utf8")) as unknown);
      if (canonicalJson(config) !== canonicalJson(options.expectedConfig)) {
        throw new Error("config changed");
      }
    } catch {
      issues.push({
        code: "DISTRIBUTION_CONFIG_BINDING_INVALID",
        target: "mergora.json",
        message: "Project configuration differs from the exact reviewed removal input.",
      });
    }
    try {
      const bytes = context.readFile(MANIFEST_PATH);
      if (bytes === null) throw new Error("missing manifest");
      const manifest = parseManifestBytes(bytes);
      if (sha256(canonicalJson(manifest)) !== options.expectedManifestDigest) {
        throw new Error("manifest changed");
      }
      const projected = distributionProvenanceFromManifest(manifest);
      if (options.expectedDistributionDigest === null) {
        if (projected !== null) throw new Error("distribution provenance was retained");
      } else {
        if (projected?.canonicalDigest !== options.expectedDistributionDigest) {
          throw new Error("distribution provenance changed");
        }
        assertDistributionConfigurationBinding(projected.state, options.expectedConfig);
      }
    } catch {
      issues.push({
        code: "DISTRIBUTION_PROVENANCE_MISMATCH",
        target: MANIFEST_PATH,
        message: "Distribution provenance differs from the reviewed removal post-state.",
      });
    }
    try {
      const bytes = context.readFile("package.json");
      if (bytes === null) throw new Error("missing package.json");
      const value = JSON.parse(bytes.toString("utf8")) as {
        dependencies?: Record<string, unknown>;
      };
      const actual = value.dependencies?.[options.packageName];
      if (
        (options.expectedVersion === null && actual !== undefined) ||
        (options.expectedVersion !== null && actual !== options.expectedVersion)
      ) {
        throw new Error("dependency changed");
      }
    } catch {
      issues.push({
        code: "DISTRIBUTION_PACKAGE_DEPENDENCY_MISMATCH",
        target: "package.json",
        message: "The reviewed package dependency removal or retention state differs.",
      });
    }
    return transactionValidationResult(
      `Validated package provenance, dependency, and configuration removal in the ${context.phase} view.`,
      `Package distribution removal validation failed in the ${context.phase} view.`,
      issues,
    );
  };
  return {
    id: "package-distribution-removal-v1",
    label: "ownership",
    validateStagedOverlay: validate,
    validatePostCommit: validate,
  };
}

function buildPackagePlan(
  command: "add" | "update",
  options: PackageDistributionOperationOptions,
): InternalPackagePlan {
  assertAuthenticAcquiredNativeRegistryRelease(options.acquiredRelease);
  const project = readPackageProject(options);
  const requestedMode =
    command === "add"
      ? resolveRequestedDistributionMode(
          project.config.distribution.defaultMode,
          options.distributionMode,
        )
      : (options.distributionMode ?? "package");
  if (requestedMode !== "package") {
    throw distributionError(
      "Package distribution entry points accept only package-routed operations.",
      "DISTRIBUTION_SOURCE_ROUTING_REQUIRED",
      7,
      MANIFEST_PATH,
    );
  }
  const release = options.acquiredRelease;
  const artifact = assertAuthenticPackageEvidence(
    options.packageEvidence,
    release,
    project.config.distribution.packageName,
  );
  const configuredRegistry = project.config.registries[release.registry.id];
  if (
    configuredRegistry === undefined ||
    configuredRegistry.protocol !== "mergora-v1" ||
    configuredRegistry.origin !== release.registry.origin ||
    configuredRegistry.trust !== release.registry.trust ||
    (configuredRegistry.trust === "official"
      ? acquiredRegistryBindingDigest(release.registry)
      : configuredRegistry.identityDigest) !== acquiredRegistryBindingDigest(release.registry)
  ) {
    throw distributionError(
      `Acquired registry ${release.registry.id} does not match its committed project enrollment.`,
      "REGISTRY_IDENTITY_MISMATCH",
      5,
      "mergora.json",
    );
  }
  const requested = requestedIds(options.itemIds, release);
  const direct = new Set(requested);
  let state = initialState(project);
  const items = { ...state.items };
  const acquiredById = new Map(release.items.map((item) => [item.itemId, item]));
  const catalogById = new Map(release.catalog.map((item) => [item.id, item]));
  const auxiliaryBytesByOwner = new Map<string, Map<string, Buffer>>();
  const operationIds = command === "add" ? release.items.map(({ itemId }) => itemId) : requested;
  if (command === "update") {
    for (const id of requested) {
      const owner = `${release.registry.id}:${id}`;
      const existing = items[owner];
      if (existing === undefined || existing.mode !== "package") {
        throw distributionError(
          `Item ${owner} is not package-installed.`,
          existing?.mode === "source"
            ? "DISTRIBUTION_MODE_MIGRATION_REQUIRED"
            : "ITEM_NOT_INSTALLED",
          existing?.mode === "source" ? 6 : 3,
          MANIFEST_PATH,
        );
      }
    }
    const currentPackageOwners = Object.entries(items)
      .filter(
        ([id, item]) =>
          id.startsWith(`${release.registry.id}:`) &&
          item.mode === "package" &&
          item.packageClaims.includes(project.config.distribution.packageName),
      )
      .map(([id]) => id.slice(release.registry.id.length + 1))
      .sort((left, right) => left.localeCompare(right, "en-US"));
    const versionChanges = currentPackageOwners.some(
      (id) => items[`${release.registry.id}:${id}`]!.resolved !== release.release,
    );
    if (
      versionChanges &&
      canonicalJson(currentPackageOwners) !== canonicalJson([...requested].sort())
    ) {
      throw distributionError(
        `Package release-group update must select every ${project.config.distribution.packageName} owner: ${currentPackageOwners.join(", ")}.`,
        "DISTRIBUTION_PACKAGE_RELEASE_GROUP_INCOMPLETE",
        7,
        MANIFEST_PATH,
      );
    }
  }
  for (const id of operationIds) {
    const acquired = acquiredById.get(id);
    if (acquired === undefined) {
      throw distributionError(
        `Acquired release ${release.release} is missing ${id}.`,
        "REGISTRY_ITEM_NOT_ACQUIRED",
        4,
        id,
      );
    }
    const owner = `${release.registry.id}:${id}`;
    const existing = items[owner];
    if (command === "add" && existing !== undefined) {
      if (existing.mode !== "package") {
        throw distributionError(
          `Item ${owner} is source-owned; use an explicit reviewed mode migration.`,
          "DISTRIBUTION_MIXED_OWNERSHIP_CONFLICT",
          6,
          MANIFEST_PATH,
        );
      }
      if (
        existing.resolved !== release.release ||
        existing.payload.digest !== acquired.payloadDigest
      ) {
        throw distributionError(
          `Item ${owner} has another package release; use the update planner.`,
          "ITEM_UPDATE_REQUIRED",
          7,
          MANIFEST_PATH,
        );
      }
    }
    if (command === "update" && existing === undefined) {
      throw distributionError(
        `Package update cannot infer new graph ownership for ${owner}; use an explicit reviewed add/migration.`,
        "DISTRIBUTION_PACKAGE_GRAPH_MIGRATION_REQUIRED",
        7,
        MANIFEST_PATH,
      );
    }
    const includeExamples =
      options.withExamples === true ||
      existing?.files.some(({ role }) => role === "example") === true;
    const installedContract = existing?.files.some(({ role }) => role === "contract") === true;
    if (command === "update" && installedContract && acquired.contractDocument === undefined) {
      throw distributionError(
        `Acquired release is missing the selected Contract artifact for ${owner}.`,
        "REGISTRY_CONTRACT_MISSING",
        5,
        id,
      );
    }
    const includeContract =
      acquired.contractDocument !== undefined &&
      (command === "add" || installedContract || catalogById.get(id)?.maturity === "stable");
    const auxiliaryArtifacts = packageAuxiliaryArtifacts({
      item: acquired,
      registryId: release.registry.id,
      includeContract,
      includeExamples,
    });
    const preservedContracts =
      acquired.contractDocument === undefined
        ? (existing?.files.filter(({ role }) => role === "contract") ?? [])
        : [];
    auxiliaryBytesByOwner.set(
      owner,
      new Map(auxiliaryArtifacts.map(({ file, bytes }) => [file.target, bytes])),
    );
    items[owner] = packageItem({
      item: acquired,
      release,
      packageName: project.config.distribution.packageName,
      direct: command === "add" ? direct.has(id) || existing?.direct === true : existing!.direct,
      auxiliaryFiles: [...preservedContracts, ...auxiliaryArtifacts.map(({ file }) => file)],
      previous: existing,
    });
  }
  const releaseRef = `${release.registry.id}@${release.release}`;
  state = {
    ...state,
    releases: { ...state.releases, [releaseRef]: releasePin(release, artifact) },
    items,
  };
  for (const [owner, item] of Object.entries(state.items)) {
    for (const dependency of item.registryDependencies) {
      const target = state.items[dependency];
      if (target === undefined || target.mode !== item.mode) {
        throw distributionError(
          `Package dependency graph for ${owner} crosses missing or source ownership at ${dependency}.`,
          "DISTRIBUTION_MIXED_OWNERSHIP_CONFLICT",
          6,
          MANIFEST_PATH,
        );
      }
    }
  }
  const packageBefore = JSON.parse(
    readProjectFile(project.root, "package.json")!.toString("utf8"),
  ) as {
    dependencies?: Record<string, unknown>;
  };
  const dependencyExisted =
    typeof packageBefore.dependencies?.[project.config.distribution.packageName] === "string";
  state = updatePackageOwnership({
    state,
    packageName: project.config.distribution.packageName,
    version: release.release,
    dependencyExisted,
  });
  // Remove unreferenced release pins only after all item transitions are assembled.
  const referencedReleases = new Set(Object.values(state.items).map(({ releaseRef: ref }) => ref));
  state = {
    ...state,
    releases: Object.fromEntries(
      Object.entries(state.releases).filter(([ref]) => referencedReleases.has(ref)),
    ),
  };
  const auxiliaryMutations: TransactionMutation[] = [];
  const auxiliaryObserved: Record<string, Digest | null> = {};
  const auxiliaryFileOperations: OperationPlanFile[] = [];
  const auxiliaryContractChanges: OperationPlan["contractChanges"][number][] = [];
  const auxiliaryConflicts: OperationPlan["conflicts"][number][] = [];
  const reconciledItems = { ...state.items };
  for (const id of operationIds) {
    const owner = `${release.registry.id}:${id}`;
    const previous = project.manifest.value.items[owner];
    const next = reconciledItems[owner]!;
    const previousByLogical = new Map(
      (previous?.files ?? []).map((file) => [file.logicalPath, file]),
    );
    const previousByTarget = new Map((previous?.files ?? []).map((file) => [file.target, file]));
    const bytesByTarget = auxiliaryBytesByOwner.get(owner) ?? new Map<string, Buffer>();
    const reconciledFiles: ManifestItem["files"][number][] = [];
    for (const remote of next.files) {
      const old = previousByLogical.get(remote.logicalPath);
      const localBytes = readProjectFile(project.root, remote.target);
      const local = localBytes === null ? null : sha256(localBytes);
      auxiliaryObserved[remote.target] = local;
      const remoteBytes = bytesByTarget.get(remote.target);
      if (old === undefined) {
        const previousAtTarget = previousByTarget.get(remote.target);
        if (previousAtTarget !== undefined) {
          throw distributionError(
            `Auxiliary ownership changed ${previousAtTarget.logicalPath} to ${remote.logicalPath} without an explicit migration.`,
            "DISTRIBUTION_OWNERSHIP_CONFLICT",
            6,
            remote.target,
          );
        }
        if (remoteBytes === undefined || sha256(remoteBytes) !== remote.base) {
          throw distributionError(
            `Selected auxiliary ${remote.logicalPath} has no exact acquired bytes.`,
            "REGISTRY_ITEM_DIGEST_INVALID",
            5,
            remote.target,
          );
        }
        if (local !== null && local !== remote.base) {
          auxiliaryConflicts.push({
            target: remote.target,
            kind: "add-add",
            reason: "Different local auxiliary bytes are preserved and cannot be claimed.",
          });
          auxiliaryFileOperations.push({
            operation: "conflict",
            target: remote.target,
            owner,
            base: null,
            local,
            remote: remote.base,
            proposed: null,
            mediaType: remote.mediaType,
            risk: "conflict",
            reason: "Only byte-identical selected artifacts can be adopted.",
          });
        } else {
          if (localBytes === null) {
            auxiliaryMutations.push({
              target: remote.target,
              content: remoteBytes,
              beforeDigest: null,
            });
          }
          auxiliaryFileOperations.push({
            operation: localBytes === null ? "add" : "no-op",
            target: remote.target,
            owner,
            base: localBytes === null ? null : remote.base,
            local,
            remote: remote.base,
            proposed: remote.base,
            mediaType: remote.mediaType,
            risk: "ordinary",
            reason:
              localBytes === null
                ? "Materialize the explicitly selected immutable package-side artifact."
                : "Adopt the byte-identical selected artifact into exact ownership.",
          });
        }
        const baseTarget = basePath(remote.base);
        const baseBytes = readProjectFile(project.root, baseTarget);
        if (baseBytes !== null && sha256(baseBytes) !== remote.base) {
          throw distributionError(
            `Immutable base ${baseTarget} is corrupt.`,
            "BASE_DIGEST_MISMATCH",
            3,
            baseTarget,
          );
        }
        auxiliaryObserved[baseTarget] = baseBytes === null ? null : remote.base;
        if (baseBytes === null) {
          auxiliaryMutations.push({ target: baseTarget, content: remoteBytes, beforeDigest: null });
        }
        reconciledFiles.push({ ...remote, installed: remote.base });
        if (remote.role === "contract") {
          auxiliaryContractChanges.push({
            item: owner,
            from: null,
            to: next.contractVersion,
          });
        }
        continue;
      }
      if (old.target !== remote.target || old.role !== remote.role) {
        throw distributionError(
          `Auxiliary ownership for ${remote.logicalPath} changed target or role without a migration.`,
          "DISTRIBUTION_OWNERSHIP_CONFLICT",
          6,
          remote.target,
        );
      }
      const oldBaseTarget = basePath(old.base);
      const oldBaseBytes = readProjectFile(project.root, oldBaseTarget);
      if (oldBaseBytes === null || sha256(oldBaseBytes) !== old.base) {
        throw distributionError(
          `Immutable base ${oldBaseTarget} is missing or corrupt.`,
          "BASE_DIGEST_MISMATCH",
          3,
          oldBaseTarget,
        );
      }
      auxiliaryObserved[oldBaseTarget] = old.base;
      if (old.base === remote.base) {
        reconciledFiles.push({
          ...remote,
          installed: local,
          ...(local === null ? { tombstone: true } : {}),
        });
        auxiliaryFileOperations.push({
          operation: "no-op",
          target: remote.target,
          owner,
          base: old.base,
          local,
          remote: remote.base,
          proposed: local,
          mediaType: remote.mediaType,
          risk: "ordinary",
          reason: "The selected auxiliary artifact and exact ownership base are unchanged.",
        });
        continue;
      }
      if (remoteBytes === undefined || sha256(remoteBytes) !== remote.base) {
        throw distributionError(
          `Updated auxiliary ${remote.logicalPath} has no exact acquired bytes.`,
          "REGISTRY_ITEM_DIGEST_INVALID",
          5,
          remote.target,
        );
      }
      const nextBaseTarget = basePath(remote.base);
      const nextBaseBytes = readProjectFile(project.root, nextBaseTarget);
      if (nextBaseBytes !== null && sha256(nextBaseBytes) !== remote.base) {
        throw distributionError(
          `Immutable base ${nextBaseTarget} is corrupt.`,
          "BASE_DIGEST_MISMATCH",
          3,
          nextBaseTarget,
        );
      }
      auxiliaryObserved[nextBaseTarget] = nextBaseBytes === null ? null : remote.base;
      if (nextBaseBytes === null) {
        auxiliaryMutations.push({
          target: nextBaseTarget,
          content: remoteBytes,
          beforeDigest: null,
        });
      }
      if (local === null) {
        reconciledFiles.push({ ...remote, installed: null, tombstone: true });
        auxiliaryFileOperations.push({
          operation: "no-op",
          target: remote.target,
          owner,
          base: old.base,
          local: null,
          remote: remote.base,
          proposed: null,
          mediaType: remote.mediaType,
          risk: "ordinary",
          reason: "The local deletion is preserved while the immutable upstream base advances.",
        });
      } else if (local === old.base) {
        auxiliaryMutations.push({
          target: remote.target,
          content: remoteBytes,
          beforeDigest: local,
        });
        reconciledFiles.push({ ...remote, installed: remote.base });
        auxiliaryFileOperations.push({
          operation: "fast-forward",
          target: remote.target,
          owner,
          base: old.base,
          local,
          remote: remote.base,
          proposed: remote.base,
          mediaType: remote.mediaType,
          risk: "ordinary",
          reason: "The unmodified owned artifact advances to its exact new immutable bytes.",
        });
      } else {
        reconciledFiles.push(old);
        auxiliaryConflicts.push({
          target: remote.target,
          kind: "modify-modify",
          reason: "The locally customized auxiliary artifact cannot be overwritten by update.",
        });
        auxiliaryFileOperations.push({
          operation: "conflict",
          target: remote.target,
          owner,
          base: old.base,
          local,
          remote: remote.base,
          proposed: local,
          mediaType: remote.mediaType,
          risk: "conflict",
          reason: "Customized bytes are preserved for explicit resolution.",
        });
      }
      if (remote.role === "contract") {
        auxiliaryContractChanges.push({
          item: owner,
          from: previous?.contractVersion ?? null,
          to: next.contractVersion,
        });
      }
    }
    const nextLogicalPaths = new Set(next.files.map(({ logicalPath }) => logicalPath));
    for (const old of previous?.files ?? []) {
      if (nextLogicalPaths.has(old.logicalPath)) continue;
      const localBytes = readProjectFile(project.root, old.target);
      const local = localBytes === null ? null : sha256(localBytes);
      const oldBaseTarget = basePath(old.base);
      const oldBaseBytes = readProjectFile(project.root, oldBaseTarget);
      const baseValid = oldBaseBytes !== null && sha256(oldBaseBytes) === old.base;
      auxiliaryObserved[old.target] = local;
      auxiliaryObserved[oldBaseTarget] = oldBaseBytes === null ? null : sha256(oldBaseBytes);
      if (!baseValid || (local !== null && local !== old.base)) {
        reconciledFiles.push(old);
        auxiliaryConflicts.push({
          target: old.target,
          kind: "modify-delete",
          reason: !baseValid
            ? "The immutable auxiliary base is missing or corrupt, so upstream deletion cannot be proven safe."
            : "The locally customized auxiliary artifact is preserved during upstream deletion.",
        });
        auxiliaryFileOperations.push({
          operation: "conflict",
          target: old.target,
          owner,
          base: old.base,
          local,
          remote: null,
          proposed: local,
          mediaType: old.mediaType,
          risk: "conflict",
          reason: "Upstream deletion cannot discard customized or unprovable bytes.",
        });
      } else if (local === null) {
        auxiliaryFileOperations.push({
          operation: "no-op",
          target: old.target,
          owner,
          base: old.base,
          local: null,
          remote: null,
          proposed: null,
          mediaType: old.mediaType,
          risk: "ordinary",
          reason: "The upstream-removed auxiliary artifact is already locally absent.",
        });
      } else {
        auxiliaryMutations.push({ target: old.target, content: null, beforeDigest: local });
        auxiliaryFileOperations.push({
          operation: "delete",
          target: old.target,
          owner,
          base: old.base,
          local,
          remote: null,
          proposed: null,
          mediaType: old.mediaType,
          risk: "destructive",
          reason: "The upstream-removed artifact still exactly matches its immutable owned base.",
        });
      }
    }
    reconciledItems[owner] = { ...next, files: reconciledFiles };
  }
  state = { ...state, items: reconciledItems };
  state = serializeDistributionProvenance(state).state;
  const packagePlan = packagePlanFor(command, project, state, release.release);
  assertPackageManagerScope(
    project.inspection,
    packagePlan.after !== packagePlan.before,
    options.noInstall,
  );
  const changedItems = operationIds.some((id) => {
    const owner = `${release.registry.id}:${id}`;
    return (
      canonicalJson(project.distribution?.state.items[owner] ?? null) !==
      canonicalJson(state.items[owner])
    );
  });
  const formatter =
    changedItems && (options.noFormat === true || project.config.formatting.strategy === "none")
      ? "none"
      : changedItems
        ? "mergora@1"
        : project.manifest.value.toolchain.formatter;
  const nextManifest = manifestFromDistributionState(
    project.manifest.value,
    project.config,
    state,
    formatter,
  );
  const nextManifestBytes = manifestBytes(nextManifest);
  const mutations: TransactionMutation[] = [...auxiliaryMutations];
  const observedTargets: Record<string, Digest | null> = { ...auxiliaryObserved };
  const fileOperations: OperationPlanFile[] = [...auxiliaryFileOperations];
  const contractChanges: OperationPlan["contractChanges"][number][] = [...auxiliaryContractChanges];
  const conflicts: OperationPlan["conflicts"][number][] = [...auxiliaryConflicts];
  const owner = `${release.registry.id}:${operationIds[0]!}`;
  if (packagePlan.after !== packagePlan.before) {
    const before = Buffer.from(packagePlan.before);
    const after = Buffer.from(packagePlan.after);
    observedTargets["package.json"] = sha256(before);
    mutations.push({ target: "package.json", content: after, beforeDigest: sha256(before) });
    fileOperations.push({
      operation: "structured-patch",
      target: "package.json",
      owner,
      base: sha256(before),
      local: sha256(before),
      remote: sha256(after),
      proposed: sha256(after),
      mediaType: "application/json",
      risk: "review-required",
      reason: `Apply only the exact reviewed ${project.config.distribution.packageName} dependency ${packagePlan.changes[0]?.operation ?? "change"}.`,
    });
  }
  observedTargets[MANIFEST_PATH] = sha256(project.manifest.bytes);
  if (!nextManifestBytes.equals(project.manifest.bytes)) {
    mutations.push({
      target: MANIFEST_PATH,
      content: nextManifestBytes,
      beforeDigest: sha256(project.manifest.bytes),
      manifest: true,
    });
    fileOperations.push({
      operation: "structured-patch",
      target: MANIFEST_PATH,
      owner,
      base: sha256(project.manifest.bytes),
      local: sha256(project.manifest.bytes),
      remote: sha256(nextManifestBytes),
      proposed: sha256(nextManifestBytes),
      mediaType: "application/json",
      risk: "review-required",
      reason:
        "Record exact package mode, public imports, fixed release, archive digest, and ownership without source-file bases.",
    });
  }
  const expectedDistribution = distributionProvenanceFromManifest(nextManifest)!;
  const validators: readonly TransactionValidator[] = [
    createMediaParseValidator(
      "package-distribution-media-parse",
      mutations
        .filter(({ content }) => content !== null)
        .map(({ target, content }) => {
          const contentDigest = sha256(content!);
          const auxiliary = fileOperations.find(
            ({ remote, proposed }) => remote === contentDigest || proposed === contentDigest,
          );
          return {
            target,
            mediaType:
              target === "package.json" || target === MANIFEST_PATH
                ? "application/json"
                : (auxiliary?.mediaType ?? "application/octet-stream"),
          };
        }),
    ),
    distributionValidator({
      expectedConfig: project.config,
      expectedManifestDigest: expectedDistribution.canonicalDigest,
      packageName: project.config.distribution.packageName,
      version: release.release,
      artifact,
    }),
  ];
  const dependencyChanges: readonly OperationPlanDependencyChange[] = packagePlan.changes.map(
    (change) => ({ ...change }),
  );
  const plan = finalizeOperationPlan({
    schemaVersion: 1,
    command,
    cliVersion: CLI_VERSION,
    projectRoot: ".",
    configDigest: sha256(canonicalJson(project.config)),
    manifestPreconditionDigest: sha256(canonicalJson(project.manifest.value)),
    registries: [
      {
        id: release.registry.id,
        identityDigest: acquiredRegistryBindingDigest(release.registry),
        release: release.release,
        manifestDigest: release.manifestDigest,
        source: release.source,
        trust: release.registry.trust,
        evidenceTier: release.catalog.every(({ quality }) => quality.tier === "complete")
          ? "complete"
          : release.catalog.some(({ quality }) => quality.tier !== "not-supplied")
            ? "partial"
            : "not-supplied",
      },
    ],
    items: operationIds
      .map((id) => {
        const ownerId = `${release.registry.id}:${id}`;
        const before = project.manifest.value.items[ownerId];
        const after = state.items[ownerId]!;
        return {
          id: ownerId,
          direct: after.direct,
          requested: after.requested,
          fromVersion: before?.resolved ?? null,
          toVersion: after.resolved,
          mode: "package" as const,
        };
      })
      .sort((left, right) => left.id.localeCompare(right.id, "en-US")),
    fileOperations,
    dependencyChanges,
    structuredPatches: dependencyChanges.map((change) => ({
      id: packagePatch(change.package, change.to ?? change.from!).id,
      adapter: "package-dependency" as const,
      semanticKey: `dependencies.${change.package}`,
      target: "package.json",
      owner: change.owners[0] ?? owner,
      operation: change.operation,
    })),
    migrations: [],
    contractChanges,
    warnings: [
      "Package mode creates no component source or immutable source bases; selected Contracts remain explicit project metadata.",
      ...(options.noFormat === true && changedItems
        ? [
            "Formatting was explicitly skipped; JSON/schema/ownership/archive validation remains enabled, and formatter provenance is none.",
          ]
        : []),
      ...(packagePlan.after !== packagePlan.before && options.noInstall === true
        ? [
            `Dependency metadata changes are staged, but --no-install skips ${project.inspection.packageManager} and lockfile mutation.`,
          ]
        : []),
    ],
    consentRequirements: [
      {
        id: `${command}-package`,
        flag: "--yes",
        reason: `${command} changes reviewed package ownership or committed provenance.`,
      },
    ],
    conflicts,
    estimatedBytes: {
      download: artifact.bytes.byteLength + release.acquiredBytes,
      write: mutations.reduce((total, mutation) => total + (mutation.content?.byteLength ?? 0), 0),
    },
    validationSuite: validationSuiteForTransaction(validators),
    rollbackAvailable: true,
  });
  const registryPayloads: TransactionRegistryPayload[] = [
    ...release.items
      .filter(({ itemId }) => operationIds.includes(itemId))
      .flatMap((item) => [
        {
          registry: release.registry.id,
          release: release.release,
          url: item.payloadUrl,
          digest: item.payloadDigest,
        },
        ...(item.contractDocument === undefined
          ? []
          : [
              {
                registry: release.registry.id,
                release: release.release,
                url: item.contractDocument.url,
                digest: item.contractDocument.digest,
              },
            ]),
      ]),
    {
      registry: release.registry.id,
      release: release.release,
      url: artifact.url,
      digest: artifact.digest,
    },
  ];
  const internal: InternalPackagePlan = {
    root: project.root,
    plan,
    mutations,
    observedTargets,
    registryPayloads,
    validators,
    packageManager: project.inspection.packageManager,
    packageManagerRequired: packagePlan.after !== packagePlan.before,
    itemIds: operationIds,
    requestedItems: requested,
  };
  validateTransactionOverlay({
    root: internal.root,
    plan: internal.plan,
    mutations: internal.mutations,
    observedTargets: internal.observedTargets,
    validators: internal.validators,
  });
  return internal;
}

function buildPackageRemovePlan(options: PackageDistributionRemoveOptions): InternalPackagePlan {
  const project = readPackageProject(options);
  if (project.distribution === null) {
    throw distributionError(
      "Package removal requires committed distribution provenance.",
      "MANIFEST_DISTRIBUTION_INCOMPLETE",
      3,
      MANIFEST_PATH,
    );
  }
  const requested = [...new Set(options.itemIds)];
  if (requested.length === 0) {
    throw distributionError("Package removal requires an item.", "ITEM_REQUIRED", 3);
  }
  const requestedQualified = new Set(requested.map((item) => qualify(item, "official")));
  const currentState = project.distribution.state;
  const candidateItems = structuredClone(currentState.items) as Record<string, DistributionItem>;
  const warnings: string[] = [];
  for (const id of requestedQualified) {
    const item = candidateItems[id];
    if (item === undefined) {
      warnings.push(`Item ${id} is not installed; removal is a no-op for that request.`);
      continue;
    }
    if (item.mode !== "package") {
      throw distributionError(
        `Item ${id} is source-owned; select source removal or migrate explicitly.`,
        "DISTRIBUTION_MODE_MIGRATION_REQUIRED",
        6,
        MANIFEST_PATH,
      );
    }
    candidateItems[id] = { ...item, direct: false };
  }
  const keep = new Set<string>();
  const visit = (id: string): void => {
    if (keep.has(id)) return;
    const item = candidateItems[id];
    if (item === undefined) return;
    keep.add(id);
    item.registryDependencies.forEach(visit);
  };
  for (const [id, item] of Object.entries(candidateItems)) {
    if (item.direct) visit(id);
  }
  const removed = new Set(
    Object.keys(candidateItems).filter(
      (id) => currentState.items[id]?.mode === "package" && !keep.has(id),
    ),
  );
  for (const id of removed) delete candidateItems[id];
  for (const id of requestedQualified) {
    if (currentState.items[id] !== undefined && keep.has(id)) {
      warnings.push(`Item ${id} remains as a transitive dependency of another direct item.`);
    }
  }
  const dependencyOwnership = Object.fromEntries(
    Object.entries(currentState.dependencyOwnership)
      .map(
        ([key, ownership]) =>
          [
            key,
            {
              ...ownership,
              owners: ownership.owners.filter((owner) => candidateItems[owner] !== undefined),
            },
          ] as const,
      )
      .filter(([, ownership]) => ownership.owners.length > 0),
  );
  const patchOwnership = Object.fromEntries(
    Object.entries(currentState.patchOwnership)
      .map(
        ([key, ownership]) =>
          [
            key,
            {
              ...ownership,
              owners: ownership.owners.filter((owner) => candidateItems[owner] !== undefined),
            },
          ] as const,
      )
      .filter(([, ownership]) => ownership.owners.length > 0),
  );
  const referencedReleases = new Set(
    Object.values(candidateItems).map(({ releaseRef }) => releaseRef),
  );
  let nextState: DistributionProvenanceState = {
    ...currentState,
    items: candidateItems,
    releases: Object.fromEntries(
      Object.entries(currentState.releases).filter(([ref]) => referencedReleases.has(ref)),
    ),
    dependencyOwnership,
    patchOwnership,
  };
  if (Object.keys(nextState.items).length > 0) {
    nextState = serializeDistributionProvenance(nextState).state;
  }

  const packageName = project.config.distribution.packageName;
  const packageOwnership = currentState.dependencyOwnership[`runtime:${packageName}`];
  const remainingPackageOwners = Object.entries(candidateItems).filter(
    ([, item]) => item.mode === "package" && item.packageClaims.includes(packageName),
  );
  const removeOwnedPackageDependency =
    remainingPackageOwners.length === 0 && packageOwnership?.retention === "remove-if-unowned";
  if (removeOwnedPackageDependency) {
    const packageDocument = JSON.parse(
      readProjectFile(project.root, "package.json")!.toString("utf8"),
    ) as { dependencies?: Record<string, unknown> };
    if (packageDocument.dependencies?.[packageName] !== packageOwnership.range) {
      throw distributionError(
        `Package dependency ${packageName} no longer equals its exact owned ${packageOwnership.range} value.`,
        "DEPENDENCY_OWNERSHIP_PRECONDITION_FAILED",
        6,
        "package.json",
      );
    }
  }
  const removals = removeOwnedPackageDependency ? { [packageName]: packageOwnership.owners } : {};
  const packagePlan = planPackageDependencies(resolve(project.root, "package.json"), {}, removals);
  assertPackageManagerScope(
    project.inspection,
    packagePlan.after !== packagePlan.before,
    options.noInstall,
  );
  const nextManifest =
    Object.keys(nextState.items).length === 0
      ? {
          $schema: project.manifest.value.$schema,
          schemaVersion: 1 as const,
          projectId: project.manifest.value.projectId,
          toolchain: project.manifest.value.toolchain,
          items: {},
          sharedTargets: {},
          dependencyOwners: {},
        }
      : manifestFromDistributionState(
          project.manifest.value,
          project.config,
          nextState,
          project.manifest.value.toolchain.formatter,
        );
  const nextManifestBytes = manifestBytes(nextManifest);
  const mutations: TransactionMutation[] = [];
  const observedTargets: Record<string, Digest | null> = {};
  const fileOperations: OperationPlanFile[] = [];
  const conflicts: OperationPlan["conflicts"][number][] = [];
  const retainedFiles: string[] = [];
  const keptTargets = new Set(
    Object.values(candidateItems).flatMap((item) => item.files.map(({ target }) => target)),
  );
  const processedTargets = new Set<string>();
  for (const id of removed) {
    const item = currentState.items[id]!;
    for (const file of item.files) {
      if (keptTargets.has(file.target) || processedTargets.has(file.target)) continue;
      processedTargets.add(file.target);
      const localBytes = readProjectFile(project.root, file.target);
      const local = localBytes === null ? null : sha256(localBytes);
      const baseTarget = basePath(file.base);
      const baseBytes = readProjectFile(project.root, baseTarget);
      const baseValid = baseBytes !== null && sha256(baseBytes) === file.base;
      observedTargets[file.target] = local;
      observedTargets[baseTarget] = baseBytes === null ? null : sha256(baseBytes);
      if (options.keepFiles === true) {
        retainedFiles.push(file.target);
        fileOperations.push({
          operation: "no-op",
          target: file.target,
          owner: id,
          base: file.base,
          local,
          remote: null,
          proposed: local,
          mediaType: file.mediaType,
          risk: "ordinary",
          reason: "--keep-files detaches exact ownership while retaining project-side bytes.",
        });
      } else if (local === null) {
        fileOperations.push({
          operation: "no-op",
          target: file.target,
          owner: id,
          base: file.base,
          local: null,
          remote: null,
          proposed: null,
          mediaType: file.mediaType,
          risk: "ordinary",
          reason: "The owned auxiliary target is already locally absent.",
        });
      } else if (!baseValid || local !== file.base) {
        retainedFiles.push(file.target);
        conflicts.push({
          target: file.target,
          kind: "modify-delete",
          reason: !baseValid
            ? "The immutable base is missing or corrupt, so deletion cannot be proven safe."
            : "The owned auxiliary target is locally customized and will not be deleted.",
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
        mutations.push({ target: file.target, content: null, beforeDigest: local });
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
          reason: "The live bytes exactly match their immutable owned base.",
        });
      }
    }
  }
  const owner = [...removed][0] ?? [...requestedQualified][0]!;
  if (packagePlan.after !== packagePlan.before) {
    const before = Buffer.from(packagePlan.before);
    const after = Buffer.from(packagePlan.after);
    observedTargets["package.json"] = sha256(before);
    mutations.push({ target: "package.json", content: after, beforeDigest: sha256(before) });
    fileOperations.push({
      operation: "structured-patch",
      target: "package.json",
      owner,
      base: sha256(before),
      local: sha256(before),
      remote: sha256(after),
      proposed: sha256(after),
      mediaType: "application/json",
      risk: "review-required",
      reason: `Remove the exact unowned ${packageName} dependency declaration.`,
    });
  }
  observedTargets[MANIFEST_PATH] = sha256(project.manifest.bytes);
  if (!nextManifestBytes.equals(project.manifest.bytes)) {
    mutations.push({
      target: MANIFEST_PATH,
      content: nextManifestBytes,
      beforeDigest: sha256(project.manifest.bytes),
      manifest: true,
    });
    fileOperations.push({
      operation: "structured-patch",
      target: MANIFEST_PATH,
      owner,
      base: sha256(project.manifest.bytes),
      local: sha256(project.manifest.bytes),
      remote: sha256(nextManifestBytes),
      proposed: sha256(nextManifestBytes),
      mediaType: "application/json",
      risk: "review-required",
      reason: "Prune only unneeded package ownership and exact auxiliary provenance.",
    });
  }
  const expectedDistribution = distributionProvenanceFromManifest(nextManifest);
  const expectedPackage = JSON.parse(packagePlan.after) as {
    dependencies?: Record<string, unknown>;
  };
  const expectedVersion =
    typeof expectedPackage.dependencies?.[packageName] === "string"
      ? expectedPackage.dependencies[packageName]
      : null;
  const validators: readonly TransactionValidator[] = [
    createMediaParseValidator(
      "package-distribution-removal-media-parse",
      mutations
        .filter(({ content }) => content !== null)
        .map(({ target }) => ({ target, mediaType: "application/json" })),
    ),
    distributionRemovalValidator({
      expectedConfig: project.config,
      expectedManifestDigest: sha256(canonicalJson(nextManifest)),
      expectedDistributionDigest: expectedDistribution?.canonicalDigest ?? null,
      packageName,
      expectedVersion,
    }),
  ];
  const plan = finalizeOperationPlan({
    schemaVersion: 1,
    command: "remove",
    cliVersion: CLI_VERSION,
    projectRoot: ".",
    configDigest: sha256(canonicalJson(project.config)),
    manifestPreconditionDigest: sha256(canonicalJson(project.manifest.value)),
    registries: [...removed]
      .map((id) => currentState.items[id]!.releaseRef)
      .filter((ref, index, refs) => refs.indexOf(ref) === index)
      .map((ref) => {
        const release = currentState.releases[ref]!;
        return {
          id: release.registryId,
          identityDigest: release.identityDigest,
          release: release.release,
          manifestDigest: release.manifestDigest,
          source: "verified-cache" as const,
          trust: release.trust,
          evidenceTier: "not-supplied" as const,
        };
      }),
    items: [...new Set([...requestedQualified, ...removed])]
      .filter((id) => currentState.items[id] !== undefined)
      .map((id) => ({
        id,
        direct: currentState.items[id]!.direct,
        requested: currentState.items[id]!.requested,
        fromVersion: currentState.items[id]!.resolved,
        toVersion: removed.has(id) ? null : currentState.items[id]!.resolved,
        mode: "package" as const,
      })),
    fileOperations: fileOperations.sort((left, right) =>
      left.target.localeCompare(right.target, "en-US"),
    ),
    dependencyChanges: packagePlan.changes,
    structuredPatches: packagePlan.changes.map((change) => ({
      id: packagePatch(change.package, change.from ?? change.to!).id,
      adapter: "package-dependency" as const,
      semanticKey: `dependencies.${change.package}`,
      target: "package.json",
      owner: change.owners[0] ?? owner,
      operation: change.operation,
    })),
    migrations: [],
    contractChanges: [],
    warnings: [
      ...warnings,
      ...(options.keepFiles === true
        ? ["--keep-files detaches package-side artifact ownership without deleting bytes."]
        : []),
    ],
    consentRequirements: [
      {
        id: "remove-package",
        flag: "--yes",
        reason: "Remove reviewed package ownership and only exact unmodified auxiliary files.",
      },
    ],
    conflicts,
    estimatedBytes: {
      download: 0,
      write: mutations.reduce((total, mutation) => total + (mutation.content?.byteLength ?? 0), 0),
    },
    validationSuite: validationSuiteForTransaction(validators),
    rollbackAvailable: true,
  });
  const internal: InternalPackagePlan = {
    root: project.root,
    plan,
    mutations,
    observedTargets,
    registryPayloads: [...removed].map((id) => ({
      registry: currentState.items[id]!.registry,
      release: currentState.items[id]!.resolved,
      url: currentState.items[id]!.payload.url,
      digest: currentState.items[id]!.payload.digest,
    })),
    validators,
    packageManager: project.inspection.packageManager,
    packageManagerRequired: packagePlan.after !== packagePlan.before,
    itemIds: [...removed].map((id) => id.slice(id.indexOf(":") + 1)),
    requestedItems: requested,
  };
  validateTransactionOverlay({
    root: internal.root,
    plan: internal.plan,
    mutations: internal.mutations,
    observedTargets: internal.observedTargets,
    validators: internal.validators,
  });
  return internal;
}

export function planPackageDistributionAdd(options: PackageDistributionAddOptions): OperationPlan {
  return buildPackagePlan("add", options).plan;
}

export function planPackageDistributionUpdate(
  options: PackageDistributionUpdateOptions,
): OperationPlan {
  return buildPackagePlan("update", options).plan;
}

export function planPackageDistributionRemove(
  options: PackageDistributionRemoveOptions,
): OperationPlan {
  return buildPackageRemovePlan(options).plan;
}

function applyPackageOperation(
  command: "add" | "update",
  options: PackageDistributionOperationOptions,
  reviewedPlanDigest: string,
): PackageDistributionResult {
  const internal = buildPackagePlan(command, options);
  if (reviewedPlanDigest !== internal.plan.planDigest) {
    throw distributionError(
      "Package distribution plan changed before apply; review a fresh exact plan.",
      "PLAN_PRECONDITION_STALE",
      8,
    );
  }
  const transaction = executeTransaction({
    root: internal.root,
    plan: internal.plan,
    mutations: internal.mutations,
    acceptedConsents: internal.plan.consentRequirements.map(({ id }) => ({
      id,
      planDigest: internal.plan.planDigest,
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
    mode: "package-transaction",
    command,
    items: internal.itemIds,
    requestedItems: internal.requestedItems,
    manifest: MANIFEST_PATH,
    transaction,
    planDigest: internal.plan.planDigest,
  };
}

export function applyPackageDistributionAdd(
  options: PackageDistributionAddOptions,
  reviewedPlanDigest: string,
): PackageDistributionResult {
  return applyPackageOperation("add", options, reviewedPlanDigest);
}

export function applyPackageDistributionUpdate(
  options: PackageDistributionUpdateOptions,
  reviewedPlanDigest: string,
): PackageDistributionResult {
  return applyPackageOperation("update", options, reviewedPlanDigest);
}

export function applyPackageDistributionRemove(
  options: PackageDistributionRemoveOptions,
  reviewedPlanDigest: string,
): PackageDistributionResult {
  const internal = buildPackageRemovePlan(options);
  if (reviewedPlanDigest !== internal.plan.planDigest) {
    throw distributionError(
      "Package removal plan changed before apply; review a fresh exact plan.",
      "PLAN_PRECONDITION_STALE",
      8,
    );
  }
  const transaction = executeTransaction({
    root: internal.root,
    plan: internal.plan,
    mutations: internal.mutations,
    acceptedConsents: internal.plan.consentRequirements.map(({ id }) => ({
      id,
      planDigest: internal.plan.planDigest,
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
    mode: "package-transaction",
    command: "remove",
    items: internal.itemIds,
    requestedItems: internal.requestedItems,
    manifest: MANIFEST_PATH,
    transaction,
    planDigest: internal.plan.planDigest,
  };
}
