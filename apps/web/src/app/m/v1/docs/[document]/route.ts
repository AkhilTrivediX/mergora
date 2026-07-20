import {
  docsMachineDocument,
  docsMachineMarkdown,
  docsMachineSlugs,
} from "../../../../machine-documents";

export const dynamic = "force-static";
export const dynamicParams = false;

export function generateStaticParams() {
  return docsMachineSlugs.flatMap((slug) => [
    { document: `${slug}.json` },
    { document: `${slug}.md` },
  ]);
}

export async function GET(
  _request: Request,
  { params }: { readonly params: Promise<{ readonly document: string }> },
) {
  const { document: name } = await params;
  const extension = name.endsWith(".json") ? "json" : name.endsWith(".md") ? "md" : null;
  const slug = extension === null ? "" : name.slice(0, -(extension.length + 1));
  if (extension === "json") {
    const document = docsMachineDocument(slug);
    return document === null ? new Response("Not found", { status: 404 }) : Response.json(document);
  }
  const markdown = extension === "md" ? docsMachineMarkdown(slug) : null;
  return markdown === null
    ? new Response("Not found", { status: 404 })
    : new Response(markdown, { headers: { "content-type": "text/markdown; charset=utf-8" } });
}
