import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { dirname, relative, resolve, sep } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const FORMAT_SCHEMA = "https://www.designtokens.org/schemas/2025.10/format.json";
const RESOLVER_SCHEMA = "https://www.designtokens.org/schemas/2025.10/resolver.json";
const ALIAS_PATTERN = /^\{([A-Za-z0-9_.-]+)\}$/;
const KNOWN_TYPES = new Set([
  "border",
  "color",
  "cubicBezier",
  "dimension",
  "duration",
  "fontFamily",
  "fontWeight",
  "number",
  "shadow",
  "typography",
]);
const SYSTEM_COLORS = new Set([
  "AccentColor",
  "AccentColorText",
  "ButtonBorder",
  "ButtonFace",
  "ButtonText",
  "Canvas",
  "CanvasText",
  "Field",
  "FieldText",
  "GrayText",
  "Highlight",
  "HighlightText",
  "LinkText",
  "Mark",
  "MarkText",
  "SelectedItem",
  "SelectedItemText",
  "VisitedText",
]);

const moduleDirectory = dirname(fileURLToPath(import.meta.url));
export const defaultWorkspaceRoot = resolve(moduleDirectory, "../../..");
const formatCache = new Map();

function isObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function clone(value) {
  return structuredClone(value);
}

function stableSort(value) {
  if (Array.isArray(value)) {
    return value.map(stableSort);
  }

  if (!isObject(value)) {
    return value;
  }

  return Object.fromEntries(
    Object.keys(value)
      .sort((left, right) => left.localeCompare(right, "en"))
      .map((key) => [key, stableSort(value[key])]),
  );
}

export function stableJson(value) {
  return `${JSON.stringify(stableSort(value), null, 2)}\n`;
}

function readJson(path, label = path) {
  let source;
  try {
    source = readFileSync(path, "utf8");
  } catch (error) {
    throw new Error(`Unable to read ${label}: ${error.message}`, { cause: error });
  }

  try {
    return JSON.parse(source);
  } catch (error) {
    throw new Error(`Invalid JSON in ${label}: ${error.message}`, { cause: error });
  }
}

function mergeObjects(base, override) {
  if (!isObject(base) || !isObject(override)) {
    return clone(override);
  }

  const result = clone(base);
  for (const [key, value] of Object.entries(override)) {
    if (key === "$schema" || key === "$description") {
      continue;
    }
    result[key] = key in result ? mergeObjects(result[key], value) : clone(value);
  }
  return result;
}

function isAlias(value) {
  return typeof value === "string" && ALIAS_PATTERN.test(value);
}

function aliasTarget(value) {
  return typeof value === "string" ? ALIAS_PATTERN.exec(value)?.[1] : undefined;
}

function assertFiniteNumber(value, message) {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new Error(message);
  }
}

function validateDimension(value, path) {
  if (!isObject(value)) {
    throw new Error(`${path} must be a DTCG dimension object.`);
  }
  assertFiniteNumber(value.value, `${path}.value must be finite.`);
  if (value.unit !== "px" && value.unit !== "rem") {
    throw new Error(`${path}.unit must be px or rem.`);
  }
}

function validateDuration(value, path) {
  if (!isObject(value)) {
    throw new Error(`${path} must be a DTCG duration object.`);
  }
  assertFiniteNumber(value.value, `${path}.value must be finite.`);
  if (value.value < 0 || (value.unit !== "ms" && value.unit !== "s")) {
    throw new Error(`${path} must use a non-negative ms or s duration.`);
  }
}

function validateColor(value, path) {
  if (!isObject(value) || value.colorSpace !== "oklch") {
    throw new Error(`${path} must use an OKLCH DTCG color value.`);
  }
  if (!Array.isArray(value.components) || value.components.length !== 3) {
    throw new Error(`${path}.components must contain lightness, chroma, and hue.`);
  }
  const [lightness, chroma, hue] = value.components;
  assertFiniteNumber(lightness, `${path} lightness must be finite.`);
  assertFiniteNumber(chroma, `${path} chroma must be finite.`);
  assertFiniteNumber(hue, `${path} hue must be finite.`);
  if (lightness < 0 || lightness > 1 || chroma < 0 || hue < 0 || hue > 360) {
    throw new Error(`${path} contains an out-of-range OKLCH component.`);
  }
  if (value.alpha !== undefined) {
    assertFiniteNumber(value.alpha, `${path}.alpha must be finite.`);
    if (value.alpha < 0 || value.alpha > 1) {
      throw new Error(`${path}.alpha must be between 0 and 1.`);
    }
  }
}

function validateShadow(value, path) {
  const shadows = Array.isArray(value) ? value : [value];
  if (shadows.length === 0) {
    throw new Error(`${path} must contain at least one shadow.`);
  }
  for (const [index, shadow] of shadows.entries()) {
    const itemPath = `${path}[${index}]`;
    if (!isObject(shadow)) {
      throw new Error(`${itemPath} must be an object.`);
    }
    validateColor(shadow.color, `${itemPath}.color`);
    validateDimension(shadow.offsetX, `${itemPath}.offsetX`);
    validateDimension(shadow.offsetY, `${itemPath}.offsetY`);
    validateDimension(shadow.blur, `${itemPath}.blur`);
    validateDimension(shadow.spread, `${itemPath}.spread`);
  }
}

function validateBorder(value, path) {
  if (!isObject(value)) {
    throw new Error(`${path} must be a border object.`);
  }
  validateColor(value.color, `${path}.color`);
  validateDimension(value.width, `${path}.width`);
  if (
    !["solid", "dashed", "dotted", "double", "groove", "ridge", "outset", "inset"].includes(
      value.style,
    )
  ) {
    throw new Error(`${path}.style is not a supported border style.`);
  }
}

function validateTypography(value, path) {
  if (!isObject(value)) {
    throw new Error(`${path} must be a typography object.`);
  }
  if (!(
    typeof value.fontFamily === "string" ||
    (Array.isArray(value.fontFamily) && value.fontFamily.every((item) => typeof item === "string"))
  )) {
    throw new Error(`${path}.fontFamily must be a string or string array.`);
  }
  validateDimension(value.fontSize, `${path}.fontSize`);
  validateDimension(value.letterSpacing, `${path}.letterSpacing`);
  assertFiniteNumber(value.fontWeight, `${path}.fontWeight must be finite.`);
  assertFiniteNumber(value.lineHeight, `${path}.lineHeight must be finite.`);
}

