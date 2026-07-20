import { contrastRatio, parseCssColor } from "../quality-lens-model";

export type StudioDensity = "comfortable" | "compact" | "touch";
export type StudioDirection = "ltr" | "rtl";
export type StudioExportKind = "css" | "design-tool" | "dtcg" | "tailwind" | "typescript";
export type StudioLocale = "ar-EG" | "de-DE" | "en-US" | "he-IL" | "hi-IN" | "ja-JP";
export type StudioMotion = "reduced" | "standard";
export type StudioPreviewState = "default" | "error" | "focus" | "loading";
export type StudioTheme = "dark" | "enhanced" | "light";
export type StudioViewport = "narrow" | "tablet" | "wide";

export interface StudioState {
  readonly acknowledgedWarnings: boolean;
  readonly actionBackground: string;
  readonly actionForeground: string;
  readonly borderWidth: number;
  readonly controlHeight: number;
  readonly density: StudioDensity;
  readonly direction: StudioDirection;
  readonly focusColor: string;
  readonly fontScale: number;
  readonly forcedColorsSimulation: boolean;
  readonly locale: StudioLocale;
  readonly motion: StudioMotion;
  readonly motionDuration: number;
  readonly previewState: StudioPreviewState;
  readonly radius: number;
  readonly spacingScale: number;
  readonly surface: string;
  readonly text: string;
  readonly theme: StudioTheme;
  readonly viewport: StudioViewport;
}

export interface StudioGuardrail {
  readonly affected: readonly string[];
  readonly id: string;
  readonly message: string;
  readonly severity: "error" | "warning";
  readonly tokenPair?: string;
}

export type StudioImportErrorCode =
  | "artifact-mismatch"
  | "checksum"
  | "circular-alias"
  | "empty"
  | "focus-area"
  | "invalid-envelope"
  | "invalid-token"
  | "malformed"
  | "oversized"
  | "unresolved-alias"
  | "unsupported-format"
  | "unsupported-version";

export type StudioImportResult =
  | {
      readonly format: StudioExportKind;
      readonly ok: true;
      readonly state: StudioState;
    }
  | {
      readonly code: StudioImportErrorCode;
      readonly message: string;
      readonly ok: false;
    };

interface StudioExportContext {
  readonly density: StudioDensity;
  readonly direction: StudioDirection;
  readonly forcedColorsSimulation: boolean;
  readonly locale: StudioLocale;
  readonly motion: StudioMotion;
  readonly previewState: StudioPreviewState;
  readonly theme: StudioTheme;
  readonly viewport: StudioViewport;
}

interface StudioExportIntegrityPayload {
  readonly changedTokens: readonly string[];
  readonly compatibleMergora: string;
  readonly context: StudioExportContext;
  readonly exportSchemaVersion: number;
  readonly format: StudioExportKind;
  readonly kind: string;
  readonly state: StudioState;
  readonly stateSchemaVersion: number;
  readonly unresolvedWarnings: readonly string[];
}

interface StudioExportEnvelope extends StudioExportIntegrityPayload {
  readonly checksum: string;
}

export const DEFAULT_STUDIO_STATE: StudioState = {
  acknowledgedWarnings: false,
  actionBackground: "#166534",
  actionForeground: "#ffffff",
  borderWidth: 1,
  controlHeight: 40,
  density: "comfortable",
  direction: "ltr",
  focusColor: "#6d28d9",
  fontScale: 100,
  forcedColorsSimulation: false,
  locale: "en-US",
  motion: "standard",
  motionDuration: 160,
  previewState: "default",
  radius: 8,
  spacingScale: 100,
  surface: "#ffffff",
  text: "#171717",
  theme: "light",
  viewport: "wide",
};

export const STUDIO_KEY = "mergora.studio.state.v2";
export const STUDIO_STORAGE_KEYS = [STUDIO_KEY, "mergora.studio.state.v1"] as const;
export const MAX_STUDIO_SHARE_LENGTH = 4_096;
export const MAX_STUDIO_IMPORT_BYTES = 128 * 1_024;

