import { randomBytes } from "node:crypto";
import {
  closeSync,
  constants,
  existsSync,
  fstatSync,
  fsyncSync,
  lstatSync,
  mkdirSync,
  openSync,
  readFileSync,
  readdirSync,
  realpathSync,
  renameSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { relative, resolve } from "node:path";

import { CliError, canonicalJson, sha256 } from "./contracts.js";
import { OFFICIAL_REGISTRY_ORIGIN } from "./registry-data.js";

const DIGEST = /^sha256:[a-f0-9]{64}$/u;
const REGISTRY_ID = /^[a-z0-9]+(?:-[a-z0-9]+)*$/u;
const RELEASE_PATH = /^[A-Za-z0-9][A-Za-z0-9._/-]{0,2047}$/u;
const MEDIA_TYPE = /^[a-z0-9!#$&^_.+-]+\/[a-z0-9!#$&^_.+-]+$/u;
const MAX_ARTIFACT_BYTES = 64 * 1024 * 1024;
const MAX_METADATA_BYTES = 16 * 1024;
const DEFAULT_TIMEOUT_MS = 15_000;
const CACHE_ROOT = ".mergora/cache/entries";

export type AcquisitionDigest = `sha256:${string}`;
export type AcquisitionSource = "network" | "verified-cache" | "vendor" | "mirror";
export type AcquisitionTrust = "official" | "enrolled" | "local-development";

export interface AcquisitionRegistryIdentity {
  readonly id: string;
  readonly origin: string;
  readonly identityDigest: AcquisitionDigest;
  readonly trust: AcquisitionTrust;
}

export interface ImmutableArtifactRequest {
  readonly registry: AcquisitionRegistryIdentity;
  /** Origin-relative immutable artifact path, without a leading slash. */
  readonly path: string;
  readonly digest: AcquisitionDigest;
  /** Exact byte count from the immutable manifest, when available. */
  readonly bytes?: number | undefined;
  readonly maxBytes: number;
  readonly acceptedMediaTypes: readonly string[];
  /** Optional immutable release identity used by document validators. */
  readonly release?: string | undefined;
}

export interface AcquisitionValidationContext {
  readonly request: ImmutableArtifactRequest;
  readonly source: AcquisitionSource;
  readonly resolvedUrl: string | null;
}

export type AcquisitionValidator = (
  bytes: Uint8Array,
  context: AcquisitionValidationContext,
) => void | Promise<void>;

export type AcquisitionVendorReader = (
  request: ImmutableArtifactRequest,
) => Uint8Array | null | Promise<Uint8Array | null>;

export interface AcquisitionTransportRequest {
  readonly url: string;
  readonly acceptedMediaTypes: readonly string[];
  readonly maxBytes: number;
  readonly timeoutMs: number;
}

export interface AcquisitionTransportResponse {
  readonly status: number;
  /** Final response URL. It must remain byte-for-byte equal to the requested URL. */
  readonly url: string;
  readonly contentType: string | null;
  readonly contentLength: number | null;
  readonly bytes: Uint8Array;
}

export type AcquisitionTransport = (
  request: AcquisitionTransportRequest,
) => Promise<AcquisitionTransportResponse>;

export interface AcquireImmutableArtifactOptions {
  readonly request: ImmutableArtifactRequest;
  readonly projectRoot: string;
  readonly offline?: boolean | undefined;
  readonly mirrorOrigins?: readonly string[] | undefined;
  readonly vendor?: AcquisitionVendorReader | undefined;
  readonly validate?: AcquisitionValidator | undefined;
  readonly transport?: AcquisitionTransport | undefined;
  readonly timeoutMs?: number | undefined;
  /** Network acquisitions fill the ordinary verified cache unless explicitly disabled. */
  readonly writeCache?: boolean | undefined;
}

export interface AcquisitionAttempt {
  readonly source: "network" | "mirror";
  readonly origin: string;
  readonly outcome: "availability-failure" | "success";
}

export interface AcquiredImmutableArtifact {
  readonly bytes: Uint8Array;
  readonly digest: AcquisitionDigest;
  readonly source: AcquisitionSource;
  readonly registry: AcquisitionRegistryIdentity;
  readonly resolvedUrl: string | null;
  readonly cacheWritten: boolean;
  readonly attempts: readonly AcquisitionAttempt[];
}

interface NormalizedRequest {
  readonly request: ImmutableArtifactRequest;
  readonly origin: string;
  readonly acceptedMediaTypes: readonly string[];
  readonly cacheKey: string;
}

interface CacheMetadata {
  readonly schemaVersion: 1;
  readonly artifactKind: "mergora-verified-cache-entry";
  readonly key: string;
  readonly artifact: "artifact";
  readonly digest: AcquisitionDigest;
  readonly bytes: number;
}

class AvailabilityFailure extends Error {
  public constructor(message: string) {
    super(message);
    this.name = "AvailabilityFailure";
  }
}

function acquisitionError(
  message: string,
  code: string,
  exitCode: 4 | 5 | 8 | 11 = 5,
  target?: string,
): CliError {
  return new CliError(message, {
    code,
    exitCode,
    ...(target === undefined ? {} : { target }),
  });
}

function normalizeOrigin(raw: string, trust: AcquisitionTrust, label: string): string {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw acquisitionError(`${label} is not a valid URL.`, "REGISTRY_ORIGIN_INVALID");
  }
  const localHttp =
    trust === "local-development" &&
    url.protocol === "http:" &&
    (url.hostname === "localhost" || url.hostname === "127.0.0.1" || url.hostname === "[::1]");
  if ((url.protocol !== "https:" && !localHttp) || url.username !== "" || url.password !== "") {
    throw acquisitionError(
      `${label} must use HTTPS without embedded credentials.`,
      "REGISTRY_ORIGIN_UNSAFE",
    );
  }
  if (url.search !== "" || url.hash !== "") {
    throw acquisitionError(
      `${label} cannot contain a query or fragment.`,
      "REGISTRY_ORIGIN_INVALID",
    );
  }
  url.pathname = url.pathname.replace(/\/+$/u, "");
  return url.toString().replace(/\/$/u, "");
}

function assertReleasePath(path: string): void {
  if (
    !RELEASE_PATH.test(path) ||
    path.includes("\\") ||
    path.includes("//") ||
    path.includes("%") ||
    path.normalize("NFKC") !== path ||
    path.split("/").some((segment) => segment === "." || segment === ".." || segment === "")
  ) {
    throw acquisitionError(
      "Immutable artifact path is not portable and origin-relative.",
      "REGISTRY_ARTIFACT_PATH_UNSAFE",
    );
  }
}

function normalizeRequest(request: ImmutableArtifactRequest): NormalizedRequest {
  if (
    !REGISTRY_ID.test(request.registry.id) ||
    request.registry.id.normalize("NFKC") !== request.registry.id
  ) {
    throw acquisitionError("Registry ID is invalid.", "REGISTRY_IDENTITY_INVALID");
  }
  if (!DIGEST.test(request.registry.identityDigest) || !DIGEST.test(request.digest)) {
    throw acquisitionError("Registry or artifact digest is invalid.", "REGISTRY_DIGEST_INVALID");
  }
  if (!(["official", "enrolled", "local-development"] as const).includes(request.registry.trust)) {
    throw acquisitionError(
      "Registry trust classification is invalid.",
      "REGISTRY_IDENTITY_INVALID",
    );
  }
  assertReleasePath(request.path);
  const origin = normalizeOrigin(
    request.registry.origin,
    request.registry.trust,
    "Registry origin",
  );
  if (
    request.registry.trust === "official" &&
    (request.registry.id !== "official" ||
      origin !== OFFICIAL_REGISTRY_ORIGIN ||
      request.registry.identityDigest !==
        sha256(
          canonicalJson({ id: "official", origin: OFFICIAL_REGISTRY_ORIGIN, trust: "official" }),
        ))
  ) {
    throw acquisitionError(
      "Official registry identity digest does not match its canonical identity.",
      "REGISTRY_IDENTITY_INVALID",
    );
  }
  if (
    !Number.isSafeInteger(request.maxBytes) ||
    request.maxBytes < 1 ||
    request.maxBytes > MAX_ARTIFACT_BYTES
  ) {
    throw acquisitionError(
      "Artifact byte limit is outside the supported range.",
      "REGISTRY_LIMIT_INVALID",
    );
  }
  if (
    request.bytes !== undefined &&
    (!Number.isSafeInteger(request.bytes) || request.bytes < 0 || request.bytes > request.maxBytes)
  ) {
    throw acquisitionError("Expected artifact byte count is invalid.", "REGISTRY_LIMIT_INVALID");
  }
  const acceptedMediaTypes = [
    ...new Set(request.acceptedMediaTypes.map((value) => value.toLowerCase())),
  ].sort((left, right) => left.localeCompare(right, "en-US"));
  if (
    acceptedMediaTypes.length === 0 ||
    acceptedMediaTypes.length > 8 ||
    acceptedMediaTypes.some((value) => !MEDIA_TYPE.test(value))
  ) {
    throw acquisitionError(
      "Accepted artifact media types are invalid.",
      "REGISTRY_MEDIA_POLICY_INVALID",
    );
  }
  const requestSnapshot: ImmutableArtifactRequest = {
    registry: { ...request.registry },
    path: request.path,
    digest: request.digest,
    ...(request.bytes === undefined ? {} : { bytes: request.bytes }),
    maxBytes: request.maxBytes,
    acceptedMediaTypes: [...request.acceptedMediaTypes],
    ...(request.release === undefined ? {} : { release: request.release }),
  };
  return {
    request: requestSnapshot,
    origin,
    acceptedMediaTypes,
    cacheKey: request.digest.slice("sha256:".length),
  };
}

function assertInsideRoot(root: string, candidate: string): void {
  const rel = relative(root, candidate);
  if (rel === "" || rel === ".") return;
  if (rel.startsWith("..") || resolve(root, rel) !== candidate) {
    throw acquisitionError("Cache path escapes the project root.", "REGISTRY_CACHE_PATH_UNSAFE", 8);
  }
}

function projectRoot(projectRoot: string): string {
  const requested = resolve(projectRoot);
  const metadata = lstatSync(requested);
  if (!metadata.isDirectory() || metadata.isSymbolicLink()) {
    throw acquisitionError(
      "Project root is not a safe directory.",
      "REGISTRY_CACHE_PATH_UNSAFE",
      8,
    );
  }
  return realpathSync(requested);
}

function assertNoSymlinkAncestors(root: string, path: string): void {
  if (
    path.startsWith("/") ||
    path.includes("\\") ||
    path.normalize("NFKC") !== path ||
    path
      .split("/")
      .some((segment) => !/^[A-Za-z0-9._-]+$/u.test(segment) || segment === "." || segment === "..")
  ) {
    throw acquisitionError("Cache path is not portable.", "REGISTRY_CACHE_PATH_UNSAFE", 8);
  }
  let current = root;
  for (const segment of path.split("/")) {
    current = resolve(current, segment);
    assertInsideRoot(root, current);
    if (!existsSync(current)) continue;
    const metadata = lstatSync(current);
    if (metadata.isSymbolicLink()) {
      throw acquisitionError(
        `Cache path ${path} traverses a symbolic link.`,
        "REGISTRY_CACHE_PATH_UNSAFE",
        8,
      );
    }
  }
}

function readBoundedFile(path: string, maxBytes: number): Buffer {
  const noFollow = "O_NOFOLLOW" in constants ? constants.O_NOFOLLOW : 0;
  const descriptor = openSync(path, constants.O_RDONLY | noFollow);
  try {
    const before = fstatSync(descriptor);
    if (!before.isFile() || before.size > maxBytes) {
      throw acquisitionError(
        "Verified cache artifact exceeds its byte limit.",
        "REGISTRY_CACHE_INVALID",
        8,
      );
    }
    const bytes = readFileSync(descriptor);
    const after = fstatSync(descriptor);
    if (before.dev !== after.dev || before.ino !== after.ino || before.size !== after.size) {
      throw acquisitionError(
        "Verified cache artifact changed while reading.",
        "REGISTRY_CACHE_INVALID",
        8,
      );
    }
    return bytes;
  } finally {
    closeSync(descriptor);
  }
}

function exactMetadata(value: unknown): CacheMetadata {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw acquisitionError("Verified cache metadata is invalid.", "REGISTRY_CACHE_INVALID", 8);
  }
  const record = value as Record<string, unknown>;
  const expected = ["artifact", "artifactKind", "bytes", "digest", "key", "schemaVersion"];
  if (JSON.stringify(Object.keys(record).sort()) !== JSON.stringify(expected)) {
    throw acquisitionError(
      "Verified cache metadata fields are invalid.",
      "REGISTRY_CACHE_INVALID",
      8,
    );
  }
  if (
    record.schemaVersion !== 1 ||
    record.artifactKind !== "mergora-verified-cache-entry" ||
    record.artifact !== "artifact" ||
    typeof record.key !== "string" ||
    typeof record.digest !== "string" ||
    !DIGEST.test(record.digest) ||
    !Number.isSafeInteger(record.bytes) ||
    Number(record.bytes) < 0
  ) {
    throw acquisitionError(
      "Verified cache metadata values are invalid.",
      "REGISTRY_CACHE_INVALID",
      8,
    );
  }
  return record as unknown as CacheMetadata;
}

