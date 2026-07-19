import { minVersion, parse, satisfies, subset, validRange } from "semver";

import { assertPortableRelativePath, canonicalJson, CliError, sha256 } from "./contracts.js";
import { validateMergoraConfig, type MergoraConfig } from "./configuration.js";
import { OFFICIAL_REGISTRY_ORIGIN } from "./registry-data.js";

export type DistributionDigest = `sha256:${string}`;
export type InstalledDistributionMode = "source" | "package";
export type ConfiguredDistributionMode = InstalledDistributionMode | "hybrid";

export const DISTRIBUTION_PROVENANCE_SCHEMA_VERSION = 1 as const;

const MAX_ITEMS = 4_096;
const MAX_RELEASES = 256;
const MAX_DEPENDENCIES = 1_024;
const MAX_PATCHES = 2_048;
const MAX_FILES_PER_ITEM = 2_048;
const MAX_ARRAY_ENTRIES = 4_096;
const DIGEST = /^sha256:[a-f0-9]{64}$/u;
const IDENTIFIER = /^[a-z0-9]+(?:-[a-z0-9]+)*$/u;
const PACKAGE_NAME = /^(?:@[a-z0-9][a-z0-9._-]*\/)?[a-z0-9][a-z0-9._-]*$/u;
const IMPORT_SUFFIX = /^[a-z0-9]+(?:-[a-z0-9]+)*(?:\/[a-z0-9]+(?:-[a-z0-9]+)*)*$/u;

export interface DistributionPackageArtifact {
  readonly name: string;
  readonly version: string;
  readonly tarballDigest: DistributionDigest;
}

export interface DistributionReleasePin {
  readonly registryId: string;
  readonly origin: string;
  readonly trust: "official" | "enrolled" | "local-development";
  readonly identityDigest: DistributionDigest;
  readonly release: string;
  readonly manifestUrl: string;
  readonly manifestDigest: DistributionDigest;
  readonly packages: Readonly<Record<string, DistributionPackageArtifact>>;
}

export interface DistributionSourceFile {
  readonly logicalPath: string;
  readonly target: string;
  readonly role: "component" | "hook" | "lib" | "system" | "kit" | "style" | "token";
  readonly base: DistributionDigest;
  readonly installed: DistributionDigest | null;
  readonly mediaType: string;
  readonly executable: false;
  readonly tombstone?: boolean | undefined;
}

export interface DistributionStructuredPatch {
  readonly id: string;
  readonly adapter:
    | "css-import"
    | "css-source"
    | "css-token-block"
    | "package-dependency"
    | "tsconfig-path"
    | "tsconfig-include"
    | "framework-config";
  readonly target: string;
  readonly semanticKey: string;
  readonly ownedValueDigest: DistributionDigest;
}

interface DistributionItemBase {
  readonly registry: string;
  readonly itemId: string;
  readonly kind: "component" | "hook" | "utility" | "system" | "kit" | "theme" | "contract";
  readonly requested: string;
  readonly resolved: string;
  readonly releaseRef: string;
  readonly payload: {
    readonly url: string;
    readonly digest: DistributionDigest;
  };
  readonly direct: boolean;
  readonly registryDependencies: readonly string[];
  readonly dependencies: {
    readonly runtime: Readonly<Record<string, string>>;
    readonly development: Readonly<Record<string, string>>;
  };
  readonly structuredPatches: readonly DistributionStructuredPatch[];
  readonly contractVersion: string;
  readonly lastMigration: string | null;
}

export interface SourceDistributionItem extends DistributionItemBase {
  readonly mode: "source";
  readonly files: readonly DistributionSourceFile[];
  readonly packageClaims: readonly [];
  readonly importSubpaths: readonly [];
}

export interface PackageDistributionItem extends DistributionItemBase {
  readonly mode: "package";
  readonly files: readonly [];
  readonly packageClaims: readonly string[];
  readonly importSubpaths: readonly string[];
}

export type DistributionItem = SourceDistributionItem | PackageDistributionItem;

export interface DistributionDependencyOwnership {
  readonly scope: "runtime" | "development";
  readonly package: string;
  readonly range: string;
  readonly owners: readonly string[];
  /** Existing compatible declarations are retained when their final Mergora owner leaves. */
  readonly retention: "remove-if-unowned" | "retain-if-unowned";
}

export interface DistributionPatchOwnership extends DistributionStructuredPatch {
  readonly owners: readonly string[];
  /** Existing equivalent project glue is never converted into deletable Mergora ownership. */
  readonly retention: "remove-if-unowned" | "retain-if-unowned";
}

export interface DistributionProvenanceState {
  readonly schemaVersion: typeof DISTRIBUTION_PROVENANCE_SCHEMA_VERSION;
  readonly projectId: DistributionDigest;
  readonly configDigest: DistributionDigest;
  readonly defaultMode: ConfiguredDistributionMode;
  readonly packageName: string;
  readonly releases: Readonly<Record<string, DistributionReleasePin>>;
  readonly items: Readonly<Record<string, DistributionItem>>;
  readonly dependencyOwnership: Readonly<Record<string, DistributionDependencyOwnership>>;
  readonly patchOwnership: Readonly<Record<string, DistributionPatchOwnership>>;
}

