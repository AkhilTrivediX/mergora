import { readFileSync } from "node:fs";

import { CliError } from "./contracts.js";

interface RootProperty {
  readonly key: string;
  readonly keyStart: number;
  readonly valueStart: number;
}

export interface DependencyRequirement {
  readonly range: string;
  readonly owners: readonly string[];
}

export interface PackageDependencyChange {
  readonly scope: "runtime";
  readonly package: string;
  readonly operation: "add" | "remove";
  readonly from: string | null;
  readonly to: string | null;
  readonly owners: readonly string[];
}

export interface PackageDependencyPlan {
  readonly before: string;
  readonly after: string;
  readonly dependencies: Readonly<Record<string, string>>;
  readonly changes: readonly PackageDependencyChange[];
}

function semanticVersion(value: string): readonly [number, number, number] | null {
  const match = /^(\d+)\.(\d+)\.(\d+)(?:-[0-9A-Za-z.-]+)?$/u.exec(value);
  return match === null ? null : [Number(match[1]), Number(match[2]), Number(match[3])];
}

export function compatibleDependencyRange(existing: string, required: string): boolean {
  if (existing === required) return true;
  const wanted = semanticVersion(required);
  if (wanted === null) return false;
  const normalized = existing.trim();
  const operator = normalized.startsWith("^") ? "^" : normalized.startsWith("~") ? "~" : "";
  const base = semanticVersion(operator === "" ? normalized : normalized.slice(1));
  if (base === null) return false;
  const compare = (left: readonly number[], right: readonly number[]) => {
    for (let index = 0; index < 3; index += 1) {
      if (left[index] !== right[index]) return left[index]! - right[index]!;
    }
    return 0;
  };
  if (compare(wanted, base) < 0) return false;
  if (operator === "^") {
    if (base[0] > 0) return wanted[0] === base[0];
    if (base[1] > 0) return wanted[0] === 0 && wanted[1] === base[1];
    return wanted[0] === 0 && wanted[1] === 0 && wanted[2] === base[2];
  }
  if (operator === "~") return wanted[0] === base[0] && wanted[1] === base[1];
  return false;
}

function stringEnd(text: string, start: number): number {
  let escaped = false;
  for (let index = start + 1; index < text.length; index += 1) {
    const character = text[index]!;
    if (escaped) escaped = false;
    else if (character === "\\") escaped = true;
    else if (character === '"') return index;
  }
  throw new CliError("package.json contains an unterminated string.", {
    code: "PACKAGE_JSON_INVALID",
    exitCode: 3,
    target: "package.json",
  });
}

function findObjectEnd(text: string, start: number): number {
  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let index = start; index < text.length; index += 1) {
    const character = text[index]!;
    if (inString) {
      if (escaped) escaped = false;
      else if (character === "\\") escaped = true;
      else if (character === '"') inString = false;
      continue;
    }
    if (character === '"') inString = true;
    else if (character === "{") depth += 1;
    else if (character === "}") {
      depth -= 1;
      if (depth === 0) return index;
    }
  }
  throw new CliError("package.json contains an unterminated object.", {
    code: "PACKAGE_JSON_INVALID",
    exitCode: 3,
    target: "package.json",
  });
}

function rootProperties(text: string): readonly RootProperty[] {
  const rootOpen = text.indexOf("{");
  if (rootOpen < 0) return [];
  let depth = 0;
  const properties: RootProperty[] = [];
  for (let index = rootOpen; index < text.length; index += 1) {
    const character = text[index]!;
    if (character === "{") depth += 1;
    else if (character === "}") depth -= 1;
    else if (character === '"') {
      const end = stringEnd(text, index);
      if (depth === 1) {
        let colon = end + 1;
        while (/\s/u.test(text[colon] ?? "")) colon += 1;
        if (text[colon] === ":") {
          let valueStart = colon + 1;
          while (/\s/u.test(text[valueStart] ?? "")) valueStart += 1;
          properties.push({
            key: JSON.parse(text.slice(index, end + 1)) as string,
            keyStart: index,
            valueStart,
          });
        }
      }
      index = end;
    }
  }
  return properties;
}

function assertUniqueRootProperties(text: string): void {
  const seen = new Set<string>();
  for (const property of rootProperties(text)) {
    if (seen.has(property.key)) {
      throw new CliError(`package.json repeats top-level field ${JSON.stringify(property.key)}.`, {
        code: "PACKAGE_JSON_DUPLICATE_KEY",
        exitCode: 3,
        target: "package.json",
      });
    }
    seen.add(property.key);
  }
}

