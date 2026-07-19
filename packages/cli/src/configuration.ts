import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

import {
  assertNoSymlinkAncestors,
  assertPortableRelativePath,
  canonicalJson,
  CLI_VERSION,
  CliError,
  sha256,
  validatedProjectRoot,
} from "./contracts.js";
import { PUBLIC_UI_PACKAGE } from "./generated-public-package-map.js";
import { OFFICIAL_REGISTRY_ORIGIN } from "./registry-data.js";
import {
  inspectProject,
  type Framework,
  type PackageManager,
  type ProjectInspection,
} from "./project-inspector.js";
import {
  executeTransaction,
  finalizeOperationPlan,
  type OperationPlan,
  type OperationPlanFile,
  type TransactionFaultInjector,
  type TransactionMutation,
  type TransactionValidationContext,
  type TransactionValidationResult,
  type TransactionValidator,
} from "./transaction-engine.js";

export const CONFIG_SCHEMA = `${OFFICIAL_REGISTRY_ORIGIN}/schemas/config-v1.schema.json` as const;
export const MANIFEST_SCHEMA =
  `${OFFICIAL_REGISTRY_ORIGIN}/schemas/manifest-v1.schema.json` as const;

export interface MergoraRegistryConfig {
  readonly protocol: "mergora-v1" | "shadcn-v1";
  readonly origin: string;
  readonly trust: "official" | "enrolled" | "local-development";
  readonly authEnvironmentVariable?: string | undefined;
  readonly identityDigest?: `sha256:${string}` | undefined;
}

export interface MergoraConfig {
  readonly $schema: typeof CONFIG_SCHEMA;
  readonly schemaVersion: 1;
  readonly project: {
    readonly framework: Framework;
    readonly language: "typescript";
    readonly sourceRoot: string;
    readonly packageJson: "package.json";
    readonly tsconfig: "tsconfig.json";
  };
  readonly distribution: {
    readonly defaultMode: "source" | "package" | "hybrid";
    readonly packageName: string;
  };
  readonly targets: {
    readonly components: string;
    readonly hooks: string;
    readonly lib: string;
    readonly systems: string;
    readonly kits: string;
    readonly styles: string;
    readonly tokens: string;
  };
  readonly aliases: {
    readonly components: string;
    readonly hooks: string;
    readonly lib: string;
    readonly systems: string;
    readonly kits: string;
    readonly styles: string;
    readonly tokens: string;
  };
  readonly styling: {
    readonly engine: "tailwind-v4";
    readonly globalCss: string;
    readonly tokenPreset: string;
    readonly colorMode: "system" | "light" | "dark";
    readonly density: "comfortable" | "compact" | "touch";
    readonly direction: "ltr" | "rtl" | "auto";
    readonly packageCssStrategy: "source-directive" | "precompiled";
  };
  readonly registries: Readonly<Record<string, MergoraRegistryConfig>> & {
    readonly official: MergoraRegistryConfig & {
      readonly protocol: "mergora-v1";
      readonly origin: typeof OFFICIAL_REGISTRY_ORIGIN;
      readonly trust: "official";
    };
  };
  readonly policy: {
    readonly allowExternalRegistries: boolean;
    readonly allowPrereleases: boolean;
    readonly dependencyProtocols: readonly ["registry-semver"];
    readonly requireLicenses: boolean;
    readonly retainSuccessfulTransactions: number;
    readonly maxRegistryItemBytes: number;
    readonly maxOperationBytes: number;
  };
  readonly formatting: {
    readonly strategy: "project" | "mergora" | "none";
    readonly fallback: "mergora" | "none";
    readonly lineEndings: "preserve-existing" | "lf";
  };
}

export interface InitOptions {
  readonly projectRoot: string;
  readonly framework?: Framework | undefined;
  readonly sourceRoot?: string | undefined;
  readonly globalCss?: string | undefined;
  readonly aliasPrefix?: string | undefined;
  readonly packageManager?: PackageManager | undefined;
  /** Deterministic interruption seam used by transaction fault-convergence tests. */
  readonly faultInjector?: TransactionFaultInjector | undefined;
}

interface PlannedEdit {
  readonly action: "create" | "update" | "no-op";
  readonly target: string;
  readonly beforeDigest: `sha256:${string}` | null;
  readonly afterDigest: `sha256:${string}` | null;
  readonly byteLength: number;
  readonly reason: string;
}

