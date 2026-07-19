import {
  ALL_SCHEMAS,
  EXPECTED_SCHEMA_VERSION,
  schemaFor,
  type JsonSchema,
} from "./schema-registry.js";
import {
  aggregateEvidenceState,
  isEvidenceStateForContext,
  type EvidenceContext,
} from "./evidence.js";
import type {
  JsonValue,
  SchemaKind,
  SchemaValidationError,
  SchemaValidationResult,
} from "./types.js";

type JsonObject = Record<string, unknown>;
type Schema = boolean | JsonObject;

const MAX_INSTANCE_DEPTH = 128;
const MAX_VALIDATION_NODES = 250_000;
const JSON_SCHEMA_DIALECT = "https://json-schema.org/draft/2020-12/schema";

const SCHEMAS_BY_REFERENCE = new Map<string, JsonSchema>();
for (const schema of ALL_SCHEMAS) {
  if (schema.$id !== undefined) {
    SCHEMAS_BY_REFERENCE.set(schema.$id, schema);
    SCHEMAS_BY_REFERENCE.set(new URL(schema.$id).pathname.split("/").at(-1) ?? "", schema);
  }
}

interface ValidationBudget {
  nodes: number;
  exhausted: boolean;
}

interface ResolvedSchema {
  readonly schema: Schema;
  readonly root: JsonSchema;
}

function isObject(value: unknown): value is JsonObject {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function pointerSegment(value: string): string {
  return value.replaceAll("~", "~0").replaceAll("/", "~1");
}

function childPath(path: string, key: string | number): string {
  return `${path}/${pointerSegment(String(key))}`;
}

function addError(
  errors: SchemaValidationError[],
  code: string,
  path: string,
  keyword: string,
  message: string,
): void {
  errors.push({ code, path, keyword, message });
}

function resolveJsonPointer(document: unknown, fragment: string): unknown {
  if (fragment === "" || fragment === "#") return document;
  const pointer = fragment.startsWith("#") ? fragment.slice(1) : fragment;
  if (!pointer.startsWith("/")) return undefined;

  let current = document;
  for (const encodedPart of pointer.slice(1).split("/")) {
    const part = decodeURIComponent(encodedPart).replaceAll("~1", "/").replaceAll("~0", "~");
    if (!isObject(current) && !Array.isArray(current)) return undefined;
    if (!Object.hasOwn(current, part)) return undefined;
    current = (current as Record<string, unknown>)[part];
  }
  return current;
}

function resolveReference(reference: string, currentRoot: JsonSchema): ResolvedSchema | undefined {
  const hashIndex = reference.indexOf("#");
  const base = hashIndex === -1 ? reference : reference.slice(0, hashIndex);
  const fragment = hashIndex === -1 ? "" : reference.slice(hashIndex);

  let root: JsonSchema | undefined;
  if (base === "") {
    root = currentRoot;
  } else {
    root = SCHEMAS_BY_REFERENCE.get(base);
    if (root === undefined && currentRoot.$id !== undefined) {
      try {
        root = SCHEMAS_BY_REFERENCE.get(new URL(base, currentRoot.$id).href);
      } catch {
        root = undefined;
      }
    }
  }
  if (root === undefined) return undefined;

  const target = resolveJsonPointer(root, fragment);
  if (typeof target === "boolean") return { schema: target, root };
  if (!isObject(target)) return undefined;
  return { schema: target, root };
}

function jsonEqual(left: unknown, right: unknown): boolean {
  if (Object.is(left, right)) return true;
  if (Array.isArray(left) && Array.isArray(right)) {
    return (
      left.length === right.length && left.every((item, index) => jsonEqual(item, right[index]))
    );
  }
  if (isObject(left) && isObject(right)) {
    const leftKeys = Object.keys(left).sort();
    const rightKeys = Object.keys(right).sort();
    return (
      leftKeys.length === rightKeys.length &&
      leftKeys.every((key, index) => key === rightKeys[index] && jsonEqual(left[key], right[key]))
    );
  }
  return false;
}

function typeMatches(expected: string, value: unknown): boolean {
  switch (expected) {
    case "null":
      return value === null;
    case "array":
      return Array.isArray(value);
    case "object":
      return isObject(value);
    case "integer":
      return typeof value === "number" && Number.isSafeInteger(value);
    case "number":
      return typeof value === "number" && Number.isFinite(value);
    case "string":
    case "boolean":
      return typeof value === expected;
    default:
      return false;
  }
}

function validateFormat(format: string, value: string): boolean {
  if (format === "uri") {
    try {
      const parsed = new URL(value);
      return parsed.protocol !== "";
    } catch {
      return false;
    }
  }
  if (format === "date") {
    const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
    if (match === null) return false;
    const year = Number(match[1]);
    const month = Number(match[2]);
    const day = Number(match[3]);
    const date = new Date(Date.UTC(year, month - 1, day));
    return (
      date.getUTCFullYear() === year &&
      date.getUTCMonth() === month - 1 &&
      date.getUTCDate() === day
    );
  }
  if (format === "date-time") {
    if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/.test(value)) {
      return false;
    }
    return Number.isFinite(Date.parse(value));
  }
  return true;
}

