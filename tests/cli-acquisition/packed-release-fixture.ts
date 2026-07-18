import { mkdirSync, writeFileSync } from "node:fs";
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
  type ReleaseProtocolValidator,
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

export async function seedPackedNativeRelease(
  projectRoot: string,
  version: string,
  source: string,
): Promise<SeededPackedRelease> {
  const itemId = "button";
  const identity = { id: "official", origin: ORIGIN } as const;
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
  const bytesByPath = new Map(
    bundle.artifacts.map((artifact) => [artifact.path, Buffer.from(artifact.content)]),
  );
  const contentTypes = new Map(
    bundle.artifacts.map((artifact) => [
      artifact.path,
      artifact.headers.contentType.split(";", 1)[0]!,
    ]),
  );
  const catalogArtifact = bundle.artifacts.find(({ path }) => path === "r/v1/catalog.json")!;
  const manifestArtifact = bundle.artifacts.find(
    ({ path }) => path === `r/v1/releases/${version}/manifest.json`,
  )!;
  const payloadArtifact = bundle.artifacts.find(
    ({ path }) => path === `r/v1/releases/${version}/items/button.json`,
  )!;
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
  const referencePath = `.mergora/release-${version}.json`;
  mkdirSync(resolve(projectRoot, ".mergora"), { recursive: true });
  writeFileSync(resolve(projectRoot, referencePath), `${canonicalJson(reference)}\n`, "utf8");
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
