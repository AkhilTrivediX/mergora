import { semanticConflict, type SemanticConflict } from "./merge-model.js";

export type JsonMergeFormat = "json" | "jsonc";

export interface JsonMergeOptions {
  readonly format: JsonMergeFormat;
  readonly maxCharacters?: number;
  readonly maxDepth?: number;
  readonly maxNodes?: number;
}

export interface JsonMergeResult {
  readonly status: "no-op" | "fast-forward" | "keep-local" | "semantic-merge" | "conflict";
  readonly content: string | null;
  readonly conflicts: readonly SemanticConflict[];
  readonly appliedRemotePointers: readonly string[];
  readonly preservedLocalPointers: readonly string[];
}

type TokenKind =
  | "left-brace"
  | "right-brace"
  | "left-bracket"
  | "right-bracket"
  | "colon"
  | "comma"
  | "string"
  | "number"
  | "true"
  | "false"
  | "null"
  | "eof";

interface Token {
  readonly kind: TokenKind;
  readonly start: number;
  readonly end: number;
  readonly leadingStart: number;
  readonly value: string | number | boolean | null;
}

interface JsonBaseNode {
  readonly start: number;
  readonly end: number;
}

interface JsonScalarNode extends JsonBaseNode {
  readonly kind: "scalar";
  readonly value: string | number | boolean | null;
}

interface JsonArrayNode extends JsonBaseNode {
  readonly kind: "array";
  readonly elements: readonly JsonNode[];
}

interface JsonProperty {
  readonly key: string;
  readonly keyStart: number;
  readonly keyEnd: number;
  readonly leadingStart: number;
  readonly value: JsonNode;
  readonly commaStart: number | null;
  readonly commaEnd: number | null;
}

interface JsonObjectNode extends JsonBaseNode {
  readonly kind: "object";
  readonly openEnd: number;
  readonly closeStart: number;
  readonly closeLeadingStart: number;
  readonly properties: readonly JsonProperty[];
  readonly propertyMap: ReadonlyMap<string, JsonProperty>;
  readonly trailingComma: boolean;
}

type JsonNode = JsonScalarNode | JsonArrayNode | JsonObjectNode;

interface JsonDocument {
  readonly source: string;
  readonly root: JsonNode;
  readonly comments: readonly JsonComment[];
}

interface JsonComment {
  readonly start: number;
  readonly end: number;
  readonly text: string;
}

interface TextPatch {
  readonly start: number;
  readonly end: number;
  readonly text: string;
  readonly pointer: string;
}

interface PendingAddition {
  readonly parent: JsonObjectNode;
  readonly property: JsonProperty;
  readonly remoteSource: string;
  readonly pointer: string;
}

interface PendingDeletion {
  readonly parent: JsonObjectNode;
  readonly property: JsonProperty;
  readonly pointer: string;
}

class JsonAdapterError extends Error {
  readonly code: "duplicate-key" | "input-limit" | "invalid-json";
  readonly offset: number;

  constructor(
    code: "duplicate-key" | "input-limit" | "invalid-json",
    message: string,
    offset: number,
  ) {
    super(message);
    this.code = code;
    this.offset = offset;
  }
}

const DEFAULT_MAX_CHARACTERS = 2_097_152;
const DEFAULT_MAX_DEPTH = 128;
const DEFAULT_MAX_NODES = 100_000;

class JsonParser {
  readonly #source: string;
  readonly #allowComments: boolean;
  readonly #maxDepth: number;
  readonly #maxNodes: number;
  readonly #comments: JsonComment[] = [];
  #position = 0;
  #nodes = 0;
  #token: Token;

  constructor(source: string, options: JsonMergeOptions) {
    this.#source = source;
    this.#allowComments = options.format === "jsonc";
    this.#maxDepth = options.maxDepth ?? DEFAULT_MAX_DEPTH;
    this.#maxNodes = options.maxNodes ?? DEFAULT_MAX_NODES;
    this.#token = this.#scanToken();
  }

