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
import { createHash } from "node:crypto";
import { resolve } from "node:path";
import { gunzipSync } from "node:zlib";

import type { AcquisitionVendorReader, ImmutableArtifactRequest } from "./acquisition.js";
import {
  assertNoSymlinkAncestors,
  assertPortableRelativePath,
  canonicalJson,
  CliError,
  resolveInside,
  sha256,
  validatedProjectRoot,
} from "./contracts.js";
import { OFFICIAL_REGISTRY_ORIGIN } from "./registry-data.js";

const DEFAULT_VENDOR_ROOT = ".mergora/vendor/v1" as const;
const VENDOR_MANIFEST = "vendor-manifest.json" as const;
const VENDOR_SUMS = "SHA256SUMS" as const;
const VENDOR_FORMAT = "mergora-vendor-v1" as const;
const MAX_MANIFEST_BYTES = 4 * 1024 * 1024;
const MAX_ARTIFACT_BYTES = 64 * 1024 * 1024;
const MAX_BUNDLE_BYTES = 64 * 1024 * 1024;
const MAX_NPM_TARBALL_BYTES = 16 * 1024 * 1024;
const MAX_NPM_TOTAL_INCLUDED_BYTES = 32 * 1024 * 1024;
const MAX_NPM_LICENSES = 128;
/** Aggregate output/work cap across every concatenated gzip member. */
const MAX_NPM_UNPACKED_BYTES = 64 * 1024 * 1024;
const MAX_NPM_GZIP_EXPANSION_RATIO = 256;
const MAX_NPM_GZIP_EXPANSION_SLACK_BYTES = 1024 * 1024;
const MAX_NPM_PACKAGE_MANIFEST_BYTES = 1024 * 1024;
const MAX_NPM_PACKAGE_METADATA_NODES = 8192;
const MAX_NPM_TAR_PATH_DEPTH = 64;
const MAX_STABLE_DEPENDENCY_GRAPH_DEPTH = 128;
const MAX_JSON_METADATA_NODES = 32_768;
const MAX_BUNDLE_FILES = 8192;
const MAX_DEPTH = 24;
const DIGEST = /^sha256:[a-f0-9]{64}$/u;
const ID = /^[a-z0-9]+(?:-[a-z0-9]+)*$/u;
const OFFICIAL_QUALIFIED_ID = /^official:([a-z0-9]+(?:-[a-z0-9]+)*)$/u;
const STABLE_SEMVER = /^(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)$/u;
const PACKAGE_NAME = /^(?:@[a-z0-9][a-z0-9._-]*\/)?[a-z0-9][a-z0-9._-]*$/u;
const SPDX = /^[A-Za-z0-9][A-Za-z0-9-.+]*(?: WITH [A-Za-z0-9][A-Za-z0-9-.+]*)?$/u;
const INTEGRITY = /^sha512-[A-Za-z0-9+/]+={0,2}$/u;
const OFFICIAL_NPM_REGISTRY_ORIGIN = "https://registry.npmjs.org" as const;
const CREDENTIAL_KEY =
  /(?:^|:)(?:_auth|_authToken|_password|authToken|npmAuthToken|password|token)$/iu;
const FORBIDDEN_EXECUTABLE_KEYS = new Set([
  "script",
  "scripts",
  "command",
  "commands",
  "postinstall",
  "preinstall",
  "hook",
  "hooks",
  "codemod",
  "eval",
  "wasm",
]);

type Digest = `sha256:${string}`;

export interface StableNpmRegistryOriginPolicy {
  readonly id: string;
  readonly origin: string;
  readonly identityDigest: Digest;
  readonly trust: "enrolled";
}

export interface StableVendorNpmTarballDescriptor {
  readonly package: string;
  readonly version: string;
  readonly url: string;
  readonly bytes: number;
  readonly digest: Digest;
  readonly integrity: `sha512-${string}`;
  readonly license: string;
}

interface StableVendorNpmTarballReference extends StableVendorNpmTarballDescriptor {
  readonly internalPath: string;
}

export interface StableVendorNpmTarballRequest extends StableVendorNpmTarballDescriptor {
  readonly maxBytes: number;
}

export type StableVendorNpmTarballReader = (
  request: StableVendorNpmTarballRequest,
) => Uint8Array | null | Promise<Uint8Array | null>;

interface StableEvidenceReference {
  readonly id: string;
  readonly artifact: string;
  readonly digest: Digest;
  readonly internalPath: string;
}

interface StableVendorManifest {
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
  readonly releaseManifest: StableEvidenceReference;
  readonly items: readonly StableEvidenceReference[];
  readonly schemas: readonly StableEvidenceReference[];
  readonly contracts: readonly StableEvidenceReference[];
  readonly passports: readonly StableEvidenceReference[];
  readonly npmRegistryOrigins: readonly StableNpmRegistryOriginPolicy[];
  readonly npmCoverage: "not-requested" | "complete";
  readonly npmTarballs: readonly StableVendorNpmTarballReference[];
  readonly dependencyGraphDigest: Digest;
  readonly sha256SumsDigest: Digest;
}

interface StableReleaseArtifactBinding {
  readonly digest: Digest;
  readonly url: string;
}

interface VerifiedStableVendor {
  readonly root: string;
  readonly vendorRoot: string;
  readonly release: string;
  readonly registryIdentityDigest: Digest;
  readonly inventory: ReadonlyMap<string, Digest>;
  readonly allowedAcquisitionPaths: ReadonlySet<string>;
  readonly npmTarballs: ReadonlyMap<string, StableVendorNpmTarballReference>;
  readonly verification: StableVendorVerificationResult;
}

export interface StableAcquisitionVendorReaderOptions {
  readonly projectRoot: string;
  /** Portable project-relative bundle root. Defaults to `.mergora/vendor/v1`. */
  readonly vendorRoot?: string | undefined;
}

export interface StableVendorVerificationResult {
  readonly schemaVersion: 1;
  readonly format: typeof VENDOR_FORMAT;
  readonly state: "valid";
  readonly root: string;
  readonly provenanceState: "stable-release";
  readonly releaseClaim: "exact";
  readonly release: string;
  readonly items: readonly string[];
  readonly npmCoverage: "not-requested" | "complete";
  readonly npmTarballs: number;
  readonly artifacts: number;
  readonly totalBytes: number;
  readonly manifestDigest: Digest;
  readonly sha256SumsDigest: Digest;
  readonly catalogDigest: Digest;
  readonly releaseManifestDigest: Digest;
  readonly networkUsed: false;
  readonly writePerformed: false;
}

function vendorReaderError(message: string, code: string, target?: string): CliError {
  return new CliError(message, {
    code,
    exitCode: 5,
    ...(target === undefined ? {} : { target }),
  });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function exactKeys(value: Record<string, unknown>, expected: readonly string[]): boolean {
  const actual = Object.keys(value).sort((left, right) => left.localeCompare(right, "en-US"));
  const sortedExpected = [...expected].sort((left, right) => left.localeCompare(right, "en-US"));
  return (
    actual.length === sortedExpected.length &&
    actual.every((key, index) => key === sortedExpected[index])
  );
}

function secureRegistryOrigin(value: unknown, label: string): string {
  if (typeof value !== "string" || value.length > 2048) {
    throw vendorReaderError(`${label} is invalid.`, "VENDOR_STABLE_ORIGIN_INVALID");
  }
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    throw vendorReaderError(`${label} is invalid.`, "VENDOR_STABLE_ORIGIN_INVALID");
  }
  if (
    parsed.protocol !== "https:" ||
    parsed.username !== "" ||
    parsed.password !== "" ||
    parsed.search !== "" ||
    parsed.hash !== "" ||
    parsed.pathname !== "/" ||
    parsed.origin !== value
  ) {
    throw vendorReaderError(
      `${label} must be a credential-free canonical HTTPS origin.`,
      "VENDOR_STABLE_ORIGIN_INVALID",
    );
  }
  return value;
}

function parseNpmRegistryOrigins(value: unknown): readonly StableNpmRegistryOriginPolicy[] {
  if (value === undefined) return [];
  if (!Array.isArray(value) || value.length > 32) {
    throw vendorReaderError(
      "Vendor npm registry origin inventory is invalid.",
      "VENDOR_STABLE_SCHEMA_INVALID",
    );
  }
  const origins = value.map((entry, index) => {
    const label = `Vendor npm registry origin ${String(index)}`;
    if (
      !isRecord(entry) ||
      !exactKeys(entry, ["id", "identityDigest", "origin", "trust"]) ||
      typeof entry.id !== "string" ||
      !ID.test(entry.id) ||
      entry.trust !== "enrolled"
    ) {
      throw vendorReaderError(`${label} is invalid.`, "VENDOR_STABLE_SCHEMA_INVALID");
    }
    const origin = secureRegistryOrigin(entry.origin, `${label} origin`);
    if (origin === OFFICIAL_NPM_REGISTRY_ORIGIN) {
      throw vendorReaderError(
        `${label} duplicates the compiled public npm origin.`,
        "VENDOR_STABLE_ORIGIN_INVALID",
      );
    }
    return {
      id: entry.id,
      origin,
      identityDigest: digest(entry.identityDigest, `${label} identity`),
      trust: "enrolled" as const,
    };
  });
  const sorted = [...origins].sort((left, right) =>
    left.origin.localeCompare(right.origin, "en-US"),
  );
  if (canonicalJson(origins) !== canonicalJson(sorted)) {
    throw vendorReaderError(
      "Vendor npm registry origins are not canonically sorted.",
      "VENDOR_STABLE_SCHEMA_INVALID",
    );
  }
  const identities = new Set<string>();
  for (const origin of origins) {
    const identity = origin.origin.toLocaleLowerCase("en-US");
    if (identities.has(identity)) {
      throw vendorReaderError(
        "Vendor npm registry origin inventory repeats an origin.",
        "VENDOR_STABLE_SCHEMA_INVALID",
      );
    }
    identities.add(identity);
  }
  return origins;
}

function stableNpmIntegrity(value: unknown, label: string): `sha512-${string}` {
  if (typeof value !== "string" || !INTEGRITY.test(value)) {
    throw vendorReaderError(`${label} is invalid.`, "VENDOR_STABLE_SCHEMA_INVALID");
  }
  const encoded = value.slice("sha512-".length);
  const decoded = Buffer.from(encoded, "base64");
  if (decoded.byteLength !== 64 || decoded.toString("base64") !== encoded) {
    throw vendorReaderError(
      `${label} is not canonical SHA-512 SRI.`,
      "VENDOR_STABLE_SCHEMA_INVALID",
    );
  }
  return value as `sha512-${string}`;
}

function assertNpmTarballUrl(
  value: unknown,
  packageName: string,
  version: string,
  origins: readonly StableNpmRegistryOriginPolicy[],
  label: string,
): string {
  if (typeof value !== "string" || value.length > 2048) {
    throw vendorReaderError(`${label} is invalid.`, "VENDOR_STABLE_ORIGIN_INVALID");
  }
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    throw vendorReaderError(`${label} is invalid.`, "VENDOR_STABLE_ORIGIN_INVALID");
  }
  const allowed =
    parsed.origin === OFFICIAL_NPM_REGISTRY_ORIGIN ||
    origins.some(({ origin }) => origin === parsed.origin);
  if (
    !allowed ||
    parsed.protocol !== "https:" ||
    parsed.username !== "" ||
    parsed.password !== "" ||
    parsed.search !== "" ||
    parsed.hash !== "" ||
    parsed.href !== value ||
    /%2f|%5c/iu.test(parsed.pathname)
  ) {
    throw vendorReaderError(
      `${label} must use a credential-free approved npm registry origin.`,
      "VENDOR_STABLE_ORIGIN_INVALID",
    );
  }
  const unscopedName = packageName.includes("/") ? packageName.split("/")[1]! : packageName;
  const expected = packageName.startsWith("@")
    ? `/${packageName}/-/${unscopedName}-${version}.tgz`
    : `/${packageName}/-/${packageName}-${version}.tgz`;
  if (parsed.pathname !== expected) {
    throw vendorReaderError(
      `${label} is not the immutable npm tarball path for ${packageName}@${version}.`,
      "VENDOR_STABLE_ORIGIN_INVALID",
    );
  }
  return value;
}

