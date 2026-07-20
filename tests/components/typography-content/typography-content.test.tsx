import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import {
  validateStoryStateMatrix,
  type StoryStateMatrix,
} from "../../../packages/test-utils/src/index.ts";
import { validateSchemaDocument } from "../../../registry/schemas/index.ts";
import { Blockquote } from "../../../registry/source/components/blockquote/blockquote.tsx";
import { Code } from "../../../registry/source/components/code/code.tsx";
import {
  CodeBlock,
  codeBlockLines,
} from "../../../registry/source/components/code-block/code-block.tsx";
import {
  DescriptionDetails,
  DescriptionList,
  DescriptionTerm,
} from "../../../registry/source/components/description-list/description-list.tsx";
import {
  DiffViewer,
  formatUnifiedDiff,
  type DiffLine,
} from "../../../registry/source/components/diff-viewer/diff-viewer.tsx";
import { Heading } from "../../../registry/source/components/heading/heading.tsx";
import {
  buildJsonTree,
  JsonViewer,
  serializeJsonValue,
  type JsonValue,
} from "../../../registry/source/components/json-viewer/json-viewer.tsx";
import { formatKbdKey, Kbd, KbdChord } from "../../../registry/source/components/kbd/kbd.tsx";
import { Prose } from "../../../registry/source/components/prose/prose.tsx";
import { MergoraProvider } from "../../../registry/source/components/provider/provider.tsx";
import { Text } from "../../../registry/source/components/text/text.tsx";

const root = resolve(import.meta.dirname, "../../..");
const componentsRoot = resolve(root, "registry/source/components");
const itemIds = [
  "blockquote",
  "code",
  "code-block",
  "description-list",
  "diff-viewer",
  "heading",
  "json-viewer",
  "kbd",
  "prose",
  "text",
] as const;
const providerDependentItems = new Set<(typeof itemIds)[number]>([
  "code-block",
  "diff-viewer",
  "json-viewer",
  "kbd",
]);

const requiredRecordSuffixes = [
  "anatomy.json",
  "api.json",
  "contract.json",
  "metadata.json",
  "source.json",
  "status.json",
  "stories.json",
] as const;

function readItem(itemId: (typeof itemIds)[number], filename: string): string {
  return readFileSync(resolve(componentsRoot, itemId, filename), "utf8");
}

function readJson<T>(itemId: (typeof itemIds)[number], filename: string): T {
  return JSON.parse(readItem(itemId, filename)) as T;
}

