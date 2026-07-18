import { describe, expect, it } from "vitest";

import { validateSchemaDocument } from "../../registry/schemas/index.ts";
import {
  buildBlockedReleaseProtocolPlan,
  buildStableReleaseProtocolBundle,
  canonicalJsonFile,
  officialRegistryIdentityDigest,
  releaseArtifactDigest,
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
  return {
    id,
    artifact: `${ORIGIN}/${path}`,
    digest: releaseArtifactDigest(`${id}-reviewed-fixture`),
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
    expect(first.artifacts.map((artifact) => artifact.path)).toEqual([
      "r/v1/catalog.json",
      "r/v1/items/button/latest.json",
      "r/v1/items/dialog/latest.json",
      "r/v1/releases/1.0.0/items/button.json",
      "r/v1/releases/1.0.0/items/dialog.json",
      "r/v1/releases/1.0.0/manifest.json",
      "r/v1/releases/1.0.0/SHA256SUMS",
    ]);
    expect(first.artifacts.filter((artifact) => artifact.mutable).map(({ path }) => path)).toEqual([
      "r/v1/catalog.json",
      "r/v1/items/button/latest.json",
      "r/v1/items/dialog/latest.json",
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
    expect(plan.blockers).toContain("quality-evidence-missing");
    expect(plan.blockers).toContain("catalog-implementation-incomplete");
    expect(JSON.stringify(plan)).not.toMatch(/"(?:state|maturity)":"pass|stable"/u);
    expect(validateSchemaDocument("release-protocol-plan", plan).ok).toBe(true);
  });
});
