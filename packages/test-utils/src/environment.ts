import { HarnessConfigurationError, requireRuntimeAdapter } from "./runtime-capability.js";
import { compareText, isCatalogId, issue, validationResult } from "./validation.js";
import type { ValidationIssue, ValidationResult } from "./validation.js";

export const DIRECTIONS = ["ltr", "rtl"] as const;
export type Direction = (typeof DIRECTIONS)[number];

export const REQUIRED_LOCALES = [
  "en-US",
  "de-DE",
  "ar-EG",
  "he-IL",
  "ja-JP",
  "hi-IN",
  "en-XA",
  "ar-XB",
] as const;
export type RequiredLocale = (typeof REQUIRED_LOCALES)[number];

export const THEMES = ["light", "dark", "enhanced-contrast", "forced-colors"] as const;
export type Theme = (typeof THEMES)[number];

export const DENSITIES = ["comfortable", "compact", "touch"] as const;
export type Density = (typeof DENSITIES)[number];

export const MOTION_PREFERENCES = ["no-preference", "reduce"] as const;
export type MotionPreference = (typeof MOTION_PREFERENCES)[number];

export interface ViewportPreset {
  readonly id: string;
  readonly width: number;
  readonly height: number;
}

export const VIEWPORT_PRESETS = [
  { id: "mobile-compact", width: 320, height: 568 },
  { id: "mobile-tall", width: 360, height: 800 },
  { id: "mobile-wide", width: 390, height: 844 },
  { id: "tablet-portrait", width: 768, height: 1024 },
  { id: "tablet-landscape", width: 1024, height: 768 },
  { id: "desktop-short", width: 1280, height: 256 },
  { id: "desktop-compact", width: 1280, height: 800 },
  { id: "desktop-wide", width: 1440, height: 900 },
] as const satisfies readonly ViewportPreset[];

export const CONTAINER_WIDTHS = [240, 320, 480, 768] as const;

export interface StoryEnvironment {
  readonly id: string;
  readonly locale: string;
  readonly direction: Direction;
  readonly theme: Theme;
  readonly density: Density;
  readonly motion: MotionPreference;
  readonly viewport: ViewportPreset;
  readonly containerWidth?: number;
  readonly zoomPercent: number;
  readonly textScalePercent: number;
  readonly textSpacing: "normal" | "wcag-override";
}

export interface StoryEnvironmentAdapter {
  apply(
    environment: StoryEnvironment,
  ): void | (() => void | Promise<void>) | Promise<void | (() => void | Promise<void>)>;
}

export interface StoryEnvironmentAxes {
  readonly locales: readonly string[];
  readonly directions: readonly Direction[];
  readonly themes: readonly Theme[];
  readonly densities: readonly Density[];
  readonly motions: readonly MotionPreference[];
  readonly viewports: readonly ViewportPreset[];
  readonly containerWidths: readonly (number | undefined)[];
  readonly zoomPercents: readonly number[];
  readonly textScalePercents: readonly number[];
  readonly textSpacings: readonly StoryEnvironment["textSpacing"][];
}

const bcp47Pattern = /^[a-z]{2,3}(?:-[A-Z][a-z]{3})?(?:-[A-Z]{2}|-[0-9]{3})?$/;

function includesValue<T extends string>(values: readonly T[], value: string): value is T {
  return (values as readonly string[]).includes(value);
}

export function environmentKey(environment: StoryEnvironment): string {
  const container =
    environment.containerWidth === undefined ? "viewport" : `c${environment.containerWidth}`;
  return [
    environment.locale.toLowerCase(),
    environment.direction,
    environment.theme,
    environment.density,
    environment.motion,
    `${environment.viewport.width}x${environment.viewport.height}`,
    container,
    `zoom${environment.zoomPercent}`,
    `text${environment.textScalePercent}`,
    environment.textSpacing,
  ].join("-");
}