export type InitPlan = OperationPlan;

interface InternalEdit extends PlannedEdit {
  readonly content: string | null;
}

interface InternalInitPlan {
  readonly operationPlan: OperationPlan;
  readonly root: string;
  readonly edits: readonly InternalEdit[];
}

type InitCommand = "doctor-fix" | "init";

const CONFIG_ROOT_KEYS = [
  "$schema",
  "schemaVersion",
  "project",
  "distribution",
  "targets",
  "aliases",
  "styling",
  "registries",
  "policy",
  "formatting",
] as const;

function jsonObject(text: string, label: string): Record<string, unknown> {
  try {
    const value = JSON.parse(text) as unknown;
    if (value === null || Array.isArray(value) || typeof value !== "object") throw new Error();
    return value as Record<string, unknown>;
  } catch {
    throw new CliError(`${label} must contain one valid JSON object.`, {
      code: "CONFIG_INVALID_JSON",
      exitCode: 3,
      target: label,
    });
  }
}

function exactKeys(value: Record<string, unknown>, keys: readonly string[], label: string): void {
  const actual = Object.keys(value).sort((left, right) => left.localeCompare(right, "en-US"));
  const expected = [...keys].sort((left, right) => left.localeCompare(right, "en-US"));
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new CliError(`${label} has missing or unknown fields.`, {
      code: "CONFIG_SCHEMA_INVALID",
      exitCode: 3,
      target: "mergora.json",
    });
  }
}

function recordField(
  parent: Record<string, unknown>,
  key: string,
  expectedKeys: readonly string[],
): Record<string, unknown> {
  const value = parent[key];
  if (value === null || Array.isArray(value) || typeof value !== "object") {
    throw new CliError(`mergora.json ${key} must be an object.`, {
      code: "CONFIG_SCHEMA_INVALID",
      exitCode: 3,
      target: "mergora.json",
    });
  }
  const record = value as Record<string, unknown>;
  exactKeys(record, expectedKeys, `mergora.json ${key}`);
  return record;
}

function objectField(parent: Record<string, unknown>, key: string): Record<string, unknown> {
  const value = parent[key];
  if (value === null || Array.isArray(value) || typeof value !== "object") {
    throw new CliError(`mergora.json ${key} must be an object.`, {
      code: "CONFIG_SCHEMA_INVALID",
      exitCode: 3,
      target: "mergora.json",
    });
  }
  return value as Record<string, unknown>;
}

function allowedKeys(
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
    throw new CliError(`${label} has missing or unknown fields.`, {
      code: "CONFIG_SCHEMA_INVALID",
      exitCode: 3,
      target: "mergora.json",
    });
  }
}

function stringField(record: Record<string, unknown>, key: string): string {
  const value = record[key];
  if (typeof value !== "string") {
    throw new CliError(`mergora.json ${key} must be a string.`, {
      code: "CONFIG_SCHEMA_INVALID",
      exitCode: 3,
      target: "mergora.json",
    });
  }
  return value;
}

