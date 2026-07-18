import ts from "typescript";

import { mergeKeepRegionsThreeWay } from "./keep-region-merge.js";
import { semanticConflict, type SemanticConflict } from "./merge-model.js";
import { mergePlainTextThreeWay } from "./text-merge.js";

export type StructuredSourceKind = "javascript" | "jsx" | "typescript" | "tsx";

export interface StructuredSourceMergeOptions {
  readonly kind: StructuredSourceKind;
  readonly maxCharacters?: number;
  readonly maxStatements?: number;
  readonly maxAstNodes?: number;
  readonly maxAstDepth?: number;
}

export interface StructuredSourceMergeResult {
  readonly status: "no-op" | "fast-forward" | "keep-local" | "semantic-merge" | "conflict";
  readonly content: string | null;
  readonly conflictContent: string | null;
  readonly conflicts: readonly SemanticConflict[];
  readonly appliedRemoteKeys: readonly string[];
  readonly preservedLocalKeys: readonly string[];
}

interface ParsedUnit {
  readonly key: string;
  readonly leading: string;
  readonly core: string;
  readonly whole: string;
  readonly coreStart: number;
  readonly node: ts.Statement;
  readonly sourceFile: ts.SourceFile;
}

interface ParsedSource {
  readonly source: string;
  readonly sourceFile: ts.SourceFile;
  readonly prefix: string;
  readonly trailer: string;
  readonly units: readonly ParsedUnit[];
  readonly byKey: ReadonlyMap<string, ParsedUnit>;
}

interface SourceLimits {
  readonly maxCharacters: number;
  readonly maxStatements: number;
  readonly maxAstNodes: number;
  readonly maxAstDepth: number;
}

interface ScalarChoice {
  readonly value: string;
  readonly origin: "common" | "local" | "remote";
}

interface ResolvedUnit {
  readonly key: string;
  readonly content: string;
}

interface JsxAttributeModel {
  readonly key: string;
  readonly text: string;
  readonly start: number;
  readonly end: number;
  readonly spread: boolean;
}

interface JsxElementModel {
  readonly key: string;
  readonly attributesStart: number;
  readonly attributesEnd: number;
  readonly attributes: readonly JsxAttributeModel[];
  readonly byKey: ReadonlyMap<string, JsxAttributeModel>;
}

interface JsxModel {
  readonly skeleton: string;
  readonly skeletonComments: string;
  readonly elements: readonly JsxElementModel[];
  readonly byKey: ReadonlyMap<string, JsxElementModel>;
}

interface CoreMergeResult {
  readonly content: string | null;
  readonly conflictContent: string | null;
  readonly conflicts: readonly SemanticConflict[];
  readonly appliedRemoteKeys: readonly string[];
  readonly preservedLocalKeys: readonly string[];
}

const DEFAULT_MAX_CHARACTERS = 2_097_152;
const DEFAULT_MAX_STATEMENTS = 4_096;
const DEFAULT_MAX_AST_NODES = 100_000;
const DEFAULT_MAX_AST_DEPTH = 512;
const MAX_CONFLICT_PREVIEW = 512;

export const STRUCTURED_SOURCE_MEDIA_TYPES = new Map<string, StructuredSourceKind>([
  ["application/ecmascript", "javascript"],
  ["application/javascript", "javascript"],
  ["application/jsx", "jsx"],
  ["application/tsx", "tsx"],
  ["application/typescript", "typescript"],
  ["application/x-typescript", "typescript"],
  ["text/ecmascript", "javascript"],
  ["text/javascript", "javascript"],
  ["text/jsx", "jsx"],
  ["text/tsx", "tsx"],
  ["text/typescript", "typescript"],
]);

function preview(value: string | undefined): string | null {
  if (value === undefined) return null;
  if (value.length <= MAX_CONFLICT_PREVIEW) return value;
  return `${value.slice(0, MAX_CONFLICT_PREVIEW)}\n…`;
}

function conflict(
  id: string,
  reason: "concurrent-edit" | "input-limit" | "parse-error",
  detail: string,
  values: {
    readonly base?: string | undefined;
    readonly local?: string | undefined;
    readonly remote?: string | undefined;
  } = {},
): SemanticConflict {
  return semanticConflict(id, reason, detail, {
    base: preview(values.base),
    local: preview(values.local),
    remote: preview(values.remote),
  });
}

function isSemanticConflict(value: unknown): value is SemanticConflict {
  return typeof value === "object" && value !== null && "reason" in value;
}

function scriptKind(kind: StructuredSourceKind): ts.ScriptKind {
  switch (kind) {
    case "javascript":
      return ts.ScriptKind.JS;
    case "jsx":
      return ts.ScriptKind.JSX;
    case "tsx":
      return ts.ScriptKind.TSX;
    case "typescript":
      return ts.ScriptKind.TS;
  }
}

