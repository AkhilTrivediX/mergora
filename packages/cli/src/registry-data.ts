import { existsSync, lstatSync, readFileSync, readdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import {
  assertPortableRelativePath,
  canonicalJson,
  CliError,
  portableSort,
  resolveInside,
  sha256,
} from "./contracts.js";

export const OFFICIAL_REGISTRY_ORIGIN = "https://akhiltrivedix.github.io/mergora/r/v1" as const;
export const DOCUMENTATION_ORIGIN = "https://akhiltrivedix.github.io/mergora" as const;

const ITEM_ID = /^[a-z0-9]+(?:-[a-z0-9]+)*$/u;
const MAX_JSON_BYTES = 4 * 1024 * 1024;
const KNOWN_ITEM_ALIASES: Readonly<Record<string, string>> = Object.freeze({
  divider: "separator",
  "screen-reader-only": "visually-hidden",
  "sr-only": "visually-hidden",
});

const RUNTIME_RANGES: Readonly<Record<string, string>> = Object.freeze({
  "@tanstack/react-table": "8.21.3",
  react: "19.2.7",
  "react-aria-components": "1.19.0",
  "react-dom": "19.2.7",
});

export interface SourceFileRecord {
  readonly content: string;
  readonly executable: false;
  readonly logicalPath: string;
  readonly mediaType: string;
  readonly targetPath: string;
  readonly targetRole: string;
}

export interface SourceItemRecord {
  readonly itemId: string;
  readonly title: string;
  readonly description: string;
  readonly kind: string;
  readonly visibleStatus: string;
  readonly implementationStatus: string;
  readonly files: readonly SourceFileRecord[];
  readonly registryDependencies: readonly string[];
  readonly runtimeDependencies: Readonly<Record<string, string>>;
  readonly installDependencies: Readonly<Record<string, string>>;
  readonly blockers: readonly string[];
  readonly packageImport: string | null;
  readonly packageStyleImport: string | null;
  readonly associations: Readonly<Record<string, string>>;
  readonly payloadDigest: `sha256:${string}`;
}

export interface CatalogRecord {
  readonly id: string;
  readonly title: string;
  readonly description: string;
  readonly kind: string;
  readonly layer: string;
  readonly category: string;
  readonly targetMaturity: string;
  readonly maturity: string;
  readonly riskClass: number;
  readonly tags: readonly string[];
  readonly sourceAvailable: boolean;
  readonly implementationStatus: string;
  readonly docsUrl: string;
  readonly dependencyCount: number;
  readonly qualityTier: null;
  readonly latestStableVersion: null;
  readonly installModes: {
    readonly source: boolean;
    readonly package: boolean;
  };
}

interface RawSourcePayload {
  readonly artifactKind?: unknown;
  readonly itemId?: unknown;
  readonly title?: unknown;
  readonly description?: unknown;
  readonly kind?: unknown;
  readonly visibleStatus?: unknown;
  readonly implementationStatus?: unknown;
  readonly files?: unknown;
  readonly registryDependencies?: unknown;
  readonly runtimeDependencies?: unknown;
  readonly blockers?: unknown;
  readonly packageImport?: unknown;
  readonly packageStyleImport?: unknown;
  readonly associations?: unknown;
  readonly publicationStatus?: unknown;
}

interface RawCatalogItem {
  readonly id?: unknown;
  readonly displayName?: unknown;
  readonly normativeBehavior?: unknown;
  readonly kind?: unknown;
  readonly layer?: unknown;
  readonly category?: unknown;
  readonly targetMaturity?: unknown;
  readonly visibleStatus?: unknown;
  readonly riskClass?: unknown;
  readonly requiredStateGroups?: unknown;
  readonly sourceAvailable?: unknown;
  readonly implementationStatus?: unknown;
}

interface RawCatalog {
  readonly artifactKind?: unknown;
  readonly schemaVersion?: unknown;
  readonly items?: unknown;
}

export interface RegistryDataOptions {
  /** Trusted bundled registry directory. Tests may provide a fixture directory. */
  readonly registryDirectory?: string;
}

function readJson(path: string, label: string): unknown {
  let metadata;
  try {
    metadata = lstatSync(path);
  } catch {
    metadata = null;
  }
  if (metadata === null || metadata.isSymbolicLink() || !metadata.isFile()) {
    throw new CliError(`${label} is unavailable. Rebuild or reinstall the packed CLI.`, {
      code: "BUNDLED_REGISTRY_MISSING",
      exitCode: 5,
    });
  }
  if (metadata.size > MAX_JSON_BYTES) {
    throw new CliError(`${label} exceeds the trusted bundled size limit.`, {
      code: "BUNDLED_REGISTRY_OVERSIZE",
      exitCode: 5,
    });
  }
  try {
    return JSON.parse(readFileSync(path, "utf8")) as unknown;
  } catch {
    throw new CliError(`${label} is not valid JSON.`, {
      code: "BUNDLED_REGISTRY_INVALID_JSON",
      exitCode: 5,
    });
  }
}

function defaultGeneratedRoot(): string {
  const moduleDirectory = dirname(fileURLToPath(import.meta.url));
  const bundled = resolve(moduleDirectory, "registry");
  if (existsSync(bundled)) return bundled;
  return resolve(moduleDirectory, "../../../registry/generated");
}

function sourceItemsDirectory(options: RegistryDataOptions): string {
  const root = resolve(options.registryDirectory ?? defaultGeneratedRoot());
  const nested = resolve(root, "native-source-items");
  return existsSync(nested) ? nested : resolve(root, "items");
}

function stringArray(value: unknown, label: string): readonly string[] {
  if (!Array.isArray(value) || value.some((entry) => typeof entry !== "string")) {
    throw new CliError(`${label} must be a string array.`, {
      code: "BUNDLED_REGISTRY_INVALID",
      exitCode: 5,
    });
  }
  return portableSort(value as string[]);
}

function stringRecord(value: unknown, label: string): Readonly<Record<string, string>> {
  if (value === undefined) return {};
  if (value === null || Array.isArray(value) || typeof value !== "object") {
    throw new CliError(`${label} must be an object.`, {
      code: "BUNDLED_REGISTRY_INVALID",
      exitCode: 5,
    });
  }
  const result: Record<string, string> = {};
  for (const [key, entry] of Object.entries(value)) {
    if (entry === null) continue;
    if (typeof entry !== "string") {
      throw new CliError(`${label} values must be strings or null.`, {
        code: "BUNDLED_REGISTRY_INVALID",
        exitCode: 5,
      });
    }
    result[key] = entry;
  }
  return Object.fromEntries(
    Object.entries(result).sort(([left], [right]) => left.localeCompare(right, "en-US")),
  );
}

function normalizeFile(value: unknown, itemId: string): SourceFileRecord {
  if (value === null || Array.isArray(value) || typeof value !== "object") {
    throw new CliError(`Bundled item ${itemId} contains an invalid file.`, {
      code: "BUNDLED_ITEM_INVALID_FILE",
      exitCode: 5,
    });
  }
  const file = value as Record<string, unknown>;
  if (
    typeof file.logicalPath !== "string" ||
    typeof file.targetPath !== "string" ||
    typeof file.content !== "string" ||
    typeof file.mediaType !== "string" ||
    typeof file.targetRole !== "string" ||
    file.executable !== false
  ) {
    throw new CliError(`Bundled item ${itemId} contains an unsafe file declaration.`, {
      code: "BUNDLED_ITEM_INVALID_FILE",
      exitCode: 5,
    });
  }
  assertPortableRelativePath(file.logicalPath, "Logical source path");
  assertPortableRelativePath(file.targetPath, "Source target path");
  return {
    content: file.content,
    executable: false,
    logicalPath: file.logicalPath,
    mediaType: file.mediaType,
    targetPath: file.targetPath,
    targetRole: file.targetRole,
  };
}

function normalizeSourcePayload(value: unknown, expectedId: string): SourceItemRecord {
  if (value === null || Array.isArray(value) || typeof value !== "object") {
    throw new CliError(`Bundled source item ${expectedId} is invalid.`, {
      code: "BUNDLED_ITEM_INVALID",
      exitCode: 5,
    });
  }
  const payload = value as RawSourcePayload;
  if (
    payload.artifactKind !== "unreleased-native-source-item" ||
    payload.itemId !== expectedId ||
    !ITEM_ID.test(expectedId) ||
    payload.publicationStatus !== "unreleased" ||
    !Array.isArray(payload.files) ||
    typeof payload.title !== "string" ||
    typeof payload.description !== "string" ||
    typeof payload.kind !== "string" ||
    typeof payload.visibleStatus !== "string" ||
    typeof payload.implementationStatus !== "string"
  ) {
    throw new CliError(`Bundled source item ${expectedId} failed identity validation.`, {
      code: "BUNDLED_ITEM_INVALID",
      exitCode: 5,
    });
  }
  const files = payload.files.map((file) => normalizeFile(file, expectedId));
  const targetKeys = new Set<string>();
  for (const file of files) {
    const key = file.targetPath.normalize("NFC").toLocaleLowerCase("en-US");
    if (targetKeys.has(key)) {
      throw new CliError(`Bundled source item ${expectedId} repeats a portable target.`, {
        code: "BUNDLED_ITEM_TARGET_COLLISION",
        exitCode: 5,
      });
    }
    targetKeys.add(key);
  }
  const registryDependencies = stringArray(
    payload.registryDependencies ?? [],
    `${expectedId} registryDependencies`,
  );
  for (const dependency of registryDependencies) {
    if (!ITEM_ID.test(dependency) || dependency === expectedId) {
      throw new CliError(`Bundled source item ${expectedId} has an invalid dependency.`, {
        code: "BUNDLED_ITEM_DEPENDENCY_INVALID",
        exitCode: 5,
      });
    }
  }
  const runtimeNames = stringArray(payload.runtimeDependencies ?? [], `${expectedId} dependencies`);
  const runtimeDependencies: Record<string, string> = {};
  for (const name of runtimeNames) {
    const range = RUNTIME_RANGES[name];
    if (range === undefined) {
      throw new CliError(
        `Bundled source item ${expectedId} declares unsupported runtime dependency ${JSON.stringify(name)}.`,
        { code: "BUNDLED_ITEM_DEPENDENCY_UNPINNED", exitCode: 5 },
      );
    }
    runtimeDependencies[name] = range;
  }
  const installDependencies = Object.fromEntries(
    Object.entries(runtimeDependencies).filter(
      ([name]) => name !== "react" && name !== "react-dom",
    ),
  );
  return {
    itemId: expectedId,
    title: payload.title,
    description: payload.description,
    kind: payload.kind,
    visibleStatus: payload.visibleStatus,
    implementationStatus: payload.implementationStatus,
    files,
    registryDependencies,
    runtimeDependencies,
    installDependencies,
    blockers: stringArray(payload.blockers ?? [], `${expectedId} blockers`),
    packageImport: typeof payload.packageImport === "string" ? payload.packageImport : null,
    packageStyleImport:
      typeof payload.packageStyleImport === "string" ? payload.packageStyleImport : null,
    associations: stringRecord(payload.associations, `${expectedId} associations`),
    payloadDigest: sha256(canonicalJson(value)),
  };
}

export function listSourceItemIds(options: RegistryDataOptions = {}): readonly string[] {
  const directory = sourceItemsDirectory(options);
  let metadata;
  try {
    metadata = lstatSync(directory);
  } catch {
    metadata = null;
  }
  if (metadata === null || metadata.isSymbolicLink() || !metadata.isDirectory()) {
    throw new CliError("Bundled source item directory is unavailable.", {
      code: "BUNDLED_REGISTRY_MISSING",
      exitCode: 5,
    });
  }
  const entries = readdirSync(directory, { withFileTypes: true });
  if (
    entries.some(
      (entry) =>
        !entry.isFile() ||
        entry.isSymbolicLink() ||
        !/^[a-z0-9]+(?:-[a-z0-9]+)*\.json$/u.test(entry.name),
    )
  ) {
    throw new CliError("Bundled source index contains a symlink or unsupported entry.", {
      code: "BUNDLED_REGISTRY_UNSAFE_ENTRY",
      exitCode: 5,
    });
  }
  const ids = entries.map((entry) => entry.name.slice(0, -5));
  for (const id of ids) {
    if (!ITEM_ID.test(id)) {
      throw new CliError("Bundled source index contains an unsafe item filename.", {
        code: "BUNDLED_REGISTRY_INVALID",
        exitCode: 5,
      });
    }
  }
  return portableSort(ids);
}

export function loadSourceItem(
  itemOrAlias: string,
  options: RegistryDataOptions = {},
): SourceItemRecord {
  const itemId = resolveItemAlias(itemOrAlias, options);
  const directory = sourceItemsDirectory(options);
  const path = resolveInside(directory, `${itemId}.json`, "Bundled item path");
  return normalizeSourcePayload(readJson(path, `Bundled source item ${itemId}`), itemId);
}

export function loadAllSourceItems(options: RegistryDataOptions = {}): readonly SourceItemRecord[] {
  const items = listSourceItemIds(options).map((id) => loadSourceItem(id, options));
  const known = new Set(items.map(({ itemId }) => itemId));
  for (const item of items) {
    for (const dependency of item.registryDependencies) {
      if (!known.has(dependency)) {
        throw new CliError(
          `Bundled source item ${item.itemId} depends on missing item ${dependency}.`,
          { code: "BUNDLED_ITEM_DEPENDENCY_MISSING", exitCode: 5 },
        );
      }
    }
  }
  return items;
}

export function resolveSourceDependencyClosure(
  requested: readonly string[],
  options: RegistryDataOptions = {},
): readonly SourceItemRecord[] {
  const items = loadAllSourceItems(options);
  const byId = new Map(items.map((item) => [item.itemId, item]));
  const state = new Map<string, "visiting" | "visited">();
  const result: SourceItemRecord[] = [];
  const visit = (input: string): void => {
    const id = resolveItemAlias(input, options);
    const item = byId.get(id);
    if (item === undefined) {
      throw new CliError(`Unknown or unavailable source item ${JSON.stringify(input)}.`, {
        code: "ITEM_NOT_SOURCE_AVAILABLE",
        exitCode: 7,
      });
    }
    const current = state.get(id);
    if (current === "visited") return;
    if (current === "visiting") {
      throw new CliError(`Source dependency cycle includes ${id}.`, {
        code: "ITEM_DEPENDENCY_CYCLE",
        exitCode: 5,
      });
    }
    state.set(id, "visiting");
    for (const dependency of item.registryDependencies) visit(dependency);
    state.set(id, "visited");
    result.push(item);
  };
  for (const id of [...new Set(requested)].sort((a, b) => a.localeCompare(b, "en-US"))) visit(id);
  return result;
}

function rawCatalogPath(options: RegistryDataOptions): string {
  const root = resolve(options.registryDirectory ?? defaultGeneratedRoot());
  const direct = resolve(root, "catalog.json");
  if (existsSync(direct)) return direct;
  return resolve(root, "../catalog.json");
}

export function loadCatalog(options: RegistryDataOptions = {}): readonly CatalogRecord[] {
  const raw = readJson(rawCatalogPath(options), "Bundled catalog") as RawCatalog;
  if (
    raw === null ||
    typeof raw !== "object" ||
    raw.artifactKind !== "registry-catalog-plan" ||
    raw.schemaVersion !== 1 ||
    !Array.isArray(raw.items)
  ) {
    throw new CliError("Bundled catalog failed schema identity validation.", {
      code: "BUNDLED_CATALOG_INVALID",
      exitCode: 5,
    });
  }
  const sourceItems = loadAllSourceItems(options);
  const dependencyCounts = new Map(
    sourceItems.map((item) => [item.itemId, item.registryDependencies.length]),
  );
  const sourceIds = new Set(sourceItems.map(({ itemId }) => itemId));
  const catalogIds = new Set<string>();
  const records = raw.items.map((value) => {
    if (value === null || Array.isArray(value) || typeof value !== "object") {
      throw new CliError("Bundled catalog contains an invalid item.", {
        code: "BUNDLED_CATALOG_INVALID",
        exitCode: 5,
      });
    }
    const item = value as RawCatalogItem;
    if (
      typeof item.id !== "string" ||
      !ITEM_ID.test(item.id) ||
      typeof item.displayName !== "string" ||
      typeof item.normativeBehavior !== "string" ||
      typeof item.kind !== "string" ||
      typeof item.layer !== "string" ||
      typeof item.category !== "string" ||
      typeof item.targetMaturity !== "string" ||
      typeof item.riskClass !== "number" ||
      typeof item.sourceAvailable !== "boolean" ||
      typeof item.implementationStatus !== "string"
    ) {
      throw new CliError("Bundled catalog contains an invalid item record.", {
        code: "BUNDLED_CATALOG_INVALID",
        exitCode: 5,
      });
    }
    if (catalogIds.has(item.id)) {
      throw new CliError(`Bundled catalog repeats item ${item.id}.`, {
        code: "BUNDLED_CATALOG_DUPLICATE",
        exitCode: 5,
      });
    }
    catalogIds.add(item.id);
    if (item.sourceAvailable !== sourceIds.has(item.id)) {
      throw new CliError(`Bundled catalog source availability for ${item.id} is inconsistent.`, {
        code: "BUNDLED_CATALOG_SOURCE_MISMATCH",
        exitCode: 5,
      });
    }
    return {
      id: item.id,
      title: item.displayName,
      description: item.normativeBehavior,
      kind: item.kind,
      layer: item.layer,
      category: item.category,
      targetMaturity: item.targetMaturity,
      maturity: typeof item.visibleStatus === "string" ? item.visibleStatus : "unreleased",
      riskClass: item.riskClass,
      tags: stringArray(item.requiredStateGroups ?? [], `${item.id} state groups`),
      sourceAvailable: item.sourceAvailable,
      implementationStatus: item.implementationStatus,
      docsUrl: itemDocsUrl(item.id),
      dependencyCount: dependencyCounts.get(item.id) ?? 0,
      qualityTier: null,
      latestStableVersion: null,
      installModes: {
        source: false,
        package: false,
      },
    };
  });
  if ([...sourceIds].some((itemId) => !catalogIds.has(itemId))) {
    throw new CliError("Bundled catalog omits one or more source payloads.", {
      code: "BUNDLED_CATALOG_SOURCE_MISMATCH",
      exitCode: 5,
    });
  }
  return records;
}

export function resolveItemAlias(input: string, options: RegistryDataOptions = {}): string {
  if (!ITEM_ID.test(input)) {
    throw new CliError(`Item reference ${JSON.stringify(input)} is invalid.`, {
      code: "ITEM_REFERENCE_INVALID",
      exitCode: 2,
    });
  }
  const canonicalIds = new Set(
    existsSync(sourceItemsDirectory(options))
      ? listSourceItemIds(options)
      : loadCatalog(options).map(({ id }) => id),
  );
  if (canonicalIds.has(input)) return input;
  const alias = KNOWN_ITEM_ALIASES[input];
  if (alias !== undefined && canonicalIds.has(alias)) return alias;
  return input;
}

export function itemDocsUrl(itemId: string): string {
  if (!ITEM_ID.test(itemId)) {
    throw new CliError("Documentation item ID is invalid.", {
      code: "ITEM_REFERENCE_INVALID",
      exitCode: 2,
    });
  }
  return `${DOCUMENTATION_ORIGIN}/components/${itemId}/`;
}

export function registryAliases(): Readonly<Record<string, string>> {
  return KNOWN_ITEM_ALIASES;
}
