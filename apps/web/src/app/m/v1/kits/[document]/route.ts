import {
  itemMachineDocument,
  itemMachineMarkdown,
  kitMachineIds,
} from "../../../../machine-documents";

export const dynamic = "force-static";
export const dynamicParams = false;

export function generateStaticParams() {
  return kitMachineIds.flatMap((id) => [{ document: `${id}.json` }, { document: `${id}.md` }]);
}

export async function GET(
  _request: Request,
  { params }: { readonly params: Promise<{ readonly document: string }> },
) {
  const { document: name } = await params;
  const extension = name.endsWith(".json") ? "json" : name.endsWith(".md") ? "md" : null;
  const id = extension === null ? "" : name.slice(0, -(extension.length + 1));
  if (extension === "json") {
    const document = itemMachineDocument(id);
    return document === null ? new Response("Not found", { status: 404 }) : Response.json(document);
  }
  const markdown = extension === "md" ? itemMachineMarkdown(id) : null;
  return markdown === null
    ? new Response("Not found", { status: 404 })
    : new Response(markdown, { headers: { "content-type": "text/markdown; charset=utf-8" } });
}
