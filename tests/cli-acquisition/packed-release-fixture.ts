import { createHash } from "node:crypto";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

import {
  resolveNativeRegistryRelease,
  type AcquisitionRegistryIdentity,
  type AcquisitionTransport,
} from "../../packages/cli/src/index.ts";
import { canonicalJson, sha256 } from "../../packages/cli/src/contracts.ts";
import { OFFICIAL_REGISTRY_ORIGIN } from "../../packages/cli/src/registry-data.ts";
import {
  buildStableReleaseProtocolBundle,
  canonicalJsonFile,
  officialRegistryIdentityDigest,
  releaseArtifactDigest,
  STABLE_RELEASE_SCHEMA_PATHS,
  type ReleaseEvidenceReference,
  type ReleaseProtocolArtifact,
  type ReleaseProtocolValidator,
  type StableReleaseProtocolBundle,
  type StableReleaseProtocolInput,
} from "../../tooling/registry-builder/src/index.ts";
import { validateSchemaDocument } from "../../registry/schemas/index.ts";
import { transportResponse } from "./helpers.ts";

const ORIGIN = OFFICIAL_REGISTRY_ORIGIN;

function protocolRelativePath(internalPath: string): string {
  if (!internalPath.startsWith("r/v1/")) throw new Error(`Invalid internal path: ${internalPath}`);
  return internalPath.slice("r/v1/".length);
}

function publicRegistryUrl(internalPath: string): string {
  return `${ORIGIN}/${protocolRelativePath(internalPath)}`;
}

const registry: AcquisitionRegistryIdentity = {
  id: "official",
  origin: ORIGIN,
  trust: "official",
  identityDigest: sha256(canonicalJson({ id: "official", origin: ORIGIN, trust: "official" })),
};

const validate: ReleaseProtocolValidator = (kind, value) => {
  const result = validateSchemaDocument(kind, value);
  return { ok: result.ok, errors: result.errors };
};

function evidence(id: string, path: string): ReleaseEvidenceReference {
  const content = canonicalJsonFile({
    schemaVersion: 1,
    artifactKind: "packed-command-routing-evidence",
    id,
  });
  return {
    id,
    artifact: publicRegistryUrl(path),
    digest: releaseArtifactDigest(content),
    content,
  };
}

function compatibility() {
  return {
    cli: ">=1.0.0 <2.0.0",
    node: ">=22.14.0 <25.0.0",
    react: ">=18.3.0 <20.0.0",
    typescript: ">=5.9.0 <8.0.0",
    tailwind: ">=4.0.0 <5.0.0",
    frameworks: { next: ">=15.0.0 <17.0.0", vite: ">=7.0.0 <9.0.0" },
    packageManagers: { npm: ">=10.0.0 <12.0.0", pnpm: ">=10.0.0 <12.0.0" },
    browserCapabilities: ["css-custom-properties"],
  };
}

export interface PackedNativeReleaseReference {
  readonly artifactKind: "mergora-native-release-reference";
  readonly catalog: { readonly bytes: number; readonly digest: `sha256:${string}` };
  readonly manifest: { readonly bytes: number; readonly digest: `sha256:${string}` };
  readonly registryId: "official";
  readonly release: string;
  readonly schemaVersion: 1;
}

export interface SeededPackedRelease {
  readonly referencePath: string;
  readonly reference: PackedNativeReleaseReference;
  readonly manifestDigest: `sha256:${string}`;
  readonly payloadDigest: `sha256:${string}`;
  readonly requestedUrls: readonly string[];
  readonly source: string;
  readonly version: string;
}

export interface PackedNpmPackageFixture {
  readonly package: string;
  readonly bytes: Uint8Array;
  readonly license?: string | undefined;
}

interface BuiltPackedRelease {
  readonly bundle: StableReleaseProtocolBundle;
  readonly catalogArtifact: ReleaseProtocolArtifact;
  readonly input: StableReleaseProtocolInput;
  readonly itemId: "button";
  readonly manifestArtifact: ReleaseProtocolArtifact;
  readonly payloadArtifact: ReleaseProtocolArtifact;
  readonly reference: PackedNativeReleaseReference;
}

