#!/usr/bin/env node

const HELP = `Mergora CLI

Usage:
  mergora <command> [arguments] [options]

Discovery and project commands:
  init                 Inspect and initialize a supported React project
  search [query]       Search the bundled verified catalog
  view <item...>       Inspect item metadata, targets, and dependencies
  docs <item|topic>    Print canonical documentation
  info                 Report local project and CLI compatibility
  status               Classify local manifest and owned file state
  doctor               Check project configuration and integrity

Transactional source commands:
  add <item...>        Add canonical source and provenance transactionally
  remove <item...>     Remove only demonstrably owned source
  adopt <item...>      Adopt exact recognizable existing source
  recover              Resume or roll back an incomplete transaction

Common options:
  --cwd <path>         Explicit project root candidate (--root remains an add alias)
  --json               Emit one versioned JSON result envelope
  --dry-run            Resolve and emit the exact plan without writing
  --plan               Alias for a read-only exact plan
  --yes                Accept an ordinary conflict-free exact plan
  --non-interactive    Never prompt; missing consent fails safely
  --package-manager <npm|pnpm|yarn|bun>
  --color <always|auto|never>  Human output only; no ANSI is emitted today

Run "mergora <command> --help" for command options. Three-way updates and
completed-transaction rollback remain separate later Semantic Sync work.`;

