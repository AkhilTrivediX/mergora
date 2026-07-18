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
import { OtpField } from "../../../registry/source/components/otp-field/otp-field.tsx";
import { PinField } from "../../../registry/source/components/pin-field/pin-field.tsx";
import { MergoraProvider } from "../../../registry/source/components/provider/provider.tsx";

const root = resolve(import.meta.dirname, "../../..");
const componentsRoot = resolve(root, "registry/source/components");
const itemIds = ["otp-field", "pin-field"] as const;
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

describe("P4 OTP and PIN registry records", () => {
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

  it("uses semantic tokens, logical layout, coarse targets, forced colors, and reduced motion", () => {
    for (const itemId of itemIds) {
      const css = readItem(itemId, `${itemId}.css`);
      expect(css, itemId).not.toMatch(/#[\da-f]{3,8}\b|\brgba?\(|\bhsla?\(/iu);
      expect(css, itemId).not.toMatch(/\b(?:left|right)-(?:width|color|style|radius)\s*:/u);
      expect(css, itemId).toContain("@media (pointer: coarse)");
      expect(css, itemId).toContain("@media (forced-colors: active)");
      expect(css, itemId).toContain("@media (prefers-reduced-motion: reduce)");
    }
  });
});

describe("OtpField semantics", () => {
  it("renders one native one-time-code input with one Field label and decorative groups", () => {
    const markup = renderToStaticMarkup(
      <MergoraProvider>
        <Field
          description="Use the code from your authenticator."
          label="Verification code"
          required
        >
          <OtpField defaultValue="１２ 3a45" groups={[3, 3]} name="verification-code" required />
        </Field>
      </MergoraProvider>,
    );
    expect(markup.match(/<input\b/gu)).toHaveLength(1);
    expect(markup).toMatch(/<label[^>]+for="([^"]+)"[^>]*>[\s\S]+<input[^>]+id="\1"/u);
    expect(markup).toContain('type="text"');
    expect(markup).toContain('name="verification-code"');
    expect(markup).toContain('autoComplete="one-time-code"');
    expect(markup).toContain('inputMode="numeric"');
    expect(markup).toContain('maxLength="6"');
    expect(markup).toContain('value="12345"');
    expect(markup).toContain('data-slot="otp-field-grouping"');
    expect(markup).toContain('aria-hidden="true"');
    expect(markup).toContain("One-time code: 6 characters, grouped 3 and 3.");
    expect(markup).toMatch(/aria-describedby="[^"]+-description [^"]+-grouping"/u);
  });

  it("supports an explicit alphanumeric machine alphabet without exposing per-slot controls", () => {
    const markup = renderToStaticMarkup(
      <Field label="Recovery code">
        <OtpField characterSet="alphanumeric" defaultValue="a-1 b_2" groups={[2, 2]} />
      </Field>,
    );
    expect(markup).toContain('data-character-set="alphanumeric"');
    expect(markup).toContain('inputMode="text"');
    expect(markup).toContain('pattern="[0-9A-Za-z]*"');
    expect(markup).toContain('value="a1b2"');
    expect(markup.match(/<input\b/gu)).toHaveLength(1);
    expect(markup).not.toMatch(/role="group"|role="spinbutton"/u);
  });

  it("rejects empty, impossible, and non-integer grouping deterministically", () => {
    expect(() => renderToStaticMarkup(<OtpField groups={[]} />)).toThrow(RangeError);
    expect(() => renderToStaticMarkup(<OtpField groups={[1, 1]} />)).toThrow(/4 through 12/u);
    expect(() => renderToStaticMarkup(<OtpField groups={[2, 2.5]} />)).toThrow(/integers/u);
  });

  it("passes length and group values to localized message formatters", () => {
    const markup = renderToStaticMarkup(
      <MergoraProvider
        messages={{
          "otpField.grouping": ({ values }) =>
            `Localized length ${String(values.maximumLength)}; groups ${String(values.groups)}.`,
        }}
      >
        <Field label="Verification code">
          <OtpField groups={[2, 2, 2]} />
        </Field>
      </MergoraProvider>,
    );
    expect(markup).toContain("Localized length 6; groups 2,2,2.");
  });
});

describe("PinField semantics", () => {
  it("renders one secure reusable-secret input with explicit purpose and native hints", () => {
    const markup = renderToStaticMarkup(
      <MergoraProvider>
        <Field description="Use the reusable device secret." label="Access PIN" required>
          <PinField defaultValue="１２-34" name="access-pin" purpose="reusable-secret" required />
        </Field>
      </MergoraProvider>,
    );
    expect(markup.match(/<input\b/gu)).toHaveLength(1);
    expect(markup).toMatch(/<label[^>]+for="([^"]+)"[^>]*>[\s\S]+<input[^>]+id="\1"/u);
    expect(markup).toContain('type="password"');
    expect(markup).toContain('name="access-pin"');
    expect(markup).toContain('autoComplete="current-password"');
    expect(markup).toContain('inputMode="numeric"');
    expect(markup).toContain('maxLength="4"');
    expect(markup).toContain('value="1234"');
    expect(markup).toContain('data-purpose="reusable-secret"');
    expect(markup).toContain('data-paste-policy="allow"');
    expect(markup).toContain("This is not a one-time code.");
  });

  it("makes visible display and block paste policy explicit without a security claim", () => {
    const markup = renderToStaticMarkup(
      <Field label="Visible PIN">
        <PinField
          defaultValue="7351"
          displayMode="visible"
          pastePolicy="block"
          purpose="reusable-secret"
        />
      </Field>,
    );
    expect(markup).toContain('type="text"');
    expect(markup).toContain('data-display-mode="visible"');
    expect(markup).toContain('data-paste-policy="block"');
    expect(markup).not.toMatch(/encrypted|verified|secure storage/iu);
  });

  it("fails closed when an untyped JavaScript caller supplies a non-PIN purpose", () => {
    expect(() =>
      renderToStaticMarkup(<PinField purpose={"one-time-code" as "reusable-secret"} />),
    ).toThrow(/purpose must be exactly "reusable-secret"/u);
  });

  it("rejects unsupported PIN lengths deterministically", () => {
    expect(() => renderToStaticMarkup(<PinField length={3} purpose="reusable-secret" />)).toThrow(
      /4 through 12/u,
    );
    expect(() => renderToStaticMarkup(<PinField length={4.5} purpose="reusable-secret" />)).toThrow(
      /integer/u,
    );
  });

  it("passes the PIN length to localized purpose formatters", () => {
    const markup = renderToStaticMarkup(
      <MergoraProvider
        messages={{
          "pinField.purpose": ({ values }) =>
            `Localized reusable secret length ${String(values.length)}.`,
        }}
      >
        <Field label="Access PIN">
          <PinField length={6} purpose="reusable-secret" />
        </Field>
      </MergoraProvider>,
    );
    expect(markup).toContain("Localized reusable secret length 6.");
  });
});