describe("P2 typography and content canonical records", () => {
  it("ships the complete source record for every item without release or evidence claims", () => {
    for (const itemId of itemIds) {
      const files = new Set(readdirSync(resolve(componentsRoot, itemId)));
      for (const suffix of requiredRecordSuffixes) {
        expect(files, `${itemId} is missing ${itemId}.${suffix}`).toContain(`${itemId}.${suffix}`);
      }
      expect(files).toContain(`${itemId}.tsx`);
      expect(files).toContain(`${itemId}.css`);
      expect(files).toContain(`${itemId}-css.d.ts`);
      expect(files).toContain("index.ts");
      expect(files).toContain("README.md");

      const manifest = readJson<Record<string, unknown>>(itemId, `${itemId}.source.json`);
      expect(Object.keys(manifest).sort(), itemId).toEqual([
        "declaredImports",
        "entryPath",
        "id",
        "itemDependencies",
        "outputRole",
      ]);
      const usesProvider = providerDependentItems.has(itemId);
      expect(manifest).toMatchObject({
        declaredImports: [
          ...(usesProvider ? ["../provider/index.js"] : []),
          `./${itemId}.css`,
          "react",
        ],
        entryPath: `registry/source/components/${itemId}/${itemId}.tsx`,
        id: itemId,
        itemDependencies: usesProvider ? ["provider"] : [],
        outputRole: "component",
      });

      const status = readJson<{
        distributionStatus: string;
        evidenceStatus: string;
        implementationStatus: string;
        promotionDelta: string[];
        recordedEvidence: unknown[];
        releaseStatus: string;
      }>(itemId, `${itemId}.status.json`);
      expect(status).toMatchObject({
        distributionStatus: "not-generated",
        evidenceStatus: "incomplete",
        implementationStatus: "source-present-unreleased",
        recordedEvidence: [],
        releaseStatus: "unreleased",
      });
      expect(status.promotionDelta.length).toBeGreaterThanOrEqual(8);

      const claims = [
        readItem(itemId, `${itemId}.metadata.json`),
        readItem(itemId, `${itemId}.status.json`),
        readItem(itemId, `${itemId}.contract.json`),
        readItem(itemId, "README.md"),
      ].join("\n");
      expect(claims).not.toMatch(/"(?:maturity|publishedMaturity)"\s*:\s*"stable"/iu);
      expect(claims).not.toMatch(/"recordedEvidence"\s*:\s*\[[^\]]+\]/u);
      expect(claims).toContain("source-present-unreleased");
    }
  });

  it("validates every metadata schema and complete story-state policy", () => {
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

  it("uses token variables, logical properties, and no undeclared behavior engine", () => {
    const tokenCss = readFileSync(
      resolve(root, "packages/tokens/src/generated/tokens.css"),
      "utf8",
    );
    const declaredTokens = new Set(
      [...tokenCss.matchAll(/(--mrg-[a-z0-9-]+)\s*:/gu)].map((match) => match[1]),
    );
    for (const itemId of itemIds) {
      const css = readItem(itemId, `${itemId}.css`);
      const source = readItem(itemId, `${itemId}.tsx`);
      const localTokens = new Set(
        [...`${css}\n${source}`.matchAll(/["']?(--mrg-[a-z0-9-]+)["']?\s*:/gu)].map(
          (match) => match[1],
        ),
      );
      for (const reference of css.matchAll(/var\((--mrg-[a-z0-9-]+)/gu)) {
        expect(
          declaredTokens.has(reference[1]) || localTokens.has(reference[1]),
          `${itemId} references undeclared token ${String(reference[1])}`,
        ).toBe(true);
      }
      expect(css).not.toMatch(/#[0-9a-f]{3,8}|(?:oklch|rgb|hsl)\(/iu);
      expect(css).not.toMatch(/^\s*(?:margin|padding|inset|border)-(?:left|right)\s*:/mu);
      expect(source).not.toMatch(
        /from\s+["'](?:@radix-ui|@ark-ui|@zag-js|@headlessui|@base-ui|react-aria-components|@react-aria)/u,
      );
    }
  });
});

describe("P2 typography and content semantic rendering", () => {
  it("renders explicit heading levels, native text/code/prose, and accessible truncation", () => {
    const markup = renderToStaticMarkup(
      <main>
        <Heading level={1} size="display">
          Release evidence
        </Heading>
        <Text as="p" tone="muted">
          Source present.
        </Text>
        <Text fullValue="immutable-reference-with-complete-value" truncate>
          immutable-reference-with-complete-value
        </Text>
        <Prose as="section" aria-labelledby="details">
          <Heading id="details" level={2}>
            Details
          </Heading>
          <p>
            Run <Code>mergora audit</Code>.
          </p>
        </Prose>
      </main>,
    );

    expect(markup).toContain("<h1");
    expect(markup).toContain('data-level="1"');
    expect(markup).toContain("<h2");
    expect(markup).toContain('data-slot="text"');
    expect(markup).toContain('data-truncate="true"');
    expect(markup).toContain('tabindex="0"');
    expect(markup).toContain('aria-label="immutable-reference-with-complete-value"');
    expect(markup).toContain("<code");
    expect(markup).toContain('data-bidi-isolated="false"');
    expect(markup).toContain("<section");
    expect(markup).not.toContain('role="heading"');
  });

  it("requires an explicit full value for truncated composite children", () => {
    expect(() =>
      renderToStaticMarkup(
        <Text truncate>
          <span>Composite</span>
        </Text>,
      ),
    ).toThrow("Text requires fullValue");
  });

  it("preserves quote, citation, description-list, and key semantics", () => {
    const markup = renderToStaticMarkup(
      <>
        <Blockquote
          attribution="Maintainer"
          citeUrl="https://example.com/source"
          sourceTitle="Source contract"
        >
          <p>Evidence before claims.</p>
        </Blockquote>
        <DescriptionList layout="columns">
          <DescriptionTerm>Version</DescriptionTerm>
          <DescriptionDetails>0.1.0</DescriptionDetails>
        </DescriptionList>
        <Kbd spokenLabel="Escape key">Esc</Kbd>
        <KbdChord keys={[{ key: "Meta", spokenLabel: "Command" }, { key: "K" }]} platform="mac" />
      </>,
    );
    expect(markup).toContain("<figure");
    expect(markup).toContain('<blockquote cite="https://example.com/source"');
    expect(markup).toContain("<figcaption");
    expect(markup).toContain("<cite");
    expect(markup).toContain("<dl");
    expect(markup).toContain("<dt");
    expect(markup).toContain("<dd");
    expect(markup).toContain("<kbd");
    expect(markup).toContain('aria-label="Command plus K"');
    expect(markup).toContain("⌘");
    expect(formatKbdKey("Meta", "windows")).toBe("Win");
  });

  it("normalizes code, renders spoken highlights, and keeps copy feedback scoped", () => {
    expect(codeBlockLines("a\r\nb\rc")).toEqual(["a", "b", "c"]);
    const markup = renderToStaticMarkup(
      <CodeBlock code={"const a = 1;\nconst b = 2;"} highlightedLines={[2]} label="Example" />,
    );
    expect(markup).toContain('role="region"');
    expect(markup).toContain('aria-label="Example"');
    expect(markup).toContain("<pre");
    expect(markup).toContain("<code");
    expect(markup).toContain('data-highlighted="true"');
    expect(markup).toContain("Highlighted: ");
    expect(markup).toContain('role="status"');

    const plain = renderToStaticMarkup(
      <CodeBlock code="const a = 1;" copyable={false} label="Plain example" />,
    );
    expect(plain).toContain('data-copyable="false"');
    expect(plain).not.toContain('data-slot="code-block-copy"');
    expect(plain).not.toContain('role="status"');
  });

  it("removes inline bidirectional isolation when the enhancement is disabled", () => {
    const enhanced = renderToStaticMarkup(<Code isolateBidi>status=ready</Code>);
    const plain = renderToStaticMarkup(<Code isolateBidi={false}>status=ready</Code>);
    expect(enhanced).toContain('data-bidi-isolated="true"');
    expect(plain).toContain('data-bidi-isolated="false"');
  });
});

describe("P2 structured viewers", () => {
  const lines: readonly DiffLine[] = [
    { content: "same", kind: "context", newLineNumber: 1, oldLineNumber: 1 },
    { content: "old", kind: "removed", oldLineNumber: 2 },
    { content: "new", kind: "added", newLineNumber: 2 },
    { content: "changed", kind: "changed", newLineNumber: 3, oldLineNumber: 3 },
  ];

  it("renders unified and split native tables with text markers and roving rows", () => {
    expect(formatUnifiedDiff(lines)).toBe(" same\n−old\n+new\n~changed");
    const unified = renderToStaticMarkup(<DiffViewer label="Source diff" lines={lines} />);
    const split = renderToStaticMarkup(
      <DiffViewer label="Source diff" lines={lines} mode="split" />,
    );
    expect(unified).toContain("<table");
    expect(unified).toContain("Added");
    expect(unified).toContain("Removed");
    expect(unified).toContain("Changed");
    expect(unified).toContain('tabindex="0"');
    expect(unified).toContain('tabindex="-1"');
    expect(split).toContain("Previous content");
    expect(split).toContain('data-slot="diff-old-content"');
    expect(split).toContain('data-slot="diff-new-content"');
    expect(renderToStaticMarkup(<DiffViewer label="Empty" lines={[]} />)).toContain(
      "No differences.",
    );
  });

  it("renders a plain diff table without summary, copy, navigation, events, or live output", () => {
    const markup = renderToStaticMarkup(
      <DiffViewer
        copyable={false}
        label="Plain source diff"
        lineNavigation={false}
        lines={lines}
        showSummary={false}
      />,
    );
    expect(markup).toContain('data-line-navigation="false"');
    expect(markup).toContain('data-copyable="false"');
    expect(markup).toContain('data-show-summary="false"');
    expect(markup).not.toContain('data-slot="diff-summary"');
    expect(markup).not.toContain('data-slot="diff-copy"');
    expect(markup).not.toContain("data-active=");
    expect(markup).not.toContain('tabindex="-1"');
    expect(markup).not.toContain('role="status"');
  });

  it("builds deterministic JSON paths, relationships, and serialization", () => {
    const value = {
      "release-state": { published: false },
      rows: [1, 2],
      title: "Mergora",
    } as const;
    const nodes = buildJsonTree(value);
    expect(nodes.map((node) => node.path)).toEqual([
      "$",
      '$["release-state"]',
      '$["release-state"].published',
      "$.rows",
      "$.rows[0]",
      "$.rows[1]",
      "$.title",
    ]);
    expect(nodes.find((node) => node.path === "$.rows[1]")).toMatchObject({
      level: 3,
      parentPath: "$.rows",
      position: 2,
      setSize: 2,
      type: "number",
    });
    expect(serializeJsonValue(value)).toContain('"published": false');
  });

  it("preserves repeated acyclic references and marks only true ancestor cycles", () => {
    const shared = { status: "shared" } as const;
    const repeated = { a: shared, b: shared } as const;
    expect(serializeJsonValue(repeated)).toBe(
      '{\n  "a": {\n    "status": "shared"\n  },\n  "b": {\n    "status": "shared"\n  }\n}',
    );

    const cyclic: { self?: unknown; status: string } = { status: "cyclic" };
    cyclic.self = cyclic;
    expect(serializeJsonValue(cyclic as unknown as JsonValue)).toContain('"self": "[Circular]"');
  });

  it("renders a flat ARIA tree with complete hierarchy and no virtualization claim", () => {
    const markup = renderToStaticMarkup(
      <JsonViewer
        defaultExpandedDepth={2}
        label="Registry response"
        value={{ release: { published: false }, version: "0.1.0" }}
      />,
    );
    expect(markup).toContain('data-virtualized="false"');
    expect(markup).toContain('role="tree"');
    expect(markup).toContain('role="treeitem"');
    expect(markup).toContain('aria-level="1"');
    expect(markup).toContain('aria-expanded="true"');
    expect(markup).toContain('aria-selected="true"');
    expect(markup).toContain('aria-posinset="1"');
    expect(markup).toContain('aria-setsize="1"');
    expect(markup).toContain('data-path="$.release.published"');
  });

  it("keeps the JSON tree complete when copy and visible path context are disabled", () => {
    const markup = renderToStaticMarkup(
      <JsonViewer
        copyable={false}
        label="Plain JSON"
        showActivePath={false}
        value={{ ready: true }}
      />,
    );
    expect(markup).toContain('role="tree"');
    expect(markup).toContain('data-copyable="false"');
    expect(markup).toContain('data-show-active-path="false"');
    expect(markup).not.toContain('data-slot="json-active-path"');
    expect(markup).not.toContain('data-slot="json-copy-path"');
    expect(markup).not.toContain('data-slot="json-copy-value"');
    expect(markup).not.toContain('role="status"');
  });

  it("resolves built-in viewer and chord text through stable provider message keys", () => {
    const markup = renderToStaticMarkup(
      <MergoraProvider
        locale="de-DE"
        messages={{
          "codeBlock.copy": "Code kopieren",
          "codeBlock.highlighted": "Hervorgehoben: ",
          "diffViewer.column.change": "Änderung",
          "diffViewer.kind.added": "Hinzugefügt",
          "diffViewer.summary": ({ locale, values }) =>
            `${new Intl.NumberFormat(locale).format(Number(values.added))} hinzugefügt; ${new Intl.NumberFormat(locale).format(Number(values.removed))} entfernt`,
          "jsonViewer.copyPath": "Pfad kopieren",
          "jsonViewer.node": "{type}: {key} ({state})",
          "jsonViewer.rootKey": "Wurzel",
          "jsonViewer.type.object": "Objekt",
          "kbd.chordLabel": ({ values }) =>
            Array.isArray(values.keys) ? values.keys.join(" plus auf Deutsch ") : "",
        }}
      >
        <CodeBlock code="const ready = true;" highlightedLines={[1]} label="Beispiel" />
        <KbdChord keys={[{ key: "Control" }, { key: "K" }]} />
        <DiffViewer label="Änderungen" lines={[{ content: "neu", kind: "added" }]} />
        <JsonViewer label="Antwort" value={{ ready: true }} />
      </MergoraProvider>,
    );

    expect(markup).toContain("Code kopieren");
    expect(markup).toContain("Hervorgehoben: ");
    expect(markup).toContain('aria-label="Control plus auf Deutsch K"');
    expect(markup).toContain("1 hinzugefügt; 0 entfernt");
    expect(markup).toContain("Änderung");
    expect(markup).toContain("Hinzugefügt");
    expect(markup).toContain("Pfad kopieren");
    expect(markup).toContain("Wurzel");
    expect(markup).toContain('aria-label="Objekt: Wurzel (expanded)"');
  });
});
