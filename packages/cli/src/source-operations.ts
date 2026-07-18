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
  type MergoraConfig,
} from "./configuration.js";
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
} from "./transaction-engine.js";

const UNRELEASED_VERSION = "0.0.0-unreleased" as const;
const REQUESTED_VERSION = "=0.0.0-unreleased" as const;
const MANIFEST_PATH = ".mergora/manifest.json" as const;

interface ManifestFile {
  readonly logicalPath: string;
  readonly target: string;
  readonly role: "component" | "hook" | "lib" | "system" | "kit" | "style" | "token";
  readonly base: `sha256:${string}`;
  readonly installed: `sha256:${string}` | null;
  readonly mediaType: string;
  readonly executable: false;
  readonly tombstone?: boolean | undefined;
}

interface ManifestPatch {
  readonly id: string;
  readonly adapter:
    | "css-import"
    | "css-source"
    | "css-token-block"
    | "package-dependency"
    | "tsconfig-path"
    | "tsconfig-include"
    | "framework-config";
  readonly semanticKey: string;
  readonly ownedValueDigest: `sha256:${string}`;
}

interface ManifestItem {
  readonly registry: "official";
  readonly itemId: string;
  readonly kind: "component" | "system" | "hook" | "utility" | "kit" | "theme" | "contract";
  readonly requested: string;
  readonly resolved: string;
  readonly payload: { readonly url: string; readonly digest: `sha256:${string}` };
  readonly mode: "source";
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
  readonly registryDependencies: readonly string[];
  readonly dependencies: {
    readonly runtime: Readonly<Record<string, string>>;
    readonly development: Readonly<Record<string, string>>;
  };
  structuredPatches: ManifestPatch[];
  readonly contractVersion: string;
  readonly lastMigration: string | null;
}

interface ProvenanceManifest {
  readonly $schema: string;
  readonly schemaVersion: 1;
  readonly projectId: `sha256:${string}`;
  readonly toolchain: {
    readonly cli: string;
    readonly schema: string;
    readonly transformer: string;
    readonly formatter: string;
  };
  items: Record<string, ManifestItem>;
  sharedTargets: Record<string, string[]>;
  dependencyOwners: Record<string, string[]>;
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

function readManifest(root: string): {
  readonly value: ProvenanceManifest;
  readonly bytes: Buffer;
} {
  const bytes = readRequiredProjectFile(root, MANIFEST_PATH, "The provenance manifest is missing.");
  let raw: unknown;
  try {
    raw = JSON.parse(bytes.toString("utf8")) as unknown;
  } catch {
    throw new CliError("The provenance manifest is not valid JSON.", {
      code: "MANIFEST_INVALID_JSON",
      exitCode: 3,
      target: MANIFEST_PATH,
    });
  }
  const manifest = objectValue(raw, "The provenance manifest");
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
    ],
    "The provenance manifest",
  );
  if (
    manifest.schemaVersion !== 1 ||
    typeof manifest.$schema !== "string" ||
    !manifest.$schema.endsWith("/manifest-v1.schema.json") ||
    typeof manifest.projectId !== "string" ||
    !/^sha256:[a-f0-9]{64}$/u.test(manifest.projectId)
  ) {
    throw new CliError("The provenance manifest schema identity is unsupported.", {
      code: "MANIFEST_SCHEMA_INVALID",
      exitCode: 3,
      target: MANIFEST_PATH,
    });
  }
  objectValue(manifest.toolchain, "Manifest toolchain");
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
    if (
      !Array.isArray(item.files) ||
      !Array.isArray(item.registryDependencies) ||
      !Array.isArray(item.structuredPatches) ||
      typeof item.itemId !== "string" ||
      item.mode !== "source" ||
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
  return { value: manifest as unknown as ProvenanceManifest, bytes };
}

function readProjectFile(root: string, target: string): Buffer | null {
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

function normalizedManifest(manifest: ProvenanceManifest): ProvenanceManifest {
  const items = Object.fromEntries(
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
        },
      ]),
  );
  return {
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
}

function manifestBytes(manifest: ProvenanceManifest): Buffer {
  return Buffer.from(`${JSON.stringify(normalizedManifest(manifest), null, 2)}\n`);
}

function digestOrNull(bytes: Uint8Array | null): `sha256:${string}` | null {
  return bytes === null ? null : sha256(bytes);
}

function basePath(digest: `sha256:${string}`): string {
  const hexadecimal = digest.slice("sha256:".length);
  return `.mergora/bases/sha256/${hexadecimal.slice(0, 2)}/${hexadecimal.slice(2)}.blob`;
}