const STUDIO_EXPORT_KIND = "org.mergora.studio-preset";
const STUDIO_EXPORT_SCHEMA_VERSION = 1;
const STUDIO_STATE_SCHEMA_VERSION = 2;
const STUDIO_COMPATIBILITY = ">=0.0.0 <1.0.0";
const STUDIO_EXPORT_MARKER = "mergora-studio-export.v1";
const STUDIO_FOCUS_INDICATOR_WIDTH = 3;

const stateKeys = [
  "acknowledgedWarnings",
  "actionBackground",
  "actionForeground",
  "borderWidth",
  "controlHeight",
  "density",
  "direction",
  "focusColor",
  "fontScale",
  "forcedColorsSimulation",
  "locale",
  "motion",
  "motionDuration",
  "previewState",
  "radius",
  "spacingScale",
  "surface",
  "text",
  "theme",
  "viewport",
] as const satisfies readonly (keyof StudioState)[];

const contextKeys = [
  "density",
  "direction",
  "forcedColorsSimulation",
  "locale",
  "motion",
  "previewState",
  "theme",
  "viewport",
] as const satisfies readonly (keyof StudioExportContext)[];

const exportEnvelopeKeys = [
  "changedTokens",
  "checksum",
  "compatibleMergora",
  "context",
  "exportSchemaVersion",
  "format",
  "kind",
  "state",
  "stateSchemaVersion",
  "unresolvedWarnings",
] as const satisfies readonly (keyof StudioExportEnvelope)[];

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function exactKeys(value: Record<string, unknown>, keys: readonly string[]): boolean {
  return JSON.stringify(Object.keys(value).sort()) === JSON.stringify([...keys].sort());
}

function isEnum<T extends string>(value: unknown, values: readonly T[]): value is T {
  return typeof value === "string" && values.includes(value as T);
}

function integer(value: unknown, minimum: number, maximum: number): value is number {
  return Number.isSafeInteger(value) && Number(value) >= minimum && Number(value) <= maximum;
}

function safeColor(value: unknown): value is string {
  if (typeof value !== "string" || value.length > 80) return false;
  const parsed = parseCssColor(value);
  return parsed !== null && parsed.alpha === 1;
}

export function validateStudioState(value: unknown): StudioState | null {
  if (!isRecord(value) || !exactKeys(value, stateKeys)) return null;
  if (
    typeof value.acknowledgedWarnings !== "boolean" ||
    !safeColor(value.actionBackground) ||
    !safeColor(value.actionForeground) ||
    !integer(value.borderWidth, 1, 3) ||
    !integer(value.controlHeight, 24, 64) ||
    !isEnum(value.density, ["comfortable", "compact", "touch"]) ||
    !isEnum(value.direction, ["ltr", "rtl"]) ||
    !safeColor(value.focusColor) ||
    !integer(value.fontScale, 80, 150) ||
    typeof value.forcedColorsSimulation !== "boolean" ||
    !isEnum(value.locale, ["ar-EG", "de-DE", "en-US", "he-IL", "hi-IN", "ja-JP"]) ||
    !isEnum(value.motion, ["reduced", "standard"]) ||
    !integer(value.motionDuration, 0, 1_000) ||
    !isEnum(value.previewState, ["default", "error", "focus", "loading"]) ||
    !integer(value.radius, 0, 16) ||
    !integer(value.spacingScale, 75, 150) ||
    !safeColor(value.surface) ||
    !safeColor(value.text) ||
    !isEnum(value.theme, ["dark", "enhanced", "light"]) ||
    !isEnum(value.viewport, ["narrow", "tablet", "wide"])
  ) {
    return null;
  }
  return Object.fromEntries(stateKeys.map((key) => [key, value[key]])) as unknown as StudioState;
}

export function migrateStudioState(value: unknown): StudioState | null {
  const current = validateStudioState(value);
  if (current !== null) return current;
  if (!isRecord(value)) return null;
  if (
    !exactKeys(value, ["density", "motion", "radius", "schemaVersion", "theme"]) ||
    value.schemaVersion !== 1 ||
    !isEnum(value.density, ["comfortable", "compact", "touch"]) ||
    !isEnum(value.motion, ["reduced", "standard"]) ||
    !integer(value.radius, 0, 16) ||
    !isEnum(value.theme, ["dark", "enhanced", "light"])
  ) {
    return null;
  }
  return {
    ...DEFAULT_STUDIO_STATE,
    density: value.density,
    motion: value.motion,
    radius: value.radius,
    theme: value.theme,
  };
}

