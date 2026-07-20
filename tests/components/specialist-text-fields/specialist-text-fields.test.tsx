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
  PasswordField,
  type PasswordFieldRule,
} from "../../../registry/source/components/password-field/password-field.tsx";
import { MergoraProvider } from "../../../registry/source/components/provider/provider.tsx";
import { SearchField } from "../../../registry/source/components/search-field/search-field.tsx";

const root = resolve(import.meta.dirname, "../../..");
const componentsRoot = resolve(root, "registry/source/components");
const itemIds = ["password-field", "search-field"] as const;
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

describe("P4 specialist text-field registry records", () => {
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

  it("uses semantic tokens, logical layout, coarse targets, and forced-color fallbacks", () => {
    for (const itemId of itemIds) {
      const css = readItem(itemId, `${itemId}.css`);
      expect(css, itemId).not.toMatch(/#[\da-f]{3,8}\b|\brgba?\(|\bhsla?\(/iu);
      expect(css, itemId).not.toMatch(/\b(?:left|right)-(?:width|color|style|radius)\s*:/u);
      expect(css, itemId).toContain("@media (pointer: coarse)");
      expect(css, itemId).toContain("@media (forced-colors: active)");
    }
  });
});

describe("PasswordField semantics", () => {
  const rules: readonly PasswordFieldRule[] = [
    { id: "length", label: "At least 12 characters", validate: (value) => value.length >= 12 },
    { id: "number", label: "Contains a number", validate: (value) => /\d/u.test(value) },
  ];

  it("removes the optional requirement checklist and search status relationships cleanly", () => {
    const resolvedMessages: string[] = [];
    const plain = renderToStaticMarkup(
      <MergoraProvider
        messages={{
          "passwordField.ruleMet": () => {
            resolvedMessages.push("ruleMet");
            return "Met";
          },
          "passwordField.ruleUnmet": () => {
            resolvedMessages.push("ruleUnmet");
            return "Not met";
          },
          "passwordField.rules": () => {
            resolvedMessages.push("rules");
            return "Password requirements";
          },
          "passwordField.capsLock": () => {
            resolvedMessages.push("capsLock");
            return "Caps Lock is on";
          },
        }}
      >
        <PasswordField defaultValue="Workbench2026" rules={[]} />
        <SearchField defaultValue="dialog" status={{ state: "idle" }} />
      </MergoraProvider>,
    );
    expect(plain).not.toContain('data-slot="password-field-rules"');
    expect(plain).not.toContain('data-slot="password-field-caps-lock"');
    expect(plain).not.toContain('data-slot="search-field-status"');
    expect(plain).not.toContain('aria-busy="true"');
    expect(resolvedMessages).toEqual([]);

    const enhanced = renderToStaticMarkup(
      <>
        <PasswordField defaultValue="Workbench2026" rules={rules} />
        <SearchField
          defaultValue="dialog"
          status={{ message: "3 results available", state: "results" }}
        />
      </>,
    );
    expect(enhanced).toContain('data-slot="password-field-rules"');
    expect(enhanced).toContain('aria-label="Password requirements"');
    expect(enhanced).toContain('data-slot="search-field-status"');
    expect(enhanced).toContain('role="status"');
  });

  it("preserves the native credential input, Field relationships, and explicit reveal state", () => {
    const markup = renderToStaticMarkup(
      <MergoraProvider>
        <Field description="Use the saved credential." label="Password" required>
          <PasswordField
            autoComplete="current-password"
            defaultValue="Mergora!2026"
            name="password"
            rules={rules}
          />
        </Field>
      </MergoraProvider>,
    );
    expect(markup).toMatch(/<label[^>]+for="([^"]+)"[^>]*>[\s\S]+<input[^>]+id="\1"/u);
    expect(markup).toContain('type="password"');
    expect(markup).toContain('name="password"');
    expect(markup).toContain('autoComplete="current-password"');
    expect(markup).toContain('aria-pressed="false"');
    expect(markup).toContain('aria-label="Show password"');
    expect(markup).toContain("Met:");
    expect(markup).toContain("At least 12 characters");
    expect(markup).toMatch(/aria-describedby="[^"]+-description [^"]+-rules"/u);
  });

  it("reports Field errors and requirement state without a strength claim", () => {
    const markup = renderToStaticMarkup(
      <Field error="Password does not match." label="Password">
        <PasswordField defaultValue="short" rules={rules} />
      </Field>,
    );
    expect(markup).toContain('aria-invalid="true"');
    expect(markup).toMatch(/aria-errormessage="[^"]+-error"/u);
    expect(markup).toContain("Not met:");
    expect(markup).not.toMatch(/strength|entropy|crack/iu);
  });

  it("rejects empty and duplicate rule IDs deterministically", () => {
    expect(() =>
      renderToStaticMarkup(
        <PasswordField rules={[{ id: "", label: "Invalid", validate: () => false }]} />,
      ),
    ).toThrow(RangeError);
    expect(() =>
      renderToStaticMarkup(
        <PasswordField
          rules={[
            { id: "same", label: "One", validate: () => false },
            { id: "same", label: "Two", validate: () => true },
          ]}
        />,
      ),
    ).toThrow(/must be unique/u);
  });

  it("rejects inaccessible rule and checklist labels without emitting empty semantics", () => {
    for (const label of [null, false, "   ", <></>, <span key="empty" />]) {
      expect(() =>
        renderToStaticMarkup(
          <PasswordField rules={[{ id: "label", label, validate: () => false }]} />,
        ),
      ).toThrow(/requires a non-empty label/u);
    }

    expect(() =>
      renderToStaticMarkup(
        <PasswordField
          rules={[{ id: "length", label: "At least 12 characters", validate: () => false }]}
          rulesLabel=" "
        />,
      ),
    ).toThrow(/rulesLabel must be a non-empty string/u);
    expect(() =>
      renderToStaticMarkup(
        <MergoraProvider messages={{ "passwordField.rules": () => " " }}>
          <PasswordField
            rules={[{ id: "length", label: "At least 12 characters", validate: () => false }]}
          />
        </MergoraProvider>,
      ),
    ).toThrow(/rulesLabel must be a non-empty string/u);
  });
});

