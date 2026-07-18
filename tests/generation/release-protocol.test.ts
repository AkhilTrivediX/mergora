import { describe, expect, it } from "vitest";

import { validateSchemaDocument } from "../../registry/schemas/index.ts";
import {
  buildBlockedReleaseProtocolPlan,
  buildStableReleaseProtocolBundle,
  canonicalJsonFile,
  officialRegistryIdentityDigest,
  releaseArtifactDigest,
  STABLE_RELEASE_SCHEMA_PATHS,
  verifyStableReleaseProtocolBundle,
  type ReleaseEvidenceReference,
  type ReleaseItemPayloadInput,
  type ReleaseProtocolItemInput,
  type ReleaseProtocolValidator,
  type StableReleaseProtocolBundle,
  type StableReleaseProtocolInput,
} from "../../tooling/registry-builder/src/index.ts";

const ORIGIN = "https://registry.example.test";
const VERSION = "1.0.0";

const validate: ReleaseProtocolValidator = (kind, value) => {
  const result = validateSchemaDocument(kind, value);
  return { ok: result.ok, errors: result.errors };
};

function evidence(id: string, path: string): ReleaseEvidenceReference {
  const content = canonicalJsonFile({
    schemaVersion: 1,
    artifactKind: "synthetic-release-evidence-fixture",
    id,
  });
  return {
    id,
    artifact: `${ORIGIN}/${path}`,
    digest: releaseArtifactDigest(content),
    content,
  };
}

function payload(id: string, dependencies: readonly string[] = []): ReleaseItemPayloadInput {
  const content = `export const ${id.replaceAll("-", "_")} = ${JSON.stringify(id)};\n`;
  return {
    schemaVersion: 1,
    registryId: "mergora",
    itemId: id,
    kind: "component",
    version: VERSION,
    lastChangedVersion: VERSION,
    maturity: "stable",
    license: "MIT",
    title: id === "button" ? "Button" : "Dialog",
    description: `Synthetic ${id} release-protocol fixture; it is not product evidence.`,
    links: {
      docs: `${ORIGIN}/docs/${id}`,
      source: `${ORIGIN}/source/${id}`,
      changelog: `${ORIGIN}/changelog/${id}`,
      passport: `${ORIGIN}/r/v1/passports/${VERSION}/${id}.json`,
      contract: `${ORIGIN}/r/v1/contracts/${VERSION}/${id}.json`,
    },
    compatibility: {
      cli: ">=1.0.0 <2.0.0",
      node: ">=22.14.0 <25.0.0",
      react: ">=18.3.0 <20.0.0",
      typescript: ">=5.9.0 <8.0.0",
      tailwind: ">=4.0.0 <5.0.0",
      frameworks: { next: ">=15.0.0 <17.0.0", vite: ">=7.0.0 <9.0.0" },
      packageManagers: { npm: ">=10.0.0 <12.0.0", pnpm: ">=10.0.0 <12.0.0" },
      browserCapabilities: ["css-custom-properties"],
    },
    files: [
      {
        logicalPath: `ui/${id}.tsx`,
        targetRole: "component",
        mediaType: "text/typescript-jsx",
        bytes: Buffer.byteLength(content, "utf8"),
        content,
        digest: releaseArtifactDigest(content),
        executable: false,
        transformPipeline: [{ adapter: "none", version: VERSION }],
      },
    ],
    registryDependencies: dependencies.map((dependency) => `mergora:${dependency}`),
    dependencies: { runtime: { react: "^19.0.0" }, development: {} },
    structuredPatches: [],
    migrations: [],
    contract: { id: `${id}-contract`, version: VERSION },
    passport: { id: `${id}-passport`, version: VERSION },
    examples: [`examples/${id}-basic.tsx`],
    importPaths: [`mergora-ui/${id}`],
  };
}

function item(
  id: string,
  dependencies: readonly string[] = [],
  aliases: readonly string[] = [],
): ReleaseProtocolItemInput {
  return {
    payload: payload(id, dependencies),
    catalog: {
      aliases,
      category: "actions",
      tags: ["interactive"],
      keywords: [id, "fixture"],
      provenance: `${ORIGIN}/source/${id}`,
      quality: { tier: "complete", manualAssistiveTechnologyEvidence: true },
    },
    passport: evidence(`${id}-passport`, `r/v1/passports/${VERSION}/${id}.json`),
    contract: evidence(`${id}-contract`, `r/v1/contracts/${VERSION}/${id}.json`),
  };
}