function qualified(itemId: string): string {
  return `official:${itemId}`;
}

function payloadUrl(itemId: string): string {
  return `${OFFICIAL_REGISTRY_ORIGIN}/releases/${UNRELEASED_VERSION}/items/${itemId}.json`;
}

function itemRoot(
  item: SourceItemRecord,
  config: MergoraConfig,
  targetDirectory: string | undefined,
): string {
  const assertSourceRoot = (value: string): string => {
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
  };
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
): readonly MappedSourceFile[] {
  const root = itemRoot(item, config, targetDirectory);
  return item.files
    .map((source) => {
      const filename = source.targetPath.split("/").at(-1)!;
      const target = `${root}/${item.itemId}/${filename}`;
      assertPortableRelativePath(target, "Rendered source target");
      const bytes = Buffer.from(source.content);
      const logicalRoot = item.kind === "system" ? "systems" : "ui";
      const role =
        source.targetRole === "style" ? "style" : item.kind === "system" ? "system" : "component";
      return {
        source,
        target,
        logicalPath: `${logicalRoot}/${item.itemId}/${filename}`,
        role,
        bytes,
        digest: sha256(bytes),
      } satisfies MappedSourceFile;
    })
    .sort((left, right) => left.target.localeCompare(right.target, "en-US"));
}