/** Deterministic portable storage path for an exact npm package identity. */
export function stableNpmTarballInternalPath(packageName: string, version: string): string {
  if (!PACKAGE_NAME.test(packageName) || !STABLE_SEMVER.test(version)) {
    throw vendorReaderError(
      "Stable npm tarball package identity is invalid.",
      "VENDOR_STABLE_SCHEMA_INVALID",
    );
  }
  const path = packageName.startsWith("@")
    ? `npm/tarballs/scoped/${packageName.slice(1)}/${version}.tgz`
    : `npm/tarballs/unscoped/${packageName}/${version}.tgz`;
  safeRelativePath(path, "Stable npm tarball path");
  return path;
}

function parseNpmTarballDescriptor(
  value: unknown,
  index: number,
  origins: readonly StableNpmRegistryOriginPolicy[],
): StableVendorNpmTarballReference {
  const label = `Vendor npm tarball ${String(index)}`;
  if (
    !isRecord(value) ||
    !exactKeys(value, ["bytes", "digest", "integrity", "license", "package", "url", "version"]) ||
    typeof value.package !== "string" ||
    !PACKAGE_NAME.test(value.package) ||
    value.package !== value.package.normalize("NFKC") ||
    typeof value.version !== "string" ||
    !STABLE_SEMVER.test(value.version) ||
    !Number.isSafeInteger(value.bytes) ||
    Number(value.bytes) < 1 ||
    Number(value.bytes) > MAX_NPM_TARBALL_BYTES ||
    typeof value.license !== "string" ||
    !SPDX.test(value.license) ||
    value.license.length > 128
  ) {
    throw vendorReaderError(`${label} is invalid.`, "VENDOR_STABLE_SCHEMA_INVALID");
  }
  return {
    package: value.package,
    version: value.version,
    url: assertNpmTarballUrl(value.url, value.package, value.version, origins, `${label} URL`),
    bytes: Number(value.bytes),
    digest: digest(value.digest, `${label} digest`),
    integrity: stableNpmIntegrity(value.integrity, `${label} integrity`),
    license: value.license,
    internalPath: stableNpmTarballInternalPath(value.package, value.version),
  };
}

/** Validates and canonically orders explicit enrolled npm registry identities. */
export function validateStableNpmRegistryOriginPolicies(
  value: unknown,
): readonly StableNpmRegistryOriginPolicy[] {
  return parseNpmRegistryOrigins(value);
}

/** Validates one exact manifest descriptor against compiled and enrolled origins. */
export function validateStableNpmTarballDescriptor(
  value: unknown,
  origins: readonly StableNpmRegistryOriginPolicy[] = [],
): StableVendorNpmTarballDescriptor {
  const parsed = parseNpmTarballDescriptor(value, 0, origins);
  return {
    package: parsed.package,
    version: parsed.version,
    url: parsed.url,
    bytes: parsed.bytes,
    digest: parsed.digest,
    integrity: parsed.integrity,
    license: parsed.license,
  };
}

function tarPathField(bytes: Buffer, start: number, length: number, label: string): string {
  const field = bytes.subarray(start, start + length);
  const end = field.indexOf(0);
  if (end >= 0 && field.subarray(end + 1).some((byte) => byte !== 0)) {
    throw vendorReaderError(
      `${label} contains bytes after its NUL terminator.`,
      "VENDOR_STABLE_NPM_INVALID",
    );
  }
  const encoded = field.subarray(0, end < 0 ? field.length : end);
  const text = encoded.toString("ascii");
  if (encoded.some((byte) => byte < 0x20 || byte > 0x7e) || text !== text.trim()) {
    throw vendorReaderError(`${label} contains invalid tar metadata.`, "VENDOR_STABLE_NPM_INVALID");
  }
  return text;
}

function tarOctal(bytes: Buffer, start: number, length: number, label: string): number {
  const field = bytes.subarray(start, start + length);
  if (field.some((byte) => byte > 0x7f)) {
    throw vendorReaderError(`${label} has an invalid tar size.`, "VENDOR_STABLE_NPM_INVALID");
  }
  const match = /^[ ]*([0-7]+)(?:(?:\0[ \0]*)|[ ]*)$/u.exec(field.toString("ascii"));
  if (match === null) {
    throw vendorReaderError(`${label} has an invalid tar size.`, "VENDOR_STABLE_NPM_INVALID");
  }
  const parsed = Number.parseInt(match[1]!, 8);
  if (!Number.isSafeInteger(parsed) || parsed < 0) {
    throw vendorReaderError(`${label} has an unsafe tar size.`, "VENDOR_STABLE_NPM_INVALID");
  }
  return parsed;
}

function assertTarHeaderChecksum(header: Buffer, label: string): void {
  const stored = tarOctal(header, 148, 8, label);
  let actual = 0;
  for (let index = 0; index < header.length; index += 1) {
    actual += index >= 148 && index < 156 ? 32 : header[index]!;
  }
  if (stored !== actual) {
    throw vendorReaderError(`${label} checksum is invalid.`, "VENDOR_STABLE_NPM_INVALID");
  }
}

function safeTarPath(path: string, label: string): string {
  let segments: readonly string[];
  try {
    segments = assertPortableRelativePath(path, label);
  } catch {
    throw vendorReaderError(`${label} is unsafe.`, "VENDOR_STABLE_NPM_INVALID");
  }
  if (segments.length > MAX_NPM_TAR_PATH_DEPTH) {
    throw vendorReaderError(
      `${label} exceeds the supported archive path depth.`,
      "VENDOR_STABLE_NPM_INVALID",
    );
  }
  if (path !== "package" && !path.startsWith("package/")) {
    throw vendorReaderError(
      `${label} leaves the canonical npm package root.`,
      "VENDOR_STABLE_NPM_INVALID",
    );
  }
  return path;
}

type TarEntryKind = "directory" | "regular";

function normalizedTarPath(path: string): string {
  return path.normalize("NFKC").toLocaleLowerCase("en-US");
}

function assertTarTopology(
  entries: ReadonlyMap<string, TarEntryKind>,
  descendantParents: Set<string>,
  path: string,
  kind: TarEntryKind,
): string {
  const identity = normalizedTarPath(path);
  if (entries.has(identity)) {
    throw vendorReaderError(
      `Stable npm tarball contains duplicate or colliding path ${path}.`,
      "VENDOR_STABLE_NPM_PATH_COLLISION",
    );
  }
  const ancestors: string[] = [];
  let separator = identity.indexOf("/");
  while (separator >= 0) {
    const ancestor = identity.slice(0, separator);
    ancestors.push(ancestor);
    if (entries.get(ancestor) === "regular") {
      throw vendorReaderError(
        `Stable npm tarball regular file ${ancestor} cannot contain descendant ${path}.`,
        "VENDOR_STABLE_NPM_PATH_COLLISION",
      );
    }
    separator = identity.indexOf("/", separator + 1);
  }
  if (kind === "regular" && descendantParents.has(identity)) {
    throw vendorReaderError(
      `Stable npm tarball regular file ${path} cannot replace an implicit directory.`,
      "VENDOR_STABLE_NPM_PATH_COLLISION",
    );
  }
  for (const ancestor of ancestors) descendantParents.add(ancestor);
  return identity;
}

function withoutTrailingSlashes(path: string): string {
  let end = path.length;
  while (end > 0 && path.charCodeAt(end - 1) === 47) end -= 1;
  return path.slice(0, end);
}

function assertNoPackageCredentials(value: unknown, label: string): void {
  const pending: Array<{ readonly value: unknown; readonly depth: number }> = [{ value, depth: 0 }];
  let inspected = 0;
  while (pending.length > 0) {
    const current = pending.pop()!;
    inspected += 1;
    if (current.depth > MAX_DEPTH || inspected > MAX_NPM_PACKAGE_METADATA_NODES) {
      throw vendorReaderError(
        `${label} exceeds its metadata complexity bound.`,
        "VENDOR_STABLE_NPM_INVALID",
      );
    }
    if (Array.isArray(current.value)) {
      for (const entry of current.value) {
        pending.push({ value: entry, depth: current.depth + 1 });
      }
      continue;
    }
    if (!isRecord(current.value)) continue;
    for (const [key, entry] of Object.entries(current.value)) {
      if (CREDENTIAL_KEY.test(key)) {
        throw vendorReaderError(
          `${label} contains credential-bearing metadata.`,
          "VENDOR_STABLE_NPM_CREDENTIALS_REJECTED",
        );
      }
      if (typeof entry === "string" && /^[a-z][a-z0-9+.-]*:\/\/[^/@\s]+@/iu.test(entry)) {
        throw vendorReaderError(
          `${label} contains a credential-bearing URL.`,
          "VENDOR_STABLE_NPM_CREDENTIALS_REJECTED",
        );
      }
      pending.push({ value: entry, depth: current.depth + 1 });
    }
  }
}

function parsePaxPath(bytes: Buffer, label: string): string {
  const text = fatalUtf8(bytes, label);
  if (/[^\x20-\x7e\n]/u.test(text)) {
    throw vendorReaderError(`${label} is invalid.`, "VENDOR_STABLE_NPM_INVALID");
  }
  let offset = 0;
  let path: string | null = null;
  while (offset < text.length) {
    const space = text.indexOf(" ", offset);
    if (space < 0) {
      throw vendorReaderError(`${label} is invalid.`, "VENDOR_STABLE_NPM_INVALID");
    }
    const lengthText = text.slice(offset, space);
    const length = Number(lengthText);
    if (!Number.isSafeInteger(length) || length < 4 || offset + length > text.length) {
      throw vendorReaderError(`${label} is invalid.`, "VENDOR_STABLE_NPM_INVALID");
    }
    if (!/^[1-9][0-9]*$/u.test(lengthText)) {
      throw vendorReaderError(`${label} is invalid.`, "VENDOR_STABLE_NPM_INVALID");
    }
    const record = text.slice(space + 1, offset + length);
    if (!record.endsWith("\n")) {
      throw vendorReaderError(`${label} is invalid.`, "VENDOR_STABLE_NPM_INVALID");
    }
    const equals = record.indexOf("=");
    const key = equals > 0 ? record.slice(0, equals) : "";
    if (key !== "path" || path !== null) {
      throw vendorReaderError(
        `${label} contains unsupported or duplicate PAX metadata.`,
        "VENDOR_STABLE_NPM_INVALID",
      );
    }
    path = record.slice(equals + 1, -1);
    offset += length;
  }
  if (path === null || path === "" || path !== path.trim()) {
    throw vendorReaderError(
      `${label} does not contain one exact path.`,
      "VENDOR_STABLE_NPM_INVALID",
    );
  }
  return path;
}

function parseGnuLongPath(bytes: Buffer, label: string): string {
  const end = bytes.indexOf(0);
  if (end >= 0 && bytes.subarray(end + 1).some((byte) => byte !== 0)) {
    throw vendorReaderError(
      `${label} contains bytes after its NUL terminator.`,
      "VENDOR_STABLE_NPM_INVALID",
    );
  }
  const path = fatalUtf8(bytes.subarray(0, end < 0 ? bytes.length : end), label);
  if (path === "" || path !== path.trim()) {
    throw vendorReaderError(`${label} contains an ambiguous path.`, "VENDOR_STABLE_NPM_INVALID");
  }
  return path;
}

