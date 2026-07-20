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
  return documentationItems("component").map((item) => ({ slug: item.id }));
}

export async function generateMetadata({
  params,
}: {
  readonly params: Promise<{ readonly slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const item = findDocumentationItem("component", slug);
  if (item === undefined) return {};
  return pageMetadata({
    description: item.summary,
    pathname: `/components/${item.id}`,
    title: item.displayName,
  });
}

export default async function ComponentDocumentationPage({
  params,
}: {
  readonly params: Promise<{ readonly slug: string }>;
}) {
  const { slug } = await params;
  const item = findDocumentationItem("component", slug);
  if (item === undefined) notFound();
  return (
    <>
      <DocumentationStructuredData
        breadcrumbs={[
          { name: "Home", pathname: "/" },
          { name: "Components", pathname: "/components" },
          { name: item.displayName, pathname: item.route },
        ]}
        description={item.summary}
        pathname={item.route}
        title={item.displayName}
      />
      <ItemDocumentation id={slug} routeKind="component" />
    </>
  );
}