export function validateStoryEnvironment(
  environment: StoryEnvironment,
): ValidationResult<StoryEnvironment> {
  const issues: ValidationIssue[] = [];

  if (!isCatalogId(environment.id)) {
    issues.push(issue("environment.invalid-id", "id", "Environment id must be a catalog id."));
  }

  if (!bcp47Pattern.test(environment.locale)) {
    issues.push(
      issue(
        "environment.invalid-locale",
        "locale",
        "Locale must be a supported pseudo locale or a canonical language-region tag.",
      ),
    );
  }

  if (!includesValue(DIRECTIONS, environment.direction)) {
    issues.push(
      issue("environment.invalid-direction", "direction", "Direction must be ltr or rtl."),
    );
  }
  if (!includesValue(THEMES, environment.theme)) {
    issues.push(issue("environment.invalid-theme", "theme", "Theme is not recognized."));
  }
  if (!includesValue(DENSITIES, environment.density)) {
    issues.push(issue("environment.invalid-density", "density", "Density is not recognized."));
  }
  if (!includesValue(MOTION_PREFERENCES, environment.motion)) {
    issues.push(
      issue("environment.invalid-motion", "motion", "Motion preference is not recognized."),
    );
  }
  if (
    !isCatalogId(environment.viewport.id) ||
    !Number.isSafeInteger(environment.viewport.width) ||
    !Number.isSafeInteger(environment.viewport.height) ||
    environment.viewport.width <= 0 ||
    environment.viewport.height <= 0
  ) {
    issues.push(
      issue(
        "environment.invalid-viewport",
        "viewport",
        "Viewport id must be a catalog id and dimensions must be positive safe integers.",
      ),
    );
  }
  if (
    environment.containerWidth !== undefined &&
    (!Number.isSafeInteger(environment.containerWidth) || environment.containerWidth <= 0)
  ) {
    issues.push(
      issue(
        "environment.invalid-container-width",
        "containerWidth",
        "Container width must be a positive safe integer.",
      ),
    );
  }
  if (
    !Number.isSafeInteger(environment.zoomPercent) ||
    environment.zoomPercent < 25 ||
    environment.zoomPercent > 500
  ) {
    issues.push(
      issue(
        "environment.invalid-zoom",
        "zoomPercent",
        "Zoom percentage must be an integer from 25 through 500.",
      ),
    );
  }
  if (
    !Number.isSafeInteger(environment.textScalePercent) ||
    environment.textScalePercent < 100 ||
    environment.textScalePercent > 200
  ) {
    issues.push(
      issue(
        "environment.invalid-text-scale",
        "textScalePercent",
        "Text scale must be an integer from 100 through 200 percent.",
      ),
    );
  }
  if (environment.textSpacing !== "normal" && environment.textSpacing !== "wcag-override") {
    issues.push(
      issue(
        "environment.invalid-text-spacing",
        "textSpacing",
        "Text spacing must be normal or wcag-override.",
      ),
    );
  }

  const expectedId = environmentKey(environment);
  if (environment.id !== expectedId) {
    issues.push(
      issue(
        "environment.noncanonical-id",
        "id",
        `Environment id must equal its deterministic key: ${expectedId}.`,
      ),
    );
  }

  return validationResult(environment, issues);
}

export function defineStoryEnvironment(
  controls: Omit<StoryEnvironment, "id">,
): ValidationResult<StoryEnvironment> {
  const environment: StoryEnvironment = {
    ...controls,
    id: environmentKey({ ...controls, id: "pending" }),
  };
  return validateStoryEnvironment(environment);
}

export function expandStoryEnvironmentAxes(
  axes: StoryEnvironmentAxes,
): ValidationResult<readonly StoryEnvironment[]> {
  const issues: ValidationIssue[] = [];
  const axisEntries = Object.entries(axes) as readonly [string, readonly unknown[]][];
  for (const [axis, values] of axisEntries) {
    if (values.length === 0) {
      issues.push(
        issue("environment.empty-axis", axis, `Environment axis "${axis}" cannot be empty.`),
      );
    }
  }

  const environments: StoryEnvironment[] = [];
  for (const locale of axes.locales) {
    for (const direction of axes.directions) {
      for (const theme of axes.themes) {
        for (const density of axes.densities) {
          for (const motion of axes.motions) {
            for (const viewport of axes.viewports) {
              for (const containerWidth of axes.containerWidths) {
                for (const zoomPercent of axes.zoomPercents) {
                  for (const textScalePercent of axes.textScalePercents) {
                    for (const textSpacing of axes.textSpacings) {
                      const common = {
                        locale,
                        direction,
                        theme,
                        density,
                        motion,
                        viewport,
                        zoomPercent,
                        textScalePercent,
                        textSpacing,
                      };
                      const result = defineStoryEnvironment(
                        containerWidth === undefined ? common : { ...common, containerWidth },
                      );
                      if (result.ok) environments.push(result.value);
                      else issues.push(...result.issues);
                    }
                  }
                }
              }
            }
          }
        }
      }
    }
  }

  environments.sort((left, right) => compareText(left.id, right.id));
  const matrixValidation = validateEnvironmentMatrix(environments);
  issues.push(...matrixValidation.issues);
  return validationResult(environments, issues);
}

export function validateEnvironmentMatrix(
  environments: readonly StoryEnvironment[],
): ValidationResult<readonly StoryEnvironment[]> {
  const issues: ValidationIssue[] = [];
  const ids = new Set<string>();

  for (const [index, environment] of environments.entries()) {
    const result = validateStoryEnvironment(environment);
    issues.push(...result.issues.map((entry) => ({ ...entry, path: `[${index}].${entry.path}` })));
    if (ids.has(environment.id)) {
      issues.push(
        issue(
          "environment.duplicate",
          `[${index}].id`,
          `Environment id "${environment.id}" appears more than once.`,
        ),
      );
    }
    ids.add(environment.id);
  }

  const sorted = [...environments].sort((left, right) => compareText(left.id, right.id));
  if (sorted.some((entry, index) => entry.id !== environments[index]?.id)) {
    issues.push(
      issue(
        "environment.noncanonical-order",
        "$",
        "Environment matrices must be sorted by deterministic environment id.",
      ),
    );
  }

  return validationResult(environments, issues);
}

export async function withStoryEnvironment<T>(
  adapter: StoryEnvironmentAdapter | undefined,
  environment: StoryEnvironment,
  render: (environment: StoryEnvironment) => T | Promise<T>,
): Promise<T> {
  const validation = validateStoryEnvironment(environment);
  if (!validation.ok) {
    throw new HarnessConfigurationError(
      "environment.invalid",
      validation.issues.map((entry) => `${entry.path}: ${entry.message}`).join("; "),
    );
  }

  const runtime = requireRuntimeAdapter(adapter, "story-environment");
  const cleanup = await runtime.apply(environment);

  try {
    return await render(environment);
  } finally {
    if (typeof cleanup === "function") {
      await cleanup();
    }
  }
}
