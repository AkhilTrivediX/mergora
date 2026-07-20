import { SiteLink as Link } from "./site-link";

import catalog from "../../../../registry/generated/catalog.json";
import implementationMatrix from "../../../../registry/generated/implementation-matrix.v1.json";
import {
  HomepageProductionSpecimen,
  type HomepageEvidenceSource,
} from "./homepage-production-specimen";
import { QualityLens } from "./quality-lens";
import { pageMetadata } from "./site-origin";
import { SyncWorkbench } from "./sync-workbench";

export const metadata = pageMetadata({
  description: "Production React components with safe source updates and visible quality evidence.",
  pathname: "/",
  title: "Mergora — own the source, keep the upgrades",
});

type CatalogItem = (typeof catalog.items)[number];

function sourceCount(items: readonly CatalogItem[], layer?: CatalogItem["layer"]): number {
  return items.filter(
    (item) =>
      item.implementationStatus === "source-present-unreleased" &&
      (layer === undefined || item.layer === layer),
  ).length;
}

const representativeByLayer = Object.fromEntries(
  (["foundation", "component", "system", "kit"] as const).map((layer) => [
    layer,
    catalog.items
      .filter((item) => item.layer === layer)
      .sort((left, right) => {
        const availability = Number(right.sourceAvailable) - Number(left.sourceAvailable);
        return availability || left.displayName.localeCompare(right.displayName, "en-US");
      })
      .slice(0, 5),
  ]),
) as Record<CatalogItem["layer"], CatalogItem[]>;

const layerLabels: Record<CatalogItem["layer"], string> = {
  component: "Components",
  foundation: "Foundation",
  kit: "Kits",
  system: "Systems",
};

const homepageEvidenceIds = ["button", "dialog", "combobox", "data-grid"] as const;

function isHomepageLayer(value: string): value is HomepageEvidenceSource["layer"] {
  return value === "component" || value === "foundation" || value === "kit" || value === "system";
}

const homepageEvidence = homepageEvidenceIds.map((id): HomepageEvidenceSource => {
  const item = implementationMatrix.items.find((candidate) => candidate.id === id);
  if (item === undefined) {
    throw new Error(`Generated implementation matrix is missing the homepage specimen item ${id}.`);
  }
  if (!isHomepageLayer(item.layer)) {
    throw new Error(`Generated implementation matrix has an invalid homepage layer for ${id}.`);
  }
  const firstEnhancement = item.optionalEnhancements.items[0];
  return {
    id: item.id,
    displayName: item.displayName,
    family: item.family,
    layer: item.layer,
    implementationStatus: item.implementationStatus,
    sourceAvailable: item.sourceAvailable,
    publicationStatus: implementationMatrix.publicationStatus,
    parityStatus: item.packageSourceShadcnParity.assessment.status,
    maturityStatus: item.maturity.assessment.status,
    interactionStatus: item.interactionEvidence.status,
    accessibilityStatus: item.accessibilityEvidence.status,
    advantageStatus: item.mergoraAdvantage.status,
    advantageSummary: item.mergoraAdvantage.summary,
    optionalEnhancementSummary:
      firstEnhancement?.summary ?? "No optional enhancement is recorded for this specimen.",
    accessibilitySummary: item.accessibilityEvidence.summary,
    remainingBlockers: item.remainingBlockers.map((blocker) => blocker.summary),
  };
});

