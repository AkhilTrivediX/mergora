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
  assertCollectionAsyncState,
  assertCollectionEntries,
  collectionValueFromKeys,
  flattenCollection,
  formatCollectionSelectionSummary,
  Listbox,
  normalizeCollectionValue,
  serializeCollectionKey,
  type CollectionEntry,
} from "../../../registry/source/components/listbox/listbox.tsx";
import { MergoraProvider } from "../../../registry/source/components/provider/provider.tsx";
import { Select } from "../../../registry/source/components/select/select.tsx";

const root = resolve(import.meta.dirname, "../../..");
const componentsRoot = resolve(root, "registry/source/components");
const itemIds = ["listbox", "select"] as const;
const entries = [
  {
    key: "teams",
    textValue: "Teams",
    type: "section",
    items: [
      { key: "accessibility", textValue: "Accessibility" },
      { disabled: true, key: "archived", textValue: "Archived" },
    ],
  },
  { key: 7, textValue: "Release engineering" },
] as const satisfies readonly CollectionEntry[];

function readItem(itemId: string, filename: string): string {
  return readFileSync(resolve(componentsRoot, itemId, filename), "utf8");
}

function readJson<T>(itemId: string, filename: string): T {
  return JSON.parse(readItem(itemId, filename)) as T;
}

function expectIdReferencesToResolve(markup: string): void {
  const ids = new Set([...markup.matchAll(/\sid="([^"]+)"/gu)].map((match) => match[1]));
  const references = [...markup.matchAll(/\saria-(?:labelledby|describedby)="([^"]+)"/gu)].flatMap(
    (match) => (match[1] ?? "").split(/\s+/u).filter(Boolean),
  );
  expect(references.length).toBeGreaterThan(0);
  for (const reference of references) expect(ids.has(reference), reference).toBe(true);
}

