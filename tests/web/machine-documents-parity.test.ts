import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import docsIndex from "../../content/generated/docs-index.json";
import documentationContractIndex from "../../registry/generated/documentation-contract-index.v1.json";
import {
  contentDigest,
  docsMachineDocument,
  docsMachineMarkdown,
  docsMachineSlugs,
  documentationNavigationDocument,
  itemMachineDocument,
  itemMachineMarkdown,
} from "../../apps/web/src/app/machine-documents";
import manifest from "../../apps/web/src/app/manifest";
import robots from "../../apps/web/src/app/robots";
import sitemap from "../../apps/web/src/app/sitemap";
import { DocumentationStructuredData } from "../../apps/web/src/app/structured-data";
import { GET as fullDocumentationResponse } from "../../apps/web/src/app/llms-full.txt/route";
import { GET as docsSchemaResponse } from "../../apps/web/src/app/m/v1/schemas/docs-page.schema.json/route";
import { GET as itemSchemaResponse } from "../../apps/web/src/app/m/v1/schemas/item-doc.schema.json/route";

type Schema = boolean | Record<string, unknown>;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function typeMatches(type: string, value: unknown): boolean {
  if (type === "null") return value === null;
  if (type === "array") return Array.isArray(value);
  if (type === "object") return isRecord(value);
  if (type === "integer") return Number.isInteger(value);
  return typeof value === type;
}

function validates(schema: Schema, value: unknown): boolean {
  if (schema === true) return true;
  if (schema === false) return false;
  if (Object.hasOwn(schema, "const") && schema.const !== value) return false;
  if (Array.isArray(schema.enum) && !schema.enum.includes(value)) return false;
  const types = Array.isArray(schema.type)
    ? schema.type.filter((entry): entry is string => typeof entry === "string")
    : typeof schema.type === "string"
      ? [schema.type]
      : [];
  if (types.length > 0 && !types.some((type) => typeMatches(type, value))) return false;
  if (isRecord(value)) {
    const required = Array.isArray(schema.required)
      ? schema.required.filter((entry): entry is string => typeof entry === "string")
      : [];
    if (required.some((key) => !Object.hasOwn(value, key))) return false;
    const properties = isRecord(schema.properties) ? schema.properties : {};
    if (
      schema.additionalProperties === false &&
      Object.keys(value).some((key) => !Object.hasOwn(properties, key))
    ) {
      return false;
    }
    for (const [key, child] of Object.entries(value)) {
      const childSchema = properties[key];
      if (
        childSchema !== undefined &&
        (typeof childSchema === "boolean" || isRecord(childSchema)) &&
        !validates(childSchema, child)
      ) {
        return false;
      }
    }
  }
  if (Array.isArray(value)) {
    if (typeof schema.minItems === "number" && value.length < schema.minItems) return false;
    if (
      (typeof schema.items === "boolean" || isRecord(schema.items)) &&
      value.some((entry) => !validates(schema.items as Schema, entry))
    ) {
      return false;
    }
  }
  if (typeof value === "string") {
    if (typeof schema.minLength === "number" && value.length < schema.minLength) return false;
    if (typeof schema.pattern === "string" && !new RegExp(schema.pattern, "u").test(value)) {
      return false;
    }
    if (schema.format === "uri") {
      try {
        new URL(value);
      } catch {
        return false;
      }
    }
  }
  if (typeof value === "number" && typeof schema.minimum === "number") {
    return value >= schema.minimum;
  }
  return true;
}

function withoutDigest<T extends { readonly generatedDigest: string }>(value: T) {
  const { generatedDigest: _generatedDigest, ...content } = value;
  return content;
}

