import { readFileSync, rmSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import {
  applyAcquiredSemanticUpdate,
  applyAcquiredSourceAdd,
  applyInit,
  planAcquiredSemanticUpdate,
  planAcquiredSourceAdd,
  planInit,
  resolveNativeRegistryRelease,
  searchRegistry,
  viewRegistryItems,
  type AcquisitionRegistryIdentity,
  type AcquisitionTransport,
  type AcquiredNativeRegistryRelease,
} from "../../packages/cli/src/index.ts";
import { canonicalJson, sha256 } from "../../packages/cli/src/contracts.ts";
import type { MergoraConfig } from "../../packages/cli/src/configuration.ts";
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
import { createProjectFixture } from "../cli-fixtures/project-fixture.ts";
import { transportResponse } from "./helpers.ts";

const REGISTRY_ID = "partner";
const ORIGIN = "https://partner.example.test/r/v1";
const temporaryDirectories: string[] = [];

const validate: ReleaseProtocolValidator = (kind, value) => {
  const result = validateSchemaDocument(kind, value);
  return { ok: result.ok, errors: result.errors };
};

function publicUrl(path: string): string {
  return `${ORIGIN}/${path.slice("r/v1/".length)}`;
}

function evidence(id: string, path: string): ReleaseEvidenceReference {
  const content = canonicalJsonFile({ schemaVersion: 1, artifactKind: "test-evidence", id });
  return { id, artifact: publicUrl(path), digest: releaseArtifactDigest(content), content };
}

function compatibility() {
  return {
    cli: ">=1.0.0 <2.0.0",
    node: ">=22.14.0 <25.0.0",
    react: ">=18.3.0 <21.0.0",
    typescript: ">=5.9.0 <8.0.0",
    tailwind: ">=4.0.0 <5.0.0",
    frameworks: { vite: ">=7.0.0 <9.0.0" },
    packageManagers: { pnpm: ">=11.0.0 <12.0.0" },
    browserCapabilities: ["css-custom-properties"],
  };
}

function enrollmentBindingDigest(declaredIdentityDigest: `sha256:${string}`): `sha256:${string}` {
  return sha256(
    canonicalJson({
      protocol: "mergora-v1",
      resolvedOrigin: ORIGIN,
      declaredRegistry: { id: REGISTRY_ID, identityDigest: declaredIdentityDigest },
      licensePolicy: { status: "observed", licenses: ["MIT"] },
      keyPolicy: {
        digest: "sha256",
        immutableReleaseManifests: true,
        signatures: "not-supplied",
      },
    }),
  );
}

interface EnrolledFixture {
  readonly catalog: { readonly bytes: number; readonly digest: `sha256:${string}` };
  readonly manifest: { readonly bytes: number; readonly digest: `sha256:${string}` };
  readonly registry: AcquisitionRegistryIdentity;
  readonly transport: AcquisitionTransport;
  readonly source: string;
  readonly version: string;
}

function enrolledFixture(version: string, source: string): EnrolledFixture {
  const identity = { id: REGISTRY_ID, origin: ORIGIN } as const;
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
    npmPackageInventory: { allowedLicenses: [], entries: [] },
    items: [
      {
        payload: {
          schemaVersion: 1,
          registryId: REGISTRY_ID,
          itemId: "button",
          kind: "component",
          version,
          lastChangedVersion: version,
          maturity: "stable",
          license: "MIT",
          title: "Partner button",
          description: "Enrolled native registry fixture.",
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
          aliases: ["partner-pressable"],
          category: "actions",
          tags: ["interactive"],
          keywords: ["button"],
          provenance: `${ORIGIN}/source/button`,
          quality: { tier: "complete", manualAssistiveTechnologyEvidence: true },
        },
        passport: evidence("button-passport", `r/v1/passports/${version}/button.json`),
        contract: evidence("button-contract", `r/v1/contracts/${version}/button.json`),
      },
    ],
  };
  const bundle = buildStableReleaseProtocolBundle(input, validate);
  const bytesByPath = new Map(
    bundle.artifacts.map((artifact) => [artifact.path, Buffer.from(artifact.content)]),
  );
  const catalogPath = "r/v1/catalog.json";
  const catalogDocument = JSON.parse(bytesByPath.get(catalogPath)!.toString("utf8")) as {
    registry: { trust: string; identityDigest: `sha256:${string}` };
  };
  const declaredIdentityDigest = sha256(
    canonicalJson({ id: REGISTRY_ID, origin: ORIGIN, trust: "enrolled" }),
  );
  catalogDocument.registry.trust = "enrolled";
  catalogDocument.registry.identityDigest = declaredIdentityDigest;
  const catalogBytes = Buffer.from(`${canonicalJson(catalogDocument)}\n`, "utf8");
  bytesByPath.set(catalogPath, catalogBytes);
  const manifestPath = `r/v1/releases/${version}/manifest.json`;
  const manifestBytes = bytesByPath.get(manifestPath)!;
  const transport: AcquisitionTransport = async (request) => {
    const relative = request.url.slice(`${ORIGIN}/`.length);
    const bytes = bytesByPath.get(`r/v1/${relative}`);
    return transportResponse(request, bytes ?? Buffer.alloc(0), {
      ...(bytes === undefined ? { status: 404, contentLength: 0 } : {}),
    });
  };
  return {
    catalog: { bytes: catalogBytes.byteLength, digest: sha256(catalogBytes) },
    manifest: { bytes: manifestBytes.byteLength, digest: sha256(manifestBytes) },
    registry: {
      id: REGISTRY_ID,
      origin: ORIGIN,
      trust: "enrolled",
      identityDigest: declaredIdentityDigest,
      enrollmentDigest: enrollmentBindingDigest(declaredIdentityDigest),
    },
    transport,
    source,
    version,
  };
}

