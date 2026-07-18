import {
  closeSync,
  constants,
  existsSync,
  fstatSync,
  lstatSync,
  openSync,
  readFileSync,
  readdirSync,
} from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { ContractDefinitionError, parseContractDefinitionV1 } from "mergora-contracts";

import {
  CLI_VERSION,
  assertNoSymlinkAncestors,
  assertPortableRelativePath,
  canonicalJson,
  CliError,
  portableSort,
  resolveInside,
  sha256,
  validatedProjectRoot,
} from "./contracts.js";
import {
  OFFICIAL_REGISTRY_ORIGIN,
  loadSourceItem,
  type RegistryDataOptions,
} from "./registry-data.js";
import {
  executeTransaction,
  type OperationPlan,
  type OperationPlanFile,
  type TransactionMutation,
  type TransactionResult,
} from "./transaction-engine.js";

const VENDOR_ROOT = ".mergora/vendor/v1" as const;
const VENDOR_MANIFEST = `${VENDOR_ROOT}/vendor-manifest.json` as const;
const VENDOR_SUMS = `${VENDOR_ROOT}/SHA256SUMS` as const;
const PROJECT_MANIFEST = ".mergora/manifest.json" as const;
const PROJECT_CONFIG = "mergora.json" as const;
const MANIFEST_SCHEMA =
  "https://akhiltrivedix.github.io/mergora/r/v1/schemas/manifest-v1.schema.json" as const;
const VENDOR_FORMAT = "mergora-vendor-v1" as const;
const GRAPH_FORMAT = "mergora-vendor-dependency-graph-v1" as const;
const UNRELEASED_VERSION = "0.0.0-unreleased" as const;
const LICENSE_SPDX = "MIT" as const;

