import { CatalogDirectory } from "../catalog-directory";
import { pageMetadata } from "../site-origin";

export const metadata = pageMetadata({
  description: "Inspect Mergora workflow kits and their explicit integration boundaries.",
  pathname: "/kits",
  title: "Workflow kit catalog",
});

export default function KitsPage() {
  return (
    <CatalogDirectory
      description="Kits assemble domain-neutral product flows without claiming to provide the consumer’s backend, legal, privacy, or security decisions. Every listed kit has canonical source; package publication and maturity promotion remain gated."
      eyebrow="Workflow assemblies"
      routeKind="kit"
      title="Full workflows without hidden ownership."
    />
  );
}