export function validateMergoraConfig(value: unknown): MergoraConfig {
  if (value === null || Array.isArray(value) || typeof value !== "object") {
    throw new CliError("mergora.json must contain an object.", {
      code: "CONFIG_SCHEMA_INVALID",
      exitCode: 3,
      target: "mergora.json",
    });
  }
  const root = value as Record<string, unknown>;
  exactKeys(root, CONFIG_ROOT_KEYS, "mergora.json");
  if (root.$schema !== CONFIG_SCHEMA || root.schemaVersion !== 1) {
    throw new CliError(
      "mergora.json schema identity is unsupported; upgrade the CLI for future schemas.",
      {
        code: "CONFIG_SCHEMA_VERSION_UNSUPPORTED",
        exitCode: 3,
        target: "mergora.json",
      },
    );
  }
  const project = recordField(root, "project", [
    "framework",
    "language",
    "sourceRoot",
    "packageJson",
    "tsconfig",
  ]);
  const framework = project.framework;
  if (
    !(["next-app", "next-pages", "vite-react", "react"] as const).includes(framework as Framework)
  ) {
    throw new CliError("mergora.json project.framework is unsupported.", {
      code: "CONFIG_SCHEMA_INVALID",
      exitCode: 3,
      target: "mergora.json",
    });
  }
  if (
    project.language !== "typescript" ||
    project.packageJson !== "package.json" ||
    project.tsconfig !== "tsconfig.json"
  ) {
    throw new CliError("mergora.json project toolchain fields are invalid for schema v1.", {
      code: "CONFIG_SCHEMA_INVALID",
      exitCode: 3,
      target: "mergora.json",
    });
  }
  const sourceRoot = stringField(project, "sourceRoot");
  assertPortableRelativePath(sourceRoot, "Configured source root");
  const distribution = recordField(root, "distribution", ["defaultMode", "packageName"]);
  if (
    !(["source", "package", "hybrid"] as const).includes(
      distribution.defaultMode as "source" | "package" | "hybrid",
    ) ||
    typeof distribution.packageName !== "string" ||
    !/^(?:@[a-z0-9][a-z0-9._-]*\/)?[a-z0-9][a-z0-9._-]*$/u.test(distribution.packageName)
  ) {
    throw new CliError("mergora.json distribution settings are invalid.", {
      code: "CONFIG_DISTRIBUTION_INVALID",
      exitCode: 3,
      target: "mergora.json",
    });
  }
  const targets = recordField(root, "targets", [
    "components",
    "hooks",
    "lib",
    "systems",
    "kits",
    "styles",
    "tokens",
  ]);
  const aliases = recordField(root, "aliases", [
    "components",
    "hooks",
    "lib",
    "systems",
    "kits",
    "styles",
    "tokens",
  ]);
  for (const key of Object.keys(targets)) {
    assertPortableRelativePath(stringField(targets, key), `Configured target ${key}`);
    const alias = stringField(aliases, key);
    if (
      !/^[@~][a-zA-Z0-9._-]*(?:\/[a-zA-Z0-9][a-zA-Z0-9._-]*)*$/u.test(alias) ||
      alias.split("/").some((segment) => segment === "." || segment === "..")
    ) {
      throw new CliError(
        `Configured alias ${key} must use one portable @ or ~ project-alias path.`,
        {
          code: "CONFIG_ALIAS_INVALID",
          exitCode: 3,
          target: "mergora.json",
        },
      );
    }
  }
  const portableTargets = Object.values(targets).map((target) =>
    String(target).normalize("NFC").toLocaleLowerCase("en-US"),
  );
  if (new Set(portableTargets).size !== portableTargets.length) {
    throw new CliError("Configured targets contain a portable case or Unicode collision.", {
      code: "CONFIG_TARGET_COLLISION",
      exitCode: 3,
      target: "mergora.json",
    });
  }
  mergoraConfigAliasPrefix(value as MergoraConfig);
  const styling = recordField(root, "styling", [
    "engine",
    "globalCss",
    "tokenPreset",
    "colorMode",
    "density",
    "direction",
    "packageCssStrategy",
  ]);
  assertPortableRelativePath(stringField(styling, "globalCss"), "Configured global CSS");
  if (
    styling.engine !== "tailwind-v4" ||
    typeof styling.tokenPreset !== "string" ||
    !/^[a-z0-9]+(?:-[a-z0-9]+)*$/u.test(styling.tokenPreset) ||
    !(["system", "light", "dark"] as const).includes(
      styling.colorMode as "system" | "light" | "dark",
    ) ||
    !(["comfortable", "compact", "touch"] as const).includes(
      styling.density as "comfortable" | "compact" | "touch",
    ) ||
    !(["ltr", "rtl", "auto"] as const).includes(styling.direction as "ltr" | "rtl" | "auto") ||
    !(["source-directive", "precompiled"] as const).includes(
      styling.packageCssStrategy as "source-directive" | "precompiled",
    )
  ) {
    throw new CliError("mergora.json styling values are invalid for schema v1.", {
      code: "CONFIG_STYLING_INVALID",
      exitCode: 3,
      target: "mergora.json",
    });
  }
  const registries = objectField(root, "registries");
  const registryIds = Object.keys(registries);
  if (
    registryIds.length < 1 ||
    registryIds.length > 32 ||
    registryIds.some((id) => !/^[a-z0-9]+(?:-[a-z0-9]+)*$/u.test(id)) ||
    !Object.hasOwn(registries, "official")
  ) {
    throw new CliError("mergora.json registries must include 1-32 portable identities.", {
      code: "CONFIG_REGISTRY_INVALID",
      exitCode: 3,
      target: "mergora.json",
    });
  }
  for (const id of registryIds) {
    const registry = objectField(registries, id);
    allowedKeys(
      registry,
      ["protocol", "origin", "trust"],
      ["authEnvironmentVariable", "identityDigest"],
      `mergora.json registry ${id}`,
    );
    if (registry.protocol !== "mergora-v1" && registry.protocol !== "shadcn-v1") {
      throw new CliError(`Registry ${id} has an unsupported protocol.`, {
        code: "CONFIG_REGISTRY_INVALID",
        exitCode: 3,
        target: "mergora.json",
      });
    }
    if (typeof registry.origin !== "string") {
      throw new CliError(`Registry ${id} origin must be a URL.`, {
        code: "CONFIG_REGISTRY_INVALID",
        exitCode: 3,
        target: "mergora.json",
      });
    }
    let origin: URL;
    try {
      origin = new URL(registry.origin);
    } catch {
      throw new CliError(`Registry ${id} origin must be a valid absolute URL.`, {
        code: "CONFIG_REGISTRY_INVALID",
        exitCode: 3,
        target: "mergora.json",
      });
    }
    const localHttp =
      origin.protocol === "http:" &&
      (origin.hostname === "localhost" || origin.hostname === "127.0.0.1");
    if (
      (origin.protocol !== "https:" && !localHttp) ||
      origin.username !== "" ||
      origin.password !== "" ||
      origin.search !== "" ||
      origin.hash !== ""
    ) {
      throw new CliError(`Registry ${id} origin violates the transport or credential policy.`, {
        code: "CONFIG_REGISTRY_SECURITY_INVALID",
        exitCode: 5,
        target: "mergora.json",
      });
    }
    if (
      registry.trust !== "official" &&
      registry.trust !== "enrolled" &&
      registry.trust !== "local-development"
    ) {
      throw new CliError(`Registry ${id} trust tier is invalid.`, {
        code: "CONFIG_REGISTRY_INVALID",
        exitCode: 3,
        target: "mergora.json",
      });
    }
    if (localHttp !== (registry.trust === "local-development")) {
      throw new CliError(`Registry ${id} localhost transport and trust tier do not agree.`, {
        code: "CONFIG_REGISTRY_SECURITY_INVALID",
        exitCode: 5,
        target: "mergora.json",
      });
    }
    if (
      registry.authEnvironmentVariable !== undefined &&
      (typeof registry.authEnvironmentVariable !== "string" ||
        !/^[A-Z_][A-Z0-9_]*$/u.test(registry.authEnvironmentVariable))
    ) {
      throw new CliError(`Registry ${id} auth environment variable name is invalid.`, {
        code: "CONFIG_REGISTRY_INVALID",
        exitCode: 3,
        target: "mergora.json",
      });
    }
    if (
      registry.identityDigest !== undefined &&
      (typeof registry.identityDigest !== "string" ||
        !/^sha256:[a-f0-9]{64}$/u.test(registry.identityDigest))
    ) {
      throw new CliError(`Registry ${id} identity digest is invalid.`, {
        code: "CONFIG_REGISTRY_INVALID",
        exitCode: 3,
        target: "mergora.json",
      });
    }
    if (id !== "official" && registry.identityDigest === undefined) {
      throw new CliError(`Registry ${id} must pin its accepted identity digest.`, {
        code: "CONFIG_REGISTRY_IDENTITY_REQUIRED",
        exitCode: 5,
        target: "mergora.json",
      });
    }
  }
  const official = recordField(registries, "official", ["protocol", "origin", "trust"]);
  if (
    official.protocol !== "mergora-v1" ||
    official.origin !== OFFICIAL_REGISTRY_ORIGIN ||
    official.trust !== "official"
  ) {
    throw new CliError("The compiled official registry identity does not match mergora.json.", {
      code: "CONFIG_REGISTRY_IDENTITY_INVALID",
      exitCode: 5,
      target: "mergora.json",
    });
  }
  const policy = recordField(root, "policy", [
    "allowExternalRegistries",
    "allowPrereleases",
    "dependencyProtocols",
    "requireLicenses",
    "retainSuccessfulTransactions",
    "maxRegistryItemBytes",
    "maxOperationBytes",
  ]);
  if (
    typeof policy.allowExternalRegistries !== "boolean" ||
    typeof policy.allowPrereleases !== "boolean" ||
    JSON.stringify(policy.dependencyProtocols) !== JSON.stringify(["registry-semver"]) ||
    typeof policy.requireLicenses !== "boolean" ||
    !Number.isInteger(policy.retainSuccessfulTransactions) ||
    (policy.retainSuccessfulTransactions as number) < 0 ||
    (policy.retainSuccessfulTransactions as number) > 100 ||
    !Number.isInteger(policy.maxRegistryItemBytes) ||
    (policy.maxRegistryItemBytes as number) < 1 ||
    (policy.maxRegistryItemBytes as number) > 52_428_800 ||
    !Number.isInteger(policy.maxOperationBytes) ||
    (policy.maxOperationBytes as number) < 1 ||
    (policy.maxOperationBytes as number) > 1_073_741_824
  ) {
    throw new CliError("mergora.json policy values are invalid for schema v1.", {
      code: "CONFIG_POLICY_INVALID",
      exitCode: 3,
      target: "mergora.json",
    });
  }
  if (registryIds.length > 1 && policy.allowExternalRegistries !== true) {
    throw new CliError("External registries require policy.allowExternalRegistries=true.", {
      code: "CONFIG_REGISTRY_POLICY_REQUIRED",
      exitCode: 5,
      target: "mergora.json",
    });
  }
  const formatting = recordField(root, "formatting", ["strategy", "fallback", "lineEndings"]);
  if (
    !(["project", "mergora", "none"] as const).includes(
      formatting.strategy as "project" | "mergora" | "none",
    ) ||
    !(["mergora", "none"] as const).includes(formatting.fallback as "mergora" | "none") ||
    !(["preserve-existing", "lf"] as const).includes(
      formatting.lineEndings as "preserve-existing" | "lf",
    )
  ) {
    throw new CliError("mergora.json formatting values are invalid for schema v1.", {
      code: "CONFIG_FORMATTING_INVALID",
      exitCode: 3,
      target: "mergora.json",
    });
  }
  return value as MergoraConfig;
}

