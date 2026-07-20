import { ProgramPage } from "../../program-page";
import { pageMetadata } from "../../site-origin";

export const metadata = pageMetadata({
  description:
    "Understand Mergora Core, Labs, and Community registry trust and contribution boundaries.",
  pathname: "/community/registry",
  title: "Registry trust model",
});

export default function CommunityRegistryPage() {
  return (
    <ProgramPage
      description="Registry identity, source ownership, executable behavior, maturity, and trust are separate claims. Enrollment never turns third-party material into Core."
      eyebrow="Registry contribution"
      sections={[
        {
          heading: "Core",
          paragraphs: [
            "Core items originate from canonical Mergora definitions and must pass the complete release evidence policy before published maturity is assigned.",
          ],
        },
        {
          heading: "Labs",
          paragraphs: [
            "Labs may explore a bounded contract while keeping experimental maturity, limitations, and migration risk visible. It does not weaken registry or transaction safety.",
          ],
        },
        {
          heading: "Community",
          paragraphs: [
            "Community registries keep their own signed identity, origin, release evidence, and support boundary. Consumers explicitly enroll and select them.",
          ],
        },
      ]}
      title="Trust is explicit and portable."
    />
  );
}