function readCache(root: string, normalized: NormalizedRequest): Uint8Array | null {
  const entryRelative = `${CACHE_ROOT}/${normalized.cacheKey}`;
  assertNoSymlinkAncestors(root, entryRelative);
  const entry = resolve(root, ...entryRelative.split("/"));
  if (!existsSync(entry)) return null;
  const metadata = lstatSync(entry);
  if (!metadata.isDirectory() || metadata.isSymbolicLink()) {
    throw acquisitionError(
      "Verified cache entry is not a safe directory.",
      "REGISTRY_CACHE_INVALID",
      8,
    );
  }
  const names = ["artifact", "cache-entry.json"];
  if (
    JSON.stringify(readdirSync(entry).sort((left, right) => left.localeCompare(right, "en-US"))) !==
    JSON.stringify(names)
  ) {
    throw acquisitionError(
      "Verified cache entry contains unknown files.",
      "REGISTRY_CACHE_INVALID",
      8,
    );
  }
  for (const name of names) {
    const file = resolve(entry, name);
    if (!existsSync(file) || lstatSync(file).isSymbolicLink()) {
      throw acquisitionError(
        "Verified cache entry is incomplete or unsafe.",
        "REGISTRY_CACHE_INVALID",
        8,
      );
    }
  }
  const rawMetadata = readBoundedFile(resolve(entry, "cache-entry.json"), MAX_METADATA_BYTES);
  let parsed: unknown;
  try {
    parsed = JSON.parse(rawMetadata.toString("utf8")) as unknown;
  } catch {
    throw acquisitionError(
      "Verified cache metadata is not valid JSON.",
      "REGISTRY_CACHE_INVALID",
      8,
    );
  }
  let canonicalMetadata: string;
  try {
    canonicalMetadata = canonicalJson(parsed);
  } catch {
    throw acquisitionError(
      "Verified cache metadata cannot be represented as canonical JSON.",
      "REGISTRY_CACHE_INVALID",
      8,
    );
  }
  if (rawMetadata.toString("utf8") !== `${canonicalMetadata}\n`) {
    throw acquisitionError(
      "Verified cache metadata is not canonical or contains duplicate object keys.",
      "REGISTRY_CACHE_INVALID",
      8,
    );
  }
  const cache = exactMetadata(parsed);
  const bytes = readBoundedFile(resolve(entry, "artifact"), normalized.request.maxBytes);
  if (
    cache.key !== normalized.cacheKey ||
    cache.digest !== normalized.request.digest ||
    cache.bytes !== bytes.byteLength ||
    sha256(bytes) !== normalized.request.digest
  ) {
    throw acquisitionError(
      "Verified cache entry failed digest verification.",
      "REGISTRY_CACHE_TAMPERED",
      8,
    );
  }
  return bytes;
}