  parse(): JsonDocument {
    const root = this.#parseValue(0);
    if (this.#token.kind !== "eof") this.#fail("Unexpected content after the root value.");
    return { source: this.#source, root, comments: this.#comments };
  }

  #fail(message: string, code: JsonAdapterError["code"] = "invalid-json"): never {
    throw new JsonAdapterError(
      code,
      `${message} (offset ${String(this.#token.start)})`,
      this.#token.start,
    );
  }

  #scanToken(): Token {
    const leadingStart = this.#position;
    while (this.#position < this.#source.length) {
      const character = this.#source[this.#position]!;
      if (character === " " || character === "\t" || character === "\r" || character === "\n") {
        this.#position += 1;
        continue;
      }
      if (
        character !== "/" ||
        (this.#source[this.#position + 1] !== "/" && this.#source[this.#position + 1] !== "*")
      ) {
        break;
      }
      if (!this.#allowComments) {
        throw new JsonAdapterError(
          "invalid-json",
          `Comments are not allowed in strict JSON. (offset ${String(this.#position)})`,
          this.#position,
        );
      }
      const commentStart = this.#position;
      if (this.#source[this.#position + 1] === "/") {
        this.#position += 2;
        while (
          this.#position < this.#source.length &&
          this.#source[this.#position] !== "\n" &&
          this.#source[this.#position] !== "\r"
        ) {
          this.#position += 1;
        }
      } else {
        const close = this.#source.indexOf("*/", this.#position + 2);
        if (close < 0) {
          throw new JsonAdapterError(
            "invalid-json",
            `Unterminated block comment. (offset ${String(commentStart)})`,
            commentStart,
          );
        }
        this.#position = close + 2;
      }
      this.#comments.push({
        start: commentStart,
        end: this.#position,
        text: this.#source.slice(commentStart, this.#position),
      });
    }

    const start = this.#position;
    if (start >= this.#source.length) {
      return { kind: "eof", start, end: start, leadingStart, value: null };
    }
    const character = this.#source[start]!;
    const punctuation: Readonly<Record<string, TokenKind>> = {
      "{": "left-brace",
      "}": "right-brace",
      "[": "left-bracket",
      "]": "right-bracket",
      ":": "colon",
      ",": "comma",
    };
    const punctuationKind = punctuation[character];
    if (punctuationKind !== undefined) {
      this.#position += 1;
      return { kind: punctuationKind, start, end: this.#position, leadingStart, value: null };
    }

    if (character === '"') {
      this.#position += 1;
      let escaped = false;
      while (this.#position < this.#source.length) {
        const current = this.#source[this.#position]!;
        this.#position += 1;
        if (escaped) {
          escaped = false;
          continue;
        }
        if (current === "\\") {
          escaped = true;
          continue;
        }
        if (current === '"') {
          const raw = this.#source.slice(start, this.#position);
          try {
            const value: unknown = JSON.parse(raw);
            if (typeof value !== "string") throw new Error("String token did not decode as text.");
            return { kind: "string", start, end: this.#position, leadingStart, value };
          } catch {
            throw new JsonAdapterError(
              "invalid-json",
              `Invalid JSON string. (offset ${String(start)})`,
              start,
            );
          }
        }
      }
      throw new JsonAdapterError(
        "invalid-json",
        `Unterminated JSON string. (offset ${String(start)})`,
        start,
      );
    }

    const remainder = this.#source.slice(start);
    const number = /^-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?/u.exec(remainder)?.[0];
    if (number !== undefined) {
      this.#position += number.length;
      return {
        kind: "number",
        start,
        end: this.#position,
        leadingStart,
        value: Number(number),
      };
    }
    for (const [literal, kind, value] of [
      ["true", "true", true],
      ["false", "false", false],
      ["null", "null", null],
    ] as const) {
      if (remainder.startsWith(literal)) {
        this.#position += literal.length;
        return { kind, start, end: this.#position, leadingStart, value };
      }
    }
    throw new JsonAdapterError(
      "invalid-json",
      `Unexpected JSON token. (offset ${String(start)})`,
      start,
    );
  }

  #advance(): Token {
    const previous = this.#token;
    this.#token = this.#scanToken();
    return previous;
  }

  #currentKind(): TokenKind {
    return this.#token.kind;
  }

