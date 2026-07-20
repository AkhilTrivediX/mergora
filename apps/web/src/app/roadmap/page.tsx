import catalog from "../../../../../registry/generated/catalog.json";
import { ProgramPage } from "../program-page";
import { pageMetadata } from "../site-origin";

export const metadata = pageMetadata({
  description: "Inspect Mergora’s source-present and planned work without promised release dates.",
  pathname: "/roadmap",
  title: "Roadmap",
});

export default function RoadmapPage() {
  const present = catalog.items.filter((item) => item.sourceAvailable).length;
  const planned = catalog.items.length - present;
  return (
    <ProgramPage
      description={`The generated catalog currently records ${present} source-present and ${planned} planned items. Source presence is not maturity, and this roadmap makes no date promise.`}
      eyebrow="Public work register"
      sections={[
        {
          heading: "Close safety and parity first",
          paragraphs: [
            "Canonical operation-plan security, source/package ownership, deterministic generation, packed consumers, and registry trust remain ahead of any public release claim.",
          ],
        },
        {
          heading: "Complete coherent component families",
          paragraphs: [
            "Every source-present component needs a documented ordinary baseline, a useful Mergora advantage, independent enhancement opt-outs, Storybook proof, and current interaction evidence.",
          ],
        },
        {
          heading: "Promote only from evidence",
          paragraphs: [
            "Stable, Beta, and Labs labels will follow immutable release evidence. Planned targets and repository checkpoints never become published maturity automatically.",
          ],
        },
      ]}
      title="Progress without invented certainty."
    />
  );
}
