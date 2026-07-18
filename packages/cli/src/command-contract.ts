export const CLI_FLAG_KINDS = {
  "accept-registry-identity": "value",
  acknowledge: "value",
  "alias-prefix": "value",
  a11y: "boolean",
  all: "boolean",
  "all-installed": "boolean",
  "allow-insecure-localhost": "boolean",
  "allow-prerelease": "boolean",
  apply: "boolean",
  "auth-env": "value",
  bases: "boolean",
  browser: "boolean",
  cache: "boolean",
  category: "value",
  changed: "boolean",
  color: "value",
  config: "value",
  conflicts: "boolean",
  cwd: "value",
  "dry-run": "boolean",
  files: "boolean",
  fix: "boolean",
  format: "value",
  framework: "value",
  "global-css": "value",
  help: "boolean",
  json: "boolean",
  "keep-files": "boolean",
  keyboard: "boolean",
  kind: "value",
  last: "boolean",
  limit: "value",
  list: "boolean",
  local: "boolean",
  maturity: "value",
  "name-only": "boolean",
  "no-install": "boolean",
  "non-interactive": "boolean",
  offline: "boolean",
  open: "boolean",
  "package-manager": "value",
  plan: "boolean",
  preset: "value",
  protocol: "value",
  "release-file": "value",
  reset: "value",
  responsive: "boolean",
  "retain-transactions": "value",
  registry: "value",
  resolved: "value",
  root: "value",
  source: "value",
  "source-root": "value",
  stat: "boolean",
  static: "boolean",
  strategy: "value",
  tag: "value",
  "take-local": "value",
  "take-upstream": "value",
  target: "value",
  template: "value",
  to: "value",
  transaction: "value",
  transactions: "boolean",
  upstream: "boolean",
  verbose: "boolean",
  yes: "boolean",
} as const;

export type CliFlag = keyof typeof CLI_FLAG_KINDS;
export type CliFlagKind = (typeof CLI_FLAG_KINDS)[CliFlag];

export const JSON_RESULT_STATUSES = [
  "success",
  "created",
  "planned",
  "applied",
  "no-op",
  "differences",
  "no-differences",
  "fix-planned",
  "healthy",
  "issues-found",
  "pass",
  "fail",
  "incomplete",
  "not-applicable",
  "conflict",
  "conflicted",
  "resolved",
  "committed",
  "rolled-back",
  "recorded",
  "manual-only",
  "transaction",
  "report",
  "cleaned",
  "match",
  "mismatch",
  "not-pinned",
  "not-checked",
  "verified",
  "identity-mismatch",
  "valid",
  "rollback-planned",
  "resume-planned",
  "finalize-planned",
  "invalid",
  "unavailable",
  "incompatible",
  "recovery-required",
  "failed",
  "consent-required",
  "error",
] as const;

export type JsonResultStatus = (typeof JSON_RESULT_STATUSES)[number];

export const STABLE_EXIT_CODES = {
  0: "success",
  1: "internal-failure",
  2: "invalid-usage",
  3: "invalid-project",
  4: "network-or-artifact-unavailable",
  5: "registry-or-security-policy",
  6: "merge-or-ownership-conflict",
  7: "unsupported-or-incompatible",
  8: "transaction-or-recovery-failure",
  9: "package-manager-failure",
  10: "contract-failure",
  11: "authentication-required",
  12: "consent-required",
} as const;

export type StableExitCodeContract = keyof typeof STABLE_EXIT_CODES;
export type CliCommandCategory = "bootstrap" | "discovery" | "health" | "maintenance" | "source";

interface CliCommandContract {
  readonly category: CliCommandCategory;
  readonly flags?: readonly CliFlag[];
  readonly statuses: readonly JsonResultStatus[];
  readonly subcommands?: Readonly<Record<string, readonly CliFlag[]>>;
}

const human = ["color", "help", "json", "verbose"] as const satisfies readonly CliFlag[];
const project = ["config", "cwd", "root"] as const satisfies readonly CliFlag[];
const consent = ["dry-run", "non-interactive", "plan", "yes"] as const satisfies readonly CliFlag[];