const ALIAS_SUFFIXES = {
  components: "components/mergora",
  hooks: "hooks/mergora",
  lib: "lib/mergora",
  systems: "components/mergora-systems",
  kits: "features/mergora-kits",
  styles: "styles/mergora",
  tokens: "styles/mergora/tokens",
} as const;

export function mergoraConfigAliasPrefix(config: MergoraConfig): string {
  const componentSuffix = `/${ALIAS_SUFFIXES.components}`;
  if (!config.aliases.components.endsWith(componentSuffix)) {
    throw new CliError("Configured component alias does not match its required semantic target.", {
      code: "CONFIG_ALIAS_TOPOLOGY_INVALID",
      exitCode: 3,
      target: "mergora.json",
    });
  }
  const prefix = config.aliases.components.slice(0, -componentSuffix.length);
  for (const [key, suffix] of Object.entries(ALIAS_SUFFIXES)) {
    if (config.aliases[key as keyof MergoraConfig["aliases"]] !== `${prefix}/${suffix}`) {
      throw new CliError("Configured aliases do not share one deterministic semantic prefix.", {
        code: "CONFIG_ALIAS_TOPOLOGY_INVALID",
        exitCode: 3,
        target: "mergora.json",
      });
    }
  }
  return prefix;
}

export function readMergoraConfig(root: string): MergoraConfig | null {
  const path = resolve(root, "mergora.json");
  if (!existsSync(path)) return null;
  assertNoSymlinkAncestors(root, "mergora.json");
  return validateMergoraConfig(jsonObject(readFileSync(path, "utf8"), "mergora.json"));
}

