import { spawnSync } from "node:child_process";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { platform } from "node:os";
import { resolve } from "node:path";

import {
  assertNoSymlinkAncestors,
  assertPortableRelativePath,
  CLI_VERSION,
  CliError,
  sha256,
  validatedProjectRoot,
} from "./contracts.js";
import { mergoraConfigAliasPrefix, readMergoraConfig } from "./configuration.js";
import { inspectProject, type ProjectInspectionOptions } from "./project-inspector.js";
import {
  DOCUMENTATION_ORIGIN,
  itemDocsUrl,
  loadCatalog,
  loadSourceItem,
  OFFICIAL_REGISTRY_ORIGIN,
  registryAliases,
  resolveItemAlias,
  type CatalogRecord,
  type RegistryDataOptions,
} from "./registry-data.js";

export interface SearchOptions extends RegistryDataOptions {
  readonly kind?: string | undefined;
  readonly category?: string | undefined;
  readonly maturity?: string | undefined;
  readonly tag?: string | undefined;
  readonly limit?: number | undefined;
}

export interface SearchResult {
  readonly query: string;
  readonly resolvedAlias: string | null;
  readonly total: number;
  readonly limit: number;
  readonly categories: readonly { readonly id: string; readonly count: number }[];
  readonly items: readonly CatalogRecord[];
}

function normalizedQuery(value: string): string {
  const query = value.trim().normalize("NFC").toLocaleLowerCase("en-US");
  if (
    query.length > 128 ||
    [...query].some((character) => {
      const code = character.codePointAt(0)!;
      return code <= 31 || code === 127;
    })
  ) {
    throw new CliError("Search query is invalid or exceeds 128 characters.", {
      code: "SEARCH_QUERY_INVALID",
      exitCode: 2,
    });
  }
  return query;
}

function categoryCounts(items: readonly CatalogRecord[]) {
  const counts = new Map<string, number>();
  for (const item of items) counts.set(item.category, (counts.get(item.category) ?? 0) + 1);
  return [...counts.entries()]
    .sort(([left], [right]) => left.localeCompare(right, "en-US"))
    .map(([id, count]) => ({ id, count }));
}

function searchScore(item: CatalogRecord, query: string, aliasTarget: string | undefined): number {
  if (aliasTarget === item.id) return 0;
  if (item.id === query) return 0;
  if (item.title.toLocaleLowerCase("en-US") === query) return 1;
  if (item.id.startsWith(query)) return 2;
  if (item.title.toLocaleLowerCase("en-US").startsWith(query)) return 3;
  if (item.tags.includes(query)) return 4;
  if (
    `${item.id} ${item.title} ${item.description} ${item.tags.join(" ")}`
      .toLocaleLowerCase("en-US")
      .includes(query)
  )
    return 5;
  return Number.POSITIVE_INFINITY;
}

export function searchRegistry(queryInput = "", options: SearchOptions = {}): SearchResult {
  const query = normalizedQuery(queryInput);
  const limit = options.limit ?? 20;
  if (!Number.isInteger(limit) || limit < 1 || limit > 100) {
    throw new CliError("Search --limit must be an integer from 1 through 100.", {
      code: "SEARCH_LIMIT_INVALID",
      exitCode: 2,
    });
  }
  const catalog = loadCatalog(options);
  const aliasTarget = query === "" ? undefined : registryAliases()[query];
  let filtered = catalog.filter(
    (item) =>
      (options.kind === undefined || item.kind === options.kind || item.layer === options.kind) &&
      (options.category === undefined || item.category === options.category) &&
      (options.maturity === undefined || item.maturity === options.maturity) &&
      (options.tag === undefined || item.tags.includes(options.tag)),
  );
  if (query === "") {
    filtered = filtered
      .filter(({ sourceAvailable }) => sourceAvailable)
      .sort(
        (left, right) =>
          left.riskClass - right.riskClass || left.id.localeCompare(right.id, "en-US"),
      );
  } else {
    filtered = filtered
      .map((item) => ({ item, score: searchScore(item, query, aliasTarget) }))
      .filter(({ score }) => Number.isFinite(score))
      .sort(
        (left, right) =>
          left.score - right.score || left.item.id.localeCompare(right.item.id, "en-US"),
      )
      .map(({ item }) => item);
  }
  return {
    query,
    resolvedAlias: aliasTarget ?? null,
    total: filtered.length,
    limit,
    categories: categoryCounts(catalog),
    items: filtered.slice(0, limit),
  };
}