function validateAgainst(
  schema: Schema,
  value: unknown,
  path: string,
  root: JsonSchema,
  errors: SchemaValidationError[],
  budget: ValidationBudget,
  depth = 0,
): void {
  budget.nodes += 1;
  if (depth > MAX_INSTANCE_DEPTH || budget.nodes > MAX_VALIDATION_NODES) {
    if (!budget.exhausted) {
      budget.exhausted = true;
      addError(
        errors,
        "VALIDATION_LIMIT",
        path,
        "maxDepth",
        "Document exceeds the bounded schema-validation depth or node budget.",
      );
    }
    return;
  }
  if (schema === true) return;
  if (schema === false) {
    addError(errors, "SCHEMA_FALSE", path, "falseSchema", "Value is forbidden by this schema.");
    return;
  }

  const reference = schema.$ref;
  if (typeof reference === "string") {
    const resolved = resolveReference(reference, root);
    if (resolved === undefined) {
      addError(
        errors,
        "SCHEMA_REF_UNRESOLVED",
        path,
        "$ref",
        `Schema reference '${reference}' could not be resolved.`,
      );
    } else {
      validateAgainst(resolved.schema, value, path, resolved.root, errors, budget, depth + 1);
    }
  }

  if (Object.hasOwn(schema, "const") && !jsonEqual(value, schema.const)) {
    addError(errors, "SCHEMA_CONST", path, "const", "Value does not equal the required constant.");
  }
  if (Array.isArray(schema.enum) && !schema.enum.some((candidate) => jsonEqual(value, candidate))) {
    addError(
      errors,
      "SCHEMA_ENUM",
      path,
      "enum",
      `Value must be one of: ${schema.enum.map(String).join(", ")}.`,
    );
  }

  const typeKeyword = schema.type;
  if (typeof typeKeyword === "string" && !typeMatches(typeKeyword, value)) {
    addError(errors, "SCHEMA_TYPE", path, "type", `Expected ${typeKeyword}.`);
    return;
  }
  if (
    Array.isArray(typeKeyword) &&
    !typeKeyword.some((candidate) => typeof candidate === "string" && typeMatches(candidate, value))
  ) {
    addError(errors, "SCHEMA_TYPE", path, "type", `Expected one of: ${typeKeyword.join(", ")}.`);
    return;
  }

  const trial = (candidate: unknown): SchemaValidationError[] => {
    const branchErrors: SchemaValidationError[] = [];
    if (typeof candidate === "boolean" || isObject(candidate)) {
      validateAgainst(candidate, value, path, root, branchErrors, budget, depth + 1);
    } else {
      addError(branchErrors, "SCHEMA_INVALID", path, "schema", "Invalid schema branch.");
    }
    return branchErrors;
  };

  if (Array.isArray(schema.allOf)) {
    for (const candidate of schema.allOf) {
      if (typeof candidate === "boolean" || isObject(candidate)) {
        validateAgainst(candidate, value, path, root, errors, budget, depth + 1);
      }
    }
  }
  if (Array.isArray(schema.anyOf)) {
    if (!schema.anyOf.some((candidate) => trial(candidate).length === 0)) {
      addError(
        errors,
        "SCHEMA_ANY_OF",
        path,
        "anyOf",
        "Value does not match any allowed schema branch.",
      );
    }
  }
  if (Array.isArray(schema.oneOf)) {
    const matches = schema.oneOf.filter((candidate) => trial(candidate).length === 0).length;
    if (matches !== 1) {
      addError(
        errors,
        "SCHEMA_ONE_OF",
        path,
        "oneOf",
        `Value must match exactly one schema branch; matched ${matches}.`,
      );
    }
  }
  if ((typeof schema.not === "boolean" || isObject(schema.not)) && trial(schema.not).length === 0) {
    addError(errors, "SCHEMA_NOT", path, "not", "Value matches a forbidden schema branch.");
  }
  if (typeof schema.if === "boolean" || isObject(schema.if)) {
    const conditionMatches = trial(schema.if).length === 0;
    const selected = conditionMatches ? schema.then : schema.else;
    if (typeof selected === "boolean" || isObject(selected)) {
      validateAgainst(selected, value, path, root, errors, budget, depth + 1);
    }
  }

  if (isObject(value)) {
    const keys = Object.keys(value);
    const required = Array.isArray(schema.required)
      ? schema.required.filter((candidate): candidate is string => typeof candidate === "string")
      : [];
    for (const key of required) {
      if (!Object.hasOwn(value, key)) {
        addError(
          errors,
          "SCHEMA_REQUIRED",
          childPath(path, key),
          "required",
          `Required property '${key}' is missing.`,
        );
      }
    }

    if (typeof schema.minProperties === "number" && keys.length < schema.minProperties) {
      addError(
        errors,
        "SCHEMA_MIN_PROPERTIES",
        path,
        "minProperties",
        `Expected at least ${schema.minProperties} properties.`,
      );
    }
    if (typeof schema.maxProperties === "number" && keys.length > schema.maxProperties) {
      addError(
        errors,
        "SCHEMA_MAX_PROPERTIES",
        path,
        "maxProperties",
        `Expected at most ${schema.maxProperties} properties.`,
      );
    }

    const properties = isObject(schema.properties) ? schema.properties : {};
    const patternProperties = isObject(schema.patternProperties) ? schema.patternProperties : {};
    for (const [key, propertyValue] of Object.entries(value)) {
      const propertySchema = properties[key];
      const matchingPatternSchemas = Object.entries(patternProperties).filter(([pattern]) => {
        try {
          return new RegExp(pattern, "u").test(key);
        } catch {
          return false;
        }
      });
      if (typeof propertySchema === "boolean" || isObject(propertySchema)) {
        validateAgainst(
          propertySchema,
          propertyValue,
          childPath(path, key),
          root,
          errors,
          budget,
          depth + 1,
        );
      }
      for (const [, matchedSchema] of matchingPatternSchemas) {
        if (typeof matchedSchema === "boolean" || isObject(matchedSchema)) {
          validateAgainst(
            matchedSchema,
            propertyValue,
            childPath(path, key),
            root,
            errors,
            budget,
            depth + 1,
          );
        }
      }
      const isKnown = Object.hasOwn(properties, key) || matchingPatternSchemas.length > 0;
      if (!isKnown) {
        if (schema.additionalProperties === false) {
          addError(
            errors,
            "SCHEMA_ADDITIONAL_PROPERTY",
            childPath(path, key),
            "additionalProperties",
            `Unknown property '${key}' is not allowed.`,
          );
        } else if (
          typeof schema.additionalProperties === "boolean" ||
          isObject(schema.additionalProperties)
        ) {
          validateAgainst(
            schema.additionalProperties,
            propertyValue,
            childPath(path, key),
            root,
            errors,
            budget,
            depth + 1,
          );
        }
      }
    }

    if (typeof schema.propertyNames === "boolean" || isObject(schema.propertyNames)) {
      for (const key of keys) {
        validateAgainst(
          schema.propertyNames,
          key,
          childPath(path, key),
          root,
          errors,
          budget,
          depth + 1,
        );
      }
    }
  }

  if (Array.isArray(value)) {
    if (typeof schema.minItems === "number" && value.length < schema.minItems) {
      addError(
        errors,
        "SCHEMA_MIN_ITEMS",
        path,
        "minItems",
        `Expected at least ${schema.minItems} items.`,
      );
    }
    if (typeof schema.maxItems === "number" && value.length > schema.maxItems) {
      addError(
        errors,
        "SCHEMA_MAX_ITEMS",
        path,
        "maxItems",
        `Expected at most ${schema.maxItems} items.`,
      );
    }
    if (schema.uniqueItems === true) {
      for (let index = 0; index < value.length; index += 1) {
        if (value.slice(0, index).some((candidate) => jsonEqual(candidate, value[index]))) {
          addError(
            errors,
            "SCHEMA_UNIQUE_ITEMS",
            childPath(path, index),
            "uniqueItems",
            "Array items must be unique.",
          );
        }
      }
    }
    if (typeof schema.items === "boolean" || isObject(schema.items)) {
      value.forEach((item, index) => {
        validateAgainst(
          schema.items as Schema,
          item,
          childPath(path, index),
          root,
          errors,
          budget,
          depth + 1,
        );
      });
    }
  }

  if (typeof value === "string") {
    const length = [...value].length;
    if (typeof schema.minLength === "number" && length < schema.minLength) {
      addError(
        errors,
        "SCHEMA_MIN_LENGTH",
        path,
        "minLength",
        `Expected at least ${schema.minLength} characters.`,
      );
    }
    if (typeof schema.maxLength === "number" && length > schema.maxLength) {
      addError(
        errors,
        "SCHEMA_MAX_LENGTH",
        path,
        "maxLength",
        `Expected at most ${schema.maxLength} characters.`,
      );
    }
    if (typeof schema.pattern === "string") {
      try {
        if (!new RegExp(schema.pattern, "u").test(value)) {
          addError(
            errors,
            "SCHEMA_PATTERN",
            path,
            "pattern",
            `Value does not match pattern ${schema.pattern}.`,
          );
        }
      } catch {
        addError(
          errors,
          "SCHEMA_INVALID_PATTERN",
          path,
          "pattern",
          "Schema contains an invalid regular expression.",
        );
      }
    }
    if (typeof schema.format === "string" && !validateFormat(schema.format, value)) {
      addError(errors, "SCHEMA_FORMAT", path, "format", `Value is not a valid ${schema.format}.`);
    }
  }

  if (typeof value === "number" && Number.isFinite(value)) {
    if (typeof schema.minimum === "number" && value < schema.minimum) {
      addError(
        errors,
        "SCHEMA_MINIMUM",
        path,
        "minimum",
        `Value must be at least ${schema.minimum}.`,
      );
    }
    if (typeof schema.maximum === "number" && value > schema.maximum) {
      addError(
        errors,
        "SCHEMA_MAXIMUM",
        path,
        "maximum",
        `Value must be at most ${schema.maximum}.`,
      );
    }
  }
}

