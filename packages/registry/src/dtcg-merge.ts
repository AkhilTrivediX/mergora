import { mergeJsonThreeWay, type JsonMergeResult } from "./json-merge.js";
import { semanticConflict, type SemanticConflict } from "./merge-model.js";

export interface DtcgAccessibilityIssue {
  readonly id: string;
  readonly detail: string;
}

export interface DtcgMergeOptions {
  readonly maxCharacters?: number;
  readonly maxDepth?: number;
  readonly maxNodes?: number;
  readonly maxTokens?: number;
  readonly validateAccessibility?:
    | ((document: Readonly<Record<string, unknown>>) => readonly DtcgAccessibilityIssue[])
    | undefined;
}

export interface DtcgMergeResult {
  readonly status: JsonMergeResult["status"];
  readonly content: string | null;
  readonly conflicts: readonly SemanticConflict[];
  readonly appliedRemoteKeys: readonly string[];
  readonly preservedLocalKeys: readonly string[];
}

interface TokenUnit {
  readonly key: string;
  readonly path: string;
  readonly valueAndType: string;
  readonly aliases: readonly string[];
}

interface TokenDocument {
  readonly root: Record<string, unknown>;
  readonly tokens: ReadonlyMap<string, TokenUnit>;
}

const DEFAULT_MAX_CHARACTERS = 2_097_152;
const DEFAULT_MAX_DEPTH = 128;
const DEFAULT_MAX_NODES = 100_000;
const DEFAULT_MAX_TOKENS = 20_000;
const REFERENCE = /^\{([a-zA-Z0-9_-]+(?:\.[a-zA-Z0-9_-]+)*)\}$/u;

class DtcgAdapterError extends Error {
  readonly key: string;

  constructor(key: string, message: string) {
    super(message);
    this.key = key;
  }
}

function isObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (isObject(value)) {
    return `{${Object.keys(value)
      .sort((left, right) => left.localeCompare(right, "en-US"))
      .map((key) => `${JSON.stringify(key)}:${canonical(value[key])}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
}

function contextParts(value: unknown): readonly string[] {
  if (!isObject(value)) return [];
  const direct = isObject(value.mergora) ? value.mergora : value;
  return ["preset", "mode", "theme", "density"]
    .flatMap((name) => (typeof direct[name] === "string" ? [`${name}=${direct[name]}`] : []))
    .sort((left, right) => left.localeCompare(right, "en-US"));
}

function collectAliases(value: unknown, aliases: Set<string>): void {
  if (typeof value === "string") {
    const match = REFERENCE.exec(value);
    if (match !== null) aliases.add(match[1]!);
    return;
  }
  if (Array.isArray(value)) {
    for (const entry of value) collectAliases(entry, aliases);
    return;
  }
  if (isObject(value)) {
    for (const entry of Object.values(value)) collectAliases(entry, aliases);
  }
}