export const CLI_COMMAND_CONTRACTS = {
  create: {
    category: "bootstrap",
    flags: [...human, "cwd", ...consent, "no-install", "package-manager", "preset", "template"],
    statuses: ["created", "planned"],
  },
  init: {
    category: "bootstrap",
    flags: [
      ...human,
      "alias-prefix",
      "config",
      "cwd",
      ...consent,
      "framework",
      "global-css",
      "offline",
      "package-manager",
      "registry",
      "source-root",
    ],
    statuses: ["applied", "no-op", "planned"],
  },
  search: {
    category: "discovery",
    flags: [...human, "category", "kind", "limit", "maturity", "offline", "registry", "tag"],
    statuses: ["success"],
  },
  view: {
    category: "discovery",
    flags: [...human, "files", "offline", "registry", "source"],
    statuses: ["success"],
  },
  docs: {
    category: "discovery",
    flags: [...human, "format", "non-interactive", "offline", "open", "registry"],
    statuses: ["success"],
  },
  info: {
    category: "discovery",
    flags: [
      ...human,
      ...project,
      "alias-prefix",
      "framework",
      "global-css",
      "package-manager",
      "registry",
      "source-root",
    ],
    statuses: ["success"],
  },
  status: {
    category: "discovery",
    flags: [...human, ...project],
    statuses: ["success"],
  },
  diff: {
    category: "discovery",
    flags: [
      ...human,
      ...project,
      "all",
      "format",
      "local",
      "name-only",
      "offline",
      "release-file",
      "stat",
      "to",
      "upstream",
    ],
    statuses: ["differences", "no-differences"],
  },
  doctor: {
    category: "health",
    flags: [...human, ...project, ...consent, "fix", "offline", "package-manager"],
    statuses: ["fix-planned", "healthy", "issues-found", "no-op"],
  },
  audit: {
    category: "health",
    flags: [
      ...human,
      ...project,
      "a11y",
      "all",
      "browser",
      "changed",
      "keyboard",
      "offline",
      "responsive",
      "static",
    ],
    statuses: ["pass", "fail", "incomplete", "not-applicable"],
  },
  add: {
    category: "source",
    flags: [
      ...human,
      ...project,
      ...consent,
      "no-install",
      "offline",
      "package-manager",
      "registry",
      "target",
    ],
    statuses: ["committed", "conflict", "no-op", "planned"],
  },
  remove: {
    category: "source",
    flags: [
      ...human,
      ...project,
      ...consent,
      "keep-files",
      "no-install",
      "offline",
      "package-manager",
      "registry",
    ],
    statuses: ["committed", "conflict", "no-op", "planned"],
  },
  update: {
    category: "source",
    flags: [
      ...human,
      ...project,
      ...consent,
      "all",
      "allow-prerelease",
      "no-install",
      "offline",
      "package-manager",
      "release-file",
      "to",
    ],
    statuses: ["committed", "conflict", "conflicted", "no-op", "planned"],
  },
  resolve: {
    category: "source",
    flags: [
      ...human,
      "cwd",
      "root",
      ...consent,
      "apply",
      "list",
      "no-install",
      "offline",
      "reset",
      "resolved",
      "take-local",
      "take-upstream",
      "transaction",
    ],
    statuses: ["committed", "conflicted", "planned", "recorded", "resolved"],
  },
  adopt: {
    category: "source",
    flags: [...human, ...project, ...consent, "registry", "target"],
    statuses: ["committed", "conflict", "no-op", "planned"],
  },
  rollback: {
    category: "source",
    flags: [...human, "cwd", "root", ...consent, "last", "no-install", "offline", "transaction"],
    statuses: ["committed", "conflict", "planned"],
  },
  recover: {
    category: "source",
    flags: [...human, "cwd", "root", ...consent, "offline", "strategy", "transaction"],
    statuses: [
      "committed",
      "finalize-planned",
      "resume-planned",
      "rollback-planned",
      "rolled-back",
    ],
  },
  theme: {
    category: "maintenance",
    statuses: ["committed", "no-op", "planned", "success"],
    subcommands: {
      apply: [...human, "cwd", "root", ...consent, "acknowledge", "target"],
      export: [...human, "cwd", "root", "format"],
      import: [...human, "cwd", "root", ...consent, "acknowledge", "target"],
      list: [...human, "cwd", "root"],
      preview: [...human, "cwd", "root", "open"],
    },
  },
  migrate: {
    category: "maintenance",
    flags: [...human, "cwd", "root", ...consent],
    statuses: ["committed", "manual-only", "no-op", "transaction"],
  },
  registry: {
    category: "maintenance",
    statuses: [
      "committed",
      "identity-mismatch",
      "incomplete",
      "match",
      "mismatch",
      "no-op",
      "not-checked",
      "not-pinned",
      "planned",
      "success",
      "verified",
    ],
    subcommands: {
      enroll: [
        ...human,
        "cwd",
        "root",
        ...consent,
        "accept-registry-identity",
        "allow-insecure-localhost",
        "auth-env",
        "protocol",
      ],
      inspect: [...human, "cwd", "root", "offline"],
      list: [...human, "cwd", "root"],
      remove: [...human, "cwd", "root", ...consent],
      verify: [...human, "cwd", "root", "offline"],
    },
  },
  vendor: {
    category: "maintenance",
    statuses: ["committed", "no-op", "planned", "valid"],
    subcommands: {
      create: [...human, "cwd", "root", ...consent, "all-installed", "offline"],
      verify: [...human, "cwd", "root", "offline"],
    },
  },
  clean: {
    category: "maintenance",
    flags: [
      ...human,
      "cwd",
      "root",
      ...consent,
      "bases",
      "cache",
      "conflicts",
      "retain-transactions",
      "transactions",
    ],
    statuses: ["cleaned", "no-op", "planned", "report"],
  },
} as const satisfies Readonly<Record<string, CliCommandContract>>;

export type CliCommand = keyof typeof CLI_COMMAND_CONTRACTS;

export function isCliCommand(value: string): value is CliCommand {
  return Object.hasOwn(CLI_COMMAND_CONTRACTS, value);
}

export function cliFlagKind(value: string): CliFlagKind | undefined {
  return Object.hasOwn(CLI_FLAG_KINDS, value) ? CLI_FLAG_KINDS[value as CliFlag] : undefined;
}

export function allowedCliFlags(command: CliCommand, subcommand?: string): readonly CliFlag[] {
  const contract: CliCommandContract = CLI_COMMAND_CONTRACTS[command];
  if (contract.subcommands === undefined) return contract.flags ?? [];
  if (subcommand === undefined || !Object.hasOwn(contract.subcommands, subcommand)) return [];
  return contract.subcommands[subcommand] ?? [];
}

export function normalizeCliCommand(value: string): CliCommand | "unknown" {
  return isCliCommand(value) ? value : "unknown";
}

export function isJsonResultStatus(value: string): value is JsonResultStatus {
  return (JSON_RESULT_STATUSES as readonly string[]).includes(value);
}