const PATH_VALUE_KEYS = new Set([
  "path",
  "target",
  "logicalPath",
  "sourceRoot",
  "packageJson",
  "tsconfig",
  "globalCss",
  "stagePath",
  "backupPath",
  "sourcePath",
  "plan",
]);
const PATH_ARRAY_KEYS = new Set(["examples", "sourcePaths"]);
const PATH_MAP_KEYS = new Set(["liveTargets", "sharedTargets"]);
const SECRET_FIELD_NAMES = new Set([
  "password",
  "secret",
  "credential",
  "credentials",
  "authorization",
  "cookie",
  "privatekey",
  "authtoken",
  "accesstoken",
  "refreshtoken",
  "npmtoken",
]);
const WINDOWS_RESERVED_NAME = /^(?:con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\..*)?$/i;
const UNSAFE_DEPENDENCY_PROTOCOL =
  /^(?:[a-z][a-z0-9+.-]*:|git(?:\+|@)|https?:|github:|file:|link:|portal:|patch:|workspace:|\.\.?\/|[/\\])/i;

function portablePathProblem(value: string): string | undefined {
  if (value.length === 0) return "Path must not be empty.";
  if (value !== value.normalize("NFKC"))
    return "Path must already be normalized with Unicode NFKC.";
  if (/%(?:[0-9a-f]{2})?/i.test(value))
    return "Percent-encoded or ambiguous percent path content is forbidden.";
  if (
    [...value].some((character) => {
      const codePoint = character.codePointAt(0)!;
      return codePoint <= 0x1f || codePoint === 0x7f;
    })
  )
    return "Control characters are forbidden in paths.";
  if (value.includes("\\")) return "Backslashes and UNC/device paths are forbidden.";
  if (value.startsWith("/") || /^[a-z]:/i.test(value))
    return "Absolute and drive-qualified paths are forbidden.";
  if (value.includes(":")) return "Colons and alternate data-stream syntax are forbidden.";
  const parts = value.split("/");
  for (const part of parts) {
    if (part === "" || part === "." || part === "..")
      return "Empty, current-directory, and traversal segments are forbidden.";
    if (/[. ]$/u.test(part)) return "Path segments must not end in a dot or space.";
    if (/[<>"|?*]/u.test(part)) return "Path contains a non-portable Windows character.";
    if (WINDOWS_RESERVED_NAME.test(part))
      return `Reserved Windows path segment '${part}' is forbidden.`;
  }
  return undefined;
}

function validatePathValue(value: unknown, path: string, errors: SchemaValidationError[]): void {
  if (typeof value !== "string") return;
  const problem = portablePathProblem(value);
  if (problem !== undefined) addError(errors, "UNSAFE_PATH", path, "portablePath", problem);
}

function scanSecurity(
  kind: SchemaKind,
  value: unknown,
  errors: SchemaValidationError[],
  path = "",
  parentKey = "",
  seen = new WeakSet<object>(),
): void {
  if (Array.isArray(value)) {
    if (seen.has(value)) {
      addError(
        errors,
        "NON_JSON_CYCLE",
        path,
        "json",
        "Cyclic values are not valid JSON documents.",
      );
      return;
    }
    seen.add(value);
    value.forEach((item, index) => {
      if (PATH_ARRAY_KEYS.has(parentKey)) validatePathValue(item, childPath(path, index), errors);
      scanSecurity(kind, item, errors, childPath(path, index), parentKey, seen);
    });
    return;
  }
  if (!isObject(value)) return;
  if (seen.has(value)) {
    addError(errors, "NON_JSON_CYCLE", path, "json", "Cyclic values are not valid JSON documents.");
    return;
  }
  seen.add(value);

  for (const [key, child] of Object.entries(value)) {
    const nextPath = childPath(path, key);
    const normalizedKey = key.replaceAll(/[^a-z0-9]/gi, "").toLowerCase();
    if (SECRET_FIELD_NAMES.has(normalizedKey)) {
      addError(
        errors,
        "SECRET_FIELD",
        nextPath,
        "security",
        "Secret material is forbidden; store only an environment-variable name.",
      );
    }
    if (key === "executable" && child !== false) {
      addError(
        errors,
        "EXECUTABLE_PAYLOAD",
        nextPath,
        "security",
        "Registry-managed files must be explicitly non-executable.",
      );
    }
    if (kind === "registry-item" && ["script", "shell", "hook", "hooks", "codemod"].includes(key)) {
      addError(
        errors,
        "EXECUTABLE_PAYLOAD",
        nextPath,
        "security",
        "Executable migrations, scripts, hooks, and codemods are forbidden.",
      );
    }

    if (PATH_VALUE_KEYS.has(key)) validatePathValue(child, nextPath, errors);
    if (PATH_MAP_KEYS.has(key) && isObject(child)) {
      for (const mapKey of Object.keys(child))
        validatePathValue(mapKey, childPath(nextPath, mapKey), errors);
    }
    if (key === "targets" && isObject(child)) {
      for (const [targetRole, targetPath] of Object.entries(child)) {
        validatePathValue(targetPath, childPath(nextPath, targetRole), errors);
      }
    }

    if (typeof child === "string" && /^https?:\/\//i.test(child)) {
      try {
        const parsed = new URL(child);
        if (parsed.username !== "" || parsed.password !== "") {
          addError(
            errors,
            "URL_USERINFO",
            nextPath,
            "security",
            "Credentials in URL userinfo are forbidden.",
          );
        }
        if (["url", "sourceUrl"].includes(key) && parsed.search !== "") {
          addError(
            errors,
            "MUTABLE_URL",
            nextPath,
            "security",
            "Immutable artifact URLs must not contain a query string.",
          );
        }
      } catch {
        // The format keyword reports malformed URLs with the schema context.
      }
    }
    scanSecurity(kind, child, errors, nextPath, key, seen);
  }
}

function scanDependencyMap(
  dependencyMap: unknown,
  path: string,
  errors: SchemaValidationError[],
): void {
  if (!isObject(dependencyMap)) return;
  for (const [packageName, range] of Object.entries(dependencyMap)) {
    if (typeof range === "string" && UNSAFE_DEPENDENCY_PROTOCOL.test(range.trim())) {
      addError(
        errors,
        "UNSAFE_DEPENDENCY_PROTOCOL",
        childPath(path, packageName),
        "dependencyProtocol",
        "Dependencies must use a package name and a registry semver range only.",
      );
    }
  }
}

function validateDependencies(
  kind: SchemaKind,
  value: unknown,
  errors: SchemaValidationError[],
): void {
  if (!isObject(value)) return;
  if (kind === "registry-item") {
    const dependencies = value.dependencies;
    if (isObject(dependencies)) {
      scanDependencyMap(dependencies.runtime, "/dependencies/runtime", errors);
      scanDependencyMap(dependencies.development, "/dependencies/development", errors);
    }
  }
  if (kind === "operation-plan" && Array.isArray(value.dependencyChanges)) {
    value.dependencyChanges.forEach((change, index) => {
      if (!isObject(change)) return;
      for (const field of ["from", "to"] as const) {
        const range = change[field];
        if (typeof range === "string" && UNSAFE_DEPENDENCY_PROTOCOL.test(range.trim())) {
          addError(
            errors,
            "UNSAFE_DEPENDENCY_PROTOCOL",
            `/dependencyChanges/${index}/${field}`,
            "dependencyProtocol",
            "Dependency changes must contain registry semver ranges only.",
          );
        }
      }
    });
  }
}

function detectCanonicalCollisions(
  values: readonly { readonly value: string; readonly path: string }[],
  errors: SchemaValidationError[],
  namespace: string,
): void {
  const observed = new Map<string, { readonly value: string; readonly path: string }>();
  for (const candidate of values) {
    const canonical = candidate.value.normalize("NFKC").toLocaleLowerCase("en-US");
    const prior = observed.get(canonical);
    if (prior === undefined) {
      observed.set(canonical, candidate);
    } else if (prior.value !== candidate.value || prior.path !== candidate.path) {
      addError(
        errors,
        "CANONICAL_COLLISION",
        candidate.path,
        "collision",
        `${namespace} '${candidate.value}' collides with '${prior.value}' at ${prior.path} after Unicode/case normalization.`,
      );
    }
  }
}

function stringFieldEntries(
  values: unknown,
  field: string,
  basePath: string,
): { readonly value: string; readonly path: string }[] {
  if (!Array.isArray(values)) return [];
  return values.flatMap((entry, index) => {
    if (!isObject(entry) || typeof entry[field] !== "string") return [];
    return [{ value: entry[field], path: `${basePath}/${index}/${field}` }];
  });
}

function validateCollisions(
  kind: SchemaKind,
  value: unknown,
  errors: SchemaValidationError[],
): void {
  if (!isObject(value)) return;
  if (kind === "registry-index" && Array.isArray(value.items)) {
    const identities: { value: string; path: string }[] = [];
    value.items.forEach((item, index) => {
      if (!isObject(item)) return;
      if (typeof item.id === "string")
        identities.push({ value: item.id, path: `/items/${index}/id` });
      if (Array.isArray(item.aliases)) {
        item.aliases.forEach((alias, aliasIndex) => {
          if (typeof alias === "string")
            identities.push({ value: alias, path: `/items/${index}/aliases/${aliasIndex}` });
        });
      }
    });
    detectCanonicalCollisions(identities, errors, "Registry id or alias");
  }
  if (kind === "registry-item") {
    detectCanonicalCollisions(
      stringFieldEntries(value.files, "logicalPath", "/files"),
      errors,
      "Logical path",
    );
  }
  if (kind === "operation-plan") {
    detectCanonicalCollisions(
      stringFieldEntries(value.fileOperations, "target", "/fileOperations"),
      errors,
      "Operation target",
    );
  }
  if (kind === "manifest" && isObject(value.items)) {
    const logicalPaths: { value: string; path: string }[] = [];
    const targets: { value: string; path: string }[] = [];
    for (const [itemId, item] of Object.entries(value.items)) {
      if (!isObject(item) || !Array.isArray(item.files)) continue;
      item.files.forEach((file, index) => {
        if (!isObject(file)) return;
        if (typeof file.logicalPath === "string")
          logicalPaths.push({
            value: file.logicalPath,
            path: `/items/${pointerSegment(itemId)}/files/${index}/logicalPath`,
          });
        if (typeof file.target === "string")
          targets.push({
            value: file.target,
            path: `/items/${pointerSegment(itemId)}/files/${index}/target`,
          });
      });
    }
    detectCanonicalCollisions(logicalPaths, errors, "Manifest logical path");
    detectCanonicalCollisions(targets, errors, "Manifest target");
  }
}

function validateEvidence(kind: SchemaKind, value: unknown, errors: SchemaValidationError[]): void {
  if (!isObject(value)) return;
  if (
    kind === "evidence" &&
    typeof value.context === "string" &&
    typeof value.state === "string" &&
    typeof value.aggregateState === "string" &&
    ["measurement", "passport", "contract", "release-gate"].includes(value.context)
  ) {
    const context = value.context as EvidenceContext;
    if (
      isEvidenceStateForContext(context, value.state) &&
      aggregateEvidenceState(context, value.state) !== value.aggregateState
    ) {
      addError(
        errors,
        "EVIDENCE_AGGREGATE_MISMATCH",
        "/aggregateState",
        "evidenceMapping",
        `State '${value.state}' in '${context}' maps to '${aggregateEvidenceState(context, value.state)}'.`,
      );
    }
  }
  if (kind !== "quality-passport") return;
  if (isObject(value.overall)) {
    const { state, aggregateState } = value.overall;
    if (
      typeof state === "string" &&
      typeof aggregateState === "string" &&
      isEvidenceStateForContext("release-gate", state) &&
      aggregateEvidenceState("release-gate", state) !== aggregateState
    ) {
      addError(
        errors,
        "EVIDENCE_AGGREGATE_MISMATCH",
        "/overall/aggregateState",
        "evidenceMapping",
        `Release-gate state '${state}' maps to '${aggregateEvidenceState("release-gate", state)}'.`,
      );
    }
  }
  if (isObject(value.sections)) {
    for (const [section, rows] of Object.entries(value.sections)) {
      if (!Array.isArray(rows)) continue;
      rows.forEach((row, index) => {
        if (
          !isObject(row) ||
          typeof row.state !== "string" ||
          typeof row.aggregateState !== "string"
        )
          return;
        if (
          isEvidenceStateForContext("passport", row.state) &&
          aggregateEvidenceState("passport", row.state) !== row.aggregateState
        ) {
          addError(
            errors,
            "EVIDENCE_AGGREGATE_MISMATCH",
            `/sections/${pointerSegment(section)}/${index}/aggregateState`,
            "evidenceMapping",
            `Passport state '${row.state}' maps to '${aggregateEvidenceState("passport", row.state)}'.`,
          );
        }
      });
    }
  }
}

function validateJournal(kind: SchemaKind, value: unknown, errors: SchemaValidationError[]): void {
  if (kind !== "transaction-journal" || !isObject(value) || !Array.isArray(value.entries)) return;
  let previousSequence = -1;
  let previousTime = Number.NEGATIVE_INFINITY;
  value.entries.forEach((entry, index) => {
    if (!isObject(entry)) return;
    if (typeof entry.sequence === "number") {
      if (entry.sequence !== previousSequence + 1) {
        addError(
          errors,
          "JOURNAL_SEQUENCE",
          `/entries/${index}/sequence`,
          "sequence",
          "Journal sequence numbers must be contiguous and begin at zero.",
        );
      }
      previousSequence = entry.sequence;
    }
    if (typeof entry.recordedAt === "string") {
      const timestamp = Date.parse(entry.recordedAt);
      if (Number.isFinite(timestamp) && timestamp < previousTime) {
        addError(
          errors,
          "JOURNAL_TIME_ORDER",
          `/entries/${index}/recordedAt`,
          "order",
          "Journal timestamps must be nondecreasing.",
        );
      }
      previousTime = timestamp;
    }
  });
  const last = value.entries.at(-1);
  if (isObject(last) && typeof value.state === "string" && last.state !== value.state) {
    addError(
      errors,
      "JOURNAL_STATE_MISMATCH",
      "/state",
      "state",
      "Journal state must equal the final entry state.",
    );
  }
}

function compareSchemaVersions(
  actual: unknown,
  expected: 1 | "1.0.0",
): "equal" | "newer" | "other" {
  if (actual === expected) return "equal";
  if (typeof expected === "number" && typeof actual === "number" && actual > expected)
    return "newer";
  if (typeof expected === "string" && typeof actual === "string") {
    const parse = (version: string): readonly number[] | undefined => {
      if (!/^\d+(?:\.\d+)*$/.test(version)) return undefined;
      return version.split(".").map(Number);
    };
    const left = parse(actual);
    const right = parse(expected);
    if (left !== undefined && right !== undefined) {
      for (let index = 0; index < Math.max(left.length, right.length); index += 1) {
        const difference = (left[index] ?? 0) - (right[index] ?? 0);
        if (difference > 0) return "newer";
        if (difference < 0) return "other";
      }
    }
  }
  return "other";
}

function deduplicateAndSortErrors(
  errors: readonly SchemaValidationError[],
): readonly SchemaValidationError[] {
  const unique = new Map<string, SchemaValidationError>();
  for (const error of errors) {
    unique.set(`${error.path}\u0000${error.code}\u0000${error.message}`, error);
  }
  return [...unique.values()].sort(
    (left, right) =>
      left.path.localeCompare(right.path) ||
      left.code.localeCompare(right.code) ||
      left.message.localeCompare(right.message),
  );
}

export function validateSchemaDocument<T = unknown>(
  kind: SchemaKind,
  value: unknown,
): SchemaValidationResult<T> {
  const errors: SchemaValidationError[] = [];
  const expected = EXPECTED_SCHEMA_VERSION[kind];
  const actual = isObject(value) ? value.schemaVersion : undefined;
  if (actual === undefined) {
    addError(
      errors,
      "SCHEMA_VERSION_MISSING",
      "/schemaVersion",
      "schemaVersion",
      "A schemaVersion is required for negotiation.",
    );
  } else {
    const comparison = compareSchemaVersions(actual, expected);
    if (comparison === "newer") {
      addError(
        errors,
        "SCHEMA_VERSION_NEWER",
        "/schemaVersion",
        "schemaVersion",
        `Schema version '${String(actual)}' is newer than supported version '${String(expected)}'. Upgrade the CLI before reading this document.`,
      );
    } else if (comparison === "other") {
      addError(
        errors,
        "SCHEMA_VERSION_UNSUPPORTED",
        "/schemaVersion",
        "schemaVersion",
        `Schema version '${String(actual)}' is not supported; expected '${String(expected)}'.`,
      );
    }
  }

  if (errors.length === 0) {
    const root = schemaFor(kind);
    if (root.$schema !== JSON_SCHEMA_DIALECT) {
      addError(
        errors,
        "SCHEMA_DIALECT",
        "",
        "$schema",
        `Schema source must declare ${JSON_SCHEMA_DIALECT}.`,
      );
    } else {
      validateAgainst(root, value, "", root, errors, { nodes: 0, exhausted: false });
      scanSecurity(kind, value, errors);
      validateDependencies(kind, value, errors);
      validateCollisions(kind, value, errors);
      validateEvidence(kind, value, errors);
      validateJournal(kind, value, errors);
    }
  }

  const finalErrors = deduplicateAndSortErrors(errors);
  return finalErrors.length === 0
    ? { ok: true, kind, value: value as T, errors: [] }
    : { ok: false, kind, errors: finalErrors };
}

export function formatValidationErrors(errors: readonly SchemaValidationError[]): string {
  return errors
    .map((error) => `${error.path === "" ? "/" : error.path}: [${error.code}] ${error.message}`)
    .join("\n");
}

export function canonicalJson(value: JsonValue): string {
  const ancestors = new WeakSet<object>();
  const serialize = (current: JsonValue): string => {
    if (current === null || typeof current === "boolean") return JSON.stringify(current);
    if (typeof current === "string") return JSON.stringify(current);
    if (typeof current === "number") {
      if (!Number.isFinite(current))
        throw new TypeError("Canonical JSON cannot contain a non-finite number.");
      return JSON.stringify(Object.is(current, -0) ? 0 : current);
    }
    if (ancestors.has(current)) throw new TypeError("Canonical JSON cannot contain a cycle.");
    ancestors.add(current);
    let result: string;
    if (Array.isArray(current)) {
      result = `[${current.map(serialize).join(",")}]`;
    } else {
      result = `{${Object.keys(current)
        .sort()
        .map((key) => `${JSON.stringify(key)}:${serialize(current[key] as JsonValue)}`)
        .join(",")}}`;
    }
    ancestors.delete(current);
    return result;
  };
  return serialize(value);
}
