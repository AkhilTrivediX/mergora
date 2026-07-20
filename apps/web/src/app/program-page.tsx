import { SiteLink as Link } from "./site-link";

export interface ProgramPageSection {
  readonly heading: string;
  readonly paragraphs: readonly string[];
}

export function ProgramPage({
  description,
  eyebrow,
  sections,
  title,
}: {
  readonly description: string;
  readonly eyebrow: string;
  readonly sections: readonly ProgramPageSection[];
  readonly title: string;
}) {
  return (
    <main className="program-page" id="main-content">
      <header>
        <p className="site-eyebrow">{eyebrow}</p>
        <h1>{title}</h1>
        <p>{description}</p>
      </header>
      <article>
        {sections.map((section, index) => (
          <section key={section.heading}>
            <span>{String(index + 1).padStart(2, "0")}</span>
            <div>
              <h2>{section.heading}</h2>
              {section.paragraphs.map((paragraph) => (
                <p key={paragraph}>{paragraph}</p>
              ))}
            </div>
          </section>
        ))}
      </article>
      <nav aria-label="Continue" className="program-page__continue">
        <Link href="/docs">Read the documentation</Link>
        <Link href="/components">Inspect the catalog</Link>
        <Link href="/quality">Review quality evidence</Link>
      </nav>
    </main>
  );
}