/**
 * Verifies exact hashes and inspects the archive's package metadata without
 * executing package code. Lifecycle scripts, implicit node-gyp installs,
 * unsafe archive entries, and credential-bearing metadata are rejected.
 */
export function validateStableNpmTarballBytes(
  descriptor: StableVendorNpmTarballDescriptor,
  bytes: Uint8Array,
  maximumBytes = MAX_NPM_TARBALL_BYTES,
): void {
  if (
    !Number.isSafeInteger(maximumBytes) ||
    maximumBytes < 1 ||
    maximumBytes > MAX_NPM_TARBALL_BYTES
  ) {
    throw vendorReaderError(
      "Stable npm tarball byte bound is invalid.",
      "VENDOR_STABLE_NPM_OVERSIZE",
    );
  }
  const content = Buffer.from(bytes);
  if (
    content.byteLength < 1 ||
    content.byteLength > maximumBytes ||
    content.byteLength !== descriptor.bytes
  ) {
    throw vendorReaderError(
      `Stable npm tarball ${descriptor.package}@${descriptor.version} exceeds its byte bound.`,
      "VENDOR_STABLE_NPM_OVERSIZE",
    );
  }
  if (sha256(content) !== descriptor.digest) {
    throw vendorReaderError(
      `Stable npm tarball ${descriptor.package}@${descriptor.version} failed SHA-256 verification.`,
      "VENDOR_STABLE_NPM_DIGEST_MISMATCH",
    );
  }
  const integrity = `sha512-${createHash("sha512").update(content).digest("base64")}`;
  if (integrity !== descriptor.integrity) {
    throw vendorReaderError(
      `Stable npm tarball ${descriptor.package}@${descriptor.version} failed SRI verification.`,
      "VENDOR_STABLE_NPM_INTEGRITY_MISMATCH",
    );
  }
  let archive: Buffer;
  const expansionBound = Math.min(
    MAX_NPM_UNPACKED_BYTES,
    content.byteLength * MAX_NPM_GZIP_EXPANSION_RATIO + MAX_NPM_GZIP_EXPANSION_SLACK_BYTES,
  );
  try {
    archive = gunzipSync(content, { maxOutputLength: expansionBound });
  } catch {
    throw vendorReaderError(
      `Stable npm tarball ${descriptor.package}@${descriptor.version} is not a bounded gzip archive.`,
      "VENDOR_STABLE_NPM_INVALID",
    );
  }
  const entries = new Map<string, TarEntryKind>();
  const descendantParents = new Set<string>();
  let offset = 0;
  let unpackedWork = 0;
  let entryCount = 0;
  let pendingPath: string | null = null;
  let packageManifest: Record<string, unknown> | null = null;
  let reachedEnd = false;
  while (offset + 512 <= archive.byteLength) {
    const header = archive.subarray(offset, offset + 512);
    if (header.every((byte) => byte === 0)) {
      if (
        pendingPath !== null ||
        offset + 1024 > archive.byteLength ||
        !archive.subarray(offset, offset + 1024).every((byte) => byte === 0) ||
        !archive.subarray(offset).every((byte) => byte === 0)
      ) {
        throw vendorReaderError(
          `Stable npm tarball ${descriptor.package}@${descriptor.version} has an invalid terminator.`,
          "VENDOR_STABLE_NPM_INVALID",
        );
      }
      reachedEnd = true;
      break;
    }
    assertTarHeaderChecksum(header, `Stable npm tarball ${descriptor.package}`);
    const name = tarPathField(header, 0, 100, "Stable npm tar header name");
    const prefix = tarPathField(header, 345, 155, "Stable npm tar header prefix");
    const headerPath = prefix === "" ? name : `${prefix}/${name}`;
    const size = tarOctal(header, 124, 12, "Stable npm tar header");
    const type = String.fromCharCode(header[156] ?? 0);
    const dataStart = offset + 512;
    const dataEnd = dataStart + size;
    const next = dataStart + Math.ceil(size / 512) * 512;
    if (dataEnd > archive.byteLength || next > archive.byteLength) {
      throw vendorReaderError(
        `Stable npm tarball ${descriptor.package}@${descriptor.version} is truncated.`,
        "VENDOR_STABLE_NPM_INVALID",
      );
    }
    unpackedWork += next - offset;
    if (unpackedWork > MAX_NPM_UNPACKED_BYTES) {
      throw vendorReaderError(
        `Stable npm tarball ${descriptor.package}@${descriptor.version} exceeds its aggregate unpacked-work bound.`,
        "VENDOR_STABLE_NPM_INVALID",
      );
    }
    const data = archive.subarray(dataStart, dataEnd);
    entryCount += 1;
    if (entryCount > MAX_BUNDLE_FILES) {
      throw vendorReaderError(
        `Stable npm tarball ${descriptor.package}@${descriptor.version} exceeds its entry-count bound.`,
        "VENDOR_STABLE_NPM_INVALID",
      );
    }
    if (type === "x") {
      if (pendingPath !== null) {
        throw vendorReaderError(
          `Stable npm tarball ${descriptor.package}@${descriptor.version} has stacked path metadata.`,
          "VENDOR_STABLE_NPM_INVALID",
        );
      }
      const paxPath = parsePaxPath(data, "Stable npm PAX header");
      pendingPath = safeTarPath(paxPath, "Stable npm PAX path");
      offset = next;
      continue;
    }
    if (type === "L") {
      if (pendingPath !== null) {
        throw vendorReaderError(
          `Stable npm tarball ${descriptor.package}@${descriptor.version} has stacked path metadata.`,
          "VENDOR_STABLE_NPM_INVALID",
        );
      }
      const longPath = parseGnuLongPath(data, "Stable npm GNU long path");
      pendingPath = safeTarPath(longPath, "Stable npm GNU long path");
      offset = next;
      continue;
    }
    const rawPath = pendingPath ?? headerPath;
    const path = safeTarPath(
      type === "5" ? withoutTrailingSlashes(rawPath) : rawPath,
      "Stable npm archive path",
    );
    pendingPath = null;
    if (type !== "\0" && type !== "0" && type !== "5") {
      throw vendorReaderError(
        `Stable npm tarball contains unsupported link or special entry ${path}.`,
        "VENDOR_STABLE_NPM_INVALID",
      );
    }
    if (type === "5" && size !== 0) {
      throw vendorReaderError(
        `Stable npm tarball directory ${path} contains file data.`,
        "VENDOR_STABLE_NPM_INVALID",
      );
    }
    const kind: TarEntryKind = type === "5" ? "directory" : "regular";
    const identity = assertTarTopology(entries, descendantParents, path, kind);
    entries.set(identity, kind);
    if (entries.size > MAX_BUNDLE_FILES) {
      throw vendorReaderError(
        `Stable npm tarball ${descriptor.package}@${descriptor.version} exceeds its file-count bound.`,
        "VENDOR_STABLE_NPM_INVALID",
      );
    }
    if (/(?:^|\/)\.npmrc$|(?:^|\/)\.yarnrc(?:\.yml)?$|(?:^|\/)\.env(?:\.|$)/iu.test(path)) {
      throw vendorReaderError(
        `Stable npm tarball contains credential-bearing configuration ${path}.`,
        "VENDOR_STABLE_NPM_CREDENTIALS_REJECTED",
      );
    }
    if (identity === "package/binding.gyp") {
      throw vendorReaderError(
        "Stable npm tarball requests an implicit node-gyp install script.",
        "VENDOR_STABLE_NPM_SCRIPTS_REJECTED",
      );
    }
    if (path === "package/package.json") {
      if (
        kind !== "regular" ||
        packageManifest !== null ||
        data.byteLength > MAX_NPM_PACKAGE_MANIFEST_BYTES
      ) {
        throw vendorReaderError(
          "Stable npm tarball package manifest is duplicated or oversized.",
          "VENDOR_STABLE_NPM_INVALID",
        );
      }
      let parsed: unknown;
      try {
        parsed = JSON.parse(fatalUtf8(data, "Stable npm package manifest")) as unknown;
      } catch (error) {
        if (error instanceof CliError) throw error;
        throw vendorReaderError(
          "Stable npm tarball package manifest is invalid JSON.",
          "VENDOR_STABLE_NPM_INVALID",
        );
      }
      if (!isRecord(parsed)) {
        throw vendorReaderError(
          "Stable npm tarball package manifest must be an object.",
          "VENDOR_STABLE_NPM_INVALID",
        );
      }
      packageManifest = parsed;
    }
    offset = next;
  }
  if (!reachedEnd || archive.byteLength % 512 !== 0) {
    throw vendorReaderError(
      `Stable npm tarball ${descriptor.package}@${descriptor.version} is not canonically terminated.`,
      "VENDOR_STABLE_NPM_INVALID",
    );
  }
  if (
    packageManifest === null ||
    packageManifest.name !== descriptor.package ||
    packageManifest.version !== descriptor.version ||
    packageManifest.license !== descriptor.license
  ) {
    throw vendorReaderError(
      `Stable npm tarball metadata disagrees with ${descriptor.package}@${descriptor.version}.`,
      "VENDOR_STABLE_NPM_REFERENCE_MISMATCH",
    );
  }
  if (Object.hasOwn(packageManifest, "scripts") || Object.hasOwn(packageManifest, "gypfile")) {
    throw vendorReaderError(
      `Stable npm tarball ${descriptor.package}@${descriptor.version} contains executable lifecycle metadata.`,
      "VENDOR_STABLE_NPM_SCRIPTS_REJECTED",
    );
  }
  assertNoPackageCredentials(packageManifest, "Stable npm package manifest");
}

function fatalUtf8(bytes: Uint8Array, label: string): string {
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    throw vendorReaderError(`${label} is not valid UTF-8.`, "VENDOR_STABLE_ENCODING_INVALID");
  }
}

function assertJsonComplexity(value: unknown, label: string): void {
  const pending: Array<{ readonly value: unknown; readonly depth: number }> = [{ value, depth: 0 }];
  let nodes = 0;
  while (pending.length > 0) {
    const current = pending.pop()!;
    nodes += 1;
    if (current.depth > MAX_DEPTH || nodes > MAX_JSON_METADATA_NODES) {
      throw vendorReaderError(
        `${label} exceeds its JSON complexity bound.`,
        "VENDOR_STABLE_JSON_INVALID",
      );
    }
    if (Array.isArray(current.value)) {
      for (const entry of current.value) {
        pending.push({ value: entry, depth: current.depth + 1 });
      }
    } else if (isRecord(current.value)) {
      for (const entry of Object.values(current.value)) {
        pending.push({ value: entry, depth: current.depth + 1 });
      }
    }
  }
}

function canonicalDocument(bytes: Uint8Array, label: string): unknown {
  const text = fatalUtf8(bytes, label);
  let value: unknown;
  try {
    value = JSON.parse(text) as unknown;
  } catch {
    throw vendorReaderError(`${label} is not valid JSON.`, "VENDOR_STABLE_JSON_INVALID");
  }
  assertJsonComplexity(value, label);
  let canonical: string;
  try {
    canonical = canonicalJson(value);
  } catch {
    throw vendorReaderError(
      `${label} cannot be represented as canonical JSON.`,
      "VENDOR_STABLE_JSON_INVALID",
    );
  }
  if (text !== canonical && text !== `${canonical}\n`) {
    throw vendorReaderError(
      `${label} is not canonical JSON or contains duplicate keys.`,
      "VENDOR_STABLE_JSON_INVALID",
    );
  }
  return value;
}

