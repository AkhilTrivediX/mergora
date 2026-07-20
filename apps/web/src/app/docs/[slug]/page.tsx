import type { Metadata } from "next";
import { SiteLink as Link } from "../../site-link";
import { notFound } from "next/navigation";

import { documentationPages, findDocumentationPage } from "../docs-content";
import { pageMetadata } from "../../site-origin";
import { DocumentationStructuredData } from "../../structured-data";

export const dynamicParams = false;

export function generateStaticParams() {
  return documentationPages.map((page) => ({ slug: page.slug }));
}

export async function generateMetadata({
  params,
}: {
  readonly params: Promise<{ readonly slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const page = findDocumentationPage(slug);
  if (page === undefined) return {};
  return pageMetadata({
    description: page.description,
    pathname: `/docs/${page.slug}`,
    title: page.title,
  });
}

export default async function DocumentationPageRoute({
  params,
}: {
  readonly params: Promise<{ readonly slug: string }>;
}) {
  const { slug } = await params;
  const page = findDocumentationPage(slug);
  if (page === undefined) notFound();
  return (
    <>
      <DocumentationStructuredData
        breadcrumbs={[
          { name: "Home", pathname: "/" },
          { name: "Documentation", pathname: "/docs" },
          { name: page.title, pathname: `/docs/${page.slug}` },
        ]}
        description={page.description}
        pathname={`/docs/${page.slug}`}
        title={page.title}
      />
      <main className="editorial-doc" id="main-content">
        <header>
          <nav aria-label="Breadcrumb">
            <Link href="/docs">Documentation</Link>
            <span aria-hidden="true">/</span>
            <span aria-current="page">{page.title}</span>
          </nav>
          <p className="site-eyebrow">Repository contract · unreleased</p>
          <h1>{page.title}</h1>
          <p>{page.description}</p>
        </header>
        <article>
          {page.sections.map((section) => (
            <section
              id={section.heading.toLocaleLowerCase().replaceAll(/[^a-z0-9]+/gu, "-")}
              key={section.heading}
            >
              <h2>{section.heading}</h2>
              {section.paragraphs.map((paragraph) => (
                <p key={paragraph}>{paragraph}</p>
              ))}
              {section.code === undefined ? null : <code>{section.code}</code>}
            </section>
          ))}
        </article>
      </main>
    </>
  );
}