function rootPath(sourceRoot: string, suffix: string): string {
  return `${sourceRoot}/${suffix}`;
}

function aliasPath(prefix: string, suffix: string): string {
  return `${prefix}/${suffix}`;
}

export function createMergoraConfig(inspection: ProjectInspection): MergoraConfig {
  const { sourceRoot, aliasPrefix } = inspection;
  return {
    $schema: CONFIG_SCHEMA,
    schemaVersion: 1,
    project: {
      framework: inspection.framework,
      language: "typescript",
      sourceRoot,
      packageJson: "package.json",
      tsconfig: "tsconfig.json",
    },
    distribution: { defaultMode: "source", packageName: PUBLIC_UI_PACKAGE },
    targets: {
      components: rootPath(sourceRoot, "components/mergora"),
      hooks: rootPath(sourceRoot, "hooks/mergora"),
      lib: rootPath(sourceRoot, "lib/mergora"),
      systems: rootPath(sourceRoot, "components/mergora-systems"),
      kits: rootPath(sourceRoot, "features/mergora-kits"),
      styles: rootPath(sourceRoot, "styles/mergora"),
      tokens: rootPath(sourceRoot, "styles/mergora/tokens"),
    },
    aliases: {
      components: aliasPath(aliasPrefix, "components/mergora"),
      hooks: aliasPath(aliasPrefix, "hooks/mergora"),
      lib: aliasPath(aliasPrefix, "lib/mergora"),
      systems: aliasPath(aliasPrefix, "components/mergora-systems"),
      kits: aliasPath(aliasPrefix, "features/mergora-kits"),
      styles: aliasPath(aliasPrefix, "styles/mergora"),
      tokens: aliasPath(aliasPrefix, "styles/mergora/tokens"),
    },
    styling: {
      engine: "tailwind-v4",
      globalCss: inspection.globalCss,
      tokenPreset: "workbench",
      colorMode: "system",
      density: "comfortable",
      direction: "auto",
      packageCssStrategy: "source-directive",
    },
    registries: {
      official: { protocol: "mergora-v1", origin: OFFICIAL_REGISTRY_ORIGIN, trust: "official" },
    },
    policy: {
      allowExternalRegistries: false,
      allowPrereleases: false,
      dependencyProtocols: ["registry-semver"],
      requireLicenses: true,
      retainSuccessfulTransactions: 10,
      maxRegistryItemBytes: 2_097_152,
      maxOperationBytes: 52_428_800,
    },
    formatting: {
      strategy: "project",
      fallback: "mergora",
      lineEndings: "preserve-existing",
    },
  };
}

