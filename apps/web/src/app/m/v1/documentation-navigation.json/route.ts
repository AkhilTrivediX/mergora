import { documentationNavigationDocument } from "../../../machine-documents";

export const dynamic = "force-static";

export function GET() {
  return Response.json(documentationNavigationDocument());
}