function parseDtcg(source: string, label: string, options: DtcgMergeOptions): TokenDocument {
  if (source.length > (options.maxCharacters ?? DEFAULT_MAX_CHARACTERS)) {
    throw new DtcgAdapterError(`$${label}`, `${label} exceeds the DTCG character limit.`);
  }
  let value: unknown;
  try {
    value = JSON.parse(source) as unknown;
  } catch {
    throw new DtcgAdapterError(`$${label}`, `${label} is not valid strict JSON.`);
  }
  if (!isObject(value)) {
    throw new DtcgAdapterError(`$${label}`, `${label} must contain a DTCG object root.`);
  }

  const tokens = new Map<string, TokenUnit>();
  let nodes = 0;
  const visit = (
    node: Record<string, unknown>,
    path: readonly string[],
    inheritedType: string | undefined,
    inheritedContext: readonly string[],
    depth: number,
  ): void => {
    if (depth > (options.maxDepth ?? DEFAULT_MAX_DEPTH)) {
      throw new DtcgAdapterError(path.join("."), "DTCG nesting exceeds the adapter limit.");
    }
    nodes += 1;
    if (nodes > (options.maxNodes ?? DEFAULT_MAX_NODES)) {
      throw new DtcgAdapterError(path.join("."), "DTCG node count exceeds the adapter limit.");
    }
    const ownType = node.$type;
    if (ownType !== undefined && typeof ownType !== "string") {
      throw new DtcgAdapterError(path.join("."), "DTCG $type must be a string.");
    }
    const type = typeof ownType === "string" ? ownType : inheritedType;
    const context = [...new Set([...inheritedContext, ...contextParts(node.$extensions)])].sort(
      (left, right) => left.localeCompare(right, "en-US"),
    );
    if (Object.hasOwn(node, "$value")) {
      if (path.length === 0) {
        throw new DtcgAdapterError("/", "A DTCG token requires a non-empty path.");
      }
      if (type === undefined) {
        throw new DtcgAdapterError(path.join("."), "A DTCG token requires an effective $type.");
      }
      const tokenPath = path.join(".");
      const key = context.length === 0 ? tokenPath : `${tokenPath}@${context.join(",")}`;
      if (tokens.has(key)) {
        throw new DtcgAdapterError(key, "DTCG token identity is ambiguous.");
      }
      const aliases = new Set<string>();
      collectAliases(node.$value, aliases);
      tokens.set(key, {
        key,
        path: tokenPath,
        valueAndType: canonical({ $type: type, $value: node.$value }),
        aliases: [...aliases].sort((left, right) => left.localeCompare(right, "en-US")),
      });
      if (tokens.size > (options.maxTokens ?? DEFAULT_MAX_TOKENS)) {
        throw new DtcgAdapterError(key, "DTCG token count exceeds the adapter limit.");
      }
      for (const keyName of Object.keys(node)) {
        if (!keyName.startsWith("$")) {
          throw new DtcgAdapterError(key, "A DTCG token cannot also contain child token groups.");
        }
      }
      return;
    }
    for (const keyName of Object.keys(node).sort((left, right) =>
      left.localeCompare(right, "en-US"),
    )) {
      if (keyName.startsWith("$")) continue;
      const child = node[keyName];
      if (!isObject(child)) {
        throw new DtcgAdapterError(
          [...path, keyName].join("."),
          "DTCG groups may contain only token or group objects.",
        );
      }
      visit(child, [...path, keyName], type, context, depth + 1);
    }
  };
  visit(value, [], undefined, [], 0);
  return { root: value, tokens };
}

function unitEqual(left: TokenUnit | undefined, right: TokenUnit | undefined): boolean {
  if (left === undefined || right === undefined) return left === right;
  return left.valueAndType === right.valueAndType;
}

function validateAliases(document: TokenDocument): readonly SemanticConflict[] {
  const byPath = new Map<string, TokenUnit[]>();
  for (const token of document.tokens.values()) {
    const group = byPath.get(token.path) ?? [];
    group.push(token);
    byPath.set(token.path, group);
  }
  const edges = new Map<string, string[]>();
  const conflicts: SemanticConflict[] = [];
  for (const token of document.tokens.values()) {
    const targets: string[] = [];
    for (const alias of token.aliases) {
      const candidates = byPath.get(alias) ?? [];
      if (candidates.length !== 1) {
        conflicts.push(
          semanticConflict(
            `dtcg:${token.key}`,
            "concurrent-edit",
            candidates.length === 0
              ? `Token alias {${alias}} does not resolve.`
              : `Token alias {${alias}} is ambiguous across contexts.`,
          ),
        );
      } else targets.push(candidates[0]!.key);
    }
    edges.set(token.key, targets);
  }
  const visiting = new Set<string>();
  const visited = new Set<string>();
  const walk = (key: string, chain: readonly string[]): void => {
    if (visiting.has(key)) {
      const start = chain.indexOf(key);
      const cycle = [...chain.slice(start), key];
      conflicts.push(
        semanticConflict(
          `dtcg:${key}`,
          "concurrent-edit",
          `Token alias cycle detected: ${cycle.join(" -> ")}.`,
        ),
      );
      return;
    }
    if (visited.has(key)) return;
    visiting.add(key);
    for (const target of edges.get(key) ?? []) walk(target, [...chain, key]);
    visiting.delete(key);
    visited.add(key);
  };
  for (const key of [...edges.keys()].sort((left, right) => left.localeCompare(right, "en-US"))) {
    walk(key, []);
  }
  return conflicts;
}

