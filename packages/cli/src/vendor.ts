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
  acquireImmutableArtifact,
  type AcquisitionSource,
  type AcquisitionTransport,
  type AcquisitionVendorReader,
} from "./acquisition.js";
import {
  assertAuthenticAcquiredNativeRegistryRelease,
  type AcquiredNativeRegistryRelease,
} from "./acquisition-resolver.js";
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
  finalizeOperationPlan,
  type OperationPlan,
  type OperationPlanFile,
  type TransactionMutation,
  type TransactionResult,
} from "./transaction-engine.js";
import {
  createStableAcquisitionVendorReader,
  stableNpmTarballInternalPath,
  validateStableNpmRegistryOriginPolicies,
  validateStableNpmTarballBytes,
  validateStableNpmTarballDescriptor,
  verifyStableVendorBundle,
  verifyStableVendorBundleBytes,
  type StableNpmRegistryOriginPolicy,
  type StableVendorNpmTarballDescriptor,
  type StableVendorVerificationResult,
} from "./vendor-reader.js";

const VENDOR_ROOT = ".mergora/vendor/v1" as const;
const VENDOR_MANIFEST = `${VENDOR_ROOT}/vendor-manifest.json` as const;
const VENDOR_SUMS = `${VENDOR_ROOT}/SHA256SUMS` as const;
const PROJECT_MANIFEST = ".mergora/manifest.json" as const;
const PROJECT_CONFIG = "mergora.json" as const;
const MANIFEST_SCHEMA =
  "https://akhiltrivedix.github.io/mergora/r/v1/schemas/manifest-v1.schema.json" as const;
const VENDOR_FORMAT = "mergora-vendor-v1" as const;
const GRAPH_FORMAT = "mergora-vendor-dependency-graph-v1" as const;
const UNRELEASED_VERSION = "1.0.0-unreleased" as const;
const LICENSE_SPDX = "MIT" as const;