export interface ViewOptions extends RegistryDataOptions {
  readonly files?: boolean | undefined;
  readonly source?: string | undefined;
}

export interface ItemView {
  readonly id: string;
  readonly requestedAs: string;
  readonly title: string;
  readonly description: string;
  readonly category: string;
  readonly kind: string;
  readonly maturity: string;
  readonly targetMaturity: string;
  readonly sourceAvailable: boolean;
  readonly packageAvailable: boolean;
  readonly registryDependencies: readonly string[];
  readonly runtimeDependencies: Readonly<Record<string, string>>;
  readonly files: readonly {
    readonly logicalPath: string;
    readonly targetPath: string;
    readonly targetRole: string;
    readonly mediaType: string;
  }[];
  readonly requestedSource: { readonly logicalPath: string; readonly content: string } | null;
  readonly compatibility: {
    readonly node: ">=22.14.0";
    readonly typescript: "6.0.x";
    readonly react: "18.3.x || 19.x";
    readonly tailwind: ">=4.3.0 <5";
  };
  readonly license: "MIT";
  readonly passport: "unreleased-not-attested";
  readonly contract: "draft-unreleased" | "not-supplied";
  readonly docsUrl: string;
  readonly immutableDigest: null;
  readonly blockers: readonly string[];
}

export function viewRegistryItems(
  requested: readonly string[],
  options: ViewOptions = {},
): readonly ItemView[] {
  if (requested.length === 0) {
    throw new CliError("view requires at least one item reference.", {
      code: "VIEW_ITEM_REQUIRED",
      exitCode: 2,
    });
  }
  if (options.source !== undefined && requested.length !== 1) {
    throw new CliError("--source requires exactly one viewed item.", {
      code: "VIEW_SOURCE_ITEM_COUNT",
      exitCode: 2,
    });
  }
  const catalog = loadCatalog(options);
  const byId = new Map(catalog.map((item) => [item.id, item]));
  return requested.map((request) => {
    const id = resolveItemAlias(request, options);
    const item = byId.get(id);
    if (item === undefined) {
      throw new CliError(`Catalog item ${JSON.stringify(request)} was not found.`, {
        code: "ITEM_NOT_FOUND",
        exitCode: 7,
      });
    }
    const source = item.sourceAvailable ? loadSourceItem(id, options) : null;
    let requestedSource: { readonly logicalPath: string; readonly content: string } | null = null;
    if (options.source !== undefined) {
      if (source === null) {
        throw new CliError(`Item ${id} has no canonical source payload.`, {
          code: "ITEM_SOURCE_UNAVAILABLE",
          exitCode: 7,
        });
      }
      assertPortableRelativePath(options.source, "Logical source path");
      const file = source.files.find(
        ({ logicalPath, targetPath }) =>
          logicalPath === options.source ||
          targetPath === options.source ||
          logicalPath.endsWith(`/${options.source}`),
      );
      if (file === undefined) {
        throw new CliError(`Logical source path ${JSON.stringify(options.source)} was not found.`, {
          code: "ITEM_SOURCE_PATH_NOT_FOUND",
          exitCode: 2,
        });
      }
      requestedSource = { logicalPath: file.logicalPath, content: file.content };
    }
    return {
      id,
      requestedAs: request,
      title: item.title,
      description: item.description,
      category: item.category,
      kind: item.kind,
      maturity: source?.visibleStatus ?? item.maturity,
      targetMaturity: item.targetMaturity,
      sourceAvailable: source !== null,
      packageAvailable: false,
      registryDependencies: source?.registryDependencies ?? [],
      runtimeDependencies: source?.runtimeDependencies ?? {},
      files:
        source === null || (options.files !== true && options.source === undefined)
          ? []
          : source.files.map(({ logicalPath, targetPath, targetRole, mediaType }) => ({
              logicalPath,
              targetPath,
              targetRole,
              mediaType,
            })),
      requestedSource,
      compatibility: {
        node: ">=22.14.0",
        typescript: "6.0.x",
        react: "18.3.x || 19.x",
        tailwind: ">=4.3.0 <5",
      },
      license: "MIT",
      passport: "unreleased-not-attested",
      contract: source?.associations.contract === undefined ? "not-supplied" : "draft-unreleased",
      docsUrl: itemDocsUrl(id),
      immutableDigest: null,
      blockers: source?.blockers ?? [
        "canonical-source-not-implemented",
        "immutable-release-missing",
      ],
    };
  });
}