function sourceName(kind: StructuredSourceKind): string {
  return `semantic-sync.${kind === "javascript" ? "js" : kind}`;
}

function modifiersKey(node: ts.Node): string {
  const modifiers = ts.canHaveModifiers(node) ? ts.getModifiers(node) : undefined;
  if (modifiers === undefined) return "";
  return modifiers.map(({ kind }) => ts.SyntaxKind[kind]).join(",");
}

function declarationName(node: ts.NamedDeclaration, sourceFile: ts.SourceFile): string | null {
  const { name } = node;
  if (name === undefined) return null;
  if (ts.isIdentifier(name) || ts.isPrivateIdentifier(name)) return name.text;
  if (ts.isStringLiteral(name) || ts.isNumericLiteral(name)) return name.text;
  return name.getText(sourceFile);
}

function statementKey(statement: ts.Statement, sourceFile: ts.SourceFile): string | null {
  if (ts.isImportDeclaration(statement)) {
    if (!ts.isStringLiteral(statement.moduleSpecifier)) return null;
    return `import:${JSON.stringify(statement.moduleSpecifier.text)}`;
  }
  if (ts.isImportEqualsDeclaration(statement)) return `import-equals:${statement.name.text}`;
  if (ts.isExportDeclaration(statement)) {
    const moduleName =
      statement.moduleSpecifier !== undefined && ts.isStringLiteral(statement.moduleSpecifier)
        ? JSON.stringify(statement.moduleSpecifier.text)
        : "$local";
    return `export-list:${moduleName}`;
  }
  if (ts.isExportAssignment(statement)) {
    return statement.isExportEquals ? "export-assignment:equals" : "export-assignment:default";
  }
  if (ts.isVariableStatement(statement)) {
    const names = statement.declarationList.declarations.map((entry) =>
      declarationName(entry, sourceFile),
    );
    if (names.some((name) => name === null)) return null;
    return `variable:${names.join(",")}`;
  }
  if (
    ts.isClassDeclaration(statement) ||
    ts.isFunctionDeclaration(statement) ||
    ts.isInterfaceDeclaration(statement) ||
    ts.isTypeAliasDeclaration(statement) ||
    ts.isEnumDeclaration(statement) ||
    ts.isModuleDeclaration(statement)
  ) {
    const name = declarationName(statement, sourceFile);
    if (name !== null) return `${ts.SyntaxKind[statement.kind]}:${name}`;
    if (modifiersKey(statement).includes("DefaultKeyword")) {
      return `${ts.SyntaxKind[statement.kind]}:$default`;
    }
    return null;
  }
  if (
    ts.isExpressionStatement(statement) &&
    (ts.isStringLiteral(statement.expression) ||
      ts.isNoSubstitutionTemplateLiteral(statement.expression))
  ) {
    return `directive:${JSON.stringify(statement.expression.text)}`;
  }
  return null;
}

function diagnosticDetail(diagnostic: ts.Diagnostic): string {
  const message = ts.flattenDiagnosticMessageText(diagnostic.messageText, " ");
  return diagnostic.start === undefined
    ? message
    : `${message} (offset ${String(diagnostic.start)})`;
}