function buildPackedRelease(
  version: string,
  source: string,
  npmPackageFixture?: PackedNpmPackageFixture,
): BuiltPackedRelease {
  const itemId = "button";
  const identity = { id: "official", origin: ORIGIN } as const;
  const npmPackageName = npmPackageFixture?.package ?? "mergora-ui";
  const npmArtifactFixture = Buffer.from(
    npmPackageFixture?.bytes ?? `synthetic packed fixture for mergora-ui@${version}\n`,
  );
  const npmPackageUnscopedName = npmPackageName.includes("/")
    ? npmPackageName.split("/")[1]!
    : npmPackageName;
  const input: StableReleaseProtocolInput = {
    registry: { ...identity, identityDigest: officialRegistryIdentityDigest(identity) },
    uiVersion: version,
    releaseCommit: "a".repeat(40),
    supportedHistorical: version === "1.0.0" ? [] : ["1.0.0"],
    releaseGate: {
      state: "pass",
      qualitySummary: evidence("quality", `r/v1/releases/${version}/quality.json`),
    },
    packedConsumers: {
      state: "pass",
      evidence: evidence("consumers", `r/v1/releases/${version}/consumers.json`),
    },
    schemas: STABLE_RELEASE_SCHEMA_PATHS.map((path) =>
      evidence(path.slice("r/v1/schemas/".length, -".schema.json".length), path),
    ),
    sbom: evidence("sbom", `r/v1/releases/${version}/sbom.json`),
    npmPackageInventory: {
      allowedLicenses: ["MIT"],
      entries: [
        {
          package: npmPackageName,
          version,
          url: `https://registry.npmjs.org/${npmPackageName}/-/${npmPackageUnscopedName}-${version}.tgz`,
          bytes: npmArtifactFixture.byteLength,
          digest: releaseArtifactDigest(npmArtifactFixture),
          integrity: `sha512-${createHash("sha512").update(npmArtifactFixture).digest("base64")}`,
          license: npmPackageFixture?.license ?? "MIT",
          disposition: "include",
        },
      ],
    },
    items: [
      {
        payload: {
          schemaVersion: 1,
          registryId: "official",
          itemId,
          kind: "component",
          version,
          lastChangedVersion: version,
          maturity: "stable",
          license: "MIT",
          title: "Button",
          description: "Verified packed command routing fixture.",
          links: {
            docs: `${ORIGIN}/docs/button`,
            source: `${ORIGIN}/source/button`,
            changelog: `${ORIGIN}/changelog/button`,
            passport: `${ORIGIN}/passports/${version}/button.json`,
            contract: `${ORIGIN}/contracts/${version}/button.json`,
          },
          compatibility: compatibility(),
          files: [
            {
              logicalPath: "ui/button/button.tsx",
              targetRole: "component",
              mediaType: "text/typescript-jsx",
              bytes: Buffer.byteLength(source),
              content: source,
              digest: releaseArtifactDigest(source),
              executable: false,
              transformPipeline: [{ adapter: "none", version }],
            },
          ],
          registryDependencies: [],
          dependencies: { runtime: {}, development: {} },
          structuredPatches: [],
          migrations: [],
          contract: { id: "button-contract", version },
          passport: { id: "button-passport", version },
          examples: ["examples/button-basic.tsx"],
          importPaths: ["mergora-ui/button"],
        },
        catalog: {
          aliases: ["pressable"],
          category: "actions",
          tags: ["interactive"],
          keywords: ["button", "pressable"],
          provenance: `${ORIGIN}/source/button`,
          quality: { tier: "complete", manualAssistiveTechnologyEvidence: true },
        },
        passport: evidence("button-passport", `r/v1/passports/${version}/button.json`),
        contract: evidence("button-contract", `r/v1/contracts/${version}/button.json`),
      },
    ],
  };
  const bundle = buildStableReleaseProtocolBundle(input, validate);
  if (bundle.artifacts.some(({ content }) => content.includes(`${ORIGIN}/r/v1/`))) {
    throw new Error("Packed native release contains a doubled public protocol prefix.");
  }
  const catalogArtifact = bundle.artifacts.find(({ path }) => path === "r/v1/catalog.json")!;
  const manifestArtifact = bundle.artifacts.find(
    ({ path }) => path === `r/v1/releases/${version}/manifest.json`,
  )!;
  const payloadArtifact = bundle.artifacts.find(
    ({ path }) => path === `r/v1/releases/${version}/items/button.json`,
  )!;
  const reference: PackedNativeReleaseReference = {
    artifactKind: "mergora-native-release-reference",
    catalog: {
      bytes: Buffer.byteLength(catalogArtifact.content),
      digest: catalogArtifact.digest,
    },
    manifest: {
      bytes: Buffer.byteLength(manifestArtifact.content),
      digest: manifestArtifact.digest,
    },
    registryId: "official",
    release: version,
    schemaVersion: 1,
  };
  return {
    bundle,
    catalogArtifact,
    input,
    itemId,
    manifestArtifact,
    payloadArtifact,
    reference,
  };
}