function writeExclusiveFile(path: string, bytes: Uint8Array): void {
  const descriptor = openSync(path, "wx", 0o600);
  try {
    writeFileSync(descriptor, bytes);
    fsyncSync(descriptor);
  } finally {
    closeSync(descriptor);
  }
}

function ensureSafeDirectory(root: string, relativePath: string): string {
  assertNoSymlinkAncestors(root, relativePath);
  let current = root;
  for (const segment of relativePath.split("/")) {
    current = resolve(current, segment);
    assertInsideRoot(root, current);
    if (existsSync(current)) {
      const metadata = lstatSync(current);
      if (!metadata.isDirectory() || metadata.isSymbolicLink()) {
        throw acquisitionError(
          "Cache root is not a safe directory.",
          "REGISTRY_CACHE_PATH_UNSAFE",
          8,
        );
      }
    } else {
      try {
        mkdirSync(current, { mode: 0o700 });
      } catch (error) {
        if (!existsSync(current)) throw error;
        const metadata = lstatSync(current);
        if (!metadata.isDirectory() || metadata.isSymbolicLink()) {
          throw acquisitionError(
            "Cache root became unsafe while it was created.",
            "REGISTRY_CACHE_PATH_UNSAFE",
            8,
          );
        }
      }
    }
  }
  return current;
}