const TOPIC_PATHS: Readonly<Record<string, string>> = {
  accessibility: "/docs/accessibility/",
  "getting-started": "/docs/getting-started/",
  "semantic-sync": "/docs/semantic-sync/",
};

export interface DocumentationResult {
  readonly requested: string;
  readonly canonical: string;
  readonly kind: "item" | "topic";
  readonly url: string;
  readonly markdown: string;
  readonly opened: boolean;
}

function openDocumentation(url: string): boolean {
  const command =
    platform() === "win32" ? "explorer.exe" : platform() === "darwin" ? "open" : "xdg-open";
  const result = spawnSync(command, [url], {
    encoding: "utf8",
    shell: false,
    stdio: "ignore",
    windowsHide: true,
  });
  return result.status === 0;
}

export function resolveDocumentation(
  input: string,
  options: RegistryDataOptions & {
    readonly open?: boolean;
    readonly nonInteractive?: boolean;
  } = {},
): DocumentationResult {
  const topic = input.trim().normalize("NFC");
  if (!/^[a-z0-9]+(?:[/-][a-z0-9]+)*$/u.test(topic)) {
    throw new CliError("Documentation reference contains unsupported characters.", {
      code: "DOCS_REFERENCE_INVALID",
      exitCode: 2,
    });
  }
  const topicPath = TOPIC_PATHS[topic];
  let canonical: string;
  let kind: "item" | "topic";
  let url: string;
  if (topicPath !== undefined) {
    canonical = topic;
    kind = "topic";
    url = `${DOCUMENTATION_ORIGIN}${topicPath}`;
  } else {
    const id = resolveItemAlias(topic, options);
    if (!loadCatalog(options).some((item) => item.id === id)) {
      throw new CliError(`Documentation target ${JSON.stringify(input)} was not found.`, {
        code: "DOCS_NOT_FOUND",
        exitCode: 7,
      });
    }
    canonical = id;
    kind = "item";
    url = itemDocsUrl(id);
  }
  const shouldOpen = options.open === true && options.nonInteractive !== true;
  const opened = shouldOpen ? openDocumentation(url) : false;
  if (shouldOpen && !opened) {
    throw new CliError("The system browser could not be opened; use the printed URL.", {
      code: "DOCS_OPEN_FAILED",
      exitCode: 1,
    });
  }
  return {
    requested: input,
    canonical,
    kind,
    url,
    markdown: `[${kind === "item" ? `${canonical} documentation` : canonical}](${url})`,
    opened,
  };
}

export interface ProjectInfo {
  readonly cliVersion: typeof CLI_VERSION;
  readonly schemaVersion: "1.0.0";
  readonly projectRoot: ".";
  readonly framework: string;
  readonly packageManager: string;
  readonly configStatus: "missing" | "valid";
  readonly manifestStatus: "missing" | "present";
  readonly registry: {
    readonly id: "official";
    readonly origin: typeof OFFICIAL_REGISTRY_ORIGIN;
    readonly trust: "official";
    readonly mirrors: readonly string[];
  };
  readonly cache: "not-inspected-no-network";
  readonly vendor: "missing" | "present";
  readonly compatibility: {
    readonly node: ">=22.14.0";
    readonly react: "18.3.x || 19.x";
    readonly typescript: "6.0.x";
    readonly tailwind: ">=4.3.0 <5";
  };
  readonly updateAvailability: "not-checked";
}