function parseSource(
  label: "base" | "local" | "remote" | "merged",
  source: string,
  kind: StructuredSourceKind,
  limits: SourceLimits,
): ParsedSource | readonly SemanticConflict[] {
  if (source.length > limits.maxCharacters) {
    return [
      conflict(
        `$${label}`,
        "input-limit",
        `${label} exceeds the configured structured-source character limit.`,
      ),
    ];
  }

  let sourceFile: ts.SourceFile;
  try {
    sourceFile = ts.createSourceFile(
      sourceName(kind),
      source,
      ts.ScriptTarget.Latest,
      true,
      scriptKind(kind),
    );
  } catch {
    return [
      conflict(
        `$${label}:parse`,
        "parse-error",
        `${label} could not be parsed within the structured-source resource bounds.`,
      ),
    ];
  }
  const parseDiagnostics = (
    sourceFile as ts.SourceFile & { readonly parseDiagnostics?: readonly ts.Diagnostic[] }
  ).parseDiagnostics;
  if (parseDiagnostics !== undefined && parseDiagnostics.length > 0) {
    return parseDiagnostics.map((diagnostic, index) =>
      conflict(
        `$${label}:parse:${String(index)}`,
        "parse-error",
        `${label} is not valid ${kind}: ${diagnosticDetail(diagnostic)}`,
      ),
    );
  }
  if (sourceFile.statements.length > limits.maxStatements) {
    return [
      conflict(
        `$${label}:statements`,
        "input-limit",
        `${label} exceeds the configured top-level statement limit.`,
      ),
    ];
  }

  let nodeCount = 0;
  const stack: Array<{ readonly node: ts.Node; readonly depth: number }> = [
    { node: sourceFile, depth: 0 },
  ];
  while (stack.length > 0) {
    const current = stack.pop()!;
    nodeCount += 1;
    if (nodeCount > limits.maxAstNodes) {
      return [
        conflict(
          `$${label}:ast-nodes`,
          "input-limit",
          `${label} exceeds the configured AST node limit.`,
        ),
      ];
    }
    if (current.depth > limits.maxAstDepth) {
      return [
        conflict(
          `$${label}:ast-depth`,
          "input-limit",
          `${label} exceeds the configured AST depth limit.`,
        ),
      ];
    }
    current.node.forEachChild((child) => {
      stack.push({ node: child, depth: current.depth + 1 });
    });
  }

  const units: ParsedUnit[] = [];
  const byKey = new Map<string, ParsedUnit>();
  const opaqueCounts = new Map<ts.SyntaxKind, number>();
  const conflicts: SemanticConflict[] = [];
  for (const statement of sourceFile.statements) {
    let key = statementKey(statement, sourceFile);
    if (key === null) {
      const occurrence = opaqueCounts.get(statement.kind) ?? 0;
      opaqueCounts.set(statement.kind, occurrence + 1);
      key = `opaque:${ts.SyntaxKind[statement.kind]}:${String(occurrence)}`;
    }
    const fullStart = statement.getFullStart();
    const coreStart = statement.getStart(sourceFile, false);
    const unit: ParsedUnit = {
      key,
      leading: source.slice(fullStart, coreStart),
      core: source.slice(coreStart, statement.end),
      whole: source.slice(fullStart, statement.end),
      coreStart,
      node: statement,
      sourceFile,
    };
    const existing = byKey.get(key);
    if (existing !== undefined) {
      conflicts.push(
        conflict(
          `$${label}:unit:${key}`,
          "parse-error",
          `${label} contains more than one top-level semantic unit with key ${key}; matching would be ambiguous.`,
          { local: existing.core, remote: unit.core },
        ),
      );
      continue;
    }
    byKey.set(key, unit);
    units.push(unit);
  }
  if (conflicts.length > 0) return conflicts;

  const firstStart = sourceFile.statements[0]?.getFullStart() ?? 0;
  const lastEnd = sourceFile.statements.at(-1)?.end ?? 0;
  return {
    source,
    sourceFile,
    prefix: source.slice(0, firstStart),
    trailer: source.slice(lastEnd),
    units,
    byKey,
  };
}

function chooseScalar(
  id: string,
  base: string,
  local: string,
  remote: string,
  label: string,
): ScalarChoice | SemanticConflict {
  if (local === remote) return { value: local, origin: "common" };
  if (local === base) return { value: remote, origin: "remote" };
  if (remote === base) return { value: local, origin: "local" };
  return conflict(id, "concurrent-edit", `Local and upstream changed the same ${label}.`, {
    base,
    local,
    remote,
  });
}

function tokenFingerprint(source: string, kind: StructuredSourceKind): string {
  const scanner = ts.createScanner(
    ts.ScriptTarget.Latest,
    true,
    kind === "jsx" || kind === "tsx" ? ts.LanguageVariant.JSX : ts.LanguageVariant.Standard,
    source,
  );
  const tokens: string[] = [];
  for (let token = scanner.scan(); token !== ts.SyntaxKind.EndOfFileToken; token = scanner.scan()) {
    tokens.push(`${String(token)}:${scanner.getTokenText()}`);
  }
  return tokens.join("\u0000");
}

function commentFingerprint(source: string, kind: StructuredSourceKind): string {
  const scanner = ts.createScanner(
    ts.ScriptTarget.Latest,
    false,
    kind === "jsx" || kind === "tsx" ? ts.LanguageVariant.JSX : ts.LanguageVariant.Standard,
    source,
  );
  const comments: string[] = [];
  for (let token = scanner.scan(); token !== ts.SyntaxKind.EndOfFileToken; token = scanner.scan()) {
    if (
      token === ts.SyntaxKind.SingleLineCommentTrivia ||
      token === ts.SyntaxKind.MultiLineCommentTrivia
    ) {
      comments.push(scanner.getTokenText());
    }
  }
  return comments.join("\u0000");
}

function replaceRanges(
  source: string,
  replacements: readonly { readonly start: number; readonly end: number; readonly text: string }[],
): string {
  let output = source;
  for (const replacement of [...replacements].sort((left, right) => right.start - left.start)) {
    output = `${output.slice(0, replacement.start)}${replacement.text}${output.slice(replacement.end)}`;
  }
  return output;
}