function prettyJson(value: unknown): string {
  return `${JSON.stringify(value, null, 2)}\n`;
}

function manifestText(configText: string): string {
  return prettyJson({
    $schema: MANIFEST_SCHEMA,
    schemaVersion: 1,
    projectId: sha256(configText),
    toolchain: { cli: "0.0.0", schema: "1.0.0", transformer: "0.0.0", formatter: "mergora@1" },
    items: {},
    sharedTargets: {},
    dependencyOwners: {},
  });
}

const IGNORE_RULES = [
  ".mergora/cache/",
  ".mergora/transactions/",
  ".mergora/tmp/",
  ".mergora/.lock",
] as const;

function gitignoreText(existing: string | null): string {
  const present = new Set(
    (existing ?? "")
      .split(/\r?\n/gu)
      .map((line) => line.trim())
      .filter((line) => line !== "" && !line.startsWith("#")),
  );
  const missing = IGNORE_RULES.filter((rule) => !present.has(rule));
  if (missing.length === 0) return existing ?? "";
  const newline = existing?.includes("\r\n") === true ? "\r\n" : "\n";
  const prefix =
    existing === null || existing === ""
      ? ""
      : existing.endsWith("\n")
        ? existing
        : `${existing}${newline}`;
  const separator = prefix === "" || /(?:^|\r?\n)\s*$/u.test(prefix) ? "" : newline;
  return `${prefix}${separator}# Mergora local-only state${newline}${missing.join(newline)}${newline}`;
}

function editFor(root: string, target: string, content: string, reason: string): InternalEdit {
  assertPortableRelativePath(target, "Initialization target");
  assertNoSymlinkAncestors(root, target);
  const path = resolve(root, target);
  const before = existsSync(path) ? readFileSync(path, "utf8") : null;
  const unchanged = before === content;
  return {
    action: unchanged ? "no-op" : before === null ? "create" : "update",
    target,
    beforeDigest: before === null ? null : sha256(before),
    afterDigest: unchanged ? (before === null ? null : sha256(before)) : sha256(content),
    byteLength: Buffer.byteLength(content),
    reason,
    content: unchanged ? null : content,
  };
}

function initOperation(edit: InternalEdit): OperationPlanFile {
  return {
    operation:
      edit.action === "create" ? "add" : edit.action === "update" ? "fast-forward" : "no-op",
    target: edit.target,
    owner: "official:init",
    base: edit.beforeDigest,
    local: edit.beforeDigest,
    remote: edit.afterDigest,
    proposed: edit.afterDigest,
    mediaType: edit.target.endsWith(".json") ? "application/json" : "text/plain",
    risk: "ordinary",
    reason: edit.reason,
  };
}

