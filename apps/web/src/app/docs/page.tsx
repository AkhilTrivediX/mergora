import { SiteLink as Link } from "../site-link";
import { pageMetadata } from "../site-origin";

import { documentationPages } from "./docs-content";

export const metadata = pageMetadata({
  description:
    "Choose the shortest Mergora documentation path for installation, ownership, quality, or integration.",
  pathname: "/docs",
  title: "Documentation",
});

export default function DocumentationIndexPage() {
  return (
    <main className="docs-index" id="main-content">
      <header>
        <p className="site-eyebrow">Documentation</p>
        <h1>Start with the ownership decision.</h1>
        <p>
          Mergora is still unreleased. These pages describe the tested repository contracts and name
          open release boundaries rather than presenting prepared commands as published
          availability.
        </p>
      </header>
      <section>
        <h2>Choose your path</h2>
        <ol>
          {documentationPages.map((page, index) => (
            <li key={page.slug}>
              <span>{String(index + 1).padStart(2, "0")}</span>
              <div>
                <h3>
                  <Link href={`/docs/${page.slug}`}>{page.title}</Link>
                </h3>
                <p>{page.description}</p>
              </div>
            </li>
          ))}
        </ol>
      </section>
    </main>
  );
}
