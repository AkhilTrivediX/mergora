import { closeSync, constants, fstatSync, lstatSync, openSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

import {
  CLI_VERSION,
  assertNoSymlinkAncestors,
  assertPortableRelativePath,
  canonicalJson,
  CliError,
  sha256,
  validatedProjectRoot,
} from "./contracts.js";
import { createMergoraConfig, validateMergoraConfig, type MergoraConfig } from "./configuration.js";
import { inspectProject, type Framework } from "./project-inspector.js";
import {
  executeTransaction,
  finalizeOperationPlan,
  validateTransactionOverlay,
  validationSuiteForTransaction,
  type OperationPlan,
  type OperationPlanFile,
  type TransactionMutation,
  type TransactionResult,
  type TransactionValidationContext,
  type TransactionValidationIssue,
  type TransactionValidationResult,
  type TransactionValidator,
} from "./transaction-engine.js";
import {
  createMediaParseValidator,
  transactionValidationResult,
} from "./trusted-transaction-validators.js";

type Digest = `sha256:${string}`;

const CONFIG_PATH = "mergora.json" as const;
const MANIFEST_PATH = ".mergora/manifest.json" as const;
const SHADCN_CONFIG_PATH = "components.json" as const;
const ITEM_ID = /^[a-z0-9]+(?:-[a-z0-9]+)*$/u;

export const BUILT_IN_MIGRATION_IDS = [
  "config-v0-to-v1",
  "framework-next-app-to-vite-v1",
  "framework-next-pages-to-next-app-v1",
  "framework-vite-to-next-app-v1",
  "mode-package-to-source-v1",
  "mode-source-to-package-v1",
  "shadcn-components-v1-to-mergora-v1",
] as const;

export type BuiltInMigrationId = (typeof BUILT_IN_MIGRATION_IDS)[number];
export type MigrationTarget = "config" | "shadcn" | "framework" | "mode" | "id";

export interface MigrationOptions {
  readonly projectRoot: string;
  readonly target: MigrationTarget;
  /** Required for framework, mode, and id targets; optional for config and shadcn aliases. */
  readonly migrationId?: BuiltInMigrationId | string | undefined;
  readonly itemIds?: readonly string[] | undefined;
  readonly commandArguments?: readonly string[] | undefined;
}

export interface MigrationStep {
  readonly sequence: number;
  readonly id: string;
  readonly kind: "structured-json" | "built-in-ast" | "manual";
  readonly target: string;
  readonly description: string;
  readonly reversible: boolean;
  readonly inverse: string;
}

export interface MigrationChecklistItem {
  readonly sequence: number;
  readonly id: string;
  readonly description: string;
  readonly blocking: true;
}

export type MigrationPlan = OperationPlan;

interface MigrationDetails {
  readonly id: BuiltInMigrationId;
  readonly target: Exclude<MigrationTarget, "id">;
  readonly trustedBuiltin: true;
  readonly execution: "transaction" | "no-op" | "manual-only";
  readonly sourceVersion: string;
  readonly targetVersion: string;
  readonly steps: readonly MigrationStep[];
  readonly manualChecklist: readonly MigrationChecklistItem[];
  readonly externalExecutableCodeUsed: false;
  readonly componentsJsonRetained: boolean;
  readonly itemIds: readonly string[];
}

interface PlannedMigration {
  readonly plan: MigrationPlan;
  readonly details: MigrationDetails;
}

export interface MigrationResult {
  readonly id: BuiltInMigrationId;
  readonly target: Exclude<MigrationTarget, "id">;
  readonly planDigest: Digest;
  readonly transaction: TransactionResult;
}

interface InternalMigrationPlan {
  readonly root: string;
  readonly plan: MigrationPlan;
  readonly details: MigrationDetails;
  readonly mutations: readonly TransactionMutation[];
  readonly observedTargets: Readonly<Record<string, Digest | null>>;
  readonly validators: readonly TransactionValidator[];
}

interface ProjectDigests {
  readonly configBytes: Buffer | null;
  readonly configValue: unknown;
  readonly configDigest: Digest;
  readonly manifestBytes: Buffer | null;
  readonly manifestValue: unknown;
  readonly manifestDigest: Digest | null;
}

interface LegacyConfigV0 {
  readonly schemaVersion: 0;
  readonly framework: Framework;
  readonly sourceRoot: string;
  readonly globalCss: string;
  readonly aliasPrefix: string;
  readonly defaultMode?: "source" | "package" | "hybrid" | undefined;
  readonly tokenPreset?: string | undefined;
  readonly colorMode?: "system" | "light" | "dark" | undefined;
  readonly density?: "comfortable" | "compact" | "touch" | undefined;
  readonly direction?: "ltr" | "rtl" | "auto" | undefined;
}

const FRAMEWORK_MIGRATIONS: Readonly<
  Record<
    Extract<
      BuiltInMigrationId,
      | "framework-next-app-to-vite-v1"
      | "framework-next-pages-to-next-app-v1"
      | "framework-vite-to-next-app-v1"
    >,
    { readonly from: Framework; readonly to: Framework }
  >
> = {
  "framework-next-app-to-vite-v1": { from: "next-app", to: "vite-react" },
  "framework-next-pages-to-next-app-v1": { from: "next-pages", to: "next-app" },
  "framework-vite-to-next-app-v1": { from: "vite-react", to: "next-app" },
};

function migrationError(
  message: string,
  code: string,
  target?: string,
  exitCode: 2 | 3 | 5 | 7 | 8 = 3,
): CliError {
  return new CliError(message, {
    code,
    exitCode,
    ...(target === undefined ? {} : { target }),
  });
}

function isObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function compareText(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function safeRead(root: string, target: string, optional = false): Buffer | null {
  assertPortableRelativePath(target, "Migration project target");
  assertNoSymlinkAncestors(root, target);
  const path = resolve(root, ...target.split("/"));
  let metadata;
  try {
    metadata = lstatSync(path);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT" && optional) return null;
    throw error;
  }
  if (metadata.isSymbolicLink() || !metadata.isFile()) {
    throw migrationError(
      `Migration target ${target} is not a regular file.`,
      "MIGRATION_TARGET_UNSAFE",
      target,
      5,
    );
  }
  let descriptor: number | null = null;
  try {
    const flags =
      process.platform === "win32" ? constants.O_RDONLY : constants.O_RDONLY | constants.O_NOFOLLOW;
    descriptor = openSync(path, flags);
    const opened = fstatSync(descriptor);
    const current = lstatSync(path);
    if (
      !opened.isFile() ||
      current.isSymbolicLink() ||
      !current.isFile() ||
      opened.dev !== current.dev ||
      opened.ino !== current.ino
    ) {
      throw migrationError(
        `Migration target ${target} changed during inspection.`,
        "MIGRATION_TARGET_UNSAFE",
        target,
        5,
      );
    }
    return readFileSync(descriptor);
  } finally {
    if (descriptor !== null) closeSync(descriptor);
  }
}

function parseJson(bytes: Buffer | null, target: string, optional = false): unknown {
  if (bytes === null && optional) return null;
  try {
    return JSON.parse(bytes!.toString("utf8")) as unknown;
  } catch {
    throw migrationError(`${target} must be strict JSON.`, "MIGRATION_JSON_INVALID", target);
  }
}

function canonicalDigest(value: unknown): Digest {
  try {
    return sha256(canonicalJson(value));
  } catch {
    throw migrationError("Migration input is not canonicalizable JSON.", "MIGRATION_JSON_INVALID");
  }
}

function projectDigests(root: string): ProjectDigests {
  const configBytes = safeRead(root, CONFIG_PATH, true);
  const manifestBytes = safeRead(root, MANIFEST_PATH, true);
  const configValue = parseJson(configBytes, CONFIG_PATH, true);
  const manifestValue = parseJson(manifestBytes, MANIFEST_PATH, true);
  return {
    configBytes,
    configValue,
    configDigest: canonicalDigest(configValue),
    manifestBytes,
    manifestValue,
    manifestDigest: manifestBytes === null ? null : canonicalDigest(manifestValue),
  };
}

function exactKeys(
  value: Record<string, unknown>,
  required: readonly string[],
  optional: readonly string[] = [],
): boolean {
  const keys = Object.keys(value);
  return (
    required.every((key) => Object.hasOwn(value, key)) &&
    keys.every((key) => required.includes(key) || optional.includes(key))
  );
}

function legacyConfig(value: unknown): LegacyConfigV0 | null {
  if (
    !isObject(value) ||
    !exactKeys(
      value,
      ["schemaVersion", "framework", "sourceRoot", "globalCss", "aliasPrefix"],
      ["defaultMode", "tokenPreset", "colorMode", "density", "direction"],
    ) ||
    value.schemaVersion !== 0 ||
    !["next-app", "next-pages", "vite-react", "react"].includes(String(value.framework)) ||
    typeof value.sourceRoot !== "string" ||
    typeof value.globalCss !== "string" ||
    typeof value.aliasPrefix !== "string" ||
    (value.defaultMode !== undefined &&
      !["source", "package", "hybrid"].includes(String(value.defaultMode))) ||
    (value.tokenPreset !== undefined &&
      (typeof value.tokenPreset !== "string" ||
        !/^[a-z0-9]+(?:-[a-z0-9]+)*$/u.test(value.tokenPreset))) ||
    (value.colorMode !== undefined &&
      !["system", "light", "dark"].includes(String(value.colorMode))) ||
    (value.density !== undefined &&
      !["comfortable", "compact", "touch"].includes(String(value.density))) ||
    (value.direction !== undefined && !["ltr", "rtl", "auto"].includes(String(value.direction)))
  ) {
    return null;
  }
  try {
    assertPortableRelativePath(value.sourceRoot, "Legacy source root");
    assertPortableRelativePath(value.globalCss, "Legacy global CSS");
  } catch {
    return null;
  }
  if (!/^[@~][a-zA-Z0-9._-]*$/u.test(value.aliasPrefix) || value.aliasPrefix.includes("..")) {
    return null;
  }
  return value as unknown as LegacyConfigV0;
}

function installedManifestItems(manifest: unknown): readonly string[] {
  if (manifest === null) return [];
  if (!isObject(manifest) || !isObject(manifest.items)) return ["<unreadable-manifest-items>"];
  return Object.keys(manifest.items).sort(compareText);
}

function prettyJson(value: unknown): Buffer {
  return Buffer.from(`${JSON.stringify(value, null, 2)}\n`);
}

function migratedConfig(root: string, legacy: LegacyConfigV0): MergoraConfig {
  const inspection = inspectProject(root, {
    framework: legacy.framework,
    sourceRoot: legacy.sourceRoot,
    globalCss: legacy.globalCss,
    aliasPrefix: legacy.aliasPrefix,
  });
  const defaults = createMergoraConfig(inspection);
  const migrated: MergoraConfig = {
    ...defaults,
    distribution: {
      ...defaults.distribution,
      defaultMode: legacy.defaultMode ?? defaults.distribution.defaultMode,
    },
    styling: {
      ...defaults.styling,
      tokenPreset: legacy.tokenPreset ?? defaults.styling.tokenPreset,
      colorMode: legacy.colorMode ?? defaults.styling.colorMode,
      density: legacy.density ?? defaults.styling.density,
      direction: legacy.direction ?? defaults.styling.direction,
    },
  };
  return validateMergoraConfig(migrated);
}

function checkedMigrationId(options: MigrationOptions): {
  readonly id: BuiltInMigrationId;
  readonly target: Exclude<MigrationTarget, "id">;
} {
  const defaultId =
    options.target === "config"
      ? "config-v0-to-v1"
      : options.target === "shadcn"
        ? "shadcn-components-v1-to-mergora-v1"
        : undefined;
  const raw = options.migrationId ?? defaultId;
  if (raw === undefined || !(BUILT_IN_MIGRATION_IDS as readonly string[]).includes(raw)) {
    throw migrationError(
      "Migration ID is not a trusted transform compiled into this CLI.",
      "MIGRATION_ID_UNTRUSTED",
      undefined,
      5,
    );
  }
  const id = raw as BuiltInMigrationId;
  const inferredTarget: Exclude<MigrationTarget, "id"> = id.startsWith("config-")
    ? "config"
    : id.startsWith("shadcn-")
      ? "shadcn"
      : id.startsWith("framework-")
        ? "framework"
        : "mode";
  if (options.target !== "id" && options.target !== inferredTarget) {
    throw migrationError(
      `Migration ${id} does not belong to target ${options.target}.`,
      "MIGRATION_TARGET_MISMATCH",
      undefined,
      2,
    );
  }
  return { id, target: inferredTarget };
}

export function listBuiltInMigrations(): readonly BuiltInMigrationId[] {
  return [...BUILT_IN_MIGRATION_IDS];
}

function migrationOperation(
  before: Buffer,
  after: Buffer,
  reason: string,
  owner = "migration:config-v0-to-v1",
): OperationPlanFile {
  const beforeDigest = sha256(before);
  const afterDigest = sha256(after);
  return {
    operation: beforeDigest === afterDigest ? "no-op" : "structured-patch",
    target: CONFIG_PATH,
    owner,
    base: beforeDigest,
    local: beforeDigest,
    remote: afterDigest,
    proposed: afterDigest,
    mediaType: "application/json",
    risk: "review-required",
    reason,
  };
}

function checklist(descriptions: readonly string[]): readonly MigrationChecklistItem[] {
  return descriptions.map((description, index) => ({
    sequence: index + 1,
    id: `manual-${String(index + 1).padStart(2, "0")}`,
    description,
    blocking: true,
  }));
}

function migrationWarnings(details: MigrationDetails): readonly string[] {
  return [
    `Trusted built-in migration ${details.id} targets ${details.target} and maps ${details.sourceVersion} to ${details.targetVersion}; external executable code is never used.`,
    ...(details.componentsJsonRetained
      ? ["The existing components.json file is retained by this plan."]
      : []),
    ...details.steps.map(
      ({ sequence, id, description, inverse }) =>
        `Migration step ${String(sequence)} (${id}): ${description} Inverse: ${inverse}`,
    ),
    ...details.manualChecklist.map(
      ({ sequence, id, description }) =>
        `Manual checklist ${String(sequence)} (${id}, blocking): ${description}`,
    ),
    ...(details.execution === "manual-only"
      ? [
          "This migration cannot be expressed safely by the current built-in adapters. The plan is read-only and no project bytes will be changed.",
        ]
      : []),
  ];
}

function planBase(input: {
  readonly project: ProjectDigests;
  readonly id: BuiltInMigrationId;
  readonly target: Exclude<MigrationTarget, "id">;
  readonly execution: MigrationDetails["execution"];
  readonly sourceVersion: string;
  readonly targetVersion: string;
  readonly steps: readonly MigrationStep[];
  readonly manualChecklist: readonly MigrationChecklistItem[];
  readonly items: readonly string[];
  readonly fileOperations: readonly OperationPlanFile[];
  readonly mutations: readonly TransactionMutation[];
  readonly componentsJsonRetained?: boolean | undefined;
}): PlannedMigration {
  const manual = input.execution === "manual-only";
  const writes = input.mutations.reduce(
    (total, mutation) => total + (mutation.content?.byteLength ?? 0),
    0,
  );
  const details: MigrationDetails = {
    id: input.id,
    target: input.target,
    trustedBuiltin: true,
    execution: input.execution,
    sourceVersion: input.sourceVersion,
    targetVersion: input.targetVersion,
    steps: input.steps,
    manualChecklist: input.manualChecklist,
    externalExecutableCodeUsed: false,
    componentsJsonRetained: input.componentsJsonRetained ?? false,
    itemIds: input.items,
  };
  const plan = finalizeOperationPlan({
    schemaVersion: 1,
    command: "migrate",
    cliVersion: CLI_VERSION,
    projectRoot: ".",
    configDigest: input.project.configDigest,
    manifestPreconditionDigest: input.project.manifestDigest,
    registries: [],
    items: input.items.map((id) => ({
      id,
      direct: true,
      requested: "*",
      fromVersion: null,
      toVersion: null,
      mode: "source",
    })),
    fileOperations: input.fileOperations,
    dependencyChanges: [],
    structuredPatches: [],
    migrations: [
      {
        id: input.id,
        adapter: manual ? "manual-checklist" : "config-v1",
        phase: "proposed",
      },
    ],
    contractChanges: [],
    warnings: migrationWarnings(details),
    consentRequirements:
      input.execution === "transaction"
        ? [
            {
              id: `migration:${input.id}`,
              flag: "--yes",
              reason: `Apply trusted built-in migration ${input.id} transactionally.`,
            },
          ]
        : [],
    conflicts: [],
    estimatedBytes: { download: 0, write: writes },
    validationSuite: ["schema"],
    rollbackAvailable: input.execution === "transaction",
  });
  return { plan, details };
}

function configPlan(
  root: string,
  project: ProjectDigests,
  id: Extract<BuiltInMigrationId, "config-v0-to-v1">,
): { readonly plan: PlannedMigration; readonly mutations: readonly TransactionMutation[] } {
  if (project.configBytes === null) {
    return {
      plan: planBase({
        project,
        id,
        target: "config",
        execution: "manual-only",
        sourceVersion: "missing",
        targetVersion: "1",
        steps: [],
        manualChecklist: checklist([
          "Run mergora init to create an explicit schema-v1 configuration before migrating installed source.",
        ]),
        items: [],
        fileOperations: [],
        mutations: [],
      }),
      mutations: [],
    };
  }
  if (isObject(project.configValue) && project.configValue.schemaVersion === 1) {
    validateMergoraConfig(project.configValue);
    const operation = migrationOperation(
      project.configBytes,
      project.configBytes,
      "Configuration already satisfies schema v1; preserve exact bytes.",
    );
    return {
      plan: planBase({
        project,
        id,
        target: "config",
        execution: "no-op",
        sourceVersion: "1",
        targetVersion: "1",
        steps: [],
        manualChecklist: [],
        items: [],
        fileOperations: [operation],
        mutations: [],
      }),
      mutations: [],
    };
  }
  if (
    isObject(project.configValue) &&
    typeof project.configValue.schemaVersion === "number" &&
    project.configValue.schemaVersion > 1
  ) {
    throw migrationError(
      `mergora.json uses future schema version ${String(project.configValue.schemaVersion)}; this CLI will not downgrade it.`,
      "MIGRATION_FUTURE_SCHEMA_UNSUPPORTED",
      CONFIG_PATH,
      3,
    );
  }
  const legacy = legacyConfig(project.configValue);
  if (legacy === null) {
    return {
      plan: planBase({
        project,
        id,
        target: "config",
        execution: "manual-only",
        sourceVersion: isObject(project.configValue)
          ? String(project.configValue.schemaVersion ?? "unknown")
          : "unknown",
        targetVersion: "1",
        steps: [],
        manualChecklist: checklist([
          "Map the unsupported legacy configuration fields to the documented schema-v1 keys.",
          "Run mergora init in a clean comparison fixture and review every explicit default.",
          "Re-run migrate config after the legacy file matches the supported v0 shape.",
        ]),
        items: [],
        fileOperations: [],
        mutations: [],
      }),
      mutations: [],
    };
  }
  const installed = installedManifestItems(project.manifestValue);
  if (project.manifestBytes !== null || installed.length > 0) {
    return {
      plan: planBase({
        project,
        id,
        target: "config",
        execution: "manual-only",
        sourceVersion: "0",
        targetVersion: "1",
        steps: [],
        manualChecklist: checklist([
          "Create an exact backup of mergora.json and the provenance manifest.",
          "Rebase every installed item's transform context with ordinary B/L/R Semantic Sync rules.",
          "Resolve any local divergence before advancing the configuration schema.",
          "Apply the reviewed schema-v1 configuration and provenance changes as one transaction.",
        ]),
        items: installed.filter((item) => item !== "<unreadable-manifest-items>"),
        fileOperations: [],
        mutations: [],
      }),
      mutations: [],
    };
  }
  const nextConfig = migratedConfig(root, legacy);
  const content = prettyJson(nextConfig);
  const beforeDigest = sha256(project.configBytes);
  const mutation: TransactionMutation = {
    target: CONFIG_PATH,
    content,
    beforeDigest,
  };
  return {
    plan: planBase({
      project,
      id,
      target: "config",
      execution: beforeDigest === sha256(content) ? "no-op" : "transaction",
      sourceVersion: "0",
      targetVersion: "1",
      steps: [
        {
          sequence: 1,
          id: "config-v0-to-v1:write",
          kind: "structured-json",
          target: CONFIG_PATH,
          description: "Replace the exact supported v0 shape with explicit schema-v1 defaults.",
          reversible: true,
          inverse: "Restore the transaction's byte-identical pre-state.",
        },
      ],
      manualChecklist: [],
      items: [],
      fileOperations: [
        migrationOperation(
          project.configBytes,
          content,
          "Advance the supported v0 configuration sequentially to schema v1.",
        ),
      ],
      mutations: beforeDigest === sha256(content) ? [] : [mutation],
    }),
    mutations: beforeDigest === sha256(content) ? [] : [mutation],
  };
}

interface ShadcnSettingsProjection {
  readonly aliasPrefix: string;
  readonly globalCss: string;
  readonly sourceVersion: string;
}

function shadcnAliasPrefix(value: string, suffix: string): string | null {
  const ending = `/${suffix}`;
  if (!value.endsWith(ending)) return null;
  const prefix = value.slice(0, -ending.length);
  return /^[@~][A-Za-z0-9._-]*$/u.test(prefix) && !prefix.includes("..") ? prefix : null;
}

function projectShadcnSettings(
  root: string,
  value: unknown,
): { readonly projection: ShadcnSettingsProjection | null; readonly issues: readonly string[] } {
  const issues: string[] = [];
  if (
    !isObject(value) ||
    !exactKeys(
      value,
      ["$schema", "tsx"],
      ["style", "rsc", "tailwind", "iconLibrary", "aliases", "registries"],
    )
  ) {
    return {
      projection: null,
      issues: [
        "Repair components.json so it contains only the supported shadcn configuration fields.",
      ],
    };
  }
  if (value.$schema !== "https://ui.shadcn.com/schema.json") {
    issues.push("Use the supported shadcn components.json schema identity before migration.");
  }
  if (value.tsx !== true) {
    issues.push(
      "Enable the shadcn TypeScript/TSX mode; Mergora does not infer a JavaScript transform.",
    );
  }
  if (value.style !== undefined && typeof value.style !== "string") {
    issues.push("Repair the shadcn style setting so it is a string.");
  }
  if (value.rsc !== undefined && typeof value.rsc !== "boolean") {
    issues.push("Repair the shadcn RSC setting so it is a boolean.");
  }
  if (value.iconLibrary !== undefined && typeof value.iconLibrary !== "string") {
    issues.push("Repair the shadcn iconLibrary setting so it is a string.");
  }
  if (value.registries !== undefined && !isObject(value.registries)) {
    issues.push("Repair the shadcn registries setting so it is an object.");
  }

  const tailwind = isObject(value.tailwind) ? value.tailwind : null;
  if (
    tailwind === null ||
    !exactKeys(tailwind, ["css"], ["config", "baseColor", "cssVariables", "prefix"])
  ) {
    issues.push("Add a supported shadcn tailwind.css path before migration.");
  }
  const globalCss = tailwind?.css;
  if (typeof globalCss !== "string") {
    issues.push("Set shadcn tailwind.css to one portable project-relative path.");
  } else {
    try {
      assertPortableRelativePath(globalCss, "shadcn global CSS");
      const cssBytes = safeRead(root, globalCss, true);
      if (cssBytes === null) {
        issues.push(`Create the configured shadcn global CSS file ${globalCss} before migration.`);
      } else if (!/@import\s+["']tailwindcss["']/u.test(cssBytes.toString("utf8"))) {
        issues.push(
          `Migrate ${globalCss} to the required Tailwind CSS v4 import before importing it into Mergora.`,
        );
      }
    } catch {
      issues.push("Set shadcn tailwind.css to one safe portable project-relative path.");
    }
  }

  const aliases = isObject(value.aliases) ? value.aliases : null;
  if (aliases === null || !exactKeys(aliases, ["components", "lib", "hooks"], ["ui", "utils"])) {
    issues.push("Add supported shadcn components, lib, and hooks aliases before migration.");
  }
  const aliasRules = [
    ["components", "components"],
    ["lib", "lib"],
    ["hooks", "hooks"],
    ["ui", "components/ui"],
    ["utils", "lib/utils"],
  ] as const;
  const prefixes: string[] = [];
  if (aliases !== null) {
    for (const [key, suffix] of aliasRules) {
      const alias = aliases[key];
      if (alias === undefined) continue;
      const prefix = typeof alias === "string" ? shadcnAliasPrefix(alias, suffix) : null;
      if (prefix === null) {
        issues.push(
          `Map shadcn aliases.${key} to one portable project alias ending in /${suffix}.`,
        );
      } else {
        prefixes.push(prefix);
      }
    }
  }
  const uniquePrefixes = [...new Set(prefixes)];
  if (uniquePrefixes.length !== 1) {
    issues.push("Make every shadcn alias share one unambiguous project prefix before migration.");
  }
  if (issues.length > 0 || typeof globalCss !== "string" || uniquePrefixes[0] === undefined) {
    return { projection: null, issues };
  }
  return {
    projection: {
      aliasPrefix: uniquePrefixes[0],
      globalCss,
      sourceVersion: String(value.$schema),
    },
    issues: [],
  };
}

function shadcnPlan(
  root: string,
  project: ProjectDigests,
  id: Extract<BuiltInMigrationId, "shadcn-components-v1-to-mergora-v1">,
): { readonly plan: PlannedMigration; readonly mutations: readonly TransactionMutation[] } {
  const bytes = safeRead(root, SHADCN_CONFIG_PATH, true);
  const value = parseJson(bytes, SHADCN_CONFIG_PATH, true);
  const sourceVersion =
    isObject(value) && typeof value.$schema === "string" ? value.$schema : "unknown";
  if (bytes === null || project.configBytes === null) {
    const descriptions = [
      ...(bytes === null
        ? ["Add or select a valid shadcn components.json before requesting shadcn migration."]
        : []),
      ...(project.configBytes === null
        ? ["Run mergora init before importing compatible shadcn project settings."]
        : []),
    ];
    return {
      plan: planBase({
        project,
        id,
        target: "shadcn",
        execution: "manual-only",
        sourceVersion: bytes === null ? "missing" : sourceVersion,
        targetVersion: "mergora-config-v1",
        steps: [],
        manualChecklist: checklist(descriptions),
        items: [],
        fileOperations: [],
        mutations: [],
        componentsJsonRetained: true,
      }),
      mutations: [],
    };
  }
  const config = validateMergoraConfig(project.configValue);
  const installed = installedManifestItems(project.manifestValue);
  if (installed.length > 0) {
    return {
      plan: planBase({
        project,
        id,
        target: "shadcn",
        execution: "manual-only",
        sourceVersion,
        targetVersion: "mergora-config-v1",
        steps: [],
        manualChecklist: checklist([
          "Back up mergora.json, components.json, the provenance manifest, and every installed base.",
          "Rebase installed Mergora transform contexts with ordinary B/L/R conflict protection before changing aliases or global CSS.",
          "Resolve every local divergence and apply the settings plus provenance update as one reviewed transaction.",
          "Adopt compatible shadcn source separately from an exact upstream payload; do not overwrite local source.",
        ]),
        items: installed.filter((item) => item !== "<unreadable-manifest-items>"),
        fileOperations: [],
        mutations: [],
        componentsJsonRetained: true,
      }),
      mutations: [],
    };
  }
  const projected = projectShadcnSettings(root, value);
  if (projected.projection === null) {
    return {
      plan: planBase({
        project,
        id,
        target: "shadcn",
        execution: "manual-only",
        sourceVersion,
        targetVersion: "mergora-config-v1",
        steps: [],
        manualChecklist: checklist([
          ...projected.issues,
          "Keep shadcn-owned directories separate; Mergora will retain components.json and use its own target suffixes.",
          "Adopt compatible shadcn source separately from an exact upstream payload; do not overwrite local source.",
        ]),
        items: [],
        fileOperations: [],
        mutations: [],
        componentsJsonRetained: true,
      }),
      mutations: [],
    };
  }
  const { aliasPrefix, globalCss } = projected.projection;
  const nextConfig = validateMergoraConfig({
    ...config,
    aliases: {
      components: `${aliasPrefix}/components/mergora`,
      hooks: `${aliasPrefix}/hooks/mergora`,
      lib: `${aliasPrefix}/lib/mergora`,
      systems: `${aliasPrefix}/components/mergora-systems`,
      kits: `${aliasPrefix}/features/mergora-kits`,
      styles: `${aliasPrefix}/styles/mergora`,
      tokens: `${aliasPrefix}/styles/mergora/tokens`,
    },
    styling: { ...config.styling, globalCss },
  });
  const semanticChange = canonicalJson(nextConfig) !== canonicalJson(config);
  const content = semanticChange ? prettyJson(nextConfig) : project.configBytes;
  const mutation: TransactionMutation = {
    target: CONFIG_PATH,
    content,
    beforeDigest: sha256(project.configBytes),
  };
  return {
    plan: planBase({
      project,
      id,
      target: "shadcn",
      execution: semanticChange ? "transaction" : "no-op",
      sourceVersion: projected.projection.sourceVersion,
      targetVersion: "mergora-config-v1",
      steps: [
        {
          sequence: 1,
          id: `${id}:project-settings`,
          kind: "structured-json",
          target: CONFIG_PATH,
          description:
            "Import only the compatible alias prefix and Tailwind CSS entry while retaining Mergora-owned target suffixes and components.json.",
          reversible: true,
          inverse: "Restore the transaction's byte-identical mergora.json pre-state.",
        },
      ],
      manualChecklist: [],
      items: [],
      fileOperations: [
        migrationOperation(
          project.configBytes,
          content,
          "Import compatible shadcn project settings without taking ownership of shadcn files.",
          `migration:${id}`,
        ),
      ],
      mutations: semanticChange ? [mutation] : [],
      componentsJsonRetained: true,
    }),
    mutations: semanticChange ? [mutation] : [],
  };
}

function frameworkPlan(
  project: ProjectDigests,
  id: keyof typeof FRAMEWORK_MIGRATIONS,
): PlannedMigration {
  if (project.configBytes === null) {
    throw migrationError(
      "Framework migration requires mergora.json.",
      "MIGRATION_CONFIG_REQUIRED",
      CONFIG_PATH,
    );
  }
  const config = validateMergoraConfig(project.configValue);
  const adapter = FRAMEWORK_MIGRATIONS[id];
  if (config.project.framework !== adapter.from) {
    throw migrationError(
      `Migration ${id} requires ${adapter.from}, but mergora.json declares ${config.project.framework}.`,
      "MIGRATION_SOURCE_CONSTRAINT",
      CONFIG_PATH,
    );
  }
  return planBase({
    project,
    id,
    target: "framework",
    execution: "manual-only",
    sourceVersion: adapter.from,
    targetVersion: adapter.to,
    steps: [
      {
        sequence: 1,
        id: `${id}:imports`,
        kind: "built-in-ast",
        target: "project TypeScript/TSX imports",
        description: "A future built-in AST adapter must rewrite framework integration imports.",
        reversible: true,
        inverse: "Apply the compiled inverse AST transform.",
      },
      {
        sequence: 2,
        id: `${id}:configuration`,
        kind: "manual",
        target: "framework and CSS integration seams",
        description:
          "Review framework entrypoints, Tailwind integration, and server/client boundaries.",
        reversible: true,
        inverse: "Restore transaction backups after validation.",
      },
    ],
    manualChecklist: checklist([
      `Create the target ${adapter.to} application seam without deleting the ${adapter.from} seam.`,
      "Run a compiled built-in TypeScript/TSX AST transform; do not execute registry-provided code.",
      "Migrate global CSS and Tailwind configuration with structured adapters.",
      "Run type, build, Contract, accessibility, and browser checks before removing old framework files.",
    ]),
    items: [],
    fileOperations: [],
    mutations: [],
  });
}

function modePlan(
  project: ProjectDigests,
  id: Extract<BuiltInMigrationId, "mode-package-to-source-v1" | "mode-source-to-package-v1">,
  rawItems: readonly string[],
): PlannedMigration {
  if (project.configBytes === null) {
    throw migrationError(
      "Mode migration requires mergora.json.",
      "MIGRATION_CONFIG_REQUIRED",
      CONFIG_PATH,
    );
  }
  validateMergoraConfig(project.configValue);
  const items = [...new Set(rawItems)].sort(compareText);
  if (items.length === 0 || items.some((item) => !ITEM_ID.test(item))) {
    throw migrationError(
      "Mode migration requires one or more portable item IDs.",
      "MIGRATION_ITEMS_INVALID",
      undefined,
      2,
    );
  }
  const from = id === "mode-source-to-package-v1" ? "source" : "package";
  const to = from === "source" ? "package" : "source";
  return planBase({
    project,
    id,
    target: "mode",
    execution: "manual-only",
    sourceVersion: from,
    targetVersion: to,
    steps: items.flatMap((item, index): readonly MigrationStep[] => [
      {
        sequence: index * 2 + 1,
        id: `${id}:${item}:acquire`,
        kind: "manual",
        target: item,
        description: `Acquire the exact matching canonical ${to} release for ${item}.`,
        reversible: true,
        inverse: `Retain ${item}'s original ${from} ownership until validation succeeds.`,
      },
      {
        sequence: index * 2 + 2,
        id: `${id}:${item}:imports`,
        kind: "built-in-ast",
        target: "project TypeScript/TSX imports",
        description: `Rewrite imports for ${item} with a compiled built-in AST transform.`,
        reversible: true,
        inverse: "Apply the compiled inverse import transform.",
      },
    ]),
    manualChecklist: checklist([
      `Verify every selected item is currently owned in ${from} mode and has no unresolved transaction.`,
      `Resolve the exact matching stable ${to} release and Contract versions without semver drift.`,
      "Protect locally changed source with ordinary Semantic Sync resolution before any removal.",
      "Rewrite imports with only the compiled built-in AST adapter.",
      "Commit ownership, dependency, base, lockfile, and source changes in one recoverable transaction.",
    ]),
    items: items.map((item) => `official:${item}`),
    fileOperations: [],
    mutations: [],
  });
}

function migrationProjectValidator(expectedBytes: Buffer): TransactionValidator {
  const expectedByteDigest = sha256(expectedBytes);
  const expectedValue = validateMergoraConfig(
    JSON.parse(expectedBytes.toString("utf8")) as unknown,
  );
  const expectedDocument = canonicalJson(expectedValue);
  const validate = (context: TransactionValidationContext): TransactionValidationResult => {
    const issues: TransactionValidationIssue[] = [];
    const bytes = context.readFile(CONFIG_PATH);
    try {
      if (bytes === null || sha256(bytes) !== expectedByteDigest) throw new Error("byte mismatch");
      const value = validateMergoraConfig(JSON.parse(bytes.toString("utf8")) as unknown);
      if (canonicalJson(value) !== expectedDocument) throw new Error("semantic mismatch");
    } catch {
      issues.push({
        code: "MIGRATION_PROJECT_CONFIG_INVALID",
        target: CONFIG_PATH,
        message: "The migrated project configuration differs from the reviewed schema-v1 state.",
      });
    }
    return transactionValidationResult(
      `Validated migrated project configuration in the ${context.phase} view.`,
      `Migrated project configuration validation failed in the ${context.phase} view.`,
      issues,
    );
  };
  return {
    id: "migration-project-config",
    label: "project-configured",
    validateStagedOverlay: validate,
    validatePostCommit: validate,
  };
}

function withMigrationValidationSuite(
  planned: PlannedMigration,
  validators: readonly TransactionValidator[],
): PlannedMigration {
  const { planDigest: _planDigest, ...semantic } = planned.plan;
  return {
    plan: finalizeOperationPlan({
      ...semantic,
      validationSuite:
        planned.details.execution === "transaction"
          ? validationSuiteForTransaction(validators)
          : ["schema"],
    }),
    details: planned.details,
  };
}

function buildMigrationPlan(options: MigrationOptions): InternalMigrationPlan {
  const root = validatedProjectRoot(options.projectRoot);
  const selected = checkedMigrationId(options);
  const project = projectDigests(root);
  let planned: PlannedMigration;
  let mutations: readonly TransactionMutation[] = [];
  if (selected.id === "config-v0-to-v1") {
    const built = configPlan(root, project, selected.id);
    planned = built.plan;
    mutations = built.mutations;
  } else if (selected.id === "shadcn-components-v1-to-mergora-v1") {
    const built = shadcnPlan(root, project, selected.id);
    planned = built.plan;
    mutations = built.mutations;
  } else if (selected.id in FRAMEWORK_MIGRATIONS) {
    planned = frameworkPlan(project, selected.id as keyof typeof FRAMEWORK_MIGRATIONS);
  } else {
    planned = modePlan(
      project,
      selected.id as Extract<
        BuiltInMigrationId,
        "mode-package-to-source-v1" | "mode-source-to-package-v1"
      >,
      options.itemIds ?? [],
    );
  }
  const configMutation = mutations.find(
    (mutation): mutation is TransactionMutation & { readonly content: Uint8Array } =>
      mutation.target === CONFIG_PATH && mutation.content !== null,
  );
  const validators: readonly TransactionValidator[] =
    planned.details.execution === "transaction" && configMutation !== undefined
      ? [
          createMediaParseValidator("migration-media-parse", [
            { target: CONFIG_PATH, mediaType: "application/json" },
          ]),
          migrationProjectValidator(Buffer.from(configMutation.content)),
        ]
      : [];
  planned = withMigrationValidationSuite(planned, validators);
  const internal = {
    root,
    plan: planned.plan,
    details: planned.details,
    mutations,
    observedTargets:
      project.configBytes === null ? {} : { [CONFIG_PATH]: sha256(project.configBytes) },
    validators,
  } satisfies InternalMigrationPlan;
  if (planned.details.execution === "transaction") {
    validateTransactionOverlay({
      root,
      plan: planned.plan,
      mutations,
      observedTargets: internal.observedTargets,
      validators,
    });
  }
  return internal;
}

export function planMigration(options: MigrationOptions): MigrationPlan {
  return buildMigrationPlan(options).plan;
}

export function applyMigration(
  options: MigrationOptions,
  expectedPlanDigest: string,
): MigrationResult {
  const built = buildMigrationPlan(options);
  if (built.plan.planDigest !== expectedPlanDigest) {
    throw migrationError(
      "Migration plan changed before apply; review and confirm the fresh digest.",
      "MIGRATION_PLAN_STALE",
      undefined,
      8,
    );
  }
  if (built.details.execution === "manual-only") {
    throw migrationError(
      "This migration produced a manual checklist and cannot mutate project files.",
      "MIGRATION_MANUAL_REQUIRED",
      undefined,
      7,
    );
  }
  const transaction = executeTransaction({
    root: built.root,
    plan: built.plan,
    mutations: built.mutations,
    acceptedConsents: built.plan.consentRequirements.map(({ id }) => ({
      id,
      planDigest: built.plan.planDigest,
    })),
    observedTargets: built.observedTargets,
    commandArguments: options.commandArguments ?? [],
    validators: built.validators,
  });
  return {
    id: built.details.id,
    target: built.details.target,
    planDigest: built.plan.planDigest,
    transaction,
  };
}