function safeRelativePath(path: string, label: string): void {
  try {
    assertPortableRelativePath(path, label);
  } catch {
    throw vendorReaderError(
      `${label} is not a portable relative path.`,
      "VENDOR_STABLE_PATH_UNSAFE",
      path,
    );
  }
}

function safeRead(
  root: string,
  target: string,
  label: string,
  maximumBytes = MAX_ARTIFACT_BYTES,
): Buffer {
  safeRelativePath(target, label);
  assertNoSymlinkAncestors(root, target);
  const absolute = resolveInside(root, target, label);
  let before;
  try {
    before = lstatSync(absolute);
  } catch {
    throw vendorReaderError(`${label} is missing.`, "VENDOR_STABLE_ARTIFACT_MISSING", target);
  }
  if (before.isSymbolicLink() || !before.isFile()) {
    throw vendorReaderError(
      `${label} is not a regular no-follow file.`,
      "VENDOR_STABLE_PATH_UNSAFE",
      target,
    );
  }
  if (before.size > maximumBytes) {
    throw vendorReaderError(
      `${label} exceeds the supported byte limit.`,
      "VENDOR_STABLE_ARTIFACT_OVERSIZE",
      target,
    );
  }
  let descriptor: number | null = null;
  try {
    const noFollow = (constants as { readonly O_NOFOLLOW?: number }).O_NOFOLLOW ?? 0;
    descriptor = openSync(absolute, constants.O_RDONLY | noFollow);
    const opened = fstatSync(descriptor);
    const current = lstatSync(absolute);
    if (
      !opened.isFile() ||
      current.isSymbolicLink() ||
      !current.isFile() ||
      opened.dev !== current.dev ||
      opened.ino !== current.ino ||
      opened.size !== current.size ||
      opened.size > maximumBytes
    ) {
      throw vendorReaderError(
        `${label} changed during no-follow inspection.`,
        "VENDOR_STABLE_MUTATED",
        target,
      );
    }
    const bytes = readFileSync(descriptor);
    const after = fstatSync(descriptor);
    if (
      after.dev !== opened.dev ||
      after.ino !== opened.ino ||
      after.size !== opened.size ||
      bytes.byteLength !== opened.size
    ) {
      throw vendorReaderError(
        `${label} changed while it was read.`,
        "VENDOR_STABLE_MUTATED",
        target,
      );
    }
    return bytes;
  } catch (error) {
    if (error instanceof CliError) throw error;
    throw vendorReaderError(
      `${label} could not be read without following links.`,
      "VENDOR_STABLE_PATH_UNSAFE",
      target,
    );
  } finally {
    if (descriptor !== null) closeSync(descriptor);
  }
}

function secureArtifactPath(value: unknown, label: string): string {
  if (typeof value !== "string" || value.length > 2048) {
    throw vendorReaderError(`${label} is invalid.`, "VENDOR_STABLE_SCHEMA_INVALID");
  }
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    throw vendorReaderError(`${label} is invalid.`, "VENDOR_STABLE_SCHEMA_INVALID");
  }
  const prefix = `${OFFICIAL_REGISTRY_ORIGIN}/`;
  if (
    parsed.protocol !== "https:" ||
    parsed.username !== "" ||
    parsed.password !== "" ||
    parsed.search !== "" ||
    parsed.hash !== "" ||
    parsed.href !== value ||
    !value.startsWith(prefix)
  ) {
    throw vendorReaderError(
      `${label} must use the credential-free official protocol origin.`,
      "VENDOR_STABLE_ORIGIN_INVALID",
    );
  }
  const protocolRelative = value.slice(prefix.length);
  safeRelativePath(protocolRelative, label);
  if (protocolRelative.startsWith("r/v1/")) {
    throw vendorReaderError(`${label} repeats the protocol root.`, "VENDOR_STABLE_ORIGIN_INVALID");
  }
  return `r/v1/${protocolRelative}`;
}

function digest(value: unknown, label: string): Digest {
  if (typeof value !== "string" || !DIGEST.test(value)) {
    throw vendorReaderError(`${label} is not a SHA-256 digest.`, "VENDOR_STABLE_SCHEMA_INVALID");
  }
  return value as Digest;
}

function evidenceReference(value: unknown, label: string): StableEvidenceReference {
  if (!isRecord(value) || !exactKeys(value, ["artifact", "digest", "id"])) {
    throw vendorReaderError(`${label} is invalid.`, "VENDOR_STABLE_SCHEMA_INVALID");
  }
  if (
    typeof value.id !== "string" ||
    !ID.test(value.id) ||
    value.id !== value.id.normalize("NFKC")
  ) {
    throw vendorReaderError(`${label} has an invalid ID.`, "VENDOR_STABLE_SCHEMA_INVALID");
  }
  return {
    id: value.id,
    artifact: value.artifact as string,
    digest: digest(value.digest, `${label} digest`),
    internalPath: secureArtifactPath(value.artifact, `${label} artifact`),
  };
}

function evidenceReferences(
  value: unknown,
  label: string,
  maximum: number,
  minimum = 0,
): readonly StableEvidenceReference[] {
  if (!Array.isArray(value) || value.length < minimum || value.length > maximum) {
    throw vendorReaderError(`${label} inventory is invalid.`, "VENDOR_STABLE_SCHEMA_INVALID");
  }
  const parsed = value.map((entry, index) => evidenceReference(entry, `${label} ${String(index)}`));
  const sorted = [...parsed].sort((left, right) =>
    left.artifact.localeCompare(right.artifact, "en-US"),
  );
  if (canonicalJson(parsed) !== canonicalJson(sorted)) {
    throw vendorReaderError(
      `${label} inventory is not canonically sorted.`,
      "VENDOR_STABLE_SCHEMA_INVALID",
    );
  }
  const identities = new Set<string>();
  for (const entry of parsed) {
    const identity = entry.internalPath.normalize("NFKC").toLocaleLowerCase("en-US");
    if (identities.has(identity)) {
      throw vendorReaderError(
        `${label} inventory repeats an artifact.`,
        "VENDOR_STABLE_SCHEMA_INVALID",
      );
    }
    identities.add(identity);
  }
  return parsed;
}

function parseNpmTarballs(
  value: unknown,
  origins: readonly StableNpmRegistryOriginPolicy[],
): readonly StableVendorNpmTarballReference[] {
  if (!Array.isArray(value) || value.length > 1024) {
    throw vendorReaderError(
      "Vendor npm tarball inventory is invalid.",
      "VENDOR_STABLE_SCHEMA_INVALID",
    );
  }
  const tarballs = value.map((entry, index) => parseNpmTarballDescriptor(entry, index, origins));
  const sorted = [...tarballs].sort((left, right) =>
    left.package === right.package
      ? left.version.localeCompare(right.version, "en-US")
      : left.package.localeCompare(right.package, "en-US"),
  );
  if (canonicalJson(tarballs) !== canonicalJson(sorted)) {
    throw vendorReaderError(
      "Vendor npm tarball inventory is not canonically sorted.",
      "VENDOR_STABLE_SCHEMA_INVALID",
    );
  }
  const identities = new Set<string>();
  for (const tarball of tarballs) {
    const identity = tarball.internalPath.normalize("NFKC").toLocaleLowerCase("en-US");
    if (identities.has(identity)) {
      throw vendorReaderError(
        "Vendor npm tarball inventory repeats or collides on a package identity.",
        "VENDOR_STABLE_SCHEMA_INVALID",
      );
    }
    identities.add(identity);
  }
  return tarballs;
}

function isMergoraOwnedPackage(packageName: string): boolean {
  return (
    packageName === "mergora" ||
    packageName.startsWith("mergora-") ||
    packageName.startsWith("@mergora/")
  );
}

function releaseNpmPackageIncludes(
  value: unknown,
  release: string,
): ReadonlyMap<string, StableVendorNpmTarballDescriptor> | null {
  if (value === undefined) return null;
  if (!isRecord(value) || !exactKeys(value, ["allowedLicenses", "entries"])) {
    throw vendorReaderError(
      "Stable release npm package inventory is invalid.",
      "VENDOR_STABLE_NPM_INVENTORY_INVALID",
    );
  }
  if (!Array.isArray(value.allowedLicenses) || value.allowedLicenses.length > MAX_NPM_LICENSES) {
    throw vendorReaderError(
      "Stable release npm package license policy is invalid.",
      "VENDOR_STABLE_NPM_LICENSE_INVALID",
    );
  }
  const allowedLicenses = value.allowedLicenses.map((license) => {
    if (
      typeof license !== "string" ||
      !SPDX.test(license) ||
      license.length > 128 ||
      license !== license.normalize("NFKC")
    ) {
      throw vendorReaderError(
        "Stable release npm package license policy is invalid.",
        "VENDOR_STABLE_NPM_LICENSE_INVALID",
      );
    }
    return license;
  });
  const sortedLicenses = [...allowedLicenses].sort((left, right) =>
    left.localeCompare(right, "en-US"),
  );
  if (
    new Set(allowedLicenses).size !== allowedLicenses.length ||
    canonicalJson(allowedLicenses) !== canonicalJson(sortedLicenses)
  ) {
    throw vendorReaderError(
      "Stable release npm package license policy is not canonical.",
      "VENDOR_STABLE_NPM_LICENSE_INVALID",
    );
  }
  if (!Array.isArray(value.entries) || value.entries.length > 1024) {
    throw vendorReaderError(
      "Stable release npm package inventory exceeds its entry bound.",
      "VENDOR_STABLE_NPM_INVENTORY_INVALID",
    );
  }

  const allowed = new Set(allowedLicenses);
  const includes = new Map<string, StableVendorNpmTarballDescriptor>();
  const identities = new Set<string>();
  const urls = new Set<string>();
  let includedBytes = 0;
  let previousPackage = "";
  let previousVersion = "";
  for (const [index, rawEntry] of value.entries.entries()) {
    const label = `Stable release npm package ${String(index)}`;
    if (!isRecord(rawEntry)) {
      throw vendorReaderError(`${label} is invalid.`, "VENDOR_STABLE_NPM_INVENTORY_INVALID");
    }
    const disposition = rawEntry.disposition;
    const expectedKeys =
      disposition === "omit"
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
    if (
      !exactKeys(rawEntry, expectedKeys) ||
      (disposition !== "include" && disposition !== "omit") ||
      !Number.isSafeInteger(rawEntry.bytes) ||
      Number(rawEntry.bytes) < 1 ||
      Number(rawEntry.bytes) > MAX_NPM_TARBALL_BYTES
    ) {
      throw vendorReaderError(`${label} is invalid.`, "VENDOR_STABLE_NPM_INVENTORY_INVALID");
    }
    const descriptor = parseNpmTarballDescriptor(
      {
        package: rawEntry.package,
        version: rawEntry.version,
        url: rawEntry.url,
        bytes: rawEntry.bytes,
        digest: rawEntry.digest,
        integrity: rawEntry.integrity,
        license: rawEntry.license,
      },
      index,
      [],
    );
    if (isMergoraOwnedPackage(descriptor.package) && descriptor.version !== release) {
      throw vendorReaderError(
        `${label} is not bound to Stable release ${release}.`,
        "VENDOR_STABLE_NPM_RELEASE_INVALID",
      );
    }
    if (
      previousPackage !== "" &&
      (previousPackage.localeCompare(descriptor.package, "en-US") > 0 ||
        (previousPackage === descriptor.package &&
          previousVersion.localeCompare(descriptor.version, "en-US") >= 0))
    ) {
      throw vendorReaderError(
        "Stable release npm package inventory is not uniquely sorted.",
        "VENDOR_STABLE_NPM_INVENTORY_INVALID",
      );
    }
    previousPackage = descriptor.package;
    previousVersion = descriptor.version;
    const identity = `${descriptor.package}\0${descriptor.version}`.toLocaleLowerCase("en-US");
    if (identities.has(identity) || urls.has(descriptor.url)) {
      throw vendorReaderError(
        `${label} repeats an exact package identity or URL.`,
        "VENDOR_STABLE_NPM_INVENTORY_INVALID",
      );
    }
    identities.add(identity);
    urls.add(descriptor.url);
    const licenseAllowed = allowed.has(descriptor.license);
    if (disposition === "include") {
      if (!licenseAllowed) {
        throw vendorReaderError(
          `${label} is absent from the release license allowlist.`,
          "VENDOR_STABLE_NPM_LICENSE_INVALID",
        );
      }
      includedBytes += Number(rawEntry.bytes);
      if (includedBytes > MAX_NPM_TOTAL_INCLUDED_BYTES) {
        throw vendorReaderError(
          "Stable release npm package inventory exceeds its aggregate byte bound.",
          "VENDOR_STABLE_NPM_INVENTORY_INVALID",
        );
      }
      includes.set(`${descriptor.package}\0${descriptor.version}`, {
        package: descriptor.package,
        version: descriptor.version,
        url: descriptor.url,
        bytes: descriptor.bytes,
        digest: descriptor.digest,
        integrity: descriptor.integrity,
        license: descriptor.license,
      });
      continue;
    }
    if (
      (rawEntry.omissionReason !== "explicitly-omitted" &&
        rawEntry.omissionReason !== "license-not-allowed") ||
      (rawEntry.omissionReason === "license-not-allowed") !== !licenseAllowed
    ) {
      throw vendorReaderError(
        `${label} omission reason disagrees with the release license policy.`,
        "VENDOR_STABLE_NPM_LICENSE_INVALID",
      );
    }
  }
  return includes;
}

