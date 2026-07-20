import { describe, expect, it } from "vitest";

import { GET } from "../../apps/web/src/app/search-index.json/route.ts";

describe("static site search delivery", () => {
  it("combines catalog, API, documentation, and site-tool terms with a digest", async () => {
    const response = GET();
    const body = (await response.json()) as {
      readonly digest: string;
      readonly entries: readonly {
        readonly group: string;
        readonly id: string;
        readonly terms: readonly string[];
      }[];
    };

    expect(response.headers.get("cache-control")).toContain("must-revalidate");
    expect(response.headers.get("etag")).toContain(body.digest);
    expect(body.digest).toMatch(/^sha256:[a-f0-9]{64}$/u);
    expect(body.entries.some((entry) => entry.group === "documentation")).toBe(true);
    expect(body.entries.some((entry) => entry.group === "site-tool")).toBe(true);
    expect(body.entries.find((entry) => entry.id === "button")?.terms).toContain("Button");
    expect(
      body.entries
        .find((entry) => entry.id === "quick-start")
        ?.terms.some((term) => term.includes("mergora")),
    ).toBe(true);
  });
});
