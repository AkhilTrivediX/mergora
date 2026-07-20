import {
  closeSync,
  constants,
  createReadStream,
  existsSync,
  fstatSync,
  lstatSync,
  openSync,
  readFileSync,
  readdirSync,
  realpathSync,
  statSync,
} from "node:fs";
import { createServer, type Server } from "node:http";
import { basename, dirname, extname, isAbsolute, relative, resolve, sep } from "node:path";

import {
  parseContractDefinitionV1,
  type AuditMode,
  type AuditReportV1,
  type ContractDefinitionV1,
  type OfficialBrowserHostV1,
  type RuntimeAuditMode,
} from "mergora-contracts";

import { auditProject } from "./audit.js";
import {
  CliError,
  assertNoSymlinkAncestors,
  assertPortableRelativePath,
  validatedProjectRoot,
} from "./contracts.js";

const CONTRACT_DIRECTORY = ".mergora/contracts";
const MANIFEST_PATH = ".mergora/manifest.json";
const MAX_CONTRACT_FILES = 256;
const MAX_CONTRACT_FILE_BYTES = 2 * 1024 * 1024;
const MAX_MANIFEST_BYTES = 4 * 1024 * 1024;
const MAX_PREVIEW_ASSET_BYTES = 64 * 1024 * 1024;
const DEFAULT_RUNTIME_TIMEOUT_MS = 10_000;
const MIN_RUNTIME_TIMEOUT_MS = 100;
const MAX_RUNTIME_TIMEOUT_MS = 30_000;
const contractFilePattern = /^[a-z0-9]+(?:-[a-z0-9]+)*--[a-z0-9]+(?:-[a-z0-9]+)*\.json$/u;
const webSegmentPattern = /^[A-Za-z0-9_][A-Za-z0-9._~-]*$/u;
const windowsDevicePattern = /^(?:con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\..*)?$/iu;
const runtimeModes = ["a11y", "browser", "keyboard", "responsive"] as const;

export interface OfficialBrowserAuditPreviewUrlV1 {
  readonly kind: "url";
  /** Explicit HTTPS or loopback HTTP route selected by the caller. */
  readonly url: string;
}

export interface OfficialBrowserAuditPreviewBuildV1 {
  readonly kind: "build";
  /** Existing project-relative static build directory or HTML file. */
  readonly buildPath: string;
  /** Route within the static build. Defaults to `/`. */
  readonly route?: string;
}

export type OfficialBrowserAuditPreviewV1 =
  OfficialBrowserAuditPreviewBuildV1 | OfficialBrowserAuditPreviewUrlV1;

export interface OfficialBrowserAuditOptionsV1 {
  readonly items?: readonly string[];
  readonly requestedModes: readonly AuditMode[];
  readonly changed?: boolean;
  readonly preview: OfficialBrowserAuditPreviewV1;
  /** Per-assertion, browser-launch, and navigation bound. */
  readonly runtimeTimeoutMs?: number;
  /** Forbids a caller-selected remote HTTPS route. Loopback/build previews remain local. */
  readonly offline?: boolean;
}

type JsonRecord = Record<string, unknown>;

interface ProjectFileBinding {
  readonly registryId: string;
  readonly itemId: string;
  readonly contractVersion: string;
  readonly payloadDigest: string;
  readonly paths: ReadonlyMap<string, string>;
}

interface OfficialPlaywrightLocatorV1 {
  readonly role: string;
  readonly name?: string;
}

interface OfficialPlaywrightAssertionV1 {
  readonly assertionId: string;
  readonly mode: RuntimeAuditMode;
  readonly projectPath: string;
  readonly applicability: "applicable";
  readonly target: OfficialPlaywrightLocatorV1;
  readonly action?:
    | { readonly kind: "click" }
    | { readonly kind: "none" }
    | { readonly kind: "press"; readonly key: string };
  readonly states?: readonly {
    readonly name:
      | "busy"
      | "checked"
      | "disabled"
      | "expanded"
      | "invalid"
      | "pressed"
      | "readonly"
      | "required"
      | "selected"
      | "value";
    readonly expected: boolean | null | number | string;
  }[];
  readonly focus?: {
    readonly step: string;
    readonly target: OfficialPlaywrightLocatorV1;
    readonly visible?: boolean;
    readonly occluded?: boolean;
  };
  readonly announcement?: {
    readonly selector: string;
    readonly text: string;
    readonly politeness: "assertive" | "off" | "polite";
  };
  readonly axe?: { readonly scopeSelector?: string };
  readonly responsive?: {
    readonly width: number;
    readonly height: number;
    readonly rootSelector: string;
    readonly maximumHorizontalOverflowPx?: number;
  };
}