function parseStableManifest(value: Record<string, unknown>): StableVendorManifest {
  const expectedKeys = [
    "contracts",
    "dependencyGraphDigest",
    "format",
    "items",
    "npmCoverage",
    "npmTarballs",
    "passports",
    "registry",
    "release",
    "releaseManifest",
    "selection",
    "schemaVersion",
    "schemas",
    "sha256SumsDigest",
    ...(Object.hasOwn(value, "npmRegistryOrigins") ? ["npmRegistryOrigins"] : []),
  ];
  if (
    !exactKeys(value, expectedKeys) ||
    value.schemaVersion !== 1 ||
    value.format !== VENDOR_FORMAT ||
    typeof value.release !== "string" ||
    !STABLE_SEMVER.test(value.release) ||
    !isRecord(value.registry) ||
    !exactKeys(value.registry, ["id", "identityDigest", "origin"]) ||
    value.registry.id !== "official" ||
    value.registry.origin !== OFFICIAL_REGISTRY_ORIGIN
  ) {
    throw vendorReaderError(
      "Stable vendor manifest does not match the closed v1 schema.",
      "VENDOR_STABLE_SCHEMA_INVALID",
    );
  }
  const expectedIdentity = sha256(
    canonicalJson({ id: "official", origin: OFFICIAL_REGISTRY_ORIGIN, trust: "official" }),
  );
  const identityDigest = digest(value.registry.identityDigest, "Vendor registry identity");
  if (identityDigest !== expectedIdentity) {
    throw vendorReaderError(
      "Stable vendor registry identity is invalid.",
      "VENDOR_STABLE_IDENTITY_INVALID",
    );
  }
  const releaseManifest = evidenceReference(value.releaseManifest, "Vendor release manifest");
  if (releaseManifest.internalPath !== `r/v1/releases/${value.release}/manifest.json`) {
    throw vendorReaderError(
      "Stable vendor release manifest is not tied to its exact release.",
      "VENDOR_STABLE_RELEASE_INVALID",
    );
  }
  if (
    !isRecord(value.selection) ||
    !exactKeys(value.selection, ["mode", "requested"]) ||
    (value.selection.mode !== "all" && value.selection.mode !== "items") ||
    !Array.isArray(value.selection.requested) ||
    value.selection.requested.length < 1 ||
    value.selection.requested.length > 4096 ||
    value.selection.requested.some(
      (id) => typeof id !== "string" || !ID.test(id) || id !== id.normalize("NFKC"),
    ) ||
    canonicalJson(value.selection.requested) !==
      canonicalJson(
        [...new Set(value.selection.requested as string[])].sort((left, right) =>
          left.localeCompare(right, "en-US"),
        ),
      )
  ) {
    throw vendorReaderError(
      "Stable vendor selection roots are invalid.",
      "VENDOR_STABLE_SELECTION_INVALID",
    );
  }
  if (value.npmCoverage !== "not-requested" && value.npmCoverage !== "complete") {
    throw vendorReaderError(
      "Stable vendor npm coverage declaration is invalid.",
      "VENDOR_STABLE_NPM_INVENTORY_INVALID",
    );
  }
  const items = evidenceReferences(value.items, "Vendor item", 4096, 1);
  const schemas = evidenceReferences(value.schemas, "Vendor schema", 128, 1);
  const contracts = evidenceReferences(value.contracts, "Vendor Contract", 4096);
  const passports = evidenceReferences(value.passports, "Vendor Passport", 4096);
  for (const item of items) {
    if (item.internalPath !== `r/v1/releases/${value.release}/items/${item.id}.json`) {
      throw vendorReaderError(
        `Stable vendor item ${item.id} is not tied to its exact release.`,
        "VENDOR_STABLE_RELEASE_INVALID",
      );
    }
  }
  for (const schema of schemas) {
    if (
      !schema.internalPath.startsWith("r/v1/schemas/") ||
      !schema.internalPath.endsWith(".json")
    ) {
      throw vendorReaderError(
        `Stable vendor schema ${schema.id} has an invalid protocol path.`,
        "VENDOR_STABLE_PATH_UNSAFE",
      );
    }
  }
  for (const passport of passports) {
    if (!passport.internalPath.startsWith(`r/v1/passports/${value.release}/`)) {
      throw vendorReaderError(
        `Stable vendor Passport ${passport.id} is not tied to its exact release.`,
        "VENDOR_STABLE_RELEASE_INVALID",
      );
    }
  }
  for (const contract of contracts) {
    if (
      !/^r\/v1\/contracts\/[0-9]+\.[0-9]+\.[0-9]+\/[a-z0-9-]+\.json$/u.test(contract.internalPath)
    ) {
      throw vendorReaderError(
        `Stable vendor Contract ${contract.id} has an invalid immutable path.`,
        "VENDOR_STABLE_PATH_UNSAFE",
      );
    }
  }
  const npmRegistryOrigins = parseNpmRegistryOrigins(value.npmRegistryOrigins);
  const npmTarballs = parseNpmTarballs(value.npmTarballs, npmRegistryOrigins);
  return {
    schemaVersion: 1,
    format: VENDOR_FORMAT,
    registry: {
      id: "official",
      origin: OFFICIAL_REGISTRY_ORIGIN,
      identityDigest,
    },
    release: value.release,
    selection: {
      mode: value.selection.mode,
      requested: value.selection.requested as string[],
    },
    releaseManifest,
    items,
    schemas,
    contracts,
    passports,
    npmRegistryOrigins,
    npmCoverage: value.npmCoverage,
    npmTarballs,
    dependencyGraphDigest: digest(value.dependencyGraphDigest, "Vendor dependency graph"),
    sha256SumsDigest: digest(value.sha256SumsDigest, "Vendor checksum inventory"),
  };
}

function parseChecksums(bytes: Uint8Array): ReadonlyMap<string, Digest> {
  const text = fatalUtf8(bytes, "Stable vendor checksum inventory");
  if (
    text === "" ||
    text.includes("\r") ||
    !text.endsWith("\n") ||
    text !== text.normalize("NFKC")
  ) {
    throw vendorReaderError(
      "Stable vendor checksum inventory must be non-empty canonical LF text.",
      "VENDOR_STABLE_CHECKSUM_INVALID",
    );
  }
  const inventory = new Map<string, Digest>();
  const portableIdentities = new Set<string>();
  let previous = "";
  for (const line of text.slice(0, -1).split("\n")) {
    const match = /^([a-f0-9]{64}) {2}(.+)$/u.exec(line);
    if (match === null) {
      throw vendorReaderError(
        "Stable vendor checksum inventory has an invalid line.",
        "VENDOR_STABLE_CHECKSUM_INVALID",
      );
    }
    const path = match[2]!;
    safeRelativePath(path, "Stable vendor checksum path");
    if (
      (!path.startsWith("r/v1/") && !path.startsWith("npm/tarballs/")) ||
      path === `r/v1/${VENDOR_SUMS}`
    ) {
      throw vendorReaderError(
        "Stable vendor checksum inventory contains an unsupported artifact path.",
        "VENDOR_STABLE_PATH_UNSAFE",
        path,
      );
    }
    if (previous !== "" && previous.localeCompare(path, "en-US") >= 0) {
      throw vendorReaderError(
        "Stable vendor checksum inventory is not uniquely sorted.",
        "VENDOR_STABLE_CHECKSUM_INVALID",
      );
    }
    const identity = path.normalize("NFKC").toLocaleLowerCase("en-US");
    if (portableIdentities.has(identity)) {
      throw vendorReaderError(
        "Stable vendor checksum inventory has a portable path collision.",
        "VENDOR_STABLE_CHECKSUM_INVALID",
        path,
      );
    }
    portableIdentities.add(identity);
    inventory.set(path, `sha256:${match[1]}`);
    previous = path;
  }
  if (inventory.size > MAX_BUNDLE_FILES) {
    throw vendorReaderError(
      "Stable vendor checksum inventory exceeds the file limit.",
      "VENDOR_STABLE_BUNDLE_OVERSIZE",
    );
  }
  return inventory;
}

function enumerateBundle(root: string, vendorRoot: string): readonly string[] {
  assertNoSymlinkAncestors(root, vendorRoot);
  const absoluteRoot = resolveInside(root, vendorRoot, "Stable vendor root");
  const metadata = lstatSync(absoluteRoot);
  if (metadata.isSymbolicLink() || !metadata.isDirectory()) {
    throw vendorReaderError(
      "Stable vendor root is not a safe directory.",
      "VENDOR_STABLE_PATH_UNSAFE",
      vendorRoot,
    );
  }
  const files: string[] = [];
  const walk = (absolute: string, prefix: string, depth: number): void => {
    if (depth > MAX_DEPTH) {
      throw vendorReaderError(
        "Stable vendor directory depth exceeds the limit.",
        "VENDOR_STABLE_BUNDLE_OVERSIZE",
        vendorRoot,
      );
    }
    for (const entry of readdirSync(absolute, { withFileTypes: true })) {
      const relative = prefix === "" ? entry.name : `${prefix}/${entry.name}`;
      safeRelativePath(relative, "Stable vendor artifact path");
      const child = resolve(absolute, entry.name);
      const childMetadata = lstatSync(child);
      if (entry.isSymbolicLink() || childMetadata.isSymbolicLink()) {
        throw vendorReaderError(
          `Stable vendor artifact ${relative} is a symbolic link.`,
          "VENDOR_STABLE_PATH_UNSAFE",
          `${vendorRoot}/${relative}`,
        );
      }
      if (childMetadata.isDirectory()) walk(child, relative, depth + 1);
      else if (childMetadata.isFile()) files.push(relative);
      else {
        throw vendorReaderError(
          `Stable vendor artifact ${relative} is not a regular file.`,
          "VENDOR_STABLE_PATH_UNSAFE",
          `${vendorRoot}/${relative}`,
        );
      }
      if (files.length > MAX_BUNDLE_FILES + 2) {
        throw vendorReaderError(
          "Stable vendor bundle exceeds the file limit.",
          "VENDOR_STABLE_BUNDLE_OVERSIZE",
          vendorRoot,
        );
      }
    }
  };
  walk(absoluteRoot, "", 0);
  return files.sort((left, right) => left.localeCompare(right, "en-US"));
}