function validateInitConfig(context: TransactionValidationContext): TransactionValidationResult {
  const bytes = context.readFile("mergora.json");
  if (bytes === null) {
    return {
      state: "fail",
      summary: "The initialized project configuration is missing.",
      issues: [
        {
          code: "CONFIG_MISSING",
          target: "mergora.json",
          message: "The transaction view has no mergora.json file.",
        },
      ],
    };
  }
  try {
    validateMergoraConfig(JSON.parse(bytes.toString("utf8")) as unknown);
    return {
      state: "pass",
      summary: `mergora.json is valid during ${context.phase} validation.`,
    };
  } catch (error) {
    return {
      state: "fail",
      summary: "The initialized project configuration is invalid.",
      issues: [
        {
          code: error instanceof CliError ? error.code : "CONFIG_INVALID_JSON",
          target: "mergora.json",
          message: error instanceof Error ? error.message : "Configuration validation failed.",
        },
      ],
    };
  }
}

const INIT_CONFIG_VALIDATOR: TransactionValidator = {
  id: "init-config-v1",
  label: "project-configured",
  validateStagedOverlay: validateInitConfig,
  validatePostCommit: validateInitConfig,
};

function compatibleOverrides(config: MergoraConfig, options: InitOptions): void {
  const conflicts: readonly [unknown, unknown, string][] = [
    [options.framework, config.project.framework, "framework"],
    [options.sourceRoot, config.project.sourceRoot, "source root"],
    [options.globalCss, config.styling.globalCss, "global CSS"],
  ];
  for (const [provided, configured, label] of conflicts) {
    if (provided !== undefined && provided !== configured) {
      throw new CliError(`Explicit ${label} conflicts with committed mergora.json.`, {
        code: "INIT_CONFIG_CONFLICT",
        exitCode: 3,
        target: "mergora.json",
      });
    }
  }
  if (
    options.aliasPrefix !== undefined &&
    !Object.values(config.aliases).every(
      (alias) => alias === options.aliasPrefix || alias.startsWith(`${options.aliasPrefix}/`),
    )
  ) {
    throw new CliError("Explicit alias prefix conflicts with committed mergora.json.", {
      code: "INIT_CONFIG_CONFLICT",
      exitCode: 3,
      target: "mergora.json",
    });
  }
}

