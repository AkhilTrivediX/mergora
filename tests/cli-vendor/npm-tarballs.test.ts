import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { gunzipSync, gzipSync } from "node:zlib";

import { afterEach, describe, expect, it, vi } from "vitest";

import {
  acquireStableVendorSnapshot,
  acquireStableNpmTarballInventory,
  applyStableVendor,
  planStableVendor,
  type StableNpmTarballInventoryDescriptor,
} from "../../packages/cli/src/vendor.ts";
import { resolveNativeRegistryRelease } from "../../packages/cli/src/acquisition-resolver.ts";
import type { AcquisitionRegistryIdentity } from "../../packages/cli/src/acquisition.ts";
import { applyInit, planInit } from "../../packages/cli/src/configuration.ts";
import {
  createStableAcquisitionVendorReader,
  createStableNpmTarballVendorReader,
  stableNpmTarballInternalPath,
  validateStableNpmTarballBytes,
} from "../../packages/cli/src/vendor-reader.ts";
import { canonicalJson, sha256 } from "../../packages/cli/src/contracts.ts";
import { OFFICIAL_REGISTRY_ORIGIN } from "../../packages/cli/src/registry-data.ts";
import {
  seedPackedCompleteNativeReleaseCache,
  seedPackedStableVendorRelease,
} from "../cli-acquisition/packed-release-fixture.ts";
import { createProjectFixture } from "../cli-fixtures/project-fixture.ts";

const temporaryDirectories: string[] = [];

const officialRegistry: AcquisitionRegistryIdentity = {
  id: "official",
  origin: OFFICIAL_REGISTRY_ORIGIN,
  trust: "official",
  identityDigest: sha256(
    canonicalJson({ id: "official", origin: OFFICIAL_REGISTRY_ORIGIN, trust: "official" }),
  ),
};

function tarString(header: Buffer, offset: number, length: number, value: string): void {
  const bytes = Buffer.from(value, "utf8");
  if (bytes.byteLength > length) throw new Error("test tar field is too long");
  bytes.copy(header, offset);
}

function tarOctal(header: Buffer, offset: number, length: number, value: number): void {
  tarString(header, offset, length, `${value.toString(8).padStart(length - 1, "0")}\0`);
}

function tarEntry(path: string, content: Buffer, type = "0"): Buffer {
  const header = Buffer.alloc(512);
  tarString(header, 0, 100, path);
  tarOctal(header, 100, 8, 0o644);
  tarOctal(header, 108, 8, 0);
  tarOctal(header, 116, 8, 0);
  tarOctal(header, 124, 12, content.byteLength);
  tarOctal(header, 136, 12, 0);
  header.fill(32, 148, 156);
  header[156] = type.charCodeAt(0);
  tarString(header, 257, 6, "ustar\0");
  tarString(header, 263, 2, "00");
  let checksum = 0;
  for (const byte of header) checksum += byte;
  tarString(header, 148, 8, `${checksum.toString(8).padStart(6, "0")}\0 `);
  const padding = Buffer.alloc(Math.ceil(content.byteLength / 512) * 512 - content.byteLength);
  return Buffer.concat([header, content, padding]);
}

function paxRecord(key: string, value: string): Buffer {
  let length = Buffer.byteLength(` ${key}=${value}\n`) + 1;
  while (true) {
    const record = `${String(length)} ${key}=${value}\n`;
    const actual = Buffer.byteLength(record);
    if (actual === length) return Buffer.from(record, "utf8");
    length = actual;
  }
}

function npmTarball(
  packageName = "mergora-ui",
  version = "1.0.0",
  license = "MIT",
  extra: Readonly<Record<string, unknown>> = {},
  files: readonly (readonly [string, Buffer])[] = [
    ["package/index.js", Buffer.from("export const stable = true;\n", "utf8")],
  ],
): Buffer {
  const packageJson = Buffer.from(
    `${JSON.stringify({ name: packageName, version, license, ...extra })}\n`,
    "utf8",
  );
  return gzipSync(
    Buffer.concat([
      tarEntry("package/package.json", packageJson),
      ...files.map(([path, content]) => tarEntry(path, content)),
      Buffer.alloc(1024),
    ]),
    { level: 9 },
  );
}

