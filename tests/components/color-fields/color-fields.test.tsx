import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import {
  validateStoryStateMatrix,
  type StoryStateMatrix,
} from "../../../packages/test-utils/src/index.ts";
import { validateSchemaDocument } from "../../../registry/schemas/index.ts";
import {
  ColorField,
  colorContrastRatio,
  compositeSrgbColors,
  createSrgbColor,
  formatColorValue,
  hslToSrgb,
  parseColorText,
  serializeColorValue,
  srgbToHsl,
  type SrgbColorValue,
} from "../../../registry/source/components/color-field/color-field.tsx";
import { ColorPicker } from "../../../registry/source/components/color-picker/color-picker.tsx";
import { Field } from "../../../registry/source/components/field/field.tsx";
import { MergoraProvider } from "../../../registry/source/components/provider/provider.tsx";

const root = resolve(import.meta.dirname, "../../..");
const componentsRoot = resolve(root, "registry/source/components");
const itemIds = ["color-field", "color-picker"] as const;
const recordSuffixes = [
  "anatomy.json",
  "api.json",
  "contract.json",
  "metadata.json",
  "source.json",
  "status.json",
  "stories.json",
] as const;

function readItem(itemId: string, filename: string): string {
  return readFileSync(resolve(componentsRoot, itemId, filename), "utf8");
}

function readJson<T>(itemId: string, filename: string): T {
  return JSON.parse(readItem(itemId, filename)) as T;
}

function expectColor(actual: SrgbColorValue, expected: Omit<SrgbColorValue, "colorSpace">): void {
  expect(actual).toEqual({ colorSpace: "srgb", ...expected });
  expect(Object.isFrozen(actual)).toBe(true);
}

describe("P4 color registry records", () => {
  it("ships exactly the canonical twelve source files for each item", () => {
    for (const itemId of itemIds) {
      const files = readdirSync(resolve(componentsRoot, itemId)).sort();
      expect(files, itemId).toEqual(
        [
          "README.md",
          "index.ts",
          `${itemId}-css.d.ts`,
          `${itemId}.anatomy.json`,
          `${itemId}.api.json`,
          `${itemId}.contract.json`,
          `${itemId}.css`,
          `${itemId}.metadata.json`,
          `${itemId}.source.json`,
          `${itemId}.status.json`,
          `${itemId}.stories.json`,
          `${itemId}.tsx`,
        ].sort(),
      );
    }
  });

  it("validates metadata and the full required story-state policy", () => {
    for (const itemId of itemIds) {
      const metadata = readJson<Record<string, unknown>>(itemId, `${itemId}.metadata.json`);
      const stories = readJson<StoryStateMatrix>(itemId, `${itemId}.stories.json`);
      expect(validateSchemaDocument("component-metadata", metadata), itemId).toMatchObject({
        errors: [],
        ok: true,
      });
      expect(validateStoryStateMatrix(stories), itemId).toMatchObject({ issues: [], ok: true });
    }
  });

  it("keeps source descriptors exact and claims no release or evidence it does not have", () => {
    const expectedDependencies = {
      "color-field": ["field", "provider"],
      "color-picker": ["color-field", "provider"],
    } satisfies Record<(typeof itemIds)[number], readonly string[]>;
    for (const itemId of itemIds) {
      const source = readJson<Record<string, unknown>>(itemId, `${itemId}.source.json`);
      expect(Object.keys(source).sort(), itemId).toEqual([
        "declaredImports",
        "entryPath",
        "id",
        "itemDependencies",
        "outputRole",
      ]);
      expect(source).toMatchObject({
        entryPath: `registry/source/components/${itemId}/${itemId}.tsx`,
        id: itemId,
        itemDependencies: expectedDependencies[itemId],
        outputRole: "component",
      });
      const records = recordSuffixes
        .map((suffix) => readItem(itemId, `${itemId}.${suffix}`))
        .join("\n");
      expect(records).not.toMatch(/"(?:maturity|publishedMaturity)"\s*:\s*"stable"/iu);
      expect(records).not.toMatch(/"recordedEvidence"\s*:\s*\[[^\]]+\]/u);
      expect(readJson(itemId, `${itemId}.status.json`)).toMatchObject({
        distributionStatus: "not-generated",
        evidenceStatus: "incomplete",
        implementationStatus: "source-present-unreleased",
        releaseStatus: "unreleased",
      });
    }
  });

  it("uses semantic tokens, logical layout, touch sizing, and forced-color fallbacks", () => {
    for (const itemId of itemIds) {
      const css = readItem(itemId, `${itemId}.css`);
      expect(css, itemId).not.toMatch(/#[\da-f]{3,8}\b|\brgba?\(|\bhsla?\(/iu);
      expect(css, itemId).not.toMatch(/\b(?:left|right)-(?:width|color|style|radius)\s*:/u);
      expect(css).toContain("var(--mrg-semantic-size-target-preferred)");
      expect(css).toContain("@media (forced-colors: active)");
    }
    expect(readItem("color-picker", "color-picker.css")).toContain(
      "forced-color-adjust: auto !important",
    );
  });
});