function insertDependencies(text: string, additions: Readonly<Record<string, string>>): string {
  const entries = Object.entries(additions).sort(([left], [right]) =>
    left.localeCompare(right, "en-US"),
  );
  if (entries.length === 0) return text;
  const newline = text.includes("\r\n") ? "\r\n" : "\n";
  const multiline = text.includes("\n");
  const dependencyProperty = rootProperties(text).find(({ key }) => key === "dependencies");
  if (dependencyProperty !== undefined) {
    const open = dependencyProperty.valueStart;
    if (text[open] !== "{") {
      throw new CliError("package.json dependencies must be an object.", {
        code: "PACKAGE_DEPENDENCIES_INVALID",
        exitCode: 3,
        target: "package.json",
      });
    }
    const close = findObjectEnd(text, open);
    const body = text.slice(open + 1, close);
    const fieldLineStart = text.lastIndexOf("\n", dependencyProperty.keyStart) + 1;
    const fieldIndent =
      /^\s*/u.exec(text.slice(fieldLineStart, dependencyProperty.keyStart))?.[0] ?? "  ";
    const indentUnit = fieldIndent === "" ? "  " : fieldIndent;
    const childIndent = `${fieldIndent}${indentUnit}`;
    const serialized = entries
      .map(([name, version]) => `${JSON.stringify(name)}: ${JSON.stringify(version)}`)
      .join(multiline ? `,${newline}${childIndent}` : ",");
    if (body.trim() === "") {
      const inserted = multiline
        ? `${newline}${childIndent}${serialized}${newline}${fieldIndent}`
        : serialized;
      return `${text.slice(0, open + 1)}${inserted}${text.slice(close)}`;
    }
    const bodyEndWhitespace = /\s*$/u.exec(body)?.[0] ?? "";
    const bodyContent = body.slice(0, body.length - bodyEndWhitespace.length);
    const inserted = multiline
      ? `${bodyContent},${newline}${childIndent}${serialized}${bodyEndWhitespace}`
      : `${bodyContent},${serialized}${bodyEndWhitespace}`;
    return `${text.slice(0, open + 1)}${inserted}${text.slice(close)}`;
  }
  const rootOpen = text.indexOf("{");
  if (rootOpen < 0) {
    throw new CliError("package.json must contain an object.", {
      code: "PACKAGE_JSON_INVALID",
      exitCode: 3,
      target: "package.json",
    });
  }
  const rootClose = findObjectEnd(text, rootOpen);
  const body = text.slice(rootOpen + 1, rootClose);
  const rootIndent = "  ";
  const childIndent = "    ";
  const serialized = entries
    .map(([name, version]) => `${JSON.stringify(name)}: ${JSON.stringify(version)}`)
    .join(multiline ? `,${newline}${childIndent}` : ",");
  const dependencyField = multiline
    ? `${JSON.stringify("dependencies")}: {${newline}${childIndent}${serialized}${newline}${rootIndent}}`
    : `${JSON.stringify("dependencies")}:{${serialized}}`;
  if (body.trim() === "") {
    const inserted = multiline
      ? `${newline}${rootIndent}${dependencyField}${newline}`
      : dependencyField;
    return `${text.slice(0, rootOpen + 1)}${inserted}${text.slice(rootClose)}`;
  }
  const trailing = /\s*$/u.exec(body)?.[0] ?? "";
  const content = body.slice(0, body.length - trailing.length);
  const inserted = multiline
    ? `${content},${newline}${rootIndent}${dependencyField}${trailing}`
    : `${content},${dependencyField}${trailing}`;
  return `${text.slice(0, rootOpen + 1)}${inserted}${text.slice(rootClose)}`;
}

function replaceDependencyObject(
  text: string,
  dependencies: Readonly<Record<string, string>>,
): string {
  const property = rootProperties(text).find(({ key }) => key === "dependencies");
  if (property === undefined) return text;
  const open = property.valueStart;
  if (text[open] !== "{") {
    throw new CliError("package.json dependencies must be an object.", {
      code: "PACKAGE_DEPENDENCIES_INVALID",
      exitCode: 3,
      target: "package.json",
    });
  }
  const close = findObjectEnd(text, open);
  const originalBody = text.slice(open + 1, close);
  const newline = text.includes("\r\n") ? "\r\n" : "\n";
  const multiline = text.includes("\n");
  const fieldLineStart = text.lastIndexOf("\n", property.keyStart) + 1;
  const fieldIndent = /^\s*/u.exec(text.slice(fieldLineStart, property.keyStart))?.[0] ?? "  ";
  const firstLine = /(?:^|\r?\n)([ \t]+)"/u.exec(originalBody);
  const childIndent = firstLine?.[1] ?? `${fieldIndent}${fieldIndent === "" ? "  " : fieldIndent}`;
  const separator = /"(\s*:\s*)/u.exec(originalBody)?.[1] ?? ": ";
  const entries = Object.entries(dependencies);
  const body =
    entries.length === 0
      ? ""
      : multiline
        ? `${newline}${childIndent}${entries
            .map(([name, range]) => `${JSON.stringify(name)}${separator}${JSON.stringify(range)}`)
            .join(`,${newline}${childIndent}`)}${newline}${fieldIndent}`
        : entries
            .map(([name, range]) => `${JSON.stringify(name)}:${JSON.stringify(range)}`)
            .join(",");
  return `${text.slice(0, open + 1)}${body}${text.slice(close)}`;
}