  #expect(kind: TokenKind): Token {
    if (this.#token.kind !== kind) this.#fail(`Expected ${kind}, received ${this.#token.kind}.`);
    return this.#advance();
  }

  #countNode(): void {
    this.#nodes += 1;
    if (this.#nodes > this.#maxNodes)
      this.#fail("JSON node count exceeds the adapter limit.", "input-limit");
  }

  #parseValue(depth: number): JsonNode {
    if (depth > this.#maxDepth)
      this.#fail("JSON nesting exceeds the adapter limit.", "input-limit");
    this.#countNode();
    const token = this.#token;
    if (token.kind === "left-brace") return this.#parseObject(depth + 1);
    if (token.kind === "left-bracket") return this.#parseArray(depth + 1);
    if (
      token.kind === "string" ||
      token.kind === "number" ||
      token.kind === "true" ||
      token.kind === "false" ||
      token.kind === "null"
    ) {
      this.#advance();
      return { kind: "scalar", start: token.start, end: token.end, value: token.value };
    }
    this.#fail(`Expected a JSON value, received ${token.kind}.`);
  }

  #parseObject(depth: number): JsonObjectNode {
    const open = this.#expect("left-brace");
    const properties: JsonProperty[] = [];
    const propertyMap = new Map<string, JsonProperty>();
    let trailingComma = false;
    while (this.#token.kind !== "right-brace") {
      if (this.#token.kind === "eof") this.#fail("Unterminated JSON object.");
      if (this.#token.kind !== "string") this.#fail("JSON object keys must be quoted strings.");
      const keyToken = this.#advance();
      const key = keyToken.value;
      if (typeof key !== "string") this.#fail("JSON object key did not decode as text.");
      if (propertyMap.has(key)) {
        throw new JsonAdapterError(
          "duplicate-key",
          `Duplicate JSON object key ${JSON.stringify(key)}. (offset ${String(keyToken.start)})`,
          keyToken.start,
        );
      }
      this.#expect("colon");
      const value = this.#parseValue(depth);
      let commaStart: number | null = null;
      let commaEnd: number | null = null;
      if (this.#currentKind() === "comma") {
        const comma = this.#advance();
        commaStart = comma.start;
        commaEnd = comma.end;
        if (this.#currentKind() === "right-brace") {
          if (!this.#allowComments) this.#fail("Trailing commas are not allowed in strict JSON.");
          trailingComma = true;
        }
      } else if (this.#currentKind() !== "right-brace") {
        this.#fail("Expected a comma or closing brace after an object property.");
      }
      const property: JsonProperty = {
        key,
        keyStart: keyToken.start,
        keyEnd: keyToken.end,
        leadingStart: keyToken.leadingStart,
        value,
        commaStart,
        commaEnd,
      };
      properties.push(property);
      propertyMap.set(key, property);
      if (trailingComma) break;
    }
    const close = this.#expect("right-brace");
    return {
      kind: "object",
      start: open.start,
      end: close.end,
      openEnd: open.end,
      closeStart: close.start,
      closeLeadingStart: close.leadingStart,
      properties,
      propertyMap,
      trailingComma,
    };
  }

  #parseArray(depth: number): JsonArrayNode {
    const open = this.#expect("left-bracket");
    const elements: JsonNode[] = [];
    let trailingComma = false;
    while (this.#token.kind !== "right-bracket") {
      if (this.#token.kind === "eof") this.#fail("Unterminated JSON array.");
      elements.push(this.#parseValue(depth));
      if (this.#currentKind() === "comma") {
        this.#advance();
        if (this.#currentKind() === "right-bracket") {
          if (!this.#allowComments) this.#fail("Trailing commas are not allowed in strict JSON.");
          trailingComma = true;
        }
      } else if (this.#currentKind() !== "right-bracket") {
        this.#fail("Expected a comma or closing bracket after an array element.");
      }
      if (trailingComma) break;
    }
    const close = this.#expect("right-bracket");
    return { kind: "array", start: open.start, end: close.end, elements };
  }
}

function parseDocument(source: string, options: JsonMergeOptions): JsonDocument {
  if (source.length > (options.maxCharacters ?? DEFAULT_MAX_CHARACTERS)) {
    throw new JsonAdapterError("input-limit", "JSON input exceeds the character limit.", 0);
  }
  return new JsonParser(source, options).parse();
}

function semanticEqual(left: JsonNode | undefined, right: JsonNode | undefined): boolean {
  if (left === undefined || right === undefined) return left === right;
  if (left.kind !== right.kind) return false;
  if (left.kind === "scalar" && right.kind === "scalar") return left.value === right.value;
  if (left.kind === "array" && right.kind === "array") {
    return (
      left.elements.length === right.elements.length &&
      left.elements.every((element, index) => semanticEqual(element, right.elements[index]))
    );
  }
  if (left.kind === "object" && right.kind === "object") {
    if (left.propertyMap.size !== right.propertyMap.size) return false;
    return [...left.propertyMap].every(([key, property]) =>
      semanticEqual(property.value, right.propertyMap.get(key)?.value),
    );
  }
  return false;
}

function escapePointerSegment(value: string): string {
  return value.replaceAll("~", "~0").replaceAll("/", "~1");
}

function childPointer(parent: string, key: string): string {
  return `${parent}/${escapePointerSegment(key)}`;
}

function summary(document: JsonDocument, node: JsonNode | undefined): string | null {
  if (node === undefined) return null;
  const raw = document.source.slice(node.start, node.end);
  return raw.length <= 240 ? raw : `${raw.slice(0, 239)}…`;
}

function arraysEqual(left: readonly string[], right: readonly string[]): boolean {
  return left.length === right.length && left.every((value, index) => value === right[index]);
}

function commentFingerprint(document: JsonDocument): string[] {
  const anchors: { readonly offset: number; readonly id: string }[] = [];
  const walk = (node: JsonNode, pointer: string): void => {
    anchors.push({ offset: node.start, id: `${pointer === "" ? "/" : pointer}:value` });
    if (node.kind === "object") {
      for (const property of node.properties) {
        const propertyPointer = childPointer(pointer, property.key);
        anchors.push({ offset: property.keyStart, id: `${propertyPointer}:key` });
        walk(property.value, propertyPointer);
      }
      anchors.push({ offset: node.closeStart, id: `${pointer === "" ? "/" : pointer}:end` });
    } else if (node.kind === "array") {
      node.elements.forEach((element, index) =>
        walk(element, childPointer(pointer, String(index))),
      );
    }
  };
  walk(document.root, "");
  anchors.push({ offset: document.source.length, id: "$eof" });
  anchors.sort(
    (left, right) => left.offset - right.offset || left.id.localeCompare(right.id, "en-US"),
  );
  let anchorIndex = 0;
  return document.comments.map((comment) => {
    while (anchorIndex < anchors.length && anchors[anchorIndex]!.offset < comment.end) {
      anchorIndex += 1;
    }
    const next = anchors[anchorIndex];
    return `${next?.id ?? "$eof"}|${comment.text}`;
  });
}

function detectLineEnding(source: string): "\n" | "\r" | "\r\n" {
  const match = /\r\n|\n|\r/u.exec(source);
  return (match?.[0] as "\n" | "\r" | "\r\n" | undefined) ?? "\n";
}

function indentationAt(source: string, offset: number): string {
  const lineStart =
    Math.max(source.lastIndexOf("\n", offset - 1), source.lastIndexOf("\r", offset - 1)) + 1;
  return /^[\t ]*/u.exec(source.slice(lineStart, offset))?.[0] ?? "";
}

function deletionPatches(
  parent: JsonObjectNode,
  deletions: readonly PendingDeletion[],
): TextPatch[] {
  const deletedIndexes = deletions
    .map(({ property }) => parent.properties.indexOf(property))
    .sort((left, right) => left - right);
  const pointers = new Map(
    deletions.map(({ property, pointer }) => [parent.properties.indexOf(property), pointer]),
  );
  const patches: TextPatch[] = [];
  let cursor = 0;
  while (cursor < deletedIndexes.length) {
    const runStart = deletedIndexes[cursor]!;
    let runEnd = runStart;
    const runPointers = [pointers.get(runStart)!];
    cursor += 1;
    while (cursor < deletedIndexes.length && deletedIndexes[cursor] === runEnd + 1) {
      runEnd = deletedIndexes[cursor]!;
      runPointers.push(pointers.get(runEnd)!);
      cursor += 1;
    }

    const first = parent.properties[runStart]!;
    const last = parent.properties[runEnd]!;
    if (runEnd < parent.properties.length - 1) {
      patches.push({
        start: first.leadingStart,
        end: parent.properties[runEnd + 1]!.leadingStart,
        text: "",
        pointer: runPointers.join(","),
      });
    } else if (runStart > 0) {
      patches.push({
        start: parent.properties[runStart - 1]!.commaStart ?? first.leadingStart,
        end: last.commaEnd ?? last.value.end,
        text: "",
        pointer: runPointers.join(","),
      });
    } else {
      patches.push({
        start: first.leadingStart,
        end: last.commaEnd ?? last.value.end,
        text: "",
        pointer: runPointers.join(","),
      });
    }
  }
  return patches;
}

function additionPatch(
  source: string,
  additions: readonly PendingAddition[],
  deleted: ReadonlySet<JsonProperty>,
): TextPatch {
  const parent = additions[0]!.parent;
  const remaining = parent.properties.filter((property) => !deleted.has(property));
  const ordered = [...additions].sort((left, right) =>
    left.property.key.localeCompare(right.property.key, "en-US"),
  );
  const snippets = ordered.map(
    ({ property, remoteSource }) =>
      `${JSON.stringify(property.key)}: ${remoteSource.slice(property.value.start, property.value.end)}`,
  );
  const objectSource = source.slice(parent.start, parent.end);
  const multiline = /[\r\n]/u.test(objectSource);
  const lineEnding = detectLineEnding(source);
  const pointer = ordered.map(({ pointer: value }) => value).join(",");

  if (remaining.length === 0) {
    if (!multiline) {
      return {
        start: parent.closeLeadingStart,
        end: parent.closeLeadingStart,
        text: snippets.join(", "),
        pointer,
      };
    }
    const parentIndent = indentationAt(source, parent.start);
    const indent = `${parentIndent}  `;
    return {
      start: parent.closeLeadingStart,
      end: parent.closeStart,
      text: `${lineEnding}${indent}${snippets.join(`,${lineEnding}${indent}`)}${lineEnding}${parentIndent}`,
      pointer,
    };
  }

  const originalLastRemains = remaining.at(-1) === parent.properties.at(-1);
  if (multiline) {
    const indent = indentationAt(source, remaining.at(-1)!.keyStart);
    const body = snippets.join(`,${lineEnding}${indent}`);
    return {
      start: parent.closeLeadingStart,
      end: parent.closeLeadingStart,
      text:
        parent.trailingComma && originalLastRemains
          ? `${lineEnding}${indent}${body},`
          : parent.trailingComma
            ? `,${lineEnding}${indent}${body},`
            : `,${lineEnding}${indent}${body}`,
      pointer,
    };
  }

  const firstLeading = source.slice(parent.openEnd, remaining[0]!.keyStart);
  const spacing = /\s/u.test(firstLeading) ? " " : "";
  return {
    start: parent.closeLeadingStart,
    end: parent.closeLeadingStart,
    text:
      parent.trailingComma && originalLastRemains
        ? `${spacing}${snippets.join(", ")},`
        : parent.trailingComma
          ? `,${spacing}${snippets.join(", ")},`
          : `, ${snippets.join(", ")}`,
    pointer,
  };
}

function applyPatches(source: string, patches: readonly TextPatch[]): string {
  const ascending = [...patches].sort((left, right) => {
    const startOrder = left.start - right.start;
    return startOrder === 0 ? left.end - right.end : startOrder;
  });
  const normalized: TextPatch[] = [];
  for (const patch of ascending) {
    const previous = normalized.at(-1);
    if (previous !== undefined && patch.start < previous.end) {
      if (previous.text !== "" || patch.text !== "") {
        throw new Error("JSON merge generated overlapping non-deletion text patches.");
      }
      normalized[normalized.length - 1] = {
        start: previous.start,
        end: Math.max(previous.end, patch.end),
        text: "",
        pointer: `${previous.pointer},${patch.pointer}`,
      };
    } else {
      normalized.push(patch);
    }
  }

  const ordered = normalized.sort((left, right) => {
    const startOrder = right.start - left.start;
    if (startOrder !== 0) return startOrder;
    const endOrder = right.end - left.end;
    return endOrder === 0 ? right.pointer.localeCompare(left.pointer, "en-US") : endOrder;
  });
  let result = source;
  let previousStart = source.length + 1;
  for (const patch of ordered) {
    if (patch.end > previousStart || patch.start < 0 || patch.end < patch.start) {
      throw new Error("JSON merge generated overlapping or invalid text patches.");
    }
    result = `${result.slice(0, patch.start)}${patch.text}${result.slice(patch.end)}`;
    previousStart = patch.start;
  }
  return result;
}

function conflictFromError(label: string, error: JsonAdapterError): SemanticConflict {
  return semanticConflict(`$parse:${label}:${String(error.offset)}`, error.code, error.message);
}

function conflictResult(conflicts: readonly SemanticConflict[]): JsonMergeResult {
  return {
    status: "conflict",
    content: null,
    conflicts,
    appliedRemotePointers: [],
    preservedLocalPointers: [],
  };
}

/**
 * JSON/JSONC three-way merge keyed by JSON Pointer. Objects merge recursively;
 * arrays are intentionally atomic without a schema declaring stable identity.
 * Text patches are applied to L so untouched local bytes and JSONC formatting
 * remain unchanged.
 */
export function mergeJsonThreeWay(
  input: { readonly base: string; readonly local: string; readonly remote: string },
  options: JsonMergeOptions,
): JsonMergeResult {
  const parsed: Partial<Record<"base" | "local" | "remote", JsonDocument>> = {};
  const parseConflicts: SemanticConflict[] = [];
  for (const label of ["base", "local", "remote"] as const) {
    try {
      parsed[label] = parseDocument(input[label], options);
    } catch (error) {
      if (!(error instanceof JsonAdapterError)) throw error;
      parseConflicts.push(conflictFromError(label, error));
    }
  }
  if (parseConflicts.length > 0) return conflictResult(parseConflicts);
  const base = parsed.base!;
  const local = parsed.local!;
  const remote = parsed.remote!;

  if (input.local === input.remote) {
    return {
      status: "no-op",
      content: input.local,
      conflicts: [],
      appliedRemotePointers: [],
      preservedLocalPointers: [],
    };
  }
  if (input.local === input.base) {
    return {
      status: "fast-forward",
      content: input.remote,
      conflicts: [],
      appliedRemotePointers: [],
      preservedLocalPointers: [],
    };
  }
  if (input.remote === input.base) {
    return {
      status: "keep-local",
      content: input.local,
      conflicts: [],
      appliedRemotePointers: [],
      preservedLocalPointers: [],
    };
  }

  const baseComments = options.format === "jsonc" ? commentFingerprint(base) : [];
  const localComments = options.format === "jsonc" ? commentFingerprint(local) : [];
  const remoteComments = options.format === "jsonc" ? commentFingerprint(remote) : [];
  if (
    options.format === "jsonc" &&
    (!arraysEqual(baseComments, localComments) || !arraysEqual(baseComments, remoteComments)) &&
    !arraysEqual(localComments, remoteComments)
  ) {
    return conflictResult([
      semanticConflict(
        "$comments",
        "comment-change",
        "Concurrent JSONC comment changes require manual attachment review.",
      ),
    ]);
  }

  const patches: TextPatch[] = [];
  const additions: PendingAddition[] = [];
  const deletions: PendingDeletion[] = [];
  const conflicts: SemanticConflict[] = [];
  const appliedRemotePointers: string[] = [];
  const preservedLocalPointers: string[] = [];

  const walk = (
    pointer: string,
    baseNode: JsonNode | undefined,
    localNode: JsonNode | undefined,
    remoteNode: JsonNode | undefined,
    localParent: JsonObjectNode | undefined,
    localProperty: JsonProperty | undefined,
    remoteProperty: JsonProperty | undefined,
  ): void => {
    if (semanticEqual(localNode, remoteNode)) return;
    if (
      baseNode?.kind === "object" &&
      localNode?.kind === "object" &&
      remoteNode?.kind === "object"
    ) {
      const keys = [
        ...new Set([
          ...baseNode.propertyMap.keys(),
          ...localNode.propertyMap.keys(),
          ...remoteNode.propertyMap.keys(),
        ]),
      ].sort((left, right) => left.localeCompare(right, "en-US"));
      for (const key of keys) {
        const baseChild = baseNode.propertyMap.get(key);
        const localChild = localNode.propertyMap.get(key);
        const remoteChild = remoteNode.propertyMap.get(key);
        walk(
          childPointer(pointer, key),
          baseChild?.value,
          localChild?.value,
          remoteChild?.value,
          localNode,
          localChild,
          remoteChild,
        );
      }
      return;
    }
    if (semanticEqual(localNode, baseNode)) {
      appliedRemotePointers.push(pointer);
      if (localNode === undefined && remoteNode !== undefined) {
        if (localParent === undefined || remoteProperty === undefined) {
          conflicts.push(
            semanticConflict(
              pointer,
              "concurrent-edit",
              "Cannot add a value without a stable object parent.",
            ),
          );
        } else {
          additions.push({
            parent: localParent,
            property: remoteProperty,
            remoteSource: remote.source,
            pointer,
          });
        }
      } else if (localNode !== undefined && remoteNode === undefined) {
        if (localParent === undefined || localProperty === undefined) {
          conflicts.push(
            semanticConflict(
              pointer,
              "concurrent-edit",
              "Cannot delete the document root through an object merge.",
            ),
          );
        } else {
          deletions.push({ parent: localParent, property: localProperty, pointer });
        }
      } else if (localNode !== undefined && remoteNode !== undefined) {
        patches.push({
          start: localNode.start,
          end: localNode.end,
          text: remote.source.slice(remoteNode.start, remoteNode.end),
          pointer,
        });
      }
      return;
    }
    if (semanticEqual(remoteNode, baseNode)) {
      preservedLocalPointers.push(pointer);
      return;
    }
    conflicts.push(
      semanticConflict(
        pointer === "" ? "/" : pointer,
        "concurrent-edit",
        "Local and upstream changed the same JSON Pointer unequally.",
        {
          base: summary(base, baseNode),
          local: summary(local, localNode),
          remote: summary(remote, remoteNode),
        },
      ),
    );
  };

  walk("", base.root, local.root, remote.root, undefined, undefined, undefined);
  if (conflicts.length > 0) return conflictResult(conflicts);

  const additionGroups = new Map<JsonObjectNode, PendingAddition[]>();
  for (const addition of additions) {
    const group = additionGroups.get(addition.parent) ?? [];
    group.push(addition);
    additionGroups.set(addition.parent, group);
  }
  const deletionGroups = new Map<JsonObjectNode, PendingDeletion[]>();
  for (const deletion of deletions) {
    const group = deletionGroups.get(deletion.parent) ?? [];
    group.push(deletion);
    deletionGroups.set(deletion.parent, group);
  }
  for (const [parent, group] of deletionGroups) patches.push(...deletionPatches(parent, group));
  for (const [parent, group] of additionGroups) {
    const deleted = new Set((deletionGroups.get(parent) ?? []).map(({ property }) => property));
    patches.push(additionPatch(local.source, group, deleted));
  }

  const content = applyPatches(local.source, patches);
  try {
    parseDocument(content, options);
  } catch (error) {
    if (!(error instanceof JsonAdapterError)) throw error;
    return conflictResult([
      semanticConflict(
        "$proposed",
        "invalid-json",
        `The proposed structured merge did not parse: ${error.message}`,
      ),
    ]);
  }
  return {
    status: "semantic-merge",
    content,
    conflicts: [],
    appliedRemotePointers: [...new Set(appliedRemotePointers)].sort((left, right) =>
      left.localeCompare(right, "en-US"),
    ),
    preservedLocalPointers: [...new Set(preservedLocalPointers)].sort((left, right) =>
      left.localeCompare(right, "en-US"),
    ),
  };
}
