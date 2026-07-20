export function extractSitemapUrls(sitemap) {
  return [...sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)].map(([, url]) => url);
}

export function isExcludedSitemapUrl(url, expectedSiteOrigin) {
  const origin = expectedSiteOrigin.replace(/\/$/u, "");

  return (
    url.startsWith(`${origin}/m/`) ||
    url.startsWith(`${origin}/r/`) ||
    url.startsWith(`${origin}/quality-lab/`) ||
    url === `${origin}/search-index.json` ||
    url.includes("?")
  );
}