function collectJsxModel(
  unit: ParsedUnit,
  kind: StructuredSourceKind,
): JsxModel | SemanticConflict {
  const tagCounts = new Map<string, number>();
  const elements: JsxElementModel[] = [];
  const skeletonRanges: Array<{
    readonly start: number;
    readonly end: number;
    readonly text: string;
  }> = [];
  let modelConflict: SemanticConflict | null = null;

  const stack: ts.Node[] = [unit.node];
  while (stack.length > 0 && modelConflict === null) {
    const node = stack.pop()!;
    if (ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node)) {
      const tagName = node.tagName.getText(unit.sourceFile);
      const occurrence = tagCounts.get(tagName) ?? 0;
      tagCounts.set(tagName, occurrence + 1);
      const key = `${tagName}#${String(occurrence)}`;
      const attributes: JsxAttributeModel[] = [];
      const byKey = new Map<string, JsxAttributeModel>();
      let spreadIndex = 0;
      for (const attribute of node.attributes.properties) {
        const spread = ts.isJsxSpreadAttribute(attribute);
        const attributeKey = spread
          ? `...#${String(spreadIndex++)}`
          : attribute.name.getText(unit.sourceFile);
        if (byKey.has(attributeKey)) {
          modelConflict = conflict(
            `unit:${unit.key}/jsx:${key}/attr:${attributeKey}`,
            "parse-error",
            `JSX element ${tagName} contains an ambiguous duplicate attribute.`,
          );
          break;
        }
        const model: JsxAttributeModel = {
          key: attributeKey,
          text: attribute.getText(unit.sourceFile),
          start: attribute.getStart(unit.sourceFile, false) - unit.coreStart,
          end: attribute.end - unit.coreStart,
          spread,
        };
        attributes.push(model);
        byKey.set(attributeKey, model);
      }
      const attributesStart = node.attributes.pos - unit.coreStart;
      const attributesEnd = node.attributes.end - unit.coreStart;
      elements.push({ key, attributesStart, attributesEnd, attributes, byKey });
      skeletonRanges.push({
        start: attributesStart,
        end: attributesEnd,
        text: ` __MERGORA_JSX_ATTRIBUTES_${elements.length - 1}__ `,
      });
    }
    const children: ts.Node[] = [];
    node.forEachChild((child) => {
      children.push(child);
    });
    for (let index = children.length - 1; index >= 0; index -= 1) {
      stack.push(children[index]!);
    }
  }
  if (modelConflict !== null) return modelConflict;

  const skeletonSource = replaceRanges(unit.core, skeletonRanges);
  const byKey = new Map<string, JsxElementModel>();
  for (const element of elements) byKey.set(element.key, element);
  return {
    skeleton: tokenFingerprint(skeletonSource, kind),
    skeletonComments: commentFingerprint(skeletonSource, kind),
    elements,
    byKey,
  };
}

function sameOrder(left: readonly string[], right: readonly string[]): boolean {
  return left.length === right.length && left.every((entry, index) => entry === right[index]);
}

function insertMissingByAnchors(
  output: string[],
  sideOrder: readonly string[],
  retained: ReadonlySet<string>,
): SemanticConflict | null {
  for (let sideIndex = 0; sideIndex < sideOrder.length; sideIndex += 1) {
    const key = sideOrder[sideIndex]!;
    if (!retained.has(key) || output.includes(key)) continue;
    const previous = sideOrder
      .slice(0, sideIndex)
      .reverse()
      .find((candidate) => output.includes(candidate));
    const next = sideOrder.slice(sideIndex + 1).find((candidate) => output.includes(candidate));
    const previousIndex = previous === undefined ? -1 : output.indexOf(previous);
    const nextIndex = next === undefined ? output.length : output.indexOf(next);
    if (previousIndex >= nextIndex) {
      return conflict(
        "$order",
        "concurrent-edit",
        `Cannot place semantic unit ${key} without violating a concurrent top-level order change.`,
      );
    }
    output.splice(nextIndex, 0, key);
  }
  return null;
}

function mergeOrder(
  baseOrder: readonly string[],
  localOrder: readonly string[],
  remoteOrder: readonly string[],
  retained: ReadonlySet<string>,
): readonly string[] | SemanticConflict {
  const common = new Set(
    baseOrder.filter(
      (key) => retained.has(key) && localOrder.includes(key) && remoteOrder.includes(key),
    ),
  );
  const filtered = (order: readonly string[]): string[] => order.filter((key) => common.has(key));
  const baseCore = filtered(baseOrder);
  const localCore = filtered(localOrder);
  const remoteCore = filtered(remoteOrder);
  const localChanged = !sameOrder(localCore, baseCore);
  const remoteChanged = !sameOrder(remoteCore, baseCore);
  if (localChanged && remoteChanged && !sameOrder(localCore, remoteCore)) {
    return conflict(
      "$order",
      "concurrent-edit",
      "Local and upstream changed top-level declaration order differently.",
    );
  }

  const baseline = remoteChanged ? remoteOrder : localOrder;
  const other = remoteChanged ? localOrder : remoteOrder;
  const output = baseline.filter((key) => retained.has(key));
  const firstConflict = insertMissingByAnchors(output, other, retained);
  if (firstConflict !== null) return firstConflict;
  const secondConflict = insertMissingByAnchors(output, baseOrder, retained);
  if (secondConflict !== null) return secondConflict;
  return output;
}