function project(registry: AcquisitionRegistryIdentity) {
  const fixture = createProjectFixture();
  temporaryDirectories.push(fixture.root);
  const initOptions = { projectRoot: fixture.root } as const;
  applyInit(initOptions, planInit(initOptions).planDigest);
  const configPath = resolve(fixture.root, "mergora.json");
  const config = JSON.parse(readFileSync(configPath, "utf8")) as MergoraConfig;
  writeFileSync(
    configPath,
    `${JSON.stringify(
      {
        ...config,
        registries: {
          ...config.registries,
          [registry.id]: {
            protocol: "mergora-v1",
            origin: registry.origin,
            trust: registry.trust,
            identityDigest: registry.enrollmentDigest,
          },
        },
        policy: { ...config.policy, allowExternalRegistries: true },
      },
      null,
      2,
    )}\n`,
  );
  return fixture;
}

async function acquire(
  fixture: EnrolledFixture,
  projectRoot: string,
): Promise<AcquiredNativeRegistryRelease> {
  return resolveNativeRegistryRelease({
    projectRoot,
    registry: fixture.registry,
    release: fixture.version,
    catalog: { path: "catalog.json", ...fixture.catalog },
    manifest: {
      path: `releases/${fixture.version}/manifest.json`,
      ...fixture.manifest,
    },
    itemIds: ["button"],
    transport: fixture.transport,
  });
}

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

describe("enrolled native registry routing", () => {
  it("keeps discovery, source ownership, and Semantic Sync in the enrolled namespace", async () => {
    const firstFixture = enrolledFixture("1.0.0", 'export const button = "partner-first";\n');
    const target = project(firstFixture.registry);
    const first = await acquire(firstFixture, target.root);

    expect(searchRegistry("partner-pressable", { acquiredRelease: first }).items[0]?.id).toBe(
      "button",
    );
    expect(viewRegistryItems(["button"], { acquiredRelease: first })[0]).toMatchObject({
      immutableDigest: first.items[0]?.payloadDigest,
      sourceAvailable: true,
    });

    const addOptions = {
      projectRoot: target.root,
      itemIds: ["button"],
      acquiredRelease: first,
      noInstall: true,
    } as const;
    const addPlan = planAcquiredSourceAdd(addOptions);
    expect(addPlan.items).toEqual([
      expect.objectContaining({ id: "partner:button", direct: true }),
    ]);
    expect(addPlan.registries).toEqual([
      expect.objectContaining({
        id: "partner",
        trust: "enrolled",
        identityDigest: firstFixture.registry.enrollmentDigest,
      }),
    ]);
    applyAcquiredSourceAdd(addOptions, addPlan.planDigest);

    const installed = JSON.parse(
      readFileSync(resolve(target.root, ".mergora/manifest.json"), "utf8"),
    ) as { items: Record<string, { registry: string; resolved: string }> };
    expect(installed.items["partner:button"]).toMatchObject({
      registry: "partner",
      resolved: "1.0.0",
    });
    expect(installed.items["official:button"]).toBeUndefined();

    const nextFixture = enrolledFixture("1.1.0", 'export const button = "partner-next";\n');
    const next = await acquire(nextFixture, target.root);
    const updateOptions = {
      projectRoot: target.root,
      itemIds: ["partner:button"],
      acquiredRelease: next,
      noInstall: true,
    } as const;
    const updatePlan = planAcquiredSemanticUpdate(updateOptions);
    expect(updatePlan.items).toEqual([
      expect.objectContaining({ id: "partner:button", fromVersion: "1.0.0" }),
    ]);
    const updated = await applyAcquiredSemanticUpdate(updateOptions, updatePlan.planDigest);
    expect(updated.status).toBe("committed");
    expect(
      JSON.parse(readFileSync(resolve(target.root, ".mergora/manifest.json"), "utf8")),
    ).toMatchObject({ items: { "partner:button": { registry: "partner", resolved: "1.1.0" } } });
  });

  it("rejects a mismatched enrollment binding before source planning", async () => {
    const fixture = enrolledFixture("1.0.0", 'export const button = "partner";\n');
    const target = project(fixture.registry);
    await expect(
      resolveNativeRegistryRelease({
        projectRoot: target.root,
        registry: {
          ...fixture.registry,
          enrollmentDigest: `sha256:${"f".repeat(64)}`,
        },
        release: fixture.version,
        catalog: { path: "catalog.json", ...fixture.catalog },
        manifest: { path: "releases/1.0.0/manifest.json", ...fixture.manifest },
        itemIds: ["button"],
        transport: fixture.transport,
      }),
    ).rejects.toMatchObject({ code: "REGISTRY_IDENTITY_MISMATCH" });
    expect(readFileSync(resolve(target.root, ".mergora/manifest.json"), "utf8")).not.toContain(
      "partner:button",
    );
  });
});