function writeCache(root: string, normalized: NormalizedRequest, bytes: Uint8Array): boolean {
  const entries = ensureSafeDirectory(root, CACHE_ROOT);
  const destination = resolve(entries, normalized.cacheKey);
  if (existsSync(destination)) {
    readCache(root, normalized);
    return false;
  }
  const temporaryRoot = ensureSafeDirectory(root, ".mergora/tmp");
  const temporary = resolve(temporaryRoot, `acquisition-${randomBytes(16).toString("hex")}`);
  assertInsideRoot(root, temporary);
  mkdirSync(temporary, { mode: 0o700 });
  try {
    writeExclusiveFile(resolve(temporary, "artifact"), bytes);
    const metadata: CacheMetadata = {
      schemaVersion: 1,
      artifactKind: "mergora-verified-cache-entry",
      key: normalized.cacheKey,
      artifact: "artifact",
      digest: normalized.request.digest,
      bytes: bytes.byteLength,
    };
    writeExclusiveFile(
      resolve(temporary, "cache-entry.json"),
      Buffer.from(`${canonicalJson(metadata)}\n`, "utf8"),
    );
    try {
      renameSync(temporary, destination);
    } catch (error) {
      if (!existsSync(destination)) throw error;
      readCache(root, normalized);
      return false;
    }
    return true;
  } finally {
    if (existsSync(temporary)) rmSync(temporary, { recursive: true, force: true });
  }
}

