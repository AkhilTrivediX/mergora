#!/usr/bin/env node

import {
  allowedCliFlags,
  cliFlagKind,
  isCliCommand,
  isJsonResultStatus,
  type CliCommand,
  type CliFlag,
} from "./command-contract.js";

class CommandUsageError extends Error {
  public constructor(message: string) {
    super(message);
    this.name = "CommandUsageError";
  }
}

const HELP = `Mergora CLI

Usage:
  mergora <command> [arguments] [options]

Discovery and project commands:
  create <directory>   Create a deterministic Next or Vite React project
  init                 Inspect and initialize a supported React project
  search [query]       Search bundled unreleased data or an exact acquired release
  view <item...>       Inspect item metadata, targets, and dependencies
  docs <item|topic>    Print canonical documentation
  info                 Report local project and CLI compatibility
  status               Classify local manifest and owned file state
  diff [item...]       Inspect local and verified upstream differences
  doctor               Check project configuration and integrity
  audit [item...]      Run installed local quality Contracts
  theme <action>       Inspect, export, import, or apply DTCG themes
  migrate <target>     Plan trusted built-in project migrations
  registry <action>    Inspect, enroll, remove, or verify registries
  vendor [item...]     Create or verify a deterministic offline snapshot
  clean                Report or remove explicitly selected local artifacts

Transactional source commands:
  add <item...>        Add canonical source and provenance transactionally
  remove <item...>     Remove only demonstrably owned source
  update [item...]     Run deterministic B/L/R Semantic Sync
  resolve <id>         Resolve one staged Semantic Sync conflict bundle
  adopt <item...>      Adopt exact recognizable existing source
  rollback <id>        Restore a completed transaction's exact pre-state
  recover              Resume or roll back an incomplete transaction

Common options:
  --cwd <path>         Explicit project root candidate (--root remains an add alias)
  --config <path>      Explicit project-relative config (currently mergora.json)
  --registry <id>      Select a registry where supported (currently official)
  --json               Emit one versioned JSON result envelope
  --dry-run            Resolve and emit the exact plan without writing
  --plan               Alias for a read-only exact plan
  --yes                Accept an ordinary conflict-free exact plan
  --non-interactive    Never prompt; missing consent fails safely
  --offline            Forbid network access and require verified local evidence
  --no-install         Skip package-manager invocation and report required work
  --package-manager <npm|pnpm|yarn|bun>
  --color <always|auto|never>  Human output only; no ANSI is emitted today
  --verbose            Add redacted decision context without changing behavior

Run "mergora <command> --help" for the exact supported option subset.`;

const COMMAND_HELP: Readonly<Record<string, string>> = {
  create: `Usage: mergora create <directory> --template <next|vite>
                      --package-manager <npm|pnpm|yarn|bun>
                      --preset <minimal|application|none>
                      [--cwd <parent>] [--no-install] [--plan|--dry-run] [--yes]

Creates a versioned minimal project, runs Mergora initialization, and never
initializes Git. Missing required choices are prompted only on an interactive TTY.`,
  init: `Usage: mergora init [--cwd <path>] [--framework <next-app|next-pages|vite-react|react>]
                    [--source-root <path>] [--global-css <path>] [--alias-prefix <prefix>]
                    [--package-manager <manager>] [--plan|--dry-run] [--yes]

Creates only mergora.json, the empty portable manifest, and narrow local-state
.gitignore rules. Existing package.json, tsconfig.json, and CSS bytes are preserved.`,
  search: `Usage: mergora search [query] [--kind <kind>] [--category <category>]
                      [--maturity <maturity>] [--tag <tag>] [--limit <1-100>]
                      [--release-file <project-relative-path>] [--cwd <path>]
                      [--offline] [--json]

An exact native release reference never falls back to bundled unreleased data.
Offline acquisition requires the referenced artifacts in the verified cache.`,
  view: `Usage: mergora view <item...> [--files] [--source <logical-path>]
                    [--release-file <project-relative-path>] [--cwd <path>]
                    [--offline] [--json]

An exact native release reference acquires the requested dependency closure and
never falls back to bundled unreleased data.`,
  docs: `Usage: mergora docs <item|topic> [--format <markdown|json|url>] [--open]

--open is ignored in CI/non-interactive mode and never sends project data.`,
  info: `Usage: mergora info [--cwd <path>] [--json]`,
  status: `Usage: mergora status [--cwd <path>] [--json]

Status is local-only in this tranche.`,
  doctor: `Usage: mergora doctor [--cwd <path>] [--json] [--fix --plan|--dry-run|--yes]

--fix is limited to the same safe initialization edits and cannot touch source.`,
  audit: `Usage: mergora audit [item...] [--static|--browser|--a11y|--keyboard|--responsive|--all]
                    [--changed] [--cwd <path>] [--json]

Runs immutable Contract snapshots against locally installed source. Runtime modes
without an enrolled harness report unavailable evidence and never fabricate a pass.`,
  add: `Usage: mergora add <item...> [--root|--cwd <path>] [--target <relative-path>]
                   [--release-file <project-relative-path>] [--no-install] [--offline]
                   [--plan|--dry-run] [--yes] [--json]

Stages the complete dependency closure, validates it, backs up every authoritative
target, commits the provenance manifest last, and rolls back on failure.`,
  remove: `Usage: mergora remove <item...> [--cwd <path>] [--keep-files]
                      [--no-install] [--plan|--dry-run] [--yes] [--json]

Deletes source only when live bytes equal a verified owned base. --keep-files
detaches provenance without deleting source.`,
  adopt: `Usage: mergora adopt <item...> [--cwd <path>] [--target <relative-path>]
                     [--plan|--dry-run] [--yes] [--json]

Records provenance only when every existing source file exactly matches the explicit
bundled payload and transform mapping. Divergent or ambiguous source is refused.`,
  rollback: `Usage: mergora rollback <transaction-id>|--last [--cwd <path>]
                        [--no-install] [--offline] [--plan|--dry-run] [--yes] [--json]

Restores the exact recorded pre-state only when every current target still matches
the completed transaction's post-state. The restoration is itself transactional.`,
  recover: `Usage: mergora recover [--cwd <path>] [--transaction <id>]
                       [--strategy <auto|rollback|resume>] [--plan|--dry-run] [--yes]

Classifies recorded pre/post digests. Auto recovery is conservative; ambiguous live
state is never changed.`,
  diff: `Usage: mergora diff [item...] [--cwd <path>] [--release-file <path>]
                    [--local|--upstream] [--stat|--name-only] [--format json]

Reads immutable Base and live Local bytes without writing. --upstream requires an
explicitly acquired project-relative release snapshot and adds the B/L/R proposal.`,
  update: `Usage: mergora update <item...>|--all --release-file <path> [--cwd <path>]
                      [--no-install] [--offline] [--plan|--dry-run] [--yes] [--json]

Accepts either the legacy immutable Semantic Sync snapshot or a schema-discriminated
official native release reference. Acquired releases never fall back to bundled data.
It plans exact B/L/R merges and changes no authoritative bytes on conflict.`,
  resolve: `Usage: mergora resolve <transaction-id> [--list]
                       [--take-local <target>|--take-upstream <target>|
                        --resolved <target>|--reset <target>]
                       [--apply] [--plan|--dry-run] [--yes] [--json]

Resolution choices are exact-target and digest-bound. Repeat a choice flag for
multiple targets. --apply rechecks every live/base/snapshot precondition.`,
  registry: `Usage: mergora registry list [--cwd <path>]
       mergora registry inspect <id> [--offline] [--cwd <path>]
       mergora registry enroll <id> <origin> [--protocol <mergora-v1|shadcn-v1>]
                         [--auth-env <NAME>] [--allow-insecure-localhost]
                         [--accept-registry-identity <sha256:digest>] [--plan|--dry-run]
       mergora registry remove <id> [--plan|--dry-run] [--yes]
       mergora registry verify <id> [--offline]

Enrollment is bound to the retrieved identity digest; --yes alone never accepts a
new origin. Offline inspection and verification perform no fetch.`,
  theme: `Usage: mergora theme list [--cwd <path>]
       mergora theme preview <preset-or-file> [--cwd <path>]
       mergora theme export <preset-or-file> --format <dtcg|css|tailwind>
       mergora theme apply <preset-or-file> [--target <path>]
                     [--acknowledge <issue-id>] [--plan|--dry-run] [--yes]
       mergora theme import <file> [--target <path>]
                      [--acknowledge <issue-id>] [--plan|--dry-run] [--yes]

Official accessibility failures are blocked. Custom failures require every exact
issue ID; repeat --acknowledge for multiple issues. There is no blanket bypass.`,
  migrate: `Usage: mergora migrate <config|shadcn> [--plan|--dry-run] [--yes]
       mergora migrate <framework|mode|id> <built-in-id> [item...] [--plan|--dry-run]

Only migration IDs compiled into this CLI are accepted. Unsafe transformations
return a deterministic manual checklist and perform no mutation.`,
  vendor: `Usage: mergora vendor <item...>|--all-installed [--cwd <path>]
                      [--plan|--dry-run] [--yes] [--json]
       mergora vendor verify [--cwd <path>] [--json]

Creates a digest-bound, network-free snapshot of installed source, bases, schemas,
and available Contracts. verify is read-only and validates every bundled byte.`,
  clean: `Usage: mergora clean [--cache] [--transactions] [--bases] [--conflicts]
                     [--retain-transactions <count>]
                     [--plan|--dry-run] [--yes] [--cwd <path>] [--json]

Read-only by default. Each cleanup category must be selected explicitly. Live source,
the current manifest, referenced bases, vendor bundles, and active conflicts are
never candidates; apply requires consent and preserves an append-only local journal.`,
};

interface ParsedArguments {
  readonly command: CliCommand;
  readonly positionals: readonly string[];
  readonly flags: ReadonlyMap<CliFlag, readonly string[]>;
}