describe("typed 8-bit sRGB conversions", () => {
  it("creates immutable channel-safe values", () => {
    const color = createSrgbColor({ alpha: 128, blue: 51, green: 34, red: 17 });
    expectColor(color, { alpha: 128, blue: 51, green: 34, red: 17 });
    expect(() => createSrgbColor({ alpha: 255, blue: 0, green: 0, red: 256 })).toThrow(RangeError);
    expect(() => createSrgbColor({ alpha: 255, blue: 0, green: 0.5, red: 0 })).toThrow(RangeError);
  });

  it("parses supported hex, RGB, and HSL forms into one exact model", () => {
    const hex = parseColorText(" #369c ", "allow");
    expect(hex.ok).toBe(true);
    if (hex.ok) expectColor(hex.value, { alpha: 204, blue: 153, green: 102, red: 51 });

    const rgb = parseColorText("rgba(51, 102, 153, 0.5)", "allow");
    expect(rgb.ok).toBe(true);
    if (rgb.ok) expectColor(rgb.value, { alpha: 128, blue: 153, green: 102, red: 51 });

    const hsl = parseColorText("hsl(210, 50%, 40%)", "opaque");
    expect(hsl.ok).toBe(true);
    if (hsl.ok) expectColor(hsl.value, { alpha: 255, blue: 153, green: 102, red: 51 });
  });

  it("converts RGB and HSL deterministically at the documented 8-bit boundary", () => {
    const samples = [
      createSrgbColor({ alpha: 255, blue: 0, green: 0, red: 255 }),
      createSrgbColor({ alpha: 128, blue: 153, green: 102, red: 51 }),
      createSrgbColor({ alpha: 255, blue: 78, green: 140, red: 201 }),
      createSrgbColor({ alpha: 255, blue: 127, green: 127, red: 127 }),
    ];
    for (const color of samples) {
      const hsl = srgbToHsl(color);
      expect(hslToSrgb(hsl)).toEqual(color);
      const hslText = formatColorValue(color, "hsl", "allow");
      const parsed = parseColorText(hslText, "allow");
      expect(parsed).toEqual({ ok: true, value: color });
    }
  });

  it("round-trips a representative channel cube and every alpha byte through public text", () => {
    const channels = [0, 17, 63, 127, 191, 255];
    for (const red of channels) {
      for (const green of channels) {
        for (const blue of channels) {
          const color = createSrgbColor({ alpha: 255, blue, green, red });
          expect(parseColorText(formatColorValue(color, "hsl", "allow"), "allow")).toEqual({
            ok: true,
            value: color,
          });
        }
      }
    }
    for (let alpha = 0; alpha <= 255; alpha += 1) {
      const color = createSrgbColor({ alpha, blue: 153, green: 102, red: 51 });
      expect(parseColorText(formatColorValue(color, "rgb", "allow"), "allow")).toEqual({
        ok: true,
        value: color,
      });
    }
  });

  it("serializes alpha explicitly and rejects silent alpha loss or unsupported syntax", () => {
    const color = createSrgbColor({ alpha: 128, blue: 153, green: 102, red: 51 });
    expect(serializeColorValue(color, "allow")).toBe("#33669980");
    expect(formatColorValue(color, "rgb", "allow")).toBe("rgba(51, 102, 153, 0.501961)");
    expect(() => serializeColorValue(color, "opaque")).toThrow(RangeError);
    expect(parseColorText("#33669980", "opaque")).toEqual({
      ok: false,
      reason: "alpha-not-allowed",
    });
    expect(parseColorText("rgb(300, 0, 0)", "allow")).toEqual({
      ok: false,
      reason: "out-of-range",
    });
    expect(parseColorText("color(display-p3 1 0 0)", "allow")).toEqual({
      ok: false,
      reason: "syntax",
    });
  });

  it("composites alpha before reporting an exact reference contrast ratio", () => {
    const black = createSrgbColor({ alpha: 255, blue: 0, green: 0, red: 0 });
    const white = createSrgbColor({ alpha: 255, blue: 255, green: 255, red: 255 });
    const halfBlack = createSrgbColor({ alpha: 128, blue: 0, green: 0, red: 0 });
    expect(colorContrastRatio(black, white)).toBeCloseTo(21, 10);
    expect(compositeSrgbColors(halfBlack, white)).toEqual(
      createSrgbColor({ alpha: 255, blue: 127, green: 127, red: 127 }),
    );
    expect(colorContrastRatio(halfBlack, white)).toBeCloseTo(4.0041, 3);
  });
});