describe("machine documentation parity", () => {
  it("publishes complete generated anatomy, state, contract, status, and exact specimen links", () => {
    expect(docsIndex.items).toHaveLength(documentationContractIndex.items.length);
    for (const item of docsIndex.items) {
      const contract = documentationContractIndex.items.find(
        (candidate) => candidate.id === item.id,
      );
      const document = itemMachineDocument(item.id);
      expect(contract, item.id).toBeDefined();
      expect(document, item.id).not.toBeNull();
      if (contract === undefined || document === null) continue;

      expect(document.generatedDigest).toBe(contentDigest(withoutDigest(document)));
      expect(document.anatomy.document).toEqual(contract.anatomy.document);
      expect(document.anatomy.status).toBe(contract.anatomy.status);
      expect(document.anatomy.missingEvidenceLabel.length).toBeGreaterThan(0);
      expect(document.stateApplicability.status).toBe(contract.stateApplicability.status);
      expect(document.stateApplicability.states).toHaveLength(
        contract.stateApplicability.states.length,
      );
      expect(document.stateApplicability.missingEvidenceLabel.length).toBeGreaterThan(0);
      expect(document.accessibilityContract.status).toBe(
        contract.semanticInteractionContract.status,
      );
      expect(document.accessibilityContract.missingEvidenceLabel.length).toBeGreaterThan(0);
      expect(document.sourceAndEvidence.evidence.releaseStatus).toBe("incomplete");
      expect(document.guidance.migration.status).toBe("no-public-release-history");
      expect(document.guidance.limitations.reviewStatus).toBe("not-release-reviewed");
      expect(document.publishedMaturity).toBeNull();

      for (const [story, url] of [
        ["basic", document.specimens.basic.url],
        ["recommended", document.specimens.recommended.url],
      ] as const) {
        const parsed = new URL(url);
        expect(parsed.pathname, item.id).toBe(item.route);
        expect(parsed.hash).toBe("#state-lab");
        expect(parsed.searchParams.get("labItem")).toBe(item.id);
        expect(parsed.searchParams.get("labStory")).toBe(story);
      }
      for (const state of document.specimens.states) {
        if (state.url === null) {
          expect(state.applicability).toBe("not-applicable");
          continue;
        }
        const parsed = new URL(state.url);
        expect(parsed.searchParams.get("labStory")).toBe("state");
        expect(parsed.searchParams.get("labState")).toBe(state.id);
      }

      const markdown = itemMachineMarkdown(item.id);
      expect(markdown).toContain("## Generated anatomy");
      expect(markdown).toContain("## State applicability and exact State Lab links");
      expect(markdown).toContain("## Keyboard and accessibility contract");
      expect(markdown).toContain("## Source, contract, and evidence status");
      expect(markdown).toContain("## Migration, issues, and limitations");
    }
  });

  it("serves strict schemas that reject omitted nested parity sections", async () => {
    const itemSchema = (await itemSchemaResponse().json()) as Schema;
    const docsSchema = (await docsSchemaResponse().json()) as Schema;
    const itemDocument = itemMachineDocument("accordion");
    const docsDocument = docsMachineDocument("quick-start");
    expect(itemDocument).not.toBeNull();
    expect(docsDocument).not.toBeNull();
    if (itemDocument === null || docsDocument === null) return;
    expect(validates(itemSchema, itemDocument)).toBe(true);
    expect(validates(docsSchema, docsDocument)).toBe(true);

    for (const [section, key] of [
      ["anatomy", "document"],
      ["stateApplicability", "states"],
      ["accessibilityContract", "keyboard"],
      ["sourceAndEvidence", "contract"],
      ["specimens", "recommended"],
      ["guidance", "limitations"],
    ] as const) {
      const changed = structuredClone(itemDocument) as unknown as Record<
        string,
        Record<string, unknown>
      >;
      delete changed[section]?.[key];
      expect(validates(itemSchema, changed), `${section}.${key}`).toBe(false);
    }

    const changedDocs = structuredClone(docsDocument) as unknown as Record<string, unknown>;
    delete (changedDocs.navigation as Record<string, unknown>).previous;
    expect(validates(docsSchema, changedDocs)).toBe(false);
  });

  it("keeps full documentation navigation deterministic without replacing catalog authority", () => {
    const navigation = documentationNavigationDocument();
    expect(navigation.generatedDigest).toBe(contentDigest(withoutDigest(navigation)));
    expect(navigation.catalogAuthority).toBe("https://mergora.vercel.app/m/v1/navigation.json");
    expect(navigation.global.map(({ label }) => label)).toEqual([
      "Components",
      "Systems",
      "Kits",
      "Studio",
      "Docs",
    ]);
    expect(navigation.footer.map(({ label }) => label)).toEqual([
      "Quality evidence",
      "Support",
      "Community",
      "GitHub repository",
    ]);
    expect(navigation.documentation[0]?.previous).toBeNull();
    expect(navigation.documentation.at(-1)?.next).toBeNull();
    expect(navigation.catalogSequences.flatMap(({ items }) => items)).toHaveLength(
      docsIndex.items.length,
    );

    const layout = readFileSync(
      resolve(import.meta.dirname, "../../apps/web/src/app/layout.tsx"),
      "utf8",
    );
    for (const link of [...navigation.global, ...navigation.footer]) {
      expect(layout).toContain(link.label);
      expect(layout).toContain(new URL(link.url).pathname);
    }

    for (const slug of docsMachineSlugs) {
      const document = docsMachineDocument(slug);
      expect(document).not.toBeNull();
      expect(docsMachineMarkdown(slug)).toContain("## Machine resources");
    }
  });

  it("builds llms-full from full contract-backed documents rather than catalog summaries", async () => {
    const corpus = await fullDocumentationResponse().text();
    expect(corpus.length).toBeGreaterThan(500_000);
    expect(corpus).toContain("## Generated anatomy");
    expect(corpus).toContain("## Keyboard and accessibility contract");
    for (const item of docsIndex.items) expect(corpus).toContain(`# ${item.displayName}\n`);
  });

  it("emits truthful structured data and a payload/query/preview crawl policy", () => {
    const html = renderToStaticMarkup(
      DocumentationStructuredData({
        breadcrumbs: [
          { name: "Home", pathname: "/" },
          { name: "Components", pathname: "/components" },
          { name: "Button", pathname: "/components/button" },
        ],
        description: "Button component documentation.",
        pathname: "/components/button",
        title: "Button",
      }),
    );
    expect(html).toContain('"@type":"SoftwareSourceCode"');
    expect(html).toContain('"@type":"TechArticle"');
    expect(html).toContain('"@type":"BreadcrumbList"');
    expect(html).toContain("https://github.com/AkhilTrivediX/mergora");
    expect(html).not.toMatch(/softwareVersion|Stable|"version"/u);

    const policy = robots();
    expect(policy.host).toBe("https://mergora.vercel.app");
    expect(policy.rules).toMatchObject({
      disallow: ["/m/", "/r/", "/quality-lab/", "/search-index.json", "/*?*"],
    });
    const webManifest = manifest();
    expect(webManifest).toMatchObject({
      id: "/",
      scope: "/",
      start_url: "/",
    });
    expect(webManifest).not.toHaveProperty("version");
    const sitemapUrls = sitemap().map(({ url }) => url);
    expect(sitemapUrls.every((url) => !url.includes("/m/") && !url.includes("?"))).toBe(true);
    for (const item of docsIndex.items) {
      expect(sitemapUrls).toContain(`https://mergora.vercel.app${item.route}`);
    }
  });
});
