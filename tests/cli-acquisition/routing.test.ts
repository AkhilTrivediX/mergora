import { existsSync, readFileSync, rmSync } from "node:fs";
import { resolve } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import {
  applyAcquiredSemanticUpdate,
  applyAcquiredSourceAdd,
  applyInit,
  planAcquiredSemanticUpdate,
  planAcquiredSourceAdd,
  resolveNativeRegistryRelease,
  searchRegistry,
  viewRegistryItems,
  type AcquisitionRegistryIdentity,
  type AcquisitionTransport,
  type AcquiredNativeRegistryRelease,
  type ResolveNativeRegistryReleaseOptions,
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
  type ReleaseItemPayloadInput,
  type ReleaseProtocolItemInput,
  type ReleaseProtocolValidator,
  type StableReleaseProtocolBundle,
  type StableReleaseProtocolInput,
} from "../../tooling/registry-builder/src/index.ts";
import { validateSchemaDocument } from "../../registry/schemas/index.ts";
import { createProjectFixture } from "../cli-fixtures/project-fixture.ts";
import { transportResponse } from "./helpers.ts";

const ORIGIN = OFFICIAL_REGISTRY_ORIGIN;
const MIRROR_ORIGIN = "https://mirror.example.test/r/v1";
const temporaryDirectories: string[] = [];

function protocolRelativePath(internalPath: string): string {
  if (!internalPath.startsWith("r/v1/")) throw new Error(`Invalid internal path: ${internalPath}`);
  return internalPath.slice("r/v1/".length);
}

function internalPath(protocolRelative: string): string {
  return `r/v1/${protocolRelative}`;
}

