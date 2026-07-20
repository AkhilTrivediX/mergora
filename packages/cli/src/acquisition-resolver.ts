import { Buffer } from "node:buffer";

import {
  acquireImmutableArtifact,
  type AcquisitionRegistryIdentity,
  type AcquisitionSource,
  type AcquisitionTransport,
  type AcquisitionValidationContext,
  type AcquisitionVendorReader,
} from "./acquisition.js";
import { validateContractDefinitionV1 } from "mergora-contracts";
import { canonicalJson, CliError, sha256 } from "./contracts.js";

const DIGEST = /^sha256:[a-f0-9]{64}$/u;
const ID = /^[a-z0-9]+(?:-[a-z0-9]+)*$/u;
const QUALIFIED_ID = /^([a-z0-9]+(?:-[a-z0-9]+)*):([a-z0-9]+(?:-[a-z0-9]+)*)$/u;
const PACKAGE_NAME = /^(?:@[a-z0-9][a-z0-9._-]*\/)?[a-z0-9][a-z0-9._-]*$/u;
const SEMVER =
  /^(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)(?:-[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?(?:\+[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?$/u;
const STABLE_SEMVER = /^(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)$/u;
const SEMVER_RANGE =
  /^(?!.*(?:git|https?|file|workspace|link|portal|patch|github):)[-0-9A-Za-z*<>=~^|. +]+$/u;
const SPDX = /^[A-Za-z0-9][A-Za-z0-9-.+]*(?: WITH [A-Za-z0-9][A-Za-z0-9-.+]*)?$/u;
const SHA512_SRI = /^sha512-[A-Za-z0-9+/]+={0,2}$/u;
const PUBLIC_NPM_REGISTRY_ORIGIN = "https://registry.npmjs.org" as const;
const MEDIA_TYPES = new Set([
  "text/typescript",
  "text/typescript-jsx",
  "text/javascript",
  "text/javascript-jsx",
  "text/css",
  "application/json",
  "application/dtcg+json",
  "text/markdown",
  "application/octet-stream",
  "font/woff2",
  "image/svg+xml",
]);
const ROLES = new Set([
  "component",
  "hook",
  "lib",
  "system",
  "kit",
  "style",
  "token",
  "contract",
  "example",
]);
const KINDS = new Set(["component", "hook", "utility", "system", "kit", "theme", "contract"]);
const MATURITIES = new Set(["experimental", "beta", "stable", "deprecated"]);
const QUALITY_TIERS = new Set(["complete", "partial", "not-supplied"]);
const TRANSFORM_ADAPTERS = new Set([
  "alias-rewrite",
  "import-rewrite",
  "target-map",
  "format",
  "token-resolve",
  "none",
]);
const PATCH_ADAPTERS = new Set([
  "css-import",
  "css-source",
  "css-token-block",
  "package-dependency",
  "tsconfig-path",
  "tsconfig-include",
  "framework-config",
]);
const MIGRATION_ADAPTERS = new Set([
  "rename-file",
  "rename-export",
  "rename-prop",
  "rename-token",
  "config-v1",
  "manual-checklist",
]);
const EXECUTABLE_METADATA_KEYS = new Set([
  "script",
  "scripts",
  "shell",
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
const DEFAULT_MAX_CATALOG_BYTES = 4 * 1024 * 1024;
const DEFAULT_MAX_MANIFEST_BYTES = 8 * 1024 * 1024;
const DEFAULT_MAX_ITEM_BYTES = 2 * 1024 * 1024;
const DEFAULT_MAX_OPERATION_BYTES = 64 * 1024 * 1024;
const MAX_ITEMS = 4096;
const MAX_FILES_PER_ITEM = 1024;
const MAX_NPM_PACKAGES = 1024;
const MAX_NPM_LICENSES = 128;
const MAX_NPM_TARBALL_BYTES = 16 * 1024 * 1024;
const MAX_NPM_TOTAL_INCLUDED_BYTES = 32 * 1024 * 1024;

type Digest = `sha256:${string}`;

export type NativeRegistryDocumentKind = "catalog" | "release-manifest" | "item";

export interface NativeReleaseArtifactReference {
  /** Protocol-origin-relative path, for example `catalog.json` or `releases/1.0.0/manifest.json`. */
  readonly path: string;
  readonly digest: Digest;
  readonly bytes?: number | undefined;
}

export interface NativeRegistryDocumentValidationContext {
  readonly acquisition: AcquisitionValidationContext;
  readonly kind: NativeRegistryDocumentKind;
}

export type NativeRegistryDocumentValidator = (
  kind: NativeRegistryDocumentKind,
  value: unknown,
  context: NativeRegistryDocumentValidationContext,
) => void | Promise<void>;

export interface ResolveNativeRegistryReleaseOptions {
  readonly projectRoot: string;
  readonly registry: AcquisitionRegistryIdentity;
  readonly release: string;
  readonly catalog: NativeReleaseArtifactReference;
  readonly manifest: NativeReleaseArtifactReference;
  readonly itemIds: readonly string[];
  /** Contract documents are acquired only for an add path that explicitly owns their use. */
  readonly contractSelection?: "all" | "none" | "stable" | undefined;
  readonly offline?: boolean | undefined;
  readonly mirrorOrigins?: readonly string[] | undefined;
  readonly authorization?: string | undefined;
  readonly vendor?: AcquisitionVendorReader | undefined;
  readonly transport?: AcquisitionTransport | undefined;
  readonly validateDocument?: NativeRegistryDocumentValidator | undefined;
  readonly maxCatalogBytes?: number | undefined;
  readonly maxManifestBytes?: number | undefined;
  readonly maxItemBytes?: number | undefined;
  readonly maxOperationBytes?: number | undefined;
  readonly timeoutMs?: number | undefined;
  readonly writeCache?: boolean | undefined;
}

export interface AcquiredNativeCatalogItem {
  readonly id: string;
  readonly aliases: readonly string[];
  readonly displayName: string;
  readonly description: string;
  readonly kind: "component" | "hook" | "utility" | "system" | "kit" | "theme" | "contract";
  readonly category: string;
  readonly tags: readonly string[];
  readonly keywords: readonly string[];
  readonly maturity: "experimental" | "beta" | "stable" | "deprecated";
  readonly latestStableVersion: string | null;
  readonly lastChangedVersion: string;
  readonly compatibility: Readonly<Record<string, unknown>>;
  readonly license: string;
  readonly links: {
    readonly payload: string;
    readonly passport: string;
    readonly contract: string;
    readonly docs: string;
    readonly source: string;
  };
  readonly registryDependencies: readonly string[];
  readonly quality: {
    readonly tier: "complete" | "partial" | "not-supplied";
    readonly manualAssistiveTechnologyEvidence: boolean;
  };
}

export interface AcquiredNativeFile {
  readonly logicalPath: string;
  readonly targetRole:
    "component" | "hook" | "lib" | "system" | "kit" | "style" | "token" | "contract" | "example";
  readonly mediaType: string;
  readonly bytes: number;
  readonly digest: Digest;
  readonly executable: false;
  readonly encoding: "utf8" | "base64";
  readonly content: string;
  readonly sourceUrl: string | null;
  readonly transformPipeline: readonly {
    readonly adapter:
      "alias-rewrite" | "import-rewrite" | "target-map" | "format" | "token-resolve" | "none";
    readonly version: string;
  }[];
}

export interface AcquiredNativeRegistryItem {
  readonly itemId: string;
  readonly kind: AcquiredNativeCatalogItem["kind"];
  readonly version: string;
  readonly lastChangedVersion: string;
  readonly maturity: AcquiredNativeCatalogItem["maturity"];
  readonly license: string;
  readonly title: string;
  readonly description: string;
  readonly links: {
    readonly docs: string;
    readonly source: string;
    readonly changelog: string;
    readonly passport: string;
    readonly contract: string;
  };
  readonly compatibility: Readonly<Record<string, unknown>>;
  readonly files: readonly AcquiredNativeFile[];
  readonly registryDependencies: readonly string[];
  readonly dependencies: {
    readonly runtime: Readonly<Record<string, string>>;
    readonly development: Readonly<Record<string, string>>;
  };
  readonly structuredPatches: readonly Readonly<Record<string, unknown>>[];
  readonly migrations: readonly Readonly<Record<string, unknown>>[];
  readonly contract: { readonly id: string; readonly version: string };
  readonly contractDocument?:
    | {
        readonly content: string;
        readonly digest: Digest;
        readonly url: string;
      }
    | undefined;
  readonly passport: { readonly id: string; readonly version: string };
  readonly examples: readonly string[];
  readonly importPaths: readonly string[];
  readonly payloadUrl: string;
  /** Digest over exact acquired canonical payload bytes, including payloadDigest. */
  readonly payloadDigest: Digest;
  /** The payload's schema-defined digest over its canonical unsigned object. */
  readonly payloadSelfDigest: Digest;
  readonly acquisitionSource: AcquisitionSource;
}

export type AcquiredNativeNpmPackageArtifact =
  | {
      readonly package: string;
      readonly version: string;
      readonly url: string;
      readonly bytes: number;
      readonly digest: Digest;
      readonly integrity: `sha512-${string}`;
      readonly license: string;
      readonly disposition: "include";
    }
  | {
      readonly package: string;
      readonly version: string;
      readonly url: string;
      readonly bytes: number;
      readonly digest: Digest;
      readonly integrity: `sha512-${string}`;
      readonly license: string;
      readonly disposition: "omit";
      readonly omissionReason: "explicitly-omitted" | "license-not-allowed";
    };

export interface AcquiredNativeNpmPackageInventory {
  readonly allowedLicenses: readonly string[];
  readonly entries: readonly AcquiredNativeNpmPackageArtifact[];
}

export interface AcquiredNativeRegistryRelease {
  readonly protocolVersion: "mergora-v1";
  readonly registry: AcquisitionRegistryIdentity;
  readonly release: string;
  readonly catalogDigest: Digest;
  readonly manifestDigest: Digest;
  readonly manifestSelfDigest: Digest;
  readonly dependencyGraphDigest: Digest;
  readonly source: AcquisitionSource;
  readonly artifactSources: readonly AcquisitionSource[];
  readonly requestedItems: readonly string[];
  readonly resolvedItems: readonly string[];
  readonly catalog: readonly AcquiredNativeCatalogItem[];
  readonly aliases: Readonly<Record<string, string>>;
  readonly items: readonly AcquiredNativeRegistryItem[];
  /**
   * Digest-bound public npm inventory. `null` means the older manifest omitted
   * the inventory and consumers requesting npm tarballs must fail closed.
   */
  readonly npmPackageInventory: AcquiredNativeNpmPackageInventory | null;
  readonly acquiredBytes: number;
}

/** Returns the persisted enrollment-policy binding when one exists, otherwise the declaration. */
export function acquiredRegistryBindingDigest(registry: AcquisitionRegistryIdentity): Digest {
  return registry.enrollmentDigest ?? registry.identityDigest;
}

const AUTHENTIC_ACQUIRED_NATIVE_RELEASES = new WeakSet<object>();

/** Fails unless the value is the exact frozen object returned by this process's native resolver. */
export function assertAuthenticAcquiredNativeRegistryRelease(
  value: unknown,
): asserts value is AcquiredNativeRegistryRelease {
  if (
    value === null ||
    typeof value !== "object" ||
    !AUTHENTIC_ACQUIRED_NATIVE_RELEASES.has(value)
  ) {
    throw resolverError(
      "Distribution source materialization requires an authentic acquired native release.",
      "REGISTRY_ACQUIRED_RELEASE_UNAUTHENTIC",
    );
  }
}

interface ManifestEvidenceReference {
  readonly id: string;
  readonly artifact: string;
  readonly digest: Digest;
}

interface ManifestItem {
  readonly version: string;
  readonly payload: ManifestEvidenceReference;
  readonly passport: ManifestEvidenceReference;
  readonly contract: ManifestEvidenceReference;
  readonly dependencies: readonly string[];
}

interface ManifestArtifact {
  readonly name: string;
  readonly url: string;
  readonly digest: Digest;
  readonly mediaType: string;
  readonly bytes: number;
}

interface ParsedManifest {
  readonly manifestSelfDigest: Digest;
  readonly dependencyGraphDigest: Digest;
  readonly items: Readonly<Record<string, ManifestItem>>;
  readonly artifactsByUrl: ReadonlyMap<string, ManifestArtifact>;
  readonly npmPackageInventory: AcquiredNativeNpmPackageInventory | null;
}

interface ParsedPayloadFile {
  readonly logicalPath: string;
  readonly targetRole: AcquiredNativeFile["targetRole"];
  readonly mediaType: string;
  readonly bytes: number;
  readonly digest: Digest;
  readonly content: string | null;
  readonly sourceUrl: string | null;
  readonly transformPipeline: AcquiredNativeFile["transformPipeline"];
}

interface ParsedPayload extends Omit<
  AcquiredNativeRegistryItem,
  "files" | "payloadUrl" | "payloadDigest" | "acquisitionSource"
> {
  readonly files: readonly ParsedPayloadFile[];
}

function resolverError(message: string, code: string, target?: string): CliError {
  return new CliError(message, {
    code,
    exitCode: code.endsWith("_MISSING") ? 4 : 5,
    ...(target === undefined ? {} : { target }),
  });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function record(value: unknown, label: string): Record<string, unknown> {
  if (!isRecord(value)) {
    throw resolverError(`${label} must be an object.`, "REGISTRY_DOCUMENT_SCHEMA_INVALID");
  }
  return value;
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
    throw resolverError(
      `${label} has missing or unknown fields.`,
      "REGISTRY_DOCUMENT_SCHEMA_INVALID",
    );
  }
}

function text(
  value: unknown,
  label: string,
  options: { readonly pattern?: RegExp | undefined; readonly max?: number | undefined } = {},
): string {
  if (
    typeof value !== "string" ||
    value.length < 1 ||
    value.length > (options.max ?? 4096) ||
    value !== value.trim() ||
    value !== value.normalize("NFKC") ||
    [...value].some((character) => {
      const codePoint = character.codePointAt(0)!;
      return codePoint <= 31 || codePoint === 127;
    }) ||
    (options.pattern !== undefined && !options.pattern.test(value))
  ) {
    throw resolverError(`${label} is invalid.`, "REGISTRY_DOCUMENT_SCHEMA_INVALID");
  }
  return value;
}

function humanText(value: unknown, label: string, maximum = 4096): string {
  if (
    typeof value !== "string" ||
    value.length < 1 ||
    value.length > maximum ||
    value !== value.trim() ||
    value !== value.normalize("NFC") ||
    [...value].some((character) => {
      const codePoint = character.codePointAt(0)!;
      return codePoint <= 31 || codePoint === 127;
    })
  ) {
    throw resolverError(`${label} is invalid.`, "REGISTRY_DOCUMENT_SCHEMA_INVALID");
  }
  return value;
}

function digest(value: unknown, label: string): Digest {
  return text(value, label, { pattern: DIGEST, max: 71 }) as Digest;
}

function strings(
  value: unknown,
  label: string,
  options: {
    readonly max: number;
    readonly pattern?: RegExp | undefined;
    readonly itemMax?: number | undefined;
  },
): readonly string[] {
  if (!Array.isArray(value) || value.length > options.max) {
    throw resolverError(`${label} is invalid.`, "REGISTRY_DOCUMENT_SCHEMA_INVALID");
  }
  const result = value.map((entry, index) =>
    text(entry, `${label}[${String(index)}]`, {
      pattern: options.pattern,
      max: options.itemMax,
    }),
  );
  if (new Set(result).size !== result.length) {
    throw resolverError(`${label} contains duplicates.`, "REGISTRY_DOCUMENT_SCHEMA_INVALID");
  }
  return result;
}

function byteCount(value: unknown, label: string, maximum: number): number {
  if (!Number.isSafeInteger(value) || Number(value) < 0 || Number(value) > maximum) {
    throw resolverError(`${label} is invalid.`, "REGISTRY_DOCUMENT_SCHEMA_INVALID");
  }
  return Number(value);
}

function immutableUrl(value: unknown, label: string, origin?: string): string {
  const raw = text(value, label, { max: 2048 });
  let parsed: URL;
  try {
    parsed = new URL(raw);
  } catch {
    throw resolverError(`${label} is not a URL.`, "REGISTRY_DOCUMENT_SCHEMA_INVALID");
  }
  if (
    parsed.protocol !== "https:" ||
    parsed.username !== "" ||
    parsed.password !== "" ||
    parsed.search !== "" ||
    parsed.hash !== "" ||
    raw.includes("%") ||
    (origin !== undefined && !raw.startsWith(`${origin}/`))
  ) {
    throw resolverError(
      `${label} is not immutable under the selected registry origin.`,
      "REGISTRY_URL_INVALID",
    );
  }
  return raw;
}

function httpsUrl(value: unknown, label: string): string {
  const raw = text(value, label, { max: 2048 });
  let parsed: URL;
  try {
    parsed = new URL(raw);
  } catch {
    throw resolverError(`${label} is not a URL.`, "REGISTRY_DOCUMENT_SCHEMA_INVALID");
  }
  if (parsed.protocol !== "https:" || parsed.username !== "" || parsed.password !== "") {
    throw resolverError(`${label} violates the HTTPS URL policy.`, "REGISTRY_URL_INVALID");
  }
  return raw;
}

function normalizedOrigin(value: string): string {
  let end = value.length;
  while (end > 0 && value.charCodeAt(end - 1) === 47) end -= 1;
  return value.slice(0, end);
}

function pathFromImmutableUrl(url: string, origin: string, label: string): string {
  const normalized = normalizedOrigin(origin);
  if (!url.startsWith(`${normalized}/`)) {
    throw resolverError(`${label} leaves the selected registry origin.`, "REGISTRY_URL_INVALID");
  }
  const path = url.slice(normalized.length + 1);
  if (
    path.length === 0 ||
    path === "r/v1" ||
    path.startsWith("r/v1/") ||
    path.includes("\\") ||
    path.includes("//") ||
    path.split("/").some((segment) => segment === "" || segment === "." || segment === "..")
  ) {
    throw resolverError(
      `${label} is not a portable protocol-relative artifact path.`,
      "REGISTRY_URL_INVALID",
    );
  }
  return path;
}

function canonicalDocument(bytes: Uint8Array, label: string): unknown {
  let source: string;
  try {
    source = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    throw resolverError(`${label} is not valid UTF-8.`, "REGISTRY_DOCUMENT_ENCODING_INVALID");
  }
  let value: unknown;
  try {
    value = JSON.parse(source) as unknown;
  } catch {
    throw resolverError(`${label} is not valid JSON.`, "REGISTRY_DOCUMENT_JSON_INVALID");
  }
  let canonical: string;
  try {
    canonical = `${canonicalJson(value)}\n`;
  } catch {
    throw resolverError(
      `${label} cannot be represented as canonical JSON.`,
      "REGISTRY_DOCUMENT_JSON_INVALID",
    );
  }
  if (source !== canonical) {
    throw resolverError(
      `${label} is not canonical JSON or contains duplicate object fields.`,
      "REGISTRY_DOCUMENT_NONCANONICAL",
    );
  }
  return value;
}

function assertNoExecutableMetadata(value: unknown, path = "$"): void {
  if (Array.isArray(value)) {
    value.forEach((entry, index) => assertNoExecutableMetadata(entry, `${path}/${String(index)}`));
    return;
  }
  if (!isRecord(value)) return;
  for (const [key, entry] of Object.entries(value)) {
    if (EXECUTABLE_METADATA_KEYS.has(key.toLocaleLowerCase("en-US"))) {
      throw resolverError(
        `Registry metadata contains prohibited executable behavior at ${path}/${key}.`,
        "REGISTRY_EXECUTABLE_METADATA_REJECTED",
      );
    }
    assertNoExecutableMetadata(entry, `${path}/${key}`);
  }
}

function portableLogicalPath(value: unknown, label: string): string {
  const path = text(value, label, { max: 1024 });
  if (
    !/^(?:ui|hooks|lib|systems|kits|themes|contracts|examples|tokens)\//u.test(path) ||
    path.startsWith("/") ||
    /^[A-Za-z]:/u.test(path) ||
    path.includes("\\") ||
    path.includes("//") ||
    path.includes("%") ||
    path.split("/").some((segment) => segment === "" || segment === "." || segment === "..")
  ) {
    throw resolverError(`${label} is not a portable logical path.`, "REGISTRY_ITEM_SCHEMA_INVALID");
  }
  return path;
}

function semverRangeMap(value: unknown, label: string): Readonly<Record<string, string>> {
  const source = record(value, label);
  if (Object.keys(source).length > 256) {
    throw resolverError(`${label} exceeds its entry bound.`, "REGISTRY_ITEM_SCHEMA_INVALID");
  }
  return Object.fromEntries(
    Object.entries(source)
      .map(([name, range]) => {
        if (!PACKAGE_NAME.test(name)) {
          throw resolverError(
            `${label} contains an invalid package name.`,
            "REGISTRY_ITEM_SCHEMA_INVALID",
          );
        }
        return [
          name,
          text(range, `${label}.${name}`, { pattern: SEMVER_RANGE, max: 160 }),
        ] as const;
      })
      .sort(([left], [right]) => left.localeCompare(right, "en-US")),
  );
}

function compatibility(value: unknown, label: string): Readonly<Record<string, unknown>> {
  const source = record(value, label);
  exactKeys(
    source,
    [
      "cli",
      "node",
      "react",
      "typescript",
      "tailwind",
      "frameworks",
      "packageManagers",
      "browserCapabilities",
    ],
    [],
    label,
  );
  for (const key of ["cli", "node", "react", "typescript", "tailwind"] as const) {
    text(source[key], `${label}.${key}`, { pattern: SEMVER_RANGE, max: 160 });
  }
  const frameworks = record(source.frameworks, `${label}.frameworks`);
  const managers = record(source.packageManagers, `${label}.packageManagers`);
  if (Object.keys(frameworks).length > 32 || Object.keys(managers).length > 8) {
    throw resolverError(
      `${label} exceeds its compatibility bound.`,
      "REGISTRY_ITEM_SCHEMA_INVALID",
    );
  }
  for (const [key, range] of [...Object.entries(frameworks), ...Object.entries(managers)]) {
    text(key, `${label} key`, { pattern: ID, max: 128 });
    text(range, `${label}.${key}`, { pattern: SEMVER_RANGE, max: 160 });
  }
  strings(source.browserCapabilities, `${label}.browserCapabilities`, {
    max: 64,
    itemMax: 120,
  });
  return structuredClone(source);
}

function evidenceReference(
  value: unknown,
  label: string,
  origin: string,
): ManifestEvidenceReference {
  const source = record(value, label);
  exactKeys(source, ["id", "artifact", "digest"], [], label);
  return {
    id: text(source.id, `${label}.id`, { pattern: ID, max: 128 }),
    artifact: immutableUrl(source.artifact, `${label}.artifact`, origin),
    digest: digest(source.digest, `${label}.digest`),
  };
}

function versionedId(
  value: unknown,
  label: string,
): { readonly id: string; readonly version: string } {
  const source = record(value, label);
  exactKeys(source, ["id", "version"], [], label);
  return {
    id: text(source.id, `${label}.id`, { pattern: ID, max: 128 }),
    version: text(source.version, `${label}.version`, { pattern: SEMVER, max: 160 }),
  };
}

function deepFreeze<T>(value: T): T {
  if (value !== null && typeof value === "object" && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const nested of Object.values(value as Record<string, unknown>)) deepFreeze(nested);
  }
  return value;
}

function parseCatalog(
  value: unknown,
  registry: AcquisitionRegistryIdentity,
  release: string,
): {
  readonly dependencyGraphDigest: Digest;
  readonly items: readonly AcquiredNativeCatalogItem[];
  readonly aliases: Readonly<Record<string, string>>;
} {
  assertNoExecutableMetadata(value);
  const root = record(value, "Native registry catalog");
  exactKeys(
    root,
    ["schemaVersion", "protocolVersion", "registry", "releases", "items", "dependencyGraphDigest"],
    [],
    "Native registry catalog",
  );
  if (root.schemaVersion !== 1 || root.protocolVersion !== "mergora-v1") {
    throw resolverError(
      "Native registry catalog uses an unsupported protocol or schema version.",
      "REGISTRY_PROTOCOL_UNSUPPORTED",
    );
  }
  const identity = record(root.registry, "Native registry identity");
  exactKeys(identity, ["id", "origin", "trust", "identityDigest"], [], "Native registry identity");
  const declaredOrigin = normalizedOrigin(immutableUrl(identity.origin, "Native registry origin"));
  const declaredTrust = text(identity.trust, "Native registry trust", { max: 32 });
  const declaredIdentityDigest = digest(identity.identityDigest, "Native registry identity digest");
  if (
    identity.id !== registry.id ||
    declaredTrust !== registry.trust ||
    declaredOrigin !== normalizedOrigin(registry.origin) ||
    declaredIdentityDigest !== registry.identityDigest ||
    declaredIdentityDigest !==
      sha256(canonicalJson({ id: registry.id, origin: declaredOrigin, trust: declaredTrust }))
  ) {
    throw resolverError(
      "Native registry catalog identity does not match the selected registry binding.",
      "REGISTRY_IDENTITY_MISMATCH",
    );
  }

  const releases = record(root.releases, "Native registry releases");
  exactKeys(
    releases,
    ["currentStable", "supportedHistorical"],
    ["currentPrerelease"],
    "Native registry releases",
  );
  if (releases.currentStable !== release || !SEMVER.test(release)) {
    throw resolverError(
      "The acquired catalog does not bind the requested current Stable release.",
      "REGISTRY_RELEASE_IDENTITY_INVALID",
    );
  }
  strings(releases.supportedHistorical, "Supported historical releases", {
    max: 64,
    pattern: SEMVER,
    itemMax: 160,
  });
  if (
    releases.currentPrerelease !== undefined &&
    releases.currentPrerelease !== null &&
    (typeof releases.currentPrerelease !== "string" || !SEMVER.test(releases.currentPrerelease))
  ) {
    throw resolverError("Current prerelease is invalid.", "REGISTRY_DOCUMENT_SCHEMA_INVALID");
  }
  if (!Array.isArray(root.items) || root.items.length < 1 || root.items.length > MAX_ITEMS) {
    throw resolverError(
      "Native catalog item count is invalid.",
      "REGISTRY_DOCUMENT_SCHEMA_INVALID",
    );
  }

  const ids = new Set<string>();
  const aliases = new Map<string, string>();
  const items = root.items.map((entry, index): AcquiredNativeCatalogItem => {
    const label = `Native catalog item ${String(index)}`;
    const item = record(entry, label);
    exactKeys(
      item,
      [
        "id",
        "aliases",
        "displayName",
        "description",
        "kind",
        "category",
        "tags",
        "maturity",
        "latestStableVersion",
        "lastChangedVersion",
        "compatibility",
        "license",
        "provenance",
        "links",
        "registryDependencies",
        "quality",
      ],
      ["keywords", "deprecation"],
      label,
    );
    const id = text(item.id, `${label}.id`, { pattern: ID, max: 128 });
    if (ids.has(id) || aliases.has(id)) {
      throw resolverError("Native catalog contains an ID collision.", "REGISTRY_CATALOG_COLLISION");
    }
    ids.add(id);
    const itemAliases = strings(item.aliases, `${label}.aliases`, {
      max: 32,
      pattern: ID,
      itemMax: 128,
    });
    for (const alias of itemAliases) {
      if (ids.has(alias) || aliases.has(alias)) {
        throw resolverError(
          "Native catalog contains an alias collision.",
          "REGISTRY_CATALOG_COLLISION",
        );
      }
      aliases.set(alias, id);
    }
    const kind = text(item.kind, `${label}.kind`, { max: 32 });
    const maturity = text(item.maturity, `${label}.maturity`, { max: 32 });
    if (!KINDS.has(kind) || !MATURITIES.has(maturity)) {
      throw resolverError(
        `${label} kind or maturity is invalid.`,
        "REGISTRY_DOCUMENT_SCHEMA_INVALID",
      );
    }
    const latestStableVersion =
      item.latestStableVersion === null
        ? null
        : text(item.latestStableVersion, `${label}.latestStableVersion`, {
            pattern: SEMVER,
            max: 160,
          });
    if (latestStableVersion !== release) {
      throw resolverError(
        `${label} does not resolve to the requested immutable release.`,
        "REGISTRY_RELEASE_IDENTITY_INVALID",
      );
    }
    const links = record(item.links, `${label}.links`);
    exactKeys(links, ["payload", "passport", "contract", "docs", "source"], [], `${label}.links`);
    const quality = record(item.quality, `${label}.quality`);
    exactKeys(quality, ["tier", "manualAssistiveTechnologyEvidence"], [], `${label}.quality`);
    const tier = text(quality.tier, `${label}.quality.tier`, { max: 32 });
    if (
      !QUALITY_TIERS.has(tier) ||
      typeof quality.manualAssistiveTechnologyEvidence !== "boolean"
    ) {
      throw resolverError(`${label} quality is invalid.`, "REGISTRY_DOCUMENT_SCHEMA_INVALID");
    }
    if (item.deprecation !== undefined) {
      const deprecation = record(item.deprecation, `${label}.deprecation`);
      exactKeys(deprecation, ["replacement", "migration"], [], `${label}.deprecation`);
      text(deprecation.replacement, `${label}.deprecation.replacement`, { pattern: ID, max: 128 });
      httpsUrl(deprecation.migration, `${label}.deprecation.migration`);
    }
    httpsUrl(item.provenance, `${label}.provenance`);
    return {
      id,
      aliases: itemAliases,
      displayName: humanText(item.displayName, `${label}.displayName`),
      description: humanText(item.description, `${label}.description`),
      kind: kind as AcquiredNativeCatalogItem["kind"],
      category: text(item.category, `${label}.category`, { pattern: ID, max: 128 }),
      tags: strings(item.tags, `${label}.tags`, { max: 64, pattern: ID, itemMax: 128 }),
      keywords:
        item.keywords === undefined
          ? []
          : strings(item.keywords, `${label}.keywords`, { max: 128, itemMax: 80 }),
      maturity: maturity as AcquiredNativeCatalogItem["maturity"],
      latestStableVersion,
      lastChangedVersion: text(item.lastChangedVersion, `${label}.lastChangedVersion`, {
        pattern: SEMVER,
        max: 160,
      }),
      compatibility: compatibility(item.compatibility, `${label}.compatibility`),
      license: text(item.license, `${label}.license`, { pattern: SPDX, max: 128 }),
      links: {
        payload: immutableUrl(links.payload, `${label}.links.payload`, declaredOrigin),
        passport: immutableUrl(links.passport, `${label}.links.passport`, declaredOrigin),
        contract: immutableUrl(links.contract, `${label}.links.contract`, declaredOrigin),
        docs: httpsUrl(links.docs, `${label}.links.docs`),
        source: httpsUrl(links.source, `${label}.links.source`),
      },
      registryDependencies: strings(item.registryDependencies, `${label}.registryDependencies`, {
        max: 256,
        pattern: QUALIFIED_ID,
        itemMax: 257,
      }),
      quality: {
        tier: tier as AcquiredNativeCatalogItem["quality"]["tier"],
        manualAssistiveTechnologyEvidence: quality.manualAssistiveTechnologyEvidence,
      },
    };
  });

  const byId = new Map(items.map((item) => [item.id, item]));
  if (registry.trust !== "official") {
    const licenses = [...new Set(items.map(({ license }) => license))].sort((left, right) =>
      left.localeCompare(right, "en-US"),
    );
    const expectedEnrollmentDigest = sha256(
      canonicalJson({
        protocol: "mergora-v1",
        resolvedOrigin: declaredOrigin,
        declaredRegistry: { id: registry.id, identityDigest: declaredIdentityDigest },
        licensePolicy: { status: "observed", licenses },
        keyPolicy: {
          digest: "sha256",
          immutableReleaseManifests: true,
          signatures: "not-supplied",
        },
      }),
    );
    if (registry.enrollmentDigest !== expectedEnrollmentDigest) {
      throw resolverError(
        "Native registry catalog does not match the enrolled identity and policy binding.",
        "REGISTRY_IDENTITY_MISMATCH",
      );
    }
  }
  const graph = Object.fromEntries(
    [...items]
      .sort((left, right) => left.id.localeCompare(right.id, "en-US"))
      .map((item) => {
        const dependencies = item.registryDependencies.map((qualified) => {
          const match = QUALIFIED_ID.exec(qualified);
          if (match === null || match[1] !== registry.id || !byId.has(match[2]!)) {
            throw resolverError(
              `Native catalog item ${item.id} references an unavailable dependency.`,
              "REGISTRY_DEPENDENCY_GRAPH_INVALID",
            );
          }
          return match[2]!;
        });
        return [
          item.id,
          [...dependencies].sort((left, right) => left.localeCompare(right, "en-US")),
        ];
      }),
  );
  const visited = new Set<string>();
  const active = new Set<string>();
  const visit = (id: string): void => {
    if (active.has(id)) {
      throw resolverError(
        `Native catalog dependency graph cycles through ${id}.`,
        "REGISTRY_DEPENDENCY_GRAPH_INVALID",
      );
    }
    if (visited.has(id)) return;
    active.add(id);
    for (const dependency of graph[id] ?? []) visit(dependency);
    active.delete(id);
    visited.add(id);
  };
  Object.keys(graph)
    .sort((left, right) => left.localeCompare(right, "en-US"))
    .forEach(visit);
  const dependencyGraphDigest = digest(root.dependencyGraphDigest, "Dependency graph digest");
  const expectedGraphDigest = sha256(
    canonicalJson({ registryId: registry.id, uiVersion: release, items: graph }),
  );
  if (dependencyGraphDigest !== expectedGraphDigest) {
    throw resolverError(
      "Native catalog dependency graph digest does not match its exact graph.",
      "REGISTRY_DEPENDENCY_GRAPH_INVALID",
    );
  }
  return {
    dependencyGraphDigest,
    items: [...items].sort((left, right) => left.id.localeCompare(right.id, "en-US")),
    aliases: Object.fromEntries(
      [...aliases.entries()].sort(([left], [right]) => left.localeCompare(right, "en-US")),
    ),
  };
}

function isMergoraOwnedPackage(packageName: string): boolean {
  return (
    packageName === "mergora" ||
    packageName.startsWith("mergora-") ||
    packageName.startsWith("@mergora/")
  );
}

function canonicalSha512Sri(value: unknown, label: string): `sha512-${string}` {
  const integrity = text(value, label, { pattern: SHA512_SRI, max: 96 });
  const encoded = integrity.slice("sha512-".length);
  const decoded = Buffer.from(encoded, "base64");
  if (decoded.byteLength !== 64 || decoded.toString("base64") !== encoded) {
    throw resolverError(`${label} is not canonical SHA-512 SRI.`, "REGISTRY_NPM_INVENTORY_INVALID");
  }
  return integrity as `sha512-${string}`;
}

function publicNpmTarballUrl(
  value: unknown,
  packageName: string,
  version: string,
  label: string,
): string {
  const raw = text(value, label, { max: 2048 });
  let parsed: URL;
  try {
    parsed = new URL(raw);
  } catch {
    throw resolverError(`${label} is invalid.`, "REGISTRY_NPM_ORIGIN_INVALID");
  }
  const unscopedName = packageName.includes("/") ? packageName.split("/")[1]! : packageName;
  const pathname = packageName.startsWith("@")
    ? `/${packageName}/-/${unscopedName}-${version}.tgz`
    : `/${packageName}/-/${packageName}-${version}.tgz`;
  const expected = `${PUBLIC_NPM_REGISTRY_ORIGIN}${pathname}`;
  if (
    raw !== expected ||
    parsed.href !== expected ||
    parsed.origin !== PUBLIC_NPM_REGISTRY_ORIGIN ||
    parsed.protocol !== "https:" ||
    parsed.username !== "" ||
    parsed.password !== "" ||
    parsed.search !== "" ||
    parsed.hash !== "" ||
    parsed.pathname !== pathname
  ) {
    throw resolverError(
      `${label} is not the credential-free immutable public npm path for ${packageName}@${version}.`,
      "REGISTRY_NPM_ORIGIN_INVALID",
    );
  }
  return raw;
}

function parseNpmPackageInventory(
  value: unknown,
  release: string,
): AcquiredNativeNpmPackageInventory {
  const source = record(value, "Native release npm package inventory");
  exactKeys(source, ["allowedLicenses", "entries"], [], "Native release npm package inventory");
  const allowedLicenses = strings(
    source.allowedLicenses,
    "Native release npm package allowed licenses",
    { max: MAX_NPM_LICENSES, pattern: SPDX, itemMax: 128 },
  );
  const canonicalAllowedLicenses = [...allowedLicenses].sort((left, right) =>
    left.localeCompare(right, "en-US"),
  );
  if (JSON.stringify(allowedLicenses) !== JSON.stringify(canonicalAllowedLicenses)) {
    throw resolverError(
      "Native release npm package allowed licenses are not canonically sorted.",
      "REGISTRY_NPM_INVENTORY_INVALID",
    );
  }
  const allowed = new Set(allowedLicenses);
  if (!Array.isArray(source.entries) || source.entries.length > MAX_NPM_PACKAGES) {
    throw resolverError(
      "Native release npm package inventory exceeds its entry bound.",
      "REGISTRY_NPM_INVENTORY_INVALID",
    );
  }
  const identities = new Set<string>();
  const urls = new Set<string>();
  let includedBytes = 0;
  const entries = source.entries.map((rawEntry, index): AcquiredNativeNpmPackageArtifact => {
    const label = `Native release npm package ${String(index)}`;
    const entry = record(rawEntry, label);
    const disposition = entry.disposition;
    exactKeys(
      entry,
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
        : ["bytes", "digest", "disposition", "integrity", "license", "package", "url", "version"],
      [],
      label,
    );
    const packageName = text(entry.package, `${label}.package`, {
      pattern: PACKAGE_NAME,
      max: 214,
    });
    const version = text(entry.version, `${label}.version`, {
      pattern: STABLE_SEMVER,
      max: 64,
    });
    if (isMergoraOwnedPackage(packageName) && version !== release) {
      throw resolverError(
        `${label} Mergora-owned package is not bound to release ${release}.`,
        "REGISTRY_RELEASE_IDENTITY_INVALID",
      );
    }
    const url = publicNpmTarballUrl(entry.url, packageName, version, `${label}.url`);
    const artifactDigest = digest(entry.digest, `${label}.digest`);
    const integrity = canonicalSha512Sri(entry.integrity, `${label}.integrity`);
    const license = text(entry.license, `${label}.license`, { pattern: SPDX, max: 128 });
    const bytes = byteCount(entry.bytes, `${label}.bytes`, MAX_NPM_TARBALL_BYTES);
    if (bytes < 1 || (disposition !== "include" && disposition !== "omit")) {
      throw resolverError(`${label} is invalid.`, "REGISTRY_NPM_INVENTORY_INVALID");
    }
    const licenseAllowed = allowed.has(license);
    if (disposition === "include" && !licenseAllowed) {
      throw resolverError(
        `${label} license is absent from the explicit allowlist.`,
        "REGISTRY_NPM_INVENTORY_INVALID",
      );
    }
    let omissionReason: "explicitly-omitted" | "license-not-allowed" | undefined;
    if (disposition === "omit") {
      if (
        entry.omissionReason !== "explicitly-omitted" &&
        entry.omissionReason !== "license-not-allowed"
      ) {
        throw resolverError(
          `${label} omission reason is invalid.`,
          "REGISTRY_NPM_INVENTORY_INVALID",
        );
      }
      omissionReason = entry.omissionReason;
      if ((omissionReason === "license-not-allowed") !== !licenseAllowed) {
        throw resolverError(
          `${label} omission reason disagrees with the explicit license policy.`,
          "REGISTRY_NPM_INVENTORY_INVALID",
        );
      }
    }
    const identity = `${packageName}@${version}`.toLocaleLowerCase("en-US");
    if (identities.has(identity) || urls.has(url)) {
      throw resolverError(
        `${label} repeats or collides with another exact package artifact.`,
        "REGISTRY_NPM_INVENTORY_INVALID",
      );
    }
    identities.add(identity);
    urls.add(url);
    if (disposition === "include") includedBytes += bytes;
    const descriptor = {
      package: packageName,
      version,
      url,
      bytes,
      digest: artifactDigest,
      integrity,
      license,
    } as const;
    return disposition === "include"
      ? { ...descriptor, disposition }
      : { ...descriptor, disposition, omissionReason: omissionReason! };
  });
  if (includedBytes > MAX_NPM_TOTAL_INCLUDED_BYTES) {
    throw resolverError(
      "Native release included npm packages exceed the aggregate byte bound.",
      "REGISTRY_NPM_INVENTORY_INVALID",
    );
  }
  const sortedEntries = [...entries].sort((left, right) =>
    left.package === right.package
      ? left.version.localeCompare(right.version, "en-US")
      : left.package.localeCompare(right.package, "en-US"),
  );
  if (
    entries.some(
      (entry, index) =>
        entry.package !== sortedEntries[index]?.package ||
        entry.version !== sortedEntries[index]?.version,
    )
  ) {
    throw resolverError(
      "Native release npm package entries are not canonically sorted.",
      "REGISTRY_NPM_INVENTORY_INVALID",
    );
  }
  return { allowedLicenses: canonicalAllowedLicenses, entries: sortedEntries };
}

function parseManifest(
  value: unknown,
  registry: AcquisitionRegistryIdentity,
  release: string,
  catalog: ReturnType<typeof parseCatalog>,
): ParsedManifest {
  assertNoExecutableMetadata(value);
  const root = record(value, "Native release manifest");
  exactKeys(
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
    ],
    ["npmPackageInventory"],
    "Native release manifest",
  );
  if (
    root.schemaVersion !== 1 ||
    root.registryId !== registry.id ||
    root.uiVersion !== release ||
    typeof root.releaseCommit !== "string" ||
    !/^[a-f0-9]{40}$/u.test(root.releaseCommit) ||
    root.dependencyGraphDigest !== catalog.dependencyGraphDigest
  ) {
    throw resolverError(
      "Native release manifest identity disagrees with its catalog.",
      "REGISTRY_RELEASE_IDENTITY_INVALID",
    );
  }
  const manifestSelfDigest = digest(root.manifestDigest, "Native release manifest self-digest");
  const { manifestDigest: omittedManifestDigest, ...unsigned } = root;
  void omittedManifestDigest;
  if (manifestSelfDigest !== sha256(canonicalJson(unsigned))) {
    throw resolverError(
      "Native release manifest self-digest is invalid.",
      "REGISTRY_RELEASE_DIGEST_INVALID",
    );
  }
  const manifestItems = record(root.items, "Native release manifest items");
  const manifestIds = Object.keys(manifestItems).sort((left, right) =>
    left.localeCompare(right, "en-US"),
  );
  const catalogIds = catalog.items.map(({ id }) => id);
  if (JSON.stringify(manifestIds) !== JSON.stringify(catalogIds)) {
    throw resolverError(
      "Native release manifest and catalog item sets differ.",
      "REGISTRY_RELEASE_IDENTITY_INVALID",
    );
  }
  const catalogById = new Map(catalog.items.map((item) => [item.id, item]));
  const items: Record<string, ManifestItem> = {};
  for (const id of manifestIds) {
    const label = `Native release item ${id}`;
    const source = record(manifestItems[id], label);
    exactKeys(source, ["version", "payload", "passport", "contract", "dependencies"], [], label);
    if (source.version !== release) {
      throw resolverError(
        `${label} has a mismatched release.`,
        "REGISTRY_RELEASE_IDENTITY_INVALID",
      );
    }
    const payload = evidenceReference(source.payload, `${label}.payload`, registry.origin);
    const passport = evidenceReference(source.passport, `${label}.passport`, registry.origin);
    const contract = evidenceReference(source.contract, `${label}.contract`, registry.origin);
    const dependencies = strings(source.dependencies, `${label}.dependencies`, {
      max: 256,
      pattern: QUALIFIED_ID,
      itemMax: 257,
    });
    const catalogItem = catalogById.get(id)!;
    if (
      payload.id !== id ||
      payload.artifact !== catalogItem.links.payload ||
      passport.artifact !== catalogItem.links.passport ||
      contract.artifact !== catalogItem.links.contract ||
      JSON.stringify([...dependencies].sort()) !==
        JSON.stringify([...catalogItem.registryDependencies].sort())
    ) {
      throw resolverError(
        `${label} references disagree with the catalog.`,
        "REGISTRY_RELEASE_IDENTITY_INVALID",
      );
    }
    items[id] = { version: release, payload, passport, contract, dependencies };
  }
  if (!Array.isArray(root.artifacts) || root.artifacts.length < 1 || root.artifacts.length > 4096) {
    throw resolverError(
      "Native release artifact count is invalid.",
      "REGISTRY_DOCUMENT_SCHEMA_INVALID",
    );
  }
  const artifactsByUrl = new Map<string, ManifestArtifact>();
  const artifactNames = new Set<string>();
  for (const [index, entry] of root.artifacts.entries()) {
    const label = `Native release artifact ${String(index)}`;
    const source = record(entry, label);
    exactKeys(source, ["name", "url", "digest", "mediaType", "bytes"], [], label);
    const artifact: ManifestArtifact = {
      name: text(source.name, `${label}.name`, { max: 255 }),
      url: immutableUrl(source.url, `${label}.url`, registry.origin),
      digest: digest(source.digest, `${label}.digest`),
      mediaType: text(source.mediaType, `${label}.mediaType`, { max: 120 }),
      bytes: byteCount(source.bytes, `${label}.bytes`, 1_073_741_824),
    };
    const internalPath = `r/v1/${pathFromImmutableUrl(
      artifact.url,
      registry.origin,
      `${label}.url`,
    )}`;
    if (artifactNames.has(artifact.name) || artifactsByUrl.has(artifact.url)) {
      throw resolverError(
        "Native release artifacts repeat a name or URL.",
        "REGISTRY_DOCUMENT_SCHEMA_INVALID",
      );
    }
    if (artifact.name !== internalPath) {
      throw resolverError(
        `${label} name does not match its public protocol URL.`,
        "REGISTRY_RELEASE_IDENTITY_INVALID",
      );
    }
    artifactNames.add(artifact.name);
    artifactsByUrl.set(artifact.url, artifact);
  }
  const assertInventoriedJsonEvidence = (
    reference: ManifestEvidenceReference,
    label: string,
  ): void => {
    const artifact = artifactsByUrl.get(reference.artifact);
    if (
      artifact === undefined ||
      artifact.digest !== reference.digest ||
      artifact.mediaType !== "application/json" ||
      artifact.bytes === 0
    ) {
      throw resolverError(
        `${label} is absent from or inconsistent with the native release artifact inventory.`,
        "REGISTRY_RELEASE_DIGEST_INVALID",
      );
    }
  };
  for (const [id, item] of Object.entries(items)) {
    assertInventoriedJsonEvidence(item.payload, `Native release payload evidence for ${id}`);
    assertInventoriedJsonEvidence(item.passport, `Native release Passport evidence for ${id}`);
    assertInventoriedJsonEvidence(item.contract, `Native release Contract evidence for ${id}`);
  }
  const qualitySummary = evidenceReference(
    root.qualitySummary,
    "Native release quality summary",
    registry.origin,
  );
  assertInventoriedJsonEvidence(qualitySummary, "Native release quality summary");
  const npmPackageInventory =
    root.npmPackageInventory === undefined
      ? null
      : parseNpmPackageInventory(root.npmPackageInventory, release);
  return {
    manifestSelfDigest,
    dependencyGraphDigest: catalog.dependencyGraphDigest,
    items,
    artifactsByUrl,
    npmPackageInventory,
  };
}

function parseTransformPipeline(
  value: unknown,
  label: string,
): AcquiredNativeFile["transformPipeline"] {
  if (!Array.isArray(value) || value.length > 16) {
    throw resolverError(`${label} is invalid.`, "REGISTRY_ITEM_SCHEMA_INVALID");
  }
  return value.map((entry, index) => {
    const step = record(entry, `${label}[${String(index)}]`);
    exactKeys(step, ["adapter", "version"], [], `${label}[${String(index)}]`);
    const adapter = text(step.adapter, `${label}[${String(index)}].adapter`, { max: 64 });
    if (!TRANSFORM_ADAPTERS.has(adapter)) {
      throw resolverError(`${label} uses an unsupported adapter.`, "REGISTRY_ITEM_SCHEMA_INVALID");
    }
    return {
      adapter: adapter as AcquiredNativeFile["transformPipeline"][number]["adapter"],
      version: text(step.version, `${label}[${String(index)}].version`, {
        pattern: SEMVER,
        max: 160,
      }),
    };
  });
}

function parseStructuredPatches(value: unknown): readonly Readonly<Record<string, unknown>>[] {
  if (!Array.isArray(value) || value.length > 256) {
    throw resolverError("Native structured patch list is invalid.", "REGISTRY_ITEM_SCHEMA_INVALID");
  }
  return value.map((entry, index) => {
    const label = `Native structured patch ${String(index)}`;
    const patch = record(entry, label);
    exactKeys(patch, ["id", "adapter", "semanticKey", "desiredValue", "reversible"], [], label);
    text(patch.id, `${label}.id`, { pattern: ID, max: 128 });
    const adapter = text(patch.adapter, `${label}.adapter`, { max: 64 });
    text(patch.semanticKey, `${label}.semanticKey`, { max: 512 });
    if (!PATCH_ADAPTERS.has(adapter) || patch.reversible !== true) {
      throw resolverError(
        `${label} is not a supported declarative patch.`,
        "REGISTRY_ITEM_SCHEMA_INVALID",
      );
    }
    const desired = patch.desiredValue;
    if (!(
      (typeof desired === "string" && desired.length <= 4096) ||
      (typeof desired === "number" && Number.isFinite(desired)) ||
      typeof desired === "boolean" ||
      (Array.isArray(desired) &&
        desired.length <= 128 &&
        desired.every((item) => typeof item === "string" && item.length <= 1024))
    )) {
      throw resolverError(`${label} desired value is invalid.`, "REGISTRY_ITEM_SCHEMA_INVALID");
    }
    return structuredClone(patch);
  });
}

function parseMigrations(value: unknown): readonly Readonly<Record<string, unknown>>[] {
  if (!Array.isArray(value) || value.length > 128) {
    throw resolverError("Native migration list is invalid.", "REGISTRY_ITEM_SCHEMA_INVALID");
  }
  return value.map((entry, index) => {
    const label = `Native migration ${String(index)}`;
    const migration = record(entry, label);
    exactKeys(migration, ["id", "from", "to", "phase", "adapter", "arguments"], [], label);
    text(migration.id, `${label}.id`, { pattern: ID, max: 128 });
    text(migration.from, `${label}.from`, { pattern: SEMVER_RANGE, max: 160 });
    text(migration.to, `${label}.to`, { pattern: SEMVER_RANGE, max: 160 });
    const adapter = text(migration.adapter, `${label}.adapter`, { max: 64 });
    if (
      (migration.phase !== "remote" && migration.phase !== "proposed") ||
      !MIGRATION_ADAPTERS.has(adapter)
    ) {
      throw resolverError(
        `${label} is not a supported declarative migration.`,
        "REGISTRY_ITEM_SCHEMA_INVALID",
      );
    }
    const argumentsValue = record(migration.arguments, `${label}.arguments`);
    exactKeys(argumentsValue, [], ["from", "to", "checklist"], `${label}.arguments`);
    if (argumentsValue.from !== undefined)
      text(argumentsValue.from, `${label}.arguments.from`, { max: 1024 });
    if (argumentsValue.to !== undefined)
      text(argumentsValue.to, `${label}.arguments.to`, { max: 1024 });
    if (argumentsValue.checklist !== undefined) {
      strings(argumentsValue.checklist, `${label}.arguments.checklist`, { max: 64, itemMax: 1024 });
    }
    return structuredClone(migration);
  });
}

function parsePayload(
  value: unknown,
  registry: AcquisitionRegistryIdentity,
  release: string,
  catalogItem: AcquiredNativeCatalogItem,
  manifestItem: ManifestItem,
  maxItemBytes: number,
): ParsedPayload {
  assertNoExecutableMetadata(value);
  const root = record(value, `Native item payload ${catalogItem.id}`);
  exactKeys(
    root,
    [
      "schemaVersion",
      "registryId",
      "itemId",
      "kind",
      "version",
      "lastChangedVersion",
      "maturity",
      "license",
      "title",
      "description",
      "links",
      "compatibility",
      "files",
      "registryDependencies",
      "dependencies",
      "structuredPatches",
      "migrations",
      "contract",
      "passport",
      "examples",
      "importPaths",
      "payloadDigest",
    ],
    [],
    `Native item payload ${catalogItem.id}`,
  );
  if (
    root.schemaVersion !== 1 ||
    root.registryId !== registry.id ||
    root.itemId !== catalogItem.id ||
    root.kind !== catalogItem.kind ||
    root.version !== release ||
    root.lastChangedVersion !== catalogItem.lastChangedVersion ||
    root.maturity !== catalogItem.maturity ||
    root.license !== catalogItem.license
  ) {
    throw resolverError(
      `Native item payload ${catalogItem.id} identity disagrees with its catalog or manifest.`,
      "REGISTRY_ITEM_IDENTITY_INVALID",
    );
  }
  const links = record(root.links, `Native item payload ${catalogItem.id} links`);
  exactKeys(
    links,
    ["docs", "source", "changelog", "passport", "contract"],
    [],
    "Native item links",
  );
  const parsedLinks = {
    docs: httpsUrl(links.docs, "Native item docs URL"),
    source: httpsUrl(links.source, "Native item source URL"),
    changelog: httpsUrl(links.changelog, "Native item changelog URL"),
    passport: immutableUrl(links.passport, "Native item Passport URL", registry.origin),
    contract: immutableUrl(links.contract, "Native item Contract URL", registry.origin),
  };
  if (
    parsedLinks.docs !== catalogItem.links.docs ||
    parsedLinks.source !== catalogItem.links.source ||
    parsedLinks.passport !== catalogItem.links.passport ||
    parsedLinks.contract !== catalogItem.links.contract
  ) {
    throw resolverError(
      `Native item payload ${catalogItem.id} links disagree with its catalog.`,
      "REGISTRY_ITEM_IDENTITY_INVALID",
    );
  }
  if (!Array.isArray(root.files) || root.files.length > MAX_FILES_PER_ITEM) {
    throw resolverError(
      `Native item payload ${catalogItem.id} file count is invalid.`,
      "REGISTRY_ITEM_SCHEMA_INVALID",
    );
  }
  const logicalKeys = new Set<string>();
  const files = root.files.map((entry, index): ParsedPayloadFile => {
    const label = `Native item ${catalogItem.id} file ${String(index)}`;
    const file = record(entry, label);
    exactKeys(
      file,
      [
        "logicalPath",
        "targetRole",
        "mediaType",
        "bytes",
        "digest",
        "executable",
        "transformPipeline",
      ],
      ["content", "sourceUrl"],
      label,
    );
    const logicalPath = portableLogicalPath(file.logicalPath, `${label}.logicalPath`);
    const key = logicalPath.normalize("NFC").toLocaleLowerCase("en-US");
    const targetRole = text(file.targetRole, `${label}.targetRole`, { max: 32 });
    const mediaType = text(file.mediaType, `${label}.mediaType`, { max: 120 });
    const bytes = byteCount(file.bytes, `${label}.bytes`, maxItemBytes);
    const fileDigest = digest(file.digest, `${label}.digest`);
    if (
      logicalKeys.has(key) ||
      !ROLES.has(targetRole) ||
      !MEDIA_TYPES.has(mediaType) ||
      file.executable !== false ||
      (file.content === undefined) === (file.sourceUrl === undefined)
    ) {
      throw resolverError(
        `${label} is invalid or collides portably.`,
        "REGISTRY_ITEM_SCHEMA_INVALID",
      );
    }
    logicalKeys.add(key);
    let content: string | null = null;
    let sourceUrl: string | null = null;
    if (file.content !== undefined) {
      if (typeof file.content !== "string") {
        throw resolverError(`${label} inline content is invalid.`, "REGISTRY_ITEM_SCHEMA_INVALID");
      }
      const inlineBytes = Buffer.from(file.content, "utf8");
      if (inlineBytes.byteLength !== bytes || sha256(inlineBytes) !== fileDigest) {
        throw resolverError(
          `${label} inline bytes failed verification.`,
          "REGISTRY_ITEM_DIGEST_INVALID",
        );
      }
      content = file.content;
    } else {
      sourceUrl = immutableUrl(file.sourceUrl, `${label}.sourceUrl`, registry.origin);
      const sourcePath = pathFromImmutableUrl(sourceUrl, registry.origin, `${label}.sourceUrl`);
      if (!sourcePath.startsWith(`releases/${release}/files/`)) {
        throw resolverError(
          `${label} source URL is not tied to release ${release}.`,
          "REGISTRY_URL_INVALID",
        );
      }
    }
    return {
      logicalPath,
      targetRole: targetRole as AcquiredNativeFile["targetRole"],
      mediaType,
      bytes,
      digest: fileDigest,
      content,
      sourceUrl,
      transformPipeline: parseTransformPipeline(
        file.transformPipeline,
        `${label}.transformPipeline`,
      ),
    };
  });
  const dependencies = record(root.dependencies, `Native item ${catalogItem.id} dependencies`);
  exactKeys(
    dependencies,
    ["runtime", "development"],
    [],
    `Native item ${catalogItem.id} dependencies`,
  );
  const registryDependencies = strings(
    root.registryDependencies,
    `Native item ${catalogItem.id} registryDependencies`,
    { max: 256, pattern: QUALIFIED_ID, itemMax: 257 },
  );
  if (
    JSON.stringify([...registryDependencies].sort()) !==
    JSON.stringify([...manifestItem.dependencies].sort())
  ) {
    throw resolverError(
      `Native item ${catalogItem.id} dependency closure disagrees with its release manifest.`,
      "REGISTRY_DEPENDENCY_GRAPH_INVALID",
    );
  }
  const contract = versionedId(root.contract, `Native item ${catalogItem.id} Contract`);
  const passport = versionedId(root.passport, `Native item ${catalogItem.id} Passport`);
  const passportPath = pathFromImmutableUrl(
    parsedLinks.passport,
    registry.origin,
    `Native item ${catalogItem.id} Passport URL`,
  );
  const contractPath = pathFromImmutableUrl(
    parsedLinks.contract,
    registry.origin,
    `Native item ${catalogItem.id} Contract URL`,
  );
  if (
    contract.id !== manifestItem.contract.id ||
    passport.id !== manifestItem.passport.id ||
    passport.version !== release ||
    passportPath !== `passports/${release}/${catalogItem.id}.json` ||
    contractPath !== `contracts/${contract.version}/${catalogItem.id}.json`
  ) {
    throw resolverError(
      `Native item ${catalogItem.id} evidence identity disagrees with its release manifest.`,
      "REGISTRY_ITEM_IDENTITY_INVALID",
    );
  }
  const examples = strings(root.examples, `Native item ${catalogItem.id} examples`, {
    max: 128,
    itemMax: 1024,
  });
  examples.forEach((entry, index) => portableLogicalPath(entry, `Native example ${String(index)}`));
  const importPaths = strings(root.importPaths, `Native item ${catalogItem.id} import paths`, {
    max: 64,
    itemMax: 214,
  });
  if (importPaths.some((entry) => !/^mergora-ui(?:\/[a-z0-9-]+)?$/u.test(entry))) {
    throw resolverError("Native item import path is invalid.", "REGISTRY_ITEM_SCHEMA_INVALID");
  }
  const payloadSelfDigest = digest(root.payloadDigest, `Native item ${catalogItem.id} self-digest`);
  const { payloadDigest: omittedPayloadDigest, ...unsigned } = root;
  void omittedPayloadDigest;
  if (payloadSelfDigest !== sha256(canonicalJson(unsigned))) {
    throw resolverError(
      `Native item ${catalogItem.id} self-digest is invalid.`,
      "REGISTRY_ITEM_DIGEST_INVALID",
    );
  }
  return {
    itemId: catalogItem.id,
    kind: catalogItem.kind,
    version: release,
    lastChangedVersion: catalogItem.lastChangedVersion,
    maturity: catalogItem.maturity,
    license: text(root.license, "Native item license", { pattern: SPDX, max: 128 }),
    title: humanText(root.title, "Native item title"),
    description: humanText(root.description, "Native item description"),
    links: parsedLinks,
    compatibility: compatibility(root.compatibility, `Native item ${catalogItem.id} compatibility`),
    files,
    registryDependencies,
    dependencies: {
      runtime: semverRangeMap(
        dependencies.runtime,
        `Native item ${catalogItem.id} runtime dependencies`,
      ),
      development: semverRangeMap(
        dependencies.development,
        `Native item ${catalogItem.id} development dependencies`,
      ),
    },
    structuredPatches: parseStructuredPatches(root.structuredPatches),
    migrations: parseMigrations(root.migrations),
    contract,
    passport,
    examples,
    importPaths,
    payloadSelfDigest,
  };
}

function aggregateSource(sources: readonly AcquisitionSource[]): AcquisitionSource {
  if (sources.includes("mirror")) return "mirror";
  if (sources.includes("network")) return "network";
  if (sources.includes("vendor")) return "vendor";
  return "verified-cache";
}

function textEncoding(mediaType: string): boolean {
  return (
    mediaType.startsWith("text/") || mediaType.includes("json") || mediaType === "image/svg+xml"
  );
}

function assertBound(
  value: number | undefined,
  fallback: number,
  maximum: number,
  label: string,
): number {
  const result = value ?? fallback;
  if (!Number.isSafeInteger(result) || result < 1 || result > maximum) {
    throw resolverError(`${label} is outside the supported range.`, "REGISTRY_LIMIT_INVALID");
  }
  return result;
}

/**
 * Acquires one coherent native release snapshot. Every mutable or immutable
 * document is caller-digest-bound before parsing, then cross-checked against
 * the catalog, release manifest, dependency graph, and item self-digests.
 */
export async function resolveNativeRegistryRelease(
  options: ResolveNativeRegistryReleaseOptions,
): Promise<AcquiredNativeRegistryRelease> {
  const contractSelection = options.contractSelection ?? "none";
  if (!(["all", "none", "stable"] as const).includes(contractSelection)) {
    throw resolverError(
      "Native Contract acquisition selection is invalid.",
      "REGISTRY_CONTRACT_SELECTION_INVALID",
    );
  }
  if (options.registry.trust === "enrolled" && options.registry.enrollmentDigest === undefined) {
    throw resolverError(
      "An enrolled native registry requires its persisted identity and policy binding.",
      "REGISTRY_IDENTITY_MISMATCH",
    );
  }
  if (!SEMVER.test(options.release)) {
    throw resolverError(
      "Native registry resolution requires an explicit semantic release.",
      "REGISTRY_RELEASE_IDENTITY_INVALID",
    );
  }
  const maxCatalogBytes = assertBound(
    options.maxCatalogBytes,
    DEFAULT_MAX_CATALOG_BYTES,
    64 * 1024 * 1024,
    "Catalog byte limit",
  );
  const maxManifestBytes = assertBound(
    options.maxManifestBytes,
    DEFAULT_MAX_MANIFEST_BYTES,
    64 * 1024 * 1024,
    "Manifest byte limit",
  );
  const maxItemBytes = assertBound(
    options.maxItemBytes,
    DEFAULT_MAX_ITEM_BYTES,
    64 * 1024 * 1024,
    "Item byte limit",
  );
  const maxOperationBytes = assertBound(
    options.maxOperationBytes,
    DEFAULT_MAX_OPERATION_BYTES,
    64 * 1024 * 1024,
    "Operation byte limit",
  );
  if (options.catalog.path !== "catalog.json") {
    throw resolverError(
      "Native catalog reference must identify catalog.json.",
      "REGISTRY_ARTIFACT_PATH_UNSAFE",
    );
  }
  if (options.manifest.path !== `releases/${options.release}/manifest.json`) {
    throw resolverError(
      "Native manifest reference is not tied to the explicit release.",
      "REGISTRY_RELEASE_IDENTITY_INVALID",
    );
  }
  const requested = [...new Set(options.itemIds)].sort((left, right) =>
    left.localeCompare(right, "en-US"),
  );
  for (const item of requested) {
    if (!ID.test(item) || item !== item.normalize("NFKC")) {
      throw resolverError("Requested native item ID is invalid.", "ITEM_REFERENCE_INVALID");
    }
  }
  const sources: AcquisitionSource[] = [];
  let acquiredBytes = 0;
  const countBytes = (bytes: number): void => {
    acquiredBytes += bytes;
    if (acquiredBytes > maxOperationBytes) {
      throw resolverError(
        "Native release acquisition exceeds the operation byte policy.",
        "REGISTRY_OPERATION_OVERSIZE",
      );
    }
  };
  const commonAcquisition = {
    projectRoot: options.projectRoot,
    offline: options.offline,
    mirrorOrigins: options.mirrorOrigins,
    authorization: options.authorization,
    vendor: options.vendor,
    transport: options.transport,
    timeoutMs: options.timeoutMs,
    writeCache: options.writeCache,
  } as const;

  let parsedCatalog: ReturnType<typeof parseCatalog> | null = null;
  const catalogAcquisition = await acquireImmutableArtifact({
    ...commonAcquisition,
    request: {
      registry: options.registry,
      path: options.catalog.path,
      digest: options.catalog.digest,
      ...(options.catalog.bytes === undefined ? {} : { bytes: options.catalog.bytes }),
      maxBytes: maxCatalogBytes,
      acceptedMediaTypes: ["application/json"],
      release: options.release,
    },
    validate: async (bytes, acquisition) => {
      const value = canonicalDocument(bytes, "Native registry catalog");
      parsedCatalog = parseCatalog(value, options.registry, options.release);
      await options.validateDocument?.("catalog", structuredClone(value), {
        kind: "catalog",
        acquisition: structuredClone(acquisition),
      });
    },
  });
  if (parsedCatalog === null) {
    throw resolverError(
      "Native catalog validation did not complete.",
      "REGISTRY_DOCUMENT_SCHEMA_INVALID",
    );
  }
  sources.push(catalogAcquisition.source);
  countBytes(catalogAcquisition.bytes.byteLength);
  const catalog: ReturnType<typeof parseCatalog> = parsedCatalog;

  let parsedManifest: ParsedManifest | null = null;
  const manifestAcquisition = await acquireImmutableArtifact({
    ...commonAcquisition,
    request: {
      registry: options.registry,
      path: options.manifest.path,
      digest: options.manifest.digest,
      ...(options.manifest.bytes === undefined ? {} : { bytes: options.manifest.bytes }),
      maxBytes: maxManifestBytes,
      acceptedMediaTypes: ["application/json"],
      release: options.release,
    },
    validate: async (bytes, acquisition) => {
      const value = canonicalDocument(bytes, "Native release manifest");
      parsedManifest = parseManifest(value, options.registry, options.release, catalog);
      await options.validateDocument?.("release-manifest", structuredClone(value), {
        kind: "release-manifest",
        acquisition: structuredClone(acquisition),
      });
    },
  });
  if (parsedManifest === null) {
    throw resolverError(
      "Native manifest validation did not complete.",
      "REGISTRY_DOCUMENT_SCHEMA_INVALID",
    );
  }
  sources.push(manifestAcquisition.source);
  countBytes(manifestAcquisition.bytes.byteLength);
  const manifest: ParsedManifest = parsedManifest;

  const catalogById = new Map(catalog.items.map((item) => [item.id, item]));
  const canonicalRequested = requested.map((item) => catalog.aliases[item] ?? item);
  for (const item of canonicalRequested) {
    if (!catalogById.has(item)) {
      throw resolverError(
        `Native catalog item ${JSON.stringify(item)} was not found.`,
        "ITEM_NOT_FOUND",
        item,
      );
    }
  }
  const closure: string[] = [];
  const visited = new Set<string>();
  const active = new Set<string>();
  const visit = (id: string): void => {
    if (active.has(id)) {
      throw resolverError(
        `Native dependency closure cycles through ${id}.`,
        "REGISTRY_DEPENDENCY_GRAPH_INVALID",
      );
    }
    if (visited.has(id)) return;
    active.add(id);
    const item = catalogById.get(id);
    if (item === undefined) {
      throw resolverError(
        `Native dependency ${id} is absent from the catalog.`,
        "REGISTRY_DEPENDENCY_GRAPH_INVALID",
      );
    }
    const dependencies = item.registryDependencies
      .map((qualified) => QUALIFIED_ID.exec(qualified)![2]!)
      .sort((left, right) => left.localeCompare(right, "en-US"));
    dependencies.forEach(visit);
    active.delete(id);
    visited.add(id);
    closure.push(id);
  };
  [...new Set(canonicalRequested)]
    .sort((left, right) => left.localeCompare(right, "en-US"))
    .forEach(visit);

  const items: AcquiredNativeRegistryItem[] = [];
  for (const itemId of closure) {
    const catalogItem = catalogById.get(itemId)!;
    const manifestItem = manifest.items[itemId]!;
    const artifact = manifest.artifactsByUrl.get(manifestItem.payload.artifact)!;
    if (artifact.bytes > maxItemBytes) {
      throw resolverError(
        `Native item ${itemId} exceeds the configured item byte policy.`,
        "REGISTRY_ITEM_OVERSIZE",
        itemId,
      );
    }
    const payloadPath = pathFromImmutableUrl(
      manifestItem.payload.artifact,
      options.registry.origin,
      `Native item ${itemId} payload URL`,
    );
    if (payloadPath !== `releases/${options.release}/items/${itemId}.json`) {
      throw resolverError(
        `Native item ${itemId} payload URL is not tied to release ${options.release}.`,
        "REGISTRY_URL_INVALID",
      );
    }
    let parsedPayload: ParsedPayload | null = null;
    const payloadAcquisition = await acquireImmutableArtifact({
      ...commonAcquisition,
      request: {
        registry: options.registry,
        path: payloadPath,
        digest: manifestItem.payload.digest,
        bytes: artifact.bytes,
        maxBytes: maxItemBytes,
        acceptedMediaTypes: ["application/json"],
        release: options.release,
      },
      validate: async (bytes, acquisition) => {
        const value = canonicalDocument(bytes, `Native item payload ${itemId}`);
        parsedPayload = parsePayload(
          value,
          options.registry,
          options.release,
          catalogItem,
          manifestItem,
          maxItemBytes,
        );
        await options.validateDocument?.("item", structuredClone(value), {
          kind: "item",
          acquisition: structuredClone(acquisition),
        });
      },
    });
    if (parsedPayload === null) {
      throw resolverError(
        `Native item ${itemId} validation did not complete.`,
        "REGISTRY_ITEM_SCHEMA_INVALID",
      );
    }
    sources.push(payloadAcquisition.source);
    countBytes(payloadAcquisition.bytes.byteLength);
    const payload: ParsedPayload = parsedPayload;
    const itemSources: AcquisitionSource[] = [payloadAcquisition.source];
    const files: AcquiredNativeFile[] = [];
    for (const file of payload.files) {
      let bytes: Buffer;
      if (file.content !== null) {
        bytes = Buffer.from(file.content, "utf8");
      } else {
        const sourcePath = pathFromImmutableUrl(
          file.sourceUrl!,
          options.registry.origin,
          `Native file ${file.logicalPath} source URL`,
        );
        const sourceAcquisition = await acquireImmutableArtifact({
          ...commonAcquisition,
          request: {
            registry: options.registry,
            path: sourcePath,
            digest: file.digest,
            bytes: file.bytes,
            maxBytes: maxItemBytes,
            acceptedMediaTypes: [file.mediaType],
            release: options.release,
          },
        });
        sources.push(sourceAcquisition.source);
        itemSources.push(sourceAcquisition.source);
        countBytes(sourceAcquisition.bytes.byteLength);
        bytes = Buffer.from(sourceAcquisition.bytes);
      }
      if (bytes.byteLength !== file.bytes || sha256(bytes) !== file.digest) {
        throw resolverError(
          `Native file ${file.logicalPath} changed after acquisition.`,
          "REGISTRY_ITEM_DIGEST_INVALID",
          file.logicalPath,
        );
      }
      let encoding: AcquiredNativeFile["encoding"];
      let content: string;
      if (textEncoding(file.mediaType)) {
        encoding = "utf8";
        try {
          content = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
        } catch {
          throw resolverError(
            `Native text file ${file.logicalPath} is not valid UTF-8.`,
            "REGISTRY_ITEM_ENCODING_INVALID",
            file.logicalPath,
          );
        }
      } else {
        encoding = "base64";
        content = bytes.toString("base64");
      }
      files.push({
        logicalPath: file.logicalPath,
        targetRole: file.targetRole,
        mediaType: file.mediaType,
        bytes: file.bytes,
        digest: file.digest,
        executable: false,
        encoding,
        content,
        sourceUrl: file.sourceUrl,
        transformPipeline: file.transformPipeline,
      });
    }
    const acquireContract =
      contractSelection === "all" ||
      (contractSelection === "stable" && catalogItem.maturity === "stable");
    let contractDocument: AcquiredNativeRegistryItem["contractDocument"];
    if (acquireContract) {
      const contractArtifact = manifest.artifactsByUrl.get(manifestItem.contract.artifact)!;
      if (contractArtifact.bytes > maxItemBytes) {
        throw resolverError(
          `Native Contract for ${itemId} exceeds the configured item byte policy.`,
          "REGISTRY_CONTRACT_OVERSIZE",
          itemId,
        );
      }
      const contractPath = pathFromImmutableUrl(
        manifestItem.contract.artifact,
        options.registry.origin,
        `Native Contract ${itemId} URL`,
      );
      const contractAcquisition = await acquireImmutableArtifact({
        ...commonAcquisition,
        request: {
          registry: options.registry,
          path: contractPath,
          digest: manifestItem.contract.digest,
          bytes: contractArtifact.bytes,
          maxBytes: maxItemBytes,
          acceptedMediaTypes: ["application/json"],
          release: options.release,
        },
        validate: (bytes) => {
          const value = canonicalDocument(bytes, `Native Contract ${itemId}`);
          const validation = validateContractDefinitionV1(value);
          const definition = validation.value;
          if (
            !validation.valid ||
            definition === null ||
            definition.registryId !== options.registry.id ||
            definition.itemId !== itemId ||
            definition.contractId !== payload.contract.id ||
            definition.contractVersion !== payload.contract.version ||
            definition.payloadDigest !== manifestItem.payload.digest
          ) {
            throw resolverError(
              `Native Contract for ${itemId} does not match its exact registry, item, version, and payload binding.`,
              "REGISTRY_CONTRACT_INVALID",
              itemId,
            );
          }
        },
      });
      sources.push(contractAcquisition.source);
      itemSources.push(contractAcquisition.source);
      countBytes(contractAcquisition.bytes.byteLength);
      contractDocument = {
        content: new TextDecoder("utf-8", { fatal: true }).decode(contractAcquisition.bytes),
        digest: manifestItem.contract.digest,
        url: manifestItem.contract.artifact,
      };
    }
    items.push({
      ...payload,
      files,
      ...(contractDocument === undefined ? {} : { contractDocument }),
      payloadUrl: manifestItem.payload.artifact,
      payloadDigest: manifestItem.payload.digest,
      acquisitionSource: aggregateSource(itemSources),
    });
  }
  const artifactSources = [...new Set(sources)].sort((left, right) =>
    left.localeCompare(right, "en-US"),
  );
  const result: AcquiredNativeRegistryRelease = {
    protocolVersion: "mergora-v1",
    registry: { ...options.registry },
    release: options.release,
    catalogDigest: options.catalog.digest,
    manifestDigest: options.manifest.digest,
    manifestSelfDigest: manifest.manifestSelfDigest,
    dependencyGraphDigest: manifest.dependencyGraphDigest,
    source: aggregateSource(sources),
    artifactSources,
    requestedItems: requested,
    resolvedItems: closure,
    catalog: catalog.items,
    aliases: catalog.aliases,
    items,
    npmPackageInventory: manifest.npmPackageInventory,
    acquiredBytes,
  };
  const frozen = deepFreeze(result);
  AUTHENTIC_ACQUIRED_NATIVE_RELEASES.add(frozen);
  return frozen;
}
