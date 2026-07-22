import { describe, expect, it } from "vitest";

import { extractSitemapUrls, isExcludedSitemapUrl } from "../../scripts/static-export-lib.mjs";

const origin = "https://mergora.vercel.app";

describe("static export sitemap policy", () => {
  it("checks URL locations without treating the XML declaration as a query", () => {
    const sitemap = `<?xml version="1.0" encoding="UTF-8"?>
      <urlset>
        <url><loc>${origin}/components/button</loc></url>
        <url><loc>${origin}/docs/quick-start</loc></url>
      </urlset>`;

    const urls = extractSitemapUrls(sitemap);

    expect(urls).toEqual([`${origin}/components/button`, `${origin}/docs/quick-start`]);
    expect(urls.some((url) => isExcludedSitemapUrl(url, origin))).toBe(false);
  });

  it.each([
    `${origin}/m/v1/site.json`,
    `${origin}/r/button.json`,
    `${origin}/quality-lab/index.html`,
    `${origin}/search-index.json`,
    `${origin}/components/button?preview=recommended`,
  ])("rejects excluded sitemap location %s", (url) => {
    expect(isExcludedSitemapUrl(url, origin)).toBe(true);
  });
});
