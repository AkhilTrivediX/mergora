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
import {
  MaskedField,
  applyDeterministicMaskAdapter,
  type DeterministicMaskAdapter,
} from "../../../registry/source/components/masked-field/masked-field.tsx";
import {
  PhoneField,
  applyPhoneFormatAdapter,
  type PhoneFormatAdapter,
} from "../../../registry/source/components/phone-field/phone-field.tsx";
import { MergoraProvider } from "../../../registry/source/components/provider/provider.tsx";

const root = resolve(import.meta.dirname, "../../..");
const componentsRoot = resolve(root, "registry/source/components");
const itemIds = ["phone-field", "masked-field"] as const;
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

function digitsOnly(value: string): string | null {
  let result = "";
  for (const character of value) {
    if (character >= "0" && character <= "9") result += character;
    else if (character !== " " && character !== "-") return null;
  }
  return result;
}

const phoneAdapter: PhoneFormatAdapter = {
  id: "tests.fixed-phone.v1",
  resolve(input, context) {
    const digits = digitsOnly(input);
    if (digits === null || digits.length > 10) {
      return { displayValue: input, e164: null, selection: context.selection, status: "invalid" };
    }
    if (digits.length === 0) {
      return { displayValue: "", e164: null, selection: context.selection, status: "empty" };
    }
    const displayValue = [digits.slice(0, 3), digits.slice(3, 6), digits.slice(6)]
      .filter((part) => part.length > 0)
      .join(" ");
    return {
      displayValue,
      e164: digits.length === 10 ? `${context.country.callingCode}${digits}` : null,
      selection:
        context.selection === null
          ? null
          : {
              direction: context.selection.direction,
              end: displayValue.length,
              start: displayValue.length,
            },
      status: digits.length === 10 ? "valid" : "incomplete",
    };
  },
};

function isLetter(character: string): boolean {
  const upper = character.toUpperCase();
  return upper.length === 1 && upper >= "A" && upper <= "Z";
}

const maskAdapter: DeterministicMaskAdapter = {
  id: "tests.product-code.v1",
  apply(input, context) {
    const rawValue = input.replaceAll("-", "").toUpperCase();
    if (rawValue.length === 0) {
      return { formattedValue: "", rawValue: "", selection: context.selection, status: "empty" };
    }
    if (rawValue.length > 8) {
      return {
        formattedValue: input,
        rawValue: input,
        selection: context.selection,
        status: "invalid",
      };
    }
    for (let index = 0; index < rawValue.length; index += 1) {
      const character = rawValue[index];
      const letterPosition = index < 2 || index >= 6;
      const valid =
        character !== undefined &&
        (letterPosition ? isLetter(character) : character >= "0" && character <= "9");
      if (!valid) {
        return {
          formattedValue: input,
          rawValue: input,
          selection: context.selection,
          status: "invalid",
        };
      }
    }
    const formattedValue = [rawValue.slice(0, 2), rawValue.slice(2, 6), rawValue.slice(6)]
      .filter((part) => part.length > 0)
      .join("-");
    return {
      formattedValue,
      rawValue,
      selection:
        context.selection === null
          ? null
          : {
              direction: context.selection.direction,
              end: formattedValue.length,
              start: formattedValue.length,
            },
      status: rawValue.length === 8 ? "valid" : "incomplete",
    };
  },
};