function validateLiteral(type, value, path) {
  switch (type) {
    case "border":
      validateBorder(value, path);
      break;
    case "color":
      validateColor(value, path);
      break;
    case "cubicBezier":
      if (!Array.isArray(value) || value.length !== 4) {
        throw new Error(`${path} must contain four cubic-bezier coordinates.`);
      }
      value.forEach((coordinate, index) =>
        assertFiniteNumber(coordinate, `${path}[${index}] must be finite.`),
      );
      if (value[0] < 0 || value[0] > 1 || value[2] < 0 || value[2] > 1) {
        throw new Error(`${path} cubic-bezier x coordinates must be between 0 and 1.`);
      }
      break;
    case "dimension":
      validateDimension(value, path);
      break;
    case "duration":
      validateDuration(value, path);
      break;
    case "fontFamily":
      if (!(
        typeof value === "string" ||
        (Array.isArray(value) &&
          value.length > 0 &&
          value.every((item) => typeof item === "string"))
      )) {
        throw new Error(`${path} must be a font-family string or non-empty string array.`);
      }
      break;
    case "fontWeight":
      assertFiniteNumber(value, `${path} must be a numeric font weight.`);
      if (value < 1 || value > 1000) {
        throw new Error(`${path} font weight must be between 1 and 1000.`);
      }
      break;
    case "number":
      assertFiniteNumber(value, `${path} must be a finite number.`);
      break;
    case "shadow":
      validateShadow(value, path);
      break;
    case "typography":
      validateTypography(value, path);
      break;
    default:
      throw new Error(`${path} has unknown token type ${type}.`);
  }
}

export function flattenTokenDocument(document, label = "token document") {
  if (!isObject(document)) {
    throw new Error(`${label} must be a JSON object.`);
  }

  const tokens = new Map();

  function visit(node, segments, inheritedType) {
    if (!isObject(node)) {
      throw new Error(`${label}:${segments.join(".")} must be a token or group object.`);
    }

    const declaredType = node.$type ?? inheritedType;
    if (node.$type !== undefined && !KNOWN_TYPES.has(node.$type)) {
      throw new Error(`${label}:${segments.join(".")} declares unknown type ${node.$type}.`);
    }

    if (Object.hasOwn(node, "$value")) {
      const path = segments.join(".");
      if (path.length === 0) {
        throw new Error(`${label} cannot declare a token at the document root.`);
      }
      if (!declaredType) {
        throw new Error(`${label}:${path} has no explicit or inherited $type.`);
      }
      const childKeys = Object.keys(node).filter((key) => !key.startsWith("$"));
      if (childKeys.length > 0) {
        throw new Error(`${label}:${path} cannot be both a token and a group.`);
      }
      if (!isAlias(node.$value)) {
        validateLiteral(declaredType, node.$value, `${label}:${path}.$value`);
      }
      if (tokens.has(path)) {
        throw new Error(`${label} declares duplicate token path ${path}.`);
      }
      tokens.set(path, {
        description: node.$description,
        extensions: node.$extensions,
        path,
        rawValue: clone(node.$value),
        type: declaredType,
      });
      return;
    }

    for (const [key, value] of Object.entries(node)) {
      if (key.startsWith("$")) {
        continue;
      }
      visit(value, [...segments, key], declaredType);
    }
  }

  visit(document, [], undefined);
  return tokens;
}

export function resolveTokenDocument(document, label = "token document") {
  const tokens = flattenTokenDocument(document, label);
  const resolved = new Map();
  const visiting = [];

  function resolveToken(path) {
    const cached = resolved.get(path);
    if (cached) {
      return cached;
    }

    const cycleStart = visiting.indexOf(path);
    if (cycleStart !== -1) {
      const cycle = [...visiting.slice(cycleStart), path].join(" -> ");
      throw new Error(`Circular token reference detected: ${cycle}.`);
    }

    const token = tokens.get(path);
    if (!token) {
      throw new Error(`Unresolved token reference: ${path}.`);
    }

    visiting.push(path);
    const targetPath = aliasTarget(token.rawValue);
    let result;
    if (targetPath) {
      const target = tokens.get(targetPath);
      if (!target) {
        throw new Error(`${path} references unknown token ${targetPath}.`);
      }
      if (target.type !== token.type) {
        throw new Error(
          `${path} (${token.type}) cannot reference ${targetPath} (${target.type}); token types differ.`,
        );
      }
      const targetResult = resolveToken(targetPath);
      result = {
        ...token,
        extensions: token.extensions ?? targetResult.extensions,
        reference: targetPath,
        resolvedValue: clone(targetResult.resolvedValue),
      };
    } else {
      result = { ...token, reference: undefined, resolvedValue: clone(token.rawValue) };
    }
    visiting.pop();
    resolved.set(path, result);
    return result;
  }

  for (const path of [...tokens.keys()].sort()) {
    resolveToken(path);
  }
  return resolved;
}

function resolveJsonPointer(document, pointer, label) {
  if (!pointer.startsWith("#/")) {
    throw new Error(`${label} uses unsupported JSON pointer ${pointer}.`);
  }
  let current = document;
  for (const encodedSegment of pointer.slice(2).split("/")) {
    const segment = encodedSegment.replaceAll("~1", "/").replaceAll("~0", "~");
    if (!isObject(current) || !Object.hasOwn(current, segment)) {
      throw new Error(`${label} contains invalid JSON pointer ${pointer}.`);
    }
    current = current[segment];
  }
  return current;
}

function assertInside(parent, candidate, label) {
  const parentWithSeparator = parent.endsWith(sep) ? parent : `${parent}${sep}`;
  if (candidate !== parent && !candidate.startsWith(parentWithSeparator)) {
    throw new Error(`${label} escapes the canonical token source directory.`);
  }
}

