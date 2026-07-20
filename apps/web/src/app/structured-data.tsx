import { absoluteSiteUrl } from "./site-origin";

const REPOSITORY_URL = "https://github.com/AkhilTrivediX/mergora";
const SOFTWARE_ID = `${REPOSITORY_URL}#source`;

interface Breadcrumb {
  readonly name: string;
  readonly pathname: string;
}

function jsonLd(value: unknown): string {
  return JSON.stringify(value).replaceAll("<", "\\u003c");
}

function breadcrumbList(breadcrumbs: readonly Breadcrumb[]) {
  return {
    "@type": "BreadcrumbList",
    itemListElement: breadcrumbs.map((breadcrumb, index) => ({
      "@type": "ListItem",
      position: index + 1,
      name: breadcrumb.name,
      item: absoluteSiteUrl(breadcrumb.pathname),
    })),
  } as const;
}

function softwareSourceCode() {
  return {
    "@id": SOFTWARE_ID,
    "@type": "SoftwareSourceCode",
    name: "Mergora",
    description:
      "An unreleased open-source React component system with canonical source ownership and explicit quality evidence.",
    codeRepository: REPOSITORY_URL,
    license: `${REPOSITORY_URL}/blob/main/LICENSE`,
    programmingLanguage: {
      "@type": "ComputerLanguage",
      name: "TypeScript",
    },
  } as const;
}

export function DocumentationStructuredData({
  breadcrumbs,
  description,
  pathname,
  title,
}: {
  readonly breadcrumbs: readonly Breadcrumb[];
  readonly description: string;
  readonly pathname: string;
  readonly title: string;
}) {
  const canonicalUrl = absoluteSiteUrl(pathname);
  const document = {
    "@context": "https://schema.org",
    "@graph": [
      softwareSourceCode(),
      {
        "@id": `${canonicalUrl}#article`,
        "@type": "TechArticle",
        headline: title,
        description,
        url: canonicalUrl,
        isPartOf: {
          "@id": SOFTWARE_ID,
        },
      },
      breadcrumbList(breadcrumbs),
    ],
  } as const;
  return (
    <script dangerouslySetInnerHTML={{ __html: jsonLd(document) }} type="application/ld+json" />
  );
}