describe("P4 phone and masked-field registry records", () => {
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

  it("keeps descriptors exact and makes no release or evidence claim", () => {
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
        itemDependencies: ["field", "provider"],
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

  it("uses semantic tokens, logical layout, preferred targets, and preference fallbacks", () => {
    for (const itemId of itemIds) {
      const css = readItem(itemId, `${itemId}.css`);
      expect(css, itemId).not.toMatch(/#[\da-f]{3,8}\b|\brgba?\(|\bhsla?\(/iu);
      expect(css, itemId).not.toMatch(/\b(?:left|right)-(?:width|color|style|radius)\s*:/u);
      expect(css, itemId).toContain("var(--mrg-semantic-size-target-preferred)");
      expect(css, itemId).toContain("@media (pointer: coarse)");
      expect(css, itemId).toContain("@media (prefers-reduced-motion: reduce)");
      expect(css, itemId).toContain("@media (forced-colors: active)");
    }
  });

  it("contains no runtime mask compiler or untrusted executable definition surface", () => {
    const source = readItem("masked-field", "masked-field.tsx");
    expect(source).not.toMatch(/\beval\s*\(|\bFunction\s*\(|\bRegExp\s*\(|\bimport\s*\(/u);
    expect(source).not.toContain("maskPattern");
    expect(source).not.toContain("maskExpression");
  });
});

describe("PhoneField value and form contracts", () => {
  it("keeps canonical serialization and extension capture independently absent by default", () => {
    const plain = renderToStaticMarkup(
      <>
        <PhoneField
          adapter={phoneAdapter}
          country={{ callingCode: "+1", code: "US", label: "United States" }}
          defaultValue="4155552671"
        />
        <MaskedField adapter={maskAdapter} defaultValue="AB2048QZ" />
      </>,
    );
    expect(plain).not.toContain('data-slot="phone-field-canonical-input"');
    expect(plain).not.toContain('data-slot="phone-field-extension"');
    expect(plain).not.toContain('data-slot="masked-field-serialized-input"');

    const enhanced = renderToStaticMarkup(
      <>
        <PhoneField
          adapter={phoneAdapter}
          country={{ callingCode: "+1", code: "US", label: "United States" }}
          defaultValue="4155552671"
          extension
          extensionLabel="Extension"
          extensionName="extension"
          name="phone"
        />
        <MaskedField
          adapter={maskAdapter}
          defaultValue="AB2048QZ"
          name="inventory"
          serialization="raw"
        />
      </>,
    );
    expect(enhanced).toContain('data-slot="phone-field-canonical-input"');
    expect(enhanced).toContain('data-slot="phone-field-extension"');
    expect(enhanced).toContain('data-slot="masked-field-serialized-input"');
  });

  it("renders explicit country text, native tel semantics, canonical E.164, and extension", () => {
    const markup = renderToStaticMarkup(
      <MergoraProvider>
        <form>
          <Field description="Include a reachable number." label="Telephone" required>
            <PhoneField
              adapter={phoneAdapter}
              autoComplete="tel"
              country={{ callingCode: "+1", code: "US", label: "United States" }}
              defaultExtensionValue="204"
              defaultValue="4155552671"
              extension
              extensionLabel="Extension"
              extensionName="extension"
              name="phone"
              required
            />
          </Field>
        </form>
      </MergoraProvider>,
    );
    expect(markup).toMatch(/<label[^>]+for="([^"]+)"[^>]*>[\s\S]+<input[^>]+id="\1"/u);
    expect(markup).toContain('type="tel"');
    expect(markup).toContain('autoComplete="tel"');
    expect(markup).toContain("United States");
    expect(markup).toContain("+1");
    expect(markup).toContain('name="phone"');
    expect(markup).toContain('value="+14155552671"');
    expect(markup).toContain('name="extension"');
    expect(markup).toContain('value="204"');
    expect(markup).toMatch(/aria-describedby="[^"]+-description [^"]+-country"/u);
  });

  it("rejects flag-only labels and dishonest adapter results", () => {
    expect(() =>
      renderToStaticMarkup(
        <PhoneField
          adapter={phoneAdapter}
          country={{
            callingCode: "+1",
            code: "US",
            label: "\u{1F1FA}\u{1F1F8}",
          }}
        />,
      ),
    ).toThrow(/not a flag or symbol alone/u);

    expect(() =>
      applyPhoneFormatAdapter(
        {
          id: "tests.invalid-e164.v1",
          resolve: () => ({
            displayValue: "415 555 2671",
            e164: "4155552671",
            selection: null,
            status: "valid",
          }),
        },
        "4155552671",
        {
          country: { callingCode: "+1", code: "US", label: "United States" },
          locale: "en-US",
          maxInputLength: 64,
          phase: "render",
          previousDisplayValue: "",
          selection: null,
        },
      ),
    ).toThrow(/canonical E\.164/u);
  });

  it("requires caret mapping when an interactive adapter changes visible text", () => {
    expect(() =>
      applyPhoneFormatAdapter(
        {
          id: "tests.missing-caret.v1",
          resolve: () => ({
            displayValue: "415 5",
            e164: null,
            selection: null,
            status: "incomplete",
          }),
        },
        "4155",
        {
          country: { callingCode: "+1", code: "US", label: "United States" },
          locale: "en-US",
          maxInputLength: 64,
          phase: "input",
          previousDisplayValue: "415",
          selection: { direction: "none", end: 4, start: 4 },
        },
      ),
    ).toThrow(/without returning caret mapping/u);
  });

  it("rejects unknown status, over-limit output, wrong country prefix, and destructive invalid formatting", () => {
    const context = {
      country: { callingCode: "+1", code: "US", label: "United States" },
      locale: "en-US",
      maxInputLength: 16,
      phase: "render" as const,
      previousDisplayValue: "",
      selection: null,
    };
    expect(() =>
      applyPhoneFormatAdapter(
        {
          id: "tests.unknown-status.v1",
          resolve: () => ({
            displayValue: "415",
            e164: null,
            selection: null,
            status: "unknown" as never,
          }),
        },
        "415",
        context,
      ),
    ).toThrow(/invalid status/u);
    expect(() =>
      applyPhoneFormatAdapter(
        {
          id: "tests.over-limit.v1",
          resolve: () => ({
            displayValue: "12345678901234567",
            e164: null,
            selection: null,
            status: "incomplete",
          }),
        },
        "415",
        context,
      ),
    ).toThrow(/over-limit/u);
    expect(() =>
      applyPhoneFormatAdapter(
        {
          id: "tests.wrong-prefix.v1",
          resolve: () => ({
            displayValue: "20 1234 5678",
            e164: "+442012345678",
            selection: null,
            status: "valid",
          }),
        },
        "2012345678",
        context,
      ),
    ).toThrow(/outside the selected country/u);
    expect(() =>
      applyPhoneFormatAdapter(
        {
          id: "tests.destructive-invalid.v1",
          resolve: () => ({
            displayValue: "",
            e164: null,
            selection: null,
            status: "invalid",
          }),
        },
        "call me",
        context,
      ),
    ).toThrow(/preserve invalid visible input/u);
  });
});

describe("MaskedField raw, formatted, and recovery contracts", () => {
  it("renders one native editor and explicitly serializes raw or formatted value", () => {
    const rawMarkup = renderToStaticMarkup(
      <Field description="Two letters, four digits, two letters." label="Inventory code">
        <MaskedField
          adapter={maskAdapter}
          defaultValue="AB2048QZ"
          maxInputLength={10}
          name="inventory"
        />
      </Field>,
    );
    expect(rawMarkup).toContain('type="text"');
    expect(rawMarkup).toContain('value="AB-2048-QZ"');
    expect(rawMarkup).toContain('name="inventory"');
    expect(rawMarkup).toContain('value="AB2048QZ"');
    expect(rawMarkup).toContain('data-serialization="raw"');

    const formattedMarkup = renderToStaticMarkup(
      <Field label="Formatted code">
        <MaskedField
          adapter={maskAdapter}
          defaultValue="AB2048QZ"
          maxInputLength={10}
          name="inventory"
          serialization="formatted"
        />
      </Field>,
    );
    expect(formattedMarkup).toContain('data-serialization="formatted"');
    expect(formattedMarkup.match(/value="AB-2048-QZ"/gu)).toHaveLength(2);
  });

  it("fails an adapter that deletes invalid input or expands beyond the boundary", () => {
    expect(() =>
      applyDeterministicMaskAdapter(
        {
          id: "tests.destructive-mask.v1",
          apply: () => ({
            formattedValue: "",
            rawValue: "",
            selection: null,
            status: "invalid",
          }),
        },
        "user text",
        {
          locale: "en-US",
          maxInputLength: 32,
          phase: "render",
          previousFormattedValue: "",
          selection: null,
        },
      ),
    ).toThrow(/preserve invalid visible input/u);

    expect(() =>
      applyDeterministicMaskAdapter(
        {
          id: "tests.expanding-mask.v1",
          apply: () => ({
            formattedValue: "123456789",
            rawValue: "1234",
            selection: null,
            status: "incomplete",
          }),
        },
        "1234",
        {
          locale: "en-US",
          maxInputLength: 8,
          phase: "render",
          previousFormattedValue: "",
          selection: null,
        },
      ),
    ).toThrow(/over-limit/u);
  });
});