describe("color field and picker server rendering", () => {
  it("associates Field text and separates editable text from canonical form data", () => {
    const color = createSrgbColor({ alpha: 128, blue: 153, green: 102, red: 51 });
    const markup = renderToStaticMarkup(
      <MergoraProvider locale="de-DE">
        <Field description="Mit Transparenz" label="Markenfarbe" required>
          <ColorField
            alphaPolicy="allow"
            defaultValue={color}
            form="brand-form"
            format="hsl"
            name="brand"
          />
        </Field>
      </MergoraProvider>,
    );
    expect(markup).toContain("Markenfarbe");
    expect(markup).toContain("Mit Transparenz");
    expect(markup).toMatch(/<label[^>]+for="([^"]+)"[\s\S]+<input[^>]+id="\1"/u);
    expect(markup.match(/form="brand-form"/gu)).toHaveLength(2);
    expect(markup).toMatch(/<input[^>]+type="hidden"[^>]+name="brand"[^>]+value="#33669980"/u);
    expect(markup).toContain("Reference contrast:");
    expect(markup).toContain("Confirm text size and final rendered colors separately.");
  });

  it("renders a real 2D range model plus complete named channel and swatch alternatives", () => {
    const color = createSrgbColor({ alpha: 204, blue: 87, green: 122, red: 47 });
    const markup = renderToStaticMarkup(
      <MergoraProvider locale="en-US">
        <Field label="Interface color">
          <ColorPicker defaultValue={color} name="interface-color" />
        </Field>
      </MergoraProvider>,
    );
    expect(markup).toContain('aria-roledescription="2D slider"');
    for (const label of ["Hue", "Saturation", "Brightness", "Opacity"]) {
      expect(markup).toContain(`aria-label="${label}"`);
    }
    expect(markup).toContain('aria-label="Preset colors"');
    expect(markup).toContain("Color swatch 1:");
    expect(markup).toMatch(
      /<input[^>]+type="hidden"[^>]+name="interface-color"[^>]+value="#2f7a57cc"/u,
    );
  });
});