export function projectInfo(
  projectRoot: string,
  options: ProjectInspectionOptions = {},
): ProjectInfo {
  const root = validatedProjectRoot(projectRoot);
  const config = readMergoraConfig(root);
  const inspection = inspectProject(root, {
    framework: config?.project.framework ?? options.framework,
    sourceRoot: config?.project.sourceRoot ?? options.sourceRoot,
    globalCss: config?.styling.globalCss ?? options.globalCss,
    aliasPrefix:
      options.aliasPrefix ?? (config === null ? undefined : mergoraConfigAliasPrefix(config)),
    packageManager: options.packageManager,
  });
  assertNoSymlinkAncestors(root, ".mergora/manifest.json");
  assertNoSymlinkAncestors(root, ".mergora/vendor/v1");
  return {
    cliVersion: CLI_VERSION,
    schemaVersion: "1.0.0",
    projectRoot: ".",
    framework: inspection.framework,
    packageManager: inspection.packageManager,
    configStatus: config === null ? "missing" : "valid",
    manifestStatus: existsSync(resolve(root, ".mergora/manifest.json")) ? "present" : "missing",
    registry: {
      id: "official",
      origin: OFFICIAL_REGISTRY_ORIGIN,
      trust: "official",
      mirrors: [],
    },
    cache: "not-inspected-no-network",
    vendor: existsSync(resolve(root, ".mergora/vendor/v1")) ? "present" : "missing",
    compatibility: {
      node: ">=22.14.0",
      react: "18.3.x || 19.x",
      typescript: "6.0.x",
      tailwind: ">=4.3.0 <5",
    },
    updateAvailability: "not-checked",
  };
}

export type ItemStatus =
  | "clean"
  | "locally-modified"
  | "locally-deleted"
  | "missing-base"
  | "config-drift"
  | "update-available"
  | "conflicted"
  | "orphaned"
  | "invalid";

export interface StatusItem {
  readonly id: string;
  readonly status: ItemStatus;
  readonly files: readonly { readonly target: string; readonly status: ItemStatus }[];
}

export interface ProjectStatus {
  readonly projectRoot: ".";
  readonly configured: boolean;
  readonly manifest: "missing" | "p1-legacy" | "v1" | "invalid";
  readonly items: readonly StatusItem[];
  readonly incompleteTransactions: readonly string[];
  readonly summary: Readonly<Record<ItemStatus, number>>;
  readonly checkedUpdates: false;
}

function readObject(root: string, relativePath: string): Record<string, unknown> {
  assertNoSymlinkAncestors(root, relativePath);
  try {
    const value = JSON.parse(readFileSync(resolve(root, relativePath), "utf8")) as unknown;
    if (value === null || Array.isArray(value) || typeof value !== "object") throw new Error();
    return value as Record<string, unknown>;
  } catch {
    throw new CliError("Mergora manifest is not valid JSON.", {
      code: "MANIFEST_INVALID_JSON",
      exitCode: 3,
      target: relativePath,
    });
  }
}

function incompleteTransactions(root: string): readonly string[] {
  const relativeDirectory = ".mergora/transactions";
  assertNoSymlinkAncestors(root, relativeDirectory);
  const directory = resolve(root, ".mergora/transactions");
  if (!existsSync(directory)) return [];
  if (!statSync(directory).isDirectory()) {
    throw new CliError("The local transaction path must be a regular directory.", {
      code: "TRANSACTION_DIRECTORY_INVALID",
      exitCode: 5,
      target: relativeDirectory,
    });
  }
  const terminalStates = new Set(["committed", "rolled-back", "abandoned"]);
  return readdirSync(directory, { withFileTypes: true })
    .filter((entry) => /^[0-9A-Za-zTZ_-][0-9A-Za-zTZ._-]*$/u.test(entry.name))
    .filter((entry) => {
      const relativeEntry = `${relativeDirectory}/${entry.name}`;
      assertNoSymlinkAncestors(root, relativeEntry);
      return entry.isDirectory();
    })
    .map((entry) => entry.name)
    .filter((name) => {
      const metadataRelativePath = `${relativeDirectory}/${name}/transaction.json`;
      assertNoSymlinkAncestors(root, metadataRelativePath);
      const metadataPath = resolve(root, metadataRelativePath);
      if (!existsSync(metadataPath)) return true;
      try {
        const metadata = JSON.parse(readFileSync(metadataPath, "utf8")) as unknown;
        return (
          metadata === null ||
          Array.isArray(metadata) ||
          typeof metadata !== "object" ||
          !terminalStates.has(String((metadata as Record<string, unknown>).state))
        );
      } catch {
        return true;
      }
    })
    .sort((left, right) => left.localeCompare(right, "en-US"));
}