function validateBytes(normalized: NormalizedRequest, bytes: Uint8Array): void {
  if (bytes.byteLength > normalized.request.maxBytes) {
    throw acquisitionError(
      "Immutable artifact exceeds its byte limit.",
      "REGISTRY_ARTIFACT_OVERSIZE",
    );
  }
  if (normalized.request.bytes !== undefined && bytes.byteLength !== normalized.request.bytes) {
    throw acquisitionError(
      "Immutable artifact byte count does not match its manifest.",
      "REGISTRY_INTEGRITY_FAILURE",
    );
  }
  if (sha256(bytes) !== normalized.request.digest) {
    throw acquisitionError(
      "Immutable artifact digest does not match its manifest.",
      "REGISTRY_INTEGRITY_FAILURE",
    );
  }
}

function artifactUrl(origin: string, path: string): string {
  return `${origin}/${path}`;
}

function mediaType(value: string | null): string | null {
  if (value === null) return null;
  return value.split(";", 1)[0]!.trim().toLowerCase();
}

async function defaultTransport(
  request: AcquisitionTransportRequest,
): Promise<AcquisitionTransportResponse> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), request.timeoutMs);
  try {
    let response: Response;
    try {
      response = await fetch(request.url, {
        method: "GET",
        redirect: "manual",
        credentials: "omit",
        referrerPolicy: "no-referrer",
        headers: { Accept: request.acceptedMediaTypes.join(", ") },
        signal: controller.signal,
      });
    } catch {
      throw new AvailabilityFailure("Registry request failed before a response was received.");
    }
    if (response.status !== 200) {
      await response.body?.cancel();
      return {
        status: response.status,
        url: response.url || request.url,
        contentType: response.headers.get("content-type"),
        contentLength: null,
        bytes: new Uint8Array(),
      };
    }
    const declaredLength = response.headers.get("content-length");
    const contentLength = declaredLength === null ? null : Number(declaredLength);
    if (
      contentLength !== null &&
      (!Number.isSafeInteger(contentLength) ||
        contentLength < 0 ||
        contentLength > request.maxBytes)
    ) {
      throw acquisitionError(
        "Registry response exceeds its declared byte limit.",
        "REGISTRY_ARTIFACT_OVERSIZE",
      );
    }
    const chunks: Uint8Array[] = [];
    let total = 0;
    if (response.body !== null) {
      const reader = response.body.getReader();
      for (;;) {
        const result = await reader.read();
        if (result.done) break;
        total += result.value.byteLength;
        if (total > request.maxBytes) {
          await reader.cancel();
          throw acquisitionError(
            "Registry response exceeds its byte limit.",
            "REGISTRY_ARTIFACT_OVERSIZE",
          );
        }
        chunks.push(result.value);
      }
    }
    const bytes = Buffer.concat(
      chunks.map((chunk) => Buffer.from(chunk)),
      total,
    );
    return {
      status: response.status,
      url: response.url || request.url,
      contentType: response.headers.get("content-type"),
      contentLength,
      bytes,
    };
  } finally {
    clearTimeout(timer);
  }
}

