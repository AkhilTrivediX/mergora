import { describe, expect, it } from "vitest";

import {
  acquireImmutableArtifact,
  type AcquisitionTransport,
  type AcquisitionValidationContext,
} from "../../packages/cli/src/acquisition.ts";
import { CliError, sha256 } from "../../packages/cli/src/contracts.ts";
import { acquisitionFixture, transportResponse } from "./helpers.ts";

describe("immutable acquisition fallback policy", () => {
  it("uses vendor then cache without touching transport in offline mode", async () => {
    const fixture = acquisitionFixture();
    try {
      let transportCalls = 0;
      const vendor = await acquireImmutableArtifact({
        projectRoot: fixture.root,
        request: fixture.request,
        offline: true,
        vendor: () => fixture.bytes,
        transport: async () => {
          transportCalls += 1;
          throw new Error("network must remain disabled");
        },
      });
      expect(vendor).toMatchObject({
        source: "vendor",
        resolvedUrl: null,
        cacheWritten: false,
        attempts: [],
      });
      expect(transportCalls).toBe(0);

      const filled = await acquireImmutableArtifact({
        projectRoot: fixture.root,
        request: fixture.request,
        transport: async (request) => transportResponse(request, fixture.bytes),
      });
      expect(filled.cacheWritten).toBe(true);

      let vendorCalls = 0;
      const cached = await acquireImmutableArtifact({
        projectRoot: fixture.root,
        request: fixture.request,
        offline: true,
        vendor: () => {
          vendorCalls += 1;
          return null;
        },
        transport: async () => {
          transportCalls += 1;
          throw new Error("network must remain disabled");
        },
      });
      expect(cached).toMatchObject({ source: "verified-cache", attempts: [] });
      expect(vendorCalls).toBe(1);
      expect(transportCalls).toBe(0);
    } finally {
      fixture.cleanup();
    }
  });

  it("fails with the exact missing digest offline and never invokes transport", async () => {
    const fixture = acquisitionFixture();
    try {
      let called = false;
      await expect(
        acquireImmutableArtifact({
          projectRoot: fixture.root,
          request: fixture.request,
          offline: true,
          vendor: () => null,
          transport: async () => {
            called = true;
            throw new Error("unexpected transport");
          },
        }),
      ).rejects.toMatchObject({
        code: "REGISTRY_EVIDENCE_MISSING",
        exitCode: 4,
        target: fixture.request.path,
      });
      expect(called).toBe(false);
    } finally {
      fixture.cleanup();
    }
  });

  it("falls back from canonical availability failures to mirrors deterministically", async () => {
    const fixture = acquisitionFixture();
    try {
      const calls: string[] = [];
      const contexts: AcquisitionValidationContext[] = [];
      const result = await acquireImmutableArtifact({
        projectRoot: fixture.root,
        request: fixture.request,
        mirrorOrigins: ["https://mirror-b.example.test/", "https://mirror-a.example.test"],
        writeCache: false,
        transport: async (request) => {
          calls.push(request.url);
          if (request.url.startsWith("https://registry.example.test/")) {
            throw new Error("canonical DNS unavailable");
          }
          if (request.url.startsWith("https://mirror-b.example.test/")) {
            return transportResponse(request, Buffer.alloc(0), {
              status: 503,
              contentLength: 0,
            });
          }
          return transportResponse(request, fixture.bytes);
        },
        validate: (_bytes, context) => {
          contexts.push(context);
        },
      });

      expect(calls).toEqual([
        `https://registry.example.test/root/${fixture.request.path}`,
        `https://mirror-b.example.test/${fixture.request.path}`,
        `https://mirror-a.example.test/${fixture.request.path}`,
      ]);
      expect(result).toMatchObject({
        source: "mirror",
        resolvedUrl: `https://mirror-a.example.test/${fixture.request.path}`,
        cacheWritten: false,
        attempts: [
          {
            source: "network",
            origin: "https://registry.example.test/root",
            outcome: "availability-failure",
          },
          {
            source: "mirror",
            origin: "https://mirror-b.example.test",
            outcome: "availability-failure",
          },
          {
            source: "mirror",
            origin: "https://mirror-a.example.test",
            outcome: "success",
          },
        ],
      });
      expect(contexts).toEqual([
        {
          request: fixture.request,
          source: "mirror",
          resolvedUrl: `https://mirror-a.example.test/${fixture.request.path}`,
        },
      ]);
    } finally {
      fixture.cleanup();
    }
  });

  it.each([
    {
      label: "digest mismatch",
      expectedCode: "REGISTRY_INTEGRITY_FAILURE",
      response: (request: Parameters<AcquisitionTransport>[0]) =>
        transportResponse(request, Buffer.from("wrong immutable bytes")),
    },
    {
      label: "media mismatch",
      expectedCode: "REGISTRY_MEDIA_TYPE_INVALID",
      response: (request: Parameters<AcquisitionTransport>[0], bytes: Uint8Array) =>
        transportResponse(request, bytes, { contentType: "text/html" }),
    },
    {
      label: "redirect mismatch",
      expectedCode: "REGISTRY_REDIRECT_REFUSED",
      response: (request: Parameters<AcquisitionTransport>[0], bytes: Uint8Array) =>
        transportResponse(request, bytes, { url: `https://redirect.example.test/${request.url}` }),
    },
    {
      label: "content-length mismatch",
      expectedCode: "REGISTRY_INTEGRITY_FAILURE",
      response: (request: Parameters<AcquisitionTransport>[0], bytes: Uint8Array) =>
        transportResponse(request, bytes, { contentLength: bytes.byteLength + 1 }),
    },
  ])("does not try a mirror after a canonical $label", async ({ expectedCode, response }) => {
    const fixture = acquisitionFixture();
    try {
      const calls: string[] = [];
      await expect(
        acquireImmutableArtifact({
          projectRoot: fixture.root,
          request: fixture.request,
          mirrorOrigins: ["https://mirror.example.test"],
          writeCache: false,
          transport: async (request) => {
            calls.push(request.url);
            return response(request, fixture.bytes);
          },
        }),
      ).rejects.toMatchObject({ code: expectedCode, exitCode: 5 });
      expect(calls).toEqual([`https://registry.example.test/root/${fixture.request.path}`]);
    } finally {
      fixture.cleanup();
    }
  });

  it("does not fall back after a validator rejects canonical bytes", async () => {
    const fixture = acquisitionFixture();
    try {
      const calls: string[] = [];
      await expect(
        acquireImmutableArtifact({
          projectRoot: fixture.root,
          request: fixture.request,
          mirrorOrigins: ["https://mirror.example.test"],
          writeCache: false,
          transport: async (request) => {
            calls.push(request.url);
            return transportResponse(request, fixture.bytes);
          },
          validate: () => {
            throw new CliError("Document schema failed.", {
              code: "REGISTRY_DOCUMENT_SCHEMA_INVALID",
              exitCode: 5,
            });
          },
        }),
      ).rejects.toMatchObject({ code: "REGISTRY_DOCUMENT_SCHEMA_INVALID" });
      expect(calls).toHaveLength(1);
    } finally {
      fixture.cleanup();
    }
  });

  it("never falls back after authentication is required", async () => {
    const fixture = acquisitionFixture();
    try {
      const calls: string[] = [];
      await expect(
        acquireImmutableArtifact({
          projectRoot: fixture.root,
          request: fixture.request,
          mirrorOrigins: ["https://mirror.example.test"],
          writeCache: false,
          transport: async (request) => {
            calls.push(request.url);
            return transportResponse(request, Buffer.alloc(0), {
              status: 401,
              contentLength: 0,
            });
          },
        }),
      ).rejects.toMatchObject({ code: "REGISTRY_AUTH_REQUIRED", exitCode: 11 });
      expect(calls).toHaveLength(1);
    } finally {
      fixture.cleanup();
    }
  });

  it("attaches authorization only to the enrolled canonical origin", async () => {
    const fixture = acquisitionFixture();
    try {
      const calls: { readonly authorization?: string; readonly url: string }[] = [];
      const result = await acquireImmutableArtifact({
        authorization: "Bearer private-token",
        projectRoot: fixture.root,
        request: fixture.request,
        mirrorOrigins: ["https://mirror.example.test"],
        writeCache: false,
        transport: async (request) => {
          calls.push({
            ...(request.authorization === undefined
              ? {}
              : { authorization: request.authorization }),
            url: request.url,
          });
          return request.url.startsWith("https://registry.example.test/")
            ? transportResponse(request, Buffer.alloc(0), { status: 404, contentLength: 0 })
            : transportResponse(request, fixture.bytes);
        },
      });

      expect(result.source).toBe("mirror");
      expect(calls).toEqual([
        {
          authorization: "Bearer private-token",
          url: `https://registry.example.test/root/${fixture.request.path}`,
        },
        { url: `https://mirror.example.test/${fixture.request.path}` },
      ]);
    } finally {
      fixture.cleanup();
    }
  });

  it("normalizes equivalent mirrors before deduplicating attempts", async () => {
    const fixture = acquisitionFixture();
    try {
      const calls: string[] = [];
      await expect(
        acquireImmutableArtifact({
          projectRoot: fixture.root,
          request: fixture.request,
          mirrorOrigins: ["https://mirror.example.test/", "https://mirror.example.test"],
          writeCache: false,
          transport: async (request) => {
            calls.push(request.url);
            return transportResponse(request, Buffer.alloc(0), {
              status: 503,
              contentLength: 0,
            });
          },
        }),
      ).rejects.toMatchObject({ code: "REGISTRY_NETWORK_FAILURE", exitCode: 4 });
      expect(calls).toEqual([
        `https://registry.example.test/root/${fixture.request.path}`,
        `https://mirror.example.test/${fixture.request.path}`,
      ]);
    } finally {
      fixture.cleanup();
    }
  });

  it("binds the result to bytes even if a validator mutates its input", async () => {
    const fixture = acquisitionFixture();
    try {
      const expectedDigest = fixture.request.digest;
      const result = await acquireImmutableArtifact({
        projectRoot: fixture.root,
        request: fixture.request,
        writeCache: false,
        transport: async (request) => transportResponse(request, fixture.bytes),
        validate: (bytes, context) => {
          bytes[0] = bytes[0]! ^ 0xff;
          (context.request as { digest: string }).digest = sha256("mutated context");
        },
      });
      expect(result.digest).toBe(expectedDigest);
      expect(sha256(result.bytes)).toBe(expectedDigest);
      expect(fixture.request.digest).toBe(expectedDigest);
    } finally {
      fixture.cleanup();
    }
  });
});