function transformContext(config: MergoraConfig, targetDirectory?: string | undefined) {
  const targets = {
    ...config.targets,
    ...(targetDirectory === undefined
      ? {}
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
): ManifestItem {
  const context = transformContext(config, targetDirectory);
  const kind = source.kind === "system" ? "system" : "component";
  return {
    registry: "official",
    itemId: source.itemId,
    kind,
    requested: REQUESTED_VERSION,
    resolved: UNRELEASED_VERSION,
    payload: { url: payloadUrl(source.itemId), digest: source.payloadDigest },
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
    contractVersion: UNRELEASED_VERSION,
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

function registryPlan(items: readonly SourceItemRecord[]): OperationPlan["registries"] {
  if (items.length === 0) return [];
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
): readonly TransactionRegistryPayload[] {
  return items
    .map((item) => ({
      registry: "official",
      release: UNRELEASED_VERSION,
      url: payloadUrl(item.itemId),
      digest: item.payloadDigest,
    }))
    .sort((left, right) => left.url.localeCompare(right.url, "en-US"));
}

function sourcePlanItems(
  items: readonly SourceItemRecord[],
  directIds: ReadonlySet<string>,
  from: Readonly<Record<string, ManifestItem>>,
  removing: ReadonlySet<string> = new Set(),
): readonly OperationPlanItem[] {
  return items
    .map((item) => ({
      id: qualified(item.itemId),
      direct: directIds.has(item.itemId),
      requested: REQUESTED_VERSION,
      fromVersion: from[qualified(item.itemId)]?.resolved ?? null,
      toVersion: removing.has(qualified(item.itemId)) ? null : UNRELEASED_VERSION,
      mode: "source" as const,
    }))
    .sort((left, right) => left.id.localeCompare(right.id, "en-US"));
}

function readConfiguredProject(options: SourceOperationOptions) {
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
  const inspection = inspectProject(root, {
    framework: config.project.framework,
    sourceRoot: config.project.sourceRoot,
    globalCss: config.styling.globalCss,
    aliasPrefix: mergoraConfigAliasPrefix(config),
    packageManager: options.packageManager,
  });
  return { root, config, manifest, inspection };
}

function requestedCanonicalIds(options: SourceOperationOptions): readonly string[] {
  if (options.itemIds.length === 0) {
    throw new CliError(
      `${options.itemIds.length === 0 ? "Operation" : "Command"} requires an item.`,
      {
        code: "ITEM_REQUIRED",
        exitCode: 2,
      },
    );
  }
  return [...new Set(options.itemIds.map((id) => resolveItemAlias(id, options)))].sort(
    (left, right) => left.localeCompare(right, "en-US"),
  );
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
    registries: registryPlan(context.sources),
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
      download: 0,
      write: context.mutations.reduce(
        (total, entry) => total + (entry.content?.byteLength ?? 0),
        0,
      ),
    },
    validationSuite: [
      "schema",
      "digest",
      "path",
      "collision",
      "parse",
      "ownership",
      "dependency",
      "project-configured",
    ],
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
): void {
  const expectedContext = sha256(canonicalJson(transformContext(config, targetDirectory)));
  if (
    existing.payload.digest !== source.payloadDigest ||
    existing.resolved !== UNRELEASED_VERSION ||
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

function addInternal(options: SourceOperationOptions): InternalSourcePlan {
  if (options.targetDirectory !== undefined) {
    assertPortableRelativePath(options.targetDirectory, "Source target root");
  }
  const project = readConfiguredProject(options);
  const requested = requestedCanonicalIds(options);
  const sources = resolveSourceDependencyClosure(requested, options);
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
    const files = mapFiles(source, project.config, options.targetDirectory);
    if (existing !== undefined) {
      validateExistingInstall(existing, source, project.config, options.targetDirectory);
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
  const plan = operationPlan("add", {
    configDigest: sha256(canonicalJson(project.config)),
    manifestDigest: sha256(canonicalJson(project.manifest.value)),
    items: sourcePlanItems(sources, direct, project.manifest.value.items),
    sources,
    fileOperations,
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
      "The bundled source payloads are unreleased; provenance records their exact digest and provisional 0.0.0-unreleased identity without claiming Stable evidence.",
      ...packageExecutionWarnings(
        options,
        project.inspection.packageManager,
        packagePlan.after !== packagePlan.before,
      ),
    ],
    conflicts,
    mutations,
  });
  return {
    root: project.root,
    publicPlan: plan,
    mutations,
    observedTargets,
    registryPayloads: registryPayloads(sources),
    packageManager: project.inspection.packageManager,
    packageManagerRequired: packagePlan.after !== packagePlan.before,
    resolvedItems: sources.map(({ itemId }) => itemId),
    requestedItems: requested,
    transitiveItems: sources.map(({ itemId }) => itemId).filter((id) => !direct.has(id)),
    retainedFiles: [],
  };
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

function removeInternal(options: SourceRemoveOptions): InternalSourcePlan {
  const project = readConfiguredProject(options);
  const requestedIds = requestedCanonicalIds(options);
  const requestedQualified = new Set(requestedIds.map(qualified));
  const keep = remainingItemIdsAfterRemoval(project.manifest.value.items, requestedQualified);
  const removed = new Set(Object.keys(project.manifest.value.items).filter((id) => !keep.has(id)));
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
  });
  return {
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
  };
}

function adoptInternal(options: SourceOperationOptions): InternalSourcePlan {
  if (options.targetDirectory !== undefined) {
    assertPortableRelativePath(options.targetDirectory, "Source target root");
  }
  const project = readConfiguredProject(options);
  const requested = requestedCanonicalIds(options);
  const sources = resolveSourceDependencyClosure(requested, options);
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
  });
  return {
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
  };
}

function executeSourceOperation(
  command: "add" | "remove" | "adopt",
  internal: InternalSourcePlan,
  options: SourceOperationOptions,
  expectedPlanDigest?: string,
): SourceOperationResult {
  if (expectedPlanDigest !== undefined && expectedPlanDigest !== internal.publicPlan.planDigest) {
    throw new CliError("Operation plan changed before apply; review a fresh plan.", {
      code: "PLAN_PRECONDITION_STALE",
      exitCode: 8,
    });
  }
  const transaction = executeTransaction({
    root: internal.root,
    plan: internal.publicPlan,
    mutations: internal.mutations,
    observedTargets: internal.observedTargets,
    registryPayloads: internal.registryPayloads,
    packageManager: internal.packageManager,
    packageManagerRequired: internal.packageManagerRequired,
    noInstall: options.noInstall,
    offline: options.offline,
    packageManagerRunner: options.packageManagerRunner,
    commandArguments: options.commandArguments,
    faultInjector: options.faultInjector,
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
  expectedPlanDigest?: string,
): SourceOperationResult {
  return executeSourceOperation("add", addInternal(options), options, expectedPlanDigest);
}

export function planSourceRemove(options: SourceRemoveOptions): SourceOperationPlan {
  return removeInternal(options).publicPlan;
}

export function applySourceRemove(
  options: SourceRemoveOptions,
  expectedPlanDigest?: string,
): SourceOperationResult {
  return executeSourceOperation("remove", removeInternal(options), options, expectedPlanDigest);
}

export function planSourceAdopt(options: SourceOperationOptions): SourceOperationPlan {
  return adoptInternal(options).publicPlan;
}

export function applySourceAdopt(
  options: SourceOperationOptions,
  expectedPlanDigest?: string,
): SourceOperationResult {
  return executeSourceOperation("adopt", adoptInternal(options), options, expectedPlanDigest);
}