async function validateAcquisition(
  normalized: NormalizedRequest,
  bytes: Uint8Array,
  source: AcquisitionSource,
  resolvedUrl: string | null,
  validate: AcquisitionValidator | undefined,
): Promise<void> {
  validateBytes(normalized, bytes);
  try {
    await validate?.(Uint8Array.from(bytes), {
      request: {
        ...normalized.request,
        registry: { ...normalized.request.registry },
        acceptedMediaTypes: [...normalized.request.acceptedMediaTypes],
      },
      source,
      resolvedUrl,
    });
  } catch (error) {
    if (error instanceof CliError) throw error;
    throw acquisitionError(
      "Immutable artifact failed its registry identity, release, or schema validation.",
      "REGISTRY_DOCUMENT_INVALID",
    );
  }
}

async function acquireNetworkCandidate(
  normalized: NormalizedRequest,
  source: "network" | "mirror",
  origin: string,
  transport: AcquisitionTransport,
  timeoutMs: number,
): Promise<{ readonly bytes: Uint8Array; readonly url: string }> {
  const url = artifactUrl(origin, normalized.request.path);
  let response: AcquisitionTransportResponse;
  try {
    response = await transport({
      url,
      acceptedMediaTypes: [...normalized.acceptedMediaTypes],
      maxBytes: normalized.request.maxBytes,
      timeoutMs,
    });
  } catch (error) {
    if (error instanceof CliError) throw error;
    throw new AvailabilityFailure(
      error instanceof AvailabilityFailure ? error.message : `${source} request failed.`,
    );
  }
  if (response.status === 401 || response.status === 403) {
    throw acquisitionError(
      "Registry authentication or authorization is required.",
      "REGISTRY_AUTH_REQUIRED",
      11,
    );
  }
  if (
    response.status === 404 ||
    response.status === 408 ||
    response.status === 429 ||
    response.status >= 500
  ) {
    throw new AvailabilityFailure(
      `${source} returned unavailable status ${String(response.status)}.`,
    );
  }
  if (response.status !== 200) {
    throw acquisitionError(
      `Registry returned disallowed status ${String(response.status)}; redirects are never followed.`,
      "REGISTRY_HTTP_FAILURE",
    );
  }
  if (response.url !== url) {
    throw acquisitionError(
      "Registry response crossed an unapproved redirect.",
      "REGISTRY_REDIRECT_REFUSED",
    );
  }
  const actualMediaType = mediaType(response.contentType);
  if (actualMediaType === null || !normalized.acceptedMediaTypes.includes(actualMediaType)) {
    throw acquisitionError(
      "Registry response media type is not allowed.",
      "REGISTRY_MEDIA_TYPE_INVALID",
    );
  }
  if (response.contentLength !== null && response.contentLength !== response.bytes.byteLength) {
    throw acquisitionError(
      "Registry response byte count contradicts Content-Length.",
      "REGISTRY_INTEGRITY_FAILURE",
    );
  }
  validateBytes(normalized, response.bytes);
  return { bytes: response.bytes, url };
}