function internalInitPlan(options: InitOptions, command: InitCommand): InternalInitPlan {
  const root = validatedProjectRoot(options.projectRoot);
  const configured = readMergoraConfig(root);
  if (configured !== null) compatibleOverrides(configured, options);
  const inspection = inspectProject(root, {
    framework: configured?.project.framework ?? options.framework,
    sourceRoot: configured?.project.sourceRoot ?? options.sourceRoot,
    globalCss: configured?.styling.globalCss ?? options.globalCss,
    aliasPrefix:
      options.aliasPrefix ??
      (configured === null ? undefined : mergoraConfigAliasPrefix(configured)),
    packageManager: options.packageManager,
  });
  const config = configured ?? createMergoraConfig(inspection);
  assertNoSymlinkAncestors(root, "mergora.json");
  const configText =
    configured === null ? prettyJson(config) : readFileSync(resolve(root, "mergora.json"), "utf8");
  const configEdit = editFor(
    root,
    "mergora.json",
    configText,
    "Commit explicit detected project configuration.",
  );
  assertNoSymlinkAncestors(root, ".mergora/manifest.json");
  const manifestPath = resolve(root, ".mergora/manifest.json");
  let manifestEdit: InternalEdit;
  let manifestPreconditionDigest: `sha256:${string}` | null;
  if (existsSync(manifestPath)) {
    const value = jsonObject(readFileSync(manifestPath, "utf8"), ".mergora/manifest.json");
    if (value.$schema !== MANIFEST_SCHEMA || value.schemaVersion !== 1) {
      throw new CliError("Existing Mergora manifest schema identity is unsupported.", {
        code: "MANIFEST_SCHEMA_INVALID",
        exitCode: 3,
        target: ".mergora/manifest.json",
      });
    }
    manifestPreconditionDigest = sha256(canonicalJson(value));
    manifestEdit = editFor(
      root,
      ".mergora/manifest.json",
      readFileSync(manifestPath, "utf8"),
      "Preserve the existing provenance manifest byte-for-byte.",
    );
  } else {
    manifestEdit = editFor(
      root,
      ".mergora/manifest.json",
      manifestText(configText),
      "Create the portable empty provenance manifest.",
    );
    manifestPreconditionDigest = null;
  }
  assertNoSymlinkAncestors(root, ".gitignore");
  const gitignorePath = resolve(root, ".gitignore");
  const existingIgnore = existsSync(gitignorePath) ? readFileSync(gitignorePath, "utf8") : null;
  const ignoreEdit = editFor(
    root,
    ".gitignore",
    gitignoreText(existingIgnore),
    "Ignore only local cache, transaction, temporary, and lock state.",
  );
  const edits = [configEdit, ignoreEdit, manifestEdit];
  const writesRequired = edits.some(({ action }) => action !== "no-op");
  const warnings = [
    `Detected framework ${inspection.framework} from ${inspection.frameworkEvidence.join(", ")}.`,
    `Detected source root ${inspection.sourceRoot}, alias prefix ${inspection.aliasPrefix}, and global CSS ${inspection.globalCss}.`,
    `Detected package manager ${inspection.packageManager} from ${inspection.packageManagerEvidence.join(", ")}.`,
    ...inspection.warnings,
  ];
  const operationPlan = finalizeOperationPlan({
    schemaVersion: 1,
    command,
    cliVersion: CLI_VERSION,
    projectRoot: ".",
    configDigest: sha256(canonicalJson(config)),
    manifestPreconditionDigest,
    registries: [],
    items: [],
    fileOperations: edits.map(initOperation),
    dependencyChanges: [],
    structuredPatches: [],
    migrations: [],
    contractChanges: [],
    warnings,
    consentRequirements: writesRequired
      ? [
          {
            id: command === "init" ? "init-project-writes" : "doctor-fix-project-writes",
            flag: "--yes",
            reason:
              command === "init"
                ? "Initialize the reviewed project metadata files."
                : "Apply the reviewed safe project metadata repairs.",
          },
        ]
      : [],
    conflicts: [],
    estimatedBytes: {
      download: 0,
      write: edits.reduce(
        (total, edit) => total + (edit.action === "no-op" ? 0 : edit.byteLength),
        0,
      ),
    },
    validationSuite: ["schema", "digest", "path", "collision", "ownership", "project-configured"],
    rollbackAvailable: true,
  });
  return { operationPlan, root, edits };
}

export function planInit(options: InitOptions): InitPlan {
  return internalInitPlan(options, "init").operationPlan;
}

export function planDoctorFix(options: InitOptions): OperationPlan {
  return internalInitPlan(options, "doctor-fix").operationPlan;
}

function applyInitCommand(
  options: InitOptions,
  expectedPlanDigest: string,
  command: InitCommand,
): OperationPlan {
  const plan = internalInitPlan(options, command);
  const label = command === "init" ? "Initialization" : "Doctor fix";
  if (expectedPlanDigest === undefined) {
    throw new CliError(`${label} requires the exact reviewed plan digest before apply.`, {
      code: "PLAN_PRECONDITION_REQUIRED",
      exitCode: 8,
    });
  }
  if (expectedPlanDigest !== plan.operationPlan.planDigest) {
    throw new CliError(`${label} plan changed before apply; review a fresh plan.`, {
      code: "PLAN_PRECONDITION_STALE",
      exitCode: 8,
    });
  }
  const mutations: TransactionMutation[] = plan.edits.flatMap((edit) =>
    edit.content === null
      ? []
      : [
          {
            target: edit.target,
            content: Buffer.from(edit.content, "utf8"),
            beforeDigest: edit.beforeDigest,
            ...(edit.target === ".mergora/manifest.json" ? { manifest: true as const } : {}),
          },
        ],
  );
  executeTransaction({
    root: plan.root,
    plan: plan.operationPlan,
    mutations,
    acceptedConsents: plan.operationPlan.consentRequirements.map(({ id }) => ({
      id,
      planDigest: plan.operationPlan.planDigest,
    })),
    commandArguments: command === "init" ? ["init"] : ["doctor", "--fix"],
    faultInjector: options.faultInjector,
    validators: [INIT_CONFIG_VALIDATOR],
  });
  return plan.operationPlan;
}

export function applyInit(options: InitOptions, expectedPlanDigest: string): InitPlan {
  return applyInitCommand(options, expectedPlanDigest, "init");
}

export function applyDoctorFix(options: InitOptions, expectedPlanDigest: string): OperationPlan {
  return applyInitCommand(options, expectedPlanDigest, "doctor-fix");
}
