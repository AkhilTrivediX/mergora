import docsIndex from "../../../../content/generated/docs-index.json";
import implementationMatrix from "../../../../registry/generated/implementation-matrix.v1.json";
import { CatalogBrowser, type CatalogBrowserItem } from "./catalog-browser";

type RouteKind = "component" | "kit" | "system";
type DiscoveryItem = (typeof docsIndex.items)[number] & {
  readonly directions?: readonly ("ltr" | "rtl")[];
  readonly fileTargets?: readonly string[];
  readonly locales?: readonly string[];
  readonly packageImport?: string;
  readonly registryDependencies?: readonly string[];
  readonly runtimeDependencies?: readonly string[];
  readonly serverBoundary?: CatalogBrowserItem["serverBoundary"];
};

interface CatalogDirectoryProps {
  readonly description: string;
  readonly eyebrow: string;
  readonly routeKind: RouteKind;
  readonly title: string;
}

export function CatalogDirectory({
  description,
  eyebrow,
  routeKind,
  title,
}: CatalogDirectoryProps) {
  const evidenceById = new Map<string, CatalogBrowserItem["reviewStatus"]>(
    implementationMatrix.items.map((item) => [
      item.id,
      item.profileStatus as CatalogBrowserItem["reviewStatus"],
    ]),
  );
  const toCatalogItem = (item: (typeof docsIndex.items)[number]): CatalogBrowserItem => {
    const discovery = item as DiscoveryItem;
    return {
      category: item.category,
      directions: discovery.directions ?? [],
      displayName: item.displayName,
      fileTargets: discovery.fileTargets ?? [],
      id: item.id,
      implementationStatus: item.implementationStatus as CatalogBrowserItem["implementationStatus"],
      layer: item.layer as CatalogBrowserItem["layer"],
      locales: discovery.locales ?? [],
      packageImport: discovery.packageImport ?? null,
      registryDependencies: discovery.registryDependencies ?? [],
      runtimeDependencies: discovery.runtimeDependencies ?? [],
      riskClass: item.riskClass as CatalogBrowserItem["riskClass"],
      reviewStatus: evidenceById.get(item.id) ?? "audit-pending",
      route: item.route,
      serverBoundary: discovery.serverBoundary ?? "unavailable",
      sourceAvailable: item.sourceAvailable,
      summary: item.summary,
      targetMaturity: item.targetMaturity as CatalogBrowserItem["targetMaturity"],
      trust: item.trust as CatalogBrowserItem["trust"],
    };
  };
  const catalogItems = docsIndex.items.map(toCatalogItem);
  const items = docsIndex.items.filter((item) => item.routeKind === routeKind).map(toCatalogItem);
  const sourcePresent = items.filter((item) => item.sourceAvailable).length;

  return (
    <main className="directory-page" id="main-content">
      <header className="directory-page__header">
        <p className="site-eyebrow">{eyebrow}</p>
        <h1>{title}</h1>
        <p>{description}</p>
        <dl>
          <div>
            <dt>Inventory</dt>
            <dd>{items.length}</dd>
          </div>
          <div>
            <dt>Canonical source present</dt>
            <dd>{sourcePresent}</dd>
          </div>
          <div>
            <dt>Published maturity</dt>
            <dd>None yet</dd>
          </div>
        </dl>
      </header>
      <CatalogBrowser catalogItems={catalogItems} items={items} />
    </main>
  );
}
