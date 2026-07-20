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
  InlineEdit,
  validateInlineEditValue,
} from "../../../registry/source/components/inline-edit/inline-edit.tsx";
import { MergoraProvider } from "../../../registry/source/components/provider/provider.tsx";
import {
  Rating,
  assertRatingMaximum,
  assertRatingValue,
  ratingFillForPosition,
  resolveRatingKeyboardIndex,
} from "../../../registry/source/components/rating/rating.tsx";

const root = resolve(import.meta.dirname, "../../..");
const componentsRoot = resolve(root, "registry/source/components");
const itemIds = ["rating", "inline-edit"] as const;
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

describe("P4 Rating and Inline Edit registry records", () => {
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

  it("keeps source descriptors exact and claims no release evidence", () => {
    const expectedDependencies = {
      "inline-edit": ["button", "field", "provider"],
      rating: ["field", "provider"],
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
      expect(css, itemId).toContain("@media (forced-colors: active)");
      expect(css, itemId).toContain("@media (prefers-reduced-motion: reduce)");
      expect(css, itemId).toContain("@media (pointer: coarse)");
      expect(css, itemId).toContain("@media (max-width: 30rem)");
    }
  });
});

describe("Rating value and keyboard policy", () => {
  it("accepts bounded whole editable values and exact fractional display values", () => {
    expect(assertRatingMaximum(5)).toBe(5);
    expect(assertRatingValue(4, 5, { readOnly: false })).toBe(4);
    expect(assertRatingValue(4.5, 5, { readOnly: true })).toBe(4.5);
    expect(assertRatingValue(null, 5, { readOnly: false })).toBeNull();
    expect(() => assertRatingMaximum(0)).toThrow(/1 through 10/u);
    expect(() => assertRatingMaximum(11)).toThrow(/1 through 10/u);
    expect(() => assertRatingValue(4.5, 5, { readOnly: false })).toThrow(/whole numbers/u);
    expect(() => assertRatingValue(6, 5, { readOnly: true })).toThrow(/between 0 and 5/u);
  });

  it("projects exact full, partial, and empty decorative fill", () => {
    expect([1, 2, 3, 4, 5].map((position) => ratingFillForPosition(3.5, position))).toEqual([
      1, 1, 1, 0.5, 0,
    ]);
    expect(ratingFillForPosition(null, 1)).toBe(0);
  });

  it("resolves the complete spatial radio key map in both directions", () => {
    expect(
      resolveRatingKeyboardIndex({ current: 2, direction: "ltr", itemCount: 5, key: "Home" }),
    ).toBe(0);
    expect(
      resolveRatingKeyboardIndex({ current: 2, direction: "ltr", itemCount: 5, key: "End" }),
    ).toBe(4);
    expect(
      resolveRatingKeyboardIndex({
        current: 2,
        direction: "ltr",
        itemCount: 5,
        key: "ArrowRight",
      }),
    ).toBe(3);
    expect(
      resolveRatingKeyboardIndex({
        current: 2,
        direction: "rtl",
        itemCount: 5,
        key: "ArrowRight",
      }),
    ).toBe(1);
    expect(
      resolveRatingKeyboardIndex({
        current: 0,
        direction: "ltr",
        itemCount: 5,
        key: "ArrowUp",
      }),
    ).toBe(4);
    expect(
      resolveRatingKeyboardIndex({ current: 0, direction: "ltr", itemCount: 5, key: "Enter" }),
    ).toBeNull();
  });
});