function readReferencedSource(reference, sourceDirectory) {
  if (reference.startsWith("http:") || reference.startsWith("https:")) {
    throw new Error(`Remote token source references are prohibited: ${reference}.`);
  }
  const [fileReference, fragment] = reference.split("#", 2);
  if (!fileReference) {
    throw new Error(`A source reference must identify a file: ${reference}.`);
  }
  const path = resolve(sourceDirectory, fileReference);
  assertInside(sourceDirectory, path, reference);
  if (!path.endsWith(".json")) {
    throw new Error(`Token source references must be JSON files: ${reference}.`);
  }
  const document = readJson(path, fileReference);
  return {
    document: fragment ? resolveJsonPointer(document, `#${fragment}`, reference) : document,
    label: fileReference.replaceAll("\\", "/"),
  };
}

function resolverSources(resolver, input, sourceDirectory) {
  const sources = [];
  const activePointers = [];

  function expandSource(source, owner) {
    if (!isObject(source)) {
      throw new Error(`${owner} contains an invalid token source.`);
    }
    if (typeof source.$ref !== "string") {
      sources.push({ document: source, label: `${owner}:inline` });
      return;
    }
    if (source.$ref.startsWith("#/")) {
      expandResolverPointer(source.$ref);
      return;
    }
    sources.push(readReferencedSource(source.$ref, sourceDirectory));
  }

  function expandResolverPointer(pointer) {
    if (activePointers.includes(pointer)) {
      throw new Error(
        `Circular resolver reference detected: ${[...activePointers, pointer].join(" -> ")}.`,
      );
    }
    activePointers.push(pointer);
    const target = resolveJsonPointer(resolver, pointer, "resolver");
    if (pointer.startsWith("#/sets/")) {
      if (!isObject(target) || !Array.isArray(target.sources)) {
        throw new Error(`${pointer} is not a valid resolver set.`);
      }
      target.sources.forEach((source) => expandSource(source, pointer));
    } else if (pointer.startsWith("#/modifiers/")) {
      const modifierName = pointer.slice("#/modifiers/".length).split("/")[0];
      const contextName = input[modifierName] ?? target.default;
      if (
        !contextName ||
        !isObject(target.contexts) ||
        !Array.isArray(target.contexts[contextName])
      ) {
        throw new Error(`Resolver modifier ${modifierName} has no context ${String(contextName)}.`);
      }
      target.contexts[contextName].forEach((source) => expandSource(source, pointer));
    } else {
      throw new Error(`resolutionOrder may reference only sets or modifiers: ${pointer}.`);
    }
    activePointers.pop();
  }

  for (const entry of resolver.resolutionOrder) {
    if (!isObject(entry) || typeof entry.$ref !== "string") {
      throw new Error("Mergora resolver resolutionOrder entries must be reference objects.");
    }
    expandResolverPointer(entry.$ref);
  }
  return sources;
}

function externalResolverReferences(resolver) {
  const references = new Set();
  function visit(value) {
    if (Array.isArray(value)) {
      value.forEach(visit);
      return;
    }
    if (!isObject(value)) {
      return;
    }
    if (typeof value.$ref === "string" && !value.$ref.startsWith("#/")) {
      references.add(value.$ref.split("#", 1)[0]);
    }
    Object.values(value).forEach(visit);
  }
  visit(resolver.sets);
  visit(resolver.modifiers);
  return [...references].sort();
}

function mergeSources(sources) {
  let merged = {};
  const typeByPath = new Map();
  for (const source of sources) {
    const sourceTokens = flattenTokenDocument(source.document, source.label);
    for (const [path, token] of sourceTokens) {
      const previousType = typeByPath.get(path);
      if (previousType && previousType !== token.type) {
        throw new Error(
          `${source.label}:${path} changes token type from ${previousType} to ${token.type}.`,
        );
      }
      typeByPath.set(path, token.type);
    }
    merged = mergeObjects(merged, source.document);
  }
  return merged;
}

function validateResolver(resolver, contract) {
  if (!isObject(resolver) || resolver.version !== "2025.10") {
    throw new Error("Resolver version must be 2025.10.");
  }
  if (resolver.$schema !== RESOLVER_SCHEMA) {
    throw new Error(`Resolver must declare ${RESOLVER_SCHEMA}.`);
  }
  if (!isObject(resolver.sets) || !isObject(resolver.modifiers)) {
    throw new Error("Resolver must declare sets and modifiers.");
  }
  if (!Array.isArray(resolver.resolutionOrder) || resolver.resolutionOrder.length === 0) {
    throw new Error("Resolver resolutionOrder must be non-empty.");
  }
  for (const [modifierName, requiredContexts] of Object.entries(contract.requiredContexts)) {
    const modifier = resolver.modifiers[modifierName];
    if (!isObject(modifier) || !isObject(modifier.contexts)) {
      throw new Error(`Resolver is missing required modifier ${modifierName}.`);
    }
    const actual = Object.keys(modifier.contexts).sort();
    const expected = [...requiredContexts].sort();
    if (JSON.stringify(actual) !== JSON.stringify(expected)) {
      throw new Error(
        `Resolver ${modifierName} contexts must be exactly ${expected.join(", ")}; found ${actual.join(", ")}.`,
      );
    }
    if (!Object.hasOwn(modifier.contexts, modifier.default)) {
      throw new Error(`Resolver ${modifierName} default does not name a context.`);
    }
  }
}

function validateContract(contract) {
  if (!isObject(contract) || contract.dtcgVersion !== "2025.10") {
    throw new Error("Token contract must declare DTCG version 2025.10.");
  }
  if (!Array.isArray(contract.contrastPairs) || contract.contrastPairs.length === 0) {
    throw new Error("Token contract must declare official contrast pairs.");
  }
  const ids = new Set();
  for (const pair of contract.contrastPairs) {
    if (!isObject(pair) || typeof pair.id !== "string" || ids.has(pair.id)) {
      throw new Error("Every contrast pair must have a unique string id.");
    }
    ids.add(pair.id);
    if (typeof pair.foreground !== "string" || typeof pair.background !== "string") {
      throw new Error(`Contrast pair ${pair.id} must identify foreground and background tokens.`);
    }
    if (pair.minimum !== 3 && pair.minimum !== 4.5 && pair.minimum !== 7) {
      throw new Error(`Contrast pair ${pair.id} has unsupported minimum ${pair.minimum}.`);
    }
  }
  for (const [path, systemColor] of Object.entries(contract.forcedSystemColors ?? {})) {
    if (!path.startsWith("semantic.color.") || !SYSTEM_COLORS.has(systemColor)) {
      throw new Error(`Invalid forced-color mapping ${path}: ${systemColor}.`);
    }
  }
}