function releaseInput(
  items: readonly ReleaseProtocolItemInput[] = [
    item("dialog", ["button"]),
    item("button", [], ["pressable"]),
  ],
): StableReleaseProtocolInput {
  const registry = { id: "mergora", origin: ORIGIN } as const;
  return {
    registry: { ...registry, identityDigest: officialRegistryIdentityDigest(registry) },
    uiVersion: VERSION,
    releaseCommit: "a".repeat(40),
    supportedHistorical: ["0.9.0", "0.8.0"],
    releaseGate: {
      state: "pass",
      qualitySummary: evidence("release-quality", `r/v1/releases/${VERSION}/quality.json`),
    },
    packedConsumers: {
      state: "pass",
      evidence: evidence("packed-consumers", `r/v1/releases/${VERSION}/consumers.json`),
    },
    schemas: STABLE_RELEASE_SCHEMA_PATHS.map((path) =>
      evidence(path.slice("r/v1/schemas/".length, -".schema.json".length), path),
    ),
    sbom: evidence("release-sbom", `r/v1/releases/${VERSION}/sbom.json`),
    items,
  };
}

describe("native registry release protocol v1", () => {
  it("builds byte-identical catalog, immutable items, manifest, latest aliases, and checksums", () => {
    const first = buildStableReleaseProtocolBundle(releaseInput(), validate);
    const second = buildStableReleaseProtocolBundle(
      releaseInput([item("button", [], ["pressable"]), item("dialog", ["button"])]),
      validate,
    );

    expect(second).toEqual(first);
    expect(first.artifacts.map((artifact) => artifact.path)).toEqual(
      expect.arrayContaining([
        "r/v1/catalog.json",
        "r/v1/search-index.json",
        "r/v1/schemas/catalog-v1.schema.json",
        "r/v1/contracts/1.0.0/button.json",
        "r/v1/passports/1.0.0/button.json",
        "r/v1/items/button/latest.json",
        "r/v1/releases/1.0.0/items/button.json",
        "r/v1/releases/1.0.0/manifest.json",
        "r/v1/releases/1.0.0/mirror-manifest.json",
        "r/v1/releases/1.0.0/release-bundle.json",
        "r/v1/releases/1.0.0/sbom.json",
        "r/v1/releases/1.0.0/SHA256SUMS",
      ]),
    );
    expect(first.artifacts.filter((artifact) => artifact.mutable).map(({ path }) => path)).toEqual([
      "r/v1/catalog.json",
      "r/v1/items/button/latest.json",
      "r/v1/items/dialog/latest.json",
      "r/v1/search-index.json",
    ]);
    expect(
      first.artifacts
        .filter((artifact) => artifact.mutable)
        .every(
          (artifact) => artifact.headers.cacheControl === "public, max-age=60, must-revalidate",
        ),
    ).toBe(true);
    expect(
      first.artifacts
        .filter((artifact) => !artifact.mutable)
        .every(
          (artifact) => artifact.headers.cacheControl === "public, max-age=31536000, immutable",
        ),
    ).toBe(true);
    expect(
      first.artifacts.every(
        (artifact) =>
          artifact.headers.accessControlAllowOrigin === "*" &&
          artifact.headers.xContentTypeOptions === "nosniff" &&
          artifact.headers.etag.includes(artifact.digest.slice("sha256:".length)),
      ),
    ).toBe(true);

    const sums = first.artifacts.find((artifact) => artifact.path.endsWith("SHA256SUMS"))!;
    expect(sums.content.trim().split("\n")).toHaveLength(first.artifacts.length - 1);
    expect(sums.content).not.toContain("SHA256SUMS");
    expect(() => verifyStableReleaseProtocolBundle(first, validate)).not.toThrow();
  });

  it("binds every cross-document digest and exact release reference", () => {
    const bundle = buildStableReleaseProtocolBundle(releaseInput(), validate);
    const json = new Map(
      bundle.artifacts
        .filter((artifact) => artifact.path.endsWith(".json"))
        .map((artifact) => [
          artifact.path,
          JSON.parse(artifact.content) as Record<string, unknown>,
        ]),
    );
    const manifest = json.get("r/v1/releases/1.0.0/manifest.json") as {
      dependencyGraphDigest: string;
      items: Record<string, { payload: { artifact: string; digest: string } }>;
      artifacts: { name: string; url: string; digest: string; bytes: number }[];
    };
    const catalog = json.get("r/v1/catalog.json") as {
      dependencyGraphDigest: string;
      items: { id: string; links: { payload: string }; registryDependencies: string[] }[];
    };
    const buttonArtifact = bundle.artifacts.find(
      ({ path }) => path === "r/v1/releases/1.0.0/items/button.json",
    )!;
    const latest = json.get("r/v1/items/button/latest.json") as {
      payload: { url: string; digest: string };
      releaseManifest: { url: string; digest: string };
    };
    const manifestArtifact = bundle.artifacts.find(
      ({ path }) => path === "r/v1/releases/1.0.0/manifest.json",
    )!;

    expect(manifest.dependencyGraphDigest).toBe(bundle.dependencyGraphDigest);
    expect(catalog.dependencyGraphDigest).toBe(bundle.dependencyGraphDigest);
    expect(manifest.items.button?.payload.digest).toBe(buttonArtifact.digest);
    expect(latest.payload.digest).toBe(buttonArtifact.digest);
    expect(latest.releaseManifest.digest).toBe(manifestArtifact.digest);
    expect(catalog.items.find(({ id }) => id === "dialog")?.registryDependencies).toEqual([
      "mergora:button",
    ]);
    expect(manifest.artifacts.map(({ name }) => name)).toEqual(
      [
        "r/v1/contracts/1.0.0/button.json",
        "r/v1/contracts/1.0.0/dialog.json",
        "r/v1/passports/1.0.0/button.json",
        "r/v1/passports/1.0.0/dialog.json",
        "r/v1/releases/1.0.0/consumers.json",
        "r/v1/releases/1.0.0/items/button.json",
        "r/v1/releases/1.0.0/items/dialog.json",
        "r/v1/releases/1.0.0/quality.json",
        "r/v1/releases/1.0.0/sbom.json",
        ...STABLE_RELEASE_SCHEMA_PATHS,
      ].sort((left, right) => left.localeCompare(right, "en-US")),
    );
    for (const reference of manifest.artifacts) {
      const artifact = bundle.artifacts.find(({ path }) => path === reference.name)!;
      expect(reference).toMatchObject({
        url: `${ORIGIN}/${reference.name}`,
        digest: artifact.digest,
        bytes: Buffer.byteLength(artifact.content, "utf8"),
      });
    }
  });

  it("fails closed on unverified bytes, identities, evidence, aliases, and graphs", () => {
    const badDigest = item("button");
    const badFile = badDigest.payload.files[0]!;
    expect(() =>
      buildStableReleaseProtocolBundle(
        releaseInput([
          {
            ...badDigest,
            payload: {
              ...badDigest.payload,
              files: [{ ...badFile, digest: releaseArtifactDigest("different bytes") }],
            },
          },
        ]),
        validate,
      ),
    ).toThrow(/digest does not match/u);

    const badIdentity = releaseInput([item("button")]);
    expect(() =>
      buildStableReleaseProtocolBundle(
        {
          ...badIdentity,
          registry: { ...badIdentity.registry, identityDigest: releaseArtifactDigest("wrong") },
        },
        validate,
      ),
    ).toThrow(/identity digest/u);

    const noManualEvidence = item("button");
    expect(() =>
      buildStableReleaseProtocolBundle(
        releaseInput([
          {
            ...noManualEvidence,
            catalog: {
              ...noManualEvidence.catalog,
              quality: { tier: "complete", manualAssistiveTechnologyEvidence: false },
            },
          },
        ]),
        validate,
      ),
    ).toThrow(/manual AT evidence/u);

    expect(() =>
      buildStableReleaseProtocolBundle(
        releaseInput([item("button", [], ["dialog"]), item("dialog")]),
        validate,
      ),
    ).toThrow(/collides/u);
    expect(() =>
      buildStableReleaseProtocolBundle(
        releaseInput([item("button", ["dialog"]), item("dialog", ["button"])]),
        validate,
      ),
    ).toThrow(/cycle/u);
    expect(() =>
      buildStableReleaseProtocolBundle(releaseInput([item("dialog", ["missing"])]), validate),
    ).toThrow(/missing release item/u);

    const futureItem = item("button");
    expect(() =>
      buildStableReleaseProtocolBundle(
        releaseInput([
          {
            ...futureItem,
            payload: { ...futureItem.payload, lastChangedVersion: "2.0.0" },
          },
        ]),
        validate,
      ),
    ).toThrow(/last-changed version cannot be newer/u);

    const mismatchedEvidence = releaseInput([item("button")]);
    expect(() =>
      buildStableReleaseProtocolBundle(
        {
          ...mismatchedEvidence,
          sbom: { ...mismatchedEvidence.sbom, content: canonicalJsonFile({ tampered: true }) },
        },
        validate,
      ),
    ).toThrow(/content must be canonical release bytes matching its digest/u);

    const missingSchema = releaseInput([item("button")]);
    expect(() =>
      buildStableReleaseProtocolBundle(
        { ...missingSchema, schemas: missingSchema.schemas.slice(1) },
        validate,
      ),
    ).toThrow(/missing required public schema/u);
  });

  it("rejects coherently rehashed mirror and static-bundle omissions", () => {
    const rewriteJsonArtifact = (
      bundle: StableReleaseProtocolBundle,
      path: string,
      transform: (document: Record<string, unknown>) => Record<string, unknown>,
    ): StableReleaseProtocolBundle => {
      const checksumPath = `r/v1/releases/${VERSION}/SHA256SUMS`;
      const rewritten = bundle.artifacts
        .filter(({ path: artifactPath }) => artifactPath !== checksumPath)
        .map((artifact) => {
          if (artifact.path !== path) return artifact;
          const content = canonicalJsonFile(
            transform(JSON.parse(artifact.content) as Record<string, unknown>),
          );
          const digest = releaseArtifactDigest(content);
          return {
            ...artifact,
            content,
            digest,
            headers: { ...artifact.headers, etag: `"${digest.slice("sha256:".length)}"` },
          };
        });
      const originalChecksum = bundle.artifacts.find(
        ({ path: artifactPath }) => artifactPath === checksumPath,
      )!;
      const checksumContent = rewritten
        .toSorted((left, right) => left.path.localeCompare(right.path, "en-US"))
        .map((artifact) => `${artifact.digest.slice("sha256:".length)}  ${artifact.path}`)
        .join("\n")
        .concat("\n");
      const checksumDigest = releaseArtifactDigest(checksumContent);
      return {
        ...bundle,
        artifacts: [
          ...rewritten,
          {
            ...originalChecksum,
            content: checksumContent,
            digest: checksumDigest,
            headers: {
              ...originalChecksum.headers,
              etag: `"${checksumDigest.slice("sha256:".length)}"`,
            },
          },
        ].toSorted((left, right) => left.path.localeCompare(right.path, "en-US")),
      };
    };

    const bundle = buildStableReleaseProtocolBundle(releaseInput(), validate);
    const badSearch = rewriteJsonArtifact(bundle, "r/v1/search-index.json", (document) => ({
      ...document,
      items: (document.items as Record<string, unknown>[]).map((row, index) =>
        index === 0 ? { ...row, displayName: "tampered search label" } : row,
      ),
    }));
    expect(() => verifyStableReleaseProtocolBundle(badSearch, validate)).toThrow(
      /exact canonical catalog projection/u,
    );

    const mirrorPath = `r/v1/releases/${VERSION}/mirror-manifest.json`;
    const badMirror = rewriteJsonArtifact(bundle, mirrorPath, (document) => ({
      ...document,
      artifacts: (document.artifacts as unknown[]).slice(1),
    }));
    expect(() => verifyStableReleaseProtocolBundle(badMirror, validate)).toThrow(
      /mirror manifest does not exactly inventory/u,
    );

    const releaseBundlePath = `r/v1/releases/${VERSION}/release-bundle.json`;
    const badReleaseBundle = rewriteJsonArtifact(bundle, releaseBundlePath, (document) => ({
      ...document,
      files: (document.files as unknown[]).slice(1),
    }));
    expect(() => verifyStableReleaseProtocolBundle(badReleaseBundle, validate)).toThrow(
      /static release bundle does not exactly reproduce/u,
    );
  });

  it("detects post-generation artifact and checksum tampering", () => {
    const bundle = buildStableReleaseProtocolBundle(releaseInput(), validate);
    const targetIndex = bundle.artifacts.findIndex((artifact) =>
      artifact.path.endsWith("items/button.json"),
    );
    const target = bundle.artifacts[targetIndex]!;
    const tampered = {
      ...bundle,
      artifacts: bundle.artifacts.map((artifact, index) =>
        index === targetIndex
          ? { ...target, content: target.content.replace("Button", "BUTTON") }
          : artifact,
      ),
    } satisfies StableReleaseProtocolBundle;
    expect(() => verifyStableReleaseProtocolBundle(tampered, validate)).toThrow(
      /digest does not match/u,
    );

    const latestPath = "r/v1/items/button/latest.json";
    const latest = bundle.artifacts.find((artifact) => artifact.path === latestPath)!;
    const latestDocument = JSON.parse(latest.content) as {
      payload: { url: string; digest: string };
    };
    const dialog = bundle.artifacts.find((artifact) =>
      artifact.path.endsWith("items/dialog.json"),
    )!;
    latestDocument.payload = {
      url: `${ORIGIN}/${dialog.path}`,
      digest: dialog.digest,
    };
    const latestContent = canonicalJsonFile(latestDocument);
    const latestDigest = releaseArtifactDigest(latestContent);
    const rewritten = bundle.artifacts
      .filter((artifact) => !artifact.path.endsWith("SHA256SUMS"))
      .map((artifact) =>
        artifact.path === latestPath
          ? {
              ...artifact,
              content: latestContent,
              digest: latestDigest,
              headers: {
                ...artifact.headers,
                etag: `"${latestDigest.slice("sha256:".length)}"`,
              },
            }
          : artifact,
      );
    const sums = bundle.artifacts.find((artifact) => artifact.path.endsWith("SHA256SUMS"))!;
    const sumsContent = rewritten
      .toSorted((left, right) => left.path.localeCompare(right.path, "en-US"))
      .map((artifact) => `${artifact.digest.slice("sha256:".length)}  ${artifact.path}`)
      .join("\n")
      .concat("\n");
    const sumsDigest = releaseArtifactDigest(sumsContent);
    const coherentlyRehashed = {
      ...bundle,
      artifacts: [
        ...rewritten,
        {
          ...sums,
          content: sumsContent,
          digest: sumsDigest,
          headers: { ...sums.headers, etag: `"${sumsDigest.slice("sha256:".length)}"` },
        },
      ].toSorted((left, right) => left.path.localeCompare(right.path, "en-US")),
    } satisfies StableReleaseProtocolBundle;
    expect(() => verifyStableReleaseProtocolBundle(coherentlyRehashed, validate)).toThrow(
      /latest alias is not bound/u,
    );
  });

  it("emits an honest blocked plan while release authority and evidence are absent", () => {
    const plan = buildBlockedReleaseProtocolPlan({
      catalogDefinitions: 178,
      sourceItemIds: ["dialog", "button"],
      schemaContracts: {
        catalog: "https://example.test/r/v1/schemas/catalog-v1.schema.json",
        item: "https://example.test/r/v1/schemas/item-v1.schema.json",
        releaseManifest: "https://example.test/r/v1/schemas/release-manifest-v1.schema.json",
        latestAlias: "https://example.test/r/v1/schemas/latest-alias-v1.schema.json",
      },
    });
    expect(plan).toMatchObject({
      publicationStatus: "blocked-unreleased",
      publishable: false,
      emittedReleaseArtifacts: [],
      inventory: { catalogDefinitions: 178, sourceItems: 2, itemsWithoutSource: 176 },
    });
    expect(plan.inventory.sourceItemIds).toEqual(["button", "dialog"]);
    expect(plan.endpointTemplates).toEqual({
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
    });
    expect(plan.blockers).toContain("quality-evidence-missing");
    expect(plan.blockers).toContain("catalog-implementation-incomplete");
    expect(JSON.stringify(plan)).not.toMatch(/"(?:state|maturity)":"pass|stable"/u);
    expect(validateSchemaDocument("release-protocol-plan", plan).ok).toBe(true);
  });
});