export interface ValidatedDistributionProvenance {
  readonly state: DistributionProvenanceState;
  readonly canonicalDigest: DistributionDigest;
  readonly persistedBytes: Uint8Array;
}

function distributionError(
  message: string,
  code: string,
  target?: string,
  exitCode: 3 | 5 | 6 | 7 | 8 = 3,
): CliError {
  return new CliError(message, {
    code,
    exitCode,
    ...(target === undefined ? {} : { target }),
  });
}

function record(value: unknown, label: string): Record<string, unknown> {
  if (value === null || Array.isArray(value) || typeof value !== "object") {
    throw distributionError(`${label} must be an object.`, "DISTRIBUTION_PROVENANCE_INVALID");
  }
  return value as Record<string, unknown>;
}

function exactKeys(
  value: Record<string, unknown>,
  required: readonly string[],
  optional: readonly string[],
  label: string,
): void {
  const allowed = new Set([...required, ...optional]);
  if (
    required.some((key) => !Object.hasOwn(value, key)) ||
    Object.keys(value).some((key) => !allowed.has(key))
  ) {
    throw distributionError(
      `${label} has missing or unknown fields.`,
      "DISTRIBUTION_PROVENANCE_UNKNOWN_FIELD",
    );
  }
}

function text(value: unknown, label: string, maximum = 512): string {
  if (
    typeof value !== "string" ||
    value.length === 0 ||
    value.length > maximum ||
    value !== value.trim()
  ) {
    throw distributionError(
      `${label} must be a bounded non-empty string.`,
      "DISTRIBUTION_PROVENANCE_INVALID",
    );
  }
  return value;
}

function digest(value: unknown, label: string): DistributionDigest {
  const normalized = text(value, label, 71);
  if (!DIGEST.test(normalized)) {
    throw distributionError(
      `${label} must be an exact SHA-256 digest.`,
      "DISTRIBUTION_DIGEST_INVALID",
    );
  }
  return normalized as DistributionDigest;
}

function identifier(value: unknown, label: string): string {
  const normalized = text(value, label, 128);
  if (!IDENTIFIER.test(normalized)) {
    throw distributionError(
      `${label} must be a portable kebab-case identifier.`,
      "DISTRIBUTION_ID_INVALID",
    );
  }
  return normalized;
}

function packageName(value: unknown, label: string): string {
  const normalized = text(value, label, 214);
  if (!PACKAGE_NAME.test(normalized)) {
    throw distributionError(
      `${label} must be one portable npm package name.`,
      "DISTRIBUTION_PACKAGE_INVALID",
    );
  }
  return normalized;
}

function exactVersion(value: unknown, label: string): string {
  const normalized = text(value, label, 160);
  const parsed = parse(normalized, { loose: false });
  const canonical =
    parsed === null
      ? null
      : `${parsed.version}${parsed.build.length === 0 ? "" : `+${parsed.build.join(".")}`}`;
  if (canonical !== normalized) {
    throw distributionError(
      `${label} must use one exact canonical semantic version; mutable tags and ranges are forbidden.`,
      "DISTRIBUTION_RELEASE_INVALID",
      normalized,
      5,
    );
  }
  return normalized;
}

function semverRange(value: unknown, label: string): string {
  const normalized = text(value, label, 160);
  if (
    ["latest", "stable", "next"].includes(normalized) ||
    validRange(normalized, { loose: false, includePrerelease: true }) === null
  ) {
    throw distributionError(
      `${label} must be a valid bounded semantic-version range, not a mutable tag.`,
      "DISTRIBUTION_RANGE_INVALID",
      normalized,
      5,
    );
  }
  return normalized;
}

function portablePath(value: unknown, label: string): string {
  const normalized = text(value, label, 512);
  try {
    assertPortableRelativePath(normalized, label);
  } catch {
    throw distributionError(
      `${label} is not a safe portable project path.`,
      "DISTRIBUTION_PATH_INVALID",
      normalized,
      5,
    );
  }
  return normalized;
}

function sortedUnique(
  values: unknown,
  label: string,
  maximum = MAX_ARRAY_ENTRIES,
): readonly string[] {
  if (!Array.isArray(values) || values.length > maximum) {
    throw distributionError(`${label} must be a bounded array.`, "DISTRIBUTION_PROVENANCE_INVALID");
  }
  const normalized = values.map((value, index) => text(value, `${label}[${index}]`));
  if (new Set(normalized).size !== normalized.length) {
    throw distributionError(`${label} contains a duplicate.`, "DISTRIBUTION_PROVENANCE_DUPLICATE");
  }
  return normalized.sort(compareText);
}