function parsePackage(text: string): {
  readonly document: Record<string, unknown>;
  readonly dependencies: Record<string, string>;
} {
  let document: Record<string, unknown>;
  try {
    const value = JSON.parse(text) as unknown;
    if (value === null || Array.isArray(value) || typeof value !== "object") throw new Error();
    document = value as Record<string, unknown>;
  } catch {
    throw new CliError("package.json must contain one valid JSON object.", {
      code: "PACKAGE_JSON_INVALID",
      exitCode: 3,
      target: "package.json",
    });
  }
  assertUniqueRootProperties(text);
  const rawDependencies = document.dependencies;
  if (
    rawDependencies !== undefined &&
    (rawDependencies === null ||
      Array.isArray(rawDependencies) ||
      typeof rawDependencies !== "object")
  ) {
    throw new CliError("package.json dependencies must be an object when present.", {
      code: "PACKAGE_DEPENDENCIES_INVALID",
      exitCode: 3,
      target: "package.json",
    });
  }
  const dependencies: Record<string, string> = {};
  for (const [name, range] of Object.entries(rawDependencies ?? {})) {
    if (typeof range !== "string") {
      throw new CliError(`package.json dependency ${JSON.stringify(name)} must be a string.`, {
        code: "PACKAGE_DEPENDENCIES_INVALID",
        exitCode: 3,
        target: "package.json",
      });
    }
    dependencies[name] = range;
  }
  return { document, dependencies };
}

export function readPackageDependencies(packagePath: string): Readonly<Record<string, string>> {
  return parsePackage(readFileSync(packagePath, "utf8")).dependencies;
}

export function planPackageDependencies(
  packagePath: string,
  requirements: Readonly<Record<string, DependencyRequirement>>,
  removals: Readonly<Record<string, readonly string[]>> = {},
): PackageDependencyPlan {
  const before = readFileSync(packagePath, "utf8");
  const { dependencies } = parsePackage(before);
  const additions: Record<string, string> = {};
  const nextDependencies = { ...dependencies };
  const changes: PackageDependencyChange[] = [];
  for (const [name, requirement] of Object.entries(requirements).sort(([left], [right]) =>
    left.localeCompare(right, "en-US"),
  )) {
    if (removals[name] !== undefined) {
      throw new CliError(`Dependency ${name} cannot be added and removed in one operation.`, {
        code: "DEPENDENCY_PLAN_INVALID",
        exitCode: 7,
        target: "package.json",
      });
    }
    const existing = dependencies[name];
    if (existing !== undefined && !compatibleDependencyRange(existing, requirement.range)) {
      throw new CliError(
        `Dependency ${JSON.stringify(name)} is already ${JSON.stringify(existing)}; Mergora will not replace it with incompatible ${JSON.stringify(requirement.range)}.`,
        { code: "DEPENDENCY_RANGE_CONFLICT", exitCode: 7, target: "package.json" },
      );
    }
    if (existing === undefined) {
      additions[name] = requirement.range;
      nextDependencies[name] = requirement.range;
      changes.push({
        scope: "runtime",
        package: name,
        operation: "add",
        from: null,
        to: requirement.range,
        owners: [...requirement.owners].sort((left, right) => left.localeCompare(right, "en-US")),
      });
    }
  }
  for (const [name, owners] of Object.entries(removals).sort(([left], [right]) =>
    left.localeCompare(right, "en-US"),
  )) {
    const existing = nextDependencies[name];
    if (existing === undefined) continue;
    delete nextDependencies[name];
    changes.push({
      scope: "runtime",
      package: name,
      operation: "remove",
      from: existing,
      to: null,
      owners: [...owners].sort((left, right) => left.localeCompare(right, "en-US")),
    });
  }
  let after = before;
  if (Object.keys(removals).some((name) => dependencies[name] !== undefined)) {
    after = replaceDependencyObject(after, nextDependencies);
  }
  after = insertDependencies(after, additions);
  return { before, after, dependencies, changes };
}