interface OfficialPlaywrightContractV1 {
  readonly registryId: string;
  readonly itemId: string;
  readonly contractId: string;
  readonly contractVersion: string;
  readonly payloadDigest: string;
  readonly assertions: readonly OfficialPlaywrightAssertionV1[];
}

interface OfficialPlaywrightHarnessV1 {
  readonly harnessId: string;
  readonly contracts: readonly OfficialPlaywrightContractV1[];
}

interface BrowserRequestLike {
  method(): string;
  url(): string;
}

interface BrowserRouteLike {
  abort(errorCode?: string): Promise<void>;
  continue(): Promise<void>;
  request(): BrowserRequestLike;
}

interface BrowserWebSocketRouteLike {
  close(options?: { readonly code?: number; readonly reason?: string }): Promise<void> | void;
}

interface BrowserPageLike {
  goto(
    url: string,
    options: { readonly timeout: number; readonly waitUntil: "load" },
  ): Promise<unknown>;
}

interface BrowserContextLike {
  close(): Promise<void>;
  newPage(): Promise<BrowserPageLike>;
  route(url: string, handler: (route: BrowserRouteLike) => Promise<void> | void): Promise<void>;
  routeWebSocket?(
    url: string,
    handler: (route: BrowserWebSocketRouteLike) => Promise<void> | void,
  ): Promise<void>;
}

interface BrowserLike {
  close(): Promise<void>;
  newContext(options: {
    readonly acceptDownloads: false;
    readonly ignoreHTTPSErrors: false;
    readonly serviceWorkers: "block";
  }): Promise<BrowserContextLike>;
}

interface ChromiumLike {
  launch(options: { readonly headless: true; readonly timeout: number }): Promise<BrowserLike>;
}

interface BrowserRuntimeModules {
  readonly chromium: ChromiumLike;
  readonly createHost: (options: {
    readonly page: BrowserPageLike;
    readonly harnesses: readonly OfficialPlaywrightHarnessV1[];
    readonly actionTimeoutMs: number;
    readonly reloadBeforeEach: true;
  }) => OfficialBrowserHostV1;
}

interface PreviewHandle {
  readonly url: URL;
  close(): Promise<void>;
}

interface CompiledProgramTemplate {
  readonly registryId: "official";
  readonly itemId: "button";
  readonly contractId: "button-contract";
  readonly contractVersion: "1.0.0";
  readonly harnessId: "official-button-playwright";
  readonly assertionId: "a11y-name" | "browser-state" | "keyboard-activation" | "responsive-reflow";
  readonly mode: RuntimeAuditMode;
  compile(projectPath: string): OfficialPlaywrightAssertionV1;
}

const buttonTarget: OfficialPlaywrightLocatorV1 = { role: "button", name: "Save changes" };

/**
 * This is trusted CLI code, not registry data. Registry Contracts can select an
 * exact route identity, but cannot provide locators, selectors, keys, scripts,
 * commands, viewport sizes, expected states, or axe scopes.
 */
