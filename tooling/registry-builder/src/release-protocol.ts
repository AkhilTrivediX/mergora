import { createHash } from "node:crypto";

import { canonicalJson, canonicalJsonFile } from "./canonical.ts";

export type ReleaseSha256 = `sha256:${string}`;

export interface ReleaseEvidenceReference {
  readonly id: string;
  readonly artifact: string;
  readonly digest: ReleaseSha256;
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
  readonly items: readonly ReleaseProtocolItemInput[];
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
    Record<"catalog" | "releaseManifest" | "item" | "latestAlias" | "checksums", string>
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
const WINDOWS_RESERVED = /^(?:con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\..*)?$/iu;

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

function assertEvidenceReference(
  reference: ReleaseEvidenceReference,
  context: string,
  origin: string,
): void {
  assertCatalogId(reference.id, `${context} id`);
  assertImmutableHttpsUrl(reference.artifact, `${context} artifact`, origin);
  assertSha256(reference.digest, `${context} digest`);
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
  return `${origin}/${path}`;
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
      releaseManifest: "r/v1/releases/<ui-version>/manifest.json",
      item: "r/v1/releases/<ui-version>/items/<item-id>.json",
      latestAlias: "r/v1/items/<item-id>/latest.json",
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
  const payloads = new Map<string, Record<string, unknown>>();
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
      payload.links.passport !== item.passport.artifact
    ) {
      fail(`item ${payload.itemId} Passport identity, version, or URL is inconsistent.`);
    }
    if (
      payload.contract.id !== item.contract.id ||
      payload.contract.version !== input.uiVersion ||
      payload.links.contract !== item.contract.artifact
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
    payloads.set(payload.itemId, signedPayload);
  }

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
          passport: item.passport,
          contract: item.contract,
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
    artifacts: orderedItems.map((item) => {
      const artifact = itemArtifacts.get(item.payload.itemId)!;
      return {
        name: `${item.payload.itemId}-payload`,
        url: artifactUrl(input.registry.origin, artifact.path),
        digest: artifact.digest,
        mediaType: "application/json",
        bytes: Buffer.byteLength(artifact.content, "utf8"),
      };
    }),
    qualitySummary: input.releaseGate.qualitySummary,
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

  const jsonArtifacts = [
    catalogArtifact,
    manifestArtifact,
    ...itemArtifacts.values(),
    ...latestArtifacts,
  ].sort((left, right) => left.path.localeCompare(right.path, "en-US"));
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
      artifact.path === "r/v1/catalog.json" || /\/items\/[^/]+\/latest\.json$/u.test(artifact.path);
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
  const origin = (registry as Record<string, unknown>).origin as string;
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
      (payloadReference as Record<string, unknown>).artifact !== `${origin}/${artifact.path}` ||
      (payloadReference as Record<string, unknown>).digest !== artifact.digest ||
      (links as Record<string, unknown>).payload !== `${origin}/${artifact.path}`
    ) {
      fail(`item ${id} has inconsistent catalog or manifest payload provenance.`);
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
      (latestPayload as Record<string, unknown>).url !== `${origin}/${artifact.path}` ||
      (latestPayload as Record<string, unknown>).digest !== artifact.digest ||
      (latestManifest as Record<string, unknown>).url !== `${origin}/${manifestArtifact.path}` ||
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
}
