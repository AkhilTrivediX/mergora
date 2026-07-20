import catalog from "../../../../../../../registry/generated/catalog.json";
import { contentDigest, SOURCE_COMMIT } from "../../../machine-documents";
import { absoluteSiteUrl } from "../../../site-origin";

export const dynamic = "force-static";

export function GET() {
  const sourcePresent = catalog.items.filter((item) => item.sourceAvailable).length;
  const base = {
    schemaVersion: 1,
    canonicalUrl: absoluteSiteUrl("/m/v1/site.json"),
    contentVersion: "unreleased",
    sourceCommit: SOURCE_COMMIT,
    publicationStatus: "blocked-unreleased",
    catalog: {
      entries: catalog.items.length,
      sourcePresent,
      planned: catalog.items.length - sourcePresent,
      publishedStable: 0,
    },
    resources: {
      documentation: absoluteSiteUrl("/docs"),
      navigation: absoluteSiteUrl("/m/v1/navigation.json"),
      quality: absoluteSiteUrl("/quality"),
      search: absoluteSiteUrl("/search-index.json"),
    },
    reviewNotice: "Generated code must still be reviewed and tested in the consumer's context.",
  } as const;
  return Response.json({ ...base, generatedDigest: contentDigest(base) });
}