function compareText(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function sortedRecord<T>(entries: readonly (readonly [string, T])[]): Record<string, T> {
  return Object.fromEntries([...entries].sort(([left], [right]) => compareText(left, right)));
}

function qualifiedItem(value: unknown, label: string): string {
  const normalized = text(value, label, 260);
  const pieces = normalized.split(":");
  if (pieces.length !== 2 || !IDENTIFIER.test(pieces[0]!) || !IDENTIFIER.test(pieces[1]!)) {
    throw distributionError(
      `${label} must be registry-id:item-id.`,
      "DISTRIBUTION_ITEM_ID_INVALID",
    );
  }
  return normalized;
}

function normalizedOrigin(
  value: unknown,
  trust: DistributionReleasePin["trust"],
  label: string,
): string {
  const source = text(value, label, 2_048);
  let parsed: URL;
  try {
    parsed = new URL(source);
  } catch {
    throw distributionError(
      `${label} must be an absolute URL.`,
      "DISTRIBUTION_REGISTRY_INVALID",
      undefined,
      5,
    );
  }
  const loopback = parsed.hostname === "localhost" || parsed.hostname === "127.0.0.1";
  if (
    parsed.username !== "" ||
    parsed.password !== "" ||
    parsed.search !== "" ||
    parsed.hash !== "" ||
    (parsed.protocol !== "https:" && !(parsed.protocol === "http:" && loopback)) ||
    (trust === "local-development") !== (parsed.protocol === "http:" && loopback)
  ) {
    throw distributionError(
      `${label} violates the enrolled registry transport or credential boundary.`,
      "DISTRIBUTION_REGISTRY_SECURITY_INVALID",
      undefined,
      5,
    );
  }
  const normalizedPath = parsed.pathname === "/" ? "" : parsed.pathname.replace(/\/$/u, "");
  const normalized = `${parsed.protocol}//${parsed.host}${normalizedPath}`;
  if (source !== normalized) {
    throw distributionError(
      `${label} must use its canonical origin without a trailing slash.`,
      "DISTRIBUTION_REGISTRY_INVALID",
      undefined,
      5,
    );
  }
  return normalized;
}

function parsePackages(
  value: unknown,
  release: string,
  label: string,
): Record<string, DistributionPackageArtifact> {
  const source = record(value, label);
  const entries = Object.entries(source);
  if (entries.length === 0 || entries.length > 64) {
    throw distributionError(
      `${label} must inventory 1-64 fixed release artifacts.`,
      "DISTRIBUTION_PACKAGE_INVALID",
    );
  }
  return sortedRecord(
    entries.map(([key, candidate]): readonly [string, DistributionPackageArtifact] => {
      const name = packageName(key, `${label} key`);
      const artifact = record(candidate, `${label}.${name}`);
      exactKeys(artifact, ["name", "version", "tarballDigest"], [], `${label}.${name}`);
      if (packageName(artifact.name, `${label}.${name}.name`) !== name) {
        throw distributionError(
          `${label}.${name} key and package identity disagree.`,
          "DISTRIBUTION_PACKAGE_INVALID",
        );
      }
      const version = exactVersion(artifact.version, `${label}.${name}.version`);
      if (version !== release) {
        throw distributionError(
          `${label}.${name} is outside immutable release group ${release}.`,
          "DISTRIBUTION_RELEASE_GROUP_MISMATCH",
          name,
          5,
        );
      }
      return [
        name,
        {
          name,
          version,
          tarballDigest: digest(artifact.tarballDigest, `${label}.${name}.tarballDigest`),
        },
      ];
    }),
  );
}

function parseRelease(key: string, value: unknown): DistributionReleasePin {
  const source = record(value, `Release ${key}`);
  exactKeys(
    source,
    [
      "registryId",
      "origin",
      "trust",
      "identityDigest",
      "release",
      "manifestUrl",
      "manifestDigest",
      "packages",
    ],
    [],
    `Release ${key}`,
  );
  const registryId = identifier(source.registryId, `Release ${key} registryId`);
  if (
    !(["official", "enrolled", "local-development"] as const).includes(
      source.trust as DistributionReleasePin["trust"],
    )
  ) {
    throw distributionError(
      `Release ${key} trust tier is invalid.`,
      "DISTRIBUTION_REGISTRY_INVALID",
      undefined,
      5,
    );
  }
  const trust = source.trust as DistributionReleasePin["trust"];
  const origin = normalizedOrigin(source.origin, trust, `Release ${key} origin`);
  const identityDigest = digest(source.identityDigest, `Release ${key} identityDigest`);
  if (
    trust === "official" &&
    (registryId !== "official" ||
      origin !== OFFICIAL_REGISTRY_ORIGIN ||
      identityDigest !==
        sha256(
          canonicalJson({ id: "official", origin: OFFICIAL_REGISTRY_ORIGIN, trust: "official" }),
        ))
  ) {
    throw distributionError(
      `Release ${key} does not match the compiled official registry identity.`,
      "DISTRIBUTION_REGISTRY_INVALID",
      key,
      5,
    );
  }
  const release = exactVersion(source.release, `Release ${key} version`);
  if (key !== `${registryId}@${release}`) {
    throw distributionError(
      `Release key ${key} does not bind its registry and exact version.`,
      "DISTRIBUTION_RELEASE_INVALID",
      key,
      5,
    );
  }
  const manifestUrl = text(source.manifestUrl, `Release ${key} manifestUrl`, 2_048);
  if (manifestUrl !== `${origin}/releases/${release}/manifest.json`) {
    throw distributionError(
      `Release ${key} manifest URL is not tied to its enrolled origin and exact release.`,
      "DISTRIBUTION_RELEASE_URL_INVALID",
      undefined,
      5,
    );
  }
  return {
    registryId,
    origin,
    trust,
    identityDigest,
    release,
    manifestUrl,
    manifestDigest: digest(source.manifestDigest, `Release ${key} manifestDigest`),
    packages: parsePackages(source.packages, release, `Release ${key} packages`),
  };
}

function dependencyMap(value: unknown, label: string): Record<string, string> {
  const source = record(value, label);
  if (Object.keys(source).length > MAX_DEPENDENCIES) {
    throw distributionError(
      `${label} exceeds the dependency limit.`,
      "DISTRIBUTION_LIMIT_EXCEEDED",
      undefined,
      5,
    );
  }
  return sortedRecord(
    Object.entries(source).map(([key, candidate]): readonly [string, string] => [
      packageName(key, `${label} key`),
      semverRange(candidate, `${label}.${key}`),
    ]),
  );
}

function parsePatch(value: unknown, label: string): DistributionStructuredPatch {
  const source = record(value, label);
  exactKeys(source, ["id", "adapter", "target", "semanticKey", "ownedValueDigest"], [], label);
  const adapter = source.adapter;
  if (
    !(
      [
        "css-import",
        "css-source",
        "css-token-block",
        "package-dependency",
        "tsconfig-path",
        "tsconfig-include",
        "framework-config",
      ] as const
    ).includes(adapter as DistributionStructuredPatch["adapter"])
  ) {
    throw distributionError(
      `${label} adapter is not a compiled structured adapter.`,
      "DISTRIBUTION_PATCH_INVALID",
      undefined,
      5,
    );
  }
  return {
    id: identifier(source.id, `${label}.id`),
    adapter: adapter as DistributionStructuredPatch["adapter"],
    target: portablePath(source.target, `${label}.target`),
    semanticKey: text(source.semanticKey, `${label}.semanticKey`, 512),
    ownedValueDigest: digest(source.ownedValueDigest, `${label}.ownedValueDigest`),
  };
}

function parseFile(value: unknown, label: string): DistributionSourceFile {
  const source = record(value, label);
  exactKeys(
    source,
    ["logicalPath", "target", "role", "base", "installed", "mediaType", "executable"],
    ["tombstone"],
    label,
  );
  if (
    !(["component", "hook", "lib", "system", "kit", "style", "token"] as const).includes(
      source.role as DistributionSourceFile["role"],
    ) ||
    source.executable !== false ||
    (source.tombstone !== undefined && typeof source.tombstone !== "boolean")
  ) {
    throw distributionError(
      `${label} source-file policy is invalid.`,
      "DISTRIBUTION_SOURCE_FILE_INVALID",
      undefined,
      5,
    );
  }
  const installed =
    source.installed === null ? null : digest(source.installed, `${label}.installed`);
  if (source.tombstone === true && installed !== null) {
    throw distributionError(
      `${label} tombstone cannot claim installed bytes.`,
      "DISTRIBUTION_SOURCE_FILE_INVALID",
    );
  }
  return {
    logicalPath: portablePath(source.logicalPath, `${label}.logicalPath`),
    target: portablePath(source.target, `${label}.target`),
    role: source.role as DistributionSourceFile["role"],
    base: digest(source.base, `${label}.base`),
    installed,
    mediaType: text(source.mediaType, `${label}.mediaType`, 120),
    executable: false,
    ...(source.tombstone === undefined ? {} : { tombstone: source.tombstone as boolean }),
  };
}

function parseItem(
  key: string,
  value: unknown,
  releases: Readonly<Record<string, DistributionReleasePin>>,
  configuredPackage: string,
): DistributionItem {
  const source = record(value, `Item ${key}`);
  exactKeys(
    source,
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
      "files",
      "packageClaims",
      "importSubpaths",
      "registryDependencies",
      "dependencies",
      "structuredPatches",
      "contractVersion",
      "lastMigration",
    ],
    [],
    `Item ${key}`,
  );
  const qualified = qualifiedItem(key, "Item key");
  const registry = identifier(source.registry, `Item ${key}.registry`);
  const itemId = identifier(source.itemId, `Item ${key}.itemId`);
  if (qualified !== `${registry}:${itemId}`) {
    throw distributionError(
      `Item ${key} key and identity disagree.`,
      "DISTRIBUTION_ITEM_ID_INVALID",
      key,
      5,
    );
  }
  if (
    !(["component", "hook", "utility", "system", "kit", "theme", "contract"] as const).includes(
      source.kind as DistributionItem["kind"],
    ) ||
    typeof source.direct !== "boolean" ||
    (source.mode !== "source" && source.mode !== "package")
  ) {
    throw distributionError(
      `Item ${key} identity or mode is invalid.`,
      "DISTRIBUTION_ITEM_INVALID",
    );
  }
  const requested = semverRange(source.requested, `Item ${key}.requested`);
  const resolved = exactVersion(source.resolved, `Item ${key}.resolved`);
  if (!satisfies(resolved, requested, { loose: false, includePrerelease: true })) {
    throw distributionError(
      `Item ${key} exact release does not satisfy its recorded request.`,
      "DISTRIBUTION_RELEASE_MISMATCH",
      key,
      5,
    );
  }
  const releaseRef = text(source.releaseRef, `Item ${key}.releaseRef`, 320);
  const release = releases[releaseRef];
  if (release === undefined || release.registryId !== registry || release.release !== resolved) {
    throw distributionError(
      `Item ${key} does not reference its enrolled registry's exact immutable release.`,
      "DISTRIBUTION_RELEASE_MISMATCH",
      key,
      5,
    );
  }
  const payloadSource = record(source.payload, `Item ${key}.payload`);
  exactKeys(payloadSource, ["url", "digest"], [], `Item ${key}.payload`);
  const payloadUrl = text(payloadSource.url, `Item ${key}.payload.url`, 2_048);
  if (payloadUrl !== `${release.origin}/releases/${resolved}/items/${itemId}.json`) {
    throw distributionError(
      `Item ${key} payload is not tied to its enrolled origin and exact release.`,
      "DISTRIBUTION_PAYLOAD_URL_INVALID",
      key,
      5,
    );
  }
  const dependenciesSource = record(source.dependencies, `Item ${key}.dependencies`);
  exactKeys(dependenciesSource, ["runtime", "development"], [], `Item ${key}.dependencies`);
  const dependencies = {
    runtime: dependencyMap(dependenciesSource.runtime, `Item ${key}.dependencies.runtime`),
    development: dependencyMap(
      dependenciesSource.development,
      `Item ${key}.dependencies.development`,
    ),
  };
  if (!Array.isArray(source.structuredPatches) || source.structuredPatches.length > MAX_PATCHES) {
    throw distributionError(
      `Item ${key} patches exceed their limit.`,
      "DISTRIBUTION_LIMIT_EXCEEDED",
      key,
      5,
    );
  }
  const structuredPatches = source.structuredPatches
    .map((patch, index) => parsePatch(patch, `Item ${key}.structuredPatches[${index}]`))
    .sort((left, right) => compareText(left.id, right.id));
  if (new Set(structuredPatches.map(({ id }) => id)).size !== structuredPatches.length) {
    throw distributionError(
      `Item ${key} repeats a structured patch.`,
      "DISTRIBUTION_PROVENANCE_DUPLICATE",
    );
  }
  if (!Array.isArray(source.files) || source.files.length > MAX_FILES_PER_ITEM) {
    throw distributionError(
      `Item ${key} files exceed their limit.`,
      "DISTRIBUTION_LIMIT_EXCEEDED",
      key,
      5,
    );
  }
  const files = source.files
    .map((file, index) => parseFile(file, `Item ${key}.files[${index}]`))
    .sort((left, right) => compareText(left.target, right.target));
  const packageClaims = sortedUnique(source.packageClaims, `Item ${key}.packageClaims`, 64).map(
    (claim) => packageName(claim, `Item ${key} package claim`),
  );
  const importSubpaths = sortedUnique(source.importSubpaths, `Item ${key}.importSubpaths`, 128);
  if (source.mode === "source") {
    if (packageClaims.length !== 0 || importSubpaths.length !== 0) {
      throw distributionError(
        `Source item ${key} cannot claim package internals or public import subpaths.`,
        "DISTRIBUTION_OWNERSHIP_CONFLICT",
        key,
        6,
      );
    }
  } else {
    if (files.length !== 0) {
      throw distributionError(
        `Package item ${key} cannot create source-file provenance for package internals.`,
        "DISTRIBUTION_OWNERSHIP_CONFLICT",
        key,
        6,
      );
    }
    if (!packageClaims.includes(configuredPackage) || importSubpaths.length === 0) {
      throw distributionError(
        `Package item ${key} must claim the configured UI package and at least one public import.`,
        "DISTRIBUTION_PACKAGE_INVALID",
        key,
        7,
      );
    }
    for (const claim of packageClaims) {
      const artifact = release.packages[claim];
      if (artifact === undefined || dependencies.runtime[claim] !== release.release) {
        throw distributionError(
          `Package item ${key} claim ${claim} is not pinned to its fixed release group.`,
          "DISTRIBUTION_RELEASE_GROUP_MISMATCH",
          key,
          5,
        );
      }
      const dependencyPatch = structuredPatches.find(
        (patch) =>
          patch.adapter === "package-dependency" &&
          patch.target === "package.json" &&
          patch.semanticKey === `dependencies.${claim}` &&
          patch.ownedValueDigest === sha256(release.release),
      );
      if (dependencyPatch === undefined) {
        throw distributionError(
          `Package item ${key} claim ${claim} lacks exact structured dependency ownership.`,
          "DISTRIBUTION_OWNERSHIP_INVALID",
          key,
          6,
        );
      }
    }
    for (const subpath of importSubpaths) {
      const suffix = subpath.slice(configuredPackage.length);
      if (
        !subpath.startsWith(`${configuredPackage}/`) ||
        suffix.length < 2 ||
        !IMPORT_SUFFIX.test(suffix.slice(1))
      ) {
        throw distributionError(
          `Package item ${key} import ${subpath} is outside the configured public package.`,
          "DISTRIBUTION_IMPORT_INVALID",
          key,
          5,
        );
      }
    }
  }
  const registryDependencies = sortedUnique(
    source.registryDependencies,
    `Item ${key}.registryDependencies`,
    256,
  ).map((dependency) => qualifiedItem(dependency, `Item ${key} registry dependency`));
  const contractVersion = exactVersion(source.contractVersion, `Item ${key}.contractVersion`);
  const lastMigration =
    source.lastMigration === null
      ? null
      : identifier(source.lastMigration, `Item ${key}.lastMigration`);
  const base = {
    registry,
    itemId,
    kind: source.kind as DistributionItem["kind"],
    requested,
    resolved,
    releaseRef,
    payload: {
      url: payloadUrl,
      digest: digest(payloadSource.digest, `Item ${key}.payload.digest`),
    },
    direct: source.direct as boolean,
    registryDependencies,
    dependencies,
    structuredPatches,
    contractVersion,
    lastMigration,
  };
  return source.mode === "source"
    ? { ...base, mode: "source", files, packageClaims: [], importSubpaths: [] }
    : { ...base, mode: "package", files: [], packageClaims, importSubpaths };
}