const COMPILED_PROGRAMS: readonly CompiledProgramTemplate[] = [
  {
    registryId: "official",
    itemId: "button",
    contractId: "button-contract",
    contractVersion: "1.0.0",
    harnessId: "official-button-playwright",
    assertionId: "a11y-name",
    mode: "a11y",
    compile: (projectPath) => ({
      assertionId: "a11y-name",
      mode: "a11y",
      projectPath,
      applicability: "applicable",
      target: buttonTarget,
      states: [{ name: "disabled", expected: false }],
      axe: { scopeSelector: "[data-mergora-audit-root='button']" },
    }),
  },
  {
    registryId: "official",
    itemId: "button",
    contractId: "button-contract",
    contractVersion: "1.0.0",
    harnessId: "official-button-playwright",
    assertionId: "browser-state",
    mode: "browser",
    compile: (projectPath) => ({
      assertionId: "browser-state",
      mode: "browser",
      projectPath,
      applicability: "applicable",
      target: buttonTarget,
      action: { kind: "click" },
      states: [{ name: "pressed", expected: true }],
      announcement: {
        selector: "[data-mergora-audit-announcer='button']",
        text: "Saved",
        politeness: "polite",
      },
    }),
  },
  {
    registryId: "official",
    itemId: "button",
    contractId: "button-contract",
    contractVersion: "1.0.0",
    harnessId: "official-button-playwright",
    assertionId: "keyboard-activation",
    mode: "keyboard",
    compile: (projectPath) => ({
      assertionId: "keyboard-activation",
      mode: "keyboard",
      projectPath,
      applicability: "applicable",
      target: buttonTarget,
      action: { kind: "press", key: "Enter" },
      states: [{ name: "pressed", expected: true }],
      focus: {
        step: "after-activation",
        target: buttonTarget,
        visible: true,
        occluded: false,
      },
      announcement: {
        selector: "[data-mergora-audit-announcer='button']",
        text: "Saved",
        politeness: "polite",
      },
    }),
  },
  {
    registryId: "official",
    itemId: "button",
    contractId: "button-contract",
    contractVersion: "1.0.0",
    harnessId: "official-button-playwright",
    assertionId: "responsive-reflow",
    mode: "responsive",
    compile: (projectPath) => ({
      assertionId: "responsive-reflow",
      mode: "responsive",
      projectPath,
      applicability: "applicable",
      target: buttonTarget,
      responsive: {
        width: 320,
        height: 568,
        rootSelector: "[data-mergora-audit-root='button']",
        maximumHorizontalOverflowPx: 1,
      },
    }),
  },
];

