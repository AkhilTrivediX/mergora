import { parse, type Declaration, type Root, type Rule } from "postcss";

export type CssMergeStatus =
  "no-op" | "fast-forward" | "keep-local" | "semantic-merge" | "conflict";

export interface CssMergeConflict {
  readonly semanticKey: string;
  readonly reason:
    | "ambiguous-semantic-key"
    | "concurrent-edit"
    | "missing-local-container"
    | "parse-error"
    | "unsupported-declaration-container";
  readonly base: string | null;
  readonly local: string | null;
  readonly remote: string | null;
}

export interface CssMergeResult {
  readonly status: CssMergeStatus;
  readonly content: string | null;
  readonly conflicts: readonly CssMergeConflict[];
  readonly appliedRemoteKeys: readonly string[];
  readonly preservedLocalKeys: readonly string[];
}

interface DeclarationEntry {
  readonly node: Declaration;
  readonly ruleKey: string;
  readonly semanticKey: string;
  readonly semanticValue: string;
}

interface CssIndex {
  readonly declarations: ReadonlyMap<string, DeclarationEntry>;
  readonly rules: ReadonlyMap<string, Rule>;
  readonly conflicts: readonly CssMergeConflict[];
}

interface Mutation {
  readonly semanticKey: string;
  readonly local: DeclarationEntry | undefined;
  readonly remote: DeclarationEntry | undefined;
}

function normalizeWhitespace(value: string): string {
  return value.trim().replace(/\s+/gu, " ");
}

function atRuleContext(node: Rule): string {
  const ancestors: string[] = [];
  let current = node.parent;
  while (current !== undefined && current.type !== "root") {
    if (current.type === "atrule") {
      ancestors.push(
        `@${current.name.toLocaleLowerCase("en-US")} ${normalizeWhitespace(current.params)}`,
      );
    }
    current = current.parent;
  }
  return ancestors.reverse().join("/");
}

function ruleKey(rule: Rule): string {
  const context = atRuleContext(rule);
  const selector = normalizeWhitespace(rule.selector);
  return `${context === "" ? "$root" : context}|selector:${selector}`;
}

function semanticValue(declaration: Declaration): string {
  return `${normalizeWhitespace(declaration.value)}${declaration.important ? " !important" : ""}`;
}

function conflict(
  semanticKey: string,
  reason: CssMergeConflict["reason"],
  base: string | null = null,
  local: string | null = null,
  remote: string | null = null,
): CssMergeConflict {
  return { semanticKey, reason, base, local, remote };
}

function buildIndex(root: Root): CssIndex {
  const declarations = new Map<string, DeclarationEntry>();
  const rules = new Map<string, Rule>();
  const conflicts: CssMergeConflict[] = [];

  root.walkRules((rule) => {
    const key = ruleKey(rule);
    if (rules.has(key)) {
      conflicts.push(conflict(key, "ambiguous-semantic-key"));
      return;
    }
    rules.set(key, rule);
  });

  root.walkDecls((declaration) => {
    if (declaration.parent?.type !== "rule") {
      conflicts.push(
        conflict(
          `$unsupported|property:${declaration.prop.toLocaleLowerCase("en-US")}`,
          "unsupported-declaration-container",
        ),
      );
      return;
    }
    const ownerKey = ruleKey(declaration.parent);
    const key = `${ownerKey}|property:${declaration.prop.toLocaleLowerCase("en-US")}`;
    if (declarations.has(key)) {
      conflicts.push(conflict(key, "ambiguous-semantic-key"));
      return;
    }
    declarations.set(key, {
      node: declaration,
      ruleKey: ownerKey,
      semanticKey: key,
      semanticValue: semanticValue(declaration),
    });
  });

  return { declarations, rules, conflicts };
}

function parseRoot(label: "base" | "local" | "remote", css: string): Root | CssMergeConflict {
  try {
    return parse(css, { from: undefined });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown CSS parse error";
    return conflict(
      `$parse:${label}`,
      "parse-error",
      label === "base" ? message : null,
      label === "local" ? message : null,
      label === "remote" ? message : null,
    );
  }
}

