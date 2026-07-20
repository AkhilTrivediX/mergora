import type { MetadataRoute } from "next";

import { absoluteSiteUrl, SITE_BASE_PATH, SITE_ORIGIN } from "./site-origin";

export const dynamic = "force-static";

export default function robots(): MetadataRoute.Robots {
  const scoped = (path: string) => `${SITE_BASE_PATH}${path}`;
  return {
    host: new URL(SITE_ORIGIN).origin,
    rules: {
      allow: scoped("/"),
      disallow: [
        scoped("/m/"),
        scoped("/r/"),
        scoped("/quality-lab/"),
        scoped("/search-index.json"),
        scoped("/*?*"),
      ],
      userAgent: "*",
    },
    sitemap: absoluteSiteUrl("/sitemap.xml"),
  };
}