function conflictResult(conflicts: readonly SemanticConflict[]): DtcgMergeResult {
  return {
    status: "conflict",
    content: null,
    conflicts: [...conflicts].sort((left, right) => left.id.localeCompare(right.id, "en-US")),
    appliedRemoteKeys: [],
    preservedLocalKeys: [],
  };
}

/**
 * DTCG three-way merge. JSON byte surgery remains delegated to the loss-minimizing
 * JSON adapter, while token values and effective types are treated as atomic units.
 */
export function mergeDtcgThreeWay(
  input: { readonly base: string; readonly local: string; readonly remote: string },
  options: DtcgMergeOptions = {},
): DtcgMergeResult {
  const parsed: Partial<Record<"base" | "local" | "remote", TokenDocument>> = {};
  const parseConflicts: SemanticConflict[] = [];
  for (const label of ["base", "local", "remote"] as const) {
    try {
      parsed[label] = parseDtcg(input[label], label, options);
    } catch (error) {
      if (!(error instanceof DtcgAdapterError)) throw error;
      parseConflicts.push(semanticConflict(`dtcg:${error.key}`, "invalid-json", error.message));
    }
  }
  if (parseConflicts.length > 0) return conflictResult(parseConflicts);

  const base = parsed.base!;
  const local = parsed.local!;
  const remote = parsed.remote!;
  const tokenConflicts: SemanticConflict[] = [];
  const appliedRemoteKeys: string[] = [];
  const preservedLocalKeys: string[] = [];
  const keys = [
    ...new Set([...base.tokens.keys(), ...local.tokens.keys(), ...remote.tokens.keys()]),
  ].sort((left, right) => left.localeCompare(right, "en-US"));
  for (const key of keys) {
    const baseUnit = base.tokens.get(key);
    const localUnit = local.tokens.get(key);
    const remoteUnit = remote.tokens.get(key);
    if (unitEqual(localUnit, remoteUnit)) continue;
    if (unitEqual(localUnit, baseUnit)) appliedRemoteKeys.push(`dtcg:${key}`);
    else if (unitEqual(remoteUnit, baseUnit)) preservedLocalKeys.push(`dtcg:${key}`);
    else {
      tokenConflicts.push(
        semanticConflict(
          `dtcg:${key}`,
          "concurrent-edit",
          "Local and upstream changed the same DTCG token value or effective type unequally.",
          {
            base: baseUnit?.valueAndType ?? null,
            local: localUnit?.valueAndType ?? null,
            remote: remoteUnit?.valueAndType ?? null,
          },
        ),
      );
    }
  }
  if (tokenConflicts.length > 0) return conflictResult(tokenConflicts);

  const jsonResult = mergeJsonThreeWay(input, {
    format: "json",
    ...(options.maxCharacters === undefined ? {} : { maxCharacters: options.maxCharacters }),
    ...(options.maxDepth === undefined ? {} : { maxDepth: options.maxDepth }),
    ...(options.maxNodes === undefined ? {} : { maxNodes: options.maxNodes }),
  });
  if (jsonResult.status === "conflict" || jsonResult.content === null) {
    return conflictResult(jsonResult.conflicts);
  }
  let proposed: TokenDocument;
  try {
    proposed = parseDtcg(jsonResult.content, "proposed", options);
  } catch (error) {
    if (!(error instanceof DtcgAdapterError)) throw error;
    return conflictResult([semanticConflict(`dtcg:${error.key}`, "invalid-json", error.message)]);
  }
  const integrityConflicts = [...validateAliases(proposed)];
  for (const issue of options.validateAccessibility?.(proposed.root) ?? []) {
    integrityConflicts.push(
      semanticConflict(`dtcg:a11y:${issue.id}`, "concurrent-edit", issue.detail),
    );
  }
  if (integrityConflicts.length > 0) return conflictResult(integrityConflicts);

  return {
    status: jsonResult.status,
    content: jsonResult.content,
    conflicts: [],
    appliedRemoteKeys: [...new Set(appliedRemoteKeys)].sort((left, right) =>
      left.localeCompare(right, "en-US"),
    ),
    preservedLocalKeys: [...new Set(preservedLocalKeys)].sort((left, right) =>
      left.localeCompare(right, "en-US"),
    ),
  };
}
