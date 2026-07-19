import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import {
  validateStoryStateMatrix,
  type StoryStateMatrix,
} from "../../../packages/test-utils/src/index.ts";
import { validateSchemaDocument } from "../../../registry/schemas/index.ts";
import { Field } from "../../../registry/source/components/field/field.tsx";
import { RangeSlider } from "../../../registry/source/components/range-slider/range-slider.tsx";
import { MergoraProvider } from "../../../registry/source/components/provider/provider.tsx";
import {
  Slider,
  normalizeSliderMarks,
  resolveSliderDomain,
  sliderValueIsAligned,
  sliderValueToPercent,
} from "../../../registry/source/components/slider/slider.tsx";

const root = resolve(import.meta.dirname, "../../..");
const componentsRoot = resolve(root, "registry/source/components");
const itemIds = ["slider", "range-slider"] as const;
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

describe("P4 slider registry records", () => {
  it("ships exactly the canonical twelve source files for both items", () => {
    for (const itemId of itemIds) {
      expect(readdirSync(resolve(componentsRoot, itemId)).sort(), itemId).toEqual(
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

  it("validates metadata and the complete required story-state policy", () => {
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
      "range-slider": ["provider", "slider"],
      slider: ["field", "provider"],
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

  it("uses semantic tokens, logical layout, and explicit preference fallbacks", () => {
    for (const itemId of itemIds) {
      const css = readItem(itemId, `${itemId}.css`);
      expect(css, itemId).not.toMatch(/#[\da-f]{3,8}\b|\brgba?\(|\bhsla?\(/iu);
      expect(css, itemId).not.toMatch(/\b(?:left|right)-(?:width|color|style|radius)\s*:/u);
    }
    const sliderCss = readItem("slider", "slider.css");
    expect(sliderCss).toContain("@media (forced-colors: active)");
    expect(sliderCss).toContain("@media (prefers-reduced-motion: reduce)");
    expect(sliderCss).toContain("@media (pointer: coarse)");
    expect(sliderCss).toContain("@media (max-width: 30rem)");
  });
});

describe("slider domain and mark helpers", () => {
  it("accepts exact decimal domains and rejects unreachable endpoints", () => {
    expect(resolveSliderDomain(0, 1, 0.05)).toEqual({ maximum: 1, minimum: 0, step: 0.05 });
    expect(resolveSliderDomain(1000, 10000, 250)).toEqual({
      maximum: 10000,
      minimum: 1000,
      step: 250,
    });
    expect(() => resolveSliderDomain(0, 1, 0.3)).toThrow(/reachable/u);
    expect(() => resolveSliderDomain(2, 2, 1)).toThrow(/less than/u);
    expect(() => resolveSliderDomain(0, 10, 0)).toThrow(/above zero/u);
  });

  it("maps only aligned values and returns an immutable sorted mark projection", () => {
    const domain = resolveSliderDomain(0, 100, 5);
    expect(sliderValueIsAligned(55, domain)).toBe(true);
    expect(sliderValueIsAligned(52, domain)).toBe(false);
    expect(sliderValueToPercent(25, domain)).toBe(25);
    const source = [
      { label: "End", value: 100 },
      { label: "Start", value: 0 },
    ] as const;
    expect(normalizeSliderMarks(source, domain)).toEqual([
      { label: "Start", value: 0 },
      { label: "End", value: 100 },
    ]);
    expect(source[0].value).toBe(100);
    expect(() => normalizeSliderMarks([{ label: "Off step", value: 12 }], domain)).toThrow(
      /aligned/u,
    );
    expect(() =>
      normalizeSliderMarks(
        [
          { label: "A", value: 10 },
          { label: "B", value: 10 },
        ],
        domain,
      ),
    ).toThrow(/duplicated/u);
  });
});

describe("slider server rendering", () => {
  it("associates Field text, formats the accessible value, and serializes one number", () => {
    const markup = renderToStaticMarkup(
      <MergoraProvider locale="de-DE">
        <Field description="In Fünferschritten" label="Bewertung">
          <Slider defaultValue={75} maxValue={100} minValue={0} name="rating" step={5} />
        </Field>
      </MergoraProvider>,
    );
    expect(markup).toContain(">Bewertung<");
    expect(markup).toContain("In Fünferschritten");
    expect(markup).toContain('aria-valuetext="75"');
    expect(markup).toMatch(/role="group"[^>]+aria-labelledby="mrg-field-[^"]+-label"/u);
    expect(markup).toMatch(/<input[^>]+type="range"[^>]+name="rating"[^>]+value="75"/u);
  });

  it("renders distinct ordered range controls, names, and formatted value text", () => {
    const markup = renderToStaticMarkup(
      <MergoraProvider locale="en-US">
        <Field label="Approved budget range">
          <RangeSlider
            defaultValue={[4000, 10000]}
            formatOptions={{ currency: "EUR", maximumFractionDigits: 0, style: "currency" }}
            maxValue={10000}
            minValue={1000}
            names={["budget-minimum", "budget-maximum"]}
            step={250}
            thumbLabels={["Minimum approved budget", "Maximum approved budget"]}
          />
        </Field>
      </MergoraProvider>,
    );
    expect(markup).toContain('aria-label="Minimum approved budget"');
    expect(markup).toContain('aria-label="Maximum approved budget"');
    expect(markup).toContain('aria-valuetext="€4,000"');
    expect(markup).toContain('aria-valuetext="€10,000"');
    expect(markup).toMatch(/name="budget-minimum"[^>]+value="4000"/u);
    expect(markup).toMatch(/name="budget-maximum"[^>]+value="10000"/u);
    expect(markup).toContain('data-collision-behavior="clamp"');
  });

  it("keeps read-only values focusable and successful while invalid state reaches every thumb", () => {
    const markup = renderToStaticMarkup(
      <MergoraProvider>
        <Field error="Window is too narrow." label="Review window">
          <RangeSlider
            defaultValue={[45, 55]}
            names={["review-minimum", "review-maximum"]}
            readOnly
            thumbLabels={["Review minimum", "Review maximum"]}
          />
        </Field>
      </MergoraProvider>,
    );
    expect(markup).toContain('data-readonly="true"');
    expect(markup).toContain("Read-only: value cannot be changed.");
    expect(markup).toMatch(/aria-describedby="[^"]*mrg-slider-readonly-[^"]+"/u);
    expect(markup.match(/aria-invalid="true"/gu)).toHaveLength(2);
    expect(markup).not.toContain(" disabled");
    expect(markup).toContain('name="review-minimum"');
    expect(markup).toContain('name="review-maximum"');
  });

  it("fails closed for crossing values and misaligned public arrays", () => {
    expect(() =>
      renderToStaticMarkup(
        <RangeSlider defaultValue={[60, 40]} thumbLabels={["Minimum", "Maximum"]} />,
      ),
    ).toThrow(/ordered/u);
    expect(() =>
      renderToStaticMarkup(
        <RangeSlider defaultValue={[10, 51]} step={5} thumbLabels={["Minimum", "Maximum"]} />,
      ),
    ).toThrow(/aligned/u);
    expect(() => renderToStaticMarkup(<Slider defaultValue={20} value={30} />)).toThrow(
      /both value and defaultValue/u,
    );
    expect(() =>
      renderToStaticMarkup(<RangeSlider defaultValue={[20, 80]} value={[30, 70]} />),
    ).toThrow(/both value and defaultValue/u);
  });
});