function parseDependencyOwnership(key: string, value: unknown): DistributionDependencyOwnership {
  const source = record(value, `Dependency ownership ${key}`);
  exactKeys(
    source,
    ["scope", "package", "range", "owners", "retention"],
    [],
    `Dependency ownership ${key}`,
  );
  if (
    (source.scope !== "runtime" && source.scope !== "development") ||
    (source.retention !== "remove-if-unowned" && source.retention !== "retain-if-unowned")
  ) {
    throw distributionError(
      `Dependency ownership ${key} policy is invalid.`,
      "DISTRIBUTION_OWNERSHIP_INVALID",
    );
  }
  const name = packageName(source.package, `Dependency ownership ${key}.package`);
  if (key !== `${source.scope}:${name}`) {
    throw distributionError(
      `Dependency ownership ${key} key disagrees with its identity.`,
      "DISTRIBUTION_OWNERSHIP_INVALID",
    );
  }
  return {
    scope: source.scope,
    package: name,
    range: semverRange(source.range, `Dependency ownership ${key}.range`),
    owners: sortedUnique(source.owners, `Dependency ownership ${key}.owners`).map((owner) =>
      qualifiedItem(owner, `Dependency ownership ${key} owner`),
    ),
    retention: source.retention,
  };
}

function parsePatchOwnership(key: string, value: unknown): DistributionPatchOwnership {
  const source = record(value, `Patch ownership ${key}`);
  exactKeys(
    source,
    ["id", "adapter", "target", "semanticKey", "ownedValueDigest", "owners", "retention"],
    [],
    `Patch ownership ${key}`,
  );
  const patch = parsePatch(
    {
      id: source.id,
      adapter: source.adapter,
      target: source.target,
      semanticKey: source.semanticKey,
      ownedValueDigest: source.ownedValueDigest,
    },
    `Patch ownership ${key}`,
  );
  if (
    key !== patch.id ||
    (source.retention !== "remove-if-unowned" && source.retention !== "retain-if-unowned")
  ) {
    throw distributionError(
      `Patch ownership ${key} key or retention is invalid.`,
      "DISTRIBUTION_OWNERSHIP_INVALID",
    );
  }
  return {
    ...patch,
    owners: sortedUnique(source.owners, `Patch ownership ${key}.owners`).map((owner) =>
      qualifiedItem(owner, `Patch ownership ${key} owner`),
    ),
    retention: source.retention,
  };
}

