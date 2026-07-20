import { existsSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

import {
  acquireImmutableArtifact,
  type AcquisitionTransportRequest,
  type AcquisitionValidationContext,
  type ImmutableArtifactRequest,
} from "../../packages/cli/src/acquisition.ts";
import { canonicalJson, CliError, sha256 } from "../../packages/cli/src/contracts.ts";
import { OFFICIAL_REGISTRY_ORIGIN } from "../../packages/cli/src/registry-data.ts";
import { acquisitionFixture, transportResponse, writeCompatibleCache } from "./helpers.ts";

describe("immutable acquisition validation and bounds", () => {
  it("accepts only the compiled registry identity as official", async () => {
    const fixture = acquisitionFixture();
    try {
      const official = {
        id: "official",
        origin: OFFICIAL_REGISTRY_ORIGIN,
        trust: "official" as const,
      };
      const result = await acquireImmutableArtifact({
        projectRoot: fixture.root,
        request: {
          ...fixture.request,
          registry: {
            ...official,
            identityDigest: sha256(canonicalJson(official)),
          },
        },
        offline: true,
        vendor: () => fixture.bytes,
      });
      expect(result.registry).toMatchObject(official);

      const spoofed = {
        id: "spoofed-official",
        origin: "https://untrusted.example.test/r/v1",
        trust: "official" as const,
      };
      let vendorCalled = false;
      await expect(
        acquireImmutableArtifact({
          projectRoot: fixture.root,
          request: {
            ...fixture.request,
            registry: {
              ...spoofed,
              identityDigest: sha256(canonicalJson(spoofed)),
            },
          },
          offline: true,
          vendor: () => {
            vendorCalled = true;
            return fixture.bytes;
          },
        }),
      ).rejects.toMatchObject({ code: "REGISTRY_IDENTITY_INVALID", exitCode: 5 });
      expect(vendorCalled).toBe(false);
    } finally {
      fixture.cleanup();
    }
  });

  it("rejects unsupported registry trust values before consulting a source", async () => {
    const fixture = acquisitionFixture();
    try {
      let vendorCalled = false;
      await expect(
        acquireImmutableArtifact({
          projectRoot: fixture.root,
          request: {
            ...fixture.request,
            registry: {
              ...fixture.request.registry,
              trust: "self-declared" as never,
            },
          },
          offline: true,
          vendor: () => {
            vendorCalled = true;
            return fixture.bytes;
          },
        }),
      ).rejects.toMatchObject({ code: "REGISTRY_IDENTITY_INVALID", exitCode: 5 });
      expect(vendorCalled).toBe(false);
    } finally {
      fixture.cleanup();
    }
  });

  it("allows explicit loopback HTTP only for local-development registry trust", async () => {
    const fixture = acquisitionFixture();
    try {
      const registry = {
        id: "local-preview",
        origin: "http://127.0.0.1:4173/r/v1",
        trust: "local-development" as const,
      };
      const result = await acquireImmutableArtifact({
        projectRoot: fixture.root,
        request: {
          ...fixture.request,
          registry: { ...registry, identityDigest: sha256(canonicalJson(registry)) },
        },
        writeCache: false,
        transport: async (request) => transportResponse(request, fixture.bytes),
      });
      expect(result.resolvedUrl).toBe(`http://127.0.0.1:4173/r/v1/${fixture.request.path}`);

      await expect(
        acquireImmutableArtifact({
          projectRoot: fixture.root,
          request: {
            ...fixture.request,
            registry: {
              ...registry,
              trust: "enrolled",
              identityDigest: sha256("different-trust"),
            },
          },
          writeCache: false,
          transport: async (request) => transportResponse(request, fixture.bytes),
        }),
      ).rejects.toMatchObject({ code: "REGISTRY_ORIGIN_UNSAFE" });
    } finally {
      fixture.cleanup();
    }
  });

  it("normalizes transport policy inputs and provides exact validator context", async () => {
    const fixture = acquisitionFixture();
    try {
      const request: ImmutableArtifactRequest = {
        ...fixture.request,
        acceptedMediaTypes: ["TEXT/PLAIN", "application/json", "text/plain"],
      };
      let transportInput: AcquisitionTransportRequest | undefined;
      let validationContext: AcquisitionValidationContext | undefined;
      const result = await acquireImmutableArtifact({
        projectRoot: fixture.root,
        request,
        timeoutMs: 1_234,
        writeCache: false,
        transport: async (input) => {
          transportInput = input;
          return transportResponse(input, fixture.bytes);
        },
        validate: (_bytes, context) => {
          validationContext = context;
        },
      });

      expect(transportInput).toEqual({
        url: `https://registry.example.test/root/${fixture.request.path}`,
        acceptedMediaTypes: ["application/json", "text/plain"],
        maxBytes: fixture.request.maxBytes,
        timeoutMs: 1_234,
      });
      expect(validationContext).toEqual({
        request,
        source: "network",
        resolvedUrl: `https://registry.example.test/root/${fixture.request.path}`,
      });
      expect(result.attempts).toEqual([
        {
          source: "network",
          origin: "https://registry.example.test/root",
          outcome: "success",
        },
      ]);
    } finally {
      fixture.cleanup();
    }
  });

  it("rejects unsafe authorization values before transport or cache writes", async () => {
    const fixture = acquisitionFixture();
    try {
      let transportCalled = false;
      await expect(
        acquireImmutableArtifact({
          authorization: "Bearer secret\nforwarded: yes",
          projectRoot: fixture.root,
          request: fixture.request,
          transport: async (request) => {
            transportCalled = true;
            return transportResponse(request, fixture.bytes);
          },
        }),
      ).rejects.toMatchObject({ code: "REGISTRY_AUTH_INVALID", exitCode: 11 });
      expect(transportCalled).toBe(false);
    } finally {
      fixture.cleanup();
    }
  });

  it("reports vendor and cache validator contexts without synthetic URLs", async () => {
    const vendorFixture = acquisitionFixture();
    const cacheFixture = acquisitionFixture();
    try {
      const contexts: AcquisitionValidationContext[] = [];
      await acquireImmutableArtifact({
        projectRoot: vendorFixture.root,
        request: vendorFixture.request,
        offline: true,
        vendor: () => vendorFixture.bytes,
        validate: (_bytes, context) => {
          contexts.push(context);
        },
      });
      writeCompatibleCache(cacheFixture.root, cacheFixture.request, cacheFixture.bytes);
      await acquireImmutableArtifact({
        projectRoot: cacheFixture.root,
        request: cacheFixture.request,
        offline: true,
        validate: (_bytes, context) => {
          contexts.push(context);
        },
      });
      expect(contexts).toEqual([
        { request: vendorFixture.request, source: "vendor", resolvedUrl: null },
        { request: cacheFixture.request, source: "verified-cache", resolvedUrl: null },
      ]);
    } finally {
      vendorFixture.cleanup();
      cacheFixture.cleanup();
    }
  });

  it("never falls back from invalid vendor bytes to a valid cache", async () => {
    const fixture = acquisitionFixture();
    try {
      writeCompatibleCache(fixture.root, fixture.request, fixture.bytes);
      await expect(
        acquireImmutableArtifact({
          projectRoot: fixture.root,
          request: fixture.request,
          offline: true,
          vendor: () => Buffer.from("invalid vendor artifact"),
        }),
      ).rejects.toMatchObject({ code: "REGISTRY_INTEGRITY_FAILURE", exitCode: 5 });
    } finally {
      fixture.cleanup();
    }
  });

  it("does not let a vendor callback redefine the immutable request", async () => {
    const fixture = acquisitionFixture();
    try {
      const maliciousBytes = Buffer.from("vendor-redefined immutable bytes");
      const expectedDigest = fixture.request.digest;
      await expect(
        acquireImmutableArtifact({
          projectRoot: fixture.root,
          request: fixture.request,
          offline: true,
          vendor: (request) => {
            (request as { digest: string }).digest = sha256(maliciousBytes);
            (request as { bytes?: number }).bytes = maliciousBytes.byteLength;
            return maliciousBytes;
          },
        }),
      ).rejects.toMatchObject({ code: "REGISTRY_INTEGRITY_FAILURE", exitCode: 5 });
      expect(fixture.request.digest).toBe(expectedDigest);
    } finally {
      fixture.cleanup();
    }
  });

  it("does not let a transport callback expand the accepted media policy", async () => {
    const fixture = acquisitionFixture();
    try {
      await expect(
        acquireImmutableArtifact({
          projectRoot: fixture.root,
          request: fixture.request,
          writeCache: false,
          transport: async (request) => {
            (request.acceptedMediaTypes as string[]).push("text/html");
            return transportResponse(request, fixture.bytes, { contentType: "text/html" });
          },
        }),
      ).rejects.toMatchObject({ code: "REGISTRY_MEDIA_TYPE_INVALID", exitCode: 5 });
    } finally {
      fixture.cleanup();
    }
  });

  it("never falls back from cache validator failure to vendor or network", async () => {
    const fixture = acquisitionFixture();
    try {
      writeCompatibleCache(fixture.root, fixture.request, fixture.bytes);
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
          validate: () => {
            throw new CliError("Cached document is semantically invalid.", {
              code: "REGISTRY_DOCUMENT_SCHEMA_INVALID",
              exitCode: 5,
            });
          },
        }),
      ).rejects.toMatchObject({ code: "REGISTRY_DOCUMENT_SCHEMA_INVALID" });
      expect(vendorCalls).toBe(0);
      expect(transportCalls).toBe(0);
    } finally {
      fixture.cleanup();
    }
  });

  it.each([
    ["zero", 0],
    ["above hard maximum", 64 * 1024 * 1024 + 1],
    ["fractional", 1.5],
  ])("rejects a %s request byte limit before any source is consulted", async (_label, maxBytes) => {
    const fixture = acquisitionFixture();
    try {
      let consulted = false;
      await expect(
        acquireImmutableArtifact({
          projectRoot: fixture.root,
          request: { ...fixture.request, bytes: undefined, maxBytes },
          vendor: () => {
            consulted = true;
            return fixture.bytes;
          },
          transport: async (request) => {
            consulted = true;
            return transportResponse(request, fixture.bytes);
          },
        }),
      ).rejects.toMatchObject({ code: "REGISTRY_LIMIT_INVALID", exitCode: 5 });
      expect(consulted).toBe(false);
    } finally {
      fixture.cleanup();
    }
  });

  it.each([99, 120_001, 1.5])("rejects timeout %s before any transport call", async (timeoutMs) => {
    const fixture = acquisitionFixture();
    try {
      let called = false;
      await expect(
        acquireImmutableArtifact({
          projectRoot: fixture.root,
          request: fixture.request,
          timeoutMs,
          transport: async (request) => {
            called = true;
            return transportResponse(request, fixture.bytes);
          },
        }),
      ).rejects.toMatchObject({ code: "REGISTRY_LIMIT_INVALID", exitCode: 5 });
      expect(called).toBe(false);
    } finally {
      fixture.cleanup();
    }
  });

  it("rejects oversized vendor bytes before validation or cache writes", async () => {
    const fixture = acquisitionFixture();
    try {
      const oversized = Buffer.from("12345");
      let validated = false;
      await expect(
        acquireImmutableArtifact({
          projectRoot: fixture.root,
          request: {
            ...fixture.request,
            bytes: undefined,
            digest: sha256(oversized),
            maxBytes: 4,
          },
          offline: true,
          vendor: () => oversized,
          validate: () => {
            validated = true;
          },
        }),
      ).rejects.toMatchObject({ code: "REGISTRY_ARTIFACT_OVERSIZE", exitCode: 5 });
      expect(validated).toBe(false);
      expect(existsSync(resolve(fixture.root, ".mergora/cache"))).toBe(false);
    } finally {
      fixture.cleanup();
    }
  });

  it("rejects oversized canonical bytes without attempting mirrors", async () => {
    const fixture = acquisitionFixture();
    try {
      const oversized = Buffer.from("12345");
      const calls: string[] = [];
      await expect(
        acquireImmutableArtifact({
          projectRoot: fixture.root,
          request: {
            ...fixture.request,
            bytes: undefined,
            digest: sha256(oversized),
            maxBytes: 4,
          },
          mirrorOrigins: ["https://mirror.example.test"],
          writeCache: false,
          transport: async (request) => {
            calls.push(request.url);
            return transportResponse(request, oversized);
          },
        }),
      ).rejects.toMatchObject({ code: "REGISTRY_ARTIFACT_OVERSIZE", exitCode: 5 });
      expect(calls).toHaveLength(1);
    } finally {
      fixture.cleanup();
    }
  });

  it("rejects oversized cache metadata before parsing it", async () => {
    const fixture = acquisitionFixture();
    try {
      const entry = writeCompatibleCache(fixture.root, fixture.request, fixture.bytes);
      writeFileSync(resolve(entry, "cache-entry.json"), " ".repeat(16 * 1024 + 1));
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

  it("returns a byte copy that is independent from transport-owned memory", async () => {
    const fixture = acquisitionFixture();
    try {
      const transportBytes = Uint8Array.from(fixture.bytes);
      const result = await acquireImmutableArtifact({
        projectRoot: fixture.root,
        request: fixture.request,
        writeCache: false,
        transport: async (request) => transportResponse(request, transportBytes),
      });
      transportBytes.fill(0);
      expect(Buffer.from(result.bytes)).toEqual(fixture.bytes);
      expect(sha256(result.bytes)).toBe(fixture.request.digest);
    } finally {
      fixture.cleanup();
    }
  });
});
