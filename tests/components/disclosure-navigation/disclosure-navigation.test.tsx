import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import {
  validateStoryStateMatrix,
  type StoryStateMatrix,
} from "../../../packages/test-utils/src/index.ts";
import { validateSchemaDocument } from "../../../registry/schemas/index.ts";
import { Accordion } from "../../../registry/source/components/accordion/accordion.tsx";
import {
  Breadcrumb,
  isSafeBreadcrumbHref,
} from "../../../registry/source/components/breadcrumb/breadcrumb.tsx";
import { Collapsible } from "../../../registry/source/components/collapsible/collapsible.tsx";
import {
  buildPaginationRange,
  isSafePaginationHref,
  Pagination,
} from "../../../registry/source/components/pagination/pagination.tsx";
import { MergoraProvider } from "../../../registry/source/components/provider/provider.tsx";
import { isSafeTabHref, Tabs } from "../../../registry/source/components/tabs/tabs.tsx";

const root = resolve(import.meta.dirname, "../../..");
const componentsRoot = resolve(root, "registry/source/components");
const itemIds = ["accordion", "collapsible", "tabs", "breadcrumb", "pagination"] as const;
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

const pathItems = [
  { href: "/docs", id: "docs", label: "Docs" },
  { href: "/docs/components", id: "components", label: "Components" },
  { href: "/docs/components/navigation", id: "navigation", label: "Navigation" },
  { id: "tabs", label: "Tabs" },
] as const;