function validateCoverage(tokens, contract) {
  for (const prefix of contract.requiredTokenPrefixes) {
    if (![...tokens.keys()].some((path) => path === prefix || path.startsWith(`${prefix}.`))) {
      throw new Error(`Required token category ${prefix} is empty.`);
    }
  }

  const allowedGroups = new Set(contract.semanticColorGroups);
  for (const path of tokens.keys()) {
    if (!path.startsWith("semantic.color.")) {
      continue;
    }
    const group = path.split(".")[2];
    if (!allowedGroups.has(group)) {
      throw new Error(`Unknown semantic color role group ${group} at ${path}.`);
    }
  }

  for (const [name, anchor] of Object.entries(contract.brandAnchors)) {
    const token = tokens.get(anchor.path);
    if (!token || token.type !== "color") {
      throw new Error(`Brand anchor ${name} references missing color token ${anchor.path}.`);
    }
    if (JSON.stringify(token.resolvedValue.components) !== JSON.stringify(anchor.components)) {
      throw new Error(`Brand anchor ${name} drifted from its committed OKLCH components.`);
    }
  }
}

function clamp(value) {
  return Math.min(1, Math.max(0, value));
}

function oklchToLinearSrgb(color) {
  validateColor(color, "contrast color");
  const [lightness, chroma, hue] = color.components;
  const radians = (hue * Math.PI) / 180;
  const a = chroma * Math.cos(radians);
  const b = chroma * Math.sin(radians);
  const lRoot = lightness + 0.3963377774 * a + 0.2158037573 * b;
  const mRoot = lightness - 0.1055613458 * a - 0.0638541728 * b;
  const sRoot = lightness - 0.0894841775 * a - 1.291485548 * b;
  const l = lRoot ** 3;
  const m = mRoot ** 3;
  const s = sRoot ** 3;
  return {
    alpha: color.alpha ?? 1,
    blue: clamp(-0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s),
    green: clamp(-1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s),
    red: clamp(4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s),
  };
}

function composite(foreground, background) {
  const alpha = foreground.alpha + background.alpha * (1 - foreground.alpha);
  if (alpha === 0) {
    return { alpha: 0, blue: 0, green: 0, red: 0 };
  }
  return {
    alpha,
    blue:
      (foreground.blue * foreground.alpha +
        background.blue * background.alpha * (1 - foreground.alpha)) /
      alpha,
    green:
      (foreground.green * foreground.alpha +
        background.green * background.alpha * (1 - foreground.alpha)) /
      alpha,
    red:
      (foreground.red * foreground.alpha +
        background.red * background.alpha * (1 - foreground.alpha)) /
      alpha,
  };
}

function luminance(color) {
  return 0.2126 * color.red + 0.7152 * color.green + 0.0722 * color.blue;
}

export function contrastRatio(foreground, background) {
  const backgroundRgb = oklchToLinearSrgb(background);
  const foregroundRgb = composite(oklchToLinearSrgb(foreground), backgroundRgb);
  const foregroundLuminance = luminance(foregroundRgb);
  const backgroundLuminance = luminance(backgroundRgb);
  return (
    (Math.max(foregroundLuminance, backgroundLuminance) + 0.05) /
    (Math.min(foregroundLuminance, backgroundLuminance) + 0.05)
  );
}

function contrastEvidence(tokens, contract, theme) {
  return contract.contrastPairs.map((pair) => {
    const foreground = tokens.get(pair.foreground);
    const background = tokens.get(pair.background);
    if (!foreground || foreground.type !== "color") {
      throw new Error(`Contrast pair ${pair.id} has invalid foreground ${pair.foreground}.`);
    }
    if (!background || background.type !== "color") {
      throw new Error(`Contrast pair ${pair.id} has invalid background ${pair.background}.`);
    }
    const ratio = contrastRatio(foreground.resolvedValue, background.resolvedValue);
    if (ratio + 0.0001 < pair.minimum) {
      throw new Error(
        `${theme} contrast pair ${pair.id} is ${ratio.toFixed(2)}:1; requires ${pair.minimum}:1.`,
      );
    }
    return {
      background: pair.background,
      foreground: pair.foreground,
      id: pair.id,
      kind: pair.kind,
      minimum: pair.minimum,
      passes: true,
      ratio: Number(ratio.toFixed(2)),
      systemManaged: theme === "forced-colors",
      theme,
    };
  });
}

function numberText(value) {
  return Number(value.toFixed(6)).toString();
}

function colorCss(value) {
  const [lightness, chroma, hue] = value.components;
  const alpha = value.alpha === undefined ? "" : ` / ${numberText(value.alpha)}`;
  return `oklch(${numberText(lightness * 100)}% ${numberText(chroma)} ${numberText(hue)}${alpha})`;
}

function dimensionCss(value) {
  return `${numberText(value.value)}${value.unit}`;
}

function fontFamilyCss(value) {
  const families = Array.isArray(value) ? value : [value];
  return families
    .map((family) =>
      /^[a-z-]+$/i.test(family) && !family.includes(" ") ? family : JSON.stringify(family),
    )
    .join(", ");
}

function shadowCss(value) {
  const shadows = Array.isArray(value) ? value : [value];
  return shadows
    .map(
      (shadow) =>
        `${dimensionCss(shadow.offsetX)} ${dimensionCss(shadow.offsetY)} ${dimensionCss(
          shadow.blur,
        )} ${dimensionCss(shadow.spread)} ${colorCss(shadow.color)}`,
    )
    .join(", ");
}

