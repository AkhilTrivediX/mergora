import { CatalogDirectory } from "../catalog-directory";
import { pageMetadata } from "../site-origin";

export const metadata = pageMetadata({
  description: "Inspect coordinated Mergora systems with honest source and maturity status.",
  pathname: "/systems",
  title: "System catalog",
});

export default function SystemsPage() {
  return (
    <CatalogDirectory
      description="Systems coordinate several interaction and state responsibilities while leaving business policy with the consumer. Every row exposes whether canonical source actually exists."
      eyebrow="Coordinated behaviors"
      routeKind="system"
      title="Systems built for the difficult states."
    />
  );
}