function writeReference(
  projectRoot: string,
  version: string,
  reference: PackedNativeReleaseReference,
): string {
  const referencePath = `.mergora/release-${version}.json`;
  mkdirSync(resolve(projectRoot, ".mergora"), { recursive: true });
  writeFileSync(resolve(projectRoot, referencePath), `${canonicalJson(reference)}\n`, "utf8");
  return referencePath;
}

function writeVerifiedCacheArtifact(projectRoot: string, artifact: ReleaseProtocolArtifact): void {
  const key = artifact.digest.slice("sha256:".length);
  const directory = resolve(projectRoot, ".mergora/cache/entries", key);
  const bytes = Buffer.from(artifact.content);
  mkdirSync(directory, { recursive: true });
  writeFileSync(resolve(directory, "artifact"), bytes);
  writeFileSync(
    resolve(directory, "cache-entry.json"),
    `${canonicalJson({
      schemaVersion: 1,
      artifactKind: "mergora-verified-cache-entry",
      key,
      artifact: "artifact",
      digest: artifact.digest,
      bytes: bytes.byteLength,
    })}\n`,
    "utf8",
  );
}

/** Seeds every immutable release artifact in verified cache, but creates no vendor bundle. */
export function seedPackedCompleteNativeReleaseCache(
  projectRoot: string,
  version: string,
  source: string,
  npmPackageFixture?: PackedNpmPackageFixture,
): SeededPackedRelease {
  const built = buildPackedRelease(version, source, npmPackageFixture);
  for (const artifact of built.bundle.artifacts) {
    writeVerifiedCacheArtifact(projectRoot, artifact);
  }
  const referencePath = writeReference(projectRoot, version, built.reference);
  return {
    referencePath,
    reference: built.reference,
    manifestDigest: built.manifestArtifact.digest,
    payloadDigest: built.payloadArtifact.digest,
    requestedUrls: [],
    source,
    version,
  };
}

export async function seedPackedNativeRelease(
  projectRoot: string,
  version: string,
  source: string,
  npmPackageFixture?: PackedNpmPackageFixture,
): Promise<SeededPackedRelease> {
  const built = buildPackedRelease(version, source, npmPackageFixture);
  const { bundle, catalogArtifact, itemId, manifestArtifact, payloadArtifact, reference } = built;
  const bytesByPath = new Map(
    bundle.artifacts.map((artifact) => [artifact.path, Buffer.from(artifact.content)]),
  );
  const contentTypes = new Map(
    bundle.artifacts.map((artifact) => [
      artifact.path,
      artifact.headers.contentType.split(";", 1)[0]!,
    ]),
  );
  const requestedUrls: string[] = [];
  const transport: AcquisitionTransport = async (request) => {
    requestedUrls.push(request.url);
    const protocolRelative = request.url.slice(`${ORIGIN}/`.length);
    const artifactPath = `r/v1/${protocolRelative}`;
    const bytes = bytesByPath.get(artifactPath);
    if (bytes === undefined) {
      return transportResponse(request, Buffer.alloc(0), { status: 404, contentLength: 0 });
    }
    return transportResponse(request, bytes, {
      contentType: contentTypes.get(artifactPath) ?? "application/json",
    });
  };
  await resolveNativeRegistryRelease({
    projectRoot,
    registry,
    release: version,
    catalog: {
      path: "catalog.json",
      digest: catalogArtifact.digest,
      bytes: Buffer.byteLength(catalogArtifact.content),
    },
    manifest: {
      path: `releases/${version}/manifest.json`,
      digest: manifestArtifact.digest,
      bytes: Buffer.byteLength(manifestArtifact.content),
    },
    itemIds: [itemId],
    transport,
  });
  const referencePath = writeReference(projectRoot, version, reference);
  return {
    referencePath,
    reference,
    manifestDigest: manifestArtifact.digest,
    payloadDigest: payloadArtifact.digest,
    requestedUrls,
    source,
    version,
  };
}