function summarize(items: readonly StatusItem[]): Readonly<Record<ItemStatus, number>> {
  const summary: Record<ItemStatus, number> = {
    clean: 0,
    "locally-modified": 0,
    "locally-deleted": 0,
    "missing-base": 0,
    "config-drift": 0,
    "update-available": 0,
    conflicted: 0,
    orphaned: 0,
    invalid: 0,
  };
  for (const item of items) summary[item.status] += 1;
  return summary;
}

function p1Status(root: string, manifest: Record<string, unknown>): readonly StatusItem[] {
  const items = Array.isArray(manifest.items)
    ? manifest.items.filter((item): item is string => typeof item === "string")
    : [];
  const files = Array.isArray(manifest.files)
    ? manifest.files.filter((file): file is string => typeof file === "string")
    : [];
  return items
    .sort((left, right) => left.localeCompare(right, "en-US"))
    .map((id) => {
      const owned = files.filter((file) => file.includes(`/${id}/`));
      const mapped = owned.map((target) => {
        try {
          assertPortableRelativePath(target, "Legacy manifest target");
        } catch {
          return { target: "<invalid>", status: "invalid" as const };
        }
        assertNoSymlinkAncestors(root, target);
        return {
          target,
          status: (existsSync(resolve(root, target))
            ? "missing-base"
            : "locally-deleted") as ItemStatus,
        };
      });
      return {
        id,
        status: mapped.some(({ status }) => status === "invalid")
          ? "invalid"
          : mapped.some(({ status }) => status === "locally-deleted")
            ? "locally-deleted"
            : "missing-base",
        files: mapped,
      };
    });
}

function v1Status(root: string, manifest: Record<string, unknown>): readonly StatusItem[] {
  const rawItems = manifest.items;
  if (rawItems === null || Array.isArray(rawItems) || typeof rawItems !== "object") return [];
  return Object.entries(rawItems)
    .sort(([left], [right]) => left.localeCompare(right, "en-US"))
    .map(([qualifiedId, rawItem]) => {
      if (rawItem === null || Array.isArray(rawItem) || typeof rawItem !== "object") {
        return { id: qualifiedId, status: "invalid" as const, files: [] };
      }
      const item = rawItem as Record<string, unknown>;
      if (!Array.isArray(item.files))
        return { id: qualifiedId, status: "invalid" as const, files: [] };
      const files = item.files.map((rawFile) => {
        if (rawFile === null || Array.isArray(rawFile) || typeof rawFile !== "object") {
          return { target: "<invalid>", status: "invalid" as const };
        }
        const file = rawFile as Record<string, unknown>;
        if (typeof file.target !== "string")
          return { target: "<invalid>", status: "invalid" as const };
        try {
          assertPortableRelativePath(file.target, "Manifest target");
        } catch {
          return { target: "<invalid>", status: "invalid" as const };
        }
        assertNoSymlinkAncestors(root, file.target);
        const targetPath = resolve(root, file.target);
        if (!existsSync(targetPath))
          return { target: file.target, status: "locally-deleted" as const };
        if (!statSync(targetPath).isFile()) {
          return { target: file.target, status: "invalid" as const };
        }
        if (typeof file.base !== "string" || !/^sha256:[a-f0-9]{64}$/u.test(file.base)) {
          return { target: file.target, status: "missing-base" as const };
        }
        const digest = file.base.slice("sha256:".length);
        const baseRelativePath = `.mergora/bases/sha256/${digest.slice(0, 2)}/${digest.slice(2)}.blob`;
        assertNoSymlinkAncestors(root, baseRelativePath);
        const basePath = resolve(root, baseRelativePath);
        if (
          !existsSync(basePath) ||
          !statSync(basePath).isFile() ||
          sha256(readFileSync(basePath)) !== file.base
        ) {
          return { target: file.target, status: "missing-base" as const };
        }
        const current = sha256(readFileSync(targetPath));
        if (
          typeof file.installed !== "string" ||
          !/^sha256:[a-f0-9]{64}$/u.test(file.installed) ||
          current !== file.installed ||
          file.installed !== file.base
        ) {
          return { target: file.target, status: "locally-modified" as const };
        }
        return { target: file.target, status: "clean" as const };
      });
      const priority: readonly ItemStatus[] = [
        "invalid",
        "missing-base",
        "locally-deleted",
        "locally-modified",
        "clean",
      ];
      const status =
        priority.find((candidate) => files.some((file) => file.status === candidate)) ?? "clean";
      return { id: qualifiedId, status, files };
    });
}

