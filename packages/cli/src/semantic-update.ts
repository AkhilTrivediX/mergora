import { randomBytes } from "node:crypto";
import {
  closeSync,
  constants,
  existsSync,
  fsyncSync,
  lstatSync,
  mkdirSync,
  openSync,
  readFileSync,
  renameSync,
  writeFileSync,
} from "node:fs";
import { dirname, resolve } from "node:path";

import {
  createConflictBundle,
  mergeFileThreeWay,
  type FileMergeResult,
  type SemanticConflict,
  type SemanticConflictReason,
} from "mergora-registry";

import {
  assertNoSymlinkAncestors,
  assertPortableRelativePath,
  canonicalJson,
  CLI_VERSION,
  CliError,
  portableSort,
  resolveInside,
  sha256,
  validatedProjectRoot,
} from "./contracts.js";
import {
  mergoraConfigAliasPrefix,
  readMergoraConfig,
  type MergoraConfig,
} from "./configuration.js";
import {
  planPackageDependencies,
  readPackageDependencies,
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
  digestOrNull,
  manifestBytes,
  MANIFEST_PATH,
  readManifest,
  readProjectFile,
  type ManifestFile,
  type ManifestItem,
  type ManifestPatch,
  type ProvenanceManifest,
} from "./source-operations.js";
import {
  executeTransaction,
  finalizeOperationPlan,
  type OperationPlan,
  type OperationPlanDependencyChange,
  type OperationPlanFile,
  type PackageManagerRunner,
  type TransactionFaultInjector,
  type TransactionMutation,
  type TransactionRegistryPayload,
  type TransactionResult,
} from "./transaction-engine.js";