export function tokenValueToCss(type, value) {
  switch (type) {
    case "border":
      return `${dimensionCss(value.width)} ${value.style} ${colorCss(value.color)}`;
    case "color":
      return colorCss(value);
    case "cubicBezier":
      return `cubic-bezier(${value.map(numberText).join(", ")})`;
    case "dimension":
      return dimensionCss(value);
    case "duration":
      return `${numberText(value.value)}${value.unit}`;
    case "fontFamily":
      return fontFamilyCss(value);
    case "fontWeight":
    case "number":
      return numberText(value);
    case "shadow":
      return shadowCss(value);
    case "typography":
      return `${numberText(value.fontWeight)} ${dimensionCss(value.fontSize)}/${numberText(
        value.lineHeight,
      )} ${fontFamilyCss(value.fontFamily)}`;
    default:
      throw new Error(`Cannot convert unsupported token type ${type} to CSS.`);
  }
}

function kebabCase(segment) {
  return segment
    .replace(/([a-z0-9])([A-Z])/g, "$1-$2")
    .replaceAll("_", "-")
    .toLowerCase();
}

export function cssVariableName(path, prefix = "mrg") {
  return `--${prefix}-${path.split(".").map(kebabCase).join("-")}`;
}

function cssValues(tokens) {
  return new Map(
    [...tokens.entries()]
      .sort(([left], [right]) => left.localeCompare(right, "en"))
      .map(([path, token]) => [path, tokenValueToCss(token.type, token.resolvedValue)]),
  );
}

function declarations(values, prefix, baseline) {
  const lines = [];
  for (const [path, value] of values) {
    if (baseline?.get(path) === value) {
      continue;
    }
    lines.push(`  ${cssVariableName(path, prefix)}: ${value};`);
  }
  return lines;
}

function systemColorForToken(token, path, contract) {
  const extension = token.extensions?.["org.mergora.forcedColors"]?.cssSystemColor;
  return extension ?? contract.forcedSystemColors?.[path];
}

function renderCss(contexts, contract) {
  const prefix = contract.cssVariablePrefix;
  const baseTokens = contexts.get("light-comfortable");
  const base = cssValues(baseTokens);
  const dark = cssValues(contexts.get("dark-comfortable"));
  const enhanced = cssValues(contexts.get("enhanced-contrast-comfortable"));
  const compact = cssValues(contexts.get("light-compact"));
  const touch = cssValues(contexts.get("light-touch"));
  const forcedTokens = contexts.get("forced-colors-comfortable");
  const forcedLines = [];
  for (const [path, token] of [...forcedTokens.entries()].sort(([left], [right]) =>
    left.localeCompare(right, "en"),
  )) {
    const systemColor = systemColorForToken(token, path, contract);
    if (systemColor) {
      if (!SYSTEM_COLORS.has(systemColor)) {
        throw new Error(`${path} uses unsupported CSS system color ${systemColor}.`);
      }
      forcedLines.push(`    ${cssVariableName(path, prefix)}: ${systemColor};`);
    }
  }
  if (forcedLines.length === 0) {
    throw new Error("Forced-colors context did not produce any CSS system-color declarations.");
  }

  const reducedMotionLines = [...baseTokens.entries()]
    .filter(
      ([path, token]) => path.startsWith("semantic.motion.duration.") && token.type === "duration",
    )
    .map(([path]) => `    ${cssVariableName(path, prefix)}: 1ms;`);

  return [
    "/* Generated by @mergora-internal/token-compiler. Do not edit. */",
    '@import "./fonts.css";',
    "",
    ":root,",
    ':root[data-theme="light"] {',
    "  color-scheme: light;",
    ...declarations(base, prefix),
    "}",
    "",
    ':root[data-theme="dark"] {',
    "  color-scheme: dark;",
    ...declarations(dark, prefix, base),
    "}",
    "",
    "@media (prefers-color-scheme: dark) {",
    "  :root:not([data-theme]) {",
    "    color-scheme: dark;",
    ...declarations(dark, prefix, base).map((line) => `  ${line}`),
    "  }",
    "}",
    "",
    ':root[data-contrast="enhanced"] {',
    "  color-scheme: light;",
    // The contrast attribute can coexist with an explicit or system dark theme. Emit the complete
    // flattened light-based context so an unchanged light value never inherits a dark declaration.
    ...declarations(enhanced, prefix),
    "}",
    "",
    ':root[data-density="compact"] {',
    ...declarations(compact, prefix, base),
    "}",
    "",
    ':root[data-density="touch"] {',
    ...declarations(touch, prefix, base),
    "}",
    "",
    "@media (prefers-reduced-motion: reduce) {",
    "  :root {",
    ...reducedMotionLines,
    "  }",
    "}",
    "",
    ':root[data-motion="reduced"] {',
    ...reducedMotionLines.map((line) => line.slice(2)),
    "}",
    "",
    ':root[data-contrast="forced-colors"] {',
    "  color-scheme: light dark;",
    ...forcedLines.map((line) => line.slice(2)),
    "}",
    "",
    "@media (forced-colors: active) {",
    "  :root {",
    "    color-scheme: light dark;",
    ...forcedLines,
    "  }",
    "}",
    "",
  ].join("\n");
}

function renderTailwind(contract) {
  const lines = Object.entries(contract.tailwindTheme)
    .sort(([left], [right]) => left.localeCompare(right, "en"))
    .map(
      ([tailwindVariable, tokenPath]) =>
        `  ${tailwindVariable}: var(${cssVariableName(tokenPath, contract.cssVariablePrefix)});`,
    );
  return [
    "/* Generated Tailwind CSS v4 theme mapping. Do not edit. */",
    '@import "./tokens.css";',
    "",
    "@theme inline {",
    ...lines,
    "}",
    "",
  ].join("\n");
}

function renderFontsCss(fontManifest) {
  const blocks = ["/* Generated self-hosted font faces. Do not edit. */", ""];
  for (const family of fontManifest.families) {
    blocks.push(
      "@font-face {",
      `  font-family: ${JSON.stringify(family.family)};`,
      `  src: url("./fonts/${family.asset}") format("woff2");`,
      `  font-style: ${family.style};`,
      `  font-weight: ${family.weight};`,
      `  font-display: ${family.display};`,
      `  unicode-range: ${family.unicodeRange.join(", ")};`,
      "}",
      "",
      "@font-face {",
      `  font-family: ${JSON.stringify(family.fallback.family)};`,
      `  src: local(${JSON.stringify(family.fallback.local)});`,
      `  size-adjust: ${family.fallback.sizeAdjust};`,
      `  ascent-override: ${family.fallback.ascentOverride};`,
      `  descent-override: ${family.fallback.descentOverride};`,
      `  line-gap-override: ${family.fallback.lineGapOverride};`,
      "}",
      "",
    );
  }
  return blocks.join("\n");
}