export function canonicalStudioState(state: StudioState): string {
  return JSON.stringify({
    schemaVersion: STUDIO_STATE_SCHEMA_VERSION,
    state: Object.fromEntries(stateKeys.map((key) => [key, state[key]])),
  });
}

export function studioChecksum(value: string): string {
  let hash = 0x811c9dc5;
  for (const character of value) {
    hash ^= character.codePointAt(0)!;
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}

function encode(value: string): string {
  return btoa(value).replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", "");
}

function decode(value: string): string {
  const base64 = value.replaceAll("-", "+").replaceAll("_", "/");
  return atob(base64.padEnd(Math.ceil(base64.length / 4) * 4, "="));
}

export function studioShareFragment(state: StudioState): string | null {
  const value = canonicalStudioState(state);
  const fragment = `#studio.v2.${encode(value)}.${studioChecksum(value)}`;
  return fragment.length <= MAX_STUDIO_SHARE_LENGTH ? fragment : null;
}

export function parseStudioShareFragment(fragment: string): StudioState | null {
  if (fragment.startsWith("#v1.") && fragment.length <= MAX_STUDIO_SHARE_LENGTH) {
    const [, payload, expected] = fragment.split(".");
    if (payload === undefined || expected === undefined || !/^[0-9a-f]{8}$/u.test(expected)) {
      return null;
    }
    try {
      const decoded = decode(payload);
      return studioChecksum(decoded) === expected
        ? migrateStudioState(JSON.parse(decoded) as unknown)
        : null;
    } catch {
      return null;
    }
  }
  if (
    fragment.length === 0 ||
    fragment.length > MAX_STUDIO_SHARE_LENGTH ||
    !fragment.startsWith("#studio.v2.")
  ) {
    return null;
  }
  const parts = fragment.split(".");
  const payload = parts[2];
  const expected = parts[3];
  if (
    parts.length !== 4 ||
    payload === undefined ||
    expected === undefined ||
    !/^[0-9a-f]{8}$/u.test(expected)
  ) {
    return null;
  }
  try {
    const decoded = decode(payload);
    if (studioChecksum(decoded) !== expected) return null;
    const parsed = JSON.parse(decoded) as unknown;
    if (!isRecord(parsed) || parsed.schemaVersion !== STUDIO_STATE_SCHEMA_VERSION) return null;
    return validateStudioState(parsed.state);
  } catch {
    return null;
  }
}

export function changedStudioTokens(state: StudioState): readonly string[] {
  return stateKeys.filter((key) => state[key] !== DEFAULT_STUDIO_STATE[key]);
}

function ratio(foreground: string, background: string): number | null {
  const foregroundColor = parseCssColor(foreground);
  const backgroundColor = parseCssColor(background);
  return foregroundColor === null || backgroundColor === null
    ? null
    : contrastRatio(foregroundColor, backgroundColor);
}

export function studioGuardrails(state: StudioState): readonly StudioGuardrail[] {
  const findings: StudioGuardrail[] = [];
  const pairs = [
    {
      affected: ["Button"],
      background: state.actionBackground,
      foreground: state.actionForeground,
      id: "action-contrast",
      minimum: 4.5,
      tokenPair: "actionForeground / actionBackground",
    },
    {
      affected: ["Field", "Link", "Data Grid", "Dialog"],
      background: state.surface,
      foreground: state.text,
      id: "surface-text-contrast",
      minimum: 4.5,
      tokenPair: "text / surface",
    },
    {
      affected: ["All focusable components"],
      background: state.surface,
      foreground: state.focusColor,
      id: "focus-indicator-contrast",
      minimum: 3,
      tokenPair: "focusColor / surface",
    },
  ] as const;
  for (const pair of pairs) {
    const measured = ratio(pair.foreground, pair.background);
    if (measured === null || measured < pair.minimum) {
      findings.push({
        affected: pair.affected,
        id: pair.id,
        message:
          measured === null
            ? "The color pair could not be measured. Use an opaque supported CSS color."
            : `${measured.toFixed(2)}:1 is below the ${pair.minimum.toFixed(1)}:1 threshold; increase lightness separation.`,
        severity: "error",
        tokenPair: pair.tokenPair,
      });
    }
  }
  const densityGoal = state.density === "touch" ? 44 : state.density === "compact" ? 32 : 40;
  if (state.controlHeight < densityGoal) {
    findings.push({
      affected: ["All interactive controls"],
      id: "density-target",
      message: `${String(state.controlHeight)}px is below the ${String(densityGoal)}px ${state.density} density goal.`,
      severity: "warning",
      tokenPair: "controlHeight / density",
    });
  }
  const contentHeight = Math.ceil(
    16 * (state.fontScale / 100) * 1.25 + 12 * (state.spacingScale / 100),
  );
  if (state.controlHeight < contentHeight) {
    findings.push({
      affected: ["Field", "Button", "Select"],
      id: "control-content-fit",
      message: `${String(state.controlHeight)}px cannot safely contain the prepared ${String(state.fontScale)}% type and ${String(state.spacingScale)}% spacing scales; use at least ${String(contentHeight)}px.`,
      severity: "warning",
      tokenPair: "controlHeight / fontScale / spacingScale",
    });
  }
  if (state.radius * 2 > state.controlHeight) {
    findings.push({
      affected: ["Field", "Button", "Select"],
      id: "control-radius-fit",
      message:
        "The radius is larger than half the control height and can obscure compact control geometry.",
      severity: "warning",
      tokenPair: "radius / controlHeight",
    });
  }
  if (state.motion === "reduced" && state.motionDuration > 50) {
    findings.push({
      affected: ["Dialog", "Toast", "Progress", "Selection"],
      id: "reduced-motion-duration",
      message: `${String(state.motionDuration)}ms remains spatially significant in reduced mode; provide an instant or short opacity substitute.`,
      severity: "warning",
      tokenPair: "motionDuration / motion",
    });
  }
  if (state.spacingScale < 90 || state.fontScale > 130) {
    findings.push({
      affected: ["Field", "Dialog", "Data Grid", "Table"],
      id: "prepared-matrix-clipping",
      message: "This font/spacing combination needs the prepared clipping and 320px reflow lane.",
      severity: "warning",
      tokenPair: "fontScale / spacingScale",
    });
  }
  return findings;
}

function studioContext(state: StudioState): StudioExportContext {
  return Object.fromEntries(
    contextKeys.map((key) => [key, state[key]]),
  ) as unknown as StudioExportContext;
}

function exportIntegrityPayload(
  kind: StudioExportKind,
  state: StudioState,
): StudioExportIntegrityPayload {
  return {
    changedTokens: changedStudioTokens(state),
    compatibleMergora: STUDIO_COMPATIBILITY,
    context: studioContext(state),
    exportSchemaVersion: STUDIO_EXPORT_SCHEMA_VERSION,
    format: kind,
    kind: STUDIO_EXPORT_KIND,
    state: validateStudioState(state)!,
    stateSchemaVersion: STUDIO_STATE_SCHEMA_VERSION,
    unresolvedWarnings: studioGuardrails(state)
      .filter(({ severity }) => severity === "warning")
      .map(({ id }) => id),
  };
}

function exportEnvelope(kind: StudioExportKind, state: StudioState): StudioExportEnvelope {
  const integrity = exportIntegrityPayload(kind, state);
  return { ...integrity, checksum: studioChecksum(JSON.stringify(integrity)) };
}

function studioVariables(state: StudioState): Readonly<Record<string, string>> {
  return {
    "--mrg-semantic-border-width": `${String(state.borderWidth)}px`,
    "--mrg-semantic-color-action-background": state.actionBackground,
    "--mrg-semantic-color-action-foreground": state.actionForeground,
    "--mrg-semantic-color-background-surface": state.surface,
    "--mrg-semantic-color-focus-ring": state.focusColor,
    "--mrg-semantic-color-foreground-primary": state.text,
    "--mrg-semantic-control-height": `${String(state.controlHeight)}px`,
    "--mrg-semantic-focus-indicator-width": `${String(STUDIO_FOCUS_INDICATOR_WIDTH)}px`,
    "--mrg-semantic-font-scale": String(state.fontScale / 100),
    "--mrg-semantic-motion-duration": `${String(state.motionDuration)}ms`,
    "--mrg-semantic-radius-surface": `${String(state.radius)}px`,
    "--mrg-semantic-spacing-scale": String(state.spacingScale / 100),
    "--mrg-studio-context-density": state.density,
    "--mrg-studio-context-direction": state.direction,
    "--mrg-studio-context-forced-colors-simulation": String(state.forcedColorsSimulation),
    "--mrg-studio-context-locale": `"${state.locale}"`,
    "--mrg-studio-context-motion": state.motion,
    "--mrg-studio-context-preview-state": state.previewState,
    "--mrg-studio-context-theme": state.theme,
    "--mrg-studio-context-viewport": state.viewport,
    "--mrg-studio-warnings-acknowledged": String(state.acknowledgedWarnings),
  };
}

function dtcgColor(value: string) {
  const color = parseCssColor(value)!;
  return {
    alpha: 1,
    colorSpace: "srgb",
    components: [color.red, color.green, color.blue].map((component) =>
      Number(component.toFixed(6)),
    ),
  };
}

function dtcgProjection(kind: "design-tool" | "dtcg", state: StudioState) {
  const projection = {
    $schema: "https://www.designtokens.org/schemas/2025.10/format.json",
    $extensions: { "org.mergora.studio": exportEnvelope(kind, state) },
    semantic: {
      border: {
        width: { $type: "dimension", $value: { unit: "px", value: state.borderWidth } },
      },
      color: {
        action: {
          background: { $type: "color", $value: dtcgColor(state.actionBackground) },
          foreground: { $type: "color", $value: dtcgColor(state.actionForeground) },
        },
        background: { surface: { $type: "color", $value: dtcgColor(state.surface) } },
        focus: { ring: { $type: "color", $value: dtcgColor(state.focusColor) } },
        foreground: { primary: { $type: "color", $value: dtcgColor(state.text) } },
      },
      control: {
        height: { $type: "dimension", $value: { unit: "px", value: state.controlHeight } },
      },
      focus: {
        indicatorWidth: {
          $description: "Fixed Mergora focus geometry; at least a two-pixel perimeter equivalent.",
          $type: "dimension",
          $value: { unit: "px", value: STUDIO_FOCUS_INDICATOR_WIDTH },
        },
      },
      motion: {
        duration: { $type: "duration", $value: { unit: "ms", value: state.motionDuration } },
      },
      radius: {
        surface: { $type: "dimension", $value: { unit: "px", value: state.radius } },
      },
      scale: {
        font: { $type: "number", $value: state.fontScale / 100 },
        spacing: { $type: "number", $value: state.spacingScale / 100 },
      },
    },
  };
  return kind === "design-tool"
    ? {
        $description:
          "Mergora DTCG interchange. Preserve org.mergora.studio metadata to round-trip Studio context.",
        ...projection,
      }
    : projection;
}

export function studioExportValue(kind: StudioExportKind, state: StudioState): string {
  const checkedState = validateStudioState(state);
  if (checkedState === null) throw new TypeError("Studio export requires a complete valid state.");
  if (kind === "dtcg" || kind === "design-tool") {
    return JSON.stringify(dtcgProjection(kind, checkedState), null, 2);
  }
  const envelope = exportEnvelope(kind, checkedState);
  const marker = `/* ${STUDIO_EXPORT_MARKER}.${encode(JSON.stringify(envelope))} */`;
  const readableMetadata = `/* Mergora Studio metadata ${JSON.stringify(envelope)} */`;
  const variables = studioVariables(checkedState);
  if (kind === "css") {
    return `${marker}\n${readableMetadata}\n:root {\n${Object.entries(variables)
      .map(([name, value]) => `  ${name}: ${value};`)
      .join("\n")}\n}`;
  }
  if (kind === "tailwind") {
    return `${marker}\n${readableMetadata}\n@theme inline {\n${Object.entries(variables)
      .map(([name, value]) => `  ${name}: ${value};`)
      .join("\n")}\n}`;
  }
  return `${marker}\n${readableMetadata}\nexport const mergoraStudioPreset = ${JSON.stringify(
    { metadata: envelope, tokens: variables },
    null,
    2,
  )} as const;`;
}

function failure(code: StudioImportErrorCode, message: string): StudioImportResult {
  return { code, message, ok: false };
}

function sameStrings(value: unknown, expected: readonly string[]): boolean {
  return (
    Array.isArray(value) &&
    value.every((item) => typeof item === "string") &&
    JSON.stringify(value) === JSON.stringify(expected)
  );
}

function validateExportEnvelope(value: unknown): StudioImportResult | StudioExportEnvelope {
  if (!isRecord(value) || !exactKeys(value, exportEnvelopeKeys)) {
    return failure(
      "invalid-envelope",
      "The Mergora metadata envelope is incomplete or contains unknown fields.",
    );
  }
  if (value.exportSchemaVersion !== STUDIO_EXPORT_SCHEMA_VERSION) {
    return failure(
      "unsupported-version",
      `This Studio supports export schema v${String(STUDIO_EXPORT_SCHEMA_VERSION)} only.`,
    );
  }
  if (value.stateSchemaVersion !== STUDIO_STATE_SCHEMA_VERSION) {
    return failure(
      "unsupported-version",
      `This export uses unsupported Studio state schema v${String(value.stateSchemaVersion)}.`,
    );
  }
  if (
    value.kind !== STUDIO_EXPORT_KIND ||
    value.compatibleMergora !== STUDIO_COMPATIBILITY ||
    !isEnum(value.format, ["css", "design-tool", "dtcg", "tailwind", "typescript"]) ||
    typeof value.checksum !== "string" ||
    !/^[0-9a-f]{8}$/u.test(value.checksum)
  ) {
    return failure(
      "invalid-envelope",
      "The Mergora export identity or compatibility data is invalid.",
    );
  }
  const state = validateStudioState(value.state);
  if (state === null) {
    return failure(
      "invalid-envelope",
      "The export does not contain one complete bounded Studio state.",
    );
  }
  if (!isRecord(value.context) || !exactKeys(value.context, contextKeys)) {
    return failure(
      "invalid-envelope",
      "The export context is incomplete or contains unknown fields.",
    );
  }
  const expected = exportIntegrityPayload(value.format, state);
  if (
    stableJson(value.context) !== stableJson(expected.context) ||
    !sameStrings(value.changedTokens, expected.changedTokens) ||
    !sameStrings(value.unresolvedWarnings, expected.unresolvedWarnings)
  ) {
    return failure(
      "invalid-envelope",
      "Context, changed-token, or warning metadata disagrees with the included Studio state.",
    );
  }
  if (studioChecksum(JSON.stringify(expected)) !== value.checksum) {
    return failure("checksum", "The Studio export checksum does not match its canonical state.");
  }
  return { ...expected, checksum: value.checksum };
}

interface DtcgToken {
  readonly path: string;
  readonly value: unknown;
}

function collectDtcgTokens(value: unknown): readonly DtcgToken[] {
  const tokens: DtcgToken[] = [];
  const visit = (node: unknown, path: readonly string[]) => {
    if (!isRecord(node)) return;
    if ("$value" in node) {
      tokens.push({ path: path.join("."), value: node.$value });
      return;
    }
    for (const [key, child] of Object.entries(node)) {
      if (!key.startsWith("$")) visit(child, [...path, key]);
    }
  };
  visit(value, []);
  return tokens;
}

function dtcgAliasFailure(value: unknown): StudioImportResult | null {
  const tokens = collectDtcgTokens(value);
  const byPath = new Map(tokens.map((token) => [token.path, token]));
  const aliasTarget = (tokenValue: unknown) =>
    typeof tokenValue === "string" ? /^\{([^{}]+)\}$/u.exec(tokenValue)?.[1] : undefined;
  const resolved = new Set<string>();
  const visiting = new Set<string>();
  const visit = (path: string): StudioImportResult | null => {
    if (resolved.has(path)) return null;
    if (visiting.has(path)) {
      return failure("circular-alias", `The DTCG token alias cycle reaches ${path}.`);
    }
    const token = byPath.get(path);
    if (token === undefined) {
      return failure("unresolved-alias", `The DTCG token alias ${path} cannot be resolved.`);
    }
    const target = aliasTarget(token.value);
    if (target !== undefined) {
      visiting.add(path);
      const nested = visit(target);
      visiting.delete(path);
      if (nested !== null) return nested;
    }
    resolved.add(path);
    return null;
  };
  for (const token of tokens) {
    const result = visit(token.path);
    if (result !== null) return result;
  }
  return null;
}

function valueAt(value: unknown, path: readonly string[]): unknown {
  let current = value;
  for (const segment of path) {
    if (!isRecord(current)) return undefined;
    current = current[segment];
  }
  return current;
}

function validateDtcgGeometry(value: unknown): StudioImportResult | null {
  const colorPaths = [
    ["semantic", "color", "action", "background"],
    ["semantic", "color", "action", "foreground"],
    ["semantic", "color", "background", "surface"],
    ["semantic", "color", "focus", "ring"],
    ["semantic", "color", "foreground", "primary"],
  ] as const;
  for (const path of colorPaths) {
    const token = valueAt(value, path);
    const color = isRecord(token) ? token.$value : undefined;
    const components = isRecord(color) ? color.components : undefined;
    if (
      !isRecord(token) ||
      token.$type !== "color" ||
      !isRecord(color) ||
      color.colorSpace !== "srgb" ||
      color.alpha !== 1 ||
      !Array.isArray(components) ||
      components.length !== 3 ||
      !components.every(
        (component) =>
          typeof component === "number" &&
          Number.isFinite(component) &&
          component >= 0 &&
          component <= 1,
      )
    ) {
      return failure(
        "invalid-token",
        `${path.join(".")} must be one resolved opaque DTCG sRGB color.`,
      );
    }
  }
  const dimensionPaths = [
    { maximum: 3, minimum: 1, path: ["semantic", "border", "width"] },
    { maximum: 64, minimum: 24, path: ["semantic", "control", "height"] },
    { maximum: 16, minimum: 0, path: ["semantic", "radius", "surface"] },
  ] as const;
  for (const { maximum, minimum, path } of dimensionPaths) {
    const token = valueAt(value, path);
    const dimension = isRecord(token) ? token.$value : undefined;
    if (
      !isRecord(token) ||
      token.$type !== "dimension" ||
      !isRecord(dimension) ||
      dimension.unit !== "px" ||
      typeof dimension.value !== "number" ||
      !Number.isFinite(dimension.value) ||
      dimension.value < minimum ||
      dimension.value > maximum
    ) {
      return failure(
        "invalid-token",
        `${path.join(".")} must be a ${String(minimum)}–${String(maximum)}px DTCG dimension.`,
      );
    }
  }
  const focusToken = valueAt(value, ["semantic", "focus", "indicatorWidth"]);
  const focusWidth = isRecord(focusToken) ? focusToken.$value : undefined;
  if (
    !isRecord(focusToken) ||
    focusToken.$type !== "dimension" ||
    !isRecord(focusWidth) ||
    focusWidth.unit !== "px" ||
    typeof focusWidth.value !== "number" ||
    !Number.isFinite(focusWidth.value) ||
    focusWidth.value > 8
  ) {
    return failure(
      "invalid-token",
      "semantic.focus.indicatorWidth must be a finite 2–8px DTCG dimension.",
    );
  }
  if (focusWidth.value < 2) {
    return failure(
      "focus-area",
      "The focus indicator is narrower than the two-pixel perimeter-equivalent guardrail.",
    );
  }
  const durationToken = valueAt(value, ["semantic", "motion", "duration"]);
  const duration = isRecord(durationToken) ? durationToken.$value : undefined;
  if (
    !isRecord(durationToken) ||
    durationToken.$type !== "duration" ||
    !isRecord(duration) ||
    duration.unit !== "ms" ||
    typeof duration.value !== "number" ||
    !Number.isFinite(duration.value) ||
    duration.value < 0 ||
    duration.value > 1_000
  ) {
    return failure(
      "invalid-token",
      "semantic.motion.duration must be a finite 0–1000ms DTCG duration.",
    );
  }
  const scalePaths = [
    { maximum: 1.5, minimum: 0.8, path: ["semantic", "scale", "font"] },
    { maximum: 1.5, minimum: 0.75, path: ["semantic", "scale", "spacing"] },
  ] as const;
  for (const { maximum, minimum, path } of scalePaths) {
    const token = valueAt(value, path);
    if (
      !isRecord(token) ||
      token.$type !== "number" ||
      typeof token.$value !== "number" ||
      !Number.isFinite(token.$value) ||
      token.$value < minimum ||
      token.$value > maximum
    ) {
      return failure(
        "invalid-token",
        `${path.join(".")} must be a finite DTCG number from ${String(minimum)} to ${String(maximum)}.`,
      );
    }
  }
  return null;
}

function stableJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  if (isRecord(value)) {
    return `{${Object.keys(value)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${stableJson(value[key])}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
}

function importJsonArtifact(source: string): StudioImportResult {
  let parsed: unknown;
  try {
    parsed = JSON.parse(source) as unknown;
  } catch {
    return failure("malformed", "The pasted JSON is malformed and was not applied.");
  }
  const rawEnvelope = valueAt(parsed, ["$extensions", "org.mergora.studio"]);
  if (rawEnvelope === undefined) {
    return failure(
      "unsupported-format",
      "This is not a supported Mergora DTCG export; org.mergora.studio metadata is missing.",
    );
  }
  const checked = validateExportEnvelope(rawEnvelope);
  if ("ok" in checked) return checked;
  if (checked.format !== "dtcg" && checked.format !== "design-tool") {
    return failure(
      "artifact-mismatch",
      "JSON content cannot claim a CSS, Tailwind, or TypeScript format.",
    );
  }
  const aliasFailure = dtcgAliasFailure(parsed);
  if (aliasFailure !== null) return aliasFailure;
  const geometryFailure = validateDtcgGeometry(parsed);
  if (geometryFailure !== null) return geometryFailure;
  const expected = JSON.parse(studioExportValue(checked.format, checked.state)) as unknown;
  if (stableJson(parsed) !== stableJson(expected)) {
    return failure(
      "artifact-mismatch",
      "The DTCG tokens do not match the checksummed Studio state; nothing was applied.",
    );
  }
  return { format: checked.format, ok: true, state: checked.state };
}

function importCommentArtifact(source: string): StudioImportResult {
  const match = /^\/\* mergora-studio-export\.v1\.([A-Za-z0-9_-]+) \*\//u.exec(source);
  if (match?.[1] === undefined) {
    return failure(
      "unsupported-format",
      "This is not a supported Mergora CSS, Tailwind, or TypeScript export.",
    );
  }
  let rawEnvelope: unknown;
  try {
    rawEnvelope = JSON.parse(decode(match[1])) as unknown;
  } catch {
    return failure("malformed", "The encoded Mergora export metadata is malformed.");
  }
  const checked = validateExportEnvelope(rawEnvelope);
  if ("ok" in checked) return checked;
  if (checked.format === "dtcg" || checked.format === "design-tool") {
    return failure("artifact-mismatch", "Comment-wrapped content cannot claim a JSON DTCG format.");
  }
  const expected = studioExportValue(checked.format, checked.state).replaceAll("\r\n", "\n");
  if (source.replaceAll("\r\n", "\n") !== expected) {
    return failure(
      "artifact-mismatch",
      "The export body does not match its checksummed Studio state; nothing was applied.",
    );
  }
  return { format: checked.format, ok: true, state: checked.state };
}

export function parseStudioImport(value: string): StudioImportResult {
  if (new TextEncoder().encode(value).byteLength > MAX_STUDIO_IMPORT_BYTES) {
    return failure(
      "oversized",
      `Studio imports are limited to ${String(MAX_STUDIO_IMPORT_BYTES / 1_024)} KiB.`,
    );
  }
  const source = value.trim();
  if (source === "") return failure("empty", "Paste or choose a Mergora Studio export first.");
  return source.startsWith("{") ? importJsonArtifact(source) : importCommentArtifact(source);
}

export function clearStudioLocalData(storage: Pick<Storage, "removeItem">): void {
  for (const key of STUDIO_STORAGE_KEYS) storage.removeItem(key);
}