function enumerateBundleBytes(files: ReadonlyMap<string, Uint8Array>): readonly string[] {
  if (files.size < 1 || files.size > MAX_BUNDLE_FILES + 2) {
    throw vendorReaderError(
      "Stable vendor in-memory bundle has an invalid file count.",
      "VENDOR_STABLE_BUNDLE_OVERSIZE",
    );
  }
  const paths: string[] = [];
  const identities = new Set<string>();
  for (const [path, bytes] of files) {
    safeRelativePath(path, "Stable vendor in-memory artifact path");
    if (!(bytes instanceof Uint8Array)) {
      throw vendorReaderError(
        `Stable vendor in-memory artifact ${path} is not bytes.`,
        "VENDOR_STABLE_SCHEMA_INVALID",
        path,
      );
    }
    const identity = path.normalize("NFKC").toLocaleLowerCase("en-US");
    if (identities.has(identity)) {
      throw vendorReaderError(
        `Stable vendor in-memory artifact ${path} has a portable collision.`,
        "VENDOR_STABLE_FILE_SET_INVALID",
        path,
      );
    }
    identities.add(identity);
    paths.push(path);
  }
  return paths.sort((left, right) => left.localeCompare(right, "en-US"));
}

function readBundleBytes(
  files: ReadonlyMap<string, Uint8Array>,
  path: string,
  label: string,
  maximumBytes: number,
): Buffer {
  const bytes = files.get(path);
  if (bytes === undefined) {
    throw vendorReaderError(`${label} is missing.`, "VENDOR_STABLE_ARTIFACT_MISSING", path);
  }
  if (!(bytes instanceof Uint8Array) || bytes.byteLength > maximumBytes) {
    throw vendorReaderError(
      `${label} exceeds the supported byte limit.`,
      "VENDOR_STABLE_ARTIFACT_OVERSIZE",
      path,
    );
  }
  return Buffer.from(bytes);
}

function assertReferenceCoverage(
  manifest: StableVendorManifest,
  inventory: ReadonlyMap<string, Digest>,
): void {
  const references = [
    manifest.releaseManifest,
    ...manifest.items,
    ...manifest.schemas,
    ...manifest.contracts,
    ...manifest.passports,
  ];
  for (const reference of references) {
    if (inventory.get(reference.internalPath) !== reference.digest) {
      throw vendorReaderError(
        `Stable vendor reference ${reference.id} is absent or has a conflicting digest.`,
        "VENDOR_STABLE_REFERENCE_INVALID",
        reference.internalPath,
      );
    }
  }
  for (const tarball of manifest.npmTarballs) {
    if (inventory.get(tarball.internalPath) !== tarball.digest) {
      throw vendorReaderError(
        `Stable npm tarball ${tarball.package}@${tarball.version} is absent or has a conflicting digest.`,
        "VENDOR_STABLE_REFERENCE_INVALID",
        tarball.internalPath,
      );
    }
  }
}

function assertExactSelectedDependencyClosure(
  manifest: StableVendorManifest,
  releaseItems: Record<string, unknown>,
  manifestPath: string,
): void {
  const releaseIds = Object.keys(releaseItems).sort((left, right) =>
    left.localeCompare(right, "en-US"),
  );
  if (
    releaseIds.length < 1 ||
    releaseIds.length > 4096 ||
    releaseIds.some((id) => !ID.test(id) || id !== id.normalize("NFKC"))
  ) {
    throw vendorReaderError(
      "Stable release item inventory is invalid.",
      "VENDOR_STABLE_SELECTION_INVALID",
      manifestPath,
    );
  }
  const releaseIdSet = new Set(releaseIds);
  const graph = new Map<string, readonly string[]>();
  for (const id of releaseIds) {
    const item = releaseItems[id];
    if (
      !isRecord(item) ||
      item.version !== manifest.release ||
      !Array.isArray(item.dependencies) ||
      item.dependencies.length > 256
    ) {
      throw vendorReaderError(
        `Stable release item ${id} has invalid dependency metadata.`,
        "VENDOR_STABLE_SELECTION_INVALID",
        manifestPath,
      );
    }
    const dependencies: string[] = [];
    for (const dependency of item.dependencies) {
      const match = typeof dependency === "string" ? OFFICIAL_QUALIFIED_ID.exec(dependency) : null;
      if (match === null || !releaseIdSet.has(match[1]!)) {
        throw vendorReaderError(
          `Stable release item ${id} references an unavailable dependency.`,
          "VENDOR_STABLE_SELECTION_INVALID",
          manifestPath,
        );
      }
      dependencies.push(match[1]!);
    }
    const sortedDependencies = [...new Set(dependencies)].sort((left, right) =>
      left.localeCompare(right, "en-US"),
    );
    if (canonicalJson(dependencies) !== canonicalJson(sortedDependencies)) {
      throw vendorReaderError(
        `Stable release item ${id} dependencies are not uniquely sorted.`,
        "VENDOR_STABLE_SELECTION_INVALID",
        manifestPath,
      );
    }
    graph.set(id, sortedDependencies);
  }

  if (
    manifest.selection.mode === "all" &&
    canonicalJson(manifest.selection.requested) !== canonicalJson(releaseIds)
  ) {
    throw vendorReaderError(
      "Stable all-item selection does not name the complete release item set.",
      "VENDOR_STABLE_SELECTION_INVALID",
      manifestPath,
    );
  }
  if (manifest.selection.requested.some((id) => !releaseIdSet.has(id))) {
    throw vendorReaderError(
      "Stable vendor selection names an item absent from the exact release.",
      "VENDOR_STABLE_SELECTION_INVALID",
      manifestPath,
    );
  }

  const visited = new Set<string>();
  const active = new Set<string>();
  const visit = (id: string, depth: number): void => {
    if (depth > MAX_STABLE_DEPENDENCY_GRAPH_DEPTH) {
      throw vendorReaderError(
        `Stable release dependency closure exceeds its graph-depth bound at ${id}.`,
        "VENDOR_STABLE_SELECTION_INVALID",
        manifestPath,
      );
    }
    if (active.has(id)) {
      throw vendorReaderError(
        `Stable release dependency closure cycles through ${id}.`,
        "VENDOR_STABLE_SELECTION_INVALID",
        manifestPath,
      );
    }
    if (visited.has(id)) return;
    active.add(id);
    for (const dependency of graph.get(id) ?? []) visit(dependency, depth + 1);
    active.delete(id);
    visited.add(id);
  };
  for (const id of manifest.selection.requested) visit(id, 0);
  const selectedIds = manifest.items
    .map(({ id }) => id)
    .sort((left, right) => left.localeCompare(right, "en-US"));
  const expectedIds = [...visited].sort((left, right) => left.localeCompare(right, "en-US"));
  if (canonicalJson(selectedIds) !== canonicalJson(expectedIds)) {
    throw vendorReaderError(
      "Stable vendor items are not the exact dependency closure of the declared selection roots.",
      "VENDOR_STABLE_SELECTION_INVALID",
      manifestPath,
    );
  }
}

