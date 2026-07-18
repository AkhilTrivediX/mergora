import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

import {
  assertPortableRelativePath,
  canonicalJson,
  CliError,
  portableSort,
  sha256,
  validatedProjectRoot,
} from "./contracts.js";
import {
  readMergoraConfig,
  validateMergoraConfig,
  type MergoraConfig,
  type MergoraRegistryConfig,
} from "./configuration.js";
import { readManifest } from "./source-operations.js";
import {
  executeTransaction,
  type OperationPlan,
  type TransactionMutation,
  type TransactionResult,
} from "./transaction-engine.js";

const REGISTRY_ID = /^[a-z0-9]+(?:-[a-z0-9]+)*$/u;
const ENVIRONMENT_VARIABLE = /^[A-Z_][A-Z0-9_]*$/u;
const DIGEST = /^sha256:[a-f0-9]{64}$/u;
const SEMVER =
  /^(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)(?:-[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?(?:\+[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?$/u;
const SEMVER_RANGE =
  /^(?!.*(?:git|https?|file|workspace|link|portal|patch|github):)[-0-9A-Za-z*<>=~^|. +]+$/u;
const SPDX = /^[A-Za-z0-9][A-Za-z0-9-.+]*(?: WITH [A-Za-z0-9][A-Za-z0-9-.+]*)?$/u;
const PACKAGE_NAME = /^(?:@[a-z0-9][a-z0-9._-]*\/)?[a-z0-9][a-z0-9._-]*$/u;
const QUALIFIED_ITEM = /^[a-z0-9]+(?:-[a-z0-9]+)*:[a-z0-9]+(?:-[a-z0-9]+)*$/u;
const REDIRECT_STATUS = new Set([301, 302, 303, 307, 308]);
const DEFAULT_MAX_CATALOG_BYTES = 4 * 1024 * 1024;
const DEFAULT_MAX_ITEM_BYTES = 2 * 1024 * 1024;
const DEFAULT_TIMEOUT_MILLISECONDS = 10_000;
const DEFAULT_MAX_REDIRECTS = 3;
const MAX_JSON_DEPTH = 64;
const MAX_CATALOG_ITEMS = 4096;

export type RegistryProtocol = MergoraRegistryConfig["protocol"];
export type RegistryTrust = MergoraRegistryConfig["trust"];
export type RegistryConfigCommand = "registry-enroll" | "registry-remove";

export interface RegistryNetworkPolicy {
  readonly maxBytes?: number | undefined;
  readonly maxRedirects?: number | undefined;
  readonly timeoutMilliseconds?: number | undefined;
}

export interface RegistryFetchOptions extends RegistryNetworkPolicy {
  readonly fetchImplementation?: typeof fetch | undefined;
  readonly environment?: Readonly<Record<string, string | undefined>> | undefined;
}

export interface RegistryPolicySummary {
  readonly license: {
    readonly status: "observed" | "not-inspected" | "not-supplied";
    readonly licenses: readonly string[];
  };
  readonly dependencies: {
    readonly status: "observed" | "not-inspected";
    readonly directReferences: number | null;
    readonly uniqueReferences: readonly string[];
  };
  readonly risk: {
    readonly status: "observed" | "not-inspected" | "not-supplied";
    readonly maximumClass: 1 | 2 | 3 | null;
  };
  readonly quality: {
    readonly status: "observed" | "not-inspected" | "not-supplied";
    readonly tiers: readonly string[];
  };
}

export interface RegistryListEntry extends RegistryPolicySummary {
  readonly id: string;
  readonly protocol: RegistryProtocol;
  readonly origin: string;
  readonly trust: RegistryTrust;
  readonly identityDigest: `sha256:${string}` | null;
  readonly authEnvironmentVariable: string | null;
  readonly installedItems: readonly string[];
  readonly installedDependents: readonly string[];
}

export interface RegistryIdentityBinding {
  readonly protocol: RegistryProtocol;
  readonly resolvedOrigin: string;
  readonly declaredRegistry: {
    readonly id: string;
    readonly identityDigest: `sha256:${string}`;
  };
  readonly licensePolicy: {
    readonly status: "observed" | "not-supplied";
    readonly licenses: readonly string[];
  };
  readonly keyPolicy: {
    readonly digest: "sha256" | "not-supplied";
    readonly immutableReleaseManifests: boolean;
    readonly signatures: "not-supplied";
  };
}

export interface RegistryCatalogItemSummary {
  readonly id: string;
  readonly license: string | null;
  readonly registryDependencies: readonly string[];
  readonly riskClass: 1 | 2 | 3 | null;
  readonly qualityTier: "complete" | "partial" | "not-supplied" | null;
  readonly payloadUrl: string | null;
}

export interface RegistryMetadata extends RegistryPolicySummary {
  readonly protocol: RegistryProtocol;
  readonly requestedOrigin: string;
  readonly resolvedOrigin: string;
  readonly redirects: readonly { readonly from: string; readonly to: string }[];
  readonly declaredRegistryId: string;
  readonly declaredIdentityDigest: `sha256:${string}`;
  readonly identityBinding: RegistryIdentityBinding;
  readonly identityDigest: `sha256:${string}`;
  readonly currentStableRelease: string | null;
  readonly catalogDigest: `sha256:${string}`;
  readonly catalogBytes: number;
  readonly catalogUrl: string;
  readonly items: readonly RegistryCatalogItemSummary[];
  readonly keyPolicy: RegistryIdentityBinding["keyPolicy"];
}

export interface RegistryInspection {
  readonly registry: RegistryListEntry;
  readonly network: "used" | "forbidden";
  readonly metadata: RegistryMetadata | null;
  readonly identityStatus: "match" | "mismatch" | "not-pinned" | "not-checked";
  readonly missingEvidence: readonly string[];
}

export type RegistryConfigOperationPlan = Omit<OperationPlan, "command"> & {
  readonly command: RegistryConfigCommand;
};

export interface RegistryConfigPatch {
  readonly target: "mergora.json";
  readonly beforeDigest: `sha256:${string}`;
  readonly afterDigest: `sha256:${string}`;
  readonly beforeConfigDigest: `sha256:${string}`;
  readonly afterConfigDigest: `sha256:${string}`;
}

export interface RegistryConfigPlan {
  readonly plan: RegistryConfigOperationPlan;
  readonly patch: RegistryConfigPatch;
  readonly proposedConfig: MergoraConfig;
  readonly mutation: TransactionMutation;
  readonly registry: RegistryListEntry;
  readonly metadata: RegistryMetadata | null;
}

export interface RegistryEnrollmentOptions extends RegistryFetchOptions {
  readonly projectRoot: string;
  readonly id: string;
  readonly origin: string;
  readonly protocol?: RegistryProtocol | undefined;
  readonly authEnvironmentVariable?: string | undefined;
  readonly allowInsecureLocalhost?: boolean | undefined;
}

export interface RegistryRemovalOptions {
  readonly projectRoot: string;
  readonly id: string;
}

export interface ApplyRegistryConfigOptions {
  readonly expectedPlanDigest?: string | undefined;
  readonly acceptRegistryIdentity?: string | undefined;
  readonly commandArguments?: readonly string[] | undefined;
}

export interface RegistryVerification extends RegistryInspection {
  readonly ok: boolean;
  readonly status: "verified" | "incomplete" | "identity-mismatch";
  readonly checks: readonly {
    readonly id: string;
    readonly state: "pass" | "fail" | "unavailable";
    readonly detail: string;
  }[];
  readonly sample: {
    readonly itemId: string;
    readonly url: string;
    readonly digest: `sha256:${string}`;
  } | null;
}

interface BoundedJsonResponse {
  readonly bytes: Uint8Array;
  readonly value: unknown;
  readonly finalUrl: string;
  readonly redirects: readonly { readonly from: string; readonly to: string }[];
  readonly digest: `sha256:${string}`;
}

interface NativeCatalog {
  readonly registryId: string;
  readonly registryOrigin: string;
  readonly declaredIdentityDigest: `sha256:${string}`;
  readonly currentStable: string;
  readonly dependencyGraphDigest: `sha256:${string}`;
  readonly items: readonly RegistryCatalogItemSummary[];
}

interface ReleaseManifestSample {
  readonly itemId: string;
  readonly url: string;
  readonly digest: `sha256:${string}`;
  readonly bytes: number;
}

function registryError(
  message: string,
  code: string,
  exitCode: 2 | 3 | 5 | 7 | 8 = 5,
  target?: string,
): CliError {
  return new CliError(message, {
    code,
    exitCode,
    ...(target === undefined ? {} : { target }),
  });
}

function objectValue(value: unknown, label: string): Record<string, unknown> {
  if (value === null || Array.isArray(value) || typeof value !== "object") {
    throw registryError(`${label} must be an object.`, "REGISTRY_METADATA_SCHEMA_INVALID");
  }
  return value as Record<string, unknown>;
}

function exactKeys(
  value: Record<string, unknown>,
  required: readonly string[],
  optional: readonly string[],
  label: string,
): void {
  const allowed = new Set([...required, ...optional]);
  if (
    required.some((key) => !Object.hasOwn(value, key)) ||
    Object.keys(value).some((key) => !allowed.has(key))
  ) {
    throw registryError(
      `${label} has missing or unknown fields.`,
      "REGISTRY_METADATA_SCHEMA_INVALID",
    );
  }
}

function stringValue(
  value: unknown,
  label: string,
  options: { readonly max?: number | undefined; readonly pattern?: RegExp | undefined } = {},
): string {
  if (
    typeof value !== "string" ||
    value.length < 1 ||
    value.length > (options.max ?? 4096) ||
    value !== value.normalize("NFKC") ||
    (options.pattern !== undefined && !options.pattern.test(value))
  ) {
    throw registryError(`${label} is invalid.`, "REGISTRY_METADATA_SCHEMA_INVALID");
  }
  return value;
}

function stringArray(
  value: unknown,
  label: string,
  options: {
    readonly max?: number | undefined;
    readonly pattern?: RegExp | undefined;
    readonly itemMax?: number | undefined;
  } = {},
): readonly string[] {
  if (!Array.isArray(value) || value.length > (options.max ?? 256)) {
    throw registryError(`${label} is invalid.`, "REGISTRY_METADATA_SCHEMA_INVALID");
  }
  const result = value.map((entry, index) =>
    stringValue(entry, `${label}[${String(index)}]`, {
      max: options.itemMax,
      pattern: options.pattern,
    }),
  );
  if (new Set(result).size !== result.length) {
    throw registryError(`${label} contains duplicates.`, "REGISTRY_METADATA_SCHEMA_INVALID");
  }
  return result;
}

function assertRegistryId(id: string, label = "Registry ID"): void {
  if (id.length > 128 || !REGISTRY_ID.test(id)) {
    throw registryError(
      `${label} must be lowercase portable kebab-case.`,
      "REGISTRY_ID_INVALID",
      2,
    );
  }
}

function assertEnvironmentVariableName(name: string): void {
  if (name.length > 128 || !ENVIRONMENT_VARIABLE.test(name)) {
    throw registryError(
      "Registry authentication must name one portable uppercase environment variable.",
      "REGISTRY_AUTH_ENVIRONMENT_INVALID",
      2,
    );
  }
}

function assertSafePackageReference(reference: string, label: string): void {
  let name = reference;
  let range: string | null = null;

  if (reference.startsWith("@")) {
    const scopeSeparator = reference.indexOf("/");
    const rangeSeparator = reference.lastIndexOf("@");
    if (scopeSeparator < 2) {
      throw registryError(`${label} is unsafe.`, "REGISTRY_DEPENDENCY_INVALID");
    }
    if (rangeSeparator > scopeSeparator) {
      name = reference.slice(0, rangeSeparator);
      range = reference.slice(rangeSeparator + 1);
    }
  } else {
    const rangeSeparator = reference.lastIndexOf("@");
    if (rangeSeparator > 0) {
      name = reference.slice(0, rangeSeparator);
      range = reference.slice(rangeSeparator + 1);
    }
  }

  if (!PACKAGE_NAME.test(name) || (range !== null && !SEMVER_RANGE.test(range))) {
    throw registryError(`${label} is unsafe.`, "REGISTRY_DEPENDENCY_INVALID");
  }
}

function portableShadcnFileKey(value: string, label: string, allowAlias: boolean): string {
  const path = allowAlias && value.startsWith("@") ? value.slice(1) : value;
  try {
    assertPortableRelativePath(path, label);
  } catch (error) {
    if (!(error instanceof CliError)) throw error;
    throw registryError(
      `${label} must be a normalized portable relative path.`,
      "REGISTRY_FILE_PATH_INVALID",
    );
  }
  return value.toLowerCase();
}

function localHttp(url: URL): boolean {
  return url.protocol === "http:" && (url.hostname === "localhost" || url.hostname === "127.0.0.1");
}

export function normalizeRegistryOrigin(
  candidate: string,
  options: { readonly allowInsecureLocalhost?: boolean | undefined } = {},
): string {
  if (
    candidate.length > 2048 ||
    candidate !== candidate.normalize("NFKC") ||
    candidate.includes("\\") ||
    /(?:^|\/)(?:\.{1,2})(?:\/|$)/u.test(candidate) ||
    /%[0-9a-f]{2}/iu.test(candidate) ||
    [...candidate].some((character) => {
      const code = character.codePointAt(0)!;
      return code <= 31 || code === 127;
    })
  ) {
    throw registryError("Registry origin is invalid.", "REGISTRY_ORIGIN_INVALID", 2);
  }
  let parsed: URL;
  try {
    parsed = new URL(candidate);
  } catch {
    throw registryError("Registry origin must be an absolute URL.", "REGISTRY_ORIGIN_INVALID", 2);
  }
  if (
    parsed.username !== "" ||
    parsed.password !== "" ||
    parsed.search !== "" ||
    parsed.hash !== "" ||
    (parsed.protocol !== "https:" && !localHttp(parsed))
  ) {
    throw registryError(
      "Registry origin violates the transport or credential policy.",
      "REGISTRY_ORIGIN_SECURITY_INVALID",
      5,
    );
  }
  if (localHttp(parsed) && options.allowInsecureLocalhost !== true) {
    throw registryError(
      "Loopback HTTP requires the explicit --allow-insecure-localhost acknowledgement.",
      "REGISTRY_LOCALHOST_ACKNOWLEDGEMENT_REQUIRED",
      5,
    );
  }
  if (parsed.pathname.includes("//")) {
    throw registryError(
      "Registry origin contains an ambiguous path.",
      "REGISTRY_ORIGIN_INVALID",
      2,
    );
  }
  parsed.pathname = parsed.pathname === "/" ? "" : parsed.pathname.replace(/\/+$/u, "");
  return parsed.toString().replace(/\/$/u, "");
}

function endpoint(origin: string, name: "catalog.json" | "registry.json"): string {
  return `${origin}/${name}`;
}

function endpointOrigin(url: string, filename: "catalog.json" | "registry.json"): string {
  const parsed = new URL(url);
  const suffix = `/${filename}`;
  if (!parsed.pathname.endsWith(suffix) || parsed.search !== "" || parsed.hash !== "") {
    throw registryError(
      "Registry metadata redirect did not resolve to the requested endpoint.",
      "REGISTRY_REDIRECT_ENDPOINT_INVALID",
    );
  }
  parsed.pathname = parsed.pathname.slice(0, -suffix.length);
  return parsed.toString().replace(/\/$/u, "");
}

function assertJsonDepth(text: string): void {
  let depth = 0;
  let inString = false;
  let escaped = false;
  for (const character of text) {
    if (inString) {
      if (escaped) escaped = false;
      else if (character === "\\") escaped = true;
      else if (character === '"') inString = false;
      continue;
    }
    if (character === '"') inString = true;
    else if (character === "{" || character === "[") {
      depth += 1;
      if (depth > MAX_JSON_DEPTH) {
        throw registryError(
          "Registry JSON exceeds the supported nesting depth.",
          "REGISTRY_JSON_DEPTH_EXCEEDED",
        );
      }
    } else if (character === "}" || character === "]") {
      depth -= 1;
      if (depth < 0) {
        throw registryError("Registry response is invalid JSON.", "REGISTRY_INVALID_JSON");
      }
    }
  }
  if (depth !== 0 || inString || escaped) {
    throw registryError("Registry response is invalid JSON.", "REGISTRY_INVALID_JSON");
  }
}

async function boundedBody(response: Response, maximum: number): Promise<Uint8Array> {
  const contentLength = response.headers.get("content-length");
  if (
    contentLength !== null &&
    (/^[0-9]+$/u.test(contentLength) ? Number(contentLength) : NaN) > maximum
  ) {
    throw registryError(
      "Registry response exceeds the configured byte limit.",
      "REGISTRY_RESPONSE_TOO_LARGE",
    );
  }
  if (response.body === null) return new Uint8Array();
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    for (;;) {
      const entry = await reader.read();
      if (entry.done) break;
      total += entry.value.byteLength;
      if (total > maximum) {
        await reader.cancel();
        throw registryError(
          "Registry response exceeds the configured byte limit.",
          "REGISTRY_RESPONSE_TOO_LARGE",
        );
      }
      chunks.push(entry.value);
    }
  } finally {
    reader.releaseLock();
  }
  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return bytes;
}

async function fetchBoundedJson(
  initialUrl: string,
  options: RegistryFetchOptions & {
    readonly authEnvironmentVariable?: string | undefined;
    readonly authOrigin?: string | undefined;
    readonly allowInsecureLocalhost?: boolean | undefined;
  },
): Promise<BoundedJsonResponse> {
  const fetchImplementation = options.fetchImplementation ?? globalThis.fetch;
  const maximum = options.maxBytes ?? DEFAULT_MAX_CATALOG_BYTES;
  const maxRedirects = options.maxRedirects ?? DEFAULT_MAX_REDIRECTS;
  const timeoutMilliseconds = options.timeoutMilliseconds ?? DEFAULT_TIMEOUT_MILLISECONDS;
  if (
    !Number.isSafeInteger(maximum) ||
    maximum < 1 ||
    maximum > 52_428_800 ||
    !Number.isSafeInteger(maxRedirects) ||
    maxRedirects < 0 ||
    maxRedirects > 10 ||
    !Number.isSafeInteger(timeoutMilliseconds) ||
    timeoutMilliseconds < 1 ||
    timeoutMilliseconds > 120_000
  ) {
    throw registryError(
      "Registry network bounds are invalid.",
      "REGISTRY_NETWORK_POLICY_INVALID",
      2,
    );
  }
  const authEnvironmentVariable = options.authEnvironmentVariable;
  if (authEnvironmentVariable !== undefined) assertEnvironmentVariableName(authEnvironmentVariable);
  const environment = options.environment ?? process.env;
  const authValue =
    authEnvironmentVariable === undefined ? undefined : environment[authEnvironmentVariable];
  const authOrigin =
    options.authOrigin === undefined
      ? new URL(initialUrl).origin
      : new URL(options.authOrigin).origin;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMilliseconds);
  let current = initialUrl;
  const redirects: { from: string; to: string }[] = [];
  try {
    for (;;) {
      normalizeRegistryOrigin(new URL(current).origin, {
        allowInsecureLocalhost: options.allowInsecureLocalhost,
      });
      const headers = new Headers({ Accept: "application/json" });
      if (authValue !== undefined && new URL(current).origin === authOrigin) {
        headers.set("Authorization", `Bearer ${authValue}`);
      }
      let response: Response;
      try {
        response = await fetchImplementation(current, {
          headers,
          redirect: "manual",
          signal: controller.signal,
        });
      } catch (error) {
        if (controller.signal.aborted) {
          throw registryError(
            "Registry request exceeded its total timeout.",
            "REGISTRY_TIMEOUT",
            7,
          );
        }
        throw registryError(
          `Registry request failed: ${error instanceof Error ? error.name : "network error"}.`,
          "REGISTRY_NETWORK_FAILURE",
          7,
        );
      }
      if (REDIRECT_STATUS.has(response.status)) {
        if (redirects.length >= maxRedirects) {
          throw registryError(
            "Registry redirect limit was exceeded.",
            "REGISTRY_REDIRECT_LIMIT",
            5,
          );
        }
        const location = response.headers.get("location");
        if (location === null) {
          throw registryError(
            "Registry redirect omitted its destination.",
            "REGISTRY_REDIRECT_INVALID",
          );
        }
        let target: URL;
        try {
          target = new URL(location, current);
        } catch {
          throw registryError("Registry redirect is invalid.", "REGISTRY_REDIRECT_INVALID");
        }
        let normalizedTargetOrigin: string;
        try {
          normalizedTargetOrigin = normalizeRegistryOrigin(target.origin, {
            allowInsecureLocalhost: options.allowInsecureLocalhost,
          });
        } catch (error) {
          if (!(error instanceof CliError)) throw error;
          throw registryError(
            "Registry redirect violates the transport or credential policy.",
            "REGISTRY_REDIRECT_SECURITY_INVALID",
          );
        }
        if (
          target.username !== "" ||
          target.password !== "" ||
          target.search !== "" ||
          target.hash !== "" ||
          !target.toString().startsWith(`${normalizedTargetOrigin}/`)
        ) {
          throw registryError(
            "Registry redirect violates the transport or credential policy.",
            "REGISTRY_REDIRECT_SECURITY_INVALID",
          );
        }
        redirects.push({ from: current, to: target.toString() });
        current = target.toString();
        continue;
      }
      if (response.status === 404) {
        throw registryError("Registry metadata endpoint was not found.", "REGISTRY_NOT_FOUND", 7);
      }
      if (!response.ok) {
        throw registryError(
          `Registry returned HTTP status ${String(response.status)}.`,
          "REGISTRY_HTTP_FAILURE",
          7,
        );
      }
      const contentType = response.headers.get("content-type")?.split(";", 1)[0]?.trim();
      if (contentType !== "application/json" && contentType !== "application/schema+json") {
        throw registryError(
          "Registry response must use an application/json content type.",
          "REGISTRY_CONTENT_TYPE_INVALID",
        );
      }
      const bytes = await boundedBody(response, maximum);
      let text: string;
      try {
        text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
      } catch {
        throw registryError("Registry response is not valid UTF-8.", "REGISTRY_ENCODING_INVALID");
      }
      assertJsonDepth(text);
      let value: unknown;
      try {
        value = JSON.parse(text) as unknown;
      } catch {
        throw registryError("Registry response is invalid JSON.", "REGISTRY_INVALID_JSON");
      }
      return {
        bytes,
        value,
        finalUrl: current,
        redirects,
        digest: sha256(bytes),
      };
    }
  } finally {
    clearTimeout(timer);
  }
}

function validateSemverRangeMap(value: unknown, label: string, maximum: number): void {
  const record = objectValue(value, label);
  if (Object.keys(record).length > maximum) {
    throw registryError(`${label} exceeds its entry bound.`, "REGISTRY_METADATA_SCHEMA_INVALID");
  }
  for (const [key, range] of Object.entries(record)) {
    if ((label.includes("dependenc") && !PACKAGE_NAME.test(key)) || key.length > 214) {
      throw registryError(`${label} contains an invalid key.`, "REGISTRY_METADATA_SCHEMA_INVALID");
    }
    stringValue(range, `${label}.${key}`, { max: 160, pattern: SEMVER_RANGE });
  }
}

function validateCompatibility(value: unknown, label: string): void {
  const record = objectValue(value, label);
  exactKeys(
    record,
    [
      "cli",
      "node",
      "react",
      "typescript",
      "tailwind",
      "frameworks",
      "packageManagers",
      "browserCapabilities",
    ],
    [],
    label,
  );
  for (const key of ["cli", "node", "react", "typescript", "tailwind"] as const) {
    stringValue(record[key], `${label}.${key}`, { max: 160, pattern: SEMVER_RANGE });
  }
  validateSemverRangeMap(record.frameworks, `${label}.frameworks`, 32);
  validateSemverRangeMap(record.packageManagers, `${label}.packageManagers`, 8);
  stringArray(record.browserCapabilities, `${label}.browserCapabilities`, {
    max: 64,
    itemMax: 120,
  });
}

function secureUrl(value: unknown, label: string, immutable = false): string {
  const text = stringValue(value, label, { max: 2048 });
  let parsed: URL;
  try {
    parsed = new URL(text);
  } catch {
    throw registryError(`${label} is not a URL.`, "REGISTRY_METADATA_SCHEMA_INVALID");
  }
  if (
    parsed.protocol !== "https:" ||
    parsed.username !== "" ||
    parsed.password !== "" ||
    (immutable && (parsed.search !== "" || parsed.hash !== ""))
  ) {
    throw registryError(`${label} violates the URL policy.`, "REGISTRY_METADATA_SCHEMA_INVALID");
  }
  return text;
}

function validateNativeCatalog(value: unknown): NativeCatalog {
  const root = objectValue(value, "Native registry catalog");
  exactKeys(
    root,
    ["schemaVersion", "protocolVersion", "registry", "releases", "items", "dependencyGraphDigest"],
    [],
    "Native registry catalog",
  );
  if (root.schemaVersion !== 1 || root.protocolVersion !== "mergora-v1") {
    throw registryError(
      "Native registry catalog uses an unsupported protocol version.",
      "REGISTRY_PROTOCOL_UNSUPPORTED",
    );
  }
  const registry = objectValue(root.registry, "Native registry identity");
  exactKeys(registry, ["id", "origin", "trust", "identityDigest"], [], "Native registry identity");
  const registryId = stringValue(registry.id, "Native registry ID", {
    max: 128,
    pattern: REGISTRY_ID,
  });
  const registryOrigin = normalizeRegistryOrigin(
    stringValue(registry.origin, "Native registry origin", { max: 2048 }),
    { allowInsecureLocalhost: true },
  );
  if (registry.trust !== "official") {
    throw registryError(
      "Native catalog registry identity has an invalid declared trust value.",
      "REGISTRY_METADATA_SCHEMA_INVALID",
    );
  }
  const declaredIdentityDigest = stringValue(
    registry.identityDigest,
    "Native registry identity digest",
    { max: 71, pattern: DIGEST },
  ) as `sha256:${string}`;
  const expectedDeclaredIdentity = sha256(
    canonicalJson({ id: registryId, origin: registryOrigin, trust: "official" }),
  );
  if (declaredIdentityDigest !== expectedDeclaredIdentity) {
    throw registryError(
      "Native catalog declared identity digest does not match its canonical identity.",
      "REGISTRY_DECLARED_IDENTITY_INVALID",
    );
  }
  const releases = objectValue(root.releases, "Native registry releases");
  exactKeys(
    releases,
    ["currentStable", "supportedHistorical"],
    ["currentPrerelease"],
    "Native registry releases",
  );
  const currentStable = stringValue(releases.currentStable, "Current stable release", {
    max: 160,
    pattern: SEMVER,
  });
  if (
    releases.currentPrerelease !== undefined &&
    releases.currentPrerelease !== null &&
    (typeof releases.currentPrerelease !== "string" || !SEMVER.test(releases.currentPrerelease))
  ) {
    throw registryError(
      "Native prerelease identifier is invalid.",
      "REGISTRY_METADATA_SCHEMA_INVALID",
    );
  }
  stringArray(releases.supportedHistorical, "Supported historical releases", {
    max: 64,
    pattern: SEMVER,
    itemMax: 160,
  });
  if (!Array.isArray(root.items) || root.items.length > MAX_CATALOG_ITEMS) {
    throw registryError(
      "Native registry catalog item list is invalid.",
      "REGISTRY_METADATA_SCHEMA_INVALID",
    );
  }
  const ids = new Set<string>();
  const aliases = new Set<string>();
  const items = root.items.map((entry, index): RegistryCatalogItemSummary => {
    const label = `Native catalog item ${String(index)}`;
    const item = objectValue(entry, label);
    exactKeys(
      item,
      [
        "id",
        "aliases",
        "displayName",
        "description",
        "kind",
        "category",
        "tags",
        "maturity",
        "latestStableVersion",
        "lastChangedVersion",
        "compatibility",
        "license",
        "provenance",
        "links",
        "registryDependencies",
        "quality",
      ],
      ["keywords", "deprecation"],
      label,
    );
    const id = stringValue(item.id, `${label}.id`, { max: 128, pattern: REGISTRY_ID });
    if (ids.has(id) || aliases.has(id)) {
      throw registryError(
        "Native catalog contains a canonical ID collision.",
        "REGISTRY_CATALOG_COLLISION",
      );
    }
    ids.add(id);
    const itemAliases = stringArray(item.aliases, `${label}.aliases`, {
      max: 32,
      pattern: REGISTRY_ID,
      itemMax: 128,
    });
    for (const alias of itemAliases) {
      if (ids.has(alias) || aliases.has(alias)) {
        throw registryError(
          "Native catalog contains an alias collision.",
          "REGISTRY_CATALOG_COLLISION",
        );
      }
      aliases.add(alias);
    }
    stringValue(item.displayName, `${label}.displayName`);
    stringValue(item.description, `${label}.description`);
    if (
      !(["component", "hook", "utility", "system", "kit", "theme", "contract"] as const).includes(
        item.kind as never,
      )
    ) {
      throw registryError(`${label}.kind is invalid.`, "REGISTRY_METADATA_SCHEMA_INVALID");
    }
    stringValue(item.category, `${label}.category`, { max: 128, pattern: REGISTRY_ID });
    stringArray(item.tags, `${label}.tags`, { max: 64, pattern: REGISTRY_ID, itemMax: 128 });
    if (item.keywords !== undefined) {
      stringArray(item.keywords, `${label}.keywords`, { max: 128, itemMax: 80 });
    }
    if (
      !(["experimental", "beta", "stable", "deprecated"] as const).includes(item.maturity as never)
    ) {
      throw registryError(`${label}.maturity is invalid.`, "REGISTRY_METADATA_SCHEMA_INVALID");
    }
    if (
      item.latestStableVersion !== null &&
      (typeof item.latestStableVersion !== "string" || !SEMVER.test(item.latestStableVersion))
    ) {
      throw registryError(
        `${label}.latestStableVersion is invalid.`,
        "REGISTRY_METADATA_SCHEMA_INVALID",
      );
    }
    stringValue(item.lastChangedVersion, `${label}.lastChangedVersion`, {
      max: 160,
      pattern: SEMVER,
    });
    validateCompatibility(item.compatibility, `${label}.compatibility`);
    const license = stringValue(item.license, `${label}.license`, { max: 128, pattern: SPDX });
    secureUrl(item.provenance, `${label}.provenance`);
    const links = objectValue(item.links, `${label}.links`);
    exactKeys(links, ["payload", "passport", "contract", "docs", "source"], [], `${label}.links`);
    const payloadUrl = secureUrl(links.payload, `${label}.links.payload`, true);
    secureUrl(links.passport, `${label}.links.passport`, true);
    secureUrl(links.contract, `${label}.links.contract`, true);
    secureUrl(links.docs, `${label}.links.docs`);
    secureUrl(links.source, `${label}.links.source`);
    const dependencies = stringArray(item.registryDependencies, `${label}.registryDependencies`, {
      max: 256,
      pattern: QUALIFIED_ITEM,
      itemMax: 257,
    });
    const quality = objectValue(item.quality, `${label}.quality`);
    exactKeys(quality, ["tier", "manualAssistiveTechnologyEvidence"], [], `${label}.quality`);
    if (
      !(["complete", "partial", "not-supplied"] as const).includes(quality.tier as never) ||
      typeof quality.manualAssistiveTechnologyEvidence !== "boolean"
    ) {
      throw registryError(`${label}.quality is invalid.`, "REGISTRY_METADATA_SCHEMA_INVALID");
    }
    if (item.deprecation !== undefined) {
      const deprecation = objectValue(item.deprecation, `${label}.deprecation`);
      exactKeys(deprecation, ["replacement", "migration"], [], `${label}.deprecation`);
      stringValue(deprecation.replacement, `${label}.deprecation.replacement`, {
        max: 128,
        pattern: REGISTRY_ID,
      });
      secureUrl(deprecation.migration, `${label}.deprecation.migration`);
    }
    return {
      id,
      license,
      registryDependencies: dependencies,
      riskClass: null,
      qualityTier: quality.tier as "complete" | "partial" | "not-supplied",
      payloadUrl,
    };
  });
  for (const item of items) {
    for (const dependency of item.registryDependencies) {
      const [dependencyRegistry, dependencyId] = dependency.split(":", 2);
      if (
        dependencyRegistry !== registryId ||
        dependencyId === undefined ||
        !ids.has(dependencyId)
      ) {
        throw registryError(
          `Native catalog item ${item.id} references an unavailable dependency.`,
          "REGISTRY_DEPENDENCY_GRAPH_INVALID",
        );
      }
    }
  }
  const graph = Object.fromEntries(
    [...items]
      .sort((left, right) => left.id.localeCompare(right.id, "en-US"))
      .map((item) => [
        item.id,
        item.registryDependencies
          .map((dependency) => dependency.slice(registryId.length + 1))
          .sort(),
      ]),
  );
  const visited = new Set<string>();
  const active = new Set<string>();
  const visit = (id: string): void => {
    if (active.has(id)) {
      throw registryError(
        `Native catalog dependency graph contains a cycle through ${id}.`,
        "REGISTRY_DEPENDENCY_GRAPH_INVALID",
      );
    }
    if (visited.has(id)) return;
    active.add(id);
    for (const dependency of graph[id] ?? []) visit(dependency);
    active.delete(id);
    visited.add(id);
  };
  Object.keys(graph)
    .sort((left, right) => left.localeCompare(right, "en-US"))
    .forEach(visit);
  const dependencyGraphDigest = stringValue(
    root.dependencyGraphDigest,
    "Native dependency graph digest",
    { max: 71, pattern: DIGEST },
  ) as `sha256:${string}`;
  if (dependencyGraphDigest !== sha256(canonicalJson(graph))) {
    throw registryError(
      "Native catalog dependency graph digest does not match its graph.",
      "REGISTRY_DEPENDENCY_GRAPH_INVALID",
    );
  }
  return {
    registryId,
    registryOrigin,
    declaredIdentityDigest,
    currentStable,
    dependencyGraphDigest,
    items,
  };
}

function validateShadcnCatalog(
  value: unknown,
  resolvedOrigin: string,
): {
  readonly registryId: string;
  readonly declaredIdentityDigest: `sha256:${string}`;
  readonly items: readonly RegistryCatalogItemSummary[];
} {
  const root = objectValue(value, "shadcn registry catalog");
  exactKeys(root, ["$schema", "name", "homepage", "items"], [], "shadcn registry catalog");
  if (root.$schema !== "https://ui.shadcn.com/schema/registry.json") {
    throw registryError(
      "shadcn registry schema identity is unsupported.",
      "REGISTRY_PROTOCOL_UNSUPPORTED",
    );
  }
  const registryId = stringValue(root.name, "shadcn registry name", {
    max: 128,
    pattern: REGISTRY_ID,
  });
  const homepage = secureUrl(root.homepage, "shadcn registry homepage");
  if (!Array.isArray(root.items) || root.items.length > MAX_CATALOG_ITEMS) {
    throw registryError(
      "shadcn registry item list is invalid.",
      "REGISTRY_METADATA_SCHEMA_INVALID",
    );
  }
  const seen = new Set<string>();
  const items = root.items.map((entry, index): RegistryCatalogItemSummary => {
    const label = `shadcn registry item ${String(index)}`;
    const item = objectValue(entry, label);
    exactKeys(
      item,
      [
        "$schema",
        "name",
        "type",
        "title",
        "description",
        "dependencies",
        "devDependencies",
        "registryDependencies",
        "files",
        "docs",
      ],
      [],
      label,
    );
    if (item.$schema !== "https://ui.shadcn.com/schema/registry-item.json") {
      throw registryError(
        `${label} has an unsupported schema.`,
        "REGISTRY_METADATA_SCHEMA_INVALID",
      );
    }
    const id = stringValue(item.name, `${label}.name`, { max: 128, pattern: REGISTRY_ID });
    if (seen.has(id)) {
      throw registryError(
        "shadcn registry contains duplicate item names.",
        "REGISTRY_CATALOG_COLLISION",
      );
    }
    seen.add(id);
    if (item.type !== "registry:block" && item.type !== "registry:ui") {
      throw registryError(`${label}.type is unsupported.`, "REGISTRY_METADATA_SCHEMA_INVALID");
    }
    stringValue(item.title, `${label}.title`);
    stringValue(item.description, `${label}.description`);
    const runtime = stringArray(item.dependencies, `${label}.dependencies`, {
      max: 256,
      itemMax: 214,
    });
    const development = stringArray(item.devDependencies, `${label}.devDependencies`, {
      max: 256,
      itemMax: 214,
    });
    for (const dependency of [...runtime, ...development]) {
      assertSafePackageReference(dependency, `${label} package dependency`);
    }
    const registryDependencies = stringArray(
      item.registryDependencies,
      `${label}.registryDependencies`,
      { max: 256, itemMax: 2048 },
    );
    if (!Array.isArray(item.files) || item.files.length > 1024) {
      throw registryError(`${label}.files is invalid.`, "REGISTRY_METADATA_SCHEMA_INVALID");
    }
    const seenPaths = new Set<string>();
    const seenTargets = new Set<string>();
    for (const [fileIndex, entryFile] of item.files.entries()) {
      const file = objectValue(entryFile, `${label}.files[${String(fileIndex)}]`);
      exactKeys(
        file,
        ["path", "type", "target", "content"],
        [],
        `${label}.files[${String(fileIndex)}]`,
      );
      const path = stringValue(file.path, `${label}.files.path`, { max: 1024 });
      const target = stringValue(file.target, `${label}.files.target`, { max: 1024 });
      const pathKey = portableShadcnFileKey(path, `${label}.files.path`, false);
      const targetKey = portableShadcnFileKey(target, `${label}.files.target`, true);
      if (seenPaths.has(pathKey) || seenTargets.has(targetKey)) {
        throw registryError(
          `${label}.files contains a portable path collision.`,
          "REGISTRY_FILE_PATH_COLLISION",
        );
      }
      seenPaths.add(pathKey);
      seenTargets.add(targetKey);
      if (
        !(["registry:file", "registry:style", "registry:ui"] as const).includes(file.type as never)
      ) {
        throw registryError(`${label}.files.type is invalid.`, "REGISTRY_METADATA_SCHEMA_INVALID");
      }
      if (typeof file.content !== "string" || file.content.length > 4_194_304) {
        throw registryError(
          `${label}.files.content is invalid.`,
          "REGISTRY_METADATA_SCHEMA_INVALID",
        );
      }
    }
    stringValue(item.docs, `${label}.docs`);
    return {
      id,
      license: null,
      registryDependencies,
      riskClass: null,
      qualityTier: null,
      payloadUrl: null,
    };
  });
  return {
    registryId,
    declaredIdentityDigest: sha256(
      canonicalJson({ homepage, id: registryId, origin: resolvedOrigin, protocol: "shadcn-v1" }),
    ),
    items,
  };
}

function summarizePolicies(items: readonly RegistryCatalogItemSummary[]): RegistryPolicySummary {
  const licenses = portableSort([
    ...new Set(items.flatMap((item) => (item.license === null ? [] : [item.license]))),
  ]);
  const dependencies = portableSort([
    ...new Set(items.flatMap((item) => item.registryDependencies)),
  ]);
  const risks = items.flatMap((item) => (item.riskClass === null ? [] : [item.riskClass]));
  const qualityTiers = portableSort([
    ...new Set(items.flatMap((item) => (item.qualityTier === null ? [] : [item.qualityTier]))),
  ]);
  return {
    license: {
      status: licenses.length === 0 ? "not-supplied" : "observed",
      licenses,
    },
    dependencies: {
      status: "observed",
      directReferences: items.reduce((total, item) => total + item.registryDependencies.length, 0),
      uniqueReferences: dependencies,
    },
    risk: {
      status: risks.length === 0 ? "not-supplied" : "observed",
      maximumClass: risks.length === 0 ? null : (Math.max(...risks) as 1 | 2 | 3),
    },
    quality: {
      status: qualityTiers.length === 0 ? "not-supplied" : "observed",
      tiers: qualityTiers,
    },
  };
}

function metadataFromCatalog(
  protocol: RegistryProtocol,
  requestedOrigin: string,
  response: BoundedJsonResponse,
): RegistryMetadata {
  const filename = protocol === "mergora-v1" ? "catalog.json" : "registry.json";
  const resolvedOrigin = endpointOrigin(response.finalUrl, filename);
  const normalizedResolvedOrigin = normalizeRegistryOrigin(resolvedOrigin, {
    allowInsecureLocalhost: true,
  });
  let declaredRegistryId: string;
  let declaredIdentityDigest: `sha256:${string}`;
  let currentStableRelease: string | null;
  let items: readonly RegistryCatalogItemSummary[];
  if (protocol === "mergora-v1") {
    const catalog = validateNativeCatalog(response.value);
    if (catalog.registryOrigin !== normalizedResolvedOrigin) {
      throw registryError(
        "Native catalog origin does not match the resolved metadata origin.",
        "REGISTRY_ORIGIN_IDENTITY_MISMATCH",
      );
    }
    declaredRegistryId = catalog.registryId;
    declaredIdentityDigest = catalog.declaredIdentityDigest;
    currentStableRelease = catalog.currentStable;
    items = catalog.items;
  } else {
    const catalog = validateShadcnCatalog(response.value, normalizedResolvedOrigin);
    declaredRegistryId = catalog.registryId;
    declaredIdentityDigest = catalog.declaredIdentityDigest;
    currentStableRelease = null;
    items = catalog.items;
  }
  const policies = summarizePolicies(items);
  const keyPolicy: RegistryIdentityBinding["keyPolicy"] =
    protocol === "mergora-v1"
      ? {
          digest: "sha256",
          immutableReleaseManifests: true,
          signatures: "not-supplied",
        }
      : {
          digest: "not-supplied",
          immutableReleaseManifests: false,
          signatures: "not-supplied",
        };
  const identityBinding: RegistryIdentityBinding = {
    protocol,
    resolvedOrigin: normalizedResolvedOrigin,
    declaredRegistry: { id: declaredRegistryId, identityDigest: declaredIdentityDigest },
    licensePolicy: {
      status: policies.license.status === "observed" ? "observed" : "not-supplied",
      licenses: policies.license.licenses,
    },
    keyPolicy,
  };
  return {
    protocol,
    requestedOrigin,
    resolvedOrigin: normalizedResolvedOrigin,
    redirects: response.redirects,
    declaredRegistryId,
    declaredIdentityDigest,
    identityBinding,
    identityDigest: sha256(canonicalJson(identityBinding)),
    currentStableRelease,
    catalogDigest: response.digest,
    catalogBytes: response.bytes.byteLength,
    catalogUrl: response.finalUrl,
    items,
    keyPolicy,
    ...policies,
  };
}

export async function retrieveRegistryMetadata(
  options: RegistryFetchOptions & {
    readonly origin: string;
    readonly protocol?: RegistryProtocol | undefined;
    readonly authEnvironmentVariable?: string | undefined;
    readonly allowInsecureLocalhost?: boolean | undefined;
  },
): Promise<RegistryMetadata> {
  const requestedOrigin = normalizeRegistryOrigin(options.origin, {
    allowInsecureLocalhost: options.allowInsecureLocalhost,
  });
  const requestOptions = {
    ...options,
    authEnvironmentVariable: options.authEnvironmentVariable,
    allowInsecureLocalhost: options.allowInsecureLocalhost,
  };
  if (options.protocol === "shadcn-v1") {
    const response = await fetchBoundedJson(
      endpoint(requestedOrigin, "registry.json"),
      requestOptions,
    );
    return metadataFromCatalog("shadcn-v1", requestedOrigin, response);
  }
  if (options.protocol === "mergora-v1") {
    const response = await fetchBoundedJson(
      endpoint(requestedOrigin, "catalog.json"),
      requestOptions,
    );
    return metadataFromCatalog("mergora-v1", requestedOrigin, response);
  }
  try {
    const response = await fetchBoundedJson(
      endpoint(requestedOrigin, "catalog.json"),
      requestOptions,
    );
    return metadataFromCatalog("mergora-v1", requestedOrigin, response);
  } catch (error) {
    if (!(error instanceof CliError) || error.code !== "REGISTRY_NOT_FOUND") throw error;
  }
  const response = await fetchBoundedJson(
    endpoint(requestedOrigin, "registry.json"),
    requestOptions,
  );
  return metadataFromCatalog("shadcn-v1", requestedOrigin, response);
}

function configuredProject(projectRoot: string): {
  readonly root: string;
  readonly config: MergoraConfig;
} {
  const root = validatedProjectRoot(projectRoot);
  const config = readMergoraConfig(root);
  if (config === null) {
    throw registryError(
      "The project has no mergora.json; run mergora init first.",
      "CONFIG_MISSING",
      3,
      "mergora.json",
    );
  }
  return { root, config };
}

function installedRegistryUse(
  root: string,
): Readonly<
  Record<string, { readonly items: readonly string[]; readonly dependents: readonly string[] }>
> {
  if (!existsSync(resolve(root, ".mergora/manifest.json"))) return {};
  const manifest = readManifest(root).value;
  const usage = new Map<string, { items: Set<string>; dependents: Set<string> }>();
  const entryFor = (id: string): { items: Set<string>; dependents: Set<string> } => {
    const existing = usage.get(id);
    if (existing !== undefined) return existing;
    const created = { items: new Set<string>(), dependents: new Set<string>() };
    usage.set(id, created);
    return created;
  };
  for (const [qualifiedId, item] of Object.entries(manifest.items)) {
    const registry = String(item.registry);
    entryFor(registry).items.add(qualifiedId);
    for (const dependency of item.registryDependencies) {
      const separator = dependency.indexOf(":");
      if (separator > 0) entryFor(dependency.slice(0, separator)).dependents.add(qualifiedId);
    }
  }
  return Object.fromEntries(
    [...usage.entries()]
      .sort(([left], [right]) => left.localeCompare(right, "en-US"))
      .map(([id, entry]) => [
        id,
        {
          items: portableSort([...entry.items]),
          dependents: portableSort([...entry.dependents]),
        },
      ]),
  );
}

function uninspectedPolicies(): RegistryPolicySummary {
  return {
    license: { status: "not-inspected", licenses: [] },
    dependencies: { status: "not-inspected", directReferences: null, uniqueReferences: [] },
    risk: { status: "not-inspected", maximumClass: null },
    quality: { status: "not-inspected", tiers: [] },
  };
}

function listEntries(root: string, config: MergoraConfig): readonly RegistryListEntry[] {
  const installed = installedRegistryUse(root);
  return Object.entries(config.registries)
    .sort(([left], [right]) => left.localeCompare(right, "en-US"))
    .map(([id, registry]) => ({
      id,
      protocol: registry.protocol,
      origin: registry.origin,
      trust: registry.trust,
      identityDigest: registry.identityDigest ?? null,
      authEnvironmentVariable: registry.authEnvironmentVariable ?? null,
      installedItems: installed[id]?.items ?? [],
      installedDependents: installed[id]?.dependents ?? [],
      ...uninspectedPolicies(),
    }));
}

export function listRegistries(projectRoot: string): readonly RegistryListEntry[] {
  const { root, config } = configuredProject(projectRoot);
  return listEntries(root, config);
}

function configuredRegistry(root: string, config: MergoraConfig, id: string): RegistryListEntry {
  assertRegistryId(id);
  const entry = listEntries(root, config).find((candidate) => candidate.id === id);
  if (entry === undefined) {
    throw registryError(
      `Registry ${JSON.stringify(id)} is not enrolled.`,
      "REGISTRY_NOT_ENROLLED",
      3,
    );
  }
  return entry;
}

export async function inspectRegistry(
  options: RegistryFetchOptions & {
    readonly projectRoot: string;
    readonly id: string;
    readonly offline?: boolean | undefined;
  },
): Promise<RegistryInspection> {
  const { root, config } = configuredProject(options.projectRoot);
  const registry = configuredRegistry(root, config, options.id);
  if (options.offline === true) {
    return {
      registry,
      network: "forbidden",
      metadata: null,
      identityStatus: "not-checked",
      missingEvidence: [
        `catalog:${registry.origin}`,
        `registry-identity:${registry.id}`,
        `registry-policy:${registry.id}`,
      ],
    };
  }
  const metadata = await retrieveRegistryMetadata({
    origin: registry.origin,
    protocol: registry.protocol,
    ...(registry.authEnvironmentVariable === null
      ? {}
      : { authEnvironmentVariable: registry.authEnvironmentVariable }),
    fetchImplementation: options.fetchImplementation,
    environment: options.environment,
    maxBytes: options.maxBytes ?? config.policy.maxRegistryItemBytes * 2,
    maxRedirects: options.maxRedirects,
    timeoutMilliseconds: options.timeoutMilliseconds,
    allowInsecureLocalhost: registry.trust === "local-development",
  });
  const identityStatus =
    registry.trust === "official"
      ? metadata.resolvedOrigin === registry.origin &&
        metadata.declaredRegistryId === "mergora" &&
        metadata.declaredIdentityDigest ===
          sha256(canonicalJson({ id: "mergora", origin: registry.origin, trust: "official" }))
        ? "not-pinned"
        : "mismatch"
      : registry.identityDigest === null
        ? "not-pinned"
        : registry.identityDigest === metadata.identityDigest
          ? "match"
          : "mismatch";
  return {
    registry: { ...registry, ...summarizePolicies(metadata.items) },
    network: "used",
    metadata,
    identityStatus,
    missingEvidence: metadata.protocol === "shadcn-v1" ? shadcnMissingEvidence(registry.id) : [],
  };
}

function readJsonDigest(root: string, target: string): `sha256:${string}` | null {
  const path = resolve(root, target);
  if (!existsSync(path)) return null;
  let value: unknown;
  try {
    value = JSON.parse(readFileSync(path, "utf8")) as unknown;
  } catch {
    throw registryError(`${target} is invalid JSON.`, "PROJECT_JSON_INVALID", 3, target);
  }
  return sha256(canonicalJson(value));
}

function configBytes(config: MergoraConfig): Buffer {
  return Buffer.from(`${JSON.stringify(config, null, 2)}\n`);
}

function registryConfigPlan(
  root: string,
  current: MergoraConfig,
  proposed: MergoraConfig,
  command: RegistryConfigCommand,
  id: string,
  metadata: RegistryMetadata | null,
): RegistryConfigPlan {
  validateMergoraConfig(proposed);
  const before = readFileSync(resolve(root, "mergora.json"));
  const after = configBytes(proposed);
  const beforeDigest = sha256(before);
  const afterDigest = sha256(after);
  const configDigest = sha256(canonicalJson(current));
  const afterConfigDigest = sha256(canonicalJson(proposed));
  const commandReason =
    command === "registry-enroll"
      ? `Enroll registry ${id} with an explicitly accepted identity.`
      : `Remove registry ${id} after proving no installed dependency remains.`;
  const semantic = {
    schemaVersion: 1 as const,
    command,
    cliVersion: "0.0.0",
    projectRoot: "." as const,
    configDigest,
    manifestPreconditionDigest: readJsonDigest(root, ".mergora/manifest.json"),
    registries: [],
    items: [],
    fileOperations: [
      {
        operation: "fast-forward" as const,
        target: "mergora.json",
        owner: `registry:${id}`,
        base: beforeDigest,
        local: beforeDigest,
        remote: afterDigest,
        proposed: afterDigest,
        mediaType: "application/json",
        risk:
          command === "registry-enroll" ? ("review-required" as const) : ("destructive" as const),
        reason: commandReason,
      },
    ],
    dependencyChanges: [],
    structuredPatches: [],
    migrations: [],
    contractChanges: [],
    warnings:
      metadata?.protocol === "shadcn-v1"
        ? [
            "shadcn-v1 metadata does not supply native immutable release, license, risk, or quality evidence.",
          ]
        : [],
    consentRequirements:
      command === "registry-enroll" && metadata !== null
        ? [
            {
              id: `accept-registry-identity:${metadata.identityDigest}`,
              flag: `--accept-registry-identity ${metadata.identityDigest}`,
              reason:
                "External registry enrollment is identity-bound and cannot be accepted by --yes.",
            },
          ]
        : [],
    conflicts: [],
    estimatedBytes: { download: metadata?.catalogBytes ?? 0, write: after.byteLength },
    validationSuite: ["schema", "digest", "path", "project-configured"] as const,
    rollbackAvailable: true,
  };
  const plan: RegistryConfigOperationPlan = {
    ...semantic,
    planDigest: sha256(canonicalJson(semantic)),
  };
  const registry = listEntries(root, proposed).find((entry) => entry.id === id) ?? {
    id,
    protocol: current.registries[id]?.protocol ?? "mergora-v1",
    origin: current.registries[id]?.origin ?? "",
    trust: current.registries[id]?.trust ?? "enrolled",
    identityDigest: current.registries[id]?.identityDigest ?? null,
    authEnvironmentVariable: current.registries[id]?.authEnvironmentVariable ?? null,
    installedItems: [],
    installedDependents: [],
    ...uninspectedPolicies(),
  };
  return {
    plan,
    patch: {
      target: "mergora.json",
      beforeDigest,
      afterDigest,
      beforeConfigDigest: configDigest,
      afterConfigDigest,
    },
    proposedConfig: proposed,
    mutation: { target: "mergora.json", content: after, beforeDigest },
    registry: metadata === null ? registry : { ...registry, ...summarizePolicies(metadata.items) },
    metadata,
  };
}

export async function planRegistryEnrollment(
  options: RegistryEnrollmentOptions,
): Promise<RegistryConfigPlan> {
  const { root, config } = configuredProject(options.projectRoot);
  assertRegistryId(options.id);
  if (options.id === "official") {
    throw registryError(
      "The compiled official registry cannot be replaced.",
      "REGISTRY_OFFICIAL_IMMUTABLE",
      5,
    );
  }
  if (config.registries[options.id] !== undefined) {
    throw registryError(
      `Registry ${JSON.stringify(options.id)} is already enrolled.`,
      "REGISTRY_ALREADY_ENROLLED",
      3,
    );
  }
  if (options.authEnvironmentVariable !== undefined) {
    assertEnvironmentVariableName(options.authEnvironmentVariable);
  }
  const metadata = await retrieveRegistryMetadata({
    origin: options.origin,
    protocol: options.protocol,
    authEnvironmentVariable: options.authEnvironmentVariable,
    fetchImplementation: options.fetchImplementation,
    environment: options.environment,
    maxBytes:
      options.maxBytes ?? Math.min(config.policy.maxOperationBytes, DEFAULT_MAX_CATALOG_BYTES),
    maxRedirects: options.maxRedirects,
    timeoutMilliseconds: options.timeoutMilliseconds,
    allowInsecureLocalhost: options.allowInsecureLocalhost,
  });
  if (metadata.declaredRegistryId !== options.id) {
    throw registryError(
      `Requested registry ID ${JSON.stringify(options.id)} does not match declared identity ${JSON.stringify(metadata.declaredRegistryId)}.`,
      "REGISTRY_IDENTITY_NAME_MISMATCH",
      5,
    );
  }
  const resolvedUrl = new URL(metadata.resolvedOrigin);
  const trust: RegistryTrust = localHttp(resolvedUrl) ? "local-development" : "enrolled";
  const enrolled: MergoraRegistryConfig = {
    protocol: metadata.protocol,
    origin: metadata.resolvedOrigin,
    trust,
    ...(options.authEnvironmentVariable === undefined
      ? {}
      : { authEnvironmentVariable: options.authEnvironmentVariable }),
    identityDigest: metadata.identityDigest,
  };
  const proposed = {
    ...config,
    registries: Object.fromEntries(
      (
        [...Object.entries(config.registries), [options.id, enrolled]] as [
          string,
          MergoraRegistryConfig,
        ][]
      ).sort(([left], [right]) => left.localeCompare(right, "en-US")),
    ),
    policy: { ...config.policy, allowExternalRegistries: true },
  } as MergoraConfig;
  return registryConfigPlan(root, config, proposed, "registry-enroll", options.id, metadata);
}

export function planRegistryRemoval(options: RegistryRemovalOptions): RegistryConfigPlan {
  const { root, config } = configuredProject(options.projectRoot);
  assertRegistryId(options.id);
  if (options.id === "official") {
    throw registryError(
      "The compiled official registry cannot be removed.",
      "REGISTRY_OFFICIAL_IMMUTABLE",
      5,
    );
  }
  configuredRegistry(root, config, options.id);
  const installed = installedRegistryUse(root)[options.id];
  if ((installed?.items.length ?? 0) > 0 || (installed?.dependents.length ?? 0) > 0) {
    throw registryError(
      `Registry ${JSON.stringify(options.id)} is still required by installed provenance.`,
      "REGISTRY_INSTALLED_DEPENDENCY",
      5,
      options.id,
    );
  }
  const remaining = Object.fromEntries(
    Object.entries(config.registries)
      .filter(([id]) => id !== options.id)
      .sort(([left], [right]) => left.localeCompare(right, "en-US")),
  );
  const proposed = {
    ...config,
    registries: remaining,
    policy: {
      ...config.policy,
      allowExternalRegistries: Object.keys(remaining).some((id) => id !== "official"),
    },
  } as MergoraConfig;
  return registryConfigPlan(root, config, proposed, "registry-remove", options.id, null);
}

function operationPlanForEngine(plan: RegistryConfigOperationPlan): OperationPlan {
  return plan;
}

export function applyRegistryConfigPlan(
  registryPlan: RegistryConfigPlan,
  projectRoot: string,
  options: ApplyRegistryConfigOptions = {},
): TransactionResult {
  const root = validatedProjectRoot(projectRoot);
  if (
    options.expectedPlanDigest !== undefined &&
    options.expectedPlanDigest !== registryPlan.plan.planDigest
  ) {
    throw registryError(
      "Registry configuration plan changed after review.",
      "PLAN_DIGEST_MISMATCH",
      8,
    );
  }
  if (registryPlan.plan.command === "registry-enroll") {
    const expected = registryPlan.metadata?.identityDigest;
    if (expected === undefined || options.acceptRegistryIdentity !== expected) {
      throw registryError(
        `Registry enrollment requires --accept-registry-identity ${expected ?? "<digest>"}; --yes is insufficient.`,
        "REGISTRY_IDENTITY_ACCEPTANCE_REQUIRED",
        5,
      );
    }
  }
  validateMergoraConfig(registryPlan.proposedConfig);
  return executeTransaction({
    root,
    plan: operationPlanForEngine(registryPlan.plan),
    mutations: [registryPlan.mutation],
    commandArguments: options.commandArguments,
  });
}

function shadcnMissingEvidence(id: string): readonly string[] {
  return [
    `immutable-release-manifest:${id}`,
    `immutable-payload-digest:${id}`,
    `license-policy:${id}`,
    `risk-class:${id}`,
    `quality-evidence:${id}`,
  ];
}

function validateEvidenceReference(
  value: unknown,
  label: string,
): {
  readonly id: string;
  readonly artifact: string;
  readonly digest: `sha256:${string}`;
} {
  const record = objectValue(value, label);
  exactKeys(record, ["id", "artifact", "digest"], [], label);
  return {
    id: stringValue(record.id, `${label}.id`, { max: 128, pattern: REGISTRY_ID }),
    artifact: secureUrl(record.artifact, `${label}.artifact`, true),
    digest: stringValue(record.digest, `${label}.digest`, {
      max: 71,
      pattern: DIGEST,
    }) as `sha256:${string}`,
  };
}

function validateReleaseManifest(
  value: unknown,
  expectedRegistryId: string,
  expectedVersion: string,
  expectedGraphDigest: `sha256:${string}`,
): ReleaseManifestSample {
  const root = objectValue(value, "Native release manifest");
  exactKeys(
    root,
    [
      "schemaVersion",
      "registryId",
      "uiVersion",
      "releaseCommit",
      "items",
      "dependencyGraphDigest",
      "artifacts",
      "qualitySummary",
      "manifestDigest",
    ],
    [],
    "Native release manifest",
  );
  if (
    root.schemaVersion !== 1 ||
    root.registryId !== expectedRegistryId ||
    root.uiVersion !== expectedVersion ||
    typeof root.releaseCommit !== "string" ||
    !/^[a-f0-9]{40}$/u.test(root.releaseCommit) ||
    root.dependencyGraphDigest !== expectedGraphDigest
  ) {
    throw registryError(
      "Native release manifest identity is inconsistent with its catalog.",
      "REGISTRY_RELEASE_IDENTITY_INVALID",
    );
  }
  const manifestDigest = stringValue(root.manifestDigest, "Native release manifest digest", {
    max: 71,
    pattern: DIGEST,
  });
  const { manifestDigest: ignoredDigest, ...unsigned } = root;
  void ignoredDigest;
  if (manifestDigest !== sha256(canonicalJson(unsigned))) {
    throw registryError(
      "Native release manifest digest is invalid.",
      "REGISTRY_RELEASE_DIGEST_INVALID",
    );
  }
  const items = objectValue(root.items, "Native release manifest items");
  const ids = Object.keys(items).sort((left, right) => left.localeCompare(right, "en-US"));
  if (ids.length < 1 || ids.length > MAX_CATALOG_ITEMS || ids.some((id) => !REGISTRY_ID.test(id))) {
    throw registryError(
      "Native release manifest item set is invalid.",
      "REGISTRY_METADATA_SCHEMA_INVALID",
    );
  }
  const payloads: Omit<ReleaseManifestSample, "bytes">[] = [];
  for (const id of ids) {
    const item = objectValue(items[id], `Native release item ${id}`);
    exactKeys(
      item,
      ["version", "payload", "passport", "contract", "dependencies"],
      [],
      `Native release item ${id}`,
    );
    const version = stringValue(item.version, `Native release item ${id}.version`, {
      max: 160,
      pattern: SEMVER,
    });
    if (version !== expectedVersion) {
      throw registryError(
        `Native release item ${id} does not belong to release ${expectedVersion}.`,
        "REGISTRY_RELEASE_IDENTITY_INVALID",
      );
    }
    const payload = validateEvidenceReference(item.payload, `Native release item ${id}.payload`);
    validateEvidenceReference(item.passport, `Native release item ${id}.passport`);
    validateEvidenceReference(item.contract, `Native release item ${id}.contract`);
    stringArray(item.dependencies, `Native release item ${id}.dependencies`, {
      max: 256,
      pattern: QUALIFIED_ITEM,
      itemMax: 257,
    });
    if (payload.id !== id) {
      throw registryError(
        "Native release payload identity is inconsistent.",
        "REGISTRY_RELEASE_IDENTITY_INVALID",
      );
    }
    payloads.push({ itemId: id, url: payload.artifact, digest: payload.digest });
  }
  if (!Array.isArray(root.artifacts) || root.artifacts.length < 1 || root.artifacts.length > 256) {
    throw registryError(
      "Native release artifact list is invalid.",
      "REGISTRY_METADATA_SCHEMA_INVALID",
    );
  }
  const artifactsByUrl = new Map<
    string,
    { readonly digest: `sha256:${string}`; readonly bytes: number }
  >();
  for (const [index, rawArtifact] of root.artifacts.entries()) {
    const artifact = objectValue(rawArtifact, `Native release artifact ${String(index)}`);
    exactKeys(
      artifact,
      ["name", "url", "digest", "mediaType", "bytes"],
      [],
      `Native release artifact ${String(index)}`,
    );
    stringValue(artifact.name, `Native release artifact ${String(index)}.name`, { max: 255 });
    const url = secureUrl(artifact.url, `Native release artifact ${String(index)}.url`, true);
    const digest = stringValue(artifact.digest, `Native release artifact ${String(index)}.digest`, {
      max: 71,
      pattern: DIGEST,
    }) as `sha256:${string}`;
    stringValue(artifact.mediaType, `Native release artifact ${String(index)}.mediaType`, {
      max: 120,
    });
    if (
      !Number.isInteger(artifact.bytes) ||
      (artifact.bytes as number) < 0 ||
      (artifact.bytes as number) > 1_073_741_824
    ) {
      throw registryError(
        "Native release artifact byte count is invalid.",
        "REGISTRY_METADATA_SCHEMA_INVALID",
      );
    }
    if (artifactsByUrl.has(url)) {
      throw registryError(
        "Native release artifact list contains a duplicate URL.",
        "REGISTRY_METADATA_SCHEMA_INVALID",
      );
    }
    artifactsByUrl.set(url, { digest, bytes: artifact.bytes as number });
  }
  validateEvidenceReference(root.qualitySummary, "Native release quality summary");
  const selected = payloads[0]!;
  const artifact = artifactsByUrl.get(selected.url);
  if (artifact === undefined || artifact.digest !== selected.digest) {
    throw registryError(
      "Native release payload evidence is absent from the release artifact list.",
      "REGISTRY_RELEASE_DIGEST_INVALID",
    );
  }
  return { ...selected, bytes: artifact.bytes };
}

function validateDependencyMap(value: unknown, label: string): void {
  validateSemverRangeMap(value, label, 256);
}

function logicalPath(value: unknown, label: string): string {
  const path = stringValue(value, label, { max: 1024 });
  if (
    !/^(?:ui|hooks|lib|systems|kits|themes|contracts|examples|tokens)\//u.test(path) ||
    path.startsWith("/") ||
    /^[A-Za-z]:/u.test(path) ||
    path.includes("\\") ||
    path.includes("//") ||
    path.split("/").some((segment) => segment === "" || segment === "." || segment === "..") ||
    [...path].some((character) => {
      const code = character.codePointAt(0)!;
      return code <= 31 || code === 127;
    })
  ) {
    throw registryError(`${label} is not a portable logical path.`, "REGISTRY_ITEM_SCHEMA_INVALID");
  }
  return path;
}

function versionedId(value: unknown, label: string): void {
  const record = objectValue(value, label);
  exactKeys(record, ["id", "version"], [], label);
  stringValue(record.id, `${label}.id`, { max: 128, pattern: REGISTRY_ID });
  stringValue(record.version, `${label}.version`, { max: 160, pattern: SEMVER });
}

function assertNoExecutableMetadata(value: unknown, path = "$"): void {
  if (Array.isArray(value)) {
    value.forEach((entry, index) => assertNoExecutableMetadata(entry, `${path}/${String(index)}`));
    return;
  }
  if (value === null || typeof value !== "object") return;
  for (const [key, entry] of Object.entries(value as Record<string, unknown>)) {
    if (
      [
        "script",
        "scripts",
        "shell",
        "command",
        "postinstall",
        "preinstall",
        "hook",
        "hooks",
        "codemod",
        "eval",
        "wasm",
      ].includes(key.toLocaleLowerCase("en-US"))
    ) {
      throw registryError(
        `Registry metadata contains prohibited executable behavior at ${path}.`,
        "REGISTRY_EXECUTABLE_METADATA_REJECTED",
      );
    }
    assertNoExecutableMetadata(entry, `${path}/${key}`);
  }
}

function validateNativePayload(
  value: unknown,
  expectedRegistryId: string,
  expectedItemId: string,
  expectedVersion: string,
  expectedLicense: string | null,
): void {
  assertNoExecutableMetadata(value);
  const root = objectValue(value, "Native registry item payload");
  exactKeys(
    root,
    [
      "schemaVersion",
      "registryId",
      "itemId",
      "kind",
      "version",
      "lastChangedVersion",
      "maturity",
      "license",
      "title",
      "description",
      "links",
      "compatibility",
      "files",
      "registryDependencies",
      "dependencies",
      "structuredPatches",
      "migrations",
      "contract",
      "passport",
      "examples",
      "importPaths",
      "payloadDigest",
    ],
    [],
    "Native registry item payload",
  );
  if (
    root.schemaVersion !== 1 ||
    root.registryId !== expectedRegistryId ||
    root.itemId !== expectedItemId ||
    root.version !== expectedVersion ||
    typeof root.lastChangedVersion !== "string" ||
    !SEMVER.test(root.lastChangedVersion) ||
    typeof root.license !== "string" ||
    !SPDX.test(root.license) ||
    (expectedLicense !== null && root.license !== expectedLicense) ||
    !(["component", "hook", "utility", "system", "kit", "theme", "contract"] as const).includes(
      root.kind as never,
    ) ||
    !(["experimental", "beta", "stable", "deprecated"] as const).includes(root.maturity as never)
  ) {
    throw registryError(
      "Native registry item identity is invalid.",
      "REGISTRY_ITEM_SCHEMA_INVALID",
    );
  }
  stringValue(root.title, "Native registry item title");
  stringValue(root.description, "Native registry item description");
  const links = objectValue(root.links, "Native registry item links");
  exactKeys(
    links,
    ["docs", "source", "changelog", "passport", "contract"],
    [],
    "Native registry item links",
  );
  secureUrl(links.docs, "Native registry item docs URL");
  secureUrl(links.source, "Native registry item source URL");
  secureUrl(links.changelog, "Native registry item changelog URL");
  secureUrl(links.passport, "Native registry item Passport URL", true);
  secureUrl(links.contract, "Native registry item Contract URL", true);
  validateCompatibility(root.compatibility, "Native registry item compatibility");
  stringArray(root.registryDependencies, "Native registry item dependencies", {
    max: 256,
    pattern: QUALIFIED_ITEM,
    itemMax: 257,
  });
  const dependencies = objectValue(root.dependencies, "Native registry package dependencies");
  exactKeys(dependencies, ["runtime", "development"], [], "Native registry package dependencies");
  validateDependencyMap(dependencies.runtime, "Native runtime dependencies");
  validateDependencyMap(dependencies.development, "Native development dependencies");
  if (!Array.isArray(root.files) || root.files.length > 1024) {
    throw registryError(
      "Native registry item file list is invalid.",
      "REGISTRY_ITEM_SCHEMA_INVALID",
    );
  }
  for (const [index, rawFile] of root.files.entries()) {
    const file = objectValue(rawFile, `Native registry item file ${String(index)}`);
    exactKeys(
      file,
      [
        "logicalPath",
        "targetRole",
        "mediaType",
        "bytes",
        "digest",
        "executable",
        "transformPipeline",
      ],
      ["content", "sourceUrl"],
      `Native registry item file ${String(index)}`,
    );
    if (
      (file.content === undefined) === (file.sourceUrl === undefined) ||
      file.executable !== false ||
      !Number.isInteger(file.bytes) ||
      (file.bytes as number) < 0 ||
      (file.bytes as number) > 1_073_741_824
    ) {
      throw registryError(
        "Native registry item file source is invalid.",
        "REGISTRY_ITEM_SCHEMA_INVALID",
      );
    }
    logicalPath(file.logicalPath, `Native registry item file ${String(index)}.logicalPath`);
    if (
      !(
        [
          "component",
          "hook",
          "lib",
          "system",
          "kit",
          "style",
          "token",
          "contract",
          "example",
        ] as const
      ).includes(file.targetRole as never) ||
      !(
        [
          "text/typescript",
          "text/typescript-jsx",
          "text/javascript",
          "text/javascript-jsx",
          "text/css",
          "application/json",
          "application/dtcg+json",
          "text/markdown",
          "application/octet-stream",
          "font/woff2",
          "image/svg+xml",
        ] as const
      ).includes(file.mediaType as never)
    ) {
      throw registryError(
        "Native registry item file role or media type is invalid.",
        "REGISTRY_ITEM_SCHEMA_INVALID",
      );
    }
    const digest = stringValue(file.digest, "Native registry item file digest", {
      max: 71,
      pattern: DIGEST,
    });
    if (file.content !== undefined) {
      if (
        typeof file.content !== "string" ||
        Buffer.byteLength(file.content) !== file.bytes ||
        sha256(file.content) !== digest
      ) {
        throw registryError(
          "Native registry item inline file digest is invalid.",
          "REGISTRY_ITEM_DIGEST_INVALID",
        );
      }
    } else {
      secureUrl(file.sourceUrl, "Native registry item source URL", true);
    }
    if (!Array.isArray(file.transformPipeline) || file.transformPipeline.length > 16) {
      throw registryError(
        "Native registry transform pipeline is invalid.",
        "REGISTRY_ITEM_SCHEMA_INVALID",
      );
    }
    for (const [pipelineIndex, rawStep] of file.transformPipeline.entries()) {
      const step = objectValue(
        rawStep,
        `Native registry item file ${String(index)} transform ${String(pipelineIndex)}`,
      );
      exactKeys(
        step,
        ["adapter", "version"],
        [],
        `Native registry item file ${String(index)} transform ${String(pipelineIndex)}`,
      );
      if (
        !(
          [
            "alias-rewrite",
            "import-rewrite",
            "target-map",
            "format",
            "token-resolve",
            "none",
          ] as const
        ).includes(step.adapter as never)
      ) {
        throw registryError(
          "Native registry transform adapter is unsupported.",
          "REGISTRY_ITEM_SCHEMA_INVALID",
        );
      }
      stringValue(step.version, "Native registry transform version", {
        max: 160,
        pattern: SEMVER,
      });
    }
  }
  if (!Array.isArray(root.structuredPatches) || root.structuredPatches.length > 256) {
    throw registryError(
      "Native registry structured patch list is invalid.",
      "REGISTRY_ITEM_SCHEMA_INVALID",
    );
  }
  for (const [index, rawPatch] of root.structuredPatches.entries()) {
    const patch = objectValue(rawPatch, `Native registry structured patch ${String(index)}`);
    exactKeys(
      patch,
      ["id", "adapter", "semanticKey", "desiredValue", "reversible"],
      [],
      `Native registry structured patch ${String(index)}`,
    );
    stringValue(patch.id, "Native registry structured patch ID", {
      max: 128,
      pattern: REGISTRY_ID,
    });
    if (
      !(
        [
          "css-import",
          "css-source",
          "css-token-block",
          "package-dependency",
          "tsconfig-path",
          "tsconfig-include",
          "framework-config",
        ] as const
      ).includes(patch.adapter as never) ||
      patch.reversible !== true
    ) {
      throw registryError(
        "Native registry structured patch adapter is invalid.",
        "REGISTRY_ITEM_SCHEMA_INVALID",
      );
    }
    stringValue(patch.semanticKey, "Native registry structured patch semantic key", { max: 512 });
    const desired = patch.desiredValue;
    const desiredValid =
      (typeof desired === "string" && desired.length <= 4096) ||
      (typeof desired === "number" && Number.isFinite(desired)) ||
      typeof desired === "boolean" ||
      (Array.isArray(desired) &&
        desired.length <= 128 &&
        desired.every((entry) => typeof entry === "string" && entry.length <= 1024));
    if (!desiredValid) {
      throw registryError(
        "Native registry structured patch value is invalid.",
        "REGISTRY_ITEM_SCHEMA_INVALID",
      );
    }
  }
  if (!Array.isArray(root.migrations) || root.migrations.length > 128) {
    throw registryError(
      "Native registry migration list is invalid.",
      "REGISTRY_ITEM_SCHEMA_INVALID",
    );
  }
  for (const [index, rawMigration] of root.migrations.entries()) {
    const migration = objectValue(rawMigration, `Native registry migration ${String(index)}`);
    exactKeys(
      migration,
      ["id", "from", "to", "phase", "adapter", "arguments"],
      [],
      `Native registry migration ${String(index)}`,
    );
    stringValue(migration.id, "Native registry migration ID", {
      max: 128,
      pattern: REGISTRY_ID,
    });
    stringValue(migration.from, "Native registry migration source range", {
      max: 160,
      pattern: SEMVER_RANGE,
    });
    stringValue(migration.to, "Native registry migration target range", {
      max: 160,
      pattern: SEMVER_RANGE,
    });
    if (
      (migration.phase !== "remote" && migration.phase !== "proposed") ||
      !(
        [
          "rename-file",
          "rename-export",
          "rename-prop",
          "rename-token",
          "config-v1",
          "manual-checklist",
        ] as const
      ).includes(migration.adapter as never)
    ) {
      throw registryError("Native registry migration is invalid.", "REGISTRY_ITEM_SCHEMA_INVALID");
    }
    const argumentsValue = objectValue(migration.arguments, "Native registry migration arguments");
    exactKeys(
      argumentsValue,
      [],
      ["from", "to", "checklist"],
      "Native registry migration arguments",
    );
    if (argumentsValue.from !== undefined) {
      stringValue(argumentsValue.from, "Native registry migration argument from", { max: 1024 });
    }
    if (argumentsValue.to !== undefined) {
      stringValue(argumentsValue.to, "Native registry migration argument to", { max: 1024 });
    }
    if (argumentsValue.checklist !== undefined) {
      stringArray(argumentsValue.checklist, "Native registry migration checklist", {
        max: 64,
        itemMax: 1024,
      });
    }
  }
  versionedId(root.contract, "Native registry item contract");
  versionedId(root.passport, "Native registry item Passport");
  const examples = stringArray(root.examples, "Native registry item examples", {
    max: 128,
    itemMax: 1024,
  });
  examples.forEach((entry, index) =>
    logicalPath(entry, `Native registry item example ${String(index)}`),
  );
  stringArray(root.importPaths, "Native registry item import paths", {
    max: 64,
    itemMax: 214,
  }).forEach((entry) => {
    if (!/^mergora-ui(?:\/[a-z0-9-]+)?$/u.test(entry)) {
      throw registryError(
        "Native registry item import path is invalid.",
        "REGISTRY_ITEM_SCHEMA_INVALID",
      );
    }
  });
  const payloadDigest = stringValue(root.payloadDigest, "Native registry payload digest", {
    max: 71,
    pattern: DIGEST,
  });
  const { payloadDigest: ignoredDigest, ...unsigned } = root;
  void ignoredDigest;
  if (payloadDigest !== sha256(canonicalJson(unsigned))) {
    throw registryError(
      "Native registry payload self-digest is invalid.",
      "REGISTRY_ITEM_DIGEST_INVALID",
    );
  }
}

async function verifyNativeSample(
  metadata: RegistryMetadata,
  registry: RegistryListEntry,
  options: RegistryFetchOptions,
): Promise<NonNullable<RegistryVerification["sample"]>> {
  if (metadata.currentStableRelease === null) {
    throw registryError("Native registry omitted its stable release.", "REGISTRY_RELEASE_MISSING");
  }
  const catalogResponse = await fetchBoundedJson(metadata.catalogUrl, {
    ...options,
    authEnvironmentVariable: registry.authEnvironmentVariable ?? undefined,
    authOrigin: registry.origin,
    allowInsecureLocalhost: registry.trust === "local-development",
  });
  if (catalogResponse.digest !== metadata.catalogDigest) {
    throw registryError(
      "Registry catalog changed during verification; retry from one coherent snapshot.",
      "REGISTRY_CATALOG_CHANGED",
      8,
    );
  }
  const nativeCatalog = validateNativeCatalog(catalogResponse.value);
  const manifestUrl = `${metadata.resolvedOrigin}/releases/${metadata.currentStableRelease}/manifest.json`;
  const manifestResponse = await fetchBoundedJson(manifestUrl, {
    ...options,
    authEnvironmentVariable: registry.authEnvironmentVariable ?? undefined,
    authOrigin: registry.origin,
    allowInsecureLocalhost: registry.trust === "local-development",
  });
  if (manifestResponse.finalUrl !== manifestUrl) {
    throw registryError(
      "Immutable release manifest redirected; immutable URLs must remain stable.",
      "REGISTRY_IMMUTABLE_REDIRECT_REJECTED",
    );
  }
  const sample = validateReleaseManifest(
    manifestResponse.value,
    nativeCatalog.registryId,
    nativeCatalog.currentStable,
    nativeCatalog.dependencyGraphDigest,
  );
  const payloadResponse = await fetchBoundedJson(sample.url, {
    ...options,
    authEnvironmentVariable: registry.authEnvironmentVariable ?? undefined,
    authOrigin: registry.origin,
    allowInsecureLocalhost: registry.trust === "local-development",
    maxBytes: options.maxBytes ?? DEFAULT_MAX_ITEM_BYTES,
  });
  if (payloadResponse.finalUrl !== sample.url) {
    throw registryError(
      "Immutable registry payload redirected; immutable URLs must remain stable.",
      "REGISTRY_IMMUTABLE_REDIRECT_REJECTED",
    );
  }
  if (payloadResponse.digest !== sample.digest) {
    throw registryError(
      "Immutable registry payload bytes do not match the release manifest.",
      "REGISTRY_ITEM_DIGEST_INVALID",
    );
  }
  if (payloadResponse.bytes.byteLength !== sample.bytes) {
    throw registryError(
      "Immutable registry payload byte length does not match the release manifest.",
      "REGISTRY_ITEM_DIGEST_INVALID",
    );
  }
  const catalogItem = nativeCatalog.items.find(({ id }) => id === sample.itemId);
  if (catalogItem === undefined || catalogItem.payloadUrl !== sample.url) {
    throw registryError(
      "Immutable registry sample does not match the catalog payload URL.",
      "REGISTRY_RELEASE_IDENTITY_INVALID",
    );
  }
  validateNativePayload(
    payloadResponse.value,
    nativeCatalog.registryId,
    sample.itemId,
    nativeCatalog.currentStable,
    catalogItem.license,
  );
  return sample;
}

export async function verifyRegistry(
  options: RegistryFetchOptions & {
    readonly projectRoot: string;
    readonly id: string;
    readonly offline?: boolean | undefined;
  },
): Promise<RegistryVerification> {
  const inspection = await inspectRegistry(options);
  const checks: RegistryVerification["checks"][number][] = [
    { id: "config-schema", state: "pass", detail: "mergora.json passed strict v1 validation." },
    {
      id: "transport-policy",
      state: "pass",
      detail: "Configured origin satisfies the transport policy.",
    },
  ];
  if (options.offline === true) {
    checks.push({
      id: "network-evidence",
      state: "unavailable",
      detail: "Offline mode forbids catalog, identity, manifest, and sample retrieval.",
    });
    return {
      ...inspection,
      ok: false,
      status: "incomplete",
      checks,
      sample: null,
    };
  }
  if (inspection.identityStatus === "mismatch") {
    checks.push({
      id: "identity-binding",
      state: "fail",
      detail: "The accepted identity digest does not match current registry metadata.",
    });
    return {
      ...inspection,
      ok: false,
      status: "identity-mismatch",
      checks,
      sample: null,
    };
  }
  checks.push({
    id: "identity-binding",
    state: "pass",
    detail:
      inspection.identityStatus === "not-pinned"
        ? "Compiled official identity was revalidated from the catalog."
        : "Accepted external identity matches the current catalog and policy binding.",
  });
  if (inspection.metadata?.protocol === "shadcn-v1") {
    checks.push({
      id: "immutable-sample",
      state: "unavailable",
      detail: "shadcn-v1 does not supply Mergora immutable release evidence.",
    });
    return {
      ...inspection,
      ok: false,
      status: "incomplete",
      checks,
      sample: null,
    };
  }
  if (inspection.metadata === null) {
    throw registryError("Registry metadata is unavailable.", "REGISTRY_EVIDENCE_MISSING", 7);
  }
  const sample = await verifyNativeSample(inspection.metadata, inspection.registry, {
    fetchImplementation: options.fetchImplementation,
    environment: options.environment,
    maxBytes: options.maxBytes,
    maxRedirects: options.maxRedirects,
    timeoutMilliseconds: options.timeoutMilliseconds,
  });
  checks.push(
    {
      id: "catalog-schema",
      state: "pass",
      detail: "Catalog schema, declared identity, dependency graph, and policy fields are valid.",
    },
    {
      id: "immutable-sample",
      state: "pass",
      detail: `Release manifest and immutable sample ${sample.itemId} passed byte and self-digest validation.`,
    },
  );
  return {
    ...inspection,
    ok: true,
    status: "verified",
    checks,
    sample,
  };
}