const SEMVER =
  /^(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)(?:-[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?(?:\+[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?$/u;
const DIGEST = /^sha256:[a-f0-9]{64}$/u;
const ITEM_ID = /^[a-z0-9]+(?:-[a-z0-9]+)*$/u;
const REGISTRY_ID = ITEM_ID;
const TRANSACTION_ID = /^[0-9]{8}T[0-9]{6}(?:\.[0-9]{3})?Z-[0-9a-f]{32}$/u;
const CONFLICT_MARKER = /^(?:<<<<<<<|=======|>>>>>>>)(?:\s|$)/mu;
const CONFLICT_STATE_PATH = "conflict-state.json" as const;
const CONFLICT_STATE_DIGEST_PATH = "conflict-state.sha256" as const;

type Digest = `sha256:${string}`;

export interface ImmutableUpdateRegistry {
  readonly id: string;
  readonly protocol: "mergora-v1";
  readonly origin: string;
  readonly identityDigest: Digest;
  readonly source: "network" | "verified-cache" | "vendor" | "mirror";
  readonly trust: "official" | "enrolled" | "local-development";
  readonly evidenceTier: "complete" | "partial" | "not-supplied";
}

export interface ImmutableUpdateFile {
  readonly logicalPath: string;
  readonly role: ManifestFile["role"];
  readonly mediaType: string;
  readonly encoding: "utf8" | "base64";
  readonly content: string;
  readonly digest: Digest;
  readonly executable: false;
}

export interface ImmutableUpdateItem {
  readonly itemId: string;
  readonly kind: ManifestItem["kind"];
  readonly resolved: string;
  readonly payloadUrl: string;
  readonly payloadDigest: Digest;
  readonly renderedWithTransformContextDigest: Digest;
  readonly files: readonly ImmutableUpdateFile[];
  readonly registryDependencies: readonly string[];
  readonly dependencies: {
    readonly runtime: Readonly<Record<string, string>>;
    readonly development: Readonly<Record<string, string>>;
  };
  readonly contractVersion: string;
  readonly lastMigration: string | null;
}

export interface ImmutableUpdateRelease {
  readonly schemaVersion: 1;
  readonly registry: ImmutableUpdateRegistry;
  /** Exact immutable semver. Mutable aliases such as `latest` are never accepted. */
  readonly release: string;
  readonly manifestDigest: Digest;
  readonly items: readonly ImmutableUpdateItem[];
}

export interface SemanticUpdateOptions {
  readonly projectRoot: string;
  readonly itemIds?: readonly string[] | undefined;
  readonly release: ImmutableUpdateRelease;
  readonly noInstall?: boolean | undefined;
  readonly offline?: boolean | undefined;
  readonly packageManager?: PackageManager | undefined;
  readonly packageManagerRunner?: PackageManagerRunner | undefined;
  readonly faultInjector?: TransactionFaultInjector | undefined;
  readonly commandArguments?: readonly string[] | undefined;
  /** Deterministic tests may inject an otherwise valid fresh transaction ID. */
  readonly conflictTransactionId?: string | undefined;
}

export interface SemanticUpdateCommittedResult {
  readonly mode: "semantic-update";
  readonly status: "committed";
  readonly items: readonly string[];
  readonly release: string;
  readonly planDigest: Digest;
  readonly transaction: TransactionResult;
}

export interface SemanticUpdateConflictResult {
  readonly mode: "semantic-update";
  readonly status: "conflicted";
  readonly items: readonly string[];
  readonly release: string;
  readonly planDigest: Digest;
  readonly conflictTransactionId: string;
  readonly conflictRoot: string;
  readonly conflicts: OperationPlan["conflicts"];
  readonly liveProjectChanged: false;
}

export type SemanticUpdateResult = SemanticUpdateCommittedResult | SemanticUpdateConflictResult;

interface UpdateEntry {
  readonly key: string;
  readonly target: string;
  readonly owner: string;
  readonly logicalPath: string;
  readonly role: ManifestFile["role"];
  readonly mediaType: string;
  readonly base: Buffer | null;
  readonly local: Buffer | null;
  readonly remote: Buffer | null;
  readonly result: FileMergeResult;
  readonly proposed: Buffer | null;
  readonly remoteFile: ImmutableUpdateFile | null;
}

interface InternalUpdatePlan {
  readonly root: string;
  readonly config: MergoraConfig;
  readonly inspection: ProjectInspection;
  readonly manifest: ProvenanceManifest;
  readonly manifestBeforeBytes: Buffer;
  readonly nextManifest: ProvenanceManifest;
  readonly nextManifestBytes: Buffer;
  readonly selectedItems: readonly string[];
  readonly remoteItems: readonly ImmutableUpdateItem[];
  readonly entries: readonly UpdateEntry[];
  readonly packagePlan: PackageDependencyPlan;
  readonly plan: OperationPlan;
  readonly mutations: readonly TransactionMutation[];
  readonly observedTargets: Readonly<Record<string, Digest | null>>;
  readonly registryPayloads: readonly TransactionRegistryPayload[];
}

function digest(value: unknown): Digest {
  return sha256(canonicalJson(value));
}

function assertDigest(value: string, label: string): asserts value is Digest {
  if (!DIGEST.test(value)) {
    throw new CliError(`${label} is not a SHA-256 digest.`, {
      code: "REGISTRY_DIGEST_INVALID",
      exitCode: 5,
    });
  }
}

function safeHttpsUrl(value: string, label: string): URL {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new CliError(`${label} is not a valid URL.`, {
      code: "REGISTRY_URL_INVALID",
      exitCode: 5,
    });
  }
  if (
    url.protocol !== "https:" ||
    url.username !== "" ||
    url.password !== "" ||
    url.search !== "" ||
    url.hash !== ""
  ) {
    throw new CliError(`${label} must be credential-free immutable HTTPS metadata.`, {
      code: "REGISTRY_URL_INVALID",
      exitCode: 5,
    });
  }
  return url;
}

function updateRegistryIdentity(registry: ImmutableUpdateRegistry): unknown {
  return {
    id: registry.id,
    protocol: registry.protocol,
    origin: registry.origin,
    trust: registry.trust,
  };
}

export function immutableUpdateRegistryIdentityDigest(
  registry: Omit<ImmutableUpdateRegistry, "identityDigest" | "source" | "evidenceTier">,
): Digest {
  return digest(registry);
}

function updateItemPayload(item: ImmutableUpdateItem): unknown {
  return {
    itemId: item.itemId,
    kind: item.kind,
    resolved: item.resolved,
    payloadUrl: item.payloadUrl,
    renderedWithTransformContextDigest: item.renderedWithTransformContextDigest,
    files: item.files,
    registryDependencies: item.registryDependencies,
    dependencies: item.dependencies,
    contractVersion: item.contractVersion,
    lastMigration: item.lastMigration,
  };
}

export function immutableUpdateItemDigest(
  item: Omit<ImmutableUpdateItem, "payloadDigest">,
): Digest {
  return digest(item);
}

function updateReleaseManifest(release: ImmutableUpdateRelease): unknown {
  return {
    schemaVersion: release.schemaVersion,
    registry: release.registry,
    release: release.release,
    items: release.items
      .map(({ itemId, resolved, payloadDigest }) => ({ itemId, resolved, payloadDigest }))
      .sort((left, right) => left.itemId.localeCompare(right.itemId, "en-US")),
  };
}

export function immutableUpdateReleaseDigest(
  release: Omit<ImmutableUpdateRelease, "manifestDigest">,
): Digest {
  return digest({
    schemaVersion: release.schemaVersion,
    registry: release.registry,
    release: release.release,
    items: release.items
      .map(({ itemId, resolved, payloadDigest }) => ({ itemId, resolved, payloadDigest }))
      .sort((left, right) => left.itemId.localeCompare(right.itemId, "en-US")),
  });
}

/**
 * Loads an explicitly acquired, project-relative immutable release snapshot.
 * It performs no network or cache writes and validates every declared digest
 * before returning metadata to update or diff planning.
 */
export function readImmutableUpdateRelease(
  projectRoot: string,
  releaseFile: string,
): ImmutableUpdateRelease {
  const root = validatedProjectRoot(projectRoot);
  assertPortableRelativePath(releaseFile, "Immutable release file");
  const path = resolve(root, ...releaseFile.split("/"));
  let metadata;
  try {
    metadata = lstatSync(path);
  } catch {
    metadata = null;
  }
  if (
    metadata === null ||
    metadata.isSymbolicLink() ||
    !metadata.isFile() ||
    metadata.size > 52_428_800
  ) {
    throw new CliError("The immutable release snapshot is missing, unsafe, or oversized.", {
      code: "REGISTRY_RELEASE_FILE_INVALID",
      exitCode: 5,
      target: releaseFile,
    });
  }
  const bytes = readProjectFile(root, releaseFile);
  if (bytes === null || bytes.byteLength > 52_428_800) {
    throw new CliError("The immutable release snapshot is missing or oversized.", {
      code: "REGISTRY_RELEASE_FILE_INVALID",
      exitCode: 5,
      target: releaseFile,
    });
  }
  let value: unknown;
  try {
    value = JSON.parse(bytes.toString("utf8")) as unknown;
  } catch {
    value = null;
  }
  if (value === null || Array.isArray(value) || typeof value !== "object") {
    throw new CliError("The immutable release snapshot is invalid JSON metadata.", {
      code: "REGISTRY_RELEASE_FILE_INVALID",
      exitCode: 5,
      target: releaseFile,
    });
  }
  const config = readMergoraConfig(root);
  if (config === null) {
    throw new CliError("mergora.json is missing; initialize the project first.", {
      code: "CONFIG_MISSING",
      exitCode: 3,
      target: "mergora.json",
    });
  }
  const release = value as ImmutableUpdateRelease;
  validateRelease(release, config.policy.maxRegistryItemBytes);
  return release;
}

function remoteBytes(file: ImmutableUpdateFile): Buffer {
  let bytes: Buffer;
  try {
    bytes = Buffer.from(file.content, file.encoding === "base64" ? "base64" : "utf8");
  } catch {
    throw new CliError(`Remote file ${file.logicalPath} has invalid ${file.encoding} bytes.`, {
      code: "REGISTRY_PAYLOAD_INVALID",
      exitCode: 5,
      target: file.logicalPath,
    });
  }
  if (file.encoding === "base64" && bytes.toString("base64") !== file.content) {
    throw new CliError(`Remote file ${file.logicalPath} has non-canonical base64 bytes.`, {
      code: "REGISTRY_PAYLOAD_INVALID",
      exitCode: 5,
      target: file.logicalPath,
    });
  }
  if (sha256(bytes) !== file.digest) {
    throw new CliError(`Remote file ${file.logicalPath} failed digest verification.`, {
      code: "REGISTRY_PAYLOAD_DIGEST_MISMATCH",
      exitCode: 5,
      target: file.logicalPath,
    });
  }
  return bytes;
}

function validateRelease(release: ImmutableUpdateRelease, maxFileBytes: number): void {
  if (release.schemaVersion !== 1 || !SEMVER.test(release.release)) {
    throw new CliError("Update target must be an explicit immutable semantic version.", {
      code: "REGISTRY_RELEASE_INVALID",
      exitCode: 5,
    });
  }
  if (
    !REGISTRY_ID.test(release.registry.id) ||
    release.registry.protocol !== "mergora-v1" ||
    !["network", "verified-cache", "vendor", "mirror"].includes(release.registry.source) ||
    !["official", "enrolled", "local-development"].includes(release.registry.trust) ||
    !["complete", "partial", "not-supplied"].includes(release.registry.evidenceTier)
  ) {
    throw new CliError("Update registry identity metadata is invalid.", {
      code: "REGISTRY_IDENTITY_INVALID",
      exitCode: 5,
    });
  }
  const registryUrl = safeHttpsUrl(release.registry.origin, "Update registry origin");
  assertDigest(release.registry.identityDigest, "Update registry identity digest");
  if (digest(updateRegistryIdentity(release.registry)) !== release.registry.identityDigest) {
    throw new CliError("Update registry identity digest does not match its immutable identity.", {
      code: "REGISTRY_IDENTITY_MISMATCH",
      exitCode: 5,
    });
  }
  assertDigest(release.manifestDigest, "Update release manifest digest");
  if (digest(updateReleaseManifest(release)) !== release.manifestDigest) {
    throw new CliError("Update release manifest failed digest verification.", {
      code: "REGISTRY_MANIFEST_DIGEST_MISMATCH",
      exitCode: 5,
    });
  }
  if (release.items.length === 0 || release.items.length > 4096) {
    throw new CliError("Update release contains an invalid item count.", {
      code: "REGISTRY_PAYLOAD_INVALID",
      exitCode: 5,
    });
  }
  const itemIds = new Set<string>();
  for (const item of release.items) {
    if (
      !ITEM_ID.test(item.itemId) ||
      itemIds.has(item.itemId) ||
      item.resolved !== release.release ||
      !SEMVER.test(item.contractVersion) ||
      item.files.length > 2048
    ) {
      throw new CliError(`Update payload for ${item.itemId} has invalid immutable metadata.`, {
        code: "REGISTRY_PAYLOAD_INVALID",
        exitCode: 5,
      });
    }
    itemIds.add(item.itemId);
    const payloadUrl = safeHttpsUrl(item.payloadUrl, `Update payload URL for ${item.itemId}`);
    if (
      payloadUrl.origin !== registryUrl.origin ||
      !payloadUrl.pathname.split("/").includes(release.release)
    ) {
      throw new CliError(
        `Update payload URL for ${item.itemId} is not tied to the explicit immutable registry release.`,
        { code: "REGISTRY_URL_INVALID", exitCode: 5 },
      );
    }
    assertDigest(item.payloadDigest, `Update payload digest for ${item.itemId}`);
    assertDigest(
      item.renderedWithTransformContextDigest,
      `Transform context digest for ${item.itemId}`,
    );
    if (digest(updateItemPayload(item)) !== item.payloadDigest) {
      throw new CliError(`Update payload for ${item.itemId} failed digest verification.`, {
        code: "REGISTRY_PAYLOAD_DIGEST_MISMATCH",
        exitCode: 5,
      });
    }
    const logicalPaths = new Set<string>();
    for (const file of item.files) {
      assertPortableRelativePath(file.logicalPath, "Remote logical path");
      const portable = file.logicalPath.normalize("NFC").toLocaleLowerCase("en-US");
      if (
        logicalPaths.has(portable) ||
        file.executable !== false ||
        file.mediaType.length === 0 ||
        !["utf8", "base64"].includes(file.encoding)
      ) {
        throw new CliError(`Update payload for ${item.itemId} repeats or invalidates a file.`, {
          code: "REGISTRY_PAYLOAD_INVALID",
          exitCode: 5,
          target: file.logicalPath,
        });
      }
      logicalPaths.add(portable);
      assertDigest(file.digest, `Remote file digest for ${file.logicalPath}`);
      const bytes = remoteBytes(file);
      if (bytes.byteLength > maxFileBytes) {
        throw new CliError(`Remote file ${file.logicalPath} exceeds the project byte policy.`, {
          code: "REGISTRY_PAYLOAD_OVERSIZE",
          exitCode: 5,
          target: file.logicalPath,
        });
      }
    }
    for (const dependency of item.registryDependencies) {
      if (!/^[a-z0-9]+(?:-[a-z0-9]+)*:[a-z0-9]+(?:-[a-z0-9]+)*$/u.test(dependency)) {
        throw new CliError(`Update payload for ${item.itemId} has an invalid dependency ID.`, {
          code: "REGISTRY_PAYLOAD_INVALID",
          exitCode: 5,
        });
      }
    }
    for (const dependencies of [item.dependencies.runtime, item.dependencies.development]) {
      for (const [name, range] of Object.entries(dependencies)) {
        if (
          !/^(?:@[a-z0-9._-]+\/)?[a-z0-9._-]+$/u.test(name) ||
          !SEMVER.test(range) ||
          /[\r\n\0]/u.test(`${name}${range}`)
        ) {
          throw new CliError(`Update payload for ${item.itemId} has invalid dependencies.`, {
            code: "REGISTRY_PAYLOAD_INVALID",
            exitCode: 5,
          });
        }
      }
    }
  }
}

function configuredProject(options: SemanticUpdateOptions): {
  readonly root: string;
  readonly config: MergoraConfig;
  readonly inspection: ProjectInspection;
  readonly manifest: ReturnType<typeof readManifest>;
} {
  const root = validatedProjectRoot(options.projectRoot);
  const config = readMergoraConfig(root);
  if (config === null) {
    throw new CliError("Mergora is not initialized; run mergora init first.", {
      code: "CONFIG_MISSING",
      exitCode: 3,
      target: "mergora.json",
    });
  }
  const manifest = readManifest(root);
  const inspection = inspectProject(root, {
    framework: config.project.framework,
    sourceRoot: config.project.sourceRoot,
    globalCss: config.styling.globalCss,
    aliasPrefix: mergoraConfigAliasPrefix(config),
    packageManager: options.packageManager,
  });
  return { root, config, inspection, manifest };
}

function qualifiedItemId(value: string): string {
  const itemId = value.startsWith("official:") ? value.slice("official:".length) : value;
  if (!ITEM_ID.test(itemId)) {
    throw new CliError(`Update item ${JSON.stringify(value)} is invalid.`, {
      code: "ITEM_REFERENCE_INVALID",
      exitCode: 2,
    });
  }
  return `official:${itemId}`;
}

function selectedItemIds(
  manifest: ProvenanceManifest,
  requested: readonly string[] | undefined,
): readonly string[] {
  const selected =
    requested === undefined || requested.length === 0
      ? Object.keys(manifest.items)
      : [...new Set(requested.map(qualifiedItemId))];
  const sorted = [...selected].sort((left, right) => left.localeCompare(right, "en-US"));
  if (sorted.length === 0) {
    throw new CliError("No source-installed items are available to update.", {
      code: "ITEM_REQUIRED",
      exitCode: 2,
    });
  }
  for (const id of sorted) {
    const item = manifest.items[id];
    if (item === undefined || item.mode !== "source") {
      throw new CliError(`Item ${id} is not source-installed in the provenance manifest.`, {
        code: "ITEM_NOT_INSTALLED",
        exitCode: 3,
        target: MANIFEST_PATH,
      });
    }
  }
  return sorted;
}

function targetRoot(item: ManifestItem, file: ImmutableUpdateFile): string {
  const targets = item.transformContext.targets;
  const key =
    item.kind === "system"
      ? "systems"
      : item.kind === "kit"
        ? "kits"
        : item.kind === "hook"
          ? "hooks"
          : item.kind === "utility"
            ? "lib"
            : item.kind === "theme" || file.role === "token"
              ? "tokens"
              : "components";
  const root = targets[key];
  if (typeof root !== "string") {
    throw new CliError(`Recorded transform context lacks target mapping ${key}.`, {
      code: "TRANSFORM_CONTEXT_INVALID",
      exitCode: 3,
      target: MANIFEST_PATH,
    });
  }
  assertPortableRelativePath(root, "Recorded transform target");
  return root;
}

function remoteTarget(
  item: ManifestItem,
  file: ImmutableUpdateFile,
  existing: ManifestFile | undefined,
): string {
  if (existing !== undefined) return existing.target;
  const filename = file.logicalPath.split("/").at(-1)!;
  const target = `${targetRoot(item, file)}/${item.itemId}/${filename}`;
  assertPortableRelativePath(target, "Rendered update target");
  return target;
}

function portableTargetKey(target: string): string {
  return `target-${sha256(target).slice("sha256:".length, "sha256:".length + 32)}`;
}

function conflictResult(
  id: string,
  reason: SemanticConflictReason,
  detail: string,
): FileMergeResult {
  const conflict: SemanticConflict = {
    id,
    reason,
    base: null,
    local: null,
    remote: null,
    detail,
  };
  return {
    status: "conflict",
    proposed: null,
    conflictProposal: null,
    conflicts: [conflict],
    appliedRemoteKeys: [],
    preservedLocalKeys: [],
    tombstone: false,
  };
}

function chosenConflictProposal(
  result: FileMergeResult,
  local: Buffer | null,
  remote: Buffer | null,
): Buffer | null {
  if (result.conflictProposal !== null) return Buffer.from(result.conflictProposal);
  if (local !== null) return Buffer.from(local);
  return remote === null ? null : Buffer.from(remote);
}

function operationFor(status: FileMergeResult["status"]): OperationPlanFile["operation"] {
  if (status === "adopt") return "no-op";
  if (status === "move") return "conflict";
  return status;
}

function conflictKind(reason: SemanticConflictReason): OperationPlan["conflicts"][number]["kind"] {
  if (reason === "add-add") return "add-add";
  if (reason === "delete-modify") return "delete-modify";
  if (reason === "modify-delete") return "modify-delete";
  if (reason === "binary-concurrent-change") return "binary";
  if (reason === "invalid-keep-region" || reason === "remote-region-removed") {
    return "keep-region";
  }
  if (
    reason === "parse-error" ||
    reason === "invalid-json" ||
    reason === "utf8-decode" ||
    reason === "duplicate-key"
  ) {
    return "parse";
  }
  return "modify-modify";
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

function packagePatch(name: string, range: string): ManifestPatch {
  return {
    id: dependencyPatchId(name),
    adapter: "package-dependency",
    semanticKey: `dependencies.${name}`,
    ownedValueDigest: sha256(range),
  };
}

function refreshDependencyProvenance(manifest: ProvenanceManifest): void {
  const dependencyOwners: Record<string, string[]> = {};
  const patchIds: string[] = [];
  for (const [owner, item] of Object.entries(manifest.items).sort(([left], [right]) =>
    left.localeCompare(right, "en-US"),
  )) {
    const retained = item.structuredPatches.filter(
      ({ adapter }) => adapter !== "package-dependency",
    );
    const patches = Object.entries(item.dependencies.runtime)
      .filter(([name]) => name !== "react" && name !== "react-dom")
      .sort(([left], [right]) => left.localeCompare(right, "en-US"))
      .map(([name, range]) => packagePatch(name, range));
    item.structuredPatches = [...retained, ...patches].sort((left, right) =>
      left.id.localeCompare(right.id, "en-US"),
    );
    for (const patch of patches) patchIds.push(patch.id);
    for (const name of Object.keys(item.dependencies.runtime)) {
      if (name === "react" || name === "react-dom") continue;
      (dependencyOwners[`runtime:${name}`] ??= []).push(owner);
    }
  }
  manifest.dependencyOwners = Object.fromEntries(
    Object.entries(dependencyOwners)
      .sort(([left], [right]) => left.localeCompare(right, "en-US"))
      .map(([name, owners]) => [name, [...portableSort(owners)]]),
  );
  manifest.sharedTargets =
    patchIds.length === 0 ? {} : { "package.json": [...portableSort([...new Set(patchIds)])] };
}

function dependencyPlan(
  root: string,
  before: ProvenanceManifest,
  after: ProvenanceManifest,
): PackageDependencyPlan {
  const requirements: Record<string, { range: string; owners: string[] }> = {};
  for (const [owner, item] of Object.entries(after.items)) {
    for (const [name, range] of Object.entries(item.dependencies.runtime)) {
      if (name === "react" || name === "react-dom") continue;
      const current = requirements[name];
      if (current !== undefined && current.range !== range) {
        throw new CliError(`Updated items require incompatible ranges for ${name}.`, {
          code: "DEPENDENCY_REQUIREMENT_CONFLICT",
          exitCode: 7,
          target: "package.json",
        });
      }
      (requirements[name] ??= { range, owners: [] }).owners.push(owner);
    }
  }
  const normalizedRequirements: Record<string, DependencyRequirement> = Object.fromEntries(
    Object.entries(requirements).map(([name, requirement]) => [
      name,
      { range: requirement.range, owners: portableSort(requirement.owners) },
    ]),
  );
  const removals: Record<string, readonly string[]> = {};
  const installedDependencies = readPackageDependencies(resolve(root, "package.json"));
  for (const [key, owners] of Object.entries(before.dependencyOwners)) {
    if (!key.startsWith("runtime:")) continue;
    const name = key.slice("runtime:".length);
    if (normalizedRequirements[name] !== undefined) continue;
    const installedRange = installedDependencies[name];
    const ownershipIsExact =
      installedRange !== undefined &&
      owners.length > 0 &&
      owners.every((owner) => {
        const item = before.items[owner];
        return (
          item?.dependencies.runtime[name] === installedRange &&
          item.structuredPatches.some(
            (patch) =>
              patch.adapter === "package-dependency" &&
              patch.semanticKey === `dependencies.${name}` &&
              patch.ownedValueDigest === sha256(installedRange),
          )
        );
      });
    if (installedRange !== undefined && !ownershipIsExact) {
      throw new CliError(
        `Dependency ${name} no longer has an upstream owner, but its local declaration differs from recorded ownership; Mergora will not remove it.`,
        {
          code: "DEPENDENCY_OWNERSHIP_DIVERGED",
          exitCode: 7,
          target: "package.json",
        },
      );
    }
    if (ownershipIsExact) removals[name] = owners;
  }
  return planPackageDependencies(resolve(root, "package.json"), normalizedRequirements, removals);
}

function updatedManifestItem(
  installed: ManifestItem,
  remote: ImmutableUpdateItem,
  entries: readonly UpdateEntry[],
): ManifestItem {
  const files = entries
    .filter(({ owner, remoteFile }) => owner === `official:${remote.itemId}` && remoteFile !== null)
    .map((entry) => ({
      logicalPath: entry.logicalPath,
      target: entry.target,
      role: entry.role,
      base: entry.remoteFile!.digest,
      installed: digestOrNull(entry.proposed),
      mediaType: entry.mediaType,
      executable: false as const,
      ...(entry.proposed === null ? { tombstone: true as const } : {}),
    }))
    .sort((left, right) => left.target.localeCompare(right.target, "en-US"));
  return {
    ...installed,
    kind: remote.kind,
    resolved: remote.resolved,
    payload: { url: remote.payloadUrl, digest: remote.payloadDigest },
    files,
    registryDependencies: [...remote.registryDependencies].sort((left, right) =>
      left.localeCompare(right, "en-US"),
    ),
    dependencies: {
      runtime: Object.fromEntries(
        Object.entries(remote.dependencies.runtime).sort(([left], [right]) =>
          left.localeCompare(right, "en-US"),
        ),
      ),
      development: Object.fromEntries(
        Object.entries(remote.dependencies.development).sort(([left], [right]) =>
          left.localeCompare(right, "en-US"),
        ),
      ),
    },
    contractVersion: remote.contractVersion,
    lastMigration: remote.lastMigration,
  };
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

function entryOperation(entry: UpdateEntry): OperationPlanFile {
  const proposed = digestOrNull(entry.proposed);
  const reason =
    entry.result.status === "conflict"
      ? entry.result.conflicts.map(({ detail }) => detail).join(" ")
      : entry.result.status === "keep-local"
        ? "Upstream did not change this semantic file; preserve exact local bytes."
        : entry.result.status === "local-delete"
          ? "Preserve the intentional local deletion and advance the upstream base as a tombstone."
          : entry.result.status === "semantic-merge"
            ? "Apply disjoint deterministic semantic edits while preserving local customization."
            : `Deterministic B/L/R classification: ${entry.result.status}.`;
  return {
    operation: operationFor(entry.result.status),
    target: entry.target,
    owner: entry.owner,
    base: digestOrNull(entry.base),
    local: digestOrNull(entry.local),
    remote: digestOrNull(entry.remote),
    proposed,
    mediaType: entry.mediaType,
    risk:
      entry.result.status === "conflict"
        ? "conflict"
        : entry.result.status === "delete"
          ? "destructive"
          : entry.result.status === "semantic-merge"
            ? "review-required"
            : "ordinary",
    reason,
  };
}

function metadataOperation(input: {
  readonly target: string;
  readonly owner: string;
  readonly before: Buffer | null;
  readonly after: Buffer | null;
  readonly mediaType: string;
  readonly reason: string;
}): OperationPlanFile {
  return {
    operation: input.after === null ? "delete" : input.before === null ? "add" : "structured-patch",
    target: input.target,
    owner: input.owner,
    base: digestOrNull(input.before),
    local: digestOrNull(input.before),
    remote: digestOrNull(input.after),
    proposed: digestOrNull(input.after),
    mediaType: input.mediaType,
    risk: input.after === null ? "destructive" : "ordinary",
    reason: input.reason,
  };
}

function assertPackageManagerScope(
  inspection: ProjectInspection,
  packageChanged: boolean,
  noInstall: boolean | undefined,
): void {
  if (
    packageChanged &&
    noInstall !== true &&
    inspection.packageManagerEvidence.some((entry) => entry.startsWith("workspace-lockfile:"))
  ) {
    throw new CliError(
      "The authoritative workspace lockfile is outside this project root; use --no-install and run the workspace-root install separately.",
      { code: "PACKAGE_MANAGER_WORKSPACE_TRANSACTION_UNSUPPORTED", exitCode: 7 },
    );
  }
}

function buildEntries(input: {
  readonly root: string;
  readonly config: MergoraConfig;
  readonly manifest: ProvenanceManifest;
  readonly selected: readonly string[];
  readonly remoteById: ReadonlyMap<string, ImmutableUpdateItem>;
}): readonly UpdateEntry[] {
  const entries: UpdateEntry[] = [];
  const targetOwners = new Map<string, string>();
  const selectedSet = new Set(input.selected);
  for (const [owner, item] of Object.entries(input.manifest.items)) {
    if (selectedSet.has(owner)) continue;
    for (const file of item.files) {
      targetOwners.set(file.target.normalize("NFC").toLocaleLowerCase("en-US"), owner);
    }
  }
  for (const owner of input.selected) {
    const installed = input.manifest.items[owner]!;
    const remote = input.remoteById.get(installed.itemId)!;
    if (remote.renderedWithTransformContextDigest !== installed.transformContextDigest) {
      throw new CliError(
        `Update payload for ${installed.itemId} was not rendered with the recorded transform context.`,
        {
          code: "TRANSFORM_CONTEXT_MISMATCH",
          exitCode: 7,
          target: MANIFEST_PATH,
        },
      );
    }
    const oldByLogical = new Map(installed.files.map((file) => [file.logicalPath, file]));
    const remoteByLogical = new Map(remote.files.map((file) => [file.logicalPath, file]));
    const logicalPaths = [...new Set([...oldByLogical.keys(), ...remoteByLogical.keys()])].sort(
      (left, right) => left.localeCompare(right, "en-US"),
    );
    for (const logicalPath of logicalPaths) {
      const existing = oldByLogical.get(logicalPath);
      const remoteFile = remoteByLogical.get(logicalPath);
      const target = existing?.target ?? remoteTarget(installed, remoteFile!, existing);
      assertPortableRelativePath(target, "Semantic Sync target");
      const mediaType = remoteFile?.mediaType ?? existing!.mediaType;
      if (existing !== undefined && remoteFile !== undefined && existing.mediaType !== mediaType) {
        throw new CliError(
          `Update changes the declared media type of ${target}; a versioned migration is required.`,
          { code: "UPDATE_MEDIA_TYPE_MIGRATION_REQUIRED", exitCode: 7, target },
        );
      }
      if (existing !== undefined && remoteFile !== undefined && existing.role !== remoteFile.role) {
        throw new CliError(
          `Update changes the target role of ${target}; a versioned move migration is required.`,
          { code: "UPDATE_TARGET_ROLE_MIGRATION_REQUIRED", exitCode: 7, target },
        );
      }
      const base =
        existing === undefined ? null : readProjectFile(input.root, basePath(existing.base));
      if (existing !== undefined && (base === null || sha256(base) !== existing.base)) {
        throw new CliError(`Immutable base for ${target} is missing or corrupt.`, {
          code: "BASE_DIGEST_MISMATCH",
          exitCode: 3,
          target: basePath(existing.base),
        });
      }
      const local = readProjectFile(input.root, target);
      const remoteBytesValue = remoteFile === undefined ? null : remoteBytes(remoteFile);
      const portableTarget = target.normalize("NFC").toLocaleLowerCase("en-US");
      const otherOwner = targetOwners.get(portableTarget);
      let result: FileMergeResult;
      if (otherOwner !== undefined && otherOwner !== owner) {
        result = conflictResult(
          "$ownership",
          "add-add",
          `Target is already owned by ${otherOwner}; the updater will not replace it.`,
        );
      } else {
        result = mergeFileThreeWay({
          mediaType,
          base,
          local,
          remote: remoteBytesValue,
          maxFileBytes: input.config.policy.maxRegistryItemBytes,
        });
      }
      targetOwners.set(portableTarget, owner);
      const proposed =
        result.status === "conflict"
          ? chosenConflictProposal(result, local, remoteBytesValue)
          : result.proposed === null
            ? null
            : Buffer.from(result.proposed);
      entries.push({
        key: portableTargetKey(target),
        target,
        owner,
        logicalPath,
        role: remoteFile?.role ?? existing!.role,
        mediaType,
        base,
        local,
        remote: remoteBytesValue,
        result,
        proposed,
        remoteFile: remoteFile ?? null,
      });
    }
  }
  const keys = new Set<string>();
  for (const entry of entries) {
    if (keys.has(entry.key)) {
      throw new CliError("Portable conflict target-key collision detected.", {
        code: "UPDATE_TARGET_KEY_COLLISION",
        exitCode: 5,
        target: entry.target,
      });
    }
    keys.add(entry.key);
  }
  return entries.sort((left, right) => left.target.localeCompare(right.target, "en-US"));
}

function buildUpdateInternal(options: SemanticUpdateOptions): InternalUpdatePlan {
  const project = configuredProject(options);
  validateRelease(options.release, project.config.policy.maxRegistryItemBytes);
  if (options.release.registry.id !== "official") {
    throw new CliError(
      "This updater currently supports the installed official namespace only; enrolled registries require their own manifest namespace.",
      { code: "UPDATE_REGISTRY_NAMESPACE_UNSUPPORTED", exitCode: 7 },
    );
  }
  const selected = selectedItemIds(project.manifest.value, options.itemIds);
  const remoteById = new Map(options.release.items.map((item) => [item.itemId, item]));
  const remoteItems = selected.map((owner) => {
    const installed = project.manifest.value.items[owner]!;
    const remote = remoteById.get(installed.itemId);
    if (remote === undefined) {
      throw new CliError(
        `Immutable release ${options.release.release} does not contain ${installed.itemId}.`,
        { code: "REGISTRY_ITEM_MISSING", exitCode: 4 },
      );
    }
    if (remote.kind !== installed.kind) {
      throw new CliError(
        `Update changes the kind of ${installed.itemId}; a migration is required.`,
        {
          code: "UPDATE_KIND_MIGRATION_REQUIRED",
          exitCode: 7,
          target: MANIFEST_PATH,
        },
      );
    }
    if (
      remote.resolved === installed.resolved &&
      remote.payloadDigest !== installed.payload.digest
    ) {
      throw new CliError(
        `Release ${remote.resolved} for ${installed.itemId} has different bytes than the installed immutable payload.`,
        {
          code: "REGISTRY_IMMUTABILITY_VIOLATION",
          exitCode: 5,
          target: MANIFEST_PATH,
        },
      );
    }
    if (
      canonicalJson(remote.dependencies.development) !==
      canonicalJson(installed.dependencies.development)
    ) {
      throw new CliError(
        `Update for ${installed.itemId} changes development dependencies, which requires the dedicated typed package adapter.`,
        {
          code: "UPDATE_DEVELOPMENT_DEPENDENCY_ADAPTER_REQUIRED",
          exitCode: 7,
          target: "package.json",
        },
      );
    }
    if (sha256(canonicalJson(installed.transformContext)) !== installed.transformContextDigest) {
      throw new CliError(`Recorded transform context for ${installed.itemId} is corrupt.`, {
        code: "TRANSFORM_CONTEXT_INVALID",
        exitCode: 3,
        target: MANIFEST_PATH,
      });
    }
    return remote;
  });
  const entries = buildEntries({
    root: project.root,
    config: project.config,
    manifest: project.manifest.value,
    selected,
    remoteById,
  });
  const nextManifest = structuredClone(project.manifest.value);
  for (const remote of remoteItems) {
    const owner = `official:${remote.itemId}`;
    nextManifest.items[owner] = updatedManifestItem(nextManifest.items[owner]!, remote, entries);
  }
  for (const [owner, item] of Object.entries(nextManifest.items)) {
    for (const dependency of item.registryDependencies) {
      if (nextManifest.items[dependency] === undefined) {
        throw new CliError(`${owner} requires missing registry dependency ${dependency}.`, {
          code: "REGISTRY_DEPENDENCY_MISSING",
          exitCode: 7,
          target: MANIFEST_PATH,
        });
      }
    }
  }
  refreshDependencyProvenance(nextManifest);
  const packagePlan = dependencyPlan(project.root, project.manifest.value, nextManifest);
  const packageChanged = packagePlan.after !== packagePlan.before;
  assertPackageManagerScope(project.inspection, packageChanged, options.noInstall);
  const nextManifestBytes = manifestBytes(nextManifest);
  const mutations: TransactionMutation[] = [];
  const observedTargets: Record<string, Digest | null> = {};
  for (const entry of entries) {
    observedTargets[entry.target] = digestOrNull(entry.local);
    if (
      entry.result.status !== "conflict" &&
      digestOrNull(entry.local) !== digestOrNull(entry.proposed)
    ) {
      mutations.push({
        target: entry.target,
        content: entry.proposed,
        beforeDigest: digestOrNull(entry.local),
      });
    }
    if (entry.remote !== null) {
      const remoteDigest = sha256(entry.remote);
      const target = basePath(remoteDigest);
      const existing = readProjectFile(project.root, target);
      if (existing !== null && sha256(existing) !== remoteDigest) {
        throw new CliError(`Immutable base ${target} is corrupt.`, {
          code: "BASE_DIGEST_MISMATCH",
          exitCode: 3,
          target,
        });
      }
      observedTargets[target] = digestOrNull(existing);
      if (existing === null && !mutations.some((candidate) => candidate.target === target)) {
        mutations.push(mutation(project.root, target, entry.remote));
      }
    }
  }
  if (packageChanged) {
    mutations.push(mutation(project.root, "package.json", Buffer.from(packagePlan.after)));
  }
  if (!nextManifestBytes.equals(project.manifest.bytes)) {
    mutations.push(mutation(project.root, MANIFEST_PATH, nextManifestBytes, true));
  }
  const owner = selected[0]!;
  const fileOperations = entries.map(entryOperation);
  for (const change of mutations) {
    if (fileOperations.some(({ target }) => target === change.target)) continue;
    const before = readProjectFile(project.root, change.target);
    fileOperations.push(
      metadataOperation({
        target: change.target,
        owner,
        before,
        after: change.content === null ? null : Buffer.from(change.content),
        mediaType: change.target.endsWith(".json")
          ? "application/json"
          : "application/octet-stream",
        reason:
          change.target === MANIFEST_PATH
            ? "Advance verified payload, version, Contract, dependency, base, installed, and tombstone provenance; commit manifest last."
            : change.target === "package.json"
              ? "Apply ownership-aware dependency metadata required by the immutable update payload."
              : "Store exact verified post-transform upstream bytes as an immutable future base.",
      }),
    );
  }
  const conflicts = entries.flatMap((entry) =>
    entry.result.conflicts.map((conflict) => ({
      target: entry.target,
      kind: conflictKind(conflict.reason),
      reason: `${conflict.id}: ${conflict.detail}`,
    })),
  );
  const dependencyChanges: OperationPlanDependencyChange[] = packagePlan.changes.map((change) => ({
    scope: change.scope,
    package: change.package,
    operation: change.operation,
    from: change.from,
    to: change.to,
    owners: change.owners,
  }));
  const warnings = [
    ...(options.release.registry.trust === "local-development"
      ? [
          "The target is explicit verified local-development fixture data, not a claimed published Stable release.",
        ]
      : []),
    ...(packageChanged && options.noInstall === true
      ? [
          `Dependency metadata changes are planned, but --no-install skips ${project.inspection.packageManager} and lockfile mutation.`,
        ]
      : []),
    "Upstream logical-path moves are not inferred in this version; a changed logical path is conservatively represented as delete plus add.",
  ];
  const plan = finalizeOperationPlan({
    schemaVersion: 1,
    command: "update",
    cliVersion: CLI_VERSION,
    projectRoot: ".",
    configDigest: digest(project.config),
    manifestPreconditionDigest: digest(project.manifest.value),
    registries: [
      {
        id: options.release.registry.id,
        identityDigest: options.release.registry.identityDigest,
        release: options.release.release,
        manifestDigest: options.release.manifestDigest,
        source: options.release.registry.source,
        trust: options.release.registry.trust,
        evidenceTier: options.release.registry.evidenceTier,
      },
    ],
    items: remoteItems.map((remote) => ({
      id: `official:${remote.itemId}`,
      direct: project.manifest.value.items[`official:${remote.itemId}`]!.direct,
      requested: project.manifest.value.items[`official:${remote.itemId}`]!.requested,
      fromVersion: project.manifest.value.items[`official:${remote.itemId}`]!.resolved,
      toVersion: remote.resolved,
      mode: "source" as const,
    })),
    fileOperations: fileOperations.sort((left, right) =>
      left.target.localeCompare(right.target, "en-US"),
    ),
    dependencyChanges,
    structuredPatches: dependencyChanges.map((change) => ({
      id: dependencyPatchId(change.package),
      adapter: "package-dependency" as const,
      semanticKey: `dependencies.${change.package}`,
      target: "package.json",
      owner: change.owners[0] ?? owner,
      operation: change.operation,
    })),
    migrations: remoteItems.flatMap((remote) =>
      remote.lastMigration === null
        ? []
        : [
            {
              id: remote.lastMigration,
              adapter: "manual-checklist" as const,
              phase: "remote" as const,
            },
          ],
    ),
    contractChanges: remoteItems
      .filter(
        (remote) =>
          project.manifest.value.items[`official:${remote.itemId}`]!.contractVersion !==
          remote.contractVersion,
      )
      .map((remote) => ({
        item: `official:${remote.itemId}`,
        from: project.manifest.value.items[`official:${remote.itemId}`]!.contractVersion,
        to: remote.contractVersion,
      })),
    warnings,
    consentRequirements: [
      {
        id: "semantic-update",
        flag: "--yes",
        reason: "Commit a reviewed deterministic B/L/R update and advance provenance.",
      },
    ],
    conflicts,
    estimatedBytes: {
      download: remoteItems.reduce(
        (total, item) =>
          total +
          item.files.reduce((itemTotal, file) => itemTotal + remoteBytes(file).byteLength, 0),
        0,
      ),
      write: mutations.reduce(
        (total, candidate) => total + (candidate.content?.byteLength ?? 0),
        0,
      ),
    },
    validationSuite: [
      "schema",
      "digest",
      "path",
      "collision",
      "parse",
      "type-imports",
      "ownership",
      "dependency",
      "tokens",
      "accessibility-contract",
      "project-configured",
    ],
    rollbackAvailable: true,
  });
  return {
    root: project.root,
    config: project.config,
    inspection: project.inspection,
    manifest: project.manifest.value,
    manifestBeforeBytes: project.manifest.bytes,
    nextManifest,
    nextManifestBytes,
    selectedItems: selected,
    remoteItems,
    entries,
    packagePlan,
    plan,
    mutations,
    observedTargets,
    registryPayloads: remoteItems
      .map((item) => ({
        registry: options.release.registry.id,
        release: options.release.release,
        url: item.payloadUrl,
        digest: item.payloadDigest,
      }))
      .sort((left, right) => left.url.localeCompare(right.url, "en-US")),
  };
}

export function planSemanticUpdate(options: SemanticUpdateOptions): OperationPlan {
  return buildUpdateInternal(options).plan;
}

type ConflictResolution = "unresolved" | "take-local" | "take-upstream" | "manual";

interface ConflictStateEntry {
  readonly key: string;
  readonly target: string;
  readonly owner: string;
  readonly logicalPath: string;
  readonly role: ManifestFile["role"];
  readonly mediaType: string;
  readonly originalStatus: FileMergeResult["status"];
  readonly baseDigest: Digest | null;
  readonly localDigest: Digest | null;
  readonly remoteDigest: Digest | null;
  readonly originalProposedDigest: Digest | null;
  readonly basePresent: boolean;
  readonly localPresent: boolean;
  readonly remotePresent: boolean;
  readonly originalProposedPresent: boolean;
  readonly conflictMetadataDigest: Digest | null;
  readonly conflicts: readonly SemanticConflict[];
  readonly appliedRemoteKeys: readonly string[];
  readonly preservedLocalKeys: readonly string[];
  readonly resolution: ConflictResolution;
  readonly currentProposedDigest: Digest | null;
  readonly currentProposedPresent: boolean;
}

interface ConflictState {
  readonly schemaVersion: 1;
  readonly artifactKind: "mergora-semantic-update-conflict";
  readonly transactionId: string;
  readonly state: "conflicted" | "resolved";
  readonly originalPlanDigest: Digest;
  readonly configPreconditionDigest: Digest;
  readonly manifestPreconditionDigest: Digest;
  readonly nextManifestDigest: Digest;
  readonly package: {
    readonly localDigest: Digest;
    readonly proposedDigest: Digest;
    readonly changed: boolean;
    readonly packageManager: PackageManager;
    readonly noInstall: boolean;
  };
  readonly registryPayloads: readonly TransactionRegistryPayload[];
  readonly selectedItems: readonly string[];
  readonly entries: readonly ConflictStateEntry[];
  readonly committedTransactionId?: string | null | undefined;
}

function transactionRoot(id: string): string {
  return `.mergora/transactions/${id}`;
}

function snapshotPath(id: string, key: string, view: "base" | "local" | "remote" | "proposed") {
  return `${transactionRoot(id)}/snapshots/${key}/${view}`;
}

function conflictPath(
  id: string,
  key: string,
  view: "base" | "local" | "remote" | "proposed" | "conflict.json",
) {
  return `${transactionRoot(id)}/conflicts/${key}/${view}`;
}

function createConflictTransactionId(): string {
  const iso = new Date().toISOString();
  const sortable = `${iso.slice(0, 4)}${iso.slice(5, 7)}${iso.slice(8, 10)}T${iso.slice(11, 13)}${iso.slice(14, 16)}${iso.slice(17, 23)}Z`;
  return `${sortable}-${randomBytes(16).toString("hex")}`;
}

function ensureSafeDirectory(root: string, relativePath: string): void {
  const segments = assertPortableRelativePath(relativePath, "Conflict directory");
  let current = root;
  for (const segment of segments) {
    current = resolve(current, segment);
    try {
      const metadata = lstatSync(current);
      if (metadata.isSymbolicLink() || !metadata.isDirectory()) {
        throw new CliError(`Conflict path ${relativePath} is unsafe.`, {
          code: "CONFLICT_PATH_UNSAFE",
          exitCode: 5,
          target: relativePath,
        });
      }
    } catch (error) {
      if (error instanceof CliError) throw error;
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
      mkdirSync(current, { mode: 0o700 });
    }
  }
}

function writeExclusive(root: string, relativePath: string, bytes: Uint8Array): void {
  assertPortableRelativePath(relativePath, "Conflict artifact");
  ensureSafeDirectory(root, dirname(relativePath).replaceAll("\\", "/"));
  assertNoSymlinkAncestors(root, relativePath);
  const path = resolveInside(root, relativePath, "Conflict artifact");
  let descriptor: number | null = null;
  try {
    descriptor = openSync(path, constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL, 0o600);
    writeFileSync(descriptor, bytes);
    fsyncSync(descriptor);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "EEXIST") {
      throw new CliError(`Conflict artifact ${relativePath} already exists.`, {
        code: "CONFLICT_TRANSACTION_EXISTS",
        exitCode: 8,
        target: relativePath,
      });
    }
    throw error;
  } finally {
    if (descriptor !== null) closeSync(descriptor);
  }
}

function writeAtomic(root: string, relativePath: string, bytes: Uint8Array): void {
  assertPortableRelativePath(relativePath, "Conflict artifact");
  assertNoSymlinkAncestors(root, relativePath);
  const path = resolveInside(root, relativePath, "Conflict artifact");
  const metadata = lstatSync(path);
  if (metadata.isSymbolicLink() || !metadata.isFile()) {
    throw new CliError(`Conflict artifact ${relativePath} is unsafe.`, {
      code: "CONFLICT_PATH_UNSAFE",
      exitCode: 5,
      target: relativePath,
    });
  }
  const temporaryRelative = `${relativePath}.mergora-${randomBytes(16).toString("hex")}.tmp`;
  writeExclusive(root, temporaryRelative, bytes);
  renameSync(resolveInside(root, temporaryRelative, "Conflict temporary artifact"), path);
}

function fileBytesForBundle(value: Buffer | null): Buffer {
  return value ?? Buffer.alloc(0);
}

function assertInternalPreconditions(internal: InternalUpdatePlan): void {
  const config = readMergoraConfig(internal.root);
  if (config === null || digest(config) !== internal.plan.configDigest) {
    throw new CliError("mergora.json changed after update planning.", {
      code: "PLAN_CONFIG_STALE",
      exitCode: 8,
      target: "mergora.json",
    });
  }
  const manifest = readManifest(internal.root);
  if (digest(manifest.value) !== internal.plan.manifestPreconditionDigest) {
    throw new CliError("The provenance manifest changed after update planning.", {
      code: "PLAN_MANIFEST_STALE",
      exitCode: 8,
      target: MANIFEST_PATH,
    });
  }
  for (const [target, expected] of Object.entries(internal.observedTargets)) {
    if (digestOrNull(readProjectFile(internal.root, target)) !== expected) {
      throw new CliError(`Update target ${target} changed after planning.`, {
        code: "PLAN_TARGET_STALE",
        exitCode: 8,
        target,
      });
    }
  }
  const packageDigest = sha256(readFileSync(resolve(internal.root, "package.json")));
  if (packageDigest !== sha256(internal.packagePlan.before)) {
    throw new CliError("package.json changed after update planning.", {
      code: "PLAN_TARGET_STALE",
      exitCode: 8,
      target: "package.json",
    });
  }
}

function conflictReadme(id: string, entries: readonly UpdateEntry[]): Buffer {
  const targets = entries
    .filter(({ result }) => result.status === "conflict")
    .map(({ target }) => `- \`${target}\``)
    .join("\n");
  return Buffer.from(
    [
      "# Mergora Semantic Sync conflict",
      "",
      "The live project, provenance manifest, package metadata, and base store are unchanged.",
      "These files may contain private project source. They are local-only and must not be uploaded without review.",
      "",
      "Conflicted targets:",
      "",
      targets,
      "",
      "Inspect unresolved units:",
      "",
      `    mergora resolve ${id} --list`,
      "",
      "Choose a path-specific resolution with `--take-local`, `--take-upstream`, or edit that target's `proposed` file and use `--resolved`. Then run `--apply`.",
      "There is intentionally no force-overwrite or operation-wide take-upstream choice.",
      "",
    ].join("\n"),
  );
}

async function stageConflict(
  internal: InternalUpdatePlan,
  requestedId: string | undefined,
  noInstall: boolean,
): Promise<SemanticUpdateConflictResult> {
  assertInternalPreconditions(internal);
  const id = requestedId ?? createConflictTransactionId();
  if (!TRANSACTION_ID.test(id)) {
    throw new CliError("Injected conflict transaction ID is invalid.", {
      code: "CONFLICT_TRANSACTION_ID_INVALID",
      exitCode: 2,
    });
  }
  const rootPath = transactionRoot(id);
  ensureSafeDirectory(internal.root, ".mergora/transactions");
  const resolvedRoot = resolveInside(internal.root, rootPath, "Conflict transaction root");
  if (existsSync(resolvedRoot)) {
    throw new CliError(`Conflict transaction ${id} already exists.`, {
      code: "CONFLICT_TRANSACTION_EXISTS",
      exitCode: 8,
      target: rootPath,
    });
  }
  mkdirSync(resolvedRoot, { mode: 0o700 });
  writeExclusive(internal.root, `${rootPath}/plan.json`, Buffer.from(canonicalJson(internal.plan)));
  writeExclusive(internal.root, `${rootPath}/next-manifest.json`, internal.nextManifestBytes);
  writeExclusive(
    internal.root,
    `${rootPath}/package-local`,
    Buffer.from(internal.packagePlan.before),
  );
  writeExclusive(
    internal.root,
    `${rootPath}/package-proposed`,
    Buffer.from(internal.packagePlan.after),
  );
  writeExclusive(internal.root, `${rootPath}/README.md`, conflictReadme(id, internal.entries));
  const stateEntries: ConflictStateEntry[] = [];
  for (const entry of internal.entries) {
    for (const [view, bytes] of [
      ["base", entry.base],
      ["local", entry.local],
      ["remote", entry.remote],
      ["proposed", entry.proposed],
    ] as const) {
      writeExclusive(internal.root, snapshotPath(id, entry.key, view), fileBytesForBundle(bytes));
    }
    let conflictMetadataDigest: Digest | null = null;
    if (entry.result.status === "conflict") {
      const bundle = await createConflictBundle({
        target: entry.target,
        owner: entry.owner,
        mediaType: entry.mediaType,
        base: entry.base,
        local: entry.local,
        remote: entry.remote,
        proposed: entry.proposed,
        conflicts: entry.result.conflicts,
      });
      for (const [view, bytes] of [
        ["base", bundle.files.base],
        ["local", bundle.files.local],
        ["remote", bundle.files.remote],
        ["proposed", bundle.files.proposed],
      ] as const) {
        writeExclusive(
          internal.root,
          conflictPath(id, entry.key, view),
          fileBytesForBundle(bytes === null ? null : Buffer.from(bytes)),
        );
      }
      const metadata = {
        schemaVersion: 1,
        ...bundle.metadata,
        presence: {
          base: entry.base !== null,
          local: entry.local !== null,
          remote: entry.remote !== null,
          proposed: entry.proposed !== null,
        },
        summaries: {
          local: entry.result.preservedLocalKeys,
          upstream: entry.result.appliedRemoteKeys,
        },
      };
      const metadataBytes = Buffer.from(`${JSON.stringify(metadata, null, 2)}\n`);
      conflictMetadataDigest = sha256(metadataBytes);
      writeExclusive(internal.root, conflictPath(id, entry.key, "conflict.json"), metadataBytes);
    }
    stateEntries.push({
      key: entry.key,
      target: entry.target,
      owner: entry.owner,
      logicalPath: entry.logicalPath,
      role: entry.role,
      mediaType: entry.mediaType,
      originalStatus: entry.result.status,
      baseDigest: digestOrNull(entry.base),
      localDigest: digestOrNull(entry.local),
      remoteDigest: digestOrNull(entry.remote),
      originalProposedDigest: digestOrNull(entry.proposed),
      basePresent: entry.base !== null,
      localPresent: entry.local !== null,
      remotePresent: entry.remote !== null,
      originalProposedPresent: entry.proposed !== null,
      conflictMetadataDigest,
      conflicts: entry.result.conflicts,
      appliedRemoteKeys: entry.result.appliedRemoteKeys,
      preservedLocalKeys: entry.result.preservedLocalKeys,
      resolution: entry.result.status === "conflict" ? "unresolved" : "manual",
      currentProposedDigest: digestOrNull(entry.proposed),
      currentProposedPresent: entry.proposed !== null,
    });
  }
  const state: ConflictState = {
    schemaVersion: 1,
    artifactKind: "mergora-semantic-update-conflict",
    transactionId: id,
    state: "conflicted",
    originalPlanDigest: internal.plan.planDigest,
    configPreconditionDigest: internal.plan.configDigest,
    manifestPreconditionDigest: internal.plan.manifestPreconditionDigest!,
    nextManifestDigest: sha256(internal.nextManifestBytes),
    package: {
      localDigest: sha256(internal.packagePlan.before),
      proposedDigest: sha256(internal.packagePlan.after),
      changed: internal.packagePlan.before !== internal.packagePlan.after,
      packageManager: internal.inspection.packageManager,
      noInstall,
    },
    registryPayloads: internal.registryPayloads,
    selectedItems: internal.selectedItems,
    entries: stateEntries,
    committedTransactionId: null,
  };
  const stateBytes = Buffer.from(`${JSON.stringify(state, null, 2)}\n`);
  writeExclusive(internal.root, `${rootPath}/${CONFLICT_STATE_PATH}`, stateBytes);
  writeExclusive(
    internal.root,
    `${rootPath}/${CONFLICT_STATE_DIGEST_PATH}`,
    Buffer.from(`${sha256(stateBytes)}\n`),
  );
  assertInternalPreconditions(internal);
  return {
    mode: "semantic-update",
    status: "conflicted",
    items: internal.selectedItems,
    release: internal.plan.registries[0]!.release,
    planDigest: internal.plan.planDigest,
    conflictTransactionId: id,
    conflictRoot: rootPath,
    conflicts: internal.plan.conflicts,
    liveProjectChanged: false,
  };
}

export async function applySemanticUpdate(
  options: SemanticUpdateOptions,
  expectedPlanDigest?: string,
): Promise<SemanticUpdateResult> {
  const internal = buildUpdateInternal(options);
  if (expectedPlanDigest !== undefined && internal.plan.planDigest !== expectedPlanDigest) {
    throw new CliError("Semantic Sync plan changed before apply; review a fresh plan.", {
      code: "PLAN_PRECONDITION_STALE",
      exitCode: 8,
    });
  }
  if (internal.plan.conflicts.length > 0) {
    return stageConflict(internal, options.conflictTransactionId, options.noInstall === true);
  }
  const packageRequired = internal.packagePlan.before !== internal.packagePlan.after;
  const transaction = executeTransaction({
    root: internal.root,
    plan: internal.plan,
    mutations: internal.mutations,
    observedTargets: internal.observedTargets,
    registryPayloads: internal.registryPayloads,
    packageManager: internal.inspection.packageManager,
    packageManagerRequired: packageRequired,
    noInstall: options.noInstall,
    offline: options.offline,
    packageManagerRunner: options.packageManagerRunner,
    faultInjector: options.faultInjector,
    commandArguments: options.commandArguments,
  });
  return {
    mode: "semantic-update",
    status: "committed",
    items: internal.selectedItems,
    release: options.release.release,
    planDigest: internal.plan.planDigest,
    transaction,
  };
}

export type SemanticResolveChoice = "take-local" | "take-upstream" | "resolved" | "reset";

export interface SemanticResolveChoiceOptions {
  readonly projectRoot: string;
  readonly transactionId: string;
  readonly choice: SemanticResolveChoice;
  readonly targets: readonly string[];
}

export interface SemanticResolveChoicePlan {
  readonly schemaVersion: 1;
  readonly command: "resolve";
  readonly scope: "local-conflict-bundle";
  readonly transactionId: string;
  readonly choice: SemanticResolveChoice;
  readonly statePreconditionDigest: Digest;
  readonly manifestPreconditionDigest: Digest;
  readonly changes: readonly {
    readonly target: string;
    readonly from: Digest | null;
    readonly to: Digest | null;
    readonly present: boolean;
    readonly resolution: ConflictResolution;
  }[];
  readonly limitations: readonly string[];
  readonly planDigest: Digest;
}

export interface SemanticResolutionList {
  readonly transactionId: string;
  readonly state: "conflicted" | "resolved";
  readonly unresolved: readonly {
    readonly target: string;
    readonly semanticUnitIds: readonly string[];
    readonly reasons: readonly string[];
    readonly safeChoices: readonly ["take-local", "take-upstream", "manual"];
  }[];
  readonly resolved: readonly {
    readonly target: string;
    readonly resolution: Exclude<ConflictResolution, "unresolved">;
    readonly proposedDigest: Digest | null;
  }[];
  readonly limitations: readonly string[];
}

interface LoadedConflict {
  readonly root: string;
  readonly state: ConflictState;
  readonly stateBytes: Buffer;
  readonly stateDigest: Digest;
  readonly plan: OperationPlan;
  readonly nextManifest: ProvenanceManifest;
  readonly nextManifestBytes: Buffer;
  readonly packageLocal: Buffer;
  readonly packageProposed: Buffer;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && !Array.isArray(value) && typeof value === "object";
}

function requiredConflictFile(root: string, relativePath: string): Buffer {
  const bytes = readProjectFile(root, relativePath);
  if (bytes === null) {
    throw new CliError(`Conflict artifact ${relativePath} is missing.`, {
      code: "CONFLICT_ARTIFACT_MISSING",
      exitCode: 8,
      target: relativePath,
    });
  }
  return bytes;
}

function assertPresenceDigest(
  present: unknown,
  digestValue: unknown,
  label: string,
): asserts digestValue is Digest | null {
  if (
    typeof present !== "boolean" ||
    !(
      (present && typeof digestValue === "string" && DIGEST.test(digestValue)) ||
      (!present && digestValue === null)
    )
  ) {
    throw new CliError(`${label} presence/digest metadata is invalid.`, {
      code: "CONFLICT_STATE_INVALID",
      exitCode: 8,
    });
  }
}

function validateConflictState(value: unknown, id: string): ConflictState {
  if (!isRecord(value)) {
    throw new CliError(`Conflict transaction ${id} state is invalid.`, {
      code: "CONFLICT_STATE_INVALID",
      exitCode: 8,
    });
  }
  const packageState = value.package;
  if (
    value.schemaVersion !== 1 ||
    value.artifactKind !== "mergora-semantic-update-conflict" ||
    value.transactionId !== id ||
    !["conflicted", "resolved"].includes(String(value.state)) ||
    typeof value.originalPlanDigest !== "string" ||
    !DIGEST.test(value.originalPlanDigest) ||
    typeof value.configPreconditionDigest !== "string" ||
    !DIGEST.test(value.configPreconditionDigest) ||
    typeof value.manifestPreconditionDigest !== "string" ||
    !DIGEST.test(value.manifestPreconditionDigest) ||
    typeof value.nextManifestDigest !== "string" ||
    !DIGEST.test(value.nextManifestDigest) ||
    !isRecord(packageState) ||
    typeof packageState.localDigest !== "string" ||
    !DIGEST.test(packageState.localDigest) ||
    typeof packageState.proposedDigest !== "string" ||
    !DIGEST.test(packageState.proposedDigest) ||
    typeof packageState.changed !== "boolean" ||
    !["npm", "pnpm", "yarn", "bun"].includes(String(packageState.packageManager)) ||
    typeof packageState.noInstall !== "boolean" ||
    !Array.isArray(value.registryPayloads) ||
    !Array.isArray(value.selectedItems) ||
    value.selectedItems.some((entry) => typeof entry !== "string") ||
    !Array.isArray(value.entries) ||
    value.entries.length === 0 ||
    value.entries.length > 8192
  ) {
    throw new CliError(`Conflict transaction ${id} state is invalid.`, {
      code: "CONFLICT_STATE_INVALID",
      exitCode: 8,
    });
  }
  const targets = new Set<string>();
  const keys = new Set<string>();
  for (const rawEntry of value.entries) {
    if (!isRecord(rawEntry)) {
      throw new CliError(`Conflict transaction ${id} has an invalid entry.`, {
        code: "CONFLICT_STATE_INVALID",
        exitCode: 8,
      });
    }
    const target = rawEntry.target;
    const key = rawEntry.key;
    if (
      typeof target !== "string" ||
      typeof key !== "string" ||
      key !== portableTargetKey(target) ||
      typeof rawEntry.owner !== "string" ||
      typeof rawEntry.logicalPath !== "string" ||
      typeof rawEntry.mediaType !== "string" ||
      typeof rawEntry.originalStatus !== "string" ||
      !Array.isArray(rawEntry.conflicts) ||
      !Array.isArray(rawEntry.appliedRemoteKeys) ||
      !Array.isArray(rawEntry.preservedLocalKeys) ||
      !["unresolved", "take-local", "take-upstream", "manual"].includes(
        String(rawEntry.resolution),
      ) ||
      targets.has(target.normalize("NFC").toLocaleLowerCase("en-US")) ||
      keys.has(key)
    ) {
      throw new CliError(`Conflict transaction ${id} has an invalid entry.`, {
        code: "CONFLICT_STATE_INVALID",
        exitCode: 8,
      });
    }
    assertPortableRelativePath(target, "Conflict target");
    assertPortableRelativePath(rawEntry.logicalPath, "Conflict logical path");
    assertPresenceDigest(rawEntry.basePresent, rawEntry.baseDigest, "Base snapshot");
    assertPresenceDigest(rawEntry.localPresent, rawEntry.localDigest, "Local snapshot");
    assertPresenceDigest(rawEntry.remotePresent, rawEntry.remoteDigest, "Remote snapshot");
    assertPresenceDigest(
      rawEntry.originalProposedPresent,
      rawEntry.originalProposedDigest,
      "Original proposal",
    );
    assertPresenceDigest(
      rawEntry.currentProposedPresent,
      rawEntry.currentProposedDigest,
      "Current proposal",
    );
    if (
      rawEntry.originalStatus === "conflict" &&
      (typeof rawEntry.conflictMetadataDigest !== "string" ||
        !DIGEST.test(rawEntry.conflictMetadataDigest))
    ) {
      throw new CliError(`Conflict transaction ${id} lacks conflict metadata.`, {
        code: "CONFLICT_STATE_INVALID",
        exitCode: 8,
      });
    }
    targets.add(target.normalize("NFC").toLocaleLowerCase("en-US"));
    keys.add(key);
  }
  return value as unknown as ConflictState;
}

function assertPlanIntegrity(plan: OperationPlan, expected: Digest): void {
  const { planDigest, ...semantic } = plan;
  if (planDigest !== expected || digest(semantic) !== planDigest) {
    throw new CliError("Conflict transaction plan digest is invalid.", {
      code: "CONFLICT_PLAN_INVALID",
      exitCode: 8,
    });
  }
}

function verifiedSnapshot(
  loaded: Pick<LoadedConflict, "root" | "state">,
  entry: ConflictStateEntry,
  view: "base" | "local" | "remote" | "proposed",
): Buffer | null {
  const presentKey = `${view === "proposed" ? "originalProposed" : view}Present` as const;
  const digestKey = `${view === "proposed" ? "originalProposed" : view}Digest` as const;
  const bytes = requiredConflictFile(
    loaded.root,
    snapshotPath(loaded.state.transactionId, entry.key, view),
  );
  if (!entry[presentKey]) {
    if (bytes.byteLength !== 0 || entry[digestKey] !== null) {
      throw new CliError(`Missing ${view} snapshot representation is corrupt.`, {
        code: "CONFLICT_ARTIFACT_DIGEST_MISMATCH",
        exitCode: 8,
        target: snapshotPath(loaded.state.transactionId, entry.key, view),
      });
    }
    return null;
  }
  if (sha256(bytes) !== entry[digestKey]) {
    throw new CliError(`${view} snapshot failed digest verification.`, {
      code: "CONFLICT_ARTIFACT_DIGEST_MISMATCH",
      exitCode: 8,
      target: snapshotPath(loaded.state.transactionId, entry.key, view),
    });
  }
  return bytes;
}

function currentConflictProposal(
  loaded: Pick<LoadedConflict, "root" | "state">,
  entry: ConflictStateEntry,
  allowUnrecordedManualEdit: boolean,
): Buffer | null {
  const path = conflictPath(loaded.state.transactionId, entry.key, "proposed");
  const bytes = requiredConflictFile(loaded.root, path);
  if (allowUnrecordedManualEdit) return bytes;
  if (!entry.currentProposedPresent) {
    if (bytes.byteLength !== 0 || entry.currentProposedDigest !== null) {
      throw new CliError(`Conflict proposal for ${entry.target} changed without --resolved.`, {
        code: "CONFLICT_PROPOSAL_STALE",
        exitCode: 8,
        target: path,
      });
    }
    return null;
  }
  if (sha256(bytes) !== entry.currentProposedDigest) {
    throw new CliError(`Conflict proposal for ${entry.target} changed without --resolved.`, {
      code: "CONFLICT_PROPOSAL_STALE",
      exitCode: 8,
      target: path,
    });
  }
  return bytes;
}

function readConflict(projectRoot: string, id: string): LoadedConflict {
  const root = validatedProjectRoot(projectRoot);
  if (!TRANSACTION_ID.test(id)) {
    throw new CliError("Conflict transaction ID is invalid.", {
      code: "CONFLICT_TRANSACTION_ID_INVALID",
      exitCode: 2,
    });
  }
  const statePath = `${transactionRoot(id)}/${CONFLICT_STATE_PATH}`;
  const stateBytes = requiredConflictFile(root, statePath);
  const expectedStateDigest = requiredConflictFile(
    root,
    `${transactionRoot(id)}/${CONFLICT_STATE_DIGEST_PATH}`,
  )
    .toString("utf8")
    .trim();
  if (!DIGEST.test(expectedStateDigest) || sha256(stateBytes) !== expectedStateDigest) {
    throw new CliError(`Conflict transaction ${id} state failed digest verification.`, {
      code: "CONFLICT_STATE_DIGEST_MISMATCH",
      exitCode: 8,
      target: statePath,
    });
  }
  let stateValue: unknown;
  try {
    stateValue = JSON.parse(stateBytes.toString("utf8")) as unknown;
  } catch {
    stateValue = null;
  }
  const state = validateConflictState(stateValue, id);
  const planBytes = requiredConflictFile(root, `${transactionRoot(id)}/plan.json`);
  let plan: OperationPlan;
  try {
    plan = JSON.parse(planBytes.toString("utf8")) as OperationPlan;
  } catch {
    throw new CliError(`Conflict transaction ${id} plan is invalid JSON.`, {
      code: "CONFLICT_PLAN_INVALID",
      exitCode: 8,
    });
  }
  assertPlanIntegrity(plan, state.originalPlanDigest);
  const nextManifestBytes = requiredConflictFile(root, `${transactionRoot(id)}/next-manifest.json`);
  if (sha256(nextManifestBytes) !== state.nextManifestDigest) {
    throw new CliError("Conflict next-manifest snapshot failed digest verification.", {
      code: "CONFLICT_ARTIFACT_DIGEST_MISMATCH",
      exitCode: 8,
    });
  }
  let nextManifest: ProvenanceManifest;
  try {
    nextManifest = JSON.parse(nextManifestBytes.toString("utf8")) as ProvenanceManifest;
    canonicalJson(nextManifest);
  } catch {
    throw new CliError("Conflict next-manifest snapshot is invalid.", {
      code: "CONFLICT_STATE_INVALID",
      exitCode: 8,
    });
  }
  const packageLocal = requiredConflictFile(root, `${transactionRoot(id)}/package-local`);
  const packageProposed = requiredConflictFile(root, `${transactionRoot(id)}/package-proposed`);
  if (
    sha256(packageLocal) !== state.package.localDigest ||
    sha256(packageProposed) !== state.package.proposedDigest
  ) {
    throw new CliError("Conflict package snapshot failed digest verification.", {
      code: "CONFLICT_ARTIFACT_DIGEST_MISMATCH",
      exitCode: 8,
    });
  }
  const loaded = {
    root,
    state,
    stateBytes,
    stateDigest: expectedStateDigest as Digest,
    plan,
    nextManifest,
    nextManifestBytes,
    packageLocal,
    packageProposed,
  };
  for (const entry of state.entries) {
    for (const view of ["base", "local", "remote", "proposed"] as const) {
      verifiedSnapshot(loaded, entry, view);
    }
    if (entry.originalStatus === "conflict") {
      const metadataPath = conflictPath(id, entry.key, "conflict.json");
      if (sha256(requiredConflictFile(root, metadataPath)) !== entry.conflictMetadataDigest) {
        throw new CliError(`Conflict metadata for ${entry.target} failed digest verification.`, {
          code: "CONFLICT_ARTIFACT_DIGEST_MISMATCH",
          exitCode: 8,
          target: metadataPath,
        });
      }
    }
  }
  return loaded;
}

function assertConflictLivePreconditions(loaded: LoadedConflict): void {
  if (loaded.state.state !== "conflicted") {
    throw new CliError(`Conflict transaction ${loaded.state.transactionId} is already resolved.`, {
      code: "CONFLICT_ALREADY_RESOLVED",
      exitCode: 8,
    });
  }
  const config = readMergoraConfig(loaded.root);
  if (config === null || digest(config) !== loaded.state.configPreconditionDigest) {
    throw new CliError("mergora.json changed after conflict creation.", {
      code: "CONFLICT_LIVE_STALE",
      exitCode: 8,
      target: "mergora.json",
    });
  }
  const manifest = readManifest(loaded.root);
  if (digest(manifest.value) !== loaded.state.manifestPreconditionDigest) {
    throw new CliError("The provenance manifest changed after conflict creation.", {
      code: "CONFLICT_LIVE_STALE",
      exitCode: 8,
      target: MANIFEST_PATH,
    });
  }
  if (
    sha256(readFileSync(resolve(loaded.root, "package.json"))) !== loaded.state.package.localDigest
  ) {
    throw new CliError("package.json changed after conflict creation.", {
      code: "CONFLICT_LIVE_STALE",
      exitCode: 8,
      target: "package.json",
    });
  }
  for (const entry of loaded.state.entries) {
    if (digestOrNull(readProjectFile(loaded.root, entry.target)) !== entry.localDigest) {
      throw new CliError(`Live target ${entry.target} changed after conflict creation.`, {
        code: "CONFLICT_LIVE_STALE",
        exitCode: 8,
        target: entry.target,
      });
    }
    if (entry.baseDigest !== null) {
      const stored = readProjectFile(loaded.root, basePath(entry.baseDigest));
      if (stored === null || sha256(stored) !== entry.baseDigest) {
        throw new CliError(`Immutable base for ${entry.target} changed after conflict creation.`, {
          code: "CONFLICT_BASE_STALE",
          exitCode: 8,
          target: basePath(entry.baseDigest),
        });
      }
    }
  }
}

function resolutionLimitations(): readonly string[] {
  return [
    "Choices are target-specific; take-upstream has no operation-wide wildcard.",
    "Manual resolution validates conflict markers, UTF-8, declared JSON syntax, and adapter parse diagnostics; full project type/Contract validation still runs after commit.",
    "There is no force overwrite. Any changed live, manifest, package, base, state, or snapshot digest requires a fresh update plan.",
  ];
}

export function listSemanticResolutions(options: {
  readonly projectRoot: string;
  readonly transactionId: string;
}): SemanticResolutionList {
  const loaded = readConflict(options.projectRoot, options.transactionId);
  if (loaded.state.state === "conflicted") assertConflictLivePreconditions(loaded);
  return {
    transactionId: loaded.state.transactionId,
    state: loaded.state.state,
    unresolved: loaded.state.entries
      .filter(
        ({ originalStatus, resolution }) =>
          originalStatus === "conflict" && resolution === "unresolved",
      )
      .map((entry) => ({
        target: entry.target,
        semanticUnitIds: [...new Set(entry.conflicts.map(({ id }) => id))].sort((left, right) =>
          left.localeCompare(right, "en-US"),
        ),
        reasons: entry.conflicts.map(({ detail }) => detail),
        safeChoices: ["take-local", "take-upstream", "manual"] as const,
      })),
    resolved: loaded.state.entries
      .filter(
        (
          entry,
        ): entry is ConflictStateEntry & {
          readonly resolution: Exclude<ConflictResolution, "unresolved">;
        } => entry.originalStatus === "conflict" && entry.resolution !== "unresolved",
      )
      .map((entry) => ({
        target: entry.target,
        resolution: entry.resolution,
        proposedDigest: entry.currentProposedDigest,
      })),
    limitations: resolutionLimitations(),
  };
}

function validateManualResolution(
  loaded: LoadedConflict,
  entry: ConflictStateEntry,
  bytes: Buffer,
): void {
  let text: string | null = null;
  if (
    entry.mediaType.startsWith("text/") ||
    entry.mediaType === "application/json" ||
    entry.mediaType === "application/jsonc"
  ) {
    try {
      text = new TextDecoder("utf-8", { fatal: true, ignoreBOM: true }).decode(bytes);
    } catch {
      throw new CliError(`Manual proposal for ${entry.target} is not valid UTF-8.`, {
        code: "CONFLICT_RESOLUTION_PARSE_FAILED",
        exitCode: 6,
        target: entry.target,
      });
    }
    if (CONFLICT_MARKER.test(text)) {
      throw new CliError(`Manual proposal for ${entry.target} still contains conflict markers.`, {
        code: "CONFLICT_MARKERS_REMAIN",
        exitCode: 6,
        target: entry.target,
      });
    }
  }
  if (entry.mediaType === "application/json" || entry.mediaType === "text/json") {
    try {
      JSON.parse(text ?? bytes.toString("utf8"));
    } catch {
      throw new CliError(`Manual proposal for ${entry.target} is not valid strict JSON.`, {
        code: "CONFLICT_RESOLUTION_PARSE_FAILED",
        exitCode: 6,
        target: entry.target,
      });
    }
  }
  const adapterProbe =
    text === null || entry.mediaType === "application/json" || entry.mediaType === "text/json"
      ? null
      : entry.mediaType === "text/css"
        ? {
            base: Buffer.from(":root { --mergora-validation-base: 0; }\n"),
            remote: Buffer.concat([bytes, Buffer.from("\n/* mergora-validation-remote */\n")]),
          }
        : {
            base: Buffer.from("/* mergora-validation-base */\n"),
            remote: Buffer.concat([bytes, Buffer.from("\n/* mergora-validation-remote */\n")]),
          };
  const diagnostics = mergeFileThreeWay({
    mediaType: entry.mediaType,
    base: adapterProbe?.base ?? verifiedSnapshot(loaded, entry, "base"),
    local: bytes,
    remote: adapterProbe?.remote ?? verifiedSnapshot(loaded, entry, "remote"),
  });
  const parseFailure = diagnostics.conflicts.find(({ reason }) =>
    ["parse-error", "invalid-json", "utf8-decode", "duplicate-key", "invalid-keep-region"].includes(
      reason,
    ),
  );
  if (parseFailure !== undefined) {
    throw new CliError(
      `Manual proposal for ${entry.target} failed its declared media adapter: ${parseFailure.detail}`,
      {
        code: "CONFLICT_RESOLUTION_PARSE_FAILED",
        exitCode: 6,
        target: entry.target,
      },
    );
  }
}

interface InternalResolveChoicePlan {
  readonly loaded: LoadedConflict;
  readonly plan: SemanticResolveChoicePlan;
  readonly proposals: ReadonlyMap<
    string,
    {
      readonly bytes: Buffer | null;
      readonly resolution: ConflictResolution;
    }
  >;
}

function buildResolveChoicePlan(options: SemanticResolveChoiceOptions): InternalResolveChoicePlan {
  const loaded = readConflict(options.projectRoot, options.transactionId);
  assertConflictLivePreconditions(loaded);
  if (options.targets.length === 0) {
    throw new CliError("Resolve choice requires at least one exact target.", {
      code: "RESOLVE_TARGET_REQUIRED",
      exitCode: 2,
    });
  }
  const targets = [...new Set(options.targets)].sort((left, right) =>
    left.localeCompare(right, "en-US"),
  );
  if (targets.length !== options.targets.length) {
    throw new CliError("Resolve choice repeats a target.", {
      code: "RESOLVE_TARGET_DUPLICATE",
      exitCode: 2,
    });
  }
  const entryByTarget = new Map(loaded.state.entries.map((entry) => [entry.target, entry]));
  const proposals = new Map<
    string,
    { readonly bytes: Buffer | null; readonly resolution: ConflictResolution }
  >();
  for (const target of targets) {
    assertPortableRelativePath(target, "Resolve target");
    const entry = entryByTarget.get(target);
    if (entry === undefined || entry.originalStatus !== "conflict") {
      throw new CliError(
        `Target ${target} is not a conflict in transaction ${options.transactionId}.`,
        {
          code: "RESOLVE_TARGET_UNKNOWN",
          exitCode: 2,
          target,
        },
      );
    }
    let bytes: Buffer | null;
    let resolution: ConflictResolution;
    if (options.choice === "take-local") {
      currentConflictProposal(loaded, entry, false);
      bytes = verifiedSnapshot(loaded, entry, "local");
      resolution = "take-local";
    } else if (options.choice === "take-upstream") {
      currentConflictProposal(loaded, entry, false);
      bytes = verifiedSnapshot(loaded, entry, "remote");
      resolution = "take-upstream";
    } else if (options.choice === "reset") {
      currentConflictProposal(loaded, entry, false);
      bytes = verifiedSnapshot(loaded, entry, "proposed");
      resolution = "unresolved";
    } else {
      bytes = currentConflictProposal(loaded, entry, true);
      if (bytes === null) throw new Error("Conflict proposal files are always represented.");
      validateManualResolution(loaded, entry, bytes);
      resolution = "manual";
    }
    proposals.set(target, { bytes, resolution });
  }
  const changes = targets.map((target) => {
    const entry = entryByTarget.get(target)!;
    const proposal = proposals.get(target)!;
    return {
      target,
      from: entry.currentProposedDigest,
      to: digestOrNull(proposal.bytes),
      present: proposal.bytes !== null,
      resolution: proposal.resolution,
    };
  });
  const semantic = {
    schemaVersion: 1 as const,
    command: "resolve" as const,
    scope: "local-conflict-bundle" as const,
    transactionId: options.transactionId,
    choice: options.choice,
    statePreconditionDigest: loaded.stateDigest,
    manifestPreconditionDigest: loaded.state.manifestPreconditionDigest,
    changes,
    limitations: resolutionLimitations(),
  };
  return {
    loaded,
    proposals,
    plan: { ...semantic, planDigest: digest(semantic) },
  };
}

export function planSemanticResolveChoice(
  options: SemanticResolveChoiceOptions,
): SemanticResolveChoicePlan {
  return buildResolveChoicePlan(options).plan;
}

function persistConflictState(loaded: LoadedConflict, state: ConflictState): void {
  const stateBytes = Buffer.from(`${JSON.stringify(state, null, 2)}\n`);
  writeAtomic(
    loaded.root,
    `${transactionRoot(state.transactionId)}/${CONFLICT_STATE_PATH}`,
    stateBytes,
  );
  writeAtomic(
    loaded.root,
    `${transactionRoot(state.transactionId)}/${CONFLICT_STATE_DIGEST_PATH}`,
    Buffer.from(`${sha256(stateBytes)}\n`),
  );
}

export function applySemanticResolveChoice(
  options: SemanticResolveChoiceOptions,
  expectedPlanDigest?: string,
): SemanticResolveChoicePlan {
  const internal = buildResolveChoicePlan(options);
  if (expectedPlanDigest !== undefined && internal.plan.planDigest !== expectedPlanDigest) {
    throw new CliError("Resolve choice plan changed before apply; review a fresh plan.", {
      code: "PLAN_PRECONDITION_STALE",
      exitCode: 8,
    });
  }
  for (const change of internal.plan.changes) {
    const entry = internal.loaded.state.entries.find(({ target }) => target === change.target)!;
    const proposal = internal.proposals.get(change.target)!;
    writeAtomic(
      internal.loaded.root,
      conflictPath(internal.loaded.state.transactionId, entry.key, "proposed"),
      fileBytesForBundle(proposal.bytes),
    );
  }
  const nextEntries = internal.loaded.state.entries.map((entry) => {
    const proposal = internal.proposals.get(entry.target);
    if (proposal === undefined) return entry;
    return {
      ...entry,
      resolution: proposal.resolution,
      currentProposedDigest: digestOrNull(proposal.bytes),
      currentProposedPresent: proposal.bytes !== null,
    };
  });
  persistConflictState(internal.loaded, {
    ...internal.loaded.state,
    entries: nextEntries,
  });
  return internal.plan;
}

export interface SemanticResolveApplyOptions {
  readonly projectRoot: string;
  readonly transactionId: string;
  readonly noInstall?: boolean | undefined;
  readonly offline?: boolean | undefined;
  readonly packageManagerRunner?: PackageManagerRunner | undefined;
  readonly faultInjector?: TransactionFaultInjector | undefined;
  readonly commandArguments?: readonly string[] | undefined;
}

export interface SemanticResolveApplyResult {
  readonly mode: "semantic-resolve";
  readonly status: "committed";
  readonly conflictTransactionId: string;
  readonly planDigest: Digest;
  readonly transaction: TransactionResult;
  readonly decisions: readonly {
    readonly target: string;
    readonly resolution: Exclude<ConflictResolution, "unresolved">;
    readonly proposedDigest: Digest | null;
  }[];
}

interface InternalResolveApplyPlan {
  readonly loaded: LoadedConflict;
  readonly plan: OperationPlan;
  readonly mutations: readonly TransactionMutation[];
  readonly observedTargets: Readonly<Record<string, Digest | null>>;
  readonly candidates: ReadonlyMap<string, Buffer | null>;
}

function resolvedOperation(
  entry: ConflictStateEntry,
  proposed: Buffer | null,
): OperationPlanFile["operation"] {
  if (entry.originalStatus !== "conflict") return operationFor(entry.originalStatus);
  if (entry.resolution === "take-local") {
    return proposed === null ? "local-delete" : "keep-local";
  }
  if (entry.resolution === "take-upstream") {
    if (proposed === null) return "delete";
    if (entry.localDigest === null) return "add";
    return entry.mediaType.startsWith("text/") || entry.mediaType.includes("json")
      ? "fast-forward"
      : "binary-replace";
  }
  if (digestOrNull(proposed) === entry.localDigest) return "keep-local";
  if (proposed === null) return "delete";
  if (entry.localDigest === null) return "add";
  return "semantic-merge";
}

function buildResolveApplyInternal(options: SemanticResolveApplyOptions): InternalResolveApplyPlan {
  const loaded = readConflict(options.projectRoot, options.transactionId);
  assertConflictLivePreconditions(loaded);
  const unresolved = loaded.state.entries.filter(
    ({ originalStatus, resolution }) =>
      originalStatus === "conflict" && resolution === "unresolved",
  );
  if (unresolved.length > 0) {
    throw new CliError(
      `Conflict target ${unresolved[0]!.target} is unresolved; choose an explicit path-specific resolution first.`,
      {
        code: "CONFLICTS_UNRESOLVED",
        exitCode: 6,
        target: unresolved[0]!.target,
      },
    );
  }
  const candidates = new Map<string, Buffer | null>();
  for (const entry of loaded.state.entries) {
    const bytes =
      entry.originalStatus === "conflict"
        ? currentConflictProposal(loaded, entry, false)
        : verifiedSnapshot(loaded, entry, "proposed");
    if (entry.originalStatus === "conflict" && entry.resolution === "manual") {
      if (bytes === null) {
        throw new CliError(
          `Manual resolution for ${entry.target} cannot express deletion; use take-local or take-upstream.`,
          { code: "CONFLICT_MANUAL_DELETE_UNSUPPORTED", exitCode: 6, target: entry.target },
        );
      }
      validateManualResolution(loaded, entry, bytes);
    }
    if (
      digestOrNull(bytes) !== entry.currentProposedDigest &&
      entry.originalStatus === "conflict"
    ) {
      throw new CliError(`Resolved proposal for ${entry.target} changed after recording.`, {
        code: "CONFLICT_PROPOSAL_STALE",
        exitCode: 8,
        target: entry.target,
      });
    }
    candidates.set(entry.target, bytes);
  }
  const nextManifest = structuredClone(loaded.nextManifest);
  for (const entry of loaded.state.entries) {
    const item = nextManifest.items[entry.owner];
    if (item === undefined) {
      throw new CliError(`Conflict manifest snapshot lacks owner ${entry.owner}.`, {
        code: "CONFLICT_STATE_INVALID",
        exitCode: 8,
      });
    }
    const index = item.files.findIndex(({ logicalPath }) => logicalPath === entry.logicalPath);
    if (entry.remotePresent) {
      if (index < 0 || item.files[index]!.base !== entry.remoteDigest) {
        throw new CliError(`Conflict manifest base for ${entry.target} is inconsistent.`, {
          code: "CONFLICT_STATE_INVALID",
          exitCode: 8,
          target: entry.target,
        });
      }
      const proposed = candidates.get(entry.target)!;
      const files = [...item.files];
      files[index] = {
        ...files[index]!,
        installed: digestOrNull(proposed),
        ...(proposed === null ? { tombstone: true as const } : { tombstone: undefined }),
      };
      nextManifest.items[entry.owner] = { ...item, files };
    } else if (index >= 0) {
      throw new CliError(`Deleted upstream file ${entry.target} remains in next manifest.`, {
        code: "CONFLICT_STATE_INVALID",
        exitCode: 8,
        target: entry.target,
      });
    }
  }
  const nextManifestBytes = manifestBytes(nextManifest);
  const mutations: TransactionMutation[] = [];
  const observedTargets: Record<string, Digest | null> = {};
  const fileOperations: OperationPlanFile[] = [];
  for (const entry of loaded.state.entries) {
    const proposed = candidates.get(entry.target)!;
    observedTargets[entry.target] = entry.localDigest;
    const operation = resolvedOperation(entry, proposed);
    fileOperations.push({
      operation,
      target: entry.target,
      owner: entry.owner,
      base: entry.baseDigest,
      local: entry.localDigest,
      remote: entry.remoteDigest,
      proposed: digestOrNull(proposed),
      mediaType: entry.mediaType,
      risk:
        entry.originalStatus === "conflict"
          ? "review-required"
          : operation === "delete"
            ? "destructive"
            : operation === "semantic-merge"
              ? "review-required"
              : "ordinary",
      reason:
        entry.originalStatus === "conflict"
          ? `Explicit path-specific resolution recorded as ${entry.resolution}; all original digests were revalidated.`
          : `Previously clean ${entry.originalStatus} candidate retained from the immutable conflict snapshot.`,
    });
    if (entry.localDigest !== digestOrNull(proposed)) {
      mutations.push({ target: entry.target, content: proposed, beforeDigest: entry.localDigest });
    }
    const remote = verifiedSnapshot(loaded, entry, "remote");
    if (remote !== null) {
      const remoteDigest = sha256(remote);
      const target = basePath(remoteDigest);
      const existing = readProjectFile(loaded.root, target);
      if (existing !== null && sha256(existing) !== remoteDigest) {
        throw new CliError(`Immutable base ${target} is corrupt.`, {
          code: "BASE_DIGEST_MISMATCH",
          exitCode: 8,
          target,
        });
      }
      observedTargets[target] = digestOrNull(existing);
      if (existing === null && !mutations.some((candidate) => candidate.target === target)) {
        mutations.push({ target, content: remote, beforeDigest: null });
      }
    }
  }
  if (loaded.state.package.changed) {
    mutations.push({
      target: "package.json",
      content: loaded.packageProposed,
      beforeDigest: loaded.state.package.localDigest,
    });
  }
  const manifestBefore = requiredConflictFile(loaded.root, MANIFEST_PATH);
  mutations.push({
    target: MANIFEST_PATH,
    content: nextManifestBytes,
    beforeDigest: sha256(manifestBefore),
    manifest: true,
  });
  const owner = loaded.state.selectedItems[0]!;
  for (const candidate of mutations) {
    if (fileOperations.some(({ target }) => target === candidate.target)) continue;
    fileOperations.push(
      metadataOperation({
        target: candidate.target,
        owner,
        before:
          candidate.target === MANIFEST_PATH
            ? manifestBefore
            : candidate.target === "package.json"
              ? loaded.packageLocal
              : null,
        after: candidate.content === null ? null : Buffer.from(candidate.content),
        mediaType: candidate.target.endsWith(".json")
          ? "application/json"
          : "application/octet-stream",
        reason:
          candidate.target === MANIFEST_PATH
            ? "Commit resolved installed digests and immutable upstream provenance last."
            : candidate.target === "package.json"
              ? "Apply the originally reviewed dependency proposal."
              : "Persist the exact immutable remote bytes as the next base.",
      }),
    );
  }
  const original = loaded.plan;
  const decisions = loaded.state.entries
    .filter(({ originalStatus }) => originalStatus === "conflict")
    .map(({ target, resolution }) => `${target}=${resolution}`)
    .sort((left, right) => left.localeCompare(right, "en-US"));
  const plan = finalizeOperationPlan({
    schemaVersion: 1,
    command: "resolve",
    cliVersion: CLI_VERSION,
    projectRoot: ".",
    configDigest: loaded.state.configPreconditionDigest,
    manifestPreconditionDigest: loaded.state.manifestPreconditionDigest,
    registries: original.registries,
    items: original.items,
    fileOperations: fileOperations.sort((left, right) =>
      left.target.localeCompare(right.target, "en-US"),
    ),
    dependencyChanges: original.dependencyChanges,
    structuredPatches: original.structuredPatches,
    migrations: original.migrations,
    contractChanges: original.contractChanges,
    warnings: [
      ...original.warnings,
      `Resolution decisions: ${decisions.join(", ")}.`,
      "Every live, manifest, package, immutable-base, conflict-state, and proposal digest was revalidated; no force path exists.",
    ],
    consentRequirements: [
      {
        id: "apply-semantic-resolution",
        flag: "--apply",
        reason: "Atomically commit every resolved target and advance provenance manifest last.",
      },
    ],
    conflicts: [],
    estimatedBytes: {
      download: 0,
      write: mutations.reduce(
        (total, candidate) => total + (candidate.content?.byteLength ?? 0),
        0,
      ),
    },
    validationSuite: original.validationSuite,
    rollbackAvailable: true,
  });
  return { loaded, plan, mutations, observedTargets, candidates };
}

export function planSemanticResolveApply(options: SemanticResolveApplyOptions): OperationPlan {
  return buildResolveApplyInternal(options).plan;
}

export function applySemanticResolution(
  options: SemanticResolveApplyOptions,
  expectedPlanDigest?: string,
): SemanticResolveApplyResult {
  const internal = buildResolveApplyInternal(options);
  if (expectedPlanDigest !== undefined && expectedPlanDigest !== internal.plan.planDigest) {
    throw new CliError("Resolved transaction plan changed before apply; review a fresh plan.", {
      code: "PLAN_PRECONDITION_STALE",
      exitCode: 8,
    });
  }
  const transaction = executeTransaction({
    root: internal.loaded.root,
    plan: internal.plan,
    mutations: internal.mutations,
    observedTargets: internal.observedTargets,
    registryPayloads: internal.loaded.state.registryPayloads,
    packageManager: internal.loaded.state.package.packageManager,
    packageManagerRequired: internal.loaded.state.package.changed,
    noInstall: options.noInstall ?? internal.loaded.state.package.noInstall,
    offline: options.offline,
    packageManagerRunner: options.packageManagerRunner,
    faultInjector: options.faultInjector,
    commandArguments: options.commandArguments,
  });
  const decisions = internal.loaded.state.entries
    .filter(
      (
        entry,
      ): entry is ConflictStateEntry & {
        readonly resolution: Exclude<ConflictResolution, "unresolved">;
      } => entry.originalStatus === "conflict" && entry.resolution !== "unresolved",
    )
    .map((entry) => ({
      target: entry.target,
      resolution: entry.resolution,
      proposedDigest: entry.currentProposedDigest,
    }));
  persistConflictState(internal.loaded, {
    ...internal.loaded.state,
    state: "resolved",
    committedTransactionId: transaction.transactionId,
  });
  return {
    mode: "semantic-resolve",
    status: "committed",
    conflictTransactionId: options.transactionId,
    planDigest: internal.plan.planDigest,
    transaction,
    decisions,
  };
}

export interface SemanticSourceDiffOptions {
  readonly projectRoot: string;
  readonly itemIds?: readonly string[] | undefined;
  /** Omit for a strictly local B -> L customization diff. */
  readonly release?: ImmutableUpdateRelease | undefined;
  readonly packageManager?: PackageManager | undefined;
}

export interface SemanticSourceDiffFile {
  readonly target: string;
  readonly owner: string;
  readonly logicalPath: string;
  readonly mediaType: string;
  readonly baseDigest: Digest | null;
  readonly localDigest: Digest | null;
  readonly localChange: "unchanged" | "added" | "modified" | "deleted";
  readonly stat: {
    readonly bytesAdded: number;
    readonly bytesRemoved: number;
    readonly linesAdded: number | null;
    readonly linesRemoved: number | null;
  };
  readonly planned: null | {
    readonly status: FileMergeResult["status"];
    readonly remoteDigest: Digest | null;
    readonly proposedDigest: Digest | null;
    readonly appliedRemoteKeys: readonly string[];
    readonly preservedLocalKeys: readonly string[];
    readonly conflicts: readonly SemanticConflict[];
  };
}

export interface SemanticSourceDiff {
  readonly schemaVersion: 1;
  readonly mode: "read-only-semantic-diff";
  readonly manifestDigest: Digest;
  readonly targetRelease: string | null;
  readonly hasDifferences: boolean;
  readonly nameOnly: readonly string[];
  readonly stat: {
    readonly files: number;
    readonly bytesAdded: number;
    readonly bytesRemoved: number;
    readonly linesAdded: number | null;
    readonly linesRemoved: number | null;
  };
  readonly files: readonly SemanticSourceDiffFile[];
}

function textLines(bytes: Buffer | null, mediaType: string): readonly string[] | null {
  if (bytes === null) return [];
  if (!(mediaType.startsWith("text/") || mediaType.includes("json"))) return null;
  try {
    return new TextDecoder("utf-8", { fatal: true, ignoreBOM: true })
      .decode(bytes)
      .split(/\r\n|\n|\r/gu);
  } catch {
    return null;
  }
}

function diffStat(
  base: Buffer | null,
  local: Buffer | null,
  mediaType: string,
): SemanticSourceDiffFile["stat"] {
  if (digestOrNull(base) === digestOrNull(local)) {
    return { bytesAdded: 0, bytesRemoved: 0, linesAdded: 0, linesRemoved: 0 };
  }
  const baseBytes = base ?? Buffer.alloc(0);
  const localBytes = local ?? Buffer.alloc(0);
  let bytePrefix = 0;
  while (
    bytePrefix < baseBytes.byteLength &&
    bytePrefix < localBytes.byteLength &&
    baseBytes[bytePrefix] === localBytes[bytePrefix]
  ) {
    bytePrefix += 1;
  }
  let byteSuffix = 0;
  while (
    byteSuffix < baseBytes.byteLength - bytePrefix &&
    byteSuffix < localBytes.byteLength - bytePrefix &&
    baseBytes[baseBytes.byteLength - 1 - byteSuffix] ===
      localBytes[localBytes.byteLength - 1 - byteSuffix]
  ) {
    byteSuffix += 1;
  }
  const baseLines = textLines(base, mediaType);
  const localLines = textLines(local, mediaType);
  let linesAdded: number | null = null;
  let linesRemoved: number | null = null;
  if (baseLines !== null && localLines !== null) {
    let prefix = 0;
    while (
      prefix < baseLines.length &&
      prefix < localLines.length &&
      baseLines[prefix] === localLines[prefix]
    ) {
      prefix += 1;
    }
    let suffix = 0;
    while (
      suffix < baseLines.length - prefix &&
      suffix < localLines.length - prefix &&
      baseLines[baseLines.length - 1 - suffix] === localLines[localLines.length - 1 - suffix]
    ) {
      suffix += 1;
    }
    linesRemoved = Math.max(0, baseLines.length - prefix - suffix);
    linesAdded = Math.max(0, localLines.length - prefix - suffix);
  }
  return {
    bytesAdded: Math.max(0, localBytes.byteLength - bytePrefix - byteSuffix),
    bytesRemoved: Math.max(0, baseBytes.byteLength - bytePrefix - byteSuffix),
    linesAdded,
    linesRemoved,
  };
}

function localChange(
  base: Buffer | null,
  local: Buffer | null,
): SemanticSourceDiffFile["localChange"] {
  if (digestOrNull(base) === digestOrNull(local)) return "unchanged";
  if (base === null) return "added";
  if (local === null) return "deleted";
  return "modified";
}

/**
 * Strictly read-only B -> L inspection, optionally enriched with the verified
 * immutable L + (B -> R) plan. It never creates cache, transaction, or diff files.
 */
export function diffSemanticSource(options: SemanticSourceDiffOptions): SemanticSourceDiff {
  const root = validatedProjectRoot(options.projectRoot);
  const manifest = readManifest(root);
  const selected = selectedItemIds(manifest.value, options.itemIds);
  let entries: readonly UpdateEntry[];
  let targetRelease: string | null = null;
  if (options.release !== undefined) {
    const internal = buildUpdateInternal({
      projectRoot: root,
      itemIds: options.itemIds,
      release: options.release,
      packageManager: options.packageManager,
      noInstall: true,
    });
    entries = internal.entries;
    targetRelease = options.release.release;
  } else {
    entries = selected
      .flatMap((owner) => {
        const item = manifest.value.items[owner]!;
        return item.files.map((file) => {
          const base = readProjectFile(root, basePath(file.base));
          if (base === null || sha256(base) !== file.base) {
            throw new CliError(`Immutable base for ${file.target} is missing or corrupt.`, {
              code: "BASE_DIGEST_MISMATCH",
              exitCode: 3,
              target: basePath(file.base),
            });
          }
          const local = readProjectFile(root, file.target);
          const result = mergeFileThreeWay({
            mediaType: file.mediaType,
            base,
            local,
            remote: base,
          });
          return {
            key: portableTargetKey(file.target),
            target: file.target,
            owner,
            logicalPath: file.logicalPath,
            role: file.role,
            mediaType: file.mediaType,
            base,
            local,
            remote: base,
            result,
            proposed: local,
            remoteFile: null,
          } satisfies UpdateEntry;
        });
      })
      .sort((left, right) => left.target.localeCompare(right.target, "en-US"));
  }
  const files = entries.map((entry) => ({
    target: entry.target,
    owner: entry.owner,
    logicalPath: entry.logicalPath,
    mediaType: entry.mediaType,
    baseDigest: digestOrNull(entry.base),
    localDigest: digestOrNull(entry.local),
    localChange: localChange(entry.base, entry.local),
    stat: diffStat(entry.base, entry.local, entry.mediaType),
    planned:
      options.release === undefined
        ? null
        : {
            status: entry.result.status,
            remoteDigest: digestOrNull(entry.remote),
            proposedDigest: digestOrNull(entry.proposed),
            appliedRemoteKeys: entry.result.appliedRemoteKeys,
            preservedLocalKeys: entry.result.preservedLocalKeys,
            conflicts: entry.result.conflicts,
          },
  }));
  const differing = files.filter(
    (file) =>
      file.localChange !== "unchanged" ||
      (file.planned !== null && file.planned.remoteDigest !== file.baseDigest),
  );
  const lineStatsKnown = differing.every(
    ({ stat }) => stat.linesAdded !== null && stat.linesRemoved !== null,
  );
  return {
    schemaVersion: 1,
    mode: "read-only-semantic-diff",
    manifestDigest: digest(manifest.value),
    targetRelease,
    hasDifferences: differing.length > 0,
    nameOnly: differing.map(({ target }) => target),
    stat: {
      files: differing.length,
      bytesAdded: differing.reduce((total, { stat }) => total + stat.bytesAdded, 0),
      bytesRemoved: differing.reduce((total, { stat }) => total + stat.bytesRemoved, 0),
      linesAdded: lineStatsKnown
        ? differing.reduce((total, { stat }) => total + stat.linesAdded!, 0)
        : null,
      linesRemoved: lineStatsKnown
        ? differing.reduce((total, { stat }) => total + stat.linesRemoved!, 0)
        : null,
    },
    files,
  };
}
