import { createHash } from "node:crypto";

import { canonicalJson, canonicalJsonFile } from "./canonical.ts";

export type ReleaseSha256 = `sha256:${string}`;

export const STABLE_RELEASE_SCHEMA_PATHS = [
  "r/v1/schemas/catalog-v1.schema.json",
  "r/v1/schemas/config-v1.schema.json",
  "r/v1/schemas/contract-v1.schema.json",
  "r/v1/schemas/item-v1.schema.json",
  "r/v1/schemas/latest-alias-v1.schema.json",
  "r/v1/schemas/manifest-v1.schema.json",
  "r/v1/schemas/native-release-reference-v1.schema.json",
  "r/v1/schemas/passport-v1.schema.json",
  "r/v1/schemas/plan-v1.schema.json",
  "r/v1/schemas/release-manifest-v1.schema.json",
  "r/v1/schemas/result-envelope-v1.schema.json",
  "r/v1/schemas/transaction-v1.schema.json",
] as const;

export interface ReleaseEvidenceReference {
  readonly id: string;
  readonly artifact: string;
  readonly digest: ReleaseSha256;
  /** Exact canonical JSON bytes embedded into the release bundle. */
  readonly content: string;
}

export interface ReleaseProtocolValidationError {
  readonly code: string;
  readonly path: string;
  readonly message: string;
}

export interface ReleaseProtocolValidationResult {
  readonly ok: boolean;
  readonly errors: readonly ReleaseProtocolValidationError[];
}

export type ReleaseProtocolSchemaKind =
  "latest-alias" | "registry-index" | "registry-item" | "release-manifest";

export type ReleaseProtocolValidator = (
  kind: ReleaseProtocolSchemaKind,
  value: unknown,
) => ReleaseProtocolValidationResult;

export interface ReleaseFileInput {
  readonly logicalPath: string;
  readonly targetRole: string;
  readonly mediaType: string;
  readonly bytes: number;
  readonly content?: string;
  readonly sourceUrl?: string;
  readonly digest: ReleaseSha256;
  readonly executable: false;
  readonly transformPipeline: readonly {
    readonly adapter: string;
    readonly version: string;
  }[];
}

export interface ReleaseItemPayloadInput {
  readonly schemaVersion: 1;
  readonly registryId: string;
  readonly itemId: string;
  readonly kind: string;
  readonly version: string;
  readonly lastChangedVersion: string;
  readonly maturity: "experimental" | "beta" | "stable" | "deprecated";
  readonly license: string;
  readonly title: string;
  readonly description: string;
  readonly links: Readonly<
    Record<"docs" | "source" | "changelog" | "passport" | "contract", string>
  >;
  readonly compatibility: unknown;
  readonly files: readonly ReleaseFileInput[];
  readonly registryDependencies: readonly string[];
  readonly dependencies: {
    readonly runtime: Readonly<Record<string, string>>;
    readonly development: Readonly<Record<string, string>>;
  };
  readonly structuredPatches: readonly unknown[];
  readonly migrations: readonly unknown[];
  readonly contract: { readonly id: string; readonly version: string };
  readonly passport: { readonly id: string; readonly version: string };
  readonly examples: readonly string[];
  readonly importPaths: readonly string[];
}

export interface ReleaseProtocolItemInput {
  readonly payload: ReleaseItemPayloadInput;
  readonly catalog: {
    readonly aliases: readonly string[];
    readonly category: string;
    readonly tags: readonly string[];
    readonly keywords: readonly string[];
    readonly provenance: string;
    readonly quality: {
      readonly tier: "complete" | "partial" | "not-supplied";
      readonly manualAssistiveTechnologyEvidence: boolean;
    };
  };
  readonly passport: ReleaseEvidenceReference;
  readonly contract: ReleaseEvidenceReference;
}

export interface ReleaseNpmPackageArtifactInput {
  readonly package: string;
  readonly version: string;
  readonly url: string;
  readonly bytes: number;
  readonly digest: ReleaseSha256;
  readonly integrity: `sha512-${string}`;
  readonly license: string;
  readonly disposition: "include" | "omit";
  readonly omissionReason?: "explicitly-omitted" | "license-not-allowed" | undefined;
}

export interface ReleaseNpmPackageInventoryInput {
  /** SPDX identifiers approved by the release's redistribution review. */
  readonly allowedLicenses: readonly string[];
  /** Complete, exact package closure needed for supported offline package installation. */
  readonly entries: readonly ReleaseNpmPackageArtifactInput[];
}

export interface StableReleaseProtocolInput {
  readonly registry: {
    readonly id: string;
    readonly origin: string;
    readonly identityDigest: ReleaseSha256;
  };
  readonly uiVersion: string;
  readonly releaseCommit: string;
  readonly supportedHistorical: readonly string[];
  readonly releaseGate: {
    readonly state: "pass";
    readonly qualitySummary: ReleaseEvidenceReference;
  };
  readonly packedConsumers: {
    readonly state: "pass";
    readonly evidence: ReleaseEvidenceReference;
  };
  readonly schemas: readonly ReleaseEvidenceReference[];
  readonly sbom: ReleaseEvidenceReference;
  readonly items: readonly ReleaseProtocolItemInput[];
  /**
   * Exact public npm artifacts for this release. Older v1 manifests may omit
   * this field; newly built manifests always emit it, including an empty
   * inventory, so consumers can distinguish "verified empty" from "unknown".
   */
  readonly npmPackageInventory?: ReleaseNpmPackageInventoryInput | undefined;
}

export interface ReleaseProtocolArtifact {
  readonly path: string;
  readonly content: string;
  readonly digest: ReleaseSha256;
  readonly mutable: boolean;
  readonly headers: {
    readonly contentType: "application/json; charset=utf-8" | "text/plain; charset=utf-8";
    readonly cacheControl:
      "public, max-age=60, must-revalidate" | "public, max-age=31536000, immutable";
    readonly accessControlAllowOrigin: "*";
    readonly xContentTypeOptions: "nosniff";
    readonly etag: string;
  };
}

export interface StableReleaseProtocolBundle {
  readonly protocolVersion: "mergora-v1";
  readonly registryId: string;
  readonly uiVersion: string;
  readonly dependencyGraphDigest: ReleaseSha256;
  readonly artifacts: readonly ReleaseProtocolArtifact[];
}

export interface BlockedReleaseProtocolPlan {
  readonly schemaVersion: 1;
  readonly artifactKind: "release-protocol-plan";
  readonly generated: {
    readonly by: "@mergora-internal/registry-builder";
    readonly editPolicy: "do-not-edit";
  };
  readonly protocolVersion: "mergora-v1";
  readonly publicationStatus: "blocked-unreleased";
  readonly publishable: false;
  readonly schemaContracts: Readonly<
    Record<"catalog" | "item" | "releaseManifest" | "latestAlias", string>
  >;
  readonly inventory: {
    readonly catalogDefinitions: number;
    readonly sourceItems: number;
    readonly itemsWithoutSource: number;
    readonly sourceItemIds: readonly string[];
  };
  readonly endpointTemplates: Readonly<
    Record<
      | "catalog"
      | "searchIndex"
      | "schema"
      | "releaseManifest"
      | "item"
      | "latestAlias"
      | "passport"
      | "contract"
      | "mirrorManifest"
      | "releaseBundle"
      | "sbom"
      | "checksums",
      string
    >
  >;
  readonly emittedReleaseArtifacts: readonly [];
  readonly blockers: readonly [
    "release-identity-missing",
    "release-version-missing",
    "release-commit-missing",
    "release-artifacts-missing",
    "quality-evidence-missing",
    "manual-assistive-technology-evidence-missing",
    "packed-consumer-evidence-missing",
    "catalog-implementation-incomplete",
    "public-origin-not-deployed",
  ];
}