function makeResolvedDocument(tokens, context) {
  const document = {
    $description: `Resolved Mergora Living Workbench tokens for theme=${context.theme}, density=${context.density}.`,
    $extensions: {
      "org.mergora.context": context,
    },
    $schema: FORMAT_SCHEMA,
  };
  for (const [path, token] of [...tokens.entries()].sort(([left], [right]) =>
    left.localeCompare(right, "en"),
  )) {
    const segments = path.split(".");
    let parent = document;
    for (const segment of segments.slice(0, -1)) {
      parent[segment] ??= {};
      parent = parent[segment];
    }
    const leaf = { $type: token.type, $value: clone(token.resolvedValue) };
    if (token.description) {
      leaf.$description = token.description;
    }
    if (token.extensions) {
      leaf.$extensions = clone(token.extensions);
    }
    parent[segments.at(-1)] = leaf;
  }
  return document;
}

function canonicalDocument(merged, contract) {
  const document = clone(merged);
  document.$schema = FORMAT_SCHEMA;
  document.$description =
    "Canonical Mergora Living Workbench tokens with aliases for the light and comfortable default context.";
  document.$extensions = {
    "org.mergora.contract": {
      contractVersion: contract.contractVersion,
      defaultContext: contract.defaultContext,
      resolver: "mergora.resolver.json",
    },
  };
  return document;
}

function sha256(content) {
  return createHash("sha256").update(content).digest("hex");
}

function prettierParser(path) {
  if (path.endsWith(".css")) {
    return "css";
  }
  if (path.endsWith(".ts")) {
    return "typescript";
  }
  if (path.endsWith(".json")) {
    return "json";
  }
  throw new Error(`No deterministic formatter is configured for ${path}.`);
}

function formatArtifacts(artifacts, workspaceRoot) {
  const formatted = new Map();
  const pending = [];
  for (const [path, content] of artifacts) {
    const parser = prettierParser(path);
    const cacheKey = sha256(`${parser}\0${content}`);
    const cached = formatCache.get(cacheKey);
    if (cached !== undefined) {
      formatted.set(path, cached);
    } else {
      pending.push({ cacheKey, content, parser, path });
    }
  }

  if (pending.length > 0) {
    const prettierModule = resolve(workspaceRoot, "node_modules/prettier/index.mjs");
    if (!existsSync(prettierModule)) {
      throw new Error(
        "The workspace Prettier dependency is required for deterministic token generation.",
      );
    }
    const worker = resolve(moduleDirectory, "format-worker.mjs");
    const processResult = spawnSync(process.execPath, [worker], {
      encoding: "utf8",
      input: JSON.stringify({
        items: pending.map(({ content, parser }) => ({ content, parser })),
        prettierModule: pathToFileURL(prettierModule).href,
      }),
      maxBuffer: 32 * 1024 * 1024,
      windowsHide: true,
    });
    if (processResult.status !== 0) {
      throw new Error(
        `Deterministic formatting failed: ${processResult.stderr.trim() || "unknown formatter error"}`,
      );
    }
    let results;
    try {
      results = JSON.parse(processResult.stdout);
    } catch {
      throw new Error("Deterministic formatter returned invalid output.");
    }
    if (!Array.isArray(results) || results.length !== pending.length) {
      throw new Error("Deterministic formatter returned an unexpected result count.");
    }
    for (const [index, item] of pending.entries()) {
      const content = results[index];
      if (typeof content !== "string") {
        throw new Error("Deterministic formatter returned a non-string artifact.");
      }
      formatCache.set(item.cacheKey, content);
      formatted.set(item.path, content);
    }
  }
  return formatted;
}

function designToolProjection(contextDocuments, resolver) {
  const contexts = {};
  const workbench = {};
  for (const [name, document] of contextDocuments) {
    const contextName = name.replace(/-([a-z])/g, (_, character) => character.toUpperCase());
    const tokens = clone(document);
    const description = tokens.$description;
    const extensions = tokens.$extensions;
    delete tokens.$description;
    delete tokens.$extensions;
    delete tokens.$schema;
    contexts[contextName] = extensions["org.mergora.context"];
    workbench[contextName] = {
      $description: description,
      $extensions: extensions,
      ...tokens,
    };
  }
  return {
    $description:
      "Resolved DTCG token sets for design tools. Values remain DTCG-native; choose exactly one workbench context.",
    $schema: FORMAT_SCHEMA,
    $extensions: {
      "org.mergora.designToolInterchange": {
        contexts,
        modeComposition: "flattened",
        resolverVersion: resolver.version,
        sourceOfTruth: "canonical.dtcg.json",
      },
    },
    workbench,
  };
}

function generatedSchema() {
  return {
    $defs: {
      group: {
        additionalProperties: {
          anyOf: [{ $ref: "#/$defs/token" }, { $ref: "#/$defs/group" }],
        },
        properties: {
          $description: { type: "string" },
          $extensions: { type: "object" },
          $type: { $ref: "#/$defs/tokenType" },
        },
        type: "object",
      },
      token: {
        additionalProperties: false,
        properties: {
          $description: { type: "string" },
          $extensions: { type: "object" },
          $type: { $ref: "#/$defs/tokenType" },
          $value: {},
        },
        required: ["$value"],
        type: "object",
      },
      tokenType: {
        enum: [...KNOWN_TYPES].sort(),
        type: "string",
      },
    },
    $schema: "https://json-schema.org/draft/2020-12/schema",
    additionalProperties: {
      anyOf: [{ $ref: "#/$defs/token" }, { $ref: "#/$defs/group" }],
    },
    description:
      "Structural schema for the Mergora-supported DTCG 2025.10 token types. Compiler validation applies stricter value and reference rules.",
    properties: {
      $description: { type: "string" },
      $extensions: { type: "object" },
      $schema: { const: FORMAT_SCHEMA },
    },
    title: "Mergora DTCG token document",
    type: "object",
  };
}

