import { randomBytes } from "node:crypto";
import {
  closeSync,
  existsSync,
  fsyncSync,
  mkdirSync,
  openSync,
  readFileSync,
  renameSync,
  rmSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { dirname, resolve } from "node:path";

import {
  assertNoSymlinkAncestors,
  assertPortableRelativePath,
  CliError,
  sha256,
  validatedProjectRoot,
} from "./contracts.js";
import { OFFICIAL_REGISTRY_ORIGIN } from "./registry-data.js";
import {
  inspectProject,
  type Framework,
  type PackageManager,
  type ProjectInspection,
} from "./project-inspector.js";
import { PUBLIC_UI_PACKAGE } from "./generated-public-package-map.js";

export const CONFIG_SCHEMA = `${OFFICIAL_REGISTRY_ORIGIN}/schemas/config-v1.schema.json` as const;
export const MANIFEST_SCHEMA =
  `${OFFICIAL_REGISTRY_ORIGIN}/schemas/manifest-v1.schema.json` as const;

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
    readonly defaultMode: "source";
    readonly packageName: typeof PUBLIC_UI_PACKAGE;
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
    readonly tokenPreset: "workbench";
    readonly colorMode: "system";
    readonly density: "comfortable";
    readonly direction: "auto";
    readonly packageCssStrategy: "source-directive";
  };
  readonly registries: {
    readonly official: {
      readonly protocol: "mergora-v1";
      readonly origin: typeof OFFICIAL_REGISTRY_ORIGIN;
      readonly trust: "official";
    };
  };
  readonly policy: {
    readonly allowExternalRegistries: false;
    readonly allowPrereleases: false;
    readonly dependencyProtocols: readonly ["registry-semver"];
    readonly requireLicenses: true;
    readonly retainSuccessfulTransactions: 10;
    readonly maxRegistryItemBytes: 2_097_152;
    readonly maxOperationBytes: 52_428_800;
  };
  readonly formatting: {
    readonly strategy: "project";
    readonly fallback: "mergora";
    readonly lineEndings: "preserve-existing";
  };
}

export interface InitOptions {
  readonly projectRoot: string;
  readonly framework?: Framework | undefined;
  readonly sourceRoot?: string | undefined;
  readonly globalCss?: string | undefined;
  readonly aliasPrefix?: string | undefined;
  readonly packageManager?: PackageManager | undefined;
}

export interface PlannedEdit {
  readonly action: "create" | "update" | "no-op";
  readonly target: string;
  readonly beforeDigest: `sha256:${string}` | null;
  readonly afterDigest: `sha256:${string}` | null;
  readonly byteLength: number;
  readonly reason: string;
}

export interface InitPlan {
  readonly schemaVersion: 1;
  readonly command: "init";
  readonly projectRoot: ".";
  readonly detection: {
    readonly framework: Framework;
    readonly frameworkEvidence: readonly string[];
    readonly sourceRoot: string;
    readonly aliasPrefix: string;
    readonly aliasEvidence: readonly string[];
    readonly globalCss: string;
    readonly packageManager: PackageManager;
    readonly packageManagerEvidence: readonly string[];
  };
  readonly edits: readonly PlannedEdit[];
  readonly writesRequired: boolean;
  readonly planDigest: `sha256:${string}`;
  readonly warnings: readonly string[];
}

interface InternalEdit extends PlannedEdit {
  readonly content: string | null;
}