function assertReleaseBindings(
  manifest: StableVendorManifest,
  contents: ReadonlyMap<string, Buffer>,
): ReadonlyMap<string, StableReleaseArtifactBinding> {
  const catalogPath = "r/v1/catalog.json";
  const manifestPath = `r/v1/releases/${manifest.release}/manifest.json`;
  const catalog = canonicalDocument(contents.get(catalogPath)!, "Stable vendor catalog");
  const release = canonicalDocument(contents.get(manifestPath)!, "Stable vendor release manifest");
  if (!isRecord(catalog) || !isRecord(catalog.registry) || !isRecord(catalog.releases)) {
    throw vendorReaderError(
      "Stable vendor catalog shape is invalid.",
      "VENDOR_STABLE_RELEASE_INVALID",
    );
  }
  if (
    catalog.registry.id !== "official" ||
    catalog.registry.origin !== OFFICIAL_REGISTRY_ORIGIN ||
    catalog.registry.trust !== "official" ||
    catalog.registry.identityDigest !== manifest.registry.identityDigest ||
    catalog.releases.currentStable !== manifest.release ||
    catalog.dependencyGraphDigest !== manifest.dependencyGraphDigest
  ) {
    throw vendorReaderError(
      "Stable vendor catalog identity or release binding is invalid.",
      "VENDOR_STABLE_RELEASE_INVALID",
      catalogPath,
    );
  }
  if (
    !isRecord(release) ||
    release.registryId !== "official" ||
    release.uiVersion !== manifest.release ||
    release.dependencyGraphDigest !== manifest.dependencyGraphDigest
  ) {
    throw vendorReaderError(
      "Stable vendor release manifest identity is invalid.",
      "VENDOR_STABLE_RELEASE_INVALID",
      manifestPath,
    );
  }
  if (!Array.isArray(release.artifacts) || !isRecord(release.items)) {
    throw vendorReaderError(
      "Stable vendor release artifact inventory is invalid.",
      "VENDOR_STABLE_RELEASE_INVALID",
      manifestPath,
    );
  }
  const releaseSelfDigest = digest(
    release.manifestDigest,
    "Stable vendor release manifest self-digest",
  );
  const unsignedRelease = { ...release };
  delete unsignedRelease.manifestDigest;
  if (releaseSelfDigest !== sha256(canonicalJson(unsignedRelease))) {
    throw vendorReaderError(
      "Stable vendor release manifest self-digest is invalid.",
      "VENDOR_STABLE_RELEASE_INVALID",
      manifestPath,
    );
  }
  assertExactSelectedDependencyClosure(manifest, release.items, manifestPath);
  if (manifest.npmRegistryOrigins.length > 0) {
    throw vendorReaderError(
      "Official Stable vendor bundles cannot self-assert enrolled npm registry origins.",
      "VENDOR_STABLE_NPM_ORIGIN_INVALID",
      manifestPath,
    );
  }
  const releaseNpmIncludes = releaseNpmPackageIncludes(
    release.npmPackageInventory,
    manifest.release,
  );
  if (manifest.npmCoverage === "not-requested" && manifest.npmTarballs.length !== 0) {
    throw vendorReaderError(
      "Stable vendor npm coverage is not-requested but tarballs are attached.",
      "VENDOR_STABLE_NPM_REFERENCE_MISMATCH",
      manifestPath,
    );
  }
  if (manifest.npmCoverage === "complete" && releaseNpmIncludes === null) {
    throw vendorReaderError(
      "Legacy Stable release metadata cannot authorize complete npm tarball coverage.",
      "VENDOR_STABLE_NPM_INVENTORY_MISSING",
      manifestPath,
    );
  }
  if (
    manifest.npmCoverage === "complete" &&
    manifest.npmTarballs.length !== releaseNpmIncludes!.size
  ) {
    throw vendorReaderError(
      "Stable vendor complete npm coverage does not contain every included release package.",
      "VENDOR_STABLE_NPM_REFERENCE_MISMATCH",
      manifestPath,
    );
  }
  for (const tarball of manifest.npmTarballs) {
    const expected = releaseNpmIncludes?.get(`${tarball.package}\0${tarball.version}`);
    const descriptor = {
      package: tarball.package,
      version: tarball.version,
      url: tarball.url,
      bytes: tarball.bytes,
      digest: tarball.digest,
      integrity: tarball.integrity,
      license: tarball.license,
    };
    if (expected === undefined || canonicalJson(descriptor) !== canonicalJson(expected)) {
      throw vendorReaderError(
        `Stable npm tarball ${tarball.package}@${tarball.version} is not an included artifact in the exact release inventory.`,
        "VENDOR_STABLE_NPM_REFERENCE_MISMATCH",
        tarball.internalPath,
      );
    }
  }
  const releaseArtifacts = new Map<string, StableReleaseArtifactBinding>();
  for (const artifact of release.artifacts) {
    if (
      !isRecord(artifact) ||
      typeof artifact.name !== "string" ||
      typeof artifact.url !== "string"
    ) {
      throw vendorReaderError(
        "Stable vendor release artifact inventory is invalid.",
        "VENDOR_STABLE_RELEASE_INVALID",
        manifestPath,
      );
    }
    if (releaseArtifacts.has(artifact.name)) {
      throw vendorReaderError(
        "Stable vendor release artifact inventory repeats a path.",
        "VENDOR_STABLE_RELEASE_INVALID",
        manifestPath,
      );
    }
    safeRelativePath(artifact.name, "Stable release artifact path");
    if (
      !artifact.name.startsWith("r/v1/") ||
      secureArtifactPath(artifact.url, "Stable release artifact URL") !== artifact.name
    ) {
      throw vendorReaderError(
        "Stable vendor release artifact path and URL disagree.",
        "VENDOR_STABLE_RELEASE_INVALID",
        manifestPath,
      );
    }
    releaseArtifacts.set(artifact.name, {
      digest: digest(artifact.digest, "Stable release artifact digest"),
      url: artifact.url,
    });
  }
  const exactReleaseSchemas = [...releaseArtifacts.keys()]
    .filter((path) => path.startsWith("r/v1/schemas/") && path.endsWith(".schema.json"))
    .sort((left, right) => left.localeCompare(right, "en-US"));
  const selectedSchemas = manifest.schemas
    .map(({ internalPath }) => internalPath)
    .sort((left, right) => left.localeCompare(right, "en-US"));
  if (canonicalJson(selectedSchemas) !== canonicalJson(exactReleaseSchemas)) {
    throw vendorReaderError(
      "Stable vendor schema evidence is not the exact required release schema set.",
      "VENDOR_STABLE_REFERENCE_INVALID",
      manifestPath,
    );
  }
  const assertReleaseReference = (reference: StableEvidenceReference, label: string): void => {
    const artifact = releaseArtifacts.get(reference.internalPath);
    if (artifact?.digest !== reference.digest || artifact.url !== reference.artifact) {
      throw vendorReaderError(
        `${label} is not bound by the exact release manifest.`,
        "VENDOR_STABLE_REFERENCE_INVALID",
        reference.internalPath,
      );
    }
  };
  for (const reference of manifest.schemas) assertReleaseReference(reference, "Stable schema");
  if (
    manifest.passports.length !== manifest.items.length ||
    manifest.contracts.length !== manifest.items.length
  ) {
    throw vendorReaderError(
      "Stable vendor evidence must contain exactly one Passport and Contract per selected item.",
      "VENDOR_STABLE_REFERENCE_INVALID",
      manifestPath,
    );
  }
  for (const item of manifest.items) {
    const releaseItem = release.items[item.id];
    if (!isRecord(releaseItem)) {
      throw vendorReaderError(
        `Stable vendor item ${item.id} is absent from the exact release manifest.`,
        "VENDOR_STABLE_REFERENCE_INVALID",
        item.internalPath,
      );
    }
    const payload = evidenceReference(releaseItem.payload, `Release item ${item.id} payload`);
    const passport = evidenceReference(releaseItem.passport, `Release item ${item.id} Passport`);
    const contract = evidenceReference(releaseItem.contract, `Release item ${item.id} Contract`);
    const formalPassport = manifest.passports.find(
      (reference) => reference.artifact === passport.artifact,
    );
    const formalContract = manifest.contracts.find(
      (reference) => reference.artifact === contract.artifact,
    );
    if (
      payload.artifact !== item.artifact ||
      payload.digest !== item.digest ||
      formalPassport === undefined ||
      formalContract === undefined ||
      formalPassport?.digest !== passport.digest ||
      formalContract?.digest !== contract.digest
    ) {
      throw vendorReaderError(
        `Stable vendor item ${item.id} evidence disagrees with the exact release manifest.`,
        "VENDOR_STABLE_REFERENCE_INVALID",
        item.internalPath,
      );
    }
    assertReleaseReference(item, `Stable vendor item ${item.id}`);
    assertReleaseReference(formalPassport, `Stable vendor Passport for ${item.id}`);
    assertReleaseReference(formalContract, `Stable vendor Contract for ${item.id}`);
  }
  return releaseArtifacts;
}

function assertNoExecutableMetadata(value: unknown, label: string): void {
  const pending: Array<{ readonly value: unknown; readonly depth: number }> = [{ value, depth: 0 }];
  let nodes = 0;
  while (pending.length > 0) {
    const current = pending.pop()!;
    nodes += 1;
    if (current.depth > MAX_DEPTH || nodes > MAX_JSON_METADATA_NODES) {
      throw vendorReaderError(
        `${label} exceeds its executable-metadata complexity bound.`,
        "VENDOR_STABLE_SCHEMA_INVALID",
      );
    }
    if (Array.isArray(current.value)) {
      for (const entry of current.value) {
        pending.push({ value: entry, depth: current.depth + 1 });
      }
      continue;
    }
    if (!isRecord(current.value)) continue;
    for (const [key, entry] of Object.entries(current.value)) {
      if (FORBIDDEN_EXECUTABLE_KEYS.has(key.toLowerCase())) {
        throw vendorReaderError(
          `${label} contains forbidden executable metadata ${key}.`,
          "VENDOR_STABLE_SCHEMA_INVALID",
        );
      }
      pending.push({ value: entry, depth: current.depth + 1 });
    }
  }
}

function selectedAcquisitionPaths(
  manifest: StableVendorManifest,
  inventory: ReadonlyMap<string, Digest>,
  contents: ReadonlyMap<string, Buffer>,
  releaseArtifacts: ReadonlyMap<string, StableReleaseArtifactBinding>,
): ReadonlySet<string> {
  const allowed = new Set<string>([
    "r/v1/catalog.json",
    `r/v1/releases/${manifest.release}/manifest.json`,
    ...manifest.schemas.map(({ internalPath }) => internalPath),
    ...manifest.contracts.map(({ internalPath }) => internalPath),
    ...manifest.passports.map(({ internalPath }) => internalPath),
    ...manifest.npmTarballs.map(({ internalPath }) => internalPath),
  ]);
  for (const item of manifest.items) {
    allowed.add(item.internalPath);
    const value = canonicalDocument(
      contents.get(item.internalPath)!,
      `Stable vendor item ${item.id}`,
    );
    if (
      !isRecord(value) ||
      value.registryId !== "official" ||
      value.itemId !== item.id ||
      value.version !== manifest.release ||
      !Array.isArray(value.files)
    ) {
      throw vendorReaderError(
        `Stable vendor item ${item.id} has an invalid release binding.`,
        "VENDOR_STABLE_RELEASE_INVALID",
        item.internalPath,
      );
    }
    assertNoExecutableMetadata(value, `Stable vendor item ${item.id}`);
    if (typeof value.license !== "string" || !SPDX.test(value.license)) {
      throw vendorReaderError(
        `Stable vendor item ${item.id} has an invalid license identifier.`,
        "VENDOR_STABLE_SCHEMA_INVALID",
        item.internalPath,
      );
    }
    for (const [index, file] of value.files.entries()) {
      if (
        !isRecord(file) ||
        file.executable !== false ||
        (file.sourceUrl !== undefined &&
          file.sourceUrl !== null &&
          typeof file.sourceUrl !== "string")
      ) {
        throw vendorReaderError(
          `Stable vendor item ${item.id} file ${String(index)} has invalid source metadata.`,
          "VENDOR_STABLE_RELEASE_INVALID",
          item.internalPath,
        );
      }
      if (typeof file.sourceUrl !== "string") continue;
      const sourcePath = secureArtifactPath(
        file.sourceUrl,
        `Stable vendor item ${item.id} file ${String(index)} source`,
      );
      if (!sourcePath.startsWith(`r/v1/releases/${manifest.release}/files/`)) {
        throw vendorReaderError(
          `Stable vendor item ${item.id} has a source outside its exact release.`,
          "VENDOR_STABLE_RELEASE_INVALID",
          item.internalPath,
        );
      }
      const fileDigest = digest(
        file.digest,
        `Stable vendor item ${item.id} file ${String(index)} digest`,
      );
      if (inventory.get(sourcePath) !== fileDigest) {
        throw vendorReaderError(
          `Stable vendor item ${item.id} source is absent or has a conflicting digest.`,
          "VENDOR_STABLE_REFERENCE_INVALID",
          sourcePath,
        );
      }
      const releaseArtifact = releaseArtifacts.get(sourcePath);
      if (releaseArtifact?.digest !== fileDigest || releaseArtifact.url !== file.sourceUrl) {
        throw vendorReaderError(
          `Stable vendor item ${item.id} source is not bound by the exact release manifest.`,
          "VENDOR_STABLE_REFERENCE_INVALID",
          sourcePath,
        );
      }
      allowed.add(sourcePath);
    }
  }
  return allowed;
}