const MAX_JSON_BYTES = 4 * 1024 * 1024;
const MAX_ARTIFACT_BYTES = 4 * 1024 * 1024;
const MAX_BUNDLE_BYTES = 52_428_800;
const MAX_BUNDLE_FILES = 8192;
const MAX_ITEMS = 4096;
const MAX_SCHEMAS = 128;
const MAX_CONTRACTS = 4096;
const MAX_NPM_TARBALLS = 1024;
const MAX_NPM_TARBALL_BYTES = 16 * 1024 * 1024;
const MAX_NPM_TARBALL_TOTAL_BYTES = 32 * 1024 * 1024;
const MAX_NPM_FETCH_TIMEOUT_MS = 60_000;
const DIGEST_PATTERN = /^sha256:[a-f0-9]{64}$/u;
const ID_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/u;
const QUALIFIED_ID_PATTERN = /^([a-z0-9]+(?:-[a-z0-9]+)*):([a-z0-9]+(?:-[a-z0-9]+)*)$/u;
const SEMVER_PATTERN =
  /^(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)(?:-[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?(?:\+[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?$/u;
const STABLE_RELEASE_PATTERN = /^(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)$/u;
const MEDIA_TYPE_PATTERN = /^[a-z0-9!#$&^_.+-]+\/[a-z0-9!#$&^_.+-]+$/u;
const SPDX_PATTERN = /^[A-Za-z0-9][A-Za-z0-9-.+]*(?: WITH [A-Za-z0-9][A-Za-z0-9-.+]*)?$/u;

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

export type VendorPlan = OperationPlan;

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

export interface StableVendorDocuments {
  readonly catalog: unknown;
  readonly manifest: unknown;
  readonly items: Readonly<Record<string, unknown>>;
}

export interface StableNpmTarballInventoryDescriptor extends StableVendorNpmTarballDescriptor {
  /** Exact compressed byte count from trusted package metadata. */
  readonly bytes: number;
}

export type StableNpmTarballInventoryEntry =
  | (StableNpmTarballInventoryDescriptor & {
      readonly disposition: "include";
    })
  | (StableNpmTarballInventoryDescriptor & {
      readonly disposition: "omit";
      readonly omissionReason: "explicitly-omitted" | "license-not-allowed";
    });

export interface StableNpmTarballInventory {
  readonly entries: readonly StableNpmTarballInventoryEntry[];
  /** SPDX identifiers explicitly permitted for inclusion. */
  readonly allowedLicenses: readonly string[];
  /** Exact enrolled identities in addition to the compiled public npm registry. */
  readonly enrolledOrigins?: readonly StableNpmRegistryOriginPolicy[] | undefined;
  /** May lower, but never raise, the compiled per-tarball ceiling. */
  readonly maxTarballBytes?: number | undefined;
  /** May lower, but never raise, the compiled aggregate ceiling. */
  readonly maxTotalBytes?: number | undefined;
  readonly timeoutMs?: number | undefined;
}

export interface StableNpmTarballFetchRequest {
  readonly package: string;
  readonly version: string;
  readonly url: string;
  readonly maxBytes: number;
  readonly signal: AbortSignal;
}

export interface StableNpmTarballFetchResult {
  readonly bytes: Uint8Array;
  /** Final response URL, which must equal the requested URL byte-for-byte. */
  readonly url: string;
  /** Redirect targets observed by the fetcher; redirects are never accepted. */
  readonly redirects: readonly string[];
  readonly contentType: string | null;
  readonly source: AcquisitionSource;
}

export type StableNpmTarballFetcher = (
  request: StableNpmTarballFetchRequest,
) => Promise<StableNpmTarballFetchResult>;

export interface AcquireStableVendorSnapshotOptions {
  readonly projectRoot: string;
  readonly release: AcquiredNativeRegistryRelease;
  readonly documents: StableVendorDocuments;
  readonly selectionMode: "all" | "items";
  readonly offline?: boolean | undefined;
  readonly vendor?: AcquisitionVendorReader | undefined;
  readonly transport?: AcquisitionTransport | undefined;
  readonly npmTarballs?: StableNpmTarballInventory | undefined;
  readonly npmTarballFetcher?: StableNpmTarballFetcher | undefined;
  readonly commandArguments?: readonly string[] | undefined;
}

interface StableVendorEvidenceReference {
  readonly id: string;
  readonly artifact: string;
  readonly digest: Digest;
}

interface StableVendorSnapshotArtifact {
  readonly path: string;
  readonly digest: Digest;
  readonly mediaType: string;
  readonly content: Buffer;
}

export interface StableVendorSnapshot {
  readonly projectRoot: string;
  readonly release: AcquiredNativeRegistryRelease;
  readonly selectionMode: "all" | "items";
  readonly selectionRequested: readonly string[];
  readonly artifacts: readonly StableVendorSnapshotArtifact[];
  readonly releaseManifest: StableVendorEvidenceReference;
  readonly items: readonly StableVendorEvidenceReference[];
  readonly schemas: readonly StableVendorEvidenceReference[];
  readonly contracts: readonly StableVendorEvidenceReference[];
  readonly passports: readonly StableVendorEvidenceReference[];
  readonly npmRegistryOrigins: readonly StableNpmRegistryOriginPolicy[];
  readonly npmCoverage: "not-requested" | "complete";
  readonly npmTarballs: readonly StableVendorNpmTarballDescriptor[];
  readonly npmTarballOmissions: readonly string[];
  readonly acquiredBytes: number;
  readonly acquisitionSource: AcquisitionSource;
  readonly commandArguments?: readonly string[] | undefined;
}

interface StableFormalVendorManifest {
  readonly schemaVersion: 1;
  readonly format: typeof VENDOR_FORMAT;
  readonly registry: {
    readonly id: "official";
    readonly origin: typeof OFFICIAL_REGISTRY_ORIGIN;
    readonly identityDigest: Digest;
  };
  readonly release: string;
  readonly selection: {
    readonly mode: "all" | "items";
    readonly requested: readonly string[];
  };
  readonly releaseManifest: StableVendorEvidenceReference;
  readonly items: readonly StableVendorEvidenceReference[];
  readonly schemas: readonly StableVendorEvidenceReference[];
  readonly contracts: readonly StableVendorEvidenceReference[];
  readonly passports: readonly StableVendorEvidenceReference[];
  readonly npmRegistryOrigins?: readonly StableNpmRegistryOriginPolicy[] | undefined;
  readonly npmCoverage: "not-requested" | "complete";
  readonly npmTarballs: readonly StableVendorNpmTarballDescriptor[];
  readonly dependencyGraphDigest: Digest;
  readonly sha256SumsDigest: Digest;
}

export type StableVendorPlan = OperationPlan;

export interface StableVendorResult {
  readonly mode: "offline-vendor";
  readonly root: typeof VENDOR_ROOT;
  readonly items: readonly string[];
  readonly release: string;
  readonly planDigest: Digest;
  readonly transaction: TransactionResult;
  readonly verification: StableVendorVerificationResult;
}

interface BuiltStableBundle {
  readonly plan: StableVendorPlan;
  readonly mutations: readonly TransactionMutation[];
  readonly observedTargets: Readonly<Record<string, Digest | null>>;
  readonly targetBytes: ReadonlyMap<string, Buffer>;
  readonly root: string;
  readonly snapshot: StableVendorSnapshot;
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
    exitCode:
      code === "VENDOR_STABLE_NPM_FETCH_TIMEOUT"
        ? 4
        : code === "VENDOR_STABLE_NPM_INVENTORY_MISSING"
          ? 5
          : code.endsWith("_INVALID_OPTION")
            ? 2
            : code.endsWith("_MISSING")
              ? 3
              : 5,
    ...(target === undefined ? {} : { target }),
  });
}

const AUTHENTIC_STABLE_VENDOR_SNAPSHOTS = new WeakSet<object>();

function assertAuthenticStableVendorSnapshot(
  value: unknown,
): asserts value is StableVendorSnapshot {
  if (
    value === null ||
    typeof value !== "object" ||
    !AUTHENTIC_STABLE_VENDOR_SNAPSHOTS.has(value)
  ) {
    throw vendorError(
      "Stable vendoring requires the authentic snapshot returned by acquisition.",
      "VENDOR_STABLE_SNAPSHOT_UNAUTHENTIC",
    );
  }
}

function freezeStableSnapshotValue<T>(value: T, seen = new WeakSet<object>()): T {
  if (value === null || typeof value !== "object" || ArrayBuffer.isView(value) || seen.has(value)) {
    return value;
  }
  seen.add(value);
  for (const nested of Object.values(value as Record<string, unknown>)) {
    freezeStableSnapshotValue(nested, seen);
  }
  return Object.freeze(value);
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

function stableRecord(value: unknown, label: string): Record<string, unknown> {
  if (!isRecord(value)) {
    throw vendorError(`${label} must be an object.`, "VENDOR_STABLE_SNAPSHOT_INVALID");
  }
  return value;
}

function stableExactKeys(
  value: Record<string, unknown>,
  expected: readonly string[],
  label: string,
): void {
  if (!exactKeys(value, expected)) {
    throw vendorError(`${label} fields are invalid.`, "VENDOR_STABLE_SNAPSHOT_INVALID");
  }
}

function stableCanonicalBytes(value: unknown, label: string): Buffer {
  let canonical: string;
  try {
    canonical = canonicalJson(value);
  } catch {
    throw vendorError(
      `${label} cannot be represented as canonical JSON.`,
      "VENDOR_STABLE_JSON_INVALID",
    );
  }
  const bytes = Buffer.from(`${canonical}\n`, "utf8");
  if (bytes.byteLength > MAX_ARTIFACT_BYTES) {
    throw vendorError(`${label} exceeds the byte limit.`, "VENDOR_STABLE_ARTIFACT_OVERSIZE");
  }
  return bytes;
}

function stableCanonicalJsonBytes(bytes: Uint8Array, label: string): Buffer {
  let text: string;
  try {
    text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    throw vendorError(`${label} is not valid UTF-8.`, "VENDOR_STABLE_ENCODING_INVALID");
  }
  let value: unknown;
  try {
    value = JSON.parse(text) as unknown;
  } catch {
    throw vendorError(`${label} is not valid JSON.`, "VENDOR_STABLE_JSON_INVALID");
  }
  const canonical = stableCanonicalBytes(value, label);
  if (!Buffer.from(bytes).equals(canonical)) {
    throw vendorError(
      `${label} is not canonical JSON or contains duplicate fields.`,
      "VENDOR_STABLE_JSON_INVALID",
    );
  }
  return canonical;
}

function stableProtocolPath(url: unknown, label: string): string {
  const value = secureDeclaredUrl(url, label);
  const prefix = `${OFFICIAL_REGISTRY_ORIGIN}/`;
  if (!value.startsWith(prefix)) {
    throw vendorError(
      `${label} leaves the official registry protocol root.`,
      "VENDOR_STABLE_ORIGIN_INVALID",
    );
  }
  const relative = value.slice(prefix.length);
  assertPortableRelativePath(relative, label);
  if (relative.startsWith("r/v1/")) {
    throw vendorError(`${label} repeats the protocol root.`, "VENDOR_STABLE_ORIGIN_INVALID");
  }
  return `r/v1/${relative}`;
}

function stableEvidenceReference(value: unknown, label: string): StableVendorEvidenceReference {
  const record = stableRecord(value, label);
  stableExactKeys(record, ["id", "artifact", "digest"], label);
  if (
    typeof record.id !== "string" ||
    !ID_PATTERN.test(record.id) ||
    record.id !== record.id.normalize("NFKC")
  ) {
    throw vendorError(`${label} ID is invalid.`, "VENDOR_STABLE_SNAPSHOT_INVALID");
  }
  stableProtocolPath(record.artifact, `${label} artifact`);
  return {
    id: record.id,
    artifact: record.artifact as string,
    digest: parseDigest(record.digest, `${label} digest`),
  };
}

interface ParsedStableManifestArtifact {
  readonly path: string;
  readonly url: string;
  readonly digest: Digest;
  readonly mediaType: string;
  readonly bytes: number;
}

interface ParsedStableManifestSnapshot {
  readonly items: Readonly<
    Record<
      string,
      {
        readonly payload: StableVendorEvidenceReference;
        readonly passport: StableVendorEvidenceReference;
        readonly contract: StableVendorEvidenceReference;
        readonly dependencies: readonly string[];
      }
    >
  >;
  readonly artifactsByUrl: ReadonlyMap<string, ParsedStableManifestArtifact>;
}

function parseStableManifestSnapshot(
  value: unknown,
  release: AcquiredNativeRegistryRelease,
): ParsedStableManifestSnapshot {
  const root = stableRecord(value, "Stable release manifest snapshot");
  stableExactKeys(
    root,
    [
      "schemaVersion",
      "registryId",
      "uiVersion",
      "releaseCommit",
      "items",
      "dependencyGraphDigest",
      "artifacts",
      "qualitySummary",
      "manifestDigest",
      ...(root.npmPackageInventory === undefined ? [] : ["npmPackageInventory"]),
    ],
    "Stable release manifest snapshot",
  );
  if (
    root.schemaVersion !== 1 ||
    root.registryId !== "official" ||
    root.uiVersion !== release.release ||
    root.dependencyGraphDigest !== release.dependencyGraphDigest ||
    root.manifestDigest !== release.manifestSelfDigest
  ) {
    throw vendorError(
      "Stable release manifest snapshot disagrees with the verified acquisition.",
      "VENDOR_STABLE_RELEASE_INVALID",
    );
  }
  const snapshotNpmInventory = root.npmPackageInventory;
  if (
    (snapshotNpmInventory === undefined) !== (release.npmPackageInventory === null) ||
    (snapshotNpmInventory !== undefined &&
      release.npmPackageInventory !== null &&
      canonicalJson(snapshotNpmInventory) !== canonicalJson(release.npmPackageInventory))
  ) {
    throw vendorError(
      "Stable release npm package inventory disagrees with the verified acquisition.",
      "VENDOR_STABLE_RELEASE_INVALID",
    );
  }
  const rawArtifacts = root.artifacts;
  if (!Array.isArray(rawArtifacts) || rawArtifacts.length < 1 || rawArtifacts.length > 4096) {
    throw vendorError(
      "Stable release artifact inventory is invalid.",
      "VENDOR_STABLE_SNAPSHOT_INVALID",
    );
  }
  const artifactsByUrl = new Map<string, ParsedStableManifestArtifact>();
  const paths = new Set<string>();
  for (const [index, entry] of rawArtifacts.entries()) {
    const label = `Stable release artifact ${String(index)}`;
    const record = stableRecord(entry, label);
    stableExactKeys(record, ["name", "url", "digest", "mediaType", "bytes"], label);
    if (
      typeof record.name !== "string" ||
      typeof record.url !== "string" ||
      typeof record.mediaType !== "string" ||
      !MEDIA_TYPE_PATTERN.test(record.mediaType) ||
      !Number.isSafeInteger(record.bytes) ||
      Number(record.bytes) < 1 ||
      Number(record.bytes) > MAX_ARTIFACT_BYTES
    ) {
      throw vendorError(`${label} is invalid.`, "VENDOR_STABLE_SNAPSHOT_INVALID");
    }
    const path = stableProtocolPath(record.url, `${label} URL`);
    if (record.name !== path || paths.has(path) || artifactsByUrl.has(record.url)) {
      throw vendorError(
        `${label} path identity is duplicated or inconsistent.`,
        "VENDOR_STABLE_SNAPSHOT_INVALID",
      );
    }
    paths.add(path);
    artifactsByUrl.set(record.url, {
      path,
      url: record.url,
      digest: parseDigest(record.digest, `${label} digest`),
      mediaType: record.mediaType,
      bytes: Number(record.bytes),
    });
  }
  const rawItems = stableRecord(root.items, "Stable release item inventory");
  const items: Record<
    string,
    {
      payload: StableVendorEvidenceReference;
      passport: StableVendorEvidenceReference;
      contract: StableVendorEvidenceReference;
      dependencies: readonly string[];
    }
  > = {};
  for (const [id, entry] of Object.entries(rawItems)) {
    if (!ID_PATTERN.test(id)) {
      throw vendorError("Stable release item ID is invalid.", "VENDOR_STABLE_SNAPSHOT_INVALID");
    }
    const record = stableRecord(entry, `Stable release item ${id}`);
    stableExactKeys(
      record,
      ["version", "payload", "passport", "contract", "dependencies"],
      `Stable release item ${id}`,
    );
    if (record.version !== release.release) {
      throw vendorError(
        `Stable release item ${id} has a mismatched release.`,
        "VENDOR_STABLE_RELEASE_INVALID",
      );
    }
    const payload = stableEvidenceReference(record.payload, `Stable release item ${id} payload`);
    const passport = stableEvidenceReference(record.passport, `Stable release item ${id} Passport`);
    const contract = stableEvidenceReference(record.contract, `Stable release item ${id} Contract`);
    if (!Array.isArray(record.dependencies) || record.dependencies.length > 256) {
      throw vendorError(
        `Stable release item ${id} dependencies are invalid.`,
        "VENDOR_STABLE_SELECTION_INVALID",
      );
    }
    const dependencies = record.dependencies.map((dependency) => {
      const match = typeof dependency === "string" ? QUALIFIED_ID_PATTERN.exec(dependency) : null;
      if (match === null || match[1] !== "official") {
        throw vendorError(
          `Stable release item ${id} dependency is not an official item reference.`,
          "VENDOR_STABLE_SELECTION_INVALID",
        );
      }
      return match[2]!;
    });
    const sortedDependencies = [...new Set(dependencies)].sort(compareText);
    if (canonicalJson(dependencies) !== canonicalJson(sortedDependencies)) {
      throw vendorError(
        `Stable release item ${id} dependencies are not uniquely sorted.`,
        "VENDOR_STABLE_SELECTION_INVALID",
      );
    }
    if (payload.id !== id) {
      throw vendorError(
        `Stable release item ${id} payload identity is invalid.`,
        "VENDOR_STABLE_RELEASE_INVALID",
      );
    }
    items[id] = { payload, passport, contract, dependencies };
  }
  return { items, artifactsByUrl };
}

function exactStableSelectionRoots(
  release: AcquiredNativeRegistryRelease,
  manifest: ParsedStableManifestSnapshot,
  selectionMode: "all" | "items",
): readonly string[] {
  const releaseIds = Object.keys(manifest.items).sort(compareText);
  const releaseIdSet = new Set(releaseIds);
  const requested = [
    ...new Set(release.requestedItems.map((id) => release.aliases[id] ?? id)),
  ].sort(compareText);
  if (
    requested.length < 1 ||
    requested.some((id) => !releaseIdSet.has(id)) ||
    (selectionMode === "all" && canonicalJson(requested) !== canonicalJson(releaseIds))
  ) {
    throw vendorError(
      "Stable vendor selection roots disagree with the exact release item set.",
      "VENDOR_STABLE_SELECTION_INVALID",
    );
  }

  const visited = new Set<string>();
  const active = new Set<string>();
  const closure: string[] = [];
  const visit = (id: string): void => {
    if (active.has(id)) {
      throw vendorError(
        `Stable release dependency closure cycles through ${id}.`,
        "VENDOR_STABLE_SELECTION_INVALID",
      );
    }
    if (visited.has(id)) return;
    active.add(id);
    const item = manifest.items[id];
    if (item === undefined) {
      throw vendorError(
        `Stable release dependency ${id} is absent from the release manifest.`,
        "VENDOR_STABLE_SELECTION_INVALID",
      );
    }
    for (const dependency of item.dependencies) visit(dependency);
    active.delete(id);
    visited.add(id);
    closure.push(id);
  };
  for (const id of requested) visit(id);
  const acquiredItemIds = release.items.map(({ itemId }) => itemId);
  if (
    canonicalJson(closure) !== canonicalJson(release.resolvedItems) ||
    canonicalJson(closure) !== canonicalJson(acquiredItemIds)
  ) {
    throw vendorError(
      "Acquired Stable items are not the exact release-manifest dependency closure.",
      "VENDOR_STABLE_SELECTION_INVALID",
    );
  }
  return requested;
}

function stableArtifactBytes(
  item: AcquiredNativeRegistryRelease["items"][number]["files"][number],
): Buffer {
  const bytes =
    item.encoding === "utf8"
      ? Buffer.from(item.content, "utf8")
      : Buffer.from(item.content, "base64");
  if (bytes.byteLength !== item.bytes || sha256(bytes) !== item.digest) {
    throw vendorError(
      `Stable acquired source ${item.logicalPath} failed its digest binding.`,
      "VENDOR_STABLE_DIGEST_MISMATCH",
      item.logicalPath,
    );
  }
  return bytes;
}

function addStableSnapshotArtifact(
  artifacts: Map<string, StableVendorSnapshotArtifact>,
  artifact: StableVendorSnapshotArtifact,
): void {
  assertPortableRelativePath(artifact.path, "Stable vendor artifact path");
  const npmTarball = artifact.path.startsWith("npm/tarballs/");
  if (!artifact.path.startsWith("r/v1/") && !npmTarball) {
    throw vendorError(
      "Stable vendor artifact leaves the protocol tree.",
      "VENDOR_STABLE_PATH_UNSAFE",
      artifact.path,
    );
  }
  if (
    artifact.content.byteLength > (npmTarball ? MAX_NPM_TARBALL_BYTES : MAX_ARTIFACT_BYTES) ||
    sha256(artifact.content) !== artifact.digest
  ) {
    throw vendorError(
      `Stable vendor artifact ${artifact.path} failed its digest or byte policy.`,
      "VENDOR_STABLE_DIGEST_MISMATCH",
      artifact.path,
    );
  }
  const identity = artifact.path.normalize("NFKC").toLocaleLowerCase("en-US");
  const prior = [...artifacts.values()].find(
    ({ path }) => path.normalize("NFKC").toLocaleLowerCase("en-US") === identity,
  );
  if (prior !== undefined) {
    if (
      prior.path !== artifact.path ||
      prior.digest !== artifact.digest ||
      !prior.content.equals(artifact.content)
    ) {
      throw vendorError(
        `Stable vendor artifact ${artifact.path} has a conflicting source.`,
        "VENDOR_STABLE_PATH_COLLISION",
        artifact.path,
      );
    }
    return;
  }
  artifacts.set(artifact.path, {
    ...artifact,
    content: Buffer.from(artifact.content),
  });
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

function stableManifestArtifact(
  manifest: ParsedStableManifestSnapshot,
  reference: StableVendorEvidenceReference,
  label: string,
): ParsedStableManifestArtifact {
  const artifact = manifest.artifactsByUrl.get(reference.artifact);
  if (
    artifact === undefined ||
    artifact.digest !== reference.digest ||
    artifact.mediaType !== "application/json"
  ) {
    throw vendorError(
      `${label} is absent from or inconsistent with the release artifact inventory.`,
      "VENDOR_STABLE_REFERENCE_INVALID",
    );
  }
  return artifact;
}

function stableAggregateSource(sources: readonly AcquisitionSource[]): AcquisitionSource {
  if (sources.includes("mirror")) return "mirror";
  if (sources.includes("network")) return "network";
  if (sources.includes("vendor")) return "vendor";
  return "verified-cache";
}

interface AcquiredStableNpmTarballInventory {
  readonly artifacts: readonly StableVendorSnapshotArtifact[];
  readonly descriptors: readonly StableVendorNpmTarballDescriptor[];
  readonly omissions: readonly string[];
  readonly enrolledOrigins: readonly StableNpmRegistryOriginPolicy[];
  readonly acquiredBytes: number;
  readonly sources: readonly AcquisitionSource[];
}

function boundedPositiveInteger(
  value: number | undefined,
  fallback: number,
  maximum: number,
  label: string,
): number {
  const resolved = value ?? fallback;
  if (!Number.isSafeInteger(resolved) || resolved < 1 || resolved > maximum) {
    throw vendorError(`${label} is invalid.`, "VENDOR_STABLE_NPM_POLICY_INVALID");
  }
  return resolved;
}

async function fetchStableNpmTarball(
  fetcher: StableNpmTarballFetcher,
  request: Omit<StableNpmTarballFetchRequest, "signal">,
  timeoutMs: number,
): Promise<StableNpmTarballFetchResult> {
  const controller = new AbortController();
  let timeout: ReturnType<typeof setTimeout> | undefined;
  const timeoutFailure = new Promise<never>((_resolve, reject) => {
    timeout = setTimeout(() => {
      controller.abort();
      reject(
        vendorError(
          `Stable npm tarball fetch timed out for ${request.package}@${request.version}.`,
          "VENDOR_STABLE_NPM_FETCH_TIMEOUT",
        ),
      );
    }, timeoutMs);
    timeout.unref?.();
  });
  try {
    return await Promise.race([fetcher({ ...request, signal: controller.signal }), timeoutFailure]);
  } finally {
    if (timeout !== undefined) clearTimeout(timeout);
  }
}

/**
 * Acquires an explicit, bounded npm inventory without invoking a package
 * manager or shell. Every included archive is descriptor- and metadata-bound;
 * every excluded archive is named by an explicit omission decision.
 */
export async function acquireStableNpmTarballInventory(options: {
  readonly release: string;
  readonly inventory: StableNpmTarballInventory;
  readonly fetcher?: StableNpmTarballFetcher | undefined;
  readonly offline?: boolean | undefined;
}): Promise<AcquiredStableNpmTarballInventory> {
  if (!STABLE_RELEASE_PATTERN.test(options.release)) {
    throw vendorError(
      "Stable npm tarballs require an exact stable release.",
      "VENDOR_STABLE_NPM_RELEASE_INVALID",
    );
  }
  const inventory = options.inventory;
  if (!Array.isArray(inventory.entries) || inventory.entries.length > MAX_NPM_TARBALLS) {
    throw vendorError(
      "Stable npm tarball inventory exceeds its entry bound.",
      "VENDOR_STABLE_NPM_POLICY_INVALID",
    );
  }
  if (!Array.isArray(inventory.allowedLicenses) || inventory.allowedLicenses.length > 128) {
    throw vendorError(
      "Stable npm tarball license allowlist is invalid.",
      "VENDOR_STABLE_NPM_LICENSE_INVALID",
    );
  }
  const allowedLicenses = new Set<string>();
  for (const license of inventory.allowedLicenses) {
    if (
      typeof license !== "string" ||
      !SPDX_PATTERN.test(license) ||
      license.length > 128 ||
      allowedLicenses.has(license)
    ) {
      throw vendorError(
        "Stable npm tarball license allowlist contains an invalid or duplicate identifier.",
        "VENDOR_STABLE_NPM_LICENSE_INVALID",
      );
    }
    allowedLicenses.add(license);
  }
  const enrolledOrigins = validateStableNpmRegistryOriginPolicies(
    [...(inventory.enrolledOrigins ?? [])].sort((left, right) =>
      left.origin.localeCompare(right.origin, "en-US"),
    ),
  );
  const maximumTarballBytes = boundedPositiveInteger(
    inventory.maxTarballBytes,
    MAX_NPM_TARBALL_BYTES,
    MAX_NPM_TARBALL_BYTES,
    "Stable npm per-tarball byte limit",
  );
  const maximumTotalBytes = boundedPositiveInteger(
    inventory.maxTotalBytes,
    MAX_NPM_TARBALL_TOTAL_BYTES,
    MAX_NPM_TARBALL_TOTAL_BYTES,
    "Stable npm aggregate byte limit",
  );
  const timeoutMs = boundedPositiveInteger(
    inventory.timeoutMs,
    30_000,
    MAX_NPM_FETCH_TIMEOUT_MS,
    "Stable npm fetch timeout",
  );

  const normalized = inventory.entries.map((entry, index) => {
    const label = `Stable npm inventory entry ${String(index)}`;
    const record = stableRecord(entry, label);
    const expected =
      entry.disposition === "omit"
        ? [
            "bytes",
            "digest",
            "disposition",
            "integrity",
            "license",
            "omissionReason",
            "package",
            "url",
            "version",
          ]
        : ["bytes", "digest", "disposition", "integrity", "license", "package", "url", "version"];
    stableExactKeys(record, expected, label);
    if (
      (entry.disposition !== "include" && entry.disposition !== "omit") ||
      !Number.isSafeInteger(entry.bytes) ||
      entry.bytes < 1 ||
      entry.bytes > maximumTarballBytes
    ) {
      throw vendorError(`${label} is invalid or oversized.`, "VENDOR_STABLE_NPM_POLICY_INVALID");
    }
    const descriptor = validateStableNpmTarballDescriptor(
      {
        package: entry.package,
        version: entry.version,
        url: entry.url,
        bytes: entry.bytes,
        digest: entry.digest,
        integrity: entry.integrity,
        license: entry.license,
      },
      enrolledOrigins,
    );
    const isMergoraOwnedPackage =
      descriptor.package === "mergora" ||
      descriptor.package.startsWith("mergora-") ||
      descriptor.package.startsWith("@mergora/");
    if (isMergoraOwnedPackage && descriptor.version !== options.release) {
      throw vendorError(
        `Stable npm tarball ${descriptor.package} is not bound to release ${options.release}.`,
        "VENDOR_STABLE_NPM_RELEASE_INVALID",
      );
    }
    const licenseAllowed = allowedLicenses.has(descriptor.license);
    if (entry.disposition === "include" && !licenseAllowed) {
      throw vendorError(
        `Stable npm tarball ${descriptor.package}@${descriptor.version} is not permitted by the explicit license allowlist.`,
        "VENDOR_STABLE_NPM_LICENSE_INVALID",
      );
    }
    if (entry.disposition === "omit") {
      if (
        (entry.omissionReason === "license-not-allowed") !== !licenseAllowed ||
        (entry.omissionReason !== "license-not-allowed" &&
          entry.omissionReason !== "explicitly-omitted")
      ) {
        throw vendorError(
          `Stable npm tarball ${descriptor.package}@${descriptor.version} has an inconsistent omission reason.`,
          "VENDOR_STABLE_NPM_LICENSE_INVALID",
        );
      }
    }
    return { entry, descriptor };
  });
  normalized.sort((left, right) =>
    left.descriptor.package === right.descriptor.package
      ? left.descriptor.version.localeCompare(right.descriptor.version, "en-US")
      : left.descriptor.package.localeCompare(right.descriptor.package, "en-US"),
  );
  const paths = new Set<string>();
  for (const { descriptor } of normalized) {
    const path = stableNpmTarballInternalPath(descriptor.package, descriptor.version);
    const identity = path.normalize("NFKC").toLocaleLowerCase("en-US");
    if (paths.has(identity)) {
      throw vendorError(
        `Stable npm tarball inventory repeats ${descriptor.package}@${descriptor.version}.`,
        "VENDOR_STABLE_NPM_PATH_COLLISION",
      );
    }
    paths.add(identity);
  }

  const included = normalized.filter(({ entry }) => entry.disposition === "include");
  if (included.length > 0 && options.fetcher === undefined) {
    throw vendorError(
      "Stable npm tarball inclusion requires an injected bounded fetcher.",
      "VENDOR_STABLE_NPM_FETCHER_REQUIRED",
    );
  }
  if (included.length > 0 && options.offline === true) {
    throw vendorError(
      "Stable npm tarballs must be acquired before entering offline mode.",
      "VENDOR_STABLE_NPM_OFFLINE",
    );
  }
  const artifacts: StableVendorSnapshotArtifact[] = [];
  const descriptors: StableVendorNpmTarballDescriptor[] = [];
  const omissions: string[] = [];
  const sources: AcquisitionSource[] = [];
  let acquiredBytes = 0;
  for (const { entry, descriptor } of normalized) {
    if (entry.disposition === "omit") {
      omissions.push(`${descriptor.package}@${descriptor.version}:${entry.omissionReason}`);
      continue;
    }
    const fetched = await fetchStableNpmTarball(
      options.fetcher!,
      {
        package: descriptor.package,
        version: descriptor.version,
        url: descriptor.url,
        maxBytes: Math.min(entry.bytes, maximumTarballBytes),
      },
      timeoutMs,
    );
    if (
      fetched.url !== descriptor.url ||
      !Array.isArray(fetched.redirects) ||
      fetched.redirects.length !== 0
    ) {
      throw vendorError(
        `Stable npm tarball ${descriptor.package}@${descriptor.version} redirected or changed origin.`,
        "VENDOR_STABLE_NPM_REDIRECT_REJECTED",
      );
    }
    if (
      fetched.source !== "network" &&
      fetched.source !== "mirror" &&
      fetched.source !== "verified-cache" &&
      fetched.source !== "vendor"
    ) {
      throw vendorError(
        "Stable npm tarball fetcher returned an invalid acquisition source.",
        "VENDOR_STABLE_NPM_FETCH_INVALID",
      );
    }
    if (
      fetched.contentType !== "application/octet-stream" &&
      fetched.contentType !== "application/gzip" &&
      fetched.contentType !== "application/x-gzip"
    ) {
      throw vendorError(
        `Stable npm tarball ${descriptor.package}@${descriptor.version} has an invalid media type.`,
        "VENDOR_STABLE_NPM_FETCH_INVALID",
      );
    }
    const content = Buffer.from(fetched.bytes);
    if (content.byteLength !== entry.bytes || content.byteLength > maximumTarballBytes) {
      throw vendorError(
        `Stable npm tarball ${descriptor.package}@${descriptor.version} has an unexpected byte count.`,
        "VENDOR_STABLE_NPM_OVERSIZE",
      );
    }
    validateStableNpmTarballBytes(descriptor, content, maximumTarballBytes);
    acquiredBytes += content.byteLength;
    if (acquiredBytes > maximumTotalBytes) {
      throw vendorError(
        "Stable npm tarball inventory exceeds its aggregate byte limit.",
        "VENDOR_STABLE_NPM_OVERSIZE",
      );
    }
    artifacts.push({
      path: stableNpmTarballInternalPath(descriptor.package, descriptor.version),
      digest: descriptor.digest,
      mediaType: "application/gzip",
      content,
    });
    descriptors.push(descriptor);
    sources.push(fetched.source);
  }
  return {
    artifacts,
    descriptors,
    omissions,
    enrolledOrigins: enrolledOrigins.filter(({ origin }) =>
      descriptors.some((descriptor) => new URL(descriptor.url).origin === origin),
    ),
    acquiredBytes,
    sources,
  };
}

/**
 * Materializes a bounded, immutable Stable snapshot from a release that has
 * already passed native protocol resolution. Missing evidence is acquired
 * through the same digest-bound cache/vendor/network path; mutable catalog
 * metadata can never redefine the supplied exact release.
 */
export async function acquireStableVendorSnapshot(
  options: AcquireStableVendorSnapshotOptions,
): Promise<StableVendorSnapshot> {
  assertAuthenticAcquiredNativeRegistryRelease(options.release);
  const root = validatedProjectRoot(options.projectRoot);
  const release = options.release;
  if (
    release.protocolVersion !== "mergora-v1" ||
    release.registry.id !== "official" ||
    release.registry.origin !== OFFICIAL_REGISTRY_ORIGIN ||
    release.registry.trust !== "official" ||
    !STABLE_RELEASE_PATTERN.test(release.release)
  ) {
    throw vendorError(
      "Formal Stable vendoring requires an exact official stable native release.",
      "VENDOR_STABLE_RELEASE_INVALID",
    );
  }
  const catalogBytes = stableCanonicalBytes(options.documents.catalog, "Stable vendor catalog");
  const manifestBytes = stableCanonicalBytes(
    options.documents.manifest,
    "Stable vendor release manifest",
  );
  if (
    sha256(catalogBytes) !== release.catalogDigest ||
    sha256(manifestBytes) !== release.manifestDigest
  ) {
    throw vendorError(
      "Captured catalog or release manifest bytes disagree with the verified acquisition.",
      "VENDOR_STABLE_DIGEST_MISMATCH",
    );
  }
  const manifest = parseStableManifestSnapshot(options.documents.manifest, release);
  const selectionRequested = exactStableSelectionRoots(release, manifest, options.selectionMode);
  if (options.npmTarballs !== undefined) {
    const npmInventory = stableRecord(
      options.npmTarballs,
      "Stable release npm package inventory request",
    );
    if (release.npmPackageInventory === null) {
      throw vendorError(
        "This exact Stable release does not declare an npm package inventory.",
        "VENDOR_STABLE_NPM_INVENTORY_MISSING",
      );
    }
    if (Object.hasOwn(npmInventory, "enrolledOrigins")) {
      throw vendorError(
        "Native Stable npm acquisition cannot add self-asserted enrolled registry origins.",
        "VENDOR_STABLE_NPM_ORIGIN_INVALID",
      );
    }
    const requestedInventory = {
      allowedLicenses: npmInventory.allowedLicenses,
      entries: npmInventory.entries,
    };
    if (canonicalJson(requestedInventory) !== canonicalJson(release.npmPackageInventory)) {
      throw vendorError(
        "Stable npm package selection disagrees with the exact release manifest inventory.",
        "VENDOR_STABLE_NPM_INVENTORY_MISMATCH",
      );
    }
  }
  const selectedIds = [...release.resolvedItems];
  if (selectedIds.length === 0 || selectedIds.length > MAX_ITEMS) {
    throw vendorError(
      "Stable vendoring requires one or more resolved release items.",
      "VENDOR_STABLE_SELECTION_INVALID",
    );
  }
  const acquiredById = new Map(release.items.map((item) => [item.itemId, item]));
  if (
    selectedIds.some((id) => acquiredById.get(id)?.version !== release.release) ||
    Object.keys(options.documents.items).some((id) => !selectedIds.includes(id))
  ) {
    throw vendorError(
      "Captured Stable item documents disagree with the resolved dependency closure.",
      "VENDOR_STABLE_SELECTION_INVALID",
    );
  }

  const artifacts = new Map<string, StableVendorSnapshotArtifact>();
  addStableSnapshotArtifact(artifacts, {
    path: "r/v1/catalog.json",
    digest: release.catalogDigest,
    mediaType: "application/json",
    content: catalogBytes,
  });
  const manifestPath = `r/v1/releases/${release.release}/manifest.json`;
  addStableSnapshotArtifact(artifacts, {
    path: manifestPath,
    digest: release.manifestDigest,
    mediaType: "application/json",
    content: manifestBytes,
  });

  const itemReferences: StableVendorEvidenceReference[] = [];
  const contractReferences: StableVendorEvidenceReference[] = [];
  const passportReferences: StableVendorEvidenceReference[] = [];
  for (const id of selectedIds) {
    const acquired = acquiredById.get(id)!;
    const manifestItem = manifest.items[id];
    const document = options.documents.items[id];
    if (manifestItem === undefined || document === undefined) {
      throw vendorError(
        `Stable vendor item ${id} is missing its verified manifest or payload snapshot.`,
        "VENDOR_STABLE_ARTIFACT_MISSING",
      );
    }
    const payloadBytes = stableCanonicalBytes(document, `Stable vendor item ${id}`);
    const payloadPath = stableProtocolPath(acquired.payloadUrl, `Stable vendor item ${id} URL`);
    const payloadArtifact = stableManifestArtifact(
      manifest,
      manifestItem.payload,
      `Stable vendor item ${id} payload`,
    );
    if (
      payloadPath !== `r/v1/releases/${release.release}/items/${id}.json` ||
      payloadPath !== payloadArtifact.path ||
      acquired.payloadDigest !== manifestItem.payload.digest ||
      sha256(payloadBytes) !== acquired.payloadDigest
    ) {
      throw vendorError(
        `Stable vendor item ${id} payload binding is invalid.`,
        "VENDOR_STABLE_DIGEST_MISMATCH",
        payloadPath,
      );
    }
    addStableSnapshotArtifact(artifacts, {
      path: payloadPath,
      digest: acquired.payloadDigest,
      mediaType: "application/json",
      content: payloadBytes,
    });
    itemReferences.push({
      id,
      artifact: acquired.payloadUrl,
      digest: acquired.payloadDigest,
    });
    contractReferences.push(manifestItem.contract);
    passportReferences.push(manifestItem.passport);

    for (const file of acquired.files) {
      if (file.sourceUrl === null) continue;
      const sourcePath = stableProtocolPath(
        file.sourceUrl,
        `Stable vendor item ${id} source ${file.logicalPath}`,
      );
      if (!sourcePath.startsWith(`r/v1/releases/${release.release}/files/`)) {
        throw vendorError(
          `Stable vendor item ${id} source leaves its exact release.`,
          "VENDOR_STABLE_ORIGIN_INVALID",
          sourcePath,
        );
      }
      addStableSnapshotArtifact(artifacts, {
        path: sourcePath,
        digest: file.digest,
        mediaType: file.mediaType,
        content: stableArtifactBytes(file),
      });
    }
  }

  const schemaArtifacts = [...manifest.artifactsByUrl.values()]
    .filter(({ path }) => path.startsWith("r/v1/schemas/") && path.endsWith(".schema.json"))
    .sort((left, right) => compareText(left.path, right.path));
  if (schemaArtifacts.length < 1 || schemaArtifacts.length > MAX_SCHEMAS) {
    throw vendorError(
      "Stable release schema inventory is missing or exceeds the bound.",
      "VENDOR_STABLE_REFERENCE_INVALID",
    );
  }
  const schemaReferences: StableVendorEvidenceReference[] = schemaArtifacts.map((artifact) => {
    const filename = artifact.path.split("/").at(-1)!;
    const id = filename.slice(0, -".schema.json".length);
    if (!ID_PATTERN.test(id)) {
      throw vendorError(
        `Stable schema path ${artifact.path} has an invalid identity.`,
        "VENDOR_STABLE_REFERENCE_INVALID",
      );
    }
    return { id, artifact: artifact.url, digest: artifact.digest };
  });

  const requiredEvidence = [
    ...schemaReferences.map((reference) => ({ kind: "schema" as const, reference })),
    ...contractReferences.map((reference) => ({ kind: "Contract" as const, reference })),
    ...passportReferences.map((reference) => ({ kind: "Passport" as const, reference })),
  ].sort((left, right) => compareText(left.reference.artifact, right.reference.artifact));
  const vendor =
    options.vendor ?? createStableAcquisitionVendorReader({ projectRoot: options.projectRoot });
  const sources: AcquisitionSource[] = [...release.artifactSources];
  let acquiredBytes = release.acquiredBytes;
  const acquiredEvidence = new Set<string>();
  for (const evidence of requiredEvidence) {
    const artifact = stableManifestArtifact(
      manifest,
      evidence.reference,
      `Stable vendor ${evidence.kind} ${evidence.reference.id}`,
    );
    if (acquiredEvidence.has(artifact.path)) continue;
    const acquired = await acquireImmutableArtifact({
      projectRoot: root,
      request: {
        registry: release.registry,
        path: artifact.path.slice("r/v1/".length),
        digest: artifact.digest,
        bytes: artifact.bytes,
        maxBytes: MAX_ARTIFACT_BYTES,
        acceptedMediaTypes: [artifact.mediaType],
        release: release.release,
      },
      offline: options.offline,
      vendor,
      transport: options.transport,
      validate: (bytes) => {
        if (artifact.mediaType === "application/json") {
          stableCanonicalJsonBytes(
            bytes,
            `Stable vendor ${evidence.kind} ${evidence.reference.id}`,
          );
        }
      },
    });
    const content = Buffer.from(acquired.bytes);
    addStableSnapshotArtifact(artifacts, {
      path: artifact.path,
      digest: artifact.digest,
      mediaType: artifact.mediaType,
      content,
    });
    acquiredEvidence.add(artifact.path);
    sources.push(acquired.source);
    acquiredBytes += content.byteLength;
    if (acquiredBytes > MAX_BUNDLE_BYTES) {
      throw vendorError(
        "Stable vendor acquisition exceeds the operation byte limit.",
        "VENDOR_STABLE_BUNDLE_OVERSIZE",
      );
    }
  }

  const npm =
    options.npmTarballs === undefined
      ? {
          artifacts: [] as readonly StableVendorSnapshotArtifact[],
          descriptors: [] as readonly StableVendorNpmTarballDescriptor[],
          omissions: [] as readonly string[],
          enrolledOrigins: [] as readonly StableNpmRegistryOriginPolicy[],
          acquiredBytes: 0,
          sources: [] as readonly AcquisitionSource[],
        }
      : await acquireStableNpmTarballInventory({
          release: release.release,
          inventory: options.npmTarballs,
          fetcher: options.npmTarballFetcher,
          offline: options.offline,
        });
  for (const artifact of npm.artifacts) addStableSnapshotArtifact(artifacts, artifact);
  acquiredBytes += npm.acquiredBytes;
  sources.push(...npm.sources);
  if (acquiredBytes > MAX_BUNDLE_BYTES) {
    throw vendorError(
      "Stable vendor acquisition exceeds the operation byte limit.",
      "VENDOR_STABLE_BUNDLE_OVERSIZE",
    );
  }

  const sortedReferences = (references: readonly StableVendorEvidenceReference[]) =>
    [...references].sort((left, right) => compareText(left.artifact, right.artifact));
  const snapshot = freezeStableSnapshotValue<StableVendorSnapshot>({
    projectRoot: root,
    release,
    selectionMode: options.selectionMode,
    selectionRequested,
    artifacts: [...artifacts.values()].sort((left, right) => compareText(left.path, right.path)),
    releaseManifest: {
      id: "release-manifest",
      artifact: `${OFFICIAL_REGISTRY_ORIGIN}/releases/${release.release}/manifest.json`,
      digest: release.manifestDigest,
    },
    items: sortedReferences(itemReferences),
    schemas: sortedReferences(schemaReferences),
    contracts: sortedReferences(contractReferences),
    passports: sortedReferences(passportReferences),
    npmRegistryOrigins: npm.enrolledOrigins,
    npmCoverage: options.npmTarballs === undefined ? "not-requested" : "complete",
    npmTarballs: npm.descriptors,
    npmTarballOmissions: npm.omissions,
    acquiredBytes,
    acquisitionSource: stableAggregateSource(sources),
    ...(options.commandArguments === undefined
      ? {}
      : { commandArguments: [...options.commandArguments] }),
  });
  AUTHENTIC_STABLE_VENDOR_SNAPSHOTS.add(snapshot);
  return snapshot;
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

function parseManifestItem(
  qualifiedId: string,
  value: unknown,
  allowStableRelease: boolean,
): ProjectManifestItem {
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
  const resolved = value.resolved as string;
  if (
    resolved !== UNRELEASED_VERSION &&
    (!allowStableRelease || !STABLE_RELEASE_PATTERN.test(resolved))
  ) {
    throw vendorError(
      `Installed item ${qualifiedId} requires its published release manifest; none may be fabricated from local state.`,
      "VENDOR_RELEASE_ARTIFACT_REQUIRED",
      PROJECT_MANIFEST,
    );
  }
  const payloadUrl = secureDeclaredUrl(value.payload.url, `${qualifiedId} payload origin`);
  if (payloadUrl !== `${OFFICIAL_REGISTRY_ORIGIN}/releases/${resolved}/items/${itemId}.json`) {
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
    resolved,
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

function readProjectState(projectRoot: string, allowStableRelease = false): ProjectState {
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
    .map(([id, item]) => [id, parseManifestItem(id, item, allowStableRelease)] as const);
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

function stableSha256Sums(artifacts: readonly StableVendorSnapshotArtifact[]): Buffer {
  return Buffer.from(
    `${artifacts
      .map(({ path, digest }) => `${digest.slice("sha256:".length)}  ${path}`)
      .join("\n")}\n`,
    "utf8",
  );
}

function buildStableTargetBytes(snapshot: StableVendorSnapshot): {
  readonly targetBytes: ReadonlyMap<string, Buffer>;
  readonly manifest: StableFormalVendorManifest;
} {
  if (snapshot.artifacts.length < 3 || snapshot.artifacts.length > MAX_BUNDLE_FILES - 2) {
    throw vendorError("Stable vendor artifact count is invalid.", "VENDOR_STABLE_BUNDLE_OVERSIZE");
  }
  const artifacts = [...snapshot.artifacts].sort((left, right) =>
    compareText(left.path, right.path),
  );
  const npmRegistryOrigins = validateStableNpmRegistryOriginPolicies(
    [...snapshot.npmRegistryOrigins].sort((left, right) => compareText(left.origin, right.origin)),
  );
  const npmTarballs = snapshot.npmTarballs.map((descriptor) =>
    validateStableNpmTarballDescriptor(descriptor, npmRegistryOrigins),
  );
  npmTarballs.sort((left, right) =>
    left.package === right.package
      ? compareText(left.version, right.version)
      : compareText(left.package, right.package),
  );
  const npmArtifacts = new Map<string, StableVendorNpmTarballDescriptor>();
  if (snapshot.npmCoverage === "not-requested" && npmTarballs.length !== 0) {
    throw vendorError(
      "A not-requested Stable npm coverage declaration cannot attach tarballs.",
      "VENDOR_STABLE_NPM_INVENTORY_MISMATCH",
    );
  }
  for (const descriptor of npmTarballs) {
    if (
      (descriptor.package === "mergora" ||
        descriptor.package.startsWith("mergora-") ||
        descriptor.package.startsWith("@mergora/")) &&
      descriptor.version !== snapshot.release.release
    ) {
      throw vendorError(
        `Stable npm tarball ${descriptor.package} is not bound to release ${snapshot.release.release}.`,
        "VENDOR_STABLE_NPM_RELEASE_INVALID",
      );
    }
    const path = stableNpmTarballInternalPath(descriptor.package, descriptor.version);
    const identity = path.normalize("NFKC").toLocaleLowerCase("en-US");
    if (
      [...npmArtifacts.keys()].some(
        (entry) => entry.normalize("NFKC").toLocaleLowerCase("en-US") === identity,
      )
    ) {
      throw vendorError(
        `Stable npm tarball inventory collides at ${path}.`,
        "VENDOR_STABLE_NPM_PATH_COLLISION",
      );
    }
    npmArtifacts.set(path, descriptor);
  }
  const identities = new Set<string>();
  const observedNpmArtifacts = new Set<string>();
  let artifactBytes = 0;
  for (const artifact of artifacts) {
    assertPortableRelativePath(artifact.path, "Stable vendor artifact path");
    const npmDescriptor = npmArtifacts.get(artifact.path);
    if (
      (!artifact.path.startsWith("r/v1/") && npmDescriptor === undefined) ||
      !MEDIA_TYPE_PATTERN.test(artifact.mediaType) ||
      (npmDescriptor !== undefined && artifact.mediaType !== "application/gzip")
    ) {
      throw vendorError(
        `Stable vendor artifact ${artifact.path} has unsafe metadata.`,
        "VENDOR_STABLE_PATH_UNSAFE",
        artifact.path,
      );
    }
    const identity = artifact.path.normalize("NFKC").toLocaleLowerCase("en-US");
    if (identities.has(identity)) {
      throw vendorError(
        `Stable vendor artifact ${artifact.path} has a portable path collision.`,
        "VENDOR_STABLE_PATH_COLLISION",
        artifact.path,
      );
    }
    identities.add(identity);
    if (
      artifact.content.byteLength >
        (npmDescriptor === undefined ? MAX_ARTIFACT_BYTES : MAX_NPM_TARBALL_BYTES) ||
      sha256(artifact.content) !== artifact.digest
    ) {
      throw vendorError(
        `Stable vendor artifact ${artifact.path} changed after acquisition.`,
        "VENDOR_STABLE_DIGEST_MISMATCH",
        artifact.path,
      );
    }
    if (npmDescriptor !== undefined) {
      if (artifact.digest !== npmDescriptor.digest) {
        throw vendorError(
          `Stable npm tarball ${npmDescriptor.package}@${npmDescriptor.version} changed after acquisition.`,
          "VENDOR_STABLE_NPM_DIGEST_MISMATCH",
          artifact.path,
        );
      }
      validateStableNpmTarballBytes(npmDescriptor, artifact.content);
      observedNpmArtifacts.add(artifact.path);
    }
    artifactBytes += artifact.content.byteLength;
  }
  if (
    observedNpmArtifacts.size !== npmArtifacts.size ||
    [...npmArtifacts.keys()].some((path) => !observedNpmArtifacts.has(path))
  ) {
    throw vendorError(
      "Stable npm tarball inventory is missing a descriptor-bound artifact.",
      "VENDOR_STABLE_NPM_MISSING",
    );
  }
  if (artifactBytes > MAX_BUNDLE_BYTES) {
    throw vendorError(
      "Stable vendor artifact bytes exceed the bundle limit.",
      "VENDOR_STABLE_BUNDLE_OVERSIZE",
    );
  }
  const sums = stableSha256Sums(artifacts);
  const manifest: StableFormalVendorManifest = {
    schemaVersion: 1,
    format: VENDOR_FORMAT,
    registry: {
      id: "official",
      origin: OFFICIAL_REGISTRY_ORIGIN,
      identityDigest: snapshot.release.registry.identityDigest,
    },
    release: snapshot.release.release,
    selection: {
      mode: snapshot.selectionMode,
      requested: snapshot.selectionRequested,
    },
    releaseManifest: snapshot.releaseManifest,
    items: snapshot.items,
    schemas: snapshot.schemas,
    contracts: snapshot.contracts,
    passports: snapshot.passports,
    ...(npmRegistryOrigins.length === 0 ? {} : { npmRegistryOrigins }),
    npmCoverage: snapshot.npmCoverage,
    npmTarballs,
    dependencyGraphDigest: snapshot.release.dependencyGraphDigest,
    sha256SumsDigest: sha256(sums),
  };
  assertManifestHygiene(manifest);
  const targetBytes = new Map<string, Buffer>();
  for (const artifact of artifacts) {
    targetBytes.set(`${VENDOR_ROOT}/${artifact.path}`, Buffer.from(artifact.content));
  }
  targetBytes.set(VENDOR_SUMS, sums);
  targetBytes.set(VENDOR_MANIFEST, canonicalBytes(manifest));
  const total = [...targetBytes.values()].reduce((sum, bytes) => sum + bytes.byteLength, 0);
  if (
    sums.byteLength > MAX_JSON_BYTES ||
    targetBytes.get(VENDOR_MANIFEST)!.byteLength > MAX_JSON_BYTES ||
    total > MAX_BUNDLE_BYTES
  ) {
    throw vendorError(
      "Stable vendor output exceeds its manifest, checksum, or total byte limit.",
      "VENDOR_STABLE_BUNDLE_OVERSIZE",
    );
  }
  return { targetBytes, manifest };
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
  verifyVendorBundle({ projectRoot: root });
  return files;
}

function currentDigest(root: string, target: string): Digest | null {
  const maximumBytes = target.startsWith(`${VENDOR_ROOT}/npm/tarballs/`)
    ? MAX_NPM_TARBALL_BYTES
    : MAX_ARTIFACT_BYTES;
  const bytes = readProjectBytes(root, target, `Vendor target ${target}`, maximumBytes, true);
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
  const plan = finalizeOperationPlan({
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
    acceptedConsents: [],
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

function buildStableBundle(snapshot: StableVendorSnapshot): BuiltStableBundle {
  assertAuthenticStableVendorSnapshot(snapshot);
  const project = readProjectState(snapshot.projectRoot, true);
  if (project.root !== snapshot.projectRoot) {
    throw vendorError(
      "Stable vendor snapshot project root changed before planning.",
      "VENDOR_STABLE_SNAPSHOT_INVALID",
    );
  }
  const built = buildStableTargetBytes(snapshot);
  const existingStable = verifyStableVendorBundle({ projectRoot: project.root });
  if (
    existingStable !== null &&
    existingStable.release === snapshot.release.release &&
    (existingStable.catalogDigest !== snapshot.release.catalogDigest ||
      existingStable.releaseManifestDigest !== snapshot.release.manifestDigest)
  ) {
    throw vendorError(
      "A valid Stable vendor bundle already binds this release to different immutable bytes.",
      "VENDOR_STABLE_RELEASE_MUTATION_REFUSED",
      VENDOR_ROOT,
    );
  }
  const existing = existingBundleFiles(project.root);
  const expectedRelative = new Set(
    [...built.targetBytes.keys()].map((target) => target.slice(`${VENDOR_ROOT}/`.length)),
  );
  const stale = existing.filter((target) => !expectedRelative.has(target));
  if (stale.length > 0) {
    throw vendorError(
      `Existing valid vendor selection contains stale artifact ${stale[0]}; replacing a release, format, or shrinking selection requires explicit cleanup.`,
      "VENDOR_REPLACEMENT_REQUIRES_CLEAN",
      relativeVendorTarget(stale[0]!),
    );
  }
  const operations: OperationPlanFile[] = [];
  const mutations: TransactionMutation[] = [];
  const observedTargets: Record<string, Digest | null> = {};
  const mediaTypes = new Map(
    snapshot.artifacts.map((artifact) => [`${VENDOR_ROOT}/${artifact.path}`, artifact.mediaType]),
  );
  for (const [target, content] of [...built.targetBytes.entries()].sort(([left], [right]) =>
    compareText(left, right),
  )) {
    const local = currentDigest(project.root, target);
    const proposed = sha256(content);
    const unchanged = local === proposed;
    observedTargets[target] = local;
    operations.push({
      operation: unchanged ? "no-op" : local === null ? "add" : "fast-forward",
      target,
      owner: ownerFor(target),
      base: local,
      local,
      remote: proposed,
      proposed,
      mediaType: mediaTypes.get(target) ?? mediaType(target),
      risk: "ordinary",
      reason: unchanged
        ? "The exact Stable vendor artifact already matches the deterministic plan."
        : target === VENDOR_MANIFEST
          ? "Commit the formal Stable vendor manifest after every immutable artifact."
          : "Copy a digest-verified immutable release artifact into the offline bundle.",
    });
    if (!unchanged) mutations.push({ target, content, beforeDigest: local });
  }
  if (mutations.length > 0) {
    const ordered = [...mutations].sort((left, right) => compareText(left.target, right.target));
    if (ordered.at(-1)?.target !== VENDOR_MANIFEST) {
      throw vendorError(
        "Stable vendor manifest cannot be committed last by the transaction plan.",
        "VENDOR_PLAN_INVALID",
      );
    }
  }
  const direct = new Set(
    snapshot.selectionMode === "all" ? snapshot.release.resolvedItems : snapshot.selectionRequested,
  );
  const plan = finalizeOperationPlan({
    schemaVersion: 1,
    command: "vendor",
    cliVersion: CLI_VERSION,
    projectRoot: ".",
    configDigest: project.configDigest,
    manifestPreconditionDigest: project.manifestDigest,
    registries: [
      {
        id: "official",
        identityDigest: snapshot.release.registry.identityDigest,
        release: snapshot.release.release,
        manifestDigest: snapshot.release.manifestDigest,
        source: snapshot.acquisitionSource,
        trust: "official",
        evidenceTier: "complete",
      },
    ],
    items: snapshot.release.resolvedItems.map((id) => ({
      id: `official:${id}`,
      direct: direct.has(id),
      requested: `=${snapshot.release.release}`,
      fromVersion: snapshot.release.release,
      toVersion: snapshot.release.release,
      mode: "source",
    })),
    fileOperations: operations,
    dependencyChanges: [],
    structuredPatches: [],
    migrations: [],
    contractChanges: snapshot.release.items.map((item) => ({
      item: `official:${item.itemId}`,
      from: null,
      to: item.contract.version,
    })),
    warnings: [
      `This bundle is bound to official Stable release ${snapshot.release.release}; mutable aliases and cache metadata are excluded.`,
      ...(snapshot.npmTarballs.length === 0
        ? ["Exact npm tarballs were not requested or were explicitly omitted."]
        : [
            `${String(snapshot.npmTarballs.length)} exact npm tarball${snapshot.npmTarballs.length === 1 ? " is" : "s are"} included with SHA-256, SHA-512 SRI, license, and package-metadata verification.`,
          ]),
      ...snapshot.npmTarballOmissions.map((omission) => `Exact npm tarball omitted: ${omission}.`),
    ],
    consentRequirements: [],
    conflicts: [],
    estimatedBytes: {
      download: snapshot.acquiredBytes,
      write: mutations.reduce((total, mutation) => total + (mutation.content?.byteLength ?? 0), 0),
    },
    validationSuite: ["schema", "digest", "path", "collision", "dependency"],
    rollbackAvailable: true,
  });
  return {
    plan,
    mutations,
    observedTargets,
    targetBytes: built.targetBytes,
    root: project.root,
    snapshot,
  };
}

export function planStableVendor(snapshot: StableVendorSnapshot): StableVendorPlan {
  return buildStableBundle(snapshot).plan;
}

export function applyStableVendor(
  snapshot: StableVendorSnapshot,
  expectedPlanDigest: string,
): StableVendorResult {
  const built = buildStableBundle(snapshot);
  if (expectedPlanDigest !== built.plan.planDigest) {
    throw new CliError("Stable vendor plan changed before apply; review a fresh plan.", {
      code: "PLAN_PRECONDITION_STALE",
      exitCode: 8,
    });
  }
  const bundleFiles = new Map<string, Uint8Array>();
  for (const [target, bytes] of built.targetBytes) {
    if (!target.startsWith(`${VENDOR_ROOT}/`)) {
      throw vendorError(
        "Stable vendor plan contains a target outside its bundle root.",
        "VENDOR_STABLE_PATH_UNSAFE",
        target,
      );
    }
    bundleFiles.set(target.slice(`${VENDOR_ROOT}/`.length), bytes);
  }
  verifyStableVendorBundleBytes({
    projectRoot: built.root,
    files: bundleFiles,
  });
  const transaction = executeTransaction({
    root: built.root,
    plan: built.plan,
    acceptedConsents: [],
    mutations: built.mutations,
    observedTargets: built.observedTargets,
    packageManagerRequired: false,
    offline: true,
    commandArguments: snapshot.commandArguments,
  });
  const verification = verifyStableVendorBundle({ projectRoot: built.root });
  if (verification === null) {
    throw vendorError(
      "Committed Stable vendor output did not retain its formal provenance.",
      "VENDOR_STABLE_VERIFICATION_FAILED",
      VENDOR_ROOT,
    );
  }
  return {
    mode: "offline-vendor",
    root: VENDOR_ROOT,
    items: snapshot.release.resolvedItems.map((id) => `official:${id}`),
    release: snapshot.release.release,
    planDigest: built.plan.planDigest,
    transaction,
    verification,
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

export type VendorBundleVerificationResult =
  VendorVerificationResult | StableVendorVerificationResult;

/** Detects and verifies either supported vendor provenance without network or writes. */
export function verifyVendorBundle(options: VendorVerifyOptions): VendorBundleVerificationResult {
  const stable = verifyStableVendorBundle(options);
  return stable ?? verifyVendor(options);
}
