import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";

import {
  type AcquisitionTransportRequest,
  type AcquisitionTransportResponse,
  type ImmutableArtifactRequest,
} from "../../packages/cli/src/acquisition.ts";
import { canonicalJson, sha256 } from "../../packages/cli/src/contracts.ts";

export interface AcquisitionFixture {
  readonly bytes: Buffer;
  readonly request: ImmutableArtifactRequest;
  readonly root: string;
  cleanup(): void;
}

export function acquisitionFixture(content = '{"schemaVersion":1}\n'): AcquisitionFixture {
  const root = mkdtempSync(resolve(tmpdir(), "mergora-acquisition-"));
  const bytes = Buffer.from(content);
  return {
    root,
    bytes,
    request: {
      registry: {
        id: "fixture-registry",
        origin: "https://registry.example.test/root/",
        identityDigest: sha256("fixture-registry-identity"),
        trust: "enrolled",
      },
      path: "r/v1/releases/1.0.0/manifest.json",
      digest: sha256(bytes),
      bytes: bytes.byteLength,
      maxBytes: 4_096,
      acceptedMediaTypes: ["application/json"],
      release: "1.0.0",
    },
    cleanup(): void {
      rmSync(root, { force: true, recursive: true });
    },
  };
}

export function transportResponse(
  request: AcquisitionTransportRequest,
  bytes: Uint8Array,
  overrides: Partial<AcquisitionTransportResponse> = {},
): AcquisitionTransportResponse {
  return {
    status: 200,
    url: request.url,
    contentType: "application/json; charset=utf-8",
    contentLength: bytes.byteLength,
    bytes,
    ...overrides,
  };
}

export function cacheEntryPath(root: string, request: ImmutableArtifactRequest): string {
  return resolve(root, ".mergora/cache/entries", request.digest.slice("sha256:".length));
}

export function writeCompatibleCache(
  root: string,
  request: ImmutableArtifactRequest,
  bytes: Uint8Array,
  metadataOverrides: Readonly<Record<string, unknown>> = {},
): string {
  const key = request.digest.slice("sha256:".length);
  const entry = cacheEntryPath(root, request);
  mkdirSync(entry, { recursive: true });
  writeFileSync(resolve(entry, "artifact"), bytes);
  writeFileSync(
    resolve(entry, "cache-entry.json"),
    `${canonicalJson({
      schemaVersion: 1,
      artifactKind: "mergora-verified-cache-entry",
      key,
      artifact: "artifact",
      digest: request.digest,
      bytes: bytes.byteLength,
      ...metadataOverrides,
    })}\n`,
  );
  return entry;
}