function portableTargetKey(value: string): string {
  return value.normalize("NFC").toLocaleLowerCase("en-US");
}

function assertOwnershipConsistency(state: DistributionProvenanceState): void {
  const dependencies = new Map<
    string,
    { requirements: { readonly owner: string; readonly range: string }[]; owners: string[] }
  >();
  const patches = new Map<string, { patch: DistributionStructuredPatch; owners: string[] }>();
  const sourceTargets = new Map<string, string>();
  for (const [owner, item] of Object.entries(state.items)) {
    for (const scope of ["runtime", "development"] as const) {
      for (const [name, range] of Object.entries(item.dependencies[scope])) {
        const key = `${scope}:${name}`;
        const current = dependencies.get(key);
        if (current === undefined) {
          dependencies.set(key, { requirements: [{ owner, range }], owners: [owner] });
        } else {
          current.requirements.push({ owner, range });
          current.owners.push(owner);
        }
      }
    }
    for (const patch of item.structuredPatches) {
      const current = patches.get(patch.id);
      if (current !== undefined && canonicalJson(current.patch) !== canonicalJson(patch)) {
        throw distributionError(
          `Patch ${patch.id} has conflicting semantic ownership.`,
          "DISTRIBUTION_PATCH_CONFLICT",
          patch.target,
          6,
        );
      }
      if (current === undefined) patches.set(patch.id, { patch, owners: [owner] });
      else current.owners.push(owner);
    }
    for (const file of item.files) {
      const portable = portableTargetKey(file.target);
      const existing = sourceTargets.get(portable);
      if (existing !== undefined) {
        throw distributionError(
          `Source target ${file.target} has duplicate ordinary-file ownership.`,
          "DISTRIBUTION_OWNERSHIP_CONFLICT",
          file.target,
          6,
        );
      }
      sourceTargets.set(portable, owner);
    }
    for (const dependency of item.registryDependencies) {
      const target = state.items[dependency];
      if (target === undefined) {
        throw distributionError(
          `Item ${owner} references missing installed dependency ${dependency}.`,
          "DISTRIBUTION_DEPENDENCY_INVALID",
          owner,
          7,
        );
      }
      if (target.mode !== item.mode) {
        throw distributionError(
          `Item ${owner} and dependency ${dependency} would enable one dependency graph in both source and package modes.`,
          "DISTRIBUTION_MIXED_OWNERSHIP_CONFLICT",
          dependency,
          6,
        );
      }
    }
  }
  if (dependencies.size !== Object.keys(state.dependencyOwnership).length) {
    throw distributionError(
      "Dependency ownership is incomplete or orphaned.",
      "DISTRIBUTION_OWNERSHIP_INVALID",
    );
  }
  for (const [key, aggregated] of dependencies) {
    const owned = state.dependencyOwnership[key];
    if (
      owned === undefined ||
      minVersion(owned.range, { loose: false }) === null ||
      aggregated.requirements.some(
        ({ range }) => !subset(owned.range, range, { loose: false, includePrerelease: true }),
      ) ||
      canonicalJson(owned.owners) !== canonicalJson(aggregated.owners.sort(compareText))
    ) {
      throw distributionError(
        `Dependency ownership ${key} is not a non-empty effective range within every owner requirement.`,
        "DISTRIBUTION_OWNERSHIP_INVALID",
      );
    }
  }
  if (patches.size !== Object.keys(state.patchOwnership).length) {
    throw distributionError(
      "Structured patch ownership is incomplete or orphaned.",
      "DISTRIBUTION_OWNERSHIP_INVALID",
    );
  }
  for (const [key, aggregated] of patches) {
    const owned = state.patchOwnership[key];
    if (
      owned === undefined ||
      canonicalJson({
        id: owned.id,
        adapter: owned.adapter,
        target: owned.target,
        semanticKey: owned.semanticKey,
        ownedValueDigest: owned.ownedValueDigest,
      }) !== canonicalJson(aggregated.patch) ||
      canonicalJson(owned.owners) !== canonicalJson(aggregated.owners.sort(compareText))
    ) {
      throw distributionError(
        `Patch ownership ${key} disagrees with item claims.`,
        "DISTRIBUTION_OWNERSHIP_INVALID",
      );
    }
  }
  const indegree = new Map(Object.keys(state.items).map((key) => [key, 0]));
  const dependents = new Map<string, string[]>();
  for (const [owner, item] of Object.entries(state.items)) {
    indegree.set(owner, item.registryDependencies.length);
    for (const dependency of item.registryDependencies) {
      const list = dependents.get(dependency) ?? [];
      list.push(owner);
      dependents.set(dependency, list);
    }
  }
  const ready = [...indegree].filter(([, count]) => count === 0).map(([key]) => key);
  let visited = 0;
  while (ready.length > 0) {
    const current = ready.pop()!;
    visited += 1;
    for (const dependent of dependents.get(current) ?? []) {
      const next = indegree.get(dependent)! - 1;
      indegree.set(dependent, next);
      if (next === 0) ready.push(dependent);
    }
  }
  if (visited !== Object.keys(state.items).length) {
    throw distributionError(
      "Installed registry dependency graph contains a cycle.",
      "DISTRIBUTION_DEPENDENCY_CYCLE",
      undefined,
      5,
    );
  }
}

