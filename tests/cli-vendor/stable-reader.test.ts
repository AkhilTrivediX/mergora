import { readFileSync, renameSync, rmSync, symlinkSync, unlinkSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import {
  acquireImmutableArtifact,
  createStableAcquisitionVendorReader,
  discoverStableVendorReleaseReference,
  resolveNativeRegistryRelease,
  type AcquisitionRegistryIdentity,
  type ImmutableArtifactRequest,
} from "../../packages/cli/src/index.ts";
import { canonicalJson, sha256 } from "../../packages/cli/src/contracts.ts";
import { OFFICIAL_REGISTRY_ORIGIN } from "../../packages/cli/src/registry-data.ts";
import { seedPackedStableVendorRelease } from "../cli-acquisition/packed-release-fixture.ts";
import { createProjectFixture } from "../cli-fixtures/project-fixture.ts";

const temporaryDirectories: string[] = [];

const registry: AcquisitionRegistryIdentity = {
  id: "official",
  origin: OFFICIAL_REGISTRY_ORIGIN,
  trust: "official",
  identityDigest: sha256(
    canonicalJson({ id: "official", origin: OFFICIAL_REGISTRY_ORIGIN, trust: "official" }),
  ),
};

function fixture(version = "1.0.0") {
  const project = createProjectFixture();
  temporaryDirectories.push(project.root);
  const seeded = seedPackedStableVendorRelease(
    project.root,
    version,
    'export const button = "stable vendor";\n',
  );
  return { project, seeded };
}

function catalogRequest(
  seeded: ReturnType<typeof seedPackedStableVendorRelease>,
): ImmutableArtifactRequest {
  return {
    registry,
    path: "catalog.json",
    digest: seeded.reference.catalog.digest,
    bytes: seeded.reference.catalog.bytes,
    maxBytes: 4 * 1024 * 1024,
    acceptedMediaTypes: ["application/json"],
    release: seeded.version,
  };
}

function manifestPath(root: string): string {
  return resolve(root, ".mergora/vendor/v1/vendor-manifest.json");
}

function rewriteManifest(root: string, mutate: (value: Record<string, unknown>) => void): void {
  const path = manifestPath(root);
  const value = JSON.parse(readFileSync(path, "utf8")) as Record<string, unknown>;
  mutate(value);
  writeFileSync(path, canonicalJson(value), "utf8");
}

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

describe("Stable acquisition vendor reader", () => {
  it("discovers the exact release reference only after verifying the closed bundle", () => {
    const { project, seeded } = fixture();

    expect(discoverStableVendorReleaseReference({ projectRoot: project.root })).toEqual({
      schemaVersion: 1,
      artifactKind: "mergora-native-release-reference",
      registryId: "official",
      release: seeded.version,
      catalog: seeded.reference.catalog,
      manifest: seeded.reference.manifest,
    });
  });

  it("resolves a complete exact release offline without cache or network", async () => {
    const { project, seeded } = fixture();
    const originalFetch = globalThis.fetch;
    globalThis.fetch = (() => {
      throw new Error("network access attempted");
    }) as typeof fetch;
    try {
      const release = await resolveNativeRegistryRelease({
        projectRoot: project.root,
        registry,
        release: seeded.version,
        catalog: {
          path: "catalog.json",
          digest: seeded.reference.catalog.digest,
          bytes: seeded.reference.catalog.bytes,
        },
        manifest: {
          path: `releases/${seeded.version}/manifest.json`,
          digest: seeded.reference.manifest.digest,
          bytes: seeded.reference.manifest.bytes,
        },
        itemIds: ["button"],
        offline: true,
        vendor: createStableAcquisitionVendorReader({ projectRoot: project.root }),
      });
      expect(release.source).toBe("vendor");
      expect(release.artifactSources).toEqual(["vendor"]);
      expect(release.items[0]).toMatchObject({
        itemId: "button",
        version: "1.0.0",
        acquisitionSource: "vendor",
      });
      expect(release.items[0]!.files[0]!.content).toBe(seeded.source);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it("does not fall through to cache or network after an exact descriptor mismatch", async () => {
    const { project, seeded } = fixture();
    const reader = createStableAcquisitionVendorReader({ projectRoot: project.root });
    let transportCalls = 0;
    await expect(
      acquireImmutableArtifact({
        projectRoot: project.root,
        request: {
          ...catalogRequest(seeded),
          digest: `sha256:${"f".repeat(64)}`,
        },
        vendor: reader,
        transport: async () => {
          transportCalls += 1;
          throw new Error("must not be reached");
        },
      }),
    ).rejects.toMatchObject({ code: "VENDOR_STABLE_REFERENCE_MISMATCH" });
    expect(transportCalls).toBe(0);
  });

  it("rejects traversal and a doubled public protocol root in bundle metadata", () => {
    const traversal = fixture();
    const sumsPath = resolve(traversal.project.root, ".mergora/vendor/v1/SHA256SUMS");
    const unsafe = readFileSync(sumsPath, "utf8").replace(
      / {2}r\/v1\/[^\n]+/u,
      "  r/v1/../outside.json",
    );
    writeFileSync(sumsPath, unsafe, "utf8");
    rewriteManifest(traversal.project.root, (value) => {
      value.sha256SumsDigest = sha256(unsafe);
    });
    expect(() =>
      createStableAcquisitionVendorReader({ projectRoot: traversal.project.root }),
    ).toThrowError(expect.objectContaining({ code: "VENDOR_STABLE_PATH_UNSAFE" }));

    const doubled = fixture();
    rewriteManifest(doubled.project.root, (value) => {
      const reference = value.releaseManifest as Record<string, unknown>;
      reference.artifact = `${OFFICIAL_REGISTRY_ORIGIN}/r/v1/releases/1.0.0/manifest.json`;
    });
    expect(() =>
      createStableAcquisitionVendorReader({ projectRoot: doubled.project.root }),
    ).toThrowError(expect.objectContaining({ code: "VENDOR_STABLE_ORIGIN_INVALID" }));
  });

  it("rejects a directory junction before any artifact outside the bundle is read", () => {
    const { project } = fixture();
    const releases = resolve(project.root, ".mergora/vendor/v1/r/v1/releases");
    const outside = resolve(project.root, "outside-releases");
    renameSync(releases, outside);
    symlinkSync(outside, releases, process.platform === "win32" ? "junction" : "dir");
    try {
      expect(() => createStableAcquisitionVendorReader({ projectRoot: project.root })).toThrowError(
        expect.objectContaining({ code: "VENDOR_STABLE_PATH_UNSAFE" }),
      );
    } finally {
      unlinkSync(releases);
    }
  });

  it("rejects a missing artifact and detects mutation after initial verification", () => {
    const missing = fixture();
    const payload = resolve(
      missing.project.root,
      ".mergora/vendor/v1/r/v1/releases/1.0.0/items/button.json",
    );
    rmSync(payload);
    expect(() =>
      createStableAcquisitionVendorReader({ projectRoot: missing.project.root }),
    ).toThrowError(expect.objectContaining({ code: "VENDOR_STABLE_FILE_SET_INVALID" }));

    const mutated = fixture();
    const reader = createStableAcquisitionVendorReader({ projectRoot: mutated.project.root });
    const catalog = resolve(mutated.project.root, ".mergora/vendor/v1/r/v1/catalog.json");
    writeFileSync(catalog, Buffer.concat([readFileSync(catalog), Buffer.from(" ")]));
    expect(() => reader(catalogRequest(mutated.seeded))).toThrowError(
      expect.objectContaining({ code: "VENDOR_STABLE_DIGEST_MISMATCH" }),
    );
  });

  it("requires complete npm coverage to equal every included release package", () => {
    const { project } = fixture();
    rewriteManifest(project.root, (value) => {
      value.npmCoverage = "complete";
    });
    expect(() => createStableAcquisitionVendorReader({ projectRoot: project.root })).toThrowError(
      expect.objectContaining({ code: "VENDOR_STABLE_NPM_REFERENCE_MISMATCH" }),
    );
  });

  it("requires the exact release schema set", () => {
    const { project } = fixture();
    rewriteManifest(project.root, (value) => {
      value.schemas = (value.schemas as unknown[]).slice(1);
    });
    expect(() => createStableAcquisitionVendorReader({ projectRoot: project.root })).toThrowError(
      expect.objectContaining({ code: "VENDOR_STABLE_REFERENCE_INVALID" }),
    );
  });

  it("rejects a rewritten bundle that removes a transitive release item", () => {
    const { project } = fixture();
    const releasePath = resolve(
      project.root,
      ".mergora/vendor/v1/r/v1/releases/1.0.0/manifest.json",
    );
    const release = JSON.parse(readFileSync(releasePath, "utf8")) as Record<string, unknown>;
    const items = release.items as Record<string, Record<string, unknown>>;
    items.dialog = { ...items.button!, dependencies: [] };
    items.button!.dependencies = ["official:dialog"];
    delete release.manifestDigest;
    release.manifestDigest = sha256(canonicalJson(release));
    const releaseBytes = canonicalJson(release);
    writeFileSync(releasePath, releaseBytes, "utf8");

    const sumsPath = resolve(project.root, ".mergora/vendor/v1/SHA256SUMS");
    const releaseInternalPath = "r/v1/releases/1.0.0/manifest.json";
    const releaseDigest = sha256(releaseBytes);
    const sums = readFileSync(sumsPath, "utf8").replace(
      new RegExp(`^[a-f0-9]{64}  ${releaseInternalPath.replaceAll("/", "\\/")}$`, "mu"),
      `${releaseDigest.slice("sha256:".length)}  ${releaseInternalPath}`,
    );
    writeFileSync(sumsPath, sums, "utf8");
    rewriteManifest(project.root, (value) => {
      (value.releaseManifest as Record<string, unknown>).digest = releaseDigest;
      value.sha256SumsDigest = sha256(sums);
    });

    expect(() => createStableAcquisitionVendorReader({ projectRoot: project.root })).toThrowError(
      expect.objectContaining({ code: "VENDOR_STABLE_SELECTION_INVALID" }),
    );
  });
});
