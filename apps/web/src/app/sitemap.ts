import type { MetadataRoute } from "next";

import docsIndex from "../../../../content/generated/docs-index.json";
import { documentationPages } from "./docs/docs-content";
import { absoluteSiteUrl } from "./site-origin";

export const dynamic = "force-static";

const staticRoutes = [
  "/",
  "/community",
  "/community/registry",
  "/components",
  "/docs",
  "/kits",
  "/quality",
  "/releases",
  "/releases/unreleased",
  "/roadmap",
  "/studio",
  "/support",
  "/support/accessibility",
  "/support/security",
  "/systems",
] as const;

export default function sitemap(): MetadataRoute.Sitemap {
  const routes = new Set<string>([
    ...staticRoutes,
    ...documentationPages.map((page) => `/docs/${page.slug}`),
    ...docsIndex.items.map((item) => item.route),
    ...docsIndex.items.map((item) => `/quality/${item.id}`),
  ]);
  return [...routes]
    .sort((left, right) => left.localeCompare(right, "en-US"))
    .map((route) => ({ url: absoluteSiteUrl(route) }));
}