function descriptor(
  bytes: Buffer,
  overrides: Partial<StableNpmTarballInventoryDescriptor> = {},
): StableNpmTarballInventoryDescriptor {
  return {
    package: "mergora-ui",
    version: "1.0.0",
    url: "https://registry.npmjs.org/mergora-ui/-/mergora-ui-1.0.0.tgz",
    digest: sha256(bytes),
    integrity: `sha512-${createHash("sha512").update(bytes).digest("base64")}`,
    license: "MIT",
    bytes: bytes.byteLength,
    ...overrides,
  };
}

function deterministicBinaryBytes(size: number): Buffer {
  const bytes = Buffer.allocUnsafe(size);
  let state = 0x6d2b79f5;
  for (let index = 0; index < bytes.byteLength; index += 1) {
    state ^= state << 13;
    state ^= state >>> 17;
    state ^= state << 5;
    bytes[index] = state & 0xff;
  }
  return bytes;
}

function cachedJson(root: string, digest: string): unknown {
  return JSON.parse(
    readFileSync(
      resolve(root, ".mergora/cache/entries", digest.slice("sha256:".length), "artifact"),
      "utf8",
    ),
  ) as unknown;
}

function extendStableBundle(
  root: string,
  tarball: Buffer,
  exact: StableNpmTarballInventoryDescriptor,
): void {
  const vendorRoot = resolve(root, ".mergora/vendor/v1");
  const internalPath = stableNpmTarballInternalPath(exact.package, exact.version);
  const target = resolve(vendorRoot, ...internalPath.split("/"));
  mkdirSync(resolve(target, ".."), { recursive: true });
  writeFileSync(target, tarball);

  const sumsPath = resolve(vendorRoot, "SHA256SUMS");
  const entries = readFileSync(sumsPath, "utf8")
    .trimEnd()
    .split("\n")
    .concat(`${exact.digest.slice("sha256:".length)}  ${internalPath}`)
    .sort((left, right) => {
      const leftPath = left.slice(left.indexOf("  ") + 2);
      const rightPath = right.slice(right.indexOf("  ") + 2);
      return leftPath.localeCompare(rightPath, "en-US");
    });
  const sums = `${entries.join("\n")}\n`;
  writeFileSync(sumsPath, sums, "utf8");

  const manifestPath = resolve(vendorRoot, "vendor-manifest.json");
  const manifest = JSON.parse(readFileSync(manifestPath, "utf8")) as Record<string, unknown>;
  manifest.npmTarballs = [
    {
      package: exact.package,
      version: exact.version,
      url: exact.url,
      bytes: exact.bytes,
      digest: exact.digest,
      integrity: exact.integrity,
      license: exact.license,
    },
  ];
  manifest.npmCoverage = "complete";
  manifest.sha256SumsDigest = sha256(sums);
  writeFileSync(manifestPath, canonicalJson(manifest), "utf8");
}

