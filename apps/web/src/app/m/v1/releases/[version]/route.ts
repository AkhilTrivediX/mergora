import { contentDigest, REVIEW_NOTICE, SOURCE_COMMIT } from "../../../../machine-documents";
import { absoluteSiteUrl } from "../../../../site-origin";

export const dynamic = "force-static";
export const dynamicParams = false;

export function generateStaticParams() {
  return [{ version: "unreleased.json" }];
}

export async function GET(
  _request: Request,
  { params }: { readonly params: Promise<{ readonly version: string }> },
) {
  const { version } = await params;
  if (version !== "unreleased.json") return new Response("Not found", { status: 404 });
  const base = {
    schemaVersion: 1,
    kind: "release-record",
    version: "unreleased",
    canonicalUrl: absoluteSiteUrl("/releases/unreleased"),
    immutableVersionUrl: null,
    contentVersion: "unreleased",
    sourceCommit: SOURCE_COMMIT,
    publicationStatus: "blocked-unreleased",
    artifacts: [],
    migrations: [],
    knownIssues: [
      "No immutable package, registry, production deployment, or complete release evidence exists.",
    ],
    reviewNotice: REVIEW_NOTICE,
  } as const;
  return Response.json({ ...base, generatedDigest: contentDigest(base) });
}