/**
 * Validates and normalizes the portable package/source ownership snapshot. The snapshot deliberately
 * excludes timestamps, machine paths, credentials, caches, and mutable registry aliases.
 */
export function validateDistributionProvenance(value: unknown): DistributionProvenanceState {
  const source = record(value, "Distribution provenance");
  exactKeys(
    source,
    [
      "schemaVersion",
      "projectId",
      "configDigest",
      "defaultMode",
      "packageName",
      "releases",
      "items",
      "dependencyOwnership",
      "patchOwnership",
    ],
    [],
    "Distribution provenance",
  );
  if (source.schemaVersion !== DISTRIBUTION_PROVENANCE_SCHEMA_VERSION) {
    throw distributionError(
      "Distribution provenance schema is unsupported; upgrade the CLI rather than guessing.",
      "DISTRIBUTION_PROVENANCE_VERSION_UNSUPPORTED",
    );
  }
  if (
    !(["source", "package", "hybrid"] as const).includes(
      source.defaultMode as ConfiguredDistributionMode,
    )
  ) {
    throw distributionError(
      "Distribution default mode is invalid.",
      "DISTRIBUTION_PROVENANCE_INVALID",
    );
  }
  const configuredPackage = packageName(source.packageName, "Distribution packageName");
  const releaseSource = record(source.releases, "Distribution releases");
  const releaseEntries = Object.entries(releaseSource);
  if (releaseEntries.length === 0 || releaseEntries.length > MAX_RELEASES) {
    throw distributionError(
      "Distribution release inventory is empty or oversized.",
      "DISTRIBUTION_LIMIT_EXCEEDED",
      undefined,
      5,
    );
  }
  const releases = sortedRecord(
    releaseEntries.map(([key, release]): readonly [string, DistributionReleasePin] => [
      text(key, "Release key", 320),
      parseRelease(key, release),
    ]),
  );
  const itemSource = record(source.items, "Distribution items");
  const itemEntries = Object.entries(itemSource);
  if (itemEntries.length > MAX_ITEMS) {
    throw distributionError(
      "Distribution item inventory is oversized.",
      "DISTRIBUTION_LIMIT_EXCEEDED",
      undefined,
      5,
    );
  }
  const items = sortedRecord(
    itemEntries.map(([key, item]): readonly [string, DistributionItem] => [
      qualifiedItem(key, "Distribution item key"),
      parseItem(key, item, releases, configuredPackage),
    ]),
  );
  const dependencySource = record(source.dependencyOwnership, "Dependency ownership");
  if (Object.keys(dependencySource).length > MAX_DEPENDENCIES) {
    throw distributionError(
      "Dependency ownership is oversized.",
      "DISTRIBUTION_LIMIT_EXCEEDED",
      undefined,
      5,
    );
  }
  const dependencyOwnership = sortedRecord(
    Object.entries(dependencySource).map(
      ([key, ownership]): readonly [string, DistributionDependencyOwnership] => [
        text(key, "Dependency ownership key", 340),
        parseDependencyOwnership(key, ownership),
      ],
    ),
  );
  const patchSource = record(source.patchOwnership, "Patch ownership");
  if (Object.keys(patchSource).length > MAX_PATCHES) {
    throw distributionError(
      "Patch ownership is oversized.",
      "DISTRIBUTION_LIMIT_EXCEEDED",
      undefined,
      5,
    );
  }
  const patchOwnership = sortedRecord(
    Object.entries(patchSource).map(
      ([key, ownership]): readonly [string, DistributionPatchOwnership] => [
        identifier(key, "Patch ownership key"),
        parsePatchOwnership(key, ownership),
      ],
    ),
  );
  const state: DistributionProvenanceState = {
    schemaVersion: DISTRIBUTION_PROVENANCE_SCHEMA_VERSION,
    projectId: digest(source.projectId, "Distribution projectId"),
    configDigest: digest(source.configDigest, "Distribution configDigest"),
    defaultMode: source.defaultMode as ConfiguredDistributionMode,
    packageName: configuredPackage,
    releases,
    items,
    dependencyOwnership,
    patchOwnership,
  };
  assertOwnershipConsistency(state);
  return state;
}