interface InternalInitPlan {
  readonly publicPlan: InitPlan;
  readonly root: string;
  readonly edits: readonly InternalEdit[];
}

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
  if (distribution.defaultMode !== "source" || distribution.packageName !== PUBLIC_UI_PACKAGE) {
    throw new CliError(
      "This CLI tranche supports the explicit source distribution defaults only.",
      {
        code: "CONFIG_DISTRIBUTION_UNSUPPORTED",
        exitCode: 7,
        target: "mergora.json",
      },
    );
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
    styling.tokenPreset !== "workbench" ||
    styling.colorMode !== "system" ||
    styling.density !== "comfortable" ||
    styling.direction !== "auto" ||
    styling.packageCssStrategy !== "source-directive"
  ) {
    throw new CliError("mergora.json styling values are unsupported by this schema tranche.", {
      code: "CONFIG_STYLING_UNSUPPORTED",
      exitCode: 7,
      target: "mergora.json",
    });
  }
  const registries = recordField(root, "registries", ["official"]);
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
    policy.allowExternalRegistries !== false ||
    policy.allowPrereleases !== false ||
    JSON.stringify(policy.dependencyProtocols) !== JSON.stringify(["registry-semver"]) ||
    policy.requireLicenses !== true ||
    policy.retainSuccessfulTransactions !== 10 ||
    policy.maxRegistryItemBytes !== 2_097_152 ||
    policy.maxOperationBytes !== 52_428_800
  ) {
    throw new CliError("mergora.json policy values are outside the supported v1 profile.", {
      code: "CONFIG_POLICY_UNSUPPORTED",
      exitCode: 7,
      target: "mergora.json",
    });
  }
  const formatting = recordField(root, "formatting", ["strategy", "fallback", "lineEndings"]);
  if (
    formatting.strategy !== "project" ||
    formatting.fallback !== "mergora" ||
    formatting.lineEndings !== "preserve-existing"
  ) {
    throw new CliError("mergora.json formatting values are outside the supported v1 profile.", {
      code: "CONFIG_FORMATTING_UNSUPPORTED",
      exitCode: 7,
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

function internalInitPlan(options: InitOptions): InternalInitPlan {
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
  if (existsSync(manifestPath)) {
    const value = jsonObject(readFileSync(manifestPath, "utf8"), ".mergora/manifest.json");
    if (value.$schema !== MANIFEST_SCHEMA || value.schemaVersion !== 1) {
      throw new CliError("Existing Mergora manifest schema identity is unsupported.", {
        code: "MANIFEST_SCHEMA_INVALID",
        exitCode: 3,
        target: ".mergora/manifest.json",
      });
    }
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
  const semantic = {
    schemaVersion: 1,
    command: "init",
    projectRoot: ".",
    detection: {
      framework: inspection.framework,
      frameworkEvidence: inspection.frameworkEvidence,
      sourceRoot: inspection.sourceRoot,
      aliasPrefix: inspection.aliasPrefix,
      aliasEvidence: inspection.aliasEvidence,
      globalCss: inspection.globalCss,
      packageManager: inspection.packageManager,
      packageManagerEvidence: inspection.packageManagerEvidence,
    },
    edits: edits.map(({ content: _content, ...edit }) => edit),
    warnings: inspection.warnings,
  } as const;
  const publicPlan: InitPlan = {
    ...semantic,
    writesRequired: edits.some(({ action }) => action !== "no-op"),
    planDigest: sha256(JSON.stringify(semantic)),
  };
  return { publicPlan, root, edits };
}

export function planInit(options: InitOptions): InitPlan {
  return internalInitPlan(options).publicPlan;
}

function writeAtomic(path: string, content: string, _operation: string): void {
  mkdirSync(dirname(path), { recursive: true });
  let temporary = "";
  let descriptor: number | null = null;
  try {
    for (let attempt = 0; attempt < 4; attempt += 1) {
      temporary = `${path}.mergora-${randomBytes(16).toString("hex")}.tmp`;
      try {
        descriptor = openSync(temporary, "wx", 0o600);
        break;
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== "EEXIST" || attempt === 3) throw error;
      }
    }
    if (descriptor === null) throw new Error("Unable to create an exclusive temporary file.");
    writeFileSync(descriptor, content, { encoding: "utf8" });
    fsyncSync(descriptor);
    const completedDescriptor = descriptor;
    descriptor = null;
    closeSync(completedDescriptor);
    renameSync(temporary, path);
    temporary = "";
  } finally {
    if (descriptor !== null) closeSync(descriptor);
    if (temporary !== "" && existsSync(temporary)) unlinkSync(temporary);
  }
}

export function applyInit(options: InitOptions, expectedPlanDigest?: string): InitPlan {
  const plan = internalInitPlan(options);
  if (expectedPlanDigest !== undefined && expectedPlanDigest !== plan.publicPlan.planDigest) {
    throw new CliError("Initialization plan changed before apply; review a fresh plan.", {
      code: "PLAN_PRECONDITION_STALE",
      exitCode: 8,
    });
  }
  const changed = plan.edits.filter(
    (edit): edit is InternalEdit & { readonly content: string } => edit.content !== null,
  );
  for (const edit of changed) {
    assertNoSymlinkAncestors(plan.root, edit.target);
    const path = resolve(plan.root, edit.target);
    const current = existsSync(path) ? readFileSync(path, "utf8") : null;
    const digest = current === null ? null : sha256(current);
    if (digest !== edit.beforeDigest) {
      throw new CliError(`Initialization target ${edit.target} changed after planning.`, {
        code: "PLAN_TARGET_STALE",
        exitCode: 8,
        target: edit.target,
      });
    }
  }
  const applied: { readonly edit: InternalEdit; readonly before: string | null }[] = [];
  try {
    for (const edit of changed) {
      assertNoSymlinkAncestors(plan.root, edit.target);
      const path = resolve(plan.root, edit.target);
      const before = existsSync(path) ? readFileSync(path, "utf8") : null;
      writeAtomic(path, edit.content, `mergora-init-${plan.publicPlan.planDigest.slice(-12)}`);
      applied.push({ edit, before });
    }
  } catch (error) {
    for (const { edit, before } of [...applied].reverse()) {
      const path = resolve(plan.root, edit.target);
      if (before === null) rmSync(path, { force: true });
      else writeAtomic(path, before, "mergora-init-rollback");
    }
    throw error;
  }
  return plan.publicPlan;
}