const CATALOG_ID = /^[a-z0-9]+(?:-[a-z0-9]+)*$/u;
const SHA256 = /^sha256:[0-9a-f]{64}$/u;
const STABLE_SEMVER = /^(?:0|[1-9][0-9]*)\.(?:0|[1-9][0-9]*)\.(?:0|[1-9][0-9]*)$/u;
const RELEASE_COMMIT = /^[0-9a-f]{40}$/u;
const PACKAGE_NAME = /^(?:@[a-z0-9][a-z0-9._-]*\/)?[a-z0-9][a-z0-9._-]*$/u;
const SPDX = /^[A-Za-z0-9][A-Za-z0-9-.+]*(?: WITH [A-Za-z0-9][A-Za-z0-9-.+]*)?$/u;
const SHA512_SRI = /^sha512-[A-Za-z0-9+/]+={0,2}$/u;
const WINDOWS_RESERVED = /^(?:con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\..*)?$/iu;
const INTERNAL_PROTOCOL_PREFIX = "r/v1/" as const;
const PUBLIC_NPM_REGISTRY_ORIGIN = "https://registry.npmjs.org" as const;
const MAX_NPM_PACKAGES = 1024;
const MAX_NPM_LICENSES = 128;
const MAX_NPM_TARBALL_BYTES = 16 * 1024 * 1024;
const MAX_NPM_TOTAL_INCLUDED_BYTES = 32 * 1024 * 1024;

function containsControlCharacter(value: string): boolean {
  return [...value].some((character) => {
    const codePoint = character.codePointAt(0)!;
    return codePoint <= 0x1f || codePoint === 0x7f;
  });
}

function fail(message: string): never {
  throw new Error(`Release protocol generation refused: ${message}`);
}

function sha256(value: string | Uint8Array): ReleaseSha256 {
  return `sha256:${createHash("sha256").update(value).digest("hex")}`;
}

export function releaseArtifactDigest(content: string | Uint8Array): ReleaseSha256 {
  return sha256(content);
}

export function releaseCanonicalDigest(value: unknown): ReleaseSha256 {
  return sha256(canonicalJson(value));
}

export function officialRegistryIdentityDigest(registry: {
  readonly id: string;
  readonly origin: string;
}): ReleaseSha256 {
  return releaseCanonicalDigest({ id: registry.id, origin: registry.origin, trust: "official" });
}

function assertCatalogId(value: string, context: string): void {
  if (!CATALOG_ID.test(value) || value !== value.normalize("NFKC")) {
    fail(`${context} must be lowercase ASCII kebab-case.`);
  }
}

function assertStableSemver(value: string, context: string): void {
  if (!STABLE_SEMVER.test(value)) fail(`${context} must be a stable semantic version.`);
}

function compareText(left: string, right: string): number {
  return left.localeCompare(right, "en-US");
}

function isMergoraOwnedPackage(packageName: string): boolean {
  return (
    packageName === "mergora" ||
    packageName.startsWith("mergora-") ||
    packageName.startsWith("@mergora/")
  );
}

function assertCanonicalSha512Sri(
  value: unknown,
  context: string,
): asserts value is `sha512-${string}` {
  if (typeof value !== "string" || !SHA512_SRI.test(value)) {
    fail(`${context} must be canonical SHA-512 SRI.`);
  }
  const encoded = value.slice("sha512-".length);
  const decoded = Buffer.from(encoded, "base64");
  if (decoded.byteLength !== 64 || decoded.toString("base64") !== encoded) {
    fail(`${context} must be canonical SHA-512 SRI.`);
  }
}

function assertCanonicalPublicNpmTarballUrl(
  value: unknown,
  packageName: string,
  version: string,
  context: string,
): asserts value is string {
  if (typeof value !== "string" || value.length > 2048) {
    fail(`${context} must be a canonical public npm tarball URL.`);
  }
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    fail(`${context} must be a canonical public npm tarball URL.`);
  }
  const unscopedName = packageName.includes("/") ? packageName.split("/")[1]! : packageName;
  const pathname = packageName.startsWith("@")
    ? `/${packageName}/-/${unscopedName}-${version}.tgz`
    : `/${packageName}/-/${packageName}-${version}.tgz`;
  const expected = `${PUBLIC_NPM_REGISTRY_ORIGIN}${pathname}`;
  if (
    value !== expected ||
    parsed.href !== expected ||
    parsed.origin !== PUBLIC_NPM_REGISTRY_ORIGIN ||
    parsed.protocol !== "https:" ||
    parsed.username !== "" ||
    parsed.password !== "" ||
    parsed.search !== "" ||
    parsed.hash !== "" ||
    parsed.pathname !== pathname
  ) {
    fail(
      `${context} must be the credential-free immutable public npm path for ${packageName}@${version}.`,
    );
  }
}

function canonicalNpmPackageInventory(
  value: unknown,
  release: string,
): ReleaseNpmPackageInventoryInput {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    fail("npm package inventory must be an object.");
  }
  const source = value as Record<string, unknown>;
  if (
    Object.keys(source).length !== 2 ||
    !Object.hasOwn(source, "allowedLicenses") ||
    !Object.hasOwn(source, "entries")
  ) {
    fail("npm package inventory has missing or unknown fields.");
  }
  if (!Array.isArray(source.allowedLicenses) || source.allowedLicenses.length > MAX_NPM_LICENSES) {
    fail("npm package license allowlist exceeds its bound.");
  }
  const allowedLicenses = source.allowedLicenses.map((license, index) => {
    if (
      typeof license !== "string" ||
      license.length > 128 ||
      !SPDX.test(license) ||
      license !== license.normalize("NFKC")
    ) {
      fail(`npm package allowed license ${String(index)} is not an SPDX identifier.`);
    }
    return license;
  });
  if (new Set(allowedLicenses).size !== allowedLicenses.length) {
    fail("npm package license allowlist contains duplicates.");
  }
  const canonicalAllowedLicenses = [...allowedLicenses].sort(compareText);
  const allowed = new Set(canonicalAllowedLicenses);

  if (!Array.isArray(source.entries) || source.entries.length > MAX_NPM_PACKAGES) {
    fail("npm package artifact inventory exceeds its entry bound.");
  }
  let includedBytes = 0;
  const identities = new Set<string>();
  const urls = new Set<string>();
  const entries = source.entries.map((rawEntry, index): ReleaseNpmPackageArtifactInput => {
    const context = `npm package artifact ${String(index)}`;
    if (rawEntry === null || typeof rawEntry !== "object" || Array.isArray(rawEntry)) {
      fail(`${context} must be an object.`);
    }
    const entry = rawEntry as Record<string, unknown>;
    const disposition = entry.disposition;
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
    const actualKeys = Object.keys(entry).sort(compareText);
    if (
      actualKeys.length !== expectedKeys.length ||
      actualKeys.some((key, keyIndex) => key !== [...expectedKeys].sort(compareText)[keyIndex])
    ) {
      fail(`${context} has missing or unknown fields.`);
    }
    if (
      typeof entry.package !== "string" ||
      entry.package.length > 214 ||
      !PACKAGE_NAME.test(entry.package) ||
      entry.package !== entry.package.normalize("NFKC")
    ) {
      fail(`${context} package name is invalid.`);
    }
    if (typeof entry.version !== "string" || !STABLE_SEMVER.test(entry.version)) {
      fail(`${context} version must be exact stable semantic version.`);
    }
    if (isMergoraOwnedPackage(entry.package) && entry.version !== release) {
      fail(`${context} Mergora-owned package must use release ${release}.`);
    }
    assertCanonicalPublicNpmTarballUrl(entry.url, entry.package, entry.version, `${context} URL`);
    assertSha256(entry.digest as string, `${context} digest`);
    assertCanonicalSha512Sri(entry.integrity, `${context} integrity`);
    if (
      typeof entry.license !== "string" ||
      entry.license.length > 128 ||
      !SPDX.test(entry.license) ||
      entry.license !== entry.license.normalize("NFKC")
    ) {
      fail(`${context} license is not an SPDX identifier.`);
    }
    if (
      !Number.isSafeInteger(entry.bytes) ||
      Number(entry.bytes) < 1 ||
      Number(entry.bytes) > MAX_NPM_TARBALL_BYTES
    ) {
      fail(`${context} byte count is invalid or exceeds its bound.`);
    }
    if (disposition !== "include" && disposition !== "omit") {
      fail(`${context} disposition must be include or omit.`);
    }
    const licenseAllowed = allowed.has(entry.license);
    if (disposition === "include" && !licenseAllowed) {
      fail(`${context} license is absent from the explicit allowlist.`);
    }
    if (disposition === "omit") {
      if (
        (entry.omissionReason !== "explicitly-omitted" &&
          entry.omissionReason !== "license-not-allowed") ||
        (entry.omissionReason === "license-not-allowed") !== !licenseAllowed
      ) {
        fail(`${context} omission reason disagrees with the explicit license policy.`);
      }
    }
    const identity = `${entry.package}@${entry.version}`.toLocaleLowerCase("en-US");
    if (identities.has(identity) || urls.has(entry.url)) {
      fail(`${context} repeats or collides with another exact package artifact.`);
    }
    identities.add(identity);
    urls.add(entry.url);
    if (disposition === "include") includedBytes += Number(entry.bytes);
    return {
      package: entry.package,
      version: entry.version,
      url: entry.url,
      bytes: Number(entry.bytes),
      digest: entry.digest as ReleaseSha256,
      integrity: entry.integrity,
      license: entry.license,
      disposition,
      ...(disposition === "omit"
        ? {
            omissionReason: entry.omissionReason as "explicitly-omitted" | "license-not-allowed",
          }
        : {}),
    };
  });
  if (includedBytes > MAX_NPM_TOTAL_INCLUDED_BYTES) {
    fail("included npm package artifacts exceed the aggregate byte bound.");
  }
  entries.sort((left, right) =>
    left.package === right.package
      ? compareText(left.version, right.version)
      : compareText(left.package, right.package),
  );
  return { allowedLicenses: canonicalAllowedLicenses, entries };
}