function chooseAttributeOrder(
  base: JsxElementModel,
  local: JsxElementModel,
  remote: JsxElementModel,
  retained: ReadonlySet<string>,
): readonly string[] | SemanticConflict {
  const baseOrder = base.attributes.map(({ key }) => key);
  const localOrder = local.attributes.map(({ key }) => key);
  const remoteOrder = remote.attributes.map(({ key }) => key);
  const hasSpread = [...base.attributes, ...local.attributes, ...remote.attributes].some(
    ({ spread }) => spread,
  );
  if (hasSpread && (!sameOrder(baseOrder, localOrder) || !sameOrder(baseOrder, remoteOrder))) {
    return conflict(
      `jsx:${base.key}`,
      "concurrent-edit",
      "JSX attribute insertion, deletion, or reordering around a spread is order-sensitive.",
    );
  }
  return mergeOrder(baseOrder, localOrder, remoteOrder, retained);
}

function renderAttributes(
  baselineUnit: ParsedUnit,
  baselineElement: JsxElementModel,
  order: readonly string[],
  values: ReadonlyMap<string, string>,
): string {
  const baselineOrder = baselineElement.attributes.map(({ key }) => key);
  if (sameOrder(order, baselineOrder)) {
    const region = baselineUnit.core.slice(
      baselineElement.attributesStart,
      baselineElement.attributesEnd,
    );
    return replaceRanges(
      region,
      baselineElement.attributes
        .map((attribute) => ({
          start: attribute.start - baselineElement.attributesStart,
          end: attribute.end - baselineElement.attributesStart,
          text: values.get(attribute.key) ?? "",
        }))
        .filter((replacement) => replacement.text !== ""),
    );
  }

  const original = baselineUnit.core.slice(
    baselineElement.attributesStart,
    baselineElement.attributesEnd,
  );
  const newline = original.includes("\r\n") ? "\r\n" : original.includes("\n") ? "\n" : null;
  const firstAttribute = baselineElement.attributes[0];
  let separator = " ";
  if (newline !== null && firstAttribute !== undefined) {
    const prefix = baselineUnit.core.slice(baselineElement.attributesStart, firstAttribute.start);
    const indent = /(?:\r\n|\n)([\t ]*)[^\r\n]*$/u.exec(prefix)?.[1] ?? "  ";
    separator = `${newline}${indent}`;
  }
  return order.length === 0
    ? ""
    : `${separator}${order.map((key) => values.get(key)!).join(separator)}`;
}

