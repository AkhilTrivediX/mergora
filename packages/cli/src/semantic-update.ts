import { randomBytes } from "node:crypto";
import {
  closeSync,
  constants,
  existsSync,
  fsyncSync,
  lstatSync,
  mkdirSync,
  openSync,
  readFileSync,
  renameSync,
  writeFileSync,
} from "node:fs";
import { builtinModules } from "node:module";
import { dirname, posix, resolve } from "node:path";

import ts from "typescript";

import {
  createConflictBundle,
  mergeCssDeclarationsThreeWay,
  mergeDtcgThreeWay,
  mergeFileThreeWay,
  mergeJsonThreeWay,
  mergeStructuredSourceThreeWay,
  type FileMergeResult,
  type SemanticConflict,
  type SemanticConflictReason,
} from "mergora-registry";

import {
  assertNoSymlinkAncestors,
  assertPortableRelativePath,
  canonicalJson,
  CLI_VERSION,
  CliError,
  portableSort,
  resolveInside,
  sha256,
  validatedProjectRoot,
} from "./contracts.js";
import {
  mergoraConfigAliasPrefix,
  readMergoraConfig,
  validateMergoraConfig,
  type MergoraConfig,
} from "./configuration.js";
import type { AcquiredNativeRegistryRelease } from "./acquisition-resolver.js";
import {
  planPackageDependencies,
  readPackageDependencies,
  type DependencyRequirement,
  type PackageDependencyPlan,
} from "./package-editor.js";
import {
  inspectProject,
  type PackageManager,
  type ProjectInspection,
} from "./project-inspector.js";
import {
  basePath,
  digestOrNull,
  manifestBytes,
  MANIFEST_PATH,
  readManifest,
  readProjectFile,
  type ManifestFile,
  type ManifestItem,
  type ManifestPatch,
  type ProvenanceManifest,
} from "./source-operations.js";
import {
  executeTransaction,
  finalizeOperationPlan,
  validationSuiteForTransaction,
  type OperationPlan,
  type OperationPlanDependencyChange,
  type OperationPlanFile,
  type PackageManagerRunner,
  type TransactionFaultInjector,
  type TransactionMutation,
  type TransactionRegistryPayload,
  type TransactionResult,
  type TransactionValidationContext,
  type TransactionValidationIssue,
  type TransactionValidationResult,
  type TransactionValidator,
} from "./transaction-engine.js";

