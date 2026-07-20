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
  CurrencyField,
  currencyFractionDigits,
  normalizeCurrencyCode,
} from "../../../registry/source/components/currency-field/currency-field.tsx";
import { Field } from "../../../registry/source/components/field/field.tsx";
import {
  NumberField,
  numericStepPrecision,
  resolveNumberFormatOptions,
  stepNumericValue,
} from "../../../registry/source/components/number-field/number-field.tsx";
import { PercentageField } from "../../../registry/source/components/percentage-field/percentage-field.tsx";
import { MergoraProvider } from "../../../registry/source/components/provider/provider.tsx";

const root = resolve(import.meta.dirname, "../../..");
const componentsRoot = resolve(root, "registry/source/components");
const itemIds = ["number-field", "currency-field", "percentage-field"] as const;
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

describe("P4 numeric-field registry records", () => {
  it("ships exactly the canonical twelve source files for every item", () => {
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

  it("uses the shared two-layer focus seam and forced-color mapping", () => {
    const css = readItem("number-field", "number-field.css");
    expect(css).toContain("var(--mrg-component-focus-indicator-color)");
    expect(css).toContain("var(--mrg-component-focus-indicator-contrast-background)");
    expect(css).toContain("box-shadow: none");
    expect(css).toContain("outline-color: Highlight");
  });

  it("keeps source descriptors exact and claims no release or evidence it does not have", () => {
    const expectedDependencies = {
      "currency-field": ["number-field", "provider"],
      "number-field": ["field", "provider"],
      "percentage-field": ["number-field"],
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

  it("uses semantic tokens and logical layout without literal color values", () => {
    for (const itemId of itemIds) {
      const css = readItem(itemId, `${itemId}.css`);
      expect(css, itemId).not.toMatch(/#[\da-f]{3,8}\b|\brgba?\(|\bhsla?\(/iu);
      expect(css, itemId).not.toMatch(/\b(?:left|right)-(?:width|color|style|radius)\s*:/u);
    }
    const numberCss = readItem("number-field", "number-field.css");
    expect(numberCss).toContain("@media (forced-colors: active)");
    expect(numberCss).toContain("@media (pointer: coarse)");
    expect(numberCss).not.toContain("radius-pill");
  });
});

describe("numeric step and currency helpers", () => {
  it("derives decimal precision including exponent notation", () => {
    expect(numericStepPrecision(1)).toBe(0);
    expect(numericStepPrecision(0.001)).toBe(3);
    expect(numericStepPrecision(1e-7)).toBe(7);
    expect(numericStepPrecision(1.25e3)).toBe(0);
    expect(() => numericStepPrecision(0)).toThrow(RangeError);
    expect(() => numericStepPrecision(Number.POSITIVE_INFINITY)).toThrow(RangeError);
  });

  it("steps without binary drift and respects explicit boundaries", () => {
    expect(stepNumericValue(0.2, 1, { precision: 1, step: 0.1 })).toBe(0.3);
    expect(stepNumericValue(9.9, 10, { maximum: 10, precision: 1, step: 0.1 })).toBe(10);
    expect(stepNumericValue(-0.1, -10, { minimum: 0, precision: 1, step: 0.1 })).toBe(0);
    expect(stepNumericValue(Number.NaN, 2, { minimum: 5, step: 0.5 })).toBe(6);
    expect(() => stepNumericValue(0, 1.2, { step: 1 })).toThrow(RangeError);
  });

  it("merges precision without mutating the consumer's format options", () => {
    const source: Intl.NumberFormatOptions = { minimumFractionDigits: 1, useGrouping: false };
    expect(resolveNumberFormatOptions(source, 3)).toEqual({
      maximumFractionDigits: 3,
      minimumFractionDigits: 1,
      useGrouping: false,
    });
    expect(source).toEqual({ minimumFractionDigits: 1, useGrouping: false });
    expect(() => resolveNumberFormatOptions({ minimumFractionDigits: 3 }, 2)).toThrow(RangeError);
  });

  it("normalizes codes and resolves ISO-style minor-unit conventions", () => {
    expect(normalizeCurrencyCode(" usd ")).toBe("USD");
    expect(currencyFractionDigits("USD")).toBe(2);
    expect(currencyFractionDigits("JPY")).toBe(0);
    expect(currencyFractionDigits("KWD")).toBe(3);
    expect(() => normalizeCurrencyCode("US")).toThrow(RangeError);
  });
});

describe("numeric field server rendering", () => {
  it("associates Field text and serializes a non-localized number", () => {
    const markup = renderToStaticMarkup(
      <MergoraProvider locale="de-DE">
        <Field description="Dezimalwert" label="Menge" required>
          <NumberField defaultValue={1234.5} name="quantity" precision={1} />
        </Field>
      </MergoraProvider>,
    );
    expect(markup).toContain(">Menge<");
    expect(markup).toContain("Dezimalwert");
    expect(markup).toContain('aria-roledescription="Nummernfeld"');
    expect(markup).toContain('value="1.234,5"');
    expect(markup).toMatch(/<input[^>]+type="hidden"[^>]+name="quantity"[^>]+value="1234\.5"/u);
    expect(markup).toMatch(/<label[^>]+for="([^"]+)"[\s\S]+<input[^>]+id="\1"/u);
  });

  it("keeps currency values in major units and exposes the explicit code", () => {
    const markup = renderToStaticMarkup(
      <MergoraProvider locale="en-US">
        <Field label="Balance">
          <CurrencyField
            allowNegative
            currency="USD"
            currencyDisplay="symbol"
            currencySign="accounting"
            defaultValue={-1234.5}
            name="balance"
          />
        </Field>
      </MergoraProvider>,
    );
    expect(markup).toContain('data-currency="USD"');
    expect(markup).toContain('value="($1,234.50)"');
    expect(markup).toMatch(/<input[^>]+type="hidden"[^>]+name="balance"[^>]+value="-1234\.5"/u);
  });

  it("documents and preserves the fractional percentage scale", () => {
    const markup = renderToStaticMarkup(
      <MergoraProvider locale="en-US">
        <Field label="Allocation">
          <PercentageField defaultValue={0.125} name="allocation" precision={1} />
        </Field>
      </MergoraProvider>,
    );
    expect(markup).toContain('data-value-scale="fraction"');
    expect(markup).toContain('value="12.5%"');
    expect(markup).toMatch(/<input[^>]+type="hidden"[^>]+name="allocation"[^>]+value="0\.125"/u);
  });

  it("links Field errors and required state to the editable input", () => {
    const markup = renderToStaticMarkup(
      <MergoraProvider>
        <Field error="Use 10 or less." label="Score" required>
          <NumberField defaultValue={12} maxValue={10} />
        </Field>
      </MergoraProvider>,
    );
    expect(markup).toContain('aria-invalid="true"');
    expect(markup).toContain('required=""');
    expect(markup).toMatch(/aria-describedby="[^"]+-error"/u);
    expect(markup).toMatch(/aria-errormessage="[^"]+-error"/u);
  });

  it("omits optional insight output by default", () => {
    const markup = renderToStaticMarkup(
      <MergoraProvider>
        <Field label="Quantity">
          <NumberField defaultValue={12} />
        </Field>
      </MergoraProvider>,
    );
    expect(markup).not.toContain("number-field-insights");
    expect(markup).not.toContain("number-field-status");
    expect(markup).not.toContain("number-field-canonical-preview");
    expect(markup).not.toContain("data-has-status-rail");
    expect(markup).not.toContain("data-shows-canonical-preview");
  });

  it("shows linked range context and exact canonical values only when requested", () => {
    const markup = renderToStaticMarkup(
      <MergoraProvider locale="en-US">
        <Field label="Operating reserve">
          <CurrencyField
            currency="EUR"
            defaultValue={8250}
            maxValue={12000}
            minValue={1000}
            showCanonicalPreview
            statusRail="auto"
          />
        </Field>
      </MergoraProvider>,
    );
    expect(markup).toContain('data-has-status-rail="true"');
    expect(markup).toContain('data-shows-canonical-preview="true"');
    expect(markup).toContain("Accepted range: EUR\u00a01,000.00 to EUR\u00a012,000.00.");
    expect(markup).toContain("Canonical EUR major-unit value");
    expect(markup).toContain('<data value="8250">8250</data>');
    const statusId = markup.match(/id="(mrg-number-field-status-[^"]+)"/u)?.[1];
    expect(statusId).toBeDefined();
    expect(markup).toMatch(
      new RegExp(`aria-describedby="[^"]*${statusId ?? "missing"}[^"]*"`, "u"),
    );

    const percentageMarkup = renderToStaticMarkup(
      <PercentageField defaultValue={0.275} showCanonicalPreview showStepper={false} />,
    );
    expect(percentageMarkup).toContain("Canonical fractional value");
    expect(percentageMarkup).toContain('<data value="0.275">0.275</data>');
    expect(percentageMarkup).not.toContain("number-field-status");
  });

  it("resolves status and canonical-preview messages only for the enabled enhancement", () => {
    let statusMessageResolutions = 0;
    let previewMessageResolutions = 0;
    const messages = {
      "numberField.canonicalPreview": () => {
        previewMessageResolutions += 1;
        return "Canonical number";
      },
      "numberField.canonicalPreview.empty": () => {
        previewMessageResolutions += 1;
        return "No canonical value yet";
      },
      "numberField.status.range": () => {
        statusMessageResolutions += 1;
        return "Accepted range: {minimum} to {maximum}.";
      },
    } as const;

    const statusOnlyMarkup = renderToStaticMarkup(
      <MergoraProvider messages={messages}>
        <NumberField defaultValue={4} maxValue={10} minValue={0} statusRail="auto" />
      </MergoraProvider>,
    );
    expect(statusOnlyMarkup).toContain("number-field-status");
    expect(statusOnlyMarkup).not.toContain("number-field-canonical-preview");
    expect(statusMessageResolutions).toBe(1);
    expect(previewMessageResolutions).toBe(0);

    statusMessageResolutions = 0;
    previewMessageResolutions = 0;
    const previewOnlyMarkup = renderToStaticMarkup(
      <MergoraProvider messages={messages}>
        <NumberField defaultValue={4} showCanonicalPreview statusRail={false} />
      </MergoraProvider>,
    );
    expect(previewOnlyMarkup).toContain("number-field-canonical-preview");
    expect(previewOnlyMarkup).not.toContain("number-field-status");
    expect(statusMessageResolutions).toBe(0);
    expect(previewMessageResolutions).toBe(1);
  });
});
