import { siteSearchIndexBody, siteSearchIndexDigest } from "../site-search-index";

export const dynamic = "force-static";

export function GET() {
  return Response.json(
    { ...siteSearchIndexBody, digest: siteSearchIndexDigest },
    {
      headers: {
        "cache-control": "public, max-age=0, must-revalidate",
        etag: `"${siteSearchIndexDigest}"`,
      },
    },
  );
}
