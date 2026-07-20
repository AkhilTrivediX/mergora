import { CatalogDirectory } from "../catalog-directory";
import { pageMetadata } from "../site-origin";

export const metadata = pageMetadata({
  description: "Inspect Mergora foundations and components with honest source and maturity status.",
  pathname: "/components",
  title: "Component catalog",
});

export default function ComponentsPage() {
  return (
    <CatalogDirectory
      description="Find foundations and focused components by capability. Source availability, target maturity, trust, and risk remain separate so planned work is never mistaken for a release."
      eyebrow="Authoritative inventory"
      routeKind="component"
      title="Components with visible proof boundaries."
    />
  );
}