function normalizeArguments(arguments_: readonly string[]): readonly string[] {
  const result: string[] = [];
  for (const argument of arguments_) {
    if (argument.startsWith("--") && argument.includes("=")) {
      const index = argument.indexOf("=");
      result.push(argument.slice(0, index), argument.slice(index + 1));
    } else result.push(argument);
  }
  return result;
}

function parseArguments(arguments_: readonly string[]): ParsedArguments {
  const normalized = normalizeArguments(arguments_);
  let command: string | undefined;
  let positionalOnly = false;
  const positionals: string[] = [];
  const flags = new Map<CliFlag, string[]>();
  for (let index = 0; index < normalized.length; index += 1) {
    const argument = normalized[index]!;
    if (!positionalOnly && argument === "--") {
      positionalOnly = true;
      continue;
    }
    if (!positionalOnly && (argument === "-h" || argument === "--help")) {
      const values = flags.get("help") ?? [];
      values.push("true");
      flags.set("help", values);
      continue;
    }
    if (!positionalOnly && argument.startsWith("--")) {
      const name = argument.slice(2);
      const kind = cliFlagKind(name);
      const flag = name as CliFlag;
      if (kind === "boolean") {
        const values = flags.get(flag) ?? [];
        values.push("true");
        flags.set(flag, values);
      } else if (kind === "value") {
        const value = normalized[index + 1];
        if (value === undefined || value.startsWith("--")) {
          throw new CommandUsageError(`--${name} requires a value.`);
        }
        const values = flags.get(flag) ?? [];
        values.push(value);
        flags.set(flag, values);
        index += 1;
      } else throw new CommandUsageError(`Unknown option ${JSON.stringify(argument)}.`);
      continue;
    }
    if (!positionalOnly && argument.startsWith("-") && argument !== "-") {
      if (argument === "-v") {
        if (command !== undefined)
          throw new CommandUsageError("-v must be used without a command.");
        command = "--version";
      } else throw new CommandUsageError(`Unknown short option ${JSON.stringify(argument)}.`);
      continue;
    }
    if (command === undefined) command = argument;
    else positionals.push(argument);
  }
  if (command === undefined) throw new CommandUsageError("A command is required.");
  if (!isCliCommand(command))
    throw new CommandUsageError(`Unknown command ${JSON.stringify(command)}.`);
  return { command, positionals, flags };
}

function hasFlag(parsed: ParsedArguments, name: CliFlag): boolean {
  return parsed.flags.has(name);
}

function flagValue(parsed: ParsedArguments, name: CliFlag): string | undefined {
  const values = parsed.flags.get(name);
  if (values !== undefined && values.length > 1)
    throw new CommandUsageError(`--${name} may be provided only once.`);
  return values?.[0];
}

function flagValues(parsed: ParsedArguments, name: CliFlag): readonly string[] {
  return parsed.flags.get(name) ?? [];
}

function assertAllowedFlags(parsed: ParsedArguments, allowed: readonly CliFlag[]): void {
  const set = new Set(allowed);
  for (const name of parsed.flags.keys()) {
    if (!set.has(name))
      throw new CommandUsageError(`--${name} is not valid for ${parsed.command}.`);
  }
}

function projectRoot(parsed: ParsedArguments): string {
  const cwd = flagValue(parsed, "cwd");
  const legacy = flagValue(parsed, "root");
  if (cwd !== undefined && legacy !== undefined && cwd !== legacy) {
    throw new CommandUsageError("--cwd and --root must not select different project roots.");
  }
  const config = flagValue(parsed, "config");
  if (config !== undefined && config !== "mergora.json") {
    throw new CommandUsageError(
      "This tranche accepts only the project-relative --config mergora.json.",
    );
  }
  const registry = flagValue(parsed, "registry");
  if (registry !== undefined && registry !== "official") {
    throw new CommandUsageError("Only the compiled official registry is enrolled in this tranche.");
  }
  return cwd ?? legacy ?? process.cwd();
}

function parseManager(value: string | undefined): "npm" | "pnpm" | "yarn" | "bun" | undefined {
  if (value === undefined) return undefined;
  if (value !== "npm" && value !== "pnpm" && value !== "yarn" && value !== "bun") {
    throw new CommandUsageError("--package-manager must be npm, pnpm, yarn, or bun.");
  }
  return value;
}

function parseFramework(
  value: string | undefined,
): "next-app" | "next-pages" | "vite-react" | "react" | undefined {
  if (value === undefined) return undefined;
  if (
    value !== "next-app" &&
    value !== "next-pages" &&
    value !== "vite-react" &&
    value !== "react"
  ) {
    throw new CommandUsageError("--framework must be next-app, next-pages, vite-react, or react.");
  }
  return value;
}

function colorMode(parsed: ParsedArguments): void {
  const value = flagValue(parsed, "color");
  if (value !== undefined && value !== "always" && value !== "auto" && value !== "never") {
    throw new CommandUsageError("--color must be always, auto, or never.");
  }
}

async function confirmPlan(parsed: ParsedArguments, operation: string): Promise<boolean> {
  if (hasFlag(parsed, "yes")) return true;
  const nonInteractive =
    hasFlag(parsed, "non-interactive") || !process.stdin.isTTY || process.env.CI !== undefined;
  if (nonInteractive) return false;
  const { createInterface } = await import("node:readline/promises");
  const prompt = createInterface({ input: process.stdin, output: process.stderr });
  try {
    const answer = await prompt.question(`Apply this exact ${operation} plan? [y/N] `);
    return /^y(?:es)?$/iu.test(answer.trim());
  } finally {
    prompt.close();
  }
}

async function acceptedRegistryIdentity(
  parsed: ParsedArguments,
  identityDigest: string,
): Promise<string | undefined> {
  const supplied = flagValue(parsed, "accept-registry-identity");
  if (supplied !== undefined) return supplied;
  const nonInteractive =
    hasFlag(parsed, "non-interactive") || !process.stdin.isTTY || process.env.CI !== undefined;
  if (nonInteractive) return undefined;
  const { createInterface } = await import("node:readline/promises");
  const prompt = createInterface({ input: process.stdin, output: process.stderr });
  try {
    const answer = await prompt.question(
      `Type the exact registry identity ${identityDigest} to enroll this origin: `,
    );
    return answer.trim() === identityDigest ? identityDigest : undefined;
  } finally {
    prompt.close();
  }
}

async function requiredCreateChoice<T extends string>(
  parsed: ParsedArguments,
  flag: CliFlag,
  choices: readonly T[],
): Promise<T> {
  const supplied = flagValue(parsed, flag);
  if (supplied !== undefined) {
    if (!choices.includes(supplied as T)) {
      throw new CommandUsageError(`--${flag} must be one of ${choices.join(", ")}.`);
    }
    return supplied as T;
  }
  const nonInteractive =
    hasFlag(parsed, "non-interactive") || !process.stdin.isTTY || process.env.CI !== undefined;
  if (nonInteractive) {
    throw new CommandUsageError(
      `create requires --${flag} ${choices.join("|")} in non-interactive use.`,
    );
  }
  const { createInterface } = await import("node:readline/promises");
  const prompt = createInterface({ input: process.stdin, output: process.stderr });
  try {
    const answer = await prompt.question(`Select ${flag} (${choices.join("/")}) [${choices[0]}]: `);
    const selected = (answer.trim() === "" ? choices[0] : answer.trim()) as T;
    if (!choices.includes(selected)) {
      throw new CommandUsageError(`${flag} must be one of ${choices.join(", ")}.`);
    }
    return selected;
  } finally {
    prompt.close();
  }
}

type Api = typeof import("./index.js");

interface CommandOutput {
  readonly result: unknown;
  readonly status?: string;
  readonly exitCode?: import("./contracts.js").StableExitCode;
  readonly warnings?: readonly string[];
  readonly text: string;
  readonly raw?: string;
}

function commonProjectOptions(parsed: ParsedArguments) {
  return {
    framework: parseFramework(flagValue(parsed, "framework")),
    sourceRoot: flagValue(parsed, "source-root"),
    globalCss: flagValue(parsed, "global-css"),
    aliasPrefix: flagValue(parsed, "alias-prefix"),
    packageManager: parseManager(flagValue(parsed, "package-manager")),
  };
}

function sourceCommandOptions(parsed: ParsedArguments, root: string) {
  return {
    projectRoot: root,
    itemIds: parsed.positionals,
    targetDirectory: flagValue(parsed, "target"),
    noInstall: hasFlag(parsed, "no-install"),
    offline: hasFlag(parsed, "offline"),
    packageManager: parseManager(flagValue(parsed, "package-manager")),
    commandArguments: [
      parsed.command,
      ...parsed.positionals,
      ...[...parsed.flags.keys()].map((name) => `--${name}`),
    ],
  };
}

function recoveryStrategy(parsed: ParsedArguments): "auto" | "rollback" | "resume" | undefined {
  const value = flagValue(parsed, "strategy");
  if (value === undefined) return undefined;
  if (value !== "auto" && value !== "rollback" && value !== "resume") {
    throw new CommandUsageError("--strategy must be auto, rollback, or resume.");
  }
  return value;
}

function registryProtocol(value: string | undefined): "mergora-v1" | "shadcn-v1" | undefined {
  if (value === undefined) return undefined;
  if (value !== "mergora-v1" && value !== "shadcn-v1") {
    throw new CommandUsageError("--protocol must be mergora-v1 or shadcn-v1.");
  }
  return value;
}

function immutableRelease(parsed: ParsedArguments, root: string, api: Api) {
  const releaseFile = flagValue(parsed, "release-file");
  if (releaseFile === undefined) {
    throw new CommandUsageError(
      `${parsed.command} requires --release-file with an explicitly acquired immutable release snapshot.`,
    );
  }
  const release = api.readImmutableUpdateRelease(root, releaseFile);
  const target = flagValue(parsed, "to");
  if (target !== undefined && target !== release.release) {
    throw new CommandUsageError("--to must exactly match the immutable release snapshot version.");
  }
  return release;
}