const MAX_JSON_BYTES = 4 * 1024 * 1024;
const MAX_ARTIFACT_BYTES = 4 * 1024 * 1024;
const MAX_BUNDLE_BYTES = 52_428_800;
const MAX_BUNDLE_FILES = 8192;
const MAX_ITEMS = 4096;
const MAX_SCHEMAS = 128;
const MAX_CONTRACTS = 4096;
const DIGEST_PATTERN = /^sha256:[a-f0-9]{64}$/u;
const ID_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/u;
const QUALIFIED_ID_PATTERN = /^([a-z0-9]+(?:-[a-z0-9]+)*):([a-z0-9]+(?:-[a-z0-9]+)*)$/u;
const SEMVER_PATTERN =
  /^(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)(?:-[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?(?:\+[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?$/u;

type Digest = `sha256:${string}`;
type ArtifactKind =
  "base" | "contract" | "dependency-graph" | "item-payload" | "license" | "schema";

interface ProjectManifestFile {
  readonly logicalPath: string;
  readonly base: Digest;
  readonly mediaType: string;
  readonly executable: false;
}

interface ProjectManifestItem {
  readonly qualifiedId: string;
  readonly registry: string;
  readonly itemId: string;
  readonly kind: string;
  readonly resolved: string;
  readonly direct: boolean;
  readonly mode: "source";
  readonly payload: { readonly url: string; readonly digest: Digest };
  readonly files: readonly ProjectManifestFile[];
  readonly registryDependencies: readonly string[];
  readonly contractVersion: string;
}

interface ProjectState {
  readonly root: string;
  readonly configDigest: Digest;
  readonly manifestDigest: Digest;
  readonly items: ReadonlyMap<string, ProjectManifestItem>;
}

export interface VendorOptions extends RegistryDataOptions {
  readonly projectRoot: string;
  readonly itemIds?: readonly string[] | undefined;
  readonly allInstalled?: boolean | undefined;
  /** A trusted local schema snapshot directory. No network fallback exists. */
  readonly schemaDirectory?: string | undefined;
  /** A portable project-relative directory containing installed executable Contracts. */
  readonly contractDirectory?: string | undefined;
  readonly commandArguments?: readonly string[] | undefined;
}

export interface VendorVerifyOptions {
  readonly projectRoot: string;
}

export interface VendorArtifactReference {
  readonly artifact: string;
  readonly bytes: number;
  readonly digest: Digest;
  readonly kind: ArtifactKind;
  readonly license: typeof LICENSE_SPDX;
}

export interface VendorItemReference {
  readonly id: string;
  readonly version: typeof UNRELEASED_VERSION;
  readonly installedDirect: boolean;
  readonly payload: {
    readonly artifact: string;
    readonly declaredOrigin: string;
    readonly originState: "declared-unpublished";
    readonly digest: Digest;
    readonly license: typeof LICENSE_SPDX;
  };
  readonly bases: readonly {
    readonly logicalPath: string;
    readonly artifact: string;
    readonly digest: Digest;
    readonly mediaType: string;
    readonly executable: false;
    readonly license: typeof LICENSE_SPDX;
  }[];
  readonly registryDependencies: readonly string[];
  readonly contract: {
    readonly artifact: string;
    readonly digest: Digest;
    readonly contractVersion: string;
    readonly license: typeof LICENSE_SPDX;
  } | null;
  readonly passport: null;
}

export interface VendorManifestV1 {
  readonly schemaVersion: 1;
  readonly format: typeof VENDOR_FORMAT;
  readonly provenance: {
    readonly state: "unreleased-local";
    readonly version: typeof UNRELEASED_VERSION;
    readonly projectManifestDigest: Digest;
    readonly officialRelease: null;
    readonly releaseManifest: null;
    readonly claim: "No official release, Stable status, or Quality Passport is claimed.";
  };
  readonly registry: {
    readonly id: "official";
    readonly protocol: "mergora-v1";
    readonly origin: typeof OFFICIAL_REGISTRY_ORIGIN;
    readonly identityDigest: Digest;
    readonly trust: "official";
    readonly acquisition: "verified-local";
  };
  readonly selection: {
    readonly mode: "all-installed" | "items";
    readonly requested: readonly string[];
    readonly resolved: readonly string[];
  };
  readonly license: {
    readonly spdx: typeof LICENSE_SPDX;
    readonly artifact: "licenses/MIT.txt";
    readonly digest: Digest;
  };
  readonly dependencyGraph: {
    readonly artifact: "dependency-graph.json";
    readonly digest: Digest;
  };
  readonly items: readonly VendorItemReference[];
  readonly schemas: readonly {
    readonly id: string;
    readonly artifact: string;
    readonly digest: Digest;
    readonly license: typeof LICENSE_SPDX;
  }[];
  readonly contracts: readonly {
    readonly id: string;
    readonly item: string;
    readonly contractVersion: string;
    readonly artifact: string;
    readonly digest: Digest;
    readonly license: typeof LICENSE_SPDX;
  }[];
  readonly passports: readonly [];
  readonly artifacts: readonly VendorArtifactReference[];
  readonly omissions: {
    readonly releaseManifest: "not-published";
    readonly contracts: readonly string[];
    readonly passports: readonly string[];
    readonly npmTarballs: "not-requested";
  };
  readonly sha256Sums: {
    readonly artifact: "SHA256SUMS";
    readonly digest: Digest;
  };
}

export type VendorPlan = Omit<OperationPlan, "command"> & {
  readonly command: "vendor";
  readonly vendor: {
    readonly outputRoot: typeof VENDOR_ROOT;
    readonly provenanceState: "unreleased-local";
    readonly selectionMode: "all-installed" | "items";
    readonly selectedItems: readonly string[];
    readonly vendorManifestDigest: Digest;
    readonly sha256SumsDigest: Digest;
    readonly networkUsed: false;
  };
};

export interface VendorVerificationResult {
  readonly schemaVersion: 1;
  readonly format: typeof VENDOR_FORMAT;
  readonly state: "valid";
  readonly root: typeof VENDOR_ROOT;
  readonly provenanceState: "unreleased-local";
  readonly releaseClaim: "none";
  readonly items: readonly string[];
  readonly artifacts: number;
  readonly totalBytes: number;
  readonly manifestDigest: Digest;
  readonly sha256SumsDigest: Digest;
  readonly networkUsed: false;
  readonly writePerformed: false;
}

export interface VendorResult {
  readonly mode: "offline-vendor";
  readonly root: typeof VENDOR_ROOT;
  readonly items: readonly string[];
  readonly planDigest: Digest;
  readonly transaction: TransactionResult;
  readonly verification: VendorVerificationResult;
}

interface ArtifactBytes extends VendorArtifactReference {
  readonly content: Buffer;
}

interface BuiltBundle {
  readonly plan: VendorPlan;
  readonly mutations: readonly TransactionMutation[];
  readonly observedTargets: Readonly<Record<string, Digest | null>>;
  readonly targetBytes: ReadonlyMap<string, Buffer>;
  readonly selectedItems: readonly string[];
  readonly root: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function exactKeys(
  value: Record<string, unknown>,
  required: readonly string[],
  optional: readonly string[] = [],
): boolean {
  const keys = Object.keys(value);
  return (
    required.every((key) => Object.hasOwn(value, key)) &&
    keys.every((key) => required.includes(key) || optional.includes(key))
  );
}

function compareText(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function vendorError(message: string, code: string, target?: string): CliError {
  return new CliError(message, {
    code,
    exitCode: code.endsWith("_INVALID_OPTION") ? 2 : code.endsWith("_MISSING") ? 3 : 5,
    ...(target === undefined ? {} : { target }),
  });
}

function safeReadAbsolute(path: string, label: string, maximumBytes: number): Buffer {
  let metadata;
  try {
    metadata = lstatSync(path);
  } catch {
    metadata = null;
  }
  if (metadata === null || metadata.isSymbolicLink() || !metadata.isFile()) {
    throw vendorError(`${label} is missing or is not a regular file.`, "VENDOR_INPUT_MISSING");
  }
  if (metadata.size > maximumBytes) {
    throw vendorError(`${label} exceeds the supported byte limit.`, "VENDOR_INPUT_OVERSIZE");
  }
  let descriptor: number | null = null;
  try {
    const flags =
      process.platform === "win32" ? constants.O_RDONLY : constants.O_RDONLY | constants.O_NOFOLLOW;
    descriptor = openSync(path, flags);
    const opened = fstatSync(descriptor);
    const current = lstatSync(path);
    if (
      !opened.isFile() ||
      current.isSymbolicLink() ||
      !current.isFile() ||
      opened.dev !== current.dev ||
      opened.ino !== current.ino ||
      opened.size > maximumBytes
    ) {
      throw vendorError(`${label} changed during no-follow inspection.`, "VENDOR_INPUT_UNSAFE");
    }
    return readFileSync(descriptor);
  } finally {
    if (descriptor !== null) closeSync(descriptor);
  }
}

function readProjectBytes(
  root: string,
  target: string,
  label: string,
  maximumBytes = MAX_ARTIFACT_BYTES,
  optional = false,
): Buffer | null {
  assertPortableRelativePath(target, label);
  assertNoSymlinkAncestors(root, target);
  const path = resolveInside(root, target, label);
  if (!existsSync(path)) {
    if (optional) return null;
    throw vendorError(`${label} is missing.`, "VENDOR_INPUT_MISSING", target);
  }
  try {
    return safeReadAbsolute(path, label, maximumBytes);
  } catch (error) {
    if (error instanceof CliError && error.target === undefined) {
      throw new CliError(error.message, { code: error.code, exitCode: error.exitCode, target });
    }
    throw error;
  }
}

function parseJson(bytes: Uint8Array, label: string): unknown {
  try {
    return JSON.parse(Buffer.from(bytes).toString("utf8")) as unknown;
  } catch {
    throw vendorError(`${label} is not valid UTF-8 JSON.`, "VENDOR_JSON_INVALID");
  }
}

function canonicalBytes(value: unknown): Buffer {
  return Buffer.from(canonicalJson(value));
}

function parseDigest(value: unknown, label: string): Digest {
  if (typeof value !== "string" || !DIGEST_PATTERN.test(value)) {
    throw vendorError(`${label} is not a SHA-256 digest.`, "VENDOR_SCHEMA_INVALID");
  }
  return value as Digest;
}

function secureDeclaredUrl(value: unknown, label: string): string {
  if (typeof value !== "string") {
    throw vendorError(`${label} is not a URL.`, "VENDOR_ORIGIN_INVALID");
  }
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw vendorError(`${label} is not a URL.`, "VENDOR_ORIGIN_INVALID");
  }
  if (
    url.protocol !== "https:" ||
    url.username !== "" ||
    url.password !== "" ||
    url.search !== "" ||
    url.hash !== ""
  ) {
    throw vendorError(
      `${label} must be credential-free immutable-style HTTPS metadata.`,
      "VENDOR_ORIGIN_INVALID",
    );
  }
  return value;
}

function parseManifestFile(value: unknown, qualifiedId: string): ProjectManifestFile {
  if (
    !isRecord(value) ||
    !exactKeys(
      value,
      ["logicalPath", "target", "role", "base", "installed", "mediaType", "executable"],
      ["tombstone"],
    )
  ) {
    throw vendorError(
      `Installed item ${qualifiedId} has an invalid file record.`,
      "VENDOR_MANIFEST_INVALID",
      PROJECT_MANIFEST,
    );
  }
  if (
    typeof value.logicalPath !== "string" ||
    typeof value.mediaType !== "string" ||
    value.executable !== false
  ) {
    throw vendorError(
      `Installed item ${qualifiedId} has unsafe file metadata.`,
      "VENDOR_MANIFEST_INVALID",
      PROJECT_MANIFEST,
    );
  }
  assertPortableRelativePath(value.logicalPath, "Installed logical path");
  return {
    logicalPath: value.logicalPath,
    base: parseDigest(value.base, `${qualifiedId} base`),
    mediaType: value.mediaType,
    executable: false,
  };
}

function parseManifestItem(qualifiedId: string, value: unknown): ProjectManifestItem {
  const identity = QUALIFIED_ID_PATTERN.exec(qualifiedId);
  if (identity === null || !isRecord(value)) {
    throw vendorError(
      `Installed item ${qualifiedId} is invalid.`,
      "VENDOR_MANIFEST_INVALID",
      PROJECT_MANIFEST,
    );
  }
  const registry = identity[1]!;
  const itemId = identity[2]!;
  if (
    value.registry !== registry ||
    value.itemId !== itemId ||
    typeof value.kind !== "string" ||
    typeof value.resolved !== "string" ||
    !SEMVER_PATTERN.test(value.resolved) ||
    typeof value.direct !== "boolean" ||
    value.mode !== "source" ||
    !isRecord(value.payload) ||
    !Array.isArray(value.files) ||
    !Array.isArray(value.registryDependencies) ||
    value.registryDependencies.some(
      (dependency) => typeof dependency !== "string" || !QUALIFIED_ID_PATTERN.test(dependency),
    ) ||
    typeof value.contractVersion !== "string" ||
    !SEMVER_PATTERN.test(value.contractVersion)
  ) {
    throw vendorError(
      `Installed item ${qualifiedId} has unsupported provenance.`,
      "VENDOR_MANIFEST_INVALID",
      PROJECT_MANIFEST,
    );
  }
  if (registry !== "official") {
    throw vendorError(
      `Installed item ${qualifiedId} requires registry-specific immutable acquisition support.`,
      "VENDOR_REGISTRY_UNSUPPORTED",
      PROJECT_MANIFEST,
    );
  }
  if (value.resolved !== UNRELEASED_VERSION) {
    throw vendorError(
      `Installed item ${qualifiedId} requires its published release manifest; none may be fabricated from local state.`,
      "VENDOR_RELEASE_ARTIFACT_REQUIRED",
      PROJECT_MANIFEST,
    );
  }
  const payloadUrl = secureDeclaredUrl(value.payload.url, `${qualifiedId} payload origin`);
  if (!payloadUrl.startsWith(`${OFFICIAL_REGISTRY_ORIGIN}/releases/${UNRELEASED_VERSION}/items/`)) {
    throw vendorError(
      `Installed item ${qualifiedId} has an unexpected payload origin.`,
      "VENDOR_ORIGIN_INVALID",
      PROJECT_MANIFEST,
    );
  }
  const files = value.files.map((file) => parseManifestFile(file, qualifiedId));
  if (files.length > 2048) {
    throw vendorError(
      `Installed item ${qualifiedId} exceeds the file bound.`,
      "VENDOR_MANIFEST_INVALID",
      PROJECT_MANIFEST,
    );
  }
  return {
    qualifiedId,
    registry,
    itemId,
    kind: value.kind,
    resolved: UNRELEASED_VERSION,
    direct: value.direct,
    mode: "source",
    payload: {
      url: payloadUrl,
      digest: parseDigest(value.payload.digest, `${qualifiedId} payload`),
    },
    files,
    registryDependencies: portableSort(value.registryDependencies as string[]),
    contractVersion: value.contractVersion,
  };
}

function readProjectState(projectRoot: string): ProjectState {
  const root = validatedProjectRoot(projectRoot);
  const configBytes = readProjectBytes(root, PROJECT_CONFIG, "Mergora config", MAX_JSON_BYTES);
  const manifestBytes = readProjectBytes(
    root,
    PROJECT_MANIFEST,
    "Mergora provenance manifest",
    MAX_JSON_BYTES,
  );
  const config = parseJson(configBytes!, PROJECT_CONFIG);
  const manifest = parseJson(manifestBytes!, PROJECT_MANIFEST);
  if (
    !isRecord(config) ||
    !isRecord(manifest) ||
    manifest.$schema !== MANIFEST_SCHEMA ||
    manifest.schemaVersion !== 1 ||
    !isRecord(manifest.items) ||
    Object.keys(manifest.items).length > MAX_ITEMS
  ) {
    throw vendorError(
      "Vendoring requires the supported committed v1 provenance manifest.",
      "VENDOR_MANIFEST_INVALID",
      PROJECT_MANIFEST,
    );
  }
  const entries = Object.entries(manifest.items)
    .sort(([left], [right]) => compareText(left, right))
    .map(([id, item]) => [id, parseManifestItem(id, item)] as const);
  const items = new Map(entries);
  for (const item of items.values()) {
    for (const dependency of item.registryDependencies) {
      if (!items.has(dependency)) {
        throw vendorError(
          `Installed dependency ${dependency} required by ${item.qualifiedId} is missing.`,
          "VENDOR_GRAPH_INVALID",
          PROJECT_MANIFEST,
        );
      }
    }
  }
  return {
    root,
    configDigest: sha256(canonicalJson(config)),
    manifestDigest: sha256(canonicalJson(manifest)),
    items,
  };
}

function requestedItems(
  project: ProjectState,
  options: VendorOptions,
): { readonly mode: "all-installed" | "items"; readonly requested: readonly string[] } {
  const provided = options.itemIds ?? [];
  if (options.allInstalled === true && provided.length > 0) {
    throw vendorError(
      "Use either item selectors or --all-installed, not both.",
      "VENDOR_INVALID_OPTION",
    );
  }
  if (options.allInstalled !== true && provided.length === 0) {
    throw vendorError(
      "Vendor requires one or more installed items or --all-installed.",
      "VENDOR_INVALID_OPTION",
    );
  }
  if (project.items.size === 0) {
    throw vendorError(
      "The project has no installed items to vendor.",
      "VENDOR_ITEM_MISSING",
      PROJECT_MANIFEST,
    );
  }
  if (options.allInstalled === true) {
    return { mode: "all-installed", requested: portableSort([...project.items.keys()]) };
  }
  const resolved = provided.map((selector) => {
    const normalized = selector.trim().normalize("NFC");
    let matches: readonly string[];
    if (QUALIFIED_ID_PATTERN.test(normalized)) {
      matches = project.items.has(normalized) ? [normalized] : [];
    } else if (ID_PATTERN.test(normalized)) {
      matches = [...project.items.values()]
        .filter(({ itemId }) => itemId === normalized)
        .map(({ qualifiedId }) => qualifiedId);
    } else {
      throw vendorError(
        `Vendor selector ${JSON.stringify(selector)} is invalid.`,
        "VENDOR_INVALID_OPTION",
      );
    }
    if (matches.length === 0) {
      throw vendorError(
        `Vendor item ${JSON.stringify(selector)} is not installed.`,
        "VENDOR_ITEM_MISSING",
        PROJECT_MANIFEST,
      );
    }
    if (matches.length > 1) {
      throw vendorError(
        `Vendor item ${JSON.stringify(selector)} is ambiguous; qualify its registry.`,
        "VENDOR_INVALID_OPTION",
      );
    }
    return matches[0]!;
  });
  return { mode: "items", requested: portableSort([...new Set(resolved)]) };
}

function selectedClosure(
  project: ProjectState,
  requested: readonly string[],
): readonly ProjectManifestItem[] {
  const state = new Map<string, "visiting" | "visited">();
  const result: ProjectManifestItem[] = [];
  const visit = (id: string): void => {
    const current = state.get(id);
    if (current === "visited") return;
    if (current === "visiting") {
      throw vendorError(
        `Installed dependency cycle includes ${id}.`,
        "VENDOR_GRAPH_INVALID",
        PROJECT_MANIFEST,
      );
    }
    const item = project.items.get(id);
    if (item === undefined) {
      throw vendorError(
        `Installed dependency ${id} is missing.`,
        "VENDOR_GRAPH_INVALID",
        PROJECT_MANIFEST,
      );
    }
    state.set(id, "visiting");
    for (const dependency of item.registryDependencies) visit(dependency);
    state.set(id, "visited");
    result.push(item);
  };
  for (const id of requested) visit(id);
  return result;
}

function registryRoot(options: RegistryDataOptions): string {
  if (options.registryDirectory !== undefined) return resolve(options.registryDirectory);
  const moduleDirectory = dirname(fileURLToPath(import.meta.url));
  const bundled = resolve(moduleDirectory, "registry");
  if (existsSync(bundled)) return bundled;
  const adjacentBuild = resolve(moduleDirectory, "../dist/registry");
  if (existsSync(adjacentBuild)) return adjacentBuild;
  return resolve(moduleDirectory, "../../../registry/generated");
}

function itemPayloadBytes(item: ProjectManifestItem, options: VendorOptions): Buffer {
  const source = loadSourceItem(item.itemId, options);
  if (source.payloadDigest !== item.payload.digest) {
    throw vendorError(
      `Current bundled payload for ${item.qualifiedId} does not match installed provenance.`,
      "VENDOR_PAYLOAD_MISMATCH",
      PROJECT_MANIFEST,
    );
  }
  const root = registryRoot(options);
  const nested = resolve(root, "native-source-items");
  const directory = existsSync(nested) ? nested : resolve(root, "items");
  const path = resolveInside(directory, `${item.itemId}.json`, "Bundled payload path");
  const raw = safeReadAbsolute(path, `Bundled payload ${item.itemId}`, MAX_JSON_BYTES);
  const value = parseJson(raw, `Bundled payload ${item.itemId}`);
  const bytes = canonicalBytes(value);
  if (sha256(bytes) !== item.payload.digest) {
    throw vendorError(
      `Bundled payload ${item.itemId} failed canonical digest validation.`,
      "VENDOR_PAYLOAD_MISMATCH",
    );
  }
  assertUnreleasedPayload(value, item);
  return bytes;
}

function assertUnreleasedPayload(value: unknown, item: ProjectManifestItem): void {
  if (
    !isRecord(value) ||
    value.schemaVersion !== 1 ||
    value.artifactKind !== "unreleased-native-source-item" ||
    value.publicationStatus !== "unreleased" ||
    value.release !== null ||
    value.itemId !== item.itemId ||
    !Array.isArray(value.files) ||
    !Array.isArray(value.registryDependencies) ||
    value.registryDependencies.some((dependency) => typeof dependency !== "string")
  ) {
    throw vendorError(
      `Bundled payload ${item.itemId} is not an unreleased native item.`,
      "VENDOR_PAYLOAD_SCHEMA_INVALID",
    );
  }
  for (const forbidden of [
    "command",
    "commands",
    "hook",
    "hooks",
    "postinstall",
    "preinstall",
    "scripts",
  ]) {
    if (Object.hasOwn(value, forbidden)) {
      throw vendorError(
        `Bundled payload ${item.itemId} contains forbidden executable metadata.`,
        "VENDOR_EXECUTABLE_METADATA",
      );
    }
  }
  assertNoSensitiveMaterial(value, `Bundled payload ${item.itemId}`);
  for (const file of value.files) {
    if (
      !isRecord(file) ||
      typeof file.logicalPath !== "string" ||
      typeof file.targetPath !== "string" ||
      typeof file.content !== "string" ||
      typeof file.mediaType !== "string" ||
      file.executable !== false
    ) {
      throw vendorError(
        `Bundled payload ${item.itemId} contains an unsafe file.`,
        "VENDOR_PAYLOAD_SCHEMA_INVALID",
      );
    }
    assertPortableRelativePath(file.logicalPath, "Payload logical path");
    assertPortableRelativePath(file.targetPath, "Payload target path");
  }
  const dependencies = portableSort(value.registryDependencies as string[]).map(
    (dependency) => `official:${dependency}`,
  );
  if (canonicalJson(dependencies) !== canonicalJson(item.registryDependencies)) {
    throw vendorError(
      `Bundled payload ${item.itemId} dependency graph differs from installed provenance.`,
      "VENDOR_GRAPH_INVALID",
    );
  }
}

function baseArtifactPath(digest: Digest): string {
  const hexadecimal = digest.slice("sha256:".length);
  return `blobs/sha256/${hexadecimal.slice(0, 2)}/${hexadecimal.slice(2)}.blob`;
}

function projectBasePath(digest: Digest): string {
  const hexadecimal = digest.slice("sha256:".length);
  return `.mergora/bases/sha256/${hexadecimal.slice(0, 2)}/${hexadecimal.slice(2)}.blob`;
}

function schemaDirectory(project: ProjectState, options: VendorOptions): string {
  const projectSchemas = resolve(project.root, ".mergora/schemas");
  const generatedSibling = resolve(registryRoot(options), "../schemas");
  const selected =
    options.schemaDirectory === undefined
      ? existsSync(projectSchemas)
        ? projectSchemas
        : generatedSibling
      : resolve(options.schemaDirectory);
  let metadata;
  try {
    metadata = lstatSync(selected);
  } catch {
    metadata = null;
  }
  if (metadata === null || metadata.isSymbolicLink() || !metadata.isDirectory()) {
    throw vendorError(
      "A verified local schema snapshot is required; vendoring never downloads or invents one.",
      "VENDOR_SCHEMA_SNAPSHOT_MISSING",
    );
  }
  return selected;
}

function schemaArtifacts(
  project: ProjectState,
  options: VendorOptions,
): readonly {
  readonly id: string;
  readonly artifact: string;
  readonly digest: Digest;
  readonly content: Buffer;
}[] {
  const directory = schemaDirectory(project, options);
  const entries = readdirSync(directory, { withFileTypes: true });
  if (
    entries.some(
      (entry) =>
        entry.isSymbolicLink() ||
        !entry.isFile() ||
        (!entry.name.endsWith(".json") &&
          !entry.name.endsWith(".ts") &&
          !entry.name.endsWith(".md")),
    )
  ) {
    throw vendorError(
      "Schema snapshot contains an unsafe entry.",
      "VENDOR_SCHEMA_SNAPSHOT_INVALID",
    );
  }
  const names = entries
    .filter((entry) => entry.isFile() && entry.name.endsWith(".json"))
    .map(({ name }) => name)
    .sort(compareText);
  if (names.length === 0 || names.length > MAX_SCHEMAS) {
    throw vendorError(
      "Schema snapshot count is outside the supported bound.",
      "VENDOR_SCHEMA_SNAPSHOT_INVALID",
    );
  }
  const result = names.map((name) => {
    assertPortableRelativePath(name, "Schema filename");
    const raw = safeReadAbsolute(resolve(directory, name), `Schema ${name}`, MAX_JSON_BYTES);
    const value = parseJson(raw, `Schema ${name}`);
    if (
      !isRecord(value) ||
      typeof value.$id !== "string" ||
      value.$schema !== "https://json-schema.org/draft/2020-12/schema"
    ) {
      throw vendorError(
        `Schema ${name} has no JSON Schema identity.`,
        "VENDOR_SCHEMA_SNAPSHOT_INVALID",
      );
    }
    secureDeclaredUrl(value.$id, `Schema ${name} identity`);
    const content = canonicalBytes(value);
    return { id: value.$id, artifact: `schemas/${name}`, digest: sha256(content), content };
  });
  const namesPresent = new Set(result.map(({ artifact }) => artifact.slice("schemas/".length)));
  for (const required of [
    "common-v1.schema.json",
    "manifest-v1.schema.json",
    "vendor-manifest-v1.schema.json",
  ]) {
    if (!namesPresent.has(required)) {
      throw vendorError(
        `Schema snapshot is missing ${required}.`,
        "VENDOR_SCHEMA_SNAPSHOT_INVALID",
      );
    }
  }
  const ids = result.map(({ id }) => id);
  if (new Set(ids).size !== ids.length) {
    throw vendorError(
      "Schema snapshot repeats a schema identity.",
      "VENDOR_SCHEMA_SNAPSHOT_INVALID",
    );
  }
  for (const schema of result) {
    const value = parseJson(schema.content, schema.artifact);
    for (const reference of collectSchemaReferences(value)) {
      if (reference.startsWith("#")) continue;
      const document = reference.split("#", 1)[0]!;
      if (/^https:/u.test(document)) {
        if (!ids.includes(document)) {
          throw vendorError(
            `Schema ${schema.artifact} references an unbundled schema.`,
            "VENDOR_SCHEMA_REFERENCE_MISSING",
          );
        }
      } else if (!namesPresent.has(document)) {
        throw vendorError(
          `Schema ${schema.artifact} references missing ${document}.`,
          "VENDOR_SCHEMA_REFERENCE_MISSING",
        );
      }
    }
  }
  return result;
}

function collectSchemaReferences(value: unknown, result: string[] = []): readonly string[] {
  if (Array.isArray(value)) {
    for (const entry of value) collectSchemaReferences(entry, result);
  } else if (isRecord(value)) {
    for (const [key, entry] of Object.entries(value)) {
      if (key === "$ref" && typeof entry === "string") result.push(entry);
      else collectSchemaReferences(entry, result);
    }
  }
  return result;
}

function licenseBytes(options: VendorOptions): Buffer {
  const starts = [registryRoot(options), dirname(fileURLToPath(import.meta.url))];
  const visited = new Set<string>();
  for (const start of starts) {
    let current = start;
    for (let depth = 0; depth < 6; depth += 1) {
      if (!visited.has(current)) {
        visited.add(current);
        const packagePath = resolve(current, "package.json");
        const licensePath = resolve(current, "LICENSE");
        if (existsSync(packagePath) && existsSync(licensePath)) {
          const packageValue = parseJson(
            safeReadAbsolute(packagePath, "Package metadata", MAX_JSON_BYTES),
            "Package metadata",
          );
          if (isRecord(packageValue) && packageValue.license === LICENSE_SPDX) {
            const content = safeReadAbsolute(licensePath, "MIT license", 1024 * 1024);
            if (!content.toString("utf8").includes("MIT License")) {
              throw vendorError("Declared MIT license text is invalid.", "VENDOR_LICENSE_INVALID");
            }
            return content;
          }
        }
      }
      const parent = dirname(current);
      if (parent === current) break;
      current = parent;
    }
  }
  throw vendorError(
    "The bundled registry has no locally verifiable MIT license artifact.",
    "VENDOR_LICENSE_MISSING",
  );
}

function contractDirectory(options: VendorOptions): string {
  return options.contractDirectory ?? ".mergora/contracts";
}

function contractSnapshot(
  project: ProjectState,
  item: ProjectManifestItem,
  options: VendorOptions,
): {
  readonly id: string;
  readonly contractVersion: string;
  readonly content: Buffer;
  readonly digest: Digest;
} | null {
  const directory = contractDirectory(options);
  assertPortableRelativePath(directory, "Contract snapshot directory");
  const target = `${directory}/${item.registry}--${item.itemId}.json`;
  const bytes = readProjectBytes(
    project.root,
    target,
    `Contract snapshot for ${item.qualifiedId}`,
    MAX_JSON_BYTES,
    true,
  );
  if (bytes === null) return null;
  const value = parseJson(bytes, target);
  assertNoSensitiveMaterial(value, `Contract snapshot for ${item.qualifiedId}`);
  const definitions = Array.isArray(value) ? value : [value];
  if (definitions.length === 0 || definitions.length > 256) {
    throw vendorError(
      `Contract snapshot for ${item.qualifiedId} is empty or oversized.`,
      "VENDOR_CONTRACT_INVALID",
      target,
    );
  }
  const ids: string[] = [];
  for (const definition of definitions) {
    try {
      const parsed = parseContractDefinitionV1(definition);
      if (
        parsed.registryId !== item.registry ||
        parsed.itemId !== item.itemId ||
        parsed.payloadDigest !== item.payload.digest ||
        parsed.contractVersion !== item.contractVersion
      ) {
        throw vendorError(
          `Contract snapshot for ${item.qualifiedId} is not bound to installed provenance.`,
          "VENDOR_CONTRACT_BINDING_MISMATCH",
          target,
        );
      }
      ids.push(parsed.contractId);
    } catch (error) {
      if (error instanceof CliError) throw error;
      if (error instanceof ContractDefinitionError) {
        throw vendorError(
          `Contract snapshot for ${item.qualifiedId} failed its v1 schema.`,
          "VENDOR_CONTRACT_INVALID",
          target,
        );
      }
      throw error;
    }
  }
  if (new Set(ids).size !== ids.length) {
    throw vendorError(
      `Contract snapshot for ${item.qualifiedId} repeats a Contract identity.`,
      "VENDOR_CONTRACT_INVALID",
      target,
    );
  }
  const content = canonicalBytes(value);
  return {
    id: ids.length === 1 ? ids[0]! : `${item.itemId}-contracts`,
    contractVersion: item.contractVersion,
    content,
    digest: sha256(content),
  };
}

function addArtifact(
  artifacts: Map<string, ArtifactBytes>,
  artifact: string,
  content: Buffer,
  kind: ArtifactKind,
): ArtifactBytes {
  assertPortableRelativePath(artifact, "Vendor artifact path");
  if (content.byteLength > MAX_ARTIFACT_BYTES) {
    throw vendorError(
      `Vendor artifact ${artifact} exceeds the byte bound.`,
      "VENDOR_ARTIFACT_OVERSIZE",
    );
  }
  const existing = artifacts.get(artifact);
  if (existing !== undefined) {
    if (!existing.content.equals(content) || existing.kind !== kind) {
      throw vendorError(
        `Vendor artifact ${artifact} has conflicting sources.`,
        "VENDOR_ARTIFACT_COLLISION",
      );
    }
    return existing;
  }
  const record: ArtifactBytes = {
    artifact,
    bytes: content.byteLength,
    digest: sha256(content),
    kind,
    license: LICENSE_SPDX,
    content,
  };
  artifacts.set(artifact, record);
  return record;
}

function originIdentityDigest(): Digest {
  return sha256(
    canonicalJson({
      id: "official",
      protocol: "mergora-v1",
      origin: OFFICIAL_REGISTRY_ORIGIN,
      trust: "official",
    }),
  );
}

function assertManifestHygiene(value: unknown): void {
  const visit = (entry: unknown, key = ""): void => {
    if (Array.isArray(entry)) {
      for (const child of entry) visit(child);
      return;
    }
    if (isRecord(entry)) {
      for (const [childKey, child] of Object.entries(entry)) {
        if (
          /^(?:apiKey|auth|credential|password|secret|timestamp|createdAt|generatedAt)$/iu.test(
            childKey,
          )
        ) {
          throw vendorError(
            `Vendor manifest contains forbidden metadata key ${childKey}.`,
            "VENDOR_METADATA_UNSAFE",
          );
        }
        visit(child, childKey);
      }
      return;
    }
    if (typeof entry !== "string") return;
    if (/^(?:[A-Za-z]:[\\/]|\\\\|\/(?:home|Users|var|tmp|opt|etc)\/)/u.test(entry)) {
      throw vendorError(
        `Vendor manifest field ${key} contains an absolute machine path.`,
        "VENDOR_METADATA_UNSAFE",
      );
    }
    if (/^https?:/u.test(entry)) secureDeclaredUrl(entry, `Vendor manifest field ${key}`);
  };
  visit(value);
}

function assertNoSensitiveMaterial(value: unknown, label: string): void {
  const visit = (entry: unknown): void => {
    if (Array.isArray(entry)) {
      for (const child of entry) visit(child);
      return;
    }
    if (isRecord(entry)) {
      for (const child of Object.values(entry)) visit(child);
      return;
    }
    if (typeof entry !== "string") return;
    if (
      /-----BEGIN [A-Z ]*PRIVATE KEY-----/u.test(entry) ||
      /\bAKIA[0-9A-Z]{16}\b/u.test(entry) ||
      /\b(?:gh[pousr]_[A-Za-z0-9_]{30,}|npm_[A-Za-z0-9]{30,})\b/u.test(entry) ||
      /\bAuthorization\s*:\s*Bearer\s+\S+/iu.test(entry) ||
      /https?:\/\/[^/\s:@]+:[^@\s/]+@/iu.test(entry) ||
      /^(?:[A-Za-z]:[\\/]|\\\\|\/(?:home|Users|var|tmp|opt|etc)\/)/u.test(entry)
    ) {
      throw vendorError(
        `${label} contains credential-like material or an absolute machine path.`,
        "VENDOR_METADATA_UNSAFE",
      );
    }
  };
  visit(value);
}

function vendorGraph(
  selected: readonly ProjectManifestItem[],
  requested: ReadonlySet<string>,
): unknown {
  return {
    schemaVersion: 1,
    format: GRAPH_FORMAT,
    nodes: selected.map((item) => ({
      id: item.qualifiedId,
      installedDirect: item.direct,
      selectedDirect: requested.has(item.qualifiedId),
      dependencies: item.registryDependencies,
    })),
  };
}

function sha256Sums(artifacts: readonly ArtifactBytes[]): Buffer {
  const lines = artifacts.map(
    ({ artifact, digest }) => `${digest.slice("sha256:".length)}  ${artifact}`,
  );
  return Buffer.from(`${lines.join("\n")}\n`);
}

function relativeVendorTarget(artifact: string): string {
  return `${VENDOR_ROOT}/${artifact}`;
}

function buildTargetBytes(
  project: ProjectState,
  options: VendorOptions,
  mode: "all-installed" | "items",
  requested: readonly string[],
  selected: readonly ProjectManifestItem[],
): {
  readonly targetBytes: ReadonlyMap<string, Buffer>;
  readonly manifest: VendorManifestV1;
  readonly artifacts: readonly ArtifactBytes[];
} {
  const artifacts = new Map<string, ArtifactBytes>();
  const license = addArtifact(artifacts, "licenses/MIT.txt", licenseBytes(options), "license");
  const graph = addArtifact(
    artifacts,
    "dependency-graph.json",
    canonicalBytes(vendorGraph(selected, new Set(requested))),
    "dependency-graph",
  );
  const schemaRecords = schemaArtifacts(project, options).map((schema) => {
    const artifact = addArtifact(artifacts, schema.artifact, schema.content, "schema");
    return {
      id: schema.id,
      artifact: artifact.artifact,
      digest: artifact.digest,
      license: LICENSE_SPDX,
    };
  });
  const contractRecords: VendorManifestV1["contracts"][number][] = [];
  const missingContracts: string[] = [];
  const itemContracts = new Map<string, VendorItemReference["contract"]>();
  for (const item of selected) {
    const snapshot = contractSnapshot(project, item, options);
    if (snapshot === null) {
      missingContracts.push(item.qualifiedId);
      itemContracts.set(item.qualifiedId, null);
      continue;
    }
    if (contractRecords.length >= MAX_CONTRACTS) {
      throw vendorError(
        "Contract snapshot count exceeds the supported bound.",
        "VENDOR_CONTRACT_INVALID",
      );
    }
    const artifact = addArtifact(
      artifacts,
      `contracts/${item.registry}/${item.itemId}.json`,
      snapshot.content,
      "contract",
    );
    const reference = {
      artifact: artifact.artifact,
      digest: artifact.digest,
      contractVersion: snapshot.contractVersion,
      license: LICENSE_SPDX,
    } as const;
    itemContracts.set(item.qualifiedId, reference);
    contractRecords.push({
      id: snapshot.id,
      item: item.qualifiedId,
      contractVersion: snapshot.contractVersion,
      artifact: artifact.artifact,
      digest: artifact.digest,
      license: LICENSE_SPDX,
    });
  }
  const itemRecords: VendorItemReference[] = [];
  for (const item of selected) {
    const payload = addArtifact(
      artifacts,
      `items/${item.registry}/${item.itemId}.json`,
      itemPayloadBytes(item, options),
      "item-payload",
    );
    const bases = item.files.map((file) => {
      const source = readProjectBytes(
        project.root,
        projectBasePath(file.base),
        `Immutable base for ${item.qualifiedId}`,
        MAX_ARTIFACT_BYTES,
      )!;
      if (sha256(source) !== file.base) {
        throw vendorError(
          `Immutable base ${file.base} for ${item.qualifiedId} is corrupt.`,
          "VENDOR_BASE_MISMATCH",
          projectBasePath(file.base),
        );
      }
      const artifact = addArtifact(artifacts, baseArtifactPath(file.base), source, "base");
      return {
        logicalPath: file.logicalPath,
        artifact: artifact.artifact,
        digest: artifact.digest,
        mediaType: file.mediaType,
        executable: false,
        license: LICENSE_SPDX,
      } as const;
    });
    itemRecords.push({
      id: item.qualifiedId,
      version: UNRELEASED_VERSION,
      installedDirect: item.direct,
      payload: {
        artifact: payload.artifact,
        declaredOrigin: item.payload.url,
        originState: "declared-unpublished",
        digest: payload.digest,
        license: LICENSE_SPDX,
      },
      bases,
      registryDependencies: item.registryDependencies,
      contract: itemContracts.get(item.qualifiedId) ?? null,
      passport: null,
    });
  }
  const artifactRecords = [...artifacts.values()].sort((left, right) =>
    compareText(left.artifact, right.artifact),
  );
  if (artifactRecords.length > MAX_BUNDLE_FILES - 2) {
    throw vendorError(
      "Vendor artifact count exceeds the supported bound.",
      "VENDOR_ARTIFACT_OVERSIZE",
    );
  }
  const artifactBytes = artifactRecords.reduce((total, artifact) => total + artifact.bytes, 0);
  if (artifactBytes > MAX_BUNDLE_BYTES) {
    throw vendorError(
      "Vendor bundle exceeds the supported operation byte limit.",
      "VENDOR_ARTIFACT_OVERSIZE",
    );
  }
  const sums = sha256Sums(artifactRecords);
  const manifest: VendorManifestV1 = {
    schemaVersion: 1,
    format: VENDOR_FORMAT,
    provenance: {
      state: "unreleased-local",
      version: UNRELEASED_VERSION,
      projectManifestDigest: project.manifestDigest,
      officialRelease: null,
      releaseManifest: null,
      claim: "No official release, Stable status, or Quality Passport is claimed.",
    },
    registry: {
      id: "official",
      protocol: "mergora-v1",
      origin: OFFICIAL_REGISTRY_ORIGIN,
      identityDigest: originIdentityDigest(),
      trust: "official",
      acquisition: "verified-local",
    },
    selection: { mode, requested, resolved: selected.map(({ qualifiedId }) => qualifiedId) },
    license: { spdx: LICENSE_SPDX, artifact: "licenses/MIT.txt", digest: license.digest },
    dependencyGraph: { artifact: "dependency-graph.json", digest: graph.digest },
    items: itemRecords,
    schemas: schemaRecords,
    contracts: contractRecords.sort((left, right) => compareText(left.item, right.item)),
    passports: [],
    artifacts: artifactRecords.map(({ content: _content, ...artifact }) => artifact),
    omissions: {
      releaseManifest: "not-published",
      contracts: portableSort(missingContracts),
      passports: selected.map(({ qualifiedId }) => qualifiedId),
      npmTarballs: "not-requested",
    },
    sha256Sums: { artifact: "SHA256SUMS", digest: sha256(sums) },
  };
  assertManifestHygiene(manifest);
  const targetBytes = new Map<string, Buffer>();
  for (const artifact of artifactRecords) {
    targetBytes.set(relativeVendorTarget(artifact.artifact), artifact.content);
  }
  targetBytes.set(VENDOR_SUMS, sums);
  targetBytes.set(VENDOR_MANIFEST, canonicalBytes(manifest));
  const totalOutputBytes = [...targetBytes.values()].reduce(
    (total, content) => total + content.byteLength,
    0,
  );
  if (
    targetBytes.get(VENDOR_MANIFEST)!.byteLength > MAX_JSON_BYTES ||
    sums.byteLength > MAX_JSON_BYTES ||
    totalOutputBytes > MAX_BUNDLE_BYTES
  ) {
    throw vendorError(
      "Vendor manifest, checksum inventory, or total bundle exceeds its byte bound.",
      "VENDOR_ARTIFACT_OVERSIZE",
    );
  }
  return { targetBytes, manifest, artifacts: artifactRecords };
}

function enumerateBundleFiles(root: string, optional = false): readonly string[] {
  assertNoSymlinkAncestors(root, VENDOR_ROOT);
  const directory = resolveInside(root, VENDOR_ROOT, "Vendor root");
  if (!existsSync(directory)) {
    if (optional) return [];
    throw vendorError("Vendor bundle is missing.", "VENDOR_BUNDLE_MISSING", VENDOR_ROOT);
  }
  const metadata = lstatSync(directory);
  if (metadata.isSymbolicLink() || !metadata.isDirectory()) {
    throw vendorError("Vendor root is not a safe directory.", "VENDOR_PATH_UNSAFE", VENDOR_ROOT);
  }
  const files: string[] = [];
  const portableFiles = new Set<string>();
  const walk = (absolute: string, relative: string, depth: number): void => {
    if (depth > 12)
      throw vendorError(
        "Vendor bundle directory depth exceeds the bound.",
        "VENDOR_PATH_UNSAFE",
        VENDOR_ROOT,
      );
    for (const entry of readdirSync(absolute, { withFileTypes: true })) {
      const childRelative = relative === "" ? entry.name : `${relative}/${entry.name}`;
      assertPortableRelativePath(childRelative, "Vendor artifact path");
      const child = resolve(absolute, entry.name);
      const childMetadata = lstatSync(child);
      if (entry.isSymbolicLink() || childMetadata.isSymbolicLink()) {
        throw vendorError(
          `Vendor artifact ${childRelative} is a symbolic link.`,
          "VENDOR_PATH_UNSAFE",
          relativeVendorTarget(childRelative),
        );
      }
      if (entry.isDirectory() && childMetadata.isDirectory()) {
        walk(child, childRelative, depth + 1);
      } else if (entry.isFile() && childMetadata.isFile()) {
        const portable = childRelative.normalize("NFC").toLocaleLowerCase("en-US");
        if (portableFiles.has(portable)) {
          throw vendorError(
            `Vendor artifact ${childRelative} has a portable path collision.`,
            "VENDOR_PATH_UNSAFE",
            relativeVendorTarget(childRelative),
          );
        }
        portableFiles.add(portable);
        files.push(childRelative);
        if (files.length > MAX_BUNDLE_FILES) {
          throw vendorError(
            "Vendor bundle file count exceeds the bound.",
            "VENDOR_ARTIFACT_OVERSIZE",
            VENDOR_ROOT,
          );
        }
      } else {
        throw vendorError(
          `Vendor artifact ${childRelative} is not a regular file.`,
          "VENDOR_PATH_UNSAFE",
          relativeVendorTarget(childRelative),
        );
      }
    }
  };
  walk(directory, "", 0);
  return files.sort(compareText);
}

function existingBundleFiles(root: string): readonly string[] {
  const files = enumerateBundleFiles(root, true);
  if (files.length === 0) return files;
  if (!files.includes("vendor-manifest.json")) {
    throw vendorError(
      "Existing vendor directory is partial and cannot be overwritten implicitly.",
      "VENDOR_TAMPERED",
      VENDOR_ROOT,
    );
  }
  verifyVendor({ projectRoot: root });
  return files;
}

function currentDigest(root: string, target: string): Digest | null {
  const bytes = readProjectBytes(root, target, `Vendor target ${target}`, MAX_ARTIFACT_BYTES, true);
  return bytes === null ? null : sha256(bytes);
}

function mediaType(target: string): string {
  if (target.endsWith(".json")) return "application/json";
  if (target.endsWith(".txt") || target.endsWith("SHA256SUMS")) return "text/plain";
  return "application/octet-stream";
}

function ownerFor(target: string): string {
  const match =
    /^\.mergora\/vendor\/v1\/(?:items|contracts)\/([a-z0-9-]+)\/([a-z0-9-]+)\.json$/u.exec(target);
  return match === null ? "vendor:bundle" : `${match[1]}:${match[2]}`;
}

function finalizeVendorPlan(value: Omit<VendorPlan, "planDigest">): VendorPlan {
  return { ...value, planDigest: sha256(canonicalJson(value)) };
}

function buildBundle(options: VendorOptions): BuiltBundle {
  const project = readProjectState(options.projectRoot);
  const selection = requestedItems(project, options);
  const selected = selectedClosure(project, selection.requested);
  const built = buildTargetBytes(project, options, selection.mode, selection.requested, selected);
  const existing = existingBundleFiles(project.root);
  const expectedRelative = new Set(
    [...built.targetBytes.keys()].map((target) => target.slice(`${VENDOR_ROOT}/`.length)),
  );
  const stale = existing.filter((target) => !expectedRelative.has(target));
  if (stale.length > 0) {
    throw vendorError(
      `Existing valid vendor selection contains stale artifact ${stale[0]}; a shrinking replacement requires explicit cleanup.`,
      "VENDOR_REPLACEMENT_REQUIRES_CLEAN",
      relativeVendorTarget(stale[0]!),
    );
  }
  const operations: OperationPlanFile[] = [];
  const mutations: TransactionMutation[] = [];
  const observedTargets: Record<string, Digest | null> = {};
  for (const [target, content] of [...built.targetBytes.entries()].sort(([left], [right]) =>
    left.localeCompare(right, "en-US"),
  )) {
    const local = currentDigest(project.root, target);
    const proposed = sha256(content);
    observedTargets[target] = local;
    const unchanged = local === proposed;
    operations.push({
      operation: unchanged ? "no-op" : local === null ? "add" : "fast-forward",
      target,
      owner: ownerFor(target),
      base: local,
      local,
      remote: proposed,
      proposed,
      mediaType: mediaType(target),
      risk: "ordinary",
      reason: unchanged
        ? "The verified vendor artifact already matches the deterministic plan."
        : target === VENDOR_MANIFEST
          ? "Commit the canonical vendor manifest after every content artifact."
          : "Copy a digest-verified local artifact into the offline bundle.",
    });
    if (!unchanged) mutations.push({ target, content, beforeDigest: local });
  }
  if (mutations.length > 0) {
    const ordered = [...mutations].sort((left, right) =>
      left.target.localeCompare(right.target, "en-US"),
    );
    if (ordered.at(-1)?.target !== VENDOR_MANIFEST) {
      throw vendorError(
        "Vendor manifest cannot be committed last by the transaction plan.",
        "VENDOR_PLAN_INVALID",
      );
    }
  }
  const manifestBytes = built.targetBytes.get(VENDOR_MANIFEST)!;
  const sumsBytes = built.targetBytes.get(VENDOR_SUMS)!;
  const plan = finalizeVendorPlan({
    schemaVersion: 1,
    command: "vendor",
    cliVersion: CLI_VERSION,
    projectRoot: ".",
    configDigest: project.configDigest,
    manifestPreconditionDigest: project.manifestDigest,
    registries: [],
    items: selected.map((item) => ({
      id: item.qualifiedId,
      direct: selection.requested.includes(item.qualifiedId),
      requested: `=${item.resolved}`,
      fromVersion: item.resolved,
      toVersion: item.resolved,
      mode: "source",
    })),
    fileOperations: operations,
    dependencyChanges: [],
    structuredPatches: [],
    migrations: [],
    contractChanges: [],
    warnings: [
      "This is an unreleased-local offline snapshot. It is not an official release mirror and makes no Stable or Quality Passport claim.",
      "No network source, mutable cache entry, npm tarball, release manifest, or fabricated evidence is included.",
    ],
    consentRequirements: [],
    conflicts: [],
    estimatedBytes: {
      download: 0,
      write: mutations.reduce((total, mutation) => total + (mutation.content?.byteLength ?? 0), 0),
    },
    validationSuite: ["schema", "digest", "path", "collision", "ownership", "dependency"],
    rollbackAvailable: true,
    vendor: {
      outputRoot: VENDOR_ROOT,
      provenanceState: "unreleased-local",
      selectionMode: selection.mode,
      selectedItems: selected.map(({ qualifiedId }) => qualifiedId),
      vendorManifestDigest: sha256(manifestBytes),
      sha256SumsDigest: sha256(sumsBytes),
      networkUsed: false,
    },
  });
  return {
    plan,
    mutations,
    observedTargets,
    targetBytes: built.targetBytes,
    selectedItems: selected.map(({ qualifiedId }) => qualifiedId),
    root: project.root,
  };
}

export function planVendor(options: VendorOptions): VendorPlan {
  return buildBundle(options).plan;
}

/**
 * Applies an already-reviewed plan. The digest is mandatory even for callers
 * using the API directly; a fresh plan must be reviewed after any input change.
 */
export function applyVendor(options: VendorOptions, expectedPlanDigest: string): VendorResult {
  const built = buildBundle(options);
  if (expectedPlanDigest !== built.plan.planDigest) {
    throw new CliError("Vendor plan changed before apply; review a fresh plan.", {
      code: "PLAN_PRECONDITION_STALE",
      exitCode: 8,
    });
  }
  const transaction = executeTransaction({
    root: built.root,
    plan: built.plan,
    mutations: built.mutations,
    observedTargets: built.observedTargets,
    packageManagerRequired: false,
    offline: true,
    commandArguments: options.commandArguments,
  });
  return {
    mode: "offline-vendor",
    root: VENDOR_ROOT,
    items: built.selectedItems,
    planDigest: built.plan.planDigest,
    transaction,
    verification: verifyVendor({ projectRoot: built.root }),
  };
}

function parseVendorManifest(bytes: Buffer): VendorManifestV1 {
  const value = parseJson(bytes, "Vendor manifest");
  if (!bytes.equals(canonicalBytes(value)) || !isRecord(value)) {
    throw vendorError(
      "Vendor manifest is not canonical JSON.",
      "VENDOR_SCHEMA_INVALID",
      VENDOR_MANIFEST,
    );
  }
  if (
    !exactKeys(value, [
      "schemaVersion",
      "format",
      "provenance",
      "registry",
      "selection",
      "license",
      "dependencyGraph",
      "items",
      "schemas",
      "contracts",
      "passports",
      "artifacts",
      "omissions",
      "sha256Sums",
    ]) ||
    value.schemaVersion !== 1 ||
    value.format !== VENDOR_FORMAT ||
    !isRecord(value.provenance) ||
    !exactKeys(value.provenance, [
      "state",
      "version",
      "projectManifestDigest",
      "officialRelease",
      "releaseManifest",
      "claim",
    ]) ||
    value.provenance.state !== "unreleased-local" ||
    value.provenance.version !== UNRELEASED_VERSION ||
    value.provenance.officialRelease !== null ||
    value.provenance.releaseManifest !== null ||
    value.provenance.claim !==
      "No official release, Stable status, or Quality Passport is claimed." ||
    !DIGEST_PATTERN.test(String(value.provenance.projectManifestDigest)) ||
    !isRecord(value.registry) ||
    !exactKeys(value.registry, [
      "id",
      "protocol",
      "origin",
      "identityDigest",
      "trust",
      "acquisition",
    ]) ||
    value.registry.id !== "official" ||
    value.registry.protocol !== "mergora-v1" ||
    value.registry.origin !== OFFICIAL_REGISTRY_ORIGIN ||
    value.registry.identityDigest !== originIdentityDigest() ||
    value.registry.trust !== "official" ||
    value.registry.acquisition !== "verified-local" ||
    !Array.isArray(value.items) ||
    value.items.length === 0 ||
    value.items.length > MAX_ITEMS ||
    !Array.isArray(value.schemas) ||
    value.schemas.length === 0 ||
    value.schemas.length > MAX_SCHEMAS ||
    !Array.isArray(value.contracts) ||
    value.contracts.length > MAX_CONTRACTS ||
    !Array.isArray(value.passports) ||
    value.passports.length !== 0 ||
    !Array.isArray(value.artifacts) ||
    value.artifacts.length === 0 ||
    value.artifacts.length > MAX_BUNDLE_FILES - 2
  ) {
    throw vendorError(
      "Vendor manifest does not match the unreleased-local v1 contract.",
      "VENDOR_SCHEMA_INVALID",
      VENDOR_MANIFEST,
    );
  }
  assertManifestHygiene(value);
  return value as unknown as VendorManifestV1;
}

function parseArtifactInventory(
  manifest: VendorManifestV1,
): ReadonlyMap<string, VendorArtifactReference> {
  const result = new Map<string, VendorArtifactReference>();
  const portableArtifacts = new Set<string>();
  const kinds = new Set<ArtifactKind>([
    "base",
    "contract",
    "dependency-graph",
    "item-payload",
    "license",
    "schema",
  ]);
  for (const value of manifest.artifacts as readonly unknown[]) {
    if (
      !isRecord(value) ||
      !exactKeys(value, ["artifact", "bytes", "digest", "kind", "license"]) ||
      typeof value.artifact !== "string" ||
      !Number.isSafeInteger(value.bytes) ||
      (value.bytes as number) < 0 ||
      (value.bytes as number) > MAX_ARTIFACT_BYTES ||
      typeof value.digest !== "string" ||
      !DIGEST_PATTERN.test(value.digest) ||
      typeof value.kind !== "string" ||
      !kinds.has(value.kind as ArtifactKind) ||
      value.license !== LICENSE_SPDX
    ) {
      throw vendorError(
        "Vendor artifact inventory is invalid.",
        "VENDOR_SCHEMA_INVALID",
        VENDOR_MANIFEST,
      );
    }
    assertPortableRelativePath(value.artifact, "Vendor artifact path");
    if (
      value.artifact === "SHA256SUMS" ||
      value.artifact === "vendor-manifest.json" ||
      result.has(value.artifact)
    ) {
      throw vendorError(
        `Vendor artifact ${value.artifact} is duplicated or reserved.`,
        "VENDOR_SCHEMA_INVALID",
        VENDOR_MANIFEST,
      );
    }
    const portable = value.artifact.normalize("NFC").toLocaleLowerCase("en-US");
    if (portableArtifacts.has(portable)) {
      throw vendorError(
        `Vendor artifact ${value.artifact} has a portable path collision.`,
        "VENDOR_SCHEMA_INVALID",
        VENDOR_MANIFEST,
      );
    }
    portableArtifacts.add(portable);
    const digestHex = value.digest.slice("sha256:".length);
    const fixedPath =
      value.kind === "base"
        ? `blobs/sha256/${digestHex.slice(0, 2)}/${digestHex.slice(2)}.blob`
        : value.kind === "dependency-graph"
          ? "dependency-graph.json"
          : value.kind === "license"
            ? "licenses/MIT.txt"
            : null;
    if (
      (fixedPath !== null && value.artifact !== fixedPath) ||
      (value.kind === "item-payload" &&
        !/^items\/official\/[a-z0-9]+(?:-[a-z0-9]+)*\.json$/u.test(value.artifact)) ||
      (value.kind === "contract" &&
        !/^contracts\/official\/[a-z0-9]+(?:-[a-z0-9]+)*\.json$/u.test(value.artifact)) ||
      (value.kind === "schema" &&
        !/^schemas\/[a-z0-9]+(?:-[a-z0-9]+)*-v1\.schema\.json$/u.test(value.artifact))
    ) {
      throw vendorError(
        `Vendor artifact ${value.artifact} does not match its declared kind.`,
        "VENDOR_SCHEMA_INVALID",
        VENDOR_MANIFEST,
      );
    }
    result.set(value.artifact, value as unknown as VendorArtifactReference);
  }
  const ordered = [...result.keys()].sort(compareText);
  if (canonicalJson(ordered) !== canonicalJson([...result.keys()])) {
    throw vendorError(
      "Vendor artifact inventory is not canonically sorted.",
      "VENDOR_SCHEMA_INVALID",
      VENDOR_MANIFEST,
    );
  }
  return result;
}

function readBundleArtifact(root: string, artifact: string, maximum = MAX_ARTIFACT_BYTES): Buffer {
  return readProjectBytes(
    root,
    relativeVendorTarget(artifact),
    `Vendor artifact ${artifact}`,
    maximum,
  )!;
}

function verifyChecksums(
  root: string,
  manifest: VendorManifestV1,
  inventory: ReadonlyMap<string, VendorArtifactReference>,
): { readonly totalBytes: number; readonly contents: ReadonlyMap<string, Buffer> } {
  if (
    !isRecord(manifest.sha256Sums) ||
    !exactKeys(manifest.sha256Sums, ["artifact", "digest"]) ||
    manifest.sha256Sums.artifact !== "SHA256SUMS" ||
    !DIGEST_PATTERN.test(manifest.sha256Sums.digest)
  ) {
    throw vendorError(
      "Vendor checksum metadata is invalid.",
      "VENDOR_SCHEMA_INVALID",
      VENDOR_MANIFEST,
    );
  }
  const sums = readBundleArtifact(root, "SHA256SUMS", MAX_JSON_BYTES);
  if (sha256(sums) !== manifest.sha256Sums.digest) {
    throw vendorError(
      "SHA256SUMS digest does not match the vendor manifest.",
      "VENDOR_DIGEST_MISMATCH",
      VENDOR_SUMS,
    );
  }
  const text = sums.toString("utf8");
  if (!text.endsWith("\n") || text.includes("\r")) {
    throw vendorError(
      "SHA256SUMS is not canonical LF-delimited text.",
      "VENDOR_CHECKSUM_INVALID",
      VENDOR_SUMS,
    );
  }
  const lines = text.slice(0, -1).split("\n");
  const expectedLines = [...inventory.values()].map(
    ({ artifact, digest }) => `${digest.slice("sha256:".length)}  ${artifact}`,
  );
  if (canonicalJson(lines) !== canonicalJson(expectedLines)) {
    throw vendorError(
      "SHA256SUMS does not exactly match the artifact inventory.",
      "VENDOR_CHECKSUM_INVALID",
      VENDOR_SUMS,
    );
  }
  const contents = new Map<string, Buffer>();
  let totalBytes = sums.byteLength;
  for (const [artifact, expected] of inventory) {
    const bytes = readBundleArtifact(root, artifact);
    if (bytes.byteLength !== expected.bytes || sha256(bytes) !== expected.digest) {
      throw vendorError(
        `Vendor artifact ${artifact} failed digest validation.`,
        "VENDOR_DIGEST_MISMATCH",
        relativeVendorTarget(artifact),
      );
    }
    totalBytes += bytes.byteLength;
    if (totalBytes > MAX_BUNDLE_BYTES) {
      throw vendorError(
        "Vendor bundle exceeds the supported byte limit.",
        "VENDOR_ARTIFACT_OVERSIZE",
        VENDOR_ROOT,
      );
    }
    contents.set(artifact, bytes);
  }
  return { totalBytes, contents };
}

function artifactReference(
  inventory: ReadonlyMap<string, VendorArtifactReference>,
  artifact: unknown,
  digest: unknown,
  kind: ArtifactKind,
  label: string,
): VendorArtifactReference {
  if (typeof artifact !== "string" || typeof digest !== "string") {
    throw vendorError(
      `${label} artifact reference is invalid.`,
      "VENDOR_SCHEMA_INVALID",
      VENDOR_MANIFEST,
    );
  }
  const record = inventory.get(artifact);
  if (record === undefined || record.digest !== digest || record.kind !== kind) {
    throw vendorError(
      `${label} is not bound to the artifact inventory.`,
      "VENDOR_GRAPH_INVALID",
      VENDOR_MANIFEST,
    );
  }
  return record;
}

function verifySchemaArtifacts(
  manifest: VendorManifestV1,
  inventory: ReadonlyMap<string, VendorArtifactReference>,
  contents: ReadonlyMap<string, Buffer>,
): void {
  const ids = new Set<string>();
  const filenames = new Set<string>();
  for (const raw of manifest.schemas as readonly unknown[]) {
    if (
      !isRecord(raw) ||
      !exactKeys(raw, ["id", "artifact", "digest", "license"]) ||
      typeof raw.id !== "string" ||
      raw.license !== LICENSE_SPDX
    ) {
      throw vendorError(
        "Vendor schema reference is invalid.",
        "VENDOR_SCHEMA_INVALID",
        VENDOR_MANIFEST,
      );
    }
    secureDeclaredUrl(raw.id, "Vendor schema identity");
    const artifact = artifactReference(inventory, raw.artifact, raw.digest, "schema", "Schema");
    const value = parseJson(contents.get(artifact.artifact)!, artifact.artifact);
    if (
      !contents.get(artifact.artifact)!.equals(canonicalBytes(value)) ||
      !isRecord(value) ||
      value.$id !== raw.id ||
      value.$schema !== "https://json-schema.org/draft/2020-12/schema"
    ) {
      throw vendorError(
        `Schema ${artifact.artifact} failed identity validation.`,
        "VENDOR_SCHEMA_INVALID",
        relativeVendorTarget(artifact.artifact),
      );
    }
    if (ids.has(raw.id))
      throw vendorError(
        "Vendor schemas repeat an identity.",
        "VENDOR_SCHEMA_INVALID",
        VENDOR_MANIFEST,
      );
    ids.add(raw.id);
    filenames.add(artifact.artifact.slice("schemas/".length));
  }
  for (const required of [
    "common-v1.schema.json",
    "manifest-v1.schema.json",
    "vendor-manifest-v1.schema.json",
  ]) {
    if (!filenames.has(required)) {
      throw vendorError(
        `Vendor schemas omit ${required}.`,
        "VENDOR_SCHEMA_INVALID",
        VENDOR_MANIFEST,
      );
    }
  }
  for (const raw of manifest.schemas as readonly { readonly artifact: string }[]) {
    const value = parseJson(contents.get(raw.artifact)!, raw.artifact);
    for (const reference of collectSchemaReferences(value)) {
      if (reference.startsWith("#")) continue;
      const document = reference.split("#", 1)[0]!;
      if (/^https:/u.test(document) ? !ids.has(document) : !filenames.has(document)) {
        throw vendorError(
          `Schema ${raw.artifact} has an unbundled reference.`,
          "VENDOR_SCHEMA_REFERENCE_MISSING",
          relativeVendorTarget(raw.artifact),
        );
      }
    }
  }
}

function verifyGraphAndItems(
  manifest: VendorManifestV1,
  inventory: ReadonlyMap<string, VendorArtifactReference>,
  contents: ReadonlyMap<string, Buffer>,
): readonly string[] {
  if (
    !isRecord(manifest.dependencyGraph) ||
    !exactKeys(manifest.dependencyGraph, ["artifact", "digest"]) ||
    manifest.dependencyGraph.artifact !== "dependency-graph.json"
  ) {
    throw vendorError(
      "Vendor dependency graph reference is invalid.",
      "VENDOR_GRAPH_INVALID",
      VENDOR_MANIFEST,
    );
  }
  const graphArtifact = artifactReference(
    inventory,
    manifest.dependencyGraph.artifact,
    manifest.dependencyGraph.digest,
    "dependency-graph",
    "Dependency graph",
  );
  const graphBytes = contents.get(graphArtifact.artifact)!;
  const graph = parseJson(graphBytes, graphArtifact.artifact);
  if (
    !graphBytes.equals(canonicalBytes(graph)) ||
    !isRecord(graph) ||
    !exactKeys(graph, ["schemaVersion", "format", "nodes"]) ||
    graph.schemaVersion !== 1 ||
    graph.format !== GRAPH_FORMAT ||
    !Array.isArray(graph.nodes)
  ) {
    throw vendorError(
      "Vendor dependency graph schema is invalid.",
      "VENDOR_GRAPH_INVALID",
      relativeVendorTarget(graphArtifact.artifact),
    );
  }
  const itemById = new Map<string, VendorItemReference>();
  for (const raw of manifest.items as readonly unknown[]) {
    if (
      !isRecord(raw) ||
      !exactKeys(raw, [
        "id",
        "version",
        "installedDirect",
        "payload",
        "bases",
        "registryDependencies",
        "contract",
        "passport",
      ]) ||
      typeof raw.id !== "string" ||
      !QUALIFIED_ID_PATTERN.test(raw.id) ||
      raw.version !== UNRELEASED_VERSION ||
      typeof raw.installedDirect !== "boolean" ||
      !isRecord(raw.payload) ||
      !Array.isArray(raw.bases) ||
      !Array.isArray(raw.registryDependencies) ||
      raw.registryDependencies.some((dependency) => typeof dependency !== "string") ||
      raw.passport !== null ||
      itemById.has(raw.id)
    ) {
      throw vendorError(
        "Vendor item reference is invalid.",
        "VENDOR_SCHEMA_INVALID",
        VENDOR_MANIFEST,
      );
    }
    itemById.set(raw.id, raw as unknown as VendorItemReference);
  }
  const orderedIds = [...itemById.keys()];
  const visited = new Set<string>();
  for (const [index, rawNode] of graph.nodes.entries()) {
    if (
      !isRecord(rawNode) ||
      !exactKeys(rawNode, ["id", "installedDirect", "selectedDirect", "dependencies"]) ||
      rawNode.id !== orderedIds[index] ||
      typeof rawNode.installedDirect !== "boolean" ||
      typeof rawNode.selectedDirect !== "boolean" ||
      !Array.isArray(rawNode.dependencies) ||
      rawNode.dependencies.some((dependency) => typeof dependency !== "string")
    ) {
      throw vendorError(
        "Vendor dependency graph node is invalid.",
        "VENDOR_GRAPH_INVALID",
        relativeVendorTarget(graphArtifact.artifact),
      );
    }
    const item = itemById.get(rawNode.id as string)!;
    if (
      item.installedDirect !== rawNode.installedDirect ||
      canonicalJson(item.registryDependencies) !== canonicalJson(rawNode.dependencies)
    ) {
      throw vendorError(
        `Vendor graph disagrees with ${item.id}.`,
        "VENDOR_GRAPH_INVALID",
        relativeVendorTarget(graphArtifact.artifact),
      );
    }
    for (const dependency of item.registryDependencies) {
      if (!visited.has(dependency)) {
        throw vendorError(
          `Vendor graph dependency ${dependency} is missing or not topologically ordered.`,
          "VENDOR_GRAPH_INVALID",
          relativeVendorTarget(graphArtifact.artifact),
        );
      }
    }
    visited.add(item.id);
    verifyVendorItem(item, inventory, contents);
  }
  if (graph.nodes.length !== itemById.size) {
    throw vendorError(
      "Vendor graph and item inventory differ.",
      "VENDOR_GRAPH_INVALID",
      VENDOR_MANIFEST,
    );
  }
  verifySelection(manifest, orderedIds, graph.nodes);
  verifyContracts(manifest, itemById, inventory, contents);
  return orderedIds;
}

function verifyVendorItem(
  item: VendorItemReference,
  inventory: ReadonlyMap<string, VendorArtifactReference>,
  contents: ReadonlyMap<string, Buffer>,
): void {
  if (
    !exactKeys(item.payload as unknown as Record<string, unknown>, [
      "artifact",
      "declaredOrigin",
      "originState",
      "digest",
      "license",
    ]) ||
    item.payload.originState !== "declared-unpublished" ||
    item.payload.license !== LICENSE_SPDX
  ) {
    throw vendorError(
      `Vendor item ${item.id} payload metadata is invalid.`,
      "VENDOR_SCHEMA_INVALID",
      VENDOR_MANIFEST,
    );
  }
  secureDeclaredUrl(item.payload.declaredOrigin, `${item.id} declared origin`);
  const expectedOrigin = `${OFFICIAL_REGISTRY_ORIGIN}/releases/${UNRELEASED_VERSION}/items/${item.id.slice(item.id.indexOf(":") + 1)}.json`;
  if (item.payload.declaredOrigin !== expectedOrigin) {
    throw vendorError(
      `Vendor item ${item.id} has an unexpected declared origin.`,
      "VENDOR_ORIGIN_INVALID",
      VENDOR_MANIFEST,
    );
  }
  if (
    item.contract !== null &&
    (!exactKeys(item.contract as unknown as Record<string, unknown>, [
      "artifact",
      "digest",
      "contractVersion",
      "license",
    ]) ||
      !DIGEST_PATTERN.test(item.contract.digest) ||
      !SEMVER_PATTERN.test(item.contract.contractVersion) ||
      item.contract.license !== LICENSE_SPDX)
  ) {
    throw vendorError(
      `Vendor Contract reference for ${item.id} is invalid.`,
      "VENDOR_CONTRACT_INVALID",
      VENDOR_MANIFEST,
    );
  }
  const payloadArtifact = artifactReference(
    inventory,
    item.payload.artifact,
    item.payload.digest,
    "item-payload",
    `${item.id} payload`,
  );
  const payloadBytes = contents.get(payloadArtifact.artifact)!;
  const payload = parseJson(payloadBytes, payloadArtifact.artifact);
  const projectItem: ProjectManifestItem = {
    qualifiedId: item.id,
    registry: item.id.split(":", 1)[0]!,
    itemId: item.id.slice(item.id.indexOf(":") + 1),
    kind: "component",
    resolved: UNRELEASED_VERSION,
    direct: item.installedDirect,
    mode: "source",
    payload: { url: item.payload.declaredOrigin, digest: item.payload.digest },
    files: [],
    registryDependencies: item.registryDependencies,
    contractVersion: item.contract?.contractVersion ?? UNRELEASED_VERSION,
  };
  if (!payloadBytes.equals(canonicalBytes(payload))) {
    throw vendorError(
      `Vendor payload ${item.id} is not canonical JSON.`,
      "VENDOR_PAYLOAD_SCHEMA_INVALID",
      relativeVendorTarget(payloadArtifact.artifact),
    );
  }
  assertUnreleasedPayload(payload, projectItem);
  const payloadDigests: string[] = [];
  if (isRecord(payload) && Array.isArray(payload.files)) {
    for (const rawFile of payload.files) {
      if (isRecord(rawFile) && typeof rawFile.content === "string")
        payloadDigests.push(sha256(rawFile.content));
    }
  }
  const logicalPaths = new Set<string>();
  const baseDigests: string[] = [];
  for (const raw of item.bases as readonly unknown[]) {
    if (
      !isRecord(raw) ||
      !exactKeys(raw, [
        "logicalPath",
        "artifact",
        "digest",
        "mediaType",
        "executable",
        "license",
      ]) ||
      typeof raw.logicalPath !== "string" ||
      typeof raw.mediaType !== "string" ||
      raw.executable !== false ||
      raw.license !== LICENSE_SPDX ||
      logicalPaths.has(raw.logicalPath)
    ) {
      throw vendorError(
        `Vendor bases for ${item.id} are invalid.`,
        "VENDOR_SCHEMA_INVALID",
        VENDOR_MANIFEST,
      );
    }
    assertPortableRelativePath(raw.logicalPath, "Vendor logical path");
    logicalPaths.add(raw.logicalPath);
    const artifact = artifactReference(
      inventory,
      raw.artifact,
      raw.digest,
      "base",
      `${item.id} base`,
    );
    baseDigests.push(artifact.digest);
  }
  if (
    canonicalJson([...payloadDigests].sort(compareText)) !==
    canonicalJson([...baseDigests].sort(compareText))
  ) {
    throw vendorError(
      `Vendor bases do not exactly cover ${item.id} payload files.`,
      "VENDOR_GRAPH_INVALID",
      VENDOR_MANIFEST,
    );
  }
}

function verifySelection(
  manifest: VendorManifestV1,
  itemIds: readonly string[],
  nodes: readonly unknown[],
): void {
  const selection = manifest.selection as unknown;
  if (
    !isRecord(selection) ||
    !exactKeys(selection, ["mode", "requested", "resolved"]) ||
    (selection.mode !== "items" && selection.mode !== "all-installed") ||
    !Array.isArray(selection.requested) ||
    !Array.isArray(selection.resolved) ||
    selection.requested.some((item) => typeof item !== "string") ||
    selection.resolved.some((item) => typeof item !== "string") ||
    canonicalJson(selection.resolved) !== canonicalJson(itemIds) ||
    canonicalJson(portableSort(selection.requested as string[])) !==
      canonicalJson(selection.requested) ||
    new Set(selection.requested).size !== selection.requested.length
  ) {
    throw vendorError("Vendor selection is invalid.", "VENDOR_GRAPH_INVALID", VENDOR_MANIFEST);
  }
  const selectedDirect = nodes
    .filter(
      (node): node is Record<string, unknown> => isRecord(node) && node.selectedDirect === true,
    )
    .map((node) => node.id)
    .filter((id): id is string => typeof id === "string");
  if (canonicalJson(portableSort(selectedDirect)) !== canonicalJson(selection.requested)) {
    throw vendorError(
      "Vendor selection roots disagree with the dependency graph.",
      "VENDOR_GRAPH_INVALID",
      VENDOR_MANIFEST,
    );
  }
  if (
    selection.mode === "all-installed" &&
    canonicalJson(selection.requested) !== canonicalJson(portableSort(itemIds))
  ) {
    throw vendorError(
      "An all-installed vendor selection must select every graph node directly.",
      "VENDOR_GRAPH_INVALID",
      VENDOR_MANIFEST,
    );
  }
}

function verifyContracts(
  manifest: VendorManifestV1,
  items: ReadonlyMap<string, VendorItemReference>,
  inventory: ReadonlyMap<string, VendorArtifactReference>,
  contents: ReadonlyMap<string, Buffer>,
): void {
  const seenItems = new Set<string>();
  for (const raw of manifest.contracts as readonly unknown[]) {
    if (
      !isRecord(raw) ||
      !exactKeys(raw, ["id", "item", "contractVersion", "artifact", "digest", "license"]) ||
      typeof raw.id !== "string" ||
      !ID_PATTERN.test(raw.id) ||
      typeof raw.item !== "string" ||
      typeof raw.contractVersion !== "string" ||
      !SEMVER_PATTERN.test(raw.contractVersion) ||
      raw.license !== LICENSE_SPDX ||
      seenItems.has(raw.item)
    ) {
      throw vendorError(
        "Vendor Contract reference is invalid.",
        "VENDOR_CONTRACT_INVALID",
        VENDOR_MANIFEST,
      );
    }
    const item = items.get(raw.item);
    if (
      item === undefined ||
      item.contract === null ||
      item.contract.artifact !== raw.artifact ||
      item.contract.digest !== raw.digest ||
      item.contract.contractVersion !== raw.contractVersion
    ) {
      throw vendorError(
        `Vendor Contract for ${raw.item} is not bound to its item.`,
        "VENDOR_CONTRACT_BINDING_MISMATCH",
        VENDOR_MANIFEST,
      );
    }
    const artifact = artifactReference(inventory, raw.artifact, raw.digest, "contract", "Contract");
    const bytes = contents.get(artifact.artifact)!;
    const value = parseJson(bytes, artifact.artifact);
    if (!bytes.equals(canonicalBytes(value))) {
      throw vendorError(
        `Vendor Contract ${raw.id} is not canonical JSON.`,
        "VENDOR_CONTRACT_INVALID",
        relativeVendorTarget(artifact.artifact),
      );
    }
    const definitions = Array.isArray(value) ? value : [value];
    for (const definition of definitions) {
      try {
        const parsed = parseContractDefinitionV1(definition);
        if (
          parsed.registryId !== raw.item.slice(0, raw.item.indexOf(":")) ||
          parsed.itemId !== raw.item.slice(raw.item.indexOf(":") + 1) ||
          parsed.contractVersion !== raw.contractVersion ||
          parsed.payloadDigest !== item.payload.digest
        ) {
          throw vendorError(
            `Vendor Contract ${raw.id} has a stale provenance binding.`,
            "VENDOR_CONTRACT_BINDING_MISMATCH",
            relativeVendorTarget(artifact.artifact),
          );
        }
      } catch (error) {
        if (error instanceof CliError) throw error;
        throw vendorError(
          `Vendor Contract ${raw.id} failed its v1 schema.`,
          "VENDOR_CONTRACT_INVALID",
          relativeVendorTarget(artifact.artifact),
        );
      }
    }
    seenItems.add(raw.item);
  }
  for (const item of items.values()) {
    if ((item.contract === null) === seenItems.has(item.id)) {
      throw vendorError(
        `Vendor Contract omission for ${item.id} is inconsistent.`,
        "VENDOR_CONTRACT_INVALID",
        VENDOR_MANIFEST,
      );
    }
  }
}

function verifyLicense(
  manifest: VendorManifestV1,
  inventory: ReadonlyMap<string, VendorArtifactReference>,
  contents: ReadonlyMap<string, Buffer>,
): void {
  const license = manifest.license as unknown;
  if (
    !isRecord(license) ||
    !exactKeys(license, ["spdx", "artifact", "digest"]) ||
    license.spdx !== LICENSE_SPDX ||
    license.artifact !== "licenses/MIT.txt"
  ) {
    throw vendorError(
      "Vendor license metadata is invalid.",
      "VENDOR_LICENSE_INVALID",
      VENDOR_MANIFEST,
    );
  }
  const artifact = artifactReference(
    inventory,
    license.artifact,
    license.digest,
    "license",
    "License",
  );
  if (!contents.get(artifact.artifact)!.toString("utf8").includes("MIT License")) {
    throw vendorError(
      "Vendor MIT license text is invalid.",
      "VENDOR_LICENSE_INVALID",
      relativeVendorTarget(artifact.artifact),
    );
  }
}

function verifyOmissions(manifest: VendorManifestV1, itemIds: readonly string[]): void {
  const omissions = manifest.omissions as unknown;
  if (
    !isRecord(omissions) ||
    !exactKeys(omissions, ["releaseManifest", "contracts", "passports", "npmTarballs"]) ||
    omissions.releaseManifest !== "not-published" ||
    omissions.npmTarballs !== "not-requested" ||
    !Array.isArray(omissions.contracts) ||
    !Array.isArray(omissions.passports) ||
    canonicalJson(omissions.passports) !== canonicalJson(itemIds)
  ) {
    throw vendorError(
      "Vendor omission record is invalid.",
      "VENDOR_SCHEMA_INVALID",
      VENDOR_MANIFEST,
    );
  }
  const contractItems = new Set(manifest.contracts.map(({ item }) => item));
  const expectedMissing = portableSort(itemIds.filter((id) => !contractItems.has(id)));
  if (canonicalJson(omissions.contracts) !== canonicalJson(expectedMissing)) {
    throw vendorError(
      "Vendor Contract omissions are inconsistent.",
      "VENDOR_CONTRACT_INVALID",
      VENDOR_MANIFEST,
    );
  }
}

function verifyArtifactCoverage(
  manifest: VendorManifestV1,
  inventory: ReadonlyMap<string, VendorArtifactReference>,
): void {
  const referenced = new Set<string>([
    manifest.license.artifact,
    manifest.dependencyGraph.artifact,
    ...manifest.schemas.map(({ artifact }) => artifact),
    ...manifest.contracts.map(({ artifact }) => artifact),
  ]);
  for (const item of manifest.items) {
    referenced.add(item.payload.artifact);
    for (const base of item.bases) referenced.add(base.artifact);
    if (item.contract !== null) referenced.add(item.contract.artifact);
  }
  if (
    canonicalJson([...referenced].sort(compareText)) !==
    canonicalJson([...inventory.keys()].sort(compareText))
  ) {
    throw vendorError(
      "Vendor artifact inventory contains an unreferenced or missing artifact.",
      "VENDOR_FILE_SET_INVALID",
      VENDOR_MANIFEST,
    );
  }
}

/** Performs a bounded, strictly read-only, network-free bundle verification. */
export function verifyVendor(options: VendorVerifyOptions): VendorVerificationResult {
  const root = validatedProjectRoot(options.projectRoot);
  const files = enumerateBundleFiles(root);
  const manifestBytes = readBundleArtifact(root, "vendor-manifest.json", MAX_JSON_BYTES);
  const manifest = parseVendorManifest(manifestBytes);
  const inventory = parseArtifactInventory(manifest);
  const expectedFiles = [...inventory.keys(), "SHA256SUMS", "vendor-manifest.json"].sort(
    compareText,
  );
  if (canonicalJson(files) !== canonicalJson(expectedFiles)) {
    throw vendorError(
      "Vendor bundle contains a missing or untracked artifact.",
      "VENDOR_FILE_SET_INVALID",
      VENDOR_ROOT,
    );
  }
  const checked = verifyChecksums(root, manifest, inventory);
  verifySchemaArtifacts(manifest, inventory, checked.contents);
  const items = verifyGraphAndItems(manifest, inventory, checked.contents);
  verifyLicense(manifest, inventory, checked.contents);
  verifyOmissions(manifest, items);
  verifyArtifactCoverage(manifest, inventory);
  return {
    schemaVersion: 1,
    format: VENDOR_FORMAT,
    state: "valid",
    root: VENDOR_ROOT,
    provenanceState: "unreleased-local",
    releaseClaim: "none",
    items,
    artifacts: inventory.size,
    totalBytes: checked.totalBytes + manifestBytes.byteLength,
    manifestDigest: sha256(manifestBytes),
    sha256SumsDigest: manifest.sha256Sums.digest,
    networkUsed: false,
    writePerformed: false,
  };
}