function finishTrivial(
  status: Exclude<CssMergeStatus, "semantic-merge" | "conflict">,
  content: string,
): CssMergeResult {
  return { status, content, conflicts: [], appliedRemoteKeys: [], preservedLocalKeys: [] };
}

/**
 * P1's bounded Semantic Sync tracer. It performs a loss-minimizing three-way
 * merge over unambiguous CSS declarations and refuses structural ambiguity.
 * The complete transaction, conflict-bundle, and multi-media updater is a
 * later phase; callers must not write when this function returns `conflict`.
 */
export function mergeCssDeclarationsThreeWay(input: {
  readonly base: string;
  readonly local: string;
  readonly remote: string;
}): CssMergeResult {
  const baseRoot = parseRoot("base", input.base);
  const localRoot = parseRoot("local", input.local);
  const remoteRoot = parseRoot("remote", input.remote);
  if ("reason" in baseRoot || "reason" in localRoot || "reason" in remoteRoot) {
    const parseConflicts = [baseRoot, localRoot, remoteRoot].filter(
      (entry): entry is CssMergeConflict => "reason" in entry,
    );
    return {
      status: "conflict",
      content: null,
      conflicts: parseConflicts,
      appliedRemoteKeys: [],
      preservedLocalKeys: [],
    };
  }

  if (input.local === input.remote) return finishTrivial("no-op", input.local);
  if (input.local === input.base) return finishTrivial("fast-forward", input.remote);
  if (input.remote === input.base) return finishTrivial("keep-local", input.local);

  const baseIndex = buildIndex(baseRoot);
  const localIndex = buildIndex(localRoot);
  const remoteIndex = buildIndex(remoteRoot);
  const indexConflicts = [
    ...baseIndex.conflicts,
    ...localIndex.conflicts,
    ...remoteIndex.conflicts,
  ];
  if (indexConflicts.length > 0) {
    return {
      status: "conflict",
      content: null,
      conflicts: indexConflicts,
      appliedRemoteKeys: [],
      preservedLocalKeys: [],
    };
  }

  const allKeys = new Set([
    ...baseIndex.declarations.keys(),
    ...localIndex.declarations.keys(),
    ...remoteIndex.declarations.keys(),
  ]);
  const mutations: Mutation[] = [];
  const conflicts: CssMergeConflict[] = [];
  const preservedLocalKeys: string[] = [];

  for (const semanticKey of [...allKeys].sort((left, right) =>
    left.localeCompare(right, "en-US"),
  )) {
    const base = baseIndex.declarations.get(semanticKey);
    const local = localIndex.declarations.get(semanticKey);
    const remote = remoteIndex.declarations.get(semanticKey);
    const baseValue = base?.semanticValue;
    const localValue = local?.semanticValue;
    const remoteValue = remote?.semanticValue;

    if (localValue === remoteValue) continue;
    if (localValue === baseValue) {
      if (local === undefined && remote !== undefined && !localIndex.rules.has(remote.ruleKey)) {
        conflicts.push(
          conflict(semanticKey, "missing-local-container", baseValue ?? null, null, remoteValue),
        );
      } else {
        mutations.push({ semanticKey, local, remote });
      }
      continue;
    }
    if (remoteValue === baseValue) {
      preservedLocalKeys.push(semanticKey);
      continue;
    }
    conflicts.push(
      conflict(
        semanticKey,
        "concurrent-edit",
        baseValue ?? null,
        localValue ?? null,
        remoteValue ?? null,
      ),
    );
  }

  if (conflicts.length > 0) {
    return {
      status: "conflict",
      content: null,
      conflicts,
      appliedRemoteKeys: [],
      preservedLocalKeys,
    };
  }

  for (const mutation of mutations) {
    if (mutation.remote === undefined) {
      mutation.local?.node.remove();
      continue;
    }
    if (mutation.local !== undefined) {
      mutation.local.node.value = mutation.remote.node.value;
      mutation.local.node.important = mutation.remote.node.important;
      continue;
    }
    localIndex.rules.get(mutation.remote.ruleKey)!.append(mutation.remote.node.clone());
  }

  return {
    status: "semantic-merge",
    content: localRoot.toString(),
    conflicts: [],
    appliedRemoteKeys: mutations.map((mutation) => mutation.semanticKey),
    preservedLocalKeys,
  };
}