export function serializeDistributionProvenance(value: unknown): ValidatedDistributionProvenance {
  const state = validateDistributionProvenance(value);
  const canonicalDigest = sha256(canonicalJson(state));
  return {
    state,
    canonicalDigest,
    persistedBytes: Buffer.from(`${JSON.stringify(state, null, 2)}\n`),
  };
}

/**
 * Binds persisted distribution provenance to the already-validated project configuration. This
 * keeps an enrolled registry from self-asserting its origin, trust tier, or accepted identity in
 * the manifest and also prevents distribution settings from drifting away from mergora.json.
 */
export function assertDistributionConfigurationBinding(
  stateValue: unknown,
  configurationValue: unknown,
): MergoraConfig {
  const state = validateDistributionProvenance(stateValue);
  const configuration = validateMergoraConfig(configurationValue);
  if (
    state.configDigest !== sha256(canonicalJson(configuration)) ||
    state.defaultMode !== configuration.distribution.defaultMode ||
    state.packageName !== configuration.distribution.packageName
  ) {
    throw distributionError(
      "Distribution provenance does not match the exact validated project configuration.",
      "DISTRIBUTION_CONFIG_BINDING_INVALID",
      "mergora.json",
      5,
    );
  }
  for (const release of Object.values(state.releases)) {
    const registry = configuration.registries[release.registryId];
    const expectedIdentity =
      release.registryId === "official"
        ? sha256(
            canonicalJson({
              id: "official",
              origin: OFFICIAL_REGISTRY_ORIGIN,
              trust: "official",
            }),
          )
        : registry?.identityDigest;
    if (
      registry === undefined ||
      registry.protocol !== "mergora-v1" ||
      registry.origin !== release.origin ||
      registry.trust !== release.trust ||
      expectedIdentity === undefined ||
      expectedIdentity !== release.identityDigest
    ) {
      throw distributionError(
        `Release registry ${release.registryId} is not bound to its accepted mergora.json identity.`,
        "DISTRIBUTION_CONFIG_REGISTRY_MISMATCH",
        "mergora.json",
        5,
      );
    }
  }
  return configuration;
}