function tokenMetadata(tokens) {
  return [...tokens.entries()]
    .sort(([left], [right]) => left.localeCompare(right, "en"))
    .map(([path, token]) => ({
      cssVariable: cssVariableName(path),
      description: token.description,
      path,
      reference: token.reference,
      type: token.type,
      value: tokenValueToCss(token.type, token.resolvedValue),
    }));
}

function renderTypeScript(defaultTokens, contexts, evidence) {
  const paths = [...defaultTokens.keys()].sort();
  const tokenTypes = Object.fromEntries(paths.map((path) => [path, defaultTokens.get(path).type]));
  const references = Object.fromEntries(
    paths
      .filter((path) => defaultTokens.get(path).reference)
      .map((path) => [path, defaultTokens.get(path).reference]),
  );
  const values = Object.fromEntries(
    paths.map((path) => [
      path,
      tokenValueToCss(defaultTokens.get(path).type, defaultTokens.get(path).resolvedValue),
    ]),
  );
  const cssVariables = Object.fromEntries(paths.map((path) => [path, cssVariableName(path)]));
  return [
    "// Generated by @mergora-internal/token-compiler. Do not edit.",
    "",
    `export const tokenNames = ${JSON.stringify(paths, null, 2)} as const;`,
    "",
    "export type TokenName = (typeof tokenNames)[number];",
    `export const tokenTypes = ${JSON.stringify(tokenTypes, null, 2)} as const;`,
    `export const tokenReferences = ${JSON.stringify(references, null, 2)} as const;`,
    `export const cssVariables = ${JSON.stringify(cssVariables, null, 2)} as const;`,
    `export const defaultTokenValues = ${JSON.stringify(values, null, 2)} as const;`,
    `export const tokenContexts = ${JSON.stringify([...contexts.keys()].sort(), null, 2)} as const;`,
    `export const contrastEvidence = ${JSON.stringify(evidence, null, 2)} as const;`,
    "",
    "export function tokenVariable(name: TokenName): `var(--${string})` {",
    "  return `var(${cssVariables[name]})`;",
    "}",
    "",
  ].join("\n");
}

function validateFontManifest(fontManifest, assetsDirectory) {
  if (
    !isObject(fontManifest) ||
    fontManifest.version !== 1 ||
    !Array.isArray(fontManifest.families)
  ) {
    throw new Error("assets/fonts/manifest.json is invalid.");
  }
  const families = new Set();
  for (const family of fontManifest.families) {
    if (!isObject(family) || typeof family.family !== "string" || families.has(family.family)) {
      throw new Error("Font manifest family names must be unique strings.");
    }
    families.add(family.family);
    if (
      typeof family.asset !== "string" ||
      family.asset.includes("/") ||
      family.asset.includes("\\")
    ) {
      throw new Error(`${family.family} has an unsafe asset filename.`);
    }
    const assetPath = resolve(assetsDirectory, family.asset);
    assertInside(assetsDirectory, assetPath, family.asset);
    if (!existsSync(assetPath)) {
      throw new Error(`Missing self-hosted font asset ${family.asset}.`);
    }
    const actualHash = createHash("sha256").update(readFileSync(assetPath)).digest("hex");
    if (actualHash !== family.sha256) {
      throw new Error(`Font asset checksum mismatch for ${family.asset}.`);
    }
    if (statSync(assetPath).size !== family.bytes) {
      throw new Error(`Font asset byte count mismatch for ${family.asset}.`);
    }
    const licensePath = resolve(assetsDirectory, family.license);
    assertInside(assetsDirectory, licensePath, family.license);
    if (!existsSync(licensePath)) {
      throw new Error(`Missing font license ${family.license}.`);
    }
    const actualLicenseHash = createHash("sha256").update(readFileSync(licensePath)).digest("hex");
    if (actualLicenseHash !== family.licenseSha256) {
      throw new Error(`Font license checksum mismatch for ${family.license}.`);
    }
    if (!Array.isArray(family.unicodeRange) || family.unicodeRange.length === 0) {
      throw new Error(`${family.family} must declare at least one Unicode range.`);
    }
    for (const metric of ["sizeAdjust", "ascentOverride", "descentOverride", "lineGapOverride"]) {
      if (typeof family.fallback?.[metric] !== "string" || !family.fallback[metric].endsWith("%")) {
        throw new Error(`${family.family} fallback ${metric} must be a percentage.`);
      }
    }
  }
  for (const required of ["Schibsted Grotesk", "Commit Mono"]) {
    if (!families.has(required)) {
      throw new Error(`Font manifest is missing ${required}.`);
    }
  }
}

function collectFiles(directory) {
  if (!existsSync(directory)) {
    return [];
  }
  const files = [];
  for (const entry of readdirSync(directory)) {
    const path = resolve(directory, entry);
    if (statSync(path).isDirectory()) {
      files.push(...collectFiles(path));
    } else {
      files.push(path);
    }
  }
  return files;
}

function applyArtifacts(artifacts, generatedDirectory, mode) {
  const expected = new Set([...artifacts.keys()]);
  const drift = [];
  for (const [path, content] of artifacts) {
    const existing = existsSync(path) ? readFileSync(path, "utf8") : undefined;
    if (existing !== content) {
      drift.push(path);
      if (mode === "write") {
        mkdirSync(dirname(path), { recursive: true });
        writeFileSync(path, content, "utf8");
      }
    }
  }

  for (const path of collectFiles(generatedDirectory)) {
    if (!expected.has(path)) {
      drift.push(path);
      if (mode === "write") {
        rmSync(path, { force: true });
      }
    }
  }

  if (mode === "check" && drift.length > 0) {
    const labels = drift.map((path) => relative(defaultWorkspaceRoot, path).replaceAll("\\", "/"));
    throw new Error(`Generated token artifacts have drifted:\n- ${labels.join("\n- ")}`);
  }
  return drift;
}