function mergeJsxAttributes(
  unitKey: string,
  base: ParsedUnit,
  local: ParsedUnit,
  remote: ParsedUnit,
  kind: StructuredSourceKind,
): CoreMergeResult | null {
  if (kind !== "jsx" && kind !== "tsx") return null;
  const baseModel = collectJsxModel(base, kind);
  const localModel = collectJsxModel(local, kind);
  const remoteModel = collectJsxModel(remote, kind);
  const modelConflicts = [baseModel, localModel, remoteModel].filter(isSemanticConflict);
  if (modelConflicts.length > 0) {
    return {
      content: null,
      conflictContent: null,
      conflicts: modelConflicts,
      appliedRemoteKeys: [],
      preservedLocalKeys: [],
    };
  }
  if (
    isSemanticConflict(baseModel) ||
    isSemanticConflict(localModel) ||
    isSemanticConflict(remoteModel)
  ) {
    return null;
  }
  if (baseModel.elements.length === 0) return null;
  if (
    baseModel.skeleton !== localModel.skeleton ||
    baseModel.skeleton !== remoteModel.skeleton ||
    !sameOrder(
      baseModel.elements.map(({ key }) => key),
      localModel.elements.map(({ key }) => key),
    ) ||
    !sameOrder(
      baseModel.elements.map(({ key }) => key),
      remoteModel.elements.map(({ key }) => key),
    )
  ) {
    return null;
  }

  let baseline = local;
  let baselineModel = localModel;
  if (remoteModel.skeletonComments !== baseModel.skeletonComments) {
    if (
      localModel.skeletonComments !== baseModel.skeletonComments &&
      localModel.skeletonComments !== remoteModel.skeletonComments
    ) {
      return {
        content: null,
        conflictContent: null,
        conflicts: [
          conflict(
            `unit:${unitKey}/comments`,
            "concurrent-edit",
            "Local and upstream changed comments outside JSX attributes differently.",
          ),
        ],
        appliedRemoteKeys: [],
        preservedLocalKeys: [],
      };
    }
    baseline = remote;
    baselineModel = remoteModel;
  }

  const replacements: Array<{
    readonly start: number;
    readonly end: number;
    readonly text: string;
  }> = [];
  const appliedRemoteKeys: string[] = [];
  const preservedLocalKeys: string[] = [];
  const conflicts: SemanticConflict[] = [];

  for (const baseElement of baseModel.elements) {
    const localElement = localModel.byKey.get(baseElement.key)!;
    const remoteElement = remoteModel.byKey.get(baseElement.key)!;
    const outputElement = baselineModel.byKey.get(baseElement.key)!;
    const values = new Map<string, string>();
    const retained = new Set<string>();
    const attributeKeys = new Set([
      ...baseElement.byKey.keys(),
      ...localElement.byKey.keys(),
      ...remoteElement.byKey.keys(),
    ]);
    for (const attributeKey of [...attributeKeys].sort((left, right) =>
      left.localeCompare(right, "en-US"),
    )) {
      const id = `unit:${unitKey}/jsx:${baseElement.key}/attr:${attributeKey}`;
      const baseAttribute = baseElement.byKey.get(attributeKey);
      const localAttribute = localElement.byKey.get(attributeKey);
      const remoteAttribute = remoteElement.byKey.get(attributeKey);
      if (baseAttribute === undefined) {
        if (localAttribute === undefined && remoteAttribute !== undefined) {
          values.set(attributeKey, remoteAttribute.text);
          retained.add(attributeKey);
          appliedRemoteKeys.push(id);
        } else if (remoteAttribute === undefined && localAttribute !== undefined) {
          values.set(attributeKey, localAttribute.text);
          retained.add(attributeKey);
          preservedLocalKeys.push(id);
        } else if (localAttribute?.text === remoteAttribute?.text && localAttribute !== undefined) {
          values.set(attributeKey, localAttribute.text);
          retained.add(attributeKey);
        } else {
          conflicts.push(
            conflict(
              id,
              "concurrent-edit",
              "Local and upstream added the same JSX attribute differently.",
              {
                local: localAttribute?.text,
                remote: remoteAttribute?.text,
              },
            ),
          );
        }
        continue;
      }
      if (localAttribute === undefined || remoteAttribute === undefined) {
        const survivor = localAttribute ?? remoteAttribute;
        if (survivor?.text !== baseAttribute.text) {
          conflicts.push(
            conflict(
              id,
              "concurrent-edit",
              "One side deleted a JSX attribute that the other side changed.",
              {
                base: baseAttribute.text,
                local: localAttribute?.text,
                remote: remoteAttribute?.text,
              },
            ),
          );
        } else if (localAttribute === undefined) {
          preservedLocalKeys.push(id);
        } else {
          appliedRemoteKeys.push(id);
        }
        continue;
      }
      const choice = chooseScalar(
        id,
        baseAttribute.text,
        localAttribute.text,
        remoteAttribute.text,
        "JSX attribute",
      );
      if ("reason" in choice) conflicts.push(choice);
      else {
        values.set(attributeKey, choice.value);
        retained.add(attributeKey);
        if (choice.origin === "remote") appliedRemoteKeys.push(id);
        if (choice.origin === "local") preservedLocalKeys.push(id);
      }
    }
    if (conflicts.length > 0) continue;

    const order = chooseAttributeOrder(baseElement, localElement, remoteElement, retained);
    if (isSemanticConflict(order)) {
      conflicts.push(order);
      continue;
    }
    replacements.push({
      start: outputElement.attributesStart,
      end: outputElement.attributesEnd,
      text: renderAttributes(baseline, outputElement, order, values),
    });
  }
  if (conflicts.length > 0) {
    return {
      content: null,
      conflictContent: null,
      conflicts,
      appliedRemoteKeys: [],
      preservedLocalKeys: [],
    };
  }
  return {
    content: replaceRanges(baseline.core, replacements),
    conflictContent: null,
    conflicts: [],
    appliedRemoteKeys,
    preservedLocalKeys,
  };
}

