import { absoluteSiteUrl } from "../site-origin";

export const dynamic = "force-static";

export function GET() {
  const lines = [
    "# Mergora",
    "",
    "Mergora is an unreleased open React component system with source ownership, Semantic Sync, and explicit quality evidence.",
    "Generated code must still be reviewed and tested in the consumer's context.",
    "",
    `- Documentation: ${absoluteSiteUrl("/docs")}`,
    `- Catalog: ${absoluteSiteUrl("/components")}`,
    `- Systems: ${absoluteSiteUrl("/systems")}`,
    `- Quality evidence: ${absoluteSiteUrl("/quality")}`,
    `- Machine navigation: ${absoluteSiteUrl("/m/v1/navigation.json")}`,
    `- Documentation navigation: ${absoluteSiteUrl("/m/v1/documentation-navigation.json")}`,
    `- Full contract-backed corpus: ${absoluteSiteUrl("/llms-full.txt")}`,
    `- Search index: ${absoluteSiteUrl("/search-index.json")}`,
    "",
    "No npm or Stable release exists. Commands containing 0.0.0 are prepared repository contracts only.",
  ];
  return new Response(lines.join("\n"), {
    headers: { "content-type": "text/plain; charset=utf-8" },
  });
}