describe("SearchField semantics", () => {
  it("preserves native search and submit semantics while associating results", () => {
    const markup = renderToStaticMarkup(
      <MergoraProvider>
        <form aria-label="Catalog search" role="search">
          <Field label="Query">
            <SearchField
              defaultValue="dialog"
              name="query"
              resultsId="catalog-results"
              status={{ message: "4 results available.", state: "results" }}
              submitLabel="Search"
            />
          </Field>
          <ul id="catalog-results">
            <li>Dialog</li>
          </ul>
        </form>
      </MergoraProvider>,
    );
    expect(markup).toContain('type="search"');
    expect(markup).toContain('name="query"');
    expect(markup).toContain('aria-controls="catalog-results"');
    expect(markup).toMatch(/aria-describedby="[^"]+-search-status"/u);
    expect(markup).toContain('type="button"');
    expect(markup).toContain('aria-label="Clear search"');
    expect(markup).toContain('type="submit"');
    expect(markup).toContain("4 results available.");
  });

  it("exposes loading and error state with bounded programmatic relationships", () => {
    const loadingMarkup = renderToStaticMarkup(
      <Field label="Query">
        <SearchField status={{ message: "Searching…", state: "loading" }} />
      </Field>,
    );
    expect(loadingMarkup).toContain('aria-busy="true"');
    expect(loadingMarkup).toContain('role="status"');

    const errorMarkup = renderToStaticMarkup(
      <Field label="Query">
        <SearchField
          resultsId="failed-results"
          status={{ message: "Search unavailable.", state: "error" }}
        />
      </Field>,
    );
    expect(errorMarkup).toContain('aria-invalid="true"');
    expect(errorMarkup).toContain('role="alert"');
    expect(errorMarkup).toMatch(/aria-errormessage="[^"]+-search-status"/u);
    expect(errorMarkup).toContain('aria-controls="failed-results"');
  });

  it("suppresses blank status messages without linking empty live or error regions", () => {
    for (const state of ["loading", "results", "empty", "error"] as const) {
      for (const message of [null, false, "   "] as const) {
        const markup = renderToStaticMarkup(
          <SearchField status={{ message: message as unknown as string, state }} />,
        );
        expect(markup).not.toContain('data-slot="search-field-status"');
        expect(markup).not.toContain("-search-status");
        expect(markup).not.toContain("aria-live");
        expect(markup).not.toContain("aria-errormessage");
        expect(markup).not.toContain('role="alert"');
        expect(markup).not.toContain('role="status"');
        expect(markup).not.toContain('aria-busy="true"');
        expect(markup).not.toContain('aria-invalid="true"');
      }
    }
  });
});
