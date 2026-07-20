import apiIndex from "../../../../content/generated/api-index.json";
import searchIndex from "../../../../content/generated/search-index.json";

import { documentationPages } from "./docs/docs-content";
import { contentDigest } from "./machine-documents";

function uniqueTerms(values: readonly string[]): readonly string[] {
  return [...new Set(values.map((value) => value.trim()).filter(Boolean))].sort((left, right) =>
    left.localeCompare(right, "en-US"),
  );
}

const apiById = new Map(apiIndex.entries.map((entry) => [entry.id, entry.exports] as const));
const catalogEntries = searchIndex.entries.map((entry) => ({
  ...entry,
  terms: uniqueTerms([...entry.terms, ...(apiById.get(entry.id) ?? [])]),
}));
const documentationEntries = documentationPages.map((page) => ({
  availability: "source-present-unreleased",
  group: "documentation",
  id: page.slug,
  route: `/docs/${page.slug}`,
  summary: page.description,
  terms: uniqueTerms([
    page.slug,
    page.title,
    ...page.sections.flatMap((section) => [
      section.heading,
      ...(section.code === undefined ? [] : section.code.split(/\s+/u)),
    ]),
  ]),
  title: page.title,
  visibleStatus: "unreleased",
}));
const siteEntries = [
  {
    availability: "source-present-unreleased",
    group: "site-tool",
    id: "quality",
    route: "/quality",
    summary: "Inspect evidence scope, review status, and accessibility quality signals.",
    terms: ["audit", "evidence", "passport", "quality lens"],
    title: "Quality evidence",
    visibleStatus: "unreleased",
  },
  {
    availability: "source-present-unreleased",
    group: "site-tool",
    id: "studio",
    route: "/studio",
    summary: "Edit semantic tokens locally with continuous guardrails and deterministic export.",
    terms: ["design tokens", "dtcg", "theme", "theming"],
    title: "Theme Studio",
    visibleStatus: "unreleased",
  },
  {
    availability: "source-present-unreleased",
    group: "release-record",
    id: "releases",
    route: "/releases",
    summary: "Review release identity, publication gates, migrations, and known limitations.",
    terms: ["changelog", "compatibility", "migration", "version"],
    title: "Releases",
    visibleStatus: "unreleased",
  },
] as const;

export const siteSearchIndexBody = {
  ...searchIndex,
  entries: [...catalogEntries, ...documentationEntries, ...siteEntries],
} as const;

export const siteSearchIndexDigest = contentDigest(siteSearchIndexBody);