export function compileWorkspace(options = {}) {
  const workspaceRoot = resolve(options.workspaceRoot ?? defaultWorkspaceRoot);
  const sourceDirectory = resolve(
    options.sourceDirectory ?? workspaceRoot,
    options.sourceDirectory ? "" : "registry/source/tokens",
  );
  const generatedDirectory = resolve(
    options.generatedDirectory ?? workspaceRoot,
    options.generatedDirectory ? "" : "packages/tokens/src/generated",
  );
  const packageIndexPath = resolve(
    options.packageIndexPath ?? workspaceRoot,
    options.packageIndexPath ? "" : "packages/tokens/src/index.ts",
  );
  const assetsDirectory = resolve(
    options.assetsDirectory ?? workspaceRoot,
    options.assetsDirectory ? "" : "assets/fonts",
  );
  const mode = options.mode ?? "check";
  if (mode !== "check" && mode !== "write" && mode !== "memory") {
    throw new Error(`Unsupported compiler mode ${mode}.`);
  }

  const resolver = readJson(
    resolve(sourceDirectory, "mergora.resolver.json"),
    "mergora.resolver.json",
  );
  const contract = readJson(resolve(sourceDirectory, "contract.json"), "contract.json");
  const fontManifest = readJson(
    resolve(assetsDirectory, "manifest.json"),
    "assets/fonts/manifest.json",
  );
  validateContract(contract);
  validateResolver(resolver, contract);
  validateFontManifest(fontManifest, assetsDirectory);

  const contexts = new Map();
  const rawContexts = new Map();
  const contextDocuments = new Map();
  const allEvidence = [];
  const themes = contract.requiredContexts.theme;
  const densities = contract.requiredContexts.density;
  for (const theme of themes) {
    let themeEvidence;
    for (const density of densities) {
      const input = { density, theme };
      const sources = resolverSources(resolver, input, sourceDirectory);
      const merged = mergeSources(sources);
      const resolved = resolveTokenDocument(merged, `${theme}-${density}`);
      validateCoverage(resolved, contract);
      const contextName = `${theme}-${density}`;
      contexts.set(contextName, resolved);
      rawContexts.set(contextName, merged);
      const document = makeResolvedDocument(resolved, input);
      contextDocuments.set(contextName, document);
      themeEvidence ??= contrastEvidence(resolved, contract, theme);
    }
    allEvidence.push(...themeEvidence);
  }

  const defaultName = `${contract.defaultContext.theme}-${contract.defaultContext.density}`;
  const defaultTokens = contexts.get(defaultName);
  const canonical = canonicalDocument(rawContexts.get(defaultName), contract);
  const preliminaryArtifacts = new Map([
    [resolve(generatedDirectory, "canonical.dtcg.json"), stableJson(canonical)],
    [
      resolve(generatedDirectory, "design-tool-interchange.dtcg.json"),
      stableJson(designToolProjection(contextDocuments, resolver)),
    ],
    [resolve(generatedDirectory, "mergora.resolver.json"), stableJson(resolver)],
    [resolve(generatedDirectory, "schema.json"), stableJson(generatedSchema())],
  ]);
  for (const reference of externalResolverReferences(resolver)) {
    const source = readReferencedSource(reference, sourceDirectory);
    preliminaryArtifacts.set(resolve(generatedDirectory, reference), stableJson(source.document));
  }
  for (const [name, document] of contextDocuments) {
    preliminaryArtifacts.set(
      resolve(generatedDirectory, "resolved", `${name}.dtcg.json`),
      stableJson(document),
    );
  }
  const formattedPreliminary = formatArtifacts(preliminaryArtifacts, workspaceRoot);
  const canonicalContent = formattedPreliminary.get(
    resolve(generatedDirectory, "canonical.dtcg.json"),
  );
  const resolverContent = formattedPreliminary.get(
    resolve(generatedDirectory, "mergora.resolver.json"),
  );
  const schemaContent = formattedPreliminary.get(resolve(generatedDirectory, "schema.json"));
  const resolvedContents = new Map(
    [...contextDocuments.keys()].map((name) => [
      name,
      formattedPreliminary.get(resolve(generatedDirectory, "resolved", `${name}.dtcg.json`)),
    ]),
  );
  const docs = {
    artifacts: {
      canonical: { path: "canonical.dtcg.json", sha256: sha256(canonicalContent) },
      resolver: { path: "mergora.resolver.json", sha256: sha256(resolverContent) },
      resolved: Object.fromEntries(
        [...resolvedContents].map(([name, content]) => [name, sha256(content)]),
      ),
      schema: { path: "schema.json", sha256: sha256(schemaContent) },
      sources: Object.fromEntries(
        externalResolverReferences(resolver).map((reference) => [
          reference,
          sha256(formattedPreliminary.get(resolve(generatedDirectory, reference))),
        ]),
      ),
    },
    brandAnchors: contract.brandAnchors,
    componentImpacts: contract.componentImpacts,
    contexts: {
      default: contract.defaultContext,
      density: densities,
      theme: themes,
    },
    contractVersion: contract.contractVersion,
    contrastEvidence: allEvidence,
    dtcgVersion: contract.dtcgVersion,
    fontManifest,
    name: "Mergora Living Workbench",
    tokenCount: defaultTokens.size,
    tokens: tokenMetadata(defaultTokens),
  };
  const packageIndexContent = [
    "// Generated by @mergora-internal/token-compiler. Do not edit.",
    'export * from "./generated/tokens.js";',
    "",
  ].join("\n");

  const remainingArtifacts = new Map([
    [resolve(generatedDirectory, "docs.json"), stableJson(docs)],
    [resolve(generatedDirectory, "fonts.css"), renderFontsCss(fontManifest)],
    [resolve(generatedDirectory, "tailwind.css"), renderTailwind(contract)],
    [resolve(generatedDirectory, "tokens.css"), renderCss(contexts, contract)],
    [
      resolve(generatedDirectory, "tokens.ts"),
      renderTypeScript(defaultTokens, contexts, allEvidence),
    ],
    [packageIndexPath, packageIndexContent],
  ]);
  const artifacts = new Map([
    ...formattedPreliminary,
    ...formatArtifacts(remainingArtifacts, workspaceRoot),
  ]);

  const drift = mode === "memory" ? [] : applyArtifacts(artifacts, generatedDirectory, mode);
  return {
    artifacts,
    contexts,
    contrastEvidence: allEvidence,
    drift,
    tokenCount: defaultTokens.size,
  };
}
