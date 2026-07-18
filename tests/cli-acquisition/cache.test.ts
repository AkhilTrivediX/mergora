import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { relative, resolve } from "node:path";

import { describe, expect, it } from "vitest";

import { acquireImmutableArtifact } from "../../packages/cli/src/acquisition.ts";
import { planClean } from "../../packages/cli/src/clean.ts";
import { applyInit } from "../../packages/cli/src/configuration.ts";
import { createProjectFixture } from "../cli-fixtures/project-fixture.ts";
import {
  acquisitionFixture,
  cacheEntryPath,
  transportResponse,
  writeCompatibleCache,
} from "./helpers.ts";

describe("verified acquisition cache", () => {
  it("writes the shared v1 cache format, reads it offline, and remains clean-compatible", async () => {
    const source = acquisitionFixture();
    const project = createProjectFixture({ directoryPrefix: "mergora-acquisition-clean-" });
    try {
      applyInit({ projectRoot: project.root });
      const acquired = await acquireImmutableArtifact({
        projectRoot: project.root,
        request: source.request,
        transport: async (request) => transportResponse(request, source.bytes),
      });
      expect(acquired).toMatchObject({ source: "network", cacheWritten: true });

      const entry = cacheEntryPath(project.root, source.request);
      const metadata = JSON.parse(readFileSync(resolve(entry, "cache-entry.json"), "utf8")) as {
        readonly schemaVersion: number;
        readonly artifactKind: string;
        readonly key: string;
        readonly artifact: string;
        readonly digest: string;
        readonly bytes: number;
      };
      expect(metadata).toEqual({
        schemaVersion: 1,
        artifactKind: "mergora-verified-cache-entry",
        key: source.request.digest.slice("sha256:".length),
        artifact: "artifact",
        digest: source.request.digest,
        bytes: source.bytes.byteLength,
      });

      const offline = await acquireImmutableArtifact({
        projectRoot: project.root,
        request: source.request,
        offline: true,
      });
      expect(offline).toMatchObject({
        source: "verified-cache",
        cacheWritten: false,
        attempts: [],
      });
      expect(Buffer.from(offline.bytes)).toEqual(source.bytes);

      const projectRelative = relative(project.root, entry).replaceAll("\\", "/");
      const cleanup = planClean({ projectRoot: project.root, cache: true });
      expect(cleanup.candidates.cache.map(({ path }) => path)).toContain(projectRelative);
      expect(cleanup.selected.map(({ path }) => path)).toContain(projectRelative);
    } finally {
      source.cleanup();
      rmSync(project.root, { force: true, recursive: true });
    }
  });

  it("reads a canonical cache entry produced by the existing shared format", async () => {
    const fixture = acquisitionFixture();
    try {
      writeCompatibleCache(fixture.root, fixture.request, fixture.bytes);
      const result = await acquireImmutableArtifact({
        projectRoot: fixture.root,
        request: fixture.request,
        offline: true,
      });
      expect(result.source).toBe("verified-cache");
      expect(Buffer.from(result.bytes)).toEqual(fixture.bytes);
    } finally {
      fixture.cleanup();
    }
  });

  it("detects artifact tampering and never hides it with vendor or network fallback", async () => {
    const fixture = acquisitionFixture();
    try {
      const entry = writeCompatibleCache(fixture.root, fixture.request, fixture.bytes);
      writeFileSync(resolve(entry, "artifact"), Buffer.from("tampered bytes"));
      let vendorCalls = 0;
      let transportCalls = 0;
      await expect(
        acquireImmutableArtifact({
          projectRoot: fixture.root,
          request: fixture.request,
          vendor: () => {
            vendorCalls += 1;
            return fixture.bytes;
          },
          transport: async (request) => {
            transportCalls += 1;
            return transportResponse(request, fixture.bytes);
          },
        }),
      ).rejects.toMatchObject({ code: "REGISTRY_CACHE_TAMPERED", exitCode: 8 });
      expect(vendorCalls).toBe(0);
      expect(transportCalls).toBe(0);
    } finally {
      fixture.cleanup();
    }
  });

  it.each([
    ["future schema", { schemaVersion: 2 }],
    ["wrong key", { key: "0".repeat(64) }],
    ["wrong digest", { digest: `sha256:${"0".repeat(64)}` }],
    ["unknown field", { unexpected: true }],
  ])("rejects %s cache metadata", async (_label, override) => {
    const fixture = acquisitionFixture();
    try {
      writeCompatibleCache(fixture.root, fixture.request, fixture.bytes, override);
      await expect(
        acquireImmutableArtifact({
          projectRoot: fixture.root,
          request: fixture.request,
          offline: true,
        }),
      ).rejects.toMatchObject({
        code: expect.stringMatching(/^REGISTRY_CACHE_(?:INVALID|TAMPERED)$/u),
        exitCode: 8,
      });
    } finally {
      fixture.cleanup();
    }
  });

  it("rejects duplicate cache metadata keys instead of accepting JSON.parse last-key wins", async () => {
    const fixture = acquisitionFixture();
    try {
      const entry = writeCompatibleCache(fixture.root, fixture.request, fixture.bytes);
      const key = fixture.request.digest.slice("sha256:".length);
      writeFileSync(
        resolve(entry, "cache-entry.json"),
        `{"schemaVersion":1,"schemaVersion":1,"artifactKind":"mergora-verified-cache-entry","key":"${key}","artifact":"artifact","digest":"${fixture.request.digest}","bytes":${String(fixture.bytes.byteLength)}}\n`,
      );
      await expect(
        acquireImmutableArtifact({
          projectRoot: fixture.root,
          request: fixture.request,
          offline: true,
        }),
      ).rejects.toMatchObject({ code: "REGISTRY_CACHE_INVALID", exitCode: 8 });
    } finally {
      fixture.cleanup();
    }
  });

  it("normalizes canonicalization failures into a stable cache error", async () => {
    const fixture = acquisitionFixture();
    try {
      const entry = writeCompatibleCache(fixture.root, fixture.request, fixture.bytes);
      const key = fixture.request.digest.slice("sha256:".length);
      writeFileSync(
        resolve(entry, "cache-entry.json"),
        `{"artifact":"artifact","artifactKind":"mergora-verified-cache-entry","bytes":1e400,"digest":"${fixture.request.digest}","key":"${key}","schemaVersion":1}\n`,
      );
      await expect(
        acquireImmutableArtifact({
          projectRoot: fixture.root,
          request: fixture.request,
          offline: true,
        }),
      ).rejects.toMatchObject({ code: "REGISTRY_CACHE_INVALID", exitCode: 8 });
    } finally {
      fixture.cleanup();
    }
  });

  it("rejects extra cache files so acquisition and cleanup agree on the entry format", async () => {
    const fixture = acquisitionFixture();
    try {
      const entry = writeCompatibleCache(fixture.root, fixture.request, fixture.bytes);
      writeFileSync(resolve(entry, "unexpected"), "untracked cache bytes\n");
      await expect(
        acquireImmutableArtifact({
          projectRoot: fixture.root,
          request: fixture.request,
          offline: true,
        }),
      ).rejects.toMatchObject({ code: "REGISTRY_CACHE_INVALID", exitCode: 8 });
    } finally {
      fixture.cleanup();
    }
  });

  it("rejects a cache-root junction before reading outside the project", async () => {
    const fixture = acquisitionFixture();
    const outside = mkdtempSync(resolve(tmpdir(), "mergora-acquisition-outside-"));
    try {
      const outsideEntry = writeCompatibleCache(outside, fixture.request, fixture.bytes);
      expect(existsSync(outsideEntry)).toBe(true);
      mkdirSync(resolve(fixture.root, ".mergora"), { recursive: true });
      symlinkSync(
        resolve(outside, ".mergora/cache"),
        resolve(fixture.root, ".mergora/cache"),
        process.platform === "win32" ? "junction" : "dir",
      );
      await expect(
        acquireImmutableArtifact({
          projectRoot: fixture.root,
          request: fixture.request,
          offline: true,
        }),
      ).rejects.toMatchObject({ code: "REGISTRY_CACHE_PATH_UNSAFE", exitCode: 8 });
    } finally {
      fixture.cleanup();
      rmSync(outside, { force: true, recursive: true });
    }
  });

  it("rejects a cache entry directory replaced by a junction", async () => {
    const fixture = acquisitionFixture();
    const outside = mkdtempSync(resolve(tmpdir(), "mergora-acquisition-entry-outside-"));
    try {
      const realEntry = writeCompatibleCache(outside, fixture.request, fixture.bytes);
      const entry = cacheEntryPath(fixture.root, fixture.request);
      mkdirSync(resolve(entry, ".."), { recursive: true });
      symlinkSync(realEntry, entry, process.platform === "win32" ? "junction" : "dir");
      await expect(
        acquireImmutableArtifact({
          projectRoot: fixture.root,
          request: fixture.request,
          offline: true,
        }),
      ).rejects.toMatchObject({ code: "REGISTRY_CACHE_PATH_UNSAFE", exitCode: 8 });
    } finally {
      fixture.cleanup();
      rmSync(outside, { force: true, recursive: true });
    }
  });

  it("does not create cache state when writes are disabled", async () => {
    const fixture = acquisitionFixture();
    try {
      const result = await acquireImmutableArtifact({
        projectRoot: fixture.root,
        request: fixture.request,
        writeCache: false,
        transport: async (request) => transportResponse(request, fixture.bytes),
      });
      expect(result.cacheWritten).toBe(false);
      expect(existsSync(resolve(fixture.root, ".mergora/cache"))).toBe(false);
    } finally {
      fixture.cleanup();
    }
  });
});
