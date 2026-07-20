import { ProgramPage } from "../program-page";
import { pageMetadata } from "../site-origin";

export const metadata = pageMetadata({
  description:
    "Contribute to Mergora through scoped code, evidence, registry, and documentation work.",
  pathname: "/community",
  title: "Community",
});

export default function CommunityPage() {
  return (
    <ProgramPage
      description="Contributions should strengthen canonical ownership, accessibility, useful component differentiation, deterministic output, or transparent evidence."
      eyebrow="Open-source participation"
      sections={[
        {
          heading: "Start from a bounded issue",
          paragraphs: [
            "Describe the user problem, affected catalog IDs, public contract, risk, and evidence needed. Avoid broad visual rewrites that bypass family-level tokens or source ownership.",
          ],
        },
        {
          heading: "Bring evidence with behavior",
          paragraphs: [
            "A component contribution includes baseline comparison, opt-out semantics, stories, keyboard and browser tests, API companions, and an honest maturity assessment.",
          ],
        },
        {
          heading: "Respect trust boundaries",
          paragraphs: [
            "Registry additions, dependencies, generation changes, security-sensitive CLI paths, and release automation receive stricter review and reproducibility requirements.",
          ],
        },
      ]}
      title="Contribute where proof gets stronger."
    />
  );
}