function mergeCore(
  key: string,
  base: ParsedUnit,
  local: ParsedUnit,
  remote: ParsedUnit,
  kind: StructuredSourceKind,
  limits: SourceLimits,
): CoreMergeResult {
  const id = `unit:${key}`;
  const choice = chooseScalar(id, base.core, local.core, remote.core, "top-level semantic unit");
  if (!("reason" in choice)) {
    return {
      content: choice.value,
      conflictContent: null,
      conflicts: [],
      appliedRemoteKeys: choice.origin === "remote" ? [id] : [],
      preservedLocalKeys: choice.origin === "local" ? [id] : [],
    };
  }

  const jsx = mergeJsxAttributes(key, base, local, remote, kind);
  if (jsx !== null && (jsx.content !== null || jsx.conflicts.length > 0)) return jsx;

  const text = mergePlainTextThreeWay(
    { base: base.core, local: local.core, remote: remote.core },
    { maxCharacters: limits.maxCharacters },
  );
  if (text.status !== "conflict" && text.content !== null) {
    return {
      content: text.content,
      conflictContent: null,
      conflicts: [],
      appliedRemoteKeys: text.appliedRemoteKeys.map((entry) => `${id}/${entry}`),
      preservedLocalKeys: text.preservedLocalKeys.map((entry) => `${id}/${entry}`),
    };
  }

  const baseTokens = tokenFingerprint(base.core, kind);
  const localTokens = tokenFingerprint(local.core, kind);
  const remoteTokens = tokenFingerprint(remote.core, kind);
  const detail =
    localTokens === baseTokens || remoteTokens === baseTokens
      ? "A trivia/comment change overlaps an upstream semantic edit and cannot be grafted safely."
      : "Local and upstream changed the same top-level semantic unit.";
  return {
    content: null,
    conflictContent: text.conflictContent,
    conflicts: [
      conflict(id, "concurrent-edit", detail, {
        base: base.core,
        local: local.core,
        remote: remote.core,
      }),
    ],
    appliedRemoteKeys: [],
    preservedLocalKeys: [],
  };
}

function conflictResult(
  conflicts: readonly SemanticConflict[],
  conflictContent: string | null = null,
): StructuredSourceMergeResult {
  return {
    status: "conflict",
    content: null,
    conflictContent,
    conflicts: [...conflicts].sort((left, right) => {
      const idOrder = left.id.localeCompare(right.id, "en-US");
      return idOrder === 0 ? left.reason.localeCompare(right.reason, "en-US") : idOrder;
    }),
    appliedRemoteKeys: [],
    preservedLocalKeys: [],
  };
}

/**
 * Three-way merges JavaScript and TypeScript by stable top-level units. Exact
 * local slices are the output skeleton; JSX attributes are the only nested
 * structure merged independently. Every ambiguous or overlapping edit fails
 * closed and all proposed output is parsed again before it can be staged.
 */