describe("Rating server rendering", () => {
  it("renders one native radio per whole choice plus an explicit clear choice", () => {
    const markup = renderToStaticMarkup(
      <MergoraProvider locale="de-DE">
        <Rating
          allowClear
          defaultValue={4}
          description="Eine Auswahl"
          label="Qualität"
          name="quality"
        />
      </MergoraProvider>,
    );
    expect(markup).toContain("<fieldset");
    expect(markup).toContain("<legend");
    expect(markup).toContain(">Qualität<");
    expect(markup.match(/type="radio"/gu)).toHaveLength(6);
    expect(markup.match(/name="quality"/gu)).toHaveLength(6);
    expect(markup).toContain('aria-label="4 out of 5"');
    expect(markup).toMatch(/value="4"[^>]+checked=""|checked=""[^>]+value="4"/u);
  });

  it("renders fractional read-only text without an interactive radio role", () => {
    const markup = renderToStaticMarkup(
      <Rating label="Review average" name="review-average" readOnly value={4.5} />,
    );
    expect(markup).toContain('data-readonly="true"');
    expect(markup).toContain("4.5 out of 5");
    expect(markup).toContain('style="inline-size:50%"');
    expect(markup).toContain('type="hidden"');
    expect(markup).toContain('name="review-average"');
    expect(markup).toContain('value="4.5"');
    expect(markup).not.toContain('type="radio"');
    expect(markup).not.toContain('role="radio"');
  });

  it("fails closed for contradictory or dishonest public states", () => {
    expect(() =>
      renderToStaticMarkup(<Rating allowClear label="Required" name="required" required />),
    ).toThrow(/cannot combine required with allowClear/u);
    expect(() =>
      renderToStaticMarkup(<Rating defaultValue={2} label="Mixed" name="mixed" value={3} />),
    ).toThrow(/both value and defaultValue/u);
    expect(() =>
      renderToStaticMarkup(<Rating label="Fraction" name="fraction" value={2.5} />),
    ).toThrow(/whole numbers/u);
    expect(() => renderToStaticMarkup(<Rating label="Blank" name=" " />)).toThrow(
      /name must not be empty/u,
    );
  });

  it("rejects formatter output that erases or floods accessible labels", () => {
    expect(() =>
      renderToStaticMarkup(
        <Rating formatOptionLabel={() => "   "} label="Blank option" name="blank-option" />,
      ),
    ).toThrow(/formatOptionLabel must return non-empty text/u);
    expect(() =>
      renderToStaticMarkup(
        <Rating
          formatValueLabel={() => "x".repeat(257)}
          label="Long value"
          name="long-value"
          readOnly
          value={4.5}
        />,
      ),
    ).toThrow(/formatValueLabel must not exceed 256 Unicode code points/u);
    expect(() =>
      renderToStaticMarkup(
        <MergoraProvider messages={{ "rating.option": "" }}>
          <Rating label="Blank provider" name="blank-provider" />
        </MergoraProvider>,
      ),
    ).toThrow(/option message must return non-empty text/u);
  });
});

describe("Inline Edit server rendering and validation", () => {
  it("renders saved text, a native edit button, and only the saved hidden form value", () => {
    const markup = renderToStaticMarkup(
      <InlineEdit
        defaultValue="Quality Passport"
        description="Public feature name"
        editLabel="Edit feature name"
        label="Feature name"
        name="feature-name"
      />,
    );
    expect(markup).toContain("Quality Passport");
    expect(markup).toContain("Edit feature name");
    expect(markup).toContain('type="button"');
    expect(markup).toContain('type="hidden"');
    expect(markup).toContain('name="feature-name"');
    expect(markup).toContain('value="Quality Passport"');
    expect(markup).not.toContain('data-slot="inline-edit-control"');
  });

  it("keeps read-only serialization successful and disabled serialization omitted", () => {
    const readOnlyMarkup = renderToStaticMarkup(
      <InlineEdit defaultValue="Protected" label="Policy" name="policy" readOnly />,
    );
    expect(readOnlyMarkup).toContain("Read only");
    expect(readOnlyMarkup).toContain('name="policy"');
    expect(readOnlyMarkup).not.toContain(">Edit<");
    const disabledMarkup = renderToStaticMarkup(
      <InlineEdit defaultValue="Unavailable" disabled label="Mirror" name="mirror" />,
    );
    expect(disabledMarkup).toMatch(/type="hidden"[^>]+disabled=""|disabled=""[^>]+type="hidden"/u);
  });

  it("uses one deterministic required/custom validation path", () => {
    expect(
      validateInlineEditValue({
        required: true,
        requiredMessage: "Required value",
        value: "",
      }),
    ).toBe("Required value");
    expect(
      validateInlineEditValue({
        required: true,
        requiredMessage: "Required value",
        validate: (candidate) => (candidate.length < 4 ? "Too short" : undefined),
        value: "abc",
      }),
    ).toBe("Too short");
    expect(
      validateInlineEditValue({
        required: true,
        requiredMessage: "Required value",
        validate: () => undefined,
        value: "valid",
      }),
    ).toBeUndefined();
  });

  it("fails closed for contradictory controlled defaults and blank form names", () => {
    expect(() =>
      renderToStaticMarkup(<InlineEdit defaultValue="default" label="Title" value="controlled" />),
    ).toThrow(/both value and defaultValue/u);
    expect(() =>
      renderToStaticMarkup(<InlineEdit defaultValue="value" label="Title" name=" " />),
    ).toThrow(/name must not be empty/u);
  });
});