describe("P4 collection foundation registry records", () => {
  it("ships exactly the canonical twelve source files for Listbox and Select", () => {
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

  it("validates metadata, the story-state policy, and unreleased source status", () => {
    const expectedDependencies = {
      listbox: ["provider"],
      select: ["listbox", "native-select", "provider"],
    } satisfies Record<(typeof itemIds)[number], readonly string[]>;
    for (const itemId of itemIds) {
      const metadata = readJson<Record<string, unknown>>(itemId, `${itemId}.metadata.json`);
      const stories = readJson<StoryStateMatrix>(itemId, `${itemId}.stories.json`);
      const source = readJson<Record<string, unknown>>(itemId, `${itemId}.source.json`);
      expect(validateSchemaDocument("component-metadata", metadata), itemId).toMatchObject({
        errors: [],
        ok: true,
      });
      expect(validateStoryStateMatrix(stories), itemId).toMatchObject({ issues: [], ok: true });
      expect(source).toMatchObject({
        entryPath: `registry/source/components/${itemId}/${itemId}.tsx`,
        id: itemId,
        itemDependencies: expectedDependencies[itemId],
        outputRole: "component",
      });
      expect(readJson(itemId, `${itemId}.status.json`)).toMatchObject({
        distributionStatus: "not-generated",
        evidenceStatus: "incomplete",
        implementationStatus: "source-present-unreleased",
        recordedEvidence: [],
        releaseStatus: "unreleased",
      });
    }
  });

  it("uses semantic tokens, logical layout, narrow containers, and preference fallbacks", () => {
    for (const itemId of itemIds) {
      const css = readItem(itemId, `${itemId}.css`);
      expect(css, itemId).not.toMatch(/#[\da-f]{3,8}\b|\brgba?\(|\bhsla?\(/iu);
      expect(css, itemId).not.toMatch(/\b(?:margin|padding|border)-(?:left|right)\s*:/u);
      expect(css, itemId).toContain("@container (max-width: 20rem)");
      expect(css, itemId).toContain("@media (forced-colors: active)");
      expect(css, itemId).toContain("@media (prefers-reduced-motion: reduce)");
      expect(css, itemId).toContain("var(--mrg-semantic-size-target-preferred)");
      expect(css, itemId).toContain("var(--mrg-component-focus-indicator-contrast-background)");
    }
  });
});

describe("shared stable collection and selection model", () => {
  it("flattens sections and preserves canonical collection order", () => {
    expect(flattenCollection(entries).map((item) => item.key)).toEqual([
      "accessibility",
      "archived",
      7,
    ]);
    expect(normalizeCollectionValue("multiple", [7, "accessibility"], entries)).toEqual([
      7,
      "accessibility",
    ]);
    expect(collectionValueFromKeys("multiple", [7, "accessibility"], entries)).toEqual([
      "accessibility",
      7,
    ]);
    expect(collectionValueFromKeys("single", [7], entries)).toBe(7);
  });

  it("rejects unstable, ambiguous, duplicate, and unavailable keys", () => {
    expect(serializeCollectionKey(7)).toBe("7");
    expect(() => serializeCollectionKey(1.5)).toThrow(/safe integers/u);
    expect(() => serializeCollectionKey(" surrounded ")).toThrow(/surrounding whitespace/u);
    expect(() =>
      assertCollectionEntries([
        { key: 1, textValue: "Numeric" },
        { key: "1", textValue: "String" },
      ]),
    ).toThrow(/form serialization/u);
    expect(() =>
      assertCollectionEntries([{ key: "empty", items: [], textValue: "Empty", type: "section" }]),
    ).toThrow(/at least one item/u);
    expect(() => normalizeCollectionValue("single", "missing", entries)).toThrow(
      /unavailable key/u,
    );
    expect(() => normalizeCollectionValue("multiple", [7, 7], entries)).toThrow(/repeat a key/u);
  });

  it("requires recoverable async failures and executable pagination states", () => {
    expect(() =>
      assertCollectionAsyncState({
        errorMessage: "The request failed.",
        onRetry: () => undefined,
        status: "error",
      }),
    ).not.toThrow();
    expect(() =>
      assertCollectionAsyncState({
        hasMore: true,
        onLoadMore: () => undefined,
        status: "loading-more",
      }),
    ).not.toThrow();
    expect(() => assertCollectionAsyncState({ errorMessage: "Failed", status: "error" })).toThrow(
      /onRetry/u,
    );
    expect(() => assertCollectionAsyncState({ hasMore: true, status: "idle" })).toThrow(
      /onLoadMore/u,
    );
    expect(() => assertCollectionAsyncState({ status: "loading-more" })).toThrow(/hasMore=true/u);
    expect(() =>
      assertCollectionAsyncState({ errorMessage: "Not an error state", status: "loading" }),
    ).toThrow(/only valid in the error state/u);
  });

  it("uses locale-owned lists and numbers without concatenating English prose", () => {
    const context = {
      count: 3,
      omittedCount: 1,
      visibleTextValues: ["Barrierefreiheit", "Veröffentlichung"],
    } as const;
    const german = formatCollectionSelectionSummary({ ...context, locale: "de-DE" });
    const arabic = formatCollectionSelectionSummary({
      count: 3,
      locale: "ar-EG",
      omittedCount: 1,
      visibleTextValues: ["القاهرة", "عمّان"],
    });
    expect(german).toBe(
      new Intl.ListFormat("de-DE", { style: "long", type: "conjunction" }).format([
        ...context.visibleTextValues,
        `… (+${new Intl.NumberFormat("de-DE").format(1)})`,
      ]),
    );
    expect(arabic).toBe(
      new Intl.ListFormat("ar-EG", { style: "long", type: "conjunction" }).format([
        "القاهرة",
        "عمّان",
        `… (+${new Intl.NumberFormat("ar-EG").format(1)})`,
      ]),
    );
    expect(`${german} ${arabic}`).not.toMatch(/\b(?:selected|plus|more)\b/iu);
  });
});

describe("server-rendered semantic contracts", () => {
  it("removes selected-value context completely when the enhancement is disabled", () => {
    const listboxMarkup = renderToStaticMarkup(
      <MergoraProvider>
        <Listbox
          defaultValue="accessibility"
          entries={entries}
          formatSelectionSummary={false}
          label="Plain owner"
        />
      </MergoraProvider>,
    );
    const selectMarkup = renderToStaticMarkup(
      <MergoraProvider>
        <Select
          entries={entries}
          formatSelectionSummary={false}
          label="Plain default owner"
          value="accessibility"
        />
      </MergoraProvider>,
    );
    expect(listboxMarkup).not.toContain("listbox-selection-summary");
    expect(selectMarkup).not.toContain("select-selection-summary");
    expect(listboxMarkup).not.toContain("-selection-summary");
    expect(selectMarkup).not.toContain("-selection-summary");
  });

  it("invokes and connects selected-value context only when enabled and populated", () => {
    const markup = renderToStaticMarkup(
      <MergoraProvider>
        <Listbox
          defaultValue="accessibility"
          entries={entries}
          formatSelectionSummary={({ visibleTextValues }) =>
            `Current owner: ${visibleTextValues.join(", ")}`
          }
          label="Contextual owner"
        />
      </MergoraProvider>,
    );
    expect(markup).toContain('data-slot="listbox-selection-summary"');
    expect(markup).toContain("Current owner: Accessibility");
    expect(markup).toMatch(/aria-describedby="[^"]*selection-summary/u);
  });

  it("resolves option label and description IDREFs for rich collection records", () => {
    const markup = renderToStaticMarkup(
      <MergoraProvider>
        <Listbox
          entries={[
            {
              description: "Used to verify recovery announcements.",
              key: "accessibility",
              label: <strong>Accessibility</strong>,
              textValue: "Accessibility",
            },
          ]}
          label="Review discipline"
        />
      </MergoraProvider>,
    );
    const optionTag = markup.match(/<div(?=[^>]*role="option")[^>]*>/u)?.[0];
    expect(optionTag).toBeDefined();
    expect(optionTag).toContain("aria-labelledby=");
    expect(optionTag).toContain("aria-describedby=");
    expectIdReferencesToResolve(markup);
    expect(markup).toContain(">Accessibility</strong>");
    expect(markup).toContain(">Used to verify recovery announcements.</span>");
  });

  it("renders a labelled multi-select listbox with repeated successful controls", () => {
    const markup = renderToStaticMarkup(
      <MergoraProvider>
        <Listbox
          defaultValue={["accessibility", 7]}
          entries={entries}
          label="Review teams"
          name="review-team"
          selectionMode="multiple"
        />
      </MergoraProvider>,
    );
    expect(markup).toContain('role="listbox"');
    expect(markup).toContain('aria-multiselectable="true"');
    expect(markup.match(/name="review-team"/gu)).toHaveLength(2);
    expect(markup).toContain('value="accessibility"');
    expect(markup).toContain('value="7"');
  });

  it("renders explicit native Select as one labelled single successful control", () => {
    const markup = renderToStaticMarkup(
      <MergoraProvider>
        <Select
          defaultValue={7}
          entries={entries}
          label="Default owner"
          name="default-owner"
          presentation="native"
          required
        />
      </MergoraProvider>,
    );
    expect(markup).toContain('data-presentation="native"');
    expect(markup).toContain("<select");
    expect(markup).not.toContain(" multiple=");
    expect(markup).toContain('name="default-owner"');
    expect(markup).toContain('required=""');
    expect(markup).toContain('value="7" selected=""');
  });

  it("keeps controlled native Select ownership separate from its ignored default", () => {
    const markup = renderToStaticMarkup(
      <MergoraProvider>
        <Select
          defaultValue={7}
          entries={entries}
          label="Controlled owner"
          name="controlled-owner"
          onValueChange={() => undefined}
          presentation="native"
          value="accessibility"
        />
      </MergoraProvider>,
    );
    expect(markup.match(/selected=""/gu)).toHaveLength(1);
    expect(markup).toContain('value="accessibility" selected=""');
    expect(markup).not.toContain('value="7" selected=""');
  });

  it("renders important Listbox state and relationships in the server response", () => {
    const markup = renderToStaticMarkup(
      <MergoraProvider>
        <Listbox
          asyncState={{ status: "loading" }}
          description="Server-owned collection context."
          disabled
          entries={entries}
          errorMessage="Choose an available owner."
          id="server-state-listbox"
          invalid
          label="Server state"
          readOnly
          required
        />
      </MergoraProvider>,
    );
    const fieldTag = markup.match(/<div(?=[^>]*data-slot="listbox-field")[^>]*>/u)?.[0];
    const listboxTag = markup.match(/<div(?=[^>]*role="listbox")[^>]*>/u)?.[0];
    expect(fieldTag).toBeDefined();
    expect(listboxTag).toBeDefined();
    expect(fieldTag).toContain('aria-busy="true"');
    expect(fieldTag).toContain('aria-disabled="true"');
    expect(fieldTag).toContain('aria-invalid="true"');
    expect(fieldTag).toContain('data-readonly="true"');
    expect(fieldTag).toContain('data-required="true"');
    expect(listboxTag).toContain('aria-describedby="server-state-listbox-description"');
  });

  it("lets React Aria own the enhanced description id without duplicate references", () => {
    const markup = renderToStaticMarkup(
      <MergoraProvider>
        <Select
          aria-describedby="external-select-context"
          description="Persistent selection context."
          entries={entries}
          label="Enhanced owner"
          value="accessibility"
        />
      </MergoraProvider>,
    );
    const describedByValues = [...markup.matchAll(/aria-describedby="([^"]+)"/gu)].map(
      (match) => match[1] ?? "",
    );
    expect(describedByValues.length).toBeGreaterThan(0);
    for (const value of describedByValues) {
      const references = value.split(/\s+/u);
      expect(new Set(references).size).toBe(references.length);
    }
    const ids = [...markup.matchAll(/\sid="([^"]+)"/gu)].map((match) => match[1]);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("rejects native-only parity gaps instead of discarding enhanced content", () => {
    const describedEntries = [
      { description: "Extra context", key: "rich", textValue: "Rich item" },
    ] satisfies readonly CollectionEntry[];
    expect(() =>
      renderToStaticMarkup(
        <MergoraProvider>
          <Select entries={describedEntries} label="Rich item" presentation="native" />
        </MergoraProvider>,
      ),
    ).toThrow(/does not silently discard item descriptions/u);
    expect(() =>
      renderToStaticMarkup(
        <MergoraProvider>
          <Select
            entries={entries}
            label="Virtual native"
            presentation="native"
            virtualization={{ estimatedItemSize: 48 }}
          />
        </MergoraProvider>,
      ),
    ).toThrow(/cannot be virtualized/u);
  });
});
