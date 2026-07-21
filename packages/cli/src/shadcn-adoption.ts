import { existsSync, lstatSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

import ts from "typescript";

import {
  assertNoSymlinkAncestors,
  assertPortableRelativePath,
  canonicalJson,
  CLI_VERSION,
  CliError,
  portableSort,
  sha256,
  validatedProjectRoot,
} from "./contracts.js";
import { readMergoraConfig, validateMergoraConfig, type MergoraConfig } from "./configuration.js";
import { compatibleDependencyRange } from "./package-editor.js";
import { inspectProject, type PackageManager } from "./project-inspector.js";
import {
  acquireShadcnRegistryCatalog,
  SHADCN_V1_ADAPTER_VERSION,
  type AcquireShadcnRegistryCatalogOptions,
  type AcquiredShadcnRegistryCatalog,
  type AcquiredShadcnRegistryFile,
  type AcquiredShadcnRegistryItem,
} from "./registry-management.js";
import {
  basePath,
  MANIFEST_PATH,
  normalizedManifest,
  parseManifestBytes,
  readManifest,
  readProjectFile,
  type ManifestFile,
  type ManifestItem,
  type ProvenanceManifest,
  type SourceOperationResult,
} from "./source-operations.js";
import {
  executeTransaction,
  finalizeOperationPlan,
  validateTransactionOverlay,
  validationSuiteForTransaction,
  type OperationPlan,
  type OperationPlanFile,
  type PackageManagerRunner,
  type TransactionFaultInjector,
  type TransactionMutation,
  type TransactionRegistryPayload,
  type TransactionValidationContext,
  type TransactionValidationIssue,
  type TransactionValidationResult,
  type TransactionValidator,
} from "./transaction-engine.js";
import {
  createMediaParseValidator,
  transactionValidationResult,
  type TransactionMediaFile,
} from "./trusted-transaction-validators.js";

const SHADCN_CONFIG_PATH = "components.json" as const;
const ITEM_ID = /^[a-z0-9]+(?:-[a-z0-9]+)*$/u;
const PACKAGE_NAME = /^(?:@[a-z0-9][a-z0-9._-]*\/)?[a-z0-9][a-z0-9._-]*$/u;
const SHADCN_SCHEMA = "https://ui.shadcn.com/schema.json" as const;

type Digest = `sha256:${string}`;
type ShadcnAliasKey = "components" | "hooks" | "lib" | "ui" | "utils";

export interface ShadcnAdoptionOptions extends Omit<
  AcquireShadcnRegistryCatalogOptions,
  "registryId"
> {
  readonly itemIds: readonly string[];
  readonly registryId?: string | undefined;
  readonly allowLocalDivergence?: boolean | undefined;
  readonly commandArguments?: readonly string[] | undefined;
  readonly packageManagerRunner?: PackageManagerRunner | undefined;
  readonly faultInjector?: TransactionFaultInjector | undefined;
}

interface ShadcnProjectMapping {
  readonly bytes: Buffer;
  readonly digest: Digest;
  readonly globalCss: string;
  readonly aliasPrefix: string;
  readonly sourceRoot: string;
  readonly aliases: Readonly<Record<ShadcnAliasKey, string>>;
  readonly roots: Readonly<Record<ShadcnAliasKey, string>>;
}

interface MappedShadcnFile {
  readonly source: AcquiredShadcnRegistryFile;
  readonly target: string;
  readonly logicalPath: string;
  readonly role: ManifestFile["role"];
  readonly mediaType: string;
  readonly bytes: Buffer;
  readonly digest: Digest;
}

interface InternalShadcnAdoption {
  readonly root: string;
  readonly plan: OperationPlan;
  readonly mutations: readonly TransactionMutation[];
  readonly observedTargets: Readonly<Record<string, Digest | null>>;
  readonly registryPayloads: readonly TransactionRegistryPayload[];
  readonly validators: readonly TransactionValidator[];
  readonly packageManager: PackageManager;
  readonly itemIds: readonly string[];
  readonly requestedItemIds: readonly string[];
}

function adoptionError(
  message: string,
  code: string,
  exitCode: 2 | 3 | 4 | 5 | 6 | 7 | 8 = 7,
  target?: string,
): CliError {
  return new CliError(message, {
    code,
    exitCode,
    ...(target === undefined ? {} : { target }),
  });
}

function isObject(value: unknown): value is Record<string, unknown> {
  return value !== null && !Array.isArray(value) && typeof value === "object";
}

function exactKeys(
  value: Record<string, unknown>,
  required: readonly string[],
  optional: readonly string[],
): boolean {
  const allowed = new Set([...required, ...optional]);
  return (
    required.every((key) => Object.hasOwn(value, key)) &&
    Object.keys(value).every((key) => allowed.has(key))
  );
}

function regularProjectFile(root: string, target: string, missingCode: string): Buffer {
  assertPortableRelativePath(target, "Project target");
  assertNoSymlinkAncestors(root, target);
  const path = resolve(root, ...target.split("/"));
  if (!existsSync(path)) {
    throw adoptionError(`${target} is required for shadcn adoption.`, missingCode, 3, target);
  }
  const metadata = lstatSync(path);
  if (!metadata.isFile() || metadata.isSymbolicLink()) {
    throw adoptionError(
      `${target} must be a regular project file.`,
      "PROJECT_FILE_UNSAFE",
      5,
      target,
    );
  }
  return readFileSync(path);
}

function parseJsonObject(bytes: Buffer, target: string): Record<string, unknown> {
  try {
    const value = JSON.parse(bytes.toString("utf8")) as unknown;
    if (!isObject(value)) throw new Error("object required");
    return value;
  } catch {
    throw adoptionError(
      `${target} must contain one valid JSON object.`,
      "PROJECT_JSON_INVALID",
      3,
      target,
    );
  }
}

function aliasPrefix(value: string, suffix: string): string | null {
  const ending = `/${suffix}`;
  if (!value.endsWith(ending)) return null;
  const prefix = value.slice(0, -ending.length);
  return /^[@~][A-Za-z0-9._-]*$/u.test(prefix) && !prefix.includes("..") ? prefix : null;
}

function joinPortable(root: string, suffix: string): string {
  const value = root === "." ? suffix : `${root}/${suffix}`;
  assertPortableRelativePath(value, "Resolved shadcn target root");
  return value;
}

function readShadcnProjectMapping(root: string, config: MergoraConfig): ShadcnProjectMapping {
  const bytes = regularProjectFile(root, SHADCN_CONFIG_PATH, "SHADCN_CONFIG_MISSING");
  const value = parseJsonObject(bytes, SHADCN_CONFIG_PATH);
  if (
    !exactKeys(
      value,
      ["$schema", "tsx"],
      ["style", "rsc", "tailwind", "iconLibrary", "aliases", "registries"],
    ) ||
    value.$schema !== SHADCN_SCHEMA ||
    value.tsx !== true ||
    (value.style !== undefined && typeof value.style !== "string") ||
    (value.rsc !== undefined && typeof value.rsc !== "boolean") ||
    (value.iconLibrary !== undefined && typeof value.iconLibrary !== "string") ||
    (value.registries !== undefined && !isObject(value.registries))
  ) {
    throw adoptionError(
      "components.json is outside the compiled shadcn-v1 project adapter contract.",
      "SHADCN_CONFIG_UNSUPPORTED",
      7,
      SHADCN_CONFIG_PATH,
    );
  }
  const tailwind = isObject(value.tailwind) ? value.tailwind : null;
  if (
    tailwind === null ||
    !exactKeys(tailwind, ["css"], ["config", "baseColor", "cssVariables", "prefix"]) ||
    typeof tailwind.css !== "string"
  ) {
    throw adoptionError(
      "components.json must declare one supported tailwind.css path.",
      "SHADCN_STYLE_MAPPING_UNSUPPORTED",
      7,
      SHADCN_CONFIG_PATH,
    );
  }
  assertPortableRelativePath(tailwind.css, "shadcn global CSS");
  const css = regularProjectFile(root, tailwind.css, "SHADCN_STYLE_TARGET_MISSING");
  if (!/@import\s+["']tailwindcss["']/u.test(css.toString("utf8"))) {
    throw adoptionError(
      `${tailwind.css} does not contain the required Tailwind CSS v4 import.`,
      "SHADCN_STYLE_MAPPING_UNSUPPORTED",
      7,
      tailwind.css,
    );
  }
  const rawAliases = isObject(value.aliases) ? value.aliases : null;
  if (
    rawAliases === null ||
    !exactKeys(rawAliases, ["components", "lib", "hooks"], ["ui", "utils"])
  ) {
    throw adoptionError(
      "components.json must declare the supported components, lib, hooks, ui, and utils alias shape.",
      "SHADCN_ALIAS_MAPPING_UNSUPPORTED",
      7,
      SHADCN_CONFIG_PATH,
    );
  }
  const suffixes: Readonly<Record<ShadcnAliasKey, string>> = {
    components: "components",
    hooks: "hooks",
    lib: "lib",
    ui: "components/ui",
    utils: "lib/utils",
  };
  const aliases = {} as Record<ShadcnAliasKey, string>;
  const prefixes: string[] = [];
  for (const key of Object.keys(suffixes) as ShadcnAliasKey[]) {
    const candidate =
      rawAliases[key] ??
      (key === "ui"
        ? `${String(rawAliases.components)}/ui`
        : key === "utils"
          ? `${String(rawAliases.lib)}/utils`
          : undefined);
    const prefix = typeof candidate === "string" ? aliasPrefix(candidate, suffixes[key]) : null;
    if (prefix === null) {
      throw adoptionError(
        `components.json aliases.${key} must end in /${suffixes[key]} under one project alias.`,
        "SHADCN_ALIAS_MAPPING_UNSUPPORTED",
        7,
        SHADCN_CONFIG_PATH,
      );
    }
    aliases[key] = candidate as string;
    prefixes.push(prefix);
  }
  const uniquePrefixes = [...new Set(prefixes)];
  if (uniquePrefixes.length !== 1) {
    throw adoptionError(
      `components.json aliases are ambiguous (${portableSort(uniquePrefixes).join(", ")}).`,
      "SHADCN_ALIAS_MAPPING_AMBIGUOUS",
      7,
      SHADCN_CONFIG_PATH,
    );
  }
  const roots = Object.fromEntries(
    (Object.keys(suffixes) as ShadcnAliasKey[]).map((key) => [
      key,
      joinPortable(config.project.sourceRoot, suffixes[key]),
    ]),
  ) as Record<ShadcnAliasKey, string>;
  return {
    bytes,
    digest: sha256(bytes),
    globalCss: tailwind.css,
    aliasPrefix: uniquePrefixes[0]!,
    sourceRoot: config.project.sourceRoot,
    aliases,
    roots,
  };
}

function mappedTarget(
  target: string,
  mapping: ShadcnProjectMapping,
): { target: string; key: ShadcnAliasKey } {
  const candidates = (Object.keys(mapping.aliases) as ShadcnAliasKey[])
    .flatMap((key) => [
      { key, token: `@${key}` },
      { key, token: mapping.aliases[key] },
    ])
    .sort((left, right) => right.token.length - left.token.length);
  for (const candidate of candidates) {
    if (target !== candidate.token && !target.startsWith(`${candidate.token}/`)) continue;
    const suffix = target.slice(candidate.token.length).replace(/^\//u, "");
    const result =
      suffix === "" ? mapping.roots[candidate.key] : `${mapping.roots[candidate.key]}/${suffix}`;
    assertPortableRelativePath(result, "Resolved shadcn file target");
    return { target: result, key: candidate.key };
  }
  if (!target.startsWith("@")) {
    const candidatesByRoot = (Object.keys(mapping.roots) as ShadcnAliasKey[])
      .map((key) => ({ key, root: mapping.roots[key] }))
      .sort((left, right) => right.root.length - left.root.length);
    for (const candidate of candidatesByRoot) {
      const relativeRoot =
        mapping.sourceRoot === "."
          ? candidate.root
          : candidate.root.slice(`${mapping.sourceRoot}/`.length);
      if (target === relativeRoot || target.startsWith(`${relativeRoot}/`)) {
        const result = joinPortable(mapping.sourceRoot, target);
        return { target: result, key: candidate.key };
      }
    }
  }
  throw adoptionError(
    `Registry target ${JSON.stringify(target)} does not map to one configured shadcn alias.`,
    "SHADCN_TARGET_MAPPING_AMBIGUOUS",
    7,
    target,
  );
}

interface ModuleLiteral {
  readonly start: number;
  readonly end: number;
  readonly value: string;
  readonly quote: '"' | "'";
}

function moduleLiterals(text: string, target: string): readonly ModuleLiteral[] {
  const kind = target.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS;
  const source = ts.createSourceFile(target, text, ts.ScriptTarget.Latest, true, kind);
  const diagnostics = (
    source as ts.SourceFile & { readonly parseDiagnostics?: readonly ts.Diagnostic[] }
  ).parseDiagnostics;
  if ((diagnostics?.length ?? 0) > 0) {
    throw adoptionError(
      `Registry TypeScript source ${target} does not parse.`,
      "SHADCN_SOURCE_PARSE_FAILED",
      7,
      target,
    );
  }
  const result: ModuleLiteral[] = [];
  const append = (node: ts.StringLiteralLike): void => {
    const start = node.getStart(source);
    const end = node.getEnd();
    const quote = text[start];
    if ((quote !== '"' && quote !== "'") || text[end - 1] !== quote) {
      throw adoptionError(
        `Registry TypeScript source ${target} uses an unsupported module literal.`,
        "SHADCN_IMPORT_MAPPING_UNSUPPORTED",
        7,
        target,
      );
    }
    result.push({ start, end, value: node.text, quote });
  };
  const visit = (node: ts.Node): void => {
    if (ts.isImportDeclaration(node) && ts.isStringLiteralLike(node.moduleSpecifier))
      append(node.moduleSpecifier);
    else if (
      ts.isExportDeclaration(node) &&
      node.moduleSpecifier !== undefined &&
      ts.isStringLiteralLike(node.moduleSpecifier)
    )
      append(node.moduleSpecifier);
    else if (
      ts.isCallExpression(node) &&
      node.arguments.length === 1 &&
      ts.isStringLiteralLike(node.arguments[0]!) &&
      (node.expression.kind === ts.SyntaxKind.ImportKeyword ||
        (ts.isIdentifier(node.expression) && node.expression.text === "require"))
    )
      append(node.arguments[0]!);
    else if (
      ts.isImportTypeNode(node) &&
      ts.isLiteralTypeNode(node.argument) &&
      ts.isStringLiteralLike(node.argument.literal)
    )
      append(node.argument.literal);
    ts.forEachChild(node, visit);
  };
  visit(source);
  return result.sort((left, right) => left.start - right.start);
}

function transformedModuleSpecifier(value: string, mapping: ShadcnProjectMapping): string {
  const replacements = (["ui", "components", "utils", "lib", "hooks"] as const)
    .map((key) => ({
      from: `@/${key === "ui" ? "components/ui" : key === "utils" ? "lib/utils" : key}`,
      to: mapping.aliases[key],
    }))
    .sort((left, right) => right.from.length - left.from.length);
  for (const replacement of replacements) {
    if (value === replacement.from || value.startsWith(`${replacement.from}/`)) {
      return `${replacement.to}${value.slice(replacement.from.length)}`;
    }
  }
  if (value.startsWith("@/registry/")) {
    throw adoptionError(
      `Registry module ${JSON.stringify(value)} requires an unsupported cross-registry transform.`,
      "SHADCN_IMPORT_MAPPING_UNSUPPORTED",
      7,
    );
  }
  return value;
}

function transformSource(content: string, target: string, mapping: ShadcnProjectMapping): Buffer {
  if (!/\.(?:d\.)?tsx?$/iu.test(target)) return Buffer.from(content, "utf8");
  const literals = moduleLiterals(content, target);
  let output = content;
  for (const literal of [...literals].reverse()) {
    const next = transformedModuleSpecifier(literal.value, mapping);
    if (next === literal.value) continue;
    output = `${output.slice(0, literal.start)}${literal.quote}${next}${literal.quote}${output.slice(literal.end)}`;
  }
  return Buffer.from(output, "utf8");
}

function mediaType(target: string): string {
  if (target.endsWith(".tsx")) return "text/typescript-jsx";
  if (target.endsWith(".ts")) return "text/typescript";
  if (target.endsWith(".css")) return "text/css";
  if (target.endsWith(".json")) return "application/json";
  return "text/plain";
}

function logicalPath(source: AcquiredShadcnRegistryFile): string {
  const path = source.path.replace(/^components\/ui\//u, "ui/").replace(/^components\//u, "ui/");
  const value = /^(?:ui|hooks|lib|systems|kits|themes|contracts|examples|tokens)\//u.test(path)
    ? path
    : `ui/${path}`;
  assertPortableRelativePath(value, "Shadcn provenance logical path");
  return value;
}

function mapItemFiles(
  item: AcquiredShadcnRegistryItem,
  mapping: ShadcnProjectMapping,
): readonly MappedShadcnFile[] {
  const seen = new Set<string>();
  return item.files
    .map((source): MappedShadcnFile => {
      const resolved = mappedTarget(source.target, mapping);
      const portable = resolved.target.normalize("NFC").toLocaleLowerCase("en-US");
      if (seen.has(portable)) {
        throw adoptionError(
          `Shadcn item ${item.id} maps more than one source to ${resolved.target}.`,
          "SHADCN_TARGET_COLLISION",
          5,
          resolved.target,
        );
      }
      seen.add(portable);
      const bytes = transformSource(source.content, resolved.target, mapping);
      return {
        source,
        target: resolved.target,
        logicalPath: logicalPath(source),
        role:
          source.type === "registry:style"
            ? "style"
            : resolved.key === "hooks"
              ? "hook"
              : resolved.key === "lib" || resolved.key === "utils"
                ? "lib"
                : "component",
        mediaType: mediaType(resolved.target),
        bytes,
        digest: sha256(bytes),
      };
    })
    .sort((left, right) => left.target.localeCompare(right.target, "en-US"));
}

function splitPackageReference(reference: string): { name: string; range: string | null } {
  let separator = reference.lastIndexOf("@");
  if (reference.startsWith("@") && separator < reference.indexOf("/")) separator = -1;
  const name = separator > 0 ? reference.slice(0, separator) : reference;
  const range = separator > 0 ? reference.slice(separator + 1) : null;
  if (!PACKAGE_NAME.test(name) || range === "") {
    throw adoptionError(
      `Shadcn dependency ${JSON.stringify(reference)} is unsupported.`,
      "SHADCN_DEPENDENCY_UNSUPPORTED",
      7,
      "package.json",
    );
  }
  return { name, range };
}

function packageScopes(root: string): {
  readonly runtime: Readonly<Record<string, string>>;
  readonly development: Readonly<Record<string, string>>;
} {
  const value = parseJsonObject(
    regularProjectFile(root, "package.json", "PACKAGE_JSON_MISSING"),
    "package.json",
  );
  const read = (key: "dependencies" | "devDependencies"): Record<string, string> => {
    const source = value[key];
    if (source === undefined) return {};
    if (!isObject(source)) {
      throw adoptionError(
        `package.json ${key} must be an object.`,
        "PACKAGE_DEPENDENCIES_INVALID",
        3,
        "package.json",
      );
    }
    const result: Record<string, string> = {};
    for (const [name, range] of Object.entries(source)) {
      if (!PACKAGE_NAME.test(name) || typeof range !== "string") {
        throw adoptionError(
          `package.json ${key} is invalid.`,
          "PACKAGE_DEPENDENCIES_INVALID",
          3,
          "package.json",
        );
      }
      result[name] = range;
    }
    return result;
  };
  return { runtime: read("dependencies"), development: read("devDependencies") };
}

function provenDependencies(
  root: string,
  item: AcquiredShadcnRegistryItem,
): ManifestItem["dependencies"] {
  const installed = packageScopes(root);
  const result = {
    runtime: {} as Record<string, string>,
    development: {} as Record<string, string>,
  };
  for (const [scope, references] of [
    ["runtime", item.dependencies],
    ["development", item.devDependencies],
  ] as const) {
    for (const reference of references) {
      const { name, range } = splitPackageReference(reference);
      if (result.runtime[name] !== undefined || result.development[name] !== undefined) {
        throw adoptionError(
          `Shadcn item ${item.id} declares dependency ${name} in more than one scope.`,
          "SHADCN_DEPENDENCY_AMBIGUOUS",
          7,
          "package.json",
        );
      }
      const current = installed[scope][name];
      if (current === undefined) {
        throw adoptionError(
          `Adoption requires existing ${scope} dependency ${name}; it never installs or claims an absent declaration.`,
          "ADOPT_DEPENDENCY_UNPROVEN",
          7,
          "package.json",
        );
      }
      if (
        range !== null &&
        current !== range &&
        !(
          /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/u.test(range) &&
          compatibleDependencyRange(current, range)
        )
      ) {
        throw adoptionError(
          `Existing dependency ${name}@${current} cannot prove compatibility with requested ${range}.`,
          "ADOPT_DEPENDENCY_UNPROVEN",
          7,
          "package.json",
        );
      }
      result[scope][name] = current;
    }
  }
  return {
    runtime: Object.fromEntries(Object.entries(result.runtime).sort()),
    development: Object.fromEntries(Object.entries(result.development).sort()),
  };
}

function resolveRegistryId(config: MergoraConfig, explicit: string | undefined): string {
  const candidates = Object.entries(config.registries)
    .filter(([, registry]) => registry.protocol === "shadcn-v1")
    .map(([id]) => id)
    .sort();
  if (explicit !== undefined) {
    if (!candidates.includes(explicit)) {
      throw adoptionError(
        `Registry ${JSON.stringify(explicit)} is not an enrolled shadcn-v1 registry.`,
        "REGISTRY_NOT_ENROLLED",
        3,
        "mergora.json",
      );
    }
    return explicit;
  }
  if (candidates.length !== 1) {
    throw adoptionError(
      candidates.length === 0
        ? "Shadcn adoption requires an enrolled shadcn-v1 registry."
        : `Shadcn adoption is ambiguous across enrolled registries: ${candidates.join(", ")}; pass --registry.`,
      candidates.length === 0 ? "REGISTRY_NOT_ENROLLED" : "SHADCN_REGISTRY_AMBIGUOUS",
      candidates.length === 0 ? 3 : 7,
      "mergora.json",
    );
  }
  return candidates[0]!;
}

function requestedIds(itemIds: readonly string[]): readonly string[] {
  if (itemIds.length === 0) throw adoptionError("adopt requires an item.", "ITEM_REQUIRED", 2);
  const result = portableSort([...new Set(itemIds)]);
  for (const id of result) {
    if (!ITEM_ID.test(id)) {
      throw adoptionError(
        `Shadcn item ID ${JSON.stringify(id)} must be portable kebab-case.`,
        "ITEM_ID_INVALID",
        2,
      );
    }
  }
  return result;
}

function itemClosure(
  requested: readonly string[],
  catalog: AcquiredShadcnRegistryCatalog,
): readonly AcquiredShadcnRegistryItem[] {
  const byId = new Map(catalog.items.map((item) => [item.id, item]));
  const included = new Map<string, AcquiredShadcnRegistryItem>();
  const visiting = new Set<string>();
  const visit = (id: string): void => {
    if (included.has(id)) return;
    if (visiting.has(id)) {
      throw adoptionError(
        `Shadcn registry dependency cycle includes ${id}.`,
        "SHADCN_DEPENDENCY_CYCLE",
        5,
      );
    }
    const item = byId.get(id);
    if (item === undefined) {
      throw adoptionError(
        `Shadcn registry ${catalog.registry.id} does not contain ${JSON.stringify(id)}.`,
        "ITEM_NOT_FOUND",
        7,
      );
    }
    visiting.add(id);
    for (const dependency of item.registryDependencies) {
      if (!ITEM_ID.test(dependency)) {
        throw adoptionError(
          `Shadcn dependency ${JSON.stringify(dependency)} is not an unambiguous item in the enrolled catalog.`,
          "SHADCN_REGISTRY_DEPENDENCY_UNSUPPORTED",
          7,
        );
      }
      visit(dependency);
    }
    visiting.delete(id);
    included.set(id, item);
  };
  for (const id of requested) visit(id);
  return [...included.values()].sort((left, right) => left.id.localeCompare(right.id, "en-US"));
}

function transformContext(
  config: MergoraConfig,
  mapping: ShadcnProjectMapping,
): ManifestItem["transformContext"] {
  return {
    targets: {
      components: mapping.roots.ui,
      hooks: mapping.roots.hooks,
      lib: mapping.roots.lib,
      styles: mapping.globalCss,
    },
    aliases: {
      components: mapping.aliases.ui,
      hooks: mapping.aliases.hooks,
      lib: mapping.aliases.lib,
      styles: config.aliases.styles,
    },
    styling: {
      engine: "tailwind-v4",
      tokenPreset: config.styling.tokenPreset,
      density: config.styling.density,
      direction: config.styling.direction,
    },
  };
}

function rebuildLegacyOwnership(manifest: ProvenanceManifest): void {
  const dependencyOwners: Record<string, string[]> = {};
  const sharedTargets: Record<string, string[]> = {};
  for (const [owner, item] of Object.entries(manifest.items)) {
    for (const scope of ["runtime", "development"] as const) {
      for (const name of Object.keys(item.dependencies[scope])) {
        (dependencyOwners[`${scope}:${name}`] ??= []).push(owner);
      }
    }
    for (const patch of item.structuredPatches) {
      if (patch.target !== undefined) (sharedTargets[patch.target] ??= []).push(patch.id);
    }
  }
  manifest.dependencyOwners = Object.fromEntries(
    Object.entries(dependencyOwners)
      .sort()
      .map(([key, owners]) => [key, [...portableSort(owners)]]),
  );
  manifest.sharedTargets = Object.fromEntries(
    Object.entries(sharedTargets)
      .sort()
      .map(([key, owners]) => [key, [...portableSort(owners)]]),
  );
}

function manifestBytes(manifest: ProvenanceManifest): Buffer {
  return Buffer.from(`${JSON.stringify(normalizedManifest(manifest), null, 2)}\n`);
}

function mutation(
  root: string,
  target: string,
  content: Buffer,
  manifest = false,
): TransactionMutation {
  const current = readProjectFile(root, target);
  return {
    target,
    content,
    beforeDigest: current === null ? null : sha256(current),
    ...(manifest ? { manifest: true } : {}),
  };
}

function projectValidator(input: {
  readonly config: MergoraConfig;
  readonly mapping: ShadcnProjectMapping;
  readonly manifest: ProvenanceManifest;
  readonly adoptedOwners: readonly string[];
  readonly newOwners: ReadonlySet<string>;
}): TransactionValidator {
  const expectedConfig = canonicalJson(input.config);
  const expectedItems = Object.fromEntries(
    input.adoptedOwners.map((owner) => [owner, canonicalJson(input.manifest.items[owner])]),
  );
  const validate = (context: TransactionValidationContext): TransactionValidationResult => {
    const issues: TransactionValidationIssue[] = [];
    try {
      const configBytes = context.readFile("mergora.json");
      if (
        configBytes === null ||
        canonicalJson(
          validateMergoraConfig(JSON.parse(configBytes.toString("utf8")) as unknown),
        ) !== expectedConfig
      )
        throw new Error();
    } catch {
      issues.push({
        code: "PROJECT_CONFIG_MISMATCH",
        target: "mergora.json",
        message: "The configured Mergora transform context changed after planning.",
      });
    }
    const shadcnBytes = context.readFile(SHADCN_CONFIG_PATH);
    if (shadcnBytes === null || sha256(shadcnBytes) !== input.mapping.digest) {
      issues.push({
        code: "SHADCN_CONFIG_STALE",
        target: SHADCN_CONFIG_PATH,
        message: "components.json changed after the reviewed alias/style mapping was computed.",
      });
    }
    try {
      const bytes = context.readFile(MANIFEST_PATH);
      if (bytes === null) throw new Error();
      const manifest = parseManifestBytes(bytes);
      for (const [owner, expected] of Object.entries(expectedItems)) {
        if (
          manifest.items[owner] === undefined ||
          canonicalJson(manifest.items[owner]) !== expected
        )
          throw new Error();
      }
    } catch {
      issues.push({
        code: "SHADCN_PROVENANCE_INVALID",
        target: MANIFEST_PATH,
        message:
          "The adopted shadcn provenance differs from the reviewed catalog, mapping, or local digest.",
      });
    }
    for (const owner of input.adoptedOwners) {
      const item = input.manifest.items[owner]!;
      for (const file of item.files) {
        const local = context.readFile(file.target);
        const base = context.readFile(basePath(file.base));
        if (
          input.newOwners.has(owner) &&
          (local === null || file.installed === null || sha256(local) !== file.installed)
        ) {
          issues.push({
            code: "SHADCN_LOCAL_STALE",
            target: file.target,
            message: "The local file changed after adoption planning.",
          });
        }
        if (base === null || sha256(base) !== file.base) {
          issues.push({
            code: "SHADCN_BASE_INVALID",
            target: basePath(file.base),
            message: "The transformed shadcn base is missing or corrupt.",
          });
        }
      }
    }
    return transactionValidationResult(
      `Validated exact shadcn catalog ancestry, compiled mapping, bases, local digests, and retained components.json in the ${context.phase} view.`,
      `Shadcn adoption validation failed in the ${context.phase} view.`,
      issues,
    );
  };
  return {
    id: "shadcn-adoption-context",
    label: "project-configured",
    validateStagedOverlay: validate,
    validatePostCommit: validate,
  };
}

function fileOperationForMutation(
  mutation: TransactionMutation,
  owner: string,
  reason: string,
): OperationPlanFile {
  const digest = mutation.content === null ? null : sha256(mutation.content);
  return {
    operation: mutation.beforeDigest === null ? "add" : "structured-patch",
    target: mutation.target,
    owner,
    base: mutation.beforeDigest,
    local: mutation.beforeDigest,
    remote: digest,
    proposed: digest,
    mediaType: mutation.target.endsWith(".json") ? "application/json" : "application/octet-stream",
    risk: "ordinary",
    reason,
  };
}

async function internalPlan(options: ShadcnAdoptionOptions): Promise<InternalShadcnAdoption> {
  const root = validatedProjectRoot(options.projectRoot);
  const config = readMergoraConfig(root);
  if (config === null)
    throw adoptionError(
      "The project has no mergora.json; run mergora init first.",
      "CONFIG_MISSING",
      3,
      "mergora.json",
    );
  const manifest = readManifest(root);
  if (manifest.value.configDigest !== undefined) {
    throw adoptionError(
      "Distribution-aware ownership cannot represent reduced-evidence shadcn ancestry; migrate or detach that ownership explicitly first.",
      "SHADCN_DISTRIBUTION_PROVENANCE_UNSUPPORTED",
      7,
      MANIFEST_PATH,
    );
  }
  const mapping = readShadcnProjectMapping(root, config);
  const requested = requestedIds(options.itemIds);
  const registryId = resolveRegistryId(config, options.registryId);
  const catalog = await acquireShadcnRegistryCatalog({
    projectRoot: root,
    registryId,
    offline: options.offline,
    fetchImplementation: options.fetchImplementation,
    environment: options.environment,
    maxBytes: options.maxBytes,
    maxRedirects: options.maxRedirects,
    timeoutMilliseconds: options.timeoutMilliseconds,
  });
  const items = itemClosure(requested, catalog);
  const next = structuredClone(manifest.value);
  const claimed = new Map<string, string>();
  for (const [owner, item] of Object.entries(next.items)) {
    for (const file of item.files)
      claimed.set(file.target.normalize("NFC").toLocaleLowerCase("en-US"), owner);
  }
  const direct = new Set(requested);
  const fileOperations: OperationPlanFile[] = [];
  const conflicts: OperationPlan["conflicts"][number][] = [];
  const mutations: TransactionMutation[] = [];
  const observed: Record<string, Digest | null> = {
    [SHADCN_CONFIG_PATH]: mapping.digest,
  };
  const bases = new Set<string>();
  const adoptedOwners: string[] = [];
  const newOwners = new Set<string>();
  const promoteDirect = new Set<string>();
  let hasDivergence = false;
  for (const item of items) {
    const owner = `${registryId}:${item.id}`;
    const files = mapItemFiles(item, mapping);
    const existing = next.items[owner];
    if (existing !== undefined) {
      const context = transformContext(config, mapping);
      if (
        existing.payload.url !== catalog.payloadUrl ||
        existing.payload.digest !== catalog.payloadDigest ||
        existing.transformContextDigest !== sha256(canonicalJson(context)) ||
        canonicalJson(
          existing.files.map(({ logicalPath, target, base, mediaType }) => ({
            logicalPath,
            target,
            base,
            mediaType,
          })),
        ) !==
          canonicalJson(
            files.map((file) => ({
              logicalPath: file.logicalPath,
              target: file.target,
              base: file.digest,
              mediaType: file.mediaType,
            })),
          )
      ) {
        throw adoptionError(
          `Existing provenance for ${owner} describes a different payload or transform mapping.`,
          "ADOPT_ANCESTRY_AMBIGUOUS",
          6,
          MANIFEST_PATH,
        );
      }
      if (direct.has(item.id) && !existing.direct) promoteDirect.add(owner);
      adoptedOwners.push(owner);
      for (const file of existing.files) {
        const local = readProjectFile(root, file.target);
        const localDigest = local === null ? null : sha256(local);
        observed[file.target] = localDigest;
        const baseTarget = basePath(file.base);
        const base = readProjectFile(root, baseTarget);
        if (base === null || sha256(base) !== file.base) {
          throw adoptionError(
            `Immutable base ${baseTarget} is missing or corrupt.`,
            "BASE_DIGEST_MISMATCH",
            3,
            baseTarget,
          );
        }
        observed[baseTarget] = file.base;
        if (localDigest === null) {
          conflicts.push({
            target: file.target,
            kind: "ownership",
            reason:
              "Previously adopted shadcn source is missing; adoption cannot relabel that local state.",
          });
        }
        fileOperations.push({
          operation: localDigest === file.base ? "no-op" : "keep-local",
          target: file.target,
          owner,
          base: file.base,
          local: localDigest,
          remote: file.base,
          proposed: localDigest,
          mediaType: file.mediaType,
          risk: localDigest === file.base ? "ordinary" : "review-required",
          reason:
            "Existing shadcn ancestry is already recorded and the live source remains untouched.",
        });
      }
      continue;
    }
    const dependencies = provenDependencies(root, item);
    const installed: Record<string, Digest> = {};
    let itemConflict = false;
    for (const file of files) {
      const portable = file.target.normalize("NFC").toLocaleLowerCase("en-US");
      const otherOwner = claimed.get(portable);
      const local = readProjectFile(root, file.target);
      const localDigest = local === null ? null : sha256(local);
      observed[file.target] = localDigest;
      if (otherOwner !== undefined) {
        conflicts.push({
          target: file.target,
          kind: "ownership",
          reason: `${file.target} is already owned by ${otherOwner}; side-by-side ownership cannot overlap.`,
        });
        itemConflict = true;
        continue;
      }
      if (localDigest === null) {
        conflicts.push({
          target: file.target,
          kind: "ownership",
          reason:
            "The exact configured shadcn target is missing; adoption never creates or replaces live source.",
        });
        itemConflict = true;
        continue;
      }
      const divergent = localDigest !== file.digest;
      if (divergent && options.allowLocalDivergence !== true) {
        conflicts.push({
          target: file.target,
          kind: "ownership",
          reason:
            "Local bytes differ from the exact transformed enrolled payload; pass --allow-local-divergence to record L relative to proven B without replacing L.",
        });
        itemConflict = true;
      }
      if (divergent) hasDivergence = true;
      installed[file.target] = localDigest;
      fileOperations.push({
        operation: divergent ? "keep-local" : "no-op",
        target: file.target,
        owner,
        base: file.digest,
        local: localDigest,
        remote: file.digest,
        proposed: localDigest,
        mediaType: file.mediaType,
        risk: divergent ? "review-required" : "ordinary",
        reason: divergent
          ? "Explicitly retain local divergence L while recording the exact transformed upstream base B."
          : "Local bytes exactly match the compiled shadcn-v1 transform of the enrolled catalog payload.",
      });
      const target = basePath(file.digest);
      const base = readProjectFile(root, target);
      if (base !== null && sha256(base) !== file.digest)
        throw adoptionError(
          `Immutable base ${target} is corrupt.`,
          "BASE_DIGEST_MISMATCH",
          3,
          target,
        );
      observed[target] = base === null ? null : file.digest;
      if (base === null && !bases.has(target)) {
        mutations.push(mutation(root, target, file.bytes));
        bases.add(target);
      }
    }
    if (itemConflict) continue;
    const context = transformContext(config, mapping);
    next.items[owner] = {
      registry: registryId,
      itemId: item.id,
      kind: "component",
      requested: `=${SHADCN_V1_ADAPTER_VERSION}`,
      resolved: SHADCN_V1_ADAPTER_VERSION,
      payload: { url: catalog.payloadUrl, digest: catalog.payloadDigest },
      mode: "source",
      direct: direct.has(item.id),
      transformContextDigest: sha256(canonicalJson(context)),
      transformContext: context,
      files: files.map((file) => ({
        logicalPath: file.logicalPath,
        target: file.target,
        role: file.role,
        base: file.digest,
        installed: installed[file.target]!,
        mediaType: file.mediaType,
        executable: false,
      })),
      registryDependencies: item.registryDependencies.map((id) => `${registryId}:${id}`).sort(),
      dependencies,
      structuredPatches: [],
      contractVersion: "1.0.0-not-supplied",
      lastMigration: "shadcn-v1-adapter",
    };
    adoptedOwners.push(owner);
    newOwners.add(owner);
    for (const file of files)
      claimed.set(file.target.normalize("NFC").toLocaleLowerCase("en-US"), owner);
  }
  if (conflicts.length === 0) {
    for (const owner of promoteDirect) next.items[owner]!.direct = true;
  }
  rebuildLegacyOwnership(next);
  const bytes = manifestBytes(next);
  if (!bytes.equals(manifest.bytes)) mutations.push(mutation(root, MANIFEST_PATH, bytes, true));
  const mediaFiles: TransactionMediaFile[] = [
    { target: MANIFEST_PATH, mediaType: "application/json" },
  ];
  for (const owner of adoptedOwners) {
    for (const file of next.items[owner]!.files) {
      mediaFiles.push({ target: file.target, mediaType: file.mediaType });
      mediaFiles.push({ target: basePath(file.base), mediaType: file.mediaType });
    }
  }
  const validators: readonly TransactionValidator[] = [
    createMediaParseValidator("shadcn-adoption-media", mediaFiles),
    projectValidator({ config, mapping, manifest: next, adoptedOwners, newOwners }),
  ];
  const firstOwner = adoptedOwners[0] ?? `${registryId}:${requested[0]!}`;
  for (const entry of mutations) {
    if (fileOperations.some(({ target }) => target === entry.target)) continue;
    fileOperations.push(
      fileOperationForMutation(
        entry,
        firstOwner,
        entry.target === MANIFEST_PATH
          ? "Record exact external ancestry, transformed bases, local digests, and reduced evidence atomically."
          : "Persist the immutable transformed shadcn base without changing live source.",
      ),
    );
  }
  const plan = finalizeOperationPlan({
    schemaVersion: 1,
    command: "adopt",
    cliVersion: CLI_VERSION,
    projectRoot: ".",
    configDigest: sha256(canonicalJson(config)),
    manifestPreconditionDigest: sha256(canonicalJson(manifest.value)),
    registries: [
      {
        id: registryId,
        identityDigest: catalog.metadata.identityDigest,
        release: SHADCN_V1_ADAPTER_VERSION,
        manifestDigest: catalog.payloadDigest,
        source: "network",
        trust: catalog.registry.trust,
        evidenceTier: "not-supplied",
      },
    ],
    items: items.map((item) => ({
      id: `${registryId}:${item.id}`,
      direct: direct.has(item.id),
      requested: `=${SHADCN_V1_ADAPTER_VERSION}`,
      fromVersion: manifest.value.items[`${registryId}:${item.id}`]?.resolved ?? null,
      toVersion: SHADCN_V1_ADAPTER_VERSION,
      mode: "source",
    })),
    fileOperations: fileOperations.sort((left, right) =>
      left.target.localeCompare(right.target, "en-US"),
    ),
    dependencyChanges: [],
    structuredPatches: [],
    migrations: [],
    contractChanges: [],
    warnings: [
      `External origin ${catalog.metadata.resolvedOrigin} is enrolled through compiled shadcn-v1 adapter ${SHADCN_V1_ADAPTER_VERSION}.`,
      `Exact catalog payload ${catalog.payloadDigest} is captured; Contracts, Passports, license, risk, and quality evidence are not supplied.`,
      `components.json (${mapping.digest}) is retained byte-for-byte and its alias/style mapping is a transaction precondition.`,
      "Adoption never replaces live source; exact matches record clean ownership and accepted divergences record installed != base.",
    ],
    consentRequirements: [
      {
        id: "adopt-shadcn",
        flag: "--yes",
        reason: "Adoption writes immutable bases and external provenance.",
      },
      ...(hasDivergence
        ? [
            {
              id: "adopt-shadcn-local-divergence",
              flag: "--allow-local-divergence",
              reason:
                "Local bytes differ from the exact transformed upstream base and will remain unchanged.",
            },
          ]
        : []),
    ],
    conflicts,
    estimatedBytes: {
      download: catalog.payloadBytes,
      write: mutations.reduce((total, entry) => total + (entry.content?.byteLength ?? 0), 0),
    },
    validationSuite: validationSuiteForTransaction(validators),
    rollbackAvailable: true,
  });
  validateTransactionOverlay({ root, plan, mutations, observedTargets: observed, validators });
  const inspection = inspectProject(root);
  return {
    root,
    plan,
    mutations,
    observedTargets: observed,
    registryPayloads: [
      {
        registry: registryId,
        release: SHADCN_V1_ADAPTER_VERSION,
        url: catalog.payloadUrl,
        digest: catalog.payloadDigest,
      },
    ],
    validators,
    packageManager: inspection.packageManager,
    itemIds: items.map(({ id }) => id),
    requestedItemIds: requested,
  };
}

export async function planShadcnAdoption(options: ShadcnAdoptionOptions): Promise<OperationPlan> {
  return (await internalPlan(options)).plan;
}

export async function applyShadcnAdoption(
  options: ShadcnAdoptionOptions,
  expectedPlanDigest: string,
): Promise<SourceOperationResult> {
  const internal = await internalPlan(options);
  if (expectedPlanDigest !== internal.plan.planDigest) {
    throw adoptionError(
      "Shadcn adoption plan changed before apply; review a fresh plan.",
      "PLAN_PRECONDITION_STALE",
      8,
    );
  }
  if (internal.plan.conflicts.length > 0) {
    throw adoptionError(
      internal.plan.conflicts[0]!.reason,
      "OPERATION_CONFLICT",
      6,
      internal.plan.conflicts[0]!.target,
    );
  }
  const transaction = executeTransaction({
    root: internal.root,
    plan: internal.plan,
    mutations: internal.mutations,
    acceptedConsents: internal.plan.consentRequirements.map(({ id }) => ({
      id,
      planDigest: internal.plan.planDigest,
    })),
    observedTargets: internal.observedTargets,
    registryPayloads: internal.registryPayloads,
    packageManager: internal.packageManager,
    packageManagerRequired: false,
    offline: options.offline,
    packageManagerRunner: options.packageManagerRunner,
    commandArguments: options.commandArguments,
    faultInjector: options.faultInjector,
    validators: internal.validators,
  });
  return {
    mode: "source-transaction",
    command: "adopt",
    items: internal.itemIds,
    requestedItems: internal.requestedItemIds,
    transitiveItems: internal.itemIds.filter((id) => !internal.requestedItemIds.includes(id)),
    retainedFiles: [],
    manifest: MANIFEST_PATH,
    transaction,
    planDigest: internal.plan.planDigest,
  };
}