const SEMVER =
  /^(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)(?:-[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?(?:\+[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?$/u;
const SEMVER_RANGE =
  /^(?!.*(?:git|https?|file|workspace|link|portal|patch|github):)[-0-9A-Za-z*<>=~^|. +]+$/u;
const DIGEST = /^sha256:[a-f0-9]{64}$/u;
const ITEM_ID = /^[a-z0-9]+(?:-[a-z0-9]+)*$/u;
const REGISTRY_ID = ITEM_ID;
const TRANSACTION_ID = /^[0-9]{8}T[0-9]{6}(?:\.[0-9]{3})?Z-[0-9a-f]{32}$/u;
const CONFLICT_MARKER = /^(?:<<<<<<<|=======|>>>>>>>)(?:\s|$)/mu;
const CONFLICT_STATE_PATH = "conflict-state.json" as const;
const CONFLICT_STATE_DIGEST_PATH = "conflict-state.sha256" as const;
const MAX_SEMANTIC_VALIDATION_FILES = 8192;
const MAX_SEMANTIC_VALIDATION_ISSUES = 128;
const NODE_BUILTIN_IMPORTS = new Set(
  builtinModules.flatMap((name) => [name, name.startsWith("node:") ? name : `node:${name}`]),
);

type Digest = `sha256:${string}`;

export interface ImmutableUpdateRegistry {
  readonly id: string;
  readonly protocol: "mergora-v1";
  readonly origin: string;
  readonly identityDigest: Digest;
  readonly source: "network" | "verified-cache" | "vendor" | "mirror";
  readonly trust: "official" | "enrolled" | "local-development";
  readonly evidenceTier: "complete" | "partial" | "not-supplied";
  /** Native protocol identities omit the synthetic snapshot's protocol field. */
  readonly nativeIdentity?: true | undefined;
}

export interface ImmutableUpdateFile {
  readonly logicalPath: string;
  readonly role: ManifestFile["role"];
  readonly mediaType: string;
  readonly encoding: "utf8" | "base64";
  readonly content: string;
  readonly digest: Digest;
  readonly executable: false;
}

export interface ImmutableUpdateItem {
  readonly itemId: string;
  readonly kind: ManifestItem["kind"];
  readonly resolved: string;
  readonly payloadUrl: string;
  readonly payloadDigest: Digest;
  readonly renderedWithTransformContextDigest: Digest;
  readonly files: readonly ImmutableUpdateFile[];
  readonly registryDependencies: readonly string[];
  readonly dependencies: {
    readonly runtime: Readonly<Record<string, string>>;
    readonly development: Readonly<Record<string, string>>;
  };
  readonly contractVersion: string;
  readonly lastMigration: string | null;
  /** Exact digest of the acquired native payload document, when routed from native v1. */
  readonly acquiredPayloadDigest?: Digest | undefined;
}

export interface ImmutableUpdateRelease {
  readonly schemaVersion: 1;
  readonly registry: ImmutableUpdateRegistry;
  /** Exact immutable semver. Mutable aliases such as `latest` are never accepted. */
  readonly release: string;
  readonly manifestDigest: Digest;
  readonly items: readonly ImmutableUpdateItem[];
  /** Exact digest of the acquired native release manifest document. */
  readonly acquiredManifestDigest?: Digest | undefined;
}

export interface SemanticUpdateOptions {
  readonly projectRoot: string;
  readonly itemIds?: readonly string[] | undefined;
  readonly release: ImmutableUpdateRelease;
  readonly noInstall?: boolean | undefined;
  readonly offline?: boolean | undefined;
  readonly packageManager?: PackageManager | undefined;
  readonly packageManagerRunner?: PackageManagerRunner | undefined;
  readonly faultInjector?: TransactionFaultInjector | undefined;
  readonly commandArguments?: readonly string[] | undefined;
  /** Deterministic tests may inject an otherwise valid fresh transaction ID. */
  readonly conflictTransactionId?: string | undefined;
}

export interface AcquiredSemanticUpdateOptions extends Omit<SemanticUpdateOptions, "release"> {
  readonly acquiredRelease: AcquiredNativeRegistryRelease;
}

export interface SemanticUpdateCommittedResult {
  readonly mode: "semantic-update";
  readonly status: "committed";
  readonly items: readonly string[];
  readonly release: string;
  readonly planDigest: Digest;
  readonly transaction: TransactionResult;
}

export interface SemanticUpdateConflictResult {
  readonly mode: "semantic-update";
  readonly status: "conflicted";
  readonly items: readonly string[];
  readonly release: string;
  readonly planDigest: Digest;
  readonly conflictTransactionId: string;
  readonly conflictRoot: string;
  readonly conflicts: OperationPlan["conflicts"];
  readonly liveProjectChanged: false;
}

export type SemanticUpdateResult = SemanticUpdateCommittedResult | SemanticUpdateConflictResult;

interface UpdateEntry {
  readonly key: string;
  readonly target: string;
  readonly owner: string;
  readonly logicalPath: string;
  readonly role: ManifestFile["role"];
  readonly mediaType: string;
  readonly base: Buffer | null;
  readonly local: Buffer | null;
  readonly remote: Buffer | null;
  readonly result: FileMergeResult;
  readonly proposed: Buffer | null;
  readonly remoteFile: ImmutableUpdateFile | null;
}

interface InternalUpdatePlan {
  readonly root: string;
  readonly config: MergoraConfig;
  readonly inspection: ProjectInspection;
  readonly manifest: ProvenanceManifest;
  readonly manifestBeforeBytes: Buffer;
  readonly nextManifest: ProvenanceManifest;
  readonly nextManifestBytes: Buffer;
  readonly selectedItems: readonly string[];
  readonly remoteItems: readonly ImmutableUpdateItem[];
  readonly entries: readonly UpdateEntry[];
  readonly packagePlan: PackageDependencyPlan;
  readonly plan: OperationPlan;
  readonly mutations: readonly TransactionMutation[];
  readonly observedTargets: Readonly<Record<string, Digest | null>>;
  readonly registryPayloads: readonly TransactionRegistryPayload[];
  readonly validators: readonly TransactionValidator[];
}

function digest(value: unknown): Digest {
  return sha256(canonicalJson(value));
}

interface SemanticValidationFile {
  readonly target: string;
  readonly mediaType: string;
  readonly role: ManifestFile["role"];
}

interface SemanticValidationItem {
  readonly owner: string;
  readonly contractVersion: string;
  readonly payloadDigest: Digest;
  readonly transformContextDigest: Digest;
}

interface CollectedToken {
  readonly aliases: readonly string[];
  readonly type: string | null;
}

interface TokenTraversalState {
  nodes: number;
  limitReported: boolean;
}

function validationResult(
  successSummary: string,
  failureSummary: string,
  issues: readonly TransactionValidationIssue[],
): TransactionValidationResult {
  const sorted = [...issues].sort(
    (left, right) =>
      left.target.localeCompare(right.target, "en-US") ||
      left.code.localeCompare(right.code, "en-US") ||
      left.message.localeCompare(right.message, "en-US"),
  );
  if (sorted.length === 0) return { state: "pass", summary: successSummary };
  return {
    state: "fail",
    summary: failureSummary,
    issues: sorted.slice(0, MAX_SEMANTIC_VALIDATION_ISSUES),
  };
}

function validationText(
  context: TransactionValidationContext,
  target: string,
  issues: TransactionValidationIssue[],
): string | null {
  const bytes = context.readFile(target);
  if (bytes === null) return null;
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    issues.push({
      code: "MEDIA_UTF8_INVALID",
      target,
      message: "The proposed text is not valid UTF-8.",
    });
    return null;
  }
}

function sourceScriptKind(file: SemanticValidationFile): ts.ScriptKind | null {
  const extension = posix.extname(file.target).toLocaleLowerCase("en-US");
  if (
    file.mediaType === "text/typescript-jsx" ||
    file.mediaType.includes("tsx") ||
    extension === ".tsx"
  ) {
    return ts.ScriptKind.TSX;
  }
  if (
    file.mediaType.includes("typescript") ||
    extension === ".ts" ||
    extension === ".mts" ||
    extension === ".cts"
  ) {
    return ts.ScriptKind.TS;
  }
  if (file.mediaType.includes("jsx") || extension === ".jsx") return ts.ScriptKind.JSX;
  if (
    file.mediaType.includes("javascript") ||
    file.mediaType.includes("ecmascript") ||
    [".js", ".mjs", ".cjs"].includes(extension)
  ) {
    return ts.ScriptKind.JS;
  }
  return null;
}

function mergeAdapterMediaType(mediaType: string): string {
  return mediaType === "text/typescript-jsx" ? "text/tsx" : mediaType;
}

function sourceParseIssues(
  target: string,
  text: string,
  kind: ts.ScriptKind,
): TransactionValidationIssue[] {
  const source = ts.createSourceFile(target, text, ts.ScriptTarget.Latest, true, kind);
  const diagnostics = (
    source as ts.SourceFile & { readonly parseDiagnostics?: readonly ts.Diagnostic[] }
  ).parseDiagnostics;
  return (diagnostics ?? []).slice(0, MAX_SEMANTIC_VALIDATION_ISSUES).map((diagnostic) => ({
    code: `TS_${diagnostic.code}`,
    target,
    message: ts.flattenDiagnosticMessageText(diagnostic.messageText, " ").slice(0, 1024),
  }));
}

function mediaParseValidator(
  files: readonly SemanticValidationFile[],
): (context: TransactionValidationContext) => TransactionValidationResult {
  return (context) => {
    const issues: TransactionValidationIssue[] = [];
    let parsed = 0;
    for (const file of files) {
      const bytes = context.readFile(file.target);
      if (bytes === null) continue;
      const isText =
        file.mediaType.startsWith("text/") ||
        file.mediaType.includes("json") ||
        sourceScriptKind(file) !== null;
      if (!isText) continue;
      const text = validationText(context, file.target, issues);
      if (text === null) continue;
      parsed += 1;
      try {
        if (file.mediaType.includes("json") || file.target.endsWith(".json")) {
          const result =
            file.role === "token" || file.mediaType.includes("design-tokens")
              ? mergeDtcgThreeWay({ base: text, local: text, remote: text })
              : mergeJsonThreeWay(
                  { base: text, local: text, remote: text },
                  {
                    format:
                      file.mediaType.includes("jsonc") || file.target.endsWith(".jsonc")
                        ? "jsonc"
                        : "json",
                  },
                );
          if (result.status === "conflict") {
            issues.push(
              ...result.conflicts.map((conflict) => ({
                code: "MEDIA_JSON_INVALID",
                target: file.target,
                message: conflict.detail.slice(0, 1024),
              })),
            );
          }
        } else if (file.mediaType === "text/css" || file.target.endsWith(".css")) {
          const result = mergeCssDeclarationsThreeWay({ base: text, local: text, remote: text });
          if (result.status === "conflict") {
            issues.push(
              ...result.conflicts.map((conflict) => ({
                code: "MEDIA_CSS_INVALID",
                target: file.target,
                message: conflict.reason,
              })),
            );
          }
        } else {
          const kind = sourceScriptKind(file);
          if (kind !== null) {
            issues.push(...sourceParseIssues(file.target, text, kind));
            const structuredKind =
              kind === ts.ScriptKind.TSX
                ? "tsx"
                : kind === ts.ScriptKind.JSX
                  ? "jsx"
                  : kind === ts.ScriptKind.JS
                    ? "javascript"
                    : "typescript";
            const result = mergeStructuredSourceThreeWay(
              { base: text, local: text, remote: text },
              { kind: structuredKind },
            );
            if (result.status === "conflict") {
              issues.push(
                ...result.conflicts
                  .filter(({ reason }) => reason === "parse-error" || reason === "input-limit")
                  .map((conflict) => ({
                    code: "MEDIA_SOURCE_INVALID",
                    target: file.target,
                    message: conflict.detail.slice(0, 1024),
                  })),
              );
            }
          }
        }
      } catch (error) {
        issues.push({
          code: "MEDIA_PARSE_INVALID",
          target: file.target,
          message:
            error instanceof Error
              ? `Declared ${file.mediaType} parsing failed: ${error.message}`.slice(0, 1024)
              : `Declared ${file.mediaType} parsing failed.`,
        });
      }
      if (issues.length >= MAX_SEMANTIC_VALIDATION_ISSUES) break;
    }
    return validationResult(
      `Parsed ${parsed} declared text artifacts in the ${context.phase} view.`,
      `Declared media parsing failed in the ${context.phase} view.`,
      issues,
    );
  };
}

function packageNameForImport(specifier: string): string {
  if (!specifier.startsWith("@")) return specifier.split("/")[0]!;
  return specifier.split("/").slice(0, 2).join("/");
}

function localImportCandidates(target: string, specifier: string): readonly string[] {
  const joined = posix.normalize(posix.join(posix.dirname(target), specifier));
  assertPortableRelativePath(joined, "Semantic validation import target");
  const extension = posix.extname(joined);
  const candidates = new Set<string>([joined]);
  if (extension.length === 0) {
    for (const suffix of [".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs", ".d.ts", ".json", ".css"]) {
      candidates.add(`${joined}${suffix}`);
      candidates.add(`${joined}/index${suffix}`);
    }
  } else if ([".js", ".jsx", ".mjs", ".cjs"].includes(extension)) {
    const stem = joined.slice(0, -extension.length);
    for (const suffix of [".ts", ".tsx", ".mts", ".cts"]) candidates.add(`${stem}${suffix}`);
  }
  return [...candidates];
}

function aliasImportCandidates(config: MergoraConfig, specifier: string): readonly string[] {
  const candidates: string[] = [];
  for (const key of Object.keys(config.aliases) as (keyof MergoraConfig["aliases"])[]) {
    const alias = config.aliases[key];
    if (specifier !== alias && !specifier.startsWith(`${alias}/`)) continue;
    const suffix = specifier === alias ? "" : specifier.slice(alias.length + 1);
    const target = suffix.length === 0 ? config.targets[key] : `${config.targets[key]}/${suffix}`;
    candidates.push(target);
    for (const extension of [".ts", ".tsx", ".js", ".jsx", ".d.ts", ".json", ".css"]) {
      candidates.push(`${target}${extension}`, `${target}/index${extension}`);
    }
  }
  return [...new Set(candidates)];
}

function pureTypeDiagnostics(target: string, text: string): readonly TransactionValidationIssue[] {
  const virtualFile = `/__mergora_validation__/${target}`;
  const options: ts.CompilerOptions = {
    strict: true,
    noEmit: true,
    noResolve: true,
    skipLibCheck: true,
    target: ts.ScriptTarget.ES2022,
    module: ts.ModuleKind.ESNext,
    types: [],
  };
  const host = ts.createCompilerHost(options, true);
  const originalGetSourceFile = host.getSourceFile.bind(host);
  host.fileExists = (fileName) => fileName === virtualFile || ts.sys.fileExists(fileName);
  host.readFile = (fileName) => (fileName === virtualFile ? text : ts.sys.readFile(fileName));
  host.getSourceFile = (fileName, languageVersion, onError, shouldCreateNewSourceFile) =>
    fileName === virtualFile
      ? ts.createSourceFile(fileName, text, languageVersion, true, ts.ScriptKind.TS)
      : originalGetSourceFile(fileName, languageVersion, onError, shouldCreateNewSourceFile);
  const program = ts.createProgram({ rootNames: [virtualFile], options, host });
  return ts
    .getPreEmitDiagnostics(program)
    .filter((diagnostic) => diagnostic.file?.fileName === virtualFile)
    .slice(0, MAX_SEMANTIC_VALIDATION_ISSUES)
    .map((diagnostic) => ({
      code: `TS_${diagnostic.code}`,
      target,
      message: ts.flattenDiagnosticMessageText(diagnostic.messageText, " ").slice(0, 1024),
    }));
}

function declaredPackageNames(bytes: Buffer | null): Set<string> {
  const value = JSON.parse(bytes?.toString("utf8") ?? "null") as Record<string, unknown>;
  return new Set(
    ["dependencies", "devDependencies", "peerDependencies", "optionalDependencies"].flatMap(
      (field) =>
        value[field] !== null && typeof value[field] === "object"
          ? Object.keys(value[field] as Record<string, unknown>)
          : [],
    ),
  );
}

function typeImportValidator(
  files: readonly SemanticValidationFile[],
  baselineRoot: string,
): (context: TransactionValidationContext) => TransactionValidationResult {
  const baselineUnresolved = new Set<string>();
  const baselineConfig = readMergoraConfig(baselineRoot);
  let baselineDependencies = new Set<string>();
  try {
    baselineDependencies = declaredPackageNames(readProjectFile(baselineRoot, "package.json"));
  } catch {
    // The transaction's project-configured validator reports malformed baseline metadata.
  }
  for (const file of files) {
    const bytes = readProjectFile(baselineRoot, file.target);
    if (bytes === null || sourceScriptKind(file) === null) continue;
    let text: string;
    try {
      text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
    } catch {
      continue;
    }
    for (const { fileName: specifier } of ts.preProcessFile(text, true, true).importedFiles) {
      let candidates: readonly string[];
      try {
        candidates = specifier.startsWith(".")
          ? localImportCandidates(file.target, specifier)
          : baselineConfig === null
            ? []
            : aliasImportCandidates(baselineConfig, specifier);
      } catch {
        baselineUnresolved.add(`${file.target}\0${specifier}`);
        continue;
      }
      if (candidates.length > 0) {
        if (!candidates.some((candidate) => readProjectFile(baselineRoot, candidate) !== null)) {
          baselineUnresolved.add(`${file.target}\0${specifier}`);
        }
      } else {
        const packageName = packageNameForImport(specifier);
        if (!NODE_BUILTIN_IMPORTS.has(specifier) && !baselineDependencies.has(packageName)) {
          baselineUnresolved.add(`${file.target}\0${specifier}`);
        }
      }
    }
  }
  return (context) => {
    const issues: TransactionValidationIssue[] = [];
    const packageBytes = context.readFile("package.json");
    const configBytes = context.readFile("mergora.json");
    let dependencies = new Set<string>();
    let config: MergoraConfig | null = null;
    try {
      dependencies = declaredPackageNames(packageBytes);
      config = validateMergoraConfig(
        JSON.parse(configBytes?.toString("utf8") ?? "null") as unknown,
      );
    } catch {
      issues.push({
        code: "PROJECT_METADATA_INVALID",
        target: "package.json",
        message: "Import validation requires valid package.json and mergora.json metadata.",
      });
    }
    let checkedImports = 0;
    let typeChecked = 0;
    for (const file of files) {
      const kind = sourceScriptKind(file);
      if (kind === null) continue;
      const text = validationText(context, file.target, issues);
      if (text === null) continue;
      const imports = ts
        .preProcessFile(text, true, true)
        .importedFiles.map(({ fileName }) => fileName);
      for (const specifier of imports) {
        checkedImports += 1;
        if (specifier.includes("\\") || specifier.includes("?") || specifier.includes("#")) {
          issues.push({
            code: "IMPORT_SPECIFIER_UNSAFE",
            target: file.target,
            message: `Import ${JSON.stringify(specifier)} is not a portable static specifier.`,
          });
          continue;
        }
        const localCandidates = specifier.startsWith(".")
          ? localImportCandidates(file.target, specifier)
          : config === null
            ? []
            : aliasImportCandidates(config, specifier);
        if (localCandidates.length > 0) {
          if (
            !localCandidates.some((candidate) => context.readFile(candidate) !== null) &&
            !baselineUnresolved.has(`${file.target}\0${specifier}`)
          ) {
            issues.push({
              code: "IMPORT_TARGET_MISSING",
              target: file.target,
              message: `Import ${JSON.stringify(specifier)} has no file in the ${context.phase} view.`,
            });
          }
          continue;
        }
        const packageName = packageNameForImport(specifier);
        if (
          !NODE_BUILTIN_IMPORTS.has(specifier) &&
          !dependencies.has(packageName) &&
          !baselineUnresolved.has(`${file.target}\0${specifier}`)
        ) {
          issues.push({
            code: "IMPORT_PACKAGE_UNDECLARED",
            target: file.target,
            message: `Import ${JSON.stringify(specifier)} is not declared by package.json.`,
          });
        }
      }
      if (kind === ts.ScriptKind.TS && imports.length === 0 && !file.target.endsWith(".d.ts")) {
        typeChecked += 1;
        issues.push(...pureTypeDiagnostics(file.target, text));
      }
      if (issues.length >= MAX_SEMANTIC_VALIDATION_ISSUES) break;
    }
    return validationResult(
      `Validated ${checkedImports} imports and type-checked ${typeChecked} self-contained TypeScript files in the ${context.phase} view.`,
      `Type or import validation failed in the ${context.phase} view.`,
      issues,
    );
  };
}

function collectTokenAliases(
  value: unknown,
  path: readonly string[],
  tokens: Map<string, CollectedToken>,
  aliases: string[],
  issues: TransactionValidationIssue[],
  target: string,
  state: TokenTraversalState,
  inheritedType: string | null,
  depth = 0,
): void {
  state.nodes += 1;
  if (depth > 128 || state.nodes > 65_536) {
    if (!state.limitReported) {
      state.limitReported = true;
      issues.push({
        code: "TOKEN_LIMIT_EXCEEDED",
        target,
        message: "The token document exceeds deterministic depth or node limits.",
      });
    }
    return;
  }
  if (typeof value === "string") {
    const alias = /^\{([^{}]+)\}$/u.exec(value);
    if (alias !== null) aliases.push(alias[1]!);
    return;
  }
  if (Array.isArray(value)) {
    for (const entry of value)
      collectTokenAliases(
        entry,
        path,
        tokens,
        aliases,
        issues,
        target,
        state,
        inheritedType,
        depth + 1,
      );
    return;
  }
  if (value === null || typeof value !== "object") return;
  const record = value as Record<string, unknown>;
  let effectiveType = inheritedType;
  if (Object.hasOwn(record, "$type")) {
    if (typeof record.$type !== "string" || record.$type.trim().length === 0) {
      issues.push({
        code: "TOKEN_TYPE_INVALID",
        target,
        message: `Token group ${path.length === 0 ? "<root>" : path.join(".")} has an invalid $type.`,
      });
      effectiveType = null;
    } else {
      effectiveType = record.$type;
    }
  }
  if (Object.hasOwn(record, "$value")) {
    if (path.length === 0 || record.$value === undefined) {
      issues.push({
        code: "TOKEN_RECORD_INVALID",
        target,
        message: "A DTCG token record has no stable path or value.",
      });
    } else {
      const tokenPath = path.join(".");
      const tokenAliases: string[] = [];
      collectTokenAliases(
        record.$value,
        path,
        tokens,
        tokenAliases,
        issues,
        target,
        state,
        effectiveType,
        depth + 1,
      );
      tokens.set(tokenPath, { aliases: [...new Set(tokenAliases)].sort(), type: effectiveType });
    }
    return;
  }
  for (const [key, entry] of Object.entries(record)) {
    if (key.startsWith("$")) continue;
    collectTokenAliases(
      entry,
      [...path, key],
      tokens,
      aliases,
      issues,
      target,
      state,
      effectiveType,
      depth + 1,
    );
  }
}

function tokenValidator(
  files: readonly SemanticValidationFile[],
): (context: TransactionValidationContext) => TransactionValidationResult {
  return (context) => {
    const issues: TransactionValidationIssue[] = [];
    let documents = 0;
    let cssReferences = 0;
    for (const file of files) {
      const text = validationText(context, file.target, issues);
      if (text === null) continue;
      if (file.role === "token" || file.mediaType.includes("design-tokens")) {
        documents += 1;
        try {
          const value = JSON.parse(text) as unknown;
          const tokens = new Map<string, CollectedToken>();
          collectTokenAliases(
            value,
            [],
            tokens,
            [],
            issues,
            file.target,
            { nodes: 0, limitReported: false },
            null,
          );
          const visited = new Set<string>();
          const reportedCycles = new Set<string>();
          const reportedMismatches = new Set<string>();
          const visit = (token: string, stack: Set<string>): void => {
            const current = tokens.get(token);
            if (current === undefined || visited.has(token)) return;
            if (stack.has(token)) {
              if (!reportedCycles.has(token)) {
                reportedCycles.add(token);
                issues.push({
                  code: "TOKEN_ALIAS_CYCLE",
                  target: file.target,
                  message: `Token alias cycle includes ${token}.`,
                });
              }
              return;
            }
            const next = new Set(stack).add(token);
            for (const reference of current.aliases) {
              const referenced = tokens.get(reference);
              if (referenced === undefined) {
                issues.push({
                  code: "TOKEN_ALIAS_MISSING",
                  target: file.target,
                  message: `Token ${token} references missing token ${reference}.`,
                });
              } else {
                const pair = `${token}\0${reference}`;
                if (
                  current.type !== null &&
                  referenced.type !== null &&
                  current.type !== referenced.type &&
                  !reportedMismatches.has(pair)
                ) {
                  reportedMismatches.add(pair);
                  issues.push({
                    code: "TOKEN_ALIAS_TYPE_MISMATCH",
                    target: file.target,
                    message: `Token ${token} (${current.type}) aliases ${reference} (${referenced.type}).`,
                  });
                }
                visit(reference, next);
              }
            }
            visited.add(token);
          };
          for (const token of [...tokens.keys()].sort()) visit(token, new Set());
        } catch {
          issues.push({
            code: "TOKEN_DOCUMENT_INVALID",
            target: file.target,
            message: "The declared token document is not valid JSON.",
          });
        }
      }
      if (file.mediaType === "text/css" || file.target.endsWith(".css")) {
        const occurrences = text.match(/var\s*\(/gu)?.length ?? 0;
        const valid = [...text.matchAll(/var\s*\(\s*(--[a-zA-Z0-9_-]+)/gu)].length;
        cssReferences += valid;
        if (occurrences !== valid) {
          issues.push({
            code: "TOKEN_CSS_REFERENCE_INVALID",
            target: file.target,
            message: "A CSS var() reference lacks a portable custom-property name.",
          });
        }
      }
      if (issues.length >= MAX_SEMANTIC_VALIDATION_ISSUES) break;
    }
    return validationResult(
      `Validated ${documents} token documents and ${cssReferences} CSS token references in the ${context.phase} view.`,
      `Token integrity validation failed in the ${context.phase} view.`,
      issues,
    );
  };
}

function validationManifest(
  context: TransactionValidationContext,
  issues: TransactionValidationIssue[],
): Record<string, unknown> | null {
  try {
    const parsed = JSON.parse(
      context.readFile(MANIFEST_PATH)?.toString("utf8") ?? "null",
    ) as unknown;
    if (parsed === null || Array.isArray(parsed) || typeof parsed !== "object") throw new Error();
    return parsed as Record<string, unknown>;
  } catch {
    issues.push({
      code: "MANIFEST_VALIDATION_INVALID",
      target: MANIFEST_PATH,
      message: "The validation view has no valid provenance manifest.",
    });
    return null;
  }
}

function contractValidator(
  expectedItems: readonly SemanticValidationItem[],
): (context: TransactionValidationContext) => TransactionValidationResult {
  return (context) => {
    const issues: TransactionValidationIssue[] = [];
    const manifest = validationManifest(context, issues);
    const items =
      manifest?.items !== null && typeof manifest?.items === "object"
        ? (manifest.items as Record<string, unknown>)
        : {};
    for (const expected of expectedItems) {
      const item = items[expected.owner];
      if (item === null || typeof item !== "object" || Array.isArray(item)) {
        issues.push({
          code: "CONTRACT_OWNER_MISSING",
          target: MANIFEST_PATH,
          message: `Contract owner ${expected.owner} is absent from provenance.`,
        });
        continue;
      }
      const record = item as Record<string, unknown>;
      const payload =
        record.payload !== null &&
        typeof record.payload === "object" &&
        !Array.isArray(record.payload)
          ? (record.payload as Record<string, unknown>)
          : null;
      if (
        record.contractVersion !== expected.contractVersion ||
        !SEMVER.test(String(record.contractVersion)) ||
        payload?.digest !== expected.payloadDigest
      ) {
        issues.push({
          code: "CONTRACT_PROVENANCE_MISMATCH",
          target: MANIFEST_PATH,
          message: `Contract version or immutable payload binding for ${expected.owner} is inconsistent.`,
        });
      }
    }
    return validationResult(
      `Validated ${expectedItems.length} Contract-to-payload provenance bindings in the ${context.phase} view.`,
      `Contract integrity validation failed in the ${context.phase} view.`,
      issues,
    );
  };
}

function projectConfigurationValidator(
  expectedItems: readonly SemanticValidationItem[],
): (context: TransactionValidationContext) => TransactionValidationResult {
  return (context) => {
    const issues: TransactionValidationIssue[] = [];
    let config: MergoraConfig | null = null;
    try {
      config = validateMergoraConfig(
        JSON.parse(context.readFile("mergora.json")?.toString("utf8") ?? "null") as unknown,
      );
      if (digest(config) !== context.plan.configDigest) {
        issues.push({
          code: "PROJECT_CONFIG_DIGEST_MISMATCH",
          target: "mergora.json",
          message: "The validated configuration does not match the reviewed plan digest.",
        });
      }
    } catch {
      issues.push({
        code: "PROJECT_CONFIG_INVALID",
        target: "mergora.json",
        message: "The validation view has no schema-valid Mergora configuration.",
      });
    }
    if (context.phase === "post-commit" && config !== null) {
      try {
        const inspection = inspectProject(context.projectRoot, {
          framework: config.project.framework,
          sourceRoot: config.project.sourceRoot,
          globalCss: config.styling.globalCss,
          aliasPrefix: mergoraConfigAliasPrefix(config),
        });
        if (
          inspection.framework !== config.project.framework ||
          inspection.sourceRoot !== config.project.sourceRoot ||
          inspection.globalCss !== config.styling.globalCss ||
          inspection.stylingEngine !== config.styling.engine
        ) {
          throw new Error("inspection mismatch");
        }
      } catch {
        issues.push({
          code: "PROJECT_INSPECTION_MISMATCH",
          target: "mergora.json",
          message:
            "The committed project no longer matches its configured framework or source layout.",
        });
      }
    }
    const manifest = validationManifest(context, issues);
    const items =
      manifest?.items !== null && typeof manifest?.items === "object"
        ? (manifest.items as Record<string, unknown>)
        : {};
    for (const expected of expectedItems) {
      const raw = items[expected.owner];
      if (raw === null || typeof raw !== "object" || Array.isArray(raw)) continue;
      const item = raw as Record<string, unknown>;
      if (
        item.transformContext === null ||
        typeof item.transformContext !== "object" ||
        Array.isArray(item.transformContext) ||
        item.transformContextDigest !== expected.transformContextDigest ||
        digest(item.transformContext) !== expected.transformContextDigest
      ) {
        issues.push({
          code: "TRANSFORM_CONTEXT_MISMATCH",
          target: MANIFEST_PATH,
          message: `Transform context for ${expected.owner} is not bound to its reviewed digest.`,
        });
      }
    }
    return validationResult(
      `Validated configuration and ${expectedItems.length} transform-context bindings in the ${context.phase} view.`,
      `Project configuration validation failed in the ${context.phase} view.`,
      issues,
    );
  };
}

function semanticTransactionValidators(input: {
  readonly root: string;
  readonly files: readonly SemanticValidationFile[];
  readonly items: readonly SemanticValidationItem[];
}): readonly TransactionValidator[] {
  if (input.files.length > MAX_SEMANTIC_VALIDATION_FILES) {
    throw new CliError("Semantic validation file inventory exceeds its deterministic bound.", {
      code: "SEMANTIC_VALIDATION_LIMIT_EXCEEDED",
      exitCode: 8,
    });
  }
  const files = [...input.files].sort((left, right) =>
    left.target.localeCompare(right.target, "en-US"),
  );
  const items = [...input.items].sort((left, right) =>
    left.owner.localeCompare(right.owner, "en-US"),
  );
  const registrations: readonly [
    string,
    TransactionValidator["label"],
    (context: TransactionValidationContext) => TransactionValidationResult,
  ][] = [
    ["semantic-media-parse", "parse", mediaParseValidator(files)],
    ["semantic-type-imports", "type-imports", typeImportValidator(files, input.root)],
    ["semantic-token-integrity", "tokens", tokenValidator(files)],
    ["semantic-contract-integrity", "accessibility-contract", contractValidator(items)],
    ["semantic-project-config", "project-configured", projectConfigurationValidator(items)],
  ];
  return registrations.map(([id, label, validate]) => ({
    id,
    label,
    validateStagedOverlay: validate,
    validatePostCommit: validate,
  }));
}

function assertDigest(value: string, label: string): asserts value is Digest {
  if (!DIGEST.test(value)) {
    throw new CliError(`${label} is not a SHA-256 digest.`, {
      code: "REGISTRY_DIGEST_INVALID",
      exitCode: 5,
    });
  }
}

function safeHttpsUrl(value: string, label: string): URL {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new CliError(`${label} is not a valid URL.`, {
      code: "REGISTRY_URL_INVALID",
      exitCode: 5,
    });
  }
  if (
    url.protocol !== "https:" ||
    url.username !== "" ||
    url.password !== "" ||
    url.search !== "" ||
    url.hash !== ""
  ) {
    throw new CliError(`${label} must be credential-free immutable HTTPS metadata.`, {
      code: "REGISTRY_URL_INVALID",
      exitCode: 5,
    });
  }
  return url;
}

function updateRegistryIdentity(registry: ImmutableUpdateRegistry): unknown {
  if (registry.nativeIdentity === true) {
    return {
      id: registry.id,
      origin: registry.origin,
      trust: registry.trust,
    };
  }
  return {
    id: registry.id,
    protocol: registry.protocol,
    origin: registry.origin,
    trust: registry.trust,
  };
}

function provenancePayloadDigest(item: ImmutableUpdateItem): Digest {
  return item.acquiredPayloadDigest ?? item.payloadDigest;
}

function provenanceManifestDigest(release: ImmutableUpdateRelease): Digest {
  return release.acquiredManifestDigest ?? release.manifestDigest;
}

export function immutableUpdateRegistryIdentityDigest(
  registry: Omit<ImmutableUpdateRegistry, "identityDigest" | "source" | "evidenceTier">,
): Digest {
  return digest(registry);
}

function updateItemPayload(item: Omit<ImmutableUpdateItem, "payloadDigest">): unknown {
  return {
    itemId: item.itemId,
    kind: item.kind,
    resolved: item.resolved,
    payloadUrl: item.payloadUrl,
    renderedWithTransformContextDigest: item.renderedWithTransformContextDigest,
    files: item.files,
    registryDependencies: item.registryDependencies,
    dependencies: item.dependencies,
    contractVersion: item.contractVersion,
    lastMigration: item.lastMigration,
  };
}

export function immutableUpdateItemDigest(
  item: Omit<ImmutableUpdateItem, "payloadDigest">,
): Digest {
  return digest(updateItemPayload(item));
}

function updateReleaseManifest(release: ImmutableUpdateRelease): unknown {
  return {
    schemaVersion: release.schemaVersion,
    registry: release.registry,
    release: release.release,
    items: release.items
      .map(({ itemId, resolved, payloadDigest }) => ({ itemId, resolved, payloadDigest }))
      .sort((left, right) => left.itemId.localeCompare(right.itemId, "en-US")),
  };
}

export function immutableUpdateReleaseDigest(
  release: Omit<ImmutableUpdateRelease, "manifestDigest">,
): Digest {
  return digest({
    schemaVersion: release.schemaVersion,
    registry: release.registry,
    release: release.release,
    items: release.items
      .map(({ itemId, resolved, payloadDigest }) => ({ itemId, resolved, payloadDigest }))
      .sort((left, right) => left.itemId.localeCompare(right.itemId, "en-US")),
  });
}

/**
 * Loads an explicitly acquired, project-relative immutable release snapshot.
 * It performs no network or cache writes and validates every declared digest
 * before returning metadata to update or diff planning.
 */
export function readImmutableUpdateRelease(
  projectRoot: string,
  releaseFile: string,
): ImmutableUpdateRelease {
  const root = validatedProjectRoot(projectRoot);
  assertPortableRelativePath(releaseFile, "Immutable release file");
  const path = resolve(root, ...releaseFile.split("/"));
  let metadata;
  try {
    metadata = lstatSync(path);
  } catch {
    metadata = null;
  }
  if (
    metadata === null ||
    metadata.isSymbolicLink() ||
    !metadata.isFile() ||
    metadata.size > 52_428_800
  ) {
    throw new CliError("The immutable release snapshot is missing, unsafe, or oversized.", {
      code: "REGISTRY_RELEASE_FILE_INVALID",
      exitCode: 5,
      target: releaseFile,
    });
  }
  const bytes = readProjectFile(root, releaseFile);
  if (bytes === null || bytes.byteLength > 52_428_800) {
    throw new CliError("The immutable release snapshot is missing or oversized.", {
      code: "REGISTRY_RELEASE_FILE_INVALID",
      exitCode: 5,
      target: releaseFile,
    });
  }
  let value: unknown;
  try {
    value = JSON.parse(bytes.toString("utf8")) as unknown;
  } catch {
    value = null;
  }
  if (value === null || Array.isArray(value) || typeof value !== "object") {
    throw new CliError("The immutable release snapshot is invalid JSON metadata.", {
      code: "REGISTRY_RELEASE_FILE_INVALID",
      exitCode: 5,
      target: releaseFile,
    });
  }
  const config = readMergoraConfig(root);
  if (config === null) {
    throw new CliError("mergora.json is missing; initialize the project first.", {
      code: "CONFIG_MISSING",
      exitCode: 3,
      target: "mergora.json",
    });
  }
  const release = value as ImmutableUpdateRelease;
  validateRelease(release, config.policy.maxRegistryItemBytes);
  return release;
}

function remoteBytes(file: ImmutableUpdateFile): Buffer {
  let bytes: Buffer;
  try {
    bytes = Buffer.from(file.content, file.encoding === "base64" ? "base64" : "utf8");
  } catch {
    throw new CliError(`Remote file ${file.logicalPath} has invalid ${file.encoding} bytes.`, {
      code: "REGISTRY_PAYLOAD_INVALID",
      exitCode: 5,
      target: file.logicalPath,
    });
  }
  if (file.encoding === "base64" && bytes.toString("base64") !== file.content) {
    throw new CliError(`Remote file ${file.logicalPath} has non-canonical base64 bytes.`, {
      code: "REGISTRY_PAYLOAD_INVALID",
      exitCode: 5,
      target: file.logicalPath,
    });
  }
  if (sha256(bytes) !== file.digest) {
    throw new CliError(`Remote file ${file.logicalPath} failed digest verification.`, {
      code: "REGISTRY_PAYLOAD_DIGEST_MISMATCH",
      exitCode: 5,
      target: file.logicalPath,
    });
  }
  return bytes;
}

function validateRelease(release: ImmutableUpdateRelease, maxFileBytes: number): void {
  if (release.schemaVersion !== 1 || !SEMVER.test(release.release)) {
    throw new CliError("Update target must be an explicit immutable semantic version.", {
      code: "REGISTRY_RELEASE_INVALID",
      exitCode: 5,
    });
  }
  if (
    !REGISTRY_ID.test(release.registry.id) ||
    release.registry.protocol !== "mergora-v1" ||
    !["network", "verified-cache", "vendor", "mirror"].includes(release.registry.source) ||
    !["official", "enrolled", "local-development"].includes(release.registry.trust) ||
    !["complete", "partial", "not-supplied"].includes(release.registry.evidenceTier)
  ) {
    throw new CliError("Update registry identity metadata is invalid.", {
      code: "REGISTRY_IDENTITY_INVALID",
      exitCode: 5,
    });
  }
  const registryUrl = safeHttpsUrl(release.registry.origin, "Update registry origin");
  assertDigest(release.registry.identityDigest, "Update registry identity digest");
  if (digest(updateRegistryIdentity(release.registry)) !== release.registry.identityDigest) {
    throw new CliError("Update registry identity digest does not match its immutable identity.", {
      code: "REGISTRY_IDENTITY_MISMATCH",
      exitCode: 5,
    });
  }
  assertDigest(release.manifestDigest, "Update release manifest digest");
  if (digest(updateReleaseManifest(release)) !== release.manifestDigest) {
    throw new CliError("Update release manifest failed digest verification.", {
      code: "REGISTRY_MANIFEST_DIGEST_MISMATCH",
      exitCode: 5,
    });
  }
  if (release.acquiredManifestDigest !== undefined) {
    assertDigest(release.acquiredManifestDigest, "Acquired release manifest digest");
  }
  if (release.items.length === 0 || release.items.length > 4096) {
    throw new CliError("Update release contains an invalid item count.", {
      code: "REGISTRY_PAYLOAD_INVALID",
      exitCode: 5,
    });
  }
  const itemIds = new Set<string>();
  for (const item of release.items) {
    if (
      !ITEM_ID.test(item.itemId) ||
      itemIds.has(item.itemId) ||
      item.resolved !== release.release ||
      !SEMVER.test(item.contractVersion) ||
      item.files.length > 2048
    ) {
      throw new CliError(`Update payload for ${item.itemId} has invalid immutable metadata.`, {
        code: "REGISTRY_PAYLOAD_INVALID",
        exitCode: 5,
      });
    }
    itemIds.add(item.itemId);
    const payloadUrl = safeHttpsUrl(item.payloadUrl, `Update payload URL for ${item.itemId}`);
    if (
      payloadUrl.origin !== registryUrl.origin ||
      !payloadUrl.pathname.split("/").includes(release.release)
    ) {
      throw new CliError(
        `Update payload URL for ${item.itemId} is not tied to the explicit immutable registry release.`,
        { code: "REGISTRY_URL_INVALID", exitCode: 5 },
      );
    }
    assertDigest(item.payloadDigest, `Update payload digest for ${item.itemId}`);
    if (item.acquiredPayloadDigest !== undefined) {
      assertDigest(item.acquiredPayloadDigest, `Acquired payload digest for ${item.itemId}`);
    }
    assertDigest(
      item.renderedWithTransformContextDigest,
      `Transform context digest for ${item.itemId}`,
    );
    if (digest(updateItemPayload(item)) !== item.payloadDigest) {
      throw new CliError(`Update payload for ${item.itemId} failed digest verification.`, {
        code: "REGISTRY_PAYLOAD_DIGEST_MISMATCH",
        exitCode: 5,
      });
    }
    const logicalPaths = new Set<string>();
    for (const file of item.files) {
      assertPortableRelativePath(file.logicalPath, "Remote logical path");
      const portable = file.logicalPath.normalize("NFC").toLocaleLowerCase("en-US");
      if (
        logicalPaths.has(portable) ||
        file.executable !== false ||
        file.mediaType.length === 0 ||
        !["utf8", "base64"].includes(file.encoding)
      ) {
        throw new CliError(`Update payload for ${item.itemId} repeats or invalidates a file.`, {
          code: "REGISTRY_PAYLOAD_INVALID",
          exitCode: 5,
          target: file.logicalPath,
        });
      }
      logicalPaths.add(portable);
      assertDigest(file.digest, `Remote file digest for ${file.logicalPath}`);
      const bytes = remoteBytes(file);
      if (bytes.byteLength > maxFileBytes) {
        throw new CliError(`Remote file ${file.logicalPath} exceeds the project byte policy.`, {
          code: "REGISTRY_PAYLOAD_OVERSIZE",
          exitCode: 5,
          target: file.logicalPath,
        });
      }
    }
    for (const dependency of item.registryDependencies) {
      if (!/^[a-z0-9]+(?:-[a-z0-9]+)*:[a-z0-9]+(?:-[a-z0-9]+)*$/u.test(dependency)) {
        throw new CliError(`Update payload for ${item.itemId} has an invalid dependency ID.`, {
          code: "REGISTRY_PAYLOAD_INVALID",
          exitCode: 5,
        });
      }
    }
    for (const dependencies of [item.dependencies.runtime, item.dependencies.development]) {
      for (const [name, range] of Object.entries(dependencies)) {
        if (
          !/^(?:@[a-z0-9._-]+\/)?[a-z0-9._-]+$/u.test(name) ||
          !SEMVER_RANGE.test(range) ||
          range !== range.trim() ||
          /[\r\n\0]/u.test(`${name}${range}`)
        ) {
          throw new CliError(`Update payload for ${item.itemId} has invalid dependencies.`, {
            code: "REGISTRY_PAYLOAD_INVALID",
            exitCode: 5,
          });
        }
      }
    }
  }
}

function configuredProject(options: SemanticUpdateOptions): {
  readonly root: string;
  readonly config: MergoraConfig;
  readonly inspection: ProjectInspection;
  readonly manifest: ReturnType<typeof readManifest>;
} {
  const root = validatedProjectRoot(options.projectRoot);
  const config = readMergoraConfig(root);
  if (config === null) {
    throw new CliError("Mergora is not initialized; run mergora init first.", {
      code: "CONFIG_MISSING",
      exitCode: 3,
      target: "mergora.json",
    });
  }
  const manifest = readManifest(root);
  const inspection = inspectProject(root, {
    framework: config.project.framework,
    sourceRoot: config.project.sourceRoot,
    globalCss: config.styling.globalCss,
    aliasPrefix: mergoraConfigAliasPrefix(config),
    packageManager: options.packageManager,
  });
  return { root, config, inspection, manifest };
}

function qualifiedItemId(value: string): string {
  const itemId = value.startsWith("official:") ? value.slice("official:".length) : value;
  if (!ITEM_ID.test(itemId)) {
    throw new CliError(`Update item ${JSON.stringify(value)} is invalid.`, {
      code: "ITEM_REFERENCE_INVALID",
      exitCode: 2,
    });
  }
  return `official:${itemId}`;
}

function selectedItemIds(
  manifest: ProvenanceManifest,
  requested: readonly string[] | undefined,
): readonly string[] {
  const selected =
    requested === undefined || requested.length === 0
      ? Object.keys(manifest.items)
      : [...new Set(requested.map(qualifiedItemId))];
  const sorted = [...selected].sort((left, right) => left.localeCompare(right, "en-US"));
  if (sorted.length === 0) {
    throw new CliError("No source-installed items are available to update.", {
      code: "ITEM_REQUIRED",
      exitCode: 2,
    });
  }
  for (const id of sorted) {
    const item = manifest.items[id];
    if (item === undefined || item.mode !== "source") {
      throw new CliError(`Item ${id} is not source-installed in the provenance manifest.`, {
        code: "ITEM_NOT_INSTALLED",
        exitCode: 3,
        target: MANIFEST_PATH,
      });
    }
  }
  return sorted;
}

function targetRoot(item: ManifestItem, file: ImmutableUpdateFile): string {
  const targets = item.transformContext.targets;
  const key =
    file.role === "hook"
      ? "hooks"
      : file.role === "lib"
        ? "lib"
        : file.role === "system" || item.kind === "system"
          ? "systems"
          : file.role === "kit" || item.kind === "kit"
            ? "kits"
            : file.role === "style"
              ? "styles"
              : file.role === "token" || item.kind === "theme"
                ? "tokens"
                : item.kind === "hook"
                  ? "hooks"
                  : item.kind === "utility"
                    ? "lib"
                    : "components";
  const root = targets[key];
  if (typeof root !== "string") {
    throw new CliError(`Recorded transform context lacks target mapping ${key}.`, {
      code: "TRANSFORM_CONTEXT_INVALID",
      exitCode: 3,
      target: MANIFEST_PATH,
    });
  }
  assertPortableRelativePath(root, "Recorded transform target");
  return root;
}

function remoteTarget(
  item: ManifestItem,
  file: ImmutableUpdateFile,
  existing: ManifestFile | undefined,
): string {
  if (existing !== undefined) return existing.target;
  const segments = file.logicalPath.split("/");
  const relative = segments[1] === item.itemId ? segments.slice(2) : segments.slice(1);
  if (relative.length === 0) {
    throw new CliError(`Remote logical path ${file.logicalPath} has no target-relative path.`, {
      code: "UPDATE_TARGET_PATH_INVALID",
      exitCode: 5,
      target: file.logicalPath,
    });
  }
  const target = `${targetRoot(item, file)}/${item.itemId}/${relative.join("/")}`;
  assertPortableRelativePath(target, "Rendered update target");
  return target;
}

function portableTargetKey(target: string): string {
  return `target-${sha256(target).slice("sha256:".length, "sha256:".length + 32)}`;
}

function conflictResult(
  id: string,
  reason: SemanticConflictReason,
  detail: string,
): FileMergeResult {
  const conflict: SemanticConflict = {
    id,
    reason,
    base: null,
    local: null,
    remote: null,
    detail,
  };
  return {
    status: "conflict",
    proposed: null,
    conflictProposal: null,
    conflicts: [conflict],
    appliedRemoteKeys: [],
    preservedLocalKeys: [],
    tombstone: false,
  };
}

function chosenConflictProposal(
  result: FileMergeResult,
  local: Buffer | null,
  remote: Buffer | null,
): Buffer | null {
  if (result.conflictProposal !== null) return Buffer.from(result.conflictProposal);
  if (local !== null) return Buffer.from(local);
  return remote === null ? null : Buffer.from(remote);
}

function operationFor(status: FileMergeResult["status"]): OperationPlanFile["operation"] {
  if (status === "adopt") return "no-op";
  if (status === "move") return "conflict";
  return status;
}

function conflictKind(reason: SemanticConflictReason): OperationPlan["conflicts"][number]["kind"] {
  if (reason === "add-add") return "add-add";
  if (reason === "delete-modify") return "delete-modify";
  if (reason === "modify-delete") return "modify-delete";
  if (reason === "binary-concurrent-change") return "binary";
  if (reason === "invalid-keep-region" || reason === "remote-region-removed") {
    return "keep-region";
  }
  if (
    reason === "parse-error" ||
    reason === "invalid-json" ||
    reason === "utf8-decode" ||
    reason === "duplicate-key"
  ) {
    return "parse";
  }
  return "modify-modify";
}

function dependencyPatchId(name: string): string {
  const normalized = name
    .replace(/^@/u, "")
    .replaceAll("/", "-")
    .replace(/[^a-z0-9._-]+/gu, "-")
    .replace(/[._]+/gu, "-")
    .replace(/-+/gu, "-")
    .replace(/^-|-$/gu, "");
  return `dependency-${normalized}`;
}

function packagePatch(name: string, range: string): ManifestPatch {
  return {
    id: dependencyPatchId(name),
    adapter: "package-dependency",
    semanticKey: `dependencies.${name}`,
    ownedValueDigest: sha256(range),
  };
}

function refreshDependencyProvenance(manifest: ProvenanceManifest): void {
  const dependencyOwners: Record<string, string[]> = {};
  const patchIds: string[] = [];
  for (const [owner, item] of Object.entries(manifest.items).sort(([left], [right]) =>
    left.localeCompare(right, "en-US"),
  )) {
    const retained = item.structuredPatches.filter(
      ({ adapter }) => adapter !== "package-dependency",
    );
    const patches = Object.entries(item.dependencies.runtime)
      .filter(([name]) => name !== "react" && name !== "react-dom")
      .sort(([left], [right]) => left.localeCompare(right, "en-US"))
      .map(([name, range]) => packagePatch(name, range));
    item.structuredPatches = [...retained, ...patches].sort((left, right) =>
      left.id.localeCompare(right.id, "en-US"),
    );
    for (const patch of patches) patchIds.push(patch.id);
    for (const name of Object.keys(item.dependencies.runtime)) {
      if (name === "react" || name === "react-dom") continue;
      (dependencyOwners[`runtime:${name}`] ??= []).push(owner);
    }
  }
  manifest.dependencyOwners = Object.fromEntries(
    Object.entries(dependencyOwners)
      .sort(([left], [right]) => left.localeCompare(right, "en-US"))
      .map(([name, owners]) => [name, [...portableSort(owners)]]),
  );
  manifest.sharedTargets =
    patchIds.length === 0 ? {} : { "package.json": [...portableSort([...new Set(patchIds)])] };
}

function dependencyPlan(
  root: string,
  before: ProvenanceManifest,
  after: ProvenanceManifest,
): PackageDependencyPlan {
  const requirements: Record<string, { range: string; owners: string[] }> = {};
  for (const [owner, item] of Object.entries(after.items)) {
    for (const [name, range] of Object.entries(item.dependencies.runtime)) {
      if (name === "react" || name === "react-dom") continue;
      const current = requirements[name];
      if (current !== undefined && current.range !== range) {
        throw new CliError(`Updated items require incompatible ranges for ${name}.`, {
          code: "DEPENDENCY_REQUIREMENT_CONFLICT",
          exitCode: 7,
          target: "package.json",
        });
      }
      (requirements[name] ??= { range, owners: [] }).owners.push(owner);
    }
  }
  const normalizedRequirements: Record<string, DependencyRequirement> = Object.fromEntries(
    Object.entries(requirements).map(([name, requirement]) => [
      name,
      { range: requirement.range, owners: portableSort(requirement.owners) },
    ]),
  );
  const removals: Record<string, readonly string[]> = {};
  const installedDependencies = readPackageDependencies(resolve(root, "package.json"));
  for (const [key, owners] of Object.entries(before.dependencyOwners)) {
    if (!key.startsWith("runtime:")) continue;
    const name = key.slice("runtime:".length);
    if (normalizedRequirements[name] !== undefined) continue;
    const installedRange = installedDependencies[name];
    const ownershipIsExact =
      installedRange !== undefined &&
      owners.length > 0 &&
      owners.every((owner) => {
        const item = before.items[owner];
        return (
          item?.dependencies.runtime[name] === installedRange &&
          item.structuredPatches.some(
            (patch) =>
              patch.adapter === "package-dependency" &&
              patch.semanticKey === `dependencies.${name}` &&
              patch.ownedValueDigest === sha256(installedRange),
          )
        );
      });
    if (installedRange !== undefined && !ownershipIsExact) {
      throw new CliError(
        `Dependency ${name} no longer has an upstream owner, but its local declaration differs from recorded ownership; Mergora will not remove it.`,
        {
          code: "DEPENDENCY_OWNERSHIP_DIVERGED",
          exitCode: 7,
          target: "package.json",
        },
      );
    }
    if (ownershipIsExact) removals[name] = owners;
  }
  return planPackageDependencies(resolve(root, "package.json"), normalizedRequirements, removals);
}

function updatedManifestItem(
  installed: ManifestItem,
  remote: ImmutableUpdateItem,
  entries: readonly UpdateEntry[],
): ManifestItem {
  const files = entries
    .filter(({ owner, remoteFile }) => owner === `official:${remote.itemId}` && remoteFile !== null)
    .map((entry) => ({
      logicalPath: entry.logicalPath,
      target: entry.target,
      role: entry.role,
      base: entry.remoteFile!.digest,
      installed: digestOrNull(entry.proposed),
      mediaType: entry.mediaType,
      executable: false as const,
      ...(entry.proposed === null ? { tombstone: true as const } : {}),
    }))
    .sort((left, right) => left.target.localeCompare(right.target, "en-US"));
  return {
    ...installed,
    kind: remote.kind,
    resolved: remote.resolved,
    payload: { url: remote.payloadUrl, digest: provenancePayloadDigest(remote) },
    files,
    registryDependencies: [...remote.registryDependencies].sort((left, right) =>
      left.localeCompare(right, "en-US"),
    ),
    dependencies: {
      runtime: Object.fromEntries(
        Object.entries(remote.dependencies.runtime).sort(([left], [right]) =>
          left.localeCompare(right, "en-US"),
        ),
      ),
      development: Object.fromEntries(
        Object.entries(remote.dependencies.development).sort(([left], [right]) =>
          left.localeCompare(right, "en-US"),
        ),
      ),
    },
    contractVersion: remote.contractVersion,
    lastMigration: remote.lastMigration,
  };
}

function mutation(
  root: string,
  target: string,
  content: Buffer | null,
  manifest = false,
): TransactionMutation {
  return {
    target,
    content,
    beforeDigest: digestOrNull(readProjectFile(root, target)),
    ...(manifest ? { manifest: true } : {}),
  };
}

function entryOperation(entry: UpdateEntry): OperationPlanFile {
  const proposed = digestOrNull(entry.proposed);
  const reason =
    entry.result.status === "conflict"
      ? entry.result.conflicts.map(({ detail }) => detail).join(" ")
      : entry.result.status === "keep-local"
        ? "Upstream did not change this semantic file; preserve exact local bytes."
        : entry.result.status === "local-delete"
          ? "Preserve the intentional local deletion and advance the upstream base as a tombstone."
          : entry.result.status === "semantic-merge"
            ? "Apply disjoint deterministic semantic edits while preserving local customization."
            : `Deterministic B/L/R classification: ${entry.result.status}.`;
  return {
    operation: operationFor(entry.result.status),
    target: entry.target,
    owner: entry.owner,
    base: digestOrNull(entry.base),
    local: digestOrNull(entry.local),
    remote: digestOrNull(entry.remote),
    proposed,
    mediaType: entry.mediaType,
    risk:
      entry.result.status === "conflict"
        ? "conflict"
        : entry.result.status === "delete"
          ? "destructive"
          : entry.result.status === "semantic-merge"
            ? "review-required"
            : "ordinary",
    reason,
  };
}

function metadataOperation(input: {
  readonly target: string;
  readonly owner: string;
  readonly before: Buffer | null;
  readonly after: Buffer | null;
  readonly mediaType: string;
  readonly reason: string;
}): OperationPlanFile {
  return {
    operation: input.after === null ? "delete" : input.before === null ? "add" : "structured-patch",
    target: input.target,
    owner: input.owner,
    base: digestOrNull(input.before),
    local: digestOrNull(input.before),
    remote: digestOrNull(input.after),
    proposed: digestOrNull(input.after),
    mediaType: input.mediaType,
    risk: input.after === null ? "destructive" : "ordinary",
    reason: input.reason,
  };
}

function assertPackageManagerScope(
  inspection: ProjectInspection,
  packageChanged: boolean,
  noInstall: boolean | undefined,
): void {
  if (
    packageChanged &&
    noInstall !== true &&
    inspection.packageManagerEvidence.some((entry) => entry.startsWith("workspace-lockfile:"))
  ) {
    throw new CliError(
      "The authoritative workspace lockfile is outside this project root; use --no-install and run the workspace-root install separately.",
      { code: "PACKAGE_MANAGER_WORKSPACE_TRANSACTION_UNSUPPORTED", exitCode: 7 },
    );
  }
}

function buildEntries(input: {
  readonly root: string;
  readonly config: MergoraConfig;
  readonly manifest: ProvenanceManifest;
  readonly selected: readonly string[];
  readonly remoteById: ReadonlyMap<string, ImmutableUpdateItem>;
}): readonly UpdateEntry[] {
  const entries: UpdateEntry[] = [];
  const targetOwners = new Map<string, string>();
  const selectedSet = new Set(input.selected);
  for (const [owner, item] of Object.entries(input.manifest.items)) {
    if (selectedSet.has(owner)) continue;
    for (const file of item.files) {
      targetOwners.set(file.target.normalize("NFC").toLocaleLowerCase("en-US"), owner);
    }
  }
  for (const owner of input.selected) {
    const installed = input.manifest.items[owner]!;
    const remote = input.remoteById.get(installed.itemId)!;
    if (remote.renderedWithTransformContextDigest !== installed.transformContextDigest) {
      throw new CliError(
        `Update payload for ${installed.itemId} was not rendered with the recorded transform context.`,
        {
          code: "TRANSFORM_CONTEXT_MISMATCH",
          exitCode: 7,
          target: MANIFEST_PATH,
        },
      );
    }
    const oldByLogical = new Map(installed.files.map((file) => [file.logicalPath, file]));
    const remoteByLogical = new Map(remote.files.map((file) => [file.logicalPath, file]));
    const logicalPaths = [...new Set([...oldByLogical.keys(), ...remoteByLogical.keys()])].sort(
      (left, right) => left.localeCompare(right, "en-US"),
    );
    for (const logicalPath of logicalPaths) {
      const existing = oldByLogical.get(logicalPath);
      const remoteFile = remoteByLogical.get(logicalPath);
      const target = existing?.target ?? remoteTarget(installed, remoteFile!, existing);
      assertPortableRelativePath(target, "Semantic Sync target");
      const mediaType = remoteFile?.mediaType ?? existing!.mediaType;
      if (existing !== undefined && remoteFile !== undefined && existing.mediaType !== mediaType) {
        throw new CliError(
          `Update changes the declared media type of ${target}; a versioned migration is required.`,
          { code: "UPDATE_MEDIA_TYPE_MIGRATION_REQUIRED", exitCode: 7, target },
        );
      }
      if (existing !== undefined && remoteFile !== undefined && existing.role !== remoteFile.role) {
        throw new CliError(
          `Update changes the target role of ${target}; a versioned move migration is required.`,
          { code: "UPDATE_TARGET_ROLE_MIGRATION_REQUIRED", exitCode: 7, target },
        );
      }
      const base =
        existing === undefined ? null : readProjectFile(input.root, basePath(existing.base));
      if (existing !== undefined && (base === null || sha256(base) !== existing.base)) {
        throw new CliError(`Immutable base for ${target} is missing or corrupt.`, {
          code: "BASE_DIGEST_MISMATCH",
          exitCode: 3,
          target: basePath(existing.base),
        });
      }
      const local = readProjectFile(input.root, target);
      const remoteBytesValue = remoteFile === undefined ? null : remoteBytes(remoteFile);
      const portableTarget = target.normalize("NFC").toLocaleLowerCase("en-US");
      const otherOwner = targetOwners.get(portableTarget);
      let result: FileMergeResult;
      if (otherOwner !== undefined && otherOwner !== owner) {
        result = conflictResult(
          "$ownership",
          "add-add",
          `Target is already owned by ${otherOwner}; the updater will not replace it.`,
        );
      } else {
        result = mergeFileThreeWay({
          mediaType: mergeAdapterMediaType(mediaType),
          base,
          local,
          remote: remoteBytesValue,
          maxFileBytes: input.config.policy.maxRegistryItemBytes,
        });
      }
      targetOwners.set(portableTarget, owner);
      const proposed =
        result.status === "conflict"
          ? chosenConflictProposal(result, local, remoteBytesValue)
          : result.proposed === null
            ? null
            : Buffer.from(result.proposed);
      entries.push({
        key: portableTargetKey(target),
        target,
        owner,
        logicalPath,
        role: remoteFile?.role ?? existing!.role,
        mediaType,
        base,
        local,
        remote: remoteBytesValue,
        result,
        proposed,
        remoteFile: remoteFile ?? null,
      });
    }
  }
  const keys = new Set<string>();
  for (const entry of entries) {
    if (keys.has(entry.key)) {
      throw new CliError("Portable conflict target-key collision detected.", {
        code: "UPDATE_TARGET_KEY_COLLISION",
        exitCode: 5,
        target: entry.target,
      });
    }
    keys.add(entry.key);
  }
  return entries.sort((left, right) => left.target.localeCompare(right.target, "en-US"));
}

function buildUpdateInternal(options: SemanticUpdateOptions): InternalUpdatePlan {
  const project = configuredProject(options);
  validateRelease(options.release, project.config.policy.maxRegistryItemBytes);
  if (options.release.registry.id !== "official") {
    throw new CliError(
      "This updater currently supports the installed official namespace only; enrolled registries require their own manifest namespace.",
      { code: "UPDATE_REGISTRY_NAMESPACE_UNSUPPORTED", exitCode: 7 },
    );
  }
  const selected = selectedItemIds(project.manifest.value, options.itemIds);
  const remoteById = new Map(options.release.items.map((item) => [item.itemId, item]));
  const remoteItems = selected.map((owner) => {
    const installed = project.manifest.value.items[owner]!;
    const remote = remoteById.get(installed.itemId);
    if (remote === undefined) {
      throw new CliError(
        `Immutable release ${options.release.release} does not contain ${installed.itemId}.`,
        { code: "REGISTRY_ITEM_MISSING", exitCode: 4 },
      );
    }
    if (remote.kind !== installed.kind) {
      throw new CliError(
        `Update changes the kind of ${installed.itemId}; a migration is required.`,
        {
          code: "UPDATE_KIND_MIGRATION_REQUIRED",
          exitCode: 7,
          target: MANIFEST_PATH,
        },
      );
    }
    if (
      remote.resolved === installed.resolved &&
      provenancePayloadDigest(remote) !== installed.payload.digest
    ) {
      throw new CliError(
        `Release ${remote.resolved} for ${installed.itemId} has different bytes than the installed immutable payload.`,
        {
          code: "REGISTRY_IMMUTABILITY_VIOLATION",
          exitCode: 5,
          target: MANIFEST_PATH,
        },
      );
    }
    if (
      canonicalJson(remote.dependencies.development) !==
      canonicalJson(installed.dependencies.development)
    ) {
      throw new CliError(
        `Update for ${installed.itemId} changes development dependencies, which requires the dedicated typed package adapter.`,
        {
          code: "UPDATE_DEVELOPMENT_DEPENDENCY_ADAPTER_REQUIRED",
          exitCode: 7,
          target: "package.json",
        },
      );
    }
    if (sha256(canonicalJson(installed.transformContext)) !== installed.transformContextDigest) {
      throw new CliError(`Recorded transform context for ${installed.itemId} is corrupt.`, {
        code: "TRANSFORM_CONTEXT_INVALID",
        exitCode: 3,
        target: MANIFEST_PATH,
      });
    }
    return remote;
  });
  const entries = buildEntries({
    root: project.root,
    config: project.config,
    manifest: project.manifest.value,
    selected,
    remoteById,
  });
  const nextManifest = structuredClone(project.manifest.value);
  for (const remote of remoteItems) {
    const owner = `official:${remote.itemId}`;
    nextManifest.items[owner] = updatedManifestItem(nextManifest.items[owner]!, remote, entries);
  }
  for (const [owner, item] of Object.entries(nextManifest.items)) {
    for (const dependency of item.registryDependencies) {
      if (nextManifest.items[dependency] === undefined) {
        throw new CliError(`${owner} requires missing registry dependency ${dependency}.`, {
          code: "REGISTRY_DEPENDENCY_MISSING",
          exitCode: 7,
          target: MANIFEST_PATH,
        });
      }
    }
  }
  refreshDependencyProvenance(nextManifest);
  const packagePlan = dependencyPlan(project.root, project.manifest.value, nextManifest);
  const packageChanged = packagePlan.after !== packagePlan.before;
  assertPackageManagerScope(project.inspection, packageChanged, options.noInstall);
  const nextManifestBytes = manifestBytes(nextManifest);
  const mutations: TransactionMutation[] = [];
  const observedTargets: Record<string, Digest | null> = {};
  for (const entry of entries) {
    observedTargets[entry.target] = digestOrNull(entry.local);
    if (
      entry.result.status !== "conflict" &&
      digestOrNull(entry.local) !== digestOrNull(entry.proposed)
    ) {
      mutations.push({
        target: entry.target,
        content: entry.proposed,
        beforeDigest: digestOrNull(entry.local),
      });
    }
    if (entry.remote !== null) {
      const remoteDigest = sha256(entry.remote);
      const target = basePath(remoteDigest);
      const existing = readProjectFile(project.root, target);
      if (existing !== null && sha256(existing) !== remoteDigest) {
        throw new CliError(`Immutable base ${target} is corrupt.`, {
          code: "BASE_DIGEST_MISMATCH",
          exitCode: 3,
          target,
        });
      }
      observedTargets[target] = digestOrNull(existing);
      if (existing === null && !mutations.some((candidate) => candidate.target === target)) {
        mutations.push(mutation(project.root, target, entry.remote));
      }
    }
  }
  if (packageChanged) {
    mutations.push(mutation(project.root, "package.json", Buffer.from(packagePlan.after)));
  }
  if (!nextManifestBytes.equals(project.manifest.bytes)) {
    mutations.push(mutation(project.root, MANIFEST_PATH, nextManifestBytes, true));
  }
  const owner = selected[0]!;
  const fileOperations = entries.map(entryOperation);
  for (const change of mutations) {
    if (fileOperations.some(({ target }) => target === change.target)) continue;
    const before = readProjectFile(project.root, change.target);
    fileOperations.push(
      metadataOperation({
        target: change.target,
        owner,
        before,
        after: change.content === null ? null : Buffer.from(change.content),
        mediaType: change.target.endsWith(".json")
          ? "application/json"
          : "application/octet-stream",
        reason:
          change.target === MANIFEST_PATH
            ? "Advance verified payload, version, Contract, dependency, base, installed, and tombstone provenance; commit manifest last."
            : change.target === "package.json"
              ? "Apply ownership-aware dependency metadata required by the immutable update payload."
              : "Store exact verified post-transform upstream bytes as an immutable future base.",
      }),
    );
  }
  const conflicts = entries.flatMap((entry) =>
    entry.result.conflicts.map((conflict) => ({
      target: entry.target,
      kind: conflictKind(conflict.reason),
      reason: `${conflict.id}: ${conflict.detail}`,
    })),
  );
  const dependencyChanges: OperationPlanDependencyChange[] = packagePlan.changes.map((change) => ({
    scope: change.scope,
    package: change.package,
    operation: change.operation,
    from: change.from,
    to: change.to,
    owners: change.owners,
  }));
  const warnings = [
    ...(options.release.registry.trust === "local-development"
      ? [
          "The target is explicit verified local-development fixture data, not a claimed published Stable release.",
        ]
      : []),
    ...(packageChanged && options.noInstall === true
      ? [
          `Dependency metadata changes are planned, but --no-install skips ${project.inspection.packageManager} and lockfile mutation.`,
        ]
      : []),
    "Upstream logical-path moves are not inferred in this version; a changed logical path is conservatively represented as delete plus add.",
  ];
  const validators = semanticTransactionValidators({
    root: project.root,
    files: entries.map(({ target, mediaType, role }) => ({ target, mediaType, role })),
    items: remoteItems.map((item) => ({
      owner: `official:${item.itemId}`,
      contractVersion: item.contractVersion,
      payloadDigest: provenancePayloadDigest(item),
      transformContextDigest: item.renderedWithTransformContextDigest,
    })),
  });
  const plan = finalizeOperationPlan({
    schemaVersion: 1,
    command: "update",
    cliVersion: CLI_VERSION,
    projectRoot: ".",
    configDigest: digest(project.config),
    manifestPreconditionDigest: digest(project.manifest.value),
    registries: [
      {
        id: options.release.registry.id,
        identityDigest: options.release.registry.identityDigest,
        release: options.release.release,
        manifestDigest: provenanceManifestDigest(options.release),
        source: options.release.registry.source,
        trust: options.release.registry.trust,
        evidenceTier: options.release.registry.evidenceTier,
      },
    ],
    items: remoteItems.map((remote) => ({
      id: `official:${remote.itemId}`,
      direct: project.manifest.value.items[`official:${remote.itemId}`]!.direct,
      requested: project.manifest.value.items[`official:${remote.itemId}`]!.requested,
      fromVersion: project.manifest.value.items[`official:${remote.itemId}`]!.resolved,
      toVersion: remote.resolved,
      mode: "source" as const,
    })),
    fileOperations: fileOperations.sort((left, right) =>
      left.target.localeCompare(right.target, "en-US"),
    ),
    dependencyChanges,
    structuredPatches: dependencyChanges.map((change) => ({
      id: dependencyPatchId(change.package),
      adapter: "package-dependency" as const,
      semanticKey: `dependencies.${change.package}`,
      target: "package.json",
      owner: change.owners[0] ?? owner,
      operation: change.operation,
    })),
    migrations: remoteItems.flatMap((remote) =>
      remote.lastMigration === null
        ? []
        : [
            {
              id: remote.lastMigration,
              adapter: "manual-checklist" as const,
              phase: "remote" as const,
            },
          ],
    ),
    contractChanges: remoteItems
      .filter(
        (remote) =>
          project.manifest.value.items[`official:${remote.itemId}`]!.contractVersion !==
          remote.contractVersion,
      )
      .map((remote) => ({
        item: `official:${remote.itemId}`,
        from: project.manifest.value.items[`official:${remote.itemId}`]!.contractVersion,
        to: remote.contractVersion,
      })),
    warnings,
    consentRequirements: [
      {
        id: "semantic-update",
        flag: "--yes",
        reason: "Commit a reviewed deterministic B/L/R update and advance provenance.",
      },
    ],
    conflicts,
    estimatedBytes: {
      download: remoteItems.reduce(
        (total, item) =>
          total +
          item.files.reduce((itemTotal, file) => itemTotal + remoteBytes(file).byteLength, 0),
        0,
      ),
      write: mutations.reduce(
        (total, candidate) => total + (candidate.content?.byteLength ?? 0),
        0,
      ),
    },
    validationSuite: validationSuiteForTransaction(validators),
    rollbackAvailable: true,
  });
  return {
    root: project.root,
    config: project.config,
    inspection: project.inspection,
    manifest: project.manifest.value,
    manifestBeforeBytes: project.manifest.bytes,
    nextManifest,
    nextManifestBytes,
    selectedItems: selected,
    remoteItems,
    entries,
    packagePlan,
    plan,
    mutations,
    observedTargets,
    validators,
    registryPayloads: remoteItems
      .map((item) => ({
        registry: options.release.registry.id,
        release: options.release.release,
        url: item.payloadUrl,
        digest: provenancePayloadDigest(item),
      }))
      .sort((left, right) => left.url.localeCompare(right.url, "en-US")),
  };
}

export function planSemanticUpdate(options: SemanticUpdateOptions): OperationPlan {
  return buildUpdateInternal(options).plan;
}

function semanticReleaseFromAcquisition(
  projectRoot: string,
  acquired: AcquiredNativeRegistryRelease,
): ImmutableUpdateRelease {
  if (acquired.registry.id !== "official") {
    throw new CliError(
      "Semantic Sync currently supports acquired releases in the official namespace only.",
      { code: "UPDATE_REGISTRY_NAMESPACE_UNSUPPORTED", exitCode: 7 },
    );
  }
  const root = validatedProjectRoot(projectRoot);
  const manifest = readManifest(root).value;
  const catalogById = new Map(acquired.catalog.map((item) => [item.id, item]));
  const items = acquired.items.map((item): ImmutableUpdateItem => {
    if (item.structuredPatches.length > 0 || item.migrations.length > 0) {
      throw new CliError(
        `Acquired item ${item.itemId} requires a declarative patch or migration adapter that native update routing does not yet implement.`,
        { code: "UPDATE_ACQUIRED_ADAPTER_UNSUPPORTED", exitCode: 7, target: item.itemId },
      );
    }
    const installed = manifest.items[`official:${item.itemId}`];
    const renderedWithTransformContextDigest =
      installed?.transformContextDigest ??
      sha256(canonicalJson({ itemId: item.itemId, state: "not-installed" }));
    const files = item.files.map((file): ImmutableUpdateFile => {
      if (
        file.targetRole === "contract" ||
        file.targetRole === "example" ||
        file.transformPipeline.some(({ adapter }) => adapter !== "none" && adapter !== "target-map")
      ) {
        throw new CliError(
          `Acquired file ${file.logicalPath} requires an unsupported target role or transform adapter.`,
          { code: "UPDATE_ACQUIRED_ADAPTER_UNSUPPORTED", exitCode: 7, target: file.logicalPath },
        );
      }
      return {
        logicalPath: file.logicalPath,
        role: file.targetRole,
        mediaType: file.mediaType,
        encoding: file.encoding,
        content: file.content,
        digest: file.digest,
        executable: false,
      };
    });
    const withoutDigest: Omit<ImmutableUpdateItem, "payloadDigest"> = {
      itemId: item.itemId,
      kind: item.kind,
      resolved: acquired.release,
      payloadUrl: item.payloadUrl,
      renderedWithTransformContextDigest,
      files,
      registryDependencies: item.registryDependencies,
      dependencies: item.dependencies,
      contractVersion: item.contract.version,
      lastMigration: null,
      acquiredPayloadDigest: item.payloadDigest,
    };
    return { ...withoutDigest, payloadDigest: immutableUpdateItemDigest(withoutDigest) };
  });
  const evidenceTiers = acquired.items.map(
    (item) => catalogById.get(item.itemId)?.quality.tier ?? "not-supplied",
  );
  const evidenceTier: ImmutableUpdateRegistry["evidenceTier"] = evidenceTiers.every(
    (tier) => tier === "complete",
  )
    ? "complete"
    : evidenceTiers.some((tier) => tier === "complete" || tier === "partial")
      ? "partial"
      : "not-supplied";
  const registry: ImmutableUpdateRegistry = {
    id: acquired.registry.id,
    protocol: "mergora-v1",
    origin: acquired.registry.origin,
    identityDigest: acquired.registry.identityDigest,
    source: acquired.source,
    trust: acquired.registry.trust,
    evidenceTier,
    nativeIdentity: true,
  };
  const withoutManifestDigest: Omit<ImmutableUpdateRelease, "manifestDigest"> = {
    schemaVersion: 1,
    registry,
    release: acquired.release,
    items,
    acquiredManifestDigest: acquired.manifestDigest,
  };
  return {
    ...withoutManifestDigest,
    manifestDigest: immutableUpdateReleaseDigest(withoutManifestDigest),
  };
}

export function planAcquiredSemanticUpdate(options: AcquiredSemanticUpdateOptions): OperationPlan {
  return planSemanticUpdate({
    ...options,
    release: semanticReleaseFromAcquisition(options.projectRoot, options.acquiredRelease),
  });
}

export async function applyAcquiredSemanticUpdate(
  options: AcquiredSemanticUpdateOptions,
  expectedPlanDigest?: string,
): Promise<SemanticUpdateResult> {
  return applySemanticUpdate(
    {
      ...options,
      release: semanticReleaseFromAcquisition(options.projectRoot, options.acquiredRelease),
    },
    expectedPlanDigest,
  );
}

type ConflictResolution = "unresolved" | "take-local" | "take-upstream" | "manual";

interface ConflictStateEntry {
  readonly key: string;
  readonly target: string;
  readonly owner: string;
  readonly logicalPath: string;
  readonly role: ManifestFile["role"];
  readonly mediaType: string;
  readonly originalStatus: FileMergeResult["status"];
  readonly baseDigest: Digest | null;
  readonly localDigest: Digest | null;
  readonly remoteDigest: Digest | null;
  readonly originalProposedDigest: Digest | null;
  readonly basePresent: boolean;
  readonly localPresent: boolean;
  readonly remotePresent: boolean;
  readonly originalProposedPresent: boolean;
  readonly conflictMetadataDigest: Digest | null;
  readonly conflicts: readonly SemanticConflict[];
  readonly appliedRemoteKeys: readonly string[];
  readonly preservedLocalKeys: readonly string[];
  readonly resolution: ConflictResolution;
  readonly currentProposedDigest: Digest | null;
  readonly currentProposedPresent: boolean;
}

interface ConflictState {
  readonly schemaVersion: 1;
  readonly artifactKind: "mergora-semantic-update-conflict";
  readonly transactionId: string;
  readonly state: "conflicted" | "resolved";
  readonly originalPlanDigest: Digest;
  readonly configPreconditionDigest: Digest;
  readonly manifestPreconditionDigest: Digest;
  readonly nextManifestDigest: Digest;
  readonly package: {
    readonly localDigest: Digest;
    readonly proposedDigest: Digest;
    readonly changed: boolean;
    readonly packageManager: PackageManager;
    readonly noInstall: boolean;
  };
  readonly registryPayloads: readonly TransactionRegistryPayload[];
  readonly selectedItems: readonly string[];
  readonly entries: readonly ConflictStateEntry[];
  readonly committedTransactionId?: string | null | undefined;
}

function transactionRoot(id: string): string {
  return `.mergora/transactions/${id}`;
}

function snapshotPath(id: string, key: string, view: "base" | "local" | "remote" | "proposed") {
  return `${transactionRoot(id)}/snapshots/${key}/${view}`;
}

function conflictPath(
  id: string,
  key: string,
  view: "base" | "local" | "remote" | "proposed" | "conflict.json",
) {
  return `${transactionRoot(id)}/conflicts/${key}/${view}`;
}

function createConflictTransactionId(): string {
  const iso = new Date().toISOString();
  const sortable = `${iso.slice(0, 4)}${iso.slice(5, 7)}${iso.slice(8, 10)}T${iso.slice(11, 13)}${iso.slice(14, 16)}${iso.slice(17, 23)}Z`;
  return `${sortable}-${randomBytes(16).toString("hex")}`;
}

function ensureSafeDirectory(root: string, relativePath: string): void {
  const segments = assertPortableRelativePath(relativePath, "Conflict directory");
  let current = root;
  for (const segment of segments) {
    current = resolve(current, segment);
    try {
      const metadata = lstatSync(current);
      if (metadata.isSymbolicLink() || !metadata.isDirectory()) {
        throw new CliError(`Conflict path ${relativePath} is unsafe.`, {
          code: "CONFLICT_PATH_UNSAFE",
          exitCode: 5,
          target: relativePath,
        });
      }
    } catch (error) {
      if (error instanceof CliError) throw error;
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
      mkdirSync(current, { mode: 0o700 });
    }
  }
}

function writeExclusive(root: string, relativePath: string, bytes: Uint8Array): void {
  assertPortableRelativePath(relativePath, "Conflict artifact");
  ensureSafeDirectory(root, dirname(relativePath).replaceAll("\\", "/"));
  assertNoSymlinkAncestors(root, relativePath);
  const path = resolveInside(root, relativePath, "Conflict artifact");
  let descriptor: number | null = null;
  try {
    descriptor = openSync(path, constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL, 0o600);
    writeFileSync(descriptor, bytes);
    fsyncSync(descriptor);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "EEXIST") {
      throw new CliError(`Conflict artifact ${relativePath} already exists.`, {
        code: "CONFLICT_TRANSACTION_EXISTS",
        exitCode: 8,
        target: relativePath,
      });
    }
    throw error;
  } finally {
    if (descriptor !== null) closeSync(descriptor);
  }
}

function writeAtomic(root: string, relativePath: string, bytes: Uint8Array): void {
  assertPortableRelativePath(relativePath, "Conflict artifact");
  assertNoSymlinkAncestors(root, relativePath);
  const path = resolveInside(root, relativePath, "Conflict artifact");
  const metadata = lstatSync(path);
  if (metadata.isSymbolicLink() || !metadata.isFile()) {
    throw new CliError(`Conflict artifact ${relativePath} is unsafe.`, {
      code: "CONFLICT_PATH_UNSAFE",
      exitCode: 5,
      target: relativePath,
    });
  }
  const temporaryRelative = `${relativePath}.mergora-${randomBytes(16).toString("hex")}.tmp`;
  writeExclusive(root, temporaryRelative, bytes);
  renameSync(resolveInside(root, temporaryRelative, "Conflict temporary artifact"), path);
}

function fileBytesForBundle(value: Buffer | null): Buffer {
  return value ?? Buffer.alloc(0);
}

function assertInternalPreconditions(internal: InternalUpdatePlan): void {
  const config = readMergoraConfig(internal.root);
  if (config === null || digest(config) !== internal.plan.configDigest) {
    throw new CliError("mergora.json changed after update planning.", {
      code: "PLAN_CONFIG_STALE",
      exitCode: 8,
      target: "mergora.json",
    });
  }
  const manifest = readManifest(internal.root);
  if (digest(manifest.value) !== internal.plan.manifestPreconditionDigest) {
    throw new CliError("The provenance manifest changed after update planning.", {
      code: "PLAN_MANIFEST_STALE",
      exitCode: 8,
      target: MANIFEST_PATH,
    });
  }
  for (const [target, expected] of Object.entries(internal.observedTargets)) {
    if (digestOrNull(readProjectFile(internal.root, target)) !== expected) {
      throw new CliError(`Update target ${target} changed after planning.`, {
        code: "PLAN_TARGET_STALE",
        exitCode: 8,
        target,
      });
    }
  }
  const packageDigest = sha256(readFileSync(resolve(internal.root, "package.json")));
  if (packageDigest !== sha256(internal.packagePlan.before)) {
    throw new CliError("package.json changed after update planning.", {
      code: "PLAN_TARGET_STALE",
      exitCode: 8,
      target: "package.json",
    });
  }
}

function conflictReadme(id: string, entries: readonly UpdateEntry[]): Buffer {
  const targets = entries
    .filter(({ result }) => result.status === "conflict")
    .map(({ target }) => `- \`${target}\``)
    .join("\n");
  return Buffer.from(
    [
      "# Mergora Semantic Sync conflict",
      "",
      "The live project, provenance manifest, package metadata, and base store are unchanged.",
      "These files may contain private project source. They are local-only and must not be uploaded without review.",
      "",
      "Conflicted targets:",
      "",
      targets,
      "",
      "Inspect unresolved units:",
      "",
      `    mergora resolve ${id} --list`,
      "",
      "Choose a path-specific resolution with `--take-local`, `--take-upstream`, or edit that target's `proposed` file and use `--resolved`. Then run `--apply`.",
      "There is intentionally no force-overwrite or operation-wide take-upstream choice.",
      "",
    ].join("\n"),
  );
}

async function stageConflict(
  internal: InternalUpdatePlan,
  requestedId: string | undefined,
  noInstall: boolean,
): Promise<SemanticUpdateConflictResult> {
  assertInternalPreconditions(internal);
  const id = requestedId ?? createConflictTransactionId();
  if (!TRANSACTION_ID.test(id)) {
    throw new CliError("Injected conflict transaction ID is invalid.", {
      code: "CONFLICT_TRANSACTION_ID_INVALID",
      exitCode: 2,
    });
  }
  const rootPath = transactionRoot(id);
  ensureSafeDirectory(internal.root, ".mergora/transactions");
  const resolvedRoot = resolveInside(internal.root, rootPath, "Conflict transaction root");
  if (existsSync(resolvedRoot)) {
    throw new CliError(`Conflict transaction ${id} already exists.`, {
      code: "CONFLICT_TRANSACTION_EXISTS",
      exitCode: 8,
      target: rootPath,
    });
  }
  mkdirSync(resolvedRoot, { mode: 0o700 });
  writeExclusive(internal.root, `${rootPath}/plan.json`, Buffer.from(canonicalJson(internal.plan)));
  writeExclusive(internal.root, `${rootPath}/next-manifest.json`, internal.nextManifestBytes);
  writeExclusive(
    internal.root,
    `${rootPath}/package-local`,
    Buffer.from(internal.packagePlan.before),
  );
  writeExclusive(
    internal.root,
    `${rootPath}/package-proposed`,
    Buffer.from(internal.packagePlan.after),
  );
  writeExclusive(internal.root, `${rootPath}/README.md`, conflictReadme(id, internal.entries));
  const stateEntries: ConflictStateEntry[] = [];
  for (const entry of internal.entries) {
    for (const [view, bytes] of [
      ["base", entry.base],
      ["local", entry.local],
      ["remote", entry.remote],
      ["proposed", entry.proposed],
    ] as const) {
      writeExclusive(internal.root, snapshotPath(id, entry.key, view), fileBytesForBundle(bytes));
    }
    let conflictMetadataDigest: Digest | null = null;
    if (entry.result.status === "conflict") {
      const bundle = await createConflictBundle({
        target: entry.target,
        owner: entry.owner,
        mediaType: entry.mediaType,
        base: entry.base,
        local: entry.local,
        remote: entry.remote,
        proposed: entry.proposed,
        conflicts: entry.result.conflicts,
      });
      for (const [view, bytes] of [
        ["base", bundle.files.base],
        ["local", bundle.files.local],
        ["remote", bundle.files.remote],
        ["proposed", bundle.files.proposed],
      ] as const) {
        writeExclusive(
          internal.root,
          conflictPath(id, entry.key, view),
          fileBytesForBundle(bytes === null ? null : Buffer.from(bytes)),
        );
      }
      const metadata = {
        schemaVersion: 1,
        ...bundle.metadata,
        presence: {
          base: entry.base !== null,
          local: entry.local !== null,
          remote: entry.remote !== null,
          proposed: entry.proposed !== null,
        },
        summaries: {
          local: entry.result.preservedLocalKeys,
          upstream: entry.result.appliedRemoteKeys,
        },
      };
      const metadataBytes = Buffer.from(`${JSON.stringify(metadata, null, 2)}\n`);
      conflictMetadataDigest = sha256(metadataBytes);
      writeExclusive(internal.root, conflictPath(id, entry.key, "conflict.json"), metadataBytes);
    }
    stateEntries.push({
      key: entry.key,
      target: entry.target,
      owner: entry.owner,
      logicalPath: entry.logicalPath,
      role: entry.role,
      mediaType: entry.mediaType,
      originalStatus: entry.result.status,
      baseDigest: digestOrNull(entry.base),
      localDigest: digestOrNull(entry.local),
      remoteDigest: digestOrNull(entry.remote),
      originalProposedDigest: digestOrNull(entry.proposed),
      basePresent: entry.base !== null,
      localPresent: entry.local !== null,
      remotePresent: entry.remote !== null,
      originalProposedPresent: entry.proposed !== null,
      conflictMetadataDigest,
      conflicts: entry.result.conflicts,
      appliedRemoteKeys: entry.result.appliedRemoteKeys,
      preservedLocalKeys: entry.result.preservedLocalKeys,
      resolution: entry.result.status === "conflict" ? "unresolved" : "manual",
      currentProposedDigest: digestOrNull(entry.proposed),
      currentProposedPresent: entry.proposed !== null,
    });
  }
  const state: ConflictState = {
    schemaVersion: 1,
    artifactKind: "mergora-semantic-update-conflict",
    transactionId: id,
    state: "conflicted",
    originalPlanDigest: internal.plan.planDigest,
    configPreconditionDigest: internal.plan.configDigest,
    manifestPreconditionDigest: internal.plan.manifestPreconditionDigest!,
    nextManifestDigest: sha256(internal.nextManifestBytes),
    package: {
      localDigest: sha256(internal.packagePlan.before),
      proposedDigest: sha256(internal.packagePlan.after),
      changed: internal.packagePlan.before !== internal.packagePlan.after,
      packageManager: internal.inspection.packageManager,
      noInstall,
    },
    registryPayloads: internal.registryPayloads,
    selectedItems: internal.selectedItems,
    entries: stateEntries,
    committedTransactionId: null,
  };
  const stateBytes = Buffer.from(`${JSON.stringify(state, null, 2)}\n`);
  writeExclusive(internal.root, `${rootPath}/${CONFLICT_STATE_PATH}`, stateBytes);
  writeExclusive(
    internal.root,
    `${rootPath}/${CONFLICT_STATE_DIGEST_PATH}`,
    Buffer.from(`${sha256(stateBytes)}\n`),
  );
  assertInternalPreconditions(internal);
  return {
    mode: "semantic-update",
    status: "conflicted",
    items: internal.selectedItems,
    release: internal.plan.registries[0]!.release,
    planDigest: internal.plan.planDigest,
    conflictTransactionId: id,
    conflictRoot: rootPath,
    conflicts: internal.plan.conflicts,
    liveProjectChanged: false,
  };
}

export async function applySemanticUpdate(
  options: SemanticUpdateOptions,
  expectedPlanDigest?: string,
): Promise<SemanticUpdateResult> {
  const internal = buildUpdateInternal(options);
  if (expectedPlanDigest !== undefined && internal.plan.planDigest !== expectedPlanDigest) {
    throw new CliError("Semantic Sync plan changed before apply; review a fresh plan.", {
      code: "PLAN_PRECONDITION_STALE",
      exitCode: 8,
    });
  }
  if (internal.plan.conflicts.length > 0) {
    return stageConflict(internal, options.conflictTransactionId, options.noInstall === true);
  }
  const packageRequired = internal.packagePlan.before !== internal.packagePlan.after;
  const transaction = executeTransaction({
    root: internal.root,
    plan: internal.plan,
    mutations: internal.mutations,
    observedTargets: internal.observedTargets,
    registryPayloads: internal.registryPayloads,
    packageManager: internal.inspection.packageManager,
    packageManagerRequired: packageRequired,
    noInstall: options.noInstall,
    offline: options.offline,
    packageManagerRunner: options.packageManagerRunner,
    faultInjector: options.faultInjector,
    commandArguments: options.commandArguments,
    validators: internal.validators,
  });
  return {
    mode: "semantic-update",
    status: "committed",
    items: internal.selectedItems,
    release: options.release.release,
    planDigest: internal.plan.planDigest,
    transaction,
  };
}

export type SemanticResolveChoice = "take-local" | "take-upstream" | "resolved" | "reset";

export interface SemanticResolveChoiceOptions {
  readonly projectRoot: string;
  readonly transactionId: string;
  readonly choice: SemanticResolveChoice;
  readonly targets: readonly string[];
}

export interface SemanticResolveChoicePlan {
  readonly schemaVersion: 1;
  readonly command: "resolve";
  readonly scope: "local-conflict-bundle";
  readonly transactionId: string;
  readonly choice: SemanticResolveChoice;
  readonly statePreconditionDigest: Digest;
  readonly manifestPreconditionDigest: Digest;
  readonly changes: readonly {
    readonly target: string;
    readonly from: Digest | null;
    readonly to: Digest | null;
    readonly present: boolean;
    readonly resolution: ConflictResolution;
  }[];
  readonly limitations: readonly string[];
  readonly planDigest: Digest;
}

export interface SemanticResolutionList {
  readonly transactionId: string;
  readonly state: "conflicted" | "resolved";
  readonly unresolved: readonly {
    readonly target: string;
    readonly semanticUnitIds: readonly string[];
    readonly reasons: readonly string[];
    readonly safeChoices: readonly ["take-local", "take-upstream", "manual"];
  }[];
  readonly resolved: readonly {
    readonly target: string;
    readonly resolution: Exclude<ConflictResolution, "unresolved">;
    readonly proposedDigest: Digest | null;
  }[];
  readonly limitations: readonly string[];
}

interface LoadedConflict {
  readonly root: string;
  readonly state: ConflictState;
  readonly stateBytes: Buffer;
  readonly stateDigest: Digest;
  readonly plan: OperationPlan;
  readonly nextManifest: ProvenanceManifest;
  readonly nextManifestBytes: Buffer;
  readonly packageLocal: Buffer;
  readonly packageProposed: Buffer;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && !Array.isArray(value) && typeof value === "object";
}

function requiredConflictFile(root: string, relativePath: string): Buffer {
  const bytes = readProjectFile(root, relativePath);
  if (bytes === null) {
    throw new CliError(`Conflict artifact ${relativePath} is missing.`, {
      code: "CONFLICT_ARTIFACT_MISSING",
      exitCode: 8,
      target: relativePath,
    });
  }
  return bytes;
}

function assertPresenceDigest(
  present: unknown,
  digestValue: unknown,
  label: string,
): asserts digestValue is Digest | null {
  if (
    typeof present !== "boolean" ||
    !(
      (present && typeof digestValue === "string" && DIGEST.test(digestValue)) ||
      (!present && digestValue === null)
    )
  ) {
    throw new CliError(`${label} presence/digest metadata is invalid.`, {
      code: "CONFLICT_STATE_INVALID",
      exitCode: 8,
    });
  }
}

function validateConflictState(value: unknown, id: string): ConflictState {
  if (!isRecord(value)) {
    throw new CliError(`Conflict transaction ${id} state is invalid.`, {
      code: "CONFLICT_STATE_INVALID",
      exitCode: 8,
    });
  }
  const packageState = value.package;
  if (
    value.schemaVersion !== 1 ||
    value.artifactKind !== "mergora-semantic-update-conflict" ||
    value.transactionId !== id ||
    !["conflicted", "resolved"].includes(String(value.state)) ||
    typeof value.originalPlanDigest !== "string" ||
    !DIGEST.test(value.originalPlanDigest) ||
    typeof value.configPreconditionDigest !== "string" ||
    !DIGEST.test(value.configPreconditionDigest) ||
    typeof value.manifestPreconditionDigest !== "string" ||
    !DIGEST.test(value.manifestPreconditionDigest) ||
    typeof value.nextManifestDigest !== "string" ||
    !DIGEST.test(value.nextManifestDigest) ||
    !isRecord(packageState) ||
    typeof packageState.localDigest !== "string" ||
    !DIGEST.test(packageState.localDigest) ||
    typeof packageState.proposedDigest !== "string" ||
    !DIGEST.test(packageState.proposedDigest) ||
    typeof packageState.changed !== "boolean" ||
    !["npm", "pnpm", "yarn", "bun"].includes(String(packageState.packageManager)) ||
    typeof packageState.noInstall !== "boolean" ||
    !Array.isArray(value.registryPayloads) ||
    !Array.isArray(value.selectedItems) ||
    value.selectedItems.some((entry) => typeof entry !== "string") ||
    !Array.isArray(value.entries) ||
    value.entries.length === 0 ||
    value.entries.length > 8192
  ) {
    throw new CliError(`Conflict transaction ${id} state is invalid.`, {
      code: "CONFLICT_STATE_INVALID",
      exitCode: 8,
    });
  }
  const targets = new Set<string>();
  const keys = new Set<string>();
  for (const rawEntry of value.entries) {
    if (!isRecord(rawEntry)) {
      throw new CliError(`Conflict transaction ${id} has an invalid entry.`, {
        code: "CONFLICT_STATE_INVALID",
        exitCode: 8,
      });
    }
    const target = rawEntry.target;
    const key = rawEntry.key;
    if (
      typeof target !== "string" ||
      typeof key !== "string" ||
      key !== portableTargetKey(target) ||
      typeof rawEntry.owner !== "string" ||
      typeof rawEntry.logicalPath !== "string" ||
      typeof rawEntry.mediaType !== "string" ||
      typeof rawEntry.originalStatus !== "string" ||
      !Array.isArray(rawEntry.conflicts) ||
      !Array.isArray(rawEntry.appliedRemoteKeys) ||
      !Array.isArray(rawEntry.preservedLocalKeys) ||
      !["unresolved", "take-local", "take-upstream", "manual"].includes(
        String(rawEntry.resolution),
      ) ||
      targets.has(target.normalize("NFC").toLocaleLowerCase("en-US")) ||
      keys.has(key)
    ) {
      throw new CliError(`Conflict transaction ${id} has an invalid entry.`, {
        code: "CONFLICT_STATE_INVALID",
        exitCode: 8,
      });
    }
    assertPortableRelativePath(target, "Conflict target");
    assertPortableRelativePath(rawEntry.logicalPath, "Conflict logical path");
    assertPresenceDigest(rawEntry.basePresent, rawEntry.baseDigest, "Base snapshot");
    assertPresenceDigest(rawEntry.localPresent, rawEntry.localDigest, "Local snapshot");
    assertPresenceDigest(rawEntry.remotePresent, rawEntry.remoteDigest, "Remote snapshot");
    assertPresenceDigest(
      rawEntry.originalProposedPresent,
      rawEntry.originalProposedDigest,
      "Original proposal",
    );
    assertPresenceDigest(
      rawEntry.currentProposedPresent,
      rawEntry.currentProposedDigest,
      "Current proposal",
    );
    if (
      rawEntry.originalStatus === "conflict" &&
      (typeof rawEntry.conflictMetadataDigest !== "string" ||
        !DIGEST.test(rawEntry.conflictMetadataDigest))
    ) {
      throw new CliError(`Conflict transaction ${id} lacks conflict metadata.`, {
        code: "CONFLICT_STATE_INVALID",
        exitCode: 8,
      });
    }
    targets.add(target.normalize("NFC").toLocaleLowerCase("en-US"));
    keys.add(key);
  }
  return value as unknown as ConflictState;
}

function assertPlanIntegrity(plan: OperationPlan, expected: Digest): void {
  const { planDigest, ...semantic } = plan;
  if (planDigest !== expected || digest(semantic) !== planDigest) {
    throw new CliError("Conflict transaction plan digest is invalid.", {
      code: "CONFLICT_PLAN_INVALID",
      exitCode: 8,
    });
  }
}

function verifiedSnapshot(
  loaded: Pick<LoadedConflict, "root" | "state">,
  entry: ConflictStateEntry,
  view: "base" | "local" | "remote" | "proposed",
): Buffer | null {
  const presentKey = `${view === "proposed" ? "originalProposed" : view}Present` as const;
  const digestKey = `${view === "proposed" ? "originalProposed" : view}Digest` as const;
  const bytes = requiredConflictFile(
    loaded.root,
    snapshotPath(loaded.state.transactionId, entry.key, view),
  );
  if (!entry[presentKey]) {
    if (bytes.byteLength !== 0 || entry[digestKey] !== null) {
      throw new CliError(`Missing ${view} snapshot representation is corrupt.`, {
        code: "CONFLICT_ARTIFACT_DIGEST_MISMATCH",
        exitCode: 8,
        target: snapshotPath(loaded.state.transactionId, entry.key, view),
      });
    }
    return null;
  }
  if (sha256(bytes) !== entry[digestKey]) {
    throw new CliError(`${view} snapshot failed digest verification.`, {
      code: "CONFLICT_ARTIFACT_DIGEST_MISMATCH",
      exitCode: 8,
      target: snapshotPath(loaded.state.transactionId, entry.key, view),
    });
  }
  return bytes;
}

function currentConflictProposal(
  loaded: Pick<LoadedConflict, "root" | "state">,
  entry: ConflictStateEntry,
  allowUnrecordedManualEdit: boolean,
): Buffer | null {
  const path = conflictPath(loaded.state.transactionId, entry.key, "proposed");
  const bytes = requiredConflictFile(loaded.root, path);
  if (allowUnrecordedManualEdit) return bytes;
  if (!entry.currentProposedPresent) {
    if (bytes.byteLength !== 0 || entry.currentProposedDigest !== null) {
      throw new CliError(`Conflict proposal for ${entry.target} changed without --resolved.`, {
        code: "CONFLICT_PROPOSAL_STALE",
        exitCode: 8,
        target: path,
      });
    }
    return null;
  }
  if (sha256(bytes) !== entry.currentProposedDigest) {
    throw new CliError(`Conflict proposal for ${entry.target} changed without --resolved.`, {
      code: "CONFLICT_PROPOSAL_STALE",
      exitCode: 8,
      target: path,
    });
  }
  return bytes;
}

function readConflict(projectRoot: string, id: string): LoadedConflict {
  const root = validatedProjectRoot(projectRoot);
  if (!TRANSACTION_ID.test(id)) {
    throw new CliError("Conflict transaction ID is invalid.", {
      code: "CONFLICT_TRANSACTION_ID_INVALID",
      exitCode: 2,
    });
  }
  const statePath = `${transactionRoot(id)}/${CONFLICT_STATE_PATH}`;
  const stateBytes = requiredConflictFile(root, statePath);
  const expectedStateDigest = requiredConflictFile(
    root,
    `${transactionRoot(id)}/${CONFLICT_STATE_DIGEST_PATH}`,
  )
    .toString("utf8")
    .trim();
  if (!DIGEST.test(expectedStateDigest) || sha256(stateBytes) !== expectedStateDigest) {
    throw new CliError(`Conflict transaction ${id} state failed digest verification.`, {
      code: "CONFLICT_STATE_DIGEST_MISMATCH",
      exitCode: 8,
      target: statePath,
    });
  }
  let stateValue: unknown;
  try {
    stateValue = JSON.parse(stateBytes.toString("utf8")) as unknown;
  } catch {
    stateValue = null;
  }
  const state = validateConflictState(stateValue, id);
  const planBytes = requiredConflictFile(root, `${transactionRoot(id)}/plan.json`);
  let plan: OperationPlan;
  try {
    plan = JSON.parse(planBytes.toString("utf8")) as OperationPlan;
  } catch {
    throw new CliError(`Conflict transaction ${id} plan is invalid JSON.`, {
      code: "CONFLICT_PLAN_INVALID",
      exitCode: 8,
    });
  }
  assertPlanIntegrity(plan, state.originalPlanDigest);
  const nextManifestBytes = requiredConflictFile(root, `${transactionRoot(id)}/next-manifest.json`);
  if (sha256(nextManifestBytes) !== state.nextManifestDigest) {
    throw new CliError("Conflict next-manifest snapshot failed digest verification.", {
      code: "CONFLICT_ARTIFACT_DIGEST_MISMATCH",
      exitCode: 8,
    });
  }
  let nextManifest: ProvenanceManifest;
  try {
    nextManifest = JSON.parse(nextManifestBytes.toString("utf8")) as ProvenanceManifest;
    canonicalJson(nextManifest);
  } catch {
    throw new CliError("Conflict next-manifest snapshot is invalid.", {
      code: "CONFLICT_STATE_INVALID",
      exitCode: 8,
    });
  }
  const packageLocal = requiredConflictFile(root, `${transactionRoot(id)}/package-local`);
  const packageProposed = requiredConflictFile(root, `${transactionRoot(id)}/package-proposed`);
  if (
    sha256(packageLocal) !== state.package.localDigest ||
    sha256(packageProposed) !== state.package.proposedDigest
  ) {
    throw new CliError("Conflict package snapshot failed digest verification.", {
      code: "CONFLICT_ARTIFACT_DIGEST_MISMATCH",
      exitCode: 8,
    });
  }
  const loaded = {
    root,
    state,
    stateBytes,
    stateDigest: expectedStateDigest as Digest,
    plan,
    nextManifest,
    nextManifestBytes,
    packageLocal,
    packageProposed,
  };
  for (const entry of state.entries) {
    for (const view of ["base", "local", "remote", "proposed"] as const) {
      verifiedSnapshot(loaded, entry, view);
    }
    if (entry.originalStatus === "conflict") {
      const metadataPath = conflictPath(id, entry.key, "conflict.json");
      if (sha256(requiredConflictFile(root, metadataPath)) !== entry.conflictMetadataDigest) {
        throw new CliError(`Conflict metadata for ${entry.target} failed digest verification.`, {
          code: "CONFLICT_ARTIFACT_DIGEST_MISMATCH",
          exitCode: 8,
          target: metadataPath,
        });
      }
    }
  }
  return loaded;
}

function assertConflictLivePreconditions(loaded: LoadedConflict): void {
  if (loaded.state.state !== "conflicted") {
    throw new CliError(`Conflict transaction ${loaded.state.transactionId} is already resolved.`, {
      code: "CONFLICT_ALREADY_RESOLVED",
      exitCode: 8,
    });
  }
  const config = readMergoraConfig(loaded.root);
  if (config === null || digest(config) !== loaded.state.configPreconditionDigest) {
    throw new CliError("mergora.json changed after conflict creation.", {
      code: "CONFLICT_LIVE_STALE",
      exitCode: 8,
      target: "mergora.json",
    });
  }
  const manifest = readManifest(loaded.root);
  if (digest(manifest.value) !== loaded.state.manifestPreconditionDigest) {
    throw new CliError("The provenance manifest changed after conflict creation.", {
      code: "CONFLICT_LIVE_STALE",
      exitCode: 8,
      target: MANIFEST_PATH,
    });
  }
  if (
    sha256(readFileSync(resolve(loaded.root, "package.json"))) !== loaded.state.package.localDigest
  ) {
    throw new CliError("package.json changed after conflict creation.", {
      code: "CONFLICT_LIVE_STALE",
      exitCode: 8,
      target: "package.json",
    });
  }
  for (const entry of loaded.state.entries) {
    if (digestOrNull(readProjectFile(loaded.root, entry.target)) !== entry.localDigest) {
      throw new CliError(`Live target ${entry.target} changed after conflict creation.`, {
        code: "CONFLICT_LIVE_STALE",
        exitCode: 8,
        target: entry.target,
      });
    }
    if (entry.baseDigest !== null) {
      const stored = readProjectFile(loaded.root, basePath(entry.baseDigest));
      if (stored === null || sha256(stored) !== entry.baseDigest) {
        throw new CliError(`Immutable base for ${entry.target} changed after conflict creation.`, {
          code: "CONFLICT_BASE_STALE",
          exitCode: 8,
          target: basePath(entry.baseDigest),
        });
      }
    }
  }
}

function resolutionLimitations(): readonly string[] {
  return [
    "Choices are target-specific; take-upstream has no operation-wide wildcard.",
    "Registered transaction validators re-run declared media parsing, local import closure, self-contained TypeScript checks, token integrity, Contract provenance, and project configuration against both the staged overlay and post-commit view; this does not claim a full consumer-project compiler run.",
    "There is no force overwrite. Any changed live, manifest, package, base, state, or snapshot digest requires a fresh update plan.",
  ];
}

export function listSemanticResolutions(options: {
  readonly projectRoot: string;
  readonly transactionId: string;
}): SemanticResolutionList {
  const loaded = readConflict(options.projectRoot, options.transactionId);
  if (loaded.state.state === "conflicted") assertConflictLivePreconditions(loaded);
  return {
    transactionId: loaded.state.transactionId,
    state: loaded.state.state,
    unresolved: loaded.state.entries
      .filter(
        ({ originalStatus, resolution }) =>
          originalStatus === "conflict" && resolution === "unresolved",
      )
      .map((entry) => ({
        target: entry.target,
        semanticUnitIds: [...new Set(entry.conflicts.map(({ id }) => id))].sort((left, right) =>
          left.localeCompare(right, "en-US"),
        ),
        reasons: entry.conflicts.map(({ detail }) => detail),
        safeChoices: ["take-local", "take-upstream", "manual"] as const,
      })),
    resolved: loaded.state.entries
      .filter(
        (
          entry,
        ): entry is ConflictStateEntry & {
          readonly resolution: Exclude<ConflictResolution, "unresolved">;
        } => entry.originalStatus === "conflict" && entry.resolution !== "unresolved",
      )
      .map((entry) => ({
        target: entry.target,
        resolution: entry.resolution,
        proposedDigest: entry.currentProposedDigest,
      })),
    limitations: resolutionLimitations(),
  };
}

function validateManualResolution(
  loaded: LoadedConflict,
  entry: ConflictStateEntry,
  bytes: Buffer,
): void {
  let text: string | null = null;
  if (
    entry.mediaType.startsWith("text/") ||
    entry.mediaType === "application/json" ||
    entry.mediaType === "application/jsonc"
  ) {
    try {
      text = new TextDecoder("utf-8", { fatal: true, ignoreBOM: true }).decode(bytes);
    } catch {
      throw new CliError(`Manual proposal for ${entry.target} is not valid UTF-8.`, {
        code: "CONFLICT_RESOLUTION_PARSE_FAILED",
        exitCode: 6,
        target: entry.target,
      });
    }
    if (CONFLICT_MARKER.test(text)) {
      throw new CliError(`Manual proposal for ${entry.target} still contains conflict markers.`, {
        code: "CONFLICT_MARKERS_REMAIN",
        exitCode: 6,
        target: entry.target,
      });
    }
  }
  if (entry.mediaType === "application/json" || entry.mediaType === "text/json") {
    try {
      JSON.parse(text ?? bytes.toString("utf8"));
    } catch {
      throw new CliError(`Manual proposal for ${entry.target} is not valid strict JSON.`, {
        code: "CONFLICT_RESOLUTION_PARSE_FAILED",
        exitCode: 6,
        target: entry.target,
      });
    }
  }
  const adapterProbe =
    text === null || entry.mediaType === "application/json" || entry.mediaType === "text/json"
      ? null
      : entry.mediaType === "text/css"
        ? {
            base: Buffer.from(":root { --mergora-validation-base: 0; }\n"),
            remote: Buffer.concat([bytes, Buffer.from("\n/* mergora-validation-remote */\n")]),
          }
        : {
            base: Buffer.from("/* mergora-validation-base */\n"),
            remote: Buffer.concat([bytes, Buffer.from("\n/* mergora-validation-remote */\n")]),
          };
  const diagnostics = mergeFileThreeWay({
    mediaType: mergeAdapterMediaType(entry.mediaType),
    base: adapterProbe?.base ?? verifiedSnapshot(loaded, entry, "base"),
    local: bytes,
    remote: adapterProbe?.remote ?? verifiedSnapshot(loaded, entry, "remote"),
  });
  const parseFailure = diagnostics.conflicts.find(({ reason }) =>
    ["parse-error", "invalid-json", "utf8-decode", "duplicate-key", "invalid-keep-region"].includes(
      reason,
    ),
  );
  if (parseFailure !== undefined) {
    throw new CliError(
      `Manual proposal for ${entry.target} failed its declared media adapter: ${parseFailure.detail}`,
      {
        code: "CONFLICT_RESOLUTION_PARSE_FAILED",
        exitCode: 6,
        target: entry.target,
      },
    );
  }
}

interface InternalResolveChoicePlan {
  readonly loaded: LoadedConflict;
  readonly plan: SemanticResolveChoicePlan;
  readonly proposals: ReadonlyMap<
    string,
    {
      readonly bytes: Buffer | null;
      readonly resolution: ConflictResolution;
    }
  >;
}

function buildResolveChoicePlan(options: SemanticResolveChoiceOptions): InternalResolveChoicePlan {
  const loaded = readConflict(options.projectRoot, options.transactionId);
  assertConflictLivePreconditions(loaded);
  if (options.targets.length === 0) {
    throw new CliError("Resolve choice requires at least one exact target.", {
      code: "RESOLVE_TARGET_REQUIRED",
      exitCode: 2,
    });
  }
  const targets = [...new Set(options.targets)].sort((left, right) =>
    left.localeCompare(right, "en-US"),
  );
  if (targets.length !== options.targets.length) {
    throw new CliError("Resolve choice repeats a target.", {
      code: "RESOLVE_TARGET_DUPLICATE",
      exitCode: 2,
    });
  }
  const entryByTarget = new Map(loaded.state.entries.map((entry) => [entry.target, entry]));
  const proposals = new Map<
    string,
    { readonly bytes: Buffer | null; readonly resolution: ConflictResolution }
  >();
  for (const target of targets) {
    assertPortableRelativePath(target, "Resolve target");
    const entry = entryByTarget.get(target);
    if (entry === undefined || entry.originalStatus !== "conflict") {
      throw new CliError(
        `Target ${target} is not a conflict in transaction ${options.transactionId}.`,
        {
          code: "RESOLVE_TARGET_UNKNOWN",
          exitCode: 2,
          target,
        },
      );
    }
    let bytes: Buffer | null;
    let resolution: ConflictResolution;
    if (options.choice === "take-local") {
      currentConflictProposal(loaded, entry, false);
      bytes = verifiedSnapshot(loaded, entry, "local");
      resolution = "take-local";
    } else if (options.choice === "take-upstream") {
      currentConflictProposal(loaded, entry, false);
      bytes = verifiedSnapshot(loaded, entry, "remote");
      resolution = "take-upstream";
    } else if (options.choice === "reset") {
      currentConflictProposal(loaded, entry, false);
      bytes = verifiedSnapshot(loaded, entry, "proposed");
      resolution = "unresolved";
    } else {
      bytes = currentConflictProposal(loaded, entry, true);
      if (bytes === null) throw new Error("Conflict proposal files are always represented.");
      validateManualResolution(loaded, entry, bytes);
      resolution = "manual";
    }
    proposals.set(target, { bytes, resolution });
  }
  const changes = targets.map((target) => {
    const entry = entryByTarget.get(target)!;
    const proposal = proposals.get(target)!;
    return {
      target,
      from: entry.currentProposedDigest,
      to: digestOrNull(proposal.bytes),
      present: proposal.bytes !== null,
      resolution: proposal.resolution,
    };
  });
  const semantic = {
    schemaVersion: 1 as const,
    command: "resolve" as const,
    scope: "local-conflict-bundle" as const,
    transactionId: options.transactionId,
    choice: options.choice,
    statePreconditionDigest: loaded.stateDigest,
    manifestPreconditionDigest: loaded.state.manifestPreconditionDigest,
    changes,
    limitations: resolutionLimitations(),
  };
  return {
    loaded,
    proposals,
    plan: { ...semantic, planDigest: digest(semantic) },
  };
}

export function planSemanticResolveChoice(
  options: SemanticResolveChoiceOptions,
): SemanticResolveChoicePlan {
  return buildResolveChoicePlan(options).plan;
}

function persistConflictState(loaded: LoadedConflict, state: ConflictState): void {
  const stateBytes = Buffer.from(`${JSON.stringify(state, null, 2)}\n`);
  writeAtomic(
    loaded.root,
    `${transactionRoot(state.transactionId)}/${CONFLICT_STATE_PATH}`,
    stateBytes,
  );
  writeAtomic(
    loaded.root,
    `${transactionRoot(state.transactionId)}/${CONFLICT_STATE_DIGEST_PATH}`,
    Buffer.from(`${sha256(stateBytes)}\n`),
  );
}

export function applySemanticResolveChoice(
  options: SemanticResolveChoiceOptions,
  expectedPlanDigest?: string,
): SemanticResolveChoicePlan {
  const internal = buildResolveChoicePlan(options);
  if (expectedPlanDigest !== undefined && internal.plan.planDigest !== expectedPlanDigest) {
    throw new CliError("Resolve choice plan changed before apply; review a fresh plan.", {
      code: "PLAN_PRECONDITION_STALE",
      exitCode: 8,
    });
  }
  for (const change of internal.plan.changes) {
    const entry = internal.loaded.state.entries.find(({ target }) => target === change.target)!;
    const proposal = internal.proposals.get(change.target)!;
    writeAtomic(
      internal.loaded.root,
      conflictPath(internal.loaded.state.transactionId, entry.key, "proposed"),
      fileBytesForBundle(proposal.bytes),
    );
  }
  const nextEntries = internal.loaded.state.entries.map((entry) => {
    const proposal = internal.proposals.get(entry.target);
    if (proposal === undefined) return entry;
    return {
      ...entry,
      resolution: proposal.resolution,
      currentProposedDigest: digestOrNull(proposal.bytes),
      currentProposedPresent: proposal.bytes !== null,
    };
  });
  persistConflictState(internal.loaded, {
    ...internal.loaded.state,
    entries: nextEntries,
  });
  return internal.plan;
}

export interface SemanticResolveApplyOptions {
  readonly projectRoot: string;
  readonly transactionId: string;
  readonly noInstall?: boolean | undefined;
  readonly offline?: boolean | undefined;
  readonly packageManagerRunner?: PackageManagerRunner | undefined;
  readonly faultInjector?: TransactionFaultInjector | undefined;
  readonly commandArguments?: readonly string[] | undefined;
}

export interface SemanticResolveApplyResult {
  readonly mode: "semantic-resolve";
  readonly status: "committed";
  readonly conflictTransactionId: string;
  readonly planDigest: Digest;
  readonly transaction: TransactionResult;
  readonly decisions: readonly {
    readonly target: string;
    readonly resolution: Exclude<ConflictResolution, "unresolved">;
    readonly proposedDigest: Digest | null;
  }[];
}

interface InternalResolveApplyPlan {
  readonly loaded: LoadedConflict;
  readonly plan: OperationPlan;
  readonly mutations: readonly TransactionMutation[];
  readonly observedTargets: Readonly<Record<string, Digest | null>>;
  readonly candidates: ReadonlyMap<string, Buffer | null>;
  readonly validators: readonly TransactionValidator[];
}

function resolvedOperation(
  entry: ConflictStateEntry,
  proposed: Buffer | null,
): OperationPlanFile["operation"] {
  if (entry.originalStatus !== "conflict") return operationFor(entry.originalStatus);
  if (entry.resolution === "take-local") {
    return proposed === null ? "local-delete" : "keep-local";
  }
  if (entry.resolution === "take-upstream") {
    if (proposed === null) return "delete";
    if (entry.localDigest === null) return "add";
    return entry.mediaType.startsWith("text/") || entry.mediaType.includes("json")
      ? "fast-forward"
      : "binary-replace";
  }
  if (digestOrNull(proposed) === entry.localDigest) return "keep-local";
  if (proposed === null) return "delete";
  if (entry.localDigest === null) return "add";
  return "semantic-merge";
}

function buildResolveApplyInternal(options: SemanticResolveApplyOptions): InternalResolveApplyPlan {
  const loaded = readConflict(options.projectRoot, options.transactionId);
  assertConflictLivePreconditions(loaded);
  const unresolved = loaded.state.entries.filter(
    ({ originalStatus, resolution }) =>
      originalStatus === "conflict" && resolution === "unresolved",
  );
  if (unresolved.length > 0) {
    throw new CliError(
      `Conflict target ${unresolved[0]!.target} is unresolved; choose an explicit path-specific resolution first.`,
      {
        code: "CONFLICTS_UNRESOLVED",
        exitCode: 6,
        target: unresolved[0]!.target,
      },
    );
  }
  const candidates = new Map<string, Buffer | null>();
  for (const entry of loaded.state.entries) {
    const bytes =
      entry.originalStatus === "conflict"
        ? currentConflictProposal(loaded, entry, false)
        : verifiedSnapshot(loaded, entry, "proposed");
    if (entry.originalStatus === "conflict" && entry.resolution === "manual") {
      if (bytes === null) {
        throw new CliError(
          `Manual resolution for ${entry.target} cannot express deletion; use take-local or take-upstream.`,
          { code: "CONFLICT_MANUAL_DELETE_UNSUPPORTED", exitCode: 6, target: entry.target },
        );
      }
      validateManualResolution(loaded, entry, bytes);
    }
    if (
      digestOrNull(bytes) !== entry.currentProposedDigest &&
      entry.originalStatus === "conflict"
    ) {
      throw new CliError(`Resolved proposal for ${entry.target} changed after recording.`, {
        code: "CONFLICT_PROPOSAL_STALE",
        exitCode: 8,
        target: entry.target,
      });
    }
    candidates.set(entry.target, bytes);
  }
  const nextManifest = structuredClone(loaded.nextManifest);
  for (const entry of loaded.state.entries) {
    const item = nextManifest.items[entry.owner];
    if (item === undefined) {
      throw new CliError(`Conflict manifest snapshot lacks owner ${entry.owner}.`, {
        code: "CONFLICT_STATE_INVALID",
        exitCode: 8,
      });
    }
    const index = item.files.findIndex(({ logicalPath }) => logicalPath === entry.logicalPath);
    if (entry.remotePresent) {
      if (index < 0 || item.files[index]!.base !== entry.remoteDigest) {
        throw new CliError(`Conflict manifest base for ${entry.target} is inconsistent.`, {
          code: "CONFLICT_STATE_INVALID",
          exitCode: 8,
          target: entry.target,
        });
      }
      const proposed = candidates.get(entry.target)!;
      const files = [...item.files];
      files[index] = {
        ...files[index]!,
        installed: digestOrNull(proposed),
        ...(proposed === null ? { tombstone: true as const } : { tombstone: undefined }),
      };
      nextManifest.items[entry.owner] = { ...item, files };
    } else if (index >= 0) {
      throw new CliError(`Deleted upstream file ${entry.target} remains in next manifest.`, {
        code: "CONFLICT_STATE_INVALID",
        exitCode: 8,
        target: entry.target,
      });
    }
  }
  const nextManifestBytes = manifestBytes(nextManifest);
  const mutations: TransactionMutation[] = [];
  const observedTargets: Record<string, Digest | null> = {};
  const fileOperations: OperationPlanFile[] = [];
  for (const entry of loaded.state.entries) {
    const proposed = candidates.get(entry.target)!;
    observedTargets[entry.target] = entry.localDigest;
    const operation = resolvedOperation(entry, proposed);
    fileOperations.push({
      operation,
      target: entry.target,
      owner: entry.owner,
      base: entry.baseDigest,
      local: entry.localDigest,
      remote: entry.remoteDigest,
      proposed: digestOrNull(proposed),
      mediaType: entry.mediaType,
      risk:
        entry.originalStatus === "conflict"
          ? "review-required"
          : operation === "delete"
            ? "destructive"
            : operation === "semantic-merge"
              ? "review-required"
              : "ordinary",
      reason:
        entry.originalStatus === "conflict"
          ? `Explicit path-specific resolution recorded as ${entry.resolution}; all original digests were revalidated.`
          : `Previously clean ${entry.originalStatus} candidate retained from the immutable conflict snapshot.`,
    });
    if (entry.localDigest !== digestOrNull(proposed)) {
      mutations.push({ target: entry.target, content: proposed, beforeDigest: entry.localDigest });
    }
    const remote = verifiedSnapshot(loaded, entry, "remote");
    if (remote !== null) {
      const remoteDigest = sha256(remote);
      const target = basePath(remoteDigest);
      const existing = readProjectFile(loaded.root, target);
      if (existing !== null && sha256(existing) !== remoteDigest) {
        throw new CliError(`Immutable base ${target} is corrupt.`, {
          code: "BASE_DIGEST_MISMATCH",
          exitCode: 8,
          target,
        });
      }
      observedTargets[target] = digestOrNull(existing);
      if (existing === null && !mutations.some((candidate) => candidate.target === target)) {
        mutations.push({ target, content: remote, beforeDigest: null });
      }
    }
  }
  if (loaded.state.package.changed) {
    mutations.push({
      target: "package.json",
      content: loaded.packageProposed,
      beforeDigest: loaded.state.package.localDigest,
    });
  }
  const manifestBefore = requiredConflictFile(loaded.root, MANIFEST_PATH);
  mutations.push({
    target: MANIFEST_PATH,
    content: nextManifestBytes,
    beforeDigest: sha256(manifestBefore),
    manifest: true,
  });
  const owner = loaded.state.selectedItems[0]!;
  for (const candidate of mutations) {
    if (fileOperations.some(({ target }) => target === candidate.target)) continue;
    fileOperations.push(
      metadataOperation({
        target: candidate.target,
        owner,
        before:
          candidate.target === MANIFEST_PATH
            ? manifestBefore
            : candidate.target === "package.json"
              ? loaded.packageLocal
              : null,
        after: candidate.content === null ? null : Buffer.from(candidate.content),
        mediaType: candidate.target.endsWith(".json")
          ? "application/json"
          : "application/octet-stream",
        reason:
          candidate.target === MANIFEST_PATH
            ? "Commit resolved installed digests and immutable upstream provenance last."
            : candidate.target === "package.json"
              ? "Apply the originally reviewed dependency proposal."
              : "Persist the exact immutable remote bytes as the next base.",
      }),
    );
  }
  const original = loaded.plan;
  const validators = semanticTransactionValidators({
    root: loaded.root,
    files: loaded.state.entries.map(({ target, mediaType, role }) => ({
      target,
      mediaType,
      role,
    })),
    items: loaded.state.selectedItems.map((owner) => {
      const item = nextManifest.items[owner];
      if (item === undefined) {
        throw new CliError(`Resolved manifest lacks selected Contract owner ${owner}.`, {
          code: "CONFLICT_STATE_INVALID",
          exitCode: 8,
          target: MANIFEST_PATH,
        });
      }
      return {
        owner,
        contractVersion: item.contractVersion,
        payloadDigest: item.payload.digest,
        transformContextDigest: item.transformContextDigest,
      };
    }),
  });
  const decisions = loaded.state.entries
    .filter(({ originalStatus }) => originalStatus === "conflict")
    .map(({ target, resolution }) => `${target}=${resolution}`)
    .sort((left, right) => left.localeCompare(right, "en-US"));
  const plan = finalizeOperationPlan({
    schemaVersion: 1,
    command: "resolve",
    cliVersion: CLI_VERSION,
    projectRoot: ".",
    configDigest: loaded.state.configPreconditionDigest,
    manifestPreconditionDigest: loaded.state.manifestPreconditionDigest,
    registries: original.registries,
    items: original.items,
    fileOperations: fileOperations.sort((left, right) =>
      left.target.localeCompare(right.target, "en-US"),
    ),
    dependencyChanges: original.dependencyChanges,
    structuredPatches: original.structuredPatches,
    migrations: original.migrations,
    contractChanges: original.contractChanges,
    warnings: [
      ...original.warnings,
      `Resolution decisions: ${decisions.join(", ")}.`,
      "Every live, manifest, package, immutable-base, conflict-state, and proposal digest was revalidated; no force path exists.",
    ],
    consentRequirements: [
      {
        id: "apply-semantic-resolution",
        flag: "--apply",
        reason: "Atomically commit every resolved target and advance provenance manifest last.",
      },
    ],
    conflicts: [],
    estimatedBytes: {
      download: 0,
      write: mutations.reduce(
        (total, candidate) => total + (candidate.content?.byteLength ?? 0),
        0,
      ),
    },
    validationSuite: validationSuiteForTransaction(validators),
    rollbackAvailable: true,
  });
  return { loaded, plan, mutations, observedTargets, candidates, validators };
}

export function planSemanticResolveApply(options: SemanticResolveApplyOptions): OperationPlan {
  return buildResolveApplyInternal(options).plan;
}

export function applySemanticResolution(
  options: SemanticResolveApplyOptions,
  expectedPlanDigest?: string,
): SemanticResolveApplyResult {
  const internal = buildResolveApplyInternal(options);
  if (expectedPlanDigest !== undefined && expectedPlanDigest !== internal.plan.planDigest) {
    throw new CliError("Resolved transaction plan changed before apply; review a fresh plan.", {
      code: "PLAN_PRECONDITION_STALE",
      exitCode: 8,
    });
  }
  const transaction = executeTransaction({
    root: internal.loaded.root,
    plan: internal.plan,
    mutations: internal.mutations,
    observedTargets: internal.observedTargets,
    registryPayloads: internal.loaded.state.registryPayloads,
    packageManager: internal.loaded.state.package.packageManager,
    packageManagerRequired: internal.loaded.state.package.changed,
    noInstall: options.noInstall ?? internal.loaded.state.package.noInstall,
    offline: options.offline,
    packageManagerRunner: options.packageManagerRunner,
    faultInjector: options.faultInjector,
    commandArguments: options.commandArguments,
    validators: internal.validators,
  });
  const decisions = internal.loaded.state.entries
    .filter(
      (
        entry,
      ): entry is ConflictStateEntry & {
        readonly resolution: Exclude<ConflictResolution, "unresolved">;
      } => entry.originalStatus === "conflict" && entry.resolution !== "unresolved",
    )
    .map((entry) => ({
      target: entry.target,
      resolution: entry.resolution,
      proposedDigest: entry.currentProposedDigest,
    }));
  persistConflictState(internal.loaded, {
    ...internal.loaded.state,
    state: "resolved",
    committedTransactionId: transaction.transactionId,
  });
  return {
    mode: "semantic-resolve",
    status: "committed",
    conflictTransactionId: options.transactionId,
    planDigest: internal.plan.planDigest,
    transaction,
    decisions,
  };
}

export interface SemanticSourceDiffOptions {
  readonly projectRoot: string;
  readonly itemIds?: readonly string[] | undefined;
  /** Omit for a strictly local B -> L customization diff. */
  readonly release?: ImmutableUpdateRelease | undefined;
  readonly packageManager?: PackageManager | undefined;
}

export interface SemanticSourceDiffFile {
  readonly target: string;
  readonly owner: string;
  readonly logicalPath: string;
  readonly mediaType: string;
  readonly baseDigest: Digest | null;
  readonly localDigest: Digest | null;
  readonly localChange: "unchanged" | "added" | "modified" | "deleted";
  readonly stat: {
    readonly bytesAdded: number;
    readonly bytesRemoved: number;
    readonly linesAdded: number | null;
    readonly linesRemoved: number | null;
  };
  readonly planned: null | {
    readonly status: FileMergeResult["status"];
    readonly remoteDigest: Digest | null;
    readonly proposedDigest: Digest | null;
    readonly appliedRemoteKeys: readonly string[];
    readonly preservedLocalKeys: readonly string[];
    readonly conflicts: readonly SemanticConflict[];
  };
}

export interface SemanticSourceDiff {
  readonly schemaVersion: 1;
  readonly mode: "read-only-semantic-diff";
  readonly manifestDigest: Digest;
  readonly targetRelease: string | null;
  readonly hasDifferences: boolean;
  readonly nameOnly: readonly string[];
  readonly stat: {
    readonly files: number;
    readonly bytesAdded: number;
    readonly bytesRemoved: number;
    readonly linesAdded: number | null;
    readonly linesRemoved: number | null;
  };
  readonly files: readonly SemanticSourceDiffFile[];
}

function textLines(bytes: Buffer | null, mediaType: string): readonly string[] | null {
  if (bytes === null) return [];
  if (!(mediaType.startsWith("text/") || mediaType.includes("json"))) return null;
  try {
    return new TextDecoder("utf-8", { fatal: true, ignoreBOM: true })
      .decode(bytes)
      .split(/\r\n|\n|\r/gu);
  } catch {
    return null;
  }
}

function diffStat(
  base: Buffer | null,
  local: Buffer | null,
  mediaType: string,
): SemanticSourceDiffFile["stat"] {
  if (digestOrNull(base) === digestOrNull(local)) {
    return { bytesAdded: 0, bytesRemoved: 0, linesAdded: 0, linesRemoved: 0 };
  }
  const baseBytes = base ?? Buffer.alloc(0);
  const localBytes = local ?? Buffer.alloc(0);
  let bytePrefix = 0;
  while (
    bytePrefix < baseBytes.byteLength &&
    bytePrefix < localBytes.byteLength &&
    baseBytes[bytePrefix] === localBytes[bytePrefix]
  ) {
    bytePrefix += 1;
  }
  let byteSuffix = 0;
  while (
    byteSuffix < baseBytes.byteLength - bytePrefix &&
    byteSuffix < localBytes.byteLength - bytePrefix &&
    baseBytes[baseBytes.byteLength - 1 - byteSuffix] ===
      localBytes[localBytes.byteLength - 1 - byteSuffix]
  ) {
    byteSuffix += 1;
  }
  const baseLines = textLines(base, mediaType);
  const localLines = textLines(local, mediaType);
  let linesAdded: number | null = null;
  let linesRemoved: number | null = null;
  if (baseLines !== null && localLines !== null) {
    let prefix = 0;
    while (
      prefix < baseLines.length &&
      prefix < localLines.length &&
      baseLines[prefix] === localLines[prefix]
    ) {
      prefix += 1;
    }
    let suffix = 0;
    while (
      suffix < baseLines.length - prefix &&
      suffix < localLines.length - prefix &&
      baseLines[baseLines.length - 1 - suffix] === localLines[localLines.length - 1 - suffix]
    ) {
      suffix += 1;
    }
    linesRemoved = Math.max(0, baseLines.length - prefix - suffix);
    linesAdded = Math.max(0, localLines.length - prefix - suffix);
  }
  return {
    bytesAdded: Math.max(0, localBytes.byteLength - bytePrefix - byteSuffix),
    bytesRemoved: Math.max(0, baseBytes.byteLength - bytePrefix - byteSuffix),
    linesAdded,
    linesRemoved,
  };
}

function localChange(
  base: Buffer | null,
  local: Buffer | null,
): SemanticSourceDiffFile["localChange"] {
  if (digestOrNull(base) === digestOrNull(local)) return "unchanged";
  if (base === null) return "added";
  if (local === null) return "deleted";
  return "modified";
}

/**
 * Strictly read-only B -> L inspection, optionally enriched with the verified
 * immutable L + (B -> R) plan. It never creates cache, transaction, or diff files.
 */
export function diffSemanticSource(options: SemanticSourceDiffOptions): SemanticSourceDiff {
  const root = validatedProjectRoot(options.projectRoot);
  const manifest = readManifest(root);
  const selected = selectedItemIds(manifest.value, options.itemIds);
  let entries: readonly UpdateEntry[];
  let targetRelease: string | null = null;
  if (options.release !== undefined) {
    const internal = buildUpdateInternal({
      projectRoot: root,
      itemIds: options.itemIds,
      release: options.release,
      packageManager: options.packageManager,
      noInstall: true,
    });
    entries = internal.entries;
    targetRelease = options.release.release;
  } else {
    entries = selected
      .flatMap((owner) => {
        const item = manifest.value.items[owner]!;
        return item.files.map((file) => {
          const base = readProjectFile(root, basePath(file.base));
          if (base === null || sha256(base) !== file.base) {
            throw new CliError(`Immutable base for ${file.target} is missing or corrupt.`, {
              code: "BASE_DIGEST_MISMATCH",
              exitCode: 3,
              target: basePath(file.base),
            });
          }
          const local = readProjectFile(root, file.target);
          const result = mergeFileThreeWay({
            mediaType: mergeAdapterMediaType(file.mediaType),
            base,
            local,
            remote: base,
          });
          return {
            key: portableTargetKey(file.target),
            target: file.target,
            owner,
            logicalPath: file.logicalPath,
            role: file.role,
            mediaType: file.mediaType,
            base,
            local,
            remote: base,
            result,
            proposed: local,
            remoteFile: null,
          } satisfies UpdateEntry;
        });
      })
      .sort((left, right) => left.target.localeCompare(right.target, "en-US"));
  }
  const files = entries.map((entry) => ({
    target: entry.target,
    owner: entry.owner,
    logicalPath: entry.logicalPath,
    mediaType: entry.mediaType,
    baseDigest: digestOrNull(entry.base),
    localDigest: digestOrNull(entry.local),
    localChange: localChange(entry.base, entry.local),
    stat: diffStat(entry.base, entry.local, entry.mediaType),
    planned:
      options.release === undefined
        ? null
        : {
            status: entry.result.status,
            remoteDigest: digestOrNull(entry.remote),
            proposedDigest: digestOrNull(entry.proposed),
            appliedRemoteKeys: entry.result.appliedRemoteKeys,
            preservedLocalKeys: entry.result.preservedLocalKeys,
            conflicts: entry.result.conflicts,
          },
  }));
  const differing = files.filter(
    (file) =>
      file.localChange !== "unchanged" ||
      (file.planned !== null && file.planned.remoteDigest !== file.baseDigest),
  );
  const lineStatsKnown = differing.every(
    ({ stat }) => stat.linesAdded !== null && stat.linesRemoved !== null,
  );
  return {
    schemaVersion: 1,
    mode: "read-only-semantic-diff",
    manifestDigest: digest(manifest.value),
    targetRelease,
    hasDifferences: differing.length > 0,
    nameOnly: differing.map(({ target }) => target),
    stat: {
      files: differing.length,
      bytesAdded: differing.reduce((total, { stat }) => total + stat.bytesAdded, 0),
      bytesRemoved: differing.reduce((total, { stat }) => total + stat.bytesRemoved, 0),
      linesAdded: lineStatsKnown
        ? differing.reduce((total, { stat }) => total + stat.linesAdded!, 0)
        : null,
      linesRemoved: lineStatsKnown
        ? differing.reduce((total, { stat }) => total + stat.linesRemoved!, 0)
        : null,
    },
    files,
  };
}