export function mergeStructuredSourceThreeWay(
  input: { readonly base: string; readonly local: string; readonly remote: string },
  options: StructuredSourceMergeOptions,
): StructuredSourceMergeResult {
  const limits: SourceLimits = {
    maxCharacters: options.maxCharacters ?? DEFAULT_MAX_CHARACTERS,
    maxStatements: options.maxStatements ?? DEFAULT_MAX_STATEMENTS,
    maxAstNodes: options.maxAstNodes ?? DEFAULT_MAX_AST_NODES,
    maxAstDepth: options.maxAstDepth ?? DEFAULT_MAX_AST_DEPTH,
  };
  if (Object.values(limits).some((limit) => !Number.isSafeInteger(limit) || limit < 1)) {
    return conflictResult([
      conflict(
        "$options",
        "input-limit",
        "Structured-source limits must be positive safe integers.",
      ),
    ]);
  }
  for (const [label, source] of Object.entries(input)) {
    if (source.length > limits.maxCharacters) {
      return conflictResult([
        conflict(
          `$${label}`,
          "input-limit",
          `${label} exceeds the configured structured-source character limit.`,
        ),
      ]);
    }
  }

  const base = parseSource("base", input.base, options.kind, limits);
  const local = parseSource("local", input.local, options.kind, limits);
  const remote = parseSource("remote", input.remote, options.kind, limits);
  const parseConflicts = [base, local, remote].flatMap((entry) =>
    Array.isArray(entry) ? entry : [],
  );
  if (parseConflicts.length > 0) return conflictResult(parseConflicts);
  const parsedBase = base as ParsedSource;
  const parsedLocal = local as ParsedSource;
  const parsedRemote = remote as ParsedSource;

  if (input.local === input.remote) {
    return {
      status: "no-op",
      content: input.local,
      conflictContent: null,
      conflicts: [],
      appliedRemoteKeys: [],
      preservedLocalKeys: [],
    };
  }
  if (input.local === input.base) {
    return {
      status: "fast-forward",
      content: input.remote,
      conflictContent: null,
      conflicts: [],
      appliedRemoteKeys: [],
      preservedLocalKeys: [],
    };
  }
  if (input.remote === input.base) {
    return {
      status: "keep-local",
      content: input.local,
      conflictContent: null,
      conflicts: [],
      appliedRemoteKeys: [],
      preservedLocalKeys: [],
    };
  }

  if (
    input.base.includes("mergora:keep-") ||
    input.local.includes("mergora:keep-") ||
    input.remote.includes("mergora:keep-")
  ) {
    const keep = mergeKeepRegionsThreeWay(input, { maxCharacters: limits.maxCharacters });
    if (keep.status === "conflict" || keep.content === null) {
      return conflictResult(keep.conflicts, keep.conflictContent);
    }
    const validated = parseSource("merged", keep.content, options.kind, limits);
    if (Array.isArray(validated)) return conflictResult(validated);
    return {
      status: keep.status,
      content: keep.content,
      conflictContent: null,
      conflicts: [],
      appliedRemoteKeys: keep.regionIds.map((id) => `keep:${id}`),
      preservedLocalKeys: keep.regionIds.map((id) => `keep:${id}`),
    };
  }

  const prefix = chooseScalar(
    "$prefix",
    parsedBase.prefix,
    parsedLocal.prefix,
    parsedRemote.prefix,
    "file prefix",
  );
  const trailer = chooseScalar(
    "$trailer",
    parsedBase.trailer,
    parsedLocal.trailer,
    parsedRemote.trailer,
    "file trailer",
  );
  const boundaryConflicts = [prefix, trailer].filter(isSemanticConflict);
  if (boundaryConflicts.length > 0) return conflictResult(boundaryConflicts);
  if (isSemanticConflict(prefix) || isSemanticConflict(trailer)) {
    return conflictResult([
      ...(isSemanticConflict(prefix) ? [prefix] : []),
      ...(isSemanticConflict(trailer) ? [trailer] : []),
    ]);
  }

  const resolved = new Map<string, ResolvedUnit>();
  const conflicts: SemanticConflict[] = [];
  const appliedRemoteKeys: string[] = [];
  const preservedLocalKeys: string[] = [];
  const keys = new Set([
    ...parsedBase.byKey.keys(),
    ...parsedLocal.byKey.keys(),
    ...parsedRemote.byKey.keys(),
  ]);
  for (const key of [...keys].sort((left, right) => left.localeCompare(right, "en-US"))) {
    const baseUnit = parsedBase.byKey.get(key);
    const localUnit = parsedLocal.byKey.get(key);
    const remoteUnit = parsedRemote.byKey.get(key);
    if (baseUnit === undefined) {
      if (localUnit === undefined && remoteUnit !== undefined) {
        resolved.set(key, { key, content: remoteUnit.whole });
        appliedRemoteKeys.push(`unit:${key}`);
      } else if (remoteUnit === undefined && localUnit !== undefined) {
        resolved.set(key, { key, content: localUnit.whole });
        preservedLocalKeys.push(`unit:${key}`);
      } else if (localUnit?.whole === remoteUnit?.whole && localUnit !== undefined) {
        resolved.set(key, { key, content: localUnit.whole });
      } else {
        conflicts.push(
          conflict(
            `unit:${key}`,
            "concurrent-edit",
            "Local and upstream added the same top-level semantic unit differently.",
            { local: localUnit?.whole, remote: remoteUnit?.whole },
          ),
        );
      }
      continue;
    }
    if (localUnit === undefined || remoteUnit === undefined) {
      const survivor = localUnit ?? remoteUnit;
      if (survivor?.whole !== baseUnit.whole) {
        conflicts.push(
          conflict(
            `unit:${key}`,
            "concurrent-edit",
            "One side deleted a top-level semantic unit that the other side changed.",
            { base: baseUnit.whole, local: localUnit?.whole, remote: remoteUnit?.whole },
          ),
        );
      } else if (localUnit === undefined) {
        preservedLocalKeys.push(`unit:${key}`);
      } else {
        appliedRemoteKeys.push(`unit:${key}`);
      }
      continue;
    }

    const leading = chooseScalar(
      `unit:${key}/leading-trivia`,
      baseUnit.leading,
      localUnit.leading,
      remoteUnit.leading,
      "leading comments or formatting",
    );
    if ("reason" in leading) {
      conflicts.push(leading);
      continue;
    }
    const core = mergeCore(key, baseUnit, localUnit, remoteUnit, options.kind, limits);
    if (core.content === null) {
      conflicts.push(...core.conflicts);
      continue;
    }
    resolved.set(key, { key, content: `${leading.value}${core.content}` });
    appliedRemoteKeys.push(...core.appliedRemoteKeys);
    preservedLocalKeys.push(...core.preservedLocalKeys);
  }
  if (conflicts.length > 0) return conflictResult(conflicts);

  const retained = new Set(resolved.keys());
  const order = mergeOrder(
    parsedBase.units.map(({ key }) => key),
    parsedLocal.units.map(({ key }) => key),
    parsedRemote.units.map(({ key }) => key),
    retained,
  );
  if (isSemanticConflict(order)) return conflictResult([order]);
  const content = `${prefix.value}${order.map((key) => resolved.get(key)!.content).join("")}${trailer.value}`;
  const validated = parseSource("merged", content, options.kind, limits);
  if (Array.isArray(validated)) return conflictResult(validated);

  return {
    status: "semantic-merge",
    content,
    conflictContent: null,
    conflicts: [],
    appliedRemoteKeys: [...new Set(appliedRemoteKeys)].sort((left, right) =>
      left.localeCompare(right, "en-US"),
    ),
    preservedLocalKeys: [...new Set(preservedLocalKeys)].sort((left, right) =>
      left.localeCompare(right, "en-US"),
    ),
  };
}
