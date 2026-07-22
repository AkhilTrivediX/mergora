import {
  closeSync,
  constants,
  existsSync,
  fstatSync,
  lstatSync,
  openSync,
  readFileSync,
} from "node:fs";
import { basename, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import {
  CLI_VERSION,
  assertNoSymlinkAncestors,
  assertPortableRelativePath,
  canonicalJson,
  CliError,
  sha256,
  validatedProjectRoot,
} from "./contracts.js";
import { validateMergoraConfig, type MergoraConfig } from "./configuration.js";
import {
  executeTransaction,
  finalizeOperationPlan,
  validateTransactionOverlay,
  validationSuiteForTransaction,
  type OperationPlan,
  type OperationPlanFile,
  type TransactionMutation,
  type TransactionResult,
  type TransactionValidationContext,
  type TransactionValidationIssue,
  type TransactionValidationResult,
  type TransactionValidator,
} from "./transaction-engine.js";
import {
  createMediaParseValidator,
  transactionValidationResult,
} from "./trusted-transaction-validators.js";

type Digest = `sha256:${string}`;

const MAX_THEME_CHARACTERS = 2_097_152;
const MAX_THEME_NODES = 100_000;
const MAX_THEME_TOKENS = 20_000;
const MAX_THEME_DEPTH = 128;
const MAX_PREVIEW_URL_CHARACTERS = 65_536;
const ACTIVE_THEME_RECEIPT = ".mergora/themes/active.json" as const;
const DTCG_SCHEMA = "https://www.designtokens.org/schemas/2025.10/format.json" as const;
const THEME_ID = /^[a-z0-9]+(?:-[a-z0-9]+)*$/u;
const DIGEST = /^sha256:[a-f0-9]{64}$/u;
const SEMVER =
  /^(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)(?:-[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?(?:\+[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?$/u;
const ALIAS = /^\{([a-zA-Z0-9_-]+(?:\.[a-zA-Z0-9_-]+)*)\}$/u;

export const OFFICIAL_THEME_PRESETS = [
  { id: "dark", label: "Dark", origin: "official" },
  { id: "enhanced-contrast", label: "Enhanced contrast", origin: "official" },
  { id: "forced-colors", label: "Forced colors", origin: "official" },
  { id: "light", label: "Light", origin: "official" },
] as const satisfies readonly ThemeListEntry[];

export type ThemeExportFormat = "dtcg" | "css" | "tailwind";
export type ThemeOrigin = "official" | "custom";

export interface ThemeListEntry {
  readonly id: string;
  readonly label: string;
  readonly origin: ThemeOrigin;
  readonly digest?: Digest | undefined;
}

export interface ThemeListResult {
  readonly themes: readonly ThemeListEntry[];
  readonly writePerformed: false;
}

export interface EnrolledThemeRegistry {
  readonly id: string;
  readonly identityDigest: Digest;
  readonly release: string;
  readonly manifestDigest: Digest;
  readonly artifactDigests: readonly Digest[];
}

export type ThemeSource =
  | { readonly kind: "bundled"; readonly label: string }
  | { readonly kind: "local-file"; readonly label: string }
  | { readonly kind: "studio-export"; readonly label: string }
  | {
      readonly kind: "enrolled-registry";
      readonly registryId: string;
      readonly identityDigest: Digest;
      readonly release: string;
      readonly manifestDigest: Digest;
      readonly artifactDigest: Digest;
    };

export interface ThemePreset {
  readonly id: string;
  readonly label: string;
  readonly origin: ThemeOrigin;
  /** Strict DTCG JSON, an object root, or a Studio v1 export envelope. */
  readonly document: string | Readonly<Record<string, unknown>>;
  /** Optional canonical/base token document used to resolve partial theme aliases. */
  readonly baseDocument?: string | Readonly<Record<string, unknown>> | undefined;
  readonly source: ThemeSource;
}

export interface ThemeAccessibilityIssue {
  readonly id: string;
  readonly rule: "contrast" | "focus" | "motion";
  readonly detail: string;
  readonly tokenPaths: readonly string[];
}

export interface ThemeSemanticChange {
  readonly token: string;
  readonly type: string;
  readonly operation: "add" | "change" | "no-op";
  readonly before: Digest | null;
  readonly after: Digest;
}

export interface ThemeValidationResult {
  readonly document: Readonly<Record<string, unknown>>;
  readonly canonicalDocument: string;
  readonly digest: Digest;
  readonly tokenCount: number;
  readonly issues: readonly ThemeAccessibilityIssue[];
  readonly semanticChanges: readonly ThemeSemanticChange[];
}

export interface ThemePreviewResult {
  readonly id: string;
  readonly digest: Digest;
  readonly studioUrl: string;
  readonly issues: readonly ThemeAccessibilityIssue[];
  readonly writePerformed: false;
}

export interface ThemeExportResult {
  readonly format: ThemeExportFormat;
  readonly content: string;
  readonly digest: Digest;
  readonly sourceDigest: Digest;
  readonly tokenCount: number;
  readonly issues: readonly ThemeAccessibilityIssue[];
  readonly writePerformed: false;
}

export interface ThemeApplyOptions {
  readonly projectRoot: string;
  readonly preset: ThemePreset;
  readonly target?: string | undefined;
  readonly enrolledRegistries?: readonly EnrolledThemeRegistry[] | undefined;
  /** Custom failures are acknowledged individually. There is deliberately no blanket bypass. */
  readonly acknowledgedIssueIds?: readonly string[] | undefined;
  readonly commandArguments?: readonly string[] | undefined;
}

export type ThemeApplyPlan = OperationPlan;

interface ThemePlanDetails {
  readonly id: string;
  readonly label: string;
  readonly origin: ThemeOrigin;
  readonly source: ThemeSource;
  readonly sourceDigest: Digest;
  readonly effectiveDigest: Digest;
  readonly target: string;
  readonly receipt: typeof ACTIVE_THEME_RECEIPT;
  readonly accessibilityIssues: readonly ThemeAccessibilityIssue[];
  readonly semanticChanges: readonly ThemeSemanticChange[];
  readonly requiredAcknowledgementIds: readonly string[];
}

export interface ThemeApplyResult {
  readonly id: string;
  readonly target: string;
  readonly receipt: typeof ACTIVE_THEME_RECEIPT;
  readonly planDigest: Digest;
  readonly accessibilityIssues: readonly ThemeAccessibilityIssue[];
  readonly transaction: TransactionResult;
}

interface Token {
  readonly path: string;
  readonly type: string;
  readonly value: unknown;
}

interface ParsedTheme {
  readonly root: Record<string, unknown>;
  readonly tokens: ReadonlyMap<string, Token>;
}

interface InternalThemePlan {
  readonly root: string;
  readonly plan: ThemeApplyPlan;
  readonly details: ThemePlanDetails;
  readonly mutations: readonly TransactionMutation[];
  readonly observedTargets: Readonly<Record<string, Digest | null>>;
  readonly validators: readonly TransactionValidator[];
}

function themeError(message: string, code: string, target?: string, exitCode: 2 | 3 | 5 | 8 = 3) {
  return new CliError(message, {
    code,
    exitCode,
    ...(target === undefined ? {} : { target }),
  });
}

function isObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function compareText(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function sortedUnique(values: readonly string[]): readonly string[] {
  return [...new Set(values)].sort(compareText);
}

function assertThemeIdentity(preset: ThemePreset): void {
  if (!THEME_ID.test(preset.id) || preset.id.length > 80) {
    throw themeError("Theme ID must be one portable kebab-case identifier.", "THEME_ID_INVALID");
  }
  if (preset.label.trim() === "" || preset.label.length > 160) {
    throw themeError("Theme label is empty or exceeds the supported limit.", "THEME_LABEL_INVALID");
  }
  if (preset.origin === "official" && preset.source.kind !== "bundled") {
    throw themeError(
      "Only a bundled preset may claim official theme provenance.",
      "THEME_OFFICIAL_PROVENANCE_INVALID",
      undefined,
      5,
    );
  }
  if (preset.origin === "custom" && preset.source.kind === "bundled") {
    throw themeError(
      "A bundled preset must use official theme provenance.",
      "THEME_CUSTOM_PROVENANCE_INVALID",
      undefined,
      5,
    );
  }
}

function parseInput(
  input: string | Readonly<Record<string, unknown>>,
  source: ThemeSource,
): Record<string, unknown> {
  let value: unknown = input;
  if (typeof input === "string") {
    if (input.length > MAX_THEME_CHARACTERS) {
      throw themeError("Theme input exceeds the supported character limit.", "THEME_OVERSIZE");
    }
    try {
      value = JSON.parse(input) as unknown;
    } catch {
      throw themeError("Theme input must be strict UTF-8 JSON.", "THEME_JSON_INVALID");
    }
  }
  if (source.kind === "studio-export") {
    if (
      !isObject(value) ||
      value.schemaVersion !== 1 ||
      value.format !== "mergora-studio-theme-v1" ||
      !isObject(value.theme) ||
      Object.keys(value).some(
        (key) =>
          !["schemaVersion", "format", "theme", "checksums", "acknowledgements"].includes(key),
      )
    ) {
      throw themeError(
        "Studio input must be one supported mergora-studio-theme-v1 export.",
        "THEME_STUDIO_EXPORT_INVALID",
      );
    }
    value = value.theme;
  }
  if (!isObject(value)) {
    throw themeError("A DTCG theme requires one object root.", "THEME_DTCG_INVALID");
  }
  try {
    const canonical = canonicalJson(value);
    if (canonical.length > MAX_THEME_CHARACTERS) {
      throw themeError("Theme input exceeds the supported character limit.", "THEME_OVERSIZE");
    }
  } catch (error) {
    if (error instanceof CliError) throw error;
    throw themeError("Theme input is not canonicalizable JSON.", "THEME_DTCG_INVALID");
  }
  return value;
}

function mergeDocuments(
  base: Readonly<Record<string, unknown>>,
  overlay: Readonly<Record<string, unknown>>,
): Record<string, unknown> {
  const result: Record<string, unknown> = { ...base };
  for (const key of Object.keys(overlay).sort(compareText)) {
    const next = overlay[key];
    const previous = base[key];
    result[key] = isObject(previous) && isObject(next) ? mergeDocuments(previous, next) : next;
  }
  return result;
}

function assertFinite(value: unknown, path: string): asserts value is number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw themeError(`${path} must be finite.`, "THEME_DTCG_VALUE_INVALID");
  }
}

function validateTypedValue(type: string, value: unknown, path: string): void {
  if (typeof value === "string" && ALIAS.test(value)) return;
  if (type === "number") {
    assertFinite(value, `${path}.$value`);
    return;
  }
  if (type === "boolean" && typeof value !== "boolean") {
    throw themeError(`${path} must contain a boolean value.`, "THEME_DTCG_VALUE_INVALID");
  }
  if (type === "string" && typeof value !== "string") {
    throw themeError(`${path} must contain a string value.`, "THEME_DTCG_VALUE_INVALID");
  }
  if (type === "duration" || type === "dimension") {
    if (!isObject(value) || !Object.hasOwn(value, "value") || typeof value.unit !== "string") {
      throw themeError(`${path} must contain a DTCG ${type} object.`, "THEME_DTCG_VALUE_INVALID");
    }
    assertFinite(value.value, `${path}.$value.value`);
    if (type === "duration" && !["ms", "s"].includes(value.unit)) {
      throw themeError(`${path} duration must use ms or s.`, "THEME_DTCG_VALUE_INVALID");
    }
    if (type === "dimension" && !["px", "rem"].includes(value.unit)) {
      throw themeError(`${path} dimension must use px or rem.`, "THEME_DTCG_VALUE_INVALID");
    }
    if (type === "duration" && value.value < 0) {
      throw themeError(`${path} cannot contain a negative duration.`, "THEME_DTCG_VALUE_INVALID");
    }
  }
  if (type === "color" && isObject(value) && value.colorSpace === "oklch") {
    if (!Array.isArray(value.components) || value.components.length !== 3) {
      throw themeError(`${path} OKLCH color needs three components.`, "THEME_DTCG_VALUE_INVALID");
    }
    for (const [index, component] of value.components.entries()) {
      assertFinite(component, `${path}.$value.components[${String(index)}]`);
    }
    const [lightness, chroma, hue] = value.components as [number, number, number];
    if (lightness < 0 || lightness > 1 || chroma < 0 || hue < 0 || hue > 360) {
      throw themeError(`${path} contains an out-of-range OKLCH color.`, "THEME_DTCG_VALUE_INVALID");
    }
    if (value.alpha !== undefined) {
      assertFinite(value.alpha, `${path}.$value.alpha`);
      if (value.alpha < 0 || value.alpha > 1) {
        throw themeError(`${path} alpha must be between zero and one.`, "THEME_DTCG_VALUE_INVALID");
      }
    }
  }
}

function parseDtcg(root: Record<string, unknown>): ParsedTheme {
  if (root.$schema !== undefined && root.$schema !== DTCG_SCHEMA) {
    throw themeError(
      `Theme $schema must identify the supported DTCG 2025.10 format.`,
      "THEME_DTCG_SCHEMA_UNSUPPORTED",
    );
  }
  const tokens = new Map<string, Token>();
  let nodes = 0;
  const visit = (
    node: Record<string, unknown>,
    path: readonly string[],
    inheritedType: string | undefined,
    depth: number,
  ): void => {
    nodes += 1;
    if (nodes > MAX_THEME_NODES || depth > MAX_THEME_DEPTH) {
      throw themeError(
        "Theme structure exceeds the supported complexity limit.",
        "THEME_COMPLEXITY",
      );
    }
    if (node.$type !== undefined && typeof node.$type !== "string") {
      throw themeError(`${path.join(".") || "/"} has a non-string $type.`, "THEME_DTCG_INVALID");
    }
    const effectiveType = typeof node.$type === "string" ? node.$type : inheritedType;
    if (Object.hasOwn(node, "$value")) {
      if (path.length === 0 || effectiveType === undefined || effectiveType.trim() === "") {
        throw themeError(
          `${path.join(".") || "/"} is a token without an effective DTCG type.`,
          "THEME_DTCG_INVALID",
        );
      }
      if (Object.keys(node).some((key) => !key.startsWith("$"))) {
        throw themeError(
          `${path.join(".")} cannot be both a token and a token group.`,
          "THEME_DTCG_INVALID",
        );
      }
      const tokenPath = path.join(".");
      validateTypedValue(effectiveType, node.$value, tokenPath);
      tokens.set(tokenPath, { path: tokenPath, type: effectiveType, value: node.$value });
      if (tokens.size > MAX_THEME_TOKENS) {
        throw themeError("Theme token count exceeds the supported limit.", "THEME_COMPLEXITY");
      }
      return;
    }
    for (const key of Object.keys(node).sort(compareText)) {
      if (key.startsWith("$")) continue;
      const child = node[key];
      if (!isObject(child)) {
        throw themeError(
          `${[...path, key].join(".")} must be a DTCG token or group object.`,
          "THEME_DTCG_INVALID",
        );
      }
      visit(child, [...path, key], effectiveType, depth + 1);
    }
  };
  visit(root, [], undefined, 0);
  if (tokens.size === 0) {
    throw themeError("Theme input does not contain any DTCG tokens.", "THEME_DTCG_EMPTY");
  }
  return { root, tokens };
}

function resolvedTokens(parsed: ParsedTheme): ReadonlyMap<string, Token> {
  const result = new Map<string, Token>();
  const visiting: string[] = [];
  const resolveToken = (path: string): Token => {
    const existing = result.get(path);
    if (existing !== undefined) return existing;
    const token = parsed.tokens.get(path);
    if (token === undefined) {
      throw themeError(`Theme alias references unknown token ${path}.`, "THEME_ALIAS_UNKNOWN");
    }
    if (visiting.includes(path)) {
      throw themeError(
        `Theme alias cycle detected: ${[...visiting.slice(visiting.indexOf(path)), path].join(" -> ")}.`,
        "THEME_ALIAS_CYCLE",
      );
    }
    visiting.push(path);
    const match = typeof token.value === "string" ? ALIAS.exec(token.value) : null;
    let resolved = token;
    if (match !== null) {
      const referenced = resolveToken(match[1]!);
      if (referenced.type !== token.type) {
        throw themeError(
          `${path} (${token.type}) cannot reference ${referenced.path} (${referenced.type}).`,
          "THEME_ALIAS_TYPE_MISMATCH",
        );
      }
      resolved = { ...token, value: referenced.value };
    }
    visiting.pop();
    result.set(path, resolved);
    return resolved;
  };
  for (const path of [...parsed.tokens.keys()].sort(compareText)) resolveToken(path);
  return result;
}

interface Oklch {
  readonly colorSpace: "oklch";
  readonly components: readonly [number, number, number];
  readonly alpha?: number | undefined;
}

function asOklch(value: unknown): Oklch | null {
  if (
    !isObject(value) ||
    value.colorSpace !== "oklch" ||
    !Array.isArray(value.components) ||
    value.components.length !== 3 ||
    value.components.some((entry) => typeof entry !== "number" || !Number.isFinite(entry)) ||
    (value.alpha !== undefined &&
      (typeof value.alpha !== "number" || !Number.isFinite(value.alpha)))
  ) {
    return null;
  }
  return value as unknown as Oklch;
}

function clamp(value: number): number {
  return Math.min(1, Math.max(0, value));
}

function linearSrgb(color: Oklch) {
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

function contrastRatio(foreground: Oklch, background: Oklch): number {
  const backgroundRgb = linearSrgb(background);
  const rawForeground = linearSrgb(foreground);
  const alpha = rawForeground.alpha + backgroundRgb.alpha * (1 - rawForeground.alpha);
  const composite = {
    red:
      alpha === 0
        ? 0
        : (rawForeground.red * rawForeground.alpha +
            backgroundRgb.red * backgroundRgb.alpha * (1 - rawForeground.alpha)) /
          alpha,
    green:
      alpha === 0
        ? 0
        : (rawForeground.green * rawForeground.alpha +
            backgroundRgb.green * backgroundRgb.alpha * (1 - rawForeground.alpha)) /
          alpha,
    blue:
      alpha === 0
        ? 0
        : (rawForeground.blue * rawForeground.alpha +
            backgroundRgb.blue * backgroundRgb.alpha * (1 - rawForeground.alpha)) /
          alpha,
  };
  const luminance = (color: {
    readonly red: number;
    readonly green: number;
    readonly blue: number;
  }) => 0.2126 * color.red + 0.7152 * color.green + 0.0722 * color.blue;
  const foregroundLuminance = luminance(composite);
  const backgroundLuminance = luminance(backgroundRgb);
  return (
    (Math.max(foregroundLuminance, backgroundLuminance) + 0.05) /
    (Math.min(foregroundLuminance, backgroundLuminance) + 0.05)
  );
}

const CONTRAST_PAIRS = [
  [
    "text-primary-canvas",
    "semantic.color.foreground.primary",
    "semantic.color.background.canvas",
    4.5,
  ],
  [
    "text-primary-surface",
    "semantic.color.foreground.primary",
    "semantic.color.background.surface",
    4.5,
  ],
  ["action-default", "semantic.color.action.foreground", "semantic.color.action.background", 4.5],
  ["focus-canvas", "semantic.color.focus.ring", "semantic.color.background.canvas", 3],
  ["focus-surface", "semantic.color.focus.ring", "semantic.color.background.surface", 3],
] as const;

function accessibilityIssues(
  tokens: ReadonlyMap<string, Token>,
): readonly ThemeAccessibilityIssue[] {
  const issues: ThemeAccessibilityIssue[] = [];
  for (const [id, foregroundPath, backgroundPath, minimum] of CONTRAST_PAIRS) {
    const foreground = tokens.get(foregroundPath);
    const background = tokens.get(backgroundPath);
    if (foreground === undefined || background === undefined) {
      issues.push({
        id: `contrast.${id}.missing`,
        rule: "contrast",
        detail: `Contrast rule ${id} requires ${foregroundPath} and ${backgroundPath}.`,
        tokenPaths: [foregroundPath, backgroundPath],
      });
      continue;
    }
    const foregroundColor = foreground.type === "color" ? asOklch(foreground.value) : null;
    const backgroundColor = background.type === "color" ? asOklch(background.value) : null;
    if (foregroundColor === null || backgroundColor === null) {
      issues.push({
        id: `contrast.${id}.unverifiable`,
        rule: "contrast",
        detail: `Contrast rule ${id} requires resolved OKLCH color tokens.`,
        tokenPaths: [foregroundPath, backgroundPath],
      });
      continue;
    }
    const ratio = contrastRatio(foregroundColor, backgroundColor);
    if (ratio + 0.0001 < minimum) {
      issues.push({
        id: `contrast.${id}`,
        rule: "contrast",
        detail: `${id} contrast ${ratio.toFixed(2)} is below ${minimum.toFixed(1)}:1.`,
        tokenPaths: [foregroundPath, backgroundPath],
      });
    }
  }

  const focusWidth = tokens.get("semantic.focus.width");
  if (focusWidth === undefined || focusWidth.type !== "dimension" || !isObject(focusWidth.value)) {
    issues.push({
      id: "focus.width.missing",
      rule: "focus",
      detail: "A semantic.focus.width dimension is required for visible focus appearance.",
      tokenPaths: ["semantic.focus.width"],
    });
  } else {
    const pixels =
      focusWidth.value.unit === "rem"
        ? Number(focusWidth.value.value) * 16
        : Number(focusWidth.value.value);
    if (!Number.isFinite(pixels) || pixels < 2) {
      issues.push({
        id: "focus.width.minimum",
        rule: "focus",
        detail: "semantic.focus.width must resolve to at least 2 CSS pixels.",
        tokenPaths: ["semantic.focus.width"],
      });
    }
  }

  const motionRules = [
    ["semantic.motion.duration.feedback", 500],
    ["semantic.motion.duration.transition", 1000],
    ["semantic.motion.duration.overlay", 1000],
    ["semantic.motion.duration.deliberate", 2000],
  ] as const;
  for (const [path, maximumMilliseconds] of motionRules) {
    const token = tokens.get(path);
    if (token === undefined || token.type !== "duration" || !isObject(token.value)) {
      issues.push({
        id: `motion.${path.split(".").at(-1)!}.missing`,
        rule: "motion",
        detail: `${path} is required for bounded, reducible motion.`,
        tokenPaths: [path],
      });
      continue;
    }
    const milliseconds =
      token.value.unit === "s" ? Number(token.value.value) * 1000 : Number(token.value.value);
    if (!Number.isFinite(milliseconds) || milliseconds > maximumMilliseconds) {
      issues.push({
        id: `motion.${path.split(".").at(-1)!}.maximum`,
        rule: "motion",
        detail: `${path} exceeds the ${String(maximumMilliseconds)}ms accessibility lint bound.`,
        tokenPaths: [path],
      });
    }
  }
  return issues.sort((left, right) => compareText(left.id, right.id));
}

function semanticChanges(
  base: ParsedTheme | null,
  effective: ReadonlyMap<string, Token>,
  overlay: ParsedTheme,
): readonly ThemeSemanticChange[] {
  const baseResolved = base === null ? new Map<string, Token>() : resolvedTokens(base);
  return [...overlay.tokens.keys()].sort(compareText).map((path) => {
    const before = baseResolved.get(path);
    const after = effective.get(path)!;
    const beforeDigest = before === undefined ? null : sha256(canonicalJson(before.value));
    const afterDigest = sha256(canonicalJson(after.value));
    return {
      token: path,
      type: after.type,
      operation: before === undefined ? "add" : beforeDigest === afterDigest ? "no-op" : "change",
      before: beforeDigest,
      after: afterDigest,
    };
  });
}

function parsedPreset(preset: ThemePreset): {
  readonly source: ParsedTheme;
  readonly effective: ParsedTheme;
  readonly validation: ThemeValidationResult;
} {
  assertThemeIdentity(preset);
  const sourceRoot = parseInput(preset.document, preset.source);
  const source = parseDtcg(sourceRoot);
  const baseRoot =
    preset.baseDocument === undefined
      ? null
      : parseInput(preset.baseDocument, { kind: "local-file", label: "base-document" });
  const base = baseRoot === null ? null : parseDtcg(baseRoot);
  const effectiveRoot = baseRoot === null ? sourceRoot : mergeDocuments(baseRoot, sourceRoot);
  const effective = parseDtcg(effectiveRoot);
  const resolved = resolvedTokens(effective);
  const canonicalDocument = canonicalJson(sourceRoot);
  return {
    source,
    effective,
    validation: {
      document: sourceRoot,
      canonicalDocument,
      digest: sha256(canonicalDocument),
      tokenCount: source.tokens.size,
      issues: accessibilityIssues(resolved),
      semanticChanges: semanticChanges(base, resolved, source),
    },
  };
}

export function validateTheme(preset: ThemePreset): ThemeValidationResult {
  return parsedPreset(preset).validation;
}

export function listThemes(customThemes: readonly ThemeListEntry[] = []): ThemeListResult {
  const seen = new Set<string>();
  const catalog: readonly ThemeListEntry[] = [...OFFICIAL_THEME_PRESETS, ...customThemes];
  const themes = catalog
    .map((theme): ThemeListEntry => {
      if (!THEME_ID.test(theme.id) || theme.label.trim() === "") {
        throw themeError("Theme catalog contains an invalid entry.", "THEME_CATALOG_INVALID");
      }
      if (theme.digest !== undefined && !DIGEST.test(theme.digest)) {
        throw themeError("Theme catalog contains an invalid digest.", "THEME_CATALOG_INVALID");
      }
      if (seen.has(theme.id)) {
        throw themeError(`Theme catalog repeats ${theme.id}.`, "THEME_CATALOG_DUPLICATE");
      }
      seen.add(theme.id);
      return { ...theme };
    })
    .sort((left, right) => compareText(left.id, right.id));
  return { themes, writePerformed: false };
}

function bundledThemeDirectory(): string {
  const moduleDirectory = dirname(fileURLToPath(import.meta.url));
  for (const candidate of [
    resolve(moduleDirectory, "themes"),
    resolve(moduleDirectory, "../dist/themes"),
    resolve(moduleDirectory, "../../../registry/source/tokens/themes"),
  ]) {
    if (existsSync(candidate)) return candidate;
  }
  throw themeError("Bundled official theme bytes are unavailable.", "THEME_BUNDLE_MISSING");
}

function readBundledTheme(id: string): string {
  if (!OFFICIAL_THEME_PRESETS.some((entry) => entry.id === id)) {
    throw themeError(`Official theme ${JSON.stringify(id)} is unknown.`, "THEME_PRESET_UNKNOWN");
  }
  const path = resolve(bundledThemeDirectory(), `${id}.tokens.json`);
  const metadata = lstatSync(path);
  if (metadata.isSymbolicLink() || !metadata.isFile() || metadata.size > MAX_THEME_CHARACTERS) {
    throw themeError("Bundled official theme bytes are unsafe.", "THEME_BUNDLE_INVALID");
  }
  return readFileSync(path, "utf8");
}

function readBundledThemeBase(): string {
  const directory = bundledThemeDirectory();
  const path = [
    resolve(directory, "canonical.dtcg.json"),
    resolve(directory, "../canonical.dtcg.json"),
    resolve(
      dirname(fileURLToPath(import.meta.url)),
      "../../tokens/src/generated/canonical.dtcg.json",
    ),
  ].find((candidate) => existsSync(candidate));
  if (path === undefined) {
    throw themeError("Bundled canonical theme base is unavailable.", "THEME_BUNDLE_MISSING");
  }
  const metadata = lstatSync(path);
  if (metadata.isSymbolicLink() || !metadata.isFile() || metadata.size > MAX_THEME_CHARACTERS) {
    throw themeError("Bundled canonical theme base is unsafe.", "THEME_BUNDLE_INVALID");
  }
  return readFileSync(path, "utf8");
}

function themeLabel(id: string): string {
  return id
    .split("-")
    .map((part) => `${part.slice(0, 1).toLocaleUpperCase("en-US")}${part.slice(1)}`)
    .join(" ");
}

/** Resolves either one bundled official ID or one safe project-relative theme file. */
export function loadThemePreset(projectRoot: string, input: string): ThemePreset {
  const official = OFFICIAL_THEME_PRESETS.find(({ id }) => id === input);
  if (official !== undefined) {
    return {
      ...official,
      document: readBundledTheme(official.id),
      baseDocument: readBundledThemeBase(),
      source: { kind: "bundled", label: official.id },
    };
  }
  const root = validatedProjectRoot(projectRoot);
  assertPortableRelativePath(input, "Theme input file");
  if (!input.endsWith(".json")) {
    throw themeError(
      "A custom theme input must be a project-relative JSON file.",
      "THEME_FILE_INVALID",
    );
  }
  const bytes = safeRead(root, input);
  if (bytes === null || bytes.byteLength > MAX_THEME_CHARACTERS) {
    throw themeError("Custom theme input is missing or oversized.", "THEME_FILE_INVALID", input);
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(bytes.toString("utf8")) as unknown;
  } catch {
    parsed = null;
  }
  const filename = basename(input).replace(/(?:\.tokens)?\.json$/u, "");
  const id = filename.normalize("NFKC").toLocaleLowerCase("en-US");
  const studio = isObject(parsed) && parsed.format === "mergora-studio-theme-v1";
  const preset: ThemePreset = {
    id,
    label: themeLabel(id),
    origin: "custom",
    document: bytes.toString("utf8"),
    baseDocument: readBundledThemeBase(),
    source: studio ? { kind: "studio-export", label: input } : { kind: "local-file", label: input },
  };
  assertThemeIdentity(preset);
  return preset;
}

/** Lists official presets plus the valid currently installed custom receipt, if any. */
export function listProjectThemes(projectRoot: string): ThemeListResult {
  const root = validatedProjectRoot(projectRoot);
  const receipt = safeRead(root, ACTIVE_THEME_RECEIPT, true);
  if (receipt === null) return listThemes();
  let value: unknown;
  try {
    value = JSON.parse(receipt.toString("utf8")) as unknown;
  } catch {
    value = null;
  }
  if (
    !isObject(value) ||
    value.schemaVersion !== 1 ||
    value.format !== "mergora-active-theme-v1" ||
    typeof value.id !== "string" ||
    typeof value.label !== "string" ||
    (value.origin !== "official" && value.origin !== "custom") ||
    typeof value.sourceDigest !== "string" ||
    !DIGEST.test(value.sourceDigest)
  ) {
    throw themeError("The active theme receipt is invalid.", "THEME_RECEIPT_INVALID");
  }
  return listThemes(
    value.origin === "custom"
      ? [
          {
            id: value.id,
            label: value.label,
            origin: "custom",
            digest: value.sourceDigest as Digest,
          },
        ]
      : [],
  );
}

function safeStudioOrigin(input: string): URL {
  let url: URL;
  try {
    url = new URL(input);
  } catch {
    throw themeError(
      "Studio preview origin is not a valid URL.",
      "THEME_PREVIEW_URL_INVALID",
      undefined,
      2,
    );
  }
  if (
    url.protocol !== "https:" ||
    url.username !== "" ||
    url.password !== "" ||
    url.search !== "" ||
    url.hash !== ""
  ) {
    throw themeError(
      "Studio preview origin must be credential-free HTTPS without query or fragment data.",
      "THEME_PREVIEW_URL_INVALID",
      undefined,
      5,
    );
  }
  return url;
}

export function previewTheme(
  preset: ThemePreset,
  studioOrigin = "https://mergora.vercel.app/studio/",
): ThemePreviewResult {
  const validation = validateTheme(preset);
  const origin = safeStudioOrigin(studioOrigin);
  const payload = Buffer.from(
    canonicalJson({
      schemaVersion: 1,
      format: "mergora-theme-preview-v1",
      id: preset.id,
      origin: preset.origin,
      theme: validation.document,
    }),
  ).toString("base64url");
  origin.hash = `theme=${payload}&digest=${validation.digest.slice("sha256:".length)}`;
  if (origin.href.length > MAX_PREVIEW_URL_CHARACTERS) {
    throw themeError(
      "Theme is too large for a deterministic Studio fragment; use Studio import instead.",
      "THEME_PREVIEW_OVERSIZE",
    );
  }
  return {
    id: preset.id,
    digest: validation.digest,
    studioUrl: origin.href,
    issues: validation.issues,
    writePerformed: false,
  };
}

function numberText(value: number): string {
  return Number(value.toFixed(6)).toString();
}

function cssValue(token: Token): string {
  const value = token.value;
  if (token.type === "color") {
    const color = asOklch(value);
    if (color === null) {
      throw themeError(
        `${token.path} cannot be exported as CSS because it is not resolved OKLCH.`,
        "THEME_EXPORT_UNSUPPORTED",
      );
    }
    const [lightness, chroma, hue] = color.components;
    const alpha = color.alpha === undefined ? "" : ` / ${numberText(color.alpha)}`;
    return `oklch(${numberText(lightness * 100)}% ${numberText(chroma)} ${numberText(hue)}${alpha})`;
  }
  if ((token.type === "dimension" || token.type === "duration") && isObject(value)) {
    return `${numberText(Number(value.value))}${String(value.unit)}`;
  }
  if (typeof value === "number") return numberText(value);
  if (typeof value === "string") return value;
  if (typeof value === "boolean") return value ? "1" : "0";
  if (
    token.type === "cubicBezier" &&
    Array.isArray(value) &&
    value.length === 4 &&
    value.every((entry) => typeof entry === "number" && Number.isFinite(entry))
  ) {
    return `cubic-bezier(${value.map(numberText).join(", ")})`;
  }
  if (
    token.type === "fontFamily" &&
    Array.isArray(value) &&
    value.every((entry) => typeof entry === "string")
  ) {
    return value.map((entry) => (entry.includes(" ") ? JSON.stringify(entry) : entry)).join(", ");
  }
  throw themeError(
    `${token.path} uses a value that cannot be represented safely in ${token.type} CSS.`,
    "THEME_EXPORT_UNSUPPORTED",
  );
}

function cssSlug(path: string): string {
  return path
    .replaceAll(/([a-z0-9])([A-Z])/gu, "$1-$2")
    .replaceAll(/[._]/gu, "-")
    .toLocaleLowerCase("en-US");
}

function cssExport(tokens: ReadonlyMap<string, Token>): string {
  const declarations = [...tokens.values()]
    .sort((left, right) => compareText(left.path, right.path))
    .map((token) => `  --mrg-${cssSlug(token.path)}: ${cssValue(token)};`);
  return `:root {\n${declarations.join("\n")}\n}\n`;
}

function tailwindNamespace(type: string): string | null {
  if (type === "color") return "color";
  if (type === "dimension") return "spacing";
  if (type === "fontFamily") return "font";
  if (type === "duration") return "animate";
  return null;
}

function tailwindExport(tokens: ReadonlyMap<string, Token>): string {
  const declarations = [...tokens.values()]
    .sort((left, right) => compareText(left.path, right.path))
    .flatMap((token) => {
      const namespace = tailwindNamespace(token.type);
      return namespace === null
        ? []
        : [`  --${namespace}-mrg-${cssSlug(token.path)}: var(--mrg-${cssSlug(token.path)});`];
    });
  return `${cssExport(tokens)}\n@theme inline {\n${declarations.join("\n")}\n}\n`;
}

export function exportTheme(preset: ThemePreset, format: ThemeExportFormat): ThemeExportResult {
  const parsed = parsedPreset(preset);
  const resolved = resolvedTokens(parsed.effective);
  const content =
    format === "dtcg"
      ? `${parsed.validation.canonicalDocument}\n`
      : format === "css"
        ? cssExport(resolved)
        : tailwindExport(resolved);
  return {
    format,
    content,
    digest: sha256(content),
    sourceDigest: parsed.validation.digest,
    tokenCount: parsed.validation.tokenCount,
    issues: parsed.validation.issues,
    writePerformed: false,
  };
}

function safeRead(root: string, target: string, optional = false): Buffer | null {
  assertPortableRelativePath(target, "Theme project target");
  assertNoSymlinkAncestors(root, target);
  const path = resolve(root, ...target.split("/"));
  let metadata;
  try {
    metadata = lstatSync(path);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT" && optional) return null;
    throw error;
  }
  if (metadata.isSymbolicLink() || !metadata.isFile()) {
    throw themeError(
      `Theme target ${target} is not a regular file.`,
      "THEME_TARGET_UNSAFE",
      target,
      5,
    );
  }
  let descriptor: number | null = null;
  try {
    const flags =
      process.platform === "win32" ? constants.O_RDONLY : constants.O_RDONLY | constants.O_NOFOLLOW;
    descriptor = openSync(path, flags);
    const opened = fstatSync(descriptor);
    const current = lstatSync(path);
    if (
      !opened.isFile() ||
      current.isSymbolicLink() ||
      !current.isFile() ||
      opened.dev !== current.dev ||
      opened.ino !== current.ino
    ) {
      throw themeError(
        `Theme target ${target} changed during inspection.`,
        "THEME_TARGET_UNSAFE",
        target,
        5,
      );
    }
    return readFileSync(descriptor);
  } finally {
    if (descriptor !== null) closeSync(descriptor);
  }
}

function canonicalJsonDigest(bytes: Buffer | null, target: string): Digest | null {
  if (bytes === null) return null;
  try {
    return sha256(canonicalJson(JSON.parse(bytes.toString("utf8")) as unknown));
  } catch {
    throw themeError(
      `${target} must be valid canonicalizable JSON.`,
      "THEME_PROJECT_JSON_INVALID",
      target,
    );
  }
}

function projectConfiguration(root: string): {
  readonly config: MergoraConfig;
  readonly configDigest: Digest;
  readonly manifestDigest: Digest | null;
} {
  const configBytes = safeRead(root, "mergora.json");
  let raw: unknown;
  try {
    raw = JSON.parse(configBytes!.toString("utf8")) as unknown;
  } catch {
    throw themeError(
      "mergora.json must be valid JSON.",
      "THEME_PROJECT_JSON_INVALID",
      "mergora.json",
    );
  }
  const config = validateMergoraConfig(raw);
  return {
    config,
    configDigest: sha256(canonicalJson(raw)),
    manifestDigest: canonicalJsonDigest(
      safeRead(root, ".mergora/manifest.json", true),
      ".mergora/manifest.json",
    ),
  };
}

function validateRemoteSource(
  preset: ThemePreset,
  enrolledRegistries: readonly EnrolledThemeRegistry[],
  sourceDigest: Digest,
): void {
  if (preset.source.kind !== "enrolled-registry") return;
  const source = preset.source;
  if (
    !THEME_ID.test(source.registryId) ||
    !DIGEST.test(source.identityDigest) ||
    !DIGEST.test(source.manifestDigest) ||
    !DIGEST.test(source.artifactDigest) ||
    !SEMVER.test(source.release)
  ) {
    throw themeError(
      "Remote theme provenance is invalid.",
      "THEME_REMOTE_PROVENANCE_INVALID",
      undefined,
      5,
    );
  }
  const enrolled = enrolledRegistries.find(({ id }) => id === source.registryId);
  if (
    enrolled === undefined ||
    enrolled.identityDigest !== source.identityDigest ||
    enrolled.release !== source.release ||
    enrolled.manifestDigest !== source.manifestDigest ||
    !enrolled.artifactDigests.includes(source.artifactDigest)
  ) {
    throw themeError(
      "Remote theme input requires a matching enrolled registry identity and artifact digest pin.",
      "THEME_REGISTRY_ENROLLMENT_REQUIRED",
      undefined,
      5,
    );
  }
  if (source.artifactDigest !== sourceDigest) {
    throw themeError(
      "Remote theme bytes do not match the enrolled artifact digest.",
      "THEME_REMOTE_DIGEST_MISMATCH",
      undefined,
      5,
    );
  }
}

function operation(
  target: string,
  owner: string,
  before: Digest | null,
  content: Buffer,
  reason: string,
): OperationPlanFile {
  const after = sha256(content);
  return {
    operation: before === after ? "no-op" : before === null ? "add" : "structured-patch",
    target,
    owner,
    base: before,
    local: before,
    remote: after,
    proposed: after,
    mediaType: "application/json",
    risk: "ordinary",
    reason,
  };
}

function themeTransactionValidators(input: {
  readonly config: MergoraConfig;
  readonly preset: ThemePreset;
  readonly target: string;
  readonly sourceContent: Buffer;
  readonly receiptContent: Buffer;
  readonly sourceDigest: Digest;
  readonly effectiveDigest: Digest;
  readonly accessibilityIssues: readonly ThemeAccessibilityIssue[];
}): readonly TransactionValidator[] {
  const preset = structuredClone(input.preset);
  const expectedConfig = canonicalJson(input.config);
  const expectedIssues = canonicalJson(input.accessibilityIssues);

  const validateTokens = (context: TransactionValidationContext): TransactionValidationResult => {
    const issues: TransactionValidationIssue[] = [];
    const bytes = context.readFile(input.target);
    if (bytes === null) {
      issues.push({
        code: "THEME_TARGET_MISSING",
        target: input.target,
        message: "The active token document is missing.",
      });
    } else {
      try {
        const raw = JSON.parse(bytes.toString("utf8")) as unknown;
        if (!isObject(raw)) throw new Error("theme root is not an object");
        parseDtcg(raw);
        if (
          sha256(bytes) !== sha256(input.sourceContent) ||
          sha256(canonicalJson(raw)) !== input.sourceDigest
        ) {
          issues.push({
            code: "THEME_TOKEN_DIGEST_MISMATCH",
            target: input.target,
            message: "The active token bytes differ from the exact reviewed DTCG document.",
          });
        }
      } catch {
        issues.push({
          code: "THEME_TOKEN_DOCUMENT_INVALID",
          target: input.target,
          message: "The active token document is not valid strict DTCG JSON.",
        });
      }
    }
    return transactionValidationResult(
      `Validated exact DTCG token state in the ${context.phase} view.`,
      `DTCG token validation failed in the ${context.phase} view.`,
      issues,
    );
  };

  const validateAccessibility = (
    context: TransactionValidationContext,
  ): TransactionValidationResult => {
    const issues: TransactionValidationIssue[] = [];
    const targetBytes = context.readFile(input.target);
    const receiptBytes = context.readFile(ACTIVE_THEME_RECEIPT);
    if (targetBytes === null || receiptBytes === null) {
      issues.push({
        code: "THEME_ACCESSIBILITY_EVIDENCE_MISSING",
        target: targetBytes === null ? input.target : ACTIVE_THEME_RECEIPT,
        message: "The reviewed theme document or accessibility receipt is missing.",
      });
    } else {
      try {
        const stagedDocument = JSON.parse(targetBytes.toString("utf8")) as unknown;
        const validation = parsedPreset({
          ...preset,
          document:
            preset.source.kind === "studio-export"
              ? {
                  schemaVersion: 1,
                  format: "mergora-studio-theme-v1",
                  theme: stagedDocument,
                }
              : targetBytes.toString("utf8"),
        });
        const effectiveDigest = sha256(canonicalJson(validation.effective.root));
        if (
          validation.validation.digest !== input.sourceDigest ||
          effectiveDigest !== input.effectiveDigest ||
          canonicalJson(validation.validation.issues) !== expectedIssues ||
          sha256(receiptBytes) !== sha256(input.receiptContent)
        ) {
          issues.push({
            code: "THEME_ACCESSIBILITY_CONTRACT_MISMATCH",
            target: ACTIVE_THEME_RECEIPT,
            message: "Theme accessibility evidence differs from the reviewed lint result.",
          });
        }
      } catch {
        issues.push({
          code: "THEME_ACCESSIBILITY_CONTRACT_INVALID",
          target: ACTIVE_THEME_RECEIPT,
          message: "Theme accessibility evidence cannot be revalidated.",
        });
      }
    }
    return transactionValidationResult(
      `Revalidated theme accessibility evidence in the ${context.phase} view.`,
      `Theme accessibility validation failed in the ${context.phase} view.`,
      issues,
    );
  };

  const validateProject = (context: TransactionValidationContext): TransactionValidationResult => {
    const issues: TransactionValidationIssue[] = [];
    const bytes = context.readFile("mergora.json");
    try {
      const raw = JSON.parse(bytes?.toString("utf8") ?? "null") as unknown;
      const config = validateMergoraConfig(raw);
      if (
        canonicalJson(config) !== expectedConfig ||
        sha256(canonicalJson(raw)) !== context.plan.configDigest
      ) {
        throw new Error("configuration mismatch");
      }
    } catch {
      issues.push({
        code: "THEME_PROJECT_CONFIG_INVALID",
        target: "mergora.json",
        message: "The token target is not bound to the exact reviewed project configuration.",
      });
    }
    return transactionValidationResult(
      `Validated the exact theme project configuration in the ${context.phase} view.`,
      `Theme project configuration validation failed in the ${context.phase} view.`,
      issues,
    );
  };

  return [
    createMediaParseValidator("theme-media-parse", [
      { target: input.target, mediaType: "application/dtcg+json" },
      { target: ACTIVE_THEME_RECEIPT, mediaType: "application/json" },
    ]),
    {
      id: "theme-token-integrity",
      label: "tokens",
      validateStagedOverlay: validateTokens,
      validatePostCommit: validateTokens,
    },
    {
      id: "theme-accessibility-contract",
      label: "accessibility-contract",
      validateStagedOverlay: validateAccessibility,
      validatePostCommit: validateAccessibility,
    },
    {
      id: "theme-project-config",
      label: "project-configured",
      validateStagedOverlay: validateProject,
      validatePostCommit: validateProject,
    },
  ];
}

function buildThemePlan(options: ThemeApplyOptions): InternalThemePlan {
  const root = validatedProjectRoot(options.projectRoot);
  const project = projectConfiguration(root);
  const parsed = parsedPreset(options.preset);
  validateRemoteSource(options.preset, options.enrolledRegistries ?? [], parsed.validation.digest);
  if (options.preset.origin === "official" && parsed.validation.issues.length > 0) {
    throw themeError(
      `Official preset ${options.preset.id} failed accessibility lint: ${parsed.validation.issues.map(({ id }) => id).join(", ")}.`,
      "THEME_OFFICIAL_ACCESSIBILITY_BLOCKED",
      undefined,
      5,
    );
  }
  const target = options.target ?? `${project.config.targets.tokens}/active.tokens.json`;
  assertPortableRelativePath(target, "Theme target");
  if (!target.startsWith(`${project.config.targets.tokens}/`) || !target.endsWith(".json")) {
    throw themeError(
      `Theme target must be a JSON file inside ${project.config.targets.tokens}.`,
      "THEME_TARGET_INVALID",
      target,
      5,
    );
  }
  const sourceContent = Buffer.from(`${parsed.validation.canonicalDocument}\n`);
  const targetBefore = safeRead(root, target, true);
  const targetBeforeDigest = targetBefore === null ? null : sha256(targetBefore);
  const requiredAcknowledgementIds = parsed.validation.issues.map(({ id }) => id).sort(compareText);
  const effectiveDigest = sha256(canonicalJson(parsed.effective.root));
  const receiptContent = Buffer.from(
    `${canonicalJson({
      schemaVersion: 1,
      format: "mergora-active-theme-v1",
      id: options.preset.id,
      label: options.preset.label,
      origin: options.preset.origin,
      source: options.preset.source,
      sourceDigest: parsed.validation.digest,
      effectiveDigest,
      target,
      targetDigest: sha256(sourceContent),
      accessibilityIssueIds: requiredAcknowledgementIds,
      acknowledgedAccessibilityIssueIds:
        options.preset.origin === "custom" ? requiredAcknowledgementIds : [],
    })}\n`,
  );
  const receiptBefore = safeRead(root, ACTIVE_THEME_RECEIPT, true);
  const receiptBeforeDigest = receiptBefore === null ? null : sha256(receiptBefore);
  const owner = `theme:${options.preset.id}`;
  const fileOperations = [
    operation(
      target,
      owner,
      targetBeforeDigest,
      sourceContent,
      "Write canonical DTCG theme bytes.",
    ),
    operation(
      ACTIVE_THEME_RECEIPT,
      owner,
      receiptBeforeDigest,
      receiptContent,
      "Record exact theme provenance and issue-by-issue accessibility acknowledgements.",
    ),
  ].sort((left, right) => compareText(left.target, right.target));
  const mutations: TransactionMutation[] = [
    { target, content: sourceContent, beforeDigest: targetBeforeDigest },
    { target: ACTIVE_THEME_RECEIPT, content: receiptContent, beforeDigest: receiptBeforeDigest },
  ].filter((mutation) => sha256(mutation.content!) !== mutation.beforeDigest);
  const registries: OperationPlan["registries"] =
    options.preset.source.kind === "enrolled-registry"
      ? [
          {
            id: options.preset.source.registryId,
            identityDigest: options.preset.source.identityDigest,
            release: options.preset.source.release,
            manifestDigest: options.preset.source.manifestDigest,
            source: "verified-cache",
            trust: "enrolled",
            evidenceTier: "partial",
          },
        ]
      : [];
  const validators = themeTransactionValidators({
    config: project.config,
    preset: options.preset,
    target,
    sourceContent,
    receiptContent,
    sourceDigest: parsed.validation.digest,
    effectiveDigest,
    accessibilityIssues: parsed.validation.issues,
  });
  const details: ThemePlanDetails = {
    id: options.preset.id,
    label: options.preset.label,
    origin: options.preset.origin,
    source: options.preset.source,
    sourceDigest: parsed.validation.digest,
    effectiveDigest,
    target,
    receipt: ACTIVE_THEME_RECEIPT,
    accessibilityIssues: parsed.validation.issues,
    semanticChanges: parsed.validation.semanticChanges,
    requiredAcknowledgementIds,
  };
  const plan = finalizeOperationPlan({
    schemaVersion: 1,
    command: "theme-apply",
    cliVersion: CLI_VERSION,
    projectRoot: ".",
    configDigest: project.configDigest,
    manifestPreconditionDigest: project.manifestDigest,
    registries,
    items: [],
    fileOperations,
    dependencyChanges: [],
    structuredPatches: [],
    migrations: [],
    contractChanges: [],
    warnings:
      parsed.validation.issues.length === 0
        ? []
        : parsed.validation.issues.map(
            ({ id, detail }) => `${id}: ${detail} Explicit acknowledgement is required.`,
          ),
    consentRequirements: [
      {
        id: "theme-apply",
        flag: "--yes",
        reason: "Theme apply changes committed project token files and its active-theme receipt.",
      },
      ...requiredAcknowledgementIds.map((id) => ({
        id: `theme-accessibility:${id}`,
        flag: `--acknowledge=${id}`,
        reason: `Record explicit acknowledgement for custom accessibility issue ${id}.`,
      })),
    ],
    conflicts: [],
    estimatedBytes: {
      download: 0,
      write: mutations.reduce((total, mutation) => total + mutation.content!.byteLength, 0),
    },
    validationSuite: validationSuiteForTransaction(validators),
    rollbackAvailable: mutations.length > 0,
  });
  const internal = {
    root,
    plan,
    details,
    mutations,
    observedTargets: {
      [target]: targetBeforeDigest,
      [ACTIVE_THEME_RECEIPT]: receiptBeforeDigest,
    },
    validators,
  } satisfies InternalThemePlan;
  validateTransactionOverlay({
    root,
    plan,
    mutations,
    observedTargets: internal.observedTargets,
    validators,
  });
  return internal;
}

export function planThemeApply(options: ThemeApplyOptions): ThemeApplyPlan {
  return buildThemePlan(options).plan;
}

export function planThemeImport(options: ThemeApplyOptions): ThemeApplyPlan {
  if (options.preset.source.kind === "bundled") {
    throw themeError(
      "Theme import requires a file, Studio export, or enrolled registry source.",
      "THEME_IMPORT_SOURCE_INVALID",
    );
  }
  return buildThemePlan(options).plan;
}

function assertAcknowledgements(options: ThemeApplyOptions, details: ThemePlanDetails): void {
  const expected = details.requiredAcknowledgementIds;
  const received = sortedUnique(options.acknowledgedIssueIds ?? []);
  if (expected.length !== received.length || expected.some((id, index) => received[index] !== id)) {
    throw themeError(
      `Custom theme apply requires exactly these issue acknowledgements: ${expected.join(", ") || "none"}.`,
      "THEME_ACCESSIBILITY_ACKNOWLEDGEMENT_REQUIRED",
      undefined,
      5,
    );
  }
}

export function applyTheme(
  options: ThemeApplyOptions,
  expectedPlanDigest: string,
): ThemeApplyResult {
  const built = buildThemePlan(options);
  if (built.plan.planDigest !== expectedPlanDigest) {
    throw themeError(
      "Theme plan changed before apply; review and confirm the fresh digest.",
      "THEME_PLAN_STALE",
      undefined,
      8,
    );
  }
  if (options.preset.origin === "custom") assertAcknowledgements(options, built.details);
  const transaction = executeTransaction({
    root: built.root,
    plan: built.plan,
    mutations: built.mutations,
    acceptedConsents: built.plan.consentRequirements.map(({ id }) => ({
      id,
      planDigest: built.plan.planDigest,
    })),
    observedTargets: built.observedTargets,
    commandArguments: options.commandArguments ?? [],
    validators: built.validators,
  });
  return {
    id: built.details.id,
    target: built.details.target,
    receipt: built.details.receipt,
    planDigest: built.plan.planDigest,
    accessibilityIssues: built.details.accessibilityIssues,
    transaction,
  };
}

export function importTheme(
  options: ThemeApplyOptions,
  expectedPlanDigest: string,
): ThemeApplyResult {
  if (options.preset.source.kind === "bundled") {
    throw themeError(
      "Theme import requires a file, Studio export, or enrolled registry source.",
      "THEME_IMPORT_SOURCE_INVALID",
    );
  }
  return applyTheme(options, expectedPlanDigest);
}