export default function HomePage() {
  const implemented = sourceCount(catalog.items);
  const planned = catalog.items.length - implemented;
  return (
    <main id="main-content">
      <section className="home-hero">
        <div className="home-hero__inner">
          <div className="home-hero__copy">
            <p className="home-hero__product">Mergora</p>
            <h1>Own the source. Keep the upgrades. See the proof.</h1>
            <p className="home-hero__descriptor">
              Production React components with safe source updates and visible quality evidence.
            </p>
            <div className="site-action-rail">
              <Link className="site-button site-button--primary" href="/components">
                Browse components
              </Link>
              <Link className="site-button site-button--secondary" href="/docs/installation">
                Install Mergora
              </Link>
            </div>
            <p className="home-hero__note">
              Open source under the{" "}
              <a href="https://github.com/AkhilTrivediX/mergora/blob/main/LICENSE">MIT license</a>.
              No hosted runtime required.
            </p>
          </div>
          <SyncWorkbench />
        </div>
      </section>

      <section aria-label="Current release evidence" className="proof-line">
        <div>
          <span>Published maturity</span>
          <strong>No release yet</strong>
        </div>
        <div>
          <span>Canonical source present</span>
          <strong>{implemented}</strong>
        </div>
        <div>
          <span>Catalog work remaining</span>
          <strong>{planned}</strong>
        </div>
        <div>
          <span>Runtime baseline</span>
          <strong>React 19 · Node 24</strong>
        </div>
      </section>

      <section className="site-section evolution-section">
        <header className="site-section__intro">
          <p className="site-eyebrow">Safe evolution</p>
          <h2>Source ownership without the upgrade dead end.</h2>
          <p>
            Mergora records the upstream base, compares it with your local tree and a verified
            target, then applies only the changes it can prove are safe.
          </p>
        </header>
        <ol className="evolution-rail">
          <li>
            <span>01</span>
            <h3>Base is immutable</h3>
            <p>
              Every installed file is tied to exact release, payload, transform and base digests.
            </p>
            <code>mergora status</code>
          </li>
          <li>
            <span>02</span>
            <h3>Local remains yours</h3>
            <p>Semantic diffs separate your customization from the verified upstream change.</p>
            <code>mergora diff button --upstream</code>
          </li>
          <li>
            <span>03</span>
            <h3>Writes follow one plan</h3>
            <p>
              Conflicts are isolated; the live project stays unchanged until explicit resolution.
            </p>
            <code>mergora update button --dry-run</code>
          </li>
        </ol>
      </section>

      <HomepageProductionSpecimen evidence={homepageEvidence} />

      <div className="site-section">
        <QualityLens />
      </div>

      <section className="site-section catalog-index">
        <header className="site-section__intro">
          <p className="site-eyebrow">Catalog breadth</p>
          <h2>Organized by the work you are doing.</h2>
          <p>
            Source availability is shown separately from planned maturity; neither implies a
            release.
          </p>
        </header>
        <div className="catalog-index__groups">
          {(Object.keys(layerLabels) as CatalogItem["layer"][]).map((layer) => (
            <section key={layer}>
              <div className="catalog-index__heading">
                <h3>{layerLabels[layer]}</h3>
                <span>{sourceCount(catalog.items, layer)} source-present</span>
              </div>
              <ul>
                {(representativeByLayer[layer] ?? []).map((item) => (
                  <li key={item.id}>
                    <Link
                      href={`/${item.routeKind === "component" ? "components" : `${item.routeKind}s`}/${item.id}`}
                    >
                      {item.displayName}
                    </Link>
                    <span>{item.sourceAvailable ? "Source present" : "Planned"}</span>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
        <Link className="site-text-link" href="/components">
          Open the authoritative catalog <span aria-hidden="true">→</span>
        </Link>
      </section>

      <section className="site-section start-section">
        <div>
          <p className="site-eyebrow">Start and verify</p>
          <h2>Review the plan before the first write.</h2>
          <p>
            The same command path is exercised in clean Next.js and Vite consumers. Publication
            stays blocked until the full release evidence is immutable.
          </p>
        </div>
        <div className="command-workbench">
          <div>
            <span>Source mode · pnpm</span>
            <code>pnpm dlx mergora@0.0.0 add button --mode source --plan</code>
          </div>
          <p>Unreleased command shown as a prepared contract, not an installable release.</p>
        </div>
        <Link className="site-button site-button--primary" href="/docs/quick-start">
          Open quick start
        </Link>
      </section>
    </main>
  );
}
