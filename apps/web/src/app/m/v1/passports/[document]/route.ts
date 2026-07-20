import { passportMachineDocument, passportMachineIds } from "../../../../machine-documents";

export const dynamic = "force-static";
export const dynamicParams = false;

export function generateStaticParams() {
  return passportMachineIds.map((id) => ({ document: `${id}.json` }));
}

export async function GET(
  _request: Request,
  { params }: { readonly params: Promise<{ readonly document: string }> },
) {
  const { document: name } = await params;
  const id = name.endsWith(".json") ? name.slice(0, -5) : "";
  const document = passportMachineDocument(id);
  return document === null
    ? new Response("Not found", { status: 404 })
    : Response.json(document, {
        headers: {
          "content-disposition": `inline; filename="${id}-quality-passport.json"`,
        },
      });
}