export function projectStatus(projectRoot: string): ProjectStatus {
  const root = validatedProjectRoot(projectRoot);
  const configured = readMergoraConfig(root) !== null;
  assertNoSymlinkAncestors(root, ".mergora/manifest.json");
  const manifestPath = resolve(root, ".mergora/manifest.json");
  if (!existsSync(manifestPath)) {
    assertNoSymlinkAncestors(root, ".mergora/p1-manifest.json");
    const p1Path = resolve(root, ".mergora/p1-manifest.json");
    const hasP1Manifest = existsSync(p1Path);
    const items = hasP1Manifest
      ? p1Status(root, readObject(root, ".mergora/p1-manifest.json"))
      : [];
    return {
      projectRoot: ".",
      configured,
      manifest: hasP1Manifest ? "p1-legacy" : "missing",
      items,
      incompleteTransactions: incompleteTransactions(root),
      summary: summarize(items),
      checkedUpdates: false,
    };
  }
  const manifest = readObject(root, ".mergora/manifest.json");
  const validIdentity =
    manifest.schemaVersion === 1 &&
    typeof manifest.$schema === "string" &&
    manifest.$schema.endsWith("/manifest-v1.schema.json");
  const items = validIdentity ? v1Status(root, manifest) : [];
  return {
    projectRoot: ".",
    configured,
    manifest: validIdentity ? "v1" : "invalid",
    items,
    incompleteTransactions: incompleteTransactions(root),
    summary: summarize(items),
    checkedUpdates: false,
  };
}

export interface DoctorCheck {
  readonly code: string;
  readonly status: "pass" | "warning" | "error";
  readonly message: string;
  readonly target?: string;
  readonly fixable: boolean;
}

export interface DoctorResult {
  readonly projectRoot: ".";
  readonly healthy: boolean;
  readonly checks: readonly DoctorCheck[];
  readonly counts: { readonly pass: number; readonly warning: number; readonly error: number };
  readonly networkUsed: false;
}