afterEach(() => {
  vi.restoreAllMocks();
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

describe("Stable npm tarball vendoring", () => {
  it("acquires a bounded exact tarball and exposes only its full descriptor offline", async () => {
    const bytes = npmTarball("mergora-ui");
    const exact = descriptor(bytes, {
      package: "mergora-ui",
      url: "https://registry.npmjs.org/mergora-ui/-/mergora-ui-1.0.0.tgz",
    });
    const fetcher = vi.fn(async () => ({
      bytes,
      url: exact.url,
      redirects: [],
      contentType: "application/gzip",
      source: "network" as const,
    }));
    const acquired = await acquireStableNpmTarballInventory({
      release: "1.0.0",
      inventory: {
        entries: [{ ...exact, disposition: "include" }],
        allowedLicenses: ["MIT"],
      },
      fetcher,
    });
    expect(fetcher).toHaveBeenCalledOnce();
    expect(acquired).toMatchObject({
      acquiredBytes: bytes.byteLength,
      descriptors: [{ package: "mergora-ui", version: "1.0.0", license: "MIT" }],
      omissions: [],
      sources: ["network"],
    });
    expect(acquired.artifacts[0]).toMatchObject({
      path: "npm/tarballs/unscoped/mergora-ui/1.0.0.tgz",
      digest: exact.digest,
      mediaType: "application/gzip",
    });

    const project = createProjectFixture();
    temporaryDirectories.push(project.root);
    const seeded = seedPackedCompleteNativeReleaseCache(
      project.root,
      "1.0.0",
      "export const button = true;\n",
      { package: exact.package, bytes, license: exact.license },
    );
    applyInit({ projectRoot: project.root }, planInit({ projectRoot: project.root }).planDigest);
    const release = await resolveNativeRegistryRelease({
      projectRoot: project.root,
      registry: officialRegistry,
      release: "1.0.0",
      catalog: {
        path: "catalog.json",
        digest: seeded.reference.catalog.digest,
        bytes: seeded.reference.catalog.bytes,
      },
      manifest: {
        path: "releases/1.0.0/manifest.json",
        digest: seeded.reference.manifest.digest,
        bytes: seeded.reference.manifest.bytes,
      },
      itemIds: ["button"],
      offline: true,
    });
    const documents = {
      catalog: cachedJson(project.root, release.catalogDigest),
      manifest: cachedJson(project.root, release.manifestDigest),
      items: { button: cachedJson(project.root, release.items[0]!.payloadDigest) },
    };
    const mismatchedFetcher = vi.fn();
    await expect(
      acquireStableVendorSnapshot({
        projectRoot: project.root,
        release: { ...release },
        documents,
        selectionMode: "items",
      }),
    ).rejects.toMatchObject({ code: "REGISTRY_ACQUIRED_RELEASE_UNAUTHENTIC" });
    await expect(
      acquireStableVendorSnapshot({
        projectRoot: project.root,
        release,
        documents,
        selectionMode: "items",
        npmTarballs: {
          allowedLicenses: ["MIT"],
          entries: [{ ...exact, disposition: "omit", omissionReason: "explicitly-omitted" }],
        },
        npmTarballFetcher: mismatchedFetcher,
      }),
    ).rejects.toMatchObject({ code: "VENDOR_STABLE_NPM_INVENTORY_MISMATCH" });
    await expect(
      acquireStableVendorSnapshot({
        projectRoot: project.root,
        release,
        documents,
        selectionMode: "items",
        npmTarballs: { ...release.npmPackageInventory!, enrolledOrigins: [] },
        npmTarballFetcher: mismatchedFetcher,
      }),
    ).rejects.toMatchObject({ code: "VENDOR_STABLE_NPM_ORIGIN_INVALID" });
    expect(mismatchedFetcher).not.toHaveBeenCalled();
    const snapshot = await acquireStableVendorSnapshot({
      projectRoot: project.root,
      release,
      documents,
      selectionMode: "items",
      npmTarballs: release.npmPackageInventory!,
      npmTarballFetcher: fetcher,
    });
    expect(() => planStableVendor({ ...snapshot })).toThrowError(
      expect.objectContaining({ code: "VENDOR_STABLE_SNAPSHOT_UNAUTHENTIC" }),
    );
    const plan = planStableVendor(snapshot);
    const result = applyStableVendor(snapshot, plan.planDigest);
    expect(result.verification).toMatchObject({
      state: "valid",
      release: "1.0.0",
      npmTarballs: 1,
    });
    expect(fetcher).toHaveBeenCalledTimes(2);
    const manifest = JSON.parse(
      readFileSync(resolve(project.root, ".mergora/vendor/v1/vendor-manifest.json"), "utf8"),
    ) as { npmTarballs: unknown[] };
    expect(manifest.npmTarballs).toEqual([
      {
        package: exact.package,
        version: exact.version,
        url: exact.url,
        bytes: exact.bytes,
        digest: exact.digest,
        integrity: exact.integrity,
        license: exact.license,
      },
    ]);
    const reader = createStableNpmTarballVendorReader({ projectRoot: project.root });
    expect(
      Buffer.from(
        (await reader({
          package: exact.package,
          version: exact.version,
          url: exact.url,
          bytes: exact.bytes,
          digest: exact.digest,
          integrity: exact.integrity,
          license: exact.license,
          maxBytes: bytes.byteLength,
        }))!,
      ),
    ).toEqual(bytes);
    expect(() =>
      reader({
        package: exact.package,
        version: exact.version,
        url: exact.url,
        bytes: exact.bytes,
        digest: exact.digest,
        integrity: exact.integrity,
        license: "Apache-2.0",
        maxBytes: bytes.byteLength,
      }),
    ).toThrowError(expect.objectContaining({ code: "VENDOR_STABLE_NPM_REFERENCE_MISMATCH" }));
  });

  it("fails closed on tampering, redirects, integrity drift, scripts, and duplicate identities", async () => {
    const bytes = npmTarball();
    const exact = descriptor(bytes);
    const baseInventory = {
      entries: [{ ...exact, disposition: "include" as const }],
      allowedLicenses: ["MIT"],
    };
    await expect(
      acquireStableNpmTarballInventory({
        release: "1.0.0",
        inventory: baseInventory,
        fetcher: async () => ({
          bytes,
          url: "https://registry.npmjs.org/redirected/-/ui-1.0.0.tgz",
          redirects: [exact.url],
          contentType: "application/gzip",
          source: "network",
        }),
      }),
    ).rejects.toMatchObject({ code: "VENDOR_STABLE_NPM_REDIRECT_REJECTED" });

    await expect(
      acquireStableNpmTarballInventory({
        release: "1.0.0",
        inventory: {
          ...baseInventory,
          entries: [
            {
              ...exact,
              integrity: `sha512-${Buffer.alloc(64, 1).toString("base64")}`,
              disposition: "include",
            },
          ],
        },
        fetcher: async () => ({
          bytes,
          url: exact.url,
          redirects: [],
          contentType: "application/gzip",
          source: "network",
        }),
      }),
    ).rejects.toMatchObject({ code: "VENDOR_STABLE_NPM_INTEGRITY_MISMATCH" });

    const scriptedBytes = npmTarball("mergora-ui", "1.0.0", "MIT", {
      scripts: { postinstall: "node install.js" },
    });
    const scripted = descriptor(scriptedBytes);
    await expect(
      acquireStableNpmTarballInventory({
        release: "1.0.0",
        inventory: {
          entries: [{ ...scripted, disposition: "include" }],
          allowedLicenses: ["MIT"],
        },
        fetcher: async () => ({
          bytes: scriptedBytes,
          url: scripted.url,
          redirects: [],
          contentType: "application/gzip",
          source: "network",
        }),
      }),
    ).rejects.toMatchObject({ code: "VENDOR_STABLE_NPM_SCRIPTS_REJECTED" });

    await expect(
      acquireStableNpmTarballInventory({
        release: "1.0.0",
        inventory: {
          entries: [
            { ...exact, disposition: "include" },
            { ...exact, disposition: "omit", omissionReason: "explicitly-omitted" },
          ],
          allowedLicenses: ["MIT"],
        },
        fetcher: vi.fn(),
      }),
    ).rejects.toMatchObject({ code: "VENDOR_STABLE_NPM_PATH_COLLISION" });

    const project = createProjectFixture();
    temporaryDirectories.push(project.root);
    const inventoriedBytes = npmTarball("mergora-ui");
    const inventoried = descriptor(inventoriedBytes, {
      package: "mergora-ui",
      url: "https://registry.npmjs.org/mergora-ui/-/mergora-ui-1.0.0.tgz",
    });
    seedPackedStableVendorRelease(project.root, "1.0.0", "export const button = true;\n", {
      package: inventoried.package,
      bytes: inventoriedBytes,
      license: inventoried.license,
    });
    extendStableBundle(project.root, inventoriedBytes, inventoried);
    const reader = createStableNpmTarballVendorReader({ projectRoot: project.root });
    const target = resolve(
      project.root,
      ".mergora/vendor/v1",
      ...stableNpmTarballInternalPath(inventoried.package, inventoried.version).split("/"),
    );
    const changed = Buffer.from(inventoriedBytes);
    changed[changed.length - 1] = changed[changed.length - 1]! ^ 1;
    writeFileSync(target, changed);
    expect(() => reader({ ...inventoried, maxBytes: inventoried.bytes })).toThrowError(
      expect.objectContaining({ code: "VENDOR_STABLE_NPM_DIGEST_MISMATCH" }),
    );
  });

  it("rejects a well-formed tarball that is absent from the embedded release inventory", () => {
    const project = createProjectFixture();
    temporaryDirectories.push(project.root);
    seedPackedStableVendorRelease(project.root, "1.0.0", "export const button = true;\n");
    const bytes = npmTarball();
    const uninventoried = descriptor(bytes);
    extendStableBundle(project.root, bytes, uninventoried);

    expect(() => createStableNpmTarballVendorReader({ projectRoot: project.root })).toThrowError(
      expect.objectContaining({ code: "VENDOR_STABLE_NPM_REFERENCE_MISMATCH" }),
    );
  });

  it("requires disallowed licenses to be explicitly omitted without fetching", async () => {
    const bytes = npmTarball("left-pad", "1.0.0", "GPL-3.0-only");
    const exact = descriptor(bytes, {
      package: "left-pad",
      url: "https://registry.npmjs.org/left-pad/-/left-pad-1.0.0.tgz",
      license: "GPL-3.0-only",
    });
    const explicitlyOmitted = {
      ...exact,
      package: "is-number",
      url: "https://registry.npmjs.org/is-number/-/is-number-1.0.0.tgz",
      license: "MIT",
    };
    const fetcher = vi.fn();
    const omitted = await acquireStableNpmTarballInventory({
      release: "1.0.0",
      inventory: {
        entries: [
          {
            ...explicitlyOmitted,
            disposition: "omit",
            omissionReason: "explicitly-omitted",
          },
          { ...exact, disposition: "omit", omissionReason: "license-not-allowed" },
        ],
        allowedLicenses: ["MIT"],
      },
      fetcher,
      offline: true,
    });
    expect(fetcher).not.toHaveBeenCalled();
    expect(omitted).toMatchObject({
      artifacts: [],
      descriptors: [],
      omissions: ["is-number@1.0.0:explicitly-omitted", "left-pad@1.0.0:license-not-allowed"],
      acquiredBytes: 0,
    });
    await expect(
      acquireStableNpmTarballInventory({
        release: "1.0.0",
        inventory: {
          entries: [{ ...exact, disposition: "include" }],
          allowedLicenses: ["MIT"],
        },
        fetcher,
      }),
    ).rejects.toMatchObject({ code: "VENDOR_STABLE_NPM_LICENSE_INVALID" });
  });

  it("rejects mutable versions, credential-bearing URLs, and oversized descriptors before fetch", async () => {
    const bytes = npmTarball();
    const exact = descriptor(bytes);
    const fetcher = vi.fn();
    for (const entry of [
      { ...exact, version: "^1.0.0", disposition: "include" },
      {
        ...exact,
        url: "https://token:secret@registry.npmjs.org/mergora-ui/-/mergora-ui-1.0.0.tgz",
        disposition: "include",
      },
      { ...exact, bytes: 16 * 1024 * 1024 + 1, disposition: "include" },
    ]) {
      await expect(
        acquireStableNpmTarballInventory({
          release: "1.0.0",
          inventory: {
            entries: [entry as StableNpmTarballInventoryDescriptor & { disposition: "include" }],
            allowedLicenses: ["MIT"],
          },
          fetcher,
        }),
      ).rejects.toBeDefined();
    }
    const cliBytes = npmTarball("mergora", "2.0.0");
    const mismatchedCli = descriptor(cliBytes, {
      package: "mergora",
      version: "2.0.0",
      url: "https://registry.npmjs.org/mergora/-/mergora-2.0.0.tgz",
    });
    await expect(
      acquireStableNpmTarballInventory({
        release: "1.0.0",
        inventory: {
          entries: [{ ...mismatchedCli, disposition: "include" }],
          allowedLicenses: ["MIT"],
        },
        fetcher,
      }),
    ).rejects.toMatchObject({ code: "VENDOR_STABLE_NPM_RELEASE_INVALID" });
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("reports bounded fetch timeouts as network failures", async () => {
    const bytes = npmTarball();
    const exact = descriptor(bytes);
    await expect(
      acquireStableNpmTarballInventory({
        release: "1.0.0",
        inventory: {
          entries: [{ ...exact, disposition: "include" }],
          allowedLicenses: ["MIT"],
          timeoutMs: 1,
        },
        fetcher: () => new Promise(() => undefined),
      }),
    ).rejects.toMatchObject({ code: "VENDOR_STABLE_NPM_FETCH_TIMEOUT", exitCode: 4 });
  });

  it("rejects a portable mixed-case implicit node-gyp hook", () => {
    const packageJson = Buffer.from(
      `${JSON.stringify({ name: "mergora-ui", version: "1.0.0", license: "MIT" })}\n`,
      "utf8",
    );
    const bytes = gzipSync(
      Buffer.concat([
        tarEntry("package/package.json", packageJson),
        tarEntry("package/Binding.gyp", Buffer.from("{}\n", "utf8")),
        Buffer.alloc(1024),
      ]),
      { level: 9 },
    );
    expect(() => validateStableNpmTarballBytes(descriptor(bytes), bytes)).toThrowError(
      expect.objectContaining({ code: "VENDOR_STABLE_NPM_SCRIPTS_REJECTED" }),
    );
  });

  it("decodes standard tar path fields exactly and rejects surrounding whitespace", () => {
    const packageJson = Buffer.from(
      `${JSON.stringify({ name: "mergora-ui", version: "1.0.0", license: "MIT" })}\n`,
      "utf8",
    );
    for (const path of [" package/package.json", "package/package.json "]) {
      const bytes = gzipSync(Buffer.concat([tarEntry(path, packageJson), Buffer.alloc(1024)]), {
        level: 9,
      });
      expect(() => validateStableNpmTarballBytes(descriptor(bytes), bytes)).toThrowError(
        expect.objectContaining({ code: "VENDOR_STABLE_NPM_INVALID" }),
      );
    }
  });

  it("rejects PAX size, link, sparse, and extended-attribute metadata", () => {
    const packageJson = Buffer.from(
      `${JSON.stringify({ name: "mergora-ui", version: "1.0.0", license: "MIT" })}\n`,
      "utf8",
    );
    for (const [key, value] of [
      ["size", String(packageJson.byteLength)],
      ["linkpath", "package/other.json"],
      ["GNU.sparse.size", "1"],
      ["SCHILY.xattr.user.token", "secret"],
    ] as const) {
      const bytes = gzipSync(
        Buffer.concat([
          tarEntry("PaxHeader/package.json", paxRecord(key, value), "x"),
          tarEntry("package/package.json", packageJson),
          Buffer.alloc(1024),
        ]),
        { level: 9 },
      );
      expect(() => validateStableNpmTarballBytes(descriptor(bytes), bytes)).toThrowError(
        expect.objectContaining({ code: "VENDOR_STABLE_NPM_INVALID" }),
      );
    }
  });

  it("rejects npm credential keys and URI userinfo across common encodings", () => {
    for (const extra of [
      { _password: "c2VjcmV0" },
      { "//registry.npmjs.org/:_authToken": "secret" },
      { repository: "git+https://user:secret@github.com/example/private.git" },
    ]) {
      const bytes = npmTarball("mergora-ui", "1.0.0", "MIT", extra);
      expect(() => validateStableNpmTarballBytes(descriptor(bytes), bytes)).toThrowError(
        expect.objectContaining({ code: "VENDOR_STABLE_NPM_CREDENTIALS_REJECTED" }),
      );
    }
  });

  it("binds the exact compressed byte count as part of the npm descriptor", () => {
    const bytes = npmTarball();
    expect(() =>
      validateStableNpmTarballBytes(descriptor(bytes, { bytes: bytes.byteLength + 1 }), bytes),
    ).toThrowError(expect.objectContaining({ code: "VENDOR_STABLE_NPM_OVERSIZE" }));
  });

  it("replans a valid npm tarball larger than the ordinary artifact limit as a no-op", async () => {
    const payload = deterministicBinaryBytes(5 * 1024 * 1024);
    const bytes = npmTarball("mergora-ui", "1.0.0", "MIT", {}, [["package/payload.bin", payload]]);
    expect(bytes.byteLength).toBeGreaterThan(4 * 1024 * 1024);
    const exact = descriptor(bytes, {
      package: "mergora-ui",
      url: "https://registry.npmjs.org/mergora-ui/-/mergora-ui-1.0.0.tgz",
    });
    const project = createProjectFixture();
    temporaryDirectories.push(project.root);
    const seeded = seedPackedCompleteNativeReleaseCache(
      project.root,
      "1.0.0",
      "export const button = true;\n",
      { package: exact.package, bytes, license: exact.license },
    );
    applyInit({ projectRoot: project.root }, planInit({ projectRoot: project.root }).planDigest);
    const release = await resolveNativeRegistryRelease({
      projectRoot: project.root,
      registry: officialRegistry,
      release: "1.0.0",
      catalog: {
        path: "catalog.json",
        digest: seeded.reference.catalog.digest,
        bytes: seeded.reference.catalog.bytes,
      },
      manifest: {
        path: "releases/1.0.0/manifest.json",
        digest: seeded.reference.manifest.digest,
        bytes: seeded.reference.manifest.bytes,
      },
      itemIds: ["button"],
      offline: true,
    });
    const snapshot = await acquireStableVendorSnapshot({
      projectRoot: project.root,
      release,
      documents: {
        catalog: cachedJson(project.root, release.catalogDigest),
        manifest: cachedJson(project.root, release.manifestDigest),
        items: { button: cachedJson(project.root, release.items[0]!.payloadDigest) },
      },
      selectionMode: "items",
      npmTarballs: release.npmPackageInventory!,
      npmTarballFetcher: async () => ({
        bytes,
        url: exact.url,
        redirects: [],
        contentType: "application/gzip",
        source: "network",
      }),
    });
    const plan = planStableVendor(snapshot);
    applyStableVendor(snapshot, plan.planDigest);

    const repeated = planStableVendor(snapshot);
    expect(repeated.fileOperations.every(({ operation }) => operation === "no-op")).toBe(true);
    expect(repeated.estimatedBytes.write).toBe(0);
  }, 30_000);

  it("bounds package metadata depth and rejects hidden bytes after the tar terminator", () => {
    let nested: unknown = "leaf";
    for (let depth = 0; depth < 32; depth += 1) nested = { nested };
    const deepBytes = npmTarball("mergora-ui", "1.0.0", "MIT", { metadata: nested });
    expect(() => validateStableNpmTarballBytes(descriptor(deepBytes), deepBytes)).toThrowError(
      expect.objectContaining({ code: "VENDOR_STABLE_NPM_INVALID" }),
    );

    const unpacked = gunzipSync(npmTarball());
    unpacked[unpacked.byteLength - 1] = 1;
    const hiddenBytes = gzipSync(unpacked, { level: 9 });
    expect(() => validateStableNpmTarballBytes(descriptor(hiddenBytes), hiddenBytes)).toThrowError(
      expect.objectContaining({ code: "VENDOR_STABLE_NPM_INVALID" }),
    );
  });

  it("rejects regular-file ancestors and a directory masquerading as package.json", () => {
    const packageJson = Buffer.from(
      `${JSON.stringify({ name: "mergora-ui", version: "1.0.0", license: "MIT" })}\n`,
      "utf8",
    );
    const archives = [
      Buffer.concat([
        tarEntry("package", Buffer.alloc(0)),
        tarEntry("package/package.json", packageJson),
        Buffer.alloc(1024),
      ]),
      Buffer.concat([
        tarEntry("package/package.json", packageJson),
        tarEntry("package", Buffer.alloc(0)),
        Buffer.alloc(1024),
      ]),
    ];
    for (const archive of archives) {
      const bytes = gzipSync(archive, { level: 9 });
      expect(() => validateStableNpmTarballBytes(descriptor(bytes), bytes)).toThrowError(
        expect.objectContaining({ code: "VENDOR_STABLE_NPM_PATH_COLLISION" }),
      );
    }

    const directoryManifest = gzipSync(
      Buffer.concat([tarEntry("package/package.json", packageJson, "5"), Buffer.alloc(1024)]),
      { level: 9 },
    );
    expect(() =>
      validateStableNpmTarballBytes(descriptor(directoryManifest), directoryManifest),
    ).toThrowError(expect.objectContaining({ code: "VENDOR_STABLE_NPM_INVALID" }));
  });

  it("requires two zero terminator blocks and bounds gzip expansion work", () => {
    const packageJson = Buffer.from(
      `${JSON.stringify({ name: "mergora-ui", version: "1.0.0", license: "MIT" })}\n`,
      "utf8",
    );
    const oneTerminator = gzipSync(
      Buffer.concat([tarEntry("package/package.json", packageJson), Buffer.alloc(512)]),
      { level: 9 },
    );
    expect(() =>
      validateStableNpmTarballBytes(descriptor(oneTerminator), oneTerminator),
    ).toThrowError(expect.objectContaining({ code: "VENDOR_STABLE_NPM_INVALID" }));

    const expanded = Buffer.alloc(2 * 1024 * 1024);
    const expansionBomb = gzipSync(expanded, { level: 9 });
    expect(expanded.byteLength).toBeGreaterThan(expansionBomb.byteLength * 256 + 1024 * 1024);
    expect(() =>
      validateStableNpmTarballBytes(descriptor(expansionBomb), expansionBomb),
    ).toThrowError(expect.objectContaining({ code: "VENDOR_STABLE_NPM_INVALID" }));
  });

  it("bounds PAX and GNU long-path depth before applying path metadata", () => {
    const deepPath = `package/${Array.from({ length: 65 }, () => "a").join("/")}/file.js`;
    const packageJson = Buffer.from(
      `${JSON.stringify({ name: "mergora-ui", version: "1.0.0", license: "MIT" })}\n`,
      "utf8",
    );
    const pathMetadata = [
      tarEntry("PaxHeader/file.js", paxRecord("path", deepPath), "x"),
      tarEntry("GnuLongName", Buffer.from(`${deepPath}\0`, "utf8"), "L"),
    ];
    for (const metadata of pathMetadata) {
      const bytes = gzipSync(
        Buffer.concat([
          metadata,
          tarEntry("package/package.json", packageJson),
          Buffer.alloc(1024),
        ]),
        { level: 9 },
      );
      expect(() => validateStableNpmTarballBytes(descriptor(bytes), bytes)).toThrowError(
        expect.objectContaining({ code: "VENDOR_STABLE_NPM_INVALID" }),
      );
    }
  });

  it("bounds exact-release dependency closure graph depth", () => {
    const project = createProjectFixture();
    temporaryDirectories.push(project.root);
    seedPackedStableVendorRelease(
      project.root,
      "1.0.0",
      'export const button = "stable vendor";\n',
    );
    const vendorRoot = resolve(project.root, ".mergora/vendor/v1");
    const releaseInternalPath = "r/v1/releases/1.0.0/manifest.json";
    const releasePath = resolve(vendorRoot, ...releaseInternalPath.split("/"));
    const release = JSON.parse(readFileSync(releasePath, "utf8")) as Record<string, unknown>;
    const items = release.items as Record<string, Record<string, unknown>>;
    const template = items.button!;
    items.button = { ...template, dependencies: ["official:depth-000"] };
    for (let index = 0; index <= 128; index += 1) {
      const id = `depth-${String(index).padStart(3, "0")}`;
      const next = `depth-${String(index + 1).padStart(3, "0")}`;
      items[id] = {
        ...template,
        dependencies: index === 128 ? [] : [`official:${next}`],
      };
    }
    delete release.manifestDigest;
    release.manifestDigest = sha256(canonicalJson(release));
    const releaseBytes = canonicalJson(release);
    writeFileSync(releasePath, releaseBytes, "utf8");

    const sumsPath = resolve(vendorRoot, "SHA256SUMS");
    const releaseDigest = sha256(releaseBytes);
    const sums = `${readFileSync(sumsPath, "utf8")
      .trimEnd()
      .split("\n")
      .map((line) =>
        line.endsWith(`  ${releaseInternalPath}`)
          ? `${releaseDigest.slice("sha256:".length)}  ${releaseInternalPath}`
          : line,
      )
      .join("\n")}\n`;
    writeFileSync(sumsPath, sums, "utf8");
    const manifestPath = resolve(vendorRoot, "vendor-manifest.json");
    const manifest = JSON.parse(readFileSync(manifestPath, "utf8")) as Record<string, unknown>;
    (manifest.releaseManifest as Record<string, unknown>).digest = releaseDigest;
    manifest.sha256SumsDigest = sha256(sums);
    writeFileSync(manifestPath, canonicalJson(manifest), "utf8");

    expect(() => createStableAcquisitionVendorReader({ projectRoot: project.root })).toThrowError(
      expect.objectContaining({ code: "VENDOR_STABLE_SELECTION_INVALID" }),
    );
  });
});