function publicRegistryUrl(internalPathValue: string, origin = ORIGIN): string {
  return `${origin}/${protocolRelativePath(internalPathValue)}`;
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

interface NativeFixture {
  readonly bundle: StableReleaseProtocolBundle;
  readonly bytesByPath: ReadonlyMap<string, Buffer>;
  readonly contentTypes: ReadonlyMap<string, string>;
  readonly options: Omit<ResolveNativeRegistryReleaseOptions, "projectRoot">;
}

function evidence(id: string, path: string): ReleaseEvidenceReference {
  const content = canonicalJsonFile({
    schemaVersion: 1,
    artifactKind: "routing-test-evidence",
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

function payload(
  id: string,
  version: string,
  dependencies: readonly string[],
  content: string,
  sourceUrl: boolean,
  ambiguous = false,
  collision = false,
  unsupportedTransform = false,
): {
  readonly payload: ReleaseItemPayloadInput;
  readonly sourceFiles: ReadonlyMap<string, Buffer>;
} {
  const logicalPath = `ui/${id}/${id}.tsx`;
  const sourcePath = `r/v1/releases/${version}/files/${id}.tsx`;
  const sourceFiles = new Map<string, Buffer>();
  if (sourceUrl) sourceFiles.set(sourcePath, Buffer.from(content));
  const files: ReleaseItemPayloadInput["files"] = [
    {
      logicalPath,
      targetRole: "component",
      mediaType: "text/typescript-jsx",
      bytes: Buffer.byteLength(content),
      ...(sourceUrl ? { sourceUrl: publicRegistryUrl(sourcePath) } : { content }),
      digest: releaseArtifactDigest(content),
      executable: false,
      transformPipeline: [{ adapter: unsupportedTransform ? "alias-rewrite" : "none", version }],
    },
    ...(ambiguous
      ? [
          {
            logicalPath: `hooks/${id}/${id}.tsx`,
            targetRole: collision ? "component" : "hook",
            mediaType: "text/typescript",
            bytes: Buffer.byteLength(content),
            content,
            digest: releaseArtifactDigest(content),
            executable: false as const,
            transformPipeline: [{ adapter: "none", version }],
          },
        ]
      : []),
  ];
  return {
    payload: {
      schemaVersion: 1,
      registryId: "official",
      itemId: id,
      kind: "component",
      version,
      lastChangedVersion: version,
      maturity: "stable",
      license: "MIT",
      title: id === "button" ? "Büttön" : "Dialog",
      description: `Verified ${id} routing fixture.`,
      links: {
        docs: `${ORIGIN}/docs/${id}`,
        source: `${ORIGIN}/source/${id}`,
        changelog: `${ORIGIN}/changelog/${id}`,
        passport: `${ORIGIN}/passports/${version}/${id}.json`,
        contract: `${ORIGIN}/contracts/${version}/${id}.json`,
      },
      compatibility: compatibility(),
      files,
      registryDependencies: dependencies.map((dependency) => `official:${dependency}`),
      dependencies: { runtime: {}, development: {} },
      structuredPatches: [],
      migrations: [],
      contract: { id: `${id}-contract`, version },
      passport: { id: `${id}-passport`, version },
      examples: [`examples/${id}-basic.tsx`],
      importPaths: [`mergora-ui/${id}`],
    },
    sourceFiles,
  };
}

function item(
  id: string,
  version: string,
  dependencies: readonly string[],
  content: string,
  sourceUrl: boolean,
  ambiguous = false,
  collision = false,
  unsupportedTransform = false,
): { readonly item: ReleaseProtocolItemInput; readonly sourceFiles: ReadonlyMap<string, Buffer> } {
  const built = payload(
    id,
    version,
    dependencies,
    content,
    sourceUrl,
    ambiguous,
    collision,
    unsupportedTransform,
  );
  return {
    sourceFiles: built.sourceFiles,
    item: {
      payload: built.payload,
      catalog: {
        aliases: id === "button" ? ["pressable"] : [],
        category: "actions",
        tags: ["interactive"],
        keywords: [id, "fixture"],
        provenance: `${ORIGIN}/source/${id}`,
        quality: { tier: "complete", manualAssistiveTechnologyEvidence: true },
      },
      passport: evidence(`${id}-passport`, `r/v1/passports/${version}/${id}.json`),
      contract: evidence(`${id}-contract`, `r/v1/contracts/${version}/${id}.json`),
    },
  };
}

function nativeFixture(
  version = "1.0.0",
  options: {
    readonly changed?: boolean;
    readonly ambiguous?: boolean;
    readonly collision?: boolean;
    readonly unsupportedTransform?: boolean;
  } = {},
): NativeFixture {
  const button = item(
    "button",
    version,
    [],
    `export const button = ${JSON.stringify(options.changed ? "changed" : "button")};\n`,
    false,
    options.ambiguous,
    options.collision,
    options.unsupportedTransform,
  );
  const dialog = item(
    "dialog",
    version,
    ["button"],
    `export const dialog = ${JSON.stringify(options.changed ? "changed" : "dialog")};\n`,
    false,
  );
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
    items: [dialog.item, button.item],
  };
  const bundle = buildStableReleaseProtocolBundle(input, validate);
  const bytesByPath = new Map<string, Buffer>(
    bundle.artifacts.map((artifact) => [artifact.path, Buffer.from(artifact.content)]),
  );
  for (const [path, bytes] of [...button.sourceFiles, ...dialog.sourceFiles])
    bytesByPath.set(path, bytes);
  const dialogItemPath = `r/v1/releases/${version}/items/dialog.json`;
  const dialogSourcePath = `r/v1/releases/${version}/files/dialog.tsx`;
  const dialogDocument = JSON.parse(bytesByPath.get(dialogItemPath)!.toString("utf8")) as Record<
    string,
    unknown
  >;
  const dialogFiles = dialogDocument.files as Record<string, unknown>[];
  const dialogSource = Buffer.from(String(dialogFiles[0]!.content), "utf8");
  delete dialogFiles[0]!.content;
  dialogFiles[0]!.sourceUrl = publicRegistryUrl(dialogSourcePath);
  const { payloadDigest: ignoredDialogDigest, ...unsignedDialog } = dialogDocument;
  void ignoredDialogDigest;
  dialogDocument.payloadDigest = sha256(canonicalJson(unsignedDialog));
  const dialogItemBytes = Buffer.from(canonicalJsonFile(dialogDocument));
  bytesByPath.set(dialogItemPath, dialogItemBytes);
  bytesByPath.set(dialogSourcePath, dialogSource);

  const manifestPath = `r/v1/releases/${version}/manifest.json`;
  const manifestDocument = JSON.parse(bytesByPath.get(manifestPath)!.toString("utf8")) as Record<
    string,
    unknown
  >;
  const manifestItems = manifestDocument.items as Record<string, { payload: { digest: string } }>;
  const dialogItemDigest = sha256(dialogItemBytes);
  manifestItems.dialog!.payload.digest = dialogItemDigest;
  const manifestArtifacts = manifestDocument.artifacts as {
    url: string;
    digest: string;
    bytes: number;
  }[];
  const dialogArtifact = manifestArtifacts.find(({ url }) => url.endsWith("/items/dialog.json"))!;
  dialogArtifact.digest = dialogItemDigest;
  dialogArtifact.bytes = dialogItemBytes.byteLength;
  const { manifestDigest: ignoredManifestSelfDigest, ...unsignedManifest } = manifestDocument;
  void ignoredManifestSelfDigest;
  manifestDocument.manifestDigest = sha256(canonicalJson(unsignedManifest));
  const manifestBytes = Buffer.from(canonicalJsonFile(manifestDocument));
  bytesByPath.set(manifestPath, manifestBytes);
  const contentTypes = new Map(
    bundle.artifacts.map((artifact) => [
      artifact.path,
      artifact.headers.contentType.split(";", 1)[0]!,
    ]),
  );
  for (const path of [
    ...button.sourceFiles.keys(),
    ...dialog.sourceFiles.keys(),
    dialogSourcePath,
  ]) {
    contentTypes.set(path, "text/typescript-jsx");
  }
  const catalog = bundle.artifacts.find(({ path }) => path === "r/v1/catalog.json")!;
  const manifest = bundle.artifacts.find(({ path }) => path === manifestPath)!;
  return {
    bundle,
    bytesByPath,
    contentTypes,
    options: {
      registry,
      release: version,
      itemIds: ["dialog"],
      catalog: {
        path: protocolRelativePath(catalog.path),
        digest: catalog.digest,
        bytes: Buffer.byteLength(catalog.content),
      },
      manifest: {
        path: protocolRelativePath(manifest.path),
        digest: sha256(manifestBytes),
        bytes: manifestBytes.byteLength,
      },
      writeCache: false,
    },
  };
}

function pathFromUrl(url: string, origin: string = ORIGIN): string {
  return internalPath(url.slice(`${origin}/`.length));
}

function fixtureTransport(
  fixture: NativeFixture,
  calls: string[],
  canonicalAvailable = true,
): AcquisitionTransport {
  return async (request) => {
    calls.push(request.url);
    const canonical = request.url.startsWith(`${ORIGIN}/`);
    if (canonical && !canonicalAvailable) {
      return transportResponse(request, Buffer.alloc(0), {
        status: 503,
        contentLength: 0,
      });
    }
    const path = canonical ? pathFromUrl(request.url) : pathFromUrl(request.url, MIRROR_ORIGIN);
    const bytes = fixture.bytesByPath.get(path);
    if (bytes === undefined) {
      return transportResponse(request, Buffer.alloc(0), { status: 404, contentLength: 0 });
    }
    return transportResponse(request, bytes, {
      contentType: fixture.contentTypes.get(path) ?? "application/json",
    });
  };
}

function project() {
  const fixture = createProjectFixture();
  temporaryDirectories.push(fixture.root);
  applyInit({ projectRoot: fixture.root });
  return fixture;
}

async function acquire(
  fixture: NativeFixture,
  root: string,
  overrides: Partial<ResolveNativeRegistryReleaseOptions> = {},
): Promise<AcquiredNativeRegistryRelease> {
  const calls: string[] = [];
  return resolveNativeRegistryRelease({
    ...fixture.options,
    projectRoot: root,
    transport: fixtureTransport(fixture, calls),
    ...overrides,
  });
}

function mutateItemFixture(
  fixture: NativeFixture,
  itemId: string,
  mutate: (document: Record<string, unknown>) => void,
): NativeFixture {
  const itemPath = `r/v1/releases/${fixture.options.release}/items/${itemId}.json`;
  const document = JSON.parse(fixture.bytesByPath.get(itemPath)!.toString("utf8")) as Record<
    string,
    unknown
  >;
  mutate(document);
  const { payloadDigest: ignoredPayloadDigest, ...unsignedItem } = document;
  void ignoredPayloadDigest;
  document.payloadDigest = sha256(canonicalJson(unsignedItem));
  const itemBytes = Buffer.from(canonicalJsonFile(document));
  const itemDigest = sha256(itemBytes);
  const manifestRequestPath = fixture.options.manifest.path;
  const manifestPath = internalPath(manifestRequestPath);
  const manifest = JSON.parse(fixture.bytesByPath.get(manifestPath)!.toString("utf8")) as Record<
    string,
    unknown
  >;
  const manifestItems = manifest.items as Record<string, { payload: { digest: string } }>;
  manifestItems[itemId]!.payload.digest = itemDigest;
  const artifacts = manifest.artifacts as { url: string; digest: string; bytes: number }[];
  const artifact = artifacts.find(({ url }) => url.endsWith(`/items/${itemId}.json`))!;
  artifact.digest = itemDigest;
  artifact.bytes = itemBytes.byteLength;
  const { manifestDigest: ignoredManifestDigest, ...unsignedManifest } = manifest;
  void ignoredManifestDigest;
  manifest.manifestDigest = sha256(canonicalJson(unsignedManifest));
  const manifestBytes = Buffer.from(canonicalJsonFile(manifest));
  const bytesByPath = new Map(fixture.bytesByPath);
  bytesByPath.set(itemPath, itemBytes);
  bytesByPath.set(manifestPath, manifestBytes);
  return {
    ...fixture,
    bytesByPath,
    options: {
      ...fixture.options,
      manifest: {
        path: manifestRequestPath,
        digest: sha256(manifestBytes),
        bytes: manifestBytes.byteLength,
      },
    },
  };
}

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

describe("native release acquisition routing", () => {
  it("routes exact acquired evidence into search, view, and source-add planning", async () => {
    const target = project();
    const fixture = nativeFixture();
    const calls: string[] = [];
    const callbacks: string[] = [];
    const release = await resolveNativeRegistryRelease({
      ...fixture.options,
      projectRoot: target.root,
      transport: fixtureTransport(fixture, calls),
      validateDocument: (kind, value, context) => {
        callbacks.push(kind);
        (value as Record<string, unknown>).schemaVersion = 999;
        (context.acquisition.request as { digest: string }).digest = sha256("mutated");
      },
    });

    expect(release.source).toBe("network");
    expect(release.resolvedItems).toEqual(["button", "dialog"]);
    expect(release.registry.identityDigest).toBe(registry.identityDigest);
    expect(callbacks).toEqual(["catalog", "release-manifest", "item", "item"]);
    expect(release.catalog[0]?.latestStableVersion).toBe("1.0.0");
    expect(calls).toEqual(
      expect.arrayContaining([
        `${ORIGIN}/catalog.json`,
        `${ORIGIN}/releases/1.0.0/manifest.json`,
        `${ORIGIN}/releases/1.0.0/items/button.json`,
        `${ORIGIN}/releases/1.0.0/items/dialog.json`,
        `${ORIGIN}/releases/1.0.0/files/dialog.tsx`,
      ]),
    );
    expect(calls.every((url) => !url.includes("/r/v1/r/v1/"))).toBe(true);
    expect(release.items.find(({ itemId }) => itemId === "button")?.payloadUrl).toBe(
      `${ORIGIN}/releases/1.0.0/items/button.json`,
    );
    expect(release.catalog.find(({ id }) => id === "button")?.links).toMatchObject({
      passport: `${ORIGIN}/passports/1.0.0/button.json`,
      contract: `${ORIGIN}/contracts/1.0.0/button.json`,
    });

    const search = searchRegistry("pressable", { acquiredRelease: release });
    expect(search.items[0]).toMatchObject({
      id: "button",
      riskClass: null,
      latestStableVersion: "1.0.0",
      qualityTier: "complete",
      installModes: { source: true, package: true },
    });
    const catalogOnlyRelease = await acquire(fixture, target.root, { itemIds: [] });
    expect(
      searchRegistry("button", { acquiredRelease: catalogOnlyRelease }).items[0]?.installModes,
    ).toEqual({ source: true, package: false });
    const viewed = viewRegistryItems(["dialog"], {
      acquiredRelease: release,
      files: true,
      source: "ui/dialog/dialog.tsx",
    })[0]!;
    expect(viewed.immutableDigest).toBe(
      release.items.find(({ itemId }) => itemId === "dialog")!.payloadDigest,
    );
    expect(viewed.compatibility).toEqual(compatibility());
    expect(viewed.requestedSource?.content).toContain("dialog");

    const manifestBefore = readFileSync(resolve(target.root, ".mergora/manifest.json"));
    const plan = planAcquiredSourceAdd({
      projectRoot: target.root,
      itemIds: ["dialog"],
      acquiredRelease: release,
      noInstall: true,
    });
    expect(plan.registries).toEqual([
      expect.objectContaining({
        source: "network",
        identityDigest: registry.identityDigest,
        manifestDigest: release.manifestDigest,
        release: "1.0.0",
      }),
    ]);
    const noEvidenceRelease: AcquiredNativeRegistryRelease = {
      ...release,
      catalog: release.catalog.map((item) => ({
        ...item,
        quality: {
          tier: "not-supplied" as const,
          manualAssistiveTechnologyEvidence: false,
        },
      })),
    };
    expect(
      planAcquiredSourceAdd({
        projectRoot: target.root,
        itemIds: ["dialog"],
        acquiredRelease: noEvidenceRelease,
        noInstall: true,
      }).registries[0]?.evidenceTier,
    ).toBe("not-supplied");
    expect(plan.items).toEqual([
      expect.objectContaining({ id: "official:button", direct: false, toVersion: "1.0.0" }),
      expect.objectContaining({ id: "official:dialog", direct: true, toVersion: "1.0.0" }),
    ]);
    expect(readFileSync(resolve(target.root, ".mergora/manifest.json"))).toEqual(manifestBefore);
    expect(existsSync(resolve(target.root, "src/components/mergora/dialog/dialog.tsx"))).toBe(
      false,
    );
    expect(calls.some((url) => url.endsWith("/files/dialog.tsx"))).toBe(true);
  });

  it("uses vendor before cache offline and never invokes transport", async () => {
    const target = project();
    const fixture = nativeFixture();
    let transports = 0;
    const vendorPaths: string[] = [];
    const release = await resolveNativeRegistryRelease({
      ...fixture.options,
      projectRoot: target.root,
      offline: true,
      vendor: (request) => {
        vendorPaths.push(request.path);
        return fixture.bytesByPath.get(internalPath(request.path)) ?? null;
      },
      transport: async () => {
        transports += 1;
        throw new Error("network forbidden");
      },
    });
    expect(transports).toBe(0);
    expect(vendorPaths).toEqual(
      expect.arrayContaining([
        "catalog.json",
        "releases/1.0.0/manifest.json",
        "releases/1.0.0/items/button.json",
      ]),
    );
    expect(vendorPaths.every((path) => !path.startsWith("r/v1/"))).toBe(true);
    expect(release.source).toBe("vendor");
    expect(
      planAcquiredSourceAdd({
        projectRoot: target.root,
        itemIds: ["dialog"],
        acquiredRelease: release,
        noInstall: true,
      }).registries[0]?.source,
    ).toBe("vendor");
  });

  it("reuses verified cache offline without transport or vendor bytes", async () => {
    const target = project();
    const fixture = nativeFixture();
    await acquire(fixture, target.root, { writeCache: true });
    let transports = 0;
    const release = await resolveNativeRegistryRelease({
      ...fixture.options,
      projectRoot: target.root,
      offline: true,
      vendor: () => null,
      transport: async () => {
        transports += 1;
        throw new Error("network forbidden");
      },
    });
    expect(transports).toBe(0);
    expect(release.source).toBe("verified-cache");
  });

  it("preserves mirror provenance after canonical availability failures", async () => {
    const target = project();
    const fixture = nativeFixture();
    const calls: string[] = [];
    const release = await resolveNativeRegistryRelease({
      ...fixture.options,
      projectRoot: target.root,
      mirrorOrigins: [MIRROR_ORIGIN],
      transport: fixtureTransport(fixture, calls, false),
    });
    expect(release.source).toBe("mirror");
    expect(release.artifactSources).toEqual(["mirror"]);
    expect(calls).toContain(`${MIRROR_ORIGIN}/catalog.json`);
    expect(calls.every((url) => !url.includes("/r/v1/r/v1/"))).toBe(true);
  });

  it("rejects ambiguous source suffixes and preserves exact acquired compatibility", async () => {
    const target = project();
    const fixture = nativeFixture("1.0.0", { ambiguous: true });
    const release = await acquire(fixture, target.root, { itemIds: ["button"] });
    expect(() =>
      viewRegistryItems(["button"], { acquiredRelease: release, source: "button.tsx" }),
    ).toThrow(/ambiguous/u);
    expect(
      viewRegistryItems(["button"], {
        acquiredRelease: release,
        source: "hooks/button/button.tsx",
      })[0]?.compatibility,
    ).toEqual(compatibility());
    const plan = planAcquiredSourceAdd({
      projectRoot: target.root,
      itemIds: ["button"],
      acquiredRelease: release,
      noInstall: true,
    });
    expect(plan.fileOperations.map(({ target }) => target)).toEqual(
      expect.arrayContaining([
        "src/components/mergora/button/button.tsx",
        "src/hooks/mergora/button/button.tsx",
      ]),
    );
  });

  it("refuses acquired target collisions and unsupported transforms before any source write", async () => {
    const target = project();
    const manifestBefore = readFileSync(resolve(target.root, ".mergora/manifest.json"));
    const collisionFixture = nativeFixture("1.0.0", { ambiguous: true, collision: true });
    const collision = await acquire(collisionFixture, target.root, { itemIds: ["button"] });
    expect(() =>
      planAcquiredSourceAdd({
        projectRoot: target.root,
        itemIds: ["button"],
        acquiredRelease: collision,
        noInstall: true,
      }),
    ).toThrow(/maps more than one file/u);

    const transformFixture = nativeFixture("1.0.0", { unsupportedTransform: true });
    const transformed = await acquire(transformFixture, target.root, { itemIds: ["button"] });
    expect(() =>
      planAcquiredSourceAdd({
        projectRoot: target.root,
        itemIds: ["button"],
        acquiredRelease: transformed,
        noInstall: true,
      }),
    ).toThrow(/unsupported binary, role, or transform adapter/u);
    expect(readFileSync(resolve(target.root, ".mergora/manifest.json"))).toEqual(manifestBefore);
    expect(existsSync(resolve(target.root, "src/components/mergora/button/button.tsx"))).toBe(
      false,
    );
  });

  it.each([
    {
      label: "unknown metadata",
      expected: "REGISTRY_DOCUMENT_SCHEMA_INVALID",
      mutate: (document: Record<string, unknown>) => {
        document.surprise = true;
      },
    },
    {
      label: "executable metadata",
      expected: "REGISTRY_EXECUTABLE_METADATA_REJECTED",
      mutate: (document: Record<string, unknown>) => {
        document.commands = ["node untrusted.js"];
      },
    },
    {
      label: "whitespace dependency range",
      expected: "REGISTRY_DOCUMENT_SCHEMA_INVALID",
      mutate: (document: Record<string, unknown>) => {
        const dependencies = document.dependencies as {
          runtime: Record<string, string>;
        };
        dependencies.runtime["unsafe-range"] = "   ";
      },
    },
    {
      label: "Contract version and artifact path mismatch",
      expected: "REGISTRY_ITEM_IDENTITY_INVALID",
      mutate: (document: Record<string, unknown>) => {
        const contract = document.contract as { version: string };
        contract.version = "2.0.0";
      },
    },
    {
      label: "version-looking source URL outside the immutable files subtree",
      expected: "REGISTRY_URL_INVALID",
      mutate: (document: Record<string, unknown>) => {
        const files = document.files as { sourceUrl?: string }[];
        files[0]!.sourceUrl = `${ORIGIN}/archive/1.0.0/files/dialog.tsx`;
      },
      itemId: "dialog",
    },
  ])(
    "rejects coherently rehashed $label before caching or live writes",
    async ({ expected, mutate, itemId = "button" }) => {
      const target = project();
      const manifestBefore = readFileSync(resolve(target.root, ".mergora/manifest.json"));
      const tampered = mutateItemFixture(nativeFixture(), itemId, mutate);
      await expect(acquire(tampered, target.root)).rejects.toMatchObject({ code: expected });
      expect(readFileSync(resolve(target.root, ".mergora/manifest.json"))).toEqual(manifestBefore);
      expect(existsSync(resolve(target.root, "src/components/mergora/button/button.tsx"))).toBe(
        false,
      );
    },
  );

  it("rejects sourceUrl byte tampering and a missing offline dependency closure", async () => {
    const target = project();
    const fixture = nativeFixture();
    const manifestBefore = readFileSync(resolve(target.root, ".mergora/manifest.json"));
    const baseTransport = fixtureTransport(fixture, []);
    await expect(
      resolveNativeRegistryRelease({
        ...fixture.options,
        projectRoot: target.root,
        transport: async (request) =>
          request.url.endsWith("/files/dialog.tsx")
            ? transportResponse(request, Buffer.from("tampered source\n"), {
                contentType: "text/typescript-jsx",
              })
            : baseTransport(request),
      }),
    ).rejects.toMatchObject({ code: "REGISTRY_INTEGRITY_FAILURE" });

    let transports = 0;
    await expect(
      resolveNativeRegistryRelease({
        ...fixture.options,
        projectRoot: target.root,
        offline: true,
        vendor: (request) =>
          request.path.endsWith("/items/button.json")
            ? null
            : (fixture.bytesByPath.get(internalPath(request.path)) ?? null),
        transport: async () => {
          transports += 1;
          throw new Error("offline network leak");
        },
      }),
    ).rejects.toMatchObject({ code: "REGISTRY_EVIDENCE_MISSING" });
    expect(transports).toBe(0);
    expect(readFileSync(resolve(target.root, ".mergora/manifest.json"))).toEqual(manifestBefore);
  });

  it("enforces the aggregate operation byte cap without writing the project", async () => {
    const target = project();
    const fixture = nativeFixture();
    const manifestBefore = readFileSync(resolve(target.root, ".mergora/manifest.json"));
    await expect(acquire(fixture, target.root, { maxOperationBytes: 128 })).rejects.toMatchObject({
      code: "REGISTRY_OPERATION_OVERSIZE",
    });
    expect(readFileSync(resolve(target.root, ".mergora/manifest.json"))).toEqual(manifestBefore);
    expect(existsSync(resolve(target.root, "src/components/mergora/dialog/dialog.tsx"))).toBe(
      false,
    );
  });

  it.each(["passport", "contract"] as const)(
    "rejects a coherently rehashed manifest whose %s reference is missing from the artifact inventory",
    async (evidenceKind) => {
      const target = project();
      const fixture = nativeFixture();
      const manifestBefore = readFileSync(resolve(target.root, ".mergora/manifest.json"));
      const manifestRequestPath = fixture.options.manifest.path;
      const manifestPath = internalPath(manifestRequestPath);
      const manifest = JSON.parse(
        fixture.bytesByPath.get(manifestPath)!.toString("utf8"),
      ) as Record<string, unknown>;
      const manifestItems = manifest.items as Record<
        string,
        Record<"passport" | "contract", { artifact: string }>
      >;
      const omittedUrl = manifestItems.dialog![evidenceKind].artifact;
      manifest.artifacts = (manifest.artifacts as { url: string }[]).filter(
        ({ url }) => url !== omittedUrl,
      );
      const { manifestDigest: ignoredManifestDigest, ...unsignedManifest } = manifest;
      void ignoredManifestDigest;
      manifest.manifestDigest = sha256(canonicalJson(unsignedManifest));
      const manifestBytes = Buffer.from(canonicalJsonFile(manifest));
      const bytesByPath = new Map(fixture.bytesByPath);
      bytesByPath.set(manifestPath, manifestBytes);
      const tampered: NativeFixture = {
        ...fixture,
        bytesByPath,
        options: {
          ...fixture.options,
          manifest: {
            path: manifestRequestPath,
            digest: sha256(manifestBytes),
            bytes: manifestBytes.byteLength,
          },
        },
      };

      await expect(acquire(tampered, target.root)).rejects.toMatchObject({
        code: "REGISTRY_RELEASE_DIGEST_INVALID",
      });
      expect(readFileSync(resolve(target.root, ".mergora/manifest.json"))).toEqual(manifestBefore);
      expect(existsSync(resolve(target.root, "src/components/mergora/dialog/dialog.tsx"))).toBe(
        false,
      );
    },
  );

  it("rejects a coherently rehashed artifact name that disagrees with its public URL", async () => {
    const target = project();
    const fixture = nativeFixture();
    const manifestRequestPath = fixture.options.manifest.path;
    const manifestPath = internalPath(manifestRequestPath);
    const manifest = JSON.parse(fixture.bytesByPath.get(manifestPath)!.toString("utf8")) as Record<
      string,
      unknown
    >;
    const artifacts = manifest.artifacts as { name: string; url: string }[];
    const payload = artifacts.find(({ url }) => url.endsWith("/releases/1.0.0/items/dialog.json"))!;
    payload.name = "r/v1/releases/1.0.0/items/not-dialog.json";
    const { manifestDigest: ignoredManifestDigest, ...unsignedManifest } = manifest;
    void ignoredManifestDigest;
    manifest.manifestDigest = sha256(canonicalJson(unsignedManifest));
    const manifestBytes = Buffer.from(canonicalJsonFile(manifest));
    const bytesByPath = new Map(fixture.bytesByPath);
    bytesByPath.set(manifestPath, manifestBytes);
    const tampered: NativeFixture = {
      ...fixture,
      bytesByPath,
      options: {
        ...fixture.options,
        manifest: {
          path: manifestRequestPath,
          digest: sha256(manifestBytes),
          bytes: manifestBytes.byteLength,
        },
      },
    };

    await expect(acquire(tampered, target.root)).rejects.toMatchObject({
      code: "REGISTRY_RELEASE_IDENTITY_INVALID",
    });
  });

  it("routes acquired immutable payload digests through add and Semantic Sync update", async () => {
    const target = project();
    const firstFixture = nativeFixture("1.0.0");
    const first = await acquire(firstFixture, target.root);
    const addOptions = {
      projectRoot: target.root,
      itemIds: ["dialog"],
      acquiredRelease: first,
      noInstall: true,
    } as const;
    const addPlan = planAcquiredSourceAdd(addOptions);
    const added = applyAcquiredSourceAdd(addOptions, addPlan.planDigest);
    const addTransactionRoot = resolve(
      target.root,
      ".mergora/transactions",
      added.transaction.transactionId!,
    );
    const addRecord = JSON.parse(
      readFileSync(resolve(addTransactionRoot, "transaction.json"), "utf8"),
    ) as {
      registryPayloads: { registry: string; release: string; url: string; digest: string }[];
    };
    const addRecordedPlan = JSON.parse(
      readFileSync(resolve(addTransactionRoot, "plan.json"), "utf8"),
    ) as { registries: { identityDigest: string; manifestDigest: string }[] };
    expect(addRecordedPlan.registries[0]).toEqual(
      expect.objectContaining({
        identityDigest: first.registry.identityDigest,
        manifestDigest: first.manifestDigest,
      }),
    );
    expect(addRecord.registryPayloads).toEqual(
      first.items.map((item) => ({
        registry: "official",
        release: "1.0.0",
        url: item.payloadUrl,
        digest: item.payloadDigest,
      })),
    );

    const secondFixture = nativeFixture("1.1.0", { changed: true });
    const second = await acquire(secondFixture, target.root);
    const updateOptions = {
      projectRoot: target.root,
      acquiredRelease: second,
      noInstall: true,
    } as const;
    const updatePlan = planAcquiredSemanticUpdate(updateOptions);
    expect(updatePlan.registries[0]).toMatchObject({
      manifestDigest: second.manifestDigest,
      source: "network",
      release: "1.1.0",
    });
    const result = await applyAcquiredSemanticUpdate(updateOptions, updatePlan.planDigest);
    expect(result.status).toBe("committed");
    const manifest = JSON.parse(
      readFileSync(resolve(target.root, ".mergora/manifest.json"), "utf8"),
    ) as { items: Record<string, { payload: { digest: string }; resolved: string }> };
    expect(manifest.items["official:dialog"]).toMatchObject({
      resolved: "1.1.0",
      payload: {
        digest: second.items.find(({ itemId }) => itemId === "dialog")!.payloadDigest,
      },
    });
    const updateRecord = JSON.parse(
      readFileSync(
        resolve(
          target.root,
          ".mergora/transactions",
          result.status === "committed" ? result.transaction.transactionId! : "missing",
          "transaction.json",
        ),
        "utf8",
      ),
    ) as { registryPayloads: { digest: string; url: string }[] };
    expect(updateRecord.registryPayloads).toEqual(
      second.items.map((item) => ({
        registry: "official",
        release: "1.1.0",
        url: item.payloadUrl,
        digest: item.payloadDigest,
      })),
    );
  });

  it("rejects coherently rehashed item dependency tampering without changing the live tree", async () => {
    const target = project();
    const fixture = nativeFixture();
    const manifestBefore = readFileSync(resolve(target.root, ".mergora/manifest.json"));
    const itemPath = "r/v1/releases/1.0.0/items/dialog.json";
    const rawItem = JSON.parse(fixture.bytesByPath.get(itemPath)!.toString("utf8")) as Record<
      string,
      unknown
    >;
    rawItem.registryDependencies = [];
    const { payloadDigest: ignoredPayloadDigest, ...unsignedItem } = rawItem;
    void ignoredPayloadDigest;
    rawItem.payloadDigest = sha256(canonicalJson(unsignedItem));
    const itemBytes = Buffer.from(canonicalJsonFile(rawItem));
    const itemDigest = sha256(itemBytes);

    const manifestPath = "r/v1/releases/1.0.0/manifest.json";
    const rawManifest = JSON.parse(
      fixture.bytesByPath.get(manifestPath)!.toString("utf8"),
    ) as Record<string, unknown>;
    const manifestItems = rawManifest.items as Record<
      string,
      { payload: { digest: string }; dependencies: string[] }
    >;
    manifestItems.dialog!.payload.digest = itemDigest;
    const artifacts = rawManifest.artifacts as { url: string; digest: string; bytes: number }[];
    const artifact = artifacts.find(({ url }) => url.endsWith("/items/dialog.json"))!;
    artifact.digest = itemDigest;
    artifact.bytes = itemBytes.byteLength;
    const { manifestDigest: ignoredManifestDigest, ...unsignedManifest } = rawManifest;
    void ignoredManifestDigest;
    rawManifest.manifestDigest = sha256(canonicalJson(unsignedManifest));
    const manifestBytes = Buffer.from(canonicalJsonFile(rawManifest));

    const bytesByPath = new Map(fixture.bytesByPath);
    bytesByPath.set(itemPath, itemBytes);
    bytesByPath.set(manifestPath, manifestBytes);
    const tampered: NativeFixture = {
      ...fixture,
      bytesByPath,
      options: {
        ...fixture.options,
        manifest: {
          path: protocolRelativePath(manifestPath),
          digest: sha256(manifestBytes),
          bytes: manifestBytes.byteLength,
        },
      },
    };
    await expect(acquire(tampered, target.root)).rejects.toMatchObject({
      code: "REGISTRY_DEPENDENCY_GRAPH_INVALID",
    });
    expect(readFileSync(resolve(target.root, ".mergora/manifest.json"))).toEqual(manifestBefore);
    expect(existsSync(resolve(target.root, "src/components/mergora/dialog/dialog.tsx"))).toBe(
      false,
    );
  });
});
