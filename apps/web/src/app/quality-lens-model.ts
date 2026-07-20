export const QUALITY_LENS_MODES = [
  "focus-order",
  "accessible-names",
  "semantics",
  "target-size",
  "contrast",
  "reflow-bounds",
  "motion",
  "dynamic-state",
] as const;

export type QualityLensMode = (typeof QUALITY_LENS_MODES)[number];
export type QualityLensStatus = "Fail" | "Manual check" | "Not measurable" | "Pass" | "Warning";

export interface QualityLensFinding {
  readonly detail: string;
  readonly id: string;
  readonly label: string;
  readonly mode: QualityLensMode;
  readonly status: QualityLensStatus;
  readonly target: string;
}

export interface RgbColor {
  readonly alpha: number;
  readonly blue: number;
  readonly green: number;
  readonly red: number;
}

function clamp(value: number, minimum = 0, maximum = 1): number {
  return Math.min(maximum, Math.max(minimum, value));
}

function linearToSrgb(value: number): number {
  return value <= 0.0031308 ? 12.92 * value : 1.055 * value ** (1 / 2.4) - 0.055;
}

function parseAlpha(value: string | undefined): number {
  if (value === undefined) return 1;
  const normalized = value.trim();
  return clamp(
    normalized.endsWith("%") ? Number.parseFloat(normalized) / 100 : Number.parseFloat(normalized),
  );
}

function parseRgbChannel(value: string): number {
  const normalized = value.trim();
  return clamp(
    normalized.endsWith("%")
      ? Number.parseFloat(normalized) / 100
      : Number.parseFloat(normalized) / 255,
  );
}

export function parseCssColor(value: string): RgbColor | null {
  const normalized = value.trim().toLocaleLowerCase();
  if (normalized === "transparent") return { alpha: 0, blue: 0, green: 0, red: 0 };
  const hex = normalized.match(/^#([0-9a-f]{3,4}|[0-9a-f]{6}|[0-9a-f]{8})$/u)?.[1];
  if (hex !== undefined) {
    const expanded =
      hex.length <= 4 ? [...hex].map((character) => `${character}${character}`).join("") : hex;
    const channels = expanded.match(/.{2}/gu)?.map((channel) => Number.parseInt(channel, 16));
    if (channels === undefined || channels.length < 3) return null;
    return {
      alpha: (channels[3] ?? 255) / 255,
      blue: channels[2]! / 255,
      green: channels[1]! / 255,
      red: channels[0]! / 255,
    };
  }
  const rgb = normalized.match(
    /^rgba?\(\s*([^\s,/]+)[\s,]+([^\s,/]+)[\s,]+([^\s,/]+)(?:\s*[,/]\s*([^\s)]+))?\s*\)$/u,
  );
  if (rgb !== null) {
    const [, red, green, blue, alpha] = rgb;
    if (red === undefined || green === undefined || blue === undefined) return null;
    const parsed = {
      alpha: parseAlpha(alpha),
      blue: parseRgbChannel(blue),
      green: parseRgbChannel(green),
      red: parseRgbChannel(red),
    };
    return Object.values(parsed).every(Number.isFinite) ? parsed : null;
  }
  const oklch = normalized.match(
    /^oklch\(\s*([^\s/]+)\s+([^\s/]+)\s+([^\s/]+)(?:\s*\/\s*([^\s)]+))?\s*\)$/u,
  );
  if (oklch === null) return null;
  const [, lightnessValue, chromaValue, hueValue, alphaValue] = oklch;
  if (lightnessValue === undefined || chromaValue === undefined || hueValue === undefined) {
    return null;
  }
  const lightness = lightnessValue.endsWith("%")
    ? Number.parseFloat(lightnessValue) / 100
    : Number.parseFloat(lightnessValue);
  const chroma = Number.parseFloat(chromaValue);
  const hue = (Number.parseFloat(hueValue) * Math.PI) / 180;
  if (![lightness, chroma, hue].every(Number.isFinite)) return null;
  const a = chroma * Math.cos(hue);
  const b = chroma * Math.sin(hue);
  const lRoot = lightness + 0.3963377774 * a + 0.2158037573 * b;
  const mRoot = lightness - 0.1055613458 * a - 0.0638541728 * b;
  const sRoot = lightness - 0.0894841775 * a - 1.291485548 * b;
  const l = lRoot ** 3;
  const m = mRoot ** 3;
  const s = sRoot ** 3;
  return {
    alpha: parseAlpha(alphaValue),
    blue: clamp(linearToSrgb(-0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s)),
    green: clamp(linearToSrgb(-1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s)),
    red: clamp(linearToSrgb(4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s)),
  };
}

export function compositeColor(foreground: RgbColor, background: RgbColor): RgbColor {
  const alpha = foreground.alpha + background.alpha * (1 - foreground.alpha);
  if (alpha === 0) return { alpha: 0, blue: 0, green: 0, red: 0 };
  const composite = (front: number, back: number) =>
    (front * foreground.alpha + back * background.alpha * (1 - foreground.alpha)) / alpha;
  return {
    alpha,
    blue: composite(foreground.blue, background.blue),
    green: composite(foreground.green, background.green),
    red: composite(foreground.red, background.red),
  };
}

function srgbToLinear(value: number): number {
  return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
}

export function relativeLuminance(color: RgbColor): number {
  return (
    0.2126 * srgbToLinear(color.red) +
    0.7152 * srgbToLinear(color.green) +
    0.0722 * srgbToLinear(color.blue)
  );
}

export function contrastRatio(foreground: RgbColor, background: RgbColor): number {
  const foregroundLuminance = relativeLuminance(compositeColor(foreground, background));
  const backgroundLuminance = relativeLuminance(background);
  const light = Math.max(foregroundLuminance, backgroundLuminance);
  const dark = Math.min(foregroundLuminance, backgroundLuminance);
  return (light + 0.05) / (dark + 0.05);
}

export function parseQualityLensModes(value: string | null): {
  readonly invalid: readonly string[];
  readonly modes: readonly QualityLensMode[];
} {
  if (value === null || value.trim() === "") return { invalid: [], modes: ["focus-order"] };
  const requested = [...new Set(value.split(",").filter((mode) => mode.length > 0))];
  const modes = requested.filter((mode): mode is QualityLensMode =>
    QUALITY_LENS_MODES.includes(mode as QualityLensMode),
  );
  const invalid = requested.filter((mode) => !QUALITY_LENS_MODES.includes(mode as QualityLensMode));
  return { invalid, modes: modes.length === 0 ? ["focus-order"] : modes };
}