const COMMAND_HELP: Readonly<Record<string, string>> = {
  init: `Usage: mergora init [--cwd <path>] [--framework <next-app|next-pages|vite-react|react>]
                    [--source-root <path>] [--global-css <path>] [--alias-prefix <prefix>]
                    [--package-manager <manager>] [--plan|--dry-run] [--yes]

Creates only mergora.json, the empty portable manifest, and narrow local-state
.gitignore rules. Existing package.json, tsconfig.json, and CSS bytes are preserved.`,
  search: `Usage: mergora search [query] [--kind <kind>] [--category <category>]
                      [--maturity <maturity>] [--tag <tag>] [--limit <1-100>] [--json]`,
  view: `Usage: mergora view <item...> [--files] [--source <logical-path>] [--json]`,
  docs: `Usage: mergora docs <item|topic> [--format <markdown|json|url>] [--open]

--open is ignored in CI/non-interactive mode and never sends project data.`,
  info: `Usage: mergora info [--cwd <path>] [--json]`,
  status: `Usage: mergora status [--cwd <path>] [--json]

Status is local-only in this tranche.`,
  doctor: `Usage: mergora doctor [--cwd <path>] [--json] [--fix --plan|--dry-run|--yes]

--fix is limited to the same safe initialization edits and cannot touch source.`,
  add: `Usage: mergora add <item...> [--root|--cwd <path>] [--target <relative-path>]
                   [--no-install] [--offline] [--plan|--dry-run] [--yes] [--json]

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
  recover: `Usage: mergora recover [--cwd <path>] [--transaction <id>]
                       [--strategy <auto|rollback|resume>] [--plan|--dry-run] [--yes]

Classifies recorded pre/post digests. Auto recovery is conservative; ambiguous live
state is never changed.`,
};

interface ParsedArguments {
  readonly command: string;
  readonly positionals: readonly string[];
  readonly flags: ReadonlyMap<string, readonly string[]>;
}

const VALUE_FLAGS = new Set([
  "alias-prefix",
  "category",
  "color",
  "config",
  "cwd",
  "format",
  "framework",
  "global-css",
  "kind",
  "limit",
  "maturity",
  "package-manager",
  "registry",
  "root",
  "source",
  "source-root",
  "strategy",
  "tag",
  "target",
  "transaction",
]);

const BOOLEAN_FLAGS = new Set([
  "dry-run",
  "files",
  "fix",
  "help",
  "json",
  "keep-files",
  "no-install",
  "non-interactive",
  "offline",
  "open",
  "plan",
  "verbose",
  "yes",
]);

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
  const flags = new Map<string, string[]>();
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
      if (BOOLEAN_FLAGS.has(name)) {
        const values = flags.get(name) ?? [];
        values.push("true");
        flags.set(name, values);
      } else if (VALUE_FLAGS.has(name)) {
        const value = normalized[index + 1];
        if (value === undefined || value.startsWith("--")) {
          throw new Error(`--${name} requires a value.`);
        }
        const values = flags.get(name) ?? [];
        values.push(value);
        flags.set(name, values);
        index += 1;
      } else throw new Error(`Unknown option ${JSON.stringify(argument)}.`);
      continue;
    }
    if (!positionalOnly && argument.startsWith("-") && argument !== "-") {
      if (argument === "-v") {
        if (command !== undefined) throw new Error("-v must be used without a command.");
        command = "--version";
      } else throw new Error(`Unknown short option ${JSON.stringify(argument)}.`);
      continue;
    }
    if (command === undefined) command = argument;
    else positionals.push(argument);
  }
  return { command: command ?? "help", positionals, flags };
}

function hasFlag(parsed: ParsedArguments, name: string): boolean {
  return parsed.flags.has(name);
}

function flagValue(parsed: ParsedArguments, name: string): string | undefined {
  const values = parsed.flags.get(name);
  if (values !== undefined && values.length > 1)
    throw new Error(`--${name} may be provided only once.`);
  return values?.[0];
}

function assertAllowedFlags(parsed: ParsedArguments, allowed: readonly string[]): void {
  const set = new Set(allowed);
  for (const name of parsed.flags.keys()) {
    if (!set.has(name)) throw new Error(`--${name} is not valid for ${parsed.command}.`);
  }
}

function projectRoot(parsed: ParsedArguments): string {
  const cwd = flagValue(parsed, "cwd");
  const legacy = flagValue(parsed, "root");
  if (cwd !== undefined && legacy !== undefined && cwd !== legacy) {
    throw new Error("--cwd and --root must not select different project roots.");
  }
  const config = flagValue(parsed, "config");
  if (config !== undefined && config !== "mergora.json") {
    throw new Error("This tranche accepts only the project-relative --config mergora.json.");
  }
  const registry = flagValue(parsed, "registry");
  if (registry !== undefined && registry !== "official") {
    throw new Error("Only the compiled official registry is enrolled in this tranche.");
  }
  return cwd ?? legacy ?? process.cwd();
}

function parseManager(value: string | undefined): "npm" | "pnpm" | "yarn" | "bun" | undefined {
  if (value === undefined) return undefined;
  if (value !== "npm" && value !== "pnpm" && value !== "yarn" && value !== "bun") {
    throw new Error("--package-manager must be npm, pnpm, yarn, or bun.");
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
    throw new Error("--framework must be next-app, next-pages, vite-react, or react.");
  }
  return value;
}

function colorMode(parsed: ParsedArguments): void {
  const value = flagValue(parsed, "color");
  if (value !== undefined && value !== "always" && value !== "auto" && value !== "never") {
    throw new Error("--color must be always, auto, or never.");
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

type Api = typeof import("./index.js");

interface CommandOutput {
  readonly result: unknown;
  readonly status?: string;
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
    throw new Error("--strategy must be auto, rollback, or resume.");
  }
  return value;
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
  colorMode(parsed);
  const root = projectRoot(parsed);
  switch (parsed.command) {
    case "init": {
      assertAllowedFlags(parsed, [
        "alias-prefix",
        "color",
        "config",
        "cwd",
        "dry-run",
        "framework",
        "global-css",
        "help",
        "json",
        "non-interactive",
        "offline",
        "package-manager",
        "plan",
        "registry",
        "source-root",
        "verbose",
        "yes",
      ]);
      if (parsed.positionals.length > 0)
        throw new Error("init does not accept positional arguments.");
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
      assertAllowedFlags(parsed, [
        "category",
        "color",
        "help",
        "json",
        "kind",
        "limit",
        "maturity",
        "offline",
        "registry",
        "tag",
        "verbose",
      ]);
      if (parsed.positionals.length > 1) throw new Error("search accepts at most one query.");
      const limitText = flagValue(parsed, "limit");
      const result = api.searchRegistry(parsed.positionals[0] ?? "", {
        kind: flagValue(parsed, "kind"),
        category: flagValue(parsed, "category"),
        maturity: flagValue(parsed, "maturity"),
        tag: flagValue(parsed, "tag"),
        limit: limitText === undefined ? undefined : Number(limitText),
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
      assertAllowedFlags(parsed, [
        "color",
        "files",
        "help",
        "json",
        "offline",
        "registry",
        "source",
        "verbose",
      ]);
      const source = flagValue(parsed, "source");
      const result = api.viewRegistryItems(parsed.positionals, {
        files: hasFlag(parsed, "files"),
        source,
      });
      const raw = source === undefined ? undefined : result[0]?.requestedSource?.content;
      return {
        result,
        text: result
          .map(
            (item) =>
              `${item.id} — ${item.title}\n${item.description}\nMaturity: ${item.maturity}; source: ${item.sourceAvailable ? "available (unreleased)" : "not implemented"}; dependencies: ${String(item.registryDependencies.length)}`,
          )
          .join("\n\n"),
        ...(raw === undefined ? {} : { raw }),
      };
    }
    case "docs": {
      assertAllowedFlags(parsed, [
        "color",
        "format",
        "help",
        "json",
        "non-interactive",
        "offline",
        "open",
        "registry",
        "verbose",
      ]);
      if (parsed.positionals.length !== 1)
        throw new Error("docs requires exactly one item or topic.");
      const format = flagValue(parsed, "format") ?? "markdown";
      if (format !== "markdown" && format !== "json" && format !== "url") {
        throw new Error("docs --format must be markdown, json, or url.");
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
      assertAllowedFlags(parsed, [
        "alias-prefix",
        "color",
        "config",
        "cwd",
        "framework",
        "global-css",
        "help",
        "json",
        "package-manager",
        "registry",
        "root",
        "source-root",
        "verbose",
      ]);
      if (parsed.positionals.length > 0)
        throw new Error("info does not accept positional arguments.");
      const result = api.projectInfo(root, commonProjectOptions(parsed));
      return {
        result,
        text: `Mergora ${result.cliVersion}; ${result.framework}; ${result.packageManager}; config ${result.configStatus}; manifest ${result.manifestStatus}.`,
      };
    }
    case "status": {
      assertAllowedFlags(parsed, ["color", "config", "cwd", "help", "json", "root", "verbose"]);
      if (parsed.positionals.length > 0)
        throw new Error("status does not accept positional arguments.");
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
    case "doctor": {
      assertAllowedFlags(parsed, [
        "color",
        "config",
        "cwd",
        "dry-run",
        "fix",
        "help",
        "json",
        "non-interactive",
        "offline",
        "package-manager",
        "plan",
        "root",
        "verbose",
        "yes",
      ]);
      if (parsed.positionals.length > 0)
        throw new Error("doctor does not accept positional arguments.");
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
    case "add": {
      assertAllowedFlags(parsed, [
        "color",
        "config",
        "cwd",
        "dry-run",
        "help",
        "json",
        "no-install",
        "non-interactive",
        "offline",
        "package-manager",
        "plan",
        "registry",
        "root",
        "target",
        "verbose",
        "yes",
      ]);
      const options = sourceCommandOptions(parsed, root);
      const plan = api.planSourceAdd(options);
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
      const result = api.applySourceAdd(options, plan.planDigest);
      return {
        result,
        status: result.transaction.state,
        warnings: plan.warnings,
        text: renderSourceResult(result),
      };
    }
    case "remove": {
      assertAllowedFlags(parsed, [
        "color",
        "config",
        "cwd",
        "dry-run",
        "help",
        "json",
        "keep-files",
        "no-install",
        "non-interactive",
        "offline",
        "package-manager",
        "plan",
        "registry",
        "root",
        "verbose",
        "yes",
      ]);
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
      assertAllowedFlags(parsed, [
        "color",
        "config",
        "cwd",
        "dry-run",
        "help",
        "json",
        "non-interactive",
        "plan",
        "registry",
        "root",
        "target",
        "verbose",
        "yes",
      ]);
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
    case "recover": {
      assertAllowedFlags(parsed, [
        "color",
        "cwd",
        "dry-run",
        "help",
        "json",
        "non-interactive",
        "offline",
        "plan",
        "root",
        "strategy",
        "transaction",
        "verbose",
        "yes",
      ]);
      if (parsed.positionals.length > 0) {
        throw new Error("recover does not accept positional arguments; use --transaction.");
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
      throw new Error(`Unknown command ${JSON.stringify(parsed.command)}.`);
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
    const { redactMessage } = await import("./contracts.js");
    const wantsJson =
      arguments_.includes("--json") || arguments_.some((entry) => entry.startsWith("--json="));
    const message = redactMessage(
      error instanceof Error ? error.message : "Invalid command usage.",
    );
    if (wantsJson) {
      process.stdout.write(
        `${JSON.stringify({ schemaVersion: 1, command: redactMessage(arguments_[0] ?? "unknown"), ok: false, status: "error", exitCode: 2, result: {}, warnings: [], errors: [{ code: "COMMAND_USAGE_INVALID", message }] })}\n`,
      );
    } else process.stderr.write(`mergora: ${message}\n`);
    process.exitCode = 2;
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
    if (asJson) {
      process.stdout.write(
        `${JSON.stringify(api.successEnvelope(parsed.command, output.result, { status: output.status, warnings: output.warnings }))}\n`,
      );
    } else if (output.raw !== undefined) {
      process.stdout.write(`${output.raw}${output.raw.endsWith("\n") ? "" : "\n"}`);
    } else process.stdout.write(`${output.text}\n`);
  } catch (error) {
    const known =
      error instanceof api.CliError
        ? error
        : new api.CliError(error instanceof Error ? error.message : "Unexpected CLI failure.", {
            code: "COMMAND_USAGE_INVALID",
            exitCode: error instanceof Error ? 2 : 1,
          });
    if (hasFlag(parsed, "json")) {
      process.stdout.write(`${JSON.stringify(api.errorEnvelope(parsed.command, known))}\n`);
    } else process.stderr.write(`mergora: ${api.redactMessage(known.message)}\n`);
    process.exitCode = known.exitCode;
  }
}

await main(process.argv.slice(2));