describe("P2 disclosure and navigation records", () => {
  it("ships the complete five-item canonical source batch", () => {
    for (const itemId of itemIds) {
      const files = new Set(readdirSync(resolve(componentsRoot, itemId)));
      for (const suffix of recordSuffixes) expect(files).toContain(`${itemId}.${suffix}`);
      expect(files).toContain(`${itemId}.tsx`);
      expect(files).toContain(`${itemId}.css`);
      expect(files).toContain(`${itemId}-css.d.ts`);
      expect(files).toContain("index.ts");
      expect(files).toContain("README.md");
    }
  });

  it("keeps every source manifest at exactly five keys with explicit dependencies", () => {
    const expectedDependencies = {
      accordion: [],
      breadcrumb: ["provider"],
      collapsible: [],
      pagination: ["provider"],
      tabs: ["direction"],
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
    }
  });

  it("validates metadata and all sixteen required story states", () => {
    for (const itemId of itemIds) {
      const metadata = readJson<Record<string, unknown>>(itemId, `${itemId}.metadata.json`);
      const stories = readJson<StoryStateMatrix>(itemId, `${itemId}.stories.json`);
      expect(validateSchemaDocument("component-metadata", metadata), itemId).toMatchObject({
        errors: [],
        ok: true,
      });
      expect(validateStoryStateMatrix(stories), itemId).toMatchObject({ issues: [], ok: true });
      expect(stories.states).toHaveLength(16);
    }
  });

  it("records no Stable, release, conformance, or fabricated evidence claim", () => {
    for (const itemId of itemIds) {
      const records = recordSuffixes
        .map((suffix) => readItem(itemId, `${itemId}.${suffix}`))
        .join("\n");
      expect(records).not.toMatch(/"(?:maturity|publishedMaturity)"\s*:\s*"stable"/iu);
      expect(records).not.toMatch(/"recordedEvidence"\s*:\s*\[[^\]]+\]/u);
      expect(readJson<Record<string, unknown>>(itemId, `${itemId}.status.json`)).toMatchObject({
        distributionStatus: "not-generated",
        evidenceStatus: "incomplete",
        implementationStatus: "source-present-unreleased",
        releaseStatus: "unreleased",
      });
    }
  });

  it("uses declared semantic tokens, logical edges, and no literal colors", () => {
    const tokenCss = readFileSync(
      resolve(root, "packages/tokens/src/generated/tokens.css"),
      "utf8",
    );
    const tokenDeclarations = new Set(
      [...tokenCss.matchAll(/(--mrg-[a-z0-9-]+)\s*:/gu)].map((match) => match[1]),
    );
    for (const itemId of itemIds) {
      const css = readItem(itemId, `${itemId}.css`);
      for (const reference of [...css.matchAll(/var\((--mrg-[a-z0-9-]+)/gu)].map(
        (match) => match[1],
      )) {
        expect(tokenDeclarations.has(reference), `${itemId}: ${reference}`).toBe(true);
      }
      expect(css).not.toMatch(/^\s*(?:margin|padding|inset|border)-(?:left|right)\s*:/mu);
      expect(css).not.toMatch(/#[0-9a-f]{3,8}|(?:oklch|rgb|hsl)\(/iu);
    }
  });
});

describe("P2 disclosure server semantics", () => {
  it("renders semantic accordion headings, native triggers, panels, and disabled state", () => {
    const markup = renderToStaticMarkup(
      <Accordion.Root defaultValue={["identity"]}>
        <Accordion.Item value="identity">
          <Accordion.Header level={3}>
            <Accordion.Trigger>Identity</Accordion.Trigger>
          </Accordion.Header>
          <Accordion.Panel>Canonical source identity.</Accordion.Panel>
        </Accordion.Item>
        <Accordion.Item disabled value="release">
          <Accordion.Header level={3}>
            <Accordion.Trigger>Release unavailable</Accordion.Trigger>
          </Accordion.Header>
          <Accordion.Panel>No release.</Accordion.Panel>
        </Accordion.Item>
      </Accordion.Root>,
    );
    expect(markup).toContain("<h3");
    expect(markup).toContain('data-slot="accordion-trigger"');
    expect(markup).toContain('aria-expanded="true"');
    expect(markup).toContain("disabled");
    expect(markup).toContain("Canonical source identity.");
  });

  it("renders standalone disclosure semantics without accordion or heading roles", () => {
    const markup = renderToStaticMarkup(
      <Collapsible.Root defaultOpen>
        <Collapsible.Trigger>Show provenance</Collapsible.Trigger>
        <Collapsible.Content>Digest details.</Collapsible.Content>
      </Collapsible.Root>,
    );
    expect(markup).toContain('data-slot="collapsible"');
    expect(markup).toContain('aria-expanded="true"');
    expect(markup).toContain("Digest details.");
    expect(markup).not.toContain("accordion");
    expect(markup).not.toMatch(/<h[1-6]/u);
  });

  it("creates unique control relationships for repeated disclosures", () => {
    const markup = renderToStaticMarkup(
      <div>
        <Collapsible.Root>
          <Collapsible.Trigger>First</Collapsible.Trigger>
          <Collapsible.Content>First panel</Collapsible.Content>
        </Collapsible.Root>
        <Collapsible.Root>
          <Collapsible.Trigger>Second</Collapsible.Trigger>
          <Collapsible.Content>Second panel</Collapsible.Content>
        </Collapsible.Root>
      </div>,
    );
    const controls = [...markup.matchAll(/aria-controls="([^"]+)"/gu)].map((match) => match[1]);
    expect(controls).toHaveLength(2);
    expect(new Set(controls).size).toBe(2);
    for (const id of controls) expect(markup).toContain(`id="${id}"`);
  });

  it("rejects empty, duplicate, and impossible accordion controlled values", () => {
    expect(() => renderToStaticMarkup(<Accordion.Root value={[""]}>x</Accordion.Root>)).toThrow(
      "non-empty",
    );
    expect(() =>
      renderToStaticMarkup(<Accordion.Root value={["same", "same"]}>x</Accordion.Root>),
    ).toThrow("unique");
    expect(() =>
      renderToStaticMarkup(<Accordion.Root value={["one", "two"]}>x</Accordion.Root>),
    ).toThrow("single mode");
    expect(() => renderToStaticMarkup(<Accordion.Item value=" ">x</Accordion.Item>)).toThrow(
      "non-empty",
    );
  });
});

describe("P2 tab semantics and URL policy", () => {
  it("renders tablist, selected tab, disabled tab, and labelled panel relationships", () => {
    const markup = renderToStaticMarkup(
      <Tabs.Root defaultValue="overview" disabledValues={["release"]}>
        <Tabs.List label="Artifact sections">
          <Tabs.Tab value="overview">Overview</Tabs.Tab>
          <Tabs.Tab value="release">Release</Tabs.Tab>
        </Tabs.List>
        <Tabs.Panels>
          <Tabs.Panel value="overview">Overview panel</Tabs.Panel>
          <Tabs.Panel value="release">Release panel</Tabs.Panel>
        </Tabs.Panels>
      </Tabs.Root>,
    );
    expect(markup).toContain('role="tablist"');
    expect(markup).toContain('aria-label="Artifact sections"');
    expect(markup).toContain('aria-selected="true"');
    expect(markup).toContain('role="tabpanel"');
    expect(markup).toContain('aria-disabled="true"');
  });

  it("rejects empty keys, duplicate disabled values, and unsafe URL protocols", () => {
    expect(() => renderToStaticMarkup(<Tabs.Root value=" ">x</Tabs.Root>)).toThrow("non-empty");
    expect(() =>
      renderToStaticMarkup(<Tabs.Root disabledValues={["release", "release"]}>x</Tabs.Root>),
    ).toThrow("unique");
    expect(() =>
      renderToStaticMarkup(
        <Tabs.Tab href="javascript:alert(1)" value="unsafe">
          Unsafe
        </Tabs.Tab>,
      ),
    ).toThrow("prohibited");
    expect(isSafeTabHref("?section=evidence")).toBe(true);
    expect(isSafeTabHref(" ")).toBe(false);
  });
});

describe("P2 breadcrumb and pagination semantics", () => {
  it("renders a localized ordered landmark, safe ancestor links, and one current page", () => {
    const markup = renderToStaticMarkup(
      <MergoraProvider
        locale="de-DE"
        messages={{
          "breadcrumb.label": "Navigationspfad",
          "breadcrumb.showHidden": "{count} verborgene Ebenen anzeigen",
        }}
      >
        <Breadcrumb items={pathItems} maxVisible={2} />
      </MergoraProvider>,
    );
    expect(markup).toContain('<nav aria-label="Navigationspfad"');
    expect(markup).toContain("<ol");
    expect(markup).toContain('href="/docs"');
    expect(markup.match(/aria-current="page"/gu)).toHaveLength(2);
    expect(markup).toContain("2 verborgene Ebenen anzeigen");
  });

  it("rejects empty, duplicate, unsafe, and non-final breadcrumb data", () => {
    expect(() => renderToStaticMarkup(<Breadcrumb items={[]} />)).toThrow("at least one");
    expect(() =>
      renderToStaticMarkup(
        <Breadcrumb
          items={[
            { href: "/one", id: "same", label: "One" },
            { id: "same", label: "Two" },
          ]}
        />,
      ),
    ).toThrow("unique");
    expect(() =>
      renderToStaticMarkup(
        <Breadcrumb
          items={[
            { href: "javascript:alert(1)", id: "one", label: "One" },
            { id: "two", label: "Two" },
          ]}
        />,
      ),
    ).toThrow("prohibited");
    expect(() =>
      renderToStaticMarkup(
        <Breadcrumb
          items={[
            { current: true, id: "one", label: "One" },
            { id: "two", label: "Two" },
          ]}
        />,
      ),
    ).toThrow("final");
    expect(isSafeBreadcrumbHref("/docs")).toBe(true);
    expect(isSafeBreadcrumbHref(" ")).toBe(false);
  });

  it("builds deterministic start, middle, end, and compact page ranges", () => {
    expect(buildPaginationRange({ page: 1, pageCount: 10 })).toEqual([
      1,
      2,
      3,
      4,
      5,
      "end-ellipsis",
      10,
    ]);
    expect(buildPaginationRange({ page: 5, pageCount: 10 })).toEqual([
      1,
      "start-ellipsis",
      4,
      5,
      6,
      "end-ellipsis",
      10,
    ]);
    expect(buildPaginationRange({ page: 10, pageCount: 10 })).toEqual([
      1,
      "start-ellipsis",
      6,
      7,
      8,
      9,
      10,
    ]);
    expect(buildPaginationRange({ page: 2, pageCount: 3 })).toEqual([1, 2, 3]);
  });

  it("renders localized page links, named ellipses, and disabled boundaries", () => {
    const markup = renderToStaticMarkup(
      <MergoraProvider
        locale="ar-EG"
        messages={{
          "pagination.currentPage": "الصفحة {page}، الصفحة الحالية",
          "pagination.ellipsis": "صفحات إضافية",
          "pagination.label": "ترقيم الصفحات",
          "pagination.next": "التالي",
          "pagination.page": "انتقل إلى الصفحة {page}",
          "pagination.previous": "السابق",
        }}
      >
        <Pagination getHref={(page) => `?page=${page}`} page={1} pageCount={12} />
      </MergoraProvider>,
    );
    expect(markup).toContain('aria-label="ترقيم الصفحات"');
    expect(markup).toContain('aria-current="page"');
    expect(markup).toContain("صفحات إضافية");
    expect(markup).toContain('aria-disabled="true"');
    expect(markup).toContain('rel="next"');
    expect(markup).toContain("١");
  });

  it("renders cursor destinations and rejects invalid ranges, labels, and URLs", () => {
    const markup = renderToStaticMarkup(
      <Pagination
        currentLabel="Results 26 through 50"
        mode="cursor"
        nextHref="?after=next"
        previousHref="?before=previous"
      />,
    );
    expect(markup).toContain('data-mode="cursor"');
    expect(markup).toContain('href="?after=next"');
    expect(markup).toContain('href="?before=previous"');
    expect(() => buildPaginationRange({ boundaryCount: 0, page: 1, pageCount: 2 })).toThrow(
      "positive",
    );
    expect(() => buildPaginationRange({ page: 0, pageCount: 2 })).toThrow("within");
    expect(() =>
      renderToStaticMarkup(
        <Pagination getHref={() => "javascript:alert(1)"} page={1} pageCount={2} />,
      ),
    ).toThrow("prohibited");
    expect(() => renderToStaticMarkup(<Pagination currentLabel=" " mode="cursor" />)).toThrow(
      "currentLabel",
    );
    expect(isSafePaginationHref("?after=opaque")).toBe(true);
    expect(isSafePaginationHref("data:text/html,unsafe")).toBe(false);
  });
});