export function resolveRequestedDistributionMode(
  configured: ConfiguredDistributionMode,
  explicit?: InstalledDistributionMode,
): InstalledDistributionMode {
  if (!(["source", "package", "hybrid"] as const).includes(configured)) {
    throw distributionError(
      "Configured distribution mode is invalid.",
      "DISTRIBUTION_MODE_INVALID",
      undefined,
      7,
    );
  }
  if (explicit !== undefined && explicit !== "source" && explicit !== "package") {
    throw distributionError(
      "Explicit distribution mode is invalid.",
      "DISTRIBUTION_MODE_INVALID",
      undefined,
      7,
    );
  }
  if (explicit !== undefined) return explicit;
  return configured === "package" ? "package" : "source";
}

export function assertDistributionEnrollmentAllowed(
  value: unknown,
  qualifiedId: string,
  requestedMode: InstalledDistributionMode,
): void {
  const state = validateDistributionProvenance(value);
  const id = qualifiedItem(qualifiedId, "Requested item");
  if (requestedMode !== "source" && requestedMode !== "package") {
    throw distributionError("Requested item mode is invalid.", "DISTRIBUTION_MODE_INVALID", id, 7);
  }
  const existing = state.items[id];
  if (existing !== undefined && existing.mode !== requestedMode) {
    throw distributionError(
      `Item ${id} is already enrolled in ${existing.mode} mode; use an explicit mode migration.`,
      "DISTRIBUTION_MIXED_OWNERSHIP_CONFLICT",
      id,
      6,
    );
  }
}
