import navigation from "../../../../../../../content/generated/navigation.json";
import { contentDigest, SOURCE_COMMIT } from "../../../machine-documents";
import { absoluteSiteUrl } from "../../../site-origin";

export const dynamic = "force-static";

export function GET() {
  const base = {
    ...navigation,
    canonicalUrl: absoluteSiteUrl("/m/v1/navigation.json"),
    contentVersion: "unreleased",
    sourceCommit: SOURCE_COMMIT,
  } as const;
  return Response.json({ ...base, generatedDigest: contentDigest(base) });
}