function evidencePointer(reference: ReleaseEvidenceReference) {
  return { id: reference.id, artifact: reference.artifact, digest: reference.digest };
}

/** Writes the exact public release tree plus a vendor-only checksum/descriptor, without cache. */
export function seedPackedStableVendorRelease(
  projectRoot: string,
  version: string,
  source: string,
  npmPackageFixture?: PackedNpmPackageFixture,
): SeededPackedRelease {
  const built = buildPackedRelease(version, source, npmPackageFixture);
  const vendorRoot = resolve(projectRoot, ".mergora/vendor/v1");
  const selectedPaths = new Set([
    built.catalogArtifact.path,
    built.manifestArtifact.path,
    built.payloadArtifact.path,
    ...built.input.schemas.map(({ artifact }) => `r/v1/${artifact.slice(`${ORIGIN}/`.length)}`),
    ...built.input.items.map(
      ({ contract }) => `r/v1/${contract.artifact.slice(`${ORIGIN}/`.length)}`,
    ),
    ...built.input.items.map(
      ({ passport }) => `r/v1/${passport.artifact.slice(`${ORIGIN}/`.length)}`,
    ),
  ]);
  const selectedArtifacts = built.bundle.artifacts.filter(({ path }) => selectedPaths.has(path));
  if (selectedArtifacts.length !== selectedPaths.size) {
    throw new Error("Packed Stable vendor closure is missing an immutable artifact.");
  }
  rmSync(vendorRoot, { recursive: true, force: true });
  for (const artifact of selectedArtifacts) {
    const target = resolve(vendorRoot, ...artifact.path.split("/"));
    mkdirSync(resolve(target, ".."), { recursive: true });
    writeFileSync(target, artifact.content, "utf8");
  }
  const checksumContent = selectedArtifacts
    .map(({ path, digest }) => ({ path, digest }))
    .sort((left, right) => left.path.localeCompare(right.path, "en-US"))
    .map(({ path, digest }) => `${digest.slice("sha256:".length)}  ${path}`)
    .join("\n")
    .concat("\n");
  const stableManifest = {
    schemaVersion: 1,
    format: "mergora-vendor-v1",
    registry: {
      id: "official",
      origin: ORIGIN,
      identityDigest: registry.identityDigest,
    },
    release: version,
    selection: {
      mode: "items",
      requested: [built.itemId],
    },
    releaseManifest: {
      id: "release-manifest",
      artifact: publicRegistryUrl(built.manifestArtifact.path),
      digest: built.manifestArtifact.digest,
    },
    items: [
      {
        id: built.itemId,
        artifact: publicRegistryUrl(built.payloadArtifact.path),
        digest: built.payloadArtifact.digest,
      },
    ],
    schemas: built.input.schemas
      .map(evidencePointer)
      .sort((left, right) => left.artifact.localeCompare(right.artifact, "en-US")),
    contracts: built.input.items
      .map(({ contract }) => evidencePointer(contract))
      .sort((left, right) => left.artifact.localeCompare(right.artifact, "en-US")),
    passports: built.input.items
      .map(({ passport }) => evidencePointer(passport))
      .sort((left, right) => left.artifact.localeCompare(right.artifact, "en-US")),
    npmCoverage: "not-requested",
    npmTarballs: [],
    dependencyGraphDigest: built.bundle.dependencyGraphDigest,
    sha256SumsDigest: sha256(checksumContent),
  } as const;
  const validation = validateSchemaDocument("vendor-manifest", stableManifest);
  if (!validation.ok) {
    throw new Error(`Stable vendor fixture is invalid: ${JSON.stringify(validation.errors)}`);
  }
  mkdirSync(vendorRoot, { recursive: true });
  writeFileSync(resolve(vendorRoot, "SHA256SUMS"), checksumContent, "utf8");
  writeFileSync(resolve(vendorRoot, "vendor-manifest.json"), canonicalJson(stableManifest), "utf8");
  const referencePath = writeReference(projectRoot, version, built.reference);
  return {
    referencePath,
    reference: built.reference,
    manifestDigest: built.manifestArtifact.digest,
    payloadDigest: built.payloadArtifact.digest,
    requestedUrls: [],
    source,
    version,
  };
}