function verifyStableVendor(
  root: string,
  vendorRoot: string,
  bundleBytes?: ReadonlyMap<string, Uint8Array>,
): VerifiedStableVendor | null {
  if (bundleBytes === undefined) {
    const absoluteRoot = resolveInside(root, vendorRoot, "Stable vendor root");
    if (!existsSync(absoluteRoot)) return null;
  } else if (bundleBytes.size === 0) {
    return null;
  }
  const readArtifact = (path: string, label: string, maximumBytes: number): Buffer =>
    bundleBytes === undefined
      ? safeRead(root, `${vendorRoot}/${path}`, label, maximumBytes)
      : readBundleBytes(bundleBytes, path, label, maximumBytes);
  const manifestTarget = `${vendorRoot}/${VENDOR_MANIFEST}`;
  if (
    bundleBytes === undefined &&
    !existsSync(resolveInside(root, manifestTarget, "Stable vendor manifest"))
  ) {
    throw vendorReaderError(
      "A vendor directory exists without its manifest.",
      "VENDOR_STABLE_BUNDLE_INCOMPLETE",
      vendorRoot,
    );
  }
  const rawManifest = readArtifact(VENDOR_MANIFEST, "Stable vendor manifest", MAX_MANIFEST_BYTES);
  const value = canonicalDocument(rawManifest, "Stable vendor manifest");
  if (!isRecord(value)) {
    throw vendorReaderError(
      "Stable vendor manifest must be an object.",
      "VENDOR_STABLE_SCHEMA_INVALID",
      manifestTarget,
    );
  }
  if (Object.hasOwn(value, "provenance") && !Object.hasOwn(value, "release")) {
    // The honest unreleased-local snapshot has a separate verifier and must not
    // be misrepresented as an immutable official Stable release source.
    return null;
  }
  const manifest = parseStableManifest(value);
  const sumsTarget = `${vendorRoot}/${VENDOR_SUMS}`;
  const sums = readArtifact(VENDOR_SUMS, "Stable vendor checksum inventory", MAX_MANIFEST_BYTES);
  if (sha256(sums) !== manifest.sha256SumsDigest) {
    throw vendorReaderError(
      "Stable vendor checksum inventory digest is invalid.",
      "VENDOR_STABLE_CHECKSUM_MISMATCH",
      sumsTarget,
    );
  }
  const inventory = parseChecksums(sums);
  const catalogPath = "r/v1/catalog.json";
  const releaseManifestPath = `r/v1/releases/${manifest.release}/manifest.json`;
  if (!inventory.has(catalogPath) || !inventory.has(releaseManifestPath)) {
    throw vendorReaderError(
      "Stable vendor bundle omits its catalog or exact release manifest.",
      "VENDOR_STABLE_ARTIFACT_MISSING",
      vendorRoot,
    );
  }
  assertReferenceCoverage(manifest, inventory);
  const expected = [...inventory.keys(), VENDOR_MANIFEST, VENDOR_SUMS].sort((left, right) =>
    left.localeCompare(right, "en-US"),
  );
  const actual =
    bundleBytes === undefined
      ? enumerateBundle(root, vendorRoot)
      : enumerateBundleBytes(bundleBytes);
  if (canonicalJson(actual) !== canonicalJson(expected)) {
    throw vendorReaderError(
      "Stable vendor bundle contains a missing, untracked, or duplicated artifact.",
      "VENDOR_STABLE_FILE_SET_INVALID",
      vendorRoot,
    );
  }
  let total = rawManifest.byteLength + sums.byteLength;
  const contents = new Map<string, Buffer>();
  const npmTarballsByPath = new Map(
    manifest.npmTarballs.map((tarball) => [tarball.internalPath, tarball] as const),
  );
  for (const [path, expectedDigest] of inventory) {
    const target = `${vendorRoot}/${path}`;
    const npmTarball = npmTarballsByPath.get(path);
    const bytes = readArtifact(
      path,
      `Stable vendor artifact ${path}`,
      npmTarball === undefined ? MAX_ARTIFACT_BYTES : MAX_NPM_TARBALL_BYTES,
    );
    total += bytes.byteLength;
    if (total > MAX_BUNDLE_BYTES) {
      throw vendorReaderError(
        "Stable vendor bundle exceeds the total byte limit.",
        "VENDOR_STABLE_BUNDLE_OVERSIZE",
        vendorRoot,
      );
    }
    if (sha256(bytes) !== expectedDigest) {
      throw vendorReaderError(
        `Stable vendor artifact ${path} failed digest verification.`,
        "VENDOR_STABLE_DIGEST_MISMATCH",
        target,
      );
    }
    if (npmTarball !== undefined) {
      validateStableNpmTarballBytes(npmTarball, bytes);
    }
    if (path.endsWith(".json") && !path.includes(`/releases/${manifest.release}/files/`)) {
      canonicalDocument(bytes, `Stable vendor artifact ${path}`);
    }
    if (
      path === catalogPath ||
      path === releaseManifestPath ||
      manifest.items.some((item) => item.internalPath === path)
    ) {
      contents.set(path, bytes);
    }
  }
  const releaseArtifacts = assertReleaseBindings(manifest, contents);
  const allowedAcquisitionPaths = selectedAcquisitionPaths(
    manifest,
    inventory,
    contents,
    releaseArtifacts,
  );
  for (const path of inventory.keys()) {
    if (!allowedAcquisitionPaths.has(path)) {
      throw vendorReaderError(
        `Stable vendor bundle contains an artifact outside the selected immutable closure.`,
        "VENDOR_STABLE_FILE_SET_INVALID",
        path,
      );
    }
  }
  const verification: StableVendorVerificationResult = {
    schemaVersion: 1,
    format: VENDOR_FORMAT,
    state: "valid",
    root: vendorRoot,
    provenanceState: "stable-release",
    releaseClaim: "exact",
    release: manifest.release,
    items: manifest.items.map(({ id }) => id),
    npmCoverage: manifest.npmCoverage,
    npmTarballs: manifest.npmTarballs.length,
    artifacts: inventory.size,
    totalBytes: total,
    manifestDigest: sha256(rawManifest),
    sha256SumsDigest: manifest.sha256SumsDigest,
    catalogDigest: inventory.get(catalogPath)!,
    releaseManifestDigest: inventory.get(releaseManifestPath)!,
    networkUsed: false,
    writePerformed: false,
  };
  return {
    root,
    vendorRoot,
    release: manifest.release,
    registryIdentityDigest: manifest.registry.identityDigest,
    inventory,
    allowedAcquisitionPaths,
    npmTarballs: new Map(
      manifest.npmTarballs.map((tarball) => [`${tarball.package}\0${tarball.version}`, tarball]),
    ),
    verification,
  };
}

function readRequest(
  vendor: VerifiedStableVendor,
  request: ImmutableArtifactRequest,
): Uint8Array | null {
  if (
    request.registry.id !== "official" ||
    request.registry.origin !== OFFICIAL_REGISTRY_ORIGIN ||
    request.registry.trust !== "official" ||
    request.registry.identityDigest !== vendor.registryIdentityDigest ||
    request.release !== vendor.release
  ) {
    return null;
  }
  const internalPath = `r/v1/${request.path}`;
  safeRelativePath(internalPath, "Stable vendor request path");
  if (request.path.startsWith("r/v1/")) {
    throw vendorReaderError(
      "Stable vendor request repeats the protocol root.",
      "VENDOR_STABLE_PATH_UNSAFE",
      request.path,
    );
  }
  const expectedDigest = vendor.inventory.get(internalPath);
  if (expectedDigest === undefined || !vendor.allowedAcquisitionPaths.has(internalPath)) {
    throw vendorReaderError(
      `Stable vendor bundle is missing immutable artifact ${request.digest}.`,
      "VENDOR_STABLE_ARTIFACT_MISSING",
      request.path,
    );
  }
  if (expectedDigest !== request.digest) {
    throw vendorReaderError(
      "Stable vendor artifact digest conflicts with the exact release reference.",
      "VENDOR_STABLE_REFERENCE_MISMATCH",
      request.path,
    );
  }
  const target = `${vendor.vendorRoot}/${internalPath}`;
  const bytes = safeRead(
    vendor.root,
    target,
    `Stable vendor artifact ${request.path}`,
    request.maxBytes,
  );
  if (
    sha256(bytes) !== expectedDigest ||
    (request.bytes !== undefined && request.bytes !== bytes.byteLength)
  ) {
    throw vendorReaderError(
      "Stable vendor artifact changed or has an unexpected byte count.",
      "VENDOR_STABLE_DIGEST_MISMATCH",
      request.path,
    );
  }
  return Uint8Array.from(bytes);
}

function readNpmTarballRequest(
  vendor: VerifiedStableVendor,
  request: StableVendorNpmTarballRequest,
): Uint8Array {
  if (
    !PACKAGE_NAME.test(request.package) ||
    !STABLE_SEMVER.test(request.version) ||
    !Number.isSafeInteger(request.maxBytes) ||
    request.maxBytes < 1 ||
    request.maxBytes > MAX_NPM_TARBALL_BYTES
  ) {
    throw vendorReaderError(
      "Stable npm tarball request is invalid or unbounded.",
      "VENDOR_STABLE_NPM_REQUEST_INVALID",
    );
  }
  const expected = vendor.npmTarballs.get(`${request.package}\0${request.version}`);
  if (expected === undefined) {
    throw vendorReaderError(
      `Stable vendor bundle does not contain ${request.package}@${request.version}.`,
      "VENDOR_STABLE_NPM_MISSING",
    );
  }
  const exactRequest = {
    package: request.package,
    version: request.version,
    url: request.url,
    bytes: request.bytes,
    digest: request.digest,
    integrity: request.integrity,
    license: request.license,
  };
  const exactExpected = {
    package: expected.package,
    version: expected.version,
    url: expected.url,
    bytes: expected.bytes,
    digest: expected.digest,
    integrity: expected.integrity,
    license: expected.license,
  };
  if (canonicalJson(exactRequest) !== canonicalJson(exactExpected)) {
    throw vendorReaderError(
      `Stable npm tarball request disagrees with ${request.package}@${request.version}.`,
      "VENDOR_STABLE_NPM_REFERENCE_MISMATCH",
    );
  }
  const target = `${vendor.vendorRoot}/${expected.internalPath}`;
  const bytes = safeRead(
    vendor.root,
    target,
    `Stable npm tarball ${request.package}@${request.version}`,
    request.maxBytes,
  );
  validateStableNpmTarballBytes(expected, bytes, request.maxBytes);
  return Uint8Array.from(bytes);
}

/**
 * Creates a no-network reader for one formal Stable vendor bundle. A matching
 * bundle is verified as a closed file set before any artifact is exposed; once
 * selected, corruption or omission throws and cannot fall through to cache or
 * network acquisition.
 */
export function createStableAcquisitionVendorReader(
  options: StableAcquisitionVendorReaderOptions,
): AcquisitionVendorReader {
  const root = validatedProjectRoot(options.projectRoot);
  const vendorRoot = options.vendorRoot ?? DEFAULT_VENDOR_ROOT;
  safeRelativePath(vendorRoot, "Stable vendor root");
  const verified = verifyStableVendor(root, vendorRoot);
  return (request) => (verified === null ? null : readRequest(verified, request));
}

/**
 * Creates an offline npm tarball reader. Once a Stable bundle is present, a
 * missing or partially matching descriptor fails closed instead of falling
 * through to a package-manager cache or registry.
 */
export function createStableNpmTarballVendorReader(
  options: StableAcquisitionVendorReaderOptions,
): StableVendorNpmTarballReader {
  const root = validatedProjectRoot(options.projectRoot);
  const vendorRoot = options.vendorRoot ?? DEFAULT_VENDOR_ROOT;
  safeRelativePath(vendorRoot, "Stable vendor root");
  const verified = verifyStableVendor(root, vendorRoot);
  return (request) => (verified === null ? null : readNpmTarballRequest(verified, request));
}

/**
 * Verifies a formal Stable bundle without network or writes. `null` means the
 * directory is absent or contains the separately supported unreleased-local
 * format; malformed Stable metadata always throws.
 */
export function verifyStableVendorBundle(
  options: StableAcquisitionVendorReaderOptions,
): StableVendorVerificationResult | null {
  const root = validatedProjectRoot(options.projectRoot);
  const vendorRoot = options.vendorRoot ?? DEFAULT_VENDOR_ROOT;
  safeRelativePath(vendorRoot, "Stable vendor root");
  return verifyStableVendor(root, vendorRoot)?.verification ?? null;
}

/**
 * Verifies a complete would-be Stable bundle from memory. Keys are paths
 * relative to the vendor root. This is used before a transaction writes any
 * target, so semantic closure failures cannot first be discovered post-commit.
 */
export function verifyStableVendorBundleBytes(options: {
  readonly projectRoot: string;
  readonly vendorRoot?: string | undefined;
  readonly files: ReadonlyMap<string, Uint8Array>;
}): StableVendorVerificationResult {
  const root = validatedProjectRoot(options.projectRoot);
  const vendorRoot = options.vendorRoot ?? DEFAULT_VENDOR_ROOT;
  safeRelativePath(vendorRoot, "Stable vendor root");
  const verified = verifyStableVendor(root, vendorRoot, options.files);
  if (verified === null) {
    throw vendorReaderError(
      "Stable vendor in-memory bundle is absent or is not a formal Stable bundle.",
      "VENDOR_STABLE_BUNDLE_INCOMPLETE",
      vendorRoot,
    );
  }
  return verified.verification;
}
