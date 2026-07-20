import { describe, expect, it } from "vitest";

import {
  normalizeSearchText,
  rankSiteSearch,
  type SiteSearchEntry,
} from "../../apps/web/src/app/site-search-model.ts";

const entries: readonly SiteSearchEntry[] = [
  {
    availability: "unimplemented",
    group: "data-display",
    id: "data-grid",
    route: "/systems/data-grid",
    summary: "A virtualized table with selection and editing.",
    terms: ["data", "grid", "table"],
    title: "Data Grid",
  },
  {
    availability: "source-present-unreleased",
    group: "fields-inputs",
    id: "input",
    route: "/components/input",
    summary: "A native text input.",
    terms: ["input", "field", "text"],
    title: "Input",
  },
  {
    availability: "source-present-unreleased",
    group: "data-display",
    id: "table",
    route: "/components/table",
    summary: "Semantic tabular content.",
    terms: ["data", "display", "grid"],
    title: "Table",
  },
];

describe("static site search ranking", () => {
  it("normalizes case and diacritics without mutating source IDs", () => {
    expect(normalizeSearchText("  Dátá_Grid  ")).toBe("data grid");
    expect(normalizeSearchText("  रंग चयन・色選択  ")).toBe("रग चयन 色選択");
    expect(entries[0]?.id).toBe("data-grid");
  });

  it("ranks exact stable IDs before titles, terms, and descriptions", () => {
    expect(rankSiteSearch(entries, "data grid").map(({ entry }) => entry.id)).toEqual([
      "data-grid",
      "table",
    ]);
    expect(rankSiteSearch(entries, "table").map(({ entry }) => entry.id)).toEqual([
      "table",
      "data-grid",
    ]);
  });

  it("requires every query token and keeps deterministic tie breaks", () => {
    expect(rankSiteSearch(entries, "native text").map(({ entry }) => entry.id)).toEqual(["input"]);
    expect(rankSiteSearch(entries, "missing")).toEqual([]);
    expect(() => rankSiteSearch(entries, "data", 0)).toThrow(RangeError);
  });
});