/**
 * Resolves one manifest-bound immutable artifact without weakening identity or
 * digest checks across vendor, cache, canonical network, or mirror sources.
 */
export async function acquireImmutableArtifact(
  options: AcquireImmutableArtifactOptions,
): Promise<AcquiredImmutableArtifact> {
  const normalized = normalizeRequest(options.request);
  const root = projectRoot(options.projectRoot);
  const offline = options.offline ?? false;
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  if (!Number.isSafeInteger(timeoutMs) || timeoutMs < 100 || timeoutMs > 120_000) {
    throw acquisitionError(
      "Registry timeout is outside the supported range.",
      "REGISTRY_LIMIT_INVALID",
    );
  }

  const validateLocal = async (
    bytes: Uint8Array,
    source: "vendor" | "verified-cache",
  ): Promise<AcquiredImmutableArtifact> => {
    await validateAcquisition(normalized, bytes, source, null, options.validate);
    return {
      bytes: Uint8Array.from(bytes),
      digest: normalized.request.digest,
      source,
      registry: normalized.request.registry,
      resolvedUrl: null,
      cacheWritten: false,
      attempts: [],
    };
  };

  if (offline && options.vendor !== undefined) {
    const vendorBytes = await options.vendor({
      ...normalized.request,
      registry: { ...normalized.request.registry },
      acceptedMediaTypes: [...normalized.request.acceptedMediaTypes],
    });
    if (vendorBytes !== null) return validateLocal(vendorBytes, "vendor");
  }

  const cached = readCache(root, normalized);
  if (cached !== null) return validateLocal(cached, "verified-cache");

  if (!offline && options.vendor !== undefined) {
    const vendorBytes = await options.vendor({
      ...normalized.request,
      registry: { ...normalized.request.registry },
      acceptedMediaTypes: [...normalized.request.acceptedMediaTypes],
    });
    if (vendorBytes !== null) return validateLocal(vendorBytes, "vendor");
  }

  if (offline) {
    throw acquisitionError(
      `Offline mode is missing immutable artifact ${normalized.request.digest}.`,
      "REGISTRY_EVIDENCE_MISSING",
      4,
      normalized.request.path,
    );
  }

  const mirrors = [
    ...new Set(
      (options.mirrorOrigins ?? []).map((origin) =>
        normalizeOrigin(origin, "official", "Mirror origin"),
      ),
    ),
  ].filter((origin) => origin !== normalized.origin);
  if (mirrors.length > 8) {
    throw acquisitionError("Mirror count exceeds the supported limit.", "REGISTRY_LIMIT_INVALID");
  }
  const candidates = [
    { source: "network" as const, origin: normalized.origin },
    ...mirrors.map((origin) => ({ source: "mirror" as const, origin })),
  ];
  const attempts: AcquisitionAttempt[] = [];
  const transport = options.transport ?? defaultTransport;
  for (const candidate of candidates) {
    try {
      const acquired = await acquireNetworkCandidate(
        normalized,
        candidate.source,
        candidate.origin,
        transport,
        timeoutMs,
      );
      await validateAcquisition(
        normalized,
        acquired.bytes,
        candidate.source,
        acquired.url,
        options.validate,
      );
      attempts.push({ ...candidate, outcome: "success" });
      const cacheWritten =
        options.writeCache === false ? false : writeCache(root, normalized, acquired.bytes);
      return {
        bytes: Uint8Array.from(acquired.bytes),
        digest: normalized.request.digest,
        source: candidate.source,
        registry: normalized.request.registry,
        resolvedUrl: acquired.url,
        cacheWritten,
        attempts,
      };
    } catch (error) {
      if (!(error instanceof AvailabilityFailure)) throw error;
      attempts.push({ ...candidate, outcome: "availability-failure" });
    }
  }
  throw acquisitionError(
    `Canonical registry and ${String(mirrors.length)} configured mirror(s) could not supply immutable artifact ${normalized.request.digest}.`,
    "REGISTRY_NETWORK_FAILURE",
    4,
    normalized.request.path,
  );
}
