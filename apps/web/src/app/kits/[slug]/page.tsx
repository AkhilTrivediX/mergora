import type { Metadata } from "next";
import { notFound } from "next/navigation";

import {
  documentationItems,
  findDocumentationItem,
  ItemDocumentation,
} from "../../item-documentation";
import { pageMetadata } from "../../site-origin";
import { DocumentationStructuredData } from "../../structured-data";

export const dynamicParams = false;

export function generateStaticParams() {
  return documentationItems("kit").map((item) => ({ slug: item.id }));
}

export async function generateMetadata({
  params,
}: {
  readonly params: Promise<{ readonly slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const item = findDocumentationItem("kit", slug);
  if (item === undefined) return {};
  return pageMetadata({
    description: item.summary,
    pathname: `/kits/${item.id}`,
    title: item.displayName,
  });
}

export default async function KitDocumentationPage({
  params,
}: {
  readonly params: Promise<{ readonly slug: string }>;
}) {
  const { slug } = await params;
  const item = findDocumentationItem("kit", slug);
  if (item === undefined) notFound();
  return (
    <>
      <DocumentationStructuredData
        breadcrumbs={[
          { name: "Home", pathname: "/" },
          { name: "Kits", pathname: "/kits" },
          { name: item.displayName, pathname: item.route },
        ]}
        description={item.summary}
        pathname={item.route}
        title={item.displayName}
      />
      <ItemDocumentation id={slug} routeKind="kit" />
    </>
  );
}