export function doctorProject(projectRoot: string): DoctorResult {
  const root = validatedProjectRoot(projectRoot);
  const checks: DoctorCheck[] = [];
  let configValid = false;
  try {
    const config = readMergoraConfig(root);
    configValid = config !== null;
    checks.push(
      config === null
        ? {
            code: "CONFIG_MISSING",
            status: "error",
            message: "mergora.json is missing; run mergora init --plan.",
            target: "mergora.json",
            fixable: true,
          }
        : {
            code: "CONFIG_VALID",
            status: "pass",
            message: "mergora.json matches the supported strict v1 profile.",
            target: "mergora.json",
            fixable: false,
          },
    );
  } catch (error) {
    checks.push({
      code: error instanceof CliError ? error.code : "CONFIG_INVALID",
      status: "error",
      message: error instanceof Error ? error.message : "mergora.json is invalid.",
      target: "mergora.json",
      fixable: false,
    });
  }
  try {
    const config = configValid ? readMergoraConfig(root) : null;
    const inspection = inspectProject(root, {
      framework: config?.project.framework,
      sourceRoot: config?.project.sourceRoot,
      globalCss: config?.styling.globalCss,
      aliasPrefix: config === null ? undefined : mergoraConfigAliasPrefix(config),
    });
    checks.push({
      code: "PROJECT_COMPATIBLE",
      status: "pass",
      message: `${inspection.framework} with ${inspection.packageManager} and Tailwind CSS v4 is supported.`,
      fixable: false,
    });
    checks.push({
      code:
        inspection.aliasEvidence[0]?.startsWith("default:") === true
          ? "ALIAS_DEFAULT"
          : "ALIAS_VALID",
      status: inspection.aliasEvidence[0]?.startsWith("default:") === true ? "warning" : "pass",
      message:
        inspection.aliasEvidence[0]?.startsWith("default:") === true
          ? "No tsconfig path alias is declared; the explicit @ config alias may require project setup."
          : "The configured source alias is backed by tsconfig paths.",
      target: "tsconfig.json",
      fixable: false,
    });
  } catch (error) {
    checks.push({
      code: error instanceof CliError ? error.code : "PROJECT_INSPECTION_FAILED",
      status: "error",
      message: error instanceof Error ? error.message : "Project inspection failed.",
      fixable: false,
    });
  }
  try {
    assertNoSymlinkAncestors(root, ".gitignore");
    const ignorePath = resolve(root, ".gitignore");
    const ignore = existsSync(ignorePath) ? readFileSync(ignorePath, "utf8") : "";
    const missingIgnore = [
      ".mergora/cache/",
      ".mergora/transactions/",
      ".mergora/tmp/",
      ".mergora/.lock",
    ].filter((rule) => !ignore.split(/\r?\n/gu).includes(rule));
    checks.push(
      missingIgnore.length === 0
        ? {
            code: "LOCAL_STATE_IGNORED",
            status: "pass",
            message:
              "Only local Mergora cache, transactions, temporary state, and lock are ignored.",
            target: ".gitignore",
            fixable: false,
          }
        : {
            code: "LOCAL_STATE_IGNORE_MISSING",
            status: "warning",
            message: `Missing local-state ignore rules: ${missingIgnore.join(", ")}.`,
            target: ".gitignore",
            fixable: true,
          },
    );
  } catch (error) {
    checks.push({
      code: error instanceof CliError ? error.code : "IGNORE_INSPECTION_FAILED",
      status: "error",
      message: error instanceof Error ? error.message : ".gitignore inspection failed.",
      target: error instanceof CliError ? (error.target ?? ".gitignore") : ".gitignore",
      fixable: false,
    });
  }
  try {
    const status = projectStatus(root);
    checks.push({
      code: status.manifest === "v1" ? "MANIFEST_VALID" : "MANIFEST_INCOMPLETE",
      status: status.manifest === "v1" ? "pass" : "error",
      message:
        status.manifest === "p1-legacy"
          ? "Only the legacy P1 path manifest exists; immutable bases are not recorded."
          : status.manifest === "missing"
            ? "The v1 provenance manifest is missing."
            : status.manifest === "invalid"
              ? "The v1 provenance manifest is invalid."
              : "The v1 provenance manifest identity is valid.",
      target: ".mergora/manifest.json",
      fixable: status.manifest === "missing",
    });
    checks.push({
      code:
        status.incompleteTransactions.length === 0
          ? "TRANSACTIONS_COMPLETE"
          : "TRANSACTIONS_INCOMPLETE",
      status: status.incompleteTransactions.length === 0 ? "pass" : "error",
      message:
        status.incompleteTransactions.length === 0
          ? "No incomplete local transactions were detected."
          : `${String(status.incompleteTransactions.length)} transaction directories require recovery inspection.`,
      target: ".mergora/transactions",
      fixable: false,
    });
    if (status.items.some(({ status: itemStatus }) => itemStatus === "missing-base")) {
      checks.push({
        code: "BASE_STORE_INCOMPLETE",
        status: "error",
        message: "One or more installed items have missing or unverifiable base content.",
        target: ".mergora/bases",
        fixable: false,
      });
    }
  } catch (error) {
    checks.push({
      code: error instanceof CliError ? error.code : "MANIFEST_INVALID",
      status: "error",
      message: error instanceof Error ? error.message : "Manifest inspection failed.",
      target:
        error instanceof CliError
          ? (error.target ?? ".mergora/manifest.json")
          : ".mergora/manifest.json",
      fixable: false,
    });
  }
  checks.sort((left, right) => left.code.localeCompare(right.code, "en-US"));
  const counts = {
    pass: checks.filter(({ status }) => status === "pass").length,
    warning: checks.filter(({ status }) => status === "warning").length,
    error: checks.filter(({ status }) => status === "error").length,
  };
  return { projectRoot: ".", healthy: counts.error === 0, checks, counts, networkUsed: false };
}
