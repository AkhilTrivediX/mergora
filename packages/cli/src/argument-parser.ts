import {
  allowedCliFlags,
  cliFlagKind,
  isCliCommand,
  type CliCommand,
  type CliFlag,
} from "./command-contract.js";

export class CommandUsageError extends Error {
  public constructor(message: string) {
    super(message);
    this.name = "CommandUsageError";
  }
}

export interface ParsedArguments {
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

/**
 * Parse the argv surface used by the executable without reading the filesystem or
 * executing a command. This is intentionally exported so generated commands can
 * be contract-checked against the same parser before they are published.
 */
export function parseArguments(arguments_: readonly string[]): ParsedArguments {
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
  if (!isCliCommand(command)) {
    throw new CommandUsageError(`Unknown command ${JSON.stringify(command)}.`);
  }
  return { command, positionals, flags };
}

function parsedSubcommand(parsed: ParsedArguments): string | undefined {
  if (parsed.command === "theme" || parsed.command === "registry") return parsed.positionals[0];
  if (parsed.command === "vendor") return parsed.positionals[0] === "verify" ? "verify" : "create";
  return undefined;
}

/** Validate command-specific flags after parsing, matching executable dispatch. */
export function assertAllowedCliInvocation(parsed: ParsedArguments): void {
  const allowed = new Set(allowedCliFlags(parsed.command, parsedSubcommand(parsed)));
  for (const name of parsed.flags.keys()) {
    if (!allowed.has(name)) {
      throw new CommandUsageError(`--${name} is not valid for ${parsed.command}.`);
    }
  }
}