function isRecord(value: unknown): value is JsonRecord {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function compareText(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function timeoutMs(input: number | undefined): number {
  const value = input ?? DEFAULT_RUNTIME_TIMEOUT_MS;
  if (
    !Number.isSafeInteger(value) ||
    value < MIN_RUNTIME_TIMEOUT_MS ||
    value > MAX_RUNTIME_TIMEOUT_MS
  ) {
    throw new CliError("Browser audit timeout must be an integer from 100 through 30000 ms.", {
      code: "AUDIT_BROWSER_TIMEOUT_INVALID",
      exitCode: 2,
    });
  }
  return value;
}

function selectedDefinition(
  definition: ContractDefinitionV1,
  selectors: readonly string[] | undefined,
): boolean {
  if (selectors === undefined || selectors.length === 0) return true;
  return selectors.some(
    (selector) =>
      selector === definition.itemId ||
      selector === `${definition.registryId}:${definition.itemId}`,
  );
}

function readDefinitions(
  root: string,
  selectors: readonly string[] | undefined,
): readonly ContractDefinitionV1[] {
  const directory = resolve(root, CONTRACT_DIRECTORY);
  if (!existsSync(directory)) return [];
  try {
    assertNoSymlinkAncestors(root, CONTRACT_DIRECTORY);
    if (!statSync(directory).isDirectory()) return [];
    const entries = readdirSync(directory, { withFileTypes: true }).sort((left, right) =>
      compareText(left.name, right.name),
    );
    if (entries.length > MAX_CONTRACT_FILES) return [];
    const definitions: ContractDefinitionV1[] = [];
    for (const entry of entries) {
      if (!entry.isFile() || entry.isSymbolicLink() || !contractFilePattern.test(entry.name)) {
        return [];
      }
      const relativePath = `${CONTRACT_DIRECTORY}/${entry.name}`;
      assertNoSymlinkAncestors(root, relativePath);
      const path = resolve(directory, entry.name);
      if (statSync(path).size > MAX_CONTRACT_FILE_BYTES) return [];
      const value = JSON.parse(readFileSync(path, "utf8")) as unknown;
      const candidates = Array.isArray(value) ? value : [value];
      for (const candidate of candidates) {
        const definition = parseContractDefinitionV1(candidate);
        if (selectedDefinition(definition, selectors)) definitions.push(definition);
      }
    }
    return definitions;
  } catch {
    // The ordinary audit reader owns authoritative diagnostics for malformed snapshots.
    return [];
  }
}

function readManifestBindings(root: string): ReadonlyMap<string, ProjectFileBinding> {
  try {
    assertNoSymlinkAncestors(root, MANIFEST_PATH);
    const path = resolve(root, MANIFEST_PATH);
    if (!existsSync(path) || !statSync(path).isFile() || statSync(path).size > MAX_MANIFEST_BYTES) {
      return new Map();
    }
    const value = JSON.parse(readFileSync(path, "utf8")) as unknown;
    if (!isRecord(value) || value.schemaVersion !== 1 || !isRecord(value.items)) return new Map();
    const result = new Map<string, ProjectFileBinding>();
    for (const [qualifiedId, rawItem] of Object.entries(value.items)) {
      if (!isRecord(rawItem) || !Array.isArray(rawItem.files) || !isRecord(rawItem.payload)) {
        return new Map();
      }
      const separator = qualifiedId.indexOf(":");
      const registryId = qualifiedId.slice(0, separator);
      const itemId = qualifiedId.slice(separator + 1);
      if (
        separator < 1 ||
        rawItem.registry !== registryId ||
        rawItem.itemId !== itemId ||
        typeof rawItem.contractVersion !== "string" ||
        typeof rawItem.payload.digest !== "string"
      ) {
        return new Map();
      }
      const paths = new Map<string, string>();
      for (const rawFile of rawItem.files) {
        if (
          !isRecord(rawFile) ||
          typeof rawFile.logicalPath !== "string" ||
          typeof rawFile.target !== "string"
        ) {
          return new Map();
        }
        assertPortableRelativePath(rawFile.logicalPath, "Manifest logical path");
        assertPortableRelativePath(rawFile.target, "Manifest target");
        if (paths.has(rawFile.logicalPath)) return new Map();
        paths.set(rawFile.logicalPath, rawFile.target);
      }
      result.set(qualifiedId, {
        registryId,
        itemId,
        contractVersion: rawItem.contractVersion,
        payloadDigest: rawItem.payload.digest,
        paths,
      });
    }
    return result;
  } catch {
    return new Map();
  }
}

function templateFor(
  definition: ContractDefinitionV1,
  assertionId: string,
  mode: RuntimeAuditMode,
  harnessId: string,
): CompiledProgramTemplate | undefined {
  return COMPILED_PROGRAMS.find(
    (template) =>
      template.registryId === definition.registryId &&
      template.itemId === definition.itemId &&
      template.contractId === definition.contractId &&
      template.contractVersion === definition.contractVersion &&
      template.harnessId === harnessId &&
      template.assertionId === assertionId &&
      template.mode === mode,
  );
}

function compileHarnesses(
  root: string,
  selectors: readonly string[] | undefined,
): readonly OfficialPlaywrightHarnessV1[] {
  const definitions = readDefinitions(root, selectors);
  const manifest = readManifestBindings(root);
  const harnessDefinitions = new Map<string, ContractDefinitionV1[]>();
  for (const definition of definitions) {
    for (const assertion of definition.assertions) {
      if (assertion.mode === "static") continue;
      const list = harnessDefinitions.get(assertion.adapter.harnessId) ?? [];
      if (!list.includes(definition)) list.push(definition);
      harnessDefinitions.set(assertion.adapter.harnessId, list);
    }
  }

  const harnesses: OfficialPlaywrightHarnessV1[] = [];
  for (const [harnessId, boundDefinitions] of [...harnessDefinitions.entries()].sort(
    ([left], [right]) => compareText(left, right),
  )) {
    const contracts: OfficialPlaywrightContractV1[] = [];
    let complete = true;
    for (const definition of boundDefinitions) {
      const binding = manifest.get(`${definition.registryId}:${definition.itemId}`);
      if (
        binding === undefined ||
        binding.contractVersion !== definition.contractVersion ||
        binding.payloadDigest !== definition.payloadDigest
      ) {
        complete = false;
        break;
      }
      const assertions: OfficialPlaywrightAssertionV1[] = [];
      for (const assertion of definition.assertions) {
        if (assertion.mode === "static" || assertion.adapter.harnessId !== harnessId) continue;
        const template = templateFor(
          definition,
          assertion.id,
          assertion.mode,
          assertion.adapter.harnessId,
        );
        const projectPath = binding.paths.get(assertion.target.logicalPath);
        if (template === undefined || projectPath === undefined) {
          complete = false;
          break;
        }
        assertions.push(template.compile(projectPath));
      }
      if (!complete || assertions.length === 0) {
        complete = false;
        break;
      }
      contracts.push({
        registryId: definition.registryId,
        itemId: definition.itemId,
        contractId: definition.contractId,
        contractVersion: definition.contractVersion,
        payloadDigest: definition.payloadDigest,
        assertions,
      });
    }
    // An incomplete allowlist is unavailable evidence, never an adapter exception or fake pass.
    if (complete && contracts.length > 0) harnesses.push({ harnessId, contracts });
  }
  return harnesses;
}

function previewUrl(input: string, offline: boolean): URL {
  if (
    input.length === 0 ||
    input.length > 2_048 ||
    input !== input.normalize("NFC") ||
    [...input].some((character) => {
      const code = character.codePointAt(0)!;
      return code <= 31 || code === 127;
    })
  ) {
    throw new CliError("Browser audit preview URL is invalid.", {
      code: "AUDIT_PREVIEW_URL_INVALID",
      exitCode: 2,
    });
  }
  let url: URL;
  try {
    url = new URL(input);
  } catch {
    throw new CliError("Browser audit preview URL must be absolute.", {
      code: "AUDIT_PREVIEW_URL_INVALID",
      exitCode: 2,
    });
  }
  const loopback =
    url.hostname === "localhost" || url.hostname === "127.0.0.1" || url.hostname === "[::1]";
  const supported = url.protocol === "https:" || (url.protocol === "http:" && loopback);
  if (!supported || url.username !== "" || url.password !== "") {
    throw new CliError(
      "Browser audit preview URL must use HTTPS or loopback HTTP without embedded credentials.",
      { code: "AUDIT_PREVIEW_URL_UNSAFE", exitCode: 2 },
    );
  }
  if (offline && !loopback) {
    throw new CliError("--offline forbids a remote browser audit preview URL.", {
      code: "AUDIT_PREVIEW_OFFLINE",
      exitCode: 4,
      recovery: "Use a project-relative --preview-build or an already running loopback preview.",
    });
  }
  return url;
}

function previewRoute(input: string | undefined): string {
  const route = input ?? "/";
  if (
    route.length === 0 ||
    route.length > 2_048 ||
    !route.startsWith("/") ||
    route.startsWith("//") ||
    route.includes("\\") ||
    route !== route.normalize("NFC") ||
    [...route].some((character) => {
      const code = character.codePointAt(0)!;
      return code <= 31 || code === 127;
    })
  ) {
    throw new CliError("Browser audit preview route is invalid.", {
      code: "AUDIT_PREVIEW_ROUTE_INVALID",
      exitCode: 2,
    });
  }
  let parsed: URL;
  try {
    parsed = new URL(route, "http://127.0.0.1");
  } catch {
    throw new CliError("Browser audit preview route is invalid.", {
      code: "AUDIT_PREVIEW_ROUTE_INVALID",
      exitCode: 2,
    });
  }
  if (parsed.origin !== "http://127.0.0.1") {
    throw new CliError("Browser audit preview route must remain on the local build origin.", {
      code: "AUDIT_PREVIEW_ROUTE_UNSAFE",
      exitCode: 2,
    });
  }
  return `${parsed.pathname}${parsed.search}${parsed.hash}`;
}

function contentType(path: string): string {
  switch (extname(path).toLowerCase()) {
    case ".css":
      return "text/css; charset=utf-8";
    case ".html":
      return "text/html; charset=utf-8";
    case ".js":
    case ".mjs":
      return "text/javascript; charset=utf-8";
    case ".json":
    case ".map":
      return "application/json; charset=utf-8";
    case ".svg":
      return "image/svg+xml";
    case ".txt":
      return "text/plain; charset=utf-8";
    case ".wasm":
      return "application/wasm";
    case ".webp":
      return "image/webp";
    case ".woff":
      return "font/woff";
    case ".woff2":
      return "font/woff2";
    default:
      return "application/octet-stream";
  }
}

function safeWebRelativePath(rawUrl: string, indexPath: string): string | null {
  if (rawUrl.length === 0 || rawUrl.length > 4_096 || !rawUrl.startsWith("/")) return null;
  const rawPath = rawUrl.split("?", 1)[0]!;
  let decoded: string;
  try {
    decoded = decodeURIComponent(rawPath);
  } catch {
    return null;
  }
  if (
    decoded.includes("\\") ||
    decoded.startsWith("//") ||
    /%[0-9a-f]{2}/iu.test(decoded) ||
    decoded.normalize("NFC") !== decoded
  ) {
    return null;
  }
  const relativePath = decoded === "/" ? indexPath : decoded.slice(1);
  const segments = relativePath.split("/");
  if (
    segments.some(
      (segment) =>
        segment === "" ||
        segment === "." ||
        segment === ".." ||
        segment.endsWith(".") ||
        segment.endsWith(" ") ||
        windowsDevicePattern.test(segment) ||
        !webSegmentPattern.test(segment),
    )
  ) {
    return null;
  }
  return segments.join("/");
}

function pathInside(root: string, candidate: string): boolean {
  const fromRoot = relative(root, candidate);
  return (
    fromRoot !== "" &&
    fromRoot !== ".." &&
    !fromRoot.startsWith(`..${sep}`) &&
    !isAbsolute(fromRoot)
  );
}

function noSymlinkWebPath(root: string, relativePath: string): boolean {
  let candidate = root;
  for (const segment of relativePath.split("/")) {
    candidate = resolve(candidate, segment);
    try {
      if (lstatSync(candidate).isSymbolicLink()) return false;
    } catch {
      return false;
    }
  }
  return true;
}

function staticServer(root: string, indexPath: string): Server {
  const canonicalRoot = realpathSync(root);
  return createServer((request, response) => {
    response.setHeader("Cache-Control", "no-store");
    response.setHeader("Referrer-Policy", "no-referrer");
    response.setHeader("X-Content-Type-Options", "nosniff");
    const method = request.method ?? "";
    if (method !== "GET" && method !== "HEAD") {
      response.writeHead(405, { Allow: "GET, HEAD" });
      response.end();
      return;
    }
    const relativePath = safeWebRelativePath(request.url ?? "", indexPath);
    if (relativePath === null) {
      response.writeHead(400);
      response.end();
      return;
    }
    const path = resolve(root, ...relativePath.split("/"));
    if (!pathInside(root, path) || !noSymlinkWebPath(root, relativePath)) {
      response.writeHead(404);
      response.end();
      return;
    }
    let descriptor: number | undefined;
    try {
      const firstCanonicalPath = realpathSync(path);
      const inspected = lstatSync(path);
      const secondCanonicalPath = realpathSync(path);
      if (
        firstCanonicalPath !== secondCanonicalPath ||
        !pathInside(canonicalRoot, secondCanonicalPath) ||
        inspected.isSymbolicLink() ||
        !inspected.isFile()
      ) {
        response.writeHead(404);
        response.end();
        return;
      }
      descriptor = openSync(path, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0));
      const opened = fstatSync(descriptor);
      if (
        !opened.isFile() ||
        inspected.dev !== opened.dev ||
        inspected.ino !== opened.ino ||
        inspected.mode !== opened.mode
      ) {
        closeSync(descriptor);
        descriptor = undefined;
        response.writeHead(404);
        response.end();
        return;
      }
      if (opened.size > MAX_PREVIEW_ASSET_BYTES) {
        closeSync(descriptor);
        descriptor = undefined;
        response.writeHead(413);
        response.end();
        return;
      }
      response.writeHead(200, {
        "Content-Length": opened.size,
        "Content-Type": contentType(path),
      });
      if (method === "HEAD") {
        closeSync(descriptor);
        descriptor = undefined;
        response.end();
      } else {
        createReadStream(path, { autoClose: true, fd: descriptor })
          .on("error", () => response.destroy())
          .pipe(response);
        descriptor = undefined;
      }
    } catch {
      if (descriptor !== undefined) closeSync(descriptor);
      response.writeHead(404);
      response.end();
    }
  });
}

async function listen(server: Server): Promise<number> {
  return new Promise((resolvePort, reject) => {
    const onError = (error: Error): void => reject(error);
    server.once("error", onError);
    server.listen({ host: "127.0.0.1", port: 0, exclusive: true }, () => {
      server.off("error", onError);
      const address = server.address();
      if (address === null || typeof address === "string") {
        reject(new TypeError("Local preview server address is unavailable."));
        return;
      }
      resolvePort(address.port);
    });
  });
}

async function closeServer(server: Server): Promise<void> {
  server.closeAllConnections();
  await new Promise<void>((resolveClose) => server.close(() => resolveClose()));
}

async function prepareBuildPreview(
  root: string,
  preview: OfficialBrowserAuditPreviewBuildV1,
): Promise<PreviewHandle> {
  assertPortableRelativePath(preview.buildPath, "Browser audit preview build");
  assertNoSymlinkAncestors(root, preview.buildPath);
  const build = resolve(root, ...preview.buildPath.split("/"));
  if (!existsSync(build)) {
    throw new CliError("Browser audit preview build does not exist.", {
      code: "AUDIT_PREVIEW_BUILD_MISSING",
      exitCode: 3,
      target: preview.buildPath,
    });
  }
  const stats = lstatSync(build);
  if (stats.isSymbolicLink() || (!stats.isDirectory() && !stats.isFile())) {
    throw new CliError("Browser audit preview build must be a directory or HTML file.", {
      code: "AUDIT_PREVIEW_BUILD_INVALID",
      exitCode: 3,
      target: preview.buildPath,
    });
  }
  if (stats.isFile() && extname(build).toLowerCase() !== ".html") {
    throw new CliError("Browser audit preview file must be HTML.", {
      code: "AUDIT_PREVIEW_BUILD_INVALID",
      exitCode: 3,
      target: preview.buildPath,
    });
  }
  const serverRoot = stats.isDirectory() ? build : dirname(build);
  const indexPath = stats.isDirectory() ? "index.html" : basename(build);
  const server = staticServer(serverRoot, indexPath);
  try {
    const port = await listen(server);
    const url = new URL(previewRoute(preview.route), `http://127.0.0.1:${String(port)}`);
    return { url, close: () => closeServer(server) };
  } catch {
    server.closeAllConnections();
    server.close();
    throw new CliError("Browser audit could not start its bounded local preview server.", {
      code: "AUDIT_PREVIEW_SERVER_UNAVAILABLE",
      exitCode: 7,
    });
  }
}

async function preparePreview(
  root: string,
  preview: OfficialBrowserAuditPreviewV1,
  offline: boolean,
): Promise<PreviewHandle> {
  if (preview.kind === "build") return prepareBuildPreview(root, preview);
  return {
    url: previewUrl(preview.url, offline),
    close: () => Promise.resolve(),
  };
}

async function loadBrowserRuntime(): Promise<BrowserRuntimeModules> {
  try {
    const playwrightSpecifier: string = "@playwright/test";
    const utilitiesSpecifier: string = "@mergora/test-utils";
    const [playwright, utilities] = (await Promise.all([
      import(playwrightSpecifier),
      import(utilitiesSpecifier),
    ])) as [JsonRecord, JsonRecord];
    const chromium = playwright.chromium as ChromiumLike | undefined;
    const createHost = utilities.createOfficialPlaywrightBrowserHostV1 as
      BrowserRuntimeModules["createHost"] | undefined;
    if (typeof chromium?.launch !== "function" || typeof createHost !== "function") {
      throw new TypeError("Optional browser audit exports are missing.");
    }
    return { chromium, createHost };
  } catch {
    throw new CliError("The optional official browser audit runtime is unavailable.", {
      code: "AUDIT_BROWSER_RUNTIME_UNAVAILABLE",
      exitCode: 7,
      recovery:
        "Install compatible @mergora/test-utils and @playwright/test packages, then install Chromium with `playwright install chromium`.",
    });
  }
}

async function restrictBrowserNetwork(context: BrowserContextLike, origin: string): Promise<void> {
  await context.route("**/*", async (route) => {
    const request = route.request();
    const method = request.method();
    let url: URL;
    try {
      url = new URL(request.url());
    } catch {
      await route.abort("blockedbyclient");
      return;
    }
    const allowed = url.origin === origin && (method === "GET" || method === "HEAD");
    if (allowed) await route.continue();
    else await route.abort("blockedbyclient");
  });
  if (context.routeWebSocket !== undefined) {
    await context.routeWebSocket("**/*", (socket) =>
      socket.close({ code: 1008, reason: "Browser audit blocks WebSocket traffic." }),
    );
  }
}

function hasRuntimeMode(modes: readonly AuditMode[]): boolean {
  return modes.some((mode) => runtimeModes.includes(mode as RuntimeAuditMode));
}

/**
 * Runs local Contract Audit with the optional official Playwright host. The
 * consumer chooses the preview explicitly; the CLI never executes a build or
 * server command and never supplies project source to a preview origin.
 */
export async function auditProjectWithOfficialBrowserV1(
  projectRoot: string,
  options: OfficialBrowserAuditOptionsV1,
): Promise<AuditReportV1> {
  const root = validatedProjectRoot(projectRoot);
  if (!hasRuntimeMode(options.requestedModes)) {
    throw new CliError("A browser preview requires at least one runtime audit mode.", {
      code: "AUDIT_BROWSER_MODE_REQUIRED",
      exitCode: 2,
    });
  }
  const limit = timeoutMs(options.runtimeTimeoutMs);
  const preview = await preparePreview(root, options.preview, options.offline ?? false);
  let browser: BrowserLike | undefined;
  let context: BrowserContextLike | undefined;
  try {
    const harnesses = compileHarnesses(root, options.items);
    if (harnesses.length === 0) {
      return await auditProject(root, {
        ...(options.items === undefined ? {} : { items: options.items }),
        requestedModes: options.requestedModes,
        changed: options.changed ?? false,
      });
    }
    const runtime = await loadBrowserRuntime();
    browser = await runtime.chromium.launch({ headless: true, timeout: limit });
    context = await browser.newContext({
      acceptDownloads: false,
      ignoreHTTPSErrors: false,
      serviceWorkers: "block",
    });
    await restrictBrowserNetwork(context, preview.url.origin);
    const page = await context.newPage();
    await page.goto(preview.url.href, { timeout: limit, waitUntil: "load" });
    const host = runtime.createHost({
      page,
      harnesses,
      actionTimeoutMs: limit,
      reloadBeforeEach: true,
    });
    return await auditProject(root, {
      ...(options.items === undefined ? {} : { items: options.items }),
      requestedModes: options.requestedModes,
      changed: options.changed ?? false,
      officialBrowserHost: host,
      runtimeMaxOutputBytes: 256 * 1024,
      runtimeTimeoutMs: limit,
    });
  } catch (error) {
    if (error instanceof CliError) throw error;
    throw new CliError("The official browser audit runtime could not complete safely.", {
      code: "AUDIT_BROWSER_RUNTIME_FAILED",
      exitCode: 7,
      recovery:
        "Verify the explicit preview route, install the pinned Chromium runtime, and retry without exposing credentials in the URL.",
    });
  } finally {
    await Promise.allSettled([
      context?.close() ?? Promise.resolve(),
      browser?.close() ?? Promise.resolve(),
      preview.close(),
    ]);
  }
}