const NATIVE_RELEASE_REFERENCE_KIND = "mergora-native-release-reference" as const;
const NATIVE_RELEASE_REFERENCE_MAX_BYTES = 16 * 1024;
const SHA256_DIGEST = /^sha256:[a-f0-9]{64}$/u;
const SEMANTIC_RELEASE =
  /^(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)(?:-[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?(?:\+[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?$/u;

interface NativeReleaseReference {
  readonly schemaVersion: 1;
  readonly artifactKind: typeof NATIVE_RELEASE_REFERENCE_KIND;
  readonly registryId: "official";
  readonly release: string;
  readonly catalog: {
    readonly digest: `sha256:${string}`;
    readonly bytes: number;
  };
  readonly manifest: {
    readonly digest: `sha256:${string}`;
    readonly bytes: number;
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function exactKeys(value: Record<string, unknown>, expected: readonly string[]): boolean {
  const actual = Object.keys(value).sort((left, right) => left.localeCompare(right, "en-US"));
  const sortedExpected = [...expected].sort((left, right) => left.localeCompare(right, "en-US"));
  return (
    actual.length === sortedExpected.length &&
    actual.every((key, index) => key === sortedExpected[index])
  );
}

function nativeReleaseReferenceError(message: string, api: Api): InstanceType<Api["CliError"]> {
  return new api.CliError(message, {
    code: "REGISTRY_RELEASE_REFERENCE_INVALID",
    exitCode: 5,
  });
}

function parseNativeArtifactReference(
  value: unknown,
  label: string,
  api: Api,
): NativeReleaseReference["catalog"] {
  if (
    !isRecord(value) ||
    !exactKeys(value, ["bytes", "digest"]) ||
    typeof value.digest !== "string" ||
    !SHA256_DIGEST.test(value.digest) ||
    !Number.isSafeInteger(value.bytes) ||
    (value.bytes as number) < 1 ||
    (value.bytes as number) > 64 * 1024 * 1024
  ) {
    throw nativeReleaseReferenceError(`${label} reference is invalid.`, api);
  }
  return {
    digest: value.digest as `sha256:${string}`,
    bytes: value.bytes as number,
  };
}

async function readNativeReleaseReference(
  parsed: ParsedArguments,
  root: string,
  api: Api,
  allowLegacySnapshot: boolean,
): Promise<NativeReleaseReference | null> {
  const releaseFile = flagValue(parsed, "release-file");
  if (releaseFile === undefined) return null;
  const { readProjectFile } = await import("./source-operations.js");
  const bytes = readProjectFile(root, releaseFile);
  if (bytes === null) {
    throw new api.CliError("The exact release reference file is unavailable.", {
      code: "REGISTRY_RELEASE_REFERENCE_MISSING",
      exitCode: 4,
      target: releaseFile,
    });
  }
  if (bytes.byteLength < 2 || bytes.byteLength > NATIVE_RELEASE_REFERENCE_MAX_BYTES) {
    if (allowLegacySnapshot) return null;
    throw nativeReleaseReferenceError("The exact release reference file has an unsafe size.", api);
  }
  let text: string;
  try {
    text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    if (allowLegacySnapshot) return null;
    throw nativeReleaseReferenceError("The exact release reference is not valid UTF-8.", api);
  }
  let value: unknown;
  try {
    value = JSON.parse(text) as unknown;
  } catch {
    if (allowLegacySnapshot) return null;
    throw nativeReleaseReferenceError("The exact release reference is not valid JSON.", api);
  }
  if (!isRecord(value)) {
    if (allowLegacySnapshot) return null;
    throw nativeReleaseReferenceError("The exact release reference must be a JSON object.", api);
  }
  if (value.artifactKind === undefined) {
    if (value.catalog !== undefined || value.manifest !== undefined) {
      throw nativeReleaseReferenceError(
        "A native release reference requires its schema discriminator.",
        api,
      );
    }
    if (allowLegacySnapshot) return null;
    throw nativeReleaseReferenceError(
      `The release file must declare artifactKind ${NATIVE_RELEASE_REFERENCE_KIND}.`,
      api,
    );
  }
  if (value.artifactKind !== NATIVE_RELEASE_REFERENCE_KIND) {
    throw nativeReleaseReferenceError("The release file has an unsupported artifact kind.", api);
  }
  if (text !== api.canonicalJson(value) && text !== `${api.canonicalJson(value)}\n`) {
    throw nativeReleaseReferenceError(
      "The native release reference must use canonical JSON without duplicate keys.",
      api,
    );
  }
  if (
    !exactKeys(value, [
      "artifactKind",
      "catalog",
      "manifest",
      "registryId",
      "release",
      "schemaVersion",
    ]) ||
    value.schemaVersion !== 1 ||
    value.registryId !== "official" ||
    typeof value.release !== "string" ||
    !SEMANTIC_RELEASE.test(value.release)
  ) {
    throw nativeReleaseReferenceError("The native release reference schema is invalid.", api);
  }
  return {
    schemaVersion: 1,
    artifactKind: NATIVE_RELEASE_REFERENCE_KIND,
    registryId: "official",
    release: value.release,
    catalog: parseNativeArtifactReference(value.catalog, "Catalog artifact", api),
    manifest: parseNativeArtifactReference(value.manifest, "Release manifest artifact", api),
  };
}

function officialItemReferences(itemIds: readonly string[]): readonly string[] {
  return itemIds.map((input) => {
    const separator = input.indexOf(":");
    if (separator === -1) return input;
    if (input.slice(0, separator) !== "official" || input.indexOf(":", separator + 1) !== -1) {
      throw new CommandUsageError(
        "An official native release accepts only unqualified or official-qualified item references.",
      );
    }
    return input.slice(separator + 1);
  });
}

async function acquireNativeRelease(
  parsed: ParsedArguments,
  root: string,
  api: Api,
  reference: NativeReleaseReference,
  itemIds: readonly string[],
) {
  const origin = api.OFFICIAL_REGISTRY_ORIGIN;
  return api.resolveNativeRegistryRelease({
    projectRoot: root,
    registry: {
      id: "official",
      origin,
      trust: "official",
      identityDigest: api.sha256(api.canonicalJson({ id: "official", origin, trust: "official" })),
    },
    release: reference.release,
    catalog: {
      path: "catalog.json",
      digest: reference.catalog.digest,
      bytes: reference.catalog.bytes,
    },
    manifest: {
      path: `releases/${reference.release}/manifest.json`,
      digest: reference.manifest.digest,
      bytes: reference.manifest.bytes,
    },
    itemIds: officialItemReferences(itemIds),
    offline: hasFlag(parsed, "offline"),
  });
}

function operationWrites(plan: import("./transaction-engine.js").OperationPlan): boolean {
  return (
    plan.estimatedBytes.write > 0 ||
    plan.fileOperations.some(({ operation }) => operation === "delete") ||
    plan.dependencyChanges.some(({ operation }) => operation === "remove")
  );
}

function assertConflictFree(plan: import("./transaction-engine.js").OperationPlan, api: Api): void {
  const conflict = plan.conflicts[0];
  if (conflict === undefined) return;
  throw new api.CliError(conflict.reason, {
    code: "OPERATION_CONFLICT",
    exitCode: 6,
    target: conflict.target,
  });
}

async function execute(parsed: ParsedArguments, api: Api): Promise<CommandOutput> {
  const subcommand =
    parsed.command === "theme" || parsed.command === "registry"
      ? parsed.positionals[0]
      : parsed.command === "vendor"
        ? parsed.positionals[0] === "verify"
          ? "verify"
          : "create"
        : undefined;
  assertAllowedFlags(parsed, allowedCliFlags(parsed.command, subcommand));
  colorMode(parsed);
  const root = projectRoot(parsed);
  switch (parsed.command) {
    case "create": {
      if (parsed.positionals.length !== 1) {
        throw new CommandUsageError("create requires exactly one destination directory.");
      }
      const template = await requiredCreateChoice(parsed, "template", ["next", "vite"] as const);
      const packageManager = await requiredCreateChoice(parsed, "package-manager", [
        "npm",
        "pnpm",
        "yarn",
        "bun",
      ] as const);
      const preset = await requiredCreateChoice(parsed, "preset", [
        "minimal",
        "application",
        "none",
      ] as const);
      const options = {
        directory: parsed.positionals[0]!,
        template,
        packageManager,
        preset,
        noInstall: hasFlag(parsed, "no-install"),
        cwd: root,
      };
      const plan = api.planProjectCreate(options);
      if (hasFlag(parsed, "dry-run") || hasFlag(parsed, "plan")) {
        return {
          result: plan,
          status: "planned",
          warnings: plan.warnings,
          text: renderProjectCreatePlan(plan),
        };
      }
      if (!(await confirmPlan(parsed, `create ${plan.destination.directoryName}`))) {
        throw new api.CliError(
          "Project-creation consent is required; review --plan and pass --yes.",
          { code: "CONSENT_REQUIRED", exitCode: 12 },
        );
      }
      const result = api.applyProjectCreate(options, plan.planDigest);
      return {
        result,
        status: result.state,
        warnings: plan.warnings,
        text: `Created ${result.directoryName} from the ${result.template} ${result.templateVersion} ${result.publicationStatus} template; ${String(result.files.length)} authored files; plan ${result.planDigest}.`,
      };
    }
    case "init": {
      if (parsed.positionals.length > 0)
        throw new CommandUsageError("init does not accept positional arguments.");
      const options = { projectRoot: root, ...commonProjectOptions(parsed) };
      const plan = api.planInit(options);
      const readOnly = hasFlag(parsed, "dry-run") || hasFlag(parsed, "plan");
      if (readOnly || !plan.writesRequired) {
        return {
          result: plan,
          status: plan.writesRequired ? "planned" : "no-op",
          warnings: plan.warnings,
          text: renderPlan(plan),
        };
      }
      if (!(await confirmPlan(parsed, "initialization"))) {
        throw new api.CliError(
          "Initialization consent is required; review --plan and pass --yes.",
          {
            code: "CONSENT_REQUIRED",
            exitCode: 12,
          },
        );
      }
      const applied = api.applyInit(options, plan.planDigest);
      return {
        result: applied,
        status: "applied",
        warnings: applied.warnings,
        text: `Initialized Mergora (${String(applied.edits.filter(({ action }) => action !== "no-op").length)} exact edits, plan ${applied.planDigest}).`,
      };
    }
    case "search": {
      if (parsed.positionals.length > 1)
        throw new CommandUsageError("search accepts at most one query.");
      const releaseReference = await readNativeReleaseReference(parsed, root, api, false);
      const acquiredRelease =
        releaseReference === null
          ? undefined
          : await acquireNativeRelease(parsed, root, api, releaseReference, []);
      const limitText = flagValue(parsed, "limit");
      const result = api.searchRegistry(parsed.positionals[0] ?? "", {
        kind: flagValue(parsed, "kind"),
        category: flagValue(parsed, "category"),
        maturity: flagValue(parsed, "maturity"),
        tag: flagValue(parsed, "tag"),
        limit: limitText === undefined ? undefined : Number(limitText),
        acquiredRelease,
      });
      return {
        result,
        text:
          result.items.length === 0
            ? result.query === ""
              ? `Categories: ${result.categories.map(({ id, count }) => `${id} (${String(count)})`).join(", ")}\nNo recommended bundled source items match the filters.`
              : "No matching catalog items."
            : `${
                result.query === ""
                  ? `Categories: ${result.categories.map(({ id, count }) => `${id} (${String(count)})`).join(", ")}\nRecommended:\n`
                  : ""
              }${result.items
                .map((item) => {
                  const modes = [
                    item.installModes.source ? "source" : null,
                    item.installModes.package ? "package" : null,
                  ].filter((mode): mode is string => mode !== null);
                  return `${item.id}\t${item.title}\tmaturity=${item.maturity}\tlatest=${item.latestStableVersion ?? "none"}\tmodes=${modes.length === 0 ? "none-unreleased" : modes.join(",")}\tdependencies=${String(item.dependencyCount)}\tquality=${item.qualityTier ?? "none-unreleased"}\t${item.docsUrl}\t${item.description}`;
                })
                .join("\n")}`,
      };
    }
    case "view": {
      const source = flagValue(parsed, "source");
      const releaseReference = await readNativeReleaseReference(parsed, root, api, false);
      const requestedItems =
        releaseReference === null ? parsed.positionals : officialItemReferences(parsed.positionals);
      const acquiredRelease =
        releaseReference === null
          ? undefined
          : await acquireNativeRelease(parsed, root, api, releaseReference, requestedItems);
      const result = api.viewRegistryItems(requestedItems, {
        files: hasFlag(parsed, "files"),
        source,
        acquiredRelease,
      });
      const raw = source === undefined ? undefined : result[0]?.requestedSource?.content;
      return {
        result,
        text: result
          .map(
            (item) =>
              `${item.id} — ${item.title}\n${item.description}\nMaturity: ${item.maturity}; source: ${item.sourceAvailable ? (acquiredRelease === undefined ? "available (unreleased)" : `verified ${acquiredRelease.release}`) : "not implemented"}; dependencies: ${String(item.registryDependencies.length)}`,
          )
          .join("\n\n"),
        ...(raw === undefined ? {} : { raw }),
      };
    }
    case "docs": {
      if (parsed.positionals.length !== 1)
        throw new CommandUsageError("docs requires exactly one item or topic.");
      const format = flagValue(parsed, "format") ?? "markdown";
      if (format !== "markdown" && format !== "json" && format !== "url") {
        throw new CommandUsageError("docs --format must be markdown, json, or url.");
      }
      const nonInteractive =
        hasFlag(parsed, "non-interactive") || !process.stdin.isTTY || process.env.CI !== undefined;
      const requestedOpen = hasFlag(parsed, "open");
      const result = api.resolveDocumentation(parsed.positionals[0]!, {
        open: requestedOpen,
        nonInteractive,
      });
      const warnings =
        requestedOpen && nonInteractive
          ? ["Browser opening was skipped because this invocation is non-interactive."]
          : [];
      return {
        result,
        warnings,
        text:
          format === "url"
            ? result.url
            : format === "markdown"
              ? result.markdown
              : JSON.stringify(result),
        ...(format === "url" || format === "markdown"
          ? { raw: format === "url" ? result.url : result.markdown }
          : {}),
      };
    }
    case "info": {
      if (parsed.positionals.length > 0)
        throw new CommandUsageError("info does not accept positional arguments.");
      const result = api.projectInfo(root, commonProjectOptions(parsed));
      return {
        result,
        text: `Mergora ${result.cliVersion}; ${result.framework}; ${result.packageManager}; config ${result.configStatus}; manifest ${result.manifestStatus}.`,
      };
    }
    case "status": {
      if (parsed.positionals.length > 0)
        throw new CommandUsageError("status does not accept positional arguments.");
      const result = api.projectStatus(root);
      if (result.manifest === "invalid") {
        throw new api.CliError("The Mergora manifest schema identity is invalid.", {
          code: "MANIFEST_SCHEMA_INVALID",
          exitCode: 3,
          target: ".mergora/manifest.json",
        });
      }
      return {
        result,
        status: "success",
        text: `Manifest: ${result.manifest}; ${String(result.items.length)} items; ${String(result.incompleteTransactions.length)} incomplete transactions.`,
      };
    }
    case "diff": {
      if (hasFlag(parsed, "all") && parsed.positionals.length > 0) {
        throw new CommandUsageError("diff accepts either explicit items or --all, not both.");
      }
      const format = flagValue(parsed, "format");
      if (format !== undefined && !["json", "unified", "side-by-side"].includes(format)) {
        throw new CommandUsageError("diff --format must be unified, side-by-side, or json.");
      }
      const releaseFile = flagValue(parsed, "release-file");
      const wantsUpstream = hasFlag(parsed, "upstream") || releaseFile !== undefined;
      if (hasFlag(parsed, "upstream") && releaseFile === undefined) {
        throw new CommandUsageError("diff --upstream requires --release-file.");
      }
      const result = api.diffSemanticSource({
        projectRoot: root,
        itemIds: hasFlag(parsed, "all") ? undefined : parsed.positionals,
        ...(wantsUpstream ? { release: immutableRelease(parsed, root, api) } : {}),
      });
      return {
        result,
        status: result.hasDifferences ? "differences" : "no-differences",
        text: renderSemanticDiff(result, {
          nameOnly: hasFlag(parsed, "name-only"),
          statOnly: hasFlag(parsed, "stat"),
        }),
      };
    }
    case "doctor": {
      if (parsed.positionals.length > 0)
        throw new CommandUsageError("doctor does not accept positional arguments.");
      if (hasFlag(parsed, "fix")) {
        const options = {
          projectRoot: root,
          packageManager: parseManager(flagValue(parsed, "package-manager")),
        };
        const fixPlan = api.planInit(options);
        if (hasFlag(parsed, "dry-run") || hasFlag(parsed, "plan") || !fixPlan.writesRequired) {
          return {
            result: { diagnosis: api.doctorProject(root), fixPlan },
            status: fixPlan.writesRequired ? "fix-planned" : "no-op",
            text: renderPlan(fixPlan),
          };
        }
        if (!(await confirmPlan(parsed, "doctor fix"))) {
          throw new api.CliError("Doctor fix consent is required; review --plan and pass --yes.", {
            code: "CONSENT_REQUIRED",
            exitCode: 12,
          });
        }
        api.applyInit(options, fixPlan.planDigest);
      }
      const result = api.doctorProject(root);
      return {
        result,
        status: result.healthy ? "healthy" : "issues-found",
        text: `${result.healthy ? "Healthy" : "Issues found"}: ${String(result.counts.pass)} passed, ${String(result.counts.warning)} warnings, ${String(result.counts.error)} errors.\n${result.checks.map((check) => `[${check.status}] ${check.code}: ${check.message}`).join("\n")}`,
      };
    }
    case "audit": {
      const allModes = ["static", "browser", "a11y", "keyboard", "responsive"] as const;
      const selectedModes = hasFlag(parsed, "all")
        ? allModes
        : allModes.filter((mode) => hasFlag(parsed, mode));
      const result = await api.auditProject(root, {
        items: parsed.positionals,
        requestedModes: selectedModes.length === 0 ? ["static"] : selectedModes,
        changed: hasFlag(parsed, "changed"),
      });
      const exitCode = api.auditProjectExitCode(result);
      return {
        result,
        status: result.state,
        exitCode,
        warnings: result.limitations,
        text: `Contract Audit ${result.state}: ${String(result.summary.pass)} passed, ${String(result.summary.fail)} failed, ${String(result.summary.notRun)} not run, ${String(result.summary.notApplicable)} not applicable.`,
      };
    }
    case "update": {
      if (hasFlag(parsed, "all") === parsed.positionals.length > 0) {
        throw new CommandUsageError("update requires explicit items or --all, but not both.");
      }
      const releaseReference = await readNativeReleaseReference(parsed, root, api, true);
      const acquisitionItems = hasFlag(parsed, "all")
        ? api.projectStatus(root).items.map(({ id }) => id)
        : parsed.positionals;
      const acquiredRelease =
        releaseReference === null
          ? null
          : await acquireNativeRelease(parsed, root, api, releaseReference, acquisitionItems);
      const release = acquiredRelease === null ? immutableRelease(parsed, root, api) : null;
      const releaseVersion = acquiredRelease?.release ?? release!.release;
      const requestedTarget = flagValue(parsed, "to");
      if (requestedTarget !== undefined && requestedTarget !== releaseVersion) {
        throw new CommandUsageError("--to must exactly match the immutable release version.");
      }
      if (releaseVersion.includes("-") && !hasFlag(parsed, "allow-prerelease")) {
        throw new CommandUsageError("A prerelease target requires --allow-prerelease.");
      }
      const sharedOptions = {
        projectRoot: root,
        noInstall: hasFlag(parsed, "no-install"),
        offline: hasFlag(parsed, "offline"),
        packageManager: parseManager(flagValue(parsed, "package-manager")),
        commandArguments: [
          parsed.command,
          ...parsed.positionals,
          ...[...parsed.flags.keys()].map((name) => `--${name}`),
        ],
      };
      const acquiredOptions =
        acquiredRelease === null
          ? null
          : {
              ...sharedOptions,
              itemIds: hasFlag(parsed, "all")
                ? undefined
                : officialItemReferences(parsed.positionals).map(
                    (id) => acquiredRelease.aliases[id] ?? id,
                  ),
              acquiredRelease,
            };
      const legacyOptions =
        acquiredOptions === null
          ? {
              ...sharedOptions,
              itemIds: hasFlag(parsed, "all") ? undefined : parsed.positionals,
              release: release!,
            }
          : null;
      const plan =
        acquiredOptions === null
          ? api.planSemanticUpdate(legacyOptions!)
          : api.planAcquiredSemanticUpdate(acquiredOptions);
      if (hasFlag(parsed, "dry-run") || hasFlag(parsed, "plan")) {
        return {
          result: plan,
          status:
            plan.conflicts.length > 0 ? "conflict" : operationWrites(plan) ? "planned" : "no-op",
          warnings: plan.warnings,
          text: renderOperationPlan(plan),
        };
      }
      if (!operationWrites(plan) && plan.conflicts.length === 0) {
        return {
          result: plan,
          status: "no-op",
          warnings: plan.warnings,
          text: renderOperationPlan(plan),
        };
      }
      if (!(await confirmPlan(parsed, operationPromptSummary(plan)))) {
        throw new api.CliError("Semantic Sync consent is required; review --plan and pass --yes.", {
          code: "CONSENT_REQUIRED",
          exitCode: 12,
        });
      }
      const result =
        acquiredOptions === null
          ? await api.applySemanticUpdate(legacyOptions!, plan.planDigest)
          : await api.applyAcquiredSemanticUpdate(acquiredOptions, plan.planDigest);
      return {
        result,
        status: result.status,
        exitCode: result.status === "conflicted" ? 6 : 0,
        warnings: plan.warnings,
        text:
          result.status === "conflicted"
            ? `Semantic Sync staged conflict transaction ${result.conflictTransactionId}; ${String(result.conflicts.length)} conflicts; live project unchanged; plan ${result.planDigest}.`
            : `Semantic Sync committed ${result.items.join(", ")} at ${result.release}; transaction ${result.transaction.transactionId ?? "no-op"}; plan ${result.planDigest}.`,
      };
    }
    case "add": {
      const releaseReference = await readNativeReleaseReference(parsed, root, api, false);
      const requestedItems =
        releaseReference === null ? parsed.positionals : officialItemReferences(parsed.positionals);
      const acquiredRelease =
        releaseReference === null
          ? null
          : await acquireNativeRelease(parsed, root, api, releaseReference, requestedItems);
      const options = {
        ...sourceCommandOptions(parsed, root),
        itemIds: requestedItems,
      };
      const acquiredOptions = acquiredRelease === null ? null : { ...options, acquiredRelease };
      const plan =
        acquiredOptions === null
          ? api.planSourceAdd(options)
          : api.planAcquiredSourceAdd(acquiredOptions);
      if (hasFlag(parsed, "dry-run") || hasFlag(parsed, "plan")) {
        return {
          result: plan,
          status:
            plan.conflicts.length > 0 ? "conflict" : operationWrites(plan) ? "planned" : "no-op",
          warnings: plan.warnings,
          text: renderOperationPlan(plan),
        };
      }
      assertConflictFree(plan, api);
      if (!operationWrites(plan)) {
        return {
          result: plan,
          status: "no-op",
          warnings: plan.warnings,
          text: renderOperationPlan(plan),
        };
      }
      if (!(await confirmPlan(parsed, operationPromptSummary(plan)))) {
        throw new api.CliError(
          "Transactional source-add consent is required; review --plan and pass --yes.",
          { code: "CONSENT_REQUIRED", exitCode: 12 },
        );
      }
      const result =
        acquiredOptions === null
          ? api.applySourceAdd(options, plan.planDigest)
          : api.applyAcquiredSourceAdd(acquiredOptions, plan.planDigest);
      return {
        result,
        status: result.transaction.state,
        warnings: plan.warnings,
        text: renderSourceResult(result),
      };
    }
    case "remove": {
      const options = {
        ...sourceCommandOptions(parsed, root),
        keepFiles: hasFlag(parsed, "keep-files"),
      };
      const plan = api.planSourceRemove(options);
      if (hasFlag(parsed, "dry-run") || hasFlag(parsed, "plan")) {
        return {
          result: plan,
          status:
            plan.conflicts.length > 0 ? "conflict" : operationWrites(plan) ? "planned" : "no-op",
          warnings: plan.warnings,
          text: renderOperationPlan(plan),
        };
      }
      assertConflictFree(plan, api);
      if (!operationWrites(plan)) {
        return {
          result: plan,
          status: "no-op",
          warnings: plan.warnings,
          text: renderOperationPlan(plan),
        };
      }
      if (!(await confirmPlan(parsed, operationPromptSummary(plan)))) {
        throw new api.CliError(
          "Transactional source-removal consent is required; review --plan and pass --yes.",
          { code: "CONSENT_REQUIRED", exitCode: 12 },
        );
      }
      const result = api.applySourceRemove(options, plan.planDigest);
      return {
        result,
        status: result.transaction.state,
        warnings: plan.warnings,
        text: renderSourceResult(result),
      };
    }
    case "adopt": {
      const options = sourceCommandOptions(parsed, root);
      const plan = api.planSourceAdopt(options);
      if (hasFlag(parsed, "dry-run") || hasFlag(parsed, "plan")) {
        return {
          result: plan,
          status:
            plan.conflicts.length > 0 ? "conflict" : operationWrites(plan) ? "planned" : "no-op",
          warnings: plan.warnings,
          text: renderOperationPlan(plan),
        };
      }
      assertConflictFree(plan, api);
      if (!operationWrites(plan)) {
        return {
          result: plan,
          status: "no-op",
          warnings: plan.warnings,
          text: renderOperationPlan(plan),
        };
      }
      if (!(await confirmPlan(parsed, operationPromptSummary(plan)))) {
        throw new api.CliError(
          "Source-adoption consent is required; review --plan and pass --yes.",
          { code: "CONSENT_REQUIRED", exitCode: 12 },
        );
      }
      const result = api.applySourceAdopt(options, plan.planDigest);
      return {
        result,
        status: result.transaction.state,
        warnings: plan.warnings,
        text: renderSourceResult(result),
      };
    }
    case "resolve": {
      if (parsed.positionals.length > 1) {
        throw new CommandUsageError("resolve accepts exactly one conflict transaction ID.");
      }
      const positionalId = parsed.positionals[0];
      const flaggedId = flagValue(parsed, "transaction");
      if (positionalId !== undefined && flaggedId !== undefined && positionalId !== flaggedId) {
        throw new CommandUsageError("The positional and --transaction conflict IDs must agree.");
      }
      const transactionId = positionalId ?? flaggedId;
      if (transactionId === undefined) {
        throw new CommandUsageError("resolve requires a conflict transaction ID.");
      }
      const choices = [
        ["take-local", flagValues(parsed, "take-local")],
        ["take-upstream", flagValues(parsed, "take-upstream")],
        ["resolved", flagValues(parsed, "resolved")],
        ["reset", flagValues(parsed, "reset")],
      ] as const;
      const selectedChoices = choices.filter(([, targets]) => targets.length > 0);
      if (selectedChoices.length > 1) {
        throw new CommandUsageError("resolve accepts one choice kind per invocation.");
      }
      if (hasFlag(parsed, "apply") && selectedChoices.length > 0) {
        throw new CommandUsageError("resolve --apply cannot be combined with a target choice.");
      }
      if (hasFlag(parsed, "list") && (hasFlag(parsed, "apply") || selectedChoices.length > 0)) {
        throw new CommandUsageError("resolve --list cannot be combined with a mutation.");
      }
      if (!hasFlag(parsed, "apply") && selectedChoices.length === 0) {
        const result = api.listSemanticResolutions({ projectRoot: root, transactionId });
        return {
          result,
          status: result.state,
          warnings: result.limitations,
          text: renderSemanticResolutionList(result),
        };
      }
      if (hasFlag(parsed, "apply")) {
        const options = {
          projectRoot: root,
          transactionId,
          noInstall: hasFlag(parsed, "no-install"),
          offline: hasFlag(parsed, "offline"),
          commandArguments: [
            parsed.command,
            transactionId,
            ...[...parsed.flags.keys()].map((name) => `--${name}`),
          ],
        };
        const plan = api.planSemanticResolveApply(options);
        if (hasFlag(parsed, "dry-run") || hasFlag(parsed, "plan")) {
          return {
            result: plan,
            status: "planned",
            warnings: plan.warnings,
            text: renderOperationPlan(plan),
          };
        }
        if (!(await confirmPlan(parsed, operationPromptSummary(plan)))) {
          throw new api.CliError(
            "Conflict-application consent is required; review --plan and pass --yes.",
            { code: "CONSENT_REQUIRED", exitCode: 12 },
          );
        }
        const result = api.applySemanticResolution(options, plan.planDigest);
        return {
          result,
          status: result.status,
          warnings: plan.warnings,
          text: `Resolved conflict transaction ${result.conflictTransactionId}; committed as ${result.transaction.transactionId ?? "no-op"}; plan ${result.planDigest}.`,
        };
      }
      const [choice, targets] = selectedChoices[0]!;
      const options = { projectRoot: root, transactionId, choice, targets };
      const plan = api.planSemanticResolveChoice(options);
      if (hasFlag(parsed, "dry-run") || hasFlag(parsed, "plan")) {
        return {
          result: plan,
          status: "planned",
          warnings: plan.limitations,
          text: renderSemanticResolveChoicePlan(plan),
        };
      }
      if (!(await confirmPlan(parsed, `resolve ${choice} (${String(targets.length)} targets)`))) {
        throw new api.CliError(
          "Conflict-choice consent is required; review --plan and pass --yes.",
          { code: "CONSENT_REQUIRED", exitCode: 12 },
        );
      }
      const result = api.applySemanticResolveChoice(options, plan.planDigest);
      return {
        result,
        status: "recorded",
        warnings: plan.limitations,
        text: `Recorded ${choice} for ${String(targets.length)} targets in ${transactionId}; plan ${result.planDigest}.`,
      };
    }
    case "theme": {
      const action = parsed.positionals[0];
      if (action === "list") {
        if (parsed.positionals.length !== 1) {
          throw new CommandUsageError("theme list does not accept additional arguments.");
        }
        const result = api.listProjectThemes(root);
        return {
          result,
          text: result.themes
            .map(
              ({ id, label, origin, digest }) =>
                `${id}\t${label}\t${origin}\t${digest ?? "bundled"}`,
            )
            .join("\n"),
        };
      }
      if (action === "preview") {
        if (parsed.positionals.length !== 2) {
          throw new CommandUsageError(
            "theme preview requires one preset ID or project-relative file.",
          );
        }
        const result = api.previewTheme(api.loadThemePreset(root, parsed.positionals[1]!));
        return {
          result,
          warnings: hasFlag(parsed, "open")
            ? ["Browser opening is not performed by this deterministic CLI build; use the URL."]
            : [],
          text: result.studioUrl,
          raw: result.studioUrl,
        };
      }
      if (action === "export") {
        if (parsed.positionals.length !== 2) {
          throw new CommandUsageError(
            "theme export requires one preset ID or project-relative file.",
          );
        }
        const format = flagValue(parsed, "format");
        if (format !== "dtcg" && format !== "css" && format !== "tailwind") {
          throw new CommandUsageError("theme export requires --format dtcg, css, or tailwind.");
        }
        const result = api.exportTheme(api.loadThemePreset(root, parsed.positionals[1]!), format);
        return { result, text: result.content, raw: result.content };
      }
      if (action === "apply" || action === "import") {
        if (parsed.positionals.length !== 2) {
          throw new CommandUsageError(
            `theme ${action} requires one preset ID or project-relative file.`,
          );
        }
        const options = {
          projectRoot: root,
          preset: api.loadThemePreset(root, parsed.positionals[1]!),
          target: flagValue(parsed, "target"),
          acknowledgedIssueIds: flagValues(parsed, "acknowledge"),
          commandArguments: [
            parsed.command,
            action,
            parsed.positionals[1]!,
            ...[...parsed.flags.keys()].map((name) => `--${name}`),
          ],
        };
        const plan =
          action === "apply" ? api.planThemeApply(options) : api.planThemeImport(options);
        if (hasFlag(parsed, "dry-run") || hasFlag(parsed, "plan")) {
          return {
            result: plan,
            status: operationWrites(plan) ? "planned" : "no-op",
            warnings: plan.warnings,
            text: renderOperationPlan(plan),
          };
        }
        if (!operationWrites(plan)) {
          return {
            result: plan,
            status: "no-op",
            warnings: plan.warnings,
            text: renderOperationPlan(plan),
          };
        }
        if (!(await confirmPlan(parsed, operationPromptSummary(plan)))) {
          throw new api.CliError(
            `Theme ${action} consent is required; review --plan and pass --yes.`,
            { code: "CONSENT_REQUIRED", exitCode: 12 },
          );
        }
        const result =
          action === "apply"
            ? api.applyTheme(options, plan.planDigest)
            : api.importTheme(options, plan.planDigest);
        return {
          result,
          status: result.transaction.state,
          warnings: plan.warnings,
          text: `Theme ${result.id} ${action === "apply" ? "applied" : "imported"}; transaction ${result.transaction.transactionId ?? "no-op"}; plan ${result.planDigest}.`,
        };
      }
      throw new CommandUsageError("theme requires list, preview, export, apply, or import.");
    }
    case "migrate": {
      const target = parsed.positionals[0];
      if (
        target !== "config" &&
        target !== "shadcn" &&
        target !== "framework" &&
        target !== "mode" &&
        target !== "id"
      ) {
        throw new CommandUsageError("migrate requires config, shadcn, framework, mode, or id.");
      }
      const requiresId = target === "framework" || target === "mode" || target === "id";
      if (
        (requiresId && parsed.positionals.length < 2) ||
        (!requiresId && parsed.positionals.length > 1)
      ) {
        throw new CommandUsageError(
          requiresId
            ? `migrate ${target} requires one compiled built-in migration ID.`
            : `migrate ${target} does not accept a migration ID.`,
        );
      }
      const migrationTarget = target as import("./migrate.js").MigrationTarget;
      const options = {
        projectRoot: root,
        target: migrationTarget,
        migrationId: requiresId ? parsed.positionals[1] : undefined,
        itemIds: target === "mode" ? parsed.positionals.slice(2) : [],
        commandArguments: [
          parsed.command,
          ...parsed.positionals,
          ...[...parsed.flags.keys()].map((name) => `--${name}`),
        ],
      };
      const plan = api.planMigration(options);
      if (hasFlag(parsed, "dry-run") || hasFlag(parsed, "plan")) {
        return {
          result: plan,
          status: plan.migration.execution,
          warnings: plan.warnings,
          text: renderMigrationPlan(plan),
        };
      }
      if (plan.migration.execution === "manual-only") {
        return {
          result: plan,
          status: "manual-only",
          exitCode: 7,
          warnings: plan.warnings,
          text: renderMigrationPlan(plan),
        };
      }
      if (plan.migration.execution === "no-op" || !operationWrites(plan)) {
        return {
          result: plan,
          status: "no-op",
          warnings: plan.warnings,
          text: renderMigrationPlan(plan),
        };
      }
      if (!(await confirmPlan(parsed, operationPromptSummary(plan)))) {
        throw new api.CliError("Migration consent is required; review --plan and pass --yes.", {
          code: "CONSENT_REQUIRED",
          exitCode: 12,
        });
      }
      const result = api.applyMigration(options, plan.planDigest);
      return {
        result,
        status: result.transaction.state,
        warnings: plan.warnings,
        text: `Migration ${result.id} committed as ${result.transaction.transactionId ?? "no-op"}; plan ${result.planDigest}.`,
      };
    }
    case "clean": {
      if (parsed.positionals.length !== 0) {
        throw new CommandUsageError("clean does not accept positional arguments.");
      }
      const retentionInput = flagValue(parsed, "retain-transactions");
      if (retentionInput !== undefined && !/^(?:0|[1-9][0-9]{0,3})$/u.test(retentionInput)) {
        throw new CommandUsageError("--retain-transactions must be an integer from 0 to 9999.");
      }
      const options = {
        projectRoot: root,
        bases: hasFlag(parsed, "bases"),
        cache: hasFlag(parsed, "cache"),
        conflicts: hasFlag(parsed, "conflicts"),
        transactions: hasFlag(parsed, "transactions"),
        retainTransactions: retentionInput === undefined ? undefined : Number(retentionInput),
      };
      const plan = api.planClean(options);
      if (hasFlag(parsed, "dry-run") || hasFlag(parsed, "plan") || !plan.writesRequired) {
        return {
          result: plan,
          status: plan.writesRequired ? "planned" : "report",
          warnings: plan.warnings,
          text: renderCleanPlan(plan),
        };
      }
      if (plan.blockedReasons.length > 0) {
        throw new api.CliError(plan.blockedReasons[0]!, {
          code: "CLEAN_BLOCKED_ACTIVE_STATE",
          exitCode: 8,
          target: ".mergora",
        });
      }
      if (!(await confirmPlan(parsed, `cleanup of ${String(plan.selected.length)} artifact(s)`))) {
        throw new api.CliError("Cleanup consent is required; review --plan and pass --yes.", {
          code: "CONSENT_REQUIRED",
          exitCode: 12,
        });
      }
      const result = api.applyClean(options, plan.planDigest);
      return {
        result,
        status: result.status,
        warnings: plan.warnings,
        text: `Cleanup ${result.status}: ${String(result.deleted.length)} artifact(s), ${String(result.reclaimedBytes)} byte(s) reclaimed; plan ${result.planDigest}.`,
      };
    }
    case "registry": {
      const action = parsed.positionals[0];
      if (action === "list") {
        if (parsed.positionals.length !== 1) {
          throw new CommandUsageError("registry list does not accept additional arguments.");
        }
        const result = api.listRegistries(root);
        return {
          result,
          text:
            result.length === 0
              ? "No registries are configured."
              : result
                  .map(
                    (entry) =>
                      `${entry.id}\t${entry.protocol}\t${entry.trust}\t${entry.origin}\t${entry.identityDigest ?? "not-pinned"}`,
                  )
                  .join("\n"),
        };
      }
      if (action === "inspect") {
        if (parsed.positionals.length !== 2) {
          throw new CommandUsageError(
            "registry inspect requires exactly one enrolled registry ID.",
          );
        }
        const result = await api.inspectRegistry({
          projectRoot: root,
          id: parsed.positionals[1]!,
          offline: hasFlag(parsed, "offline"),
        });
        return {
          result,
          status: result.identityStatus,
          warnings: result.missingEvidence,
          text: `Registry ${result.registry.id}: ${result.registry.protocol}, ${result.registry.trust}, identity ${result.identityStatus}, network ${result.network}.`,
        };
      }
      if (action === "verify") {
        if (parsed.positionals.length !== 2) {
          throw new CommandUsageError("registry verify requires exactly one enrolled registry ID.");
        }
        const result = await api.verifyRegistry({
          projectRoot: root,
          id: parsed.positionals[1]!,
          offline: hasFlag(parsed, "offline"),
        });
        return {
          result,
          status: result.status,
          exitCode: result.ok
            ? 0
            : result.status === "identity-mismatch"
              ? 5
              : result.network === "forbidden"
                ? 4
                : 7,
          warnings: result.missingEvidence,
          text: `Registry ${result.registry.id} ${result.status}: ${String(result.checks.filter(({ state }) => state === "pass").length)} checks passed.`,
        };
      }
      if (action === "enroll") {
        if (parsed.positionals.length !== 3) {
          throw new CommandUsageError("registry enroll requires an ID and origin.");
        }
        const planned = await api.planRegistryEnrollment({
          projectRoot: root,
          id: parsed.positionals[1]!,
          origin: parsed.positionals[2]!,
          protocol: registryProtocol(flagValue(parsed, "protocol")),
          authEnvironmentVariable: flagValue(parsed, "auth-env"),
          allowInsecureLocalhost: hasFlag(parsed, "allow-insecure-localhost"),
        });
        if (hasFlag(parsed, "dry-run") || hasFlag(parsed, "plan")) {
          return {
            result: planned,
            status: "planned",
            warnings: planned.plan.warnings,
            text: renderOperationPlan(planned.plan),
          };
        }
        const accepted = await acceptedRegistryIdentity(parsed, planned.metadata!.identityDigest);
        if (accepted === undefined) {
          throw new api.CliError(
            `Registry enrollment requires --accept-registry-identity ${planned.metadata!.identityDigest}; --yes is insufficient.`,
            { code: "REGISTRY_IDENTITY_ACCEPTANCE_REQUIRED", exitCode: 12 },
          );
        }
        const result = api.applyRegistryConfigPlan(planned, root, {
          expectedPlanDigest: planned.plan.planDigest,
          acceptRegistryIdentity: accepted,
          commandArguments: [
            parsed.command,
            action,
            parsed.positionals[1]!,
            ...[...parsed.flags.keys()].map((name) => `--${name}`),
          ],
        });
        return {
          result,
          status: result.state,
          warnings: planned.plan.warnings,
          text: `Enrolled registry ${planned.registry.id}; transaction ${result.transactionId ?? "no-op"}; identity ${planned.metadata!.identityDigest}.`,
        };
      }
      if (action === "remove") {
        if (parsed.positionals.length !== 2) {
          throw new CommandUsageError("registry remove requires exactly one enrolled registry ID.");
        }
        const planned = api.planRegistryRemoval({
          projectRoot: root,
          id: parsed.positionals[1]!,
        });
        if (hasFlag(parsed, "dry-run") || hasFlag(parsed, "plan")) {
          return {
            result: planned,
            status: "planned",
            warnings: planned.plan.warnings,
            text: renderOperationPlan(planned.plan),
          };
        }
        if (!(await confirmPlan(parsed, operationPromptSummary(planned.plan)))) {
          throw new api.CliError(
            "Registry-removal consent is required; review --plan and pass --yes.",
            { code: "CONSENT_REQUIRED", exitCode: 12 },
          );
        }
        const result = api.applyRegistryConfigPlan(planned, root, {
          expectedPlanDigest: planned.plan.planDigest,
          commandArguments: [
            parsed.command,
            action,
            parsed.positionals[1]!,
            ...[...parsed.flags.keys()].map((name) => `--${name}`),
          ],
        });
        return {
          result,
          status: result.state,
          warnings: planned.plan.warnings,
          text: `Removed registry ${planned.registry.id}; transaction ${result.transactionId ?? "no-op"}.`,
        };
      }
      throw new CommandUsageError("registry requires list, inspect, enroll, remove, or verify.");
    }
    case "vendor": {
      const verify = parsed.positionals[0] === "verify";
      if (verify) {
        if (parsed.positionals.length !== 1) {
          throw new CommandUsageError("vendor verify does not accept item arguments.");
        }
        const result = api.verifyVendor({ projectRoot: root });
        return {
          result,
          status: result.state,
          text: `Vendor snapshot valid: ${String(result.items.length)} items, ${String(result.artifacts)} artifacts, ${String(result.totalBytes)} bytes; manifest ${result.manifestDigest}.`,
        };
      }
      const options = {
        projectRoot: root,
        itemIds: parsed.positionals,
        allInstalled: hasFlag(parsed, "all-installed"),
        commandArguments: [
          parsed.command,
          ...parsed.positionals,
          ...[...parsed.flags.keys()].map((name) => `--${name}`),
        ],
      };
      const plan = api.planVendor(options);
      if (hasFlag(parsed, "dry-run") || hasFlag(parsed, "plan")) {
        return {
          result: plan,
          status: operationWrites(plan) ? "planned" : "no-op",
          warnings: plan.warnings,
          text: renderOperationPlan(plan),
        };
      }
      assertConflictFree(plan, api);
      if (!operationWrites(plan)) {
        return {
          result: plan,
          status: "no-op",
          warnings: plan.warnings,
          text: renderOperationPlan(plan),
        };
      }
      if (!(await confirmPlan(parsed, operationPromptSummary(plan)))) {
        throw new api.CliError("Vendoring consent is required; review --plan and pass --yes.", {
          code: "CONSENT_REQUIRED",
          exitCode: 12,
        });
      }
      const result = api.applyVendor(options, plan.planDigest);
      return {
        result,
        status: result.transaction.state,
        warnings: plan.warnings,
        text: `Vendor snapshot ${result.transaction.state}: ${String(result.items.length)} items, ${String(result.verification.artifacts)} verified artifacts; plan ${result.planDigest}.`,
      };
    }
    case "rollback": {
      if (parsed.positionals.length > 1) {
        throw new CommandUsageError("rollback accepts at most one transaction ID.");
      }
      const positionalTransaction = parsed.positionals[0];
      const flaggedTransaction = flagValue(parsed, "transaction");
      if (
        positionalTransaction !== undefined &&
        flaggedTransaction !== undefined &&
        positionalTransaction !== flaggedTransaction
      ) {
        throw new CommandUsageError("The positional transaction ID and --transaction must agree.");
      }
      const options = {
        root,
        transactionId: positionalTransaction ?? flaggedTransaction,
        last: hasFlag(parsed, "last"),
        noInstall: hasFlag(parsed, "no-install"),
        offline: hasFlag(parsed, "offline"),
        commandArguments: [
          parsed.command,
          ...parsed.positionals,
          ...[...parsed.flags.keys()].map((name) => `--${name}`),
        ],
      };
      const planned = api.planRollback(options);
      if (hasFlag(parsed, "dry-run") || hasFlag(parsed, "plan")) {
        return {
          result: planned,
          status: planned.plan.conflicts.length > 0 ? "conflict" : "planned",
          warnings: planned.plan.warnings,
          text: renderOperationPlan(planned.plan),
        };
      }
      const conflict = planned.plan.conflicts[0];
      if (conflict !== undefined) {
        throw new api.CliError(conflict.reason, {
          code: "TRANSACTION_ROLLBACK_STALE",
          exitCode: 8,
          target: conflict.target,
        });
      }
      if (!(await confirmPlan(parsed, operationPromptSummary(planned.plan)))) {
        throw new api.CliError("Rollback consent is required; review --plan and pass --yes.", {
          code: "CONSENT_REQUIRED",
          exitCode: 12,
        });
      }
      const result = api.rollbackTransaction(options, planned.plan.planDigest);
      return {
        result,
        status: result.transaction.state,
        warnings: planned.plan.warnings,
        text: `Rolled back transaction ${result.rollbackOf} as ${result.transaction.transactionId ?? "no-op"}; ${String(result.transaction.written.length)} restored, ${String(result.transaction.deleted.length)} deleted; plan ${result.transaction.planDigest}.`,
      };
    }
    case "recover": {
      if (parsed.positionals.length > 0) {
        throw new CommandUsageError(
          "recover does not accept positional arguments; use --transaction.",
        );
      }
      const options = {
        root,
        transactionId: flagValue(parsed, "transaction"),
        strategy: recoveryStrategy(parsed),
        offline: hasFlag(parsed, "offline"),
      };
      const planned = api.planRecovery(options);
      if (hasFlag(parsed, "dry-run") || hasFlag(parsed, "plan")) {
        return {
          result: planned.plan,
          status: `${planned.action}-planned`,
          warnings: planned.plan.warnings,
          text: renderOperationPlan(planned.plan),
        };
      }
      if (!(await confirmPlan(parsed, operationPromptSummary(planned.plan)))) {
        throw new api.CliError(
          "Transaction-recovery consent is required; review --plan and pass --yes.",
          { code: "CONSENT_REQUIRED", exitCode: 12 },
        );
      }
      const result = api.recoverTransaction(options, planned.plan.planDigest);
      return {
        result,
        status: result.state,
        warnings: planned.plan.warnings,
        text: `Transaction ${result.transactionId} ${result.action}: ${result.state} (plan ${result.planDigest}).`,
      };
    }
    default:
      throw new CommandUsageError(`Unknown command ${JSON.stringify(parsed.command)}.`);
  }
}

function renderPlan(plan: import("./configuration.js").InitPlan): string {
  const lines = [
    `Initialization plan ${plan.planDigest}`,
    `Framework: ${plan.detection.framework} (${plan.detection.frameworkEvidence.join(", ")})`,
    `Package manager: ${plan.detection.packageManager} (${plan.detection.packageManagerEvidence.join(", ")})`,
  ];
  for (const edit of plan.edits) {
    lines.push(`${edit.action}\t${edit.target}\t${edit.afterDigest ?? "none"}\t${edit.reason}`);
  }
  return lines.join("\n");
}

function renderProjectCreatePlan(plan: import("./project-create.js").ProjectCreatePlan): string {
  const lines = [
    `Project creation plan ${plan.planDigest}`,
    `Destination: ${plan.destination.directoryName} (${plan.destination.initialState})`,
    `Template: ${plan.template.id}@${plan.template.version} (${plan.publicationStatus})`,
    `Preset: ${plan.preset}`,
    `Package manager: ${plan.packageManager.name}${plan.packageManager.install === null ? " (install skipped)" : `@${plan.packageManager.version}`}`,
  ];
  for (const file of plan.files) {
    lines.push(`${file.source}\t${file.target}\t${file.digest}\t${String(file.byteLength)} bytes`);
  }
  return lines.join("\n");
}

function renderSemanticDiff(
  result: import("./semantic-update.js").SemanticSourceDiff,
  options: { readonly nameOnly: boolean; readonly statOnly: boolean },
): string {
  if (options.nameOnly) return result.nameOnly.join("\n") || "No differences.";
  const summary = `${String(result.stat.files)} files, +${String(result.stat.linesAdded ?? result.stat.bytesAdded)}/-${String(result.stat.linesRemoved ?? result.stat.bytesRemoved)}${result.stat.linesAdded === null ? " bytes" : " lines"}`;
  if (options.statOnly) return summary;
  const lines = [
    `Semantic diff: ${result.hasDifferences ? summary : "no local differences"}`,
    `Target release: ${result.targetRelease ?? "local-only"}`,
  ];
  for (const file of result.files) {
    lines.push(
      `${file.localChange}\t${file.target}\tB=${file.baseDigest ?? "none"}\tL=${file.localDigest ?? "none"}${file.planned === null ? "" : `\tplanned=${file.planned.status}\tR=${file.planned.remoteDigest ?? "none"}`}`,
    );
    for (const conflict of file.planned?.conflicts ?? []) {
      lines.push(`conflict\t${file.target}\t${conflict.id}\t${conflict.detail}`);
    }
  }
  return lines.join("\n");
}

function renderSemanticResolutionList(
  result: import("./semantic-update.js").SemanticResolutionList,
): string {
  const lines = [
    `Conflict transaction ${result.transactionId}: ${result.state}`,
    `${String(result.unresolved.length)} unresolved; ${String(result.resolved.length)} resolved.`,
  ];
  for (const entry of result.unresolved) {
    lines.push(
      `unresolved\t${entry.target}\tunits=${entry.semanticUnitIds.join(",")}\tchoices=${entry.safeChoices.join(",")}`,
    );
  }
  for (const entry of result.resolved) {
    lines.push(
      `resolved\t${entry.target}\t${entry.resolution}\t${entry.proposedDigest ?? "deleted"}`,
    );
  }
  return lines.join("\n");
}

function renderSemanticResolveChoicePlan(
  plan: import("./semantic-update.js").SemanticResolveChoicePlan,
): string {
  const lines = [
    `resolve ${plan.choice} plan ${plan.planDigest}`,
    `Conflict transaction: ${plan.transactionId}`,
  ];
  for (const change of plan.changes) {
    lines.push(
      `${change.resolution}\t${change.target}\t${change.from ?? "none"} -> ${change.to ?? "none"}`,
    );
  }
  for (const limitation of plan.limitations) lines.push(`limitation\t${limitation}`);
  return lines.join("\n");
}

function renderMigrationPlan(plan: import("./migrate.js").MigrationPlan): string {
  const lines = [
    `Migration ${plan.migration.id}: ${plan.migration.execution}; plan ${plan.planDigest}`,
    `${plan.migration.sourceVersion} -> ${plan.migration.targetVersion}; trusted built-in; external executable code: no`,
  ];
  for (const step of plan.migration.steps) {
    lines.push(
      `${String(step.sequence)}\t${step.kind}\t${step.target}\t${step.description}\treversible=${String(step.reversible)}`,
    );
  }
  for (const item of plan.migration.manualChecklist) {
    lines.push(`manual\t${String(item.sequence)}\t${item.id}\t${item.description}`);
  }
  return lines.join("\n");
}

function renderCleanPlan(plan: import("./clean.js").CleanPlan): string {
  const counts = (["cache", "transactions", "bases", "conflicts"] as const)
    .map((category) => `${category}=${String(plan.candidates[category].length)}`)
    .join(" ");
  return [
    `Cleanup report: ${counts}`,
    `Selected: ${plan.selectedCategories.length === 0 ? "none (read-only)" : plan.selectedCategories.join(", ")}`,
    `Candidates: ${String(plan.selected.length)}; reclaimable bytes: ${String(plan.estimatedReclaimBytes)}`,
    `Preserved: ${String(plan.preserved.referencedBases)} referenced base(s), ${String(plan.preserved.retainedTerminalTransactions)} retained terminal transaction(s), ${String(plan.preserved.activeConflicts.length)} active conflict bundle(s)`,
    `Rollback: unavailable; journal: ${plan.journalStrategy}`,
    ...(plan.blockedReasons.length === 0
      ? []
      : plan.blockedReasons.map((reason) => `Blocked: ${reason}`)),
    `Plan: ${plan.planDigest}`,
  ].join("\n");
}

function operationPromptSummary(plan: import("./transaction-engine.js").OperationPlan): string {
  const changed = plan.fileOperations.filter(({ operation }) => operation !== "no-op").length;
  const deletes = plan.fileOperations.filter(({ operation }) => operation === "delete").length;
  return `${plan.command} (${String(changed)} file operations, ${String(deletes)} deletes, ${String(plan.dependencyChanges.length)} dependency changes, ${String(plan.registries.length)} external origins)`;
}

function renderOperationPlan(plan: import("./transaction-engine.js").OperationPlan): string {
  const direct = plan.items.filter(({ direct: isDirect }) => isDirect).map(({ id }) => id);
  const transitive = plan.items.filter(({ direct: isDirect }) => !isDirect).map(({ id }) => id);
  const lines = [
    `${plan.command} plan ${plan.planDigest}`,
    `Direct: ${direct.join(", ") || "none"}`,
    `Transitive: ${transitive.join(", ") || "none"}`,
  ];
  for (const file of plan.fileOperations) {
    lines.push(
      `${file.operation}\t${file.target}\t${file.risk}\tB=${file.base ?? "none"}\tL=${file.local ?? "none"}\tR=${file.remote ?? "none"}\t${file.reason}`,
    );
  }
  for (const change of plan.dependencyChanges) {
    lines.push(
      `${change.operation}\tpackage.json ${change.scope}.${change.package}\t${change.from ?? "none"} -> ${change.to ?? "none"}\towners=${change.owners.join(",")}`,
    );
  }
  for (const warning of plan.warnings) lines.push(`warning\t${warning}`);
  for (const conflict of plan.conflicts) {
    lines.push(`conflict\t${conflict.target}\t${conflict.kind}\t${conflict.reason}`);
  }
  return lines.join("\n");
}

function renderSourceResult(
  result: import("./source-operations.js").SourceOperationResult,
): string {
  const transaction = result.transaction.transactionId ?? "none";
  return `${result.command} ${result.items.join(", ") || "no items"}: ${result.transaction.state}; transaction ${transaction}; ${String(result.transaction.written.length)} written, ${String(result.transaction.deleted.length)} deleted; plan ${result.planDigest}.`;
}

async function main(arguments_: readonly string[]): Promise<void> {
  if (
    arguments_.length === 0 ||
    arguments_[0] === "--help" ||
    arguments_[0] === "-h" ||
    arguments_[0] === "help"
  ) {
    process.stdout.write(`${HELP}\n`);
    return;
  }
  if (arguments_[0] === "--version" || arguments_[0] === "-v") {
    process.stdout.write("0.0.0\n");
    return;
  }
  let parsed: ParsedArguments;
  try {
    parsed = parseArguments(arguments_);
  } catch (error) {
    const contracts = await import("./contracts.js");
    const wantsJson =
      arguments_.includes("--json") || arguments_.some((entry) => entry.startsWith("--json="));
    const message = contracts.redactMessage(
      error instanceof Error ? error.message : "Invalid command usage.",
    );
    const known = new contracts.CliError(message, {
      code: "COMMAND_USAGE_INVALID",
      exitCode: 2,
    });
    const requestedCommand = arguments_.find((argument) => isCliCommand(argument)) ?? "unknown";
    const envelope = contracts.errorEnvelope(requestedCommand, known);
    if (wantsJson) {
      process.stdout.write(`${JSON.stringify(envelope)}\n`);
    } else {
      process.stderr.write(
        `mergora: ${envelope.errors[0]?.message ?? message}\nrecovery: ${envelope.errors[0]?.recovery ?? "Review command help and retry."}\n`,
      );
    }
    process.exitCode = envelope.exitCode;
    return;
  }
  if (hasFlag(parsed, "help")) {
    process.stdout.write(`${COMMAND_HELP[parsed.command] ?? HELP}\n`);
    return;
  }
  const api = await import("./index.js");
  try {
    const output = await execute(parsed, api);
    const asJson = hasFlag(parsed, "json") || flagValue(parsed, "format") === "json";
    const exitCode = output.exitCode ?? 0;
    if (asJson) {
      const status = output.status ?? (exitCode === 0 ? "success" : "failed");
      if (!isJsonResultStatus(status)) {
        throw new api.CliError(`Unsupported JSON result status ${JSON.stringify(status)}.`, {
          code: "INTERNAL_RESULT_STATUS_INVALID",
          exitCode: 1,
        });
      }
      const envelope =
        exitCode === 0
          ? api.successEnvelope(parsed.command, output.result, {
              status,
              warnings: output.warnings,
            })
          : {
              schemaVersion: api.JSON_SCHEMA_VERSION,
              command: api.redactMessage(parsed.command),
              ok: false,
              status,
              exitCode,
              result: output.result,
              warnings: (output.warnings ?? []).map(api.redactMessage),
              errors: [],
            };
      process.stdout.write(`${JSON.stringify(envelope)}\n`);
    } else if (output.raw !== undefined) {
      process.stdout.write(`${output.raw}${output.raw.endsWith("\n") ? "" : "\n"}`);
    } else process.stdout.write(`${output.text}\n`);
    if (exitCode !== 0) process.exitCode = exitCode;
  } catch (error) {
    const known =
      error instanceof api.CliError
        ? error
        : error instanceof CommandUsageError
          ? new api.CliError(error.message, {
              code: "COMMAND_USAGE_INVALID",
              exitCode: 2,
            })
          : error;
    const envelope = api.errorEnvelope(parsed.command, known);
    if (hasFlag(parsed, "json")) {
      process.stdout.write(`${JSON.stringify(envelope)}\n`);
    } else {
      const detail = envelope.errors[0];
      process.stderr.write(
        `mergora: ${detail?.message ?? "Unexpected CLI failure."}${detail?.recovery === undefined ? "" : `\nrecovery: ${detail.recovery}`}${detail?.reportId === undefined ? "" : `\nreport: ${detail.reportId}`}\n`,
      );
    }
    process.exitCode = envelope.exitCode;
  }
}

await main(process.argv.slice(2));