function compareStableSemver(left: string, right: string): number {
  assertStableSemver(left, "left comparison version");
  assertStableSemver(right, "right comparison version");
  const leftParts = left.split(".").map(Number);
  const rightParts = right.split(".").map(Number);
  for (let index = 0; index < 3; index += 1) {
    const difference = leftParts[index]! - rightParts[index]!;
    if (difference !== 0) return difference;
  }
  return 0;
}

function assertSha256(value: string, context: string): asserts value is ReleaseSha256 {
  if (!SHA256.test(value)) fail(`${context} must be a lowercase sha256 digest.`);
}

function assertImmutableHttpsUrl(value: string, context: string, origin?: string): void {
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    fail(`${context} must be an absolute URL.`);
  }
  if (
    parsed.protocol !== "https:" ||
    parsed.username !== "" ||
    parsed.password !== "" ||
    parsed.search !== "" ||
    parsed.hash !== ""
  ) {
    fail(`${context} must be an immutable credential-free HTTPS URL without query or fragment.`);
  }
  if (origin !== undefined && !value.startsWith(`${origin}/`)) {
    fail(`${context} must remain under the enrolled official registry origin.`);
  }
}

function assertPortableReleasePath(path: string): void {
  if (
    path === "" ||
    path !== path.normalize("NFKC") ||
    path.startsWith("/") ||
    /^[a-z]:/iu.test(path) ||
    path.includes("\\") ||
    path.includes(":") ||
    path.includes("%")
  ) {
    fail(`artifact path ${JSON.stringify(path)} is not portable and project-relative.`);
  }
  for (const segment of path.split("/")) {
    if (
      segment === "" ||
      segment === "." ||
      segment === ".." ||
      containsControlCharacter(segment) ||
      /[<>"|?*]/u.test(segment) ||
      /[. ]$/u.test(segment) ||
      WINDOWS_RESERVED.test(segment)
    ) {
      fail(`artifact path ${JSON.stringify(path)} contains an unsafe segment.`);
    }
  }
}

function protocolRelativeArtifactPath(path: string): string {
  assertPortableReleasePath(path);
  if (
    !path.startsWith(INTERNAL_PROTOCOL_PREFIX) ||
    path.length === INTERNAL_PROTOCOL_PREFIX.length
  ) {
    fail(`artifact path ${JSON.stringify(path)} is outside the internal r/v1 protocol root.`);
  }
  return path.slice(INTERNAL_PROTOCOL_PREFIX.length);
}

function internalArtifactPathFromUrl(url: string, origin: string, context: string): string {
  assertImmutableHttpsUrl(url, context, origin);
  const relative = url.slice(`${origin}/`.length);
  if (relative === "r/v1" || relative.startsWith(INTERNAL_PROTOCOL_PREFIX)) {
    fail(`${context} repeats the r/v1 protocol prefix after the registry origin.`);
  }
  const path = `${INTERNAL_PROTOCOL_PREFIX}${relative}`;
  assertPortableReleasePath(path);
  return path;
}

function assertEvidenceReference(
  reference: ReleaseEvidenceReference,
  context: string,
  origin: string,
): void {
  assertCatalogId(reference.id, `${context} id`);
  assertImmutableHttpsUrl(reference.artifact, `${context} artifact`, origin);
  assertSha256(reference.digest, `${context} digest`);
  if (
    !reference.content.endsWith("\n") ||
    reference.content.includes("\r") ||
    reference.content !== reference.content.normalize("NFKC") ||
    reference.digest !== sha256(reference.content)
  ) {
    fail(`${context} content must be canonical release bytes matching its digest.`);
  }
  let document: unknown;
  try {
    document = JSON.parse(reference.content) as unknown;
  } catch {
    fail(`${context} content must be valid JSON.`);
  }
  if (
    document === null ||
    typeof document !== "object" ||
    Array.isArray(document) ||
    canonicalJsonFile(document) !== reference.content
  ) {
    fail(`${context} content must be a canonical JSON object.`);
  }
}

function evidencePointer(
  reference: ReleaseEvidenceReference,
): Omit<ReleaseEvidenceReference, "content"> {
  return {
    id: reference.id,
    artifact: reference.artifact,
    digest: reference.digest,
  };
}

function evidenceArtifactPath(reference: ReleaseEvidenceReference, origin: string): string {
  return internalArtifactPathFromUrl(
    reference.artifact,
    origin,
    `evidence artifact ${reference.id}`,
  );
}

function validationFailure(
  kind: ReleaseProtocolSchemaKind,
  value: unknown,
  validate: ReleaseProtocolValidator,
): void {
  const result = validate(kind, value);
  if (result.ok) return;
  const details = result.errors
    .slice(0, 8)
    .map((error) => `${error.path || "/"} [${error.code}] ${error.message}`)
    .join("; ");
  fail(`${kind} schema validation failed${details === "" ? "." : `: ${details}`}`);
}

function withoutKey(record: Record<string, unknown>, key: string): Record<string, unknown> {
  return Object.fromEntries(Object.entries(record).filter(([candidate]) => candidate !== key));
}

function payloadWithoutDigest(payload: unknown): Record<string, unknown> {
  if (payload === null || typeof payload !== "object" || Array.isArray(payload)) {
    fail("item payload must be an object.");
  }
  return withoutKey(payload as Record<string, unknown>, "payloadDigest");
}

function manifestWithoutDigest(manifest: unknown): Record<string, unknown> {
  if (manifest === null || typeof manifest !== "object" || Array.isArray(manifest)) {
    fail("release manifest must be an object.");
  }
  return withoutKey(manifest as Record<string, unknown>, "manifestDigest");
}

function assertPayloadFiles(payload: ReleaseItemPayloadInput): void {
  const identities = new Map<string, string>();
  for (const file of payload.files) {
    assertPortableReleasePath(file.logicalPath);
    const identity = file.logicalPath.normalize("NFKC").toLocaleLowerCase("en-US");
    const prior = identities.get(identity);
    if (prior !== undefined) {
      fail(`item ${payload.itemId} file ${file.logicalPath} collides with ${prior}.`);
    }
    identities.set(identity, file.logicalPath);
    if (file.executable !== false) fail(`item ${payload.itemId} contains an executable file.`);
    if (file.content === undefined || file.sourceUrl !== undefined) {
      fail(
        `item ${payload.itemId} file ${file.logicalPath} must embed verified content; remote source URLs are not accepted by the offline release builder.`,
      );
    }
    if (file.content !== file.content.normalize("NFKC")) {
      fail(`item ${payload.itemId} file ${file.logicalPath} is not Unicode NFKC.`);
    }
    const bytes = Buffer.byteLength(file.content, "utf8");
    if (file.bytes !== bytes) {
      fail(
        `item ${payload.itemId} file ${file.logicalPath} byte length does not match its content.`,
      );
    }
    if (file.digest !== sha256(file.content)) {
      fail(`item ${payload.itemId} file ${file.logicalPath} digest does not match its content.`);
    }
  }
}

function assertUniqueCanonical(values: readonly string[], context: string): void {
  const seen = new Map<string, string>();
  for (const value of values) {
    const identity = value.normalize("NFKC").toLocaleLowerCase("en-US");
    const prior = seen.get(identity);
    if (prior !== undefined) fail(`${context} ${JSON.stringify(value)} collides with ${prior}.`);
    seen.set(identity, value);
  }
}

function dependencyGraph(
  registryId: string,
  items: readonly ReleaseProtocolItemInput[],
): Readonly<Record<string, readonly string[]>> {
  const ids = new Set(items.map((item) => item.payload.itemId));
  const graph: Record<string, readonly string[]> = {};
  for (const item of items) {
    const dependencies = item.payload.registryDependencies.map((qualified) => {
      const prefix = `${registryId}:`;
      if (!qualified.startsWith(prefix)) {
        fail(`item ${item.payload.itemId} dependency ${qualified} is outside this release graph.`);
      }
      const dependency = qualified.slice(prefix.length);
      assertCatalogId(dependency, `dependency of ${item.payload.itemId}`);
      if (!ids.has(dependency)) {
        fail(`item ${item.payload.itemId} depends on missing release item ${dependency}.`);
      }
      return dependency;
    });
    assertUniqueCanonical(dependencies, `dependencies of ${item.payload.itemId}`);
    graph[item.payload.itemId] = [...dependencies].sort();
  }

  const visited = new Set<string>();
  const active = new Set<string>();
  const visit = (id: string): void => {
    if (active.has(id)) fail(`registry dependency graph contains a cycle through ${id}.`);
    if (visited.has(id)) return;
    active.add(id);
    for (const dependency of graph[id] ?? []) visit(dependency);
    active.delete(id);
    visited.add(id);
  };
  Object.keys(graph).sort().forEach(visit);
  return graph;
}

function makeArtifact(
  path: string,
  content: string,
  mutable: boolean,
  contentType: ReleaseProtocolArtifact["headers"]["contentType"],
): ReleaseProtocolArtifact {
  assertPortableReleasePath(path);
  if (!content.endsWith("\n") || content.includes("\r") || content !== content.normalize("NFKC")) {
    fail(`artifact ${path} must be NFKC, LF-only text with a final newline.`);
  }
  const digest = sha256(content);
  return {
    path,
    content,
    digest,
    mutable,
    headers: {
      contentType,
      cacheControl: mutable
        ? "public, max-age=60, must-revalidate"
        : "public, max-age=31536000, immutable",
      accessControlAllowOrigin: "*",
      xContentTypeOptions: "nosniff",
      etag: `"${digest.slice("sha256:".length)}"`,
    },
  };
}

function artifactUrl(origin: string, path: string): string {
  return `${origin}/${protocolRelativeArtifactPath(path)}`;
}

function makeEvidenceArtifact(
  reference: ReleaseEvidenceReference,
  origin: string,
): ReleaseProtocolArtifact {
  const artifact = makeArtifact(
    evidenceArtifactPath(reference, origin),
    reference.content,
    false,
    "application/json; charset=utf-8",
  );
  if (artifact.digest !== reference.digest) {
    fail(`embedded evidence ${reference.id} digest changed during artifact generation.`);
  }
  return artifact;
}

function manifestArtifactRecord(
  artifact: ReleaseProtocolArtifact,
  origin: string,
): {
  readonly name: string;
  readonly url: string;
  readonly digest: ReleaseSha256;
  readonly mediaType: "application/json";
  readonly bytes: number;
} {
  return {
    name: artifact.path,
    url: artifactUrl(origin, artifact.path),
    digest: artifact.digest,
    mediaType: "application/json",
    bytes: Buffer.byteLength(artifact.content, "utf8"),
  };
}

function checksumContent(artifacts: readonly ReleaseProtocolArtifact[]): string {
  return [...artifacts]
    .sort((left, right) => left.path.localeCompare(right.path, "en-US"))
    .map((artifact) => `${artifact.digest.slice("sha256:".length)}  ${artifact.path}`)
    .join("\n")
    .concat("\n");
}

function assertReleaseInput(input: StableReleaseProtocolInput): void {
  assertCatalogId(input.registry.id, "registry id");
  if (input.registry.origin.endsWith("/")) fail("registry origin must not end with a slash.");
  assertImmutableHttpsUrl(input.registry.origin, "registry origin");
  assertSha256(input.registry.identityDigest, "registry identity digest");
  if (input.registry.identityDigest !== officialRegistryIdentityDigest(input.registry)) {
    fail("registry identity digest does not match the canonical official identity record.");
  }
  assertStableSemver(input.uiVersion, "UI release version");
  if (!RELEASE_COMMIT.test(input.releaseCommit)) {
    fail("release commit must be a lowercase 40-character Git object id.");
  }
  if (input.releaseGate.state !== "pass" || input.packedConsumers.state !== "pass") {
    fail("release gate and packed-consumer evidence must explicitly pass.");
  }
  assertEvidenceReference(
    input.releaseGate.qualitySummary,
    "quality summary",
    input.registry.origin,
  );
  assertEvidenceReference(
    input.packedConsumers.evidence,
    "packed-consumer evidence",
    input.registry.origin,
  );
  assertEvidenceReference(input.sbom, "release SBOM", input.registry.origin);
  const releaseEvidenceRoot = `${input.registry.origin}/releases/${input.uiVersion}`;
  if (input.releaseGate.qualitySummary.artifact !== `${releaseEvidenceRoot}/quality.json`) {
    fail("quality evidence must use its canonical immutable release path.");
  }
  if (input.packedConsumers.evidence.artifact !== `${releaseEvidenceRoot}/consumers.json`) {
    fail("packed-consumer evidence must use its canonical immutable release path.");
  }
  if (input.sbom.artifact !== `${releaseEvidenceRoot}/sbom.json`) {
    fail("release SBOM must use its canonical immutable release path.");
  }
  if (input.schemas.length === 0 || input.schemas.length > 128) {
    fail("a stable release must embed between 1 and 128 public schemas.");
  }
  input.schemas.forEach((schema, index) => {
    assertEvidenceReference(schema, `public schema ${String(index)}`, input.registry.origin);
    if (
      !/^r\/v1\/schemas\/[a-z0-9][a-z0-9.-]*\.json$/u.test(
        evidenceArtifactPath(schema, input.registry.origin),
      )
    ) {
      fail(`public schema ${String(index)} must use the canonical schema endpoint.`);
    }
  });
  const schemaPaths = new Set(
    input.schemas.map((schema) => evidenceArtifactPath(schema, input.registry.origin)),
  );
  const missingSchema = STABLE_RELEASE_SCHEMA_PATHS.find((path) => !schemaPaths.has(path));
  if (missingSchema !== undefined) {
    fail(`stable release is missing required public schema ${missingSchema}.`);
  }
  assertUniqueCanonical(
    [
      input.releaseGate.qualitySummary.artifact,
      input.packedConsumers.evidence.artifact,
      input.sbom.artifact,
      ...input.schemas.map(({ artifact }) => artifact),
      ...input.items.flatMap(({ passport, contract }) => [passport.artifact, contract.artifact]),
    ],
    "embedded release artifact URL",
  );
  if (input.items.length === 0 || input.items.length > 256) {
    fail("a release must contain between 1 and 256 items.");
  }
  input.supportedHistorical.forEach((version) => assertStableSemver(version, "historical release"));
  if (
    input.supportedHistorical.some((version) => compareStableSemver(version, input.uiVersion) >= 0)
  ) {
    fail("supported historical releases must be older than the current release.");
  }
  assertUniqueCanonical(input.supportedHistorical, "historical release");
}

export function buildBlockedReleaseProtocolPlan(input: {
  readonly catalogDefinitions: number;
  readonly sourceItemIds: readonly string[];
  readonly schemaContracts: BlockedReleaseProtocolPlan["schemaContracts"];
}): BlockedReleaseProtocolPlan {
  if (input.catalogDefinitions < input.sourceItemIds.length) {
    fail("source item count exceeds the canonical catalog definition count.");
  }
  const sourceItemIds = [...input.sourceItemIds].sort((left, right) =>
    left.localeCompare(right, "en-US"),
  );
  sourceItemIds.forEach((id) => assertCatalogId(id, "source item id"));
  assertUniqueCanonical(sourceItemIds, "source item id");
  Object.entries(input.schemaContracts).forEach(([name, id]) =>
    assertImmutableHttpsUrl(id, `${name} schema id`),
  );

  return {
    schemaVersion: 1,
    artifactKind: "release-protocol-plan",
    generated: {
      by: "@mergora-internal/registry-builder",
      editPolicy: "do-not-edit",
    },
    protocolVersion: "mergora-v1",
    publicationStatus: "blocked-unreleased",
    publishable: false,
    schemaContracts: input.schemaContracts,
    inventory: {
      catalogDefinitions: input.catalogDefinitions,
      sourceItems: sourceItemIds.length,
      itemsWithoutSource: input.catalogDefinitions - sourceItemIds.length,
      sourceItemIds,
    },
    endpointTemplates: {
      catalog: "r/v1/catalog.json",
      searchIndex: "r/v1/search-index.json",
      schema: "r/v1/schemas/<schema-name>-v1.schema.json",
      releaseManifest: "r/v1/releases/<ui-version>/manifest.json",
      item: "r/v1/releases/<ui-version>/items/<item-id>.json",
      latestAlias: "r/v1/items/<item-id>/latest.json",
      passport: "r/v1/passports/<ui-version>/<item-id>.json",
      contract: "r/v1/contracts/<contract-version>/<item-id>.json",
      mirrorManifest: "r/v1/releases/<ui-version>/mirror-manifest.json",
      releaseBundle: "r/v1/releases/<ui-version>/release-bundle.json",
      sbom: "r/v1/releases/<ui-version>/sbom.json",
      checksums: "r/v1/releases/<ui-version>/SHA256SUMS",
    },
    emittedReleaseArtifacts: [],
    blockers: [
      "release-identity-missing",
      "release-version-missing",
      "release-commit-missing",
      "release-artifacts-missing",
      "quality-evidence-missing",
      "manual-assistive-technology-evidence-missing",
      "packed-consumer-evidence-missing",
      "catalog-implementation-incomplete",
      "public-origin-not-deployed",
    ],
  };
}

export function buildStableReleaseProtocolBundle(
  input: StableReleaseProtocolInput,
  validate: ReleaseProtocolValidator,
): StableReleaseProtocolBundle {
  assertReleaseInput(input);
  const npmPackageInventory = canonicalNpmPackageInventory(
    input.npmPackageInventory ?? { allowedLicenses: [], entries: [] },
    input.uiVersion,
  );
  const orderedItems = [...input.items].sort((left, right) =>
    left.payload.itemId.localeCompare(right.payload.itemId, "en-US"),
  );
  assertUniqueCanonical(
    orderedItems.flatMap((item) => [item.payload.itemId, ...item.catalog.aliases]),
    "registry item or alias",
  );
  const graph = dependencyGraph(input.registry.id, orderedItems);
  const dependencyGraphDigest = releaseCanonicalDigest({
    registryId: input.registry.id,
    uiVersion: input.uiVersion,
    items: graph,
  });

  const itemArtifacts = new Map<string, ReleaseProtocolArtifact>();
  for (const item of orderedItems) {
    const payload = item.payload;
    assertCatalogId(payload.itemId, "item id");
    if (Object.hasOwn(payload, "payloadDigest")) {
      fail(`item ${payload.itemId} supplied a precomputed payloadDigest.`);
    }
    if (payload.registryId !== input.registry.id || payload.version !== input.uiVersion) {
      fail(
        `item ${payload.itemId} must bind to registry ${input.registry.id} release ${input.uiVersion}.`,
      );
    }
    assertStableSemver(payload.lastChangedVersion, `last changed version for ${payload.itemId}`);
    if (compareStableSemver(payload.lastChangedVersion, input.uiVersion) > 0) {
      fail(`item ${payload.itemId} last-changed version cannot be newer than this release.`);
    }
    assertPayloadFiles(payload);
    assertEvidenceReference(item.passport, `passport for ${payload.itemId}`, input.registry.origin);
    assertEvidenceReference(item.contract, `contract for ${payload.itemId}`, input.registry.origin);
    if (
      payload.passport.id !== item.passport.id ||
      payload.passport.version !== input.uiVersion ||
      payload.links.passport !== item.passport.artifact ||
      item.passport.artifact !==
        artifactUrl(
          input.registry.origin,
          `r/v1/passports/${input.uiVersion}/${payload.itemId}.json`,
        )
    ) {
      fail(`item ${payload.itemId} Passport identity, version, or URL is inconsistent.`);
    }
    assertStableSemver(payload.contract.version, `Contract version for ${payload.itemId}`);
    if (
      payload.contract.id !== item.contract.id ||
      payload.links.contract !== item.contract.artifact ||
      item.contract.artifact !==
        artifactUrl(
          input.registry.origin,
          `r/v1/contracts/${payload.contract.version}/${payload.itemId}.json`,
        )
    ) {
      fail(`item ${payload.itemId} Contract identity, version, or URL is inconsistent.`);
    }
    if (
      payload.maturity === "stable" &&
      (item.catalog.quality.tier !== "complete" ||
        !item.catalog.quality.manualAssistiveTechnologyEvidence)
    ) {
      fail(`Stable item ${payload.itemId} is missing complete quality or manual AT evidence.`);
    }
    const unsignedPayload = payloadWithoutDigest(payload);
    const signedPayload = {
      ...unsignedPayload,
      payloadDigest: releaseCanonicalDigest(unsignedPayload),
    };
    validationFailure("registry-item", signedPayload, validate);
    const path = `r/v1/releases/${input.uiVersion}/items/${payload.itemId}.json`;
    const artifact = makeArtifact(
      path,
      canonicalJsonFile(signedPayload),
      false,
      "application/json; charset=utf-8",
    );
    itemArtifacts.set(payload.itemId, artifact);
  }

  const evidenceArtifacts = [
    input.releaseGate.qualitySummary,
    input.packedConsumers.evidence,
    input.sbom,
    ...input.schemas,
    ...orderedItems.flatMap(({ passport, contract }) => [passport, contract]),
  ]
    .map((reference) => makeEvidenceArtifact(reference, input.registry.origin))
    .sort((left, right) => left.path.localeCompare(right.path, "en-US"));
  assertUniqueCanonical(
    evidenceArtifacts.map(({ path }) => path),
    "embedded release artifact path",
  );

  const catalog = {
    schemaVersion: 1,
    protocolVersion: "mergora-v1",
    registry: {
      id: input.registry.id,
      origin: input.registry.origin,
      trust: "official",
      identityDigest: input.registry.identityDigest,
    },
    releases: {
      currentStable: input.uiVersion,
      currentPrerelease: null,
      supportedHistorical: [...input.supportedHistorical].sort(compareStableSemver),
    },
    items: orderedItems.map((item) => {
      const payload = item.payload;
      return {
        id: payload.itemId,
        aliases: [...item.catalog.aliases].sort(),
        displayName: payload.title,
        description: payload.description,
        kind: payload.kind,
        category: item.catalog.category,
        tags: [...item.catalog.tags].sort(),
        keywords: [...item.catalog.keywords].sort(),
        maturity: payload.maturity,
        latestStableVersion: input.uiVersion,
        lastChangedVersion: payload.lastChangedVersion,
        compatibility: payload.compatibility,
        license: payload.license,
        provenance: item.catalog.provenance,
        links: {
          payload: artifactUrl(input.registry.origin, itemArtifacts.get(payload.itemId)!.path),
          passport: item.passport.artifact,
          contract: item.contract.artifact,
          docs: payload.links.docs,
          source: payload.links.source,
        },
        registryDependencies: [...payload.registryDependencies].sort(),
        quality: item.catalog.quality,
      };
    }),
    dependencyGraphDigest,
  } as const;
  validationFailure("registry-index", catalog, validate);
  const catalogArtifact = makeArtifact(
    "r/v1/catalog.json",
    canonicalJsonFile(catalog),
    true,
    "application/json; charset=utf-8",
  );
  const searchIndexArtifact = makeArtifact(
    "r/v1/search-index.json",
    canonicalJsonFile({
      schemaVersion: 1,
      protocolVersion: "mergora-v1",
      registryId: input.registry.id,
      uiVersion: input.uiVersion,
      dependencyGraphDigest,
      items: catalog.items.map((item) => ({
        id: item.id,
        aliases: item.aliases,
        displayName: item.displayName,
        description: item.description,
        kind: item.kind,
        category: item.category,
        tags: item.tags,
        keywords: item.keywords,
        maturity: item.maturity,
      })),
    }),
    true,
    "application/json; charset=utf-8",
  );

  const manifestItems = Object.fromEntries(
    orderedItems.map((item) => {
      const payload = item.payload;
      const artifact = itemArtifacts.get(payload.itemId)!;
      return [
        payload.itemId,
        {
          version: input.uiVersion,
          payload: {
            id: payload.itemId,
            artifact: artifactUrl(input.registry.origin, artifact.path),
            digest: artifact.digest,
          },
          passport: evidencePointer(item.passport),
          contract: evidencePointer(item.contract),
          dependencies: [...payload.registryDependencies].sort(),
        },
      ];
    }),
  );
  const unsignedManifest = {
    schemaVersion: 1,
    registryId: input.registry.id,
    uiVersion: input.uiVersion,
    releaseCommit: input.releaseCommit,
    items: manifestItems,
    dependencyGraphDigest,
    artifacts: [...itemArtifacts.values(), ...evidenceArtifacts]
      .sort((left, right) => left.path.localeCompare(right.path, "en-US"))
      .map((artifact) => manifestArtifactRecord(artifact, input.registry.origin)),
    npmPackageInventory,
    qualitySummary: evidencePointer(input.releaseGate.qualitySummary),
  } as const;
  const manifest = {
    ...unsignedManifest,
    manifestDigest: releaseCanonicalDigest(unsignedManifest),
  };
  validationFailure("release-manifest", manifest, validate);
  const manifestPath = `r/v1/releases/${input.uiVersion}/manifest.json`;
  const manifestArtifact = makeArtifact(
    manifestPath,
    canonicalJsonFile(manifest),
    false,
    "application/json; charset=utf-8",
  );

  const latestArtifacts = orderedItems.map((item) => {
    const payloadArtifact = itemArtifacts.get(item.payload.itemId)!;
    const latest = {
      schemaVersion: 1,
      protocolVersion: "mergora-v1",
      registryId: input.registry.id,
      itemId: item.payload.itemId,
      resolvedVersion: input.uiVersion,
      releaseManifest: {
        url: artifactUrl(input.registry.origin, manifestArtifact.path),
        digest: manifestArtifact.digest,
      },
      payload: {
        url: artifactUrl(input.registry.origin, payloadArtifact.path),
        digest: payloadArtifact.digest,
      },
    } as const;
    validationFailure("latest-alias", latest, validate);
    return makeArtifact(
      `r/v1/items/${item.payload.itemId}/latest.json`,
      canonicalJsonFile(latest),
      true,
      "application/json; charset=utf-8",
    );
  });

  const releaseSnapshotArtifacts = [
    catalogArtifact,
    searchIndexArtifact,
    manifestArtifact,
    ...itemArtifacts.values(),
    ...latestArtifacts,
    ...evidenceArtifacts,
  ].sort((left, right) => left.path.localeCompare(right.path, "en-US"));
  const mirrorArtifact = makeArtifact(
    `r/v1/releases/${input.uiVersion}/mirror-manifest.json`,
    canonicalJsonFile({
      schemaVersion: 1,
      artifactKind: "mergora-release-mirror-manifest",
      registryId: input.registry.id,
      uiVersion: input.uiVersion,
      canonicalOrigin: input.registry.origin,
      artifacts: releaseSnapshotArtifacts.map(({ path, digest }) => ({
        path,
        url: artifactUrl(input.registry.origin, path),
        digest,
      })),
    }),
    false,
    "application/json; charset=utf-8",
  );
  const bundledArtifacts = [...releaseSnapshotArtifacts, mirrorArtifact].sort((left, right) =>
    left.path.localeCompare(right.path, "en-US"),
  );
  const releaseBundleArtifact = makeArtifact(
    `r/v1/releases/${input.uiVersion}/release-bundle.json`,
    canonicalJsonFile({
      schemaVersion: 1,
      artifactKind: "mergora-static-release-bundle",
      registryId: input.registry.id,
      uiVersion: input.uiVersion,
      files: bundledArtifacts.map(({ path, digest, content }) => ({ path, digest, content })),
      sha256sums: checksumContent(bundledArtifacts),
    }),
    false,
    "application/json; charset=utf-8",
  );
  const jsonArtifacts = [...bundledArtifacts, releaseBundleArtifact].sort((left, right) =>
    left.path.localeCompare(right.path, "en-US"),
  );
  const checksumArtifact = makeArtifact(
    `r/v1/releases/${input.uiVersion}/SHA256SUMS`,
    checksumContent(jsonArtifacts),
    false,
    "text/plain; charset=utf-8",
  );
  const bundle: StableReleaseProtocolBundle = {
    protocolVersion: "mergora-v1",
    registryId: input.registry.id,
    uiVersion: input.uiVersion,
    dependencyGraphDigest,
    artifacts: [...jsonArtifacts, checksumArtifact].sort((left, right) =>
      left.path.localeCompare(right.path, "en-US"),
    ),
  };
  verifyStableReleaseProtocolBundle(bundle, validate);
  return bundle;
}

export function verifyStableReleaseProtocolBundle(
  bundle: StableReleaseProtocolBundle,
  validate: ReleaseProtocolValidator,
): void {
  assertCatalogId(bundle.registryId, "bundle registry id");
  assertStableSemver(bundle.uiVersion, "bundle UI version");
  assertSha256(bundle.dependencyGraphDigest, "bundle dependency graph digest");
  const byPath = new Map<string, ReleaseProtocolArtifact>();
  for (const artifact of bundle.artifacts) {
    assertPortableReleasePath(artifact.path);
    const identity = artifact.path.normalize("NFKC").toLocaleLowerCase("en-US");
    if (byPath.has(identity)) fail(`bundle contains duplicate artifact path ${artifact.path}.`);
    if (artifact.digest !== sha256(artifact.content)) {
      fail(`artifact ${artifact.path} digest does not match its bytes.`);
    }
    if (artifact.headers.etag !== `"${artifact.digest.slice("sha256:".length)}"`) {
      fail(`artifact ${artifact.path} ETag does not match its bytes.`);
    }
    if (
      artifact.headers.accessControlAllowOrigin !== "*" ||
      artifact.headers.xContentTypeOptions !== "nosniff"
    ) {
      fail(`artifact ${artifact.path} is missing the public-read CORS or nosniff policy.`);
    }
    const shouldBeMutable =
      artifact.path === "r/v1/catalog.json" ||
      artifact.path === "r/v1/search-index.json" ||
      /\/items\/[^/]+\/latest\.json$/u.test(artifact.path);
    if (artifact.mutable !== shouldBeMutable) {
      fail(`artifact ${artifact.path} has an incorrect mutability classification.`);
    }
    if (
      artifact.headers.cacheControl !==
      (shouldBeMutable
        ? "public, max-age=60, must-revalidate"
        : "public, max-age=31536000, immutable")
    ) {
      fail(`artifact ${artifact.path} has an incorrect cache policy.`);
    }
    byPath.set(identity, artifact);
  }

  const checksumPath = `r/v1/releases/${bundle.uiVersion}/SHA256SUMS`;
  const checksumArtifact = byPath.get(checksumPath.toLocaleLowerCase("en-US"));
  if (checksumArtifact === undefined) fail(`bundle is missing ${checksumPath}.`);
  const nonChecksum = bundle.artifacts.filter((artifact) => artifact.path !== checksumPath);
  if (checksumArtifact.content !== checksumContent(nonChecksum)) {
    fail("SHA256SUMS does not exactly cover every non-checksum artifact.");
  }

  const parsed = new Map<string, Record<string, unknown>>();
  for (const artifact of nonChecksum) {
    let document: unknown;
    try {
      document = JSON.parse(artifact.content) as unknown;
    } catch {
      fail(`artifact ${artifact.path} is not valid JSON.`);
    }
    if (document === null || typeof document !== "object" || Array.isArray(document)) {
      fail(`artifact ${artifact.path} must contain a JSON object.`);
    }
    if (artifact.content !== canonicalJsonFile(document)) {
      fail(`artifact ${artifact.path} is not canonical JSON.`);
    }
    parsed.set(artifact.path, document as Record<string, unknown>);
    if (artifact.path === "r/v1/catalog.json") {
      validationFailure("registry-index", document, validate);
    } else if (/\/releases\/[^/]+\/manifest\.json$/u.test(artifact.path)) {
      validationFailure("release-manifest", document, validate);
      if (
        (document as Record<string, unknown>).manifestDigest !==
        releaseCanonicalDigest(manifestWithoutDigest(document))
      ) {
        fail("release manifest self-digest does not match its canonical digest input.");
      }
    } else if (/\/releases\/[^/]+\/items\/[^/]+\.json$/u.test(artifact.path)) {
      validationFailure("registry-item", document, validate);
      const record = document as Record<string, unknown>;
      if (record.payloadDigest !== releaseCanonicalDigest(payloadWithoutDigest(record))) {
        fail(`item artifact ${artifact.path} payloadDigest does not match its canonical payload.`);
      }
    } else if (/\/items\/[^/]+\/latest\.json$/u.test(artifact.path)) {
      validationFailure("latest-alias", document, validate);
    } else if (
      artifact.path === "r/v1/search-index.json" ||
      /^r\/v1\/schemas\/[a-z0-9][a-z0-9.-]*\.json$/u.test(artifact.path) ||
      /^r\/v1\/(?:passports|contracts)\/[0-9]+\.[0-9]+\.[0-9]+\/[a-z0-9-]+\.json$/u.test(
        artifact.path,
      ) ||
      new RegExp(
        `^r/v1/releases/${bundle.uiVersion.replaceAll(".", "\\.")}/(?:quality|consumers|sbom|mirror-manifest|release-bundle)\\.json$`,
        "u",
      ).test(artifact.path)
    ) {
      // Supplemental release artifacts are still required to be canonical JSON and
      // are verified against manifest/bundle references below.
    } else {
      fail(`bundle contains unrecognized JSON artifact ${artifact.path}.`);
    }
  }

  const catalog = parsed.get("r/v1/catalog.json");
  const manifest = parsed.get(`r/v1/releases/${bundle.uiVersion}/manifest.json`);
  if (catalog === undefined || manifest === undefined)
    fail("bundle is missing catalog or manifest.");
  if (
    catalog.dependencyGraphDigest !== bundle.dependencyGraphDigest ||
    manifest.dependencyGraphDigest !== bundle.dependencyGraphDigest
  ) {
    fail("catalog, manifest, and bundle dependency graph digests disagree.");
  }
  if (manifest.npmPackageInventory !== undefined) {
    const normalizedNpmPackageInventory = canonicalNpmPackageInventory(
      manifest.npmPackageInventory,
      bundle.uiVersion,
    );
    if (
      canonicalJsonFile(manifest.npmPackageInventory) !==
      canonicalJsonFile(normalizedNpmPackageInventory)
    ) {
      fail("release npm package inventory is not canonically ordered.");
    }
  }

  const registry = catalog.registry;
  const releaseRows = catalog.releases;
  const catalogItems = catalog.items;
  const manifestItems = manifest.items;
  if (
    registry === null ||
    typeof registry !== "object" ||
    Array.isArray(registry) ||
    typeof (registry as Record<string, unknown>).origin !== "string" ||
    releaseRows === null ||
    typeof releaseRows !== "object" ||
    Array.isArray(releaseRows) ||
    (releaseRows as Record<string, unknown>).currentStable !== bundle.uiVersion ||
    !Array.isArray(catalogItems) ||
    manifestItems === null ||
    typeof manifestItems !== "object" ||
    Array.isArray(manifestItems)
  ) {
    fail("catalog or manifest release identity structure is inconsistent with the bundle.");
  }
  const registryRecord = registry as Record<string, unknown>;
  const origin = registryRecord.origin as string;
  if (origin.endsWith("/")) fail("catalog registry origin must not end with a slash.");
  assertImmutableHttpsUrl(origin, "catalog registry origin");
  if (
    registryRecord.id !== bundle.registryId ||
    registryRecord.trust !== "official" ||
    typeof registryRecord.identityDigest !== "string" ||
    registryRecord.identityDigest !==
      officialRegistryIdentityDigest({ id: bundle.registryId, origin })
  ) {
    fail("catalog registry identity digest does not bind its exact id, origin, and trust.");
  }
  const manifestArtifact = byPath.get(
    `r/v1/releases/${bundle.uiVersion}/manifest.json`.toLocaleLowerCase("en-US"),
  )!;
  const catalogById = new Map<string, Record<string, unknown>>();
  for (const row of catalogItems) {
    if (row === null || typeof row !== "object" || Array.isArray(row)) {
      fail("catalog contains a non-object item row.");
    }
    const record = row as Record<string, unknown>;
    if (typeof record.id !== "string" || catalogById.has(record.id)) {
      fail("catalog contains a missing or duplicate item id.");
    }
    catalogById.set(record.id, record);
  }

  const manifestById = manifestItems as Record<string, unknown>;
  const itemDocumentIds = new Set<string>();
  for (const artifact of nonChecksum) {
    const match = artifact.path.match(
      new RegExp(
        `^r/v1/releases/${bundle.uiVersion.replaceAll(".", "\\.")}/items/([a-z0-9-]+)\\.json$`,
        "u",
      ),
    );
    if (match === null) continue;
    const id = match[1]!;
    const itemDocument = parsed.get(artifact.path)!;
    if (itemDocument.itemId !== id || itemDocument.registryId !== bundle.registryId) {
      fail(`item artifact ${artifact.path} does not match its path or registry identity.`);
    }
    if (!Array.isArray(itemDocument.files))
      fail(`item artifact ${artifact.path} has no file list.`);
    for (const rawFile of itemDocument.files) {
      if (rawFile === null || typeof rawFile !== "object" || Array.isArray(rawFile)) {
        fail(`item artifact ${artifact.path} contains a non-object file.`);
      }
      const file = rawFile as Record<string, unknown>;
      if (typeof file.content !== "string" || file.sourceUrl !== undefined) {
        fail(`item artifact ${artifact.path} contains content the offline builder cannot verify.`);
      }
      if (
        file.bytes !== Buffer.byteLength(file.content, "utf8") ||
        file.digest !== sha256(file.content) ||
        file.executable !== false
      ) {
        fail(`item artifact ${artifact.path} contains unverified file bytes or mode.`);
      }
    }
    const manifestRow = manifestById[id];
    const catalogRow = catalogById.get(id);
    if (
      manifestRow === null ||
      typeof manifestRow !== "object" ||
      Array.isArray(manifestRow) ||
      catalogRow === undefined
    ) {
      fail(`item ${id} is not represented in catalog and release manifest.`);
    }
    const payloadReference = (manifestRow as Record<string, unknown>).payload;
    const links = catalogRow.links;
    if (
      payloadReference === null ||
      typeof payloadReference !== "object" ||
      Array.isArray(payloadReference) ||
      links === null ||
      typeof links !== "object" ||
      Array.isArray(links) ||
      (payloadReference as Record<string, unknown>).artifact !==
        artifactUrl(origin, artifact.path) ||
      (payloadReference as Record<string, unknown>).digest !== artifact.digest ||
      (links as Record<string, unknown>).payload !== artifactUrl(origin, artifact.path)
    ) {
      fail(`item ${id} has inconsistent catalog or manifest payload provenance.`);
    }
    for (const evidenceKind of ["passport", "contract"] as const) {
      const reference = (manifestRow as Record<string, unknown>)[evidenceKind];
      const identity = itemDocument[evidenceKind];
      if (
        reference === null ||
        typeof reference !== "object" ||
        Array.isArray(reference) ||
        identity === null ||
        typeof identity !== "object" ||
        Array.isArray(identity)
      ) {
        fail(`item ${id} has no ${evidenceKind} evidence binding.`);
      }
      const record = reference as Record<string, unknown>;
      const artifactUrlValue = record.artifact;
      const evidenceIdentity = identity as Record<string, unknown>;
      if (typeof artifactUrlValue !== "string") {
        fail(`item ${id} ${evidenceKind} artifact is outside the canonical origin.`);
      }
      const evidenceArtifact = byPath.get(
        internalArtifactPathFromUrl(
          artifactUrlValue,
          origin,
          `item ${id} ${evidenceKind} artifact`,
        ).toLocaleLowerCase("en-US"),
      );
      if (
        evidenceArtifact === undefined ||
        evidenceArtifact.digest !== record.digest ||
        record.id !== evidenceIdentity.id ||
        (links as Record<string, unknown>)[evidenceKind] !== artifactUrlValue
      ) {
        fail(`item ${id} ${evidenceKind} evidence bytes or identity are inconsistent.`);
      }
    }
    const latestPath = `r/v1/items/${id}/latest.json`;
    const latestArtifact = byPath.get(latestPath.toLocaleLowerCase("en-US"));
    const latest = parsed.get(latestPath);
    if (latestArtifact === undefined || latest === undefined) {
      fail(`item ${id} is missing its latest alias.`);
    }
    const latestPayload = latest.payload;
    const latestManifest = latest.releaseManifest;
    if (
      latestPayload === null ||
      typeof latestPayload !== "object" ||
      Array.isArray(latestPayload) ||
      latestManifest === null ||
      typeof latestManifest !== "object" ||
      Array.isArray(latestManifest) ||
      latest.itemId !== id ||
      latest.resolvedVersion !== bundle.uiVersion ||
      (latestPayload as Record<string, unknown>).url !== artifactUrl(origin, artifact.path) ||
      (latestPayload as Record<string, unknown>).digest !== artifact.digest ||
      (latestManifest as Record<string, unknown>).url !==
        artifactUrl(origin, manifestArtifact.path) ||
      (latestManifest as Record<string, unknown>).digest !== manifestArtifact.digest
    ) {
      fail(`item ${id} latest alias is not bound to the immutable payload and manifest.`);
    }
    itemDocumentIds.add(id);
  }
  const expectedIds = [...itemDocumentIds].sort();
  if (
    expectedIds.length === 0 ||
    JSON.stringify([...catalogById.keys()].sort()) !== JSON.stringify(expectedIds) ||
    JSON.stringify(Object.keys(manifestById).sort()) !== JSON.stringify(expectedIds)
  ) {
    fail("catalog, manifest, item payload, and latest-alias item sets disagree.");
  }

  const search = parsed.get("r/v1/search-index.json");
  const expectedSearchItems = catalogItems.map((row) => {
    const item = row as Record<string, unknown>;
    return {
      id: item.id,
      aliases: item.aliases,
      displayName: item.displayName,
      description: item.description,
      kind: item.kind,
      category: item.category,
      tags: item.tags,
      keywords: item.keywords,
      maturity: item.maturity,
    };
  });
  if (
    search === undefined ||
    search.schemaVersion !== 1 ||
    search.protocolVersion !== "mergora-v1" ||
    search.registryId !== bundle.registryId ||
    search.uiVersion !== bundle.uiVersion ||
    search.dependencyGraphDigest !== bundle.dependencyGraphDigest ||
    !Array.isArray(search.items) ||
    canonicalJsonFile(search.items) !== canonicalJsonFile(expectedSearchItems)
  ) {
    fail("search index is missing or disagrees with the exact canonical catalog projection.");
  }

  if (!Array.isArray(manifest.artifacts)) {
    fail("release manifest has no artifact inventory.");
  }
  const manifestPaths = new Set<string>();
  for (const rawReference of manifest.artifacts) {
    if (rawReference === null || typeof rawReference !== "object" || Array.isArray(rawReference)) {
      fail("release manifest contains a non-object artifact reference.");
    }
    const reference = rawReference as Record<string, unknown>;
    if (typeof reference.url !== "string") {
      fail("release manifest artifact URL is outside the canonical origin.");
    }
    const path = internalArtifactPathFromUrl(
      reference.url,
      origin,
      "release manifest artifact URL",
    );
    const artifact = byPath.get(path.toLocaleLowerCase("en-US"));
    if (
      artifact === undefined ||
      artifact.digest !== reference.digest ||
      reference.bytes !== Buffer.byteLength(artifact.content, "utf8") ||
      reference.mediaType !== "application/json" ||
      reference.name !== path ||
      manifestPaths.has(path)
    ) {
      fail(`release manifest artifact ${path} is missing, duplicated, or inconsistent.`);
    }
    manifestPaths.add(path);
  }
  const expectedManifestPaths = nonChecksum
    .filter(
      ({ path }) =>
        /\/releases\/[^/]+\/items\/[^/]+\.json$/u.test(path) ||
        /^r\/v1\/schemas\//u.test(path) ||
        /^r\/v1\/(?:passports|contracts)\//u.test(path) ||
        /\/releases\/[^/]+\/(?:quality|consumers|sbom)\.json$/u.test(path),
    )
    .map(({ path }) => path)
    .sort();
  if (JSON.stringify([...manifestPaths].sort()) !== JSON.stringify(expectedManifestPaths)) {
    fail("release manifest does not exactly inventory payload, schema, evidence, and SBOM bytes.");
  }

  const mirrorPath = `r/v1/releases/${bundle.uiVersion}/mirror-manifest.json`;
  const mirror = parsed.get(mirrorPath);
  const mirrorSources = nonChecksum
    .filter(({ path }) => path !== mirrorPath && !path.endsWith("/release-bundle.json"))
    .sort((left, right) => left.path.localeCompare(right.path, "en-US"));
  const expectedMirrorArtifacts = mirrorSources.map(({ path, digest }) => ({
    path,
    url: artifactUrl(origin, path),
    digest,
  }));
  if (
    mirror === undefined ||
    mirror.artifactKind !== "mergora-release-mirror-manifest" ||
    mirror.registryId !== bundle.registryId ||
    mirror.uiVersion !== bundle.uiVersion ||
    mirror.canonicalOrigin !== origin
  ) {
    fail("mirror manifest identity does not match the canonical release.");
  }
  if (canonicalJsonFile(mirror.artifacts) !== canonicalJsonFile(expectedMirrorArtifacts)) {
    fail("mirror manifest does not exactly inventory the canonical release snapshot.");
  }

  const releaseBundlePath = `r/v1/releases/${bundle.uiVersion}/release-bundle.json`;
  const releaseBundle = parsed.get(releaseBundlePath);
  const bundledSources = nonChecksum
    .filter(({ path }) => path !== releaseBundlePath)
    .sort((left, right) => left.path.localeCompare(right.path, "en-US"));
  if (
    releaseBundle === undefined ||
    releaseBundle.artifactKind !== "mergora-static-release-bundle" ||
    releaseBundle.registryId !== bundle.registryId ||
    releaseBundle.uiVersion !== bundle.uiVersion ||
    canonicalJsonFile(releaseBundle.files) !==
      canonicalJsonFile(
        bundledSources.map(({ path, digest, content }) => ({ path, digest, content })),
      ) ||
    releaseBundle.sha256sums !== checksumContent(bundledSources)
  ) {
    fail("static release bundle does not exactly reproduce the mirrored release bytes.");
  }
}
